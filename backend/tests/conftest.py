import asyncio
import os
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import get_db
from app.dependencies import get_current_user, get_onboarded_user
from app.main import app
from app.models import (  # noqa: F401
    ConversationMessage, ConversationSession, Diary, LearningCard, User,
)
from app.models.base import Base
from app.models.profile import UserProfile
from app.models.seed import Language
from app.services.tts_service import TTSError
from app.utils.jwt import create_access_token

TEST_DB_PATH = "./test.db"
TEST_DB_URL = "sqlite+aiosqlite:///%s" % TEST_DB_PATH

engine = create_async_engine(
    TEST_DB_URL,
    echo=False,
    connect_args={"timeout": 10},
)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Shared user reference for dependency overrides
_test_user = None  # type: User


def _reset_rate_limiter():
    """Walk the built middleware stack and clear rate limiter state."""
    obj = app.middleware_stack
    while obj is not None:
        if hasattr(obj, "_requests"):
            obj._requests.clear()
        obj = getattr(obj, "app", None)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    global _test_user
    _test_user = None

    # Reset rate limiter state between tests to prevent 429 across test runs
    if app.middleware_stack is not None:
        _reset_rate_limiter()

    # Ensure clean state: dispose stale connections from previous tests
    await engine.dispose()
    await asyncio.sleep(0.05)
    for suffix in ("", "-wal", "-shm"):
        try:
            os.unlink(TEST_DB_PATH + suffix)
        except FileNotFoundError:
            pass

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session():
    async with TestSession() as session:
        yield session


async def _override_get_db():
    async with TestSession() as session:
        yield session


app.dependency_overrides[get_db] = _override_get_db


# Auth dependency overrides: return the test user
# These overrides simplify testing — when seed_user fixture sets _test_user,
# all endpoints act as that user. When no seed_user is used, auth fails with 401.
#
# For tests that use real JWT tokens (like auth tests), they should use
# set_test_user fixture to set the appropriate user.
async def _override_get_current_user():
    if _test_user is None:
        from app.exceptions import InvalidAccessTokenError
        raise InvalidAccessTokenError()
    return _test_user


async def _override_get_onboarded_user():
    if _test_user is None:
        from app.exceptions import InvalidAccessTokenError
        raise InvalidAccessTokenError()
    return _test_user


app.dependency_overrides[get_current_user] = _override_get_current_user
app.dependency_overrides[get_onboarded_user] = _override_get_onboarded_user


@pytest_asyncio.fixture
async def set_test_user(db_session: AsyncSession):
    """Factory fixture to set any user as the current test user."""
    global _test_user

    def _set(user):
        global _test_user
        _test_user = user

    return _set


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def seed_user(db_session: AsyncSession):
    """Create MVP user (id=1) with profile (onboarding completed)."""
    global _test_user
    from datetime import datetime

    # Create languages first
    ko = Language(id=1, code="ko", name_native="한국어", is_active=True)
    en = Language(id=2, code="en", name_native="English", is_active=True)
    db_session.add_all([ko, en])
    await db_session.flush()

    user = User(
        id=1, nickname="MVP User", native_lang="ko", target_lang="en",
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db_session.add(user)
    await db_session.flush()

    # Create profile for onboarding
    profile = UserProfile(
        user_id=1,
        native_language_id=1,
        target_language_id=2,
        empathy=34,
        intuition=33,
        logic=33,
        app_locale="ko",
        onboarding_completed=True,
    )
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(user)

    _test_user = user
    return user


@pytest_asyncio.fixture
async def auth_token():
    """Generate a valid JWT token for user_id=1."""
    return create_access_token(1)


@pytest_asyncio.fixture
async def seed_diary(db_session: AsyncSession, seed_user):
    """Create a sample diary with learning cards"""
    from datetime import datetime
    diary = Diary(
        user_id=1,
        original_text="오늘 회사에서 회의했어",
        translated_text="I had a meeting at work today",
        status="translated",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(diary)
    await db_session.flush()

    card = LearningCard(
        diary_id=diary.id,
        card_type="word",
        content_en="meeting",
        content_ko="회의",
        part_of_speech="noun",
        cefr_level="A2",
        example_en="I had a meeting at work today.",
        example_ko="오늘 회사에서 회의했어.",
        card_order=1,
    )
    db_session.add(card)
    await db_session.commit()
    await db_session.refresh(diary)
    return diary


@pytest_asyncio.fixture
async def seed_conversation(db_session: AsyncSession, seed_user):
    """Create a sample active conversation session with one AI message."""
    from datetime import datetime
    session = ConversationSession(
        id="conv_test123",
        user_id=1,
        status="active",
        turn_count=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(session)
    await db_session.flush()

    msg = ConversationMessage(
        session_id="conv_test123",
        role="ai",
        content="오늘 하루 어땠어?",
        message_order=1,
    )
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(session)
    return session


@pytest.fixture(autouse=True)
def mock_tts_stream_session():
    """Force TTSStreamSession to fail so tests use REST TTS fallback."""
    with patch("app.api.v1.conversation.TTSStreamSession") as MockStream:
        instance = MockStream.return_value
        instance.connect = AsyncMock(
            side_effect=TTSError("TTS WebSocket unavailable in test")
        )
        instance.close = AsyncMock()
        yield MockStream
