# Custom Voice Pipeline 전환 가능성 조사 보고서

**조사일**: 2026-02-25  
**현재 아키텍처**: ElevenLabs ConvAI 직접 연결  
**전환 목표**: 프론트↔백엔드 WebSocket 커스텀 파이프라인

---

## 1. VAD (Voice Activity Detection) 구현 가능성

### 옵션 A: `@ricky0123/vad-web` (Silero VAD)

| 항목 | 평가 |
|------|------|
| 정확도 | ⭐⭐⭐⭐⭐ Silero VAD v5 기반, 업계 최고 수준 |
| React Native 호환 | ❌ **사용 불가** |
| 이유 | Web Audio API + AudioWorklet + ONNX Runtime Web 의존. React Native에는 Web Audio API 없음 |
| 대안 | `onnxruntime-react-native`로 Silero ONNX 모델 직접 추론 가능하나 AudioWorklet 없어 별도 오디오 브릿지 필요 |

**결론**: React Native/Expo에서 직접 사용 불가. 네이티브 모듈로 포팅하면 가능하나 공수 과다 (2~3일 추가).

### 옵션 B: `@siteed/expo-audio-studio` VAD 기능 활용 ⭐ 추천

| 항목 | 평가 |
|------|------|
| 정확도 | ⭐⭐⭐⭐ RMS + dB + silent 플래그 기반, 에너지 분석 내장 |
| React Native 호환 | ✅ **이미 사용 중** (`useRealtimeRecorder.ts`) |
| 구현 방식 | `onAudioStream` 콜백에서 매 100ms 청크의 에너지 분석 가능 |
| 추가 설치 | 없음 (이미 `@siteed/expo-audio-studio ^2.18.5` 설치됨) |

**분석 결과**:

`@siteed/expo-audio-studio`의 Features Extractor Worker 코드를 분석하면:
- `RMS_THRESHOLD = 0.01`, `SILENCE_THRESHOLD = 0.01` 내장
- `MIN_SILENCE_DURATION = 1.5 * sampleRate` (1.5초 침묵 감지)
- `SPEECH_INERTIA_DURATION = 0.1 * sampleRate` (0.1초 관성)
- `SpeechFeatures.isActive` 필드로 발화 감지 지원
- `enableProcessing: true` + `onAudioAnalysis` 콜백으로 분석 결과 수신 가능

**하지만**: 현재 `useRealtimeRecorder.ts`에서는 `enableProcessing`을 사용하지 않고, raw PCM 스트리밍만 수행 중. `onAudioAnalysis` 콜백을 추가하면 VAD 역할이 가능.

**구현 방향**:
```typescript
// useRealtimeRecorder.ts에 VAD 로직 추가
await recorder.startRecording({
  sampleRate: 16000,
  channels: 1,
  encoding: 'pcm_16bit',
  interval: 100,
  enableProcessing: true,  // ← 추가
  features: { rms: true, energy: true },  // ← 추가
  onAudioStream: async (event) => {
    // 기존 PCM 전송 로직
  },
  onAudioAnalysis: async (analysis) => {
    // VAD 판정: RMS 기반 발화 감지
    const isSpeaking = analysis.dataPoints.some(dp => !dp.silent);
    onVADStatus?.(isSpeaking);
  },
});
```

### 옵션 C: 에너지 기반 VAD (RMS Threshold) 직접 구현

| 항목 | 평가 |
|------|------|
| 정확도 | ⭐⭐⭐ 조용한 환경에서 충분, 소음 환경에서 오감지 가능 |
| React Native 호환 | ✅ 순수 JS, 플랫폼 무관 |
| 구현 복잡도 | ⭐ (매우 간단) |
| 참고 | 현재 `elevenlabsConvAI.ts`의 `calcEnergy()` 함수가 이미 RMS 계산 로직 보유 |

**분석 결과**:

`elevenlabsConvAI.ts`에 이미 `calcEnergy(base64PCM)` 함수가 있음:
```typescript
function calcEnergy(base64PCM: string): number {
  // PCM 16-bit → RMS → 0~1 정규화
  const rms = Math.sqrt(sumSquared / (numSamples / 4));
  return Math.min(1, rms / 5000);
}
```

