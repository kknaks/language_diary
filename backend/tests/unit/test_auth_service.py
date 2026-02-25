"""Unit tests for AuthService.refresh_tokens."""
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import RefreshToken
from app.models.user import User
from app.services.auth_service import AuthService
from app.utils.jwt import hash_refresh_token, create_refresh_token, verify_access_token
from app.exceptions import InvalidRefreshTokenError


@pytest_asyncio.fixture
async def auth_user(db_session: AsyncSession):
    user = User(id=100, nickname="AuthUser", native_lang="ko", target_lang="en",
                created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def stored_refresh(db_session: AsyncSession, auth_user):
    """Create a valid refresh token in the DB and return the raw token string."""
    raw = create_refresh_token()
    token = RefreshToken(
        user_id=auth_user.id,
        token_hash=hash_refresh_token(raw),
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db_session.add(token)
    await db_session.commit()
    return raw


@pytest.mark.asyncio
class TestRefreshTokens:
    async def test_success(self, db_session, auth_user, stored_refresh):
        svc = AuthService()
        result = await svc.refresh_tokens(db_session, stored_refresh)
        assert result.access_token
        assert result.refresh_token
        assert result.token_type == "bearer"
        # access token should be valid for the user
        uid = verify_access_token(result.access_token)
        assert uid == auth_user.id

    async def test_rotation_deletes_old(self, db_session, auth_user, stored_refresh):
        old_hash = hash_refresh_token(stored_refresh)
        svc = AuthService()
        result = await svc.refresh_tokens(db_session, stored_refresh)
        # old token should be gone
        row = await db_session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == old_hash)
        )
        assert row.scalar_one_or_none() is None
        # new token should exist
        new_hash = hash_refresh_token(result.refresh_token)
        row = await db_session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == new_hash)
        )
        assert row.scalar_one_or_none() is not None

    async def test_invalid_token(self, db_session, auth_user):
        svc = AuthService()
        with pytest.raises(InvalidRefreshTokenError):
            await svc.refresh_tokens(db_session, "nonexistent-token")

    async def test_expired_token(self, db_session, auth_user):
        raw = create_refresh_token()
        token = RefreshToken(
            user_id=auth_user.id,
            token_hash=hash_refresh_token(raw),
            expires_at=datetime.utcnow() - timedelta(hours=1),
        )
        db_session.add(token)
        await db_session.commit()

        svc = AuthService()
        with pytest.raises(InvalidRefreshTokenError):
            await svc.refresh_tokens(db_session, raw)

        # expired token should be cleaned up
        row = await db_session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
        )
        assert row.scalar_one_or_none() is None
