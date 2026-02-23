from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.conversation import conversation_websocket
from app.api.v1.router import api_router
from app.config import settings
from app.exceptions import AppError, app_error_handler, validation_error_handler

app = FastAPI(
    title="Language Diary API",
    version="0.1.0",
    debug=settings.DEBUG,
)

# Static file serving for TTS audio and uploaded recordings
_audio_dir = Path("audio_files")
_audio_dir.mkdir(parents=True, exist_ok=True)
app.mount("/audio", StaticFiles(directory=str(_audio_dir)), name="audio")

_uploads_dir = Path("audio_uploads")
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: 프로덕션에서 제한
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)

app.include_router(api_router, prefix="/api/v1")

# WebSocket endpoint (outside /api/v1 prefix per PRD spec)
app.add_api_websocket_route("/ws/conversation/{session_id}", conversation_websocket)


@app.get("/health")
async def health():
    return {"status": "ok"}
