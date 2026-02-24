# Full-Duplex 실시간 음성 대화 파이프라인 계획서

## 목표

사용자의 음성을 실시간 스트리밍으로 수신하여 STT를 통해 즉각 텍스트화하고, LLM `stream=True`로 생성되는 토큰을 문장 경계 단위로 파싱하여 즉시 TTS WebSocket에 전달, 생성된 오디오 청크를 클라이언트 재생 큐로 끊임없이 push하는 **Full-Duplex 스트리밍 파이프라인**을 구현한다.

사용자가 AI 응답 도중 끼어들면(Barge-in), 즉시 오디오 버퍼를 비우고 새 입력을 받아 파이프라인을 재시작하는 인터럽트 구조를 지원한다.

---

## 현재 상태 (AS-IS)

```
[녹음 완료] → [파일 통째로 전송] → [STT 전체 처리] → [LLM 전체 응답 대기]
→ [문장 분리] → [REST TTS 생성] → [base64 전송] → [재생]
```

| 구간 | 방식 | 지연 |
|------|------|------|
| 음성 입력 | 녹음 완료 후 파일 일괄 전송 | 녹음 시간 전체 |
| STT | 파일 전체를 한 번에 ElevenLabs에 전송 → commit_throttled 빈발 | 1-3초 + 오류 |
| LLM | 스트리밍 응답 (문장 단위 yield) | 첫 문장 ~0.5초 |
| TTS | REST API 문장별 호출, 완료 후 순서대로 전송 | 1-3초 |
| 재생 | base64 → 임시 파일 → 재생 | ~0.3초 |
| **총 체감** | **직렬 파이프라인** | **3-8초** |

**현재 주요 문제:**
- STT: 녹음 완료 후 대량 PCM을 한번에 전송 → ElevenLabs `commit_throttled` 에러
- TTS: REST API 개별 호출 → 문장마다 HTTP 오버헤드 + 전체 대기

---

## 목표 상태 (TO-BE)

```
[실시간 마이크 청크] ──→ [ElevenLabs STT WebSocket (VAD)] ──→ [자동 commit → final 텍스트]
                                                                       │
                                                                       ▼
                                                             [LLM 스트리밍 응답]
                                                                       │
                                                                 (문장 경계 감지)
                                                                       │
                                                                       ▼
                                                  [ElevenLabs TTS WebSocket 스트리밍]
                                                                       │
                                                                       ▼
                                                           [오디오 청크 즉시 push]
                                                                       │
                                                                       ▼
                                                             [클라이언트 재생 큐]
```

| 구간 | 방식 | 목표 지연 |
|------|------|----------|
| 음성 입력 | 실시간 마이크 청크 스트리밍 | 실시간 |
| STT | ElevenLabs WebSocket + VAD 자동 commit | 실시간 |
| LLM | OpenAI 스트리밍 → 문장 파싱 | 첫 문장 ~0.3초 |
| TTS | ElevenLabs WebSocket 스트리밍 → 청크 즉시 push | ~0.3초 |
| 재생 | 오디오 큐 도착 즉시 순차 재생 | 즉시 |
| **총 체감** | **Full-Duplex 파이프라인** | **~0.5-1초** |

---

## ElevenLabs API 프로토콜 상세

### STT WebSocket (Scribe v2 Realtime)

**URL:** `wss://api.elevenlabs.io/v1/speech-to-text/realtime`

**Query Parameters:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `model_id` | string | — | `scribe_v2_realtime` |
| `language_code` | string | — | `ko` (한국어) |
| `audio_format` | enum | `pcm_16000` | PCM 포맷 + 샘플레이트 |
| `commit_strategy` | enum | `manual` | `manual` / `vad` |
| `vad_silence_threshold_secs` | double | 1.5 | VAD 모드: 침묵 감지 시간(초) |
| `vad_threshold` | double | 0.4 | VAD 모드: 감도 (0.0-1.0) |
| `min_speech_duration_ms` | int | 100 | VAD 모드: 최소 발화 길이(ms) |
| `include_timestamps` | bool | false | 단어별 타임스탬프 포함 |

**인증:** `xi-api-key` 헤더

**Client → Server:**
```json
{
  "message_type": "input_audio_chunk",
  "audio_base_64": "<base64 PCM>",
  "commit": false,
  "sample_rate": 16000
}
```

