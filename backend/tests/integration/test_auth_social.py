"""Integration tests for social login, logout, account deletion, and profile endpoints."""
import base64
import json
from datetime import datetime

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import RefreshToken
from app.models.seed import Language
from app.models.user import User
from app.utils.jwt import create_access_token, hash_refresh_token


def _make_fake_jwt(payload: dict) -> str:
    """Create a fake JWT (header.payload.signature) for dev-mode parsing."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    sig = base64.urlsafe_b64encode(b"fake_signature").rstrip(b"=").decode()
    return f"{header}.{body}.{sig}"


def _auth_header(user_id: int) -> dict:
    """Create Authorization header with a valid access token."""
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seed_languages(db_session: AsyncSession):
    """Create test languages for profile tests."""
    ko = Language(id=1, code="ko", name_native="한국어", is_active=True)
    en = Language(id=2, code="en", name_native="English", is_active=True)
    db_session.add_all([ko, en])
    await db_session.commit()
    return ko, en


@pytest.mark.asyncio
class TestSocialLogin:
    async def test_google_new_user(self, client, db_session):
        """POST /auth/social — Google login creates new user."""
        fake_token = _make_fake_jwt({
            "sub": "google_new_123",
            "email": "newuser@gmail.com",
            "name": "New User",
        })
        resp = await client.post("/api/v1/auth/social", json={
            "provider": "google",
            "id_token": fake_token,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "newuser@gmail.com"
        assert data["user"]["nickname"] == "New User"
        assert data["user"]["social_provider"] == "google"
        assert data["user"]["onboarding_completed"] is False

    async def test_google_existing_user(self, client, db_session):
        """POST /auth/social — Google login with existing user."""
        # Create existing user first
        user = User(
            nickname="ExistingUser",
            email="existing@gmail.com",
            social_provider="google",
            social_id="google_existing_456",
            native_lang="ko",
            target_lang="en",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(user)
        await db_session.commit()

        fake_token = _make_fake_jwt({
            "sub": "google_existing_456",
            "email": "existing@gmail.com",
            "name": "Existing User",
        })
        resp = await client.post("/api/v1/auth/social", json={
            "provider": "google",
            "id_token": fake_token,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["nickname"] == "ExistingUser"  # original nickname

    async def test_apple_login(self, client, db_session):
        """POST /auth/social — Apple login creates new user."""
        fake_token = _make_fake_jwt({
            "sub": "apple_001",
            "email": "appleuser@icloud.com",
        })
        resp = await client.post("/api/v1/auth/social", json={
            "provider": "apple",
            "id_token": fake_token,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["social_provider"] == "apple"

    async def test_unsupported_provider(self, client):
        """POST /auth/social — Unsupported provider returns 400."""
        resp = await client.post("/api/v1/auth/social", json={
            "provider": "facebook",
            "id_token": "whatever",
        })
        assert resp.status_code == 400
        data = resp.json()
        assert data["error"]["code"] == "UNSUPPORTED_PROVIDER"

    async def test_invalid_token(self, client):
        """POST /auth/social — Invalid token returns 400."""
        resp = await client.post("/api/v1/auth/social", json={
            "provider": "google",
            "id_token": "not-a-valid-jwt",
        })
        assert resp.status_code == 400
        data = resp.json()
        assert data["error"]["code"] == "INVALID_SOCIAL_TOKEN"


@pytest.mark.asyncio
class TestLogout:
    async def test_logout_success(self, client, db_session, set_test_user):
        """POST /auth/logout — Should revoke refresh token."""
        # Create user
        user = User(
            id=300,
            nickname="LogoutUser",
            email="logout@test.com",
            native_lang="ko",
            target_lang="en",
            social_provider="google",
            social_id="google_logout",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(user)
        await db_session.commit()
        set_test_user(user)

        # Create refresh token
        raw_refresh = "test_refresh_token_for_logout"
        token_hash = hash_refresh_token(raw_refresh)
        rt = RefreshToken(
            user_id=300,
            token_hash=token_hash,
            expires_at=datetime(2030, 1, 1),
        )
        db_session.add(rt)
        await db_session.commit()

        resp = await client.post("/api/v1/auth/logout", json={
            "refresh_token": raw_refresh,
        })
        assert resp.status_code == 204

        # Verify token is deleted
        result = await db_session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
class TestDeleteAccount:
    async def test_delete_account_success(self, client, db_session, set_test_user):
        """DELETE /auth/account — Should soft delete user."""
        user = User(
            id=400,
            nickname="DeleteUser",
            email="delete@test.com",
            native_lang="ko",
            target_lang="en",
            social_provider="google",
            social_id="google_delete",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(user)
        await db_session.commit()
        set_test_user(user)

        resp = await client.delete("/api/v1/auth/account")
        assert resp.status_code == 204

        # Expire cached state and verify user is soft deleted
        db_session.expire_all()
        result = await db_session.execute(
            select(User).where(User.id == 400)
        )
        deleted_user = result.scalar_one_or_none()
        assert deleted_user is not None
        assert deleted_user.is_active is False
        assert deleted_user.deleted_at is not None


@pytest.mark.asyncio
class TestProfileEndpoints:
    async def test_create_profile(self, client, db_session, seed_languages, set_test_user):
        """POST /user/profile — Should create profile."""
        user = User(
            id=500,
            nickname="ProfileUser",
            email="profile@test.com",
            native_lang="ko",
            target_lang="en",
            social_provider="google",
            social_id="google_profile",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(user)
        await db_session.commit()
        set_test_user(user)

        resp = await client.post("/api/v1/user/profile", json={
            "native_language_id": 1,
            "target_language_id": 2,
            "empathy": 40,
            "intuition": 30,
            "logic": 30,
            "app_locale": "ko",
            "cefr_level": "B1",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["onboarding_completed"] is True

    async def test_get_profile(self, client, db_session, seed_languages, set_test_user):
        """GET /user/profile — Should return user profile with nested data."""
        user = User(
            id=502,
            nickname="GetProfileUser",
            email="getprofile@test.com",
            native_lang="ko",
            target_lang="en",
            social_provider="google",
            social_id="google_getprofile",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(user)
        await db_session.commit()
        set_test_user(user)

        # Create profile first
        resp = await client.post("/api/v1/user/profile", json={
            "native_language_id": 1,
            "target_language_id": 2,
            "empathy": 34,
            "intuition": 33,
            "logic": 33,
            "cefr_level": "A2",
        })
        assert resp.status_code == 201

        # Get profile
        resp = await client.get("/api/v1/user/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == 502
        assert data["nickname"] == "GetProfileUser"
        assert data["profile"] is not None
        assert data["profile"]["onboarding_completed"] is True
        assert data["profile"]["native_language"]["code"] == "ko"
        assert data["profile"]["target_language"]["code"] == "en"
        assert data["language_level"] is not None
        assert data["language_level"]["cefr_level"] == "A2"

    async def test_get_profile_no_profile(self, client, db_session, set_test_user):
        """GET /user/profile — User without profile should have null profile."""
        user = User(
            id=503,
            nickname="NoProfileUser",
            email="noprofile@test.com",
            native_lang="ko",
            target_lang="en",
            social_provider="google",
            social_id="google_noprofile",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(user)
        await db_session.commit()
        set_test_user(user)

        resp = await client.get("/api/v1/user/profile")
        assert resp.status_code == 200
        data = resp.json()
        assert data["profile"] is None
        assert data["language_level"] is None

    async def test_create_duplicate_profile(self, client, db_session, seed_languages, set_test_user):
        """POST /user/profile — Duplicate profile returns 409."""
        user = User(
            id=504,
            nickname="DupProfileUser",
            email="dup@test.com",
            native_lang="ko",
            target_lang="en",
            social_provider="google",
            social_id="google_dup",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(user)
        await db_session.commit()
        set_test_user(user)

        body = {
            "native_language_id": 1,
            "target_language_id": 2,
            "empathy": 34,
            "intuition": 33,
            "logic": 33,
        }

        # First creation should succeed
        resp = await client.post("/api/v1/user/profile", json=body)
        assert resp.status_code == 201

        # Second creation should fail
        resp = await client.post("/api/v1/user/profile", json=body)
        assert resp.status_code == 409
        data = resp.json()
        assert data["error"]["code"] == "PROFILE_ALREADY_EXISTS"
