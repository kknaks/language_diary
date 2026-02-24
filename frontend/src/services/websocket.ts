import { ClientMessage, ServerMessage, ConnectionStatus } from '../types';
import { env } from '../config/env';

const WS_BASE_URL = env.WS_BASE_URL;
const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_RECONNECT_DELAY = 1000; // 1s

type StatusListener = (status: ConnectionStatus) => void;
type MessageListener = (message: ServerMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  private statusListeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();

  private _status: ConnectionStatus = 'disconnected';

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  connect(sessionId: string) {
    this.intentionalClose = false;
    this.sessionId = sessionId;
    this.reconnectAttempts = 0;
    this.openConnection();
  }

  disconnect() {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.sessionId = null;
    this.setStatus('disconnected');
  }

  send(message: ClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  private openConnection() {
    if (!this.sessionId) return;

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const url = `${WS_BASE_URL}/ws/conversation/${this.sessionId}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
    };

    this.ws.onmessage = (event: WebSocketMessageEvent) => {
      try {
        const data: ServerMessage = JSON.parse(event.data as string);
        this.messageListeners.forEach((fn) => fn(data));
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };

    this.ws.onclose = () => {
      if (this.intentionalClose) return;
      this.attemptReconnect();
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setStatus('disconnected');
      return;
    }
    this.reconnectAttempts++;
    this.setStatus('reconnecting');

    const delay = BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);
    this.reconnectTimer = setTimeout(() => {
      this.openConnection();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();
