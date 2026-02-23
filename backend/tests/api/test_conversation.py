"""Tests for conversation REST endpoints (POST /conversation, GET /conversation/{id})."""

import pytest
from unittest.mock import AsyncMock, patch


# --- POST /api/v1/conversation ---

@pytest.mark.asyncio
async def test_create_conversation(client, seed_user):
    """Create a new conversation session, returns AI first message."""
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="오늘 하루 어땠어?")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        resp = await client.post("/api/v1/conversation")

    assert resp.status_code == 201
    data = resp.json()
    assert data["session_id"].startswith("conv_")
    assert data["status"] == "active"
    assert data["first_message"] == "오늘 하루 어땠어?"
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_conversation_stores_first_message(client, seed_user, db_session):
    """First AI message is persisted in conversation_messages."""
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="안녕! 오늘 뭐 했어?")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        resp = await client.post("/api/v1/conversation")

    session_id = resp.json()["session_id"]

    # Verify via GET endpoint
    resp2 = await client.get(f"/api/v1/conversation/{session_id}")
    assert resp2.status_code == 200
    data = resp2.json()
    assert len(data["messages"]) == 1
    assert data["messages"][0]["role"] == "ai"
    assert data["messages"][0]["content"] == "안녕! 오늘 뭐 했어?"


# --- GET /api/v1/conversation/{session_id} ---

@pytest.mark.asyncio
async def test_get_conversation(client, seed_conversation):
    """Get existing conversation session with messages."""
    resp = await client.get("/api/v1/conversation/conv_test123")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == "conv_test123"
    assert data["status"] == "active"
    assert data["turn_count"] == 0
    assert len(data["messages"]) == 1
    assert data["messages"][0]["content"] == "오늘 하루 어땠어?"


@pytest.mark.asyncio
async def test_get_conversation_not_found(client, seed_user):
    resp = await client.get("/api/v1/conversation/conv_nonexistent")
    assert resp.status_code == 404
    data = resp.json()
    assert data["error"]["code"] == "SESSION_NOT_FOUND"


@pytest.mark.asyncio
async def test_get_conversation_completed(client, seed_conversation, db_session):
    """Can retrieve a completed conversation."""
    from datetime import datetime
    seed_conversation.status = "completed"
    seed_conversation.completed_at = datetime.utcnow()
    await db_session.commit()

    resp = await client.get("/api/v1/conversation/conv_test123")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"
