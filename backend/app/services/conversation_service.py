"""Conversation Service — orchestrates the conversation flow."""

import uuid
from typing import AsyncGenerator, Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    ForbiddenError,
    NotFoundError,
    SessionAlreadyCompletedError,
    SessionExpiredError,
    TranslationFailedError,
)

from app.models.conversation import ConversationMessage, ConversationSession
from app.models.diary import Diary
from app.models.learning import LearningCard
from app.repositories.conversation_repo import ConversationRepository
from app.repositories.seed_repo import SeedRepository
from app.schemas.conversation import (
    ConversationCreateResponse,
    ConversationDetailResponse,
    ConversationMessageResponse,
)
from app.schemas.diary import DiaryDetailResponse, LearningCardResponse
from app.services.ai_service import AIService, AIServiceError, MAX_TURNS


def _generate_session_id() -> str:
    return f"conv_{uuid.uuid4().hex[:12]}"


class ConversationService:
    def __init__(self, db: AsyncSession, ai_service: AIService = None):
        self.db = db
        self.repo = ConversationRepository(db)
        self.seed_repo = SeedRepository(db)
        self.ai = ai_service or AIService()

    async def create_session(
        self,
        user_id: int = 1,
        native_lang: str = "ko",
        personality: Optional[Dict] = None,
        cefr_level: Optional[str] = None,
        target_lang: Optional[str] = None,
    ) -> ConversationCreateResponse:
        """Create a new conversation session and return AI's first question."""
        session_id = _generate_session_id()
        session = await self.repo.create_session(session_id, user_id)

        # Generate AI first message
        try:
            first_message = await self.ai.get_first_message(
                native_lang=native_lang, personality=personality,
                cefr_level=cefr_level, target_lang=target_lang,
            )
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

    async def create_session_ws(self, user_id: int = 1) -> str:
        """Create a new conversation session (DB only, no AI message).

        Returns the session_id. Used by WebSocket handler.
        """
        session_id = _generate_session_id()
        await self.repo.create_session(session_id, user_id)
        await self.db.commit()
        return session_id

    async def generate_greeting(
        self,
        session_id: str,
        native_lang: str = "ko",
        personality: Optional[Dict] = None,
        cefr_level: Optional[str] = None,
        target_lang: Optional[str] = None,
    ) -> str:
        """Generate AI first greeting message and save to DB.

        Returns the greeting text.
        """
        try:
            first_message = await self.ai.get_first_message(
                native_lang=native_lang, personality=personality,
                cefr_level=cefr_level, target_lang=target_lang,
            )
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        await self.repo.add_message(session_id, "ai", first_message, message_order=1)
        await self.db.commit()
        return first_message

    async def get_session(self, session_id: str, user_id: Optional[int] = None) -> ConversationDetailResponse:
        """Get session status and message history."""
        session = await self.repo.get_session(session_id)
        if not session:
            raise NotFoundError(
                code="SESSION_NOT_FOUND",
                message="대화 세션을 찾을 수 없습니다.",
                detail="session_id=%s" % session_id,
            )
        if user_id is not None and session.user_id != user_id:
            raise ForbiddenError(
                code="FORBIDDEN",
                message="접근이 거부되었습니다.",
                detail="session_id=%s" % session_id,
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

    async def handle_user_message(
        self, session_id: str, text: str,
        native_lang: str = "ko",
        personality: Optional[Dict] = None,
        cefr_level: Optional[str] = None,
        target_lang: Optional[str] = None,
    ) -> str:
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

        # Transition created → active on first user message
        if session.status == "created":
            await self.repo.update_session_status(session, "active")

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
            ai_reply = await self.ai.get_reply(
                history, native_lang=native_lang, personality=personality,
                cefr_level=cefr_level, target_lang=target_lang,
            )
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        # Save AI reply
        await self.repo.add_message(session_id, "ai", ai_reply, message_order=current_order + 1)

        await self.db.commit()
        return ai_reply

    async def handle_user_message_streaming(
        self, session_id: str, text: str,
        native_lang: str = "ko",
        personality: Optional[Dict] = None,
        cefr_level: Optional[str] = None,
        target_lang: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Process user message and stream AI reply sentence by sentence.

        Yields sentences as they are generated. After the generator is exhausted,
        the full AI reply is saved to DB.
        Raises AppError if the session cannot handle messages.
        """
        session = await self.repo.get_session(session_id)
        if not session:
            raise NotFoundError(
                code="SESSION_NOT_FOUND",
                message="대화 세션을 찾을 수 없습니다.",
                detail=f"session_id={session_id}",
            )

        self._validate_session_active(session)

        # Transition created → active on first user message
        if session.status == "created":
            await self.repo.update_session_status(session, "active")

        current_order = len(session.messages) + 1

        # Save user message
        await self.repo.add_message(session_id, "user", text, message_order=current_order)
        await self.repo.increment_turn(session)

        # Build conversation history for OpenAI
        history = self._build_openai_history(session.messages, text, current_order)

        # Check if max turns reached — signal to caller (yield nothing)
        if session.turn_count + 1 >= MAX_TURNS:
            await self.db.commit()
            return

        # Stream AI reply sentence by sentence
        full_reply_parts = []  # type: List[str]
        try:
            async for sentence in self.ai.get_reply_streaming(
                history, native_lang=native_lang, personality=personality,
                cefr_level=cefr_level, target_lang=target_lang,
            ):
                full_reply_parts.append(sentence)
                yield sentence
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        # Save full AI reply
        full_reply = " ".join(full_reply_parts)
        await self.repo.add_message(session_id, "ai", full_reply, message_order=current_order + 1)
        await self.db.commit()

    async def handle_user_message_streaming_phrases(
        self, session_id: str, text: str,
        native_lang: str = "ko",
        personality: Optional[Dict] = None,
        cefr_level: Optional[str] = None,
        target_lang: Optional[str] = None,
    ) -> AsyncGenerator[Tuple[str, bool], None]:
        """Process user message and stream AI reply as (phrase, is_sentence) tuples.

        Yields (text, is_sentence_end) tuples. Only complete sentences
        (is_sentence_end=True) are collected for DB storage.
        """
        session = await self.repo.get_session(session_id)
        if not session:
            raise NotFoundError(
                code="SESSION_NOT_FOUND",
                message="대화 세션을 찾을 수 없습니다.",
                detail=f"session_id={session_id}",
            )

        self._validate_session_active(session)

        if session.status == "created":
            await self.repo.update_session_status(session, "active")

        current_order = len(session.messages) + 1

        await self.repo.add_message(session_id, "user", text, message_order=current_order)
        await self.repo.increment_turn(session)

        history = self._build_openai_history(session.messages, text, current_order)

        if session.turn_count + 1 >= MAX_TURNS:
            await self.db.commit()
            return

        # Stream AI reply as phrases
        full_reply_parts: List[str] = []
        try:
            async for phrase, is_sentence in self.ai.get_reply_streaming_phrases(
                history, native_lang=native_lang, personality=personality,
                cefr_level=cefr_level, target_lang=target_lang,
            ):
                if is_sentence:
                    full_reply_parts.append(phrase)
                else:
                    # Accumulate clause text for eventual sentence completion
                    full_reply_parts.append(phrase)
                yield phrase, is_sentence
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        full_reply = " ".join(full_reply_parts)
        await self.repo.add_message(session_id, "ai", full_reply, message_order=current_order + 1)
        await self.db.commit()

    async def finish_conversation(
        self, session_id: str, user_id: Optional[int] = None,
        native_lang: str = "ko", target_lang: str = "en",
        cefr_level: Optional[str] = None,
    ) -> DiaryDetailResponse:
        """Finish conversation: generate diary + learning points in a single LLM call.

        Returns the created diary with learning cards.
        """
        session = await self.repo.get_session(session_id)
        if not session:
            raise NotFoundError(
                code="SESSION_NOT_FOUND",
                message="대화 세션을 찾을 수 없습니다.",
                detail="session_id=%s" % session_id,
            )

        if user_id is not None and session.user_id != user_id:
            raise ForbiddenError(
                code="FORBIDDEN",
                message="접근이 거부되었습니다.",
                detail="session_id=%s" % session_id,
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

        # Fetch CEFR description from DB
        cefr_description = None
        if cefr_level:
            cefr_row = await self.seed_repo.get_cefr_level(cefr_level)
            if cefr_row:
                cefr_description = f"{cefr_row.name} - {cefr_row.description}"

        # Generate diary + learning points in a single LLM call
        try:
            result = await self.ai.generate_diary_with_learning(
                history,
                native_lang=native_lang,
                target_lang=target_lang,
                cefr_level=cefr_level,
                cefr_description=cefr_description,
            )
        except AIServiceError as e:
            raise TranslationFailedError(detail=str(e))

        learning_points_raw = result.get("learning_points", [])

        # Create diary in DB — use the session owner's user_id
        diary = Diary(
            user_id=session.user_id,
            title_original=result.get("title_original", ""),
            title_translated=result.get("title_translated", ""),
            original_text=result.get("original_text", ""),
            translated_text=result.get("translated_text", ""),
            status="translated",
        )
        self.db.add(diary)
        await self.db.flush()
        await self.db.refresh(diary)

        cards = []
        for i, lp in enumerate(learning_points_raw):
            card = LearningCard(
                diary_id=diary.id,
                card_type=lp.get("card_type", "word"),
                content_en=lp.get("content_en", ""),
                origin_from=lp.get("origin_from"),
                content_ko=lp.get("content_ko", ""),
                part_of_speech=lp.get("part_of_speech"),
                cefr_level=lp.get("cefr_level"),
                example_en=lp.get("example_en"),
                example_ko=lp.get("example_ko"),
                card_order=i + 1,
            )
            self.db.add(card)
            cards.append(card)

        # Split translated_text and original_text into sentences for sentence cards
        translated = result.get("translated_text", "")
        original = result.get("original_text", "")
        translated_sentences = [s.strip() for s in translated.split(".") if s.strip()]
        original_sentences = [s.strip() for s in original.split(".") if s.strip()]
        sentence_offset = len(cards)
        for j, (t_sent, o_sent) in enumerate(zip(translated_sentences, original_sentences)):
            card = LearningCard(
                diary_id=diary.id,
                card_type="sentence",
                content_en=t_sent + ".",
                origin_from=t_sent + ".",
                content_ko=o_sent + ".",
                part_of_speech=None,
                cefr_level=None,
                example_en=None,
                example_ko=None,
                card_order=sentence_offset + j + 1,
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
            title_original=diary.title_original,
            title_translated=diary.title_translated,
            original_text=diary.original_text,
            translated_text=diary.translated_text,
            status=diary.status,
            created_at=diary.created_at,
            updated_at=diary.updated_at,
            completed_at=diary.completed_at,
            learning_cards=[LearningCardResponse.model_validate(c) for c in cards],
        )

    async def finish_with_messages(
        self, session_id: str, messages: List[Dict[str, str]],
        user_id: Optional[int] = None,
        native_lang: str = "ko", target_lang: str = "en",
        cefr_level: Optional[str] = None,
    ) -> "DiaryDetailResponse":
        """Save externally-provided messages, then generate diary + learning cards.

        Used by the ConvAI flow where STT/LLM/TTS happen on ElevenLabs side
        and the frontend sends the accumulated transcript at the end.
        """
        session = await self.repo.get_session(session_id)
        if not session:
            raise NotFoundError(
                code="SESSION_NOT_FOUND",
                message="대화 세션을 찾을 수 없습니다.",
                detail="session_id=%s" % session_id,
            )

        if user_id is not None and session.user_id != user_id:
            raise ForbiddenError(
                code="FORBIDDEN",
                message="접근이 거부되었습니다.",
                detail="session_id=%s" % session_id,
            )

        self._validate_session_active(session)

        # Transition created → active if needed
        if session.status == "created":
            await self.repo.update_session_status(session, "active")

        # Store messages in DB
        for i, msg in enumerate(messages):
            role = "ai" if msg["role"] == "assistant" else "user"
            await self.repo.add_message(session_id, role, msg["content"], message_order=i + 1)

        # Update turn count
        user_turns = sum(1 for m in messages if m["role"] == "user")
        for _ in range(user_turns):
            await self.repo.increment_turn(session)

        await self.db.commit()

        # Reuse finish_conversation logic
        return await self.finish_conversation(
            session_id, native_lang=native_lang, target_lang=target_lang,
            cefr_level=cefr_level,
        )

    def _validate_session_active(self, session: ConversationSession) -> None:
        """Ensure session is in an active state (created or active)."""
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
