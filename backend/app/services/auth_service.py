from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BadRequestError, InvalidRefreshTokenError
from app.repositories.auth_repo import RefreshTokenRepository
from app.repositories.user_repo import UserRepository
from app.schemas.auth import SocialLoginResponse, TokenResponse, UserInToken
from app.utils.jwt import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
)
from app.utils.social_auth import verify_apple_token, verify_google_token


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

    async def social_login(
        self,
        db: AsyncSession,
        provider: str,
        id_token_str: str,
    ) -> SocialLoginResponse:
        # 1. 토큰 검증
        if provider == "google":
            social_info = await verify_google_token(id_token_str)
        elif provider == "apple":
            social_info = await verify_apple_token(id_token_str)
        else:
            raise BadRequestError(code="UNSUPPORTED_PROVIDER", message="지원하지 않는 소셜 로그인입니다.")

        if not social_info:
            raise BadRequestError(code="INVALID_SOCIAL_TOKEN", message="소셜 로그인 인증에 실패했습니다.")

        social_id = social_info["sub"]
        email = social_info.get("email", "")
        name = social_info.get("name", "") or email.split("@")[0] or "User"

        # 2. 유저 조회 or 생성
        user_repo = UserRepository(db)
        is_new_user = False
        user = await user_repo.find_by_social(provider, social_id)
        if not user:
            user = await user_repo.create_social_user(provider, social_id, email, name)
            is_new_user = True

        # 3. JWT 발급
        access_token = create_access_token(user.id)
        refresh_token_str = create_refresh_token()
        token_hash = hash_refresh_token(refresh_token_str)

        expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        token_repo = RefreshTokenRepository(db)
        await token_repo.create(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
        await db.commit()

        # 4. onboarding_completed 확인
        # find_by_social eagerly loads profile; new users have no profile
        onboarding_completed = False
        if not is_new_user and user.profile and user.profile.onboarding_completed:
            onboarding_completed = True

        return SocialLoginResponse(
            access_token=access_token,
            refresh_token=refresh_token_str,
            user=UserInToken(
                id=user.id,
                email=user.email,
                nickname=user.nickname,
                social_provider=user.social_provider,
                onboarding_completed=onboarding_completed,
            ),
        )

    async def logout(self, db: AsyncSession, refresh_token_str: str) -> None:
        token_repo = RefreshTokenRepository(db)
        token_hash = hash_refresh_token(refresh_token_str)
        token = await token_repo.find_by_hash(token_hash)
        if token:
            await token_repo.delete(token.id)
        await db.commit()

    async def delete_account(self, db: AsyncSession, user_id: int) -> None:
        token_repo = RefreshTokenRepository(db)
        await token_repo.delete_all_for_user(user_id)
        user_repo = UserRepository(db)
        await user_repo.soft_delete(user_id)
        await db.commit()