**Server → Client:**
- `session_started` — 세션 시작 확인
- `partial_transcript` — 실시간 중간 인식 (interim)
- `committed_transcript` — 최종 확정 텍스트
- 에러: `commit_throttled`, `auth_error`, `quota_exceeded`, `rate_limited`, `insufficient_audio_activity` 등

**Commit 전략:**
- **Manual (현재):** 클라이언트가 `commit: true` 전송 → 녹음 후 일괄 전송 시 throttle 문제 발생
- **VAD (목표):** 서버가 침묵 감지 시 자동 commit → 실시간 스트리밍에 적합, 마이크 입력에 권장

### TTS WebSocket (스트리밍 입력/출력)

**URL:** `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`

**Query Parameters:**

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `model_id` | string | — | `eleven_multilingual_v2` 등 |
| `output_format` | enum | — | `mp3_44100_128`, `pcm_16000` 등 |
| `inactivity_timeout` | int | 20 | 비활성 타임아웃(초) |
| `language_code` | string | — | `ko` |

**인증:** `xi-api-key` 헤더

**Client → Server — 초기화 (첫 메시지):**
```json
{
  "text": " ",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "speed": 1.0
  },
  "generation_config": {
    "chunk_length_schedule": [120, 160, 250, 290]
  }
}
```

**Client → Server — 텍스트 전송:**
```json
{
  "text": "문장 텍스트 ",
  "flush": true
}
```
- `flush: true` → 즉시 오디오 생성 시작 (문장 단위로 사용)
- 빈 텍스트 `{"text": ""}` → 연결 종료 신호

**Server → Client — 오디오 청크:**
```json
{
  "audio": "<base64 encoded audio>",
  "normalizedAlignment": {
    "chars": ["H", "e", "l", "l", "o"],
    "charStartTimesMs": [0, 50, 100, ...],
    "charDurationsMs": [50, 50, 50, ...]
  }
}
```

**Server → Client — 완료:**
```json
{ "isFinal": true }
```

**핵심 장점:**
- 단일 WebSocket 연결로 여러 문장의 TTS를 순차 생성 (REST 대비 연결 오버헤드 제거)
- `flush: true`로 문장 단위 즉시 생성 가능
- 오디오 청크가 도착하는 대로 즉시 클라이언트에 push 가능

---

## 핵심 설계

### 1. Full-Duplex 데이터 흐름

```
┌──────────────────────────────────────────────────────────────┐
│                        클라이언트 (React Native)                │
│                                                              │
│  [마이크] ──PCM 청크──→ WebSocket ──→ [스피커]                  │
│  (expo-audio-stream)     ↑↓              ↑                    │
│                     JSON + Binary   오디오 큐 재생              │
└──────────────────────────────────────────────────────────────┘
                            ↑↓
┌──────────────────────────────────────────────────────────────┐
│                         백엔드 (FastAPI)                       │
│                                                              │
│  클라이언트 WS ←──→ [세션 매니저]                                │
│                          │                                   │
│       ┌──────────────────┼──────────────────┐                │
│       ▼                  ▼                  ▼                │
│  [ElevenLabs         [OpenAI LLM       [ElevenLabs          │
│   STT WebSocket]      Streaming]        TTS WebSocket]       │
│       │                  │                  │                │
│   interim ──→ 클라이언트  │             오디오 청크              │
│   final ────→ LLM 입력    │             ──→ 클라이언트           │
│                   문장 yield ──→ TTS 입력                      │
└──────────────────────────────────────────────────────────────┘
```

### 2. 백엔드 WebSocket 커넥션 관리

**턴당 생명주기:**
```
1. 유저 마이크 ON → audio_start 수신
2. STT WebSocket 연결 (VAD 모드)
3. PCM 청크 릴레이: 클라이언트 → 백엔드 → ElevenLabs STT
4. VAD가 침묵 감지 → committed_transcript (final text)
5. STT WebSocket 종료
6. LLM 스트리밍 시작 → 문장 경계 감지 → 문장 yield
7. TTS WebSocket 연결 (턴 시작 시 1회)
8. 각 문장을 TTS에 flush → 오디오 청크 수신 즉시 클라이언트 push
9. 모든 문장 완료 → TTS에 빈 텍스트 전송 → isFinal → TTS WebSocket 종료
```

