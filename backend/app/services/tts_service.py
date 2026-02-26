"""TTS Service — ElevenLabs TTS with OpenAI TTS fallback and caching.

Includes both REST-based TTSService (with caching) and WebSocket-based
TTSStreamSession for low-latency streaming TTS.
"""

import asyncio
import base64
import hashlib
import json
import logging
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import AsyncIterator, Optional

import httpx
import websockets
from openai import AsyncOpenAI

from app.config import settings
from app.utils.circuit_breaker import CircuitBreaker, CircuitBreakerError, retry_with_backoff

logger = logging.getLogger(__name__)

# Audio storage directory (relative to backend root)
AUDIO_DIR = Path("audio_files")

# ElevenLabs TTS config
ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel - default English voice
DEFAULT_MODEL_ID = "eleven_multilingual_v2"

# ElevenLabs TTS WebSocket config
ELEVENLABS_TTS_WS_URL = "wss://api.elevenlabs.io/v1/text-to-speech"
DEFAULT_TTS_WS_MODEL = "eleven_multilingual_v2"
DEFAULT_TTS_WS_OUTPUT_FORMAT = "mp3_44100_128"

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


def _normalize_volume(audio_bytes: bytes, gain_db: float) -> bytes:
    """ffmpeg volume 필터로 gain 적용 후 bytes 반환."""
    if gain_db == 0:
        return audio_bytes

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_in:
        tmp_in.write(audio_bytes)
        tmp_in_path = tmp_in.name

    tmp_out_path = tmp_in_path + ".out.mp3"
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in_path, "-af", f"volume={gain_db}dB", tmp_out_path],
            capture_output=True,
            timeout=10,
        )
        if result.returncode == 0:
            return Path(tmp_out_path).read_bytes()
        logger.warning("ffmpeg volume adjust failed, returning raw audio")
        return audio_bytes
    except Exception:
        return audio_bytes
    finally:
        Path(tmp_in_path).unlink(missing_ok=True)
        Path(tmp_out_path).unlink(missing_ok=True)


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

        # voice별 볼륨 정규화 적용
        gain_db = await self._get_volume_gain(voice)
        if gain_db != 0:
            audio_bytes = _normalize_volume(audio_bytes, gain_db)

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

    async def generate_bytes(
        self,
        text: str,
        voice_id: Optional[str] = None,
    ) -> bytes:
        """Generate TTS audio and return raw MP3 bytes (no file save)."""
        voice = voice_id or DEFAULT_VOICE_ID
        audio_bytes = await self._generate_with_fallback(text, voice)
        gain_db = await self._get_volume_gain(voice)
        if gain_db != 0:
            audio_bytes = _normalize_volume(audio_bytes, gain_db)
        return audio_bytes

    async def _get_volume_gain(self, elevenlabs_voice_id: str) -> float:
        """DB에서 voice의 volume_gain_db 조회."""
        from app.models.seed import Voice
        from sqlalchemy import select
        result = await self.db.execute(
            select(Voice.volume_gain_db).where(Voice.elevenlabs_voice_id == elevenlabs_voice_id)
        )
        row = result.scalar_one_or_none()
        return row if row is not None else 0.0

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


