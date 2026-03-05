from datetime import datetime
from typing import Optional
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LearningCard(Base):
    __tablename__ = "learning_cards"
    __table_args__ = (
        Index("idx_learning_cards_diary_id", "diary_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    diary_id: Mapped[int] = mapped_column(ForeignKey("diaries.id", ondelete="CASCADE"), nullable=False)
    card_type: Mapped[str] = mapped_column(String(10), nullable=False)  # word / phrase / sentence
    content_en: Mapped[str] = mapped_column(Text, nullable=False)
    origin_from: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_ko: Mapped[str] = mapped_column(Text, nullable=False)
    part_of_speech: Mapped[Optional[str]] = mapped_column(String(20))
    cefr_level: Mapped[Optional[str]] = mapped_column(String(5))
    example_en: Mapped[Optional[str]] = mapped_column(Text)
    example_ko: Mapped[Optional[str]] = mapped_column(Text)
    audio_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)          # content_en TTS
    example_audio_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)   # example_en TTS
    card_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    # relationships
    diary = relationship("Diary", back_populates="learning_cards")
    pronunciation_results = relationship("PronunciationResult", back_populates="card", cascade="all, delete-orphan")


class PronunciationResult(Base):
    __tablename__ = "pronunciation_results"
    __table_args__ = (
        Index("idx_pronunciation_results_card_id", "card_id"),
        Index("idx_pronunciation_results_user_id", "user_id"),
        Index("idx_pronunciation_results_card_section", "card_id", "section"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("learning_cards.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    section: Mapped[str] = mapped_column(String(20), server_default="content", nullable=False)
    reference_text: Mapped[Optional[str]] = mapped_column(Text)
    audio_url: Mapped[Optional[str]] = mapped_column(String(500))
    accuracy_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    fluency_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    completeness_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    overall_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    feedback: Mapped[Optional[str]] = mapped_column(Text)
    word_scores: Mapped[Optional[list]] = mapped_column(JSON)  # [{"word": "hello", "score": 95, "error_type": "None"}]
    attempt_number: Mapped[int] = mapped_column(Integer, server_default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    # relationships
    card = relationship("LearningCard", back_populates="pronunciation_results")
    user = relationship("User", back_populates="pronunciation_results")
