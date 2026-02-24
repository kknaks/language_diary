"""Unit tests for STTService — ElevenLabs STT WebSocket integration."""

import asyncio
import base64
import json
import pytest
from unittest.mock import AsyncMock, call, patch

from app.services.stt_service import (
    STTError,
    STTSession,
    validate_pcm_audio,
    ELEVENLABS_STT_URL,
    ELEVENLABS_STT_MODEL,
)


# ---------------------------------------------------------------------------
# Helper: fake ElevenLabs WebSocket
# ---------------------------------------------------------------------------

class FakeElevenLabsWS:
    """Simulates an ElevenLabs STT WebSocket connection for testing."""

    def __init__(self, messages):
        """
        Args:
            messages: list of JSON strings the fake WS yields.
                      The first one is consumed by recv() (session_started).
                      The rest are yielded by __aiter__ (the listener).
        """
        self._first = messages[0] if messages else None
        self._iter_messages = messages[1:] if len(messages) > 1 else []
        self.sent = []
        self.closed = False

    async def recv(self):
        if self._first is not None:
            msg = self._first
            self._first = None
            return msg
        # Block forever (listener consumes via __aiter__)
        await asyncio.sleep(999)

    async def send(self, data):
        self.sent.append(data)

    async def close(self):
        self.closed = True

    def __aiter__(self):
        return self._async_gen()

    async def _async_gen(self):
        for m in self._iter_messages:
            yield m


# ---------------------------------------------------------------------------
# validate_pcm_audio
# ---------------------------------------------------------------------------

class TestValidatePcmAudio:
    def test_valid_even_bytes(self):
        assert validate_pcm_audio(b"\x00\x01\x02\x03") is True

    def test_valid_two_bytes(self):
        assert validate_pcm_audio(b"\x00\x01") is True

    def test_invalid_odd_bytes(self):
        assert validate_pcm_audio(b"\x00\x01\x02") is False

    def test_empty_audio(self):
        assert validate_pcm_audio(b"") is False

    def test_single_byte(self):
        assert validate_pcm_audio(b"\x00") is False

    def test_large_valid(self):
        assert validate_pcm_audio(b"\x00" * 3200) is True  # 100ms of 16kHz 16-bit


# ---------------------------------------------------------------------------
# STTSession.connect
# ---------------------------------------------------------------------------

class TestSTTSessionConnect:
    @pytest.mark.asyncio
    async def test_connect_success(self):
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started", "session_id": "s1"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            await session.connect()
            assert session._connected is True
            await session.close()

    @pytest.mark.asyncio
    async def test_connect_passes_correct_url_with_vad(self):
        """Default connect uses VAD strategy with VAD params in URL."""
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
        ])
        mock_connect = AsyncMock(return_value=fake_ws)
        with patch("app.services.stt_service.websockets.connect", mock_connect):
            session = STTSession("my-api-key")
            await session.connect(language="ko", sample_rate=16000)

            call_args = mock_connect.call_args
            url = call_args[0][0]
            assert ELEVENLABS_STT_URL in url
            assert f"model_id={ELEVENLABS_STT_MODEL}" in url
            assert "language_code=ko" in url
            assert "sample_rate=16000" in url
            assert "commit_strategy=vad" in url
            assert "vad_silence_threshold_secs=1.5" in url
            assert "vad_threshold=0.4" in url
            assert call_args[1]["additional_headers"]["xi-api-key"] == "my-api-key"
            await session.close()

    @pytest.mark.asyncio
    async def test_connect_custom_vad_params(self):
        """Custom VAD threshold values are reflected in the URL."""
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
        ])
        mock_connect = AsyncMock(return_value=fake_ws)
        with patch("app.services.stt_service.websockets.connect", mock_connect):
            session = STTSession("key")
            await session.connect(
                vad_silence_threshold_secs=2.0,
                vad_threshold=0.6,
            )
            url = mock_connect.call_args[0][0]
            assert "vad_silence_threshold_secs=2.0" in url
            assert "vad_threshold=0.6" in url
            await session.close()

    @pytest.mark.asyncio
    async def test_connect_manual_mode_no_vad_params(self):
        """Manual commit strategy does not include VAD params in URL."""
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
        ])
        mock_connect = AsyncMock(return_value=fake_ws)
        with patch("app.services.stt_service.websockets.connect", mock_connect):
            session = STTSession("key")
            await session.connect(commit_strategy="manual")
            url = mock_connect.call_args[0][0]
            assert "commit_strategy=manual" in url
            assert "vad_silence_threshold_secs" not in url
            assert "vad_threshold" not in url
            await session.close()

    @pytest.mark.asyncio
    async def test_connect_failure_raises_stt_error(self):
        with patch(
            "app.services.stt_service.websockets.connect",
            AsyncMock(side_effect=Exception("Connection refused")),
        ):
            session = STTSession("test-key")
            with pytest.raises(STTError, match="연결 실패"):
                await session.connect()

    @pytest.mark.asyncio
    async def test_connect_unexpected_first_message(self):
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "error", "message": "bad"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            with pytest.raises(STTError, match="예상치 못한"):
                await session.connect()