이를 VAD로 확장하면:
```typescript
// 상태 머신: silence → speaking → silence
const SPEECH_THRESHOLD = 0.15;    // 발화 시작 임계값
const SILENCE_THRESHOLD = 0.05;   // 침묵 판정 임계값
const SILENCE_FRAMES = 15;        // 15 frames (1.5초) 연속 침묵 → 발화 종료
```

### VAD 최종 추천

| 우선순위 | 옵션 | 이유 |
|----------|------|------|
| 1순위 | **옵션 B + C 하이브리드** | `expo-audio-studio` 분석 + RMS threshold 조합 |
| 2순위 | **옵션 C 단독** | calcEnergy 재활용, 가장 빠른 구현 |
| 3순위 | 서버 사이드 VAD | 백엔드 STT의 VAD 모드 활용 (현재도 구현됨) |

**핵심 판단**: 이미 `@siteed/expo-audio-studio`에서 100ms 단위 PCM 청크를 받고 있으므로, 각 청크의 RMS 에너지를 계산하여 간단한 상태 머신으로 VAD를 구현하는 것이 가장 현실적. Silero VAD 수준의 정확도는 불필요 — 대화 앱이므로 배경 소음이 적은 환경에서 사용됨.

---

## 2. 레이턴시 비교 분석

### ConvAI (현재)

```
[사용자 발화 종료]
  → ElevenLabs 서버 VAD 감지          ~300ms
  → 내부 STT 처리                     ~200-500ms
  → LLM 응답 생성 (GPT-4o-mini)       ~500-800ms (첫 토큰)
  → TTS 합성 + 스트리밍                ~200-400ms (첫 청크)
  ─────────────────────────────────────
  총 체감 레이턴시: ~1.2-2.0초 (발화 종료 → 첫 TTS 재생)
```

**단일 홉이지만**: ElevenLabs 서버 내부에서 STT→LLM→TTS 순차 처리가 발생하므로, 단일 홉 = 저레이턴시가 아님. 서버 내부 파이프라인 지연이 있음.

### 커스텀 파이프라인 (전환 후)

```
[사용자 발화 종료 — 프론트 VAD 감지]
  → PCM → 백엔드 (WebSocket)          ~50-100ms (네트워크)
  → STT (ElevenLabs Scribe v2)        ~200-500ms
  → LLM (GPT-4o-mini 스트리밍)         ~500-800ms (첫 문장)
  → TTS (ElevenLabs WebSocket)         ~200-400ms (첫 청크)
  → MP3 → 프론트 (WebSocket)           ~50-100ms (네트워크)
  ─────────────────────────────────────
  총 체감 레이턴시: ~1.0-1.9초 (발화 종료 → 첫 TTS 재생)
```

### 레이턴시 비교 분석표

| 단계 | ConvAI | 커스텀 | 차이 |
|------|--------|--------|------|
| VAD 감지 | ~300ms (서버) | ~100-200ms (프론트, 즉시) | **-100~200ms** ✅ |
| 네트워크 (추가 홉) | 0ms | ~100-200ms (왕복) | **+100~200ms** ⚠️ |
| STT | ~200-500ms | ~200-500ms | 동일 |
| LLM | ~500-800ms | ~500-800ms | 동일 |
| TTS 첫 청크 | ~200-400ms | ~200-400ms | 동일 |
| **총합** | **~1.2-2.0초** | **~1.0-1.9초** | **약 ±0.2초** |

### 핵심 레이턴시 최적화 요인

1. **프론트 VAD 이점**: ConvAI는 오디오를 서버로 전송한 후 서버 VAD가 침묵을 감지해야 하는데, 프론트 VAD는 로컬에서 즉시 감지 → **100-300ms 절감**
2. **네트워크 추가 홉 비용**: 백엔드 경유로 RTT 1회 추가 → **100-200ms 추가**
3. **LLM 문장 단위 스트리밍**: 백엔드의 `handle_user_message_streaming()`이 이미 한국어 문장 종결어(다, 요, 죠, 네, 까) 감지 → 첫 문장 완성 즉시 TTS 전송
4. **TTS WebSocket 스트리밍**: `TTSStreamSession`이 이미 구현되어 문장 도착 즉시 합성 시작

