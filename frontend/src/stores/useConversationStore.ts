import { create } from 'zustand';
import { Message, Diary, ServerMessage } from '../types';
import { normalizeDiary, createConversationSession } from '../services/api';
import { WebSocketClient } from '../services/websocket';
import { enqueueMp3Audio, clearAudioQueue, setOnQueueEmpty, stopCurrentAudio } from '../utils/audio';
import { toByteArray } from 'base64-js';

export type VoiceState = 'idle' | 'listening' | 'ai_speaking';

interface ConversationState {
  // Session
  sessionId: string | null;
  messages: Message[];

  // Voice UI
  voiceState: VoiceState;
  volume: number;
  interimText: string;

  // WebSocket client (not serialized)
  wsClient: WebSocketClient | null;

  // Diary creation
  isCreatingDiary: boolean;
  createdDiary: Diary | null;

  // Loading / Error
  isLoading: boolean;
  error: string | null;

  // Actions
  startConversation: () => Promise<void>;
  finishConversation: () => void;
  sendAudioChunk: (base64: string) => void;
  sendAudioStart: () => void;
  sendAudioEnd: () => void;
  sendBargeIn: () => void;
  setVoiceState: (state: VoiceState) => void;
  setVolume: (volume: number) => void;
  clearError: () => void;
  reset: () => void;
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
  wsClient: null,
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
      createdDiary: null,
      isCreatingDiary: false,
      interimText: '',
      voiceState: 'idle',
    });

    try {
      // 1. Create conversation session via REST API
      const { session_id } = await createConversationSession();
      set({ sessionId: session_id });

      // 2. Connect to backend WebSocket
      const ws = new WebSocketClient();

      // Track streaming AI message index for chunk assembly
      let currentAiChunkIndex: number | null = null;
      let currentAiMessageId: string | null = null;
      let currentAiText = '';

      const unsubMessage = ws.onMessage((message: ServerMessage) => {
        console.log('[WS] Received:', message.type);

        switch (message.type) {
          case 'session_created': {
            set({ sessionId: message.session_id, isLoading: false, voiceState: 'listening' });
            console.log('[WS] Session created:', message.session_id);
            break;
          }

          case 'ai_message': {
            // Greeting message from AI
            const aiMsg: Message = {
              id: generateId(),
              conversationId: get().sessionId ?? '',
              role: 'assistant',
              content: message.text,
              createdAt: new Date().toISOString(),
            };
            set((s) => ({
              messages: [...s.messages, aiMsg],
            }));
            break;
          }

          case 'stt_interim': {
            set({ interimText: message.text });
            break;
          }

          case 'stt_final': {
            const userMsg: Message = {
              id: generateId(),
              conversationId: get().sessionId ?? '',
              role: 'user',
              content: message.text,
              createdAt: new Date().toISOString(),
            };
            set((s) => ({
              messages: [...s.messages, userMsg],
              interimText: '',
            }));
            break;
          }

          case 'ai_message_chunk': {
            const { text, index, is_final } = message;

            if (currentAiChunkIndex !== index) {
              // New AI response — create a new message
              currentAiChunkIndex = index;
              currentAiText = text;
              currentAiMessageId = generateId();

              const aiMsg: Message = {
                id: currentAiMessageId,
                conversationId: get().sessionId ?? '',
                role: 'assistant',
                content: text,
                createdAt: new Date().toISOString(),
              };
              set((s) => ({
                messages: [...s.messages, aiMsg],
              }));
            } else {
              // Append to existing message
              currentAiText += text;
              const msgId = currentAiMessageId;
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === msgId ? { ...m, content: currentAiText } : m,
                ),
              }));
            }

            if (is_final) {
              currentAiChunkIndex = null;
              currentAiMessageId = null;
              currentAiText = '';
            }
            break;
          }

          case 'tts_audio': {
            // MP3 base64 audio — enqueue for playback
            set({ voiceState: 'ai_speaking' });
            setOnQueueEmpty(() => {
              // When all audio finishes, go back to listening
              set({ voiceState: 'listening' });
            });
            enqueueMp3Audio(message.audio_data);
            break;
          }

          case 'ai_done': {
            // AI turn complete — if no audio is queued, go back to listening
            // (audio queue onEmpty callback handles the transition when audio is playing)
            break;
          }

          case 'diary_created': {
            const diary = normalizeDiary(message.diary);
            set({ isCreatingDiary: false, createdDiary: diary, voiceState: 'idle' });
            // Clean up WS
            ws.disconnect();
            break;
          }

          case 'barge_in_ack': {
            console.log('[WS] Barge-in acknowledged');
            break;
          }

          case 'stt_empty': {
            console.log('[WS] STT empty:', message.message);
            break;
          }

          case 'error': {
            console.error('[WS] Error:', message.code, message.message);
            set({ error: message.message, isLoading: false });
            break;
          }

          default: {
            console.log('[WS] Unknown message type:', (message as { type: string }).type);
            break;
          }
        }
      });

      const unsubStatus = ws.onStatus((status) => {
        console.log('[WS] Status:', status);
        if (status === 'disconnected') {
          const current = get();
          if (!current.isCreatingDiary && !current.createdDiary && current.sessionId) {
            set({ error: '서버 연결이 끊어졌습니다.' });
          }
        }
      });

      // Store cleanup functions on the client for later
      (ws as unknown as { _cleanupFns: Array<() => void> })._cleanupFns = [unsubMessage, unsubStatus];

      ws.connect();
      set({ wsClient: ws });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start conversation';
      set({ error: message, isLoading: false });
    }
  },

  finishConversation: () => {
    const { wsClient } = get();
    if (!wsClient) return;

    // Send finish signal — backend will create diary and send diary_created
    clearAudioQueue();
    wsClient.send({ type: 'finish' });
    set({ isCreatingDiary: true, voiceState: 'idle' });
  },

  sendAudioChunk: (base64: string) => {
    const { wsClient } = get();
    if (!wsClient) return;

    // Convert base64 PCM to binary ArrayBuffer and send
    try {
      const bytes = toByteArray(base64);
      wsClient.sendBinary(bytes.buffer as ArrayBuffer);
    } catch (err) {
      console.warn('[WS] Failed to send audio chunk:', err);
    }
  },

  sendAudioStart: () => {
    const { wsClient } = get();
    if (!wsClient) return;
    console.log('[WS] Sending audio_start');
    wsClient.send({ type: 'audio_start' });
  },

  sendAudioEnd: () => {
    const { wsClient } = get();
    if (!wsClient) return;
    console.log('[WS] Sending audio_end');
    wsClient.send({ type: 'audio_end' });
  },

  sendBargeIn: () => {
    const { wsClient } = get();
    if (!wsClient) return;
    console.log('[WS] Sending barge_in');
    clearAudioQueue();
    wsClient.send({ type: 'barge_in' });
    set({ voiceState: 'listening' });
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
    const { wsClient } = get();
    clearAudioQueue();
    if (wsClient) {
      // Clean up listeners
      const cleanupFns = (wsClient as unknown as { _cleanupFns?: Array<() => void> })._cleanupFns;
      cleanupFns?.forEach((fn) => fn());
      wsClient.disconnect();
    }

    set({
      sessionId: null,
      messages: [],
      voiceState: 'idle',
      volume: 0,
      interimText: '',
      wsClient: null,
      isCreatingDiary: false,
      createdDiary: null,
      isLoading: false,
      error: null,
    });
  },
}));
