import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalAvatar } from '../types';
import { seedApi } from '../services/api';

interface AvatarState {
  avatars: LocalAvatar[];
  selectedAvatarId: string | null;
  isLoading: boolean;

  fetchAvatars: () => Promise<void>;
  selectAvatar: (id: string) => void;
}

export const useAvatarStore = create<AvatarState>()(
  persist(
    (set, get) => ({
      avatars: [],
      selectedAvatarId: null,
      isLoading: false,

      fetchAvatars: async () => {
        // Skip API call if we already have cached avatars
        if (get().avatars.length > 0 && !get().isLoading) {
          return;
        }
        set({ isLoading: true });
        try {
          const res = await seedApi.getAvatars();
          const avatars: LocalAvatar[] = res.items.map((a) => ({
            id: String(a.id),
            name: a.name,
            thumbnailUrl: a.thumbnail_url,
            modelUrl: a.model_url ?? '',
            primaryColor: a.primary_color,
          }));
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
    }),
    {
      name: 'avatar-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        avatars: state.avatars,
        selectedAvatarId: state.selectedAvatarId,
      }),
    },
  ),
);
