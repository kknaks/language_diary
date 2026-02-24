import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

let currentPlayer: AudioPlayer | null = null;
let finishCleanup: (() => void) | null = null;

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Play audio from base64-encoded MP3 data.
 * Writes to a temp file (iOS doesn't support data URIs) then plays.
 */
export async function playAudioFromBase64(
  base64Data: string,
  onFinish?: () => void,
): Promise<() => void> {
  // Stop previous playback
  await stopCurrentAudio();

  const filename = `tts_${Date.now()}.mp3`;
  const file = new File(Paths.cache, filename);

  try {
    // Decode base64 → bytes, create file, then write
    const bytes = base64ToUint8Array(base64Data);
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
