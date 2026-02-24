"""Conversation API — REST endpoints + WebSocket for real-time chat."""

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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversation", tags=["conversation"])


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

async def conversation_websocket(websocket: WebSocket, session_id: str):
    """WebSocket handler for real-time conversation with audio streaming.

    Client → Server:
      { "type": "message", "text": "..." }       — Text message
      { "type": "audio_start" }                   — Begin audio streaming
      (binary frames)                             — Audio chunks (PCM 16kHz 16-bit mono)
      { "type": "audio_end" }                     — End audio streaming
      { "type": "finish" }                        — Finish conversation

    Server → Client:
      { "type": "stt_interim", "text": "..." }    — Real-time interim transcription
      { "type": "stt_final", "text": "..." }      — Final transcription
      { "type": "ai_message", "text": "..." }     — AI follow-up question
      { "type": "diary_created", "diary": {...} }  — Diary + learning cards
      { "type": "error", "code": "...", "message": "..." }
    """
    await websocket.accept()

    async with async_session() as db:
        service = ConversationService(db)
        stt_session = None

        try:
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
                        try:
                            ai_reply = await service.handle_user_message(
                                session_id, final_text
                            )
                        except AppError as e:
                            await websocket.send_json(
                                {"type": "error", "code": e.code, "message": e.message}
                            )
                            break

                        if ai_reply is None:
                            # Max turns reached — auto-finish
                            await db.commit()
                            diary_resp = await service.finish_conversation(session_id)
                            await websocket.send_json(
                                {"type": "diary_created", "diary": diary_resp.model_dump(mode="json")}
                            )
                            break
                        else:
                            await websocket.send_json(
                                {"type": "ai_message", "text": ai_reply}
                            )

                # ── text message ─────────────────────────────────
                elif msg_type == "message":
                    text = data.get("text", "").strip()
                    if not text:
                        await websocket.send_json(
                            {"type": "error", "code": "VALIDATION_ERROR", "message": "메시지가 비어있습니다."}
                        )
                        continue

                    try:
                        ai_reply = await service.handle_user_message(session_id, text)
                    except AppError as e:
                        await websocket.send_json(
                            {"type": "error", "code": e.code, "message": e.message}
                        )
                        break

                    if ai_reply is None:
                        await db.commit()
                        diary_resp = await service.finish_conversation(session_id)
                        await websocket.send_json(
                            {"type": "diary_created", "diary": diary_resp.model_dump(mode="json")}
                        )
                        break
                    else:
                        await websocket.send_json({"type": "ai_message", "text": ai_reply})

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
            logger.info("WebSocket disconnected: session_id=%s", session_id)
        except Exception:
            logger.exception("WebSocket error: session_id=%s", session_id)
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
