/**
 * ElevenLabs Conversational AI WebSocket client.
 *
 * Protocol reference:
 * - Send: { "user_audio_chunk": "<base64 PCM 16kHz 16-bit mono>" }
 * - Receive: audio, agent_response, user_transcript, user_transcript_interim (tentative),
 *            interruption, ping/pong, conversation_initiation_metadata
 */

import { toByteArray } from 'base64-js';

/**
 * Calculate RMS energy from PCM 16-bit audio.
 * Returns normalized value 0.0 ~ 1.0.
 */
function calcEnergy(base64PCM: string): number {
  const bytes = toByteArray(base64PCM);
  if (bytes.length < 4) return 0;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numSamples = Math.floor(bytes.length / 2);
  let sumSquared = 0;

  for (let i = 0; i < numSamples; i += 4) {
    const sample = view.getInt16(i * 2, true);
    sumSquared += sample * sample;
  }

  const rms = Math.sqrt(sumSquared / (numSamples / 4));
  // Normalize: 0~32768 → 0~1, clamp
  return Math.min(1, rms / 5000);
}

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

  sendAudio(base64PCM: string): number {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return 0;
    if (!base64PCM || base64PCM.length === 0) return 0;

    const energy = calcEnergy(base64PCM);

    // Always send — let ElevenLabs server VAD handle silence detection
    this.ws.send(JSON.stringify({ user_audio_chunk: base64PCM }));

    return energy; // 0~1, caller can use for orb animation
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
      case 'conversation_initiation_metadata': {
        // Log the audio format info
        const meta = data.conversation_initiation_metadata_event as Record<string, unknown> | undefined;
        console.log('[ElevenLabs ConvAI] Session initialized, meta:', JSON.stringify(meta));
        this.handlers.onConnected?.();
        break;
      }

      case 'audio': {
        // ElevenLabs sends: { type: "audio", audio_event: { audio_base_64: "..." } }
        const audioEvt = data.audio_event as Record<string, string> | undefined;
        const chunk = audioEvt?.audio_base_64;
        if (chunk) {
          console.log(`[ElevenLabs ConvAI] Audio chunk: ${chunk.length} chars`);
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
