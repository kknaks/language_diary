import { create } from 'zustand';
import { Message, Diary } from '../types';
import { normalizeDiary, createConvAISession, finishConvAISession } from '../services/api';
import { ElevenLabsConvAIClient } from '../services/elevenlabsConvAI';
import { enqueueAudio, clearAudioQueue, setOnQueueEmpty, stopCurrentAudio } from '../utils/audio';

export type VoiceState = 'idle' | 'listening' | 'ai_speaking';

interface ConversationState {
  // Session
  sessionId: string | null;
  messages: Message[];

  // Voice UI
  voiceState: VoiceState;
  volume: number;
  interimText: string;

  // ElevenLabs client (not serialized)
  elevenlabsClient: ElevenLabsConvAIClient | null;

  // Accumulated messages for diary generation
  accumulatedMessages: Array<{ role: string; content: string }>;

  // Diary creation
  isCreatingDiary: boolean;
  createdDiary: Diary | null;

  // Loading / Error
  isLoading: boolean;
  error: string | null;

  // Actions
  startConversation: () => Promise<void>;
  finishConversation: () => Promise<void>;
  setVoiceState: (state: VoiceState) => void;
  setVolume: (volume: number) => void;
  clearError: () => void;
  reset: () => void;

  // Internal: send audio chunk to ElevenLabs
  sendAudioChunk: (base64: string) => void;
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  sessionId: null,
  messages: [],
  voiceState: 'idle',
  volume: 0,
  interimText: '',
  elevenlabsClient: null,
  accumulatedMessages: [],
  isCreatingDiary: false,
  createdDiary: null,
  isLoading: false,
  error: null,

  startConversation: async () => {
    const state = get();
    if (state.isLoading) return;

    await stopCurrentAudio();
    clearAudioQueue();

    set({
      isLoading: true,
      error: null,
      messages: [],
      accumulatedMessages: [],
      createdDiary: null,
      isCreatingDiary: false,
      interimText: '',
      voiceState: 'idle',
    });

    try {
      // 1. Get signed URL from our backend
      const { session_id, signed_url } = await createConvAISession();
      set({ sessionId: session_id });

      // 2. Connect to ElevenLabs ConvAI
      const client = new ElevenLabsConvAIClient();

      client.connect(signed_url, {
        onConnected: () => {
          set({ isLoading: false, voiceState: 'listening' });
          console.log('[ConvAI] Connected — mic always on');
        },

        onUserTranscript: (text) => {
          // Final user transcript
          const userMessage: Message = {
            id: generateId(),
            conversationId: get().sessionId ?? '',
            role: 'user',
            content: text,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({
            messages: [...s.messages, userMessage],
            accumulatedMessages: [...s.accumulatedMessages, { role: 'user', content: text }],
            interimText: '',
          }));
        },

        onUserTranscriptInterim: (text) => {
          set({ interimText: text });
        },

        onAgentResponse: (text) => {
          // AI agent text
          const aiMessage: Message = {
            id: generateId(),
            conversationId: get().sessionId ?? '',
            role: 'assistant',
            content: text,
            createdAt: new Date().toISOString(),
          };
          set((s) => ({
            messages: [...s.messages, aiMessage],
            accumulatedMessages: [...s.accumulatedMessages, { role: 'assistant', content: text }],
          }));
        },

        onAudio: (base64Audio) => {
          // TTS audio chunk — enqueue for sequential playback
          set({ voiceState: 'ai_speaking' });
          setOnQueueEmpty(() => {
            // When all audio finishes, go back to listening
            set({ voiceState: 'listening' });
          });
          enqueueAudio(base64Audio);
        },

        onInterruption: () => {
          // Barge-in: stop audio, back to listening
          clearAudioQueue();
          set({ voiceState: 'listening' });
        },

        onDisconnected: () => {
          // Only set error if we didn't intentionally disconnect
          const current = get();
          if (!current.isCreatingDiary && !current.createdDiary && current.sessionId) {
            set({ error: 'ElevenLabs 연결이 끊어졌습니다.' });
          }
        },

        onError: (error) => {
          set({ error, isLoading: false });
        },
      });

      set({ elevenlabsClient: client });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start conversation';
      set({ error: message, isLoading: false });
    }
  },

  finishConversation: async () => {
    const { elevenlabsClient, sessionId, accumulatedMessages } = get();

    // Stop audio and disconnect ElevenLabs
    clearAudioQueue();
    elevenlabsClient?.disconnect();

    set({ isCreatingDiary: true, voiceState: 'idle', elevenlabsClient: null });

    if (!sessionId) {
      set({ isCreatingDiary: false, error: 'No active session' });
      return;
    }

    try {
      // Send accumulated messages to backend for diary generation
      const diary = await finishConvAISession(sessionId, accumulatedMessages);
      set({ isCreatingDiary: false, createdDiary: diary });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create diary';
      set({ isCreatingDiary: false, error: message });
    }
  },

  sendAudioChunk: (base64: string) => {
    const { elevenlabsClient, voiceState } = get();
    if (!elevenlabsClient) return;
    const energy = elevenlabsClient.sendAudio(base64);
    // Update volume from real mic energy (only when listening)
    if (voiceState === 'listening') {
      set({ volume: energy });
    }
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
    const { elevenlabsClient } = get();
    clearAudioQueue();
    elevenlabsClient?.disconnect();

    set({
      sessionId: null,
      messages: [],
      voiceState: 'idle',
      volume: 0,
      interimText: '',
      elevenlabsClient: null,
      accumulatedMessages: [],
      isCreatingDiary: false,
      createdDiary: null,
      isLoading: false,
      error: null,
    });
  },
}));
