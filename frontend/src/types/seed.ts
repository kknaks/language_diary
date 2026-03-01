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
  model_url: string | null;
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

export interface CefrLevel {
  code: string;       // A1, A2, B1, B2, C1, C2
  clazz: string;      // 초급, 중급, 고급
  name: string;       // 입문, 초급, 중급, 중상급, 상급, 최상급
  description: string;
  sort_order: number;
}
