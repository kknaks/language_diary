# 실시간 대화 진단 보고서

> 작성일: 2026-03-02

---

## 1. STT_FAILED 원인

### 핵심 원인: AI 발화 중 오디오 차단 → ElevenLabs STT idle timeout → WebSocket 정상 종료 → 이후 전송 시도 실패

**흐름 재현:**

```
1. AI 파이프라인 시작 (LLM → TTS 스트리밍)
2. 프론트엔드 에코 게이트: voiceState === 'ai_speaking' → 오디오 전송 완전 차단
3. 백엔드 에코 게이트: ai_pipeline_task가 진행 중 → stt_session.send_audio() 호출 안 함
4. ElevenLabs STT WebSocket에 오디오가 0바이트 도달 (이중 차단)
5. ElevenLabs 서버: VAD 설정된 silence threshold(1.5s) 이후에도 계속 무음
   → 서버 측 idle timeout (약 10-30초) → WebSocket 정상 종료 (close code 1000 OK)
6. STTSession._listen() 루프 종료: ConnectionClosed 감지 → self._connected = False
7. AI 파이프라인 완료, ai_done 전송
8. 프론트엔드: voiceState → 'listening' → 오디오 전송 재개
9. 프론트엔드가 바이너리 프레임 전송 → 백엔드 message loop에서 stt_session.send_audio() 호출
10. STTSession.send_audio(): self._connected=False → STTError("STT 세션이 연결되지 않았습니다.")
    또는 self._ws가 이미 닫힌 상태에서 send() → websockets 라이브러리가
    "received 1000 (OK); then sent 1000 (OK)" 에러 발생
11. conversation.py line 641: except STTError → "STT_FAILED" 에러를 클라이언트에 전송
```

### 코드 근거

**`stt_service.py` — 재연결 방지 코드 없음:**
```python
async def send_audio(self, audio_bytes: bytes):
    if not self._connected or not self._ws:
        raise STTError("STT 세션이 연결되지 않았습니다.")  # ← 여기서 에러
    # ...
    await self._ws.send(...)  # ← 또는 여기서 이미 닫힌 WS에 send → 1000 에러
```

- `_listen()`에서 `ConnectionClosed` 감지 시 `self._connected = False` 설정하지만, **재연결 로직은 없음**
- `send_audio()`는 연결 끊김을 감지하고 에러를 던지지만, **호출자(conversation.py)는 이를 단순 에러 로깅 + 클라이언트 전송으로만 처리**
- STT 세션이 죽은 후에도 **message loop는 계속 돌아감** → 이후 모든 오디오 프레임마다 STT_FAILED 에러 반복

**`conversation.py` — 이중 차단의 문제:**
```python
# line 638
if stt_session and not (ai_pipeline_task and not ai_pipeline_task.done()):
    await stt_session.send_audio(bytes_data)
```

이 조건은 `ai_pipeline_task`가 **완료된 직후**에는 `True`가 되어 `send_audio()`를 호출한다. 하지만 이 시점에 STT WebSocket은 이미 idle timeout으로 죽어있을 수 있다.

### ElevenLabs STT WebSocket 종료 시점

ElevenLabs Scribe v2 realtime은 다음 경우에 `1000 (OK)`로 정상 종료:
1. **서버 측 idle timeout**: 오디오가 일정 시간 동안 안 들어오면 (문서 미명시, 추정 10-30초)
2. **클라이언트가 close 요청**: `session.close()` 호출 시
3. **세션 최대 시간 초과**: ElevenLabs의 세션 제한 시간

현재 문제는 **1번(idle timeout)**이 원인.

---

## 2. 느려짐 원인

### 2-1. 백그라운드 TTS 태스크의 리소스 영향 — **낮음**

```python
# tts_task_service.py
asyncio.create_task(run_tts_generation(task_id, card_ids, async_session))
```

