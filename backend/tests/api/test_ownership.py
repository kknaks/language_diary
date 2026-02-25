"""Tests for resource ownership — other user's diary/conversation access returns 403."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, patch

from app.models import Diary, ConversationSession, User
from app.models.profile import UserProfile


@pytest.mark.asyncio
async def test_diary_access_other_user(client, seed_user, db_session):
    """Accessing another user's diary returns 404 (user_id filter excludes it)."""
    # Create another user with a diary
    user2 = User(
        id=2, nickname="Other User", native_lang="ko", target_lang="en",
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db_session.add(user2)
    await db_session.flush()

    diary = Diary(
        user_id=2,
        original_text="다른 유저의 일기",
        translated_text="Another user's diary",
        status="translated",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(diary)
    await db_session.commit()

    # Try to access as user 1 (seed_user)
    resp = await client.get("/api/v1/diary/%d" % diary.id)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_diary_list_excludes_other_user(client, seed_user, db_session):
    """Diary list only shows current user's diaries."""
    user2 = User(
        id=2, nickname="Other User", native_lang="ko", target_lang="en",
        created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
    )
    db_session.add(user2)
    await db_session.flush()

    diary = Diary(
        user_id=2,
        original_text="다른 유저",
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(diary)
    await db_session.commit()

    resp = await client.get("/api/v1/diary")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 0  # User 1 has no diaries


@pytest.mark.asyncio
async def test_conversation_access_other_user(client, seed_user, db_session):
    """Accessing another user's conversation returns 403."""
    session = ConversationSession(
        id="conv_other",
        user_id=999,  # Different user
        status="active",
        turn_count=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(session)
    await db_session.commit()

    resp = await client.get("/api/v1/conversation/conv_other")
    assert resp.status_code == 403
