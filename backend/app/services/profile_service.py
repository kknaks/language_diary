
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.auth import UserLanguageLevel
from app.models.seed import Voice
from app.repositories.profile_repo import ProfileRepository
from app.repositories.user_repo import UserRepository
from app.schemas.user import (
    LanguageLevelInfo,
    ProfileCreateRequest,
    ProfileResponse,
    UserProfileResponse,
)

VALID_CEFR_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}


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

        if data.empathy + data.intuition + data.logic != 100:
            raise BadRequestError(
                code="INVALID_PERSONALITY_SUM",
                message="성격 합계는 100이어야 합니다.",
            )

        await repo.create(
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

    async def update_profile(
        self,
        db: AsyncSession,
        user_id: int,
        data,
    ) -> dict:
        """Partial update of user profile."""
        repo = ProfileRepository(db)
        user_repo = UserRepository(db)

        profile = await repo.get_by_user_id(user_id)
        if not profile:
            raise NotFoundError(
                code="PROFILE_NOT_FOUND",
                message="프로필을 찾을 수 없습니다.",
            )

        update_data = data.dict(exclude_unset=True) if hasattr(data, 'dict') else data.model_dump(exclude_unset=True)

        voice_reset = False

        # voice_id validation
        if "voice_id" in update_data and update_data["voice_id"] is not None:
            target_lang_id = update_data.get("target_language_id", profile.target_language_id)
            result = await db.execute(
                select(Voice).where(Voice.id == update_data["voice_id"])
            )
            voice = result.scalar_one_or_none()
            if not voice:
                raise NotFoundError(
                    code="VOICE_NOT_FOUND",
                    message="음성을 찾을 수 없습니다.",
                )
            if voice.language_id != target_lang_id:
                raise BadRequestError(
                    code="VOICE_LANGUAGE_MISMATCH",
                    message="음성과 학습 언어가 일치하지 않습니다.",
                )

        # target_language_id change → check voice compatibility
        if "target_language_id" in update_data and update_data["target_language_id"] is not None:
            new_target_lang = update_data["target_language_id"]
            current_voice_id = update_data.get("voice_id", profile.voice_id)
            if current_voice_id and "voice_id" not in update_data:
                # Check if existing voice matches new target language
                result = await db.execute(
                    select(Voice).where(Voice.id == current_voice_id)
                )
                voice = result.scalar_one_or_none()
                if voice and voice.language_id != new_target_lang:
                    update_data["voice_id"] = None
                    voice_reset = True

        # Update nickname on users table
        if "nickname" in update_data:
            user = await user_repo.get_by_id(user_id)
            if user:
                user.nickname = update_data.pop("nickname")
                await db.flush()

        # cefr_level update
        cefr_level = update_data.pop("cefr_level", None)
        if cefr_level:
            target_lang_id = update_data.get("target_language_id", profile.target_language_id)
            await self._upsert_language_level(db, user_id, target_lang_id, cefr_level)

        # Update profile fields
        profile_fields = {}
        allowed_fields = {
            "app_locale", "native_language_id", "target_language_id",
            "avatar_id", "avatar_name", "voice_id",
            "empathy", "intuition", "logic",
        }
        for key in allowed_fields:
            if key in update_data:
                profile_fields[key] = update_data[key]

        if profile_fields:
            await repo.update(profile, **profile_fields)

        await db.commit()

        result = {"message": "프로필이 수정되었습니다."}
        if voice_reset:
            result["voice_reset"] = True
        return result

    async def update_language_level(
        self,
        db: AsyncSession,
        user_id: int,
        language_id: int,
        cefr_level: str,
    ) -> dict:
        """UPSERT user language level."""
        if cefr_level not in VALID_CEFR_LEVELS:
            raise BadRequestError(
                code="VALIDATION_ERROR",
                message=f"유효하지 않은 CEFR 레벨입니다. ({', '.join(sorted(VALID_CEFR_LEVELS))})",
            )

        await self._upsert_language_level(db, user_id, language_id, cefr_level)
        await db.commit()
        return {"message": "언어 레벨이 업데이트되었습니다."}

    async def _upsert_language_level(
        self,
        db: AsyncSession,
        user_id: int,
        language_id: int,
        cefr_level: str,
    ) -> None:
        result = await db.execute(
            select(UserLanguageLevel).where(
                UserLanguageLevel.user_id == user_id,
                UserLanguageLevel.language_id == language_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.cefr_level = cefr_level
        else:
            ll = UserLanguageLevel(
                user_id=user_id,
                language_id=language_id,
                cefr_level=cefr_level,
            )
            db.add(ll)
        await db.flush()
