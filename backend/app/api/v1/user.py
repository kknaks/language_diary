from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.user import UserResponse
from app.services.user_service import UserService

router = APIRouter(prefix="/user", tags=["user"])


def _service(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(db)


@router.get("/me", response_model=UserResponse)
async def get_current_user(service: UserService = Depends(_service)):
    """MVP: returns hardcoded user (id=1)"""
    return await service.get_current_user()
