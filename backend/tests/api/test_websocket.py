"""Tests for WebSocket /ws/conversation (session created on connect)."""

import pytest
from unittest.mock import AsyncMock, patch

from app.main import app
from app.services.conversation_service import ConversationService
from app.services.stt_service import STTError


def _make_mock_ai(
    greeting="오늘 하루 어땠어?",
    reply="어떤 회의였어?",
    diary=None,
    learning_points=None,
):
    """Create a mock AIService."""
    mock = AsyncMock()
    mock.get_first_message = AsyncMock(return_value=greeting)
    mock.get_reply = AsyncMock(return_value=reply)
    if diary:
        mock.generate_diary = AsyncMock(return_value=diary)
    if learning_points is not None:
        mock.extract_learning_points = AsyncMock(return_value=learning_points)
    return mock


def _make_streaming_reply(*sentences):
    """Create an async generator mock for get_reply_streaming."""
    async def _gen(history):
        for s in sentences:
            yield s
    return _gen


def _ws_connect_and_init(tc, mock_ai):
    """Helper: connect to WS endpoint and receive session_created + ai_message + tts_audio."""
    from tests.conftest import TestSession
    patches = [
        patch("app.services.conversation_service.AIService", return_value=mock_ai),
        patch("app.api.v1.conversation.async_session", TestSession),
        patch("app.api.v1.conversation.TTSService"),
    ]
    return patches


@pytest.mark.asyncio
async def test_websocket_session_created_on_connect(client, seed_user):
    """Connecting to WS creates session and sends greeting + TTS."""
    mock_ai = _make_mock_ai()
    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3-greeting")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation") as ws:
                        # 1. session_created
                        data = ws.receive_json()
                        assert data["type"] == "session_created"
                        assert data["session_id"].startswith("conv_")

                        # 2. ai_message (greeting)
                        data = ws.receive_json()
                        assert data["type"] == "ai_message"
                        assert data["text"] == "오늘 하루 어땠어?"

                        # 3. tts_audio (greeting TTS, index=0)
                        data = ws.receive_json()
                        assert data["type"] == "tts_audio"
                        assert "audio_data" in data
                        assert data["format"] == "mp3"
                        assert data["index"] == 0


@pytest.mark.asyncio
async def test_websocket_send_message_streaming(client, seed_user):
    """Send a text message via WS and receive streaming AI reply chunks + TTS."""
    mock_ai = _make_mock_ai()
    mock_ai.get_reply_streaming = _make_streaming_reply("어떤 회의였어?")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3-reply")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation") as ws:
                        # Consume init messages (session_created, ai_message, tts_audio)
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio

                        # Send user message
                        ws.send_json({"type": "message", "text": "오늘 회사에서 회의했어"})

                        # Receive ai_message_chunk (sentence)
                        data = ws.receive_json()
                        assert data["type"] == "ai_message_chunk"
                        assert data["text"] == "어떤 회의였어?"
                        assert data["index"] == 0
                        assert data["is_final"] is False

                        # Receive final marker
                        data = ws.receive_json()
                        assert data["type"] == "ai_message_chunk"
                        assert data["is_final"] is True

                        # Receive ai_done
                        data = ws.receive_json()
                        assert data["type"] == "ai_done"

                        # Receive TTS audio
                        data = ws.receive_json()
                        assert data["type"] == "tts_audio"
                        assert "audio_data" in data
                        assert data["format"] == "mp3"
                        assert data["index"] == 0


@pytest.mark.asyncio
async def test_websocket_finish_conversation(client, seed_user):
    """Send finish message and receive diary_created response."""
    mock_ai = _make_mock_ai()
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
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation") as ws:
                        # Consume init messages
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio

                        ws.send_json({"type": "finish"})
                        data = ws.receive_json()
                        assert data["type"] == "diary_created"
                        diary = data["diary"]
                        assert diary["original_text"] == "오늘 회사에서 팀장님과 회의를 했다."
                        assert diary["translated_text"] == "I had a meeting with my team leader at work today."
                        assert diary["status"] == "translated"
                        assert len(diary["learning_cards"]) == 2


@pytest.mark.asyncio
async def test_websocket_invalid_json(client, seed_user):
    """Sending invalid JSON returns an error."""
    mock_ai = _make_mock_ai()

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation") as ws:
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio

                        ws.send_text("not json")
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_websocket_empty_message(client, seed_user):
    """Sending empty text returns error."""
    mock_ai = _make_mock_ai()

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation") as ws:
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio

                        ws.send_json({"type": "message", "text": ""})
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_websocket_unknown_type(client, seed_user):
    """Sending unknown message type returns error."""
    mock_ai = _make_mock_ai()

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation") as ws:
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio

                        ws.send_json({"type": "unknown_type"})
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# Audio streaming (STT) tests
# ---------------------------------------------------------------------------

