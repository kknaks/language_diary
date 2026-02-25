import { useCallback, useEffect, useRef } from 'react';
import { useAudioRecorder, ExpoAudioStreamModule } from '@siteed/expo-audio-studio';
import { fromByteArray } from 'base64-js';
import { ensureAudioMode } from '../utils/audio';

/**
 * Real-time microphone streaming hook.
 * Captures PCM audio chunks and delivers them via onAudioChunk callback.
 *
 * On iOS, audio playback can kill the recording session.
 * forceRestart() stops and re-starts the recorder to recover.
 */
export function useRealtimeRecorder() {
  const recorder = useAudioRecorder();
  const streamingRef = useRef(false);
  const chunkCountRef = useRef(0);
  const callbackRef = useRef<((base64: string) => void) | null>(null);
  const lastChunkTimeRef = useRef(0);

  // Request mic permission on mount
  useEffect(() => {
    ExpoAudioStreamModule.requestPermissionsAsync().then((result: unknown) => {
      console.log('[Mic] Permission result:', result);
    });
    // Set audio mode early so it's ready before any recording/playback
    ensureAudioMode();
  }, []);

  const doStartRecording = useCallback(async (onAudioChunk: (base64: string) => void) => {
    chunkCountRef.current = 0;
    lastChunkTimeRef.current = Date.now();
    callbackRef.current = onAudioChunk;

    await ensureAudioMode();
    console.log('[Mic] Starting recording...');

    await recorder.startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100,
      onAudioStream: async (event) => {
        const data = event.data;

        let base64: string;
        if (typeof data === 'string') {
          base64 = data;
        } else if (data instanceof ArrayBuffer) {
          base64 = fromByteArray(new Uint8Array(data));
        } else if (ArrayBuffer.isView(data)) {
          base64 = fromByteArray(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        } else {
          console.warn('[Mic] Unknown audio data type:', typeof data);
          return;
        }

        if (base64.length === 0) return;

        lastChunkTimeRef.current = Date.now();
        chunkCountRef.current++;
        if (chunkCountRef.current % 50 === 1) {
          console.log(`[Mic] Chunk #${chunkCountRef.current}, size=${base64.length}`);
        }
        callbackRef.current?.(base64);
      },
    });
    console.log('[Mic] Recording started');
  }, [recorder]);

  const startStreaming = useCallback(async (onAudioChunk: (base64: string) => void) => {
    if (streamingRef.current) {
      console.log('[Mic] Already streaming, skipping start');
      return;
    }
    streamingRef.current = true;
    await doStartRecording(onAudioChunk);
  }, [doStartRecording]);

  /**
   * Force stop + restart recording.
   * Call this after audio playback finishes to recover from iOS audio session killing the mic.
   */
  const forceRestart = useCallback(async () => {
    if (!streamingRef.current || !callbackRef.current) {
      console.log('[Mic] forceRestart skipped: not streaming or no callback');
      return;
    }

    const timeSinceLastChunk = Date.now() - lastChunkTimeRef.current;
    console.log(`[Mic] forceRestart: timeSinceLastChunk=${timeSinceLastChunk}ms`);

    // Stop current recording first
    try {
      await recorder.stopRecording();
    } catch {
      // ignore
    }

    // Small delay to let iOS audio session settle
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Re-start
    try {
      await doStartRecording(callbackRef.current);
      console.log('[Mic] forceRestart: recording restarted successfully');
    } catch (err) {
      console.error('[Mic] forceRestart failed:', err);
    }
  }, [recorder, doStartRecording]);

  const stopStreaming = useCallback(async () => {
    if (!streamingRef.current) return;
    streamingRef.current = false;
    callbackRef.current = null;

    try {
      await recorder.stopRecording();
    } catch {
      // ignore
    }
  }, [recorder]);

  return {
    isStreaming: recorder.isRecording,
    startStreaming,
    stopStreaming,
    forceRestart,
  };
}
