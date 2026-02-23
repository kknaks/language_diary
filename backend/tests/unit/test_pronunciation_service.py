"""Tests for pronunciation evaluation service — mock all external API calls."""

import struct
import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.pronunciation_service import (
    PronunciationError,
    PronunciationService,
    _generate_feedback,
    parse_azure_response,
)
from app.utils.audio import AudioValidationError


def _make_wav_header(
    sample_rate=16000, bits_per_sample=16, num_channels=1, data_size=3200
) -> bytes:
    """Build a minimal valid WAV header + fake audio data."""
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    chunk_size = 36 + data_size

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        chunk_size,
        b"WAVE",
        b"fmt ",
        16,  # subchunk1 size (PCM)
        1,   # audio format (PCM)
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + (b"\x00" * data_size)


SAMPLE_AZURE_RESPONSE = {
    "RecognitionStatus": "Success",
    "NBest": [
        {
            "Confidence": 0.95,
            "Lexical": "i had a meeting at work today",
            "PronunciationAssessment": {
                "AccuracyScore": 88.0,
                "FluencyScore": 82.0,
                "CompletenessScore": 85.0,
                "PronScore": 85.0,
            },
            "Words": [
                {
                    "Word": "i",
                    "PronunciationAssessment": {
                        "AccuracyScore": 95.0,
                        "ErrorType": "None",
                    },
                },
                {
                    "Word": "meeting",
                    "PronunciationAssessment": {
                        "AccuracyScore": 72.0,
                        "ErrorType": "Mispronunciation",
                    },
                },
            ],
        }
    ],
}


class TestParseAzureResponse:
    def test_parses_scores(self):
        result = parse_azure_response(SAMPLE_AZURE_RESPONSE)
        assert result["overall_score"] == 85.0
        assert result["accuracy_score"] == 88.0
        assert result["fluency_score"] == 82.0
        assert result["completeness_score"] == 85.0

    def test_parses_word_scores(self):
        result = parse_azure_response(SAMPLE_AZURE_RESPONSE)
        assert len(result["word_scores"]) == 2
        assert result["word_scores"][0]["word"] == "i"
        assert result["word_scores"][0]["error_type"] is None
        assert result["word_scores"][1]["word"] == "meeting"
        assert result["word_scores"][1]["error_type"] == "Mispronunciation"

    def test_generates_feedback(self):
        result = parse_azure_response(SAMPLE_AZURE_RESPONSE)
        assert "Good pronunciation" in result["feedback"]
        assert "meeting" in result["feedback"]

    def test_empty_nbest(self):
        with pytest.raises(PronunciationError, match="결과가 없습니다"):
            parse_azure_response({"NBest": []})

    def test_missing_nbest(self):
        with pytest.raises(PronunciationError, match="결과가 없습니다"):
            parse_azure_response({})


class TestGenerateFeedback:
    def test_good_scores(self):
        feedback = _generate_feedback(90, 85, 90, [])
        assert "Good pronunciation" in feedback

    def test_decent_scores(self):
        feedback = _generate_feedback(65, 50, 70, [])
        assert "Decent" in feedback

    def test_poor_scores(self):
        feedback = _generate_feedback(40, 30, 50, [])
        assert "needs more practice" in feedback

    def test_problem_words(self):
        words = [
            {"word": "hello", "error_type": "Mispronunciation"},
            {"word": "world", "error_type": "Omission"},
        ]
        feedback = _generate_feedback(90, 85, 90, words)
        assert "hello" in feedback
        assert "world" in feedback


class TestPronunciationService:
    @pytest.mark.asyncio
    async def test_evaluate_success(self, tmp_path):
        mock_db = AsyncMock()
        service = PronunciationService(mock_db)

        # Mock repository
        service.repo.get_next_attempt_number = AsyncMock(return_value=1)
        mock_result = MagicMock()
        mock_result.id = 1
        mock_result.card_id = 10
        mock_result.overall_score = Decimal("85.00")
        mock_result.accuracy_score = Decimal("88.00")
        mock_result.fluency_score = Decimal("82.00")
        mock_result.completeness_score = Decimal("85.00")
        mock_result.feedback = "Good pronunciation overall."
        mock_result.attempt_number = 1
        mock_result.created_at = "2026-02-24T12:00:00"
        service.repo.create = AsyncMock(return_value=mock_result)

        wav_data = _make_wav_header()

        from app.services import pronunciation_service
        pronunciation_service._azure_cb.reset()

        with patch("app.services.pronunciation_service.UPLOAD_DIR", tmp_path):
            with patch(
                "app.services.pronunciation_service._call_azure_pronunciation",
                new_callable=AsyncMock,
                return_value=SAMPLE_AZURE_RESPONSE,
            ):
                result = await service.evaluate(
                    card_id=10,
                    user_id=1,
                    audio_data=wav_data,
                    reference_text="I had a meeting at work today",
                )

        assert result["id"] == 1
        assert result["overall_score"] == 85.0
        assert result["attempt_number"] == 1
        service.repo.create.assert_awaited_once()
        mock_db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_evaluate_invalid_wav(self):
        mock_db = AsyncMock()
        service = PronunciationService(mock_db)

        with pytest.raises(AudioValidationError):
            await service.evaluate(
                card_id=10,
                user_id=1,
                audio_data=b"not a wav file",
                reference_text="hello",
            )

    @pytest.mark.asyncio
    async def test_evaluate_azure_failure(self, tmp_path):
        mock_db = AsyncMock()
        service = PronunciationService(mock_db)

        wav_data = _make_wav_header()

        from app.services import pronunciation_service
        pronunciation_service._azure_cb.reset()

        with patch("app.services.pronunciation_service.UPLOAD_DIR", tmp_path):
            with patch(
                "app.services.pronunciation_service._call_azure_pronunciation",
                new_callable=AsyncMock,
                side_effect=PronunciationError("Azure down"),
            ):
                with pytest.raises(PronunciationError, match="발음 평가 실패"):
                    await service.evaluate(
                        card_id=10,
                        user_id=1,
                        audio_data=wav_data,
                        reference_text="hello",
                    )

    @pytest.mark.asyncio
    async def test_attempt_number_increments(self, tmp_path):
        mock_db = AsyncMock()
        service = PronunciationService(mock_db)

        # Second attempt
        service.repo.get_next_attempt_number = AsyncMock(return_value=2)

        mock_result = MagicMock()
        mock_result.id = 2
        mock_result.card_id = 10
        mock_result.overall_score = Decimal("90.00")
        mock_result.accuracy_score = Decimal("92.00")
        mock_result.fluency_score = Decimal("88.00")
        mock_result.completeness_score = Decimal("90.00")
        mock_result.feedback = "Good pronunciation."
        mock_result.attempt_number = 2
        mock_result.created_at = "2026-02-24T12:00:00"
        service.repo.create = AsyncMock(return_value=mock_result)

        wav_data = _make_wav_header()

        from app.services import pronunciation_service
        pronunciation_service._azure_cb.reset()

        with patch("app.services.pronunciation_service.UPLOAD_DIR", tmp_path):
            with patch(
                "app.services.pronunciation_service._call_azure_pronunciation",
                new_callable=AsyncMock,
                return_value=SAMPLE_AZURE_RESPONSE,
            ):
                result = await service.evaluate(
                    card_id=10,
                    user_id=1,
                    audio_data=wav_data,
                    reference_text="hello",
                )

        assert result["attempt_number"] == 2
