import { useState, useCallback, useRef, useEffect } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { requestTts } from '../services/api';
import { resolveAudioUrl } from '../utils/audio';

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

interface UseAudioPlayerReturn {
  state: AudioState;
  play: (text: string) => Promise<void>;
  playFromUrl: (url: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [state, setState] = useState<AudioState>('idle');
  const soundRef = useRef<Audio.Sound | null>(null);

  const unloadSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // ignore cleanup errors
      }
      soundRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const handleStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (status.isLoaded && status.didJustFinish) {
        setState('idle');
        unloadSound();
      }
    },
    [unloadSound],
  );

  const playFromUrl = useCallback(
    async (audioUrl: string) => {
      await unloadSound();
      setState('loading');

      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

        const uri = resolveAudioUrl(audioUrl);
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        setState('playing');

        sound.setOnPlaybackStatusUpdate(handleStatus);
      } catch {
        setState('idle');
      }
    },
    [unloadSound, handleStatus],
  );

  const play = useCallback(
    async (text: string) => {
      await unloadSound();
      setState('loading');

      try {
        const ttsResponse = await requestTts(text);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

        const uri = resolveAudioUrl(ttsResponse.audioUrl);
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        setState('playing');

        sound.setOnPlaybackStatusUpdate(handleStatus);
      } catch {
        setState('idle');
      }
    },
    [unloadSound, handleStatus],
  );

  const pause = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.pauseAsync();
        setState('paused');
      } catch {
        // ignore
      }
    }
  }, []);

  const resume = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.playAsync();
        setState('playing');
      } catch {
        // ignore
      }
    }
  }, []);

  const stop = useCallback(async () => {
    await unloadSound();
    setState('idle');
  }, [unloadSound]);

  return { state, play, playFromUrl, pause, resume, stop };
}
