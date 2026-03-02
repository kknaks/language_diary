# AEC Echo 문제 진단 보고서

> 작성일: 2026-03-02
> 대상: Language Diary 프론트엔드 (React Native / Expo)

## 근본 원인

**핵심 문제: iOS와 Android 모두 하드웨어 AEC(Acoustic Echo Cancellation)가 활성화되지 않고 있다.**

현재 구조에서 TTS 오디오가 스피커로 재생될 때, 마이크는 계속 녹음 중이며 그 스피커 출력을 그대로 잡는다. 잡힌 오디오가 VAD에서 "음성"으로 감지되면 barge-in이 트리거되거나, 서버에 전송되어 AI가 자기 말에 반응하는 echo loop이 발생한다.

### 원인 체인

```
TTS 재생 (스피커) → 마이크가 스피커 소리 캡처 → VAD가 "음성"으로 판단
→ barge-in 또는 STT로 전송 → AI가 자기 말에 반응 → 또다시 TTS 재생... (loop)
```

### 왜 AEC가 동작하지 않는가?

1. **iOS**: `expo-audio`의 `setAudioModeAsync`가 AVAudioSession을 `.playAndRecord` category + `mode: .default`로 설정한다. iOS 하드웨어 AEC는 **`mode: .voiceChat`** (또는 `.videoChat`) + **`defaultToSpeaker` option** 조합에서만 자동으로 활성화된다. 현재 설정에서는 AEC가 꺼져있다.

2. **Android**: `@siteed/expo-audio-studio`가 `AudioRecord`를 생성할 때 항상 **`MediaRecorder.AudioSource.MIC`**을 사용한다. Android에서 시스템 레벨 AEC는 **`AudioSource.VOICE_COMMUNICATION`**을 사용할 때 자동으로 활성화된다. 현재 `audioFocusStrategy: 'communication'`은 오디오 포커스 정책만 바꿀 뿐, `AudioSource`를 변경하지 않는다.

3. **소프트웨어 에코 게이트 부재**: 현재 코드에서 TTS 재생 중에도 마이크 오디오가 계속 서버로 전송되며, VAD도 계속 활성화 상태이다. `voiceState === 'ai_speaking'`일 때 barge-in 용으로 VAD를 유지하지만, AEC 없이는 TTS 소리 자체가 barge-in을 trigger 한다.

---

## iOS 분석

### 현재 설정 (문제)

#### `expo-audio` (`setAudioModeAsync`)
```typescript
setAudioModeAsync({
  allowsRecording: true,       // → category = .playAndRecord ✅
  playsInSilentMode: true,     // → playsInSilentMode = true ✅
  interruptionMode: 'duckOthers', // → options: .duckOthers ✅
  shouldRouteThroughEarpiece: false, // iOS에서는 효과 없음 (Android 전용)
});
```

이 설정은 네이티브에서 다음과 같이 변환된다 (`expo-audio/ios/AudioModule.swift` 확인):

```swift
session.setCategory(.playAndRecord, options: [.duckOthers, .allowBluetooth])
// mode는 항상 .default
```

#### `@siteed/expo-audio-studio` (녹음 시작 시)
```swift
// AudioStreamManager.swift line 257
session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .mixWithOthers])
```

**문제점**: `@siteed/expo-audio-studio`가 녹음 시작 시 세션을 **다시 설정**하면서 `expo-audio`가 설정한 `duckOthers`를 `mixWithOthers`로 덮어쓴다. 또한 두 라이브러리 모두 `mode: .default`를 사용한다.

### iOS AEC 활성화 요건

iOS에서 하드웨어 AEC가 자동 활성화되려면:

| 항목 | 필요 값 | 현재 값 | 상태 |
|------|---------|---------|------|
| Category | `.playAndRecord` | `.playAndRecord` | ✅ |
| Mode | `.voiceChat` | `.default` | ❌ |
| defaultToSpeaker | `.defaultToSpeaker` option | 없음 | ❌ |

- **`mode: .voiceChat`**: iOS의 Voice Processing I/O audio unit을 활성화하여 하드웨어 AEC, AGC(Automatic Gain Control), noise suppression을 모두 켠다.
- **`defaultToSpeaker`**: `.voiceChat` 모드에서 오디오를 이어피스 대신 스피커로 라우팅. 이 옵션 없이 `.voiceChat`을 쓰면 소리가 이어피스(수화기)로 나가서 사용자가 들을 수 없다.

### `expo-audio` vs `expo-av` 차이

