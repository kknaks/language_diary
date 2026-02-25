# Custom Voice Pipeline 전환 계획

## 현재 아키텍처 (MVP)

```
[Frontend]                        [ElevenLabs ConvAI]
  │                                      │
  ├─ signed URL 요청 ──► Backend ──────► │
  │                                      │
  ├─ WebSocket 연결 ◄──────────────────► │  ← STT + LLM + TTS + VAD + Barge-in 전부 처리
  │                                      │
  ├─ PCM 오디오 전송 ──────────────────► │
  │                                      │
  ├─ TTS 오디오 수신 ◄────────────────── │
  │                                      │
  └─ 대화 종료 시 Backend에 transcript 전송 → 일기/학습카드 생성
```

**장점**: 구현 간단, 단일 WebSocket
**단점**: 비용 높음 (~$0.50/5분 대화), LLM/TTS 제어 불가, **인사말/프롬프트 동적 변경 불가**

---

## 전환 핵심 이유: 다국어 맞춤 대화

ConvAI에서는 에이전트 대시보드에서 인사말/시스템 프롬프트가 고정됨.
커스텀 파이프라인으로 전환하면 **사용자 설정(모국어/외국어)에 따라 동적으로** 제어 가능.

### 인사말 동적 생성

```python
# ai_service.py — 사용자 프로필 기반 인사말
async def get_first_message(self, native_lang: str, target_lang: str) -> str:
    """사용자의 모국어/외국어 설정에 맞는 인사말 생성"""
    # 예: 모국어=한국어, 외국어=영어 → AI가 한국어로 인사
    # 예: 모국어=일본어, 외국어=한국어 → AI가 일본어로 인사
    prompt = f"사용자의 모국어는 {native_lang}이고 {target_lang}을 배우고 있습니다."
    ...
```

### 시스템 프롬프트 동적 생성

```python
# 모국어=한국어, 외국어=영어인 경우:
SYSTEM_PROMPT = """
너는 사용자의 친근한 친구야.
사용자가 오늘 하루를 한국어(모국어)로 이야기하면,
대화 내용을 바탕으로 영어(학습 언어) 일기를 만들어줘.
대화는 한국어로 진행해.
"""

# 모국어=일본어, 외국어=한국어인 경우:
SYSTEM_PROMPT = """
あなたはユーザーの親しい友達です。
ユーザーが今日の出来事を日本語(母語)で話したら、
会話をもとに韓国語(学習言語)の日記を作ってあげてください。
会話は日本語で進めてください。
"""
```

### 대화 → 일기 흐름

```
[대화] 모국어로 진행 (한국어/일본어/중국어...)
  ↓
[일기 생성] 외국어로 변환 (영어/한국어/일본어...)
  ↓
[학습카드] 외국어 표현 + 모국어 설명
```

**이것이 커스텀 전환의 가장 큰 이유**: ConvAI에서는 이 동적 전환이 불가능.

---

## 커스텀 파이프라인 아키텍처

```
[Frontend]                          [Backend (FastAPI)]
  │                                        │
  ├─ WebSocket 연결 ◄────────────────────► │
  │                                        │
  ├─ silero-vad로 음성 감지                 │
  │   └─ 발화 시작/종료 판단                 │
  │                                        │
  ├─ PCM 오디오 chunk 전송 ──────────────► │ ──► STT (ElevenLabs Scribe v2)
  │                                        │        └─ 실시간 자막 반환
  │                                        │
  │                                        │ ──► LLM (OpenAI GPT-4o-mini, 스트리밍)
  │                                        │        └─ 문장 단위 분할
  │                                        │
  │◄── TTS 오디오 chunk ────────────────── │ ◄── TTS (ElevenLabs Streaming)
  │                                        │        └─ 문장별 음성 합성
  │                                        │
  └─ Barge-in 감지 시                       │
      └─ 오디오 정지 + barge_in 전송 ──────► │ ──► LLM/TTS 태스크 취소
```

---

## 컴포넌트별 상세 설계

### 1. VAD (Voice Activity Detection) — 프론트엔드

**현재 ConvAI**: 서버사이드 VAD (ElevenLabs 내부)
**커스텀**: 프론트엔드 silero-vad

```
선택지:
├─ @ricky0123/vad-web (silero-vad ONNX, 브라우저/RN 용)
├─ hark (WebRTC VAD, 가벼움)
└─ 직접 구현 (에너지 기반, 단순하지만 정확도 낮음)
```

