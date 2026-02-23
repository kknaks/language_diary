"""AI Service — OpenAI integration for conversation, diary generation, and learning points.

Uses Circuit Breaker + Retry with exponential backoff for resilience.
"""

import json
import logging
from typing import Any, Dict, List

from openai import AsyncOpenAI

from app.config import settings
from app.utils.circuit_breaker import CircuitBreaker, CircuitBreakerError, retry_with_backoff

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_CONVERSATION = """너는 사용자의 친근한 친구야. 사용자가 오늘 하루 있었던 일을 자연스럽게 이야기할 수 있도록 도와줘.

규칙:
1. 한국어로 대화해.
2. 친근하고 따뜻한 말투를 써. (반말 OK)
3. 사용자의 대답에 공감하고, 구체적인 후속 질문을 해.
4. 첫 질문은 "오늘 하루 어땠어?"처럼 개방형으로 시작해.
5. 감정, 사람, 장소, 구체적 상황에 대해 물어봐.
6. 한 번에 질문 하나만 해. 너무 길게 말하지 마.
7. 3턴 이상이면 자연스럽게 마무리를 유도할 수 있어.
8. 절대 영어로 대화하지 마. 오직 한국어만 사용해."""

SYSTEM_PROMPT_DIARY = """너는 대화 내용을 바탕으로 일기를 작성하는 AI야.

주어진 대화를 종합하여 아래 형식의 JSON을 반환해:
{
  "original_text": "한국어 일기 (자연스러운 일기체, 1~3문단)",
  "translated_text": "영어 번역 (자연스러운 영어 일기체, 한국어와 동일한 내용)"
}

규칙:
1. 대화에서 언급된 사건, 감정, 사람, 장소를 포함해.
2. 한국어 일기는 자연스러운 일기체로 작성해. (~했다, ~였다 체)
3. 영어 번역은 자연스러운 영어 일기체로 작성해.
4. JSON만 반환해. 다른 텍스트는 포함하지 마."""

SYSTEM_PROMPT_LEARNING = """너는 영어 학습 전문가야. 영어 일기에서 학습 포인트를 추출해.

아래 JSON 배열을 반환해:
[
  {
    "card_type": "word" 또는 "phrase",
    "content_en": "영어 단어 또는 구문",
    "content_ko": "한국어 뜻",
    "part_of_speech": "품사 (word일 때만, 예: noun, verb, adjective)",
    "cefr_level": "A1/A2/B1/B2/C1/C2",
    "example_en": "영어 예문 (일기 문맥 활용)",
    "example_ko": "한국어 예문 해석"
  }
]

규칙:
1. 단어(word) 3~5개 + 구문(phrase) 2~3개를 추출해.
2. CEFR 등급을 정확히 매겨. 고빈도 단어 우선.
3. 예문은 일기 본문에서 가져와.
4. JSON 배열만 반환해. 다른 텍스트는 포함하지 마."""

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

    async def get_first_message(self) -> str:
        """Generate the AI's opening question to start the conversation."""
        return await self._chat(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_CONVERSATION},
                {"role": "user", "content": "대화를 시작해줘. 첫 질문을 해줘."},
            ],
            max_tokens=150,
            temperature=0.8,
        )

    async def get_reply(self, conversation_history: List[Dict[str, str]]) -> str:
        """Generate AI follow-up question based on conversation history."""
        messages = [{"role": "system", "content": SYSTEM_PROMPT_CONVERSATION}]
        messages.extend(conversation_history)
        return await self._chat(messages=messages, max_tokens=200, temperature=0.8)

    async def generate_diary(self, conversation_history: List[Dict[str, str]]) -> Dict[str, str]:
        """Generate diary (Korean original + English translation) from conversation."""
        conversation_text = "\n".join(
            f"{'AI' if m['role'] == 'assistant' else '사용자'}: {m['content']}"
            for m in conversation_history
        )

        content = await self._chat(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_DIARY},
                {"role": "user", "content": f"아래 대화를 바탕으로 일기를 작성해줘:\n\n{conversation_text}"},
            ],
            max_tokens=1000,
            temperature=0.7,
        )
        return self._parse_json(content, {"original_text": "", "translated_text": ""})

    async def extract_learning_points(self, translated_text: str) -> List[Dict[str, Any]]:
        """Extract learning points (words + phrases) from English diary text."""
        content = await self._chat(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_LEARNING},
                {"role": "user", "content": f"아래 영어 일기에서 학습 포인트를 추출해줘:\n\n{translated_text}"},
            ],
            max_tokens=1500,
            temperature=0.5,
        )
        return self._parse_json(content, [])

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
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.error("Failed to parse AI response as JSON: %s", text[:200])
            return default
