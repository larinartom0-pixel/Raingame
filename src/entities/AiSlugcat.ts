// Autonomous AI-Controlled Slugcat (Виживший / Монах) — Exclusive to Safari Mode
// Uses graph navigation, pole climbing, weapon pickup/throwing, foraging, pipe travel & possession controls.
import { findNextGraphWaypoint, NavWaypoint } from '../world/navGraph';
import { SlugcatCharacterId, SLUGCAT_CHARACTERS, ItemType, roundToOneDecimal } from '../types';
import type { PinkLizard } from './PinkLizard';

export interface AiSlugcatPipeTransit {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  duration: number;
  isShelter?: boolean;
  targetLocationId?: string;
  targetSpawnX?: number;
  targetSpawnY?: number;
}

export interface AiSlugcatPossessedControls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  grab: boolean;
  throwItem: boolean;
  eat: boolean;
}

export interface AiSlugcatItemLike {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  isHeld: boolean;
  heldBy?: string;
  isStuck: boolean;
  stuckTarget?: string;
  isAirborne: boolean;
  thrownBy?: string;
  sleeping?: boolean;
  explosiveArmed?: boolean;
  fuseTimer?: number;
  cherryPopCount?: number;
  flyAlive?: boolean;
  flyStunTimer?: number;
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

export class AiSlugcat {
  public id: string;
  public name: string;
  public roomId: string;
  public characterId: SlugcatCharacterId;

  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public width: number = 24;
  public height: number = 38;
  public facingRight: boolean = true;
  public crouching: boolean = false;
  public isGrounded: boolean = false;
  public isClimbing: boolean = false;

  public state: 'normal' | 'stunned' | 'dead' | 'sleeping' = 'normal';
  public hp: number;
  public maxHp: number;
  public stunTimer: number = 0;
  public biteGrabImmunity: boolean;
  public attackerStunOnGrabAttempt: number;

  public heldItem: AiSlugcatItemLike | null = null;
  public foodCount: number = 0;
  public maxFood: number;

  // Skeleton fields matching renderSlugcatCharacter / updateSkeleton
  public head: { x: number; y: number; vx: number; vy: number };
  public chest: { x: number; y: number; vx: number; vy: number };
  public hips: { x: number; y: number; vx: number; vy: number };
  public tail: Array<{ x: number; y: number }>;
  public earSway: number = 0;
  public blinkTimer: number = 0;
  public ragdollAngle: number = 0;

  public pipeTransit: AiSlugcatPipeTransit | null = null;
  public pipeCooldown: number = 0;
  public isPossessed: boolean = false;

  // AI timers & pathfinding memory
  private patrolTargetX: number = 400;
  private patrolTargetY: number = 300;
  private patrolPipeId: string | null = null;
  private patrolTimer: number = 0;
  private activeWaypoint: NavWaypoint | null = null;
  private pathRecalcTimer: number = 0;
  private cachedTargetX: number = 0;
  private cachedTargetY: number = 0;
  private throwCooldown: number = 0;
  private eatProgress: number = 0;
  public isEating: boolean = false;
  private stuckTimer: number = 0;
  private lastX: number = 0;
  private lastY: number = 0;

  // Input edge tracking for possession
  private prevJump: boolean = false;
  private prevGrab: boolean = false;
  private prevThrow: boolean = false;
  private prevEat: boolean = false;

