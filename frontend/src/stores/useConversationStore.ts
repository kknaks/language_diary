import { create } from 'zustand';
import { File } from 'expo-file-system';
import { Conversation, Message, ConnectionStatus, Diary, ServerMessage } from '../types';
import { normalizeDiary } from '../services/api';
import { wsClient } from '../services/websocket';
import { playAudioFromBase64, stopCurrentAudio } from '../utils/audio';

export type VoiceState = 'idle' | 'listening' | 'ai_speaking' | 'processing';

interface ConversationState {
  // Session
  sessionId: string | null;
  currentConversation: Conversation | null;
  messages: Message[];
  turnCount: number;
  maxTurns: number;

  // WebSocket
  connectionStatus: ConnectionStatus;
  isAiTyping: boolean;
  interimText: string;

  // Voice UI
  voiceState: VoiceState;
  volume: number;

  // Streaming AI text
  pendingAiText: string;

  // TTS queue for ordered playback
  ttsQueue: Map<number, string>; // index → base64 audio data
  nextTtsIndex: number;
  isPlayingTts: boolean;

  // Diary creation
  isCreatingDiary: boolean;
  createdDiary: Diary | null;

  // Loading / Error
  isLoading: boolean;
  error: string | null;

  // Actions
  startConversation: () => Promise<void>;
  sendMessage: (text: string) => void;
  sendAudio: (fileUri: string) => Promise<void>;
  finishConversation: () => void;
  setVoiceState: (state: VoiceState) => void;
  setVolume: (volume: number) => void;
  reset: () => void;
}

let unsubStatus: (() => void) | null = null;
let unsubMessage: (() => void) | null = null;

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Parse WAV file to find the actual start of PCM data.
 * WAV files have a RIFF header + fmt chunk + possibly other chunks before "data".
 * Returns the byte offset where PCM audio data starts.
 */
