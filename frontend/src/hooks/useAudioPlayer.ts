import { useState, useCallback, useRef } from 'react';
import { requestTts } from '../services/api';

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

interface UseAudioPlayerReturn {
  state: AudioState;
  play: (text: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [state, setState] = useState<AudioState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const play = useCallback(async (text: string) => {
    cleanup();
    setState('loading');

    try {
      // Request TTS (mock returns a fake URL)
      await requestTts(text);
      setState('playing');

      // Mock: simulate audio playback duration (3 seconds)
      timerRef.current = setTimeout(() => {
        setState('idle');
        timerRef.current = null;
      }, 3000);
    } catch {
      setState('idle');
    }
  }, [cleanup]);

  const pause = useCallback(() => {
    if (state === 'playing') {
      cleanup();
      setState('paused');
    }
  }, [state, cleanup]);

  const resume = useCallback(() => {
    if (state === 'paused') {
      setState('playing');
      timerRef.current = setTimeout(() => {
        setState('idle');
        timerRef.current = null;
      }, 1500);
    }
  }, [state]);

  const stop = useCallback(() => {
    cleanup();
    setState('idle');
  }, [cleanup]);

  return { state, play, pause, resume, stop };
}
