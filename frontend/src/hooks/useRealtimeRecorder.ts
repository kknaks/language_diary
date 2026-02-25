import { useCallback, useEffect, useRef } from 'react';
import { useAudioRecorder, ExpoAudioStreamModule } from '@siteed/expo-audio-studio';
import type { AudioAnalysis } from '@siteed/expo-audio-studio';
import { fromByteArray } from 'base64-js';
import { ensureAudioMode } from '../utils/audio';

/**
 * VAD (Voice Activity Detection) callback type.
 * Called when speech activity changes based on audio energy analysis.
 */
export interface VADCallbacks {
  /** Called when speech starts (isActive transitions to true) */
  onSpeechStart?: () => void;
  /** Called when speech ends (isActive transitions to false) */
  onSpeechEnd?: () => void;
  /** Called on every analysis frame with the energy value (0~1) */
  onEnergy?: (energy: number) => void;
}

/**
 * Real-time microphone streaming hook with VAD support.
 * Captures PCM audio chunks and delivers them via onAudioChunk callback.
 * Uses @siteed/expo-audio-studio's energy-based VAD for speech detection.
 *
 * On iOS, audio playback can kill the recording session.
 * forceRestart() stops and re-starts the recorder to recover.
 */
export function useRealtimeRecorder() {
  const recorder = useAudioRecorder();
  const streamingRef = useRef(false);
  const chunkCountRef = useRef(0);
  const callbackRef = useRef<((base64: string) => void) | null>(null);
  const vadCallbacksRef = useRef<VADCallbacks | null>(null);
  const lastChunkTimeRef = useRef(0);

  // VAD state tracking
  const wasSpeakingRef = useRef(false);

  // Request mic permission on mount
  useEffect(() => {
    ExpoAudioStreamModule.requestPermissionsAsync().then((result: unknown) => {
      console.log('[Mic] Permission result:', result);
    });
    // Set audio mode early so it's ready before any recording/playback
    ensureAudioMode();
  }, []);

  const doStartRecording = useCallback(async (
    onAudioChunk: (base64: string) => void,
    vadCallbacks?: VADCallbacks,
  ) => {
    chunkCountRef.current = 0;
    lastChunkTimeRef.current = Date.now();
    callbackRef.current = onAudioChunk;
    vadCallbacksRef.current = vadCallbacks ?? null;
    wasSpeakingRef.current = false;

    await ensureAudioMode();
    console.log('[Mic] Starting recording with VAD...');

    await recorder.startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100,
      enableProcessing: true,
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
      onAudioAnalysis: async (analysis: AudioAnalysis) => {
        // AudioAnalysisEvent has dataPoints[] — use the last data point for real-time VAD
        const lastPoint = analysis.dataPoints[analysis.dataPoints.length - 1];
        if (!lastPoint) return;

        // Determine speech activity: prefer speech.isActive, fallback to dB threshold
        const isActive = lastPoint.speech?.isActive ?? (!lastPoint.silent && lastPoint.dB > -40);

        // Report energy for volume visualization (dB → 0~1)
        const energy = Math.max(0, Math.min(1, (lastPoint.dB + 60) / 60));
        vadCallbacksRef.current?.onEnergy?.(energy);

        // Detect speech transitions
        const wasSpeaking = wasSpeakingRef.current;
        if (isActive && !wasSpeaking) {
          wasSpeakingRef.current = true;
          vadCallbacksRef.current?.onSpeechStart?.();
        } else if (!isActive && wasSpeaking) {
          wasSpeakingRef.current = false;
          vadCallbacksRef.current?.onSpeechEnd?.();
        }
      },
    });
    console.log('[Mic] Recording started with VAD');
  }, [recorder]);

  const startStreaming = useCallback(async (
    onAudioChunk: (base64: string) => void,
    vadCallbacks?: VADCallbacks,
  ) => {
    if (streamingRef.current) {
      console.log('[Mic] Already streaming, skipping start');
      return;
    }
    streamingRef.current = true;
    await doStartRecording(onAudioChunk, vadCallbacks);
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

    // Re-start with same callbacks
    try {
      await doStartRecording(callbackRef.current, vadCallbacksRef.current ?? undefined);
      console.log('[Mic] forceRestart: recording restarted successfully');
    } catch (err) {
      console.error('[Mic] forceRestart failed:', err);
    }
  }, [recorder, doStartRecording]);

  const stopStreaming = useCallback(async () => {
    if (!streamingRef.current) return;
    streamingRef.current = false;
    callbackRef.current = null;
    vadCallbacksRef.current = null;
    wasSpeakingRef.current = false;

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