- `run_tts_generation`은 **별도의 DB 세션**(`session_factory`)을 사용하므로 메인 세션과 DB 커넥션 충돌 없음
- TTS REST API 호출(`generate_and_save`)은 네트워크 I/O이므로 asyncio 이벤트 루프를 블로킹하지 않음
- 단, ElevenLabs API **rate limit**가 있다면 TTS 스트리밍(메인 파이프라인)과 TTS REST(백그라운드)가 동시에 요청하면 rate limit에 걸릴 수 있음
- **결론**: 리소스 점유로 인한 느려짐 가능성은 낮지만, ElevenLabs rate limit 충돌 가능성은 있음

### 2-2. `ai_pipeline_task` 완료 체크 로직의 STT 차단 — **핵심 원인 중 하나**

```python
# conversation.py line 638
if stt_session and not (ai_pipeline_task and not ai_pipeline_task.done()):
    await stt_session.send_audio(bytes_data)
```

이 로직의 문제:
- AI가 응답 중일 때 **오디오를 아예 안 보냄** → STT에 묵음만 전달
- AI 응답이 끝나면 STT가 이미 죽어있을 수 있음 (위 STT_FAILED 원인)
- STT가 죽으면 **다음 사용자 발화를 인식 못함** → 사용자가 말해도 반응 없음 → "느려진 것처럼" 느낌
- 실제로는 느려진 게 아니라 **STT가 죽어서 사용자 입력이 아예 안 들어가는 것**일 수 있음

### 2-3. `generate_diary_with_learning()` 단일 LLM 호출 — **관련 없음 (대화 중 호출 안 됨)**

- `generate_diary_with_learning()`은 `finish_conversation()` 시점에만 호출됨
- 대화 중에는 `get_reply_streaming()`만 사용
- `max_tokens=2500` 단일 호출이 기존 2번 호출보다 빠르거나 비슷함 (gpt-4o-mini 사용)
- **대화 중 느려짐과는 관련 없음**

### 2-4. 감정 태그 제거 regex — **관련 없음**

```python
clean_text = re.sub(r'\s*\([^)]*\)', '', text).strip()
```
- 단순 regex로 성능 영향 무시할 수 있음
- 단, 정상 텍스트에서 괄호 내용을 잘못 제거할 수 있음 (예: "I went to (the) park" → "I went to park")
  - 현재는 STT 출력이므로 이런 케이스는 드묾

### 2-5. 실제 느려짐 시나리오 (종합)

```
1. 첫 번째 대화 턴: 정상 동작
2. AI 응답 시작 → 프론트/백엔드 모두 오디오 차단
3. AI 응답 10-30초 동안 STT에 오디오 0바이트 → ElevenLabs idle timeout → STT WS 닫힘
4. AI 응답 완료, ai_done 전송
5. 사용자가 말하기 시작
6. 프론트엔드: voiceState → 'listening' → 오디오 전송 재개
7. 백엔드: stt_session.send_audio() → STTError (WS 이미 닫힘)
8. 매 오디오 프레임마다 STT_FAILED 에러 반복 (초당 ~60회)
9. stt_final/stt_interim 이벤트 안 옴 → commit_listener에 텍스트 안 들어감
10. AI 파이프라인 트리거 안 됨 → 사용자가 아무리 말해도 반응 없음
11. 사용자 입장: "느려졌다" (실제로는 STT가 죽어서 응답 자체가 불가)
```

**추가 악화 요인**: STT_FAILED 에러가 매 오디오 프레임마다 `websocket.send_json()`으로 전송됨 → 이벤트 루프에 부하 → 실제 느려짐 발생 가능

---

## 3. 해결 방안

### 3-1. STT_FAILED 해결 — **STT 세션 자동 재연결 (추천)**

| 방안 | 장점 | 단점 | 추천도 |
|------|------|------|--------|
| **자동 재연결** | 완전한 해결, 사용자 경험 끊김 없음 | 구현 복잡도 중간 | ⭐⭐⭐ |
| 묵음 keepalive | 간단, idle timeout 방지 | 불필요한 트래픽, ElevenLabs 비용 | ⭐⭐ |
| 에러 무시 | 가장 간단 | 근본 해결 안 됨, 이후 STT 완전 불능 | ⭐ |

**추천: 자동 재연결 + 묵음 keepalive 병행**

#### A. STT 세션 자동 재연결 (`stt_service.py`)

