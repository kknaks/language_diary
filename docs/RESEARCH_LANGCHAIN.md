# LangChain 도입 가능성 조사

> 작성일: 2025-02-25
> 대상: `backend/` STT→LLM→TTS 실시간 스트리밍 파이프라인

---

## 1. 현재 구현 분석

### 1.1 파이프라인 흐름

```
사용자 음성 (PCM 16kHz 16-bit mono)
  → STT (ElevenLabs Scribe v2 WebSocket, VAD 기반 자동 커밋)
  → stt_final 텍스트
  → LLM (OpenAI gpt-4o-mini, stream=True)
  → 문장 단위 분리 (한국어 종결어미 정규식)
  → 각 문장 → TTS (ElevenLabs Streaming WebSocket, flush=True)
  → tts_audio (base64 MP3 chunks)
  → 클라이언트 WebSocket
```

### 1.2 핵심 구현 포인트

| 구현 항목 | 파일 | 설명 |
|-----------|------|------|
| **문장 단위 분리** | `ai_service.py` | `_split_first_sentence()` — 정규식으로 `.!?` + 한국어 종결어미(`다, 요, 죠, 네, 까`) 감지 |
| **서킷 브레이커** | `circuit_breaker.py` | `CircuitBreaker` (failure_threshold=5, recovery_timeout=60s) + `retry_with_backoff()` |
| **Barge-in** | `conversation.py` | `pipeline_state`에 `llm_task`, `tts_session`, `relay_task` 저장 → `asyncio.Task.cancel()` |
| **TTS 스트리밍** | `tts_service.py` | `TTSStreamSession` — 단일 WS 연결로 다수 문장 flush, REST 폴백 포함 |
| **STT 세션 관리** | `stt_service.py` | `STTSession` — ElevenLabs 실시간 STT, VAD 모드, 부분/최종 결과 콜백 |
| **대화 이력** | `conversation_service.py` | DB 기반 수동 이력 관리 (`_build_openai_history()`) |

### 1.3 LLM 스트리밍 코드 (현재)

```python
# ai_service.py — get_reply_streaming()
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
        while True:
            sentence, rest = _split_first_sentence(buffer)
            if sentence is None:
                break
            buffer = rest
            yield sentence
```

이 코드는 **OpenAI SDK를 직접 호출**하고, 토큰을 버퍼에 축적한 뒤 정규식으로 문장 경계를 감지하여 **문장 단위로 yield**한다. 이 문장 단위 yield가 TTS WebSocket의 `flush=True`와 결합되어 초저지연 음성 스트리밍을 실현한다.

---

## 2. LangChain 도입 시 이점

### 2.1 LCEL (LangChain Expression Language) 패턴

```python
# LangChain 도입 시 LLM 호출 코드 (가상)
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT_CONVERSATION),
    ("placeholder", "{history}"),
    ("human", "{input}"),
])
llm = ChatOpenAI(model="gpt-4o-mini", max_tokens=200, temperature=0.8, streaming=True)
chain = prompt | llm

# 스트리밍
async for chunk in chain.astream({"history": history, "input": user_text}):
    token = chunk.content  # 토큰 단위
```

**이점:**
- ✅ 프롬프트 템플릿 재사용, 체인 조합이 선언적
- ✅ `init_chat_model()`로 프로바이더 교체 용이 (OpenAI → Anthropic → Google 등)
- ✅ LangSmith 통합으로 트레이싱/디버깅 가능

### 2.2 `.astream()` vs 현재 직접 호출

| 비교 항목 | 현재 (`openai` SDK 직접) | LangChain `.astream()` |
|-----------|--------------------------|----------------------|
| 스트리밍 단위 | 토큰 (chunk.choices[0].delta) | 토큰 (AIMessageChunk) |
| 문장 분리 | 직접 구현 (`_split_first_sentence`) | **직접 구현 필요** (동일) |
| 코드량 | ~10줄 | ~10줄 (동일 수준) |
| 에러 타입 | `openai.APIError` 등 | `langchain_core` 래핑 에러 |
| 취소 | `async for` 루프 탈출 | `async for` 루프 탈출 (동일) |

**핵심:** `.astream()`은 내부적으로 OpenAI SDK의 `stream=True`를 호출하므로 **스트리밍 동작은 동일**하다. 추가 레이어를 거칠 뿐이다.

### 2.3 메모리 관리

| 비교 항목 | 현재 | LangChain |
|-----------|------|-----------|
| 이력 저장 | PostgreSQL (ConversationMessage 테이블) | `ConversationBufferMemory` (인메모리) 또는 커스텀 |
| 이력 조회 | `_build_openai_history()` — DB에서 정렬 후 변환 | 자동 주입 (체인에 메모리 바인딩) |
| 영속성 | ✅ DB 기반, 서버 재시작 후에도 유지 | ❌ 기본은 인메모리, DB 연동 시 커스텀 필요 |
| 제어력 | ✅ 완전한 제어 (message_order, turn_count 등) | ⚠️ 메모리 클래스의 인터페이스에 맞춰야 함 |

