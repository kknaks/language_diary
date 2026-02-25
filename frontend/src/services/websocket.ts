import { ClientMessage, ServerMessage, ConnectionStatus } from '../types';
import { env } from '../config/env';
import { tokenManager } from '../utils/tokenManager';

const WS_BASE_URL = env.WS_BASE_URL;

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // exponential backoff
const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS.length;

type StatusListener = (status: ConnectionStatus) => void;
type MessageListener = (message: ServerMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private intentionalClose = false;

  private statusListeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();

  private _status: ConnectionStatus = 'disconnected';

  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.createConnection();
  }

  private async createConnection() {
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    // 토큰 가져오기 — JWT 인증
    const token = await tokenManager.getAccessToken();
    const url = token
      ? `${WS_BASE_URL}/ws/conversation?token=${token}`
      : `${WS_BASE_URL}/ws/conversation`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
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

      // Attempt reconnect with exponential backoff
      if (this.reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAYS[this.reconnectAttempt] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        this.setStatus('reconnecting');
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempt++;
          this.createConnection();
        }, delay);
      } else {
        // Exhausted retries — notify listeners
        this.setStatus('disconnected');
        this.messageListeners.forEach((fn) =>
          fn({
            type: 'error',
            code: 'CONNECTION_LOST',
            message: '서버 연결이 끊어졌습니다. 다시 시도해주세요.',
          }),
        );
      }
    };
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  disconnect() {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
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
