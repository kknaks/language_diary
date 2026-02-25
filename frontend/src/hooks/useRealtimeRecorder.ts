import { useCallback, useRef } from 'react';
import { useAudioRecorder } from '@siteed/expo-audio-studio';
import { toByteArray } from 'base64-js';
import { wsClient } from '../services/websocket';

/**
 * Real-time microphone streaming hook.
 * Captures PCM audio chunks and sends them as binary WebSocket frames.
 *
 * Flow: startStreaming → audio_start + PCM chunks → stopStreaming → audio_end
 */
export function useRealtimeRecorder() {
  const recorder = useAudioRecorder();
  const streamingRef = useRef(false);

  const startStreaming = useCallback(async () => {
    if (streamingRef.current) return;
    streamingRef.current = true;

    // Notify backend to open STT session
    wsClient.send({ type: 'audio_start' });

    await recorder.startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100, // emit chunks every 100ms
      output: { primary: { enabled: false } }, // no file output needed
      onAudioStream: async (event) => {
        if (typeof event.data !== 'string') return;
        const bytes = toByteArray(event.data);
        wsClient.sendBinary(bytes.buffer as ArrayBuffer);
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

    // Notify backend recording ended
    wsClient.send({ type: 'audio_end' });
  }, [recorder]);

  return {
    isStreaming: recorder.isRecording,
    startStreaming,
    stopStreaming,
  };
}