### 레이턴시 결론

**ConvAI 대비 체감 레이턴시 차이: ±0.2초 이내** → 사실상 동등하거나 약간 빠를 수 있음.

이유:
- 프론트 VAD의 즉시 감지가 네트워크 추가 홉을 상쇄
- LLM/TTS는 동일 서비스(OpenAI, ElevenLabs) 사용 → 동일 레이턴시
- 백엔드의 문장 단위 스트리밍 파이프라인이 이미 최적화됨

---

## 3. 오디오 파이프라인 비교

### ConvAI (현재)

```
수신: base64 PCM 16kHz → pcmToWav() 변환 → WAV 파일 저장 → expo-audio 재생
큐잉: enqueueAudio() → processQueue() → 순차 재생
```

**복잡도**: PCM→WAV 변환 필요 (44바이트 헤더 추가), 매 청크마다 파일 I/O

### 커스텀 (전환 후)

```
수신: base64 MP3 → playAudioFromBase64() 직접 사용 → MP3 파일 저장 → expo-audio 재생
큐잉: 동일한 큐 메커니즘 재활용
```

**복잡도**: PCM→WAV 변환 불필요, MP3 직접 재생 → **더 단순**

### 재활용 가능 코드

| 함수 | 현재 용도 | 커스텀 전환 시 |
|------|----------|--------------|
| `playAudioFromBase64()` | 사용 안 함 (PCM→WAV 경로 사용) | **직접 사용** (MP3 재생) |
| `enqueueAudio()` | PCM→WAV 변환 후 큐잉 | MP3 직접 큐잉으로 변경 |
| `clearAudioQueue()` | 큐 초기화 | **그대로 재사용** |
| `setOnQueueEmpty()` | 큐 비었을 때 콜백 | **그대로 재사용** |
| `stopCurrentAudio()` | 현재 재생 중단 | **그대로 재사용** |
| `ensureAudioMode()` | iOS 오디오 세션 설정 | **그대로 재사용** |
| `pcmToWav()` | PCM→WAV 변환 | 불필요 (삭제 가능) |

**결론**: 오디오 파이프라인은 커스텀이 더 단순. `audio.ts`의 기존 `playAudioFromBase64()`를 직접 사용하면 되고, `enqueueAudio()`만 MP3 직접 큐잉하도록 수정하면 됨.

---

## 4. Barge-in 구현 난이도

### ConvAI (현재)

```typescript
// 서버가 자동 감지 → interruption 이벤트 전송
onInterruption: () => {
  clearAudioQueue();
  set({ voiceState: 'listening' });
}
```

**프론트 코드**: 3줄. ElevenLabs 서버가 모든 것을 처리.

### 커스텀 (전환 후)

**프론트엔드**:
```typescript
// VAD가 사용자 음성 감지 + AI가 말하는 중 → barge-in
if (voiceState === 'ai_speaking' && vadDetectedSpeech) {
  clearAudioQueue();                    // 1. 오디오 즉시 중단
  wsClient.send({ type: 'barge_in' }); // 2. 백엔드에 barge_in 전송
  set({ voiceState: 'listening' });      // 3. 상태 전이
}
```

**백엔드** (현재 상태 분석):
- `pipeline_state` 딕셔너리에 `llm_task`, `tts_session`, `relay_task` 저장 → 취소 가능
- `_handle_ai_reply_streaming()`에서 `asyncio.CancelledError` 처리 이미 구현됨
- ⚠️ **단, WebSocket 메시지 루프에 `barge_in` 핸들러가 아직 없음** → 추가 필요

**필요한 백엔드 수정** (~20줄):
```python
# conversation.py 메시지 루프에 추가
elif msg_type == "barge_in":
    if pipeline_state.get("llm_task"):
        pipeline_state["llm_task"].cancel()
    if pipeline_state.get("relay_task"):
        pipeline_state["relay_task"].cancel()
    if pipeline_state.get("tts_session"):
        await pipeline_state["tts_session"].close()
```

