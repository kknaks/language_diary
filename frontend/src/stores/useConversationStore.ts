import { create } from 'zustand';
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
  prepareStreaming: () => boolean;
  bargeIn: () => void;
  finishConversation: () => void;
  setVoiceState: (state: VoiceState) => void;
  setVolume: (volume: number) => void;
  clearError: () => void;
  reset: () => void;
}

let unsubStatus: (() => void) | null = null;
let unsubMessage: (() => void) | null = null;

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

  prepareStreaming: () => {
    const { sessionId, connectionStatus } = get();
    if (!sessionId || connectionStatus !== 'connected') return false;

    stopCurrentAudio();

    set({
      interimText: '',
      isAiTyping: false,
      voiceState: 'listening' as VoiceState,
      volume: 0,
      pendingAiText: '',
      ttsQueue: new Map(),
      nextTtsIndex: 0,
      isPlayingTts: false,
      error: null,
    });

    return true;
  },

  bargeIn: () => {
    const { connectionStatus } = get();
    if (connectionStatus !== 'connected') return;

    // 1. Stop current audio playback + clear queue
    stopCurrentAudio();

    // 2. Reset state for new listening
    set({
      interimText: '',
      isAiTyping: false,
      pendingAiText: '',
      ttsQueue: new Map(),
      nextTtsIndex: 0,
      isPlayingTts: false,
      error: null,
    });

    // 3. Send barge_in to backend
    wsClient.send({ type: 'barge_in' });
    console.log('[Barge-in] Sent barge_in to backend');
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

  clearError: () => {
    set({ error: null });
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

    case 'stt_final': {
      // VAD committed transcript — add user message and wait for AI response
      const userMessage: Message = {
        id: generateId(),
        conversationId: get().sessionId ?? '',
        role: 'user',
        content: msg.text,
        createdAt: new Date().toISOString(),
      };
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
      break;
    }

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

    case 'ai_done': {
      // AI response complete — finalize any remaining pending text
      const remainingText = get().pendingAiText;
      if (remainingText) {
        const finalAiMessage: Message = {
          id: generateId(),
          conversationId: get().sessionId ?? '',
          role: 'assistant',
          content: remainingText,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          messages: [...state.messages, finalAiMessage],
          isAiTyping: false,
          pendingAiText: '',
        }));
      } else {
        set({ isAiTyping: false });
      }
      // If no TTS is queued or playing (e.g. TTS failed), reset voiceState to idle
      const afterDone = get();
      if (!afterDone.isPlayingTts && afterDone.ttsQueue.size === 0) {
        set({ voiceState: 'idle' as VoiceState, volume: 0 });
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
        // Enforce max queue size (10) to prevent memory bloat
        if (newQueue.size >= 10) {
          console.warn('[TTS] Queue full, dropping oldest unplayed entry');
          const minKey = Math.min(...newQueue.keys());
          newQueue.delete(minKey);
        }
        newQueue.set(index, msg.audio_data);
        return { ttsQueue: newQueue };
      });

      // Try to play if not already playing
      if (!get().isPlayingTts) {
        playNextTts(set, get);
      }
      break;
    }

    case 'barge_in_ack':
      // Backend confirmed barge-in — pipeline is reset, ready for new input
      console.log('[Barge-in] Received barge_in_ack');
      stopCurrentAudio();
      set({
        voiceState: 'listening' as VoiceState,
        isAiTyping: false,
        pendingAiText: '',
        ttsQueue: new Map(),
        nextTtsIndex: 0,
        isPlayingTts: false,
        interimText: '',
      });
      break;

    case 'error':
      if (msg.code === 'TTS_FAILED') {
        console.error('[TTS] Backend TTS failed:', msg.message);
      }
      set({ isAiTyping: false, isCreatingDiary: false, error: msg.message });
      break;
  }
}
