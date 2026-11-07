// WebRTC DataChannel Peer-to-Peer Mesh Manager (up to 12 players)
import { NetworkPacket, RemotePlayer } from './types';
import { signalingClient, SignalMessage } from './SignalingClient';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  iceCandidatePoolSize: 10
};

interface PeerConnectionWrapper {
  peerId: string;
  peerName: string;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  pendingIceCandidates: RTCIceCandidateInit[];
  pingMs: number;
  lastPingSentAt: number;
}

export class WebRTCManager {
  public localPlayerId: string = `sc-${Math.floor(Math.random() * 89999 + 10000)}`;
  public localPlayerName: string = `Слимакокіт-${this.localPlayerId.slice(-4)}`;
  
  public currentRoomId: string | null = null;
  public isRoomHost: boolean = false;
  public connectionStatus: 'disconnected' | 'signaling' | 'connected' | 'error' = 'disconnected';
  public lastError: string | null = null;

  // Connected peers (up to 11 peers + local = 12 players)
  private peers: Map<string, PeerConnectionWrapper> = new Map();
  public remotePlayers: Map<string, RemotePlayer> = new Map();

  private packetHandlers: Set<(packet: NetworkPacket) => void> = new Set();
  private peerListHandlers: Set<(peers: RemotePlayer[]) => void> = new Set();
  private statusHandlers: Set<(status: 'disconnected' | 'signaling' | 'connected' | 'error') => void> = new Set();

  private pingIntervalId: any = null;
  private localBroadcastChannel: BroadcastChannel | null = null;

  constructor() {
    this.startPingMonitor();
    this.setupLocalBroadcastChannel();
  }