**추천: @ricky0123/vad-web**

동작 방식:
1. 마이크 스트림을 VAD에 연결
2. `onSpeechStart` → 백엔드에 `audio_start` 전송, PCM chunk 전송 시작
3. `onSpeechEnd` → 백엔드에 `audio_end` 전송
4. 설정: `positiveSpeechThreshold: 0.8`, `minSpeechFrames: 5`, `redemptionFrames: 15`

**구현 위치**: `frontend/src/hooks/useVAD.ts` (새 파일)

```typescript
// 핵심 인터페이스
interface VADOptions {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onAudioChunk: (pcmBase64: string) => void;
}
```

### 2. STT (Speech-to-Text) — 백엔드

**현재 ConvAI**: ElevenLabs 내장 ASR
**커스텀**: ElevenLabs Scribe v2 (이미 `stt_service.py`에 구현됨)

**기존 코드 재활용**: `backend/app/services/stt_service.py`

```python
# STTSession — 이미 구현된 기능:
# - ElevenLabs WebSocket STT 연결
# - PCM 오디오 스트리밍
# - VAD 모드 (자동 발화 종료 감지)
# - interim/final 자막 반환
```

**수정사항**:
- VAD 모드를 프론트에서 처리하므로, STT의 VAD를 비활성화하고 manual commit 사용
- `send_audio()` → `commit_and_wait_final()` 패턴으로 전환
- 또는 서버사이드 VAD를 유지하고 프론트 VAD를 제거 (선택)

**대안 STT 옵션**:
| STT | 비용 (1시간) | 한국어 | 지연시간 | 비고 |
|-----|------------|-------|---------|------|
| ElevenLabs Scribe v2 | ~$0.40 | 좋음 | 낮음 | 이미 구현됨 |
| OpenAI Whisper API | ~$0.36 | 매우 좋음 | 중간 | REST 기반, 실시간 어려움 |
| Deepgram Nova-2 | ~$0.35 | 보통 | 매우 낮음 | WebSocket 지원 |
| Google Cloud STT | ~$0.96 | 매우 좋음 | 낮음 | 비쌈 |

### 3. LLM (Language Model) — 백엔드

**현재 ConvAI**: ElevenLabs가 GPT-4o-mini 호출 (그쪽 비용)
**커스텀**: 직접 OpenAI API 호출 (이미 `ai_service.py`에 구현됨)

**기존 코드 재활용**: `backend/app/services/ai_service.py`

```python
# AIService — 이미 구현된 기능:
# - get_reply_streaming(): 문장 단위 스트리밍
#   └─ 한국어 문장 종결 감지 (다, 요, 죠, 네, 까)
# - 서킷 브레이커 + 재시도 로직
```

**수정사항**: 없음. 그대로 재활용.

**비용 비교**:
- ConvAI 경유: ElevenLabs 요금에 포함 (불투명)
- 직접 호출: GPT-4o-mini ~$0.15/1M input, $0.60/1M output → 5분 대화 약 $0.01 이하

### 4. TTS (Text-to-Speech) — 백엔드

**현재 ConvAI**: ElevenLabs 내장 TTS (PCM 16kHz 반환)
**커스텀**: ElevenLabs Streaming TTS WebSocket (이미 `tts_service.py`에 구현됨)

**기존 코드 재활용**: `backend/app/services/tts_service.py`

```python
# TTSStreamSession — 이미 구현된 기능:
# - ElevenLabs TTS WebSocket 연결
# - 문장별 send_sentence() + flush
# - receive_audio_chunks() 비동기 제너레이터
# - REST TTS 폴백 (WebSocket 실패 시)
# - 오디오 캐싱 (DB + 파일)
```

**수정사항**:
- 현재 MP3 반환 → PCM 반환으로 변경 가능 (프론트에서 WAV 변환 불필요)
- 또는 MP3 유지 (프론트의 기존 playAudioFromBase64 재사용)

**비용**: ElevenLabs TTS ~$0.30/1000자 (Turbo v2)

### 5. Barge-in — 프론트엔드 + 백엔드

**현재 ConvAI**: 서버가 자동 감지 + interruption 이벤트 전송
**커스텀**: 프론트 VAD 감지 → 백엔드 파이프라인 취소

