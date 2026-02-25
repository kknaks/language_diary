from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import InvalidAccessTokenError, OnboardingRequiredError
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.utils.jwt import verify_access_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    user_id = verify_access_token(token)
    if not user_id:
        raise InvalidAccessTokenError()
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user or not user.is_active:
        raise InvalidAccessTokenError()
    return user


async def get_onboarded_user(user: User = Depends(get_current_user)) -> User:
    if not user.profile or not user.profile.onboarding_completed:
        raise OnboardingRequiredError()
    return user


# Re-export for convenience
__all__ = ["get_db", "Depends", "AsyncSession", "get_current_user", "get_onboarded_user"]
