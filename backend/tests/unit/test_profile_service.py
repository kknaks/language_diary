"""Unit tests for ProfileService."""
from datetime import datetime

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models.seed import Language
from app.models.user import User
from app.services.profile_service import ProfileService
from app.schemas.user import ProfileCreateRequest


@pytest_asyncio.fixture
async def seed_languages(db_session: AsyncSession):
    """Create test languages."""
    ko = Language(id=1, code="ko", name_native="한국어", is_active=True)
    en = Language(id=2, code="en", name_native="English", is_active=True)
    db_session.add_all([ko, en])
    await db_session.commit()
    return ko, en


@pytest_asyncio.fixture
async def profile_user(db_session: AsyncSession):
    """Create a test user for profile tests."""
    user = User(
        id=200,
        nickname="ProfileUser",
        email="profile@test.com",
        native_lang="ko",
        target_lang="en",
        social_provider="google",
        social_id="google_profile_test",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.mark.asyncio
class TestCreateProfile:
    async def test_success(self, db_session, profile_user, seed_languages):
        """Should create profile successfully."""
        service = ProfileService()
        data = ProfileCreateRequest(
            native_language_id=1,
            target_language_id=2,
            empathy=40,
            intuition=30,
            logic=30,
            app_locale="ko",
        )
        result = await service.create_profile(db_session, profile_user.id, data)
        assert result["onboarding_completed"] is True
        assert result["message"] == "프로필이 생성되었습니다."

    async def test_with_cefr_level(self, db_session, profile_user, seed_languages):
        """Should create profile with CEFR level."""
        service = ProfileService()
        data = ProfileCreateRequest(
            native_language_id=1,
            target_language_id=2,
            empathy=34,
            intuition=33,
            logic=33,
            cefr_level="B1",
        )
        result = await service.create_profile(db_session, profile_user.id, data)
        assert result["onboarding_completed"] is True

    async def test_invalid_personality_sum(self, db_session, profile_user, seed_languages):
        """Personality sum != 100 should raise BadRequestError."""
        service = ProfileService()
        data = ProfileCreateRequest(
            native_language_id=1,
            target_language_id=2,
            empathy=50,
            intuition=30,
            logic=30,
        )
        with pytest.raises(BadRequestError) as exc_info:
            await service.create_profile(db_session, profile_user.id, data)
        assert exc_info.value.code == "INVALID_PERSONALITY_SUM"

    async def test_duplicate_profile(self, db_session, profile_user, seed_languages):
        """Second profile creation should raise ConflictError."""
        service = ProfileService()
        data = ProfileCreateRequest(
            native_language_id=1,
            target_language_id=2,
            empathy=34,
            intuition=33,
            logic=33,
        )
        await service.create_profile(db_session, profile_user.id, data)

        with pytest.raises(ConflictError) as exc_info:
            await service.create_profile(db_session, profile_user.id, data)
        assert exc_info.value.code == "PROFILE_ALREADY_EXISTS"


@pytest.mark.asyncio
class TestGetProfile:
    async def test_get_profile_with_profile(self, db_session, profile_user, seed_languages):
        """Should return user profile with nested data."""
        service = ProfileService()

        # First create a profile
        data = ProfileCreateRequest(
            native_language_id=1,
            target_language_id=2,
            empathy=34,
            intuition=33,
            logic=33,
            cefr_level="A2",
        )
        await service.create_profile(db_session, profile_user.id, data)

        # Then get it
        result = await service.get_profile(db_session, profile_user.id)
        assert result.id == profile_user.id
        assert result.nickname == "ProfileUser"
        assert result.profile is not None
        assert result.profile.onboarding_completed is True
        assert result.profile.native_language is not None
        assert result.profile.native_language.code == "ko"
        assert result.profile.target_language is not None
        assert result.profile.target_language.code == "en"
        assert result.language_level is not None
        assert result.language_level.cefr_level == "A2"

    async def test_get_profile_without_profile(self, db_session, profile_user):
        """Should return user without profile when no profile exists."""
        service = ProfileService()
        result = await service.get_profile(db_session, profile_user.id)
        assert result.id == profile_user.id
        assert result.profile is None
        assert result.language_level is None

    async def test_get_profile_user_not_found(self, db_session):
        """Should raise NotFoundError for non-existent user."""
        service = ProfileService()
        with pytest.raises(NotFoundError) as exc_info:
            await service.get_profile(db_session, 99999)
        assert exc_info.value.code == "USER_NOT_FOUND"