function findWavDataOffset(bytes: Uint8Array): number {
  // Minimum WAV header: RIFF(4) + size(4) + WAVE(4) = 12 bytes
  if (bytes.length < 12) return 0;

  // Search for "data" chunk marker (0x64 0x61 0x74 0x61)
  for (let i = 12; i < Math.min(bytes.length - 8, 500); i++) {
    if (
      bytes[i] === 0x64 &&     // 'd'
      bytes[i + 1] === 0x61 && // 'a'
      bytes[i + 2] === 0x74 && // 't'
      bytes[i + 3] === 0x61    // 'a'
    ) {
      // "data" marker found; data starts 8 bytes after (4 for "data" + 4 for size)
      return i + 8;
    }
  }

  // Fallback: standard 44-byte header
  return 44;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  sessionId: null,
  currentConversation: null,
  messages: [],
  turnCount: 0,
  maxTurns: 10,
  connectionStatus: 'disconnected',
  isAiTyping: false,
  interimText: '',
  voiceState: 'idle',
  volume: 0,
  pendingAiText: '',
  ttsQueue: new Map(),
  nextTtsIndex: 0,
  isPlayingTts: false,
  isCreatingDiary: false,
  createdDiary: null,
  isLoading: false,
  error: null,

  startConversation: async () => {
    const state = get();
    if (state.isLoading) return;

    // Stop any previous audio
    await stopCurrentAudio();

    set({
      isLoading: true,
      error: null,
      messages: [],
      turnCount: 0,
      createdDiary: null,
      isCreatingDiary: false,
      pendingAiText: '',
      ttsQueue: new Map(),
      nextTtsIndex: 0,
      isPlayingTts: false,
    });

    // Subscribe to WebSocket events
    unsubStatus?.();
    unsubMessage?.();

    unsubStatus = wsClient.onStatus((status) => {
      set({ connectionStatus: status });
    });

    unsubMessage = wsClient.onMessage((msg: ServerMessage) => {
      handleServerMessage(msg, set, get);
    });

    // Connect WebSocket — session will be created server-side
    wsClient.connect();
  },

  sendMessage: (text: string) => {
    const { sessionId, connectionStatus } = get();
    if (!sessionId || connectionStatus !== 'connected') return;

    const userMessage: Message = {
      id: generateId(),
      conversationId: sessionId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    // Stop current TTS playback before starting new turn
    stopCurrentAudio();

    set((state) => ({
      messages: [...state.messages, userMessage],
      turnCount: state.turnCount + 1,
      interimText: '',
      isAiTyping: true,
      voiceState: 'processing' as VoiceState,
      volume: 0,
      pendingAiText: '',
      ttsQueue: new Map(),
      nextTtsIndex: 0,
      isPlayingTts: false,
    }));

    wsClient.send({ type: 'message', text });
  },

  sendAudio: async (fileUri: string) => {
    const { sessionId, connectionStatus } = get();
    if (!sessionId || connectionStatus !== 'connected') return;

    stopCurrentAudio();

    set((state) => ({
      interimText: '',
      isAiTyping: true,
      voiceState: 'processing' as VoiceState,
      volume: 0,
      pendingAiText: '',
      ttsQueue: new Map(),
      nextTtsIndex: 0,
      isPlayingTts: false,
    }));

    try {
      // Read recorded WAV file and find the PCM data section
      const file = new File(fileUri);
      const allBytes = await file.bytes();

      // Parse WAV header to find actual "data" chunk offset
      const dataOffset = findWavDataOffset(allBytes);
      const pcmBytes = allBytes.slice(dataOffset);

      console.log(`[Audio] WAV total=${allBytes.length}, dataOffset=${dataOffset}, pcm=${pcmBytes.length}`);

      if (pcmBytes.length === 0) {
        console.error('[Audio] No PCM data found in WAV file');
        set({ isAiTyping: false, voiceState: 'idle', error: '녹음 데이터가 비어있습니다.' });
        return;
      }

      // Send audio_start → binary PCM → audio_end
      wsClient.send({ type: 'audio_start' });
      // Use .buffer.slice() to get a proper standalone ArrayBuffer
      wsClient.sendBinary(pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength));
      wsClient.send({ type: 'audio_end' });
    } catch (err) {
      console.error('[Audio] Failed to send audio:', err);
      set({ isAiTyping: false, voiceState: 'idle', error: '음성 전송에 실패했습니다.' });
    }
  },

  finishConversation: () => {
    const { connectionStatus } = get();
    if (connectionStatus !== 'connected') return;

    stopCurrentAudio();
    set({ isCreatingDiary: true, isAiTyping: false, voiceState: 'processing' });
    wsClient.send({ type: 'finish' });
  },

  setVoiceState: (voiceState: VoiceState) => {
    set({ voiceState });
  },

  setVolume: (volume: number) => {
    set({ volume: Math.max(0, Math.min(1, volume)) });
  },

  reset: () => {
    unsubStatus?.();
    unsubMessage?.();
    unsubStatus = null;
    unsubMessage = null;
    wsClient.disconnect();
    stopCurrentAudio();

    set({
      sessionId: null,
      currentConversation: null,
      messages: [],
      turnCount: 0,
      connectionStatus: 'disconnected',
      isAiTyping: false,
      interimText: '',
      voiceState: 'idle',
      volume: 0,
      pendingAiText: '',
      ttsQueue: new Map(),
      nextTtsIndex: 0,
      isPlayingTts: false,
      isCreatingDiary: false,
      createdDiary: null,
      isLoading: false,
      error: null,
    });
  },
}));

