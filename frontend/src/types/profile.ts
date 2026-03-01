export interface ProfileUpdateRequest {
  nickname?: string;
  avatar_id?: number;
  avatar_name?: string;
  voice_id?: number;
  pronunciation_voice_id?: number | null;
  empathy?: number;
  intuition?: number;
  logic?: number;
  target_language_id?: number;
  native_language_id?: number;
  app_locale?: string;
  cefr_level?: string;
}

export interface LanguageLevelUpdateRequest {
  language_id: number;
  cefr_level: string;
}

export interface ProfileCreateRequest {
  native_language_id: number;
  target_language_id: number;
  avatar_id?: number;
  avatar_name?: string;
  voice_id?: number;
  empathy: number;
  intuition: number;
  logic: number;
  app_locale: string;
  cefr_level?: string;
}

export interface UserProfileResponse {
  id: number;
  email: string | null;
  nickname: string;
  social_provider: string | null;
  is_active: boolean;
  created_at: string;
  profile: ProfileData | null;
  language_level: { language_id: number; cefr_level: string } | null;
}

export interface ProfileData {
  id: number;
  user_id: number;
  app_locale: string;
  native_language: { id: number; code: string; name_native: string } | null;
  target_language: { id: number; code: string; name_native: string } | null;
  avatar: { id: number; name: string; thumbnail_url: string; primary_color: string; model_url?: string | null } | null;
  avatar_name: string | null;
  voice: { id: number; name: string; gender: string; tone: string | null; sample_url: string | null } | null;
  pronunciation_voice_id?: number | null;
  pronunciation_voice?: { id: number; name: string; gender: string; tone: string | null; sample_url: string | null } | null;
  empathy: number;
  intuition: number;
  logic: number;
  onboarding_completed: boolean;
}