`send_audio()`에서 연결 끊김 감지 시 자동 재연결:
```python
async def send_audio(self, audio_bytes: bytes):
    if not self._connected or not self._ws:
        # 재연결 시도
        try:
            await self.connect()
        except STTError:
            raise  # 재연결 실패 시 에러 전파
    # ... 기존 전송 로직
```

또는 `_listen()`에서 `ConnectionClosed` 감지 시 자동 재연결:
```python
except websockets.exceptions.ConnectionClosed:
    logger.warning("STT connection closed, attempting reconnect...")
    self._connected = False
    try:
        await self.connect()  # 기존 파라미터 저장 필요
    except STTError:
        logger.error("STT reconnect failed")
```

#### B. 묵음 keepalive (AI 발화 중)

백엔드에서 AI 파이프라인 실행 중에도 주기적으로 묵음 PCM을 STT에 전송:
```python
# conversation.py — AI 파이프라인 시작 시 keepalive 태스크 시작
async def _stt_keepalive(stt_session, interval=5.0):
    """Send silent PCM frames to prevent STT idle timeout."""
    silence = b'\x00' * 3200  # 100ms of silence at 16kHz 16-bit mono
    while True:
        await asyncio.sleep(interval)
        try:
            if stt_session._connected:
                await stt_session.send_audio(silence)
        except STTError:
            break
```

#### C. conversation.py 에러 처리 개선

STT_FAILED 발생 시 매 프레임마다 에러를 보내지 않도록:
```python
# 현재 (나쁨 — 매 프레임마다 에러 전송):
except STTError as e:
    logger.error("STT send_audio failed: %s", e)
    await websocket.send_json({"type": "error", "code": "STT_FAILED", ...})

# 개선 (에러 한 번만 + 재연결 시도):
except STTError as e:
    logger.error("STT send_audio failed: %s", e)
    if not stt_reconnect_attempted:
        await websocket.send_json({"type": "error", "code": "STT_FAILED", ...})
        # 재연결 시도
        stt_reconnect_attempted = True
```

### 3-2. 느려짐 해결

#### A. STT 재연결이 곧 느려짐 해결

느려짐의 핵심은 STT 세션이 죽어서 사용자 발화가 인식 안 되는 것이므로, STT 재연결이 해결되면 느려짐도 자연스럽게 해결됨.

#### B. 에러 flood 방지

```python
# STT가 죽은 후 매 오디오 프레임마다 에러 전송 → 이벤트 루프 과부하
# 해결: stt_session이 None이면 조기 continue
if bytes_data:
    if not stt_session or not stt_session._connected:
        continue  # STT 죽었으면 오디오 무시 (에러 안 보냄)
    if not (ai_pipeline_task and not ai_pipeline_task.done()):
        try:
            await stt_session.send_audio(bytes_data)
        except STTError as e:
            # 재연결 시도, 실패 시 stt_session = None
            ...
```

#### C. ElevenLabs rate limit 주의

백그라운드 TTS 태스크가 메인 TTS 스트리밍과 동시에 ElevenLabs API를 호출하면 rate limit에 걸릴 수 있음.

해결: `run_tts_generation`에 **딜레이 추가** 또는 대화 세션 종료 후 일정 시간 후에 시작:
```python
async def run_tts_generation(...):
    await asyncio.sleep(5)  # 메인 TTS 스트리밍 완료 대기
    # ... 기존 로직
```

---

## 4. 우선순위 정리

| 순위 | 작업 | 영향도 | 난이도 |
|------|------|--------|--------|
| 1 | STT 자동 재연결 로직 추가 | 🔴 Critical — STT_FAILED + 느려짐 모두 해결 | 중 |
| 2 | 에러 flood 방지 (STT 죽으면 에러 안 보내기) | 🟠 High — 이벤트 루프 과부하 방지 | 하 |
| 3 | 묵음 keepalive (예방적) | 🟡 Medium — 재연결이 있으면 보험용 | 하 |
| 4 | 백그라운드 TTS 딜레이 | 🟢 Low — rate limit 문제 시에만 | 하 |

**결론: STT 자동 재연결이 두 문제 모두의 근본 해결책이다.**
