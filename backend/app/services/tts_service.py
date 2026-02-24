"""TTS Service — ElevenLabs TTS with OpenAI TTS fallback and caching."""

import hashlib
import logging
import uuid
from pathlib import Path
from typing import Optional

import httpx
from openai import AsyncOpenAI

from app.config import settings
from app.utils.circuit_breaker import CircuitBreaker, CircuitBreakerError, retry_with_backoff

logger = logging.getLogger(__name__)

# Audio storage directory (relative to backend root)
AUDIO_DIR = Path("audio_files")

# ElevenLabs TTS config
ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel - default English voice
DEFAULT_MODEL_ID = "eleven_monolingual_v1"

# Circuit breakers for external APIs
_elevenlabs_cb = CircuitBreaker(name="elevenlabs_tts", failure_threshold=3, recovery_timeout=30.0)
_openai_tts_cb = CircuitBreaker(name="openai_tts", failure_threshold=3, recovery_timeout=30.0)


class TTSError(Exception):
    """Raised when TTS generation fails."""
    pass


def _text_hash(text: str, voice_id: str) -> str:
    """Generate SHA-256 hash for text+voice combination."""
    key = f"{text}:{voice_id}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _ensure_audio_dir() -> Path:
    """Ensure the audio directory exists and return its path."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    return AUDIO_DIR


async def _generate_elevenlabs_tts(
    text: str,
    voice_id: str,
    api_key: str,
) -> bytes:
    """Call ElevenLabs TTS API and return MP3 bytes."""
    url = f"{ELEVENLABS_TTS_URL}/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": DEFAULT_MODEL_ID,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            raise TTSError(
                f"ElevenLabs TTS 실패: HTTP {response.status_code} — {response.text[:200]}"
            )
        return response.content


async def _generate_openai_tts(text: str) -> bytes:
    """Fallback: Call OpenAI TTS API and return MP3 bytes."""
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.audio.speech.create(
        model="tts-1",
        voice="alloy",
        input=text,
        response_format="mp3",
    )
    return response.content


def _save_audio_file(audio_bytes: bytes, extension: str = "mp3") -> str:
    """Save audio bytes to local disk and return the relative URL path."""
    _ensure_audio_dir()
    filename = f"{uuid.uuid4().hex}.{extension}"
    filepath = AUDIO_DIR / filename
    filepath.write_bytes(audio_bytes)
    return f"/audio/{filename}"


class TTSService:
    """TTS service with ElevenLabs primary + OpenAI fallback + DB caching."""

    def __init__(self, db):
        from app.repositories.tts_cache_repo import TTSCacheRepository
        self.db = db
        self.cache_repo = TTSCacheRepository(db)

    async def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
    ) -> dict:
        """Generate TTS audio, returning cached result if available.

        Returns:
            dict with keys: audio_url, text, cached, duration_ms
        """
        voice = voice_id or DEFAULT_VOICE_ID
        text_h = _text_hash(text, voice)

        # Check cache first
        cached = await self.cache_repo.get_by_hash(text_h)
        if cached:
            return {
                "audio_url": cached.audio_url,
                "text": cached.text,
                "cached": True,
                "duration_ms": cached.duration_ms,
            }

        # Try ElevenLabs first, fallback to OpenAI
        audio_bytes = await self._generate_with_fallback(text, voice)

        # Save to disk
        audio_url = _save_audio_file(audio_bytes)

        # Save to cache DB
        cache_entry = await self.cache_repo.create(
            text_hash=text_h,
            text=text,
            audio_url=audio_url,
            voice_id=voice,
        )
        await self.db.commit()

        return {
            "audio_url": cache_entry.audio_url,
            "text": cache_entry.text,
            "cached": False,
            "duration_ms": cache_entry.duration_ms,
        }

    async def _generate_with_fallback(self, text: str, voice_id: str) -> bytes:
        """Try ElevenLabs TTS, fall back to OpenAI TTS on failure."""
        # Try ElevenLabs
        try:
            return await retry_with_backoff(
                func=lambda: _generate_elevenlabs_tts(
                    text=text,
                    voice_id=voice_id,
                    api_key=settings.ELEVENLABS_API_KEY,
                ),
                max_retries=2,
                base_delay=0.5,
                retryable_exceptions=(TTSError, httpx.HTTPError),
                circuit_breaker=_elevenlabs_cb,
            )
        except (TTSError, httpx.HTTPError, CircuitBreakerError) as e:
            logger.warning("ElevenLabs TTS failed, falling back to OpenAI: %s", e)

        # Fallback to OpenAI
        try:
            return await retry_with_backoff(
                func=lambda: _generate_openai_tts(text),
                max_retries=2,
                base_delay=0.5,
                retryable_exceptions=(Exception,),
                circuit_breaker=_openai_tts_cb,
            )
        except Exception as e:
            raise TTSError(f"TTS 생성 실패 (모든 프로바이더): {e}")
