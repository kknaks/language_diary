from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import ConversationMessage, ConversationSession


class ConversationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_session(self, session_id: str, user_id: int) -> ConversationSession:
        session = ConversationSession(
            id=session_id,
            user_id=user_id,
            status="active",
            turn_count=0,
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def get_session(self, session_id: str) -> Optional[ConversationSession]:
        stmt = (
            select(ConversationSession)
            .options(selectinload(ConversationSession.messages))
            .where(ConversationSession.id == session_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_session_status(
        self, session: ConversationSession, status: str
    ) -> ConversationSession:
        session.status = status
        session.updated_at = datetime.utcnow()
        if status == "completed":
            session.completed_at = datetime.utcnow()
        elif status == "expired":
            session.expired_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def set_diary_id(
        self, session: ConversationSession, diary_id: int
    ) -> ConversationSession:
        session.diary_id = diary_id
        session.updated_at = datetime.utcnow()
        await self.db.flush()
        return session

    async def increment_turn(self, session: ConversationSession) -> ConversationSession:
        session.turn_count += 1
        session.updated_at = datetime.utcnow()
        await self.db.flush()
        return session

    async def add_message(
        self, session_id: str, role: str, content: str, message_order: int
    ) -> ConversationMessage:
        msg = ConversationMessage(
            session_id=session_id,
            role=role,
            content=content,
            message_order=message_order,
        )
        self.db.add(msg)
        await self.db.flush()
        await self.db.refresh(msg)
        return msg

    async def get_messages(self, session_id: str) -> List[ConversationMessage]:
        stmt = (
            select(ConversationMessage)
            .where(ConversationMessage.session_id == session_id)
            .order_by(ConversationMessage.message_order)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