- **`expo-av`**: `Audio.setAudioModeAsync`에 `shouldDuckAndroid` 등 Android 전용 옵션이 있었고, iOS에서는 동일하게 `.playAndRecord` + `.default` mode를 사용했다. AEC 관련 설정은 없었다.
- **`expo-audio`** (현재 사용 중): `expo-av`의 후속 버전으로, API가 더 단순하지만 역시 `AVAudioSession.Mode`를 제어하는 옵션이 없다. **`expo-audio`만으로는 AEC를 활성화할 수 없다.**
- **`@siteed/expo-audio-studio`**: iOS 녹음 설정에서 `ios.audioSession.mode: 'VoiceChat'`과 `categoryOptions: ['DefaultToSpeaker']`를 지원한다. **이 라이브러리의 옵션을 사용하면 AEC 활성화가 가능하다.**

### 세션 충돌 문제

현재 두 라이브러리가 동시에 `AVAudioSession.sharedInstance()`를 설정하고 있다:
1. `expo-audio`의 `setAudioModeAsync` → `mode: .default`, `options: .duckOthers`
2. `@siteed/expo-audio-studio`의 `startRecording` → `mode: .default`, `options: .mixWithOthers`

**마지막에 호출된 설정이 이긴다.** 녹음 시작 시 `expo-audio-studio`가 세션을 덮어쓰므로, `expo-audio`에서 설정한 `duckOthers`는 무효화된다.

---

## Android 분석

### 현재 설정 (문제)

```typescript
// useRealtimeRecorder.ts
await recorder.startRecording({
  // ...
  ...(Platform.OS === 'android' && {
    android: { audioFocusStrategy: 'communication' as const },
  }),
});
```

이 설정은 네이티브에서 다음과 같이 동작한다:

1. **Audio Focus**: `AudioAttributes.USAGE_VOICE_COMMUNICATION` + `AUDIOFOCUS_GAIN`으로 포커스 요청 ✅
2. **AudioRecord 생성**: `MediaRecorder.AudioSource.MIC`로 초기화 ❌

### Android AEC 활성화 요건

Android에서 시스템 레벨 AEC를 활성화하려면:

| 항목 | 필요 값 | 현재 값 | 상태 |
|------|---------|---------|------|
| AudioSource | `VOICE_COMMUNICATION` | `MIC` | ❌ |
| AudioManager mode | `MODE_IN_COMMUNICATION` (선택) | `MODE_NORMAL` | ⚠️ |
| AcousticEchoCanceler | 명시적 attach (대안) | 없음 | ❌ |

### `audioFocusStrategy: 'communication'`의 실제 효과

소스 코드 분석 결과 (`AudioRecorderManager.kt` line 1846~2010):
- `communication` 전략은 **오디오 포커스 요청**에만 영향을 미친다
- `AudioAttributes.USAGE_VOICE_COMMUNICATION`으로 포커스를 요청하여 다른 앱 오디오를 ducking
- **`AudioRecord`의 `AudioSource`는 여전히 `MIC`** (line 842, 663)
- **`AudioManager.setMode(MODE_IN_COMMUNICATION)`도 호출하지 않음**

### Android AEC 옵션

Android에서 AEC를 활성화하는 방법은 두 가지:

1. **`AudioSource.VOICE_COMMUNICATION` 사용**: AudioRecord 생성 시 이 소스를 사용하면 시스템이 자동으로 AEC, AGC, NS(Noise Suppression)을 적용한다.
2. **`AcousticEchoCanceler.create(audioSessionId)` 명시적 사용**: AudioRecord의 세션 ID에 AEC 인스턴스를 연결한다. `AudioSource.MIC`와 함께 사용 가능하지만 디바이스 호환성에 의존한다.

`@siteed/expo-audio-studio`는 **두 가지 모두 사용하지 않고 있다.** `audioFocusStrategy: 'communication'`이라는 이름 때문에 AEC가 활성화될 것처럼 보이지만, 실제로는 포커스 정책만 변경한다.

---

## 해결 방안 비교

