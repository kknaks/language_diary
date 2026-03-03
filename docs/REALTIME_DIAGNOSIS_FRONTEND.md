# 프론트엔드 진단 보고서

> 작성일: 2026-03-02  
> 대상 파일: `write.tsx`, `useConversationStore.ts`, `useRealtimeRecorder.ts`, `audio.ts`, `websocket.ts`

---

## STT_FAILED 관련 프론트 원인

### 에러 메시지 분석

```
STT_FAILED: 오디오 전송 실패: received 1000 (OK); then sent 1000 (OK)
```

이 메시지는 **WebSocket이 정상 종료(close code 1000)된 후에도 오디오 바이너리를 전송하려는 경우** 서버에서 발생한다. 즉, 프론트엔드가 **이미 닫힌/닫히는 중인 WebSocket에 오디오 청크를 보내고 있다**.

### 근본 원인: `sendBinary` 가드 부재 + 타이밍 레이스

#### 원인 1: `forceRestart` 중 오디오 청크 유출

`ai_speaking` → `listening` 전환 시 다음이 순서대로 발생한다:

```
1. onQueueDrain 콜백 발동
2. set({ voiceState: 'listening' })      ← Zustand 상태 업데이트
3. React useEffect 감지 (voiceState 변경)
4. forceRestartRef.current() 호출
   4a. recorder.stopRecording()
   4b. 200ms 대기
   4c. doStartRecording() ← 새 레코딩 시작
```

**문제**: 단계 2에서 `voiceState`가 `'listening'`으로 바뀌는 순간, `onAudioStream` 콜백 내 에코 게이트가 열린다:

```typescript
if (voiceStateRef.current !== 'ai_speaking') {
  sendAudioChunkRef.current(base64);  // ← 이제 전송 허용!
}
```

그러나 단계 4a에서 `recorder.stopRecording()`이 완료되기 전까지 **기존 레코더가 여전히 오디오 청크를 콜백으로 전달**하고 있다. 이 "잔여 청크"가 WebSocket으로 전송된다.

만약 이 시점에 서버가 STT 세션을 종료/재시작하는 과정이면, 닫히는 WebSocket 하위 연결에 바이너리가 도달하여 `STT_FAILED`가 발생한다.

#### 원인 2: `sendBinary`의 readyState 체크 한계

```typescript
// websocket.ts
sendBinary(data: ArrayBuffer) {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    return;  // OPEN이 아니면 무시
  }
  this.ws.send(data);
}
```

이 체크는 메인 WebSocket 연결 자체의 상태만 본다. 서버 쪽에서 **STT 스트림(내부 WebSocket)이 닫힌 상태**인데 메인 WS는 아직 `OPEN`인 경우, 프론트에서는 정상으로 판단하고 바이너리를 계속 보낸다.

#### 원인 3: reconnection 중 오디오 전송

WebSocket 재연결 시 `reconnecting` 상태지만, 마이크 레코딩은 계속 돌고 있다. 재연결이 완료되어 `OPEN`이 되는 순간 쌓여있던 `onAudioStream` 콜백이 즉시 `sendBinary`를 호출한다. 서버의 새 세션이 아직 STT 스트림을 준비하지 못한 상태면 `STT_FAILED`가 발생할 수 있다.

### STT_FAILED 시나리오 요약

```
시간축 →
──────────────────────────────────────────────────
[Queue drain]
  ↓
[set voiceState = 'listening']  ← 에코 게이트 열림
  ↓                              
[useEffect triggers forceRestart]
  ↓
[recorder.stopRecording()]      ← 비동기! 아직 진행 중
  │                              
  │  ← 이 구간에서 기존 레코더가 마지막 청크들을 발사 →  sendBinary()
  │     서버: STT 스트림 이미 종료/재시작 중
  │     → STT_FAILED
  ↓
[200ms 대기]
  ↓
[doStartRecording()]            ← 새 레코딩 시작
```

---

## 느려짐 관련 프론트 원인

### 원인 1: `ai_speaking` 중 `setVolume` 100ms 간격 호출 → 전체 트리 리렌더

