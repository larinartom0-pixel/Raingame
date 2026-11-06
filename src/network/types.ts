// WebRTC Multiplayer Types and Protocols for Rain World P2P

export interface RemotePlayer {
  id: string;
  name: string;
  room: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingRight: boolean;
  state: 'normal' | 'stunned' | 'dead';
  stunTimer: number;
  hp: number;
  maxHp: number;
  heldItem: 'spear' | 'rock' | 'berry' | null;
  crouching: boolean;
  isClimbing: boolean;
  isGrounded: boolean;
  lastUpdateTimestamp: number;
  pingMs: number;

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
      room: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      facingRight: boolean;
      state: 'normal' | 'stunned' | 'dead';
      stunTimer: number;
      hp: number;
      heldItem: 'spear' | 'rock' | 'berry' | null;
      crouching: boolean;
      isClimbing: boolean;
      isGrounded: boolean;
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
    };