### 난이도 평가

| 항목 | ConvAI | 커스텀 | 비고 |
|------|--------|--------|------|
| 프론트 코드량 | 3줄 | ~15줄 | VAD 조건 + 큐 정리 + WS 전송 |
| 백엔드 코드량 | 0줄 | ~20줄 | barge_in 핸들러 + 태스크 취소 |
| 구현 난이도 | 없음 | **낮음** | pipeline_state 메커니즘 이미 존재 |
| 테스트 난이도 | 없음 | **중간** | 타이밍 경쟁 조건 검증 필요 |

---

## 5. iOS 오디오 세션 충돌

### 현재 해결 패턴 (ConvAI에서 검증됨)

1. **`ensureAudioMode()`**: `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers' })`
2. **`forceRestart()`**: AI 발화 종료 → 마이크 강제 재시작 (stop → 200ms 대기 → start)
3. **voiceState 전이 감지**: `ai_speaking → listening` 전이 시 forceRestart 호출

### 커스텀 전환 시 변경 사항

**변경 없음.** 동일한 패턴 그대로 재사용 가능.

이유:
- 오디오 재생은 동일하게 `expo-audio`의 `createAudioPlayer` 사용
- 마이크 녹음은 동일하게 `@siteed/expo-audio-studio`의 `useAudioRecorder` 사용
- iOS 오디오 세션 설정도 동일한 `setAudioModeAsync` 호출

**유일한 차이**: MP3 재생 vs WAV 재생이나, iOS 오디오 세션 관점에서 차이 없음 (둘 다 `AVAudioSessionCategoryPlayAndRecord` 모드).

---

## 6. WebSocket 클라이언트 재활용 분석

### `websocket.ts` (기존 WebSocketClient)

| 기능 | 상태 | 비고 |
|------|------|------|
| 연결/해제 | ✅ 구현됨 | `connect()`, `disconnect()` |
| 자동 재연결 | ✅ 구현됨 | 지수 백오프 (1s→16s, 5회) |
| JSON 메시지 | ✅ 구현됨 | `send(ClientMessage)` |
| Binary 프레임 | ✅ 구현됨 | `sendBinary(ArrayBuffer)` ← PCM 전송에 사용 |
| 상태 리스너 | ✅ 구현됨 | `onStatus()` |
| 메시지 리스너 | ✅ 구현됨 | `onMessage()` |
| 싱글톤 | ✅ 구현됨 | `wsClient` export |

**결론**: `websocket.ts`는 커스텀 파이프라인에 **그대로 사용 가능**. 수정 불필요.

---

## 7. 비용 비교 (5분 대화 기준)

| 항목 | ConvAI (현재) | 커스텀 | 절감 |
|------|------------|--------|------|
| STT | 포함 | ~$0.03 (Scribe v2) | - |
| LLM | 포함 | ~$0.01 (GPT-4o-mini) | - |
| TTS | 포함 | ~$0.05 (ElevenLabs Turbo) | - |
| VAD | 포함 | $0 (프론트 로컬) | - |
| **합계** | **~$0.50** | **~$0.09** | **82%↓** |
| **월 1,000건** | **~$500** | **~$90** | **$410 절감** |

---

## 8. 전환 공수 재추정

### 상세 작업 분해

| 단계 | 작업 | 공수 | 비고 |
|------|------|------|------|
| **1. VAD 훅** | `useVAD.ts` 작성 (RMS 기반 상태 머신) | 0.5일 | calcEnergy 재활용 |
| **2. Store 전환** | `useConversationStore.ts` → wsClient 기반으로 재작성 | 1일 | 가장 큰 변경 |
| **3. 오디오 큐 수정** | `enqueueAudio()` MP3 직접 큐잉으로 변경 | 0.25일 | 단순화됨 |
| **4. Barge-in 프론트** | VAD 감지 → barge_in 전송 로직 | 0.25일 | - |
| **5. Barge-in 백엔드** | `conversation.py`에 barge_in 핸들러 추가 | 0.25일 | pipeline_state 이미 있음 |
| **6. 통합 테스트** | 대화→일기→학습카드 E2E | 0.5일 | 실기기 필수 |
| **7. iOS 오디오 테스트** | forceRestart 패턴 검증 | 0.25일 | 기존 패턴 재사용 |
| **8. 버그 수정 버퍼** | 예상치 못한 이슈 대응 | 0.5일 | - |
| **합계** | | **3.5일** | 기존 4일 예상 → 0.5일 단축 |

