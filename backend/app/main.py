import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.conversation import conversation_websocket
from app.api.v1.router import api_router
from app.config import settings
from app.exceptions import AppError, app_error_handler, generic_error_handler, validation_error_handler
from app.middleware.logging import RequestLoggingMiddleware
from app.middleware.rate_limit import RateLimitMiddleware

# Configure structured logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(
    title="Language Diary API",
    description=(
        "AI-powered conversational diary app for language learning. "
        "Users talk about their day in Korean via AI conversation, "
        "and the system generates an English diary with learning points, TTS, and pronunciation evaluation."
    ),
    version="1.0.0",
    debug=settings.DEBUG,
    openapi_tags=[
        {"name": "diary", "description": "Diary CRUD — list, detail, update, delete, complete"},
        {"name": "conversation", "description": "AI conversation sessions — create, query, WebSocket chat"},
        {"name": "speech", "description": "TTS generation and pronunciation evaluation"},
        {"name": "user", "description": "User profile (MVP: hardcoded user_id=1)"},
    ],
)

# Static file serving for TTS audio and uploaded recordings
_audio_dir = Path("audio_files")
_audio_dir.mkdir(parents=True, exist_ok=True)
app.mount("/audio", StaticFiles(directory=str(_audio_dir)), name="audio")

_uploads_dir = Path("audio_uploads")
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")

_static_dir = Path("static")
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

# --- Middleware (order matters: last added = outermost) ---

# CORS — configurable via ALLOWED_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# Rate limiting
app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.RATE_LIMIT_PER_MINUTE)

# Request/Response logging (skips WebSocket upgrades)
app.add_middleware(RequestLoggingMiddleware)

# --- Exception handlers ---
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, generic_error_handler)

# --- Routes ---
app.include_router(api_router, prefix="/api/v1")

# WebSocket endpoint (outside /api/v1 prefix per PRD spec)
app.add_api_websocket_route("/ws/conversation", conversation_websocket)


@app.get("/health", tags=["system"])
async def health():
    """Health check endpoint. Returns 200 if the server is running."""
    return {"status": "ok"}
