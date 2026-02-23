from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.repositories.user_repo import UserRepository
from app.schemas.user import UserResponse


class UserService:
    def __init__(self, db: AsyncSession):
        self.repo = UserRepository(db)

    async def get_current_user(self) -> UserResponse:
        """MVP: hardcoded user_id=1"""
        user = await self.repo.get_by_id(1)
        if not user:
            raise NotFoundError(
                code="USER_NOT_FOUND",
                message="사용자를 찾을 수 없습니다.",
                detail="user_id=1",
            )
        return UserResponse.model_validate(user)