**TTS WebSocket 연결 전략:**
- 턴 시작 시 1개의 TTS WebSocket 연결
- LLM이 yield하는 각 문장을 순차적으로 `flush: true`로 전송
- 각 문장의 오디오 청크가 도착하는 대로 클라이언트에 즉시 전송
- 턴 종료 시 `{"text": ""}` 로 연결 닫기

### 3. Barge-in (사용자 끼어들기) 처리

```
1. 클라이언트: 마이크 버튼 → 재생 큐 비우기 + 현재 재생 중지
2. 클라이언트: barge_in → audio_start 전송
3. 백엔드:    진행 중인 LLM Task cancel
4. 백엔드:    TTS WebSocket에 빈 텍스트 → 닫기
5. 백엔드:    barge_in_ack 전송
6. 백엔드:    새 STT WebSocket (VAD) 연결 → 새 파이프라인 시작
```

### 4. 메시지 프로토콜 (클라이언트 ↔ 백엔드 WebSocket)

**클라이언트 → 서버:**

| 타입 | 데이터 | 설명 |
|------|--------|------|
| `audio_start` | JSON | 녹음 시작, STT 세션 오픈 |
| (binary) | PCM 16kHz 16bit mono | 실시간 오디오 청크 (~100ms) |
| `audio_end` | JSON | 녹음 종료 (VAD 모드에서는 보통 불필요) |
| `barge_in` | JSON | AI 응답 중 끼어들기 |
| `message` | JSON `{ text }` | 텍스트 직접 입력 (폴백) |
| `finish` | JSON | 대화 종료, 일기 생성 |

**서버 → 클라이언트:**

| 타입 | 데이터 | 설명 |
|------|--------|------|
| `session_created` | JSON `{ session_id }` | 세션 생성 완료 |
| `stt_interim` | JSON `{ text }` | 실시간 중간 인식 결과 (자막) |
| `stt_final` | JSON `{ text }` | 최종 인식 결과 |
| `stt_empty` | JSON `{ message }` | 음성 인식 실패 (UI 리셋) |
| `ai_chunk` | JSON `{ text, index }` | LLM 문장 청크 (텍스트 표시) |
| `ai_done` | JSON | LLM 응답 완료 |
| `tts_audio` | JSON `{ audio_data, index }` | TTS 오디오 (base64, 순서 보장) |
| `barge_in_ack` | JSON | 끼어들기 확인, 파이프라인 리셋 |
| `diary_created` | JSON `{ diary }` | 일기 생성 완료 |
| `error` | JSON `{ code, message }` | 에러 |

---

## 구현 단계

### Phase 1: STT — 실시간 마이크 스트리밍 + VAD 자동 commit

**목표:** 녹음 중 마이크 오디오를 실시간으로 ElevenLabs STT에 스트리밍, VAD로 자동 commit

#### 1-1. 프론트엔드: `expo-audio-stream` 도입

```typescript
// expo-audio (파일 기반) → expo-audio-stream (실시간 청크 콜백)
import { ExpoAudioStream } from 'expo-audio-stream';

const stream = new ExpoAudioStream({
  sampleRate: 16000,
  channels: 1,
  bitDepth: 16,
  onAudioChunk: (chunk: ArrayBuffer) => {
    wsClient.sendBinary(chunk); // 실시간으로 백엔드에 전송
  },
});
```

- `useAudioRecorder` (녹음 후 파일) → `ExpoAudioStream` (실시간 청크 콜백) 교체
- `onAudioChunk`에서 PCM 데이터를 WebSocket binary로 즉시 전송
- `audio_start` / `audio_end` 메시지는 유지 (마이크 버튼 제어)

#### 1-2. 백엔드: STT를 VAD 모드로 전환

```python
# stt_service.py
ELEVENLABS_STT_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"

async def connect(self):
    url = (
        f"{ELEVENLABS_STT_URL}"
        f"?model_id=scribe_v2_realtime"
        f"&language_code=ko"
        f"&audio_format=pcm_16000"
        f"&commit_strategy=vad"
        f"&vad_silence_threshold_secs=1.5"
        f"&vad_threshold=0.4"
    )
    self._ws = await websockets.connect(url, additional_headers=headers)
```

- `commit_strategy=vad` → ElevenLabs가 침묵 감지 시 자동 commit
- `commit_and_wait_final()` → VAD가 자동으로 `committed_transcript` 발행
- `send_audio()`에서 pacing/chunking 불필요 (실시간 도착하므로)

#### 1-3. 백엔드: 메시지 루프 수정

