from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class CefrLevel(Base):
    __tablename__ = "cefr_levels"

    code: Mapped[str] = mapped_column(String(10), primary_key=True)   # A1, A2, ...
    group: Mapped[str] = mapped_column(String(20), nullable=False)     # 초급, 중급, 고급
    name: Mapped[str] = mapped_column(String(30), nullable=False)      # 입문, 초급, ...
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class Language(Base):
    __tablename__ = "languages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name_native: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)

    # relationships
    voices = relationship("Voice", back_populates="language")


class Avatar(Base):
    __tablename__ = "avatars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    thumbnail_url: Mapped[str] = mapped_column(String(500), nullable=False)
    primary_color: Mapped[str] = mapped_column(String(20), nullable=False)
    model_url: Mapped[str] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)


class Voice(Base):
    __tablename__ = "voices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    language_id: Mapped[int] = mapped_column(Integer, ForeignKey("languages.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    tone: Mapped[str] = mapped_column(String(50), nullable=True)
    elevenlabs_voice_id: Mapped[str] = mapped_column(String(100), nullable=False)
    sample_url: Mapped[str] = mapped_column(String(500), nullable=True)
    description: Mapped[str] = mapped_column(String(500), nullable=True)
    volume_gain_db: Mapped[float] = mapped_column(Float, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)

    # relationships
    language = relationship("Language", back_populates="voices")