function playNextTts(
  set: (partial: Partial<ConversationState> | ((s: ConversationState) => Partial<ConversationState>)) => void,
  get: () => ConversationState,
) {
  const state = get();
  const { ttsQueue, nextTtsIndex, isPlayingTts } = state;

  // Prevent concurrent playback
  if (isPlayingTts) return;

  const audioData = ttsQueue.get(nextTtsIndex);
  if (!audioData) {
    // No audio ready for current index yet; will be triggered when it arrives
    return;
  }

  set({ isPlayingTts: true, voiceState: 'ai_speaking' as VoiceState });

  console.log(`[TTS] 재생 시작: index=${nextTtsIndex}`);

  playAudioFromBase64(audioData, () => {
    console.log(`[TTS] 재생 완료: index=${get().nextTtsIndex}`);
    // Remove played entry and advance index
    set((s) => {
      const newQueue = new Map(s.ttsQueue);
      newQueue.delete(s.nextTtsIndex);
      const newIndex = s.nextTtsIndex + 1;
      return {
        ttsQueue: newQueue,
        nextTtsIndex: newIndex,
        isPlayingTts: false,
      };
    });
    // Check if there's more to play
    const next = get();
    if (next.ttsQueue.has(next.nextTtsIndex)) {
      playNextTts(set, get);
    } else if (next.ttsQueue.size === 0) {
      // All TTS done
      set({ voiceState: 'idle' as VoiceState, volume: 0 });
    }
  }).catch((err) => {
    console.error('[TTS] playAudioFromUrl error:', err);
    set((s) => {
      const newQueue = new Map(s.ttsQueue);
      newQueue.delete(s.nextTtsIndex);
      const newIndex = s.nextTtsIndex + 1;
      return {
        ttsQueue: newQueue,
        nextTtsIndex: newIndex,
        isPlayingTts: false,
        voiceState: 'idle' as VoiceState,
        volume: 0,
      };
    });
    playNextTts(set, get);
  });
}

function handleServerMessage(
  msg: ServerMessage,
  set: (partial: Partial<ConversationState> | ((s: ConversationState) => Partial<ConversationState>)) => void,
  get: () => ConversationState,
) {
  switch (msg.type) {
    case 'session_created':
      set({ sessionId: msg.session_id, isLoading: false });
      break;

    case 'stt_interim':
      set({ interimText: msg.text });
      break;

    case 'stt_final':
      set({ interimText: '' });
      break;

    case 'stt_empty':
      // STT returned empty transcription — reset UI so user can retry
      set({ interimText: '', isAiTyping: false, voiceState: 'idle' as VoiceState, volume: 0 });
      break;

    case 'ai_message': {
      const aiMessage: Message = {
        id: generateId(),
        conversationId: get().sessionId ?? '',
        role: 'assistant',
        content: msg.text,
        createdAt: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, aiMessage],
        turnCount: state.turnCount + 1,
        isAiTyping: false,
        voiceState: 'ai_speaking' as VoiceState,
      }));
      break;
    }

    case 'ai_message_chunk': {
      if (msg.is_final) {
        // All chunks received — finalize the pending message
        const finalText = get().pendingAiText;
        if (finalText) {
          const aiMessage: Message = {
            id: generateId(),
            conversationId: get().sessionId ?? '',
            role: 'assistant',
            content: finalText,
            createdAt: new Date().toISOString(),
          };
          set((state) => ({
            messages: [...state.messages, aiMessage],
            turnCount: state.turnCount + 1,
            isAiTyping: false,
            pendingAiText: '',
          }));
        }
      } else {
        // Accumulate text
        set((state) => ({
          pendingAiText: state.pendingAiText + msg.text,
          isAiTyping: true,
        }));
      }
      break;
    }

    case 'diary_created':
      set({ isCreatingDiary: false, createdDiary: normalizeDiary(msg.diary), voiceState: 'idle' as VoiceState, volume: 0 });
      break;

    case 'tts_audio': {
      // All TTS (greeting + streaming) go through the ordered queue
      const index = msg.index ?? 0;
      console.log(`[TTS] 수신: index=${index}, size=${msg.audio_data.length}`);

      set((state) => {
        const newQueue = new Map(state.ttsQueue);
        newQueue.set(index, msg.audio_data);
        return { ttsQueue: newQueue };
      });

      // Try to play if not already playing
      if (!get().isPlayingTts) {
        playNextTts(set, get);
      }
      break;
    }

    case 'error':
      if (msg.code === 'TTS_FAILED') {
        console.error('[TTS] Backend TTS failed:', msg.message);
      }
      set({ isAiTyping: false, isCreatingDiary: false, error: msg.message });
      break;
  }
}