  constructor(
    id: string,
    name: string,
    roomId: string,
    characterId: SlugcatCharacterId,
    startX: number,
    startY: number
  ) {
    const cfg = SLUGCAT_CHARACTERS[characterId] || SLUGCAT_CHARACTERS.survivor;
    this.id = id;
    this.name = name;
    this.roomId = roomId;
    this.characterId = characterId;
    this.x = startX;
    this.y = startY;
    this.hp = cfg.maxHp;
    this.maxHp = cfg.maxHp;
    this.biteGrabImmunity = cfg.biteGrabImmunity;
    this.attackerStunOnGrabAttempt = cfg.attackerStunOnGrabAttempt;
    this.maxFood = cfg.maxFood;
    this.patrolTargetX = startX + 120;
    this.patrolTargetY = startY;
    this.head = { x: startX + 12, y: startY + 6, vx: 0, vy: 0 };
    this.chest = { x: startX + 12, y: startY + 18, vx: 0, vy: 0 };
    this.hips = { x: startX + 12, y: startY + 30, vx: 0, vy: 0 };
    this.tail = Array.from({ length: 9 }, (_, i) => ({ x: startX + 12, y: startY + 30 + i * 4 }));
    this.lastX = startX;
    this.lastY = startY;
  }

  public resetPose(posX: number, posY: number) {
    this.x = posX;
    this.y = posY;
    this.vx = 0;
    this.vy = 0;
    this.isClimbing = false;
    this.isGrounded = false;
    this.head = { x: posX + 12, y: posY + 6, vx: 0, vy: 0 };
    this.chest = { x: posX + 12, y: posY + 18, vx: 0, vy: 0 };
    this.hips = { x: posX + 12, y: posY + 30, vx: 0, vy: 0 };
    this.tail = Array.from({ length: 9 }, (_, i) => ({ x: posX + 12, y: posY + 30 + i * 4 }));
  }

  public applyBite(damage: number, grabbed: boolean): boolean {
    if (this.state === 'dead') return false;
    const cfg = SLUGCAT_CHARACTERS[this.characterId] || SLUGCAT_CHARACTERS.survivor;
    const actualDmg = Math.round(damage * cfg.incomingDamageMult * 1000) / 1000;
    this.hp = Math.max(0, this.hp - actualDmg);
    this.isClimbing = false;
    this.isEating = false;
    this.eatProgress = 0;

    if (!grabbed || cfg.biteGrabImmunity) {
      this.vy = -3.0;
      if (this.hp <= 0) {
        this.state = 'dead';
        this.stunTimer = 0;
      }
      return true;
    }

    const actualStun = roundToOneDecimal(20.0 * cfg.incomingStunMult);
    if (this.hp <= 0) {
      this.state = 'dead';
      this.stunTimer = 0;
    } else {
      this.state = 'stunned';
      this.stunTimer = actualStun;
    }
    return true;
  }

  public applyProjectileHit(weapon: 'spear' | 'explosive_spear' | 'rock' | 'cherrybomb', baseDmg?: number, baseStun?: number) {
    if (this.state === 'dead') return;
    const cfg = SLUGCAT_CHARACTERS[this.characterId] || SLUGCAT_CHARACTERS.survivor;
    const isSpear = weapon === 'spear' || weapon === 'explosive_spear';
    const rawDmg = baseDmg ?? (isSpear ? 1.0 : weapon === 'cherrybomb' ? 0.35 : 0.01);
    const rawStun = baseStun ?? (isSpear ? 1.8 : weapon === 'cherrybomb' ? 3.0 : 1.2);
    const dmg = Math.round(rawDmg * cfg.incomingDamageMult * 1000) / 1000;
    const stun = roundToOneDecimal(rawStun * cfg.incomingStunMult);

    this.hp = Math.max(0, this.hp - dmg);
    this.isClimbing = false;
    this.isEating = false;
    this.eatProgress = 0;

    if (this.hp <= 0) {
      this.state = 'dead';
      this.stunTimer = 0;
      this.vy = -3.2;
    } else {
      this.state = 'stunned';
      this.stunTimer = Math.max(this.stunTimer, stun);
      this.vy = -2.0;
    }
  }

