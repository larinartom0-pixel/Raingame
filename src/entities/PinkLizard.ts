// Authentic Rain World Pink Lizard (Розовий ящер)
// Graph-based Platform/Pole/Pipe Pathfinding, Quadruped Anatomy, Bite & Drag Mechanics & Authoritative Sync
import { findNextGraphWaypoint, doesSegmentCrossAnyWall, NavWaypoint } from '../world/navGraph';

export interface LizardLimb {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  liftProgress: number; // 0 to 1 during step
  planted: boolean;
}

export interface LizardDen {
  x: number;
  y: number;
  w: number;
  h: number;
  spawnX: number;
  spawnY: number;
}

export type LizardState =
  | 'patrol'
  | 'hunt'
  | 'drag_prey'
  | 'drag_corpse'
  | 'entering_den'
  | 'leaving_den'
  | 'stunned'
  | 'dead';

export interface LizardPipeTransit {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  duration: number;
  targetLocationId?: string;
  targetSpawnX?: number;
  targetSpawnY?: number;
}

export interface LizardNetworkSnapshot {
  id: string;
  roomId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  state: LizardState;
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
}

type PlatformInput = { x: number; y: number; w: number; h: number; type: string; id?: string; label?: string };
type PoleInput = { x: number; yMin: number; yMax: number };
type PipeInput = {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  targetLocationId?: string;
  targetSpawnX?: number;
  targetSpawnY?: number;
  isDenPipe?: boolean;
  isShelterPipe?: boolean;
  label?: string;
};

export class PinkLizard {
  public id: string;
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public width: number = 52;
  public height: number = 24;

  public hp: number = 3.5;
  public maxHp: number = 3.5;
  public state: LizardState = 'patrol';
  public stunTimer: number = 0;
  public facingRight: boolean = true;
  public isClimbing: boolean = false;
  public isGrounded: boolean = false;
  public biteCooldown: number = 0;

  public pipeTransit: LizardPipeTransit | null = null;
  public pipeCooldown: number = 0;

  public grabbedTarget: 'player' | 'corpse' | 'peer' | null = null;
  public grabbedPeerId: string | null = null;

  // Autonomous Territory Exploration & Senses
  public patrolTargetX: number = 500;
  public patrolTargetY: number = 300;
  public patrolTargetPipeId: string | null = null;
  public patrolTimer: number = 0;
  public stuckTimer: number = 0;
  public lastX: number = 0;
  public lastY: number = 0;
  public hissTimer: number = 0;
  public lostPlayerTimer: number = 0;

  // Pathfinding state
  private activeWaypoint: NavWaypoint | null = null;
  private pathRecalcTimer: number = 0;
  private cachedTargetX: number = 0;
  private cachedTargetY: number = 0;

  // Client-side multiplayer interpolation targets
  private netTargetX: number | null = null;
  private netTargetY: number | null = null;

  // Procedural spine vertebrae (head to tail base)
  public spine: Array<{ x: number; y: number; angle: number }> = [];
  public limbs: LizardLimb[] = [];
  public tail: Array<{ x: number; y: number }> = [];
  public jawOpen: number = 0;

  constructor(id: string, startX: number, startY: number) {
    this.id = id;
    this.x = startX;
    this.y = startY;
    this.resetProceduralPose(startX, startY);
  }

  public resetProceduralPose(posX: number, posY: number) {
    this.spine = [];
    for (let i = 0; i < 5; i++) {
      this.spine.push({ x: posX - i * 11, y: posY + 12, angle: 0 });
    }
    this.limbs = [];
    for (let i = 0; i < 4; i++) {
      this.limbs.push({
        x: posX,
        y: posY + 24,
        targetX: posX,
        targetY: posY + 24,
        liftProgress: 1,
        planted: true
      });
    }
    this.tail = [];
    for (let i = 0; i < 7; i++) {
      this.tail.push({ x: posX - (50 + i * 8), y: posY + 12 });
    }
  }

  public takeDamage(amount: number, stunDuration: number) {
    if (this.state === 'dead') return;

    this.hp = Math.max(0, this.hp - amount);
    this.stunTimer = Math.max(this.stunTimer, stunDuration);
    this.state = this.hp <= 0 ? 'dead' : 'stunned';

    if (this.grabbedTarget) {
      this.grabbedTarget = null;
      this.grabbedPeerId = null;
    }
  }

  // Export compact authoritative network state
  public toNetworkSnapshot(roomId: string): LizardNetworkSnapshot {
    return {
      id: this.id,
      roomId,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      vx: Math.round(this.vx * 100) / 100,
      vy: Math.round(this.vy * 100) / 100,
      hp: Math.round(this.hp * 100) / 100,
      maxHp: this.maxHp,
      state: this.state,
      stunTimer: Math.round(this.stunTimer * 10) / 10,
      facingRight: this.facingRight,
      grabbedTarget: this.grabbedTarget,
      grabbedPeerId: this.grabbedPeerId,
      jawOpen: Math.round(this.jawOpen * 100) / 100,
      isClimbing: this.isClimbing,
      pipeTransit: this.pipeTransit
        ? {
            fromX: this.pipeTransit.fromX,
            fromY: this.pipeTransit.fromY,
            toX: this.pipeTransit.toX,
            toY: this.pipeTransit.toY,
            progress: Math.round(this.pipeTransit.progress * 100) / 100
          }
        : null
    };
  }