```typescript
// write.tsx - Volume animation
if (voiceState === 'ai_speaking') {
  volumeIntervalRef.current = setInterval(() => {
    setVolume(0.3 + Math.random() * 0.5);  // 초당 10회 Zustand set
  }, 100);
}
```

`setVolume`은 Zustand store의 `volume`을 변경한다. 이 값을 구독하는 컴포넌트:

| 컴포넌트 | 리렌더 비용 |
|----------|------------|
| **Live2DAvatar** | `postMessage`로 WebView에 JSON 전송 → 높음 |
| **VoiceOrb (mini)** | Animated.spring 실행 → 중간 |
| **WriteScreen 전체** | `volume` 직접 구독 → `useConversationStore`에서 volume 가져오므로 전체 리렌더 |

**초당 10회** × **WebView postMessage** = 심각한 JS 스레드 부하.

특히 `Live2DAvatar`는 매 volume 변경마다:
```typescript
useEffect(() => {
  webViewRef.current?.postMessage(JSON.stringify({ type: 'volume', data: volume }));
}, [volume]);
```
이것이 React Native → WebView 브릿지를 초당 10회 크로스한다.

### 원인 2: `tts_audio` 매 청크마다 `set({ voiceState: 'ai_speaking' })`

```typescript
case 'tts_audio': {
  set({ voiceState: 'ai_speaking' });  // ← 매번 호출
  enqueueMp3Audio(message.audio_data);
  break;
}
```

AI 응답 하나에 TTS 청크가 3~10개 올 수 있다. 이미 `'ai_speaking'`인데도 **매 청크마다 Zustand `set`을 호출**하면:

1. Zustand의 `set`은 **참조 비교 없이 항상 구독자에게 알림** (zustand v4 기본 동작)
2. 모든 `voiceState` 구독 컴포넌트가 리렌더: `VoiceOrb`, `Live2DAvatar`, `VoiceStatus`, `WriteScreen` 자체
3. 특히 `WriteScreen`의 `visibleMessages` 계산 + `Live2DAvatar`의 `useEffect([voiceState])`가 반복 발동

### 원인 3: `visibleMessages` 매 렌더마다 배열 재생성

```typescript
const visibleMessages = (() => {
  if (voiceState === 'ai_speaking') {
    const lastAi = [...messages].reverse().find(m => m.role === 'assistant');
    return lastAi ? [lastAi] : [];
  }
  return [];
})();
```

이 코드는:
- `messages` 배열을 복사 (`[...messages]`)
- reverse() 호출
- 매 렌더마다 새 배열 참조 생성

`volume`이 초당 10회 바뀌므로, 초당 10회 이 연산이 실행된다. `messages`가 20개 이상이면 성능 부하.

### 원인 4: `onAudioStream` 콜백 내 base64 인코딩/디코딩 + VAD 연산

```typescript
// useRealtimeRecorder.ts - onAudioStream
pcmBytes = toByteArray(data);        // base64 → Uint8Array
const db = computeDbFromPcm(pcmBytes); // 매 샘플 순회
runVad(db);                           // 상태 머신
callbackRef.current?.(base64);        // 다시 base64로 전송
```

100ms 간격으로 오디오 청크가 오면, 초당 10회:
- base64 디코딩 (CPU)
- PCM 전체 순회하며 RMS 계산 (CPU)
- VAD 상태 머신 실행

이 자체는 무거운 연산은 아니지만, **동시에 volume setInterval + Zustand 리렌더 + WebView postMessage**가 모두 JS 스레드에서 일어나므로 **JS 스레드 병목**이 심화된다.

### 원인 5: `onQueueDrain` + `forceRestart` 체인의 비동기 지연

