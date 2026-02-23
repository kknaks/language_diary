# Language Diary — 프론트엔드 리뷰

> PRD & DB 모델 기반 프론트엔드 관점 리뷰  
> 작성일: 2026-02-23

---

## 1. 빠진 UI/UX 요소

### 1.1 상태 화면 (PRD에 누락)

| 화면 | 누락된 상태 | 제안 |
|------|------------|------|
| 홈 | **빈 상태** | 첫 사용자용 온보딩 일러스트 + "첫 일기를 작성해보세요" CTA |
| 홈 | **로딩** | 최근 일기 목록 Skeleton UI |
| 일기 작성 | **STT 에러** | 마이크 권한 거부, 네트워크 오류, 인식 실패 각각 분기 |
| 일기 작성 | **STT 중간 상태** | 음성 인식 중 파형 애니메이션 + "듣고 있어요..." 텍스트 |
| 번역 요청 | **로딩** | 번역 + 학습 포인트 생성에 5~15초 소요 예상 → 프로그레스 또는 재미있는 로딩 화면 |
| 번역 요청 | **실패** | OpenAI 타임아웃/에러 시 재시도 버튼 |
| 학습 카드 | **TTS 로딩** | 음성 생성 대기 중 버튼 비활성화 + 스피너 |
| 학습 카드 | **발음 평가 로딩** | 녹음 업로드 + Azure 평가 대기 중 상태 |
| 학습 카드 | **발음 평가 실패** | 녹음이 너무 짧거나, 소음으로 인식 불가 시 안내 |
| 히스토리 | **빈 상태** | 아직 일기가 없음 안내 |
| 히스토리 | **무한 스크롤/페이지네이션** | 일기가 많아질 때 대비 필요 |
| 전역 | **네트워크 오프라인** | 오프라인 배너 (Toast 또는 상단 바) |
| 전역 | **세션 만료** | 인증 구현 시 토큰 만료 처리 |

### 1.2 추가 권장 UI 요소

- **마이크 권한 요청 화면**: 최초 STT 사용 전 권한 안내 바텀시트
- **일기 텍스트 길이 제한 표시**: PRD에 비용 이유로 길이 제한 언급 → 카운터 UI 필요
- **학습 완료 화면 상세화**: 현재 "오늘 학습 요약"만 있음 → 축하 애니메이션(Lottie), 연속 학습일 수 등
- **일기 삭제/수정**: 작성 후 수정·삭제 플로우 없음 → MVP에서도 최소 삭제는 필요
- **설정 화면**: 모국어/학습언어 선택, 마이크 테스트 등

---

## 2. React Native STT/TTS/녹음 기술 고려사항

### 2.1 STT (음성 → 텍스트)

| 항목 | 고려사항 |
|------|---------|
| **라이브러리** | `@react-native-voice/voice` (Google STT 래핑) 또는 백엔드 스트리밍 방식 |
| **스트리밍 vs 일괄** | PRD는 "실시간 텍스트 표시"를 원함 → WebSocket 또는 gRPC 스트리밍 필요. 단순 REST로는 불가 |
| **플랫폼 차이** | iOS: 네이티브 SFSpeechRecognizer (한국어 지원), Android: Google STT. 동작 미세하게 다름 |
| **권한** | iOS: `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`. Android: `RECORD_AUDIO` |
| **백그라운드** | 앱이 백그라운드로 가면 STT 세션 중단됨 → AppState 감지 후 graceful 처리 |
| **대안 제안** | Whisper API(PRD 리스크에 언급)를 쓸 경우 → 녹음 후 일괄 전송 방식. 실시간 미지원이므로 UX 트레이드오프 |

**추천**: MVP에서는 `@react-native-voice/voice`로 디바이스 STT 사용 → Phase 2에서 Whisper 백엔드 대체 검토

### 2.2 TTS (텍스트 → 음성)

| 항목 | 고려사항 |
|------|---------|
| **구현 방식** | 백엔드에서 ElevenLabs 호출 → 오디오 파일 URL 반환 → RN에서 재생 |
| **오디오 재생** | `react-native-sound`, `expo-av`, 또는 `react-native-track-player` |
| **캐싱** | 같은 카드의 TTS를 반복 요청하지 않도록 → 서버에서 audio_url 저장 or 클라이언트 캐시 |
| **스트리밍 재생** | 긴 문장은 생성에 시간 소요 → 스트리밍 재생 지원 여부 확인 |
| **포맷** | mp3가 iOS/Android 모두 호환. opus는 Android만 |

### 2.3 녹음 (발음 평가용)