def _make_mock_stt(final_text="회사에서 회의했어"):
    """Create a mock STTSession that returns the given final text."""
    mock = AsyncMock()
    mock.connect = AsyncMock()
    mock.send_audio = AsyncMock()
    mock.wait_for_final = AsyncMock(return_value=final_text)
    mock.close = AsyncMock()
    return mock


@pytest.mark.asyncio
async def test_websocket_audio_full_flow(client, seed_user):
    """audio_start → binary chunks → audio_end → stt_final + ai_message_chunk + tts_audio."""
    mock_ai = _make_mock_ai()
    mock_ai.get_reply_streaming = _make_streaming_reply("어떤 회의였어?")

    mock_stt = _make_mock_stt("회사에서 회의했어")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            with patch("app.api.v1.conversation.TTSService") as MockTTS:
                MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3-tts")
                from tests.conftest import TestSession
                with patch("app.api.v1.conversation.async_session", TestSession):
                    from starlette.testclient import TestClient
                    with TestClient(app) as tc:
                        with tc.websocket_connect("/ws/conversation") as ws:
                            # Consume init messages
                            ws.receive_json()  # session_created
                            ws.receive_json()  # ai_message
                            ws.receive_json()  # tts_audio

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

                            # Should receive ai_message_chunk
                            data = ws.receive_json()
                            assert data["type"] == "ai_message_chunk"
                            assert data["text"] == "어떤 회의였어?"
                            assert data["index"] == 0

                            # Should receive final marker
                            data = ws.receive_json()
                            assert data["type"] == "ai_message_chunk"
                            assert data["is_final"] is True

                            # Should receive ai_done
                            data = ws.receive_json()
                            assert data["type"] == "ai_done"

                            # Should receive tts_audio
                            data = ws.receive_json()
                            assert data["type"] == "tts_audio"
                            assert "audio_data" in data
                            assert data["format"] == "mp3"

                            # Verify STT session lifecycle
                            mock_stt.connect.assert_called_once()
                            assert mock_stt.send_audio.call_count == 2
                            mock_stt.wait_for_final.assert_called_once()
                            mock_stt.close.assert_called()


@pytest.mark.asyncio
async def test_websocket_audio_stt_connect_error(client, seed_user):
    """STT connection failure sends error but keeps WebSocket alive."""
    mock_stt = AsyncMock()
    mock_stt.connect = AsyncMock(side_effect=STTError("ElevenLabs STT 연결 실패"))
    mock_stt.close = AsyncMock()

    mock_ai = _make_mock_ai()
    mock_ai.get_reply_streaming = _make_streaming_reply("어떤 회의였어?")

    mock_tts_bytes = b"fake-mp3-tts"

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            with patch("app.api.v1.conversation.TTSService") as MockTTS:
                MockTTS.return_value.generate_bytes = AsyncMock(return_value=mock_tts_bytes)
                from tests.conftest import TestSession
                with patch("app.api.v1.conversation.async_session", TestSession):
                    from starlette.testclient import TestClient
                    with TestClient(app) as tc:
                        with tc.websocket_connect("/ws/conversation") as ws:
                            ws.receive_json()  # session_created
                            ws.receive_json()  # ai_message
                            ws.receive_json()  # tts_audio

                            ws.send_json({"type": "audio_start"})

                            # Should receive STT error
                            data = ws.receive_json()
                            assert data["type"] == "error"
                            assert data["code"] == "STT_FAILED"

                            # WebSocket still alive — can send text message
                            ws.send_json({"type": "message", "text": "타이핑으로 입력"})
                            data = ws.receive_json()
                            assert data["type"] == "ai_message_chunk"


@pytest.mark.asyncio
async def test_websocket_audio_stt_commit_error(client, seed_user):
    """STT commit failure sends error but keeps WebSocket alive."""
    mock_stt = _make_mock_stt()
    mock_stt.wait_for_final = AsyncMock(side_effect=STTError("STT 최종 결과 대기 시간 초과"))

    mock_ai = _make_mock_ai()
    mock_ai.get_reply_streaming = _make_streaming_reply("어떤 회의였어?")

    mock_tts_bytes = b"fake-mp3-tts"

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            with patch("app.api.v1.conversation.TTSService") as MockTTS:
                MockTTS.return_value.generate_bytes = AsyncMock(return_value=mock_tts_bytes)
                from tests.conftest import TestSession
                with patch("app.api.v1.conversation.async_session", TestSession):
                    from starlette.testclient import TestClient
                    with TestClient(app) as tc:
                        with tc.websocket_connect("/ws/conversation") as ws:
                            ws.receive_json()  # session_created
                            ws.receive_json()  # ai_message
                            ws.receive_json()  # tts_audio

                            ws.send_json({"type": "audio_start"})
                            ws.send_json({"type": "audio_end"})

                            # Should receive STT error
                            data = ws.receive_json()
                            assert data["type"] == "error"
                            assert data["code"] == "STT_FAILED"

                            # Fallback: can still send text
                            ws.send_json({"type": "message", "text": "텍스트 폴백"})
                            data = ws.receive_json()
                            assert data["type"] == "ai_message_chunk"