class TTSStreamSession:
    """Single TTS WebSocket session for a conversation turn.

    Connects to ElevenLabs TTS WebSocket for streaming text-to-speech.
    Multiple sentences can be sent over a single connection using flush,
    and audio chunks are received as they are generated.

    Usage:
        session = TTSStreamSession(api_key)
        await session.connect(voice_id)

        # Send sentences (from LLM streaming):
        await session.send_sentence("첫 번째 문장.")
        await session.send_sentence("두 번째 문장.")

        # Receive audio chunks (run concurrently with send):
        async for chunk in session.receive_audio_chunks():
            # base64 encode and push to client
            ...

        await session.close()
    """

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or settings.ELEVENLABS_API_KEY
        self._ws = None  # type: Optional[websockets.WebSocketClientProtocol]
        self._connected = False
        self._closed = False

    async def connect(
        self,
        voice_id: Optional[str] = None,
        model_id: str = DEFAULT_TTS_WS_MODEL,
        output_format: str = DEFAULT_TTS_WS_OUTPUT_FORMAT,
        language_code: str = "ko",
    ) -> None:
        """Connect to ElevenLabs TTS WebSocket and send initialization message.

        Args:
            voice_id: ElevenLabs voice ID. Defaults to DEFAULT_VOICE_ID.
            model_id: TTS model to use.
            output_format: Audio output format.
            language_code: Language code for TTS.
        """
        voice = voice_id or DEFAULT_VOICE_ID
        url = (
            f"{ELEVENLABS_TTS_WS_URL}/{voice}/stream-input"
            f"?model_id={model_id}"
            f"&output_format={output_format}"
            f"&language_code={language_code}"
        )
        headers = {"xi-api-key": self._api_key}

        try:
            self._ws = await websockets.connect(url, additional_headers=headers)
        except Exception as e:
            raise TTSError(f"TTS WebSocket 연결 실패: {e}")

        # Send initialization message (BOS — beginning of stream)
        init_msg = {
            "text": " ",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
                "speed": 1.0,
            },
            "generation_config": {
                "chunk_length_schedule": [50, 120, 200, 260],
            },
        }
        try:
            await self._ws.send(json.dumps(init_msg))
        except Exception as e:
            await self._safe_close_ws()
            raise TTSError(f"TTS WebSocket 초기화 실패: {e}")

        self._connected = True
        logger.info("TTS WebSocket session connected (voice=%s)", voice)

    async def send_sentence(self, text: str) -> None:
        """Send a sentence to TTS with flush=true for immediate generation.

        Args:
            text: Sentence text to synthesize.
        """
        if not self._connected or not self._ws:
            raise TTSError("TTS WebSocket 세션이 연결되지 않았습니다.")

        msg = {
            "text": text + " ",
            "flush": True,
        }
        try:
            await self._ws.send(json.dumps(msg))
            logger.debug("TTS sentence sent: %s", text[:50])
        except Exception as e:
            raise TTSError(f"TTS 문장 전송 실패: {e}")

    async def send_eos(self) -> None:
        """Send EOS (empty text) to signal end of input stream.

        This triggers ElevenLabs to send the isFinal message so that
        receive_audio_chunks() can terminate cleanly.
        """
        if not self._connected or not self._ws:
            return
        try:
            await self._ws.send(json.dumps({"text": ""}))
            logger.debug("TTS EOS sent")
        except Exception as e:
            logger.warning("TTS EOS send failed: %s", e)

    async def receive_audio_chunks(self) -> AsyncIterator[bytes]:
        """Async generator that yields audio chunks as they arrive.

        Yields decoded audio bytes for each chunk received from the
        TTS WebSocket. Stops when isFinal is received or connection closes.
        """
        if not self._connected or not self._ws:
            return

        try:
            async for raw_msg in self._ws:
                try:
                    data = json.loads(raw_msg)
                except json.JSONDecodeError:
                    continue

                if data.get("isFinal"):
                    logger.debug("TTS WebSocket received isFinal")
                    break

                audio_b64 = data.get("audio")
                if audio_b64:
                    yield base64.b64decode(audio_b64)

        except websockets.exceptions.ConnectionClosed:
            logger.warning("TTS WebSocket connection closed during receive")
        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.error("TTS WebSocket receive error: %s", e)

    async def close(self) -> None:
        """Send EOS (empty text) to signal end of stream, then close."""
        if self._closed:
            return
        self._closed = True
        self._connected = False

        if self._ws:
            # Send EOS — empty text signals end of stream
            try:
                await self._ws.send(json.dumps({"text": ""}))
            except Exception:
                pass
            await self._safe_close_ws()

        logger.info("TTS WebSocket session closed")

    async def _safe_close_ws(self) -> None:
        """Close the underlying WebSocket connection safely."""
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
