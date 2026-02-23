from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings
from app.exceptions import AppError, app_error_handler, validation_error_handler

app = FastAPI(
    title="Language Diary API",
    version="0.1.0",
    debug=settings.DEBUG,
)

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


@app.get("/health")
async def health():
    return {"status": "ok"}