### 공수 단축 이유

- 기존 문서(`future-custom-pipeline.md`)에서 `@ricky0123/vad-web` 설치 + 네이티브 모듈 포팅을 계획했으나, RMS 기반 VAD로 충분하여 1일 → 0.5일로 단축
- 백엔드 코드가 예상보다 완성도 높음 (`pipeline_state`, TTS WebSocket, LLM 스트리밍 모두 구현됨)

---

## 9. 리스크 매트릭스

| 리스크 | 확률 | 영향 | 완화 방법 |
|--------|------|------|----------|
| RMS VAD 소음 오감지 | 중 | 중 | threshold 튜닝, 추후 서버사이드 VAD 병행 가능 |
| STT 레이턴시 변동 | 낮 | 중 | ElevenLabs Scribe v2 이미 검증됨 |
| Barge-in 타이밍 경쟁조건 | 중 | 낮 | pipeline_state lock 또는 atomic flag |
| iOS forceRestart 실패 | 낮 | 높 | 기존 ConvAI에서 검증된 패턴 그대로 사용 |
| WebSocket 연결 불안정 | 낮 | 중 | 자동 재연결 이미 구현됨 (지수 백오프) |

---

## 10. 최종 결론

### 전환 추천 여부: ✅ **전환 추천**

#### 근거

1. **레이턴시**: ConvAI 대비 ±0.2초 이내 → 체감 차이 없음. 프론트 VAD가 네트워크 추가 홉을 상쇄.

2. **VAD**: `@siteed/expo-audio-studio` + RMS 에너지 기반 하이브리드 → 추가 패키지 설치 없이 구현 가능. 대화 앱 특성상 (조용한 환경) 충분한 정확도.

3. **공수**: 3.5일 (기존 예상 4일 대비 소폭 단축). 백엔드 코드 90% 이상 재활용, 프론트엔드도 `websocket.ts`, `audio.ts` 핵심 유틸 재활용.

4. **비용**: 82% 절감 ($0.50 → $0.09/건). 월 1,000건 기준 $410/월 절감.

5. **확장성**: 다국어 동적 프롬프트, LLM 커스터마이징, 함수 호출 등 향후 기능 확장의 기반.

#### 전환 우선순위

| 조건 | 현재 상태 | 결론 |
|------|----------|------|
| MVP 안정화 완료? | ✅ ConvAI 기반 동작 확인 | 전환 가능 |
| 다국어 동적 프롬프트 필요? | ✅ 핵심 요구사항 | **전환 핵심 동기** |
| 비용 임계치 도달? | 아직 미달 (초기) | 장기적으로 필수 |
| 기술적 리스크? | 낮음 (코드 90% 재활용) | 안전한 전환 |

#### 추천 VAD 구현

**RMS 에너지 기반 + 상태 머신** (옵션 C, 필요시 B 보강)

```
idle → [에너지 > 0.15] → speaking → [에너지 < 0.05 × 15프레임] → speech_end
```

- 추가 패키지: 없음
- 구현 공수: 0.5일
- `calcEnergy()` 함수 재활용
- 부족하면 추후 `expo-audio-studio`의 `onAudioAnalysis` 보강

---

## 참고: 전환 체크리스트

- [ ] `useVAD.ts` 훅 작성 (RMS 상태 머신)
- [ ] `useConversationStore.ts` → wsClient 기반 재작성
- [ ] `audio.ts` enqueueAudio MP3 직접 큐잉
- [ ] `conversation.py` barge_in 핸들러 추가
- [ ] iOS 실기기 E2E 테스트
- [ ] Feature flag로 ConvAI ↔ 커스텀 전환 지원
- [ ] ConvAI 코드 비활성화 (삭제는 안정화 후)