  // Apply authoritative host snapshot on non-host multiplayer clients (no jumping/teleporting)
  public applyNetworkSnapshot(snap: LizardNetworkSnapshot, roomChanged: boolean) {
    this.hp = snap.hp;
    this.maxHp = snap.maxHp;
    this.state = snap.state;
    this.stunTimer = snap.stunTimer;
    this.facingRight = snap.facingRight;
    this.grabbedTarget = snap.grabbedTarget;
    this.grabbedPeerId = snap.grabbedPeerId;
    this.jawOpen = snap.jawOpen;
    this.isClimbing = snap.isClimbing;
    this.vx = snap.vx;
    this.vy = snap.vy;

    if (snap.pipeTransit) {
      this.pipeTransit = {
        fromX: snap.pipeTransit.fromX,
        fromY: snap.pipeTransit.fromY,
        toX: snap.pipeTransit.toX,
        toY: snap.pipeTransit.toY,
        progress: snap.pipeTransit.progress,
        duration: 1.3
      };
      this.x = snap.x;
      this.y = snap.y;
      this.netTargetX = null;
      this.netTargetY = null;
    } else {
      const wasInPipe = !!this.pipeTransit;
      this.pipeTransit = null;
      const dist = Math.hypot(snap.x - this.x, snap.y - this.y);
      if (roomChanged || wasInPipe || dist > 220) {
        this.x = snap.x;
        this.y = snap.y;
        this.netTargetX = null;
        this.netTargetY = null;
        if (roomChanged || dist > 220) {
          this.resetProceduralPose(this.x, this.y);
        }
      } else {
        this.netTargetX = snap.x;
        this.netTargetY = snap.y;
      }
    }
    this.updateProceduralBody();
  }

  // Smooth client-side tick between LIZARDS_SYNC packets
  public interpolateClient(delta: number) {
    if (this.pipeTransit) {
      this.pipeTransit.progress = Math.min(1, this.pipeTransit.progress + delta / this.pipeTransit.duration);
      const p = this.pipeTransit.progress;
      this.x = this.pipeTransit.fromX + (this.pipeTransit.toX - this.pipeTransit.fromX) * p - this.width / 2;
      this.y = this.pipeTransit.fromY + (this.pipeTransit.toY - this.pipeTransit.fromY) * p - this.height / 2;
    } else if (this.netTargetX !== null && this.netTargetY !== null) {
      const blend = Math.min(1, delta * 14);
      this.x += (this.netTargetX - this.x) * blend + this.vx * delta * 6;
      this.y += (this.netTargetY - this.y) * blend + this.vy * delta * 6;
    }
    this.updateProceduralBody();
  }

  // Trigger visible emergence animation when entering a room through a pipe
  public startPipeEmergence(fromX: number, fromY: number, toX: number, toY: number, duration: number = 0.85) {
    this.pipeTransit = {
      fromX,
      fromY,
      toX,
      toY,
      progress: 0,
      duration
    };
    this.pipeCooldown = Math.max(this.pipeCooldown, 5.0);
    this.biteCooldown = Math.max(this.biteCooldown, 1.5);
    this.x = fromX - this.width / 2;
    this.y = fromY - this.height / 2;
    this.vx = 0;
    this.vy = 0;
    this.facingRight = toX >= fromX;
    this.activeWaypoint = null;
    this.resetProceduralPose(this.x, this.y);
  }

