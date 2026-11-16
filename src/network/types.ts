// WebRTC Multiplayer Types and Protocols for Rain World P2P
import type { SlugcatCharacterId } from '../types';

export interface RemotePlayer {
  id: string;
  name: string;
  characterId?: SlugcatCharacterId;
  room: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingRight: boolean;
  state: 'normal' | 'stunned' | 'dead' | 'sleeping';
  stunTimer: number;
  hp: number;
  maxHp: number;
  heldItem: 'spear' | 'rock' | 'berry' | null;
  crouching: boolean;
  isClimbing: boolean;
  isGrounded: boolean;
  lastUpdateTimestamp: number;
  pingMs: number;

  // Piggyback carrying mechanic
  carriedBy?: string | null;
  carryingPeerId?: string | null;

  // Visual skeleton positions for smooth procedural rendering
  width?: number;
  height?: number;
  head: { x: number; y: number };
  chest: { x: number; y: number };
  hips: { x: number; y: number };
  tail: Array<{ x: number; y: number }>;
  earSway?: number;
  blinkTimer?: number;
  ragdollAngle?: number;
}

export interface RoomInfo {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  version?: string;
  playerCount: number;
  maxPlayers: number;
  cycleDurationSeconds: number;
  cycleRemainingSeconds: number;
  createdAt: number;
  friendlyFire: boolean;
}

export type NetworkPacket = 
  | {
      type: 'PLAYER_STATE';
      senderId: string;
      clientVersion?: string;
      characterId?: SlugcatCharacterId;
      room: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      facingRight: boolean;
      state: 'normal' | 'stunned' | 'dead' | 'sleeping';
      stunTimer: number;
      hp: number;
      heldItem: 'spear' | 'rock' | 'berry' | null;
      crouching: boolean;
      isClimbing: boolean;
      isGrounded: boolean;
      carriedBy?: string | null;
      carryingPeerId?: string | null;
      head: { x: number; y: number };
      chest: { x: number; y: number };
      hips: { x: number; y: number };
      tail: Array<{ x: number; y: number }>;
      timestamp: number;
    }
  | {
      type: 'THROW_ITEM';
      senderId: string;
      itemId?: string;
      itemType: 'spear' | 'rock' | 'berry';
      startX?: number;
      startY?: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      rotation?: number;
      room: string;
    }
  | {
      type: 'ITEM_PICKUP';
      senderId: string;
      itemId: string;
      itemType: 'spear' | 'rock' | 'berry';
      x: number;
      y: number;
      room: string;
    }
  | {
      type: 'ITEM_DROP';
      senderId: string;
      itemId: string;
      itemType: 'spear' | 'rock' | 'berry';
      x: number;
      y: number;
      vx: number;
      vy: number;
      room: string;
    }
  | {
      type: 'ITEM_CONSUMED';
      senderId: string;
      itemId: string;
      room: string;
    }
  | {
      type: 'REQUEST_ITEMS_SYNC';
      senderId: string;
      room: string;
      clientVersion?: string;
    }
  | {
      type: 'ITEMS_SYNC';
      senderId: string;
      room: string;
      items: Array<{
        id: string;
        type: 'spear' | 'rock' | 'berry';
        x: number;
        y: number;
        vx: number;
        vy: number;
        rotation?: number;
        isHeld: boolean;
        heldBy?: string;
        isStuck: boolean;
        stuckTarget?: 'player' | 'npc' | string;
        isAirborne: boolean;
      }>;
    }
  | {
      type: 'HIT_CONFIRM';
      attackerId: string;
      targetId: string;
      itemType: 'spear' | 'rock';
      damage: number;
      stunDuration: number;
      impactX: number;
      impactY: number;
      room: string;
    }
  | {
      type: 'ROOM_CHANGE';
      playerId: string;
      fromRoom: string;
      toRoom: string;
    }
  | {
      type: 'CLAIM_ROOM_HOST';
      playerId: string;
      roomName: string;
    }
  | {
      type: 'MOB_SYNC';
      room: string;
      hostId: string;
      mobX: number;
      mobY: number;
      mobVx: number;
      mobVy: number;
      mobHp: number;
      mobState: 'normal' | 'stunned' | 'dead';
      mobStunTimer: number;
    }
  | {
      type: 'CYCLE_SYNC';
      hostId: string;
      cycleRemainingSeconds: number;
      isRainFlooding: boolean;
    }
  | {
      type: 'PING';
      senderId: string;
      timestamp: number;
    }
  | {
      type: 'PONG';
      senderId: string;
      originalTimestamp: number;
    }
  | {
      type: 'PVP_COMBAT_TRIGGER';
      senderId: string;
      targetId: string;
      room: string;
    }
  | {
      type: 'LIZARDS_SYNC';
      senderId: string;
      timestamp: number;
      lizards: Array<{
        id: string;
        roomId: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        hp: number;
        maxHp: number;
        state: string;
        stunTimer: number;
        facingRight: boolean;
        grabbedTarget: 'player' | 'corpse' | 'peer' | null;
        grabbedPeerId: string | null;
        jawOpen: number;
        isClimbing: boolean;
        pipeTransit: {
          fromX: number;
          fromY: number;
          toX: number;
          toY: number;
          progress: number;
        } | null;
      }>;
    }
  | {
      type: 'LIZARD_HIT';
      senderId: string;
      lizardId: string;
      room: string;
      weaponType: 'spear' | 'rock';
      damage: number;
      stunDuration: number;
      knockbackVx: number;
      knockbackVy: number;
    }
  | {
      type: 'LIZARD_BITE_PEER';
      senderId: string;
      targetId: string;
      lizardId: string;
      room: string;
      damage: number;
      stunDuration: number;
      grabbed: boolean;
    }
  | {
      type: 'REQUEST_WORLD_SYNC';
      senderId: string;
      room: string;
      clientVersion?: string;
    }
  | {
      type: 'VERSION_REJECT';
      senderId: string;
      requiredVersion: string;
      reason: string;
    };
