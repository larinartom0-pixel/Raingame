// Authentic Rain World Pink Lizard (Розовий ящер)
// Procedural Quadruped Anatomy, Wall/Pole Climbing AI, Bite & Drag Mechanics

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

export type LizardState = 'patrol' | 'hunt' | 'drag_prey' | 'drag_corpse' | 'stunned' | 'dead';

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

  // Pipe Transit crawling navigation ("улучшить ии ящера щоб он міг перемещаться по локациях по трубах")
  public pipeTransit: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    progress: number;
    duration: number;
    targetLocationId?: string;
    targetSpawnX?: number;
    targetSpawnY?: number;
  } | null = null;
  public pipeCooldown: number = 0;

  // Carried target: living player or dead corpse
  public grabbedTarget: 'player' | 'corpse' | 'peer' | null = null;
  public grabbedPeerId: string | null = null;

  // Procedural spine vertebrae (head to tail base)
  public spine: Array<{ x: number; y: number; angle: number }> = [];

  // Procedural 4 limbs: Front-Left, Front-Right, Back-Left, Back-Right
  public limbs: LizardLimb[] = [];

  // Tail segments
  public tail: Array<{ x: number; y: number }> = [];

  // Head jaw angle (0 = closed, 0.45 = wide open)
  public jawOpen: number = 0;

  constructor(id: string, startX: number, startY: number) {
    this.id = id;
    this.x = startX;
    this.y = startY;

    // Initialize spine (5 segments)
    for (let i = 0; i < 5; i++) {
      this.spine.push({ x: startX - i * 11, y: startY + 12, angle: 0 });
    }

    // Initialize 4 limbs
    for (let i = 0; i < 4; i++) {
      this.limbs.push({
        x: startX,
        y: startY + 24,
        targetX: startX,
        targetY: startY + 24,
        liftProgress: 1,
        planted: true
      });
    }

    // Initialize tail (7 segments)
    for (let i = 0; i < 7; i++) {
      this.tail.push({ x: startX - (50 + i * 8), y: startY + 12 });
    }
  }

  public takeDamage(amount: number, stunDuration: number) {
    if (this.state === 'dead') return;

    this.hp = Math.max(0, this.hp - amount);
    this.stunTimer = Math.max(this.stunTimer, stunDuration);
    this.state = this.hp <= 0 ? 'dead' : 'stunned';

    // Drop any prey if stunned
    if (this.grabbedTarget) {
      this.grabbedTarget = null;
      this.grabbedPeerId = null;
    }
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
    },
    remotePeers: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      hp: number;
      state: string;
      room: string;
    }>,
    platforms: Array<{ x: number; y: number; w: number; h: number; type: string }>,
    poles: Array<{ x: number; yMin: number; yMax: number }>,
    den: LizardDen | null,
    onPlayerBitten: (damage: number, grabbed: boolean) => void,
    onPlayerEatenInDen: () => void,
    onPeerBitten?: (peerId: string, damage: number) => void,
    pipes?: Array<{ id: string; startX: number; startY: number; endX: number; endY: number; targetLocationId?: string; targetSpawnX?: number; targetSpawnY?: number }>,
    onLizardChangedRoom?: (targetRoomId: string, spawnX?: number, spawnY?: number) => void,
    onPreyDepositedInDen?: () => void
  ) {
    if (this.state === 'dead') {
      // Dead ragdoll physics
      this.vy += 0.42;
      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.88;
      // Floor collision
      for (const plat of platforms) {
        if (this.x + this.width > plat.x && this.x < plat.x + plat.w) {
          if (this.y + this.height >= plat.y && this.y + this.height - this.vy <= plat.y + 10) {
            this.y = plat.y - this.height;
            this.vy = 0;
            break;
          }
        }
      }
      this.updateProceduralBody();
      return;
    }

    // Pipe Conduit Transit: Lizard sliding through shortcuts and inter-room pipes
    // "улучшить ии ящера щоб он міг перемещаться по локациях по трубах"
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

      // If dragging player, pull them through the pipe as well
      if (this.grabbedTarget === 'player') {
        player.x = curX - player.width / 2;
        player.y = curY - player.height / 2;
      }

      if (p >= 1) {
        if (this.pipeTransit.targetLocationId) {
          // Inter-room transition into adjacent location room!
          const targetRoom = this.pipeTransit.targetLocationId;
          const spX = this.pipeTransit.targetSpawnX;
          const spY = this.pipeTransit.targetSpawnY;
          this.pipeTransit = null;
          this.pipeCooldown = 5.0;
          onLizardChangedRoom?.(targetRoom, spX, spY);
          return;
        }

        // Intraroom pipe exit
        const exitDir = this.pipeTransit.toX > this.pipeTransit.fromX ? 1 : -1;
        this.x = this.pipeTransit.toX - this.width / 2 + exitDir * 8;
        this.y = this.pipeTransit.toY - this.height / 2;
        this.vx = exitDir * 4.2;
        this.vy = -2.5;
        this.pipeTransit = null;
        this.pipeCooldown = 4.0;
      }

      this.updateProceduralBody();
      return;
    }

    if (this.pipeCooldown > 0) {
      this.pipeCooldown -= delta;
    }

    // Stun recovery
    if (this.state === 'stunned') {
      this.stunTimer -= delta;
      this.vx *= 0.82;
      if (this.stunTimer <= 0) {
        this.stunTimer = 0;
        this.state = 'patrol';
      }
      this.applyGravityAndCollisions(platforms);
      this.updateProceduralBody();
      return;
    }

    // Check escape condition: if lizard is dragging the player, but player stun ran out!
    // "І єслі слизне кот вийде з стара оглушеності в пасті ящера то він відпустить игрока і получе 5 сикунд стана"
    if (this.grabbedTarget === 'player') {
      if (player.stunTimer <= 0) {
        // Player broke free!
        this.grabbedTarget = null;
        this.state = 'stunned';
        this.stunTimer = 5.0; // Lizard gets 5 seconds of stun!
        this.vx = this.facingRight ? -3.5 : 3.5;
        this.vy = -3.0;
        this.applyGravityAndCollisions(platforms);
        this.updateProceduralBody();
        return;
      }

      // Keep player pinned in lizard jaws!
      const mouthX = this.facingRight ? this.x + this.width : this.x;
      const mouthY = this.y + 6;
      player.x = mouthX - player.width / 2;
      player.y = mouthY - player.height / 2;

      // Check if lizard reached its den with prey:
      // "і зроби ящеру свою убержку ну видиму куда даже зайти можна но игрока якого заніс туда ящер буде медлено получать урон 0.01 урон в 3 сикунди та стан ставитиметься на паузу поки він там"
      if (den) {
        const distToDen = Math.hypot((this.x + this.width / 2) - (den.x + den.w / 2), (this.y + this.height / 2) - (den.y + den.h / 2));
        if (distToDen < 44) {
          // Lizard deposits prey inside den instead of instant death
          this.grabbedTarget = null;
          player.x = den.x + den.w / 2 - player.width / 2;
          player.y = den.y + den.h / 2 - player.height / 2;
          player.vx = 0;
          player.vy = 0;
          this.biteCooldown = 3.0;
          this.state = 'patrol';
          onPreyDepositedInDen?.();
        }
      }
    }

    if (this.biteCooldown > 0) {
      this.biteCooldown -= delta;
    }

    // ---------------- AI TARGET SELECTION ----------------
    // 1. "А і язер єслі увидит труп игрока у нього приоритетом буде забрать труп а не напасти"
    let targetX = player.x + player.width / 2;
    let targetY = player.y + player.height / 2;
    let isTargetCorpse = false;

    if (this.grabbedTarget === 'player' || this.grabbedTarget === 'corpse') {
      // If already holding prey/corpse, target is the lizard den!
      if (den) {
        targetX = den.x + den.w / 2;
        targetY = den.y + den.h / 2;
      }
    } else {
      // Scan for dead bodies (corpses have absolute priority!)
      if (player.state === 'dead') {
        targetX = player.x + player.width / 2;
        targetY = player.y + player.height / 2;
        isTargetCorpse = true;
      } else {
        const deadPeer = remotePeers.find(p => p.state === 'dead');
        if (deadPeer) {
          targetX = deadPeer.x + 12;
          targetY = deadPeer.y + 19;
          isTargetCorpse = true;
        } else {
          // Living player or nearest living peer
          let nearestDist = Math.hypot((player.x + 12) - (this.x + 26), (player.y + 19) - (this.y + 12));
          targetX = player.x + 12;
          targetY = player.y + 19;

          for (const peer of remotePeers) {
            const d = Math.hypot(peer.x - this.x, peer.y - this.y);
            if (d < nearestDist) {
              nearestDist = d;
              targetX = peer.x + 12;
              targetY = peer.y + 19;
            }
          }
        }
      }
    }

    // Distance to target
    const dx = targetX - (this.x + this.width / 2);
    const dy = targetY - (this.y + this.height / 2);
    const distToTarget = Math.hypot(dx, dy);

    this.facingRight = dx > 0;

    // Check Transit Pipe crawling entry ("перемещаться по локациях по трубах")
    if (pipes && pipes.length > 0 && this.pipeCooldown <= 0) {
      for (const pipe of pipes) {
        const dStart = Math.hypot((this.x + this.width / 2) - pipe.startX, (this.y + this.height / 2) - pipe.startY);
        const dEnd = Math.hypot((this.x + this.width / 2) - pipe.endX, (this.y + this.height / 2) - pipe.endY);

        if (dStart < 32) {
          this.pipeTransit = {
            fromX: pipe.startX,
            fromY: pipe.startY,
            toX: pipe.endX,
            toY: pipe.endY,
            progress: 0,
            duration: 1.6,
            targetLocationId: pipe.targetLocationId,
            targetSpawnX: pipe.targetSpawnX,
            targetSpawnY: pipe.targetSpawnY
          };
          this.vx = 0;
          this.vy = 0;
          this.updateProceduralBody();
          return;
        } else if (dEnd < 32 && !pipe.targetLocationId) {
          this.pipeTransit = {
            fromX: pipe.endX,
            fromY: pipe.endY,
            toX: pipe.startX,
            toY: pipe.startY,
            progress: 0,
            duration: 1.6
          };
          this.vx = 0;
          this.vy = 0;
          this.updateProceduralBody();
          return;
        }
      }
    }

    // Pink Lizard Speed: slightly faster than slugcat ("чуть бистріший за слизне кота")
    // Slugcat max base speed is 4.8. Lizard speed is 5.5!
    const runSpeed = 5.5;
    const accel = 0.45;

    // Check Wall / Pole Climbing ("може лазить по стінах і шестах")
    let nearPole = false;
    for (const p of poles) {
      if (Math.abs((this.x + this.width / 2) - p.x) < 28 && this.y + this.height >= p.yMin - 20 && this.y <= p.yMax + 20) {
        nearPole = true;
        // If target is significantly higher or lower, climb pole!
        if (Math.abs(dy) > 35) {
          this.isClimbing = true;
          this.x += (p.x - (this.x + this.width / 2)) * 0.25;
          this.vy = dy < 0 ? -4.2 : 4.2;
        }
        break;
      }
    }

    // Check Wall Climbing on solid barriers / walls
    let nearWall = false;
    for (const plat of platforms) {
      if (plat.type === 'wall' || plat.h >= 60) {
        const xDist = Math.abs((this.x + this.width / 2) - (plat.x + plat.w / 2));
        const yOverlap = this.y + this.height > plat.y && this.y < plat.y + plat.h;
        if (xDist < plat.w / 2 + 20 && yOverlap && Math.abs(dy) > 30) {
          nearWall = true;
          this.isClimbing = true;
          this.vy = dy < 0 ? -4.5 : 4.5;
          break;
        }
      }
    }

    if (!nearPole && !nearWall) {
      this.isClimbing = false;
    }

    // Ground locomotion
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

      // Jump over obstacles / gaps
      if (this.isGrounded && Math.abs(dx) > 20) {
        // Detect wall or ledge directly ahead
        for (const plat of platforms) {
          const aheadX = this.x + (this.facingRight ? this.width + 12 : -12);
          if (aheadX >= plat.x && aheadX <= plat.x + plat.w) {
            if (this.y + this.height > plat.y && this.y + this.height - plat.y < 55) {
              this.vy = -7.2; // Leap over ledge!
              this.isGrounded = false;
              break;
            }
          }
        }
      }
    }

    this.applyGravityAndCollisions(platforms);

    // ---------------- BITE & GRAB LOGIC ----------------
    // "наносить укусом от 0.5 до 1.5 хп урона при укусі може схватить і слизне кот получе 20 сикунд стана і буде в пащі ячера"
    if (!this.grabbedTarget && this.biteCooldown <= 0) {
      const mouthX = this.facingRight ? this.x + this.width : this.x;
      const mouthY = this.y + 12;

      // Check living player
      const distToPlayerMouth = Math.hypot(mouthX - (player.x + player.width / 2), mouthY - (player.y + player.height / 2));
      if (distToPlayerMouth < 32) {
        this.biteCooldown = 2.0;
        this.jawOpen = 0.5;

        // Damage between 0.5 and 1.5 HP
        const dmg = 0.5 + Math.random() * 1.0;
        const willGrab = true;

        if (player.state === 'dead') {
          // Grabbing corpse
          this.grabbedTarget = 'corpse';
        } else {
          // Grabbing living player
          this.grabbedTarget = 'player';
        }

        onPlayerBitten(dmg, willGrab);
      }
    }

    this.updateProceduralBody();
  }

  private applyGravityAndCollisions(platforms: Array<{ x: number; y: number; w: number; h: number; type: string }>) {
    if (!this.isClimbing) {
      this.vy += 0.38;
      if (this.vy > 12) this.vy = 12;
    }

    this.x += this.vx;
    this.y += this.vy;

    this.isGrounded = false;
    for (const plat of platforms) {
      // Wall collision
      if (plat.type === 'wall' || plat.h >= 50) {
        if (this.y + this.height > plat.y + 5 && this.y < plat.y + plat.h - 5) {
          if (this.x + this.width >= plat.x && this.x + this.width - this.vx <= plat.x + 8) {
            this.x = plat.x - this.width;
            this.vx = 0;
          } else if (this.x <= plat.x + plat.w && this.x - this.vx >= plat.x + plat.w - 8) {
            this.x = plat.x + plat.w;
            this.vx = 0;
          }
        }
      }

      // Floor collision
      if (this.x + this.width > plat.x && this.x < plat.x + plat.w) {
        if (this.y + this.height >= plat.y && this.y + this.height - this.vy <= plat.y + 8) {
          this.y = plat.y - this.height;
          this.vy = 0;
          this.isGrounded = true;
        }
      }
    }
  }

  private updateProceduralBody() {
    const headX = this.facingRight ? this.x + this.width : this.x;
    const headY = this.y + 10;

    // Smooth spine kinematics
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

    // Procedural quadruped legs stepping
    const legOffsets = [
      { spineIdx: 1, side: -1 }, // Front-Left
      { spineIdx: 1, side: 1 },  // Front-Right
      { spineIdx: 3, side: -1 }, // Back-Left
      { spineIdx: 3, side: 1 }   // Back-Right
    ];

    for (let i = 0; i < 4; i++) {
      const cfg = legOffsets[i];
      const root = this.spine[cfg.spineIdx];
      const limb = this.limbs[i];

      // Ideal foot plant position
      const stepDist = (this.vx !== 0 ? Math.sign(this.vx) * 16 : 0);
      const idealX = root.x + stepDist;
      const idealY = this.y + this.height;

      const distFromIdeal = Math.hypot(limb.x - idealX, limb.y - idealY);
      if (distFromIdeal > 26) {
        limb.targetX = idealX;
        limb.targetY = idealY;
      }

      // Smooth step interpolation
      limb.x += (limb.targetX - limb.x) * 0.35;
      limb.y += (limb.targetY - limb.y) * 0.35;
    }

    // Tail waving
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
      // Glow and crawl silhouette inside pipe conduit
      ctx.save();
      const cx = this.x + this.width / 2;
      const cy = this.y + this.height / 2;
      ctx.fillStyle = 'rgba(236, 72, 153, 0.75)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Gleaming Cyan Reptile Eye in dark pipe
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(cx + (this.facingRight ? 6 : -6), cy - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();

    // 1. Draw Tail
    ctx.beginPath();
    ctx.strokeStyle = '#ec4899'; // Vibrant pink/magenta
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(this.tail[0].x, this.tail[0].y);
    for (let i = 1; i < this.tail.length; i++) {
      ctx.lineTo(this.tail[i].x, this.tail[i].y);
    }
    ctx.stroke();

    // Tail spines / scales
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

      // Knee / elbow mid joint
      const midX = (root.x + limb.x) / 2 + (i % 2 === 0 ? -4 : 4);
      const midY = (root.y + limb.y) / 2 - 6;

      ctx.strokeStyle = '#db2777';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(root.x, root.y);
      ctx.lineTo(midX, midY);
      ctx.lineTo(limb.x, limb.y);
      ctx.stroke();

      // Sharp clawed foot
      ctx.fillStyle = '#9d174d';
      ctx.beginPath();
      ctx.arc(limb.x, limb.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Draw Lizard Body Segments
    for (let i = this.spine.length - 1; i >= 0; i--) {
      const pt = this.spine[i];
      const rad = 13 - i * 1.4;

      // Dark magenta reptilian underbelly
      ctx.fillStyle = '#9d174d';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y + 2, rad, 0, Math.PI * 2);
      ctx.fill();

      // Pink armored dorsal scales
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rad - 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Sharp dorsal spine spikes
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

    // Hardened triangular head shield
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.moveTo(dir * 18, 0); // snout tip
    ctx.lineTo(dir * 4, -13); // upper brow
    ctx.lineTo(-dir * 12, -9); // back crest
    ctx.lineTo(-dir * 12, 9);
    ctx.lineTo(dir * 4, 11);
    ctx.closePath();
    ctx.fill();

    // Armored snout plate
    ctx.fillStyle = '#be185d';
    ctx.beginPath();
    ctx.moveTo(dir * 18, 0);
    ctx.lineTo(dir * 5, -8);
    ctx.lineTo(dir * 5, 8);
    ctx.closePath();
    ctx.fill();

    // Gleaming Cyan Reptile Eye
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(dir * 4, -5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#083344';
    ctx.beginPath();
    ctx.arc(dir * 4, -5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Lower Jaw (opens wide when biting/carrying)
    const jawSpread = (this.grabbedTarget ? 0.35 : Math.sin(t * 8) * 0.1);
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
