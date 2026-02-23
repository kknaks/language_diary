# Language Diary — 프론트엔드 스프린트 계획

## 기술 스택 & 라이브러리 선정

| 영역 | 라이브러리 | 비고 |
|------|-----------|------|
| **프레임워크** | React Native (Expo SDK 52+) | Expo managed workflow |
| **네비게이션** | `expo-router` | 파일 기반 라우팅 |
| **상태관리** | `zustand` | 경량, 보일러플레이트 최소 |
| **WebSocket** | 내장 `WebSocket` API | RN 기본 제공, 재연결 로직 직접 구현 |
| **음성 녹음** | `expo-av` | 녹음(WAV 16kHz mono) + 오디오 재생 |
| **오디오 재생 (TTS)** | `expo-av` | MP3 URL 스트리밍 재생 |
| **마이크 권한** | `expo-av` (Audio.requestPermissionsAsync) | |
| **HTTP 클라이언트** | `axios` 또는 내장 `fetch` | |
| **애니메이션** | `react-native-reanimated` | 파형, 카드 스와이프, 축하 |
| **제스처** | `react-native-gesture-handler` | 카드 스와이프, 스와이프 삭제 |
| **리스트** | `@shopify/flash-list` | 대화 메시지 & 히스토리 무한 스크롤 |
| **스켈레톤 로딩** | `moti` + `@motify/skeleton` | Skeleton UI |
| **아이콘** | `@expo/vector-icons` | |
| **안전 영역** | `react-native-safe-area-context` | Expo 기본 포함 |
| **Haptics** | `expo-haptics` | 녹음 시작/종료 촉각 피드백 |

---

## Sprint 1 — 프로젝트 셋업 & 홈 화면 (1주)

### 1.1 Expo 프로젝트 초기화 & 구조 셋업
- Expo 프로젝트 생성 (`expo-router` 탭 템플릿)
- 디렉토리 구조 확립: `app/`, `components/`, `hooks/`, `services/`, `stores/`, `constants/`, `types/`
- TypeScript 설정, ESLint/Prettier 구성
- 글로벌 테마/색상/타이포그래피 상수 정의
- Zustand 스토어 기본 구조 (diary store, conversation store)
- API 서비스 레이어 (`services/api.ts`) + Mock 데이터 세팅
- **소요**: 4h | **난이도**: 하 | **API 의존**: ❌ Mock 가능

### 1.2 탭 네비게이션
- 하단 탭 3개: 홈 / 일기 쓰기 / 히스토리
- `expo-router` Tabs 레이아웃 구성
- 탭 아이콘 & 활성 상태 스타일링
- **소요**: 2h | **난이도**: 하 | **API 의존**: ❌

### 1.3 홈 화면
- **컴포넌트**: `HomeScreen`, `RecentDiaryList`, `EmptyState`, `DiaryCard`
- "AI와 대화하기" CTA 버튼
- 최근 일기 목록 (Skeleton 로딩 → 카드 리스트)
- 빈 상태 UI: 일러스트 + "AI와 대화하며 첫 일기를 만들어보세요"
- 날짜 포맷 (UTC → 로컬 변환)
- **소요**: 6h | **난이도**: 하 | **API 의존**: `GET /api/v1/diary` → 🟡 Mock 먼저 개발 가능

### 1.4 공통 컴포넌트
- `Button`, `LoadingSpinner`, `NetworkBanner`, `SkeletonCard`
- 네트워크 상태 감지 + 오프라인 배너 표시
- **소요**: 4h | **난이도**: 하 | **API 의존**: ❌

**Sprint 1 합계: ~16h (2일)**

---

## Sprint 2 — AI 대화 화면 (채팅 UI + WebSocket) (1.5주)

### 2.1 채팅 UI 기본 구조
- **컴포넌트**: `ConversationScreen`, `ChatBubble`, `ChatInput`, `TurnIndicator`
- AI 질문 = 좌측 버블, 유저 응답 = 우측 버블
- 메시지 리스트 (FlashList, 자동 스크롤)
- 대화 턴 표시 ("3/10턴")
- 타이핑 인디케이터 (AI 응답 대기 중)
- **소요**: 8h | **난이도**: 중 | **API 의존**: ❌ Mock 가능

### 2.2 텍스트 입력 모드
- 키보드 입력 → 전송 버튼
- 마이크/키보드 전환 토글
- 입력 디바운싱 & 버튼 disabled 처리
- **소요**: 3h | **난이도**: 하 | **API 의존**: ❌