- `audio_end` 수신 시 manual commit 대신 STT 세션 종료만 처리
- VAD `committed_transcript`가 listener에서 바로 AI 파이프라인 트리거

**검증:**
- 마이크 녹음 중 `stt_interim` 실시간 수신 확인
- 말 멈추면 VAD가 자동 commit → `stt_final` 수신 확인
- `commit_throttled` 에러 없음 확인

---

### Phase 2: TTS — WebSocket 스트리밍으로 전환

**목표:** REST TTS를 ElevenLabs TTS WebSocket으로 교체, 문장 즉시 생성 + 오디오 청크 즉시 push

#### 2-1. 백엔드: TTS WebSocket 클라이언트

```python
# tts_service.py — 새로운 TTS 스트리밍 클래스
class TTSStreamSession:
    """Single TTS WebSocket session for a conversation turn."""

    async def connect(self, voice_id: str):
        url = (
            f"wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
            f"?model_id=eleven_multilingual_v2"
            f"&output_format=mp3_44100_128"
        )
        self._ws = await websockets.connect(url, additional_headers=headers)
        # 초기화 메시지
        await self._ws.send(json.dumps({
            "text": " ",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "speed": 1.0},
            "generation_config": {"chunk_length_schedule": [50, 120, 200, 260]},
        }))

    async def send_sentence(self, text: str):
        """문장 전송 + flush → 즉시 오디오 생성 시작"""
        await self._ws.send(json.dumps({
            "text": text + " ",
            "flush": true,
        }))

    async def receive_audio_chunks(self) -> AsyncIterator[bytes]:
        """오디오 청크를 수신하는 async generator"""
        async for msg in self._ws:
            data = json.loads(msg)
            if data.get("isFinal"):
                break
            audio_b64 = data.get("audio")
            if audio_b64:
                yield base64.b64decode(audio_b64)

    async def close(self):
        await self._ws.send(json.dumps({"text": ""}))
        await self._ws.close()
```

#### 2-2. 백엔드: LLM → TTS 파이프라이닝

```python
# conversation.py — 턴 처리 흐름
async def _handle_ai_reply_streaming(ws, session_id, user_text):
    # 1. TTS WebSocket 연결
    tts_session = TTSStreamSession()
    await tts_session.connect(voice_id)

    # 2. TTS 오디오 수신 → 클라이언트 push (백그라운드 태스크)
    audio_index = 0
    async def _relay_tts_audio():
        nonlocal audio_index
        async for chunk in tts_session.receive_audio_chunks():
            audio_b64 = base64.b64encode(chunk).decode("ascii")
            await ws.send_json({
                "type": "tts_audio",
                "audio_data": audio_b64,
                "index": audio_index,
            })
            audio_index += 1

    relay_task = asyncio.create_task(_relay_tts_audio())

    # 3. LLM 스트리밍 → 문장 경계 → TTS에 flush
    sentence_index = 0
    async for sentence in service.handle_user_message_streaming(session_id, user_text):
        await ws.send_json({
            "type": "ai_chunk",
            "text": sentence,
            "index": sentence_index,
        })
        await tts_session.send_sentence(sentence)
        sentence_index += 1

    # 4. 완료
    await ws.send_json({"type": "ai_done"})
    await tts_session.close()
    await relay_task
```

**핵심 변경:**
- REST TTS (문장별 HTTP 호출) → WebSocket TTS (단일 연결, flush 기반)
- 오디오 청크가 도착하는 즉시 클라이언트에 push (전체 대기 없음)
- `chunk_length_schedule`을 낮춰 저지연 우선

**검증:**
- 첫 문장의 TTS 오디오가 전체 LLM 응답 완료 전에 클라이언트에 도착하는지 확인
- 문장 순서대로 오디오 재생되는지 확인
- REST TTS 대비 레이턴시 개선 측정

---

### Phase 3: Barge-in (끼어들기) 지원

**목표:** AI 응답 재생 중 사용자가 말하면 즉시 중단하고 새 입력 처리

#### 3-1. 프론트엔드

- AI 응답 재생 중 마이크 버튼 활성화 (`ai_speaking` 상태에서도 누를 수 있게)
- 마이크 누르면:
  1. `stopCurrentAudio()` + `ttsQueue.clear()`
  2. `barge_in` → `audio_start` 전송
  3. 실시간 마이크 스트리밍 시작

#### 3-2. 백엔드

