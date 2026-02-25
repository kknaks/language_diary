export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  social_provider: string;
  onboarding_completed: boolean;
  created_at: string;
}

export interface SocialLoginRequest {
  provider: 'google' | 'apple';
  id_token: string;
}

export interface SocialLoginResponse extends AuthTokens {
  user: AuthUser;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}
