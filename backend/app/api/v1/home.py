"""Home API — home screen data endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_onboarded_user
from app.models.user import User
from app.schemas.home import HomeResponse
from app.services.home_service import HomeService

router = APIRouter(prefix="/home", tags=["home"])


@router.get("", response_model=HomeResponse)
async def get_home(
    current_user: User = Depends(get_onboarded_user),
    db: AsyncSession = Depends(get_db),
):
    """Get home screen data: user info, avatar, recent diaries, stats."""
    service = HomeService()
    return await service.get_home_data(db, current_user.id)