  public update(
    delta: number,
    env: {
      width: number;
      height: number;
      roomId: string;
      platforms: PlatformInput[];
      poles: PoleInput[];
      transitPipes: PipeInput[];
    },
    lizardsInRoom: PinkLizard[],
    itemsInRoom: AiSlugcatItemLike[],
    callbacks: {
      onChangedRoom: (targetRoomId: string, spawnX?: number, spawnY?: number) => void;
      onThrowItem: (ai: AiSlugcat, item: AiSlugcatItemLike, dirSign: number) => void;
      onConsumeItem: (ai: AiSlugcat, item: AiSlugcatItemLike) => void;
      onSoundPickup?: () => void;
      onSoundJump?: () => void;
    },
    possessedControls?: AiSlugcatPossessedControls | null
  ) {
    this.isPossessed = !!possessedControls;
    const worldW = env.width || 1000;
    const worldH = env.height || 580;

    if (this.pipeCooldown > 0) {
      this.pipeCooldown = Math.max(0, this.pipeCooldown - delta);
    }
    if (this.throwCooldown > 0) {
      this.throwCooldown = Math.max(0, this.throwCooldown - delta);
    }

    // Stun countdown
    if (this.state === 'stunned') {
      this.stunTimer -= delta;
      if (this.stunTimer <= 0) {
        this.stunTimer = 0;
        this.state = 'normal';
      }
    }

    // Pipe Conduit Transit
    if (this.pipeTransit) {
      this.pipeTransit.progress += delta / this.pipeTransit.duration;
      const p = Math.min(1, this.pipeTransit.progress);
      const curX = this.pipeTransit.fromX + (this.pipeTransit.toX - this.pipeTransit.fromX) * p;
      const curY = this.pipeTransit.fromY + (this.pipeTransit.toY - this.pipeTransit.fromY) * p;
      this.x = curX - this.width / 2;
      this.y = curY - this.height / 2;
      this.vx = 0;
      this.vy = 0;
      this.isClimbing = false;
      this.isGrounded = false;
      this.syncHeldItemPosition();

      if (p >= 1) {
        const pt = this.pipeTransit;
        this.pipeTransit = null;
        this.pipeCooldown = 4.5;
        if (pt.targetLocationId) {
          callbacks.onChangedRoom(pt.targetLocationId, pt.targetSpawnX, pt.targetSpawnY);
        } else {
          const exitDir = pt.toX > pt.fromX ? 1 : -1;
          this.x = pt.toX - this.width / 2 + exitDir * 8;
          this.y = pt.toY - this.height / 2;
          this.vx = exitDir * 3.2;
          this.vy = -2.2;
          this.patrolPipeId = null;
          this.activeWaypoint = null;
        }
      }
      return;
    }

    // Determine if pinned in a lizard's mouth
    const grabbingLizard = lizardsInRoom.find(
      l => l.state !== 'dead' && l.grabbedTarget === 'peer' && l.grabbedPeerId === this.id
    );
    if (grabbingLizard) {
      // Position is controlled directly by PinkLizard; just keep held item synced
      this.isClimbing = false;
      this.syncHeldItemPosition();
      return;
    }

    // Dead or Stunned ragdoll physics
    if (this.state !== 'normal') {
      this.isClimbing = false;
      this.crouching = false;
      this.isEating = false;
      this.eatProgress = 0;
      this.applyGravityAndPlatforms(env.platforms, worldW, worldH, false);
      this.syncHeldItemPosition();
      return;
    }

    // Determine input commands: either player-possessed OR AI-driven
    let wantLeft = false;
    let wantRight = false;
    let wantUp = false;
    let wantDown = false;
    let wantJump = false;
    let wantGrab = false;
    let wantThrow = false;
    let wantEat = false;

    if (possessedControls) {
      wantLeft = possessedControls.left;
      wantRight = possessedControls.right;
      wantUp = possessedControls.up;
      wantDown = possessedControls.down;
      wantJump = possessedControls.jump && !this.prevJump;
      wantGrab = possessedControls.grab && !this.prevGrab;
      wantThrow = possessedControls.throwItem && !this.prevThrow;
      wantEat = possessedControls.eat && !this.prevEat;

      this.prevJump = possessedControls.jump;
      this.prevGrab = possessedControls.grab;
      this.prevThrow = possessedControls.throwItem;
      this.prevEat = possessedControls.eat;
    } else {
      this.prevJump = false;
      this.prevGrab = false;
      this.prevThrow = false;
      this.prevEat = false;

      const decision = this.computeAiInputs(delta, env, lizardsInRoom, itemsInRoom);
      wantLeft = decision.left;
      wantRight = decision.right;
      wantUp = decision.up;
      wantDown = decision.down;
      wantJump = decision.jump;
      wantGrab = decision.grab;
      wantThrow = decision.throwItem;
      wantEat = decision.eat;
    }

    // Handle Grab / Drop item
    if (wantGrab) {
      if (this.heldItem) {
        this.dropHeldItem();
        callbacks.onSoundPickup?.();
      } else {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        let closest: AiSlugcatItemLike | null = null;
        let bestDist = 42;
        for (const it of itemsInRoom) {
          if (it.isHeld || (it.isStuck && it.stuckTarget)) continue;
          const d = Math.hypot(cx - it.x, cy - it.y);
          if (d < bestDist) {
            bestDist = d;
            closest = it;
          }
        }
        if (closest) {
          closest.isHeld = true;
          closest.heldBy = this.id;
          closest.isStuck = false;
          closest.stuckTarget = undefined;
          closest.isAirborne = false;
          closest.sleeping = false;
          if (closest.type === 'batfly') closest.flyAlive = false;
          this.heldItem = closest;
          this.syncHeldItemPosition();
          callbacks.onSoundPickup?.();
        }
      }
    }

    // Handle Throw item
    if (wantThrow && this.heldItem && this.throwCooldown <= 0) {
      const thrown = this.heldItem;
      this.heldItem = null;
      this.isEating = false;
      this.eatProgress = 0;
      this.throwCooldown = 0.65;
      callbacks.onThrowItem(this, thrown, this.facingRight ? 1 : -1);
    }

    // Handle Eat edible item
    const isEdible = this.heldItem && (this.heldItem.type === 'berry' || this.heldItem.type === 'batfly');
    if (wantEat && isEdible && !this.isEating) {
      this.isEating = true;
      this.eatProgress = 0;
    }
    if (this.isEating) {
      if (!isEdible || wantLeft || wantRight || wantUp || wantDown || wantJump) {
        this.isEating = false;
        this.eatProgress = 0;
      } else {
        this.crouching = true;
        this.vx *= 0.6;
        this.eatProgress += delta;
        if (this.eatProgress >= 3.2) {
          const eaten = this.heldItem!;
          this.heldItem = null;
          this.isEating = false;
          this.eatProgress = 0;
          this.crouching = false;
          this.foodCount = Math.min(this.maxFood, this.foodCount + 1);
          callbacks.onConsumeItem(this, eaten);
        }
        this.applyGravityAndPlatforms(env.platforms, worldW, worldH, false);
        this.syncHeldItemPosition();
        return;
      }
    }

    // Check pipe entry (either intentional AI pipe target OR possessed pressing up/down at pipe)
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    if (this.pipeCooldown <= 0 && env.transitPipes.length > 0) {
      const wantsPipe = possessedControls ? (wantUp || wantDown) : !!this.patrolPipeId;
      if (wantsPipe) {
        for (const pipe of env.transitPipes) {
          if (pipe.isShelterPipe || pipe.isDenPipe) continue;
          if (!possessedControls && this.patrolPipeId && pipe.id !== this.patrolPipeId) continue;
          const dStart = Math.hypot(cx - pipe.startX, cy - pipe.startY);
          const dEnd = Math.hypot(cx - pipe.endX, cy - pipe.endY);
          if (dStart < 34) {
            this.pipeTransit = {
              fromX: pipe.startX,
              fromY: pipe.startY,
              toX: pipe.endX,
              toY: pipe.endY,
              progress: 0,
              duration: 1.05,
              isShelter: !!pipe.isShelterPipe,
              targetLocationId: pipe.targetLocationId,
              targetSpawnX: pipe.targetSpawnX,
              targetSpawnY: pipe.targetSpawnY,
            };
            this.patrolPipeId = null;
            this.vx = 0;
            this.vy = 0;
            return;
          } else if (dEnd < 34 && !pipe.targetLocationId) {
            this.pipeTransit = {
              fromX: pipe.endX,
              fromY: pipe.endY,
              toX: pipe.startX,
              toY: pipe.startY,
              progress: 0,
              duration: 1.05,
            };
            this.patrolPipeId = null;
            this.vx = 0;
            this.vy = 0;
            return;
          }
        }
      }
    }

    // Pole Climbing
    let touchingPole: PoleInput | null = null;
    for (const p of env.poles) {
      if (Math.abs(cx - p.x) < 22 && this.y + this.height >= p.yMin - 14 && this.y <= p.yMax + 14) {
        touchingPole = p;
        break;
      }
    }
    if (touchingPole && (wantUp || wantDown)) {
      if (!this.isClimbing) {
        this.isClimbing = true;
        this.x = touchingPole.x - this.width / 2;
        this.vx = 0;
        this.vy = 0;
      }
    } else if (!touchingPole) {
      this.isClimbing = false;
    }

    if (this.isClimbing && touchingPole) {
      this.x += ((touchingPole.x - this.width / 2) - this.x) * 0.35;
      if (wantUp) {
        this.y -= 4.3;
        if (this.y < touchingPole.yMin) this.y = touchingPole.yMin;
      } else if (wantDown) {
        this.y += 4.3;
        if (this.y > touchingPole.yMax - this.height) {
          this.y = touchingPole.yMax - this.height;
          this.isClimbing = false;
        }
      }
      if (wantLeft && !wantUp && !wantDown) {
        this.isClimbing = false;
        this.vx = -3.2;
        this.facingRight = false;
      } else if (wantRight && !wantUp && !wantDown) {
        this.isClimbing = false;
        this.vx = 3.2;
        this.facingRight = true;
      }
      if (wantJump) {
        this.isClimbing = false;
        this.vy = -8.4;
        this.vx = wantLeft ? -5.8 : wantRight ? 5.8 : (this.facingRight ? 3.5 : -3.5);
        callbacks.onSoundJump?.();
      }
    } else {
      const accel = 0.52;
      const maxSpeed = this.crouching ? 2.2 : 4.7;
      const friction = this.isGrounded ? 0.82 : 0.98;

      if (wantDown && this.isGrounded && possessedControls) {
        this.crouching = true;
      } else if (!wantDown) {
        this.crouching = false;
      }

      if (wantLeft) {
        this.vx -= accel;
        this.facingRight = false;
      } else if (wantRight) {
        this.vx += accel;
        this.facingRight = true;
      } else {
        this.vx *= friction;
      }

      if (this.vx > maxSpeed) this.vx = maxSpeed;
      if (this.vx < -maxSpeed) this.vx = -maxSpeed;

      if (wantJump && this.isGrounded) {
        this.vy = -8.4;
        this.isGrounded = false;
        this.crouching = false;
        callbacks.onSoundJump?.();
      }

      this.applyGravityAndPlatforms(env.platforms, worldW, worldH, wantDown);
    }

    // Clamp to room horizontally
    if (this.x < 10) {
      this.x = 10;
      this.vx = 0;
    } else if (this.x > worldW - this.width - 10) {
      this.x = worldW - this.width - 10;
      this.vx = 0;
    }

    this.syncHeldItemPosition();
  }

