import { create } from 'zustand';
import type { Avatar } from '../types';
import { getAvatars } from '../services/avatarApi';

interface AvatarState {
  avatars: Avatar[];
  selectedAvatarId: string | null;
  isLoading: boolean;

  fetchAvatars: () => Promise<void>;
  selectAvatar: (id: string) => void;
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  avatars: [],
  selectedAvatarId: null,
  isLoading: false,

  fetchAvatars: async () => {
    set({ isLoading: true });
    try {
      const avatars = await getAvatars();
      const current = get().selectedAvatarId;
      set({
        avatars,
        selectedAvatarId: current ?? avatars[0]?.id ?? null,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  selectAvatar: (id: string) => {
    set({ selectedAvatarId: id });
  },
}));
