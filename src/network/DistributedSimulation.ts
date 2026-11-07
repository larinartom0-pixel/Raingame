// Distributed World Simulation & Client-Side Hit Registration
// "Кожен — хост своєї локації" & "Favor the Shooter" Hit-Reg Engine

import { webRTCManager } from './WebRTCManager';
import { NetworkPacket } from './types';
import { soundEngine } from '../components/RainWorldSynth';

export interface HitResult {
  attackerId: string;
  targetId: string;
  damage: number;
  stunDuration: number;
  weaponType: 'spear' | 'rock';
  impactX: number;
  impactY: number;
}

export class DistributedSimulationManager {
  // Room code -> Host Player ID
  private roomHosts: Map<string, string> = new Map();
  public currentRoom: string = 'SU_A01';
  public isClientDummyMode: boolean = false;

  private onHitReceivedHandlers: Set<(hit: HitResult) => void> = new Set();
  private onHostChangedHandlers: Set<(room: string, hostId: string) => void> = new Set();

  constructor() {
    this.setupNetworkListeners();
  }

  private setupNetworkListeners() {
    webRTCManager.onPacket((packet: NetworkPacket) => {
      if (packet.type === 'CLAIM_ROOM_HOST') {
        this.roomHosts.set(packet.roomName, packet.playerId);
        this.onHostChangedHandlers.forEach(h => h(packet.roomName, packet.playerId));
      } else if (packet.type === 'ROOM_CHANGE') {
        // If the player who left was host of that room, clear or handover
        if (this.roomHosts.get(packet.fromRoom) === packet.playerId) {
          this.roomHosts.delete(packet.fromRoom);
        }
      } else if (packet.type === 'HIT_CONFIRM') {
        // If I am the target of this hit, apply damage and play concussion/stun
        if (packet.targetId === webRTCManager.localPlayerId) {
          const hit: HitResult = {
            attackerId: packet.attackerId,
            targetId: packet.targetId,
            damage: packet.damage,
            stunDuration: packet.stunDuration,
            weaponType: packet.itemType,
            impactX: packet.impactX,
            impactY: packet.impactY
          };
          this.onHitReceivedHandlers.forEach(h => h(hit));
        }
      }
    });
  }

  public onHitReceived(handler: (hit: HitResult) => void): () => void {
    this.onHitReceivedHandlers.add(handler);
    return () => this.onHitReceivedHandlers.delete(handler);
  }

  public onHostChanged(handler: (room: string, hostId: string) => void): () => void {
    this.onHostChangedHandlers.add(handler);
    return () => this.onHostChangedHandlers.delete(handler);
  }

  public setCurrentRoom(roomName: string) {
    this.enterRoom(roomName);
  }

  public enterRoom(roomName: string) {
    const prevRoom = this.currentRoom;
    this.currentRoom = roomName;

    // Check if room has an existing host
    const currentHost = this.roomHosts.get(roomName);
    if (!currentHost || currentHost === webRTCManager.localPlayerId) {
      if (!this.isClientDummyMode) {
        // I am first here! Claim host advantage (0ms ping to this room)
        this.roomHosts.set(roomName, webRTCManager.localPlayerId);
        webRTCManager.broadcastPacket({
          type: 'CLAIM_ROOM_HOST',
          playerId: webRTCManager.localPlayerId,
          roomName
        });
      }
    }

    // Broadcast room transition to peers
    webRTCManager.broadcastPacket({
      type: 'ROOM_CHANGE',
      playerId: webRTCManager.localPlayerId,
      fromRoom: prevRoom,
      toRoom: roomName
    });
  }

  public isLocalHostOfRoom(roomName: string = this.currentRoom): boolean {
    if (this.isClientDummyMode) return false;
    // If we created the room, we are definitely the host
    if (webRTCManager.isRoomHost) return true;
    // If not connected to any room (solo play), we are the local authority
    if (!webRTCManager.currentRoomId) return true;
    // If connected to someone else's room, check if authority was explicitly assigned
    const host = this.roomHosts.get(roomName);
    return host === webRTCManager.localPlayerId;
  }

  public setClientDummyMode(enabled: boolean) {
    this.isClientDummyMode = enabled;
    if (enabled && this.isLocalHostOfRoom(this.currentRoom)) {
      this.roomHosts.delete(this.currentRoom);
      // Let another peer in this room pick up host duties
      const peersInSameRoom = Array.from(webRTCManager.remotePlayers.values()).filter(
        p => p.room === this.currentRoom
      );
      if (peersInSameRoom.length > 0) {
        const nextHost = peersInSameRoom[0].id;
        this.roomHosts.set(this.currentRoom, nextHost);
        webRTCManager.broadcastPacket({
          type: 'CLAIM_ROOM_HOST',
          playerId: nextHost,
          roomName: this.currentRoom
        });
      }
    }
  }

  // Client-Side Hit Registration ("Favor the Shooter")
  // Invoked locally by the attacking player when their thrown spear/rock overlaps a remote player's hitbox
  public registerClientSideHit(
    targetId: string,
    itemType: 'spear' | 'rock',
    impactX: number,
    impactY: number
  ): boolean {
    const damage = itemType === 'spear' ? 1.0 : 0.01;
    const stunDuration = itemType === 'spear' ? 1.8 : 1.2;

    // 1. Play immediate local impact audio & visual feedback
    soundEngine.playHit(itemType);

    // 2. Broadcast authoritative hit packet to target peer
    webRTCManager.broadcastPacket({
      type: 'HIT_CONFIRM',
      attackerId: webRTCManager.localPlayerId,
      targetId,
      itemType,
      damage,
      stunDuration,
      impactX,
      impactY,
      room: this.currentRoom
    });

    return true;
  }
}

export const distributedSimulation = new DistributedSimulationManager();
