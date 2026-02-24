"""Conversation API — REST endpoints + WebSocket for real-time chat."""

import asyncio
import base64
import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session, get_db
from app.exceptions import AppError
from app.schemas.conversation import ConversationCreateResponse, ConversationDetailResponse
from app.services.conversation_service import ConversationService
from app.services.stt_service import STTError, STTSession
from app.services.tts_service import TTSService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversation", tags=["conversation"])


async def _send_tts(websocket: WebSocket, db, text: str, index: int | None = None) -> None:
    """Generate TTS audio for text and send base64-encoded data to client via WebSocket."""
    try:
        tts_service = TTSService(db)
        audio_bytes = await tts_service.generate_bytes(text)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        msg: dict = {
            "type": "tts_audio",
            "audio_data": audio_b64,
            "format": "mp3",
        }
        if index is not None:
            msg["index"] = index
        await websocket.send_json(msg)
    except Exception as e:
        logger.error("TTS failed: %s", e)
        await websocket.send_json({
            "type": "error",
            "code": "TTS_FAILED",
            "message": str(e),
        })


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
    websocket: WebSocket, db, service: ConversationService, session_id: str, user_text: str,
):
    """Handle user message with streaming AI reply + parallel TTS.

    Sends ai_message_chunk for each sentence, then tts_audio for each.
    If max turns reached, the generator yields nothing and auto-finishes.
    Returns True to continue message loop, False to break.
    """
    try:
        sentences = []
        tts_generators = []
        index = 0

        async for sentence in service.handle_user_message_streaming(session_id, user_text):
            sentences.append(sentence)
            await websocket.send_json({
                "type": "ai_message_chunk",
                "text": sentence,
                "index": index,
                "is_final": False,
            })
            # Pre-generate TTS bytes in parallel (but don't send yet)
            tts_service = TTSService(db)
            task = asyncio.create_task(tts_service.generate_bytes(sentence))
            tts_generators.append((index, task))
            index += 1

        if sentences:
            # Send final marker
            await websocket.send_json({
                "type": "ai_message_chunk",
                "text": "",
                "index": index,
                "is_final": True,
            })
            # Now send all TTS results in order as base64
            for tts_index, task in tts_generators:
                try:
                    audio_bytes = await task
                    audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
                    await websocket.send_json({
                        "type": "tts_audio",
                        "audio_data": audio_b64,
                        "format": "mp3",
                        "index": tts_index,
                    })
                except Exception as e:
                    logger.error("TTS failed for chunk %d: %s", tts_index, e)
                    await websocket.send_json({
                        "type": "error",
                        "code": "TTS_FAILED",
                        "message": str(e),
                    })
            return True  # continue loop
        else:
            # No sentences yielded — max turns reached, auto-finish happened
            diary_resp = await service.finish_conversation(session_id)
            await websocket.send_json(
                {"type": "diary_created", "diary": diary_resp.model_dump(mode="json")}
            )
            return False  # break loop

    except AppError as e:
        await websocket.send_json(
            {"type": "error", "code": e.code, "message": e.message}
        )
        return False  # break loop


async def conversation_websocket(websocket: WebSocket):
    """WebSocket handler for real-time conversation with audio streaming.

    On connect: creates session, sends greeting + TTS, then enters message loop.

    Client → Server:
      { "type": "message", "text": "..." }       — Text message
      { "type": "audio_start" }                   — Begin audio streaming
      (binary frames)                             — Audio chunks (PCM 16kHz 16-bit mono)
      { "type": "audio_end" }                     — End audio streaming
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
            await _send_tts(websocket, db, greeting, index=0)

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

                    try:
                        final_text = await stt_session.commit_and_wait_final()
                    except STTError as e:
                        logger.error("STT commit failed: %s", e)
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

                    # Send final transcription to client
                    await websocket.send_json({
                        "type": "stt_final",
                        "text": final_text,
                    })

                    # STT → AI pipeline: feed transcribed text to conversation
                    if final_text.strip():
                        cont = await _handle_ai_reply_streaming(
                            websocket, db, service, session_id, final_text,
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
                    )
                    if not cont:
                        break

                # ── finish ───────────────────────────────────────
                elif msg_type == "finish":
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
            if stt_session:
                await stt_session.close()
            try:
                await websocket.close()
            except Exception:
                pass