```
tts_audio 마지막 청크 재생 완료
  ↓
onQueueDrain 콜백 (playbackStatusUpdate 이벤트에서 호출)
  ↓
set({ voiceState: 'listening' })
  ↓ (다음 React 렌더 사이클)
useEffect 감지
  ↓
forceRestart()
  ├─ recorder.stopRecording()     ~50-100ms
  ├─ setTimeout(200ms)            200ms 고정 대기
  └─ doStartRecording()           ~100-200ms (iOS 오디오 세션 설정)
  ↓
총 ~350-500ms 마이크 비활성 구간
```

이 구간 동안 유저가 말을 해도 캡처되지 않으므로 **체감상 "느리다"**고 느낀다.

### 느려짐 시나리오 요약

```
JS Thread 부하 분석 (ai_speaking 중, 100ms 주기)
─────────────────────────────────────────────
[setInterval: setVolume()]           ← Zustand set
  → WriteScreen 리렌더
  → VoiceOrb 리렌더 (Animated.spring)
  → Live2DAvatar useEffect → postMessage  ← WebView 브릿지
  → VoiceStatus 리렌더

[onAudioStream 콜백]                 ← 마이크 청크
  → base64 decode
  → computeDbFromPcm (PCM 순회)
  → runVad
  → 에코 게이트 체크 → sendBinary

[tts_audio 메시지 도착]              ← WS 메시지
  → set({ voiceState: 'ai_speaking' })  ← 불필요한 중복 set
  → 전체 voiceState 구독자 리렌더 (위와 동일)

= JS 스레드가 100ms마다 위 모든 작업을 처리해야 함
= UI 프레임 드롭 + 입력 지연
```

---

## 해결 방안

### 방안 1: STT_FAILED 해결 — `forceRestart` 전 오디오 전송 차단

**문제**: `voiceState`가 `'listening'`으로 바뀌는 즉시 에코 게이트가 열리지만, 기존 레코더가 아직 살아있음.

**해결**: `forceRestart` 시작~완료 사이에 오디오 전송을 차단하는 플래그 추가.

```typescript
// useRealtimeRecorder.ts
const restartingRef = useRef(false);

const forceRestart = useCallback(async () => {
  restartingRef.current = true;  // ← 전송 차단
  try {
    await recorder.stopRecording();
    await new Promise(r => setTimeout(r, 200));
    await doStartRecording(callbackRef.current, vadCallbacksRef.current);
  } finally {
    restartingRef.current = false;  // ← 전송 허용
  }
}, [...]);

// 외부에서 확인 가능하도록 expose
return { ..., isRestarting: restartingRef };
```

```typescript
// write.tsx - 에코 게이트에 restarting 체크 추가
startStreamingRef.current(
  (base64) => {
    if (voiceStateRef.current !== 'ai_speaking' && !isRestartingRef.current) {
      sendAudioChunkRef.current(base64);
    }
  },
  ...
)
```

### 방안 2: 느려짐 해결 — `voiceState` 중복 set 제거

**문제**: `tts_audio` 매 청크마다 `set({ voiceState: 'ai_speaking' })` 호출.

**해결**: 이미 같은 상태면 set을 건너뛴다.

```typescript
case 'tts_audio': {
  if (get().bargePending) break;
  if (get().voiceState !== 'ai_speaking') {  // ← 가드 추가
    set({ voiceState: 'ai_speaking' });
  }
  enqueueMp3Audio(message.audio_data);
  break;
}
```

**효과**: AI 응답당 리렌더 횟수 3~10회 → 1회로 감소.

### 방안 3: 느려짐 해결 — volume 업데이트 최적화

**문제**: `setVolume`이 Zustand의 `volume`을 100ms마다 변경 → 전체 트리 리렌더.

**해결 A**: volume을 Zustand에서 분리하여 `useRef` + `Animated.Value`로 관리.

```typescript
// Animated.Value로 직접 관리 (Zustand 거치지 않음)
const volumeAnim = useRef(new Animated.Value(0)).current;

// ai_speaking 중:
setInterval(() => {
  volumeAnim.setValue(0.3 + Math.random() * 0.5);  // React 리렌더 없음
}, 100);

// VoiceOrb, Live2DAvatar에 Animated.Value 직접 전달
```