  public dropHeldItem() {
    if (!this.heldItem) return;
    const it = this.heldItem;
    it.isHeld = false;
    it.heldBy = undefined;
    it.isStuck = false;
    it.stuckTarget = undefined;
    it.isAirborne = false;
    it.sleeping = false;
    it.vx = this.vx * 0.4 + (this.facingRight ? 1.4 : -1.4);
    it.vy = -1.8;
    if (it.type === 'batfly') it.flyAlive = false;
    this.heldItem = null;
  }

  private syncHeldItemPosition() {
    if (!this.heldItem) return;
    const dir = this.facingRight ? 1 : -1;
    this.heldItem.x = this.chest.x + dir * 9;
    this.heldItem.y = this.chest.y + 3;
    this.heldItem.rotation = this.facingRight ? 0.15 : -0.15;
  }

  private applyGravityAndPlatforms(platforms: PlatformInput[], worldW: number, worldH: number, dropThroughThin: boolean) {
    if (!this.isGrounded) {
      this.vy += 0.38;
      if (this.vy > 12) this.vy = 12;
    }
    this.x += this.vx;
    this.y += this.vy;

    this.isGrounded = false;
    for (const plat of platforms) {
      const isSolid = plat.type === 'wall' || plat.type === 'shelter' || plat.h >= 45;
      if (isSolid) {
        const yOverlap = this.y + this.height > plat.y + 6 && this.y < plat.y + plat.h - 6;
        if (yOverlap) {
          if (this.x + this.width >= plat.x && (this.x + this.width - this.vx) <= plat.x + 10) {
            this.x = plat.x - this.width;
            this.vx = 0;
          } else if (this.x <= plat.x + plat.w && (this.x - this.vx) >= plat.x + plat.w - 10) {
            this.x = plat.x + plat.w;
            this.vx = 0;
          }
        }
      }

      if (dropThroughThin && !isSolid && plat.h <= 25) {
        continue;
      }

      if (this.x + this.width > plat.x && this.x < plat.x + plat.w) {
        const wasAbove = (this.y + this.height - this.vy) <= plat.y + 6;
        const isInside = this.y + this.height >= plat.y && this.y < plat.y + plat.h;
        if (wasAbove && isInside && this.vy >= 0) {
          this.y = plat.y - this.height;
          this.vy = 0;
          this.isGrounded = true;
        }
        const wasBelow = (this.y - this.vy) >= plat.y + plat.h - 4;
        const isInsideCeil = this.y < plat.y + plat.h && this.y + this.height > plat.y;
        if (wasBelow && isInsideCeil && this.vy < 0 && isSolid) {
          this.y = plat.y + plat.h;
          this.vy = 0.1;
        }
      }
    }

    if (this.y < 10) {
      this.y = 10;
      if (this.vy < 0) this.vy = 0;
    }
    if (this.y > worldH - this.height - 6) {
      this.y = worldH - this.height - 6;
      this.vy = 0;
      this.isGrounded = true;
    }
    if (this.x < 10) this.x = 10;
    if (this.x > worldW - this.width - 10) this.x = worldW - this.width - 10;
  }

