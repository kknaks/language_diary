"""ConvAI endpoints — ElevenLabs Conversational AI integration."""

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.convai_service import ConvAIService
from app.services.conversation_service import ConversationService

router = APIRouter(prefix="/convai", tags=["convai"])


# --- Request / Response schemas ---

class ConvAISessionResponse(BaseModel):
    session_id: str
    signed_url: str


class ConvAIMessageItem(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ConvAIFinishRequest(BaseModel):
    messages: List[ConvAIMessageItem]


# --- Endpoints ---

@router.post("/session", response_model=ConvAISessionResponse)
async def create_convai_session(db: AsyncSession = Depends(get_db)):
    """Create a DB session and return a signed ElevenLabs ConvAI WebSocket URL."""
    convai = ConvAIService()
    signed_url = await convai.get_signed_url()

    svc = ConversationService(db)
    session_id = await svc.create_session_ws()

    return ConvAISessionResponse(session_id=session_id, signed_url=signed_url)


@router.post("/session/{session_id}/finish")
async def finish_convai_session(
    session_id: str,
    body: ConvAIFinishRequest,
    db: AsyncSession = Depends(get_db),
):
    """Receive conversation messages from the frontend and generate diary + learning cards."""
    svc = ConversationService(db)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    diary = await svc.finish_with_messages(session_id, messages)
    return diary
