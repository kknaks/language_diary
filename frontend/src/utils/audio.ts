import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { toByteArray, fromByteArray } from 'base64-js';

let currentPlayer: AudioPlayer | null = null;
let finishCleanup: (() => void) | null = null;

// Audio queue for sequential playback
let audioQueue: string[] = [];
let isQueuePlaying = false;
let onQueueEmpty: (() => void) | null = null;

/**
 * Convert base64 PCM (16-bit mono) to WAV by prepending a WAV header.
 */
export function pcmToWav(pcmBase64: string, sampleRate: number = 16000): string {
  const pcmBytes = toByteArray(pcmBase64);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBytes.length;
  const headerSize = 44;

  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Copy PCM data
  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, headerSize);

  return fromByteArray(wavBytes);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Play audio from base64-encoded data (MP3 or WAV).
 * Writes to a temp file (iOS doesn't support data URIs) then plays.
 */
export async function playAudioFromBase64(
  base64Data: string,
  onFinish?: () => void,
  ext: string = 'mp3',
): Promise<() => void> {
  // Stop previous playback
  await stopCurrentAudio();

  const filename = `tts_${Date.now()}.${ext}`;
  const file = new File(Paths.cache, filename);

  try {
    // Decode base64 → bytes, create file, then write
    const bytes = toByteArray(base64Data);
    file.create();
    file.write(bytes);

    const player = createAudioPlayer(file.uri);
    currentPlayer = player;

    // Listen for playback end
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        cleanup();
        onFinish?.();
      }
    });

    const cleanup = () => {
      subscription.remove();
      player.release();
      if (currentPlayer === player) currentPlayer = null;
      finishCleanup = null;
      // Clean up temp file
      try { file.delete(); } catch { /* ignore */ }
    };

    finishCleanup = cleanup;

    player.play();

    return () => {
      cleanup();
    };
  } catch (err) {
    console.error('[TTS Audio] playback failed:', err);
    // Clean up temp file on error
    try { file.delete(); } catch { /* ignore */ }
    onFinish?.();
    return () => {};
  }
}

/**
 * Stop any currently playing TTS audio (used during cleanup/reset).
 */
export async function stopCurrentAudio(): Promise<void> {
  if (finishCleanup) {
    finishCleanup();
    finishCleanup = null;
  } else if (currentPlayer) {
    try {
      currentPlayer.release();
    } catch {
      // ignore
    }
    currentPlayer = null;
  }
}

/**
 * Enqueue a base64 PCM audio chunk for sequential playback.
 * Converts PCM → WAV, then plays in order.
 */
export function enqueueAudio(pcmBase64: string): void {
  const wavBase64 = pcmToWav(pcmBase64);
  audioQueue.push(wavBase64);
  processQueue();
}

/**
 * Set a callback for when the audio queue becomes empty (all chunks played).
 */
export function setOnQueueEmpty(callback: (() => void) | null): void {
  onQueueEmpty = callback;
}

/**
 * Clear the audio queue and stop current playback.
 */
export function clearAudioQueue(): void {
  audioQueue = [];
  isQueuePlaying = false;
  onQueueEmpty = null;
  stopCurrentAudio();
}

function processQueue(): void {
  if (isQueuePlaying || audioQueue.length === 0) return;

  isQueuePlaying = true;
  const wavData = audioQueue.shift()!;

  playAudioFromBase64(wavData, () => {
    isQueuePlaying = false;
    if (audioQueue.length > 0) {
      processQueue();
    } else {
      onQueueEmpty?.();
    }
  }, 'wav').catch(() => {
    isQueuePlaying = false;
    if (audioQueue.length > 0) {
      processQueue();
    } else {
      onQueueEmpty?.();
    }
  });
}
