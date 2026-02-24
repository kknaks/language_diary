# Discussion: Google Speech-to-Text 백엔드 연동 방안

> 작성일: 2026-02-23  
> PRD 기반 기술 논의

---

## 1. Google STT는 실시간 스트리밍을 지원하는가?

**Yes.** Google Speech-to-Text v2는 3가지 인식 방식을 제공한다:

| 방식 | 설명 | 오디오 제한 |
|------|------|-------------|
| **Synchronous (recognize)** | 짧은 오디오 한 번에 전송 → 결과 반환 | ~1분 (10MB) |
| **Async (batch recognize)** | 긴 오디오 GCS 업로드 후 비동기 처리 | ~480분 |
| **Streaming (streaming recognize)** | gRPC 양방향 스트리밍, 실시간 중간 결과 | ~5분 |

### 우리 프로젝트에 적합한 방식: **Synchronous (recognize)**

이유:
- PRD 기준 음성 입력 최대 **3분**, 파일 최대 **10MB** → Synchronous 제한 내
- PRD의 합의사항: "클라이언트에서 음성 녹음 → 서버로 전송 → Google STT 호출" (녹음 완료 후 전송 방식)
- 스트리밍은 gRPC 필요 → 클라이언트-서버 간 추가 복잡도 발생
- MVP에서 실시간 중간결과(interim results) UX가 불필요 (텍스트 수정 UI 제공)

---

## 2. 청크 전송 vs 전체 전송

### 방식 A: 녹음 완료 후 전체 전송 (✅ 권장)

```
[RN] 녹음 완료 → WAV 파일 → POST /api/v1/speech/stt (multipart) → [FastAPI] → Google STT → 텍스트 반환
```

| 장점 | 단점 |
|------|------|
| 구현 단순 (REST 한 번) | 녹음 끝날 때까지 결과 없음 |
| 에러 처리 간단 | 3분 녹음 시 전송 대기 |
| 네트워크 끊김 시 재전송 가능 | — |
| PRD 합의사항과 일치 | — |
| 서버 상태 관리 불필요 | — |

### 방식 B: 청크 단위 실시간 전송 (WebSocket + gRPC Streaming)

```
[RN] 녹음 중 → 오디오 청크 → WebSocket → [FastAPI] → gRPC Streaming → Google STT → 중간결과 반환
```

| 장점 | 단점 |
|------|------|
| 실시간 중간 결과 표시 | 구현 복잡도 대폭 증가 |
| 체감 응답 빠름 | WebSocket + gRPC 이중 관리 |
| — | 네트워크 끊김 시 재연결 로직 필요 |
| — | 서버 메모리/연결 관리 필요 |
| — | React Native 오디오 스트리밍 제약 |

### 결론
**MVP는 방식 A (전체 전송)로 진행.** 3분 녹음 WAV 16kHz mono ≈ 5.7MB로 제한 내. Phase 2에서 UX 개선 필요 시 스트리밍 검토.

---

## 3. STT → OpenAI 번역 최적의 흐름

PRD의 설계를 따르되, 핵심은 **STT와 번역을 분리**하는 것:

```
[1] POST /api/v1/speech/stt
    → 음성 → 텍스트 반환
    → 클라이언트에서 텍스트 표시 (사용자 수정 가능)

[2] POST /api/v1/diary
    → 수정된 텍스트를 일기로 저장 (status: draft)

[3] POST /api/v1/diary/{id}/translate
    → 확정된 텍스트 → OpenAI 번역 + 학습포인트 생성
```

### 왜 분리하는가?

1. **STT 오류 수정 기회** — 사용자가 인식 결과를 수정한 후 번역
2. **재시도 독립성** — STT 성공 + 번역 실패 시 번역만 재시도
3. **키보드 입력 호환** — 타이핑 시 STT 단계 건너뜀
4. **PRD 설계와 100% 일치** — 이미 합의된 구조

### ❌ 피해야 할 패턴
```
POST /api/v1/speech/stt-and-translate  ← STT+번역 한 방에 처리
```
사용자 수정 기회가 없고, 실패 시 전체 재시도 필요.

---

## 4. WebSocket vs REST

### MVP: **REST** ✅

| 비교 | REST | WebSocket |
|------|------|-----------|
| STT (전체 전송) | `POST` multipart 한 번 | 불필요한 오버엔지니어링 |
| 번역 (동기) | `POST` → 60초 타임아웃 | 불필요 |
| 구현 난이도 | 낮음 | 높음 |
| 인프라 | 표준 HTTP | 별도 연결 관리 |
| 에러 핸들링 | HTTP 상태 코드 | 커스텀 프로토콜 필요 |

