"""Tests for TTS service — mock all external API calls."""

import asyncio
import base64
import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.tts_service import (
    TTSError,
    TTSService,
    TTSStreamSession,
    _generate_elevenlabs_tts,
    _generate_openai_tts,
    _save_audio_file,
    _text_hash,
)


class TestTextHash:
    def test_deterministic(self):
        h1 = _text_hash("hello", "voice1")
        h2 = _text_hash("hello", "voice1")
        assert h1 == h2

    def test_different_text(self):
        h1 = _text_hash("hello", "voice1")
        h2 = _text_hash("world", "voice1")
        assert h1 != h2

    def test_different_voice(self):
        h1 = _text_hash("hello", "voice1")
        h2 = _text_hash("hello", "voice2")
        assert h1 != h2

    def test_sha256_length(self):
        h = _text_hash("test", "v")
        assert len(h) == 64


class TestSaveAudioFile:
    def test_saves_to_disk(self, tmp_path):
        with patch("app.services.tts_service.AUDIO_DIR", tmp_path):
            url = _save_audio_file(b"fake audio data")
            assert url.startswith("/audio/")
            assert url.endswith(".mp3")
            # Verify file exists
            filename = url.split("/")[-1]
            assert (tmp_path / filename).exists()
            assert (tmp_path / filename).read_bytes() == b"fake audio data"


