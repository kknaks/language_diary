"""TTS Task Service — generates TTS audio for learning cards in background."""

import logging
import uuid
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.background_task import BackgroundTask
from app.models.learning import LearningCard
from app.services.tts_service import TTSService

logger = logging.getLogger(__name__)


async def create_tts_task(
    db: AsyncSession,
    diary_id: int,
    card_ids: List[int],
) -> str:
    """Create a background task record and return task_id.

    total = len(card_ids) * 2 (content_en + example_en per card)
    """
    task_id = str(uuid.uuid4())
    task = BackgroundTask(
        id=task_id,
        task_type="tts_generation",
        status="pending",
        diary_id=diary_id,
        progress=0,
        total=len(card_ids) * 2,  # content + example per card
    )
    db.add(task)
    await db.commit()
    return task_id


async def run_tts_generation(
    task_id: str,
    card_ids: List[int],
    session_factory: async_sessionmaker,
) -> None:
    """Background task: generate TTS for each learning card and save audio_url.

    Uses a new DB session from session_factory since background tasks run
    after the original request session is closed.
    """
    async with session_factory() as db:
        try:
            # Update status to processing
            task = await db.get(BackgroundTask, task_id)
            if not task:
                return
            task.status = "processing"
            await db.commit()

            tts_service = TTSService(db)

            for i, card_id in enumerate(card_ids):
                card = await db.get(LearningCard, card_id)
                if not card:
                    task.progress = i + 1
                    await db.commit()
                    continue

                try:
                    # Generate TTS for content_en (단어/구문 발음)
                    audio_url = await tts_service.generate_and_save(
                        text=card.content_en,
                        filename=f"card_{card_id}_content.mp3",
                    )
                    card.audio_url = audio_url
                    task.progress += 1
                    await db.commit()

                    # Generate TTS for example_en (예문 발음)
                    if card.example_en:
                        example_audio_url = await tts_service.generate_and_save(
                            text=card.example_en,
                            filename=f"card_{card_id}_example.mp3",
                        )
                        card.example_audio_url = example_audio_url
                    task.progress += 1
                    await db.commit()

                except Exception as e:
                    logger.warning("TTS failed for card %d: %s", card_id, e)
                    task.progress += 2  # count both as done even on failure
                    await db.commit()

            task.status = "completed"
            await db.commit()

        except Exception as e:
            logger.error("TTS task %s failed: %s", task_id, e)
            # Use a fresh session for error recording to avoid tainted session state
            async with session_factory() as error_db:
                task = await error_db.get(BackgroundTask, task_id)
                if task:
                    task.status = "failed"
                    task.error = str(e)
                    await error_db.commit()