| 옵션 | 구현 복잡도 | 효과 | 추천 여부 | 비고 |
|------|------------|------|----------|------|
| **A: iOS AVAudioSession `.voiceChat` + `defaultToSpeaker`** | ★★☆☆☆ (낮음) | ★★★★★ (높음) | ✅ **강력 추천** | `@siteed/expo-audio-studio`의 `ios.audioSession` 옵션 활용 |
| **B: Android `AudioSource.VOICE_COMMUNICATION`** | ★★★★☆ (높음) | ★★★★★ (높음) | ⚠️ 조건부 추천 | `@siteed/expo-audio-studio` 라이브러리 수정 또는 PR 필요 |
| **C: TTS 중 VAD/마이크 입력 무시 (software echo gate)** | ★★☆☆☆ (낮음) | ★★★☆☆ (중간) | ✅ **즉시 적용 가능** | barge-in 불가, 하드웨어 AEC와 병행 권장 |
| **D: TTS 중 마이크 중지 + `forceRestart()`** | ★★☆☆☆ (낮음) | ★★★☆☆ (중간) | ⚠️ 차선책 | barge-in 불가, 전환 시 200ms 딜레이 |
| **E: ElevenLabs ConvAI SDK 내장 AEC** | N/A | N/A | ❌ 해당 없음 | 프로젝트에서 ConvAI SDK 미사용 |

---

## 추천 해결 방안

### 1차 권장: 옵션 A + C 조합 (iOS 하드웨어 AEC + 소프트웨어 에코 게이트)

#### iOS: 옵션 A 구현

`@siteed/expo-audio-studio`의 `startRecording` 호출 시 iOS 오디오 세션 설정 추가:

```typescript
await recorder.startRecording({
  sampleRate: 16000,
  channels: 1,
  encoding: 'pcm_16bit',
  interval: 100,
  enableProcessing: false,
  // iOS: VoiceChat mode로 하드웨어 AEC 활성화
  ...(Platform.OS === 'ios' && {
    ios: {
      audioSession: {
        category: 'PlayAndRecord',
        mode: 'VoiceChat',           // AEC, AGC, NS 자동 활성화
        categoryOptions: [
          'DefaultToSpeaker',        // 스피커 출력 (이어피스 아닌)
          'AllowBluetooth',          // BT 디바이스 지원
          'DuckOthers',              // 다른 앱 오디오 ducking
        ],
      },
    },
  }),
  // Android: communication focus
  ...(Platform.OS === 'android' && {
    android: { audioFocusStrategy: 'communication' as const },
  }),
  onAudioStream: async (event) => { /* ... */ },
});
```

**`VoiceChat` 모드의 효과**:
- iOS Voice Processing I/O audio unit 활성화
- 하드웨어 AEC: 스피커 출력을 마이크 입력에서 제거
- AGC: 자동 게인 조절
- Noise Suppression: 배경 소음 억제

**주의**: `expo-audio`의 `setAudioModeAsync`가 `@siteed/expo-audio-studio` 이전에 호출되므로, `expo-audio-studio`가 세션을 덮어쓴다. `expo-audio-studio`의 iOS audioSession 설정이 최종 설정이 된다.

#### 양 플랫폼: 옵션 C 보완 (소프트웨어 에코 게이트)

하드웨어 AEC가 100% 에코를 제거하지 못할 수 있으므로, 소프트웨어 레벨 보완:

```typescript
// write.tsx의 VAD callbacks에서
onSpeechStart: () => {
  const currentVoiceState = voiceStateRef.current;
  if (currentVoiceState === 'ai_speaking') {
    // barge-in 로직 (현재대로 유지하되, 더 높은 임계값 적용 가능)
    // 또는 아예 하드웨어 AEC가 정상이면 현재 로직 유지
  }
},
```

추가로, `sendAudioChunk`에서 `voiceState === 'ai_speaking'`일 때 오디오 전송을 완전히 차단하는 것도 고려:

```typescript
// 현재: 항상 전송
sendAudioChunkRef.current(base64);

// 개선: AI 말하는 중에는 전송 차단 (barge-in 판단은 VAD로만)
if (voiceStateRef.current !== 'ai_speaking') {
  sendAudioChunkRef.current(base64);
}
```

### 2차 권장: 옵션 B (Android `AudioSource.VOICE_COMMUNICATION`)

이 옵션은 `@siteed/expo-audio-studio` 라이브러리의 수정이 필요하다:

**필요한 변경** (`AudioRecorderManager.kt`):
```kotlin
// 현재 (line 842):
audioRecord = AudioRecord(
    MediaRecorder.AudioSource.MIC,  // ← 문제
    ...
)

// 변경:
val audioSource = if (recordingConfig.audioFocusStrategy == "communication") {
    MediaRecorder.AudioSource.VOICE_COMMUNICATION
} else {
    MediaRecorder.AudioSource.MIC
}
audioRecord = AudioRecord(audioSource, ...)
```

**접근 방법**:
1. `@siteed/expo-audio-studio` 저장소에 PR 제출
2. 또는 로컬 patch 적용 (`patch-package`)
3. 또는 별도 `audioSource` config 옵션 추가 요청

---

