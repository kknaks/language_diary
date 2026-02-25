import { createAudioPlayer, AudioPlayer, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { toByteArray, fromByteArray } from 'base64-js';

let audioModeConfigured = false;

/**
 * Configure iOS audio session for simultaneous recording + playback.
 * Must be called before any audio playback while recording.
 */
export async function ensureAudioMode(): Promise<void> {
  if (audioModeConfigured) return;
  try {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
    audioModeConfigured = true;
    console.log('[Audio] Audio mode set: playAndRecord + mixWithOthers');
  } catch (err) {
    console.error('[Audio] Failed to set audio mode:', err);
  }
}

let currentPlayer: AudioPlayer | null = null;
let finishCleanup: (() => void) | null = null;

// Audio queue for sequential playback
interface QueueItem {
  data: string;  // base64 audio data
  ext: string;   // file extension: 'wav' | 'mp3'
}
let audioQueue: QueueItem[] = [];
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
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
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
  // Ensure audio session allows simultaneous record + playback
  await ensureAudioMode();

  const filename = `tts_${Date.now()}.${ext}`;
  const file = new File(Paths.cache, filename);

  try {
    const bytes = toByteArray(base64Data);
    console.log(`[Audio] Playing ${ext} file: ${bytes.length} bytes`);
    file.create();
    file.write(bytes);

    const player = createAudioPlayer(file.uri);
    currentPlayer = player;

    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        console.log('[Audio] Playback finished');
        cleanup();
        onFinish?.();
      }
    });

    const cleanup = () => {
      subscription.remove();
      player.release();
      if (currentPlayer === player) currentPlayer = null;
      finishCleanup = null;
      try { file.delete(); } catch { /* ignore */ }
    };

    finishCleanup = cleanup;
    player.play();

    return () => {
      cleanup();
    };
  } catch (err) {
    console.error('[Audio] Playback failed:', err);
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
  console.log(`[Audio Queue] Enqueued PCM→WAV chunk, queue size: ${audioQueue.length + 1}`);
  audioQueue.push({ data: wavBase64, ext: 'wav' });
  if (!isQueuePlaying) {
    processQueue();
  }
}

/**
 * Enqueue a base64 MP3 audio chunk for sequential playback.
 * No conversion needed — plays MP3 directly.
 */
export function enqueueMp3Audio(mp3Base64: string): void {
  console.log(`[Audio Queue] Enqueued MP3 chunk, queue size: ${audioQueue.length + 1}`);
  audioQueue.push({ data: mp3Base64, ext: 'mp3' });
  if (!isQueuePlaying) {
    processQueue();
  }
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
  console.log(`[Audio Queue] Clearing queue (${audioQueue.length} items)`);
  audioQueue = [];
  isQueuePlaying = false;
  onQueueEmpty = null;
  stopCurrentAudio();
}

function processQueue(): void {
  if (isQueuePlaying || audioQueue.length === 0) return;

  isQueuePlaying = true;
  const item = audioQueue.shift()!;
  console.log(`[Audio Queue] Playing next (${item.ext}), remaining: ${audioQueue.length}`);

  playAudioFromBase64(item.data, () => {
    isQueuePlaying = false;
    if (audioQueue.length > 0) {
      processQueue();
    } else {
      console.log('[Audio Queue] Queue empty');
      onQueueEmpty?.();
    }
  }, item.ext).catch((err) => {
    console.error('[Audio Queue] Play error:', err);
    isQueuePlaying = false;
    if (audioQueue.length > 0) {
      processQueue();
    } else {
      onQueueEmpty?.();
    }
  });
}