**프론트엔드 로직**:
```typescript
// AI가 말하는 중 (voiceState === 'ai_speaking')에
// VAD가 사용자 음성 감지하면:
1. 오디오 재생 즉시 중단 (clearAudioQueue)
2. WebSocket으로 { type: 'barge_in' } 전송
3. voiceState → 'listening'
4. 새 오디오 chunk 전송 시작
```

**백엔드 로직** (이미 `conversation.py`에 구조 있음):
```python
# pipeline_state에 저장된 태스크들 취소:
# - llm_task: asyncio.Task 취소
# - tts_session: WebSocket 종료
# - relay_task: asyncio.Task 취소
# → 새로운 STT 세션 시작
```

### 6. WebSocket 핸들러 — 백엔드

**기존 코드 재활용**: `backend/app/api/v1/conversation.py`

기존 `conversation_websocket()` 함수가 이미 전체 파이프라인을 관리:

```python
# 클라이언트 → 서버 메시지:
# - audio_start: STT 세션 시작
# - binary frames: PCM 오디오 chunk
# - audio_end: STT 커밋
# - barge_in: 파이프라인 취소
# - finish: 대화 종료 → 일기 생성

# 서버 → 클라이언트 메시지:
# - session_created
# - stt_interim / stt_final
# - ai_message_chunk (문장별)
# - tts_audio (base64 MP3/PCM)
# - diary_created
```

**수정사항**: 최소한. 기존 코드가 이미 동작하던 것.

---

## 프론트엔드 전환 계획

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `useRealtimeRecorder.ts` | VAD 통합, onAudioChunk 콜백 유지 |
| `useConversationStore.ts` | ElevenLabs 클라이언트 → 기존 WebSocket 클라이언트 전환 |
| `audio.ts` | pcmToWav 유지 또는 MP3 재생으로 복귀 |
| `elevenlabsConvAI.ts` | 삭제 (기존 websocket.ts 재활용) |
| `api.ts` | ConvAI 엔드포인트 → 기존 conversation 엔드포인트 |
| `write.tsx` | voiceState에 VAD 기반 자동 전환 추가 |

### 새 파일

| 파일 | 내용 |
|------|------|
| `frontend/src/hooks/useVAD.ts` | silero-vad 래퍼 |

---

## 비용 비교 (5분 대화 기준)

| 항목 | ConvAI (현재) | 커스텀 파이프라인 |
|------|------------|---------------|
| STT | 포함 | ~$0.03 (Scribe v2) |
| LLM | 포함 | ~$0.01 (GPT-4o-mini) |
| TTS | 포함 | ~$0.05 (ElevenLabs Turbo) |
| VAD | 포함 | 무료 (프론트) |
| **합계** | **~$0.50** | **~$0.09** |
| **월 1000건** | **~$500** | **~$90** |

약 **80% 비용 절감** 가능.

---

## 전환 단계

### Step 1: 프론트엔드 VAD 추가 (1일)
- `@ricky0123/vad-web` 패키지 설치
- `useVAD.ts` 훅 작성
- 마이크 스트리밍과 VAD 통합 테스트

### Step 2: 기존 WebSocket 파이프라인 재활성화 (0.5일)
- `websocket.ts` import 복원
- `conversation.py` WebSocket 엔드포인트 동작 확인
- `stt_service.py`, `tts_service.py` 정상 동작 확인

### Step 3: useConversationStore 전환 (1일)
- ElevenLabs 클라이언트 → 기존 wsClient 전환
- VAD 이벤트 기반 voiceState 관리
- TTS 재생 큐 복원 (MP3 기반)

### Step 4: Barge-in 구현 (0.5일)
- 프론트: AI 발화 중 VAD 감지 → barge_in 전송
- 백엔드: pipeline_state 기반 태스크 취소

### Step 5: 테스트 & 전환 (1일)
- 기능 테스트 (대화 → 일기 → 학습카드)
- 지연시간 측정 (ConvAI vs 커스텀)
- Feature flag로 A/B 테스트
- 안정화 후 ConvAI 코드 비활성화

**총 예상 기간: 4일**

---

## 리스크 & 완화

