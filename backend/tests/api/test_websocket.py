"""Tests for WebSocket /ws/conversation/{session_id}."""

import pytest
from unittest.mock import AsyncMock, patch

from app.main import app
from app.services.stt_service import STTError


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


# ---------------------------------------------------------------------------
# Audio streaming (STT) tests
# ---------------------------------------------------------------------------

def _make_mock_stt(final_text="회사에서 회의했어"):
    """Create a mock STTSession that returns the given final text."""
    mock = AsyncMock()
    mock.connect = AsyncMock()
    mock.send_audio = AsyncMock()
    mock.commit_and_wait_final = AsyncMock(return_value=final_text)
    mock.close = AsyncMock()
    return mock


@pytest.mark.asyncio
async def test_websocket_audio_full_flow(client, seed_conversation):
    """audio_start → binary chunks → audio_end → stt_final + ai_message."""
    mock_ai = AsyncMock()
    mock_ai.get_reply = AsyncMock(return_value="어떤 회의였어?")

    mock_stt = _make_mock_stt("회사에서 회의했어")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                        # Start audio streaming
                        ws.send_json({"type": "audio_start"})

                        # Send binary audio chunks
                        ws.send_bytes(b"\x00\x01\x02\x03")
                        ws.send_bytes(b"\x04\x05\x06\x07")

                        # End audio streaming
                        ws.send_json({"type": "audio_end"})

                        # Should receive stt_final
                        data = ws.receive_json()
                        assert data["type"] == "stt_final"
                        assert data["text"] == "회사에서 회의했어"

                        # Should receive ai_message (STT → AI pipeline)
                        data = ws.receive_json()
                        assert data["type"] == "ai_message"
                        assert data["text"] == "어떤 회의였어?"

                        # Verify STT session lifecycle
                        mock_stt.connect.assert_called_once()
                        assert mock_stt.send_audio.call_count == 2
                        mock_stt.commit_and_wait_final.assert_called_once()
                        mock_stt.close.assert_called()


@pytest.mark.asyncio
async def test_websocket_audio_stt_connect_error(client, seed_conversation):
    """STT connection failure sends error but keeps WebSocket alive."""
    mock_stt = AsyncMock()
    mock_stt.connect = AsyncMock(side_effect=STTError("ElevenLabs STT 연결 실패"))
    mock_stt.close = AsyncMock()

    mock_ai = AsyncMock()
    mock_ai.get_reply = AsyncMock(return_value="어떤 회의였어?")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                        ws.send_json({"type": "audio_start"})

                        # Should receive STT error
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "STT_FAILED"

                        # WebSocket still alive — can send text message
                        ws.send_json({"type": "message", "text": "타이핑으로 입력"})
                        data = ws.receive_json()
                        assert data["type"] == "ai_message"


@pytest.mark.asyncio
async def test_websocket_audio_stt_commit_error(client, seed_conversation):
    """STT commit failure sends error but keeps WebSocket alive."""
    mock_stt = _make_mock_stt()
    mock_stt.commit_and_wait_final = AsyncMock(side_effect=STTError("STT 최종 결과 대기 시간 초과"))

    mock_ai = AsyncMock()
    mock_ai.get_reply = AsyncMock(return_value="어떤 회의였어?")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                        ws.send_json({"type": "audio_start"})
                        ws.send_json({"type": "audio_end"})

                        # Should receive STT error
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "STT_FAILED"

                        # Fallback: can still send text
                        ws.send_json({"type": "message", "text": "텍스트 폴백"})
                        data = ws.receive_json()
                        assert data["type"] == "ai_message"


@pytest.mark.asyncio
async def test_websocket_audio_end_without_start(client, seed_conversation):
    """audio_end without audio_start returns validation error."""
    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        from starlette.testclient import TestClient
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                ws.send_json({"type": "audio_end"})
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "VALIDATION_ERROR"
                assert "STT 세션" in data["message"]


@pytest.mark.asyncio
async def test_websocket_audio_empty_final_text(client, seed_conversation):
    """Empty STT final text sends stt_final but no ai_message."""
    mock_stt = _make_mock_stt("")  # Empty transcription

    with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            from starlette.testclient import TestClient
            with TestClient(app) as tc:
                with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                    ws.send_json({"type": "audio_start"})
                    ws.send_json({"type": "audio_end"})

                    # Should receive stt_final with empty text
                    data = ws.receive_json()
                    assert data["type"] == "stt_final"
                    assert data["text"] == ""

                    # No ai_message should follow — user can try again
                    # Send another audio or text message
                    mock_ai = AsyncMock()
                    mock_ai.get_reply = AsyncMock(return_value="뭐라고 했어?")
                    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
                        ws.send_json({"type": "message", "text": "안녕"})
                        data = ws.receive_json()
                        assert data["type"] == "ai_message"


@pytest.mark.asyncio
async def test_websocket_audio_then_finish(client, seed_conversation):
    """Audio flow followed by finish produces diary."""
    mock_ai = AsyncMock()
    mock_ai.get_reply = AsyncMock(return_value="좋았겠다!")
    mock_ai.generate_diary = AsyncMock(return_value={
        "original_text": "오늘 회사에서 회의했다.",
        "translated_text": "I had a meeting at work today.",
    })
    mock_ai.extract_learning_points = AsyncMock(return_value=[])

    mock_stt = _make_mock_stt("회사에서 회의했어")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation/conv_test123") as ws:
                        # Audio flow
                        ws.send_json({"type": "audio_start"})
                        ws.send_bytes(b"\x00\x01")
                        ws.send_json({"type": "audio_end"})

                        stt_final = ws.receive_json()
                        assert stt_final["type"] == "stt_final"

                        ai_msg = ws.receive_json()
                        assert ai_msg["type"] == "ai_message"

                        # Now finish
                        ws.send_json({"type": "finish"})
                        data = ws.receive_json()
                        assert data["type"] == "diary_created"
                        assert data["diary"]["translated_text"] == "I had a meeting at work today."