  private setupLocalBroadcastChannel() {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.localBroadcastChannel = new BroadcastChannel('rw_p2p_channel');
        this.localBroadcastChannel.onmessage = (event) => {
          if (!event.data || typeof event.data !== 'object') return;
          const { roomId, packet } = event.data;
          if (roomId && this.currentRoomId && roomId === this.currentRoomId) {
            if (packet && packet.senderId !== this.localPlayerId) {
              this.handleIncomingPacket(packet);
            }
          }
        };
      }
    } catch {
      // BroadcastChannel optional
    }
  }

  public setLocalIdentity(name: string) {
    this.localPlayerName = name.trim() || this.localPlayerName;
  }

  public onPacket(handler: (packet: NetworkPacket) => void): () => void {
    this.packetHandlers.add(handler);
    return () => this.packetHandlers.delete(handler);
  }

  public onPeerListChange(handler: (peers: RemotePlayer[]) => void): () => void {
    this.peerListHandlers.add(handler);
    return () => this.peerListHandlers.delete(handler);
  }

  public onStatusChange(handler: (status: 'disconnected' | 'signaling' | 'connected' | 'error') => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(s: 'disconnected' | 'signaling' | 'connected' | 'error', err?: string) {
    this.connectionStatus = s;
    if (err) this.lastError = err;
    this.statusHandlers.forEach(h => h(s));
  }

  public static GLOBAL_ROOM_ID = 'rain-world-global-main';
  public static GLOBAL_ROOM_NAME = 'Спільний світ Rain World (1 кімната для всіх)';

  public async joinGlobalWorld(): Promise<boolean> {
    this.disconnect();
    this.setStatus('signaling');

    // 1. Try to join existing global room
    try {
      const joinRes = await signalingClient.joinRoom(WebRTCManager.GLOBAL_ROOM_ID, {
        id: this.localPlayerId,
        name: this.localPlayerName,
      });

      if (joinRes.success) {
        this.isRoomHost = false;
        this.currentRoomId = WebRTCManager.GLOBAL_ROOM_ID;
        this.startSignalingListener();
        if (joinRes.peers && joinRes.peers.length > 0) {
          for (const peer of joinRes.peers) {
            await this.initiatePeerConnection(peer.id, peer.name);
          }
        }
        this.setStatus('connected');
        return true;
      }
    } catch (e) {
      console.warn('Initial global room join error, attempting creation:', e);
    }

    // 2. If room does not exist yet on server, create it with fixed GLOBAL_ROOM_ID
    try {
      this.isRoomHost = true;
      const hostRes = await signalingClient.createRoom({
        id: WebRTCManager.GLOBAL_ROOM_ID,
        name: WebRTCManager.GLOBAL_ROOM_NAME,
        hostId: this.localPlayerId,
        hostName: this.localPlayerName,
        cycleDurationSeconds: 360,
        maxPlayers: 16,
        friendlyFire: true
      });

      if (hostRes.success && hostRes.room) {
        this.currentRoomId = hostRes.room.id;
        this.startSignalingListener();
        this.setStatus('connected');
        return true;
      }
    } catch (e) {
      console.warn('Create global room error, attempting retry join:', e);
    }

    // 3. Race condition fallback or offline local BroadcastChannel mode
    try {
      const retryJoin = await signalingClient.joinRoom(WebRTCManager.GLOBAL_ROOM_ID, {
        id: this.localPlayerId,
        name: this.localPlayerName,
      });
      if (retryJoin.success) {
        this.isRoomHost = false;
        this.currentRoomId = WebRTCManager.GLOBAL_ROOM_ID;
        this.startSignalingListener();
        if (retryJoin.peers && retryJoin.peers.length > 0) {
          for (const peer of retryJoin.peers) {
            await this.initiatePeerConnection(peer.id, peer.name);
          }
        }
        this.setStatus('connected');
        return true;
      }
    } catch {
      // Offline / LAN BroadcastChannel fallback
    }

    this.currentRoomId = WebRTCManager.GLOBAL_ROOM_ID;
    this.setStatus('connected');
    return true;
  }

  // Automatic room matchmaking & creation:
  // "убери кнопку создания комнат гра сама создає комнату єслі їх нету або всі заповнені з рандомним таймером циклов та 12 слотами гравців"
  public async autoMatchmakeAndJoin(): Promise<boolean> {
    this.disconnect();
    this.setStatus('signaling');

    try {
      const rooms = await signalingClient.listRooms();
      // Look for any joinable room with available slots
      const joinable = rooms.find(r => r.playerCount < (r.maxPlayers || 12));

      if (joinable) {
        const ok = await this.joinRoom(joinable.id);
        if (ok) return true;
      }
    } catch (e) {
      console.warn('Failed listing rooms during auto-matchmaking:', e);
    }

    // If no rooms exist or all are full (12/12), automatically create a room!
    // Randomized cycle duration: 3 to 7 min, rare 12 min
    const randomCycle = Math.random() < 0.08 ? 12 * 60 : (180 + Math.floor(Math.random() * (420 - 180 + 1)));
    const roomName = `Світ Rain World #${Math.floor(Math.random() * 899 + 100)}`;
    return await this.hostRoom(roomName, randomCycle, 12);
  }

  public async hostRoom(roomName: string, cycleSec = 300, maxPlayers = 12): Promise<boolean> {
    this.disconnect();
    this.setStatus('signaling');
    this.isRoomHost = true;

    const res = await signalingClient.createRoom({
      name: roomName,
      hostId: this.localPlayerId,
      hostName: this.localPlayerName,
      cycleDurationSeconds: cycleSec,
      maxPlayers,
      friendlyFire: true
    });

    if (!res.success || !res.room) {
      this.setStatus('error', res.error || 'Не вдалося створити кімнату на сервері');
      return false;
    }

    this.currentRoomId = res.room.id;
    this.startSignalingListener();
    this.setStatus('connected');
    return true;
  }

  public async joinRoom(roomId: string): Promise<boolean> {
    this.disconnect();
    this.setStatus('signaling');
    this.isRoomHost = false;

    const res = await signalingClient.joinRoom(roomId, {
      id: this.localPlayerId,
      name: this.localPlayerName,
    });

    if (!res.success) {
      this.setStatus('error', res.error || 'Помилка приєднання до кімнати');
      return false;
    }

    this.currentRoomId = roomId;
    this.startSignalingListener();

    // For every peer already in the room, initiate connection
    if (res.peers && res.peers.length > 0) {
      for (const peer of res.peers) {
        await this.initiatePeerConnection(peer.id, peer.name);
      }
    }

    this.setStatus('connected');
    return true;
  }

  private startSignalingListener() {
    signalingClient.startPolling(async (signal: SignalMessage) => {
      await this.handleIncomingSignal(signal);
    }, 550);
  }

  private async initiatePeerConnection(targetId: string, targetName: string) {
    if (this.peers.has(targetId)) return;

    try {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const dc = pc.createDataChannel('rw-p2p', {
        ordered: false, // low latency UDP mode
        maxRetransmits: 0
      });

      const wrapper: PeerConnectionWrapper = {
        peerId: targetId,
        peerName: targetName,
        connection: pc,
        dataChannel: dc,
        pendingIceCandidates: [],
        pingMs: 25,
        lastPingSentAt: Date.now()
      };

      this.setupDataChannel(dc, wrapper);
      this.setupPeerConnection(pc, wrapper);

      this.peers.set(targetId, wrapper);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await signalingClient.sendSignal(targetId, 'offer', offer);
    } catch (err) {
      console.warn('initiatePeerConnection failed:', err);
    }
  }

  private async handleIncomingSignal(sig: SignalMessage) {
    const senderId = sig.senderId;
    if (senderId === this.localPlayerId) return;

    let wrapper = this.peers.get(senderId);

    if (sig.type === 'offer') {
      try {
        if (!wrapper) {
          const pc = new RTCPeerConnection(RTC_CONFIG);
          wrapper = {
            peerId: senderId,
            peerName: `Слимакокіт-${senderId.slice(-4)}`,
            connection: pc,
            dataChannel: null,
            pendingIceCandidates: [],
            pingMs: 25,
            lastPingSentAt: Date.now()
          };
          this.setupPeerConnection(pc, wrapper);
          this.peers.set(senderId, wrapper);
        }

        await wrapper.connection.setRemoteDescription(new RTCSessionDescription(sig.payload));

        // Flush any ICE candidates that arrived before offer
        if (wrapper.pendingIceCandidates.length > 0) {
          for (const cand of wrapper.pendingIceCandidates) {
            try {
              await wrapper.connection.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.warn('Error applying pending ICE candidate:', e);
            }
          }
          wrapper.pendingIceCandidates = [];
        }

        const answer = await wrapper.connection.createAnswer();
        await wrapper.connection.setLocalDescription(answer);

        await signalingClient.sendSignal(senderId, 'answer', answer);
      } catch (err) {
        console.warn('Error handling offer:', err);
      }
    } else if (sig.type === 'answer') {
      try {
        if (wrapper && wrapper.connection.signalingState !== 'stable') {
          await wrapper.connection.setRemoteDescription(new RTCSessionDescription(sig.payload));

          // Flush any ICE candidates that arrived before answer
          if (wrapper.pendingIceCandidates.length > 0) {
            for (const cand of wrapper.pendingIceCandidates) {
              try {
                await wrapper.connection.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn('Error applying pending ICE candidate:', e);
              }
            }
            wrapper.pendingIceCandidates = [];
          }
        }
      } catch (err) {
        console.warn('Error handling answer:', err);
      }
    } else if (sig.type === 'ice') {
      try {
        if (sig.payload) {
          if (wrapper && wrapper.connection.remoteDescription) {
            await wrapper.connection.addIceCandidate(new RTCIceCandidate(sig.payload));
          } else if (wrapper) {
            // Buffer candidate until remoteDescription is set!
            wrapper.pendingIceCandidates.push(sig.payload);
          }
        }
      } catch (err) {
        console.warn('Error adding ICE candidate:', err);
      }
    }
  }

  private setupPeerConnection(pc: RTCPeerConnection, wrapper: PeerConnectionWrapper) {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingClient.sendSignal(wrapper.peerId, 'ice', event.candidate.toJSON());
      }
    };

    pc.ondatachannel = (event) => {
      wrapper.dataChannel = event.channel;
      this.setupDataChannel(event.channel, wrapper);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(wrapper.peerId);
      }
    };
  }

  private setupDataChannel(dc: RTCDataChannel, wrapper: PeerConnectionWrapper) {
    dc.onopen = () => {
      if (!this.remotePlayers.has(wrapper.peerId)) {
        this.remotePlayers.set(wrapper.peerId, {
          id: wrapper.peerId,
          name: wrapper.peerName,
          room: this.currentRoomId || 'SU_A01',
          x: 220,
          y: 450,
          vx: 0,
          vy: 0,
          width: 24,
          height: 38,
          facingRight: true,
          state: 'normal',
          stunTimer: 0,
          hp: 1,
          maxHp: 1,
          heldItem: null,
          crouching: false,
          isClimbing: false,
          isGrounded: true,
          lastUpdateTimestamp: Date.now(),
          pingMs: 25,
          head: { x: 220, y: 430 },
          chest: { x: 220, y: 445 },
          hips: { x: 220, y: 460 },
          tail: Array.from({ length: 9 }, (_, i) => ({ x: 220, y: 460 + i * 5 }))
        });
        this.notifyPeerList();
      }

      // Automatically request or trigger authoritative world item sync on channel ready
      if (!this.isRoomHost) {
        this.sendPacketToPeer(wrapper.peerId, {
          type: 'REQUEST_ITEMS_SYNC',
          senderId: this.localPlayerId,
          room: this.currentRoomId || 'SU_A01'
        });
      } else {
        // As host, notify local packet listeners so OutskirtsLocation immediately transmits current items
        this.packetHandlers.forEach(h => h({
          type: 'REQUEST_ITEMS_SYNC',
          senderId: wrapper.peerId,
          room: this.currentRoomId || 'SU_A01'
        }));
      }
    };

    dc.onmessage = (event) => {
      try {
        const packet: NetworkPacket = JSON.parse(event.data);
        this.handleIncomingPacket(packet);
      } catch {
        // Bad packet ignored
      }
    };

    dc.onclose = () => {
      this.removePeer(wrapper.peerId);
    };

    dc.onerror = () => {
      this.removePeer(wrapper.peerId);
    };
  }

  private handleIncomingPacket(packet: NetworkPacket) {
    if (packet.type === 'PING') {
      this.sendPacketToPeer(packet.senderId, {
        type: 'PONG',
        senderId: this.localPlayerId,
        originalTimestamp: packet.timestamp
      });
      return;
    }

    if (packet.type === 'PONG') {
      const wrapper = this.peers.get(packet.senderId);
      if (wrapper) {
        wrapper.pingMs = Math.max(1, Math.round(Date.now() - packet.originalTimestamp));
        const rp = this.remotePlayers.get(packet.senderId);
        if (rp) rp.pingMs = wrapper.pingMs;
      }
      return;
    }

    if (packet.type === 'PLAYER_STATE') {
      let rp = this.remotePlayers.get(packet.senderId);
      const safeX = Number.isFinite(packet.x) ? packet.x : 220;
      const safeY = Number.isFinite(packet.y) ? packet.y : 450;
      const safeVx = Number.isFinite(packet.vx) ? packet.vx : 0;
      const safeVy = Number.isFinite(packet.vy) ? packet.vy : 0;
      const safeHead = (packet.head && Number.isFinite(packet.head.x) && Number.isFinite(packet.head.y)) 
        ? packet.head 
        : { x: safeX + 12, y: safeY + 6 };
      const safeChest = (packet.chest && Number.isFinite(packet.chest.x) && Number.isFinite(packet.chest.y)) 
        ? packet.chest 
        : { x: safeHead.x, y: safeHead.y + 12 };
      const safeHips = (packet.hips && Number.isFinite(packet.hips.x) && Number.isFinite(packet.hips.y)) 
        ? packet.hips 
        : { x: safeChest.x, y: safeChest.y + 14 };
      const safeTail = (Array.isArray(packet.tail) && packet.tail.length > 0)
        ? packet.tail.map((t, idx) => ({
            x: Number.isFinite(t?.x) ? t.x : safeHips.x,
            y: Number.isFinite(t?.y) ? t.y : safeHips.y + idx * 5
          }))
        : Array.from({ length: 9 }, (_, i) => ({ x: safeHips.x, y: safeHips.y + i * 5 }));

      if (!rp) {
        rp = {
          id: packet.senderId,
          name: `Слимакокіт-${packet.senderId.slice(-4)}`,
          room: packet.room || 'SU_A01',
          x: safeX,
          y: safeY,
          vx: safeVx,
          vy: safeVy,
          width: 24,
          height: 38,
          facingRight: !!packet.facingRight,
          state: packet.state || 'normal',
          stunTimer: Number.isFinite(packet.stunTimer) ? packet.stunTimer : 0,
          hp: Number.isFinite(packet.hp) ? packet.hp : 1,
          maxHp: 1,
          heldItem: packet.heldItem,
          crouching: !!packet.crouching,
          isClimbing: !!packet.isClimbing,
          isGrounded: !!packet.isGrounded,
          lastUpdateTimestamp: Date.now(),
          pingMs: 25,
          head: safeHead,
          chest: safeChest,
          hips: safeHips,
          tail: safeTail
        };
        this.remotePlayers.set(packet.senderId, rp);
        this.notifyPeerList();
      } else {
        rp.room = packet.room || rp.room;
        rp.x = safeX;
        rp.y = safeY;
        rp.vx = safeVx;
        rp.vy = safeVy;
        rp.width = 24;
        rp.height = 38;
        rp.facingRight = !!packet.facingRight;
        rp.state = packet.state || 'normal';
        rp.stunTimer = Number.isFinite(packet.stunTimer) ? packet.stunTimer : 0;
        rp.hp = Number.isFinite(packet.hp) ? packet.hp : 1;
        rp.heldItem = packet.heldItem;
        rp.crouching = !!packet.crouching;
        rp.isClimbing = !!packet.isClimbing;
        rp.isGrounded = !!packet.isGrounded;
        rp.head = safeHead;
        rp.chest = safeChest;
        rp.hips = safeHips;
        rp.tail = safeTail;
        rp.lastUpdateTimestamp = Date.now();
      }
    }

    // Forward packet to all registered listeners (e.g. hit-reg, combat, mob-sync)
    this.packetHandlers.forEach(h => h(packet));
  }

  public broadcastPacket(packet: NetworkPacket) {
    const raw = JSON.stringify(packet);
    // Send over WebRTC DataChannels
    for (const wrapper of this.peers.values()) {
      if (wrapper.dataChannel && wrapper.dataChannel.readyState === 'open') {
        try {
          wrapper.dataChannel.send(raw);
        } catch {
          // Packet loss tolerance
        }
      }
    }
    // Also broadcast to local channel (for same-machine multi-tab play)
    if (this.localBroadcastChannel && this.currentRoomId) {
      try {
        this.localBroadcastChannel.postMessage({
          roomId: this.currentRoomId,
          packet
        });
      } catch {}
    }
  }

  public broadcastPlayerState(data: any) {
    this.broadcastPacket({
      type: 'PLAYER_STATE',
      senderId: this.localPlayerId,
      timestamp: Date.now(),
      ...data
    });
  }

  public sendPacketToPeer(peerId: string, packet: NetworkPacket) {
    const wrapper = this.peers.get(peerId);
    if (wrapper?.dataChannel && wrapper.dataChannel.readyState === 'open') {
      try {
        wrapper.dataChannel.send(JSON.stringify(packet));
      } catch {
        // Drop safely
      }
    }
  }

  private removePeer(peerId: string) {
    const wrapper = this.peers.get(peerId);
    if (wrapper) {
      try {
        wrapper.dataChannel?.close();
        wrapper.connection.close();
      } catch {}
      this.peers.delete(peerId);
    }
    this.remotePlayers.delete(peerId);
    this.notifyPeerList();
  }

  private notifyPeerList() {
    const list = Array.from(this.remotePlayers.values());
    this.peerListHandlers.forEach(h => h(list));
  }

  private startPingMonitor() {
    this.pingIntervalId = setInterval(() => {
      const now = Date.now();
      for (const wrapper of this.peers.values()) {
        if (wrapper.dataChannel && wrapper.dataChannel.readyState === 'open') {
          this.sendPacketToPeer(wrapper.peerId, {
            type: 'PING',
            senderId: this.localPlayerId,
            timestamp: now
          });
        }
      }
    }, 2500);
  }

  public getConnectedPeerCount(): number {
    return Math.max(this.peers.size, this.remotePlayers.size);
  }

  public getAveragePing(): number {
    if (this.peers.size === 0) return 0;
    let sum = 0;
    for (const p of this.peers.values()) {
      sum += p.pingMs;
    }
    return Math.round(sum / this.peers.size);
  }

  public disconnect() {
    signalingClient.leaveRoom();
    signalingClient.stopPolling();

    for (const wrapper of this.peers.values()) {
      try {
        wrapper.dataChannel?.close();
        wrapper.connection.close();
      } catch {}
    }
    this.peers.clear();
    this.remotePlayers.clear();
    this.currentRoomId = null;
    this.isRoomHost = false;
    this.setStatus('disconnected');
    this.notifyPeerList();
  }
}

export const webRTCManager = new WebRTCManager();
