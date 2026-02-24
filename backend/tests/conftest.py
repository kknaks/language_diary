import asyncio
import os

import pytest_asyncio
import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.database import get_db
from app.models.base import Base
from app.models import (  # noqa: ensure models loaded
    User, Diary, LearningCard, ConversationSession, ConversationMessage,
)

TEST_DB_PATH = "./test.db"
TEST_DB_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH}"

engine = create_async_engine(
    TEST_DB_URL,
    echo=False,
    connect_args={"timeout": 10},
)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _reset_rate_limiter():
    """Walk the built middleware stack and clear rate limiter state."""
    obj = app.middleware_stack
    while obj is not None:
        if hasattr(obj, "_requests"):
            obj._requests.clear()
        obj = getattr(obj, "app", None)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    # Reset rate limiter state between tests to prevent 429 across test runs
    if app.middleware_stack is not None:
        _reset_rate_limiter()

    # Ensure clean state: dispose stale connections from previous tests
    # (WebSocket tests run in threads that may hold DB connections briefly)
    # Forcefully dispose all connections and delete DB file to avoid
    # "database is locked" errors from Starlette WS test threads.
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


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def seed_user(db_session: AsyncSession):
    """Create MVP user (id=1)"""
    from datetime import datetime
    user = User(id=1, nickname="MVP User", native_lang="ko", target_lang="en",
                created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    db_session.add(user)
    await db_session.commit()
    return user


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
