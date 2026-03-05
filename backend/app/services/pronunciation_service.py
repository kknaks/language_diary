"""Pronunciation Service — GPT-4o Audio pronunciation evaluation via OpenAI Chat Completions API."""

import base64
import json
import logging
import uuid
from decimal import Decimal
from pathlib import Path
from typing import List

import httpx
from openai import AsyncOpenAI

from app.config import settings
from app.utils.audio import validate_wav_upload
from app.utils.circuit_breaker import CircuitBreaker, CircuitBreakerError, retry_with_backoff

logger = logging.getLogger(__name__)

# Audio upload storage
UPLOAD_DIR = Path("audio_uploads")

# --- Deprecated: Azure Speech config (kept for rollback) ---
# AZURE_STT_URL_TEMPLATE = (
#     "https://{region}.stt.speech.microsoft.com"
#     "/speech/recognition/conversation/cognitiveservices/v1"
#     "?language=en-US"
# )

_pronunciation_cb = CircuitBreaker(name="gpt4o_pronunciation", failure_threshold=3, recovery_timeout=30.0)

# Keep old name as alias so existing test resets (e.g. pronunciation_service._azure_cb.reset()) still work.
_azure_cb = _pronunciation_cb

GPT4O_PRONUNCIATION_SYSTEM_PROMPT = (
    "너는 영어 발음 평가 전문가야. "
    "사용자가 읽어야 할 원문과 음성을 받아서 발음을 평가해. "
    "반드시 아래 JSON 형식으로만 응답해:\n"
    '{"overall_score": 0-100, "accuracy_score": 0-100, "fluency_score": 0-100, '
    '"completeness_score": 0-100, "feedback": "한국어 피드백", '
    '"word_scores": [{"word": "...", "score": 0-100, '
    '"error_type": null|"Mispronunciation"|"Omission"|"Insertion"}]}'
)


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


# --- Deprecated: Azure helpers (kept for potential rollback) ---

def _build_pronunciation_params(reference_text: str) -> str:
    """[DEPRECATED] Build Azure pronunciation assessment parameters."""
    params = {
        "ReferenceText": reference_text,
        "GradingSystem": "HundredMark",
        "Granularity": "Word",
        "Dimension": "Comprehensive",
        "EnableMiscue": True,
    }
    return json.dumps(params)


def parse_azure_response(response_json: dict) -> dict:
    """[DEPRECATED] Parse Azure pronunciation assessment response into our schema.

    Kept for potential rollback to Azure Speech API.

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
    """Generate human-readable feedback from pronunciation scores (fallback)."""
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


# --- Deprecated: Azure API call (kept for rollback) ---

async def _call_azure_pronunciation(
    audio_data: bytes,
    reference_text: str,
    api_key: str,
    region: str,
) -> dict:
    """[DEPRECATED] Call Azure Speech pronunciation assessment REST API."""
    url = "https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US".format(region=region)  # noqa: E501
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


# --- New: GPT-4o Audio pronunciation evaluation ---

def _parse_gpt4o_response(raw_text: str) -> dict:
    """Parse GPT-4o JSON response into our pronunciation schema.

    Falls back to _generate_feedback() if GPT feedback is missing.
    """
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise PronunciationError(f"GPT-4o 응답 JSON 파싱 실패: {e}")

    required_keys = ["overall_score", "accuracy_score", "fluency_score", "completeness_score"]
    for key in required_keys:
        if key not in data:
            raise PronunciationError(f"GPT-4o 응답에 '{key}' 필드가 없습니다.")

    word_scores = data.get("word_scores", [])

    # Use GPT feedback if present, otherwise generate fallback
    feedback = data.get("feedback")
    if not feedback:
        feedback = _generate_feedback(
            data["accuracy_score"],
            data["fluency_score"],
            data["completeness_score"],
            word_scores,
        )

    return {
        "overall_score": data["overall_score"],
        "accuracy_score": data["accuracy_score"],
        "fluency_score": data["fluency_score"],
        "completeness_score": data["completeness_score"],
        "feedback": feedback,
        "word_scores": word_scores,
    }


async def _call_gpt4o_pronunciation(
    audio_data: bytes,
    reference_text: str,
) -> dict:
    """Call GPT-4o Audio model for pronunciation evaluation.

    Sends WAV audio as base64 input_audio and returns parsed scores dict.
    """
    audio_b64 = base64.b64encode(audio_data).decode("utf-8")

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    response = await client.chat.completions.create(
        model="gpt-4o-audio-preview",
        modalities=["text"],
        messages=[
            {
                "role": "system",
                "content": GPT4O_PRONUNCIATION_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": audio_b64,
                            "format": "wav",
                        },
                    },
                    {
                        "type": "text",
                        "text": f"Reference text: {reference_text}",
                    },
                ],
            },
        ],
    )

    raw_text = response.choices[0].message.content
    if not raw_text:
        raise PronunciationError("GPT-4o 응답이 비어있습니다.")

    return _parse_gpt4o_response(raw_text)


class PronunciationService:
    """Pronunciation evaluation using GPT-4o Audio (Chat Completions API)."""

    def __init__(self, db):
        from app.repositories.pronunciation_repo import PronunciationRepository
        self.db = db
        self.repo = PronunciationRepository(db)

    async def evaluate(
        self,
        card_id: int,
        user_id: int,
        audio_data: bytes,
        reference_text: str,
        section: str = "content",
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

        # Call GPT-4o Audio API
        scores = await self._call_gpt4o_with_retry(audio_data, reference_text)

        # Get next attempt number
        attempt_number = await self.repo.get_next_attempt_number(card_id, user_id, section=section)

        # Store result in DB
        result = await self.repo.create(
            card_id=card_id,
            user_id=user_id,
            attempt_number=attempt_number,
            section=section,
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

    async def _call_gpt4o_with_retry(self, audio_data: bytes, reference_text: str) -> dict:
        """Call GPT-4o API with circuit breaker and retry."""
        try:
            return await retry_with_backoff(
                func=lambda: _call_gpt4o_pronunciation(
                    audio_data=audio_data,
                    reference_text=reference_text,
                ),
                max_retries=2,
                base_delay=0.5,
                retryable_exceptions=(PronunciationError, Exception),
                circuit_breaker=_pronunciation_cb,
            )
        except (PronunciationError, CircuitBreakerError) as e:
            raise PronunciationError(f"발음 평가 실패: {e}")
        except Exception as e:
            raise PronunciationError(f"발음 평가 실패: {e}")
