import { useCallback, useEffect, useRef } from 'react';
import { useAudioRecorder, ExpoAudioStreamModule } from '@siteed/expo-audio-studio';
import { fromByteArray, toByteArray } from 'base64-js';
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
 * VAD is computed directly from PCM data in onAudioStream (not onAudioAnalysis)
 * to ensure it works reliably after forceRestart on iOS.
 *
 * On iOS, audio playback can kill the recording session.
 * forceRestart() stops and re-starts the recorder to recover.
 */
// Ambient noise calibration duration (ms)
const AMBIENT_CALIBRATION_MS = 1500;
// How many dB above ambient noise counts as speech
const SPEECH_MARGIN_DB = 8;
// Fallback threshold if calibration data is insufficient
const FALLBACK_THRESHOLD_DB = -40;
// Speech end hangover: require this many ms of continuous silence before firing onSpeechEnd
const SPEECH_END_HANGOVER_MS = 600;

/**
 * Compute dB from raw PCM 16-bit mono data.
 * Returns RMS in dB (relative to full scale).
 */
function computeDbFromPcm(bytes: Uint8Array): number {
  // PCM 16-bit: 2 bytes per sample, little-endian
  const sampleCount = Math.floor(bytes.length / 2);
  if (sampleCount === 0) return -Infinity;

  let sumSq = 0;
  for (let i = 0; i < sampleCount; i++) {
    // Read Int16 little-endian
    const lo = bytes[i * 2];
    const hi = bytes[i * 2 + 1];
    let sample = lo | (hi << 8);
    if (sample >= 0x8000) sample -= 0x10000; // sign extend
    sumSq += sample * sample;
  }

  const rms = Math.sqrt(sumSq / sampleCount);
  if (rms === 0) return -Infinity;
  return 20 * Math.log10(rms / 32768);
}