  public update(
    delta: number,
    player: {
      x: number;
      y: number;
      vx?: number;
      vy?: number;
      width: number;
      height: number;
      hp: number;
      state: string;
      stunTimer: number;
      isGrounded: boolean;
      biteGrabImmunity?: boolean;
      attackerStunOnGrabAttempt?: number;
      isPipeProtected?: boolean;
    } | null,
    remotePeers: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      vx?: number;
      vy?: number;
      hp: number;
      state: string;
      room: string;
      biteGrabImmunity?: boolean;
      attackerStunOnGrabAttempt?: number;
    }>,
    platforms: PlatformInput[],
    poles: PoleInput[],
    den: LizardDen | null,
    onPlayerBitten: (damage: number, grabbed: boolean) => void,
    onPlayerEatenInDen: () => void,
    onPeerBitten?: (peerId: string, damage: number, grabbed: boolean) => void,
    pipes?: PipeInput[],
    onLizardChangedRoom?: (targetRoomId: string, spawnX?: number, spawnY?: number) => void,
    onPreyDepositedInDen?: () => void,
    worldBounds?: { width: number; height: number; roomId?: string }
  ) {
    const worldW = worldBounds?.width ?? 1200;
    const worldH = worldBounds?.height ?? 640;
    const roomKey = worldBounds?.roomId ?? 'room-default';

    if (this.state === 'dead') {
      this.vy += 0.42;
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.88;
      for (const plat of platforms) {
        if (this.x + this.width > plat.x && this.x < plat.x + plat.w) {
          if (this.y + this.height >= plat.y && this.y + this.height - this.vy <= plat.y + 10) {
            this.y = plat.y - this.height;
            this.vy = 0;
            break;
          }
        }
      }
      this.clampToWorld(worldW, worldH);
      this.updateProceduralBody();
      return;
    }

    // Pipe Conduit Transit animation
    if (this.pipeTransit) {
      this.pipeTransit.progress += delta / this.pipeTransit.duration;
      const p = Math.min(1, this.pipeTransit.progress);
      const curX = this.pipeTransit.fromX + (this.pipeTransit.toX - this.pipeTransit.fromX) * p;
      const curY = this.pipeTransit.fromY + (this.pipeTransit.toY - this.pipeTransit.fromY) * p;

      this.x = curX - this.width / 2;
      this.y = curY - this.height / 2;
      this.vx = 0;
      this.vy = 0;
      this.isClimbing = true;

      if (this.grabbedTarget === 'player' && player) {
        player.x = curX - player.width / 2;
        player.y = curY - player.height / 2;
      }

      if (p >= 1) {
        if (this.pipeTransit.targetLocationId) {
          const targetRoom = this.pipeTransit.targetLocationId;
          const spX = this.pipeTransit.targetSpawnX;
          const spY = this.pipeTransit.targetSpawnY;
          this.pipeTransit = null;
          this.pipeCooldown = 4.5;
          this.isClimbing = false;
          this.activeWaypoint = null;
          if (this.state === 'leaving_den') {
            this.state = 'patrol';
            this.patrolTimer = 7.0;
            this.patrolTargetX = spX ? (spX > 500 ? spX - 240 : spX + 240) : 500;
            this.patrolTargetY = spY ?? 300;
          }
          onLizardChangedRoom?.(targetRoom, spX, spY);
          return;
        }

        // Intraroom shortcut pipe exit
        const exitDir = this.pipeTransit.toX > this.pipeTransit.fromX ? 1 : -1;
        this.x = this.pipeTransit.toX - this.width / 2 + exitDir * 10;
        this.y = this.pipeTransit.toY - this.height / 2;
        this.vx = exitDir * 3.8;
        this.vy = -2.2;
        this.isClimbing = false;
        this.pipeTransit = null;
        this.pipeCooldown = 3.5;
        this.activeWaypoint = null;
      }

      this.updateProceduralBody();
      return;
    }

    if (this.pipeCooldown > 0) {
      this.pipeCooldown -= delta;
    }

    // Stun Recovery
    if (this.state === 'stunned') {
      this.stunTimer -= delta;
      if (this.stunTimer <= 0) {
        this.stunTimer = 0;
        this.state = 'patrol';
      } else {
        this.vx *= 0.9;
        this.applyGravityAndCollisions(platforms);
        this.clampToWorld(worldW, worldH);
        this.updateProceduralBody();
        return;
      }
    }

    // Drop target if no longer valid
    if (this.grabbedTarget === 'player' && !player) {
      this.grabbedTarget = null;
    }
    if (this.grabbedTarget === 'peer') {
      const grabbedPeer = remotePeers.find(p => p.id === this.grabbedPeerId);
      if (!grabbedPeer || grabbedPeer.state === 'sleeping') {
        this.grabbedTarget = null;
        this.grabbedPeerId = null;
      }
    }

    const isInsideDenRoom = platforms.some(p => p.id === 'den-floor' || p.label === 'ДНО ЛІГВА');

    // Drag prey pinned to lizard's jaws
    if (this.grabbedTarget === 'player' || this.grabbedTarget === 'corpse') {
      if (player) {
        const mouthOffsetX = this.facingRight ? this.width - 2 : -10;
        player.x = this.x + mouthOffsetX;
        player.y = this.y + 4;
        player.vx = this.vx;
        player.vy = this.vy;

        if (this.grabbedTarget === 'player' && player.stunTimer <= 0) {
          this.grabbedTarget = null;
          this.state = 'patrol';
        }
      } else {
        this.grabbedTarget = null;
      }

      if (isInsideDenRoom && this.grabbedTarget) {
        const nestX = 430;
        const nestY = 380;
        const distToNest = Math.hypot(this.x + this.width / 2 - nestX, this.y + this.height / 2 - nestY);
        if (distToNest < 48 || (this.x > 360 && this.isGrounded && this.y > 320)) {
          this.grabbedTarget = null;
          this.grabbedPeerId = null;
          if (player) {
            player.x = nestX - player.width / 2;
            player.y = nestY - player.height / 2;
            player.vx = 0;
            player.vy = 0;
          }
          this.jawOpen = 0.45;
          this.state = 'leaving_den';
          this.biteCooldown = 6.0;
          this.pipeCooldown = 0;
          this.patrolTimer = 6.0;
          const exitPipe = pipes?.find(p => p.id === 'den-exit-pipe' || (p.targetLocationId && p.targetLocationId !== 'lizard-den-outskirts'));
          this.patrolTargetX = exitPipe ? exitPipe.startX : 115;
          this.patrolTargetY = exitPipe ? exitPipe.startY : 336;
          this.activeWaypoint = null;
          onPreyDepositedInDen?.();
        }
      } else if (!isInsideDenRoom && den && this.grabbedTarget) {
        // Non-Outskirts regions that use a direct den cavern on platform
        const denPipe = pipes?.find(p => p.targetLocationId === 'lizard-den-outskirts');
        if (!denPipe) {
          const denCx = den.x + den.w / 2;
          const denCy = den.y + den.h / 2;
          const distToDen = Math.hypot(this.x + this.width / 2 - denCx, this.y + this.height / 2 - denCy);
          if (distToDen < 45 && player) {
            player.x = denCx - player.width / 2;
            player.y = den.y + den.h - player.height;
            player.vx = 0;
            player.vy = 0;
            this.grabbedTarget = null;
            this.state = 'leaving_den';
            this.biteCooldown = 6.0;
            this.patrolTimer = 4.0;
            this.patrolTargetX = den.spawnX ?? Math.max(80, den.x - 160);
            this.patrolTargetY = den.spawnY ?? denCy;
            onPlayerEatenInDen();
            onPreyDepositedInDen?.();
          }
        }
      }
    }

    if (this.biteCooldown > 0) {
      this.biteCooldown -= delta;
    }

    // ---------------- AI TARGET SELECTION & SENSES ----------------
    let targetX = this.patrolTargetX;
    let targetY = this.patrolTargetY;
    let intendedPipeId: string | null = null;
    let pursuitTargetType: 'player' | 'peer' | null = null;
    let pursuitTargetId: string | null = null;

    const denPipe = pipes?.find(p => p.targetLocationId === 'lizard-den-outskirts');
    const exitPipe = pipes?.find(p => p.id === 'den-exit-pipe' || (p.targetLocationId && p.targetLocationId !== 'lizard-den-outskirts'));

    if (this.state === 'leaving_den') {
      if (isInsideDenRoom && exitPipe) {
        targetX = exitPipe.startX;
        targetY = exitPipe.startY;
        intendedPipeId = exitPipe.id;
      } else {
        this.patrolTimer -= delta;
        targetX = this.patrolTargetX;
        targetY = this.patrolTargetY;
        const dExit = Math.hypot(this.x + this.width / 2 - targetX, this.y + this.height / 2 - targetY);
        if (dExit < 45 || this.patrolTimer <= 0) {
          this.state = 'patrol';
          this.patrolTimer = 5.0;
        }
      }
    } else if (this.grabbedTarget === 'player' || this.grabbedTarget === 'corpse' || this.grabbedTarget === 'peer') {
      if (isInsideDenRoom) {
        targetX = 430;
        targetY = 380;
      } else if (denPipe) {
        targetX = denPipe.startX;
        targetY = denPipe.startY;
        intendedPipeId = denPipe.id;
      } else if (den) {
        targetX = den.x + den.w / 2;
        targetY = den.y + den.h / 2;
      }
    } else {
      // Build unified prey candidates (local player + remote peers in this room)
      type CandidatePrey = {
        kind: 'player' | 'peer';
        id: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        state: string;
        dist: number;
      };
      const candidates: CandidatePrey[] = [];
      const lx = this.x + this.width / 2;
      const ly = this.y + this.height / 2;

      if (player && player.state !== 'sleeping' && !player.isPipeProtected) {
        candidates.push({
          kind: 'player',
          id: 'local',
          x: player.x + player.width / 2,
          y: player.y + player.height / 2,
          vx: player.vx ?? 0,
          vy: player.vy ?? 0,
          state: player.state,
          dist: Math.hypot(player.x + player.width / 2 - lx, player.y + player.height / 2 - ly)
        });
      }
      for (const peer of remotePeers) {
        if (peer.state === 'sleeping') continue;
        candidates.push({
          kind: 'peer',
          id: peer.id,
          x: peer.x + 12,
          y: peer.y + 19,
          vx: peer.vx ?? 0,
          vy: peer.vy ?? 0,
          state: peer.state,
          dist: Math.hypot(peer.x + 12 - lx, peer.y + 19 - ly)
        });
      }

      // Priority 1: Dead corpses within 750px
      const corpseCand = candidates
        .filter(c => c.state === 'dead' && c.dist < 750)
        .sort((a, b) => a.dist - b.dist)[0];

      if (corpseCand) {
        targetX = corpseCand.x;
        targetY = corpseCand.y;
        pursuitTargetType = corpseCand.kind;
        pursuitTargetId = corpseCand.id;
        this.state = 'hunt';
      } else {
        // Priority 2: Closest detected living slugcat
        const livingCands = candidates
          .filter(c => c.state !== 'dead')
          .sort((a, b) => a.dist - b.dist);

        const bestPrey = livingCands.find(c => {
          const inFront = (c.x > this.x) === this.facingRight;
          const loud = Math.abs(c.vx) > 1.8 || Math.abs(c.vy) > 1.6;
          return c.dist < 240 || (inFront && c.dist < 560) || (loud && c.dist < 400);
        }) || (this.state === 'hunt' && livingCands[0] && livingCands[0].dist < 760 ? livingCands[0] : undefined);

        if (bestPrey) {
          this.state = 'hunt';
          this.lostPlayerTimer = 5.0;
          targetX = bestPrey.x;
          targetY = bestPrey.y;
          pursuitTargetType = bestPrey.kind;
          pursuitTargetId = bestPrey.id;
        } else {
          if (this.lostPlayerTimer > 0) {
            this.lostPlayerTimer -= delta;
          } else {
            this.state = 'patrol';
          }

          this.patrolTimer -= delta;
          if (
            this.patrolTimer <= 0 ||
            Math.hypot(lx - this.patrolTargetX, ly - this.patrolTargetY) < 40
          ) {
            this.patrolTargetPipeId = null;
            // Pick an intentional walkable platform / pole / inter-room tunnel to explore
            const navPipes = (pipes || []).filter(p => !p.isShelterPipe && !(p.isDenPipe && !isInsideDenRoom));
            if (navPipes.length > 0 && this.pipeCooldown <= 0 && Math.random() < 0.22) {
              const chosenPipe = navPipes[Math.floor(Math.random() * navPipes.length)];
              this.patrolTargetX = chosenPipe.startX;
              this.patrolTargetY = chosenPipe.startY;
              this.patrolTargetPipeId = chosenPipe.id;
              this.patrolTimer = 7.0;
            } else {
              const walkablePlats = platforms.filter(p => p.type !== 'wall' && p.w >= 80 && p.y > 40);
              if (walkablePlats.length > 0) {
                const plat = walkablePlats[Math.floor(Math.random() * walkablePlats.length)];
                this.patrolTargetX = plat.x + 30 + Math.random() * Math.max(10, plat.w - 60);
                this.patrolTargetY = plat.y - 12;
                this.patrolTimer = 5.0 + Math.random() * 3.0;
              } else {
                this.patrolTargetX = Math.max(80, Math.min(worldW - 80, this.x + (Math.random() - 0.5) * 400));
                this.patrolTargetY = this.y;
                this.patrolTimer = 4.0;
              }
            }
          }

          targetX = this.patrolTargetX;
          targetY = this.patrolTargetY;
          intendedPipeId = this.patrolTargetPipeId;
        }
      }
    }

    // ---------------- GRAPH PATHFINDING WAYPOINT RESOLUTION ----------------
    const lx = this.x + this.width / 2;
    const ly = this.y + this.height / 2;
    const directDist = Math.hypot(targetX - lx, targetY - ly);
    const solidWallBlockers = platforms
      .filter(p => p.type === 'wall' || p.type === 'shelter' || p.h >= 45)
      .map(p => ({
        x: p.x + 2,
        y: p.type === 'wall' || p.type === 'shelter' ? p.y + 2 : p.y + 10,
        w: Math.max(2, p.w - 4),
        h: Math.max(2, p.h - 12)
      }));
    const hasDirectLine =
      directDist < 175 &&
      Math.abs(targetY - ly) < 42 &&
      !doesSegmentCrossAnyWall(lx, ly, targetX, targetY, solidWallBlockers);

    this.pathRecalcTimer -= delta;
    if (hasDirectLine) {
      this.activeWaypoint = null;
    } else if (
      this.pathRecalcTimer <= 0 ||
      !this.activeWaypoint ||
      Math.hypot(targetX - this.cachedTargetX, targetY - this.cachedTargetY) > 70 ||
      Math.hypot(lx - this.activeWaypoint.x, ly - this.activeWaypoint.y) < 26
    ) {
      this.pathRecalcTimer = 0.22;
      this.cachedTargetX = targetX;
      this.cachedTargetY = targetY;
      this.activeWaypoint = findNextGraphWaypoint(roomKey, lx, ly, targetX, targetY, platforms, poles, pipes);
    }

    const steerX = this.activeWaypoint ? this.activeWaypoint.x : targetX;
    const steerY = this.activeWaypoint ? this.activeWaypoint.y : targetY;
    const activePipeGoal = this.activeWaypoint?.kind === 'pipe' ? this.activeWaypoint.pipeId : intendedPipeId;

    const dx = steerX - lx;
    const dy = steerY - ly;

    if (Math.abs(dx) > 8) {
      this.facingRight = dx > 0;
    }

    // ---------------- INTENTIONAL PIPE ENTRY ONLY ----------------
    // Never suck lizard into random pipes when simply walking past!
    if (pipes && pipes.length > 0 && this.pipeCooldown <= 0 && activePipeGoal) {
      const pipe = pipes.find(p => p.id === activePipeGoal);
      if (pipe && !pipe.isShelterPipe) {
        const dStart = Math.hypot(lx - pipe.startX, ly - pipe.startY);
        const dEnd = Math.hypot(lx - pipe.endX, ly - pipe.endY);

        if (dStart < 42) {
          this.pipeTransit = {
            fromX: pipe.startX,
            fromY: pipe.startY,
            toX: pipe.endX,
            toY: pipe.endY,
            progress: 0,
            duration: 1.25,
            targetLocationId: pipe.targetLocationId,
            targetSpawnX: pipe.targetSpawnX,
            targetSpawnY: pipe.targetSpawnY
          };
          this.patrolTargetPipeId = null;
          this.activeWaypoint = null;
          this.vx = 0;
          this.vy = 0;
          this.updateProceduralBody();
          return;
        } else if (dEnd < 42 && !pipe.targetLocationId) {
          this.pipeTransit = {
            fromX: pipe.endX,
            fromY: pipe.endY,
            toX: pipe.startX,
            toY: pipe.startY,
            progress: 0,
            duration: 1.25
          };
          this.patrolTargetPipeId = null;
          this.activeWaypoint = null;
          this.vx = 0;
          this.vy = 0;
          this.updateProceduralBody();
          return;
        }
      }
    }

    // ---------------- LOCOMOTION, POLE/WALL CLIMBING & STUCK RECOVERY ----------------
    const runSpeed = this.state === 'hunt' ? 5.6 : 3.5;
    const accel = this.state === 'hunt' ? 0.55 : 0.35;

    if (Math.abs(this.x - this.lastX) < 0.7 && Math.abs(this.y - this.lastY) < 0.7 && Math.hypot(dx, dy) > 18) {
      this.stuckTimer += delta;
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = this.x;
    this.lastY = this.y;

    // 1. Pole climbing (guided cleanly by waypoint or elevation difference)
    let nearPole = false;
    const wantsPole =
      this.activeWaypoint?.kind === 'pole' ||
      Math.abs(dy) > 32 ||
      this.stuckTimer > 0.25;

    for (const p of poles) {
      if (Math.abs(lx - p.x) < 34 && this.y + this.height >= p.yMin - 15 && this.y <= p.yMax + 15) {
        if (wantsPole && (!this.activeWaypoint?.poleX || Math.abs(this.activeWaypoint.poleX - p.x) < 20)) {
          nearPole = true;
          this.isClimbing = true;
          this.x += (p.x - lx) * 0.38;
          this.vx *= 0.4;
          if (Math.abs(dy) > 12) {
            this.vy = dy < 0 ? -4.9 : 4.9;
          } else {
            // Reached destination height on pole -> hop onto horizontal platform toward target
            this.vy = 0;
            if (Math.abs(targetX - lx) > 20) {
              this.isClimbing = false;
              this.vx = targetX > lx ? 4.2 : -4.2;
              this.vy = -3.8;
            }
          }
          break;
        }
      }
    }

    // 2. Wall climbing only when stuck or blocked by reachable vertical barrier while needing upward elevation
    let nearWall = false;
    if (!nearPole) {
      for (const plat of platforms) {
        if (plat.type === 'wall' || plat.h >= 60) {
          const xDist = Math.abs(lx - (plat.x + plat.w / 2));
          const yOverlap = this.y + this.height > plat.y + 4 && this.y < plat.y + plat.h;
          const wallTopReachable = this.y - plat.y < 145;
          if (xDist < plat.w / 2 + 18 && yOverlap && wallTopReachable && (dy < -25 || this.stuckTimer > 0.35)) {
            nearWall = true;
            this.isClimbing = true;
            this.vy = dy < 0 || this.stuckTimer > 0.35 ? -4.8 : 4.4;
            break;
          }
        }
      }
    }

    if (!nearPole && !nearWall) {
      this.isClimbing = false;
    }

    // 3. Ground locomotion & intelligent gap/ledge leaping
    if (!this.isClimbing) {
      if (dx > 8) {
        this.vx += accel;
        if (this.vx > runSpeed) this.vx = runSpeed;
      } else if (dx < -8) {
        this.vx -= accel;
        if (this.vx < -runSpeed) this.vx = -runSpeed;
      } else {
        this.vx *= 0.8;
      }

      if (this.isGrounded) {
        if (this.stuckTimer > 0.9) {
          // Force recalculation & pick another route instead of oscillating infinitely
          this.activeWaypoint = null;
          this.pathRecalcTimer = 0;
          this.stuckTimer = 0;
          this.facingRight = !this.facingRight;
          if (this.state === 'patrol') {
            this.patrolTargetX = Math.max(80, Math.min(worldW - 80, lx + (this.facingRight ? 360 : -360)));
            this.patrolTimer = 3.5;
          }
          this.vx = (this.facingRight ? 1 : -1) * 4.0;
          this.vy = -7.2;
          this.isGrounded = false;
        } else if (this.stuckTimer > 0.28 || (this.activeWaypoint?.kind === 'jump' && dy < -18)) {
          this.vy = -8.0;
          this.vx = (dx >= 0 ? 1 : -1) * 4.6;
          this.isGrounded = false;
        } else {
          // Proactive small ledge hop
          for (const plat of platforms) {
            if (plat.type === 'wall' || plat.type === 'shelter') continue;
            const aheadX = this.x + (this.facingRight ? this.width + 16 : -16);
            if (aheadX >= plat.x && aheadX <= plat.x + plat.w) {
              if (this.y + this.height > plat.y && this.y + this.height - plat.y < 70) {
                this.vy = -7.4;
                this.isGrounded = false;
                break;
              }
            }
          }
        }
      }
    }

    this.applyGravityAndCollisions(platforms);
    this.clampToWorld(worldW, worldH);

    // ---------------- BITE & GRAB LOGIC (Player + Remote Peers) ----------------
    // Skip biting briefly right after emerging from a pipe (pipeCooldown > 3.5)
    if (!this.grabbedTarget && this.biteCooldown <= 0 && this.pipeCooldown <= 3.5) {
      const mouthX = this.facingRight ? this.x + this.width : this.x;
      const mouthY = this.y + 12;

      let bitten = false;

      if (
        player &&
        player.state !== 'sleeping' &&
        !player.isPipeProtected &&
        (!pursuitTargetType || pursuitTargetType === 'player')
      ) {
        const distToPlayerMouth = Math.hypot(
          mouthX - (player.x + player.width / 2),
          mouthY - (player.y + player.height / 2)
        );
        if (distToPlayerMouth < 36) {
          this.jawOpen = 0.5;
          const dmg = 0.5 + Math.random() * 1.0;

          if (player.biteGrabImmunity && player.state !== 'dead') {
            // Monk / grab-immune slugcat: deals damage without grabbing, stuns predator for 5 seconds!
            const predatorStun = player.attackerStunOnGrabAttempt ?? 5.0;
            this.grabbedTarget = null;
            this.grabbedPeerId = null;
            this.biteCooldown = predatorStun;
            this.vx = (this.x + this.width / 2 < player.x + player.width / 2 ? -1 : 1) * 4.5;
            this.vy = -3.0;
            this.takeDamage(0, predatorStun);
            onPlayerBitten(dmg, false);
          } else {
            this.biteCooldown = 2.0;
            this.grabbedTarget = player.state === 'dead' ? 'corpse' : 'player';
            this.grabbedPeerId = null;
            onPlayerBitten(dmg, true);
          }
          bitten = true;
        }
      }

      if (!bitten && onPeerBitten) {
        for (const peer of remotePeers) {
          if (peer.state === 'sleeping') continue;
          if (pursuitTargetId && peer.id !== pursuitTargetId && remotePeers.length > 1) continue;
          const distToPeerMouth = Math.hypot(mouthX - (peer.x + 12), mouthY - (peer.y + 19));
          if (distToPeerMouth < 36) {
            this.jawOpen = 0.5;
            const dmg = 0.5 + Math.random() * 1.0;

            if (peer.biteGrabImmunity && peer.state !== 'dead') {
              const predatorStun = peer.attackerStunOnGrabAttempt ?? 5.0;
              this.grabbedTarget = null;
              this.grabbedPeerId = null;
              this.biteCooldown = predatorStun;
              this.vx = (this.x + this.width / 2 < peer.x + 12 ? -1 : 1) * 4.5;
              this.vy = -3.0;
              this.takeDamage(0, predatorStun);
              onPeerBitten(peer.id, dmg, false);
            } else {
              this.biteCooldown = 2.0;
              this.grabbedTarget = 'peer';
              this.grabbedPeerId = peer.id;
              onPeerBitten(peer.id, dmg, true);
            }
            break;
          }
        }
      }
    }

    this.updateProceduralBody();
  }

  private clampToWorld(worldW: number, worldH: number) {
    if (this.x < 12) {
      this.x = 12;
      this.vx = 0;
    } else if (this.x > worldW - this.width - 12) {
      this.x = worldW - this.width - 12;
      this.vx = 0;
    }
    if (this.y < 12) {
      this.y = 12;
      if (this.vy < 0) this.vy = 0;
    } else if (this.y > worldH - this.height - 10) {
      this.y = worldH - this.height - 10;
      this.vy = 0;
      this.isGrounded = true;
    }
  }

  private applyGravityAndCollisions(platforms: PlatformInput[]) {
    if (!this.isClimbing) {
      this.vy += 0.38;
      if (this.vy > 12) this.vy = 12;
    }

    this.x += this.vx;
    this.y += this.vy;

    this.isGrounded = false;
    for (const plat of platforms) {
      if (plat.type === 'wall' || plat.type === 'shelter' || plat.h >= 50) {
        if (this.y + this.height > plat.y + 5 && this.y < plat.y + plat.h - 5) {
          if (this.x + this.width >= plat.x && this.x + this.width - this.vx <= plat.x + 12) {
            this.x = plat.x - this.width;
            this.vx = 0;
          } else if (this.x <= plat.x + plat.w && this.x - this.vx >= plat.x + plat.w - 12) {
            this.x = plat.x + plat.w;
            this.vx = 0;
          } else if (this.x + this.width > plat.x + 4 && this.x < plat.x + plat.w - 4) {
            // De-penetration fallback: never stay wedged inside a wall or passage block
            const distLeft = Math.abs(this.x + this.width - plat.x);
            const distRight = Math.abs(plat.x + plat.w - this.x);
            this.x = distLeft <= distRight ? plat.x - this.width - 1 : plat.x + plat.w + 1;
            this.vx = 0;
          }
        }
      }

      if (this.x + this.width > plat.x && this.x < plat.x + plat.w) {
        if (this.y + this.height >= plat.y && this.y + this.height - this.vy <= plat.y + 10 && this.vy >= 0) {
          this.y = plat.y - this.height;
          this.vy = 0;
          this.isGrounded = true;
        }
      }
    }
  }

  public updateProceduralBody() {
    const headX = this.facingRight ? this.x + this.width : this.x;
    const headY = this.y + 10;

    this.spine[0].x = headX;
    this.spine[0].y = headY;

    for (let i = 1; i < this.spine.length; i++) {
      const prev = this.spine[i - 1];
      const cur = this.spine[i];
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const targetDist = 11;

      cur.x = prev.x + (dx / dist) * targetDist;
      cur.y = prev.y + (dy / dist) * targetDist;
      cur.angle = Math.atan2(prev.y - cur.y, prev.x - cur.x);
    }

    const legOffsets = [
      { spineIdx: 1, side: -1 },
      { spineIdx: 1, side: 1 },
      { spineIdx: 3, side: -1 },
      { spineIdx: 3, side: 1 }
    ];

    for (let i = 0; i < 4; i++) {
      const cfg = legOffsets[i];
      const root = this.spine[cfg.spineIdx];
      const limb = this.limbs[i];

      const stepDist = this.vx !== 0 ? Math.sign(this.vx) * 16 : 0;
      const idealX = root.x + stepDist;
      const idealY = this.y + this.height;

      const distFromIdeal = Math.hypot(limb.x - idealX, limb.y - idealY);
      if (distFromIdeal > 26) {
        limb.targetX = idealX;
        limb.targetY = idealY;
      }

      limb.x += (limb.targetX - limb.x) * 0.35;
      limb.y += (limb.targetY - limb.y) * 0.35;
    }

    const lastSpine = this.spine[this.spine.length - 1];
    this.tail[0].x = lastSpine.x;
    this.tail[0].y = lastSpine.y;

    for (let i = 1; i < this.tail.length; i++) {
      const prev = this.tail[i - 1];
      const cur = this.tail[i];
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      cur.x = prev.x + (dx / dist) * 8;
      cur.y = prev.y + (dy / dist) * 8;
    }
  }

  public render(ctx: CanvasRenderingContext2D, t: number) {
    if (this.pipeTransit) {
      // Draw recognizable lizard silhouette & glowing cyan eyes sliding through/emerging from pipe
      ctx.save();
      const cx = this.x + this.width / 2;
      const cy = this.y + this.height / 2;
      const dir = this.facingRight ? 1 : -1;
      const angle = Math.atan2(this.pipeTransit.toY - this.pipeTransit.fromY, this.pipeTransit.toX - this.pipeTransit.fromX);

      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Trailing tail & segmented torso sliding inside conduit
      ctx.fillStyle = 'rgba(236, 72, 153, 0.85)';
      ctx.beginPath();
      ctx.ellipse(-6, 0, 18, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Armored head crest
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(4, -9);
      ctx.lineTo(-4, -7);
      ctx.lineTo(-4, 7);
      ctx.lineTo(4, 9);
      ctx.closePath();
      ctx.fill();

      // Glowing lizard eye
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(8, -3 * dir, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();

    // 1. Draw Tail
    ctx.beginPath();
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(this.tail[0].x, this.tail[0].y);
    for (let i = 1; i < this.tail.length; i++) {
      ctx.lineTo(this.tail[i].x, this.tail[i].y);
    }
    ctx.stroke();

    for (let i = 2; i < this.tail.length; i += 2) {
      const p = this.tail[i];
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Draw 4 Quadruped Limbs
    for (let i = 0; i < 4; i++) {
      const root = this.spine[i < 2 ? 1 : 3];
      const limb = this.limbs[i];

      const midX = (root.x + limb.x) / 2 + (i % 2 === 0 ? -4 : 4);
      const midY = (root.y + limb.y) / 2 - 6;

      ctx.strokeStyle = '#db2777';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.lineTo(midX, midY);
      ctx.lineTo(limb.x, limb.y);
      ctx.stroke();

      ctx.fillStyle = '#9d174d';
      ctx.beginPath();
      ctx.arc(limb.x, limb.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Draw Lizard Body Segments
    for (let i = this.spine.length - 1; i >= 0; i--) {
      const pt = this.spine[i];
      const rad = 13 - i * 1.4;

      ctx.fillStyle = '#9d174d';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y + 2, rad, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rad - 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(pt.x - 2, pt.y - rad + 1);
      ctx.lineTo(pt.x, pt.y - rad - 5);
      ctx.lineTo(pt.x + 2, pt.y - rad + 1);
      ctx.fill();
    }

    // 4. Armored Head & Jaws
    const head = this.spine[0];
    const headAngle = head.angle || 0;
    const dir = this.facingRight ? 1 : -1;

    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(headAngle);

    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.moveTo(dir * 18, 0);
    ctx.lineTo(dir * 4, -13);
    ctx.lineTo(-dir * 12, -9);
    ctx.lineTo(-dir * 12, 9);
    ctx.lineTo(dir * 4, 11);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#be185d';
    ctx.beginPath();
    ctx.moveTo(dir * 18, 0);
    ctx.lineTo(dir * 5, -8);
    ctx.lineTo(dir * 5, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(dir * 4, -5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#083344';
    ctx.beginPath();
    ctx.arc(dir * 4, -5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    const jawSpread = this.grabbedTarget ? 0.35 : Math.sin(t * 8) * 0.1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dir * 16, 2 + jawSpread * 8);
    ctx.lineTo(0, 8 + jawSpread * 8);
    ctx.stroke();

    ctx.restore();

    // 5. HP Indicator Bar when damaged
    if (this.hp < this.maxHp && this.state !== 'dead') {
      const barW = 36;
      const barH = 4;
      const bx = this.x + (this.width - barW) / 2;
      const by = this.y - 12;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(bx, by, (this.hp / this.maxHp) * barW, barH);
      ctx.strokeStyle = '#be185d';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, barW, barH);
    }

    ctx.restore();
  }
}
