# 실시간 음성 파이프라인 스프린트 계획 (최종)

## 개요

현재 Language Diary는 **파일 기반 녹음 → 일괄 STT → 문장별 REST TTS** 방식이다.
이를 **Full-Duplex 실시간 스트리밍**으로 전환하여 체감 레이턴시를 3~8초 → 0.5~1초로 단축한다.

---

## 참고 문서 (반드시 읽을 것)

### 프로젝트 문서
- **아키텍처 계획:** `docs/PLAN_REALTIME_PIPELINE.md`
- **DB 모델:** `docs/DB_MODEL.md`
- **백엔드 완료 스프린트:** `docs/SPRINT_BACKEND_DONE.md`
- **프론트 완료 스프린트:** `docs/SPRINT_FRONTEND_DONE.md`

### ElevenLabs 공식 문서 (로컬 복사본)
- **STT Realtime 개요:** `docs/ELEVENLABS_REALTIME_STT.md`
- **STT Server-Side 스트리밍:** `docs/ELEVENLABS_SEVER_SIDE.md`
- **STT Client-Side 스트리밍:** `docs/ELEVENLABS_CLIENT_SIDE.md`
- **TTS WebSocket 스트리밍:** `docs/ELEVENLABS_TTS.md`
- **SDK/라이브러리:** `docs/ELEVENLABS_SKD_LIBRARIES.md`

### 현재 코드 위치
- **백엔드 STT:** `backend/app/services/stt_service.py` (STTSession — manual commit)
- **백엔드 TTS:** `backend/app/services/tts_service.py` (TTSService — REST generate_bytes)
- **백엔드 WS 핸들러:** `backend/app/api/v1/conversation.py`
- **프론트 오디오 재생:** `frontend/src/utils/audio.ts` (base64 → 파일 → expo-audio)
- **프론트 오디오 훅:** `frontend/src/hooks/useAudioPlayer.ts` (REST TTS 호출)
- **프론트 대화 스토어:** `frontend/src/stores/useConversationStore.ts` (ttsQueue, playNextTts)
- **프론트 WS 클라이언트:** `frontend/src/services/wsClient.ts`

---

## 테스트 환경

### 백엔드
```bash
cd /Users/kknaks/kknaks/git/language_diary
docker compose up --build -d    # 코드 수정 시마다 재빌드
docker compose logs -f backend  # 로그 확인
# API 확인: curl http://localhost:8000/health
# WS 확인: wscat -c ws://localhost:8000/ws/conversation/test
```

### 프론트엔드
```bash
cd /Users/kknaks/kknaks/git/language_diary/frontend
npx expo prebuild --clean       # 최초 1회 (또는 네이티브 모듈 변경 시)
cd ios && pod install && cd ..
npx expo run:ios                # Xcode 시뮬레이터 실행
# 코드 수정 → Fast Refresh 자동 반영 (네이티브 변경 시 재빌드)
```

