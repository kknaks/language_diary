from fastapi import APIRouter

from app.api.v1.conversation import router as conversation_router
from app.api.v1.diary import router as diary_router
from app.api.v1.speech import router as speech_router
from app.api.v1.user import router as user_router

api_router = APIRouter()
api_router.include_router(diary_router)
api_router.include_router(user_router)
api_router.include_router(conversation_router)
api_router.include_router(speech_router)
