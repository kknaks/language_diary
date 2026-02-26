import type { LocalAvatar } from '../types';

const MODEL_URL = '/static/models/mark/mark_free_t04.model3.json';

const MOCK_AVATARS: LocalAvatar[] = [
  {
    id: '1',
    name: 'Luna',
    thumbnailUrl: '',
    modelUrl: MODEL_URL,
    primaryColor: '#6C63FF',
  },
  {
    id: '2',
    name: 'Mochi',
    thumbnailUrl: '',
    modelUrl: MODEL_URL,
    primaryColor: '#FF6B6B',
  },
  {
    id: '3',
    name: 'Kiwi',
    thumbnailUrl: '',
    modelUrl: MODEL_URL,
    primaryColor: '#4ECDC4',
  },
];

/** 아바타 목록 조회 (mock → 나중에 fetch 교체) */
export async function getAvatars(): Promise<LocalAvatar[]> {
  return MOCK_AVATARS;
}

/** 아바타 단건 조회 (mock → 나중에 fetch 교체) */
export async function getAvatar(id: string): Promise<LocalAvatar> {
  const avatar = MOCK_AVATARS.find((a) => a.id === id);
  if (!avatar) throw new Error(`Avatar not found: ${id}`);
  return avatar;
}
