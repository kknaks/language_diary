"""Conversation API — REST endpoints + WebSocket for real-time chat."""

import asyncio
import base64
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session, get_db
from app.exceptions import AppError
from app.schemas.conversation import ConversationCreateResponse, ConversationDetailResponse
from app.services.conversation_service import ConversationService
from app.services.stt_service import STTError, STTSession
from app.services.tts_service import TTSError, TTSService, TTSStreamSession

logger = logging.getLogger(__name__)

# STT silence timeout: if no final transcript after this many seconds, send stt_empty
STT_SILENCE_TIMEOUT_SECS = 15.0

router = APIRouter(prefix="/conversation", tags=["conversation"])


def _ms_since(t0: float) -> float:
    """Return milliseconds elapsed since *t0* (from time.monotonic())."""
    return (time.monotonic() - t0) * 1000.0


async def _send_tts_rest(websocket: WebSocket, db, text: str, index: Optional[int] = None) -> None:
    """Fallback: Generate TTS audio via REST and send base64-encoded data to client."""
    try:
        tts_service = TTSService(db)
        audio_bytes = await tts_service.generate_bytes(text)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        msg = {
            "type": "tts_audio",
            "audio_data": audio_b64,
            "format": "mp3",
        }  # type: dict
        if index is not None:
            msg["index"] = index
        await websocket.send_json(msg)
    except Exception as e:
        logger.error("TTS REST fallback failed: %s", e)
        await websocket.send_json({
            "type": "error",
            "code": "TTS_FAILED",
            "message": str(e),
        })


async def _send_tts_ws(websocket: WebSocket, text: str, index: int = 0) -> None:
    """Generate TTS audio via WebSocket streaming and push chunks to client.

    Falls back to REST TTS if WebSocket connection fails.
    """
    tts_session = None  # type: Optional[TTSStreamSession]
    try:
        tts_session = TTSStreamSession()
        await tts_session.connect()

        await tts_session.send_sentence(text)

        chunk_index = 0
        async for audio_chunk in tts_session.receive_audio_chunks():
            audio_b64 = base64.b64encode(audio_chunk).decode("ascii")
            await websocket.send_json({
                "type": "tts_audio",
                "audio_data": audio_b64,
                "format": "mp3",
                "index": chunk_index,
            })
            chunk_index += 1

        await tts_session.close()
    except TTSError as e:
        logger.warning("TTS WebSocket failed: %s", e)
        if tts_session:
            await tts_session.close()
        raise
    except Exception as e:
        logger.error("TTS WebSocket unexpected error: %s", e)
        if tts_session:
            await tts_session.close()
        raise


@router.post("", response_model=ConversationCreateResponse, status_code=201)
async def create_conversation(db: AsyncSession = Depends(get_db)):
    """Create a new conversation session. Returns AI's first question."""
    service = ConversationService(db)
    return await service.create_session()


@router.get("/{session_id}", response_model=ConversationDetailResponse)
async def get_conversation(session_id: str, db: AsyncSession = Depends(get_db)):
    """Get conversation session status and message history."""
    service = ConversationService(db)
    return await service.get_session(session_id)


# --- WebSocket endpoint (mounted at app level, not under /api/v1) ---