export function useRealtimeRecorder() {
  const recorder = useAudioRecorder();
  const streamingRef = useRef(false);
  const chunkCountRef = useRef(0);
  const callbackRef = useRef<((base64: string) => void) | null>(null);
  const vadCallbacksRef = useRef<VADCallbacks | null>(null);
  const lastChunkTimeRef = useRef(0);

  // VAD state tracking
  const wasSpeakingRef = useRef(false);
  // Speech end hangover timer — delays onSpeechEnd until continuous silence
  const speechEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // dB logging counter — log every N frames to avoid spam
  const vadFrameCountRef = useRef(0);

  // Ambient noise calibration
  const calibratingRef = useRef(false);
  const calibrationStartRef = useRef(0);
  const ambientDbSamplesRef = useRef<number[]>([]);
  const speechThresholdDbRef = useRef(FALLBACK_THRESHOLD_DB);

  // Request mic permission on mount
  useEffect(() => {
    ExpoAudioStreamModule.requestPermissionsAsync().then((result: unknown) => {
      console.log('[Mic] Permission result:', result);
    });
    // Set audio mode early so it's ready before any recording/playback
    ensureAudioMode();
  }, []);

  /**
   * Run VAD logic on a PCM chunk's dB value.
   * Called from onAudioStream for every chunk.
   */
  const runVad = useCallback((db: number) => {
    // --- Ambient noise calibration phase (first 1.5s) ---
    if (calibratingRef.current) {
      const elapsed = Date.now() - calibrationStartRef.current;
      if (elapsed < AMBIENT_CALIBRATION_MS) {
        // Collect dB samples during silence
        if (isFinite(db) && db < -20) {
          ambientDbSamplesRef.current.push(db);
        }
        return; // Skip VAD during calibration
      } else {
        // Calibration done — compute threshold
        calibratingRef.current = false;
        const samples = ambientDbSamplesRef.current;
        if (samples.length >= 5) {
          const sorted = [...samples].sort((a, b) => b - a); // descending
          const p90idx = Math.floor(sorted.length * 0.1);
          const ambientDb = sorted[p90idx];
          speechThresholdDbRef.current = ambientDb + SPEECH_MARGIN_DB;
          console.log(
            `[VAD] Calibration done: ambient=${ambientDb.toFixed(1)}dB, threshold=${speechThresholdDbRef.current.toFixed(1)}dB (${samples.length} samples)`,
          );
        } else {
          console.log(`[VAD] Calibration insufficient (${samples.length} samples), using fallback ${FALLBACK_THRESHOLD_DB}dB`);
        }
      }
    }

    // --- Normal VAD phase ---
    const threshold = speechThresholdDbRef.current;
    const isActive = isFinite(db) && db > threshold;

    // Periodic dB logging (every 10 frames = ~1s)
    vadFrameCountRef.current++;
    if (vadFrameCountRef.current % 10 === 0) {
      console.log(
        `[VAD] dB=${db.toFixed(1)} threshold=${threshold.toFixed(1)} active=${isActive} speaking=${wasSpeakingRef.current}`,
      );
    }

    // Report energy for volume visualization (dB → 0~1)
    const energy = Math.max(0, Math.min(1, (db + 60) / 60));
    vadCallbacksRef.current?.onEnergy?.(energy);

    // Detect speech transitions with hangover on speech end
    const wasSpeaking = wasSpeakingRef.current;
    if (isActive && !wasSpeaking) {
      // Cancel any pending speech-end hangover timer
      if (speechEndTimerRef.current) {
        clearTimeout(speechEndTimerRef.current);
        speechEndTimerRef.current = null;
      }
      wasSpeakingRef.current = true;
      vadCallbacksRef.current?.onSpeechStart?.();
    } else if (!isActive && wasSpeaking) {
      // Start hangover: only fire onSpeechEnd after continuous silence
      if (!speechEndTimerRef.current) {
        speechEndTimerRef.current = setTimeout(() => {
          speechEndTimerRef.current = null;
          wasSpeakingRef.current = false;
          vadCallbacksRef.current?.onSpeechEnd?.();
        }, SPEECH_END_HANGOVER_MS);
      }
    } else if (isActive && wasSpeaking) {
      // Still speaking — cancel any pending hangover
      if (speechEndTimerRef.current) {
        clearTimeout(speechEndTimerRef.current);
        speechEndTimerRef.current = null;
      }
    }
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

    // Start ambient calibration
    calibratingRef.current = true;
    calibrationStartRef.current = Date.now();
    ambientDbSamplesRef.current = [];
    speechThresholdDbRef.current = FALLBACK_THRESHOLD_DB;
    console.log('[VAD] Ambient calibration started (1.5s)');

    await ensureAudioMode();
    console.log('[Mic] Starting recording with VAD...');

    await recorder.startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 100,
      enableProcessing: false,
      onAudioStream: async (event) => {
        const data = event.data;

        let base64: string;
        let pcmBytes: Uint8Array | null = null;

        if (typeof data === 'string') {
          base64 = data;
          // Decode for VAD dB computation
          try {
            pcmBytes = toByteArray(data);
          } catch {
            // ignore decode errors
          }
        } else if (data instanceof ArrayBuffer) {
          pcmBytes = new Uint8Array(data);
          base64 = fromByteArray(pcmBytes);
        } else if (ArrayBuffer.isView(data)) {
          pcmBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          base64 = fromByteArray(pcmBytes);
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

        // Run VAD from PCM data directly (reliable after forceRestart)
        if (pcmBytes && pcmBytes.length > 0) {
          const db = computeDbFromPcm(pcmBytes);
          runVad(db);
        }

        callbackRef.current?.(base64);
      },
    });
    console.log('[Mic] Recording started with VAD');
  }, [recorder, runVad]);

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

    // Re-start with same callbacks — preserve existing threshold, skip re-calibration
    const savedThreshold = speechThresholdDbRef.current;
    try {
      await doStartRecording(callbackRef.current, vadCallbacksRef.current ?? undefined);
      // doStartRecording resets calibration — restore the saved threshold immediately
      calibratingRef.current = false;
      speechThresholdDbRef.current = savedThreshold;
      console.log(`[Mic] forceRestart: recording restarted, threshold restored to ${savedThreshold.toFixed(1)}dB`);
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
    if (speechEndTimerRef.current) {
      clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }

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
