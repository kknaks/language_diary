import { Audio, AVPlaybackStatus } from 'expo-av';
import { env } from '../config/env';

/**
 * Resolve a potentially relative audio URL to an absolute URL.
 * If the URL already starts with http(s), it's returned as-is.
 */
export function resolveAudioUrl(audioUrl: string): string {
  if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
    return audioUrl;
  }
  return `${env.API_BASE_URL}${audioUrl}`;
}

let currentSound: Audio.Sound | null = null;

/**
 * Play audio from a URL (fire-and-forget).
 * Automatically stops any previously playing TTS audio.
 * Returns a cleanup function to stop playback early.
 */
export async function playAudioFromUrl(
  audioUrl: string,
  onFinish?: () => void,
): Promise<() => void> {
  // Stop previous playback
  if (currentSound) {
    try {
      await currentSound.unloadAsync();
    } catch {
      // ignore
    }
    currentSound = null;
  }

  const uri = resolveAudioUrl(audioUrl);

  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
    );
    currentSound = sound;

    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (currentSound === sound) currentSound = null;
        onFinish?.();
      }
    });

    return () => {
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
    };
  } catch {
    onFinish?.();
    return () => {};
  }
}

/**
 * Stop any currently playing TTS audio (used during cleanup/reset).
 */
export async function stopCurrentAudio(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.unloadAsync();
    } catch {
      // ignore
    }
    currentSound = null;
  }
}
