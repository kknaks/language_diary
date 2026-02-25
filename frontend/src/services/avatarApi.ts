import type { Avatar } from '../types';

const MOCK_AVATARS: Avatar[] = [
  {
    id: '1',
    name: 'Luna',
    thumbnailUrl: '',
    modelUrl: '',
    primaryColor: '#6C63FF',
  },
  {
    id: '2',
    name: 'Mochi',
    thumbnailUrl: '',
    modelUrl: '',
    primaryColor: '#FF6B6B',
  },
  {
    id: '3',
    name: 'Kiwi',
    thumbnailUrl: '',
    modelUrl: '',
    primaryColor: '#4ECDC4',
  },
];

/** 아바타 목록 조회 (mock → 나중에 fetch 교체) */
export async function getAvatars(): Promise<Avatar[]> {
  return MOCK_AVATARS;
}

/** 아바타 단건 조회 (mock → 나중에 fetch 교체) */
export async function getAvatar(id: string): Promise<Avatar> {
  const avatar = MOCK_AVATARS.find((a) => a.id === id);
  if (!avatar) throw new Error(`Avatar not found: ${id}`);
  return avatar;
}
