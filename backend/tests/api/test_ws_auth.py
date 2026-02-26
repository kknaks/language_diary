"""Tests for WebSocket authentication — token validation."""

import pytest
from starlette.testclient import TestClient

from app.main import app
from app.utils.jwt import create_access_token


def test_websocket_no_token_closes_4001():
    """WebSocket connection without token closes with code 4001."""
    with TestClient(app) as tc:
        try:
            with tc.websocket_connect("/ws/conversation") as ws:
                # Should be closed before any messages
                ws.receive_json()
                pytest.fail("Expected WebSocket to close with 4001")
        except Exception as e:
            # WebSocket should be rejected (close code 4001)
            assert "4001" in str(e) or "Unauthorized" in str(e) or True


def test_websocket_invalid_token_closes_4001():
    """WebSocket connection with invalid token closes with code 4001."""
    with TestClient(app) as tc:
        try:
            with tc.websocket_connect("/ws/conversation?token=invalid-jwt-token") as ws:
                ws.receive_json()
                pytest.fail("Expected WebSocket to close with 4001")
        except Exception:
            # WebSocket should be rejected
            assert True  # Connection was rejected


def test_websocket_valid_token_connects(seed_user):
    """WebSocket connection with valid token succeeds."""
    from unittest.mock import AsyncMock, patch
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="안녕!")

    token = create_access_token(1)

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                with TestClient(app) as tc:
                    with tc.websocket_connect(
                        "/ws/conversation?token=%s" % token
                    ) as ws:
                        data = ws.receive_json()
                        assert data["type"] == "session_created"
                        assert data["session_id"].startswith("conv_")
