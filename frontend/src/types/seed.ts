export interface Language {
  id: number;
  code: string;
  name_native: string;
  is_active: boolean;
}

export interface Avatar {
  id: number;
  name: string;
  thumbnail_url: string;
  primary_color: string;
  is_active: boolean;
}

export interface Voice {
  id: number;
  language_id: number;
  name: string;
  gender: 'male' | 'female';
  tone: string | null;
  sample_url: string | null;
  description: string | null;
  is_active: boolean;
}

export interface LanguageListResponse {
  items: Language[];
}

export interface AvatarListResponse {
  items: Avatar[];
}

export interface VoiceListResponse {
  items: Voice[];
}
