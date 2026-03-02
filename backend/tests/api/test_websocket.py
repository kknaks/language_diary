"""Tests for WebSocket /ws/conversation (session created on connect)."""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch

from app.main import app
from app.services.stt_service import STTError
from app.utils.jwt import create_access_token


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
    # Combined diary+learning method
    if diary or learning_points is not None:
        combined = dict(diary or {
            "title_original": "",
            "title_translated": "",
            "original_text": "",
            "translated_text": "",
        })
        combined["learning_points"] = learning_points or []
        mock.generate_diary_with_learning = AsyncMock(return_value=combined)
    return mock


def _make_streaming_reply(*sentences):
    """Create an async generator mock for get_reply_streaming."""
    async def _gen(history, **kwargs):
        for s in sentences:
            yield s
    return _gen


def _get_ws_url():
    """Get WS URL with valid auth token."""
    token = create_access_token(1)
    return "/ws/conversation?token=%s" % token


def _make_mock_stt_class(final_text="회사에서 회의했어", connect_error=False):
    """Create a mock STTSession class.
    
    The mock's iter_commits yields final_text once, simulating VAD auto-commit.
    """
    commit_event = asyncio.Event()
    committed_texts = []

    class MockSTTSession:
        def __init__(self, api_key=None, client_ws=None):
            self._connected = False
            self._client_ws = client_ws
            self.connect_calls = 0
            self.send_audio_calls = 0
            self.close_calls = 0
        
        async def connect(self, **kwargs):
            self.connect_calls += 1
            if connect_error:
                raise STTError("ElevenLabs STT 연결 실패")
            self._connected = True
        
        async def send_audio(self, data):
            self.send_audio_calls += 1
            # Simulate VAD auto-commit after receiving audio
            if final_text and not committed_texts:
                committed_texts.append(final_text)
                commit_event.set()
        
        async def iter_commits(self):
            if not self._connected:
                return
            # Wait for audio to trigger a commit
            try:
                await asyncio.wait_for(commit_event.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                return
            for text in committed_texts:
                # Send stt_final to client if client_ws available
                if self._client_ws and text:
                    try:
                        await self._client_ws.send_json({"type": "stt_final", "text": text})
                    except Exception:
                        pass
                yield text
        
        async def close(self):
            self.close_calls += 1
            self._connected = False

    return MockSTTSession


@pytest.mark.asyncio
async def test_websocket_session_created_on_connect(client, seed_user, auth_token):
    """Connecting to WS creates session and sends greeting + TTS."""
    mock_ai = _make_mock_ai()
    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3-greeting")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect(_get_ws_url()) as ws:
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
                        # 4. ai_done (greeting turn complete)
                        data = ws.receive_json()
                        assert data["type"] == "ai_done"


@pytest.mark.asyncio
async def test_websocket_send_message_streaming(client, seed_user, auth_token):
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
                    with tc.websocket_connect(_get_ws_url()) as ws:
                        # Consume init messages
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio
                        ws.receive_json()  # ai_done (greeting)

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

                        # Receive TTS audio (REST fallback sends before ai_done)
                        data = ws.receive_json()
                        assert data["type"] == "tts_audio"
                        assert "audio_data" in data
                        assert data["format"] == "mp3"
                        assert data["index"] == 0

                        # Receive ai_done (after all TTS)
                        data = ws.receive_json()
                        assert data["type"] == "ai_done"


@pytest.mark.asyncio
async def test_websocket_finish_conversation(client, seed_user, auth_token):
    """Send finish message and receive diary_created response."""
    mock_ai = _make_mock_ai()
    mock_ai.generate_diary_with_learning = AsyncMock(return_value={
        "title_original": "팀장님과 회의",
        "title_translated": "Meeting with Team Leader",
        "original_text": "오늘 회사에서 팀장님과 회의를 했다.",
        "translated_text": "I had a meeting with my team leader at work today.",
        "learning_points": [
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
        ],
    })

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect(_get_ws_url()) as ws:
                        # Consume init messages
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio
                        ws.receive_json()  # ai_done (greeting)

                        ws.send_json({"type": "finish"})
                        data = ws.receive_json()
                        assert data["type"] == "diary_created"
                        diary = data["diary"]
                        assert diary["original_text"] == "오늘 회사에서 팀장님과 회의를 했다."
                        assert diary["translated_text"] == "I had a meeting with my team leader at work today."
                        assert diary["status"] == "translated"
                        assert len(diary["learning_cards"]) == 2


@pytest.mark.asyncio
async def test_websocket_invalid_json(client, seed_user, auth_token):
    """Sending invalid JSON returns an error."""
    mock_ai = _make_mock_ai()

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect(_get_ws_url()) as ws:
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio
                        ws.receive_json()  # ai_done (greeting)

                        ws.send_text("not json")
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_websocket_empty_message(client, seed_user, auth_token):
    """Sending empty text returns error."""
    mock_ai = _make_mock_ai()

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect(_get_ws_url()) as ws:
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio
                        ws.receive_json()  # ai_done (greeting)

                        ws.send_json({"type": "message", "text": ""})
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_websocket_unknown_type(client, seed_user, auth_token):
    """Sending unknown message type returns error."""
    mock_ai = _make_mock_ai()

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.TTSService") as MockTTS:
            MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3")
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                from starlette.testclient import TestClient
                with TestClient(app) as tc:
                    with tc.websocket_connect(_get_ws_url()) as ws:
                        ws.receive_json()  # session_created
                        ws.receive_json()  # ai_message
                        ws.receive_json()  # tts_audio
                        ws.receive_json()  # ai_done (greeting)

                        ws.send_json({"type": "unknown_type"})
                        data = ws.receive_json()
                        assert data["type"] == "error"
                        assert data["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# Audio streaming (STT) tests — now via VAD auto-commit protocol
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_websocket_stt_connect_error(client, seed_user, auth_token):
    """STT connection failure sends error but keeps text messaging alive."""
    MockSTTClass = _make_mock_stt_class(connect_error=True)
    mock_ai = _make_mock_ai()
    mock_ai.get_reply_streaming = _make_streaming_reply("어떤 회의였어?")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", MockSTTClass):
            with patch("app.api.v1.conversation.TTSService") as MockTTS:
                MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3-tts")
                from tests.conftest import TestSession
                with patch("app.api.v1.conversation.async_session", TestSession):
                    from starlette.testclient import TestClient
                    with TestClient(app) as tc:
                        with tc.websocket_connect(_get_ws_url()) as ws:
                            ws.receive_json()  # session_created
                            ws.receive_json()  # ai_message
                            ws.receive_json()  # tts_audio
                            ws.receive_json()  # ai_done (greeting)

                            # STT connection error is sent after greeting
                            data = ws.receive_json()
                            assert data["type"] == "error"
                            assert data["code"] == "STT_FAILED"

                            # WebSocket still alive — text messaging works
                            ws.send_json({"type": "message", "text": "타이핑으로 입력"})
                            data = ws.receive_json()
                            assert data["type"] == "ai_message_chunk"


@pytest.mark.asyncio
async def test_websocket_binary_without_stt_session(client, seed_user, auth_token):
    """Sending binary data when STT failed is silently ignored."""
    MockSTTClass = _make_mock_stt_class(connect_error=True)
    mock_ai = _make_mock_ai()
    mock_ai.get_reply_streaming = _make_streaming_reply("응!")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", MockSTTClass):
            with patch("app.api.v1.conversation.TTSService") as MockTTS:
                MockTTS.return_value.generate_bytes = AsyncMock(return_value=b"fake-mp3-bytes")
                from tests.conftest import TestSession
                with patch("app.api.v1.conversation.async_session", TestSession):
                    from starlette.testclient import TestClient
                    with TestClient(app) as tc:
                        with tc.websocket_connect(_get_ws_url()) as ws:
                            ws.receive_json()  # session_created
                            ws.receive_json()  # ai_message
                            ws.receive_json()  # tts_audio
                            ws.receive_json()  # ai_done (greeting)
                            ws.receive_json()  # STT_FAILED error

                            # Binary without active STT → silently ignored
                            ws.send_bytes(b"\x00\x01\x02\x03")

                            # Should still be able to send text messages
                            ws.send_json({"type": "message", "text": "안녕"})
                            data = ws.receive_json()
                            assert data["type"] == "ai_message_chunk"
