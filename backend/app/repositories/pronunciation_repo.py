"""Repository for pronunciation results database operations."""

from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning import PronunciationResult


class PronunciationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_next_attempt_number(self, card_id: int, user_id: int) -> int:
        """Get the next attempt number for a card/user pair."""
        stmt = (
            select(func.coalesce(func.max(PronunciationResult.attempt_number), 0))
            .where(
                PronunciationResult.card_id == card_id,
                PronunciationResult.user_id == user_id,
            )
        )
        result = await self.db.execute(stmt)
        max_attempt = result.scalar_one()
        return max_attempt + 1

    async def get_latest_by_card_ids(
        self, card_ids: list[int], user_id: int
    ) -> dict[int, PronunciationResult]:
        """Get the latest pronunciation result per card for a user."""
        # Subquery: max attempt_number per card
        sub = (
            select(
                PronunciationResult.card_id,
                func.max(PronunciationResult.attempt_number).label("max_attempt"),
            )
            .where(
                PronunciationResult.card_id.in_(card_ids),
                PronunciationResult.user_id == user_id,
            )
            .group_by(PronunciationResult.card_id)
            .subquery()
        )
        stmt = (
            select(PronunciationResult)
            .join(
                sub,
                (PronunciationResult.card_id == sub.c.card_id)
                & (PronunciationResult.attempt_number == sub.c.max_attempt)
                & (PronunciationResult.user_id == user_id),
            )
        )
        result = await self.db.execute(stmt)
        rows = result.scalars().all()
        return {r.card_id: r for r in rows}

    async def create(
        self,
        card_id: int,
        user_id: int,
        attempt_number: int,
        reference_text: Optional[str] = None,
        audio_url: Optional[str] = None,
        accuracy_score: Optional[Decimal] = None,
        fluency_score: Optional[Decimal] = None,
        completeness_score: Optional[Decimal] = None,
        overall_score: Optional[Decimal] = None,
        feedback: Optional[str] = None,
        word_scores: Optional[list] = None,
    ) -> PronunciationResult:
        result = PronunciationResult(
            card_id=card_id,
            user_id=user_id,
            reference_text=reference_text,
            audio_url=audio_url,
            accuracy_score=accuracy_score,
            fluency_score=fluency_score,
            completeness_score=completeness_score,
            overall_score=overall_score,
            feedback=feedback,
            word_scores=word_scores,
            attempt_number=attempt_number,
        )
        self.db.add(result)
        await self.db.flush()
        await self.db.refresh(result)
        return result
