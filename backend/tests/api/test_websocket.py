"""Tests for WebSocket /ws/conversation/{session_id}."""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_websocket_send_message(client, seed_conversation):
    """Send a text message via WebSocket and receive AI reply."""
    mock_ai = AsyncMock()
    mock_ai.get_reply = AsyncMock(return_value="어떤 회의였어?")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        # Patch async_session to use test DB
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            from starlette.testclient import TestClient
            # Use synchronous TestClient for WebSocket testing
            with TestClient(app) as tc:
                with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                    ws.send_json({"type": "message", "text": "오늘 회사에서 회의했어"})
                    data = ws.receive_json()
                    assert data["type"] == "ai_message"
                    assert data["text"] == "어떤 회의였어?"


@pytest.mark.asyncio
async def test_websocket_finish_conversation(client, seed_conversation):
    """Send finish message and receive diary_created response."""
    mock_ai = AsyncMock()
    mock_ai.generate_diary = AsyncMock(return_value={
        "original_text": "오늘 회사에서 팀장님과 회의를 했다.",
        "translated_text": "I had a meeting with my team leader at work today.",
    })
    mock_ai.extract_learning_points = AsyncMock(return_value=[
        {
            "card_type": "word",
            "content_en": "meeting",
            "content_ko": "회의",
            "part_of_speech": "noun",
            "cefr_level": "A2",
            "example_en": "I had a meeting at work today.",
            "example_ko": "오늘 회사에서 회의했어.",
        },
        {
            "card_type": "phrase",
            "content_en": "team leader",
            "content_ko": "팀장",
            "part_of_speech": None,
            "cefr_level": "A2",
            "example_en": "I had a meeting with my team leader.",
            "example_ko": "팀장님과 회의를 했다.",
        },
    ])

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            from starlette.testclient import TestClient
            with TestClient(app) as tc:
                with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                    ws.send_json({"type": "finish"})
                    data = ws.receive_json()
                    assert data["type"] == "diary_created"
                    diary = data["diary"]
                    assert diary["original_text"] == "오늘 회사에서 팀장님과 회의를 했다."
                    assert diary["translated_text"] == "I had a meeting with my team leader at work today."
                    assert diary["status"] == "translated"
                    assert len(diary["learning_cards"]) == 2


@pytest.mark.asyncio
async def test_websocket_invalid_json(client, seed_conversation):
    """Sending invalid JSON returns an error."""
    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        from starlette.testclient import TestClient
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                ws.send_text("not json")
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_websocket_empty_message(client, seed_conversation):
    """Sending empty text returns error."""
    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        from starlette.testclient import TestClient
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                ws.send_json({"type": "message", "text": ""})
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_websocket_unknown_type(client, seed_conversation):
    """Sending unknown message type returns error."""
    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        from starlette.testclient import TestClient
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                ws.send_json({"type": "unknown_type"})
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_websocket_session_not_found(client, seed_user):
    """WebSocket to nonexistent session returns error on message send."""
    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        from starlette.testclient import TestClient
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_nonexistent") as ws:
                ws.send_json({"type": "message", "text": "hello"})
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "SESSION_NOT_FOUND"


@pytest.mark.asyncio
async def test_websocket_completed_session(client, seed_conversation, db_session):
    """Cannot send messages to a completed session."""
    from datetime import datetime
    seed_conversation.status = "completed"
    seed_conversation.completed_at = datetime.utcnow()
    await db_session.commit()

    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        from starlette.testclient import TestClient
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                ws.send_json({"type": "message", "text": "hello"})
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "SESSION_ALREADY_COMPLETED"
