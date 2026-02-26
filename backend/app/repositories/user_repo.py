from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: int) -> Optional[User]:
        result = await self.db.execute(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.profile))
        )
        return result.scalar_one_or_none()

    async def find_by_social(self, provider: str, social_id: str) -> Optional[User]:
        result = await self.db.execute(
            select(User)
            .where(User.social_provider == provider, User.social_id == social_id)
            .options(selectinload(User.profile))
        )
        return result.scalar_one_or_none()

    async def find_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def create_social_user(self, provider: str, social_id: str, email: str, nickname: str) -> User:
        user = User(
            social_provider=provider,
            social_id=social_id,
            email=email,
            nickname=nickname,
            is_active=True,
        )
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def soft_delete(self, user_id: int) -> None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.is_active = False
            user.deleted_at = datetime.utcnow()
            await self.db.flush()
