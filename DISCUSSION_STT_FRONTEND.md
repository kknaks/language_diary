# STT 프론트엔드 처리 방식 제안

> language_diary 프로젝트 — Google Speech-to-Text 연동

## 1. 녹음 후 전송 방식: 완료 후 전체 전송 ✅ (권장)

### 권장: 녹음 완료 → WAV 파일 전체 전송 (`POST /api/v1/speech/stt`)

**이유:**
- PRD에 이미 `POST /api/v1/speech/stt`로 **동기 API** 합의됨
- 최대 녹음 3분 = WAV 16kHz 16-bit mono 기준 **~5.5MB** (10MB 제한 내)
- MVP에서 스트리밍은 과도한 복잡도
- Google STT의 `recognize` (동기) API로 충분 — 3분 이하 오디오 지원

**구현:**
```
[녹음 시작] → expo-av로 WAV 녹음 → [녹음 중지] → FormData로 서버 전송 → 텍스트 수신
```

### 스트리밍은 Phase 2 이후 검토
- 긴 녹음(5분+)이나 실시간 자막이 필요해질 때 도입

---

## 2. UX: 녹음 완료 후 한번에 변환 ✅ (권장)

### 권장: 녹음 → 로딩 → 텍스트 표시

**이유:**
- PRD 화면 구조: "STT 중간 상태: 파형 애니메이션 + '듣고 있어요...'" → 녹음 중 UX
- 변환은 녹음 완료 후 1~3초 (3분 오디오 기준)로 충분히 빠름
- 실시간 텍스트는 시각적으로 멋지지만 MVP 가치 대비 구현 비용이 높음
- 사용자가 텍스트를 **수정 가능**하므로, 한번에 보여주고 수정하는 게 UX상 자연스러움

**UX 플로우:**
```
[🎙️ 마이크 탭] → 녹음 중 (파형 애니메이션) → [중지] → "변환 중..." (1~3초) → 텍스트 표시 → 사용자 수정 가능
```

---

## 3. WebSocket 실시간 스트리밍 — 기술적 구현 난이도

| 항목 | 난이도 | 설명 |
|------|--------|------|
| RN에서 WebSocket 연결 | 🟢 낮음 | `new WebSocket()` 네이티브 지원 |
| 실시간 오디오 청크 캡처 | 🔴 높음 | `expo-av`는 청크 스트리밍 미지원. **react-native-live-audio-stream** 등 네이티브 모듈 필요 → Expo 빌드 커스텀 필요 |
| 백엔드 WebSocket + Google Streaming STT | 🟡 중간 | FastAPI WebSocket + `StreamingRecognize` gRPC 연결 관리 |
| 네트워크 끊김/재연결 처리 | 🟡 중간 | 모바일 환경에서 불안정한 연결 대응 필요 |
| **총합** | 🔴 **높음** | MVP 범위 초과 |

**결론:** MVP에서 WebSocket 스트리밍은 불필요. 비용 대비 효과가 낮음.

---

## 4. 오디오 녹음 설정

PRD 합의 사항 기준:

| 항목 | 값 | 비고 |
|------|-----|------|
| **포맷** | WAV (LINEAR16) | Google STT 권장 포맷 |
| **샘플레이트** | 16,000 Hz | STT 최적 (전화 품질 이상) |
| **비트 깊이** | 16-bit | 표준 |
| **채널** | Mono (1ch) | 음성 인식에 스테레오 불필요 |
| **최대 길이** | 3분 | PRD 명시 |
| **최대 크기** | 10MB | PRD 명시 |

### expo-av 녹음 설정 (예시)
```typescript
const recordingOptions: Audio.RecordingOptions = {
  isMeteringEnabled: true, // 파형 시각화용
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};
```

---

## 5. 백엔드에게 요청할 사항

### API: `POST /api/v1/speech/stt`

**Request:**
```
Content-Type: multipart/form-data

Fields:
  - audio: File (WAV, 16kHz, 16-bit, mono, max 10MB)
  - language: string ("ko" | "en")  // 한국어 일기 입력 vs 영어 따라 말하기
```

**Response (성공):**
```json
{
  "text": "오늘 회사에서 회의를 했다",
  "confidence": 0.95,
  "language": "ko"
}
```

**Response (실패):**
```json
{
  "error": {
    "code": "STT_FAILED",
    "message": "음성을 인식할 수 없습니다. 다시 시도해주세요.",
    "detail": "Google STT returned empty result"
  }
}
```

### 백엔드 구현 시 고려사항

| 항목 | 요청 |
|------|------|
| Google STT 호출 | `recognize` (동기) API 사용. 3분 이하이므로 `LongRunningRecognize` 불필요 |
| 언어 코드 | `ko-KR` (한국어), `en-US` (영어) |
| 모델 | `latest_long` 또는 `default` (한국어 정확도 최적) |
| 구두점 | `enable_automatic_punctuation: true` |
| 타임아웃 | 30초 (클라이언트 60초보다 짧게) |
| 빈 결과 처리 | 인식 결과 없으면 `STT_FAILED` 에러 반환 |
| 파일 검증 | WAV 헤더 확인, 샘플레이트/채널 검증, 10MB 제한 |

---

## 요약

| 질문 | 결론 |
|------|------|
| 전송 방식 | **완료 후 전체 전송** (REST, multipart/form-data) |
| UX | **녹음 완료 → 로딩 → 텍스트 한번에 표시** |
| WebSocket 스트리밍 | **MVP 불필요** (구현 난이도 높음, 효과 낮음) |
| 오디오 포맷 | **WAV 16kHz 16-bit mono** (PRD 합의대로) |
| API | `POST /api/v1/speech/stt` — multipart, language 파라미터 추가 요청 |