# ---------------------------------------------------------------------------
# STTSession.send_audio
# ---------------------------------------------------------------------------

class TestSTTSessionSendAudio:
    @pytest.mark.asyncio
    async def test_send_audio_encodes_base64(self):
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            await session.connect()

            audio = b"\x00\x01\x02\x03"
            await session.send_audio(audio)

            assert len(fake_ws.sent) == 1
            sent = json.loads(fake_ws.sent[0])
            assert sent["message_type"] == "input_audio_chunk"
            assert base64.b64decode(sent["audio_base_64"]) == audio
            await session.close()

    @pytest.mark.asyncio
    async def test_send_audio_no_chunking_for_large_data(self):
        """Real-time mode sends the entire chunk as-is, no splitting."""
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            await session.connect()

            # 6400 bytes = 200ms of audio — previously would be split into 2 chunks
            audio = b"\x00" * 6400
            await session.send_audio(audio)

            # Should be sent as a single message (no pacing/splitting)
            assert len(fake_ws.sent) == 1
            sent = json.loads(fake_ws.sent[0])
            assert base64.b64decode(sent["audio_base_64"]) == audio
            assert session._total_chunks_sent == 1
            await session.close()

    @pytest.mark.asyncio
    async def test_send_audio_skips_invalid_pcm(self):
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            await session.connect()

            # Odd number of bytes — invalid PCM
            await session.send_audio(b"\x00\x01\x02")
            assert len(fake_ws.sent) == 0  # Nothing sent
            await session.close()

    @pytest.mark.asyncio
    async def test_send_audio_not_connected(self):
        session = STTSession("test-key")
        with pytest.raises(STTError, match="연결되지 않았습니다"):
            await session.send_audio(b"\x00\x01")


# ---------------------------------------------------------------------------
# STTSession.wait_for_final (VAD mode)
# ---------------------------------------------------------------------------

