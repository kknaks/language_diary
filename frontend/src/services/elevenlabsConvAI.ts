/**
 * ElevenLabs Conversational AI WebSocket client.
 *
 * Protocol reference:
 * - Send: { "user_audio_chunk": "<base64 PCM 16kHz 16-bit mono>" }
 * - Receive: audio, agent_response, user_transcript, user_transcript_interim (tentative),
 *            interruption, ping/pong, conversation_initiation_metadata
 */

export interface ConvAIEventHandlers {
  /** Final user transcription from ElevenLabs STT */
  onUserTranscript?: (text: string) => void;
  /** Interim (tentative) user transcription */
  onUserTranscriptInterim?: (text: string) => void;
  /** AI agent text response */
  onAgentResponse?: (text: string) => void;
  /** TTS audio chunk (base64 PCM) */
  onAudio?: (base64Audio: string) => void;
  /** Barge-in / interruption detected */
  onInterruption?: () => void;
  /** Connection opened and session initialized */
  onConnected?: () => void;
  /** Connection closed */
  onDisconnected?: () => void;
  /** Error */
  onError?: (error: string) => void;
}

export class ElevenLabsConvAIClient {
  private ws: WebSocket | null = null;
  private handlers: ConvAIEventHandlers = {};
  private intentionalClose = false;

  connect(signedUrl: string, handlers: ConvAIEventHandlers): void {
    this.disconnect();
    this.handlers = handlers;
    this.intentionalClose = false;

    console.log('[ElevenLabs ConvAI] Connecting...');
    this.ws = new WebSocket(signedUrl);

    this.ws.onopen = () => {
      console.log('[ElevenLabs ConvAI] WebSocket open, waiting for session init...');
    };

    this.ws.onmessage = (event: WebSocketMessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        this.handleMessage(data);
      } catch (e) {
        console.warn('[ElevenLabs ConvAI] Failed to parse message:', e);
      }
    };

    this.ws.onerror = (e: Event) => {
      console.error('[ElevenLabs ConvAI] WebSocket error:', e);
      this.handlers.onError?.('WebSocket error');
    };

    this.ws.onclose = (e: WebSocketCloseEvent) => {
      console.log(`[ElevenLabs ConvAI] Closed: code=${e.code} reason=${e.reason}`);
      this.ws = null;
      if (!this.intentionalClose) {
        this.handlers.onDisconnected?.();
      }
    };
  }

  sendAudio(base64PCM: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!base64PCM || base64PCM.length === 0) return;
    this.ws.send(JSON.stringify({ user_audio_chunk: base64PCM }));
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private handleMessage(data: Record<string, unknown>): void {
    const type = data.type as string | undefined;
    console.log('[ElevenLabs ConvAI] Received:', type);

    switch (type) {
      case 'conversation_initiation_metadata':
        // Session is ready — now we signal connected
        console.log('[ElevenLabs ConvAI] Session initialized');
        this.handlers.onConnected?.();
        break;

      case 'audio': {
        const audioObj = data.audio as Record<string, string> | undefined;
        const chunk = audioObj?.chunk;
        if (chunk) {
          this.handlers.onAudio?.(chunk);
        }
        break;
      }

      case 'agent_response': {
        const evt = data.agent_response_event as Record<string, string> | undefined;
        const text = evt?.agent_response;
        if (text) {
          this.handlers.onAgentResponse?.(text);
        }
        break;
      }

      case 'user_transcript': {
        const evt = data.user_transcription_event as Record<string, string> | undefined;
        const text = evt?.user_transcript;
        if (text) {
          this.handlers.onUserTranscript?.(text);
        }
        break;
      }

      case 'user_transcript_interim': {
        const evt = data.user_transcription_event as Record<string, string> | undefined;
        const text = evt?.user_transcript;
        if (text) {
          this.handlers.onUserTranscriptInterim?.(text);
        }
        break;
      }

      case 'interruption':
        this.handlers.onInterruption?.();
        break;

      case 'ping': {
        // Echo back the event_id from the ping
        const pingEvt = data.ping_event as Record<string, unknown> | undefined;
        const eventId = pingEvt?.event_id;
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'pong', event_id: eventId }));
        }
        break;
      }

      default:
        console.log('[ElevenLabs ConvAI] Unknown message type:', type, data);
        break;
    }
  }
}
