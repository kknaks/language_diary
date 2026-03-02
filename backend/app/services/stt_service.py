"""STT Service — ElevenLabs Speech-to-Text WebSocket streaming integration."""

import asyncio
import base64
import json
import logging
import re
from typing import AsyncIterator, Optional

import websockets


logger = logging.getLogger(__name__)

ELEVENLABS_STT_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
ELEVENLABS_STT_MODEL = "scribe_v2_realtime"
DEFAULT_LANGUAGE = "ko"
DEFAULT_SAMPLE_RATE = 16000

# Whisper hallucination 패턴 — 이런 텍스트만 단독으로 들어오면 무시
_HALLUCINATION_PATTERNS = {
    "(끝)", "(웃음)", "(박수)", "(침묵)", "(음악)", "(노이즈)", "(잡음)",
    "[끝]", "[웃음]", "[박수]", "[침묵]", "[음악]",
    "끝.", "끝", ".", "..", "...",
    "(end)", "(silence)", "(music)", "(applause)", "(noise)",
}

# PCM 16-bit mono: each sample = 2 bytes
EXPECTED_SAMPLE_WIDTH = 2


class STTError(Exception):
    """Raised when STT processing fails."""
    pass


def validate_pcm_audio(audio_bytes: bytes) -> bool:
    """Validate that audio data is consistent with 16-bit PCM format.

    16-bit mono PCM means each sample is 2 bytes,
    so the total byte count must be even and non-zero.
    """
    if not audio_bytes:
        return False
    if len(audio_bytes) % EXPECTED_SAMPLE_WIDTH != 0:
        return False
    return True


