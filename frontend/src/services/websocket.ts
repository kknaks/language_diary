import { ClientMessage, ServerMessage, ConnectionStatus } from '../types';
import { env } from '../config/env';

const WS_BASE_URL = env.WS_BASE_URL;

type StatusListener = (status: ConnectionStatus) => void;
type MessageListener = (message: ServerMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
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

  connect() {
    this.intentionalClose = false;
    this.setStatus('connecting');

    const url = `${WS_BASE_URL}/ws/conversation`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
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
      this.ws = null;
      if (this.intentionalClose) return;
      // No auto-reconnect: each connection creates a new session.
      // Notify listeners that connection is lost.
      this.setStatus('disconnected');
      this.messageListeners.forEach((fn) =>
        fn({
          type: 'error',
          code: 'CONNECTION_LOST',
          message: '서버 연결이 끊어졌습니다.',
        }),
      );
    };
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  send(message: ClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  sendBinary(data: ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(data);
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();
