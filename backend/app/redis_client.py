"""Async Redis client singleton with graceful degradation."""

import logging
from typing import Optional

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> Optional[aioredis.Redis]:
    """Return the shared async Redis connection pool, creating it on first call.

    Returns None if Redis is unavailable (graceful degradation).
    """
    global _redis
    if _redis is not None:
        return _redis
    try:
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=False,
            max_connections=20,
        )
        await _redis.ping()
        logger.info("Redis connected: %s", settings.REDIS_URL)
        return _redis
    except Exception as e:
        logger.warning("Redis unavailable, running without cache: %s", e)
        _redis = None
        return None


async def close_redis() -> None:
    """Close the Redis connection pool (call on app shutdown)."""
    global _redis
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            pass
        _redis = None
        logger.info("Redis connection closed")