### 2.3 WebSocket 연결 관리
- **모듈**: `services/websocket.ts`
- WebSocket 연결/해제 생명주기
- 자동 재연결 (지수 백오프, 최대 3회)
- 메시지 타입별 핸들러 (`stt_interim`, `stt_final`, `ai_message`, `diary_created`, `error`)
- 연결 상태 표시 (연결 중 / 연결됨 / 재연결 중)
- Zustand conversation store 연동
- **소요**: 8h | **난이도**: 상 | **API 의존**: `WS /ws/conversation/{session_id}` → 🔴 백엔드 필요 (Mock WS 서버로 우선 테스트 가능)

### 2.4 대화 세션 시작/종료
- "일기 쓰기" 탭 진입 → `POST /api/v1/conversation` → 세션 생성 + AI 첫 질문 수신
- [완료] 버튼 → `{ type: "finish" }` 전송 → 일기 생성 대기
- 일기 생성 중 로딩 UI ("일기를 만들고 있어요...")
- 세션 만료/에러 처리
- **소요**: 5h | **난이도**: 중 | **API 의존**: `POST /api/v1/conversation` → 🟡 Mock 가능

### 2.5 음성 녹음 & STT 스트리밍
- **모듈**: `hooks/useAudioRecorder.ts`
- 마이크 권한 요청 (최초 사용 시 바텀시트 안내)
- `expo-av` Recording: WAV 16kHz 16-bit mono 설정
- 녹음 시작 → `{ type: "audio_start" }` → 바이너리 청크 WebSocket 전송 → `{ type: "audio_end" }`
- 실시간 STT interim 텍스트 표시 (입력 영역에)
- STT final → 자동으로 유저 버블에 확정
- 파형 애니메이션 (reanimated)
- Haptic 피드백 (녹음 시작/종료)
- **소요**: 12h | **난이도**: 상 | **API 의존**: 🔴 백엔드 WebSocket + STT 필요

**Sprint 2 합계: ~36h (4.5일)**

---

## Sprint 3 — 일기 확인/수정 & 학습 화면 (1.5주)

### 3.1 일기 확인/수정 화면
- **컴포넌트**: `DiaryDetailScreen`, `DiaryEditor`, `LanguageToggle`
- 한국어 원문 + 영어 번역 표시 (탭 또는 상하 배치)
- 텍스트 수정 모드 (인라인 편집)
- 저장 버튼 → `PUT /api/v1/diary/{id}`
- [학습 시작] 버튼
- **소요**: 6h | **난이도**: 중 | **API 의존**: `GET/PUT /api/v1/diary/{id}` → 🟡 Mock 가능

### 3.2 학습 카드 UI
- **컴포넌트**: `LearningScreen`, `LearningCard`, `CardSwiper`, `CefrBadge`
- 영어 번역문 전체 표시 (상단)
- 학습 포인트 카드 스와이프 (gesture-handler + reanimated)
- 카드 내용: 영어 + 한국어 뜻 + 예문 + CEFR 등급 뱃지 + 품사
- 카드 타입별 스타일 (word / phrase / sentence)
- 카드 진행 인디케이터 (1/5)
- **소요**: 10h | **난이도**: 중 | **API 의존**: `GET /api/v1/diary/{id}` (learning_cards 포함) → 🟡 Mock 가능

### 3.3 TTS 발음 듣기
- **모듈**: `hooks/useAudioPlayer.ts`
- [발음 듣기] 버튼 → `POST /api/v1/speech/tts` → audio_url 수신 → `expo-av` 재생
- 로딩 스피너 (TTS 생성 중)
- 재생 중 버튼 상태 변경 (재생/일시정지)
- 오디오 세션 충돌 방지 (한 번에 하나만)
- **소요**: 5h | **난이도**: 중 | **API 의존**: `POST /api/v1/speech/tts` → 🔴 백엔드 필요 (Mock: 로컬 샘플 MP3)

### 3.4 따라 말하기 (발음 평가)
- **모듈**: `hooks/usePronunciation.ts`
- [따라 말하기] 버튼 → 녹음 시작 (expo-av)
- 녹음 완료 → WAV 파일 → `POST /api/v1/speech/evaluate` (multipart/form-data)
- 결과 표시: 종합 점수 (원형 프로그레스), 정확도/유창성/완성도 개별 점수, 피드백 텍스트
- 재시도 버튼
- **소요**: 8h | **난이도**: 상 | **API 의존**: `POST /api/v1/speech/evaluate` → 🔴 백엔드 필요

