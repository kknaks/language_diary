"""API integration tests for speech endpoints (TTS + pronunciation evaluation)."""

import struct
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.learning import LearningCard


def _make_wav(sample_rate=16000, bits_per_sample=16, num_channels=1, data_size=3200):
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    chunk_size = 36 + data_size
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", chunk_size, b"WAVE", b"fmt ", 16,
        1, num_channels, sample_rate, byte_rate, block_align, bits_per_sample,
        b"data", data_size,
    )
    return header + (b"\x00" * data_size)


# GPT-4o parsed response (what _call_gpt4o_pronunciation returns)
SAMPLE_GPT4O_RESULT = {
    "overall_score": 85.0,
    "accuracy_score": 88.0,
    "fluency_score": 82.0,
    "completeness_score": 85.0,
    "feedback": "전반적으로 좋은 발음입니다.",
    "word_scores": [
        {"word": "hello", "score": 90.0, "error_type": None},
        {"word": "world", "score": 72.0, "error_type": "Mispronunciation"},
    ],
}


class TestTTSEndpoint:
    @pytest.mark.asyncio
    async def test_tts_success(self, client, tmp_path):
        with patch("app.services.tts_service.AUDIO_DIR", tmp_path):
            # Reset circuit breakers
            from app.services import tts_service
            tts_service._elevenlabs_cb.reset()
            tts_service._openai_tts_cb.reset()

            with patch(
                "app.services.tts_service._generate_elevenlabs_tts",
                new_callable=AsyncMock,
                return_value=b"mp3 audio bytes",
            ):
                response = await client.post(
                    "/api/v1/speech/tts",
                    json={"text": "Hello world"},
                )

        assert response.status_code == 200
        data = response.json()
        assert "audio_url" in data
        assert data["text"] == "Hello world"
        assert data["cached"] is False

    @pytest.mark.asyncio
    async def test_tts_cached(self, client, tmp_path):
        with patch("app.services.tts_service.AUDIO_DIR", tmp_path):
            from app.services import tts_service
            tts_service._elevenlabs_cb.reset()

            with patch(
                "app.services.tts_service._generate_elevenlabs_tts",
                new_callable=AsyncMock,
                return_value=b"mp3 audio bytes",
            ):
                # First call — generates
                r1 = await client.post(
                    "/api/v1/speech/tts",
                    json={"text": "cache me"},
                )
                assert r1.status_code == 200
                assert r1.json()["cached"] is False

                # Second call — should be cached
                r2 = await client.post(
                    "/api/v1/speech/tts",
                    json={"text": "cache me"},
                )
                assert r2.status_code == 200
                assert r2.json()["cached"] is True

    @pytest.mark.asyncio
    async def test_tts_empty_text(self, client):
        response = await client.post(
            "/api/v1/speech/tts",
            json={"text": ""},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_tts_fallback_on_failure(self, client, tmp_path):
        from app.services import tts_service
        from app.services.tts_service import TTSError
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
                    return_value=b"openai mp3",
                ):
                    response = await client.post(
                        "/api/v1/speech/tts",
                        json={"text": "fallback test"},
                    )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_tts_all_fail(self, client, tmp_path):
        from app.services import tts_service
        from app.services.tts_service import TTSError
        tts_service._elevenlabs_cb.reset()
        tts_service._openai_tts_cb.reset()

        with patch("app.services.tts_service.AUDIO_DIR", tmp_path):
            with patch(
                "app.services.tts_service._generate_elevenlabs_tts",
                new_callable=AsyncMock,
                side_effect=TTSError("down"),
            ):
                with patch(
                    "app.services.tts_service._generate_openai_tts",
                    new_callable=AsyncMock,
                    side_effect=Exception("also down"),
                ):
                    response = await client.post(
                        "/api/v1/speech/tts",
                        json={"text": "fail test"},
                    )

        assert response.status_code == 502
        assert response.json()["error"]["code"] == "TTS_FAILED"