class STTSession:
    """Manages a long-lived ElevenLabs STT WebSocket streaming session.

    Uses commit_strategy=vad so ElevenLabs auto-commits after detecting
    silence. The session stays open for the entire conversation — each
    auto-commit produces a committed_transcript that is yielded via
    iter_commits().

    Usage:
        session = STTSession(api_key, client_ws=websocket)
        await session.connect()

        # Stream audio chunks continuously:
        await session.send_audio(audio_bytes)

        # Consume committed transcripts:
        async for text in session.iter_commits():
            # handle each utterance
            ...

        await session.close()
    """

    def __init__(self, api_key: str, client_ws=None):
        self.api_key = api_key
        self.client_ws = client_ws
        self._ws = None
        self._listener_task: Optional[asyncio.Task] = None
        self._commit_queue: asyncio.Queue[str] = asyncio.Queue()
        self._error: Optional[str] = None
        self._connected = False
        self._total_chunks_sent = 0

    async def connect(
        self,
        language: str = DEFAULT_LANGUAGE,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        vad_silence_threshold_secs: float = 1.5,
        vad_threshold: float = 0.5,
    ):
        """Connect to ElevenLabs STT WebSocket and start listening.

        Uses VAD commit strategy — ElevenLabs detects silence and
        auto-commits. No manual commit needed.
        """
        url = (
            f"{ELEVENLABS_STT_URL}"
            f"?model_id={ELEVENLABS_STT_MODEL}"
            f"&language_code={language}"
            f"&sample_rate={sample_rate}"
            f"&commit_strategy=vad"
            f"&vad_silence_threshold_secs={vad_silence_threshold_secs}"
            f"&vad_threshold={vad_threshold}"
        )
        headers = {"xi-api-key": self.api_key}

        try:
            self._ws = await websockets.connect(url, additional_headers=headers)
        except Exception as e:
            raise STTError(f"ElevenLabs STT 연결 실패: {e}")

        # Wait for session_started acknowledgment
        try:
            raw = await asyncio.wait_for(self._ws.recv(), timeout=10.0)
            msg = json.loads(raw)
            if msg.get("message_type") != "session_started":
                raise STTError(
                    f"예상치 못한 세션 시작 응답: {msg.get('message_type')}"
                )
        except asyncio.TimeoutError:
            await self._ws.close()
            raise STTError("ElevenLabs STT 세션 시작 시간 초과")
        except json.JSONDecodeError:
            await self._ws.close()
            raise STTError("ElevenLabs STT 세션 시작 응답 파싱 실패")

        self._connected = True
        self._listener_task = asyncio.create_task(self._listen())
        logger.info("ElevenLabs STT session started (vad commit, silence=%.1fs)", vad_silence_threshold_secs)

    async def send_audio(self, audio_bytes: bytes):
        """Send a real-time audio chunk to ElevenLabs for transcription."""
        if not self._connected or not self._ws:
            raise STTError("STT 세션이 연결되지 않았습니다.")

        if not validate_pcm_audio(audio_bytes):
            logger.warning("Invalid PCM audio chunk: %d bytes", len(audio_bytes))
            return

        try:
            audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
            await self._ws.send(json.dumps({
                "message_type": "input_audio_chunk",
                "audio_base_64": audio_b64,
            }))
            self._total_chunks_sent += 1
        except Exception as e:
            raise STTError(f"오디오 전송 실패: {e}")

    async def iter_commits(self) -> AsyncIterator[str]:
        """Yield committed transcripts from the queue.

        Blocks until a new committed_transcript arrives. Use this as
        an async generator in a background task to drive the AI pipeline.
        """
        while self._connected:
            try:
                text = await self._commit_queue.get()
                yield text
            except asyncio.CancelledError:
                return

    async def close(self):
        """Close the STT session and clean up resources."""
        self._connected = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except (asyncio.CancelledError, Exception):
                pass
            self._listener_task = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        logger.info("ElevenLabs STT session closed (chunks_sent=%d)", self._total_chunks_sent)

    async def _listen(self):
        """Background task: read ElevenLabs responses and dispatch events."""
        try:
            async for raw_msg in self._ws:
                try:
                    data = json.loads(raw_msg)
                except json.JSONDecodeError:
                    continue

                msg_type = data.get("message_type")

                if msg_type == "partial_transcript":
                    text = data.get("text", "")
                    if text and self.client_ws:
                        try:
                            await self.client_ws.send_json({
                                "type": "stt_interim",
                                "text": text,
                            })
                        except Exception:
                            pass

                elif msg_type == "committed_transcript":
                    text = data.get("text", "")
                    logger.info(
                        "STT committed_transcript: '%s' (chunks_sent=%d)",
                        text[:80] if text else "(empty)",
                        self._total_chunks_sent,
                    )
                    # Skip empty commits — don't queue or notify client
                    if not text.strip():
                        continue
                    # Skip Whisper hallucination patterns
                    if text.strip() in _HALLUCINATION_PATTERNS:
                        logger.info("STT hallucination filtered: '%s'", text.strip())
                        continue
                    # Remove inline emotion tags like (뿌듯), (웃음), (laughing) etc.
                    # Only remove CLOSED parentheses — ignore unclosed ones to preserve partial speech
                    clean_text = re.sub(r'\s*\([^)]*\)', '', text)
                    # Remove any trailing unclosed parenthesis
                    clean_text = re.sub(r'\s*\([^)]*$', '', clean_text).strip()
                    if not clean_text:
                        logger.info("STT empty after emotion tag removal: '%s'", text.strip())
                        continue
                    # Send stt_final directly to client (emotion tags removed)
                    if self.client_ws:
                        try:
                            await self.client_ws.send_json({
                                "type": "stt_final",
                                "text": clean_text,
                            })
                        except Exception:
                            pass
                    # Queue for backend AI pipeline (emotion tags removed)
                    await self._commit_queue.put(clean_text)

                elif msg_type == "input_error":
                    logger.warning("STT input_error: %s", data.get("error", "unknown"))

                elif msg_type in (
                    "auth_error",
                    "quota_exceeded",
                    "rate_limited",
                    "resource_exhausted",
                    "transcriber_error",
                ):
                    error_msg = data.get("message", f"STT 오류: {msg_type}")
                    logger.error("STT error: %s — %s", msg_type, error_msg)
                    self._error = error_msg

        except asyncio.CancelledError:
            return
        except websockets.exceptions.ConnectionClosed:
            logger.warning("ElevenLabs STT connection closed unexpectedly")
            self._connected = False
        except Exception:
            logger.exception("STT listener error")
            self._connected = False