## 구현 시 주의사항

### 1. AVAudioSession 충돌 관리
- `expo-audio`와 `@siteed/expo-audio-studio`가 같은 `AVAudioSession.sharedInstance()`를 공유
- `expo-audio-studio`가 녹음 시작 시 세션을 다시 설정하므로, `expo-audio`의 `setAudioModeAsync` 설정이 무효화됨
- **해결**: `expo-audio-studio`의 `ios.audioSession` 설정을 통해 원하는 세션 구성을 명시적으로 전달

### 2. `.voiceChat` 모드의 부작용
- iOS에서 `.voiceChat` 모드는 오디오를 이어피스로 기본 라우팅함 → **반드시 `defaultToSpeaker`와 함께 사용**
- AGC가 볼륨을 자동 조절하므로, TTS 재생 볼륨이 약간 달라질 수 있음
- Bluetooth 이어폰 사용 시 SCO 링크로 전환되어 오디오 품질이 달라질 수 있음

### 3. `forceRestart()` 동작 변경 가능성
- iOS에서 TTS 재생 후 `forceRestart()`로 녹음을 재시작하는 현재 구조
- `.voiceChat` 모드에서는 playAndRecord가 더 안정적으로 공존할 수 있어, `forceRestart()` 빈도가 줄어들 수 있음
- 단, 테스트로 확인 필요

### 4. 오디오 전송 차단 시 Barge-in 고려
- 옵션 C/D에서 AI 말하는 중 오디오 전송을 차단하면, barge-in 기능이 제한됨
- 하드웨어 AEC가 정상 동작하면 오디오 전송을 유지하면서도 에코 없이 barge-in 가능
- **우선순위: 하드웨어 AEC 활성화 → barge-in 유지 가능**

### 5. 테스트 체크리스트
- [ ] iOS 스피커 모드에서 TTS 재생 중 에코 발생 여부
- [ ] iOS Bluetooth 이어폰에서 AEC 동작 여부
- [ ] Android 스피커 모드에서 에코 발생 여부
- [ ] `forceRestart()` 후 녹음 정상 재개 여부
- [ ] barge-in 기능 정상 동작 여부 (실제 사용자 음성으로)
- [ ] TTS 볼륨 변화 여부 (`.voiceChat` AGC 영향)
- [ ] `expo-audio`와 `expo-audio-studio` 세션 충돌 없는지 확인

### 6. 단계적 적용 권장 순서
1. **1단계**: 옵션 A — iOS `ios.audioSession` 설정 추가 (가장 간단, 가장 효과적)
2. **2단계**: 옵션 C — 소프트웨어 에코 게이트 추가 (AEC 보완)
3. **3단계**: 옵션 B — Android `AudioSource.VOICE_COMMUNICATION` (라이브러리 수정 필요)
4. **4단계**: `expo-audio`의 `ensureAudioMode()`가 `expo-audio-studio` 설정과 충돌하지 않도록 호출 순서 정리

---

## 부록: 핵심 코드 위치

| 파일 | 역할 | 핵심 라인 |
|------|------|----------|
| `frontend/src/utils/audio.ts` | `ensureAudioMode()` — expo-audio 세션 설정 | `setAudioModeAsync(...)` |
| `frontend/src/hooks/useRealtimeRecorder.ts` | 녹음 + VAD | `recorder.startRecording(...)`, `runVad()` |
| `frontend/app/(tabs)/write.tsx` | 대화 화면 — VAD 콜백 + 상태 전환 | `vadCallbacksRef`, `voiceState` effect |
| `frontend/src/stores/useConversationStore.ts` | 상태 관리 — TTS 재생, barge-in | `tts_audio` handler, `sendBargeIn()` |
| `expo-audio/ios/AudioModule.swift:552-580` | iOS `setAudioMode` 네이티브 구현 | `session.setCategory(.playAndRecord, mode: .default)` |
| `expo-audio-studio/ios/AudioStreamManager.swift:257` | iOS 녹음 시 세션 재설정 | `session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .mixWithOthers])` |
| `expo-audio-studio/ios/RecordingSettings.swift` | iOS audioSession config 파싱 | `VoiceChat`, `DefaultToSpeaker` 지원 확인 |
| `expo-audio-studio/android/.../AudioRecorderManager.kt:842` | Android AudioRecord 생성 | `AudioRecord(MediaRecorder.AudioSource.MIC, ...)` |
| `expo-audio-studio/android/.../AudioRecorderManager.kt:1951` | Android communication focus | `requestCommunicationAudioFocus()` — AudioSource와 무관 |