### Phase 2 고려사항
- 번역 응답을 **SSE (Server-Sent Events)**로 스트리밍하면 실시간 느낌 가능
- SSE는 WebSocket보다 단순하고 HTTP 기반이라 인프라 호환성 좋음
- 음성 스트리밍이 필요해지면 그때 WebSocket 도입

---

## 5. FastAPI 구현 구조

### 5.1 프로젝트 구조

```
app/
├── api/v1/
│   └── speech.py          # STT/TTS/발음평가 라우터
├── services/
│   └── stt_service.py     # Google STT 비즈니스 로직
├── clients/
│   └── google_stt.py      # Google STT API 클라이언트
├── core/
│   └── config.py          # 설정 (GCP 인증 경로 등)
└── schemas/
    └── speech.py          # Pydantic 모델
```

### 5.2 핵심 코드 구조

**`app/clients/google_stt.py`**
```python
from google.cloud import speech_v2

class GoogleSTTClient:
    def __init__(self, project_id: str, recognizer_id: str = "default"):
        self.client = speech_v2.SpeechClient()
        self.recognizer = (
            f"projects/{project_id}/locations/global/recognizers/{recognizer_id}"
        )

    async def recognize(self, audio_bytes: bytes, language: str = "ko-KR") -> str:
        """동기 인식 (최대 1분/10MB)"""
        config = speech_v2.RecognitionConfig(
            auto_decoding_config=speech_v2.AutoDetectDecodingConfig(),
            language_codes=[language],
            model="long",  # 또는 "latest_long" — 한국어 지원 확인
        )
        request = speech_v2.RecognizeRequest(
            recognizer=self.recognizer,
            config=config,
            content=audio_bytes,
        )
        # 동기 호출을 스레드풀에서 실행 (FastAPI async 호환)
        import asyncio
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, self.client.recognize, request
        )
        # 결과 조합
        transcript = ""
        for result in response.results:
            transcript += result.alternatives[0].transcript
        return transcript
```

**`app/services/stt_service.py`**
```python
from app.clients.google_stt import GoogleSTTClient
from app.core.config import settings

class STTService:
    def __init__(self):
        self.client = GoogleSTTClient(project_id=settings.GCP_PROJECT_ID)

    async def transcribe(self, audio_bytes: bytes, language: str = "ko-KR") -> str:
        if len(audio_bytes) > 10 * 1024 * 1024:  # 10MB
            raise ValueError("Audio file too large")
        
        transcript = await self.client.recognize(audio_bytes, language)
        
        if not transcript.strip():
            raise ValueError("No speech detected")
        
        return transcript
```

**`app/api/v1/speech.py`**
```python
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.stt_service import STTService

router = APIRouter(prefix="/api/v1/speech", tags=["speech"])
stt_service = STTService()

@router.post("/stt")
async def speech_to_text(
    audio: UploadFile = File(...),
    language: str = "ko-KR",
):
    """음성 파일 → 텍스트 변환"""
    audio_bytes = await audio.read()
    
    try:
        transcript = await stt_service.transcribe(audio_bytes, language)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "STT_FAILED", "message": "음성 인식에 실패했습니다."}}
        )
    
    return {"text": transcript, "language": language}
```

### 5.3 GCP 인증 설정

```python
# app/core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GCP_PROJECT_ID: str
    GOOGLE_APPLICATION_CREDENTIALS: str  # 서비스 계정 JSON 경로
    
    class Config:
        env_file = ".env"
```

```bash
# .env
GCP_PROJECT_ID=my-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### 5.4 의존성 설치

```bash
pip install google-cloud-speech==2.*
```

### 5.5 Docker 고려사항

```dockerfile
# 서비스 계정 키를 시크릿으로 마운트
COPY service-account.json /secrets/
ENV GOOGLE_APPLICATION_CREDENTIALS=/secrets/service-account.json
```

---

## 요약 의사결정

| 항목 | 결정 | 이유 |
|------|------|------|
| STT 방식 | Synchronous recognize | 3분/10MB 제한 내, 단순 |
| 전송 방식 | 녹음 완료 후 전체 전송 | PRD 합의, 구현 단순 |
| 프로토콜 | REST (POST multipart) | WebSocket 불필요 |
| STT → 번역 흐름 | 분리 (STT → 수정 → 저장 → 번역) | 수정 기회, 재시도 독립 |
| Google STT 버전 | v2 | 최신, long 모델 지원 |
| Phase 2 검토 | SSE 번역 스트리밍, 음성 스트리밍 | 필요 시 |
