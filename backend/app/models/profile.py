from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    native_language_id: Mapped[int] = mapped_column(Integer, ForeignKey("languages.id"), nullable=False)
    target_language_id: Mapped[int] = mapped_column(Integer, ForeignKey("languages.id"), nullable=False)
    avatar_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("avatars.id"), nullable=True)
    avatar_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    voice_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("voices.id"), nullable=True)
    empathy: Mapped[int] = mapped_column(Integer, server_default="34", nullable=False)
    intuition: Mapped[int] = mapped_column(Integer, server_default="33", nullable=False)
    logic: Mapped[int] = mapped_column(Integer, server_default="33", nullable=False)
    app_locale: Mapped[str] = mapped_column(String(10), server_default="ko", nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)  # noqa: E501

    # relationships
    user = relationship("User", back_populates="profile")
    native_language = relationship("Language", foreign_keys=[native_language_id])
    target_language = relationship("Language", foreign_keys=[target_language_id])
    avatar = relationship("Avatar")
    voice = relationship("Voice")