| 리스크 | 영향 | 완화 방법 |
|--------|------|----------|
| 지연시간 증가 | 체감 응답 느림 | LLM 문장 단위 스트리밍 (이미 구현), TTS WebSocket (이미 구현) |
| VAD 정확도 | 발화 잘림/오감지 | silero-vad 튜닝 (threshold, redemptionFrames) |
| 동시성 이슈 | STT/LLM/TTS 파이프라인 충돌 | pipeline_state 기반 태스크 관리 (이미 구현) |
| ElevenLabs STT 불안정 | 자막 누락 | 타임아웃 + 재연결 로직 (이미 구현) |
| 네이티브 모듈 필요 | Expo Go 불가 | dev client 빌드 (이미 사용 중) |

---

## 전환 판단 기준

다음 조건이 충족되면 전환 시작:
1. **월 대화 500건 초과** (ConvAI 비용 $250+)
2. **ConvAI 지연시간 불만** (커스텀이 더 빠를 수 있음)
3. **LLM 커스터마이징 필요** (프롬프트 변경, 함수 호출 등)
4. **MVP 안정화 완료** (핵심 기능 버그 없음)

---

## 참고: ElevenLabs ConvAI 내부 프로토콜

### 클라이언트 → 서버

| 메시지 | 형식 | 용도 |
|--------|------|------|
| 오디오 | `{"user_audio_chunk": "<base64 PCM>"}` | PCM 16kHz 16-bit mono |
| Pong | `{"type": "pong", "event_id": N}` | Ping 응답 (event_id 에코) |
| 텍스트 | `{"type": "user_message", "text": "..."}` | 텍스트 입력 |
| 활동 | `{"type": "user_activity"}` | 인터럽션 2초 블록 |

### 서버 → 클라이언트

| 메시지 | 형식 | 용도 |
|--------|------|------|
| 세션 초기화 | `conversation_initiation_metadata` | conversation_id, 오디오 포맷 |
| TTS 오디오 | `{"type": "audio", "audio": {"chunk": "<base64>"}}` | PCM 16kHz |
| AI 텍스트 | `{"type": "agent_response", "agent_response_event": {"agent_response": "..."}}` | 최종 응답 |
| 사용자 자막 (최종) | `{"type": "user_transcript", "user_transcription_event": {"user_transcript": "..."}}` | 확정 STT |
| 사용자 자막 (중간) | `{"type": "user_transcript_interim", ...}` | 임시 STT |
| 인터럽션 | `{"type": "interruption"}` | Barge-in 발생 |
| Ping | `{"type": "ping", "ping_event": {"event_id": N}}` | 킵얼라이브 |
| VAD 점수 | `{"type": "vad_score", ...}` | 음성 감지 신뢰도 0.0-1.0 |

---

## 기존 코드 재활용 목록

| 파일 | 현재 상태 | 커스텀 전환 시 |
|------|----------|-------------|
| `stt_service.py` | 비활성 (ConvAI 사용 중) | **그대로 재활용** |
| `tts_service.py` | 비활성 | **그대로 재활용** |
| `ai_service.py` | 일기/학습카드에만 사용 | **대화 LLM에도 재활용** |
| `conversation.py` | 비활성 (ConvAI 사용 중) | **그대로 재활용** |
| `websocket.ts` | 비활성 | **그대로 재활용** |

**핵심: 기존 코드의 90% 이상을 그대로 재활용 가능. 새로 짜야 할 건 VAD 훅 하나.**

---

## MVP 구현 과정에서 발견한 사항

### ConvAI 프로토콜 실측값 (문서와 다른 점)

| 항목 | 공식 문서 | 실제 동작 |
|------|----------|----------|
| TTS 오디오 필드 | `audio.chunk` | **`audio_event.audio_base_64`** |
| Ping 응답 | `{"type": "pong"}` | **`{"type": "pong", "event_id": N}`** (event_id 필수, 없으면 1008 close) |
| 세션 초기화 | `onopen` 시점 | **`conversation_initiation_metadata` 수신 후**에야 안전 |
| 오디오 포맷 | `pcm_16000` (문서) | `pcm_16000` (확인됨, meta에서 동적 확인 가능) |

### 프론트엔드 오디오 파이프라인 학습