@pytest.mark.asyncio
async def test_websocket_audio_end_without_start(client, seed_user):
    """audio_end without audio_start returns validation error."""
    mock_ai = _make_mock_ai()

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect("/ws/conversation") as ws:
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio

                        ws.send_json({"type": "audio_end"})
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "VALIDATION_ERROR"
                        assert "STT 세션" in data["message"]


@pytest.mark.asyncio
async def test_websocket_audio_empty_final_text(client, seed_user):
    """Empty STT final text sends stt_final but no ai_message."""
    mock_stt = _make_mock_stt("")  # Empty transcription
    mock_ai = _make_mock_ai()
    mock_ai.get_reply_streaming = _make_streaming_reply("뭐라고 했어?")

    mock_tts_bytes = b"fake-mp3-tts"

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            with patch("app.api.v1.conversation.TTSService") as MockTTS:
                MockTTS.return_value.generate_bytes = AsyncMock(return_value=mock_tts_bytes)
                from tests.conftest import TestSession
                with patch("app.api.v1.conversation.async_session", TestSession):
                    from starlette.testclient import TestClient
                    with TestClient(app) as tc:
                        with tc.websocket_connect("/ws/conversation") as ws:
                            ws.receive_json()  # session_created
                            ws.receive_json()  # ai_message
                            ws.receive_json()  # tts_audio

                            ws.send_json({"type": "audio_start"})
                            ws.send_json({"type": "audio_end"})

                            # Should receive stt_final with empty text
                            data = ws.receive_json()
                            assert data["type"] == "stt_final"
                            assert data["text"] == ""

                            # Should receive stt_empty to reset client UI
                            data = ws.receive_json()
                            assert data["type"] == "stt_empty"
                            assert "message" in data

                            # No ai_message should follow — user can try again
                            ws.send_json({"type": "message", "text": "안녕"})
                            data = ws.receive_json()
                            assert data["type"] == "ai_message_chunk"


@pytest.mark.asyncio
async def test_websocket_audio_then_finish(client, seed_user):
    """Audio flow followed by finish produces diary."""
    mock_ai = _make_mock_ai()
    mock_ai.get_reply_streaming = _make_streaming_reply("좋았겠다!")
    mock_ai.generate_diary = AsyncMock(return_value={
        "original_text": "오늘 회사에서 회의했다.",
        "translated_text": "I had a meeting at work today.",
    })
    mock_ai.extract_learning_points = AsyncMock(return_value=[])

    mock_stt = _make_mock_stt("회사에서 회의했어")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            with patch("app.api.v1.conversation.TTSService") as MockTTS:
                MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3-tts")
                from tests.conftest import TestSession
                with patch("app.api.v1.conversation.async_session", TestSession):
                    from starlette.testclient import TestClient
                    with TestClient(app) as tc:
                        with tc.websocket_connect("/ws/conversation") as ws:
                            # Consume init messages
                            ws.receive_json()  # session_created
                            ws.receive_json()  # ai_message
                            ws.receive_json()  # tts_audio

                            # Audio flow
                            ws.send_json({"type": "audio_start"})
                            ws.send_bytes(b"\x00\x01")
                            ws.send_json({"type": "audio_end"})

                            stt_final = ws.receive_json()
                            assert stt_final["type"] == "stt_final"

                            ai_chunk = ws.receive_json()
                            assert ai_chunk["type"] == "ai_message_chunk"

                            final_marker = ws.receive_json()
                            assert final_marker["type"] == "ai_message_chunk"
                            assert final_marker["is_final"] is True

                            ai_done = ws.receive_json()
                            assert ai_done["type"] == "ai_done"

                            tts_msg = ws.receive_json()
                            assert tts_msg["type"] == "tts_audio"

                            # Now finish
                            ws.send_json({"type": "finish"})
                            data = ws.receive_json()
                            assert data["type"] == "diary_created"
                            assert data["diary"]["translated_text"] == "I had a meeting at work today."