class TestEvaluateEndpoint:
    @pytest.mark.asyncio
    async def test_evaluate_success(self, client, seed_diary, tmp_path):
        from app.services import pronunciation_service
        pronunciation_service._azure_cb.reset()

        wav_data = _make_wav()

        with patch("app.services.pronunciation_service.UPLOAD_DIR", tmp_path):
            with patch(
                "app.services.pronunciation_service._call_gpt4o_pronunciation",
                new_callable=AsyncMock,
                return_value=SAMPLE_GPT4O_RESULT,
            ):
                response = await client.post(
                    "/api/v1/speech/evaluate",
                    data={
                        "card_id": "1",
                        "reference_text": "hello world",
                    },
                    files={"audio": ("test.wav", wav_data, "audio/wav")},
                )

        assert response.status_code == 200
        data = response.json()
        assert data["overall_score"] == 85.0
        assert data["accuracy_score"] == 88.0
        assert data["fluency_score"] == 82.0
        assert data["completeness_score"] == 85.0
        assert data["attempt_number"] == 1
        assert len(data["word_scores"]) == 2

    @pytest.mark.asyncio
    async def test_evaluate_card_not_found(self, client, seed_user):
        wav_data = _make_wav()
        response = await client.post(
            "/api/v1/speech/evaluate",
            data={
                "card_id": "999",
                "reference_text": "hello",
            },
            files={"audio": ("test.wav", wav_data, "audio/wav")},
        )
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "CARD_NOT_FOUND"

    @pytest.mark.asyncio
    async def test_evaluate_invalid_wav(self, client, seed_diary):
        response = await client.post(
            "/api/v1/speech/evaluate",
            data={
                "card_id": "1",
                "reference_text": "hello",
            },
            files={"audio": ("test.wav", b"not a wav", "audio/wav")},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    @pytest.mark.asyncio
    async def test_evaluate_empty_audio(self, client, seed_diary):
        response = await client.post(
            "/api/v1/speech/evaluate",
            data={
                "card_id": "1",
                "reference_text": "hello",
            },
            files={"audio": ("test.wav", b"", "audio/wav")},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_evaluate_gpt4o_failure(self, client, seed_diary, tmp_path):
        from app.services import pronunciation_service
        from app.services.pronunciation_service import PronunciationError
        pronunciation_service._azure_cb.reset()

        wav_data = _make_wav()

        with patch("app.services.pronunciation_service.UPLOAD_DIR", tmp_path):
            with patch(
                "app.services.pronunciation_service._call_gpt4o_pronunciation",
                new_callable=AsyncMock,
                side_effect=PronunciationError("GPT-4o down"),
            ):
                response = await client.post(
                    "/api/v1/speech/evaluate",
                    data={
                        "card_id": "1",
                        "reference_text": "hello",
                    },
                    files={"audio": ("test.wav", wav_data, "audio/wav")},
                )

        assert response.status_code == 502
        assert response.json()["error"]["code"] == "EVALUATION_FAILED"

    @pytest.mark.asyncio
    async def test_evaluate_multiple_attempts(self, client, seed_diary, tmp_path):
        from app.services import pronunciation_service
        pronunciation_service._azure_cb.reset()

        wav_data = _make_wav()

        with patch("app.services.pronunciation_service.UPLOAD_DIR", tmp_path):
            with patch(
                "app.services.pronunciation_service._call_gpt4o_pronunciation",
                new_callable=AsyncMock,
                return_value=SAMPLE_GPT4O_RESULT,
            ):
                # First attempt
                r1 = await client.post(
                    "/api/v1/speech/evaluate",
                    data={"card_id": "1", "reference_text": "hello"},
                    files={"audio": ("test.wav", wav_data, "audio/wav")},
                )
                assert r1.status_code == 200
                assert r1.json()["attempt_number"] == 1

                # Second attempt
                r2 = await client.post(
                    "/api/v1/speech/evaluate",
                    data={"card_id": "1", "reference_text": "hello"},
                    files={"audio": ("test.wav", wav_data, "audio/wav")},
                )
                assert r2.status_code == 200
                assert r2.json()["attempt_number"] == 2
