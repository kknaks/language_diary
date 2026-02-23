"""Pronunciation Service — Azure Speech SDK REST API integration for pronunciation evaluation."""

import json
import logging
import os
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional

import httpx

from app.config import settings
from app.utils.audio import AudioValidationError, validate_wav_upload
from app.utils.circuit_breaker import CircuitBreaker, CircuitBreakerError, retry_with_backoff

logger = logging.getLogger(__name__)

# Audio upload storage
UPLOAD_DIR = Path("audio_uploads")

# Azure Speech pronunciation assessment config
AZURE_STT_URL_TEMPLATE = (
    "https://{region}.stt.speech.microsoft.com"
    "/speech/recognition/conversation/cognitiveservices/v1"
    "?language=en-US"
)

_azure_cb = CircuitBreaker(name="azure_pronunciation", failure_threshold=3, recovery_timeout=30.0)


class PronunciationError(Exception):
    """Raised when pronunciation evaluation fails."""
    pass


def _ensure_upload_dir() -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


def _save_upload(data: bytes) -> str:
    """Save uploaded WAV to disk and return the relative URL path."""
    _ensure_upload_dir()
    filename = f"{uuid.uuid4().hex}.wav"
    filepath = UPLOAD_DIR / filename
    filepath.write_bytes(data)
    return f"/uploads/{filename}"


def _build_pronunciation_params(reference_text: str) -> str:
    """Build Azure pronunciation assessment parameters (Base64-less JSON header)."""
    params = {
        "ReferenceText": reference_text,
        "GradingSystem": "HundredMark",
        "Granularity": "Word",
        "Dimension": "Comprehensive",
        "EnableMiscue": True,
    }
    return json.dumps(params)


def parse_azure_response(response_json: dict) -> dict:
    """Parse Azure pronunciation assessment response into our schema.

    Returns:
        dict with: overall_score, accuracy_score, fluency_score,
                   completeness_score, feedback, word_scores
    """
    nbest = response_json.get("NBest", [])
    if not nbest:
        raise PronunciationError("Azure 응답에 발음 평가 결과가 없습니다.")

    best = nbest[0]
    pron_assessment = best.get("PronunciationAssessment", {})

    accuracy = pron_assessment.get("AccuracyScore", 0)
    fluency = pron_assessment.get("FluencyScore", 0)
    completeness = pron_assessment.get("CompletenessScore", 0)
    overall = pron_assessment.get("PronScore", 0)

    # Parse word-level scores
    word_scores = []
    for word_info in best.get("Words", []):
        w_assessment = word_info.get("PronunciationAssessment", {})
        error_type = w_assessment.get("ErrorType", "None")
        word_scores.append({
            "word": word_info.get("Word", ""),
            "score": w_assessment.get("AccuracyScore", 0),
            "error_type": error_type if error_type != "None" else None,
        })

    # Generate feedback
    feedback = _generate_feedback(accuracy, fluency, completeness, word_scores)

    return {
        "overall_score": overall,
        "accuracy_score": accuracy,
        "fluency_score": fluency,
        "completeness_score": completeness,
        "feedback": feedback,
        "word_scores": word_scores,
    }


def _generate_feedback(
    accuracy: float,
    fluency: float,
    completeness: float,
    word_scores: List[dict],
) -> str:
    """Generate human-readable feedback from pronunciation scores."""
    parts = []

    if accuracy >= 80 and fluency >= 80:
        parts.append("Good pronunciation overall.")
    elif accuracy >= 60:
        parts.append("Decent pronunciation with some areas to improve.")
    else:
        parts.append("Pronunciation needs more practice.")

    # Highlight problem words
    problem_words = [w for w in word_scores if w.get("error_type")]
    if problem_words:
        words_str = ", ".join(f"'{w['word']}'" for w in problem_words[:3])
        parts.append(f"Pay attention to: {words_str}.")

    return " ".join(parts)


async def _call_azure_pronunciation(
    audio_data: bytes,
    reference_text: str,
    api_key: str,
    region: str,
) -> dict:
    """Call Azure Speech pronunciation assessment REST API."""
    url = AZURE_STT_URL_TEMPLATE.format(region=region)
    headers = {
        "Ocp-Apim-Subscription-Key": api_key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": _build_pronunciation_params(reference_text),
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, content=audio_data, headers=headers)
        if response.status_code != 200:
            raise PronunciationError(
                f"Azure 발음 평가 실패: HTTP {response.status_code} — {response.text[:200]}"
            )
        return response.json()


class PronunciationService:
    """Pronunciation evaluation using Azure Speech SDK REST API."""

    def __init__(self, db):
        from app.repositories.pronunciation_repo import PronunciationRepository
        from sqlalchemy import select
        from app.models.learning import LearningCard
        self.db = db
        self.repo = PronunciationRepository(db)

    async def evaluate(
        self,
        card_id: int,
        user_id: int,
        audio_data: bytes,
        reference_text: str,
    ) -> dict:
        """Evaluate pronunciation and store the result.

        Args:
            card_id: Learning card ID
            user_id: User ID
            audio_data: WAV audio bytes
            reference_text: Expected text to evaluate against

        Returns:
            dict with pronunciation scores and metadata
        """
        # Validate WAV format
        validate_wav_upload(audio_data)

        # Save the uploaded audio
        audio_url = _save_upload(audio_data)

        # Call Azure Speech API
        azure_result = await self._call_azure_with_retry(audio_data, reference_text)

        # Parse scores
        scores = parse_azure_response(azure_result)

        # Get next attempt number
        attempt_number = await self.repo.get_next_attempt_number(card_id, user_id)

        # Store result in DB
        result = await self.repo.create(
            card_id=card_id,
            user_id=user_id,
            attempt_number=attempt_number,
            audio_url=audio_url,
            accuracy_score=Decimal(str(scores["accuracy_score"])),
            fluency_score=Decimal(str(scores["fluency_score"])),
            completeness_score=Decimal(str(scores["completeness_score"])),
            overall_score=Decimal(str(scores["overall_score"])),
            feedback=scores["feedback"],
        )
        await self.db.commit()
        await self.db.refresh(result)

        return {
            "id": result.id,
            "card_id": result.card_id,
            "overall_score": float(result.overall_score),
            "accuracy_score": float(result.accuracy_score),
            "fluency_score": float(result.fluency_score),
            "completeness_score": float(result.completeness_score),
            "feedback": result.feedback,
            "word_scores": scores["word_scores"],
            "attempt_number": result.attempt_number,
            "created_at": result.created_at,
        }

    async def _call_azure_with_retry(self, audio_data: bytes, reference_text: str) -> dict:
        """Call Azure API with circuit breaker and retry."""
        try:
            return await retry_with_backoff(
                func=lambda: _call_azure_pronunciation(
                    audio_data=audio_data,
                    reference_text=reference_text,
                    api_key=settings.AZURE_SPEECH_KEY,
                    region=settings.AZURE_SPEECH_REGION,
                ),
                max_retries=2,
                base_delay=0.5,
                retryable_exceptions=(PronunciationError, httpx.HTTPError),
                circuit_breaker=_azure_cb,
            )
        except (PronunciationError, httpx.HTTPError, CircuitBreakerError) as e:
            raise PronunciationError(f"발음 평가 실패: {e}")
