"""Seed data loader — languages, avatars, voices.

Usage:
    cd backend
    python -m app.scripts.seed_data
"""
import asyncio
import json
import os
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.seed import Avatar, Language, Voice

SEEDS_DIR = Path(__file__).resolve().parent.parent.parent / "seeds"


async def _upsert_languages(session: AsyncSession) -> None:
    data = json.loads((SEEDS_DIR / "languages.json").read_text(encoding="utf-8"))
    for item in data:
        existing = await session.execute(select(Language).where(Language.id == item["id"]))
        if existing.scalar_one_or_none() is None:
            session.add(Language(**item))
    await session.flush()


async def _upsert_avatars(session: AsyncSession) -> None:
    data = json.loads((SEEDS_DIR / "avatars.json").read_text(encoding="utf-8"))
    for item in data:
        result = await session.execute(select(Avatar).where(Avatar.id == item["id"]))
        existing = result.scalar_one_or_none()
        if existing is None:
            session.add(Avatar(**item))
        else:
            for key, value in item.items():
                if key != "id":
                    setattr(existing, key, value)
    await session.flush()


async def _upsert_voices(session: AsyncSession) -> None:
    data = json.loads((SEEDS_DIR / "voices.json").read_text(encoding="utf-8"))
    for item in data:
        result = await session.execute(select(Voice).where(Voice.id == item["id"]))
        existing = result.scalar_one_or_none()
        if existing is None:
            session.add(Voice(**item))
        else:
            # 기존 레코드 업데이트 (elevenlabs_voice_id 등 변경 반영)
            for key, value in item.items():
                if key != "id":
                    setattr(existing, key, value)
    await session.flush()


async def seed_all(db_url: str = None) -> None:
    url = db_url or settings.DATABASE_URL
    engine = create_async_engine(url)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        await _upsert_languages(session)
        await _upsert_avatars(session)
        await _upsert_voices(session)
        await session.commit()
        print("Seed data loaded successfully.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_all())