### 환경 변수
- 프론트 `.env`: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8000`
- 백엔드 `.env`: `ELEVENLABS_API_KEY`, `OPENAI_API_KEY` 필수

### 검증 도구
- `curl` / `wscat` — 백엔드 API/WS 단독 테스트
- Xcode 시뮬레이터 — 프론트 UI + 오디오 재생 테스트
- `docker compose logs` — 백엔드 런타임 에러 확인

---

## 스프린트 R1: STT 실시간 스트리밍 (백엔드)

**목표:** 마이크 오디오를 실시간으로 ElevenLabs STT에 스트리밍, VAD 자동 commit

**참고:** `docs/ELEVENLABS_REALTIME_STT.md`, `docs/ELEVENLABS_SEVER_SIDE.md`

### 작업 (백엔드)
- [ ] `stt_service.py` — `STTSession.connect()`에 `commit_strategy=vad` 파라미터 추가
  - `vad_silence_threshold_secs=1.5`, `vad_threshold=0.4`
- [ ] `stt_service.py` — `send_audio()` 대량 청크 pacing 로직 제거 (실시간이므로 불필요)
- [ ] `stt_service.py` — `_listen()`에서 `partial_transcript` → 클라이언트에 `stt_interim` 전송
- [ ] `stt_service.py` — VAD `committed_transcript` → `stt_final` 전송
- [ ] `conversation.py` — `audio_end` 수신 시 manual commit 대신 STT 세션 종료만 처리
- [ ] 테스트: STT relay 단위 테스트 + WS 통합 테스트

### 프론트엔드
- (변경 없음 — 기존 audio_start/binary/audio_end 프로토콜 유지)

### 검증 기준
- [ ] `wscat`으로 WS 연결 → binary PCM 전송 → `stt_interim` 수신
- [ ] 말 멈추면 VAD 자동 commit → `stt_final` 수신
- [ ] `commit_throttled` 에러 없음
- [ ] `docker compose logs` 에러 없음

---

## 스프린트 R2: 프론트엔드 실시간 마이크 스트리밍

**목표:** expo-audio-stream 도입, 녹음 파일 대신 실시간 PCM 청크를 WebSocket으로 전송

**참고:** `docs/ELEVENLABS_CLIENT_SIDE.md`, `docs/ELEVENLABS_SKD_LIBRARIES.md`

### 작업 (프론트엔드)
- [ ] `expo-audio-stream` 설치 + `npx expo prebuild`
- [ ] `useAudioRecorder` (파일 기반) → `ExpoAudioStream` (실시간 청크 콜백) 교체
- [ ] `onAudioChunk` → `wsClient.sendBinary(chunk)` 즉시 전송
- [ ] `stt_interim` 수신 → VoiceOrb 아래에 실시간 자막 표시
- [ ] `stt_final` 수신 → 최종 텍스트 확정, AI 응답 대기 상태 전환
- [ ] VoiceOrb 상태 매핑: idle → listening (볼륨 반영) → processing
- [ ] `tsc --noEmit` 통과

### 백엔드
- (변경 없음 — R1에서 구현한 STT relay 사용)

### 검증 기준
- [ ] 시뮬레이터에서 마이크 녹음 중 화면에 실시간 자막 표시
- [ ] VAD 자동 commit 후 AI 응답 시작
- [ ] `docker compose logs`에서 STT 정상 수신 확인

---

## 스프린트 R3: TTS WebSocket 스트리밍 (백엔드)

**목표:** REST TTS → ElevenLabs TTS WebSocket, 문장 즉시 생성 + 오디오 청크 즉시 push

**참고:** `docs/ELEVENLABS_TTS.md`

### 작업 (백엔드)
- [ ] `tts_service.py` — `TTSStreamSession` 클래스 신규 구현
  - `connect(voice_id)`: WS 연결 + 초기화 메시지 (voice_settings, chunk_length_schedule)
  - `send_sentence(text)`: `flush: true`로 문장 전송
  - `receive_audio_chunks()`: async generator, 오디오 청크 yield
  - `close()`: 빈 텍스트 전송 → 연결 종료
- [ ] `conversation.py` — `_handle_ai_reply_streaming()` 수정
  - TTS WebSocket 연결 (턴 시작 시 1회)
  - LLM 문장 yield → `ai_chunk` 전송 + TTS에 flush
  - TTS 오디오 청크 → `tts_audio` (base64 + index)로 즉시 push
  - 턴 종료 → `ai_done` + TTS close
- [ ] REST TTS fallback 유지 (WebSocket 실패 시)
- [ ] 테스트: TTS 스트리밍 단위 테스트

### 프론트엔드
- (변경 없음)

### 검증 기준
- [ ] `wscat`으로 대화 → 첫 `tts_audio`가 `ai_done` 전에 도착
- [ ] 문장 순서대로 `tts_audio` index 증가
- [ ] REST TTS 대비 첫 오디오 도착 시간 단축 확인

---

## 스프린트 R4: 프론트엔드 오디오 재생 큐 + AI 텍스트 스트리밍

**목표:** TTS 오디오 청크 순차 재생 큐, AI 응답 텍스트 실시간 표시

### 작업 (프론트엔드)
- [ ] `useConversationStore.ts` — `ai_chunk` 핸들러 추가 (실시간 텍스트 표시)
- [ ] `useConversationStore.ts` — `ai_done` 핸들러 추가 (응답 완료 상태)
- [ ] `audio.ts` — 재생 큐 로직 검증/개선
  - base64 수신 → 큐에 push → 순차 재생 (현재 완료 → 다음)
  - 큐 최대 10개 제한, 재생 완료 시 메모리 해제
- [ ] VoiceOrb 상태: `ai_speaking` (재생 중 볼륨 반영)
- [ ] `tsc --noEmit` 통과

### 백엔드
- (변경 없음)

### 검증 기준
- [ ] 시뮬레이터에서 AI 응답이 문장 단위로 끊김 없이 재생
- [ ] 텍스트와 음성이 동기화 (텍스트 먼저 → 오디오 따라옴)
- [ ] 여러 턴 반복해도 큐 메모리 누수 없음

---

## 스프린트 R5: Barge-in + 안정화

**목표:** AI 응답 중 끼어들기, 에러 복구, 타임아웃, 최적화

### 작업 (프론트엔드)
- [ ] AI 응답 재생 중 마이크 버튼 활성화
- [ ] 마이크 누르면: 재생 중지 + 큐 비우기 + `barge_in` 전송 + 마이크 스트리밍 시작
- [ ] `barge_in_ack` 수신 → UI 리셋
- [ ] 네트워크 끊김 시 재연결 로직

### 작업 (백엔드)
- [ ] `barge_in` 핸들러: LLM task cancel + TTS WebSocket close + `barge_in_ack` 전송
- [ ] 새 STT WebSocket 시작 → 새 파이프라인
- [ ] 타임아웃: STT 무음 15초 → `stt_empty` + 세션 종료
- [ ] TTS WebSocket 실패 → REST fallback
- [ ] 각 구간 latency 로깅
- [ ] 통합 테스트: 전체 파이프라인 + barge-in 시나리오

### 검증 기준
- [ ] AI 말하는 중 끼어들기 → 즉시 멈추고 새 입력 처리
- [ ] 에러 발생 시 graceful 복구 (앱 크래시 없음)
- [ ] 전체 체감 레이턴시 ~0.5-1초

---

## 스프린트 R6: E2E 통합 테스트 + 버그 수정

**목표:** 전체 파이프라인을 실제 환경에서 반복 테스트, 발견된 버그 즉시 수정

### 테스트 시나리오

#### 기본 플로우
- [ ] 앱 실행 → WS 연결 → AI 인사말 + TTS 재생
- [ ] 마이크 버튼 → 음성 입력 → 실시간 자막 → VAD commit → AI 응답 + TTS 재생
- [ ] 3~5턴 연속 대화 → 안정성 확인
- [ ] `finish` → 일기 생성 → 학습 카드 표시

#### 오디오 품질
- [ ] TTS 오디오 끊김 없이 자연스럽게 재생
- [ ] 문장 간 전환 시 갭이 자연스러움 (0.1~0.3초)
- [ ] 볼륨 적절 (너무 작거나 크지 않음)

#### Barge-in
- [ ] AI 말하는 중 마이크 → 즉시 멈춤 → 새 입력 정상 처리
- [ ] 빠른 연속 barge-in → 크래시 없음

#### 에러 복구
- [ ] ElevenLabs API 일시 장애 → REST fallback 작동
- [ ] 네트워크 끊김 → 재연결 후 정상 동작
- [ ] 빈 음성 입력 (침묵만) → 타임아웃 → 안내 메시지

#### 성능
- [ ] 사용자 발화 종료 → AI 첫 음성 재생까지 ≤ 1.5초
- [ ] 메모리 사용량: 10턴 대화 후 비정상 증가 없음

### 버그 수정 프로세스
1. 시나리오 실행
2. 실패 시 로그 확인 (`docker compose logs`, Xcode 콘솔)
3. 원인 파악 → 코드 수정
4. `docker compose up --build -d` (백엔드) / Fast Refresh (프론트)
5. 동일 시나리오 재실행 → 통과 확인
6. 다음 시나리오로 이동

---

## 의존관계

```
R1 (백엔드 STT VAD) ──→ R2 (프론트 마이크 스트리밍)
R3 (백엔드 TTS WS)  ──→ R4 (프론트 재생 큐)
R1 + R2 + R3 + R4   ──→ R5 (Barge-in + 안정화)
R1 ~ R5             ──→ R6 (E2E 통합 테스트)
```

- R1과 R3은 **병렬 진행 가능** (백엔드 에이전트 2번 dispatch 또는 순차)
- R2는 R1 완료 후, R4는 R3 완료 후
- R5는 R1~R4 전부 완료 후
- **R6는 매 스프린트 완료 시에도 중간 검증 실행** (해당 스프린트 검증 기준)

---

## 디스패치 전략

| 스프린트 | 담당 에이전트 | 선행 조건 |
|---------|-------------|----------|
| R1 | Backend | 없음 |
| R3 | Backend | 없음 (R1과 병렬 가능) |
| R2 | Frontend | R1 완료 + Xcode 설치 |
| R4 | Frontend | R3 완료 |
| R5 | Backend + Frontend | R1~R4 완료 |
| R6 | PM (직접) | R5 완료 + 테스트 환경 준비 |

### PM 역할
- 각 스프린트 완료 시 **검증 기준** 직접 확인 (curl/wscat/시뮬레이터)
- 검증 실패 → 해당 에이전트에 버그 리포트 + 재작업 지시
- 검증 통과 → git commit + 다음 스프린트 디스패치

---

## 예상 레이턴시 개선

| 시점 | 체감 레이턴시 |
|------|-------------|
| 현재 (AS-IS) | 3-8초 |
| R1+R2 완료 | 1-3초 (STT 실시간화) |
| R3+R4 완료 | ~0.5-1초 (TTS 스트리밍) |
| R5 완료 | ~0.5-1초 + barge-in |
| R6 완료 | 안정화 + 버그 제로 |
