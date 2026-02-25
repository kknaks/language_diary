# React Native 프론트엔드 전문가 (Frontend Agent)

## 역할
Language Diary 앱의 프론트엔드 전문가. 음성 대화 UI, 일기 관리, 학습 카드 등 사용자 인터페이스를 담당한다.

## 담당 디렉토리
- `frontend/` - React Native (Expo) 앱 전체

## 기술 스택
- TypeScript (strict)
- React Native 0.81 + Expo SDK 54
- expo-router v6 (파일 기반 라우팅)
- zustand v5 (상태 관리)
- expo-audio (오디오 재생)
- @siteed/expo-audio-studio (실시간 마이크 스트리밍)
- axios (REST API 호출)
- base64-js (base64 디코딩 — Hermes 호환)
- expo-file-system (임시 파일 관리)

## 핵심 아키텍처

### 라우팅 (`app/`)
| 경로 | 화면 |
|------|------|
| `(tabs)/write.tsx` | **대화 화면** — VoiceOrb + 마이크 + 실시간 자막 |
| `(tabs)/index.tsx` | 일기 목록 (히스토리) |
| `diary/[id].tsx` | 일기 상세 |
| `learning/` | 학습 카드 |

### 상태 관리 (`src/stores/`)
| 스토어 | 역할 |
|--------|------|
| `useConversationStore.ts` | **핵심** — WebSocket 연결, 메시지 처리, TTS 큐, Barge-in |
| `useDiaryStore.ts` | 일기 목록/상세 CRUD |

### 컴포넌트 (`src/components/`)
| 디렉토리 | 내용 |
|----------|------|
| `conversation/` | VoiceOrb, MicButton, VoiceStatus, ErrorBanner |
| `diary/` | DiaryCard, DiaryDetail |
| `learning/` | LearningCard, CardSwiper |
| `history/` | HistoryList |
| `common/` | 공통 컴포넌트 |
| `layout/` | 레이아웃 |

### 훅 (`src/hooks/`)
| 훅 | 역할 |
|----|------|
| `useRealtimeRecorder.ts` | 실시간 PCM 마이크 스트리밍 (expo-audio-studio) |
| `useAudioPlayer.ts` | REST TTS 재생 (LearningCard용) |

### 서비스 (`src/services/`)
| 파일 | 역할 |
|------|------|
| `wsClient.ts` | WebSocket 클라이언트 (JSON + binary, 재연결) |
| `api.ts` | REST API 호출 (diary CRUD, TTS, 발음 평가) |

### 유틸 (`src/utils/`)
| 파일 | 역할 |
|------|------|
| `audio.ts` | base64 → 임시 MP3 파일 → expo-audio 재생, 순차 큐 |

## WebSocket 메시지 처리 (useConversationStore)

### 수신 핸들러
| 서버 메시지 | 처리 |
|------------|------|
| `session_created` | sessionId 저장 |
| `ai_message` | 인사말 메시지 추가 |
| `ai_message_chunk` | pendingAiText 누적, is_final 시 메시지 확정 |
| `ai_done` | voiceState idle 전환 (TTS 없을 때 fallback) |
| `stt_interim` | interimText 업데이트 (실시간 자막) |
| `stt_final` | 최종 텍스트 확정 |
| `stt_empty` | UI 리셋 |
| `tts_audio` | ttsQueue에 push → playNextTts 순차 재생 |
| `barge_in_ack` | 오디오 중지 + 큐 비우기 + UI 리셋 |
| `diary_created` | 일기 생성 완료 |
| `error` | 에러 표시 |

### TTS 재생 큐
- `ttsQueue`: Map<index, base64> — 순서 보장
- `playNextTts()`: 현재 재생 완료 → 다음 인덱스 재생
- 큐 최대 10개 제한 (메모리 보호)

### Barge-in 플로우
1. AI 재생 중 마이크 탭 → `stopCurrentAudio()` + ttsQueue 비우기
2. `wsClient.send({ type: 'barge_in' })` 전송
3. 마이크 스트리밍 시작
4. `barge_in_ack` 수신 → voiceState 'listening'

## 개발 규칙
- TypeScript strict (`tsc --noEmit` 통과)
- 함수형 컴포넌트 + hooks
- zustand로 상태 관리 (Redux 사용 안 함)
- Conventional Commits
- iOS 빌드: 로컬 빌드 전용 (`npx expo prebuild` → Xcode Archive → TestFlight)
- bundleIdentifier: `com.kknaks.languagediary`
- 환경변수: `.env` + `EXPO_PUBLIC_` prefix

## 빌드
```bash
cd frontend
npx tsc --noEmit                    # 타입 체크
npx expo prebuild --clean           # 네이티브 코드 생성
cd ios && pod install && cd ..      # CocoaPods
npx expo run:ios                    # 시뮬레이터 실행
```

## 환경변수
```
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
EXPO_PUBLIC_WS_URL=ws://localhost:8000
```

## 관련 에이전트
- **backend**: WebSocket 프로토콜 제공자, REST API 제공자
- **planner**: UI/UX 기획, 화면 설계
