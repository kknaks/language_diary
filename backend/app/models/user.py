from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    native_lang: Mapped[str] = mapped_column(String(10), server_default="ko", nullable=False)
    target_lang: Mapped[str] = mapped_column(String(10), server_default="en", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # relationships
    diaries = relationship("Diary", back_populates="user")
    conversation_sessions = relationship("ConversationSession", back_populates="user")
    pronunciation_results = relationship("PronunciationResult", back_populates="user")
