from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.auth import UserLanguageLevel
from app.repositories.profile_repo import ProfileRepository
from app.repositories.user_repo import UserRepository
from app.schemas.user import (
    LanguageLevelInfo,
    ProfileCreateRequest,
    ProfileResponse,
    UserProfileResponse,
)


class ProfileService:
    async def create_profile(
        self,
        db: AsyncSession,
        user_id: int,
        data: ProfileCreateRequest,
    ) -> dict:
        repo = ProfileRepository(db)
        existing = await repo.get_by_user_id(user_id)
        if existing:
            raise ConflictError(
                code="PROFILE_ALREADY_EXISTS",
                message="이미 프로필이 존재합니다. PUT으로 수정해주세요.",
            )

        # 성격 합계 검증
        if data.empathy + data.intuition + data.logic != 100:
            raise BadRequestError(
                code="INVALID_PERSONALITY_SUM",
                message="성격 비율의 합이 100이어야 합니다.",
            )

        profile = await repo.create(
            user_id=user_id,
            native_language_id=data.native_language_id,
            target_language_id=data.target_language_id,
            avatar_id=data.avatar_id,
            avatar_name=data.avatar_name,
            voice_id=data.voice_id,
            empathy=data.empathy,
            intuition=data.intuition,
            logic=data.logic,
            app_locale=data.app_locale,
        )

        # cefr_level 있으면 UserLanguageLevel 저장
        if data.cefr_level:
            lang_level = UserLanguageLevel(
                user_id=user_id,
                language_id=data.target_language_id,
                cefr_level=data.cefr_level,
            )
            db.add(lang_level)
            await db.flush()

        await db.commit()

        return {"message": "프로필이 생성되었습니다.", "onboarding_completed": True}

    async def get_profile(
        self,
        db: AsyncSession,
        user_id: int,
    ) -> UserProfileResponse:
        user_repo = UserRepository(db)
        user = await user_repo.get_by_id(user_id)
        if not user:
            raise NotFoundError(code="USER_NOT_FOUND", message="유저를 찾을 수 없습니다.")

        repo = ProfileRepository(db)
        profile = await repo.get_by_user_id(user_id)

        # language_level 조회
        lang_level = None
        if profile:
            result = await db.execute(
                select(UserLanguageLevel).where(
                    UserLanguageLevel.user_id == user_id,
                    UserLanguageLevel.language_id == profile.target_language_id,
                )
            )
            ll = result.scalar_one_or_none()
            if ll:
                lang_level = LanguageLevelInfo(
                    language_id=ll.language_id,
                    cefr_level=ll.cefr_level,
                )

        return UserProfileResponse(
            id=user.id,
            email=user.email,
            nickname=user.nickname,
            social_provider=user.social_provider,
            is_active=user.is_active,
            created_at=user.created_at,
            profile=ProfileResponse.model_validate(profile) if profile else None,
            language_level=lang_level,
        )