class TestSTTSessionWaitForFinal:
    @pytest.mark.asyncio
    async def test_wait_for_final_returns_vad_committed_text(self):
        """VAD auto-commits and wait_for_final returns the text."""
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "committed_transcript", "text": "오늘 회의했어"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            await session.connect()

            final = await session.wait_for_final()
            assert final == "오늘 회의했어"

            # No commit message should have been sent (VAD handles it)
            assert len(fake_ws.sent) == 0
            await session.close()

    @pytest.mark.asyncio
    async def test_wait_for_final_not_connected(self):
        session = STTSession("test-key")
        with pytest.raises(STTError, match="연결되지 않았습니다"):
            await session.wait_for_final()

    @pytest.mark.asyncio
    async def test_wait_for_final_error_from_elevenlabs(self):
        """ElevenLabs error during VAD wait raises STTError."""
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "quota_exceeded", "message": "Quota exceeded"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            await session.connect()

            with pytest.raises(STTError, match="Quota exceeded"):
                await session.wait_for_final()
            await session.close()

    @pytest.mark.asyncio
    async def test_wait_for_final_with_interim_before(self):
        """Partial transcripts arrive before VAD commit."""
        mock_client_ws = AsyncMock()
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "partial_transcript", "text": "오늘"}),
            json.dumps({"message_type": "partial_transcript", "text": "오늘 회의"}),
            json.dumps({"message_type": "committed_transcript", "text": "오늘 회의했어"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key", client_ws=mock_client_ws)
            await session.connect()

            final = await session.wait_for_final()
            assert final == "오늘 회의했어"

            # Verify interim + final were sent to client
            calls = mock_client_ws.send_json.call_args_list
            assert call({"type": "stt_interim", "text": "오늘"}) in calls
            assert call({"type": "stt_interim", "text": "오늘 회의"}) in calls
            assert call({"type": "stt_final", "text": "오늘 회의했어"}) in calls
            await session.close()


# ---------------------------------------------------------------------------
# STTSession.commit_and_wait_final (manual mode, kept for backward compat)
# ---------------------------------------------------------------------------

class TestSTTSessionCommit:
    @pytest.mark.asyncio
    async def test_commit_returns_final_text(self):
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "committed_transcript", "text": "안녕하세요"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            await session.connect()

            final = await session.commit_and_wait_final()
            assert final == "안녕하세요"

            # Verify commit message was sent
            commit_msg = json.loads(fake_ws.sent[0])
            assert commit_msg["commit"] is True
            assert commit_msg["audio_base_64"] == ""
            await session.close()

    @pytest.mark.asyncio
    async def test_commit_not_connected(self):
        session = STTSession("test-key")
        with pytest.raises(STTError, match="연결되지 않았습니다"):
            await session.commit_and_wait_final()

    @pytest.mark.asyncio
    async def test_commit_elevenlabs_error(self):
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "auth_error", "message": "Invalid API key"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("bad-key")
            await session.connect()

            with pytest.raises(STTError, match="Invalid API key"):
                await session.commit_and_wait_final()
            await session.close()


# ---------------------------------------------------------------------------
# STTSession.close
# ---------------------------------------------------------------------------

class TestSTTSessionClose:
    @pytest.mark.asyncio
    async def test_close_cleans_up(self):
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key")
            await session.connect()
            assert session._connected is True

            await session.close()
            assert session._connected is False
            assert session._ws is None
            assert session._listener_task is None
            assert fake_ws.closed is True

    @pytest.mark.asyncio
    async def test_close_idempotent(self):
        session = STTSession("test-key")
        await session.close()  # No error when not connected
        await session.close()  # Calling twice is fine


# ---------------------------------------------------------------------------
# STTSession — stt_interim relay (partial_transcript)
# ---------------------------------------------------------------------------

class TestSTTInterimForwarding:
    @pytest.mark.asyncio
    async def test_interim_not_forwarded_without_client_ws(self):
        """No error when client_ws is None and interim arrives."""
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "partial_transcript", "text": "test"}),
            json.dumps({"message_type": "committed_transcript", "text": "test final"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key", client_ws=None)
            await session.connect()

            final = await session.wait_for_final()
            assert final == "test final"
            await session.close()

    @pytest.mark.asyncio
    async def test_empty_interim_not_forwarded(self):
        """Empty partial_transcript text is not forwarded."""
        mock_client_ws = AsyncMock()
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "partial_transcript", "text": ""}),
            json.dumps({"message_type": "committed_transcript", "text": "done"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key", client_ws=mock_client_ws)
            await session.connect()

            await session.wait_for_final()
            # Only stt_final should be sent (no stt_interim for empty text)
            assert mock_client_ws.send_json.call_count == 1
            mock_client_ws.send_json.assert_called_with({
                "type": "stt_final",
                "text": "done",
            })
            await session.close()


# ---------------------------------------------------------------------------
# STTSession — stt_final relay (committed_transcript)
# ---------------------------------------------------------------------------

class TestSTTFinalRelay:
    @pytest.mark.asyncio
    async def test_stt_final_sent_on_committed_transcript(self):
        """committed_transcript sends stt_final to client WebSocket."""
        mock_client_ws = AsyncMock()
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "committed_transcript", "text": "안녕하세요"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key", client_ws=mock_client_ws)
            await session.connect()

            final = await session.wait_for_final()
            assert final == "안녕하세요"

            mock_client_ws.send_json.assert_called_once_with({
                "type": "stt_final",
                "text": "안녕하세요",
            })
            await session.close()

    @pytest.mark.asyncio
    async def test_stt_final_not_sent_without_client_ws(self):
        """No error when client_ws is None and committed_transcript arrives."""
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "committed_transcript", "text": "hello"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key", client_ws=None)
            await session.connect()

            final = await session.wait_for_final()
            assert final == "hello"
            await session.close()

    @pytest.mark.asyncio
    async def test_stt_final_relay_with_interim_sequence(self):
        """Full sequence: stt_interim, stt_interim, stt_final."""
        mock_client_ws = AsyncMock()
        fake_ws = FakeElevenLabsWS([
            json.dumps({"message_type": "session_started"}),
            json.dumps({"message_type": "partial_transcript", "text": "안"}),
            json.dumps({"message_type": "partial_transcript", "text": "안녕"}),
            json.dumps({"message_type": "committed_transcript", "text": "안녕하세요"}),
        ])
        with patch("app.services.stt_service.websockets.connect", AsyncMock(return_value=fake_ws)):
            session = STTSession("test-key", client_ws=mock_client_ws)
            await session.connect()

            final = await session.wait_for_final()
            assert final == "안녕하세요"

            # Verify the complete sequence of messages sent to client
            assert mock_client_ws.send_json.call_count == 3
            calls = mock_client_ws.send_json.call_args_list
            assert calls[0] == call({"type": "stt_interim", "text": "안"})
            assert calls[1] == call({"type": "stt_interim", "text": "안녕"})
            assert calls[2] == call({"type": "stt_final", "text": "안녕하세요"})
            await session.close()