| 항목 | 고려사항 |
|------|---------|
| **라이브러리** | `react-native-audio-recorder-player` 또는 `expo-av` |
| **포맷/품질** | Azure Speech SDK 요구사항 확인 필요 (보통 WAV 16kHz 16bit mono) |
| **파일 크기** | 녹음 시간 제한 (카드당 최대 10~15초) → UI에 타이머 표시 |
| **동시 재생/녹음** | TTS 재생 중 녹음 시작 방지 → 오디오 세션 관리 |
| **iOS 오디오 세션** | `AVAudioSession` 카테고리 전환 (playback ↔ record) 필요. 전환 시 ~0.5초 딜레이 |

---

## 3. 상태 관리 전략

### 3.1 전역 상태 구조 제안

```
zustand 또는 Redux Toolkit 추천 (가벼운 앱이므로 zustand 선호)

stores/
├── authStore       — 유저 정보, 토큰
├── diaryStore      — 현재 작성 중 일기, 일기 목록
├── learningStore   — 현재 학습 세션 (카드 목록, 현재 카드 인덱스, 점수)
├── audioStore      — 오디오 상태 (재생 중, 녹음 중, STT 상태)
└── uiStore         — 로딩, 에러, 토스트
```

### 3.2 오디오 상태 머신

오디오는 복잡한 상태 전이가 있으므로 **상태 머신** 패턴 권장:

```
IDLE → STT_LISTENING → STT_PROCESSING → IDLE
IDLE → TTS_LOADING → TTS_PLAYING → IDLE
IDLE → RECORDING → RECORDING_DONE → EVALUATING → IDLE
```

- 한 번에 하나의 오디오 작업만 활성화 (mutex)
- 상태 전이 시 이전 작업 강제 중단

### 3.3 서버 데이터 캐싱

- **React Query (TanStack Query)** 적극 활용
  - `GET /api/diary` → `useQuery` + staleTime 5분
  - `GET /api/diary/{id}` → 개별 캐싱
  - `POST` 요청 후 → `invalidateQueries`로 목록 갱신
- TTS 오디오 URL → 로컬 파일 캐싱 (`react-native-fs`)

### 3.4 오프라인 (MVP 범위 외지만 기반 설계)

- MVP에서는 오프라인 미지원이나, React Query의 `persistQueryClient`로 읽기 캐시는 확보 가능
- Phase 2 오프라인 복습 대비: 학습 카드 + TTS 오디오 다운로드 구조 미리 고려

---

## 4. 컴포넌트 구조 제안

```
src/
├── app/                          # 네비게이션 & 스크린
│   ├── (tabs)/
│   │   ├── home/                 # 홈 탭
│   │   │   └── index.tsx
│   │   ├── history/              # 히스토리 탭
│   │   │   ├── index.tsx         # 일기 목록
│   │   │   └── [id].tsx          # 일기 상세
│   │   └── _layout.tsx           # 탭 레이아웃
│   ├── diary/
│   │   ├── write.tsx             # 일기 작성 (STT)
│   │   └── learn.tsx             # 학습 화면
│   └── _layout.tsx               # 루트 레이아웃
│
├── components/
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── EmptyState.tsx        # 빈 상태 공통 컴포넌트
│   │   ├── ErrorState.tsx        # 에러 상태
│   │   ├── LoadingSkeleton.tsx
│   │   └── OfflineBanner.tsx
│   ├── diary/
│   │   ├── DiaryListItem.tsx     # 일기 목록 아이템
│   │   ├── DiaryDetail.tsx       # 일기 상세 뷰
│   │   └── SttInput.tsx          # STT 입력 UI (마이크 버튼 + 파형 + 텍스트)
│   ├── learning/
│   │   ├── LearningCard.tsx      # 학습 카드 (단어/구문)
│   │   ├── CardSwiper.tsx        # 카드 스와이프 컨테이너
│   │   ├── TtsButton.tsx         # TTS 재생 버튼
│   │   ├── RecordButton.tsx      # 녹음 버튼 (따라 말하기)
│   │   ├── ScoreDisplay.tsx      # 발음 점수 표시
│   │   └── LearningComplete.tsx  # 학습 완료 요약
│   └── home/
│       ├── TodayCard.tsx         # 오늘의 일기 상태 카드
│       └── RecentDiaries.tsx     # 최근 일기 목록
│
├── hooks/
│   ├── useStt.ts                 # STT 커스텀 훅
│   ├── useTts.ts                 # TTS 재생 훅
│   ├── useRecorder.ts            # 녹음 훅
│   ├── useAudioSession.ts        # 오디오 세션 관리 (mutex)
│   └── useDiary.ts               # 일기 CRUD React Query 훅
│
├── stores/                       # Zustand 스토어
├── api/                          # API 클라이언트 (axios 인스턴스 + 엔드포인트)
├── types/                        # TypeScript 타입 (API 응답, 모델)
└── utils/
    ├── audio.ts                  # 오디오 포맷 변환 유틸
    └── permissions.ts            # 권한 요청 유틸
```

### 핵심 커스텀 훅 설계

