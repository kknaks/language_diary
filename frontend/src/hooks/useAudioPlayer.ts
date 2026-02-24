import { useState, useCallback, useRef, useEffect } from 'react';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { requestTts } from '../services/api';

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
  const playerRef = useRef<AudioPlayer | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);

  const releasePlayer = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    if (playerRef.current) {
      try {
        playerRef.current.release();
      } catch {
        // ignore cleanup errors
      }
      playerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      releasePlayer();
    };
  }, [releasePlayer]);

  const playFromUrl = useCallback(
    async (audioUrl: string) => {
      releasePlayer();
      setState('loading');

      try {
        const player = createAudioPlayer(audioUrl);
        playerRef.current = player;

        const sub = player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            setState('idle');
            releasePlayer();
          }
        });
        subRef.current = sub;

        player.play();
        setState('playing');
      } catch {
        setState('idle');
      }
    },
    [releasePlayer],
  );

  const play = useCallback(
    async (text: string) => {
      releasePlayer();
      setState('loading');

      try {
        const ttsResponse = await requestTts(text);

        const player = createAudioPlayer(ttsResponse.audioUrl);
        playerRef.current = player;

        const sub = player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            setState('idle');
            releasePlayer();
          }
        });
        subRef.current = sub;

        player.play();
        setState('playing');
      } catch {
        setState('idle');
      }
    },
    [releasePlayer],
  );

  const pause = useCallback(async () => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        setState('paused');
      } catch {
        // ignore
      }
    }
  }, []);

  const resume = useCallback(async () => {
    if (playerRef.current) {
      try {
        playerRef.current.play();
        setState('playing');
      } catch {
        // ignore
      }
    }
  }, []);

  const stop = useCallback(async () => {
    releasePlayer();
    setState('idle');
  }, [releasePlayer]);

  return { state, play, playFromUrl, pause, resume, stop };
}
