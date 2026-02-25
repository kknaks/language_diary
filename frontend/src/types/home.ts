export interface HomeAvatar {
  id: number;
  name: string;
  custom_name: string | null;
  thumbnail_url: string;
  primary_color: string;
}

export interface HomeUser {
  nickname: string;
  target_language: { id: number; code: string; name_native: string } | null;
}

export interface HomeDiary {
  id: number;
  original_text: string | null;
  translated_text: string | null;
  status: string;
  created_at: string;
}

export interface HomeStats {
  total_diaries: number;
  streak_days: number;
  today_completed: boolean;
}

export interface HomeResponse {
  user: HomeUser;
  avatar: HomeAvatar | null;
  recent_diaries: HomeDiary[];
  stats: HomeStats;
}