**판단:** 현재 DB 기반 이력 관리가 이미 **더 견고**하다. LangChain의 메모리 추상화는 인메모리 프로토타이핑에는 편리하지만, 프로덕션 DB 기반 관리에서는 오히려 간접 레이어가 된다.

---

## 3. LangChain 도입 시 단점/리스크

### 3.1 문장 단위 분리 로직 호환성 — ⚠️ 비호환

**현재 구현의 핵심:**
```python
_SENTENCE_BOUNDARY = re.compile(
    r'([.!?](?:\s|$))'           # 영문 구두점
    r'|([다요죠네까][\.\!\?]?\s)'  # 한국어 종결어미 + 선택적 구두점 + 공백
)
```

LangChain의 `.astream()`은 **토큰 단위 `AIMessageChunk`**를 yield한다. 문장 단위 분리를 위해서는:

1. 토큰을 버퍼에 축적
2. 정규식으로 문장 경계 감지
3. 완성된 문장을 TTS로 전달

이 로직은 LangChain이 제공하지 않으므로 **어차피 동일한 커스텀 코드가 필요**하다. LangChain에는 "문장 단위 스트리밍" 추상화가 없다.

```python
# LangChain 사용 시에도 결국 이렇게 된다
buffer = ""
async for chunk in chain.astream({"history": history, "input": user_text}):
    buffer += chunk.content
    while True:
        sentence, rest = _split_first_sentence(buffer)
        if sentence is None:
            break
        buffer = rest
        yield sentence
```

→ **현재 코드와 사실상 동일**, OpenAI SDK 호출 부분만 LangChain으로 대체될 뿐.

### 3.2 서킷 브레이커 + 재시도 로직 — ⚠️ 재구현 필요

현재 `retry_with_backoff()` + `CircuitBreaker`는 비동기 함수를 감싸는 커스텀 유틸리티다.

LangChain은 자체적으로 `max_retries` 파라미터를 제공하지만:
- ❌ 서킷 브레이커 패턴은 미지원
- ⚠️ 재시도 로직이 내부에 숨겨져 있어 세밀한 제어 불가
- ⚠️ `get_reply_streaming()`에서 서킷 브레이커의 `allow_request()` / `record_success()` / `record_failure()`를 수동 호출하는 현재 패턴과 호환 어려움

LangChain의 `with_retry()` Runnable 메서드가 있지만, 스트리밍 컨텍스트에서 서킷 브레이커와 조합하려면 커스텀 래퍼가 필요하다.

### 3.3 Barge-in (asyncio.Task 취소) — ✅ 가능하지만 동일

현재:
```python
llm_task = asyncio.create_task(_run_llm())
pipeline_state["llm_task"] = llm_task
# barge-in 시:
llm_task.cancel()  # → _run_llm() 내부 async for 루프에서 CancelledError
```

LangChain `.astream()` 도 `async for` 기반이므로:
```python
# LangChain 사용 시에도 동일하게 동작
async def _run_llm():
    async for chunk in chain.astream(params):
        # ...
llm_task = asyncio.create_task(_run_llm())
llm_task.cancel()  # → CancelledError 전파, 동일
```

**결론:** Barge-in 처리는 LangChain 도입과 무관하게 동일하다. LangChain이 특별히 도움을 주지도, 방해하지도 않는다.

### 3.4 레이턴시 오버헤드 — ⚠️ 미미하지만 존재

LangChain이 추가하는 레이어:
1. `ChatPromptTemplate` → 메시지 포맷 변환 (~0.1ms)
2. `ChatOpenAI` → 내부적으로 OpenAI SDK 호출 (래핑 오버헤드 ~1-2ms)
3. `AIMessageChunk` 파싱 → 토큰마다 객체 생성 (~0.01ms/token)

**총 추가 오버헤드: ~2-5ms/턴** (첫 토큰 기준)

현재 파이프라인에서 LLM 첫 문장까지의 지연이 200-500ms 수준임을 감안하면 **체감 차이는 거의 없다**.

단, 메모리 사용량은 증가한다:
- `langchain-core`, `langchain`, `langchain-openai` 임포트 시 ~50-80MB 추가
- 토큰마다 `AIMessageChunk` 객체 생성 → GC 부담 미미

### 3.5 패키지 의존성 리스크 — ❌ 높음

현재 `requirements.txt`에 LangChain 관련 패키지 없음. 도입 시:

```
langchain>=0.3
langchain-core>=0.3
langchain-openai>=0.3
```