**해결 B** (더 간단): volume 업데이트 빈도를 줄인다 (100ms → 250ms).

```typescript
volumeIntervalRef.current = setInterval(() => {
  setVolume(0.3 + Math.random() * 0.5);
}, 250);  // 초당 4회로 감소
```

**해결 C**: Live2DAvatar의 volume postMessage를 쓰로틀링.

```typescript
// Live2DAvatar.tsx
const lastVolumePostRef = useRef(0);
useEffect(() => {
  const now = Date.now();
  if (now - lastVolumePostRef.current < 150) return;  // 150ms 쓰로틀
  lastVolumePostRef.current = now;
  webViewRef.current?.postMessage(JSON.stringify({ type: 'volume', data: volume }));
}, [volume]);
```

### 방안 4: 느려짐 해결 — `visibleMessages` 메모이제이션

```typescript
const visibleMessages = useMemo(() => {
  if (voiceState === 'ai_speaking') {
    const lastAi = [...messages].reverse().find(m => m.role === 'assistant');
    return lastAi ? [lastAi] : [];
  }
  return [];
}, [voiceState, messages]);  // volume 변경 시 재계산 방지
```

현재는 inline IIFE라서 매 렌더마다 실행됨. `useMemo`로 감싸면 `voiceState`나 `messages`가 바뀔 때만 재계산.

### 방안 5: 느려짐 해결 — Zustand selector로 구독 범위 최소화

현재 `WriteScreen`은 store 전체를 구조분해한다:

```typescript
const { voiceState, volume, messages, ... } = useConversationStore();
```

이렇게 하면 **store의 아무 필드라도 바뀌면 리렌더**된다.

**해결**: 필요한 필드만 개별 selector로 구독.

```typescript
const voiceState = useConversationStore(s => s.voiceState);
const volume = useConversationStore(s => s.volume);
const messages = useConversationStore(s => s.messages);
// ... 각각 개별 구독
```

또는 `shallow` 비교 사용:

```typescript
import { shallow } from 'zustand/shallow';
const { voiceState, messages } = useConversationStore(
  s => ({ voiceState: s.voiceState, messages: s.messages }),
  shallow
);
```

### 방안 6: `forceRestart` 200ms 딜레이 최적화

**문제**: 고정 200ms 대기가 매 AI 턴 끝마다 발생.

**해결**: 조건부로 줄이거나, 레코더 상태를 확인하여 준비되면 즉시 시작.

```typescript
// 최소 대기 후 레코더 상태 확인
await new Promise(r => setTimeout(r, 50));  // iOS 최소 안정화
// 또는 expo-audio-studio의 상태를 폴링하여 ready 시 즉시 시작
```

단, iOS 오디오 세션 안정화를 위해 최소 100ms는 유지하는 것을 권장.

---

## 우선순위 요약

| 순위 | 방안 | 효과 | 난이도 |
|------|------|------|--------|
| 🔴 1 | voiceState 중복 set 제거 (방안 2) | 리렌더 3~10x 감소 | 1줄 수정 |
| 🔴 2 | volume Zustand 분리 또는 쓰로틀 (방안 3) | JS 스레드 부하 대폭 감소 | 중간 |
| 🟡 3 | forceRestart 중 오디오 차단 (방안 1) | STT_FAILED 해결 | 쉬움 |
| 🟡 4 | visibleMessages 메모이제이션 (방안 4) | 불필요한 배열 연산 제거 | 1줄 수정 |
| 🟢 5 | Zustand selector 최적화 (방안 5) | 전체 리렌더 범위 축소 | 중간 |
| 🟢 6 | forceRestart 딜레이 최적화 (방안 6) | 턴 전환 체감 속도 향상 | 쉬움 |

**결론**: 느려짐의 주요 원인은 **volume 100ms 업데이트 + Zustand 리렌더 폭포 + Live2DAvatar WebView 브릿지 과부하**이며, STT_FAILED는 **forceRestart 타이밍 레이스**가 원인이다. 방안 1~4를 적용하면 두 문제 모두 크게 개선될 것으로 예상.
