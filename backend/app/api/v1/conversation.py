"""Conversation API — REST endpoints + WebSocket for real-time chat."""

import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, get_db
from app.exceptions import AppError
from app.schemas.conversation import ConversationCreateResponse, ConversationDetailResponse
from app.services.ai_service import AIService
from app.services.conversation_service import ConversationService

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
    """WebSocket handler for real-time conversation.

    Client messages:
      { "type": "message", "text": "..." }
      { "type": "finish" }

    Server messages:
      { "type": "ai_message", "text": "..." }
      { "type": "diary_created", "diary": {...}, "learning_cards": [...] }
      { "type": "error", "code": "...", "message": "..." }
    """
    await websocket.accept()

    async with async_session() as db:
        service = ConversationService(db)

        try:
            while True:
                raw = await websocket.receive_text()
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    await websocket.send_json(
                        {"type": "error", "code": "VALIDATION_ERROR", "message": "유효하지 않은 JSON입니다."}
                    )
                    continue

                msg_type = data.get("type")

                if msg_type == "message":
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
                        # Max turns reached — auto-finish
                        await db.commit()
                        diary_resp = await service.finish_conversation(session_id)
                        await websocket.send_json(
                            {"type": "diary_created", "diary": diary_resp.model_dump(mode="json")}
                        )
                        break
                    else:
                        await websocket.send_json({"type": "ai_message", "text": ai_reply})

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
            try:
                await websocket.close()
            except Exception:
                pass
