"""ConvAI Service — fetches signed WebSocket URLs from ElevenLabs Conversational AI."""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_CONVAI_BASE = "https://api.elevenlabs.io/v1/convai/conversation"


class ConvAIService:
    async def get_signed_url(self, agent_id: str | None = None) -> str:
        """Get a signed WebSocket URL for ElevenLabs Conversational AI.

        The URL is valid for ~15 minutes.
        """
        aid = agent_id or settings.ELEVENLABS_AGENT_ID
        if not aid:
            raise ValueError("ELEVENLABS_AGENT_ID is not configured")

        url = f"{ELEVENLABS_CONVAI_BASE}/get_signed_url"
        params = {"agent_id": aid}
        headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        signed_url = data.get("signed_url")
        if not signed_url:
            raise RuntimeError("ElevenLabs did not return a signed_url")

        logger.info("ConvAI signed URL obtained for agent %s", aid)
        return signed_url