**리스크:**
- **의존성 트리 폭발:** `langchain-core`만 해도 `pydantic`, `tenacity`, `jsonpatch`, `packaging`, `PyYAML`, `typing-extensions` 등 다수 의존성
- **버전 충돌:** 현재 `pydantic-settings==2.7.*` 사용 중 — LangChain의 pydantic 요구사항과 충돌 가능성
- **업데이트 빈도:** LangChain은 API 변경이 잦음 (0.1 → 0.2 → 0.3 과정에서 여러 번 breaking change)
- **패키지 크기:** `pip install langchain langchain-openai` → 약 15-25개 추가 패키지

---

## 4. LangChain Streaming + WebSocket 통합 패턴

### 4.1 FastAPI WebSocket + `.astream()` — ✅ 가능

```python
# 가상 통합 코드
async def _run_llm_langchain(chain, params, tts_session, websocket):
    buffer = ""
    index = 0
    async for chunk in chain.astream(params):
        if chunk.content:
            buffer += chunk.content
            while True:
                sentence, rest = _split_first_sentence(buffer)
                if sentence is None:
                    break
                buffer = rest
                await websocket.send_json({
                    "type": "ai_message_chunk",
                    "text": sentence,
                    "index": index,
                    "is_final": False,
                })
                await tts_session.send_sentence(sentence)
                index += 1
```

**가능하지만, 현재 코드와 거의 동일한 구조가 된다.**

### 4.2 Callbacks vs LCEL `.astream()` — LCEL 선호

| 방식 | 설명 | 적합성 |
|------|------|--------|
| `AsyncIteratorCallbackHandler` | 콜백 기반, 레거시 패턴 | ❌ 복잡, 디버깅 어려움 |
| LCEL `.astream()` | `async for` 기반, 현대적 | ✅ 현재 코드와 패턴 동일 |
| `.astream_events()` | 이벤트 기반, 메타데이터 포함 | ⚠️ 오버스펙 (이 프로젝트에서 불필요) |

**만약 LangChain을 쓴다면 LCEL `.astream()`이 적합하다.** 하지만 이 경우에도 현재 OpenAI SDK 직접 호출과 실질적 차이가 없다.

### 4.3 pipeline_state 관리 — ⚠️ 변경 불필요

현재 `pipeline_state`에 저장하는 항목:
- `llm_task`: `asyncio.Task` — LLM 스트리밍 루프
- `tts_session`: `TTSStreamSession` — TTS WebSocket 세션
- `relay_task`: `asyncio.Task` — TTS 오디오 릴레이

이 구조는 **LangChain 도입과 무관**하다. LangChain은 LLM 호출만 추상화하며, TTS/STT WebSocket 세션 관리는 범위 밖이다.

---

## 5. LangChain이 실질적으로 도움이 되는 시나리오

### 5.1 도움이 되는 경우 ✅

1. **LLM 프로바이더 교체가 잦을 때** — OpenAI → Anthropic → Google 등 자주 변경
2. **복잡한 체인/에이전트 구성** — RAG, 도구 호출, 다단계 추론 등
3. **LangSmith로 트레이싱** — 프로덕션에서 LLM 호출 모니터링
4. **구조화된 출력** — `.with_structured_output()` 등 (diary 생성 시 JSON 파싱에 유용할 수 있음)

### 5.2 도움이 안 되는 경우 ❌

1. **문장 단위 스트리밍** — LangChain은 토큰 단위만 지원, 문장 분리는 커스텀 필수
2. **Barge-in** — `asyncio.Task.cancel()` 패턴은 LangChain 사용 여부와 무관
3. **STT/TTS WebSocket 통합** — LangChain의 범위 밖
4. **서킷 브레이커** — LangChain 미지원, 커스텀 유지 필요
5. **파이프라인 상태 관리** — `pipeline_state` 패턴은 LangChain과 무관

---

## 6. 전환 공수 추정

### 6.1 전체 파이프라인 LangChain 전환

| 작업 | 공수 | 복잡도 |
|------|------|--------|
| `langchain`, `langchain-openai` 설치 및 의존성 해결 | 2-4h | 중 |
| `AIService` → LangChain 체인으로 리팩터링 | 4-8h | 중 |
| 문장 분리 로직 LangChain `.astream()` 위에 재구현 | 2-4h | 저 |
| 서킷 브레이커 + 재시도 LangChain 호환으로 조정 | 4-6h | 고 |
| 기존 테스트 마이그레이션 | 4-8h | 중 |
| 통합 테스트 + 엣지 케이스 검증 | 4-8h | 고 |
| **합계** | **20-38h** | |

### 6.2 LLM 부분만 부분 도입

