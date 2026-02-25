import { useCallback, useRef } from 'react';
import { useAudioRecorder } from '@siteed/expo-audio-studio';

/**
 * Real-time microphone streaming hook.
 * Captures PCM audio chunks and delivers them via onAudioChunk callback.
 *
 * Flow: startStreaming(onAudioChunk) → PCM chunks via callback → stopStreaming
 */
export function useRealtimeRecorder() {
  const recorder = useAudioRecorder();
  const streamingRef = useRef(false);

  const startStreaming = useCallback(async (onAudioChunk: (base64: string) => void) => {
    if (streamingRef.current) return;
    streamingRef.current = true;

    await recorder.startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100, // emit chunks every 100ms
      output: { primary: { enabled: false } }, // no file output needed
      onAudioStream: async (event) => {
        if (typeof event.data !== 'string') return;
        onAudioChunk(event.data);
      },
    });
  }, [recorder]);

  const stopStreaming = useCallback(async () => {
    if (!streamingRef.current) return;
    streamingRef.current = false;

    try {
      await recorder.stopRecording();
    } catch {
      // ignore stop errors (e.g. already stopped)
    }
  }, [recorder]);

  return {
    isStreaming: recorder.isRecording,
    startStreaming,
    stopStreaming,
  };
}