async def _handle_ai_reply_streaming(
    websocket: WebSocket,
    db,
    service: ConversationService,
    session_id: str,
    user_text: str,
    pipeline_state: Optional[dict] = None,
):
    """Handle user message with streaming AI reply + TTS WebSocket streaming.

    Pipeline:
    1. Open a single TTS WebSocket connection for the turn
    2. LLM streams sentences → send ai_chunk + flush to TTS
    3. Background task relays TTS audio chunks → tts_audio to client
    4. On turn end → ai_done + TTS close
    5. Falls back to REST TTS if WebSocket connection fails

    *pipeline_state* is a mutable dict shared with the WS message loop so that
    a ``barge_in`` message can cancel the running LLM / TTS tasks.  Keys set
    here: ``llm_task``, ``tts_session``, ``relay_task``.

    Returns True to continue message loop, False to break.
    """
    if pipeline_state is None:
        pipeline_state = {}

    t_turn_start = time.monotonic()
    tts_session = None  # type: Optional[TTSStreamSession]
    relay_task = None  # type: Optional[asyncio.Task]

    try:
        sentences = []
        index = 0
        audio_index_holder = [0]  # mutable holder for nonlocal-like access

        # --- Try to open TTS WebSocket ---
        use_ws_tts = True
        try:
            tts_session = TTSStreamSession()
            await tts_session.connect()
        except TTSError as e:
            logger.warning("TTS WebSocket connection failed, falling back to REST: %s", e)
            tts_session = None
            use_ws_tts = False

        # Expose TTS session to pipeline_state for barge-in
        pipeline_state["tts_session"] = tts_session

        # --- Background: relay TTS audio chunks to client ---
        async def _relay_tts_audio():
            """Read audio chunks from TTS WebSocket and push to client."""
            if not tts_session:
                return
            try:
                async for audio_chunk in tts_session.receive_audio_chunks():
                    audio_b64 = base64.b64encode(audio_chunk).decode("ascii")
                    await websocket.send_json({
                        "type": "tts_audio",
                        "audio_data": audio_b64,
                        "format": "mp3",
                        "index": audio_index_holder[0],
                    })
                    audio_index_holder[0] += 1
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.error("TTS audio relay error: %s", e)

        if use_ws_tts:
            relay_task = asyncio.create_task(_relay_tts_audio())
            pipeline_state["relay_task"] = relay_task

        # --- REST fallback collectors (used only if WS fails) ---
        rest_tts_tasks = []  # type: list

        # --- Wrap LLM streaming in a task so barge_in can cancel it ---
        async def _run_llm():
            """Run the LLM streaming loop; populates *sentences* as a side-effect."""
            nonlocal index, use_ws_tts, tts_session, relay_task
            t_first_sentence = None  # type: Optional[float]
            async for sentence in service.handle_user_message_streaming(session_id, user_text):
                if t_first_sentence is None:
                    t_first_sentence = time.monotonic()
                    logger.info(
                        "[latency] LLM first sentence: %.0f ms",
                        _ms_since(t_turn_start),
                    )
                sentences.append(sentence)
                await websocket.send_json({
                    "type": "ai_message_chunk",
                    "text": sentence,
                    "index": index,
                    "is_final": False,
                })

                if use_ws_tts and tts_session:
                    try:
                        await tts_session.send_sentence(sentence)
                    except TTSError as e:
                        logger.warning("TTS WS send failed at sentence %d, switching to REST: %s", index, e)
                        use_ws_tts = False
                        await tts_session.close()
                        tts_session = None
                        pipeline_state["tts_session"] = None
                        if relay_task:
                            relay_task.cancel()
                            try:
                                await relay_task
                            except (asyncio.CancelledError, Exception):
                                pass
                            relay_task = None
                            pipeline_state["relay_task"] = None
                        tts_svc = TTSService(db)
                        rest_tts_tasks.append((index, asyncio.create_task(tts_svc.generate_bytes(sentence))))
                elif not use_ws_tts:
                    tts_svc = TTSService(db)
                    rest_tts_tasks.append((index, asyncio.create_task(tts_svc.generate_bytes(sentence))))

                index += 1

        llm_task = asyncio.create_task(_run_llm())
        pipeline_state["llm_task"] = llm_task

        try:
            await llm_task
        except asyncio.CancelledError:
            logger.info("LLM task cancelled (barge-in)")
            return True  # barge-in handled; continue message loop

        if sentences:
            # Send final chunk marker (for frontend compatibility)
            await websocket.send_json({
                "type": "ai_message_chunk",
                "text": "",
                "index": index,
                "is_final": True,
            })
            # Signal LLM done
            await websocket.send_json({"type": "ai_done"})

            if use_ws_tts and tts_session:
                # Close TTS stream (sends EOS) and wait for relay to finish
                await tts_session.close()
                tts_session = None
                if relay_task:
                    try:
                        await asyncio.wait_for(relay_task, timeout=30.0)
                    except (asyncio.TimeoutError, asyncio.CancelledError):
                        logger.warning("TTS relay task timed out or cancelled")
                    relay_task = None
            else:
                # REST fallback: send all TTS results in order
                for tts_idx, task in rest_tts_tasks:
                    try:
                        audio_bytes = await task
                        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
                        await websocket.send_json({
                            "type": "tts_audio",
                            "audio_data": audio_b64,
                            "format": "mp3",
                            "index": tts_idx,
                        })
                    except Exception as e:
                        logger.error("REST TTS failed for chunk %d: %s", tts_idx, e)
                        await websocket.send_json({
                            "type": "error",
                            "code": "TTS_FAILED",
                            "message": str(e),
                        })

            return True  # continue loop
        else:
            # No sentences yielded — max turns reached, auto-finish happened
            if tts_session:
                await tts_session.close()
            if relay_task:
                relay_task.cancel()
            diary_resp = await service.finish_conversation(session_id)
            await websocket.send_json(
                {"type": "diary_created", "diary": diary_resp.model_dump(mode="json")}
            )
            return False  # break loop

    except AppError as e:
        if tts_session:
            await tts_session.close()
        if relay_task:
            relay_task.cancel()
        await websocket.send_json(
            {"type": "error", "code": e.code, "message": e.message}
        )
        return False  # break loop
    except Exception as e:
        logger.exception("Unexpected error in _handle_ai_reply_streaming")
        if tts_session:
            await tts_session.close()
        if relay_task:
            relay_task.cancel()
        await websocket.send_json(
            {"type": "error", "code": "INTERNAL_ERROR", "message": str(e)}
        )
        return False


