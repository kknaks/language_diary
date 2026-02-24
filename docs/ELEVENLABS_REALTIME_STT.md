# ElevenLabs Realtime STT (Scribe v2)

참고: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-to-text/realtime/client-side-streaming

## 구조

### 백엔드 역할
- 토큰 발급 엔드포인트: `GET /api/v1/speech/scribe-token`
- ElevenLabs API 키로 single-use 토큰 생성 → 프론트에 전달
- 토큰은 15분 후 자동 만료

```typescript
// Node.js 예시 (Python으로 변환 필요)
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const token = await elevenlabs.tokens.singleUse.create("realtime_scribe");
```

### 프론트엔드 역할  
- 백엔드에서 토큰 받기
- ElevenLabs WebSocket에 직접 연결 (클라이언트 사이드)
- 마이크 오디오 → ElevenLabs로 스트리밍
- partial/committed transcript 실시간 수신

### SDK
- React: `@elevenlabs/react` + `@elevenlabs/elevenlabs-js`
- JavaScript: `@elevenlabs/client` + `@elevenlabs/elevenlabs-js`

### React 사용법
```typescript
import { useScribe } from "@elevenlabs/react";

const scribe = useScribe({
  modelId: "scribe_v2_realtime",
  onPartialTranscript: (data) => console.log("Partial:", data.text),
  onCommittedTranscript: (data) => console.log("Committed:", data.text),
});

// 연결
const token = await fetchTokenFromServer();
await scribe.connect({
  token,
  microphone: { echoCancellation: true, noiseSuppression: true },
});

// 종료
scribe.disconnect();
```

### 이벤트
- `PARTIAL_TRANSCRIPT` — 중간 결과 (실시간 UI 표시용)
- `COMMITTED_TRANSCRIPT` — 확정된 텍스트
- `COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS` — 단어별 타임스탬프 포함
- `ERROR` — 에러
- `OPEN` / `CLOSE` — 연결 상태

### 주의사항
- API 키를 클라이언트에 노출하지 말 것 → single-use 토큰 사용
- React Native에서는 @elevenlabs/react 대신 직접 WebSocket 구현 필요할 수 있음
- 오디오 포맷: PCM 16000Hz 권장
