# Frontend Sprint 결과 요약

## Sprint 1 — Expo Setup + Home Screen + Common Components
**커밋:** `70c2eac`

### 구현 내용
- Expo SDK 52+ 프로젝트 (TypeScript strict)
- expo-router 파일 기반 라우팅
- ESLint + Prettier 설정
- 탭 네비게이션: Home / Write / History (3탭)
- Home 화면:
  - "AI와 대화하기" CTA 버튼
  - 최근 일기 목록 (Skeleton 로딩)
  - 빈 상태: "AI와 대화하며 첫 일기를 만들어보세요"
- 공통 컴포넌트: Button, Loading, ErrorState, EmptyState, Card
- 글로벌 테마 (constants/theme.ts)
- Zustand 스토어: diaryStore, conversationStore (기본 구조)
- Mock API 서비스 (services/api.ts + services/mockData.ts)
- **npx tsc --noEmit 통과**

### 파일 구조
```
frontend/
├── app/
│   ├── _layout.tsx          # Root layout
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Tab navigator
│   │   ├── index.tsx        # Home
│   │   ├── write.tsx        # Write (대화)
│   │   └── history.tsx      # History
├── src/
│   ├── components/common/   # Button, Card, Loading, EmptyState, ErrorState
│   ├── constants/theme.ts
│   ├── stores/useDiaryStore.ts, useConversationStore.ts
│   ├── services/api.ts, mockData.ts
│   ├── types/index.ts
```

---

## Sprint 2 — Chat UI + WebSocket Client
**커밋:** `c818721`

### 구현 내용
- ConversationScreen (write.tsx): 전체 대화 화면
  - FlashList 메시지 목록 + auto-scroll
  - 상태별 UI: idle → loading → active → complete
- 대화 컴포넌트:
  - `ChatBubble.tsx` — AI=좌측, User=우측 채팅 버블
  - `ChatInput.tsx` — 텍스트 입력 + 전송 버튼 + 마이크/키보드 토글
  - `TurnIndicator.tsx` — "3/10턴" 카운터 뱃지
  - `TypingIndicator.tsx` — 3-dot 바운스 애니메이션 (AI 응답 중)
  - `ConnectionStatus.tsx` — 연결 상태 배너 (connecting/connected/reconnecting/disconnected)
  - `DiaryCreatingOverlay.tsx` — "일기를 만들고 있어요..." 오버레이
- WebSocket 클라이언트 (services/websocket.ts):
  - connect/disconnect
  - Auto-reconnect (exponential backoff, 최대 3회)
  - 메시지 타입 핸들러: stt_interim, stt_final, ai_message, diary_created, error
- Zustand conversationStore: 세션 상태, WS 연결, 타이핑, 일기 생성 등 전체 리라이트
- 대화 시작: POST /api/v1/conversation mock
- Finish 버튼 → {type: "finish"} → 일기 생성 로딩 UI
- **npx tsc --noEmit 통과**

### 핵심 파일
```
frontend/src/
├── components/conversation/
│   ├── ChatBubble.tsx, ChatInput.tsx, TurnIndicator.tsx
│   ├── TypingIndicator.tsx, ConnectionStatus.tsx, DiaryCreatingOverlay.tsx
│   └── index.ts
├── services/websocket.ts
├── stores/useConversationStore.ts  # 전체 리라이트
```

---

## Sprint 3 — Diary Detail + Learning Cards + Speech UI
**커밋:** `c266324`

### 구현 내용
- DiaryDetailScreen (diary/[id].tsx):
  - 한국어 원문 + 영어 번역 표시
  - 인라인 편집 모드 + 저장 (PUT mock)
- LearningScreen + 학습 카드:
  - LearningCard 컴포넌트: 카드 스와이프
  - 카드 내용: 영어 + 한국어 뜻 + 예문 + CEFR 뱃지 + 품사
  - card_type별 스타일: word / phrase / sentence
  - 진행 표시기 (1/5)
- TTS 발음 듣기 UI:
  - 버튼 + 로딩 스피너 + 재생/일시정지
  - hooks/useAudioPlayer.ts (mock audio)
- 따라 말하기 UI:
  - 녹음 → 결과 표시 (종합 점수, 정확도/유창성/완성도)
  - UI only, mock results
- LearningComplete: 축하 화면 + 학습 요약 (단어 N개, 구문 N개)
- **npx tsc --noEmit 통과**

### 핵심 파일
```
frontend/
├── app/diary/[id].tsx           # 일기 상세
├── app/learning/[id].tsx        # 학습 화면
├── src/components/learning/     # LearningCard, CefrBadge, etc.
├── src/hooks/useAudioPlayer.ts
```

---

## Sprint 4 (FINAL) — History + UI Polish + Error States
**커밋:** `73901c1`

### 구현 내용
- HistoryScreen (history.tsx):
  - SectionList + 날짜별 그룹 헤더 (오늘/어제/날짜)
  - 커서 기반 무한 스크롤 + pull-to-refresh
  - 빈 상태: "아직 일기가 없어요"
- 일기 삭제:
  - Long-press + 확인 다이얼로그
  - Optimistic delete with rollback
  - DELETE mock
- DiaryListItem + DateHeader 컴포넌트
- 일기 상세 (히스토리에서):
  - 한국어+영어 + 접이식 대화 기록 + 학습 포인트 미리보기
- 에러/로딩/빈 상태 전체 통합:
  - 각 화면별 에러 UI + 재시도 버튼
  - NetworkBanner (오프라인 감지)
  - useNetworkStatus 훅
- 접근성 (A11y):
  - 모든 인터랙티브 요소에 accessibilityLabel
  - 탭 네비게이터 A11y 라벨
- Mock 데이터 확장: 8개 일기 (다양한 날짜) + 대화 메시지
- useDiaryStore: fetchMore (pagination) + removeDiary (optimistic)
- **npx tsc --noEmit 통과**

### 핵심 파일
```
frontend/
├── app/(tabs)/history.tsx       # 히스토리 화면
├── src/components/history/
│   ├── DateHeader.tsx, DiaryListItem.tsx, index.ts
├── src/components/common/NetworkBanner.tsx
├── src/hooks/useNetworkStatus.ts
```

---

## 전체 화면 구조
```
1. Home (index.tsx) — CTA + 최근 일기 + 빈 상태
2. Write (write.tsx) — AI 대화 채팅 UI + WebSocket
3. History (history.tsx) — 날짜별 일기 목록 + 무한 스크롤
4. Diary Detail (diary/[id].tsx) — 원문+번역 + 편집 + 대화 기록 + 삭제
5. Learning (learning/[id].tsx) — 학습 카드 스와이프 + TTS + 발음 평가
```

## 주요 서비스/훅
- `services/api.ts` — REST API 클라이언트 (Mock)
- `services/websocket.ts` — WebSocket 클라이언트 (auto-reconnect)
- `stores/useDiaryStore.ts` — 일기 상태 관리
- `stores/useConversationStore.ts` — 대화 상태 관리
- `hooks/useAudioPlayer.ts` — TTS 오디오 재생
- `hooks/useNetworkStatus.ts` — 네트워크 상태 감지
