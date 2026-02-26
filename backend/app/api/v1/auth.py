from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import RefreshRequest, SocialLoginRequest, SocialLoginResponse, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

_auth_service = AuthService()


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    return await _auth_service.refresh_tokens(db, body.refresh_token)


@router.post("/social", response_model=SocialLoginResponse, status_code=200)
async def social_login(
    body: SocialLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    return await _auth_service.social_login(db, body.provider, body.id_token, body.access_token)


@router.post("/logout", status_code=204)
async def logout(
    body: RefreshRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _auth_service.logout(db, body.refresh_token)


@router.delete("/account", status_code=204)
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _auth_service.delete_account(db, current_user.id)