  private computeAiInputs(
    delta: number,
    env: {
      width: number;
      height: number;
      roomId: string;
      platforms: PlatformInput[];
      poles: PoleInput[];
      transitPipes: PipeInput[];
    },
    lizardsInRoom: PinkLizard[],
    itemsInRoom: AiSlugcatItemLike[]
  ) {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    let targetX = this.patrolTargetX;
    let targetY = this.patrolTargetY;
    let grab = false;
    let throwItem = false;
    let eat = false;

    const livingLizards = lizardsInRoom
      .filter(l => l.state !== 'dead' && !l.pipeTransit)
      .map(l => ({
        liz: l,
        dist: Math.hypot(cx - (l.x + l.width / 2), cy - (l.y + l.height / 2)),
      }))
      .sort((a, b) => a.dist - b.dist);

    const nearestLiz = livingLizards[0];
    const hasWeapon =
      this.heldItem &&
      (this.heldItem.type === 'spear' ||
        this.heldItem.type === 'explosive_spear' ||
        this.heldItem.type === 'rock' ||
        this.heldItem.type === 'cherrybomb');
    const hasEdible =
      this.heldItem && (this.heldItem.type === 'berry' || this.heldItem.type === 'batfly');

    // Priority 1: Combat or Flee when lizard is near
    if (nearestLiz && nearestLiz.dist < 380) {
      const lCx = nearestLiz.liz.x + nearestLiz.liz.width / 2;
      const lCy = nearestLiz.liz.y + nearestLiz.liz.height / 2;

      if (hasWeapon) {
        // Aim & throw if clear horizontal shot
        if (Math.abs(lCy - cy) < 52 && nearestLiz.dist < 360 && this.throwCooldown <= 0) {
          this.facingRight = lCx >= cx;
          throwItem = true;
        }
        // Keep safe distance (~140px) while lining up shot
        if (nearestLiz.dist < 130) {
          targetX = cx < lCx ? Math.max(60, cx - 220) : Math.min(env.width - 60, cx + 220);
          targetY = cy;
        } else {
          targetX = lCx;
          targetY = lCy;
        }
      } else {
        // Unarmed: look for a nearby weapon or flee through pipe/across room
        const nearbyWeapon = itemsInRoom
          .filter(
            it =>
              !it.isHeld &&
              !(it.isStuck && it.stuckTarget) &&
              (it.type === 'spear' || it.type === 'explosive_spear' || it.type === 'rock' || it.type === 'cherrybomb')
          )
          .map(it => ({ it, d: Math.hypot(cx - it.x, cy - it.y) }))
          .sort((a, b) => a.d - b.d)[0];

        if (nearbyWeapon && nearbyWeapon.d < 240 && nearestLiz.dist > 95) {
          targetX = nearbyWeapon.it.x;
          targetY = nearbyWeapon.it.y;
          if (nearbyWeapon.d < 34) grab = true;
        } else {
          // Flee away from lizard or to an inter-room pipe
          const escapePipes = env.transitPipes.filter(p => !!p.targetLocationId && !p.isShelterPipe && !p.isDenPipe);
          const awayFromLiz = escapePipes.find(p => Math.sign(p.startX - cx) !== Math.sign(lCx - cx));
          if (awayFromLiz && this.pipeCooldown <= 0 && nearestLiz.dist < 220) {
            targetX = awayFromLiz.startX;
            targetY = awayFromLiz.startY;
            this.patrolPipeId = awayFromLiz.id;
          } else {
            targetX = cx < lCx ? Math.max(60, cx - 260) : Math.min(env.width - 60, cx + 260);
            targetY = Math.max(80, cy - 110);
          }
        }
      }
    } else if (hasEdible && this.foodCount < this.maxFood) {
      // Eat held berry/batfly when safe
      eat = true;
      targetX = cx;
      targetY = cy;
    } else {
      // Forage / Loot weapon or berry, or wander across room & pipes
      if (!this.heldItem) {
        const wantedItem = itemsInRoom
          .filter(
            it =>
              !it.isHeld &&
              !(it.isStuck && it.stuckTarget) &&
              (it.type === 'spear' ||
                it.type === 'explosive_spear' ||
                it.type === 'rock' ||
                it.type === 'cherrybomb' ||
                (this.foodCount < this.maxFood && (it.type === 'berry' || (it.type === 'batfly' && (it.flyAlive === false || (it.flyStunTimer ?? 0) > 0)))))
          )
          .map(it => ({ it, d: Math.hypot(cx - it.x, cy - it.y) }))
          .sort((a, b) => a.d - b.d)[0];

        if (wantedItem && wantedItem.d < 260) {
          targetX = wantedItem.it.x;
          targetY = wantedItem.it.y;
          if (wantedItem.d < 34) grab = true;
        }
      }

      if (!grab) {
        this.patrolTimer -= delta;
        if (this.patrolTimer <= 0 || Math.hypot(cx - this.patrolTargetX, cy - this.patrolTargetY) < 38) {
          this.patrolPipeId = null;
          const interPipes = env.transitPipes.filter(p => !p.isShelterPipe && !p.isDenPipe && !!p.targetLocationId);
          if (interPipes.length > 0 && this.pipeCooldown <= 0 && Math.random() < 0.35) {
            const p = interPipes[Math.floor(Math.random() * interPipes.length)];
            this.patrolTargetX = p.startX;
            this.patrolTargetY = p.startY;
            this.patrolPipeId = p.id;
            this.patrolTimer = 8.0;
          } else {
            const plats = env.platforms.filter(p => p.type !== 'wall' && p.w >= 70 && p.y > 40);
            if (plats.length > 0) {
              const plat = plats[Math.floor(Math.random() * plats.length)];
              this.patrolTargetX = plat.x + 25 + Math.random() * Math.max(10, plat.w - 50);
              this.patrolTargetY = plat.y - 20;
              this.patrolTimer = 4.5 + Math.random() * 3.5;
            } else {
              this.patrolTargetX = 80 + Math.random() * Math.max(100, env.width - 160);
              this.patrolTargetY = cy;
              this.patrolTimer = 4.0;
            }
          }
        }
        targetX = this.patrolTargetX;
        targetY = this.patrolTargetY;
      }
    }

    // Resolve graph waypoint
    this.pathRecalcTimer -= delta;
    const directDist = Math.hypot(targetX - cx, targetY - cy);
    if (directDist < 120 && Math.abs(targetY - cy) < 35 && !this.patrolPipeId) {
      this.activeWaypoint = null;
    } else if (
      this.pathRecalcTimer <= 0 ||
      !this.activeWaypoint ||
      Math.hypot(targetX - this.cachedTargetX, targetY - this.cachedTargetY) > 65 ||
      Math.hypot(cx - this.activeWaypoint.x, cy - this.activeWaypoint.y) < 24
    ) {
      this.pathRecalcTimer = 0.28;
      this.cachedTargetX = targetX;
      this.cachedTargetY = targetY;
      this.activeWaypoint = findNextGraphWaypoint(
        env.roomId,
        cx,
        cy,
        targetX,
        targetY,
        env.platforms,
        env.poles,
        env.transitPipes,
        { allowShortcutPipes: this.pipeCooldown <= 0 }
      );
    }

    const steerX = this.activeWaypoint ? this.activeWaypoint.x : targetX;
    const steerY = this.activeWaypoint ? this.activeWaypoint.y : targetY;
    const dx = steerX - cx;
    const dy = steerY - cy;

    if (Math.abs(this.x - this.lastX) < 0.6 && Math.abs(this.y - this.lastY) < 0.6 && Math.hypot(dx, dy) > 16) {
      this.stuckTimer += delta;
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = this.x;
    this.lastY = this.y;

    const left = dx < -10;
    const right = dx > 10;
    const up = (this.activeWaypoint?.kind === 'pole' || Math.abs(dy) > 26) && dy < -14;
    const down = (this.activeWaypoint?.kind === 'pole' || Math.abs(dy) > 26) && dy > 16;
    const jump =
      this.isGrounded &&
      (this.stuckTimer > 0.35 ||
        (this.activeWaypoint?.kind === 'jump' && dy < -12) ||
        (dy < -28 && !up));

    if (this.stuckTimer > 1.2) {
      this.stuckTimer = 0;
      this.activeWaypoint = null;
      this.pathRecalcTimer = 0;
      this.patrolTargetX = Math.max(60, Math.min(env.width - 60, cx + (Math.random() < 0.5 ? -260 : 260)));
    }

    return { left, right, up, down, jump, grab, throwItem, eat };
  }
}