async def conversation_websocket(websocket: WebSocket):
    """WebSocket handler for real-time conversation with audio streaming.

    On connect: creates session, sends greeting + TTS, then enters message loop.

    Client → Server:
      { "type": "message", "text": "..." }       — Text message
      { "type": "audio_start" }                   — Begin audio streaming
      (binary frames)                             — Audio chunks (PCM 16kHz 16-bit mono)
      { "type": "audio_end" }                     — End audio streaming
      { "type": "barge_in" }                      — Cancel current AI reply + TTS
      { "type": "finish" }                        — Finish conversation

    Server → Client:
      { "type": "session_created", "session_id": "..." } — Session ready
      { "type": "stt_interim", "text": "..." }    — Real-time interim transcription
      { "type": "stt_final", "text": "..." }      — Final transcription
      { "type": "ai_message", "text": "..." }     — AI follow-up question (single)
      { "type": "ai_message_chunk", "text": "...", "index": N, "is_final": bool }
      { "type": "tts_audio", "audio_data": "<base64>", "format": "mp3", "index": N }
      { "type": "diary_created", "diary": {...} }  — Diary + learning cards
      { "type": "error", "code": "...", "message": "..." }
    """
    await websocket.accept()

    async with async_session() as db:
        service = ConversationService(db)
        stt_session = None
        # pipeline_state is shared between the message loop and
        # _handle_ai_reply_streaming so that barge_in can cancel running tasks.
        pipeline_state: dict = {}
        ai_pipeline_task: Optional[asyncio.Task] = None

        async def _cancel_pipeline() -> None:
            """Cancel in-flight LLM / TTS / relay tasks (barge-in)."""
            nonlocal ai_pipeline_task
            for key in ("llm_task", "relay_task"):
                task = pipeline_state.pop(key, None)
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except (asyncio.CancelledError, Exception):
                        pass
            tts_sess = pipeline_state.pop("tts_session", None)
            if tts_sess:
                await tts_sess.close()
            if ai_pipeline_task and not ai_pipeline_task.done():
                ai_pipeline_task.cancel()
                try:
                    await ai_pipeline_task
                except (asyncio.CancelledError, Exception):
                    pass
                ai_pipeline_task = None

        try:
            # --- Session creation on connect ---
            session_id = await service.create_session_ws()
            await websocket.send_json({
                "type": "session_created",
                "session_id": session_id,
            })

            # --- AI greeting ---
            greeting = await service.generate_greeting(session_id)
            await websocket.send_json({
                "type": "ai_message",
                "text": greeting,
            })
            # Try WebSocket TTS for greeting, fall back to REST
            try:
                await _send_tts_ws(websocket, greeting, index=0)
            except Exception as e:
                logger.warning("Greeting TTS WS failed, falling back to REST: %s", e)
                await _send_tts_rest(websocket, db, greeting, index=0)
            # Signal greeting turn done so frontend transitions to listening
            await websocket.send_json({"type": "ai_done"})

            # --- Message loop ---
            while True:
                raw = await websocket.receive()

                if raw["type"] == "websocket.disconnect":
                    break

                text_data = raw.get("text")
                bytes_data = raw.get("bytes")

                # --- Binary frame: audio chunk ---
                if bytes_data:
                    if stt_session:
                        try:
                            await stt_session.send_audio(bytes_data)
                        except STTError as e:
                            logger.error("STT send_audio failed: %s", e)
                            await websocket.send_json({
                                "type": "error",
                                "code": "STT_FAILED",
                                "message": str(e),
                            })
                    continue

                # --- Text frame: JSON message ---
                if not text_data:
                    continue

                try:
                    data = json.loads(text_data)
                except json.JSONDecodeError:
                    await websocket.send_json(
                        {"type": "error", "code": "VALIDATION_ERROR", "message": "유효하지 않은 JSON입니다."}
                    )
                    continue

                msg_type = data.get("type")

                # ── audio_start ──────────────────────────────────
                if msg_type == "audio_start":
                    if stt_session:
                        await stt_session.close()
                    try:
                        stt_session = STTSession(
                            settings.ELEVENLABS_API_KEY,
                            client_ws=websocket,
                        )
                        await stt_session.connect()
                    except STTError as e:
                        logger.error("STT connection failed: %s", e)
                        await websocket.send_json({
                            "type": "error",
                            "code": "STT_FAILED",
                            "message": str(e),
                        })
                        stt_session = None

                # ── audio_end ────────────────────────────────────
                elif msg_type == "audio_end":
                    if not stt_session:
                        await websocket.send_json({
                            "type": "error",
                            "code": "VALIDATION_ERROR",
                            "message": "활성 STT 세션이 없습니다.",
                        })
                        continue

                    # Frontend VAD detected silence and sent audio_end.
                    # Use commit_and_wait_final() for explicit commit —
                    # more reliable than waiting for server-side VAD.
                    try:
                        final_text = await stt_session.commit_and_wait_final()
                    except STTError as e:
                        logger.error("STT commit_and_wait_final failed: %s", e)
                        await websocket.send_json({
                            "type": "error",
                            "code": "STT_FAILED",
                            "message": str(e),
                        })
                        await stt_session.close()
                        stt_session = None
                        continue
                    finally:
                        if stt_session:
                            await stt_session.close()
                            stt_session = None

                    # Send stt_final (may duplicate _listen() relay, but
                    # ensures the client always gets the final text)
                    await websocket.send_json({
                        "type": "stt_final",
                        "text": final_text,
                    })

                    # STT → AI pipeline: feed transcribed text to conversation
                    if final_text.strip():
                        cont = await _handle_ai_reply_streaming(
                            websocket, db, service, session_id, final_text,
                            pipeline_state=pipeline_state,
                        )
                        if not cont:
                            break
                    else:
                        # Empty transcription — notify client to reset UI
                        await websocket.send_json({
                            "type": "stt_empty",
                            "message": "음성이 인식되지 않았습니다. 다시 시도해주세요.",
                        })

                # ── text message ─────────────────────────────────
                elif msg_type == "message":
                    text = data.get("text", "").strip()
                    if not text:
                        await websocket.send_json(
                            {"type": "error", "code": "VALIDATION_ERROR", "message": "메시지가 비어있습니다."}
                        )
                        continue

                    cont = await _handle_ai_reply_streaming(
                        websocket, db, service, session_id, text,
                        pipeline_state=pipeline_state,
                    )
                    if not cont:
                        break

                # ── barge_in ─────────────────────────────────────
                elif msg_type == "barge_in":
                    logger.info("Barge-in received, cancelling pipeline")
                    await _cancel_pipeline()
                    await websocket.send_json({"type": "barge_in_ack"})

                # ── finish ───────────────────────────────────────
                elif msg_type == "finish":
                    # Cancel any in-flight pipeline before finishing
                    await _cancel_pipeline()
                    try:
                        diary_resp = await service.finish_conversation(session_id)
                        await websocket.send_json(
                            {"type": "diary_created", "diary": diary_resp.model_dump(mode="json")}
                        )
                    except AppError as e:
                        await websocket.send_json(
                            {"type": "error", "code": e.code, "message": e.message}
                        )
                    break

                # ── unknown type ─────────────────────────────────
                else:
                    await websocket.send_json(
                        {"type": "error", "code": "VALIDATION_ERROR", "message": f"알 수 없는 메시지 타입: {msg_type}"}
                    )

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected: session_id=%s", session_id if 'session_id' in dir() else 'unknown')
        except Exception:
            logger.exception("WebSocket error")
            try:
                await websocket.send_json(
                    {"type": "error", "code": "INTERNAL_ERROR", "message": "서버 내부 오류가 발생했습니다."}
                )
            except Exception:
                pass
        finally:
            await _cancel_pipeline()
            if stt_session:
                await stt_session.close()
            try:
                await websocket.close()
            except Exception:
                pass
