from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import ProfileCreateRequest, UserProfileResponse, UserResponse
from app.services.profile_service import ProfileService
from app.services.user_service import UserService

router = APIRouter(prefix="/user", tags=["user"])


def _service(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(db)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(service: UserService = Depends(_service)):
    """MVP: returns hardcoded user (id=1)"""
    return await service.get_current_user()


@router.post("/profile", status_code=201)
async def create_profile(
    body: ProfileCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService()
    return await service.create_profile(db, current_user.id, body)


@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService()
    return await service.get_profile(db, current_user.id)
