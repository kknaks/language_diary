from typing import Optional

from pydantic import BaseModel


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 1800


class TokenData(BaseModel):
    user_id: int


class SocialLoginRequest(BaseModel):
    provider: str  # "google" | "apple"
    id_token: str


class UserInToken(BaseModel):
    id: int
    email: Optional[str]
    nickname: str
    social_provider: Optional[str]
    onboarding_completed: bool

    class Config:
        from_attributes = True


class SocialLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 1800
    user: UserInToken
