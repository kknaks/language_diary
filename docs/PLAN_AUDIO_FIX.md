# 🔊 오디오 재생 수정 계획서

## 현황 진단

### 파이프라인 분석 결과

코드를 전수 조사한 결과, **오디오 파이프라인은 이미 구현되어 있다.**

| 구간 | 상태 | 설명 |
|------|------|------|
| 백엔드 TTS 생성 | ✅ 구현됨 | `_send_tts()` → ElevenLabs → base64 MP3 |
| WebSocket 전송 | ✅ 구현됨 | `tts_audio` 타입, `audio_data` (base64), `index` |
| 프론트 WS 수신 | ✅ 구현됨 | `tts_audio` case → ttsQueue에 저장 → `playNextTts()` |
| 프론트 재생 유틸 | ✅ 구현됨 | `audio.ts` → base64 → 임시 MP3 파일 → `expo-audio` 재생 |
| LearningCard TTS | ✅ 구현됨 | `useAudioPlayer.ts` → REST API `/speech/tts` → URL 재생 |

### 그러면 왜 안 되는가?

**아직 실제 테스트가 안 됐다.** 잠재적 실패 지점:

1. **백엔드 ElevenLabs API 키 유효성** — 실제 호출 시 인증 실패 가능
2. **`expo-audio` 런타임 동작** — 시뮬레이터에서 `createAudioPlayer` + 파일 재생이 실제 작동하는지
3. **base64 디코딩** — `atob()` 사용 중, React Native에서 `atob` 지원 여부 (Hermes 엔진)
4. **REST TTS 엔드포인트** — `/api/v1/speech/tts`가 `audio_url` 반환 → 해당 URL 접근 가능 여부
5. **`expo-file-system/next`** — `File`, `Paths` import가 Expo SDK 52에서 정상 작동하는지

---

## 실행 계획

### Phase 1: 백엔드 검증 (PM 직접, 즉시)

> **목표:** TTS API가 실제로 오디오를 생성하고 반환하는지 확인

```bash
# 1. 백엔드 서버 로컬 실행
cd /Users/kknaks/kknaks/git/language_diary/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. Health check
curl http://localhost:8000/health

# 3. REST TTS 테스트
curl -X POST http://localhost:8000/api/v1/speech/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, how are you?"}' | jq .

# 4. WebSocket TTS 테스트 (wscat)
wscat -c ws://localhost:8000/ws/conversation/test-session
# → 연결 시 greeting + tts_audio 메시지 수신 확인
```

**확인 항목:**
- [ ] ElevenLabs API 키 작동 여부
- [ ] `audio_url` 반환 시 해당 파일 접근 가능 여부
- [ ] base64 `audio_data` 크기/유효성
- [ ] TTS 실패 시 에러 핸들링 (circuit breaker)

---

### Phase 2: 프론트엔드 런타임 검증 (Xcode 설치 후)

> **목표:** 시뮬레이터에서 실제 오디오 재생 확인

```bash
# 1. Xcode 설치 확인
xcodebuild -version

# 2. CocoaPods 설치 (필요 시)
sudo gem install cocoapods --no-document

# 3. 프론트 빌드 & 실행
cd /Users/kknaks/kknaks/git/language_diary/frontend
npx expo prebuild --clean
cd ios && pod install && cd ..
npx expo run:ios
```

**확인 항목:**
- [ ] `atob()` Hermes 지원 여부 → 안 되면 `base64-js` 패키지로 교체
- [ ] `expo-file-system/next` (`File`, `Paths`) 정상 import
- [ ] `createAudioPlayer` 파일 URI 재생
- [ ] WebSocket 연결 → tts_audio 수신 → 재생 확인

---

### Phase 3: 잠재 버그 수정 (발견 시)

| 잠재 이슈 | 수정 방법 |
|-----------|-----------|
| `atob()` 미지원 (Hermes) | `base64-js` 패키지 사용으로 교체 |
| `expo-file-system/next` 미지원 | `expo-file-system` 레거시 API 사용 |
| `audio_url` 접근 불가 | 백엔드 static file serving 경로 확인/수정 |
| ElevenLabs 키 만료 | 키 재생성 |
| TTS circuit breaker OPEN | `failure_threshold` 조정 또는 리셋 |

---

### Phase 4: E2E 통합 테스트

1. 백엔드 로컬 실행 (port 8000)
2. 프론트 `.env`에 `EXPO_PUBLIC_API_BASE_URL=http://localhost:8000`
3. 시뮬레이터에서 앱 실행
4. 대화 시작 → AI 인사말 + TTS 오디오 재생 확인
5. 사용자 음성 입력 → AI 응답 + TTS 재생 확인
6. LearningCard에서 TTS 버튼 → 개별 문장 재생 확인

---

## 담당

| 작업 | 담당 | 도구 |
|------|------|------|
| Phase 1 (백엔드 검증) | PM | curl, wscat |
| Phase 2 (시뮬레이터 실행) | PM | Xcode + expo run:ios |
| Phase 3 (버그 수정) | 프론트/백엔드 에이전트 | Claude Code |
| Phase 4 (E2E) | PM + 케케낙 확인 | 시뮬레이터 |

## 예상 소요

- Phase 1: 10분
- Phase 2: Xcode 설치 후 20분
- Phase 3: 이슈에 따라 30분~1시간
- Phase 4: 15분