- `barge_in` 수신 시:
  1. 진행 중인 LLM Task → `cancel()`
  2. TTS WebSocket → `close()` (진행 중인 생성 중단)
  3. `barge_in_ack` 전송
  4. 새 STT WebSocket (VAD) 연결

**검증:**
- AI 응답 중 끼어들기 시 재생 즉시 멈추는지 확인
- 새 입력이 정상적으로 STT → LLM → TTS 처리되는지 확인
- 취소된 TTS 결과가 클라이언트에 도달하지 않는지 확인

---

### Phase 4: 안정화 및 최적화

- **에러 복구:** STT/LLM/TTS 각 단계 실패 시 graceful fallback
  - TTS WebSocket 실패 → REST API fallback
  - STT VAD 미감지 → 타임아웃 후 `stt_empty` 전송
- **타임아웃:** STT 무음 15초 → 자동 세션 종료 + UI 리셋
- **메모리:** 오디오 큐 최대 10개 제한, 재생 완료 청크 즉시 해제
- **네트워크:** WebSocket 재연결 시 세션 복구 전략
- **지연 모니터링:** 각 파이프라인 구간별 latency 로깅
- **테스트:** 전 구간 통합 테스트, Barge-in 시나리오 테스트

---

## 기술 스택 변경

| 영역 | 현재 | 변경 |
|------|------|------|
| 프론트 녹음 | `expo-audio` useAudioRecorder (파일 기반) | `expo-audio-stream` (실시간 청크 콜백) |
| STT | ElevenLabs STT WS, manual commit | VAD commit (`commit_strategy=vad`) |
| LLM | OpenAI `stream=True` (이미 구현) | 유지 |
| TTS | REST API (`generate_bytes()`) | **ElevenLabs TTS WebSocket** (스트리밍) |
| 오디오 전송 | base64 JSON (문장 전체) | base64 JSON (오디오 청크 즉시 push) |

---

## 예상 타임라인

| Phase | 내용 | 예상 기간 |
|-------|------|----------|
| Phase 1 | 실시간 마이크 스트리밍 + VAD | 1-2일 |
| Phase 2 | TTS WebSocket 스트리밍 | 1-2일 |
| Phase 3 | Barge-in 지원 | 1일 |
| Phase 4 | 안정화 및 최적화 | 2-3일 |

---

## 예상 체감 레이턴시

| 구간 | 현재 | Phase 1 후 | Phase 2 후 |
|------|------|-----------|-----------|
| 음성 입력 | 녹음 완료 후 일괄 | 실시간 스트리밍 | 동일 |
| STT | 1-3초 + throttle | VAD 자동, 실시간 | 동일 |
| LLM | 첫 문장 ~0.5초 | 동일 | 동일 |
| TTS | REST 1-3초/문장 | 동일 | WS ~0.3초 (첫 청크) |
| **총 체감** | **3-8초** | **1-3초** | **~0.5-1초** |

---

## 최종 사용자 경험

```
유저: (마이크 버튼 누름 → 실시간 녹음 시작)
유저: "오늘 회사에서 회의했어" (말하는 동안 실시간 자막 표시)
     ↓ (유저가 멈추면 VAD가 1.5초 후 자동 commit)
     ↓ (0.3초 — LLM 첫 문장)
AI:  "어떤 회의였어?" (첫 문장 오디오 청크가 바로 재생 시작)
AI:  "누구랑 했어?"  (이어서 다음 문장 자연스럽게 재생)
     ↓
유저: (AI 말하는 중에 마이크 버튼 → AI 음성 즉시 멈춤)
유저: "팀장님이랑 프로젝트 일정 잡았어"
     ↓ (0.5초)
AI:  "결과는 어땠어?" (다시 즉시 응답)
```

전체 대화가 마치 사람과 대화하는 것처럼 자연스럽고 즉각적으로 이루어진다.

---

## 참고 문서

- [ElevenLabs STT Realtime: Server-Side Streaming](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-to-text/realtime/server-side-streaming)
- [ElevenLabs STT Realtime: Client-Side Streaming](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-to-text/realtime/client-side-streaming)
- [ElevenLabs STT: Transcripts and Commit Strategies](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-to-text/realtime/transcripts-and-commit-strategies)
- [ElevenLabs TTS WebSocket API](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input)
- [ElevenLabs TTS Streaming Cookbook](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/text-to-speech/streaming)
