from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import InvalidRefreshTokenError
from app.repositories.auth_repo import RefreshTokenRepository
from app.schemas.auth import TokenResponse
from app.utils.jwt import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
)


class AuthService:
    async def refresh_tokens(self, db: AsyncSession, refresh_token: str) -> TokenResponse:
        repo = RefreshTokenRepository(db)

        # 1. hash
        token_hash = hash_refresh_token(refresh_token)

        # 2. lookup
        stored = await repo.find_by_hash(token_hash)
        if stored is None:
            raise InvalidRefreshTokenError()

        # 3. expiry check
        if stored.expires_at < datetime.utcnow():
            await repo.delete(stored.id)
            await db.commit()
            raise InvalidRefreshTokenError(detail="refresh token expired")

        user_id = stored.user_id

        # 4. rotation — delete old token
        await repo.delete(stored.id)

        # 5. issue new tokens
        new_access = create_access_token(user_id)
        new_refresh = create_refresh_token()

        # 6. persist new refresh token
        new_hash = hash_refresh_token(new_refresh)
        expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        await repo.create(user_id=user_id, token_hash=new_hash, expires_at=expires_at)
        await db.commit()

        # 7. return
        return TokenResponse(
            access_token=new_access,
            refresh_token=new_refresh,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
