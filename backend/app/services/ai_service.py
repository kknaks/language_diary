"""AI Service — OpenAI integration for conversation, diary generation, and learning points.

Uses Circuit Breaker + Retry with exponential backoff for resilience.
"""

import json
import logging
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from openai import AsyncOpenAI

from app.config import settings
from app.utils.circuit_breaker import CircuitBreaker, CircuitBreakerError, retry_with_backoff
from app.utils.prompt_builder import (
    build_conversation_prompt,
    build_diary_prompt,
    build_diary_user_prompt,
    build_diary_with_learning_prompt,
    build_first_message_user_prompt,
    build_learning_prompt,
    build_learning_user_prompt,
    get_role_labels,
)

logger = logging.getLogger(__name__)

MAX_TURNS = 10

# Circuit breaker for OpenAI API
_openai_cb = CircuitBreaker(name="openai", failure_threshold=5, recovery_timeout=60.0)


class AIServiceError(Exception):
    """Raised when OpenAI API calls fail after retries."""
    pass


class AIService:
    """Handles all OpenAI interactions for conversation, diary generation, and learning points."""

    def __init__(self, client: AsyncOpenAI = None):
        self.client = client or AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def get_first_message(
        self,
        native_lang: str = "ko",
        personality: Optional[Dict[str, int]] = None,
        cefr_level: Optional[str] = None,
        target_lang: Optional[str] = None,
    ) -> str:
        """Generate the AI's opening question to start the conversation."""
        system_prompt = build_conversation_prompt(
            native_lang, personality, cefr_level=cefr_level, target_lang=target_lang,
        )
        user_prompt = build_first_message_user_prompt(native_lang)
        return await self._chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=150,
            temperature=0.8,
        )

    async def get_reply(
        self, conversation_history: List[Dict[str, str]],
        native_lang: str = "ko",
        personality: Optional[Dict[str, int]] = None,
        cefr_level: Optional[str] = None,
        target_lang: Optional[str] = None,
    ) -> str:
        """Generate AI follow-up question based on conversation history."""
        system_prompt = build_conversation_prompt(
            native_lang, personality, cefr_level=cefr_level, target_lang=target_lang,
        )
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(conversation_history)
        return await self._chat(messages=messages, max_tokens=200, temperature=0.8)

    async def get_reply_streaming(
        self, conversation_history: List[Dict[str, str]],
        native_lang: str = "ko",
        personality: Optional[Dict[str, int]] = None,
        cefr_level: Optional[str] = None,
        target_lang: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Generate AI reply with streaming, yielding complete sentences.

        Yields sentences as they are detected (split on .!? and Korean endings).
        """
        system_prompt = build_conversation_prompt(
            native_lang, personality, cefr_level=cefr_level, target_lang=target_lang,
        )
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(conversation_history)

        if _openai_cb and not _openai_cb.allow_request():
            raise AIServiceError("OpenAI 서비스를 일시적으로 사용할 수 없습니다.")

        try:
            stream = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=200,
                temperature=0.8,
                stream=True,
            )

            buffer = ""
            async for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    buffer += delta.content
                    # Try to split off complete sentences
                    while True:
                        sentence, rest = _split_first_sentence(buffer)
                        if sentence is None:
                            break
                        buffer = rest
                        yield sentence

            # Yield remaining text
            remaining = buffer.strip()
            if remaining:
                yield remaining

            if _openai_cb:
                _openai_cb.record_success()

        except Exception as e:
            if _openai_cb:
                _openai_cb.record_failure()
            raise AIServiceError(f"OpenAI API 호출 실패: {e}")

    async def generate_diary(
        self,
        conversation_history: List[Dict[str, str]],
        native_lang: str = "ko",
        target_lang: str = "en",
    ) -> Dict[str, str]:
        """Generate diary (native original + target translation) from conversation."""
        labels = get_role_labels(native_lang)
        conversation_text = "\n".join(
            f"{labels['ai'] if m['role'] == 'assistant' else labels['user']}: {m['content']}"
            for m in conversation_history
        )

        system_prompt = build_diary_prompt(native_lang, target_lang)
        user_prompt = build_diary_user_prompt(native_lang, conversation_text)

        content = await self._chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1000,
            temperature=0.7,
        )
        return self._parse_json(content, {"original_text": "", "translated_text": ""})

    async def extract_learning_points(
        self,
        translated_text: str,
        native_lang: str = "ko",
        target_lang: str = "en",
    ) -> List[Dict[str, Any]]:
        """Extract learning points (words + phrases) from target-language diary text."""
        system_prompt = build_learning_prompt(native_lang, target_lang)
        user_prompt = build_learning_user_prompt(native_lang, target_lang, translated_text)

        content = await self._chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1500,
            temperature=0.5,
        )
        return self._parse_json(content, [])

    async def generate_diary_with_learning(
        self,
        conversation_history: List[Dict[str, str]],
        native_lang: str = "ko",
        target_lang: str = "en",
        cefr_level: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate diary + learning points in a single LLM call."""
        labels = get_role_labels(native_lang)
        conversation_text = "\n".join(
            f"{labels['ai'] if m['role'] == 'assistant' else labels['user']}: {m['content']}"
            for m in conversation_history
        )

        system_prompt = build_diary_with_learning_prompt(native_lang, target_lang, cefr_level)
        user_prompt = build_diary_user_prompt(native_lang, conversation_text)

        content = await self._chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=2500,
            temperature=0.7,
        )
        default: Dict[str, Any] = {"original_text": "", "translated_text": "", "learning_points": []}
        return self._parse_json(content, default)

    async def _chat(self, messages: list, max_tokens: int, temperature: float) -> str:
        """Call OpenAI chat API with circuit breaker + retry."""
        try:
            response = await retry_with_backoff(
                func=lambda: self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                ),
                max_retries=2,
                base_delay=1.0,
                retryable_exceptions=(Exception,),
                circuit_breaker=_openai_cb,
            )
            return response.choices[0].message.content.strip()
        except CircuitBreakerError:
            raise AIServiceError("OpenAI 서비스를 일시적으로 사용할 수 없습니다.")
        except Exception as e:
            raise AIServiceError(f"OpenAI API 호출 실패: {e}")

    def _parse_json(self, text: str, default: Any) -> Any:
        """Parse JSON from AI response, handling markdown code blocks."""
        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first and last lines (```json and ```)
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.error("Failed to parse AI response as JSON: %s", text[:200])
            return default


# Sentence boundary pattern: matches .!? followed by space or end-of-string,
# or Korean sentence endings (다, 요, 죠, 네, 까) followed by space/end.
_SENTENCE_BOUNDARY = re.compile(
    r'([.!?](?:\s|$))'           # Latin punctuation
    r'|([다요죠네까][\.\!\?]?\s)'  # Korean endings + optional punctuation + space
)


def _split_first_sentence(text: str) -> "tuple[Optional[str], str]":
    """Split the first complete sentence from text.

    Returns (sentence, remaining) if a boundary is found,
    or (None, text) if no complete sentence yet.
    """
    match = _SENTENCE_BOUNDARY.search(text)
    if match:
        end = match.end()
        sentence = text[:end].strip()
        remaining = text[end:]
        if sentence:
            return sentence, remaining
    return None, text
