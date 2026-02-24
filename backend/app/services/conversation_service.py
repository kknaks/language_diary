"""Conversation Service — orchestrates the conversation flow."""

import uuid
from typing import Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    NotFoundError,
    SessionAlreadyCompletedError,
    SessionExpiredError,
    TranslationFailedError,
)
from app.models.conversation import ConversationMessage, ConversationSession
from app.models.diary import Diary
from app.models.learning import LearningCard
from app.repositories.conversation_repo import ConversationRepository
from app.schemas.conversation import (
    ConversationCreateResponse,
    ConversationDetailResponse,
    ConversationMessageResponse,
)
from app.schemas.diary import DiaryDetailResponse, LearningCardResponse
from app.services.ai_service import AIService, AIServiceError, MAX_TURNS

MVP_USER_ID = 1


def _generate_session_id() -> str:
    return f"conv_{uuid.uuid4().hex[:12]}"


class ConversationService:
    def __init__(self, db: AsyncSession, ai_service: AIService = None):
        self.db = db
        self.repo = ConversationRepository(db)
        self.ai = ai_service or AIService()

    async def create_session(self) -> ConversationCreateResponse:
        """Create a new conversation session and return AI's first question."""
        session_id = _generate_session_id()
        session = await self.repo.create_session(session_id, MVP_USER_ID)

        # Generate AI first message
        try:
            first_message = await self.ai.get_first_message()
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        # Store the AI's first message
        await self.repo.add_message(session_id, "ai", first_message, message_order=1)

        await self.db.commit()
        await self.db.refresh(session)

        return ConversationCreateResponse(
            session_id=session.id,
            status=session.status,
            first_message=first_message,
            created_at=session.created_at,
        )

    async def get_session(self, session_id: str) -> ConversationDetailResponse:
        """Get session status and message history."""
        session = await self.repo.get_session(session_id)
        if not session:
            raise NotFoundError(
                code="SESSION_NOT_FOUND",
                message="대화 세션을 찾을 수 없습니다.",
                detail=f"session_id={session_id}",
            )

        # Query messages separately to always get fresh data
        messages = await self.repo.get_messages(session_id)

        return ConversationDetailResponse(
            session_id=session.id,
            status=session.status,
            turn_count=session.turn_count,
            created_at=session.created_at,
            updated_at=session.updated_at,
            completed_at=session.completed_at,
            expired_at=session.expired_at,
            diary_id=session.diary_id,
            messages=[ConversationMessageResponse.model_validate(m) for m in messages],
        )

    async def handle_user_message(self, session_id: str, text: str) -> str:
        """Process user message and return AI reply.

        Returns the AI's response text.
        Raises SessionExpiredError, SessionAlreadyCompletedError, or NotFoundError.
        """
        session = await self.repo.get_session(session_id)
        if not session:
            raise NotFoundError(
                code="SESSION_NOT_FOUND",
                message="대화 세션을 찾을 수 없습니다.",
                detail=f"session_id={session_id}",
            )

        self._validate_session_active(session)

        # Determine message order
        current_order = len(session.messages) + 1

        # Save user message
        await self.repo.add_message(session_id, "user", text, message_order=current_order)

        # Increment turn count
        await self.repo.increment_turn(session)

        # Build conversation history for OpenAI
        history = self._build_openai_history(session.messages, text, current_order)

        # Check if max turns reached — auto-finish
        if session.turn_count + 1 >= MAX_TURNS:
            return None  # Signal to caller to auto-finish

        # Get AI reply
        try:
            ai_reply = await self.ai.get_reply(history)
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        # Save AI reply
        await self.repo.add_message(session_id, "ai", ai_reply, message_order=current_order + 1)

        await self.db.commit()
        return ai_reply

    async def finish_conversation(self, session_id: str) -> DiaryDetailResponse:
        """Finish conversation: generate diary + learning points.

        Returns the created diary with learning cards.
        """
        session = await self.repo.get_session(session_id)
        if not session:
            raise NotFoundError(
                code="SESSION_NOT_FOUND",
                message="대화 세션을 찾을 수 없습니다.",
                detail=f"session_id={session_id}",
            )

        self._validate_session_active(session)

        # Transition to summarizing
        await self.repo.update_session_status(session, "summarizing")
        await self.db.commit()

        # Build full conversation history
        messages = await self.repo.get_messages(session_id)
        history = [
            {"role": "assistant" if m.role == "ai" else "user", "content": m.content}
            for m in messages
        ]

        # Generate diary
        try:
            diary_data = await self.ai.generate_diary(history)
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        # Create diary in DB
        diary = Diary(
            user_id=MVP_USER_ID,
            original_text=diary_data.get("original_text", ""),
            translated_text=diary_data.get("translated_text", ""),
            status="translated",
        )
        self.db.add(diary)
        await self.db.flush()
        await self.db.refresh(diary)

        # Extract learning points
        try:
            learning_points = await self.ai.extract_learning_points(
                diary_data.get("translated_text", "")
            )
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        cards = []
        for i, lp in enumerate(learning_points):
            card = LearningCard(
                diary_id=diary.id,
                card_type=lp.get("card_type", "word"),
                content_en=lp.get("content_en", ""),
                content_ko=lp.get("content_ko", ""),
                part_of_speech=lp.get("part_of_speech"),
                cefr_level=lp.get("cefr_level"),
                example_en=lp.get("example_en"),
                example_ko=lp.get("example_ko"),
                card_order=i + 1,
            )
            self.db.add(card)
            cards.append(card)

        # Link diary to session and mark completed
        await self.repo.set_diary_id(session, diary.id)
        await self.repo.update_session_status(session, "completed")
        await self.db.commit()

        await self.db.refresh(diary)
        for card in cards:
            await self.db.refresh(card)

        return DiaryDetailResponse(
            id=diary.id,
            user_id=diary.user_id,
            original_text=diary.original_text,
            translated_text=diary.translated_text,
            status=diary.status,
            created_at=diary.created_at,
            updated_at=diary.updated_at,
            completed_at=diary.completed_at,
            learning_cards=[LearningCardResponse.model_validate(c) for c in cards],
        )

    def _validate_session_active(self, session: ConversationSession) -> None:
        """Ensure session is in an active state."""
        if session.status in ("completed", "summarizing"):
            raise SessionAlreadyCompletedError(detail=f"session_id={session.id}")
        if session.status == "expired":
            raise SessionExpiredError(detail=f"session_id={session.id}")

    def _build_openai_history(
        self,
        existing_messages: List[ConversationMessage],
        new_user_text: str,
        new_order: int,
    ) -> List[Dict[str, str]]:
        """Build OpenAI message list from stored messages + new user message."""
        history = []
        for m in sorted(existing_messages, key=lambda x: x.message_order):
            role = "assistant" if m.role == "ai" else "user"
            history.append({"role": role, "content": m.content})
        # Append the new user message
        history.append({"role": "user", "content": new_user_text})
        return history
