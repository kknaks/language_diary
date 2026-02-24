"""STT Service — ElevenLabs Speech-to-Text WebSocket streaming integration."""

import asyncio
import base64
import json
import logging
from typing import Optional

import websockets


logger = logging.getLogger(__name__)

ELEVENLABS_STT_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
ELEVENLABS_STT_MODEL = "scribe_v2_realtime"
DEFAULT_LANGUAGE = "ko"
DEFAULT_SAMPLE_RATE = 16000

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
    """Manages a single ElevenLabs STT WebSocket streaming session.

    Connects to ElevenLabs realtime STT, streams audio, and returns
    transcription results via callbacks (interim) and awaitable (final).

    Usage:
        session = STTSession(api_key, client_ws=websocket)
        await session.connect()

        # Stream audio chunks:
        await session.send_audio(audio_bytes)

        # End audio and get final transcription:
        final_text = await session.commit_and_wait_final()

        await session.close()
    """

    def __init__(self, api_key: str, client_ws=None):
        self.api_key = api_key
        self.client_ws = client_ws
        self._ws = None
        self._listener_task: Optional[asyncio.Task] = None
        self._final_text = ""
        self._final_event = asyncio.Event()
        self._error: Optional[str] = None
        self._connected = False
        self._total_chunks_sent = 0

    async def connect(
        self,
        language: str = DEFAULT_LANGUAGE,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        commit_strategy: str = "vad",
        vad_silence_threshold_secs: float = 1.5,
        vad_threshold: float = 0.4,
    ):
        """Connect to ElevenLabs STT WebSocket and start listening.

        Args:
            language: Language code for transcription.
            sample_rate: Audio sample rate in Hz.
            commit_strategy: 'vad' for automatic silence-based commit,
                             'manual' for explicit commit control.
            vad_silence_threshold_secs: Seconds of silence before VAD commits.
            vad_threshold: VAD sensitivity (0.0-1.0).
        """
        url = (
            f"{ELEVENLABS_STT_URL}"
            f"?model_id={ELEVENLABS_STT_MODEL}"
            f"&language_code={language}"
            f"&sample_rate={sample_rate}"
            f"&commit_strategy={commit_strategy}"
        )
        if commit_strategy == "vad":
            url += (
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
        logger.info("ElevenLabs STT session started")

    async def send_audio(self, audio_bytes: bytes):
        """Send a real-time audio chunk to ElevenLabs for transcription.

        In real-time streaming mode, chunks arrive from the microphone at
        natural pace (~100ms intervals), so no splitting or pacing is needed.

        Args:
            audio_bytes: Raw PCM audio data (16kHz, 16-bit, mono).
        """
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

    async def wait_for_final(self, timeout: float = 10.0) -> str:
        """Wait for VAD to automatically commit and return the final text.

        In VAD mode, ElevenLabs detects silence and sends committed_transcript
        automatically. This method simply waits for that event without sending
        a manual commit signal.

        Returns:
            The committed transcription text.
        """
        if not self._connected or not self._ws:
            raise STTError("STT 세션이 연결되지 않았습니다.")

        try:
            await asyncio.wait_for(self._final_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            raise STTError("STT 최종 결과 대기 시간 초과")

        if self._error:
            raise STTError(self._error)

        return self._final_text

    async def commit_and_wait_final(self, timeout: float = 10.0) -> str:
        """Send commit signal and wait for the final transcription.

        Returns:
            The committed transcription text.
        """
        if not self._connected or not self._ws:
            raise STTError("STT 세션이 연결되지 않았습니다.")

        self._final_event.clear()
        self._final_text = ""
        self._error = None

        # Brief delay to let ElevenLabs process streamed audio before commit
        await asyncio.sleep(0.3)

        try:
            await self._ws.send(json.dumps({
                "message_type": "input_audio_chunk",
                "audio_base_64": "",
                "commit": True,
            }))
        except Exception as e:
            raise STTError(f"커밋 전송 실패: {e}")

        try:
            await asyncio.wait_for(self._final_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            raise STTError("STT 최종 결과 대기 시간 초과")

        if self._error:
            raise STTError(self._error)

        return self._final_text

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
        logger.info("ElevenLabs STT session closed")

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
                    self._final_text = data.get("text", "")
                    self._final_event.set()
                    # Relay final transcript to client
                    if self.client_ws:
                        try:
                            await self.client_ws.send_json({
                                "type": "stt_final",
                                "text": self._final_text,
                            })
                        except Exception:
                            pass

                elif msg_type in (
                    "auth_error",
                    "quota_exceeded",
                    "rate_limited",
                    "resource_exhausted",
                    "transcriber_error",
                ):
                    error_msg = data.get("message", f"STT 오류: {msg_type}")
                    self._error = error_msg
                    self._final_event.set()

        except asyncio.CancelledError:
            return
        except websockets.exceptions.ConnectionClosed:
            if not self._final_event.is_set():
                self._error = "ElevenLabs STT 연결이 끊어졌습니다."
                self._final_event.set()
        except Exception as e:
            logger.exception("STT listener error")
            if not self._final_event.is_set():
                self._error = f"STT 리스너 오류: {e}"
                self._final_event.set()
