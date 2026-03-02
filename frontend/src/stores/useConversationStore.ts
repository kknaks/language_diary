import { create } from 'zustand';
import { Message, Diary, ServerMessage } from '../types';
import { normalizeDiary, createConversationSession } from '../services/api';
import { WebSocketClient } from '../services/websocket';
import { enqueueMp3Audio, clearAudioQueue, onQueueDrain, stopCurrentAudio } from '../utils/audio';
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

  // Barge-in stale message filtering
  bargePending: boolean;

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
  sendBargeIn: () => void;
  sendNudge: () => void;
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
  bargePending: false,
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

      // Track streaming AI message for chunk assembly into single bubble
      let currentAiMessageId: string | null = null;
      let currentAiText = '';

      const unsubMessage = ws.onMessage((message: ServerMessage) => {
        console.log('[WS] Received:', message.type);

        switch (message.type) {
          case 'session_created': {
            // AI가 먼저 인사말을 하므로 tts_audio 올 때까지 idle 유지
            set({ sessionId: message.session_id, isLoading: false, voiceState: 'idle' });
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
            const { text, is_final } = message;

            if (!currentAiMessageId) {
              // First chunk of a new AI turn — create message
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
            } else if (text) {
              // Subsequent chunk — append to existing message
              currentAiText += ' ' + text;
              const msgId = currentAiMessageId;
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === msgId ? { ...m, content: currentAiText } : m,
                ),
              }));
            }

            if (is_final) {
              currentAiMessageId = null;
              currentAiText = '';
            }
            break;
          }

          case 'tts_audio': {
            // Ignore stale TTS arriving after barge-in
            if (get().bargePending) {
              console.log('[WS] Ignoring stale tts_audio (barge pending)');
              break;
            }
            // MP3 base64 audio — enqueue for sequential playback
            set({ voiceState: 'ai_speaking' });
            enqueueMp3Audio(message.audio_data);
            break;
          }

          case 'ai_done': {
            // Ignore stale ai_done arriving after barge-in
            if (get().bargePending) {
              console.log('[WS] Ignoring stale ai_done (barge pending)');
              break;
            }
            // AI turn fully complete — transition back to listening
            // after all queued audio finishes playing.
            // If queue is already empty (no TTS), transition immediately.
            onQueueDrain(() => {
              set({ voiceState: 'listening' });
            });
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
            set({ bargePending: false });
            break;
          }

          case 'stt_empty': {
            console.log('[WS] STT empty:', message.message);
            break;
          }

          case 'error': {
            console.error('[WS] Error:', message.code, message.message);
            // STT errors are transient — don't show to user, conversation continues
            if (message.code === 'STT_FAILED') {
              console.log('[WS] STT error ignored (transient)');
              break;
            }
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

  sendBargeIn: () => {
    const { wsClient } = get();
    if (!wsClient) return;
    console.log('[WS] Sending barge_in');
    clearAudioQueue();
    wsClient.send({ type: 'barge_in' });
    set({ voiceState: 'listening', bargePending: true });
  },

  sendNudge: () => {
    const { wsClient } = get();
    if (!wsClient) return;
    console.log('[WS] Sending nudge (silence timeout)');
    wsClient.send({ type: 'nudge' });
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
      bargePending: false,
      isCreatingDiary: false,
      createdDiary: null,
      isLoading: false,
      error: null,
    });
  },
}));
