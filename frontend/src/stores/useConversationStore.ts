import { create } from 'zustand';
import { Conversation, Message, ConnectionStatus, Diary, ServerMessage } from '../types';
import { createConversation, adaptDiary } from '../services/api';
import { wsClient } from '../services/websocket';

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

  // Diary creation
  isCreatingDiary: boolean;
  createdDiary: Diary | null;

  // Loading / Error
  isLoading: boolean;
  error: string | null;

  // Actions
  startConversation: () => Promise<void>;
  sendMessage: (text: string) => void;
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
  isCreatingDiary: false,
  createdDiary: null,
  isLoading: false,
  error: null,

  startConversation: async () => {
    const state = get();
    if (state.isLoading) return;

    set({ isLoading: true, error: null, messages: [], turnCount: 0, createdDiary: null, isCreatingDiary: false });

    try {
      const session = await createConversation();

      // Add AI first message
      const firstMessage: Message = {
        id: generateId(),
        conversationId: session.sessionId,
        role: 'assistant',
        content: session.firstMessage,
        createdAt: session.createdAt,
      };

      set({
        sessionId: session.sessionId,
        messages: [firstMessage],
        turnCount: 1,
        isLoading: false,
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

      wsClient.connect(session.sessionId);
    } catch {
      set({ isLoading: false, error: '대화를 시작할 수 없습니다. 다시 시도해주세요.' });
    }
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

    set((state) => ({
      messages: [...state.messages, userMessage],
      turnCount: state.turnCount + 1,
      interimText: '',
      isAiTyping: true,
      voiceState: 'processing' as VoiceState,
      volume: 0,
    }));

    wsClient.send({ type: 'message', text });
  },

  finishConversation: () => {
    const { connectionStatus } = get();
    if (connectionStatus !== 'connected') return;

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
      isCreatingDiary: false,
      createdDiary: null,
      isLoading: false,
      error: null,
    });
  },
}));

function handleServerMessage(
  msg: ServerMessage,
  set: (partial: Partial<ConversationState> | ((s: ConversationState) => Partial<ConversationState>)) => void,
  get: () => ConversationState,
) {
  switch (msg.type) {
    case 'stt_interim':
      set({ interimText: msg.text });
      break;

    case 'stt_final':
      set({ interimText: '' });
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

    case 'diary_created':
      set({ isCreatingDiary: false, createdDiary: adaptDiary(msg.diary), voiceState: 'idle' as VoiceState, volume: 0 });
      break;

    case 'tts_audio':
      // TTS audio URL received — currently no playback; ignore gracefully
      break;

    case 'error':
      set({ isAiTyping: false, isCreatingDiary: false, error: msg.message });
      break;
  }
}
