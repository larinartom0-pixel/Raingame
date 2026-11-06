// Signaling Client for PythonAnywhere Flask WebRTC Relay
import { RoomInfo } from './types';

export interface SignalMessage {
  senderId: string;
  type: 'offer' | 'answer' | 'ice';
  payload: any;
  timestamp: number;
}

export class SignalingClient {
  private baseUrl: string;
  private currentRoomId: string | null = null;
  private localPlayerId: string | null = null;
  private pollIntervalId: any = null;
  private heartbeatIntervalId: any = null;
  private onSignalCallback: ((signal: SignalMessage) => void) | null = null;

  constructor(defaultUrl = 'https://larinarten.pythonanywhere.com') {
    this.baseUrl = defaultUrl.replace(/\/+$/, '');
  }

  public setServerUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getServerUrl(): string {
    return this.baseUrl;
  }

  public getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  public async checkHealth(): Promise<{ online: boolean; roomsCount: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { online: true, roomsCount: data.roomsCount || 0 };
    } catch {
      return { online: false, roomsCount: 0 };
    }
  }

  public async listRooms(): Promise<RoomInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/rooms`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Signaling listRooms error:', err);
      return [];
    }
  }

  public async createRoom(params: {
    id?: string;
    name: string;
    hostId: string;
    hostName: string;
    cycleDurationSeconds?: number;
    maxPlayers?: number;
    friendlyFire?: boolean;
  }): Promise<{ success: boolean; room?: RoomInfo; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(6000)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || `Помилка сервера HTTP ${res.status}` };
      }
      this.currentRoomId = data.room.id;
      this.localPlayerId = params.hostId;
      this.startHeartbeat();
      return { success: true, room: data.room };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Не вдалося створити кімнату на сервері' };
    }
  }

  public async joinRoom(
    roomId: string,
    player: { id: string; name: string }
  ): Promise<{ success: boolean; hostId?: string; peers?: Array<{ id: string; name: string }>; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          playerName: player.name,
        }),
        signal: AbortSignal.timeout(6000)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || `Помилка сервера HTTP ${res.status}` };
      }
      this.currentRoomId = roomId;
      this.localPlayerId = player.id;
      this.startHeartbeat();
      return { success: true, hostId: data.hostId, peers: data.peers || [] };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Помилка підключення до кімнати' };
    }
  }

  public async leaveRoom(): Promise<void> {
    if (!this.currentRoomId || !this.localPlayerId) return;
    try {
      await fetch(`${this.baseUrl}/api/rooms/${encodeURIComponent(this.currentRoomId)}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.localPlayerId }),
        signal: AbortSignal.timeout(2000)
      });
    } catch {
      // Ignore leave network errors
    } finally {
      this.stopHeartbeat();
      this.stopPolling();
      this.currentRoomId = null;
      this.localPlayerId = null;
    }
  }

  public async sendSignal(targetId: string, type: 'offer' | 'answer' | 'ice', payload: any): Promise<boolean> {
    if (!this.currentRoomId || !this.localPlayerId) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/rooms/${encodeURIComponent(this.currentRoomId)}/signal/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: this.localPlayerId,
          targetId,
          type,
          payload
        }),
        signal: AbortSignal.timeout(4000)
      });
      return res.ok;
    } catch (err) {
      console.warn('sendSignal error:', err);
      return false;
    }
  }

  public startPolling(onSignal: (signal: SignalMessage) => void, pollIntervalMs = 600): void {
    this.onSignalCallback = onSignal;
    this.stopPolling();
    this.pollIntervalId = setInterval(async () => {
      if (!this.currentRoomId || !this.localPlayerId) return;
      try {
        const res = await fetch(
          `${this.baseUrl}/api/rooms/${encodeURIComponent(this.currentRoomId)}/signal/poll/${encodeURIComponent(this.localPlayerId)}`,
          {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(2500)
          }
        );
        if (res.ok) {
          const list: SignalMessage[] = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            for (const sig of list) {
              this.onSignalCallback?.(sig);
            }
          }
        }
      } catch {
        // Suppress poll dropouts
      }
    }, pollIntervalMs);
  }

  public stopPolling(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatIntervalId = setInterval(async () => {
      if (!this.currentRoomId || !this.localPlayerId) return;
      try {
        await fetch(`${this.baseUrl}/api/rooms/${encodeURIComponent(this.currentRoomId)}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: this.localPlayerId }),
          signal: AbortSignal.timeout(3000)
        });
      } catch {
        // Ignore heartbeat drops
      }
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }
}

export const signalingClient = new SignalingClient('https://larinarten.pythonanywhere.com');