| 작업 | 공수 | 복잡도 |
|------|------|--------|
| `langchain-openai` 설치 | 1h | 저 |
| `_chat()` 메서드만 LangChain으로 교체 (비스트리밍) | 2-4h | 저 |
| `generate_diary()`, `extract_learning_points()` 구조화 출력 | 2-4h | 중 |
| 테스트 업데이트 | 2-4h | 중 |
| **합계** | **7-13h** | |

> **주의:** 스트리밍 파이프라인(`get_reply_streaming()`)을 LangChain으로 바꿔도 코드량이나 구조가 거의 동일하므로 공수 대비 이득이 미미하다.

---

## 7. 최종 판단

### 7.1 추천: ❌ LangChain 도입 비추천 (현재 단계)

**근거:**

1. **핵심 가치 불일치:** 이 프로젝트의 기술적 핵심은 **"문장 단위 실시간 스트리밍 + Barge-in + WebSocket 통합"**이다. LangChain은 이 세 가지 중 어느 것도 추상화하지 못한다.

2. **현재 구현이 이미 최적화됨:**
   - OpenAI SDK 직접 호출 → 최소 레이턴시
   - 한국어 종결어미 정규식 → 프로젝트 특화 로직
   - 커스텀 서킷 브레이커 → 세밀한 제어
   - `asyncio.Task` 기반 Barge-in → 깔끔한 취소

3. **LangChain이 추가하는 것 = 추상화 레이어 + 의존성뿐:**
   - `chain.astream()` 내부는 결국 `openai.chat.completions.create(stream=True)` 호출
   - 문장 분리, Barge-in, TTS 통합 코드는 **그대로 유지해야 함**
   - 의존성 15-25개 추가, breaking change 리스크

4. **YAGNI (You Aren't Gonna Need It):**
   - LLM 프로바이더 교체 계획 없음 (현재 gpt-4o-mini 고정)
   - RAG, 에이전트, 도구 호출 등 복잡한 체인 불필요
   - LangSmith 트레이싱은 유용하지만 필수가 아님

### 7.2 부분 도입이 유리한 유일한 케이스

**일기 생성 (`generate_diary()`) + 학습 포인트 추출 (`extract_learning_points()`)에 한정적으로 `with_structured_output()` 사용을 고려할 수 있다:**

```python
# 현재: JSON 파싱을 수동으로 처리
content = await self._chat(messages=..., max_tokens=1000)
return self._parse_json(content, {"original_text": "", "translated_text": ""})

# LangChain: 구조화된 출력
class DiaryOutput(BaseModel):
    original_text: str
    translated_text: str

chain = prompt | llm.with_structured_output(DiaryOutput)
result = await chain.ainvoke(params)  # → DiaryOutput 인스턴스
```

하지만 이것도 OpenAI의 `response_format={"type": "json_schema", ...}`로 직접 구현 가능하므로 LangChain이 필수는 아니다.

### 7.3 향후 재검토 시점

다음 상황이 발생하면 LangChain 도입을 재검토할 가치가 있다:

- 🔄 **LLM 프로바이더 다변화** — OpenAI 외에 Anthropic, Gemini 등으로 A/B 테스트 필요 시
- 🔧 **RAG 도입** — 사용자 과거 일기 참조, 학습 이력 기반 대화 등
- 📊 **LangSmith 필요** — 프로덕션 LLM 호출 모니터링/비용 추적이 중요해질 때
- 🤖 **에이전트 패턴** — 외부 도구 호출, 다단계 추론이 필요해질 때

---

## 8. 요약

| 항목 | 현재 직접 구현 | LangChain 도입 시 |
|------|---------------|-------------------|
| 문장 단위 스트리밍 | ✅ 직접 구현, 완전 제어 | ⚠️ 동일 로직 재구현 필요 |
| Barge-in | ✅ asyncio.Task.cancel() | ✅ 동일 (LangChain 무관) |
| 서킷 브레이커 | ✅ 커스텀, 세밀한 제어 | ⚠️ 호환 래퍼 필요 |
| 레이턴시 | ✅ 최소 (직접 SDK 호출) | ⚠️ +2-5ms (체감 미미) |
| 의존성 | ✅ 최소 (`openai` 1개) | ❌ +15-25개 패키지 |
| 코드 간결성 | ✅ 현재 충분히 깔끔 | ⚠️ 래핑 코드 추가 |
| 프로바이더 교체 | ❌ 수동 변경 필요 | ✅ `init_chat_model()` |
| 트레이싱/모니터링 | ❌ 직접 로깅 | ✅ LangSmith 통합 |

**최종 결론: 현재 직접 구현을 유지하는 것이 최선이다.** LangChain은 이 프로젝트의 핵심 기술 요소(문장 단위 스트리밍, Barge-in, WebSocket 통합)에 실질적인 이점을 제공하지 않으며, 불필요한 의존성과 추상화 레이어만 추가한다.
