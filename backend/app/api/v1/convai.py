"""ConvAI endpoints — ElevenLabs Conversational AI integration."""

from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_onboarded_user
from app.models.user import User
from app.services.convai_service import ConvAIService
from app.services.conversation_service import ConversationService


async def _resolve_user_langs(
    db: AsyncSession, user_id: int,
) -> Tuple[str, str]:
    """Look up user profile and return (native_lang, target_lang).

    Returns defaults ("ko", "en") if profile not found.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.profile import UserProfile

    result = await db.execute(
        select(UserProfile)
        .where(UserProfile.user_id == user_id)
        .options(
            selectinload(UserProfile.native_language),
            selectinload(UserProfile.target_language),
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        return "ko", "en"
    native = profile.native_language.code if profile.native_language else "ko"
    target = profile.target_language.code if profile.target_language else "en"
    return native, target

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
async def create_convai_session(
    current_user: User = Depends(get_onboarded_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a DB session and return a signed ElevenLabs ConvAI WebSocket URL."""
    convai = ConvAIService()
    signed_url = await convai.get_signed_url()

    svc = ConversationService(db)
    session_id = await svc.create_session_ws(user_id=current_user.id)

    return ConvAISessionResponse(session_id=session_id, signed_url=signed_url)


@router.post("/session/{session_id}/finish")
async def finish_convai_session(
    session_id: str,
    body: ConvAIFinishRequest,
    current_user: User = Depends(get_onboarded_user),
    db: AsyncSession = Depends(get_db),
):
    """Receive conversation messages from the frontend and generate diary + learning cards."""
    native_lang, target_lang = await _resolve_user_langs(db, current_user.id)
    svc = ConversationService(db)
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    diary = await svc.finish_with_messages(
        session_id, messages, user_id=current_user.id,
        native_lang=native_lang, target_lang=target_lang,
    )
    return diary
