from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import UserProfile
from app.models.seed import Language, Avatar, Voice  # noqa: F401


class ProfileRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_user_id(self, user_id: int) -> Optional[UserProfile]:
        result = await self.db.execute(
            select(UserProfile)
            .where(UserProfile.user_id == user_id)
            .options(
                selectinload(UserProfile.native_language),
                selectinload(UserProfile.target_language),
                selectinload(UserProfile.avatar),
                selectinload(UserProfile.voice),
                selectinload(UserProfile.pronunciation_voice),
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: int,
        native_language_id: int,
        target_language_id: int,
        avatar_id: Optional[int],
        avatar_name: Optional[str],
        voice_id: Optional[int],
        pronunciation_voice_id: Optional[int],
        empathy: int,
        intuition: int,
        logic: int,
        app_locale: str,
    ) -> UserProfile:
        profile = UserProfile(
            user_id=user_id,
            native_language_id=native_language_id,
            target_language_id=target_language_id,
            avatar_id=avatar_id,
            avatar_name=avatar_name,
            voice_id=voice_id,
            pronunciation_voice_id=pronunciation_voice_id,
            empathy=empathy,
            intuition=intuition,
            logic=logic,
            app_locale=app_locale,
            onboarding_completed=True,
        )
        self.db.add(profile)
        await self.db.flush()
        await self.db.refresh(profile)
        return profile

    async def update(self, profile: UserProfile, **kwargs) -> UserProfile:
        for key, value in kwargs.items():
            if hasattr(profile, key):
                setattr(profile, key, value)
        await self.db.flush()
        await self.db.refresh(profile)
        return profile
