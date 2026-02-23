"""Tests for TTS service — mock all external API calls."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from decimal import Decimal

from app.services.tts_service import (
    TTSError,
    TTSService,
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