### 3.5 학습 완료 화면
- **컴포넌트**: `LearningComplete`
- 축하 애니메이션 (Lottie 또는 reanimated)
- 오늘 학습 요약: 단어 N개, 구문 N개, 평균 발음 점수
- `POST /api/v1/diary/{id}/complete`
- 홈으로 돌아가기 버튼
- **소요**: 4h | **난이도**: 하 | **API 의존**: 🟡 Mock 가능

**Sprint 3 합계: ~33h (4일)**

---

## Sprint 4 — 히스토리 & 마무리 (1주)

### 4.1 히스토리 화면
- **컴포넌트**: `HistoryScreen`, `DiaryListItem`, `DateHeader`
- 날짜별 일기 목록 (섹션 헤더)
- 커서 기반 무한 스크롤 (`?cursor={id}&limit=20`)
- 일기 카드: 날짜, 제목 (첫 문장), 상태 뱃지
- 빈 상태: "아직 일기가 없어요"
- **소요**: 6h | **난이도**: 중 | **API 의존**: `GET /api/v1/diary` → 🟡 Mock 가능

### 4.2 일기 삭제
- 스와이프 삭제 (gesture-handler) 또는 롱프레스 메뉴
- 삭제 확인 다이얼로그
- `DELETE /api/v1/diary/{id}` (소프트 삭제)
- 목록에서 애니메이션 제거
- **소요**: 3h | **난이도**: 하 | **API 의존**: 🟡 Mock 가능

### 4.3 일기 상세 (히스토리에서)
- 한국어 + 영어 텍스트
- 대화 기록 보기 (conversation_messages)
- 학습 포인트 다시 보기
- **소요**: 4h | **난이도**: 하 | **API 의존**: `GET /api/v1/conversation/{session_id}` + `GET /api/v1/diary/{id}` → 🟡 Mock 가능

### 4.4 에러/로딩/빈 상태 통합
- 각 화면별 에러 상태 UI (재시도 버튼)
- 로딩 상태 통일 (Skeleton + Spinner)
- 빈 상태 통일
- 네트워크 에러 핸들링
- **소요**: 4h | **난이도**: 하 | **API 의존**: ❌

### 4.5 UI 폴리싱 & 테스트
- 전체 화면 간 네비게이션 흐름 검증
- 애니메이션 미세 조정
- 접근성 (A11y) 라벨 추가
- 기기별 반응형 확인 (iPhone SE ~ iPad)
- E2E 플로우 테스트 (백엔드 연동)
- 버그 수정
- **소요**: 8h | **난이도**: 중 | **API 의존**: 🔴 전체 연동

**Sprint 4 합계: ~25h (3일)**

---

## 전체 요약

| Sprint | 기간 | 핵심 내용 | 총 소요 |
|--------|------|----------|---------|
| **Sprint 1** | 1주 | 프로젝트 셋업, 홈 화면, 공통 컴포넌트 | ~16h |
| **Sprint 2** | 1.5주 | 채팅 UI, WebSocket, 음성 녹음/STT | ~36h |
| **Sprint 3** | 1.5주 | 일기 확인/수정, 학습 카드, TTS, 발음 평가 | ~33h |
| **Sprint 4** | 1주 | 히스토리, 삭제, 폴리싱, 테스트 | ~25h |
| **합계** | **~5주** | | **~110h** |

## 백엔드 의존도 요약

| 구분 | 설명 |
|------|------|
| 🟢 ❌ Mock 독립 | 프로젝트 셋업, UI 컴포넌트, 네비게이션, 공통 컴포넌트 |
| 🟡 Mock 가능 | 홈 일기 목록, 대화 세션 시작, 일기 CRUD, 학습 카드 UI, 히스토리 |
| 🔴 백엔드 필요 | WebSocket 실시간 통신, STT 스트리밍, TTS 재생, 발음 평가 |

> **전략**: Sprint 1~2 초반은 Mock 데이터로 UI 먼저 개발. Sprint 2 후반부터 백엔드 WebSocket 연동. Sprint 3의 TTS/발음 평가는 백엔드 API 완성 후 연동.

## 오디오 상태 머신 (충돌 방지)

앱 전역에서 하나의 오디오 작업만 활성화:

```
idle → recording (음성 녹음 중)
idle → playing (TTS 재생 중)
recording → idle (녹음 완료/취소)
playing → idle (재생 완료/정지)
```

녹음 시작 시 재생 중지, 재생 시작 시 녹음 불가. `stores/audioStore.ts`로 관리.