class TestGenerateElevenLabsTTS:
    @pytest.mark.asyncio
    async def test_success(self):
        import httpx
        mock_response = httpx.Response(200, content=b"mp3 bytes")
        with patch("app.services.tts_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = mock_client

            result = await _generate_elevenlabs_tts("hello", "voice123", "api-key")
            assert result == b"mp3 bytes"

    @pytest.mark.asyncio
    async def test_failure(self):
        import httpx
        mock_response = httpx.Response(500, content=b"error")
        with patch("app.services.tts_service.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = mock_client

            with pytest.raises(TTSError, match="HTTP 500"):
                await _generate_elevenlabs_tts("hello", "voice123", "api-key")


class TestGenerateOpenAITTS:
    @pytest.mark.asyncio
    async def test_success(self):
        mock_response = MagicMock()
        mock_response.content = b"openai mp3 bytes"

        mock_speech = AsyncMock()
        mock_speech.create = AsyncMock(return_value=mock_response)

        mock_audio = MagicMock()
        mock_audio.speech = mock_speech

        mock_client = MagicMock()
        mock_client.audio = mock_audio

        with patch("app.services.tts_service.AsyncOpenAI", return_value=mock_client):
            result = await _generate_openai_tts("hello")
            assert result == b"openai mp3 bytes"


class TestTTSService:
    @pytest.mark.asyncio
    async def test_returns_cached_result(self):
        mock_db = AsyncMock()
        service = TTSService(mock_db)

        cached_entry = MagicMock()
        cached_entry.audio_url = "/audio/cached.mp3"
        cached_entry.text = "hello"
        cached_entry.duration_ms = 1500

        service.cache_repo.get_by_hash = AsyncMock(return_value=cached_entry)

        result = await service.generate("hello")
        assert result["cached"] is True
        assert result["audio_url"] == "/audio/cached.mp3"

    @pytest.mark.asyncio
    async def test_generates_and_caches(self, tmp_path):
        mock_db = AsyncMock()
        service = TTSService(mock_db)

        # No cache
        service.cache_repo.get_by_hash = AsyncMock(return_value=None)

        # Mock cache creation
        cache_entry = MagicMock()
        cache_entry.audio_url = "/audio/new.mp3"
        cache_entry.text = "hello"
        cache_entry.duration_ms = None
        service.cache_repo.create = AsyncMock(return_value=cache_entry)

        # Reset circuit breakers for test isolation
        from app.services import tts_service
        tts_service._elevenlabs_cb.reset()
        tts_service._openai_tts_cb.reset()

        with patch("app.services.tts_service.AUDIO_DIR", tmp_path):
            with patch(
                "app.services.tts_service._generate_elevenlabs_tts",
                new_callable=AsyncMock,
                return_value=b"audio bytes",
            ):
                result = await service.generate("hello")

        assert result["cached"] is False
        assert result["audio_url"] == "/audio/new.mp3"
        service.cache_repo.create.assert_awaited_once()
        mock_db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_falls_back_to_openai(self, tmp_path):
        mock_db = AsyncMock()
        service = TTSService(mock_db)
        service.cache_repo.get_by_hash = AsyncMock(return_value=None)

        cache_entry = MagicMock()
        cache_entry.audio_url = "/audio/fallback.mp3"
        cache_entry.text = "hello"
        cache_entry.duration_ms = None
        service.cache_repo.create = AsyncMock(return_value=cache_entry)

        # Reset circuit breakers for test isolation
        from app.services import tts_service
        tts_service._elevenlabs_cb.reset()
        tts_service._openai_tts_cb.reset()

        with patch("app.services.tts_service.AUDIO_DIR", tmp_path):
            with patch(
                "app.services.tts_service._generate_elevenlabs_tts",
                new_callable=AsyncMock,
                side_effect=TTSError("ElevenLabs down"),
            ):
                with patch(
                    "app.services.tts_service._generate_openai_tts",
                    new_callable=AsyncMock,
                    return_value=b"openai audio",
                ):
                    result = await service.generate("hello")

        assert result["audio_url"] == "/audio/fallback.mp3"

    @pytest.mark.asyncio
    async def test_all_providers_fail(self, tmp_path):
        mock_db = AsyncMock()
        service = TTSService(mock_db)
        service.cache_repo.get_by_hash = AsyncMock(return_value=None)

        from app.services import tts_service
        tts_service._elevenlabs_cb.reset()
        tts_service._openai_tts_cb.reset()

        with patch("app.services.tts_service.AUDIO_DIR", tmp_path):
            with patch(
                "app.services.tts_service._generate_elevenlabs_tts",
                new_callable=AsyncMock,
                side_effect=TTSError("ElevenLabs down"),
            ):
                with patch(
                    "app.services.tts_service._generate_openai_tts",
                    new_callable=AsyncMock,
                    side_effect=Exception("OpenAI down"),
                ):
                    with pytest.raises(TTSError, match="모든 프로바이더"):
                        await service.generate("hello")


# --- Helper: build a mock WebSocket for TTSStreamSession ---

class _MockTTSWebSocket:
    """Mock websockets.WebSocketClientProtocol for TTS streaming tests."""

    def __init__(self, messages=None):
        self.messages = messages or []
        self.sent = []
        self._closed = False

    async def send(self, data):
        self.sent.append(data)

    async def close(self):
        self._closed = True

    def __aiter__(self):
        return self._aiter_impl()

    async def _aiter_impl(self):
        for msg in self.messages:
            yield json.dumps(msg)


def _make_mock_ws(messages=None):
    """Create a mock WebSocket for TTSStreamSession tests.

    Args:
        messages: list of JSON-serializable dicts to yield from async iteration.
    """
    return _MockTTSWebSocket(messages)


class TestTTSStreamSessionConnect:
    @pytest.mark.asyncio
    async def test_connect_success(self):
        mock_ws = _make_mock_ws()

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            await session.connect(voice_id="voice123")

            assert session._connected is True
            # Should have sent initialization message
            assert len(mock_ws.sent) == 1
            init_msg = json.loads(mock_ws.sent[0])
            assert init_msg["text"] == " "
            assert "voice_settings" in init_msg
            assert "generation_config" in init_msg
            assert init_msg["voice_settings"]["stability"] == 0.5
            assert init_msg["generation_config"]["chunk_length_schedule"] == [50, 120, 200, 260]

    @pytest.mark.asyncio
    async def test_connect_failure(self):
        with patch(
            "app.services.tts_service.websockets.connect",
            new_callable=AsyncMock,
            side_effect=Exception("Connection refused"),
        ):
            session = TTSStreamSession(api_key="test-key")
            with pytest.raises(TTSError, match="연결 실패"):
                await session.connect()

    @pytest.mark.asyncio
    async def test_connect_init_message_failure(self):
        class _FailSendWS(_MockTTSWebSocket):
            async def send(self, data):
                raise Exception("Send failed")

        mock_ws = _FailSendWS()

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            with pytest.raises(TTSError, match="초기화 실패"):
                await session.connect()
            # Should have tried to close the WS
            assert mock_ws._closed is True


class TestTTSStreamSessionSendSentence:
    @pytest.mark.asyncio
    async def test_send_sentence(self):
        mock_ws = _make_mock_ws()

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            await session.connect()

            # sent[0] is the init message
            await session.send_sentence("안녕하세요.")

            assert len(mock_ws.sent) == 2  # init + sentence
            sent_msg = json.loads(mock_ws.sent[1])
            assert sent_msg["text"] == "안녕하세요. "
            assert sent_msg["flush"] is True

    @pytest.mark.asyncio
    async def test_send_sentence_not_connected(self):
        session = TTSStreamSession(api_key="test-key")
        with pytest.raises(TTSError, match="연결되지 않았습니다"):
            await session.send_sentence("test")

    @pytest.mark.asyncio
    async def test_send_sentence_ws_error(self):
        mock_ws = _make_mock_ws()

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            await session.connect()

            # Replace send with a failing version
            async def _fail_send(data):
                raise Exception("WS broken")
            session._ws.send = _fail_send

            with pytest.raises(TTSError, match="전송 실패"):
                await session.send_sentence("test")


class TestTTSStreamSessionReceiveAudio:
    @pytest.mark.asyncio
    async def test_receive_audio_chunks(self):
        audio_data = base64.b64encode(b"fake audio chunk 1").decode("ascii")
        audio_data2 = base64.b64encode(b"fake audio chunk 2").decode("ascii")

        messages = [
            {"audio": audio_data},
            {"audio": audio_data2},
            {"isFinal": True},
        ]
        mock_ws = _make_mock_ws(messages)

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            await session.connect()

            chunks = []
            async for chunk in session.receive_audio_chunks():
                chunks.append(chunk)

            assert len(chunks) == 2
            assert chunks[0] == b"fake audio chunk 1"
            assert chunks[1] == b"fake audio chunk 2"

    @pytest.mark.asyncio
    async def test_receive_skips_empty_audio(self):
        messages = [
            {"normalizedAlignment": {"chars": ["a"]}},  # no audio field
            {"audio": ""},  # empty audio
            {"audio": base64.b64encode(b"real data").decode("ascii")},
            {"isFinal": True},
        ]
        mock_ws = _make_mock_ws(messages)

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            await session.connect()

            chunks = []
            async for chunk in session.receive_audio_chunks():
                chunks.append(chunk)

            assert len(chunks) == 1
            assert chunks[0] == b"real data"

    @pytest.mark.asyncio
    async def test_receive_not_connected(self):
        session = TTSStreamSession(api_key="test-key")
        chunks = []
        async for chunk in session.receive_audio_chunks():
            chunks.append(chunk)
        assert chunks == []


class TestTTSStreamSessionClose:
    @pytest.mark.asyncio
    async def test_close_sends_eos(self):
        mock_ws = _make_mock_ws()

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            await session.connect()

            pre_close_sent_count = len(mock_ws.sent)
            await session.close()

            # Should have sent EOS (empty text)
            assert len(mock_ws.sent) == pre_close_sent_count + 1
            eos_msg = json.loads(mock_ws.sent[-1])
            assert eos_msg == {"text": ""}
            assert mock_ws._closed is True
            assert session._connected is False

    @pytest.mark.asyncio
    async def test_close_idempotent(self):
        mock_ws = _make_mock_ws()

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            await session.connect()

            await session.close()
            sent_after_first_close = len(mock_ws.sent)

            # Second close should be a no-op
            await session.close()
            assert len(mock_ws.sent) == sent_after_first_close

    @pytest.mark.asyncio
    async def test_close_without_connect(self):
        session = TTSStreamSession(api_key="test-key")
        # Should not raise
        await session.close()
        assert session._closed is True


class TestTTSStreamSessionIntegration:
    @pytest.mark.asyncio
    async def test_full_session_lifecycle(self):
        """Test complete flow: connect → send sentences → receive chunks → close."""
        chunk1 = base64.b64encode(b"audio for sentence 1").decode("ascii")
        chunk2 = base64.b64encode(b"audio for sentence 2").decode("ascii")

        messages = [
            {"audio": chunk1},
            {"audio": chunk2},
            {"isFinal": True},
        ]
        mock_ws = _make_mock_ws(messages)

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = TTSStreamSession(api_key="test-key")
            await session.connect(voice_id="test-voice")

            # Send two sentences
            await session.send_sentence("첫 번째 문장.")
            await session.send_sentence("두 번째 문장.")

            # Collect audio chunks
            received = []
            async for chunk in session.receive_audio_chunks():
                received.append(chunk)

            assert len(received) == 2
            assert received[0] == b"audio for sentence 1"
            assert received[1] == b"audio for sentence 2"

            await session.close()
            assert session._connected is False
            assert session._closed is True

    @pytest.mark.asyncio
    async def test_uses_default_api_key(self):
        mock_ws = _make_mock_ws()

        with patch("app.services.tts_service.settings") as mock_settings:
            mock_settings.ELEVENLABS_API_KEY = "default-key-from-settings"
            with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws) as mock_connect:
                session = TTSStreamSession()
                await session.connect()

                # Verify the API key was used in the headers
                call_kwargs = mock_connect.call_args
                headers = call_kwargs[1]["additional_headers"]
                assert headers["xi-api-key"] == "default-key-from-settings"

    @pytest.mark.asyncio
    async def test_connect_url_format(self):
        mock_ws = _make_mock_ws()

        with patch("app.services.tts_service.websockets.connect", new_callable=AsyncMock, return_value=mock_ws) as mock_connect:
            session = TTSStreamSession(api_key="test-key")
            await session.connect(voice_id="my_voice", model_id="eleven_turbo_v2_5", output_format="pcm_16000")

            call_args = mock_connect.call_args
            url = call_args[0][0]
            assert "my_voice/stream-input" in url
            assert "model_id=eleven_turbo_v2_5" in url
            assert "output_format=pcm_16000" in url
            assert "language_code=ko" in url