1. **PCM → WAV 변환 필요**: iOS에서 raw PCM 재생 불가, 44바이트 WAV 헤더 추가 필수
2. **오디오 큐 순차 재생**: ElevenLabs가 여러 audio chunk를 보냄 → 큐에 넣고 순서대로 재생
3. **playAudioFromBase64에서 stopCurrentAudio 호출 금지**: 큐 재생 시 이전 플레이어를 죽이면 안 됨
4. **시뮬레이터 한계**: iOS 시뮬레이터에서 마이크/스피커 모두 불안정 (`HALPlugIn`, `IOProc` 에러). 실기기 테스트 필수

### 클라이언트 사이드 에너지 게이트 vs 서버 VAD

- 클라이언트에서 RMS 에너지 필터로 소음을 차단하면 **ElevenLabs 서버 VAD가 침묵을 감지 못함** (오디오 스트림이 끊기므로)
- **결론**: 에너지 필터는 시각적 피드백(Orb)용으로만 사용, 오디오 전송은 항상 보냄
- 서버 VAD에 완전히 위임하는 것이 안정적

### VoiceOrb UI 패턴

- `listening`: 실제 마이크 RMS 에너지로 Orb 크기 조절 → 말할 때만 커짐
- `ai_speaking`: fake random 볼륨 (TTS 오디오 에너지 계산은 과도)
- `idle`: 부드러운 breathing 애니메이션
- 스프링 애니메이션 (`Animated.spring`) → 탄성 있는 자연스러운 움직임

### DB 저장 전략 (ConvAI)

- 대화 중 DB 접근 0회 — 프론트 메모리(`accumulatedMessages`)에만 축적
- "대화 완료" 시 한번에 `POST /convai/session/{id}/finish`로 전송
- 리스크: 앱 크래시 시 대화 유실 → 추후 AsyncStorage 중간 저장 고려

### useEffect 무한 루프 방지

- zustand store 액션 + expo-audio-studio 훅을 useEffect 의존성에 넣으면 매 렌더마다 재생성 → 무한 루프
- **해결**: `useRef`로 최신 함수 참조 유지, useEffect 의존성은 상태값만
- cleanup effect는 `[]` 의존성 + `useRef.current()` 호출 패턴

### iOS 오디오 세션 충돌 (녹음 + 재생 동시)

**증상**: 마이크 녹음 시작 후 TTS 오디오 재생이 시작되면 녹음이 중단됨 (Chunk #1만 수신 후 멈춤)

**원인**: iOS 기본 오디오 세션 카테고리가 `playback` 전용. 재생이 시작되면 녹음 세션이 종료됨.

**에러 로그 패턴**:
```
[MediaToolbox] <<<< Boss >>>> signalled err=-12371
[MediaToolbox] <<<< FigFilePlayer >>>> signalled err=-12864
[CoreAudio] AudioDeviceStop: no device with given ID
[AudioToolbox] AQMEIO_HAL.cpp: Waiting for Stop to be signaled timed out
```

**해결 (3가지 필요)**:

1. **`setAudioModeAsync` 호출** — 앱 시작 시 `playAndRecord` + `mixWithOthers` 모드 설정:
```typescript
// audio.ts
import { setAudioModeAsync } from 'expo-audio';
await setAudioModeAsync({
  allowsRecording: true,
  playsInSilentMode: true,
  interruptionMode: 'mixWithOthers',
});
```

2. **마이크 강제 재시작** — AI 오디오 재생 후 녹음이 죽었을 가능성이 높으므로 `forceRestart` 패턴 사용:
```typescript
// useRealtimeRecorder.ts
const forceRestart = async () => {
  await recorder.stopRecording();       // 현재 녹음 정리
  await new Promise(r => setTimeout(r, 200)); // iOS 오디오 세션 안정화 대기
  await recorder.startRecording({...}); // 재시작
};
```

3. **voiceState 전이 감지** — `ai_speaking → listening` 전이 시 forceRestart 호출:
```typescript
// write.tsx
const prevVoiceStateRef = useRef(voiceState);
useEffect(() => {
  const prevState = prevVoiceStateRef.current;
  prevVoiceStateRef.current = voiceState;
  if (voiceState === 'listening' && prevState === 'ai_speaking') {
    forceRestart(); // AI 말하기 끝 → 마이크 복구
  }
}, [voiceState]);
```

**핵심 교훈**: iOS에서 녹음과 재생을 동시에 하려면 반드시 `AVAudioSessionCategoryPlayAndRecord` 설정이 필요하며, 그래도 재생이 녹음을 죽일 수 있으므로 강제 재시작 로직이 안전장치로 필요.
