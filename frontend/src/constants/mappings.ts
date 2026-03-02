// CEFR 레벨 매핑 (code → 표시 텍스트)
export const CEFR_MAP: Record<string, { group: string; name: string; description: string }> = {
  A1: { group: '초급', name: '입문', description: '기초적인 인사, 자기소개 수준' },
  A2: { group: '초급', name: '초급', description: '간단한 일상 대화 가능' },
  B1: { group: '중급', name: '중급', description: '여행, 일상 주제로 대화 가능 (토익 약 550~780)' },
  B2: { group: '중급', name: '중상급', description: '원어민과 자연스러운 대화 가능 (토익 약 785~940)' },
  C1: { group: '고급', name: '상급', description: '학술·업무에서 유창하게 소통 (토익 약 945+)' },
  C2: { group: '고급', name: '최상급', description: '원어민에 준하는 수준' },
};

// 언어 매핑 (language_id → 표시 텍스트)
export const LANGUAGE_MAP: Record<number, { name: string; flag: string }> = {
  1: { name: '한국어', flag: '🇰🇷' },
  2: { name: '영어', flag: '🇬🇧' },
  3: { name: '일본어', flag: '🇯🇵' },
  4: { name: '중국어', flag: '🇨🇳' },
  5: { name: '스페인어', flag: '🇪🇸' },
};

// voice tone 매핑 (영어 tone key → 한국어 표시)
export const VOICE_TONE_MAP: Record<string, string> = {
  warm: '따뜻한',
  calm: '차분한',
  professional: '전문적인',
  friendly: '친근한',
  deep: '중후한',
  conversational: '대화체',
  bright: '활발한',
  neutral: '중립적인',
};