```typescript
// useStt.ts
interface UseSttReturn {
  isListening: boolean;
  partialResult: string;   // 실시간 인식 중간 결과
  finalResult: string;     // 확정된 텍스트
  error: SttError | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

// useRecorder.ts
interface UseRecorderReturn {
  isRecording: boolean;
  duration: number;        // 초 단위
  start: () => Promise<void>;
  stop: () => Promise<string>;  // 파일 경로 반환
}
```

---

## 5. 백엔드 팀 요청사항

### 5.1 API 응답 형태

**일기 생성 + 번역 응답 (POST /api/diary 또는 /translate)**

현재 PRD에서 일기 저장과 번역이 분리/통합이 모호함. 아래 형태 요청:

```jsonc
// POST /api/diary — 생성만
{ "id": 1, "original_text": "...", "status": "draft", "created_at": "..." }

// POST /api/diary/{id}/translate — 번역 + 학습 포인트
{
  "diary": {
    "id": 1,
    "translated_text": "I had a meeting at work today..."
  },
  "learning_cards": [
    {
      "id": 10,
      "card_type": "phrase",
      "content_en": "had a meeting",
      "content_ko": "회의를 하다",
      "cefr_level": "A2",
      "example_en": "I had a meeting with my team.",
      "example_ko": "팀과 회의를 했다.",
      "card_order": 1
    }
    // ...
  ]
}
```

**발음 평가 응답 (POST /api/speech/evaluate)**

```jsonc
{
  "overall_score": 85,
  "accuracy_score": 88,
  "fluency_score": 82,
  "completeness_score": 85,
  "feedback": "...",
  // 음소별 상세 (선택)
  "word_scores": [
    { "word": "meeting", "score": 72, "error_type": "Mispronunciation" }
  ]
}
```

### 5.2 실시간 STT — WebSocket 필요 여부

| 옵션 | 설명 | 추천 |
|------|------|------|
| A. 디바이스 STT | RN에서 직접 Google STT 호출. 백엔드 불필요 | ✅ **MVP 추천** |
| B. 백엔드 WebSocket | 오디오 스트림 → 백엔드 → Google STT → 텍스트 반환 | Phase 2 (Whisper 전환 시) |

**MVP에서는 디바이스 STT 사용을 추천**. 백엔드 WebSocket은 불필요.

### 5.3 TTS 오디오 캐싱

- `POST /api/speech/tts` 호출 시 서버에서 오디오 파일 저장 후 URL 반환 요청
- 같은 텍스트 재요청 시 캐싱된 파일 반환 (ElevenLabs 비용 절감)
- 응답: `{ "audio_url": "https://server/audio/xxx.mp3", "duration_ms": 2300 }`

### 5.4 페이지네이션

- `GET /api/diary` → cursor 기반 페이지네이션 요청
  - `?cursor=2026-02-20&limit=20`
  - 응답에 `next_cursor` 포함

### 5.5 번역 소요 시간 대응

번역 + 학습 포인트 생성이 오래 걸릴 수 있음 (5~15초):

| 옵션 | 설명 |
|------|------|
| A. 동기 응답 | 클라이언트가 기다림. 타임아웃 주의 (30초+) |
| B. 비동기 + 폴링 | POST → 202 + job_id → GET /status 폴링 |
| C. 비동기 + SSE | POST → 202 → Server-Sent Events로 완료 알림 |

**추천**: MVP는 **옵션 A (동기)** + 충분한 타임아웃(60초). 느려지면 B로 전환.

### 5.6 에러 응답 표준화

```jsonc
{
  "error": {
    "code": "STT_FAILED",
    "message": "음성 인식에 실패했습니다.",
    "detail": "No speech detected in audio"  // 디버그용
  }
}
```

### 5.7 DB 모델 관련 피드백

- `learning_cards.card_type`에 `full`이 있는데 용도 불명 → 번역문 전체 따라 말하기용이면 PRD에 명시 필요
- `pronunciation_results`에 `attempt_number` 컬럼 추가 제안 (같은 카드 여러 번 시도 추적)
- `diaries`에 `original_audio_url` 컬럼 추가 고려 (원본 녹음 보관)

---

## 요약

| 영역 | 핵심 포인트 |
|------|------------|
| UI/UX | 로딩·에러·빈 상태 정의 필요. 권한 요청, 텍스트 길이 제한 UI 누락 |
| STT/TTS/녹음 | 디바이스 STT(MVP) → Whisper(Phase 2). 오디오 세션 전환 주의. iOS/Android 차이 대응 |
| 상태 관리 | Zustand + React Query. 오디오 상태 머신 패턴 필수 |
| 컴포넌트 | hooks 기반 오디오 추상화. 공통 상태 컴포넌트(Empty/Error/Loading) 먼저 구축 |
| 백엔드 요청 | 응답 형태 명확화, TTS 캐싱, 페이지네이션, 에러 코드 표준화 |
