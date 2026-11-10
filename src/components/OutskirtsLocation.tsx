import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Sparkles, Volume2, VolumeX, Zap, Heart, 
  Skull, RotateCcw, AlertTriangle, Activity, X, 
  Sword, CircleDot, User, PlusCircle, Trash2, Crosshair,
  ZoomIn, ZoomOut, Gamepad2, Eye, EyeOff, Maximize2, Minimize2,
  Map as MapIcon, Compass, Globe, Users, Clock, Wifi, ExternalLink,
  Shield, Home, Lock, Unlock, CloudRain, Layers, Moon
} from 'lucide-react';
import { soundEngine } from './RainWorldSynth';
import { musicManager } from '../audio/MusicManager';
import { PinkLizard } from '../entities/PinkLizard';
import { webRTCManager } from '../network/WebRTCManager';
import { distributedSimulation } from '../network/DistributedSimulation';
import { RemotePlayer, NetworkPacket } from '../network/types';
import { 
  CustomLocationData, EditorTransitPipe, PlatformType, 
  PlayerSaveData, DEFAULT_PLAYER_SAVE, BUILTIN_LOCATIONS,
  DEFAULT_OUTSKIRTS_LOCATION 
} from '../types';

interface OutskirtsLocationProps {
  onBack: () => void;
  isSoundMuted: boolean;
  toggleSound: () => void;
  customLocation?: CustomLocationData;
}

export const getRandomCycleSeconds = (): number => {
  // ~8% chance of very rare 12 minutes (720 seconds)
  if (Math.random() < 0.08) {
    return 12 * 60;
  }
  // Otherwise randomized between 3 minutes (180s) and 7 minutes (420s)
  return 180 + Math.floor(Math.random() * (420 - 180 + 1));
};

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 580;

export type SlugcatState = 'normal' | 'stunned' | 'dead';
export type ItemType = 'spear' | 'rock' | 'berry';

interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  type: PlatformType;
  label?: string;
}

interface ClimbPole {
  x: number;
  yMin: number;
  yMax: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  color: string;
}

interface WormGrass {
  x: number;
  height: number;
  phase: number;
  swaySpeed: number;
}

export interface WorldItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  isHeld: boolean;
  heldBy?: 'player' | 'npc' | string;
  isStuck: boolean;
  stuckTarget?: 'player' | 'npc' | string;
  stuckOffsetX?: number;
  stuckOffsetY?: number;
  stuckAngle?: number;
  isAirborne: boolean; // Thrown and active for collision
  thrownBy?: 'player' | 'npc' | string;
  sleeping?: boolean; // Resting on floor/platform, physics calculations paused
}

interface SlugcatSkeleton {
  head: { x: number; y: number; vx: number; vy: number };
  chest: { x: number; y: number; vx: number; vy: number };
  hips: { x: number; y: number; vx: number; vy: number };
  tail: Array<{ x: number; y: number }>;
}

interface DebugTelemetry {
  // Player
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  isGrounded: boolean;
  isClimbing: boolean;
  crouching: boolean;
  facingRight: boolean;
  state: SlugcatState;
  hp: number;
  maxHp: number;
  stunTimer: number;
  heldItem: ItemType | null;

  // NPC
  npcState: SlugcatState;
  npcHp: number;
  npcMaxHp: number;
  npcStunTimer: number;
  npcX: number;
  npcY: number;

  // World Items & Metrics
  spearsCount: number;
  rocksCount: number;
  berriesCount: number;
  foodCount: number;
  isEating: boolean;
  eatingProgress: number;
  fps: number;
  particles: number;
}

export interface LizardStoreEntry {
  id: string;
  roomId: string;
  lizard: PinkLizard;
}

export default function OutskirtsLocation({ onBack, isSoundMuted, toggleSound, customLocation }: OutskirtsLocationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Controls state
  const [controls, setControls] = useState({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
  });

  const controlsRef = useRef(controls);
  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  // Notifications and actions
  const [spawnNotification, setSpawnNotification] = useState(true);
  const [lastAction, setLastAction] = useState<string>('Слимакокіт готовий! Спис і камінь на карті.');

  // Sync music mute state with global sound toggle
  useEffect(() => {
    musicManager.setMuted(isSoundMuted);
  }, [isSoundMuted]);

  // Start exploration in-game music on location enter, transition to menu on exit
  useEffect(() => {
    musicManager.playCategory('game');
    return () => {
      musicManager.playCategory('menu');
    };
  }, []);

  // Fullscreen container and state ("Також додай кнопку яка открива гру на повний екран")
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement
      );

      if (!isFs) {
        const target = containerRef.current || document.documentElement;
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        } else if ((target as any).webkitRequestFullscreen) {
          await (target as any).webkitRequestFullscreen();
        } else if ((target as any).mozRequestFullScreen) {
          await (target as any).mozRequestFullScreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
  };

  const [telemetry, setTelemetry] = useState<DebugTelemetry>({
    x: 200,
    y: 400,
    vx: 0,
    vy: 0,
    speed: 0,
    isGrounded: false,
    isClimbing: false,
    crouching: false,
    facingRight: true,
    state: 'normal',
    hp: 1, // Hidden HP parameter (1 HP)
    maxHp: 1,
    stunTimer: 0, // Hidden stun timer
    heldItem: null,

    npcState: 'normal',
    npcHp: 3, // Hidden NPC HP (3 HP)
    npcMaxHp: 3,
    npcStunTimer: 0, // Hidden NPC stun timer
    npcX: 620,
    npcY: 520,

    spearsCount: 1,
    rocksCount: 1,
    berriesCount: 5,
    foodCount: 3, // 6 slots total requested
    isEating: false,
    eatingProgress: 0,
    fps: 60,
    particles: 0,
  });

  // Persistent Player Save Data: "у кожного игрока свій прогрес він сохраняється только після гібернації"
  // "убержки сохраняють і место нахождения такшо після заходу ти появляєся там де сохранился"
  const [playerSave, setPlayerSave] = useState<PlayerSaveData>(() => {
    try {
      const saved = localStorage.getItem('rain_world_player_progress');
      if (saved) {
        const p = JSON.parse(saved);
        return {
          karma: typeof p.karma === 'number' ? Math.min(5, Math.max(1, p.karma)) : 1,
          maxKarma: 5,
          cycle: typeof p.cycle === 'number' ? Math.max(1, p.cycle) : 1,
          food: typeof p.food === 'number' ? Math.min(7, Math.max(0, p.food)) : 0,
          lastLocationId: p.lastLocationId || 'shelter-outskirts',
          playerSpawnX: typeof p.playerSpawnX === 'number' ? p.playerSpawnX : undefined,
          playerSpawnY: typeof p.playerSpawnY === 'number' ? p.playerSpawnY : undefined,
          hibernated: !!p.hibernated
        };
      }
    } catch (e) {
      console.warn('Failed to load player progress:', e);
    }
    return DEFAULT_PLAYER_SAVE;
  });

  // Current active location (supports built-in locations and custom editor locations)
  const [currentLocation, setCurrentLocation] = useState<CustomLocationData>(() => {
    if (customLocation) return customLocation;
    const targetId = playerSave.lastLocationId || 'shelter-outskirts';
    const found = BUILTIN_LOCATIONS.find(l => l.id === targetId);
    return found || DEFAULT_OUTSKIRTS_LOCATION;
  });
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);

  useEffect(() => {
    if (customLocation) {
      setCurrentLocation(customLocation);
    }
  }, [customLocation]);

  // Synchronize distributedSimulation.currentRoom with currentLocation.id
  // Fixes: "чогось єслі даже іграки у разних локациях їх модельки всеодно видно пофікси це"
  useEffect(() => {
    distributedSimulation.enterRoom(currentLocation.id);
  }, [currentLocation.id]);

  // Food Pips State: 4 required + 3 extra = 7 slots total
  // "зроби слизне коту 4 обязательно ячуєк їди і 3 дополнительних"
  const [foodCount, setFoodCount] = useState<number>(() => Math.min(7, playerSave.food ?? 3));
  const [isEating, setIsEating] = useState<boolean>(false);
  const [eatingProgress, setEatingProgress] = useState<number>(0);
  const [justFilledIndex, setJustFilledIndex] = useState<number | null>(null);

  // Dedicated Shelter Hibernation Chamber state
  // "убержки це не просто якийсь блок а окрема локация куда нада залісти для гібернації"
  const [inShelterChamber, setInShelterChamber] = useState<boolean>(false);
  const inShelterChamberRef = useRef(false);
  useEffect(() => {
    inShelterChamberRef.current = inShelterChamber;
  }, [inShelterChamber]);

  const [isHibernating, setIsHibernating] = useState<boolean>(false);

  // Persisted held item across room changes
  // "пофікси пропажі предметів з рук коли переходиш между локациями"
  const persistedHeldItemRef = useRef<ItemType | null>(null);

  // Cycle items persistence cache across room switches
  // "комнати ресетаються коли заходиш в них ну наприклад я ї'ів ягоду і ушол пришол а вона чогось вернулась на місце"
  const cycleRoomItemsCache = useRef<Map<string, WorldItem[]>>(new Map());

  // Cycle world lizards persistence and ambient simulation across rooms
  // "ящери чогось нічого не роблять пока в тій комнаті нема игрока хоча всі комнати должні работать даже єслі нема игрока просто в упрощоном виді"
  const cycleLizardsRef = useRef<Map<string, LizardStoreEntry>>(new Map());

  // 60-second Combat Music timers: Lizard proximity & PvP throw trajectory
  // "Також єслі ящер рядом то стартує 60 сикундний таймер боя... а з игроками лиге тоді єслі хтото з них кинул придмет в другого єслі гра замітила що по такій траекторії всеодно буде попадания тогда в двох гравців музика боя з таймером 60 сикунд... в разних комнатах в 3 раза бистреє"
  const lizardCombatTimerRef = useRef<number>(0);
  const pvpCombatTimerRef = useRef<number>(0);
  const pvpTargetPeerIdRef = useRef<string | null>(null);

  // Piggyback carrying mechanic
  // "додай кнопку підйома єслі підійти до ігрока який оглушон або який зажав кнопку вниз..."
  const [carriedPlayerId, setCarriedPlayerId] = useState<string | null>(null);
  const carriedPlayerIdRef = useRef<string | null>(null);
  useEffect(() => {
    carriedPlayerIdRef.current = carriedPlayerId;
  }, [carriedPlayerId]);

  const [nearbyPickupCandidate, setNearbyPickupCandidate] = useState<{ id: string; name: string } | null>(null);
  const triggerPiggybackRef = useRef<(() => void) | null>(null);

  // Sleep indicator and multiplayer Spectator Mode
  // "пофікси сон я зажимаю кнопку прижка а слизне кот не спить... а для мультиплеєра це буде як типа він спить то його ранить нельзя... наблюдатель"
  const [sleepProgress, setSleepProgress] = useState<number>(0);
  const [isHoldingSleepBtn, setIsHoldingSleepBtn] = useState<boolean>(false);
  const isHoldingSleepBtnRef = useRef<boolean>(false);
  const [isSpectating, setIsSpectating] = useState<boolean>(false);
  const isSpectatingRef = useRef(false);
  useEffect(() => {
    isSpectatingRef.current = isSpectating;
  }, [isSpectating]);

  const [spectatedPeerId, setSpectatedPeerId] = useState<string | null>(null);
  const spectatedPeerIdRef = useRef<string | null>(null);
  useEffect(() => {
    spectatedPeerIdRef.current = spectatedPeerId;
  }, [spectatedPeerId]);

  // GitHub Version Polling & 5-minute Auto-Restart State
  // "додай щоб гра на клієнті кожні 20 сикунд провіряла версіЮ фАйла на гит хабі єслі там новіша чим та що на клієнті..."
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);
  const [updateDetected, setUpdateDetected] = useState<boolean>(false);
  const clientVersionRef = useRef<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverVer = data.version ? String(data.version) : null;
        if (!serverVer) return;

        if (clientVersionRef.current === null) {
          clientVersionRef.current = serverVer;
        } else if (clientVersionRef.current !== serverVer) {
          if (!updateDetected && !isCancelled) {
            setUpdateDetected(true);
            setUpdateCountdown(prev => (prev === null ? 300 : prev)); // 5 minutes countdown
          }
        }
      } catch {
        // Silently catch network failures
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 20000); // Poll every 20 seconds
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [updateDetected]);

  // Countdown timer for auto-reload
  useEffect(() => {
    if (updateCountdown === null) return;
    if (updateCountdown <= 0) {
      window.location.reload();
      return;
    }

    const timer = setInterval(() => {
      setUpdateCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [updateCountdown]);

  // Emergency shelter save during update countdown:
  // "...і єслі за це время дойти до убержки даже єчлі не наївся або даже єслі ще цикл не закончился гра всеодно сохранить прогрес і перезапустить сторінку тому гравцю"
  useEffect(() => {
    if (updateCountdown !== null && updateCountdown > 0) {
      if (currentLocation.isShelterRoom || inShelterChamber) {
        const emergencySave: PlayerSaveData = {
          karma: playerSave.karma,
          maxKarma: 5,
          cycle: playerSave.cycle + 1,
          food: Math.max(4, foodCount),
          lastLocationId: currentLocation.id,
          playerSpawnX: 160,
          playerSpawnY: 280,
          hibernated: true
        };
        try {
          localStorage.setItem('rain_world_player_progress', JSON.stringify(emergencySave));
        } catch (e) {
          console.warn('Emergency save error:', e);
        }
        alert('⚠️ Ви дісталися укриття! Прогрес екстрено збережено перед оновленням. Перезавантаження гри...');
        window.location.reload();
      }
    }
  }, [updateCountdown, currentLocation.isShelterRoom, inShelterChamber, currentLocation.id, foodCount, playerSave]);

  // Cycle Duration and Countdown: 10 dots around Karma symbol
  const [cycleTotalDuration, setCycleTotalDuration] = useState<number>(() => getRandomCycleSeconds());
  const [cycleSecondsLeft, setCycleSecondsLeft] = useState<number>(() => cycleTotalDuration);
  const cycleSecondsLeftRef = useRef(cycleSecondsLeft);
  useEffect(() => {
    cycleSecondsLeftRef.current = cycleSecondsLeft;
  }, [cycleSecondsLeft]);

  // Lethal Downpour state: starts when cycleSecondsLeft <= 0
  const [stormActive, setStormActive] = useState<boolean>(false);
  const [stormSeconds, setStormSeconds] = useState<number>(0);

  // Live item held state for instant UI response (no telemetry lag)
  const [heldItemType, setHeldItemType] = useState<ItemType | null>(null);

  // Holographic Map Overlay state
  const [showMapOverlay, setShowMapOverlay] = useState<boolean>(false);

  // Death visual state for overlay (player dead)
  const [isDead, setIsDead] = useState(false);

  // Multiplayer & P2P WebRTC mesh state
  const [connectedPeersCount, setConnectedPeersCount] = useState<number>(0);
  const [networkPing, setNetworkPing] = useState<number>(0);
  const [networkStatus, setNetworkStatus] = useState<'disconnected' | 'signaling' | 'connected' | 'error'>('disconnected');

  // Unified multiplayer check across room participation, signaling, connected peers, and host
  // "убери кнопку респавна в мультиплеєрі та остав цю кнопку в синг плеєрі"
  const isMultiplayerActive = Boolean(
    webRTCManager.currentRoomId ||
    networkStatus === 'connected' ||
    networkStatus === 'signaling' ||
    webRTCManager.connectionStatus === 'connected' ||
    connectedPeersCount > 0
  );

  // Camera Zoom & Dynamic Tracking state
  const [zoomLevel, setZoomLevel] = useState<number>(1.65);
  const zoomRef = useRef<number>(1.65);
  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);

  // Touch control deck visibility and size state
  const [showTouchControls, setShowTouchControls] = useState<boolean>(true);
  const [buttonScale, setButtonScale] = useState<'normal' | 'large'>('large');

  // Cycle through zoom levels: 1.65x -> 2.0x -> 1.3x -> 1.0x -> 1.65x
  const cycleZoom = () => {
    setZoomLevel(prev => {
      if (prev >= 1.9) return 1.0;
      if (prev <= 1.05) return 1.35;
      if (prev <= 1.4) return 1.65;
      return 2.0;
    });
  };

  // External trigger hooks for debug buttons & item interaction
  const triggerStunRef = useRef<((duration: number) => void) | null>(null);
  const triggerDamageRef = useRef<((amount: number) => void) | null>(null);
  const triggerReviveRef = useRef<(() => void) | null>(null);
  const triggerResetPosRef = useRef<(() => void) | null>(null);

  // NPC Debug triggers
  const triggerResetNpcRef = useRef<(() => void) | null>(null);
  const triggerStunNpcRef = useRef<((duration: number) => void) | null>(null);
  const triggerDamageNpcRef = useRef<((amount: number) => void) | null>(null);

  // Item Debug triggers
  const triggerSpawnSpearRef = useRef<(() => void) | null>(null);
  const triggerSpawnRockRef = useRef<(() => void) | null>(null);
  const triggerSpawnBerryRef = useRef<(() => void) | null>(null);
  const triggerClearItemsRef = useRef<(() => void) | null>(null);

  // Food Debug triggers
  const triggerAddFoodRef = useRef<(() => void) | null>(null);
  const triggerResetFoodRef = useRef<(() => void) | null>(null);

  // Item gameplay actions (Grab, Throw, Eat)
  const triggerGrabRef = useRef<(() => void) | null>(null);
  const triggerThrowRef = useRef<(() => void) | null>(null);
  const triggerEatRef = useRef<(() => void) | null>(null);
  const triggerHibernateRef = useRef<(() => void) | null>(null);
  const triggerChangeLocationRef = useRef<((loc: CustomLocationData) => void) | null>(null);

  const worldWidth = currentLocation.width || 1000;
  const worldHeight = currentLocation.height || 580;

  // Collision platforms matching active location
  const platforms: Platform[] = currentLocation.platforms.map(p => ({
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    type: p.type,
    label: p.label
  }));

  // Vertical Climbing Poles
  const poles: ClimbPole[] = currentLocation.poles.map(p => ({
    x: p.x,
    yMin: p.yMin,
    yMax: p.yMax
  }));

  // Rain World Transit Shortcut Pipes (Entrance A <-> Entrance B)
  const transitPipes: EditorTransitPipe[] = currentLocation.transitPipes || [];

  // Trigger manual lightning for visual ambiance
  const [isFlashing, setIsFlashing] = useState(false);
  const handleLightningStrike = () => {
    setIsFlashing(true);
    if (!isSoundMuted) {
      soundEngine.playThunder();
    }
    setLastAction('Гроза вдарила по руїнах!');
    setTimeout(() => {
      setIsFlashing(false);
    }, 150 + Math.random() * 150);
  };

  // Main game loop & physics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;
    let lastTime = performance.now();
    let frameCounter = 0;
    let currentFps = 60;
    let telemetryThrottleTimer = 0;
    let eatingUiThrottleTimer = 0;
    let lastBroadcastTime = 0;
    let lastItemsSyncTime = 0;
    let shelterSleepTimer = 0;

    // Dynamic Camera Tracking State
    const initialZoom = zoomRef.current;
    const initialViewW = CANVAS_WIDTH / initialZoom;
    const initialViewH = CANVAS_HEIGHT / initialZoom;
    const startPlayerX = (playerSave.lastLocationId === currentLocation.id && typeof playerSave.playerSpawnX === 'number')
      ? playerSave.playerSpawnX
      : (currentLocation.playerSpawn?.x ?? 180);
    const startPlayerY = (playerSave.lastLocationId === currentLocation.id && typeof playerSave.playerSpawnY === 'number')
      ? playerSave.playerSpawnY
      : (currentLocation.playerSpawn?.y ?? 450);
    const camera = {
      x: Math.max(0, Math.min(worldWidth - initialViewW, (startPlayerX + 12) - initialViewW / 2)),
      y: Math.max(0, Math.min(worldHeight - initialViewH, (startPlayerY + 19) - initialViewH / 2)),
    };

    // Player Physics State with hidden parameters & states
    const player = {
      x: startPlayerX,
      y: startPlayerY,
      vx: 0,
      vy: 0,
      width: 24,
      height: 38,
      isGrounded: false,
      isClimbing: false,
      climbPoleX: 0,
      
      // State machine & Hidden Parameters requested by user:
      state: 'normal' as SlugcatState,
      hp: 1,        // Hidden HP (1 HP)
      maxHp: 1,
      stunTimer: 0, // Stun duration in seconds (strictly hidden from player)
      heldItem: null as WorldItem | null,
      
      // Procedural Skeleton
      head: { x: startPlayerX, y: startPlayerY - 20, vx: 0, vy: 0 },
      chest: { x: startPlayerX, y: startPlayerY - 5, vx: 0, vy: 0 },
      hips: { x: startPlayerX, y: startPlayerY + 10, vx: 0, vy: 0 },
      tail: Array.from({ length: 9 }, (_, i) => ({ x: startPlayerX, y: startPlayerY + 10 + i * 5 })),
      
      facingRight: true,
      earSway: 0,
      crouching: false,
      blinkTimer: 0,
      ragdollAngle: 0,
    };

    // Pink Lizard: First bot creature!
    // "добав перше существо яке буде под контролем бота це розовий ящер... Він ходе не 4 лапах може лазить по стінах і шестах у нього 3.5 хп він чуть бистріший за слизне кота наносить укусом от 0.5 до 1.5 хп урона"
    const denData = currentLocation.lizardDen ?? {
      x: 860,
      y: 110,
      w: 75,
      h: 65,
      spawnX: 840,
      spawnY: 130
    };

    // Cycle world lizards initialization across all rooms:
    // "розмісти для кожної локації спавн ящера рамдомним типа десь він не появился десь він появился"
    if (cycleLizardsRef.current.size === 0) {
      for (const loc of BUILTIN_LOCATIONS) {
        if (!loc.isShelterRoom && Math.random() < 0.70) {
          const locDen = loc.lizardDen ?? {
            x: 860,
            y: 110,
            w: 75,
            h: 65,
            spawnX: 840,
            spawnY: 130
          };
          const liz = new PinkLizard(`pink-lizard-${loc.id}`, locDen.spawnX, locDen.spawnY);
          cycleLizardsRef.current.set(loc.id, {
            id: `pink-lizard-${loc.id}`,
            roomId: loc.id,
            lizard: liz
          });
        }
      }
    }

    // Active lizard currently inhabiting this room (dynamically tracks pipe migration!):
    // "ящери щоб могли по трубам перемещаться і между комнатами"
    let currentLizardEntry: LizardStoreEntry | null = null;
    let pinkLizard: PinkLizard | null = null;

    const refreshActiveRoomLizard = () => {
      currentLizardEntry = null;
      pinkLizard = null;
      for (const entry of cycleLizardsRef.current.values()) {
        if (entry.roomId === currentLocation.id) {
          currentLizardEntry = entry;
          pinkLizard = entry.lizard;
          break;
        }
      }
    };
    refreshActiveRoomLizard();

    // Items list in the world with Randomized Cyclic Spawning and Inter-Room Persistence:
    // "комнати ресетаються коли заходиш в них ну наприклад я ї'ів ягоду і ушол пришол а вона чогось вернулась на місце"
    let itemIdCounter = 1;
    const baseCandidateItems = currentLocation.items && currentLocation.items.length > 0
      ? currentLocation.items
      : [
          { type: 'spear' as ItemType, x: 270, y: 295 },
          { type: 'rock' as ItemType, x: 360, y: 512 },
          { type: 'rock' as ItemType, x: 720, y: 512 },
          { type: 'spear' as ItemType, x: 680, y: 260 },
          { type: 'berry' as ItemType, x: 420, y: 125 },
          { type: 'berry' as ItemType, x: 75, y: 265 },
          { type: 'berry' as ItemType, x: 480, y: 295 },
          { type: 'berry' as ItemType, x: 595, y: 265 },
          { type: 'berry' as ItemType, x: 830, y: 508 },
        ];

    const items: WorldItem[] = [];

    // Restore persisted held item across room transitions
    // "пофікси пропажі предметів з рук коли переходиш между локациями"
    if (persistedHeldItemRef.current) {
      const persistedType = persistedHeldItemRef.current;
      const restoredItem: WorldItem = {
        id: `held-${Date.now()}`,
        type: persistedType,
        x: player.x + (player.facingRight ? 18 : -18),
        y: player.y + 10,
        vx: 0,
        vy: 0,
        rotation: persistedType === 'spear' ? 0.1 : 0,
        isHeld: true,
        heldBy: 'player',
        isStuck: false,
        isAirborne: false,
        sleeping: false,
      };
      player.heldItem = restoredItem;
      items.push(restoredItem);
      setHeldItemType(persistedType);
      persistedHeldItemRef.current = null;
    }

    if (cycleRoomItemsCache.current.has(currentLocation.id)) {
      // Room items have already been spawned during this cycle - load existing state
      const cached = cycleRoomItemsCache.current.get(currentLocation.id)!;
      for (const cit of cached) {
        items.push({ ...cit });
      }
    } else {
      // First visit in this cycle: randomly spawn items based on candidate locations
      baseCandidateItems.forEach((cand, idx) => {
        const spawnChance = idx < 2 ? 0.95 : 0.65;
        if (Math.random() <= spawnChance) {
          items.push({
            id: (cand as any).id || `item-${itemIdCounter++}`,
            type: cand.type as ItemType,
            x: cand.x,
            y: cand.y,
            vx: 0,
            vy: 0,
            rotation: cand.type === 'spear' ? 0.1 : 0,
            isHeld: false,
            isStuck: false,
            isAirborne: false,
            sleeping: true,
          });
        }
      });
      cycleRoomItemsCache.current.set(
        currentLocation.id,
        items.filter(it => !it.isHeld || it.heldBy !== 'player').map(it => ({ ...it }))
      );
    }

    const syncRoomItemsCache = () => {
      cycleRoomItemsCache.current.set(
        currentLocation.id,
        items.filter(it => !it.isHeld || it.heldBy !== 'player').map(it => ({ ...it }))
      );
    };

    // If entering as a client in an existing multiplayer room, clear local static items
    // so we don't display starting positions before the host sends authoritative world items!
    if (webRTCManager.currentRoomId && !webRTCManager.isRoomHost) {
      items.length = 0;
    }

    // Helper to spawn item
    const spawnItem = (type: ItemType, spawnX?: number, spawnY?: number) => {
      const sx = spawnX ?? (player.x + (player.facingRight ? 35 : -35));
      const sy = spawnY ?? (player.y - 10);
      const newItem: WorldItem = {
        id: `item-${itemIdCounter++}`,
        type,
        x: Math.max(20, Math.min(CANVAS_WIDTH - 20, sx)),
        y: Math.max(30, Math.min(CANVAS_HEIGHT - 60, sy)),
        vx: (Math.random() - 0.5) * 2,
        vy: -2,
        rotation: Math.random() * 0.4 - 0.2,
        isHeld: false,
        isStuck: false,
        isAirborne: false,
        sleeping: false,
      };
      items.push(newItem);
      syncRoomItemsCache();
      soundEngine.playPickup();
      const typeLabel = type === 'spear' ? 'Спис' : type === 'rock' ? 'Камінь' : 'Ягоду';
      setLastAction(`Заспавнено: ${typeLabel} на (${Math.round(sx)}, ${Math.round(sy)})`);
      if (webRTCManager.isRoomHost) {
        sendAuthoritativeItemsSync();
      }
    };

    // Damage & Stun application function according to exact user rules:
    // Spear: damage 1 HP, 1.8s stun. If already stunned: +0.8s stun.
    // Rock: damage 0.01 HP, 1.2s stun. If already stunned: +0.5s stun.
    const applyHit = (target: typeof player, weapon: 'spear' | 'rock') => {
      if (target.state === 'dead') return;

      const damage = weapon === 'spear' ? 1.0 : 0.01;
      const initialStun = weapon === 'spear' ? 1.8 : 1.2;
      const addedStun = weapon === 'spear' ? 0.8 : 0.5;

      const wasAlreadyStunned = target.state === 'stunned' || target.stunTimer > 0;

      // Apply HP damage
      target.hp = Math.max(0, target.hp - damage);

      if (target.hp <= 0) {
        target.state = 'dead';
        target.stunTimer = 0;
        target.vy = -3.5;
        player.isClimbing = false;
        setIsDead(true);
        if (weapon === 'spear') {
          soundEngine.triggerConcussionMuffle();
        }
        soundEngine.playHit(weapon);
        soundEngine.playThunder();
        setLastAction(`Слимакокіт загинув від ${weapon === 'spear' ? 'списа' : 'каменя'}!`);
      } else {
        // Target alive, apply stun logic
        if (wasAlreadyStunned) {
          target.stunTimer += addedStun;
          setLastAction(`${weapon === 'spear' ? 'Спис' : 'Камінь'} додав +${addedStun}с стану гравцю!`);
        } else {
          target.state = 'stunned';
          target.stunTimer = initialStun;
          setLastAction(`Слимакокіт оглушений ${weapon === 'spear' ? 'списом (1.8с)' : 'каменем (1.2с)'}!`);
        }
        target.vy = -2.0;
        player.isClimbing = false;
        soundEngine.playHit(weapon);
      }
    };

    // Grab / Pick up item handler (including pulling stuck spears out of bodies/walls)
    let lastGrabTimestamp = 0;
    const handleGrab = () => {
      if (player.state !== 'normal') return;

      const now = performance.now();
      if (now - lastGrabTimestamp < 170) {
        return; // Prevent accidental double-trigger on tap release
      }
      lastGrabTimestamp = now;

      // Cancel eating if currently eating
      if (isEating) {
        isEating = false;
        eatingTimer = 0;
        setIsEating(false);
        setEatingProgress(0);
      }

      // If already holding an item, drop it
      if (player.heldItem) {
        const item = player.heldItem;
        item.isHeld = false;
        item.heldBy = undefined;
        item.isStuck = false;
        item.stuckTarget = undefined;
        item.x = player.x + (player.facingRight ? 18 : -18);
        item.y = player.y + 12;
        item.vx = player.facingRight ? 1.8 : -1.8;
        item.vy = 0.5;
        item.isAirborne = false;
        item.sleeping = false;
        player.heldItem = null;
        setHeldItemType(null);
        soundEngine.playPickup();
        const typeLabel = item.type === 'spear' ? 'Спис' : item.type === 'rock' ? 'Камінь' : 'Ягоду';
        setLastAction(`Покладено: ${typeLabel}`);

        // Broadcast drop across WebRTC
        webRTCManager.broadcastPacket({
          type: 'ITEM_DROP',
          senderId: webRTCManager.localPlayerId,
          itemId: item.id,
          itemType: item.type,
          x: item.x,
          y: item.y,
          vx: item.vx,
          vy: item.vy,
          room: distributedSimulation.currentRoom
        });
        if (webRTCManager.isRoomHost) {
          sendAuthoritativeItemsSync();
        }
        return;
      }

      // Find closest item within reach (generous reach for fluid running, jumping, and momentum)
      let closestItem: WorldItem | null = null;
      let closestDist = 85;

      const px = player.x + player.width / 2;
      const py = player.y + player.height / 2;
      const forwardDir = player.facingRight ? 1 : -1;
      const reachFrontX = px + forwardDir * 18; // extend forward reach in moving/facing direction

      for (const item of items) {
        if (item.isHeld) continue;

        // Effective X on item (account for horizontal spear width of ~36px)
        let effItemX = item.x;
        if (item.type === 'spear' && !item.isStuck) {
          effItemX = Math.max(item.x - 18, Math.min(item.x + 18, reachFrontX));
        }

        const dx = Math.abs(effItemX - reachFrontX);
        const dy = Math.abs(item.y - py);

        // Generous pickup box: 85px horizontal, 60px vertical
        if (dx <= 85 && dy <= 60) {
          const dist = Math.hypot(dx, dy);
          if (dist < closestDist) {
            closestDist = dist;
            closestItem = item;
          }
        }
      }

      if (closestItem) {
        const wasStuckInCreature = closestItem.isStuck && closestItem.stuckTarget;
        const wasStuckInWall = closestItem.isStuck && !closestItem.stuckTarget;

        closestItem.isHeld = true;
        closestItem.heldBy = 'player';
        closestItem.isStuck = false;
        closestItem.stuckTarget = undefined;
        closestItem.isAirborne = false;
        closestItem.sleeping = false;
        closestItem.vx = 0;
        closestItem.vy = 0;
        player.heldItem = closestItem;
        setHeldItemType(closestItem.type);
        soundEngine.playPickup();

        // Broadcast pickup across WebRTC so item is removed from other players' grounds
        webRTCManager.broadcastPacket({
          type: 'ITEM_PICKUP',
          senderId: webRTCManager.localPlayerId,
          itemId: closestItem.id,
          itemType: closestItem.type,
          x: closestItem.x,
          y: closestItem.y,
          room: distributedSimulation.currentRoom
        });
        if (webRTCManager.isRoomHost) {
          sendAuthoritativeItemsSync();
        }

        const typeLabel = closestItem.type === 'spear' ? 'Спис' : closestItem.type === 'rock' ? 'Камінь' : 'Ягоду';

        if (wasStuckInCreature) {
          setLastAction(`Витягнуто ${closestItem.type === 'spear' ? 'спис' : 'предмет'} з тіла!`);
        } else if (wasStuckInWall) {
          setLastAction(`Витягнуто ${closestItem.type === 'spear' ? 'спис' : 'предмет'} зі стіни!`);
        } else if (closestItem.type === 'berry') {
          setLastAction(`Підібрано Ягоду! Натисніть кнопку «ЇСТИ» щоб поповнити їжу.`);
        } else {
          setLastAction(`Підібрано: ${typeLabel} (Клавіша X або кнопка КИД)`);
        }
        syncRoomItemsCache();
      }
    };

    // Throw held item handler:
    // "польот коп'я і камня при броскі должен бути прямо і по чучуть в низ"
    let lastThrowTimestamp = 0;
    const handleThrow = () => {
      if (player.state !== 'normal' || !player.heldItem) return;

      const now = performance.now();
      if (now - lastThrowTimestamp < 170) return;
      lastThrowTimestamp = now;

      // Cancel eating if currently eating
      if (isEating) {
        isEating = false;
        eatingTimer = 0;
        setIsEating(false);
        setEatingProgress(0);
      }

      const item = player.heldItem;
      const dir = player.facingRight ? 1 : -1;

      item.isHeld = false;
      item.heldBy = undefined;
      item.isStuck = false;
      item.stuckTarget = undefined;
      item.x = player.chest.x + (dir * 16);
      item.y = player.chest.y + 1;
      item.isAirborne = true;
      item.sleeping = false;
      item.thrownBy = 'player';

      if (item.type === 'spear') {
        // High speed straight rebar throw with slight downward slant
        item.vx = dir * 26.5;
        item.vy = 0.55; // Straight and slightly downwards!
        item.rotation = Math.atan2(item.vy, item.vx);
      } else if (item.type === 'rock') {
        // Swift direct stone throw with slight downward slant
        item.vx = dir * 18.5;
        item.vy = 0.75; // Straight and slightly downwards!
        item.rotation = 0;
      } else {
        // Berry throw: flies directly with gentle arc
        item.vx = dir * 14.5;
        item.vy = 0.65;
        item.rotation = 0;
      }

      // PvP Threat Detection via Trajectory Prediction:
      // "а з игроками лиге тоді єслі хтото з них кинул придмет в другого єслі гра замітила що по такій траекторії всеодно буде попадания тогда в двох гравців музика боя з таймером 60 сикунд який ресетається при кожном броскі"
      if (item.type === 'spear' || item.type === 'rock') {
        const speed = Math.hypot(item.vx, item.vy);
        if (speed > 1) {
          const dirX = item.vx / speed;
          const dirY = item.vy / speed;

          for (const rp of webRTCManager.remotePlayers.values()) {
            if (rp.state === 'dead' || rp.room !== currentLocation.id) continue;
            const tx = rp.x + 12;
            const ty = rp.y + 19;
            const dx = tx - item.x;
            const dy = ty - item.y;

            // Projection onto throw direction
            const proj = dx * dirX + dy * dirY;
            if (proj > 10 && proj < 750) {
              const closestX = item.x + dirX * proj;
              const closestY = item.y + dirY * proj;
              const perpDist = Math.hypot(tx - closestX, ty - closestY);
              // Hitbox threshold
              if (perpDist < 38) {
                // Trajectory predicted hit!
                pvpCombatTimerRef.current = 60.0;
                pvpTargetPeerIdRef.current = rp.id;
                webRTCManager.broadcastPacket({
                  type: 'PVP_COMBAT_TRIGGER',
                  senderId: webRTCManager.localPlayerId,
                  targetId: rp.id,
                  room: currentLocation.id
                });
                break;
              }
            }
          }
        }
      }

      player.heldItem = null;
      setHeldItemType(null);
      syncRoomItemsCache();
      soundEngine.playThrow();
      const typeLabel = item.type === 'spear' ? 'Спис' : item.type === 'rock' ? 'Камінь' : 'Ягоду';
      setLastAction(`Кинуто: ${typeLabel}!`);

      // Broadcast throw across WebRTC P2P DataChannels
      webRTCManager.broadcastPacket({
        type: 'THROW_ITEM',
        senderId: webRTCManager.localPlayerId,
        itemId: item.id,
        itemType: item.type,
        x: item.x,
        y: item.y,
        vx: item.vx,
        vy: item.vy,
        rotation: item.rotation,
        room: distributedSimulation.currentRoom
      });
      if (webRTCManager.isRoomHost) {
        sendAuthoritativeItemsSync();
      }
    };

    // Eating berry handler:
    let isEating = false;
    let eatingTimer = 0;
    let nibbleTimer = 0;
    let eatingSlowdownTimer = 0;
    let currentFood = foodCount;

    const handleToggleEat = () => {
      if (player.state !== 'normal') return;

      if (!player.heldItem || player.heldItem.type !== 'berry') {
        setLastAction("Щоб їсти, спочатку візьміть ягоду в лапи!");
        return;
      }

      if (currentFood >= 7) {
        setLastAction("Шлунок вже повний! (7 / 7 ячейок: 4 обов'язкові + 3 додаткові)");
        return;
      }

      if (isEating) {
        // User clicked again to stop
        isEating = false;
        eatingTimer = 0;
        setIsEating(false);
        setEatingProgress(0);
        setLastAction("Поїдання ягоди перервано.");
      } else {
        // Start eating process
        isEating = true;
        eatingTimer = 0;
        nibbleTimer = 0;
        setIsEating(true);
        setEatingProgress(0);
        setLastAction("Початок поїдання ягоди... Не рухайтесь під час їжі!");
        if (!isSoundMuted) soundEngine.playEatNibble();
      }
    };

    triggerGrabRef.current = handleGrab;
    triggerThrowRef.current = handleThrow;
    triggerEatRef.current = handleToggleEat;

    // Piggyback carrying mechanic:
    // "додай кнопку підйома єслі підійти до ігрока який оглушон або який зажав кнопку вниз то його можна взять на спину..."
    const handleTogglePiggyback = () => {
      if (carriedPlayerIdRef.current) {
        carriedPlayerIdRef.current = null;
        setCarriedPlayerId(null);
        soundEngine.playPickup();
        setLastAction('Ви скинули гравця зі спини.');
        return;
      }

      // Check nearby eligible peer (crouching or stunned, within 44px in same room)
      const cand = Array.from(webRTCManager.remotePlayers.values()).find(rp => 
        rp.room === currentLocation.id &&
        (rp.stunTimer > 0 || rp.crouching) &&
        Math.hypot((player.x + 12) - (rp.x + 12), (player.y + 19) - (rp.y + 19)) < 44
      );

      if (cand) {
        carriedPlayerIdRef.current = cand.id;
        setCarriedPlayerId(cand.id);
        soundEngine.playPickup();
        setLastAction(`Ви взяли гравця ${cand.name} на спину! (-10% швидкості та стрибка)`);
      }
    };

    triggerPiggybackRef.current = handleTogglePiggyback;

    // Debug trigger assignments
    triggerSpawnSpearRef.current = () => spawnItem('spear');
    triggerSpawnRockRef.current = () => spawnItem('rock');
    triggerSpawnBerryRef.current = () => spawnItem('berry');
    triggerClearItemsRef.current = () => {
      items.length = 0;
      player.heldItem = null;
      setHeldItemType(null);
      if (isEating) {
        isEating = false;
        eatingTimer = 0;
        setIsEating(false);
        setEatingProgress(0);
      }
      setLastAction('Всі предмети очищено з карти');
    };

    triggerAddFoodRef.current = () => {
      currentFood = Math.min(7, currentFood + 1);
      setFoodCount(currentFood);
      setJustFilledIndex(currentFood - 1);
      setTimeout(() => setJustFilledIndex(null), 800);
      if (!isSoundMuted) soundEngine.playEatComplete();
      setLastAction(`Додано +1 ячейку їжі (${currentFood} / 7: ${Math.min(4, currentFood)} обов'язк. + ${Math.max(0, currentFood - 4)} додатк.)`);
    };

    triggerResetFoodRef.current = () => {
      currentFood = 0;
      setFoodCount(0);
      setLastAction('Їжу скинуто до 0 / 7');
    };

    triggerResetNpcRef.current = () => {
      if (pinkLizard) {
        pinkLizard.hp = 3.5;
        pinkLizard.state = 'patrol';
        pinkLizard.stunTimer = 0;
        pinkLizard.x = denData.spawnX || 840;
        pinkLizard.y = denData.spawnY || 130;
        setLastAction('Ящера відновлено (3.5 HP)!');
      }
    };

    triggerStunNpcRef.current = (duration: number) => {
      if (pinkLizard) {
        pinkLizard.stunTimer = Math.max(pinkLizard.stunTimer, duration);
        pinkLizard.state = 'stunned';
        setLastAction(`Ящер оглушений на ${duration.toFixed(1)}с!`);
      }
    };

    triggerDamageNpcRef.current = (amount: number) => {
      if (pinkLizard) {
        pinkLizard.takeDamage(amount, 1.5);
        setLastAction(`Завдано ${amount} шкоди ящеру. HP: ${pinkLizard.hp.toFixed(1)} / 3.5`);
      }
    };

    triggerStunRef.current = (duration: number) => {
      if (player.state === 'dead') return;
      if (player.state === 'stunned') {
        player.stunTimer += duration;
      } else {
        player.state = 'stunned';
        player.stunTimer = duration;
      }
      player.isClimbing = false;
      player.vy = -2.5;
      setLastAction(`Слимакокіт оглушений на ${duration.toFixed(1)}с!`);
    };

    triggerDamageRef.current = (amount: number) => {
      player.hp = Math.max(0, player.hp - amount);
      if (player.hp <= 0) {
        player.state = 'dead';
        player.isClimbing = false;
        player.vy = -3.5;
        setLastAction('Слимакокіт загинув! (Втрачено 1 HP)');
        if (!isSoundMuted) soundEngine.playThunder();
      }
    };

    triggerReviveRef.current = () => {
      player.state = 'normal';
      player.hp = 1;
      player.stunTimer = 0;
      player.ragdollAngle = 0;
      player.x = currentLocation.playerSpawn?.x ?? 180;
      player.y = currentLocation.playerSpawn?.y ?? 450;
      player.vx = 0;
      player.vy = 0;

      // Karma drop penalty upon death before hibernation:
      // "у кожного игрока свій прогрес він сохраняється только після гібернації"
      setPlayerSave(prev => {
        const newKarma = Math.max(1, prev.karma - 1);
        const updated = { ...prev, karma: newKarma, hibernated: false };
        try {
          localStorage.setItem('rain_world_player_progress', JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to save progress on death:', e);
        }
        return updated;
      });

      // Reset cycle timer to fresh randomized duration & stop lethal storm
      const newDuration = getRandomCycleSeconds();
      setCycleTotalDuration(newDuration);
      setCycleSecondsLeft(newDuration);
      setStormActive(false);
      setStormSeconds(0);
      soundEngine.setStormVolume(0);

      // Detach any spears stuck in player and drop them
      items.forEach(it => {
        if (it.stuckTarget === 'player') {
          it.isStuck = false;
          it.stuckTarget = undefined;
          it.y = 512;
          it.vx = (Math.random() - 0.5) * 2;
          it.vy = -1;
        }
      });
      // Reset cycle items and creatures upon death respawn
      cycleRoomItemsCache.current.clear();
      cycleLizardsRef.current.clear();
      lizardCombatTimerRef.current = 0;
      pvpCombatTimerRef.current = 0;
      pvpTargetPeerIdRef.current = null;
      setLastAction('Слимакокіт відродився! Карма знизилась через загибель у циклі.');
      setIsDead(false);
      soundEngine.resetConcussion();
    };

    triggerResetPosRef.current = () => {
      player.x = 180;
      player.y = 450;
      player.vx = 0;
      player.vy = 0;
      player.state = 'normal';
      player.hp = 1;
      player.stunTimer = 0;
      player.ragdollAngle = 0;
      setIsDead(false);
      soundEngine.resetConcussion();
      const vw = CANVAS_WIDTH / zoomRef.current;
      const vh = CANVAS_HEIGHT / zoomRef.current;
      camera.x = Math.max(0, Math.min(CANVAS_WIDTH - vw, (180 + 12) - vw / 2));
      camera.y = Math.max(0, Math.min(CANVAS_HEIGHT - vh, (450 + 19) - vh / 2));
      setLastAction('Позицію скинуто на старт.');
    };

    // ---------------- WebRTC Authoritative Item Synchronizer ----------------
    const sendAuthoritativeItemsSync = (targetPeerId?: string) => {
      const syncPacket: NetworkPacket = {
        type: 'ITEMS_SYNC',
        senderId: webRTCManager.localPlayerId,
        room: distributedSimulation.currentRoom,
        items: items.map(it => ({
          id: it.id,
          type: it.type,
          x: Math.round(it.x * 10) / 10,
          y: Math.round(it.y * 10) / 10,
          vx: Math.round(it.vx * 100) / 100,
          vy: Math.round(it.vy * 100) / 100,
          rotation: it.rotation,
          isHeld: !!it.isHeld,
          heldBy: it.heldBy,
          isStuck: !!it.isStuck,
          stuckTarget: it.stuckTarget,
          isAirborne: !!it.isAirborne
        }))
      };
      if (targetPeerId) {
        webRTCManager.sendPacketToPeer(targetPeerId, syncPacket);
      } else {
        webRTCManager.broadcastPacket(syncPacket);
      }
    };

    // ---------------- WebRTC Multiplayer & Simulation Listeners ----------------
    const unregisterPeerList = webRTCManager.onPeerListChange((peers) => {
      setConnectedPeersCount(peers.length);
      setNetworkPing(webRTCManager.getAveragePing());
      if (webRTCManager.isRoomHost) {
        sendAuthoritativeItemsSync();
      } else if (webRTCManager.connectionStatus === 'connected') {
        webRTCManager.broadcastPacket({
          type: 'REQUEST_ITEMS_SYNC',
          senderId: webRTCManager.localPlayerId,
          room: distributedSimulation.currentRoom
        });
      }
    });

    const unregisterStatus = webRTCManager.onStatusChange((status) => {
      setNetworkStatus(status);
      setConnectedPeersCount(webRTCManager.getConnectedPeerCount());
      setNetworkPing(webRTCManager.getAveragePing());
      if (status === 'connected') {
        if (!webRTCManager.isRoomHost) {
          webRTCManager.broadcastPacket({
            type: 'REQUEST_ITEMS_SYNC',
            senderId: webRTCManager.localPlayerId,
            room: distributedSimulation.currentRoom
          });
        } else {
          sendAuthoritativeItemsSync();
        }
      }
    });

    // Client-Side Hit Registration listener: When an attacker hits ME, apply damage
    const unregisterHit = distributedSimulation.onHitReceived((hit) => {
      if (player.state === 'dead') return;
      if (hit.weaponType === 'spear') {
        applyHit(player, 'spear');
      } else {
        applyHit(player, 'rock');
      }
      pvpCombatTimerRef.current = 60.0;
      pvpTargetPeerIdRef.current = hit.attackerId;
      musicManager.playCategory('battle');
    });

    // P2P DataChannel packet dispatcher
    const unregisterPackets = webRTCManager.onPacket((packet) => {
      if (packet.type === 'REQUEST_ITEMS_SYNC') {
        // If we are host, immediately dispatch authoritative items to this room
        if (webRTCManager.isRoomHost || distributedSimulation.isLocalHostOfRoom()) {
          sendAuthoritativeItemsSync(packet.senderId);
        }
      } else if (packet.type === 'THROW_ITEM') {
        // A remote peer threw an item in our room
        if (packet.room === distributedSimulation.currentRoom) {
          // Re-use existing held item or item matching itemId so it doesn't duplicate
          let existing = items.find(it => (packet.itemId && it.id === packet.itemId) || it.heldBy === packet.senderId);
          if (existing) {
            existing.isHeld = false;
            existing.heldBy = undefined;
            existing.isStuck = false;
            existing.stuckTarget = undefined;
            existing.isAirborne = true;
            existing.sleeping = false;
            existing.thrownBy = 'npc'; // Hostile projectile relative to local player
            existing.x = packet.x;
            existing.y = packet.y;
            existing.vx = packet.vx;
            existing.vy = packet.vy;
            existing.rotation = packet.rotation ?? (packet.itemType === 'spear' ? Math.atan2(packet.vy, packet.vx) : 0);
          } else {
            const remoteItem: WorldItem = {
              id: packet.itemId || `net-throw-${Date.now()}-${Math.random()}`,
              type: packet.itemType,
              x: packet.x,
              y: packet.y,
              vx: packet.vx,
              vy: packet.vy,
              rotation: packet.rotation ?? (packet.itemType === 'spear' ? Math.atan2(packet.vy, packet.vx) : 0),
              isHeld: false,
              isStuck: false,
              isAirborne: true,
              sleeping: false,
              thrownBy: 'npc',
            };
            items.push(remoteItem);
          }

          // Check if remote throw trajectory aims at local player
          const speed = Math.hypot(packet.vx, packet.vy);
          if (speed > 1 && player.state !== 'dead') {
            const dirX = packet.vx / speed;
            const dirY = packet.vy / speed;
            const tx = player.x + 12;
            const ty = player.y + 19;
            const dx = tx - packet.x;
            const dy = ty - packet.y;
            const proj = dx * dirX + dy * dirY;
            if (proj > 10 && proj < 750) {
              const closestX = packet.x + dirX * proj;
              const closestY = packet.y + dirY * proj;
              const perpDist = Math.hypot(tx - closestX, ty - closestY);
              if (perpDist < 38) {
                pvpCombatTimerRef.current = 60.0;
                pvpTargetPeerIdRef.current = packet.senderId;
              }
            }
          }

          // Clear held item in remote player's paws
          const rp = webRTCManager.remotePlayers.get(packet.senderId);
          if (rp) {
            rp.heldItem = null;
          }

          syncRoomItemsCache();
          soundEngine.playThrow();
          setLastAction(`Гравець кинув ${packet.itemType === 'spear' ? 'спис' : 'камінь'}!`);
        }
      } else if (packet.type === 'ITEM_PICKUP') {
        if (packet.room === distributedSimulation.currentRoom) {
          let target = items.find(it => it.id === packet.itemId);
          if (!target) {
            target = items.find(it => !it.isHeld && it.type === packet.itemType && Math.hypot(it.x - packet.x, it.y - packet.y) < 65);
          }
          if (target) {
            target.isHeld = true;
            target.heldBy = packet.senderId;
            target.isStuck = false;
            target.stuckTarget = undefined;
            target.isAirborne = false;
            target.sleeping = false;
            target.vx = 0;
            target.vy = 0;
          }
          const rp = webRTCManager.remotePlayers.get(packet.senderId);
          if (rp) {
            rp.heldItem = packet.itemType;
          }
          syncRoomItemsCache();
          soundEngine.playPickup();
        }
      } else if (packet.type === 'ITEM_DROP') {
        if (packet.room === distributedSimulation.currentRoom) {
          let target = items.find(it => it.id === packet.itemId || it.heldBy === packet.senderId);
          if (target) {
            target.isHeld = false;
            target.heldBy = undefined;
            target.isStuck = false;
            target.stuckTarget = undefined;
            target.isAirborne = false;
            target.sleeping = false;
            target.x = packet.x;
            target.y = packet.y;
            target.vx = packet.vx;
            target.vy = packet.vy;
          } else {
            items.push({
              id: packet.itemId,
              type: packet.itemType,
              x: packet.x,
              y: packet.y,
              vx: packet.vx,
              vy: packet.vy,
              rotation: 0,
              isHeld: false,
              isStuck: false,
              isAirborne: false,
              sleeping: false,
            });
          }
          const rp = webRTCManager.remotePlayers.get(packet.senderId);
          if (rp) {
            rp.heldItem = null;
          }
          syncRoomItemsCache();
          soundEngine.playPickup();
        }
      } else if (packet.type === 'ITEM_CONSUMED') {
        if (packet.room === distributedSimulation.currentRoom) {
          const idx = items.findIndex(it => it.id === packet.itemId || (it.heldBy === packet.senderId && it.type === 'berry'));
          if (idx >= 0) {
            items.splice(idx, 1);
          }
          const rp = webRTCManager.remotePlayers.get(packet.senderId);
          if (rp) {
            rp.heldItem = null;
          }
          syncRoomItemsCache();
        }
      } else if (packet.type === 'PVP_COMBAT_TRIGGER') {
        // Opponent threw aimed projectile at us or we are the intended target!
        if (packet.targetId === webRTCManager.localPlayerId || packet.senderId === pvpTargetPeerIdRef.current) {
          pvpCombatTimerRef.current = 60.0;
          pvpTargetPeerIdRef.current = packet.senderId;
        }
      } else if (packet.type === 'ITEMS_SYNC') {
        if (packet.room === distributedSimulation.currentRoom && !webRTCManager.isRoomHost) {
          const localHeldId = player.heldItem ? player.heldItem.id : null;
          const hostItemMap = new Map(packet.items.map(it => [it.id, it]));

          // Cleanly remove any local world items that are no longer in the host room
          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            if (it.id !== localHeldId && !hostItemMap.has(it.id)) {
              items.splice(i, 1);
            }
          }

          // Authoritatively place and update items matching host coordinates
          for (const sItem of packet.items) {
            if (sItem.id === localHeldId) continue;
            let localItem = items.find(it => it.id === sItem.id);
            if (localItem) {
              localItem.type = sItem.type;
              localItem.x = sItem.x;
              localItem.y = sItem.y;
              localItem.vx = sItem.vx;
              localItem.vy = sItem.vy;
              if (sItem.rotation !== undefined) localItem.rotation = sItem.rotation;
              localItem.isHeld = sItem.isHeld;
              localItem.heldBy = sItem.heldBy;
              localItem.isStuck = sItem.isStuck;
              localItem.stuckTarget = sItem.stuckTarget;
              localItem.isAirborne = sItem.isAirborne;
              localItem.sleeping = !sItem.isAirborne && !sItem.isHeld && Math.abs(sItem.vx) < 0.1 && Math.abs(sItem.vy) < 0.1;
            } else {
              items.push({
                id: sItem.id,
                type: sItem.type,
                x: sItem.x,
                y: sItem.y,
                vx: sItem.vx,
                vy: sItem.vy,
                rotation: sItem.rotation ?? 0,
                isHeld: sItem.isHeld,
                heldBy: sItem.heldBy,
                isStuck: sItem.isStuck,
                stuckTarget: sItem.stuckTarget,
                isAirborne: sItem.isAirborne,
                sleeping: !sItem.isAirborne && !sItem.isHeld,
              });
            }
          }
        }
      } else if (packet.type === 'CYCLE_SYNC') {
        setCycleSecondsLeft(packet.cycleRemainingSeconds);
      }
    });

    // Hidden Room Cycle Timer (Represented as 10 dots around Karma symbol)
    // When timer hits 0, lethal downpour begins!
    const cycleInterval = setInterval(() => {
      setCycleSecondsLeft((prev) => {
        if (prev <= 1) {
          return 0; // Stays at 0 while lethal storm rages until player hibernates or dies
        }
        return prev - 1;
      });
    }, 1000);

    // Transit pipe traversal state (1.2s delayed sliding travel through pipe conduit)
    // "Труби зроби більш похожими на оригінальні з гри і щоб воно не моментально телепортировало"
    interface PipeTransitState {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      progress: number;
      duration: number;
      isShelter: boolean;
      targetLocationId?: string;
      targetSpawnX?: number;
      targetSpawnY?: number;
    }
    let pipeTransit: PipeTransitState | null = null;
    let lastTransitTimestamp = 0;
    let localStormSeconds = 0;
    let pounceChargeTimer = 0;
    let prevJumpPressed = false;
    let denDamageTimer = 0;

    // Worm grass elements along the ground floor
    const wormGrasses: WormGrass[] = [];
    for (let x = 10; x < worldWidth; x += 15) {
      wormGrasses.push({
        x,
        height: 12 + Math.random() * 20,
        phase: Math.random() * Math.PI * 2,
        swaySpeed: 0.03 + Math.random() * 0.04
      });
    }

    // Dynamic storm raindrops (Removed during gameplay per user request: "Убери дождь во время гри")
    const particles: Particle[] = [];

    // Key handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle Holographic Map on 'M' or 'Tab'
      if (e.key.toLowerCase() === 'm' || e.key === 'Tab') {
        e.preventDefault();
        setShowMapOverlay(prev => !prev);
        return;
      }

      // Quick Respawn on 'R' if dead (Singleplayer only!)
      // "убери кнопку респавна в мультиплеєрі та остав цю кнопку в синг плеєрі"
      if ((e.key === 'r' || e.key === 'R') && player.state === 'dead' && !isMultiplayerActive) {
        triggerReviveRef.current?.();
        return;
      }

      // Eat berry on 'E' when holding a berry
      if (e.key.toLowerCase() === 'e' && player.heldItem?.type === 'berry') {
        e.preventDefault();
        triggerEatRef.current?.();
        return;
      }

      // Pickup / Drop item on 'Z', 'C', 'E', or 'F'
      if (['z', 'c', 'e', 'f'].includes(e.key.toLowerCase())) {
        if (e.key.toLowerCase() !== 'z' || player.isGrounded && controlsRef.current.down) {
          triggerGrabRef.current?.();
        }
      }

      // Throw item on 'X', 'Q', or 'Shift'
      if (['x', 'q'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        triggerThrowRef.current?.();
        return;
      }

      // Piggyback / carry action on 'G' ("додай кнопку підйома...")
      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        triggerPiggybackRef.current?.();
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      const key = e.key.toLowerCase();
      if (e.key === 'ArrowLeft' || key === 'a') {
        controlsRef.current.left = true;
        setControls(prev => ({ ...prev, left: true }));
      }
      if (e.key === 'ArrowRight' || key === 'd') {
        controlsRef.current.right = true;
        setControls(prev => ({ ...prev, right: true }));
      }
      if (e.key === 'ArrowUp' || key === 'w') {
        controlsRef.current.up = true;
        setControls(prev => ({ ...prev, up: true }));
      }
      if (e.key === 'ArrowDown' || key === 's') {
        controlsRef.current.down = true;
        setControls(prev => ({ ...prev, down: true }));
      }
      if (e.key === ' ' || key === 'z') {
        controlsRef.current.jump = true;
        setControls(prev => ({ ...prev, jump: true }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === 'ArrowLeft' || key === 'a') {
        controlsRef.current.left = false;
        setControls(prev => ({ ...prev, left: false }));
      }
      if (e.key === 'ArrowRight' || key === 'd') {
        controlsRef.current.right = false;
        setControls(prev => ({ ...prev, right: false }));
      }
      if (e.key === 'ArrowUp' || key === 'w') {
        controlsRef.current.up = false;
        setControls(prev => ({ ...prev, up: false }));
      }
      if (e.key === 'ArrowDown' || key === 's') {
        controlsRef.current.down = false;
        setControls(prev => ({ ...prev, down: false }));
      }
      if (e.key === ' ' || key === 'z') {
        controlsRef.current.jump = false;
        setControls(prev => ({ ...prev, jump: false }));
      }
    };

    const handleBlur = () => {
      controlsRef.current = { left: false, right: false, up: false, down: false, jump: false };
      setControls({ left: false, right: false, up: false, down: false, jump: false });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    let musicCheckTimer = 0;
    let combatTensionTimer = 0;

    // Main animation loop
    const tick = () => {
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      t += 0.05;
      
      frameCounter++;
      if (frameCounter % 30 === 0) {
        currentFps = Math.round(1 / delta);
      }
      refreshActiveRoomLizard();
      const ctrl = controlsRef.current;

      // ---------------- Player State Updates ----------------
      if (player.state === 'stunned') {
        player.stunTimer -= delta;
        if (player.stunTimer <= 0) {
          player.stunTimer = 0;
          player.state = 'normal';
          setLastAction('Слимакокіт прийшов до тями!');
        }
      }

      if (player.hp <= 0 && player.state !== 'dead') {
        player.state = 'dead';
        player.isClimbing = false;
        setLastAction('Слимакокіт загинув!');
      }

      // ---------------- Pink Lizard AI & Locomotion ----------------
      // Quadruped bot creature: climbs walls/poles, 3.5 HP, bite 0.5-1.5, 20s stun on slugcat, drags to den
      if (pinkLizard) {
        const peersList = Array.from(webRTCManager.remotePlayers.values()).map(p => ({
          id: p.id,
          name: p.name || 'Слимакокіт',
          x: p.x,
          y: p.y,
          hp: p.hp ?? 1,
          state: p.state || 'normal',
          room: p.room || currentLocation.id,
        })).filter(p => p.room === currentLocation.id);

        pinkLizard.update(
          delta,
          player,
          peersList,
          platforms,
          poles,
          denData,
          (damage: number, willGrab: boolean) => {
            // Lizard bite!
            soundEngine.playCreatureHurt();
            player.hp = Math.max(0, player.hp - damage);
            player.state = player.hp <= 0 ? 'dead' : 'stunned';
            player.stunTimer = 20.0; // 20 seconds of stun in lizard mouth!
            if (player.hp <= 0) {
              setIsDead(true);
              setLastAction(`Розовий ящер вкусив на смерть (${damage.toFixed(2)} урону)!`);
            } else {
              setLastAction(`Розовий ящер вкусив (${damage.toFixed(2)} урону) і схопив у пащу! Стан 20с!`);
            }
          },
          () => {
            // Lizard reached den with corpse or prey
            soundEngine.playCreatureHurt();
          },
          undefined,
          transitPipes,
          (targetRoomId: string, spawnX?: number, spawnY?: number) => {
            // Lizard crawled through pipe into another room!
            // "улучшить ии ящера щоб он міг перемещаться по локациях по трубах"
            const targetLoc = BUILTIN_LOCATIONS.find(l => l.id === targetRoomId);
            if (targetLoc && currentLizardEntry) {
              setLastAction(`Ящер проліз через трубу у кімнату: ${targetLoc.name}!`);
              currentLizardEntry.roomId = targetRoomId;
              const lizX = spawnX ?? (targetLoc.playerSpawn?.x ?? 200);
              const lizY = spawnY ?? (targetLoc.playerSpawn?.y ?? 300);
              pinkLizard.x = lizX;
              pinkLizard.y = lizY;

              if (pinkLizard.grabbedTarget === 'player') {
                player.x = lizX;
                player.y = lizY;
                if (triggerChangeLocationRef.current) {
                  triggerChangeLocationRef.current(targetLoc);
                } else {
                  handleSelectLocation(targetLoc);
                }
              }
            }
          },
          () => {
            // Prey deposited in lizard den!
            // "залазив туда з играком оставлял його там вилазил і уходил дальше полювать"
            setLastAction("Ящер заліз у лігво, залишив здобич, виліз назовні та пішов далі полювати!");
          }
        );
      }

      // ---------------- Ambient World Simulation for Lizards in Other Rooms ----------------
      // "ящери чогось нічого не роблять пока в тій комнаті нема игрока хоча всі комнати должні работать даже єслі нема игрока просто в упрощоном виді"
      cycleLizardsRef.current.forEach((entry: LizardStoreEntry) => {
        if (entry.roomId === currentLocation.id) return;
        const ambLiz = entry.lizard;
        if (ambLiz.state === 'dead') return;

        if (ambLiz.stunTimer > 0) {
          ambLiz.stunTimer = Math.max(0, ambLiz.stunTimer - delta);
          if (ambLiz.stunTimer === 0 && ambLiz.state === 'stunned') {
            ambLiz.state = 'patrol';
          }
          return;
        }

        if (ambLiz.pipeCooldown > 0) {
          ambLiz.pipeCooldown -= delta;
        }

        // Ambient patrol locomotion
        ambLiz.x += (ambLiz.facingRight ? 1 : -1) * (delta * 95);
        const roomDef = BUILTIN_LOCATIONS.find(l => l.id === entry.roomId);
        const roomWidth = roomDef ? roomDef.width : 1200;
        if (ambLiz.x < 60) {
          ambLiz.x = 60;
          ambLiz.facingRight = true;
        } else if (ambLiz.x > roomWidth - 80) {
          ambLiz.x = roomWidth - 80;
          ambLiz.facingRight = false;
        }

        // Ambient inter-room pipe transit
        if (ambLiz.pipeCooldown <= 0 && roomDef && roomDef.transitPipes && roomDef.transitPipes.length > 0) {
          const interPipes = roomDef.transitPipes.filter(p => !!p.targetLocationId);
          if (interPipes.length > 0 && Math.random() < 0.0035) {
            const chosenPipe = interPipes[Math.floor(Math.random() * interPipes.length)];
            if (chosenPipe.targetLocationId) {
              entry.roomId = chosenPipe.targetLocationId;
              ambLiz.pipeCooldown = 12.0;
              const destRoom = BUILTIN_LOCATIONS.find(l => l.id === chosenPipe.targetLocationId);
              ambLiz.x = chosenPipe.targetSpawnX ?? (destRoom?.playerSpawn?.x ?? 200);
              ambLiz.y = chosenPipe.targetSpawnY ?? (destRoom?.playerSpawn?.y ?? 300);
              ambLiz.vx = 0;
              ambLiz.vy = 0;
            }
          }
        }
      });

      // ---------------- Visible Lizard Den Mechanics ----------------
      // "і зроби ящеру свою убержку ну видиму куда даже зайти можна но игрока якого заніс туда ящер буде медлено получать урон 0.01 урон в 3 сикунди та стан ставитиметься на паузу поки він там"
      const isInsideLizardDen = Boolean(
        currentLocation.isLizardDenRoom ||
        (!currentLocation.isShelterRoom && denData && (
          player.x + 12 >= denData.x &&
          player.x + 12 <= denData.x + denData.w &&
          player.y + 19 >= denData.y &&
          player.y + 19 <= denData.y + denData.h + 24
        ))
      );

      if (isInsideLizardDen && player.state !== 'dead') {
        // Stun timer is paused while inside lizard den!
        if (player.stunTimer > 0) {
          player.stunTimer += delta;
        }

        denDamageTimer += delta;
        if (denDamageTimer >= 3.0) {
          denDamageTimer = 0;
          player.hp = Math.max(0, player.hp - 0.01);
          soundEngine.playCreatureHurt();
          setLastAction("Лігво ящера повільно роз'їдає слимакокота (-0.01 HP / 3с, стан на паузі)");
          if (player.hp <= 0) {
            player.state = 'dead';
            setIsDead(true);
          }
        }
      } else {
        denDamageTimer = 0;
      }

      // Dynamic Health Filter for Music:
      // "чим менше хп тип приглушоней звук ну ніби під водою"
      musicManager.setHealthFilter(player.hp / player.maxHp);

      // ---------------- Dynamic Music Category Switching with Exact 60s Timers ----------------
      // Lizard Proximity Combat Timer:
      // "Також єслі ящер рядом то стартує 60 сикундний таймер боя даже єслі він не агресивний поки цей таймер іде музика боя не завершається"
      if (pinkLizard && pinkLizard.state !== 'dead') {
        const distToLizard = Math.hypot((player.x + 12) - (pinkLizard.x + 26), (player.y + 19) - (pinkLizard.y + 12));
        if (distToLizard < 480 || pinkLizard.grabbedTarget === 'player' || pinkLizard.state === 'hunt') {
          lizardCombatTimerRef.current = 60.0;
        }
      }

      if (lizardCombatTimerRef.current > 0) {
        lizardCombatTimerRef.current = Math.max(0, lizardCombatTimerRef.current - delta);
      }

      // PvP Combat Timer (drains 3x faster if players are in different rooms):
      // "єслі вони находяться в разних комнатах воно таймер іде в 3 раза бистреє"
      if (pvpCombatTimerRef.current > 0) {
        const targetPeer = pvpTargetPeerIdRef.current ? webRTCManager.remotePlayers.get(pvpTargetPeerIdRef.current) : null;
        const inSameRoom = targetPeer && targetPeer.room === currentLocation.id;
        const drainRate = inSameRoom ? 1.0 : 3.0;
        pvpCombatTimerRef.current = Math.max(0, pvpCombatTimerRef.current - delta * drainRate);
      }

      musicCheckTimer += delta;
      if (musicCheckTimer > 0.3) {
        musicCheckTimer = 0;
        const inCombat = (lizardCombatTimerRef.current > 0) || (pvpCombatTimerRef.current > 0);
        musicManager.playCategory(inCombat ? 'battle' : 'game');
      }

      // ---------------- Player Physics Updates ----------------
      const canControl = player.state === 'normal';

      // Lethal Downpour upon cycle expiry:
      // "коли вийде таймер цикла по чучуть буде начинаться злива яка сначала як простий дощ слабий а потом буде сильнішати з каждою сикундою буде наносить пасивний урон но без оглужения (щоб убить фулового игрока ну який урона не получал от чогось другого нужно 60 сикунд)"
      if (cycleSecondsLeftRef.current <= 0) {
        localStormSeconds += delta;
        setStormActive(true);
        setStormSeconds(localStormSeconds);
        const stormIntensity = Math.min(1.0, localStormSeconds / 25.0);
        soundEngine.setStormVolume(stormIntensity * 0.85);

        // Passive damage over time WITHOUT stun:
        // Strictly 60 seconds to kill full-health player (1.0 HP)
        // Protected if inside shelter chamber or dedicated shelter room or subterranean lizard den!
        if (!inShelterChamberRef.current && !currentLocation.isShelterRoom && !currentLocation.isLizardDenRoom && player.state === 'normal') {
          const dps = 1.0 / 60.0;
          player.hp = Math.max(0, player.hp - dps * delta);
          if (player.hp <= 0) {
            player.state = 'dead';
            player.vy = -2.5;
            setLastAction('Нищівна злива змила слимакокота! Цикл закінчено трагічно.');
            if (!isSoundMuted) soundEngine.playThunder();
          }
        }
      } else {
        if (localStormSeconds > 0) {
          localStormSeconds = 0;
          setStormActive(false);
          setStormSeconds(0);
          soundEngine.setStormVolume(0);
        }
      }

      // Pipe Conduit Transit: 1.2s delayed sliding travel through pipe
      if (pipeTransit) {
        pipeTransit.progress += delta / pipeTransit.duration;
        const p = Math.min(1, pipeTransit.progress);
        const curX = pipeTransit.startX + (pipeTransit.endX - pipeTransit.startX) * p;
        const curY = pipeTransit.startY + (pipeTransit.endY - pipeTransit.startY) * p;
        player.x = curX - player.width / 2;
        player.y = curY - player.height / 2;
        player.vx = 0;
        player.vy = 0;
        player.isClimbing = false;
        player.isGrounded = false;

        if (p >= 1) {
          // Inter-room transit between locations / maps!
          // "зашол в ту трубу і ти уже на другій карті я саме про це і кажу"
          if (pipeTransit.targetLocationId) {
            const targetId = pipeTransit.targetLocationId;
            const targetLoc = BUILTIN_LOCATIONS.find(l => l.id === targetId);
            if (targetLoc) {
              const spawnX = pipeTransit.targetSpawnX ?? targetLoc.playerSpawn.x;
              const spawnY = pipeTransit.targetSpawnY ?? targetLoc.playerSpawn.y;
              player.x = spawnX;
              player.y = spawnY;
              
              // Direction polish: if spawning on left half of room, pop out moving right; if right half, pop out moving left
              const exitDir = spawnX < (targetLoc.width / 2) ? 1 : -1;
              player.vx = exitDir * 2.5;
              player.vy = -1.6;
              player.facingRight = exitDir > 0;
              
              soundEngine.playPickup();
              distributedSimulation.enterRoom(targetLoc.id);
              if (player.heldItem) {
                persistedHeldItemRef.current = player.heldItem.type;
              }
              setCurrentLocation(targetLoc);
              setInShelterChamber(!!targetLoc.isShelterRoom);
              pipeTransit = null;
              lastTransitTimestamp = performance.now();
              setLastAction(targetLoc.isShelterRoom
                ? 'Ви залізли у безпечне укриття для гібернації!'
                : `Ви перейшли у локацію: ${targetLoc.name}!`);
              return;
            }
          }

          if (pipeTransit.isShelter) {
            setInShelterChamber(true);
            inShelterChamberRef.current = true;
            pipeTransit = null;
            setLastAction('Заліз у шлюз укриття для гібернації!');
          } else {
            const exitDir = pipeTransit.endX > pipeTransit.startX ? 1 : -1;
            player.x = pipeTransit.endX - player.width / 2 + exitDir * 8;
            player.y = pipeTransit.endY - player.height / 2;
            player.vx = exitDir * 3.2;
            player.vy = -2.2;
            soundEngine.playPickup();
            pipeTransit = null;
            lastTransitTimestamp = performance.now();
            setLastAction('Виліз із труби-переходу!');
          }
        }
      }

      // Update temporary slowdown from interrupted eating
      if (eatingSlowdownTimer > 0) {
        eatingSlowdownTimer -= delta;
        if (eatingSlowdownTimer < 0) eatingSlowdownTimer = 0;
      }

      // Check eating interruption if player attempts to move
      // "І щоб нельзя було двигаться коли їсиш (єслі двинулся то персонаж перестає їсти і чучуть времено замедляється) ягоду"
      if (isEating && canControl) {
        const wantsToMove = ctrl.left || ctrl.right || ctrl.up || ctrl.down || ctrl.jump;
        if (wantsToMove) {
          isEating = false;
          eatingTimer = 0;
          setIsEating(false);
          setEatingProgress(0);
          eatingSlowdownTimer = 1.0; // 1 second of slowdown penalty
          player.vx *= 0.2; // sudden stumble / momentum loss
          setLastAction("Рух перервав їжу! Слимакокіт спіткнувся.");
        }
      }

      // Pole Grabbing logic (only if normal and alive and not eating)
      let touchingPole: ClimbPole | null = null;
      if (canControl && !isEating) {
        for (const p of poles) {
          const horizontalDist = Math.abs((player.x + player.width / 2) - p.x);
          if (horizontalDist < 24 && player.y + player.height >= p.yMin - 15 && player.y <= p.yMax + 15) {
            touchingPole = p;
            break;
          }
        }

        if (touchingPole) {
          if (ctrl.up || ctrl.down) {
            if (!player.isClimbing) {
              player.isClimbing = true;
              player.x = touchingPole.x - player.width / 2;
              player.vx = 0;
              player.vy = 0;
              setLastAction('Карабкається по жердині');
            }
          }
        } else {
          player.isClimbing = false;
        }
      } else {
        player.isClimbing = false;
      }

      // Locomotion (climbing or ground/airborne/eating)
      if (player.isClimbing && touchingPole && canControl) {
        player.x += ((touchingPole.x - player.width / 2) - player.x) * 0.35;

        if (ctrl.up) {
          player.y -= 4.4;
          player.facingRight = true;
          if (player.y < touchingPole.yMin) player.y = touchingPole.yMin;
        } else if (ctrl.down) {
          player.y += 4.4;
          if (player.y > touchingPole.yMax - player.height) {
            player.y = touchingPole.yMax - player.height;
            player.isClimbing = false;
          }
        }

        if (ctrl.left && !ctrl.up && !ctrl.down) {
          player.isClimbing = false;
          player.vx = -3.2;
          player.facingRight = false;
        } else if (ctrl.right && !ctrl.up && !ctrl.down) {
          player.isClimbing = false;
          player.vx = 3.2;
          player.facingRight = true;
        }

        if (ctrl.jump) {
          player.isClimbing = false;
          player.vy = -8.5;
          if (ctrl.left) {
            player.vx = -6.0;
            player.facingRight = false;
          } else if (ctrl.right) {
            player.vx = 6.0;
            player.facingRight = true;
          } else {
            player.vx = player.facingRight ? 3.5 : -3.5;
          }
          setLastAction('Стрибок з жердини!');
          if (!isSoundMuted) {
            soundEngine.playThunder(); 
          }
        }
      } else {
        // Non-climbing: Eating immobility OR normal locomotion OR stunned/dead
        if (isEating) {
          // Player is immobilized while eating: sits in place, chewing
          player.isClimbing = false;
          player.crouching = true;
          player.vx *= 0.6;
          if (Math.abs(player.vx) < 0.05) player.vx = 0;
        } else if (canControl) {
          // Ground & Airborne Locomotion with eatingSlowdownTimer effect
          const isCarrying = !!carriedPlayerIdRef.current;
          const carryDebuff = isCarrying ? 0.90 : 1.0; // 10% debuff to speed and jump height!
          const isSlowed = eatingSlowdownTimer > 0;
          const accel = (isSlowed ? 0.22 : 0.55) * carryDebuff;
          const baseWalkSpeed = (player.crouching ? 2.2 : 4.8) * carryDebuff;
          const maxWalkSpeed = (isSlowed ? Math.min(baseWalkSpeed, 2.0) : baseWalkSpeed);
          const friction = player.isGrounded ? (isSlowed ? 0.74 : 0.82) : 0.98;

          // 1. Persistent Crawl / Crouch State Transitions
          // "зроби щоб кнопка присяда ну та що ↓ ложила персонажа ну тоєсть він полз поки не нажме ↑ або прижок"
          if (ctrl.down && player.isGrounded) {
            player.crouching = true;
          }

          // Standing up on pressing UP:
          if (ctrl.up && player.crouching) {
            player.crouching = false;
            pounceChargeTimer = 0;
          }

          if (!player.isGrounded) {
            pounceChargeTimer = 0;
          }

          // 2. Pounce Charging Mechanics (Ривок):
          // "но єслі при ползані зажать прижок на 1.8 сикунд(цей таймер скритий) то персонаж зробе високий ривок в ту сторону яку смотрел"
          const isChargingPounce = player.crouching && player.isGrounded && ctrl.jump;

          if (isChargingPounce) {
            // Bracing for pounce: slow down horizontal momentum to zero
            player.vx *= 0.55;
            if (Math.abs(player.vx) < 0.05) player.vx = 0;
            pounceChargeTimer += delta;

            // Auto-launch if held past 2.0s
            if (pounceChargeTimer >= 2.0) {
              const dir = player.facingRight ? 1 : -1;
              player.vx = dir * 11.5 * carryDebuff;
              player.vy = -7.6 * carryDebuff;
              player.isGrounded = false;
              player.crouching = false;
              pounceChargeTimer = 0;
              soundEngine.playThunder();
              setLastAction('Високий ривок Слимакокота (Pounce)!');
            }
          } else {
            // Jump released or was previously charging
            if (pounceChargeTimer >= 1.8) {
              // Successfully charged for >= 1.8 seconds: unleash high pounce leap!
              const dir = player.facingRight ? 1 : -1;
              player.vx = dir * 11.5 * carryDebuff;
              player.vy = -7.6 * carryDebuff;
              player.isGrounded = false;
              player.crouching = false;
              pounceChargeTimer = 0;
              soundEngine.playThunder();
              setLastAction('Високий ривок Слимакокота (Pounce)!');
            } else if (pounceChargeTimer > 0 && pounceChargeTimer < 1.8 && !ctrl.jump && prevJumpPressed) {
              // Quick tap of jump from crawl: stand up and perform normal jump
              player.vy = (isSlowed ? -6.8 : -8.5) * carryDebuff;
              player.isGrounded = false;
              player.crouching = false;
              pounceChargeTimer = 0;
              if (!isSoundMuted) soundEngine.playThunder();
              setLastAction('Стрибок з положення лежачи!');
            } else {
              pounceChargeTimer = 0;

              // Horizontal movement (crawling if crouching, running if standing)
              if (ctrl.left) {
                player.vx -= accel;
                player.facingRight = false;
              } else if (ctrl.right) {
                player.vx += accel;
                player.facingRight = true;
              } else {
                player.vx *= friction;
              }

              // Normal Jump when standing (with 10% carry penalty if carrying peer)
              if (ctrl.jump && !prevJumpPressed && player.isGrounded) {
                player.vy = (isSlowed ? -6.8 : -8.5) * carryDebuff;
                player.isGrounded = false;
                player.crouching = false;
                setLastAction(isSlowed ? 'Важкий стрибок...' : (isCarrying ? 'Стрибок із гравцем на спині (-10%)' : 'Класичний стрибок Слимакокота!'));
                if (!isSoundMuted) {
                  soundEngine.playThunder();
                }
              }
            }
          }

          if (player.vx > maxWalkSpeed) player.vx = maxWalkSpeed;
          if (player.vx < -maxWalkSpeed) player.vx = -maxWalkSpeed;

          // Pin carried player to carrier's back
          if (carriedPlayerIdRef.current) {
            const carriedPeer = webRTCManager.remotePlayers.get(carriedPlayerIdRef.current);
            if (carriedPeer) {
              carriedPeer.x = player.x + (player.facingRight ? -4 : 4);
              carriedPeer.y = player.y - 14;
            }
          }

          // If local player is being carried by remote player:
          const carrier = Array.from(webRTCManager.remotePlayers.values()).find(rp => rp.carryingPeerId === webRTCManager.localPlayerId);
          if (carrier) {
            if (ctrl.jump && !prevJumpPressed) {
              player.vy = -7.5;
              player.vx = player.facingRight ? 4.5 : -4.5;
              player.isGrounded = false;
              soundEngine.playThunder();
              setLastAction('Ви зістрибнули зі спини гравця!');
            } else {
              player.x = carrier.x + (carrier.facingRight ? -4 : 4);
              player.y = carrier.y - 14;
            }
          }

          // Find nearby candidate for piggyback pickup prompt
          const pickupCand = Array.from(webRTCManager.remotePlayers.values()).find(rp => 
            rp.room === currentLocation.id &&
            (rp.stunTimer > 0 || rp.crouching) &&
            Math.hypot((player.x + 12) - (rp.x + 12), (player.y + 19) - (rp.y + 19)) < 44
          );
          setNearbyPickupCandidate(pickupCand ? { id: pickupCand.id, name: pickupCand.name } : null);

          prevJumpPressed = ctrl.jump;
        } else {
          // Stunned or dead: apply inertia and friction
          const friction = player.isGrounded ? 0.92 : 0.98;
          player.vx *= friction;
          player.crouching = false;
          pounceChargeTimer = 0;
          prevJumpPressed = false;
        }

        // Gravity
        if (!player.isGrounded) {
          player.vy += 0.38;
          if (player.vy > 12) player.vy = 12;
        }

        // Apply movement
        player.x += player.vx;
        player.y += player.vy;

        // Platform & Wall collisions
        player.isGrounded = false;
        for (const plat of platforms) {
          const isSolidWall = plat.type === 'wall' || plat.type === 'shelter';

          // Side wall collision check for solid walls, obstacles, and monolith barriers
          if (isSolidWall || plat.h >= 45) {
            const yOverlap = player.y + player.height > plat.y + 6 && player.y < plat.y + plat.h - 6;
            if (yOverlap) {
              // Left collision: player moving right hits left side of wall
              if (player.x + player.width >= plat.x && (player.x + player.width - player.vx) <= plat.x + 8) {
                player.x = plat.x - player.width;
                player.vx = 0;
              }
              // Right collision: player moving left hits right side of wall
              else if (player.x <= plat.x + plat.w && (player.x - player.vx) >= plat.x + plat.w - 8) {
                player.x = plat.x + plat.w;
                player.vx = 0;
              }
            }
          }

          const xIntersect = player.x + player.width > plat.x && player.x < plat.x + plat.w;
          if (xIntersect) {
            const wasAbove = (player.y + player.height - player.vy) <= plat.y + 4;
            const isInside = player.y + player.height >= plat.y && player.y < plat.y + plat.h;
            
            if (wasAbove && isInside && player.vy >= 0) {
              player.y = plat.y - player.height;
              player.vy = 0;
              player.isGrounded = true;
            }
            
            const wasBelow = (player.y - player.vy) >= plat.y + plat.h - 4;
            const isInsideCeil = player.y < plat.y + plat.h && player.y + player.height > plat.y;
            if (wasBelow && isInsideCeil && player.vy < 0) {
              player.y = plat.y + plat.h;
              player.vy = 0.1;
            }
          }
        }

        // Screen boundary collisions across dynamic world width
        if (player.x < 10) {
          player.x = 10;
          player.vx = 0;
        }
        if (player.x > worldWidth - player.width - 10) {
          player.x = worldWidth - player.width - 10;
          player.vx = 0;
        }

        // Dedicated Shelter Room physical hibernation:
        // "пофікси сон я зажимаю кнопку прижка а слизне кот не спить... а для мультиплеєра це буде як типа він спить то його ранить нельзя..."
        if ((currentLocation.isShelterRoom || inShelterChamber) && canControl && !isHibernating && !pipeTransit) {
          const isHoldingSleep = ctrl.jump || ctrl.down || player.crouching || isHoldingSleepBtnRef.current;
          if (isHoldingSleep && player.isGrounded) {
            player.vx *= 0.5; // settle into resting posture
            shelterSleepTimer += delta;
            setSleepProgress(Math.min(1, shelterSleepTimer / 1.5));
            if (shelterSleepTimer >= 1.5) {
              shelterSleepTimer = 0;
              setSleepProgress(0);
              isHoldingSleepBtnRef.current = false;
              setIsHoldingSleepBtn(false);
              triggerHibernateRef.current?.();
            }
          } else {
            shelterSleepTimer = Math.max(0, shelterSleepTimer - delta * 2.5);
            setSleepProgress(Math.min(1, shelterSleepTimer / 1.5));
          }

          // Cycle timer ended while inside shelter
          if (cycleSecondsLeftRef.current <= 0) {
            triggerHibernateRef.current?.();
          }
        } else {
          shelterSleepTimer = 0;
          setSleepProgress(0);
        }

        // Rain World shortcut transit pipes check (delayed 1.2s conduit travel instead of instant teleport)
        if (canControl && !isEating && !pipeTransit && transitPipes.length > 0) {
          const now = performance.now();
          if (now - lastTransitTimestamp > 1200) {
            const px = player.x + player.width / 2;
            const py = player.y + player.height / 2;
            for (const pipe of transitPipes) {
              const distA = Math.hypot(px - pipe.startX, py - pipe.startY);
              const distB = Math.hypot(px - pipe.endX, py - pipe.endY);
              if (distA < 28) {
                lastTransitTimestamp = now;
                pipeTransit = {
                  startX: pipe.startX,
                  startY: pipe.startY,
                  endX: pipe.endX,
                  endY: pipe.endY,
                  progress: 0,
                  duration: 1.1,
                  isShelter: !!pipe.isShelterPipe,
                  targetLocationId: pipe.targetLocationId,
                  targetSpawnX: pipe.targetSpawnX,
                  targetSpawnY: pipe.targetSpawnY
                };
                soundEngine.playPipeTravel();
                setLastAction(pipe.isShelterPipe 
                  ? 'Залізає у герметичний шлюз укриття...' 
                  : pipe.targetLocationId 
                    ? `Залізає у перехід: ${pipe.label || 'на іншу карту'}...` 
                    : 'Залізає у трубу-перехід...');
                break;
              } else if (distB < 28 && !pipe.isShelterPipe && !pipe.targetLocationId) {
                lastTransitTimestamp = now;
                pipeTransit = {
                  startX: pipe.endX,
                  startY: pipe.endY,
                  endX: pipe.startX,
                  endY: pipe.startY,
                  progress: 0,
                  duration: 1.1,
                  isShelter: false
                };
                soundEngine.playPipeTravel();
                setLastAction('Залізає у трубу-перехід...');
                break;
              }
            }
          }
        }
      }

      // ---------------- Update World Items Physics & Collisions ----------------
      for (const item of items) {
        if (item.isHeld) {
          item.sleeping = false;
          // Attached to carrier paws
          if (item.heldBy === 'player') {
            const dir = player.facingRight ? 1 : -1;
            item.x = player.chest.x + (dir * 9);
            item.y = player.chest.y + 3;
            item.rotation = dir > 0 ? 0.3 : -0.3;
          } else if (item.heldBy) {
            const rp = webRTCManager.remotePlayers.get(item.heldBy);
            if (rp) {
              const dir = rp.facingRight ? 1 : -1;
              const rcx = Number.isFinite(rp.chest?.x) ? rp.chest.x : rp.x + 12;
              const rcy = Number.isFinite(rp.chest?.y) ? rp.chest.y : rp.y + 18;
              item.x = rcx + (dir * 9);
              item.y = rcy + 3;
              item.rotation = dir > 0 ? 0.3 : -0.3;
            }
          }
          continue;
        }

        if (item.isStuck) {
          item.sleeping = true;
          // Attached to stuck target (Lizard or Player)
          if (item.stuckTarget === 'lizard' && pinkLizard) {
            item.x = (pinkLizard.x + pinkLizard.width / 2) + (item.stuckOffsetX ?? 0);
            item.y = (pinkLizard.y + pinkLizard.height / 2) + (item.stuckOffsetY ?? 0);
            item.rotation = item.stuckAngle ?? 0;
          } else if (item.stuckTarget === 'player') {
            item.x = player.chest.x + (item.stuckOffsetX ?? 0);
            item.y = player.chest.y + (item.stuckOffsetY ?? 0);
            item.rotation = (item.stuckAngle ?? 0) + (player.ragdollAngle ?? 0);
          }
          // Firmly stuck (in creature or wall/floor), static until picked up
          continue;
        }

        // Performance optimization: resting items skip expensive physics calculations
        if (item.sleeping) {
          continue;
        }

        // Aerodynamics and gravity during flight:
        // "польот коп'я і камня при броскі должен бути прямо і по чучуть в низ"
        if (item.isAirborne) {
          if (item.type === 'spear') {
            item.vy += 0.08; // Very slight downward gravity
            item.vx *= 0.998;
            item.rotation = Math.atan2(item.vy, item.vx);
          } else if (item.type === 'rock') {
            item.vy += 0.22; // Direct stone throw with gentle downward drop
            item.vx *= 0.995;
            item.rotation += item.vx * 0.08;
          } else {
            // Berry throw with gentle arc
            item.vy += 0.20;
            item.vx *= 0.992;
            item.rotation += item.vx * 0.05;
          }
        } else {
          item.vy += 0.38;
          if (item.vy > 12) item.vy = 12;
          item.vx *= 0.88;
        }

        item.x += item.vx;
        item.y += item.vy;

        // Airborne spear / rock hit test against characters & creatures
        if (item.isAirborne) {
          // Check collision with Pink Lizard
          if (pinkLizard && pinkLizard.state !== 'dead') {
            const lizDist = Math.hypot(item.x - (pinkLizard.x + pinkLizard.width / 2), item.y - (pinkLizard.y + pinkLizard.height / 2));
            if (lizDist < 36) {
              if (item.type === 'berry') {
                item.isAirborne = false;
                item.vx = -item.vx * 0.25;
                item.vy = -1.5;
                soundEngine.playPickup();
                continue;
              }
              if (item.type === 'spear') {
                // Spear causes 1.0 damage and 2.5s stun to lizard, sticks into its side
                soundEngine.playHit('spear');
                pinkLizard.takeDamage(1.0, 2.5);
                item.isAirborne = false;
                item.isStuck = true;
                item.stuckTarget = 'lizard';
                item.stuckOffsetX = (pinkLizard.facingRight ? -1 : 1) * 8;
                item.stuckOffsetY = (Math.random() - 0.5) * 6;
                item.stuckAngle = item.rotation;
                item.vx = 0;
                item.vy = 0;
                setLastAction(`Спис влучив у ящера! HP: ${pinkLizard.hp.toFixed(1)} / 3.5`);
              } else {
                // Rock causes 0.2 damage and 1.8s stun to lizard, bounces off
                soundEngine.playHit('rock');
                pinkLizard.takeDamage(0.2, 1.8);
                item.isAirborne = false;
                item.vx = -item.vx * 0.35;
                item.vy = -1.8;
                setLastAction(`Камінь влучив у ящера! Стан 1.8с (HP: ${pinkLizard.hp.toFixed(1)} / 3.5)`);
              }
              continue;
            }
          }

          // Check collision with Player (if bouncing self-hit or peer throw)
          const playerDist = Math.hypot(item.x - (player.x + player.width / 2), item.y - (player.y + player.height / 2));
          if (playerDist < 26 && item.thrownBy !== 'player') {
            if (item.type === 'berry') {
              item.isAirborne = false;
              item.vx = -item.vx * 0.25;
              item.vy = -1.5;
              soundEngine.playPickup();
              continue;
            }
            applyHit(player, item.type);
            if (item.type === 'spear') {
              // Spear penetrates and STICKS into the player!
              item.isAirborne = false;
              item.isStuck = true;
              item.stuckTarget = 'player';
              const hitDir = item.vx >= 0 ? 1 : -1;
              item.stuckOffsetX = hitDir * 7;
              item.stuckOffsetY = (Math.random() - 0.5) * 6;
              item.stuckAngle = item.rotation;
              item.vx = 0;
              item.vy = 0;
              player.vx += hitDir * 2.8;
              player.vy = -2.0;
            } else {
              item.isAirborne = false;
              item.vx = -item.vx * 0.35;
              item.vy = -1.8;
            }
            continue;
          }

          // Check collision with Remote Players (Client-Side Hit Registration: "Favor the Shooter")
          if (item.isAirborne && item.thrownBy === 'player') {
            for (const rp of webRTCManager.remotePlayers.values()) {
              if (rp.room !== distributedSimulation.currentRoom || rp.state === 'dead') continue;
              const remoteDist = Math.hypot(item.x - (rp.x + 12), item.y - (rp.y + 19));
              if (remoteDist < 26) {
                if (item.type === 'berry') {
                  item.isAirborne = false;
                  item.vx = -item.vx * 0.25;
                  item.vy = -1.5;
                  soundEngine.playPickup();
                  continue;
                }
                // Attacker calculates hit with 100% authority!
                distributedSimulation.registerClientSideHit(rp.id, item.type, item.x, item.y);
                pvpCombatTimerRef.current = 60.0;
                pvpTargetPeerIdRef.current = rp.id;
                musicManager.playCategory('battle');
                if (item.type === 'spear') {
                  item.isAirborne = false;
                  item.isStuck = true;
                  item.vx = 0;
                  item.vy = 0;
                } else {
                  item.isAirborne = false;
                  item.vx = -item.vx * 0.35;
                  item.vy = -1.8;
                }
                setLastAction(`ВЛУЧАННЯ! Ваш ${item.type === 'spear' ? 'спис' : 'камінь'} вразив гравця ${rp.name}!`);
                break;
              }
            }
          }
        }

        // Screen boundary collisions:
        // Airborne spears stick into room walls!
        if (item.type === 'spear' && item.isAirborne) {
          if (item.x <= 20 && item.vx < 0) {
            item.isStuck = true;
            item.isAirborne = false;
            item.x = 22;
            item.vx = 0;
            item.vy = 0;
            item.rotation = Math.PI;
            soundEngine.playHit('spear');
            continue;
          }
          if (item.x >= CANVAS_WIDTH - 20 && item.vx > 0) {
            item.isStuck = true;
            item.isAirborne = false;
            item.x = CANVAS_WIDTH - 22;
            item.vx = 0;
            item.vy = 0;
            item.rotation = 0;
            soundEngine.playHit('spear');
            continue;
          }
        }

        // Screen bounds clamp
        if (item.x < 15) { item.x = 15; item.vx = -item.vx * 0.4; }
        if (item.x > CANVAS_WIDTH - 15) { item.x = CANVAS_WIDTH - 15; item.vx = -item.vx * 0.4; }

        // Floor collision (Ground at y = 520)
        if (item.y >= 518) {
          item.y = 518;
          if (item.type === 'spear' && item.isAirborne && item.vy > 4.5) {
            // Sticks into ground if angled downward
            item.isStuck = true;
            item.isAirborne = false;
            item.sleeping = true;
            item.vx = 0;
            item.vy = 0;
            item.rotation = Math.PI / 3;
            soundEngine.playHit('spear');
          } else {
            item.vy = 0;
            item.vx *= 0.8;
            item.isAirborne = false;
            if (Math.abs(item.vx) < 0.1) {
              item.vx = 0;
              item.sleeping = true;
            }
          }
        }

        // Platform top landing (Only for non-airborne resting items; items fly through passable monolith space!)
        if (!item.isAirborne) {
          for (const plat of platforms) {
            if (item.x >= plat.x && item.x <= plat.x + plat.w) {
              const wasAbove = (item.y - item.vy) <= plat.y + 4;
              const isAtTop = item.y >= plat.y && item.y <= plat.y + 8;
              if (wasAbove && isAtTop && item.vy >= 0) {
                item.y = plat.y - 2;
                if ((item.type === 'rock' || item.type === 'berry') && Math.abs(item.vy) > 2) {
                  item.vy = -item.vy * (item.type === 'berry' ? 0.25 : 0.4);
                  item.vx *= 0.65;
                  if (item.type === 'rock') soundEngine.playHit('rock');
                } else {
                  item.vy = 0;
                  item.vx *= 0.8;
                  if (Math.abs(item.vx) < 0.1) {
                    item.vx = 0;
                    item.sleeping = true;
                  }
                }
              }
            }
          }
        }
      }

      // ---------------- Update Berry Eating Logic (3.5 seconds duration) ----------------
      if (isEating) {
        if (player.state !== 'normal' || !player.heldItem || player.heldItem.type !== 'berry') {
          isEating = false;
          eatingTimer = 0;
          setIsEating(false);
          setEatingProgress(0);
        } else {
          eatingTimer += delta;
          nibbleTimer += delta;
          if (nibbleTimer >= 0.45) {
            nibbleTimer = 0;
            if (!isSoundMuted) soundEngine.playEatNibble();
          }

          // Throttle React UI update for eating progress (every ~120ms instead of 60 FPS!)
          eatingUiThrottleTimer += delta;
          if (eatingUiThrottleTimer >= 0.12) {
            eatingUiThrottleTimer = 0;
            const progressPct = Math.min(100, (eatingTimer / 3.5) * 100);
            setEatingProgress(progressPct);
          }

          // Chewing movement: head bobs and ears twitch
          player.head.y += Math.sin(t * 14) * 0.5;
          player.earSway += Math.sin(t * 12) * 0.6;

          // Finished 3.5 seconds! 1 berry fills 1 food pip ("1 ягода заполня 1 ячейку їди время поїдания 3.5 сикунд")
          if (eatingTimer >= 3.5) {
            isEating = false;
            eatingTimer = 0;
            setIsEating(false);
            setEatingProgress(0);

            // Remove berry from world items and player hand
            const consumedBerry = player.heldItem;
            player.heldItem = null;
            setHeldItemType(null);
            const bIdx = items.indexOf(consumedBerry);
            if (bIdx >= 0) {
              items.splice(bIdx, 1);
            }
            syncRoomItemsCache();

            // Broadcast berry consumption across WebRTC
            if (consumedBerry) {
              webRTCManager.broadcastPacket({
                type: 'ITEM_CONSUMED',
                senderId: webRTCManager.localPlayerId,
                itemId: consumedBerry.id,
                room: distributedSimulation.currentRoom
              });
            }

            // Fill 1 food slot (up to 7: 4 required + 3 extra)!
            currentFood = Math.min(7, currentFood + 1);
            setFoodCount(currentFood);
            setJustFilledIndex(currentFood - 1);
            setTimeout(() => setJustFilledIndex(null), 800);

            if (!isSoundMuted) soundEngine.playEatComplete();
            setLastAction(`Ягоду з'їдено! +1 ячейка їжі (${currentFood} / 7: ${Math.min(4, currentFood)} обов'язк. + ${Math.max(0, currentFood - 4)} додатк.)`);
          }
        }
      }

      // ---------------- Procedural Skeleton Physics (Player) ----------------
      updateSkeleton(player, t, delta);

      // ---------------- Procedural Skeleton Physics (Remote Peers) ----------------
      // Strict room isolation: only update skeleton for peers physically in this location
      // "кожна локація це був окремий одб'єкт тоєсть щоб в просторі находились вони всі окрумо..."
      for (const rp of webRTCManager.remotePlayers.values()) {
        if (rp.room === currentLocation.id) {
          updateSkeleton(rp, t, delta);
        }
      }

      // Throttled WebRTC P2P Player State Broadcast (25 Hz)
      if (webRTCManager.connectionStatus === 'connected' && t - lastBroadcastTime > 0.04) {
        lastBroadcastTime = t;
        webRTCManager.broadcastPlayerState({
          x: player.x,
          y: player.y,
          vx: player.vx,
          vy: player.vy,
          facingRight: player.facingRight,
          crouching: player.crouching,
          isGrounded: player.isGrounded,
          isClimbing: player.isClimbing,
          state: isSpectatingRef.current ? 'sleeping' : player.state,
          hp: isSpectatingRef.current ? player.maxHp : player.hp,
          maxHp: player.maxHp,
          stunTimer: player.stunTimer,
          heldItem: player.heldItem ? player.heldItem.type : null,
          room: currentLocation.id,
          carriedBy: null,
          carryingPeerId: carriedPlayerIdRef.current,
          head: player.head,
          chest: player.chest,
          hips: player.hips,
          tail: player.tail
        });
      }

      // Authoritative item synchronization from room host to peers (every 1.0s)
      if ((webRTCManager.isRoomHost || distributedSimulation.isLocalHostOfRoom()) && webRTCManager.remotePlayers.size > 0 && t - lastItemsSyncTime > 1.0) {
        lastItemsSyncTime = t;
        sendAuthoritativeItemsSync();
      }

      // Sync state for React HUD telemetry periodically
      telemetryThrottleTimer += delta;
      const throttleTarget = 0.5;
      if (telemetryThrottleTimer > throttleTarget) {
        telemetryThrottleTimer = 0;
        const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
        
        let spears = 0;
        let rocks = 0;
        let berries = 0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i].type;
          if (it === 'spear') spears++;
          else if (it === 'rock') rocks++;
          else if (it === 'berry') berries++;
        }

        setTelemetry({
          x: Math.round(player.x * 10) / 10,
          y: Math.round(player.y * 10) / 10,
          vx: Math.round(player.vx * 100) / 100,
          vy: Math.round(player.vy * 100) / 100,
          speed: Math.round(speed * 100) / 100,
          isGrounded: player.isGrounded,
          isClimbing: player.isClimbing,
          crouching: player.crouching,
          facingRight: player.facingRight,
          state: player.state,
          hp: Math.round(player.hp * 100) / 100,
          maxHp: player.maxHp,
          stunTimer: Math.max(0, Math.round(player.stunTimer * 100) / 100),
          heldItem: player.heldItem ? player.heldItem.type : null,

          npcState: pinkLizard ? (pinkLizard.state as SlugcatState) : 'normal',
          npcHp: pinkLizard ? Math.round(pinkLizard.hp * 100) / 100 : 0,
          npcMaxHp: 3.5,
          npcStunTimer: pinkLizard ? Math.max(0, Math.round(pinkLizard.stunTimer * 100) / 100) : 0,
          npcX: pinkLizard ? Math.round(pinkLizard.x) : 0,
          npcY: pinkLizard ? Math.round(pinkLizard.y) : 0,

          spearsCount: spears,
          rocksCount: rocks,
          berriesCount: berries,
          foodCount: currentFood,
          isEating,
          eatingProgress: Math.min(100, Math.round((eatingTimer / 3.5) * 100)),
          fps: currentFps,
          particles: 0,
        });

        setIsDead(player.state === 'dead');
      }

      // ---------------- Dynamic Camera Tracking & Zoom ----------------
      const currentZoom = zoomRef.current;
      const viewW = CANVAS_WIDTH / currentZoom;
      const viewH = CANVAS_HEIGHT / currentZoom;

      // Camera smoothly follows player (or spectated peer in spectator mode)
      let focusX = player.x + player.width / 2;
      let focusY = player.y + player.height / 2;
      let leadX = (player.state === 'normal' && (ctrl.left || ctrl.right))
        ? (player.facingRight ? 40 : -40)
        : 0;

      if (isSpectatingRef.current && spectatedPeerIdRef.current) {
        const specPeer = webRTCManager.remotePlayers.get(spectatedPeerIdRef.current);
        if (specPeer) {
          focusX = specPeer.x + 12;
          focusY = specPeer.y + 19;
          leadX = specPeer.facingRight ? 30 : -30;
          if (specPeer.room && specPeer.room !== currentLocation.id) {
            const loc = BUILTIN_LOCATIONS.find(l => l.id === specPeer.room);
            if (loc) {
              setCurrentLocation(loc);
            }
          }
        }
      }

      const targetCamX = (focusX + leadX) - viewW / 2;
      const targetCamY = focusY - viewH / 2;

      // Clamp camera within the bounds of the map [0..worldWidth, 0..worldHeight]
      const maxCamX = Math.max(0, worldWidth - viewW);
      const maxCamY = Math.max(0, worldHeight - viewH);
      const clampedCamX = Math.max(0, Math.min(maxCamX, targetCamX));
      const clampedCamY = Math.max(0, Math.min(maxCamY, targetCamY));

      // Organic smooth camera lag (0.12 lerp speed)
      camera.x += (clampedCamX - camera.x) * 0.12;
      camera.y += (clampedCamY - camera.y) * 0.12;

      // ---------------- Drawing & Rendering ----------------
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Deep dark void background
      ctx.fillStyle = '#120f18';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Apply Camera Zoom & Translation
      ctx.save();
      ctx.scale(currentZoom, currentZoom);
      ctx.translate(-camera.x, -camera.y);

      // 1. Storm sky background and depth fog gradients
      ctx.fillStyle = '#1c1822';
      ctx.fillRect(0, 0, worldWidth, worldHeight);

      // Distant horizontal drooping wires
      ctx.strokeStyle = '#2b2434';
      ctx.lineWidth = 1.0;
      for (let yLevel = 60; yLevel < worldHeight - 120; yLevel += 90) {
        ctx.beginPath();
        ctx.moveTo(0, yLevel);
        ctx.quadraticCurveTo(worldWidth / 2, yLevel + 45, worldWidth, yLevel - 15);
        ctx.stroke();
      }

      // Distant industrial girders silhouetted
      ctx.fillStyle = '#221d2a';
      ctx.fillRect(100, 80, 50, CANVAS_HEIGHT - 80);
      ctx.fillRect(700, 40, 60, CANVAS_HEIGHT - 40);

      // Faint background block drawings
      ctx.fillStyle = '#262030';
      ctx.fillRect(360, 200, 280, 100);
      ctx.strokeStyle = '#32293e';
      ctx.lineWidth = 4;
      ctx.strokeRect(360, 200, 280, 100);

      // 2. Render Climbing Poles
      poles.forEach((pole) => {
        ctx.strokeStyle = '#0e0b12';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(pole.x, pole.yMin);
        ctx.lineTo(pole.x, pole.yMax);
        ctx.stroke();

        ctx.strokeStyle = '#4e3a30';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pole.x, pole.yMin);
        ctx.lineTo(pole.x, pole.yMax);
        ctx.stroke();

        ctx.strokeStyle = '#1a141b';
        ctx.lineWidth = 3;
        for (let py = pole.yMin + 20; py < pole.yMax; py += 35) {
          ctx.beginPath();
          ctx.moveTo(pole.x - 5, py);
          ctx.lineTo(pole.x + 5, py);
          ctx.stroke();
        }
      });

      // 3. Draw All Geometric Platforms & Ancient Monoliths
      platforms.forEach((plat) => {
        if (plat.type === 'concrete') {
          ctx.fillStyle = '#14111a';
          ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
          
          ctx.strokeStyle = '#34292d';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

          if (plat.label) {
            ctx.fillStyle = 'rgba(245, 245, 255, 0.75)';
            ctx.font = 'bold 36px font-sans';
            ctx.textAlign = 'center';
            ctx.fillText(plat.label, plat.x + plat.w / 2, plat.y + 60);
          }

          ctx.strokeStyle = '#2d2228';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(plat.x, plat.y);
          ctx.quadraticCurveTo(plat.x + plat.w/2, plat.y + 20, plat.x + plat.w, plat.y);
          ctx.stroke();

        } else if (plat.type === 'metal') {
          ctx.fillStyle = '#22120e';
          ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
          
          ctx.strokeStyle = '#44251f';
          ctx.lineWidth = 3;
          ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

          ctx.strokeStyle = '#120704';
          ctx.lineWidth = 1.5;
          for (let step = plat.x + 10; step < plat.x + plat.w; step += 20) {
            ctx.beginPath();
            ctx.moveTo(step, plat.y);
            ctx.lineTo(step + 10, plat.y + plat.h);
            ctx.stroke();
          }

        } else if (plat.type === 'pipe') {
          ctx.fillStyle = '#1c1514';
          ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
          ctx.strokeStyle = '#3a2b29';
          ctx.lineWidth = 2;
          ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

          ctx.fillStyle = '#2e201e';
          for (let rx = plat.x + 30; rx < plat.x + plat.w; rx += 80) {
            ctx.fillRect(rx, plat.y - 2, 8, plat.h + 4);
          }
        } else if (plat.type === 'wall') {
          // Authentic Rain World industrial concrete barrier & bolted rust rebar plates
          ctx.fillStyle = '#17141f';
          ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
          
          // Weathered stone seam border
          ctx.strokeStyle = '#2e2536';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

          // Dark industrial rusted iron reinforcement plates
          ctx.fillStyle = '#2d1c17';
          for (let py = plat.y + 12; py < plat.y + plat.h - 10; py += 36) {
            ctx.fillRect(plat.x + 3, py, Math.max(8, plat.w - 6), 18);
          }

          // Dark metallic rusted rivets/bolts along vertical seams
          ctx.fillStyle = '#4a2c22';
          for (let ry = plat.y + 8; ry < plat.y + plat.h; ry += 24) {
            ctx.beginPath();
            ctx.arc(plat.x + 5, ry, 2, 0, Math.PI * 2);
            ctx.arc(plat.x + plat.w - 5, ry, 2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Grime & weathered cracks
          ctx.strokeStyle = '#120d18';
          ctx.lineWidth = 1;
          for (let cy = plat.y + 20; cy < plat.y + plat.h; cy += 45) {
            ctx.beginPath();
            ctx.moveTo(plat.x + 2, cy);
            ctx.lineTo(plat.x + plat.w - 2, cy + 4);
            ctx.stroke();
          }

          if (plat.label) {
            ctx.fillStyle = 'rgba(214, 211, 209, 0.55)';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(plat.label, plat.x + plat.w / 2, plat.y + Math.min(plat.h / 2 + 4, 30));
          }
        } else if (plat.type === 'shelter') {
          // Heavy reinforced subterranean shelter vault structure
          ctx.fillStyle = '#14111d';
          ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
          
          ctx.strokeStyle = '#382a3c';
          ctx.lineWidth = 3;
          ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

          // Heavy armor bevel inner chamber
          ctx.fillStyle = '#1d1726';
          ctx.fillRect(plat.x + 6, plat.y + 6, plat.w - 12, plat.h - 12);

          // Hydraulic piston housing trims on sides
          ctx.fillStyle = '#2e1c24';
          ctx.fillRect(plat.x + 8, plat.y + 8, 14, plat.h - 16);
          ctx.fillRect(plat.x + plat.w - 22, plat.y + 8, 14, plat.h - 16);

          // Weathered Rain World shelter glyph emblem '⛊'
          ctx.fillStyle = 'rgba(240, 240, 255, 0.75)';
          ctx.font = 'bold 22px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⛊', plat.x + plat.w / 2, plat.y + plat.h / 2 + 7);

          if (plat.label) {
            ctx.fillStyle = 'rgba(203, 213, 225, 0.6)';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(plat.label, plat.x + plat.w / 2, plat.y + plat.h - 8);
          }
        }
      });

      // 3.1 Draw Transit Shortcut Pipes (Clear Rain World inter-region and shortcut pipes)
      transitPipes.forEach((pipe, idx) => {
        ctx.save();
        const isInterRoom = !!pipe.targetLocationId;
        const isShelter = !!pipe.isShelterPipe;
        const isDen = !!pipe.isDenPipe;

        // Helper to draw authentic Rain World pipe portal
        const drawPipePortal = (x: number, y: number, shelter: boolean, targetX: number, targetY: number, den?: boolean) => {
          // Outer rubber seal collar
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = shelter ? '#0284c7' : (den ? '#ec4899' : '#047857');
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Dark inner entry hole
          ctx.fillStyle = '#030712';
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();

          // Directional indicator inside hole
          if (shelter) {
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('⛊', x, y + 3.5);
          } else if (den) {
            ctx.fillStyle = '#f472b6';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('▼', x, y + 3.5);
          } else {
            const angle = Math.atan2(targetY - y, targetX - x);
            const alpha = 0.5 + Math.sin(t * 5 + idx) * 0.45;
            ctx.fillStyle = `rgba(52, 211, 153, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        };

        if (!isInterRoom) {
          // Internal room shortcut: draw full heavy conduit between both ends
          ctx.strokeStyle = isDen ? '#831843' : '#064e3b';
          ctx.lineWidth = 14;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pipe.startX, pipe.startY);
          ctx.lineTo(pipe.endX, pipe.endY);
          ctx.stroke();

          ctx.strokeStyle = isDen ? '#500724' : '#022c22';
          ctx.lineWidth = 8;
          ctx.stroke();

          // Moving pulse dot
          const pulseRatio = (t * 1.5 + idx * 0.4) % 1;
          const pulseX = pipe.startX + (pipe.endX - pipe.startX) * pulseRatio;
          const pulseY = pipe.startY + (pipe.endY - pipe.startY) * pulseRatio;
          ctx.fillStyle = isDen ? '#f472b6' : '#34d399';
          ctx.beginPath();
          ctx.arc(pulseX, pulseY, 2.5, 0, Math.PI * 2);
          ctx.fill();

          drawPipePortal(pipe.startX, pipe.startY, false, pipe.endX, pipe.endY, isDen);
          drawPipePortal(pipe.endX, pipe.endY, false, pipe.startX, pipe.startY, isDen);
        } else {
          // INTER-REGION TRANSIT PIPE OR SHELTER ENTRANCE OR DEN ENTRANCE
          // Lead conduit off into the wall/perimeter
          const anchorDirX = pipe.startX > (worldWidth / 2) ? 1 : -1;
          ctx.strokeStyle = isShelter ? '#0c4a6e' : (isDen ? '#831843' : '#064e3b');
          ctx.lineWidth = 16;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pipe.startX, pipe.startY);
          ctx.lineTo(pipe.startX + anchorDirX * 22, pipe.startY);
          ctx.stroke();

          ctx.strokeStyle = isShelter ? '#0284c7' : (isDen ? '#ec4899' : '#047857');
          ctx.lineWidth = 8;
          ctx.stroke();

          drawPipePortal(pipe.startX, pipe.startY, isShelter, pipe.startX + anchorDirX * 30, pipe.startY, isDen);

          // HOLOGRAPHIC REGION SIGNBOARD: "щоб хотиби було понятиє куда тебе веде труба"
          const px = player.x + player.width / 2;
          const py = player.y + player.height / 2;
          const dist = Math.hypot(px - pipe.startX, py - pipe.startY);
          const isNearby = dist < 85;

          const signText = pipe.label || (isShelter ? '⛊ УКРИТТЯ' : (isDen ? '▼ ЛІГВО ЯЩЕРА' : '➔ ПЕРЕХІД'));
          ctx.font = 'bold 9px monospace';
          const metrics = ctx.measureText(signText);
          const padX = 7;
          const signW = metrics.width + padX * 2;
          const signH = 15;
          const signX = Math.max(10, Math.min(worldWidth - signW - 10, pipe.startX - signW / 2));
          const signY = Math.max(12, pipe.startY - 25);

          // Sign background
          ctx.fillStyle = isNearby 
            ? (isShelter ? 'rgba(8, 47, 73, 0.95)' : (isDen ? 'rgba(80, 7, 36, 0.95)' : 'rgba(6, 78, 59, 0.95)'))
            : 'rgba(3, 7, 18, 0.85)';
          ctx.strokeStyle = isNearby 
            ? (isShelter ? '#38bdf8' : (isDen ? '#f472b6' : '#34d399'))
            : (isShelter ? '#0284c7' : (isDen ? '#ec4899' : '#059669'));
          ctx.lineWidth = isNearby ? 1.6 : 1.0;
          ctx.beginPath();
          ctx.roundRect(signX, signY, signW, signH, 3);
          ctx.fill();
          ctx.stroke();

          // Sign text label
          ctx.fillStyle = isNearby 
            ? '#ffffff' 
            : (isShelter ? '#7dd3fc' : (isDen ? '#fbcfe8' : '#a7f3d0'));
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(signText, signX + signW / 2, signY + signH / 2);

          // Nearby enter prompt
          if (isNearby) {
            const glow = 0.6 + Math.sin(t * 6) * 0.4;
            ctx.fillStyle = isShelter ? `rgba(56, 189, 248, ${glow})` : (isDen ? `rgba(244, 114, 182, ${glow})` : `rgba(52, 211, 153, ${glow})`);
            ctx.font = 'bold 8px monospace';
          }
        }

        ctx.restore();
      });

      // 4. Glow Grass (Worm Grass)
      const groundFloorY = worldHeight - 60;
      ctx.strokeStyle = '#12411e';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let i = 0; i < wormGrasses.length; i++) {
        const grass = wormGrasses[i];
        const sway = Math.sin(t * grass.swaySpeed + grass.phase) * 6;
        ctx.moveTo(grass.x, groundFloorY);
        ctx.quadraticCurveTo(
          grass.x + sway * 0.4, 
          groundFloorY - grass.height * 0.5, 
          grass.x + sway, 
          groundFloorY - grass.height
        );
      }
      ctx.stroke();

      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      for (let i = 0; i < wormGrasses.length; i++) {
        const grass = wormGrasses[i];
        const sway = Math.sin(t * grass.swaySpeed + grass.phase) * 6;
        ctx.moveTo(grass.x + sway + 2.5, groundFloorY - grass.height);
        ctx.arc(grass.x + sway, groundFloorY - grass.height, 2.5, 0, Math.PI * 2);
      }
      ctx.fill();

      // 5. Draw World Items (Spears, Stones, Berries) with Frustum / Viewport Culling
      const cullMinX = camera.x - 40;
      const cullMaxX = camera.x + viewW + 40;
      const cullMinY = camera.y - 40;
      const cullMaxY = camera.y + viewH + 40;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.isHeld || item.stuckTarget) continue;
        if (item.x < cullMinX || item.x > cullMaxX || item.y < cullMinY || item.y > cullMaxY) {
          continue;
        }
        drawWorldItem(ctx, item);
      }

      // 6. Draw Visible Lizard Den and Pink Lizard
      // "і зроби ящеру свою убержку ну видиму куда даже зайти можна но игрока якого заніс туда ящер буде медлено получать урон 0.01 урон в 3 сикунди..."
      if (denData && !currentLocation.isShelterRoom) {
        ctx.save();
        // Deep organic cavern cavity
        ctx.fillStyle = '#0f0514';
        ctx.beginPath();
        ctx.roundRect(denData.x, denData.y, denData.w, denData.h, 14);
        ctx.fill();

        // Stalactites / organic bony arches hanging from ceiling of the den
        ctx.fillStyle = '#2d0a35';
        for (let i = 0; i < 5; i++) {
          const toothX = denData.x + 8 + i * (denData.w / 5);
          ctx.beginPath();
          ctx.moveTo(toothX - 6, denData.y);
          ctx.lineTo(toothX, denData.y + 16);
          ctx.lineTo(toothX + 6, denData.y);
          ctx.closePath();
          ctx.fill();
        }

        // Biological cavern outline & entrance rim
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Ambient pulsating bioluminescent spores/mist inside the den
        const glowRad = 22 + Math.sin(t * 3) * 5;
        const glowGrad = ctx.createRadialGradient(
          denData.x + denData.w / 2, denData.y + denData.h / 2, 4,
          denData.x + denData.w / 2, denData.y + denData.h / 2, glowRad
        );
        glowGrad.addColorStop(0, 'rgba(236, 72, 153, 0.45)');
        glowGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(denData.x + denData.w / 2, denData.y + denData.h / 2, glowRad, 0, Math.PI * 2);
        ctx.fill();

        // Den Entrance Sign
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#f472b6';
        ctx.textAlign = 'center';
        ctx.fillText('⛊ ЛІГВО ЯЩЕРА', denData.x + denData.w / 2, denData.y - 6);
        ctx.restore();
      }

      if (pinkLizard) {
        pinkLizard.render(ctx, t);
      }

      // 7. Draw Player OR Traveling Slugcat Silhouette in Pipe
      if (pipeTransit) {
        // Authentic Rain World conduit crawler: glowing slugcat silhouette sliding inside the pipe
        const p = Math.min(1, pipeTransit.progress);
        const curX = pipeTransit.startX + (pipeTransit.endX - pipeTransit.startX) * p;
        const curY = pipeTransit.startY + (pipeTransit.endY - pipeTransit.startY) * p;
        const transitAngle = Math.atan2(pipeTransit.endY - pipeTransit.startY, pipeTransit.endX - pipeTransit.startX);

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = pipeTransit.isShelter ? '#38bdf8' : '#34d399';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.ellipse(curX, curY, 11, 7, transitAngle, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        renderSlugcatCharacter(ctx, player, t, true, webRTCManager.localPlayerName);
      }

      // 7.05 Draw Shelter Hibernation Sleep Meter and In-World Prompts
      // "пофікси сон я зажимаю кнопку прижка а слизне кот не спить"
      if ((currentLocation.isShelterRoom || inShelterChamber) && !pipeTransit && !isHibernating) {
        ctx.save();
        const px = player.x + player.width / 2;
        const py = player.y - 18;

        if (shelterSleepTimer > 0) {
          const sleepP = Math.min(1, shelterSleepTimer / 1.5);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py - 4, 11, -Math.PI / 2, -Math.PI / 2 + sleepP * Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`СНУ: ${Math.round(sleepP * 100)}%`, px, py - 18);
        } else {
          const pulseAlpha = 0.5 + Math.sin(t * 3.5) * 0.35;
          ctx.fillStyle = `rgba(56, 189, 248, ${pulseAlpha})`;
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⛊ ЗАТИСНІТЬ [ПРИЖОК] АБО [ВНИЗ] ДЛЯ СНУ', px, py - 8);
        }
        ctx.restore();
      }

      // 7.1 Draw Remote P2P Players strictly in current location room
      // Fixes: "кожна локація це був окремий одб'єкт тоєсть щоб в просторі находились вони всі окрумо кожна в свойому місці просто не рендерились поки игрок не залізе в трубу"
      for (const rp of webRTCManager.remotePlayers.values()) {
        if (rp.room === currentLocation.id) {
          renderSlugcatCharacter(ctx, rp, t, false, rp.name);
        }
      }

      // 8. Draw spears stuck directly through creatures
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.isStuck && item.stuckTarget) {
          if (item.x >= cullMinX && item.x <= cullMaxX && item.y >= cullMinY && item.y <= cullMaxY) {
            drawWorldItem(ctx, item);
          }
        }
      }

      // Lethal Downpour storm visual rendering on canvas:
      // "коли вийде таймер цикла по чучуть буде начинаться злива яка сначала як простий дощ слабий а потом буде сильнішати з каждою сикундою"
      if (localStormSeconds > 0) {
        const intensity = Math.min(1.0, localStormSeconds / 25.0);
        ctx.save();
        // Ominous ambient darkening
        ctx.fillStyle = `rgba(3, 7, 18, ${Math.min(0.82, 0.15 + intensity * 0.67)})`;
        ctx.fillRect(camera.x - 20, camera.y - 20, viewW + 40, viewH + 40);

        // Torrential downpour rain streaks
        const streakCount = Math.floor(40 + intensity * 240);
        ctx.strokeStyle = `rgba(186, 230, 253, ${0.25 + intensity * 0.6})`;
        ctx.lineWidth = 1.2 + intensity * 1.5;
        ctx.beginPath();
        const speed = 26 + intensity * 35;
        const slant = 10 + intensity * 12;
        for (let s = 0; s < streakCount; s++) {
          const rx = camera.x + ((s * 41 + t * speed * 22) % (viewW + 100)) - 50;
          const ry = camera.y + ((s * 23 + t * speed * 38) % viewH);
          const len = 18 + intensity * 35;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - slant, ry + len);
        }
        ctx.stroke();

        // Water splash spray on the ground
        ctx.fillStyle = `rgba(224, 242, 254, ${0.15 + intensity * 0.45})`;
        for (let s = 0; s < 30; s++) {
          const sx = camera.x + ((s * 47 + t * 45) % viewW);
          const sy = worldHeight - 58 + Math.sin(t * 8 + s) * 6;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.2 + (s % 3) * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Restore camera zoom & position
      ctx.restore();

      // Full screen-space flash overlay for lightning storm
      if (isFlashing) {
        ctx.fillStyle = 'rgba(235, 240, 255, 0.45)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      syncRoomItemsCache();
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      unregisterPeerList();
      unregisterStatus();
      unregisterHit();
      unregisterPackets();
      clearInterval(cycleInterval);
    };
  }, [isSoundMuted, isFlashing, currentLocation]);

  // Procedural Skeleton updater for both Player and NPC
  // Procedural Skeleton updater for both Player, NPC, and Remote Peers
  function updateSkeleton(entity: any, t: number, delta: number) {
    if (!entity) return;
    const width = Number.isFinite(entity.width) ? entity.width : 24;
    const height = Number.isFinite(entity.height) ? entity.height : 38;
    const ex = Number.isFinite(entity.x) ? entity.x : 200;
    const ey = Number.isFinite(entity.y) ? entity.y : 450;
    const evx = Number.isFinite(entity.vx) ? entity.vx : 0;
    const evy = Number.isFinite(entity.vy) ? entity.vy : 0;

    if (!entity.head || !Number.isFinite(entity.head.x) || !Number.isFinite(entity.head.y)) {
      entity.head = { x: ex + width / 2, y: ey + 6 };
    }
    if (!entity.chest || !Number.isFinite(entity.chest.x) || !Number.isFinite(entity.chest.y)) {
      entity.chest = { x: entity.head.x, y: entity.head.y + 12 };
    }
    if (!entity.hips || !Number.isFinite(entity.hips.x) || !Number.isFinite(entity.hips.y)) {
      entity.hips = { x: entity.chest.x, y: entity.chest.y + 14 };
    }
    if (!Array.isArray(entity.tail) || entity.tail.length === 0) {
      entity.tail = Array.from({ length: 9 }, (_, i) => ({ x: entity.hips.x, y: entity.hips.y + i * 5 }));
    } else {
      for (let i = 0; i < entity.tail.length; i++) {
        if (!entity.tail[i] || !Number.isFinite(entity.tail[i].x) || !Number.isFinite(entity.tail[i].y)) {
          entity.tail[i] = { x: entity.hips.x, y: entity.hips.y + i * 5 };
        }
      }
    }

    if (entity.state === 'dead') {
      // Flat limp ragdoll lying horizontally on the floor
      const targetHeadX = ex + (entity.facingRight ? 18 : 6);
      const targetHeadY = ey + 24;
      entity.head.x += (targetHeadX - entity.head.x) * 0.25;
      entity.head.y += (targetHeadY - entity.head.y) * 0.25;

      const targetChestX = ex + 12;
      const targetChestY = ey + 26;
      entity.chest.x += (targetChestX - entity.chest.x) * 0.25;
      entity.chest.y += (targetChestY - entity.chest.y) * 0.25;

      const targetHipsX = ex + (entity.facingRight ? 2 : 22);
      const targetHipsY = ey + 28;
      entity.hips.x += (targetHipsX - entity.hips.x) * 0.25;
      entity.hips.y += (targetHipsY - entity.hips.y) * 0.25;

      entity.ragdollAngle = entity.facingRight ? Math.PI / 2 : -Math.PI / 2;
      entity.earSway = 0.5;

    } else if (entity.state === 'stunned') {
      // Dazed, slumped, wobbling with dizziness
      const dazeWobble = Math.sin(t * 3.5) * 2;
      const targetHeadX = ex + width / 2 + dazeWobble;
      const targetHeadY = ey + 14;
      entity.head.x += (targetHeadX - entity.head.x) * 0.3;
      entity.head.y += (targetHeadY - entity.head.y) * 0.3;

      const targetChestX = ex + width / 2;
      const targetChestY = ey + 22;
      entity.chest.x += (targetChestX - entity.chest.x) * 0.3;
      entity.chest.y += (targetChestY - entity.chest.y) * 0.3;

      const targetHipsX = ex + (entity.facingRight ? 4 : 20);
      const targetHipsY = ey + 28;
      entity.hips.x += (targetHipsX - entity.hips.x) * 0.3;
      entity.hips.y += (targetHipsY - entity.hips.y) * 0.3;

      entity.earSway = Math.sin(t * 2.5) * 4.0;
      entity.ragdollAngle = Math.sin(t * 2.0) * 0.15;

    } else {
      // Normal alive and responsive posture
      entity.ragdollAngle = 0;
      const walkWobbleX = entity.isGrounded && Math.abs(evx) > 0.4 ? Math.sin(t * 1.8) * 4.2 : 0;
      const walkWobbleY = entity.isGrounded && Math.abs(evx) > 0.4 ? Math.abs(Math.cos(t * 1.8)) * 2 : 0;

      // Breathing idle bobbing
      const idleBob = Math.sin(t * 1.1) * 1.2;

      const targetHeadX = ex + width / 2 + (evx * 1.5);
      const targetHeadY = ey + 6 + (evy * 0.4) + (entity.crouching ? 8 : 0) + idleBob;

      entity.head.x += (targetHeadX - entity.head.x) * 0.45;
      entity.head.y += (targetHeadY - entity.head.y) * 0.45;
      
      const targetChestX = entity.head.x - (entity.facingRight ? 4 : -4) + walkWobbleX;
      const targetChestY = entity.head.y + 12 + (entity.crouching ? 4 : 0) + walkWobbleY + idleBob * 0.6;
      entity.chest.x += (targetChestX - entity.chest.x) * 0.35;
      entity.chest.y += (targetChestY - entity.chest.y) * 0.35;

      const targetHipsX = entity.chest.x - (entity.facingRight ? 8 : -8) + (entity.isClimbing ? Math.sin(t * 1.5) * 3 : 0);
      const targetHipsY = entity.chest.y + 14 + (entity.crouching ? -2 : 0);
      entity.hips.x += (targetHipsX - entity.hips.x) * 0.3;
      entity.hips.y += (targetHipsY - entity.hips.y) * 0.3;

      entity.earSway = Math.sin(t * 1.5) * 2.5 + (evx * -0.7);
    }

    // Blink animation timer
    entity.blinkTimer = (Number.isFinite(entity.blinkTimer) ? entity.blinkTimer : 0) + delta;
    if (entity.blinkTimer > 3.8) {
      if (entity.blinkTimer > 4.0) {
        entity.blinkTimer = 0;
      }
    }

    // Procedural tail chain physics
    entity.tail[0] = { x: entity.hips.x, y: entity.hips.y };
    for (let i = 1; i < entity.tail.length; i++) {
      const prev = entity.tail[i - 1];
      const curr = entity.tail[i];
      if (!prev || !curr) continue;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      const speedFactor = Math.min(Math.sqrt(evx*evx + evy*evy), 8);
      const segmentLength = entity.state === 'dead' ? 4.5 : (5.0 + (speedFactor * 0.15)); 
      
      if (dist > segmentLength && dist > 0.001) {
        const ratio = segmentLength / dist;
        curr.x = prev.x + dx * ratio;
        curr.y = prev.y + dy * ratio + (entity.state === 'dead' ? 0.6 : 0.4);
      }

      if (entity.state === 'normal' && entity.isGrounded && Math.abs(evx) > 0.4) {
        curr.x += Math.sin(t * 1.2 - i * 0.6) * 0.7 * (i * 0.35);
      }
    }
  }

  // Draw Items (Spear and Stone)
  function drawWorldItem(ctx: CanvasRenderingContext2D, item: WorldItem) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);

    if (item.type === 'spear') {
      // Sleek Rain World rebar spear: long shaft with wrapped center grip & sharp pointed tip
      // Shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(-22, 2);
      ctx.lineTo(22, 2);
      ctx.stroke();

      // Main metal shaft
      ctx.strokeStyle = '#64748b'; // slate metal
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(22, 0);
      ctx.stroke();

      // Sharp piercing blade tip
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(22, -3.2);
      ctx.lineTo(28, 0);
      ctx.lineTo(22, 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wrapped handle grip tape in center
      ctx.strokeStyle = '#b45309'; // weathered leather wrap
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();

      // Tiny metallic glint
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(16, -1, 4, 1.2);

    } else if (item.type === 'rock') {
      // Natural textured rubble stone / pebble
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rock body
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-6, -2);
      ctx.lineTo(-4, -6);
      ctx.lineTo(3, -5);
      ctx.lineTo(7, -1);
      ctx.lineTo(6, 4);
      ctx.lineTo(-2, 6);
      ctx.lineTo(-6, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top specular highlight edge
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(2, -4);
      ctx.stroke();

    } else if (item.type === 'berry') {
      // Rain World Blue Fruit / Danglefruit (1 berry = 1 food pip, 3.5s eat time)
      // Soft drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 5, 8, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Organic stem at top
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(2, -9, 3.5, -11.5);
      ctx.stroke();

      // Tiny green leaf / calyx
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(1, -6, 2.5, 1.4, -0.4, 0, Math.PI * 2);
      ctx.fill();

      // Main berry body - Cluster of plump indigo-cyan segments
      const berryGrad = ctx.createRadialGradient(-2, -1, 1, 0, 1, 8.5);
      berryGrad.addColorStop(0, '#7dd3fc');
      berryGrad.addColorStop(0.35, '#38bdf8');
      berryGrad.addColorStop(0.7, '#2563eb');
      berryGrad.addColorStop(1, '#1e1b4b');

      ctx.fillStyle = berryGrad;
      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 1.2;

      // Base cluster circle
      ctx.beginPath();
      ctx.arc(0, 0, 6.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Segmented berry lobes
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(-2.8, 2, 3.4, 0, Math.PI * 2);
      ctx.arc(2.8, 2, 3.4, 0, Math.PI * 2);
      ctx.arc(0, -1.8, 3.8, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight gleam
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-1.6, -2.4, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Unified Slugcat Character Renderer (Classic Rain World Slugcat)
  function renderSlugcatCharacter(
    ctx: CanvasRenderingContext2D, 
    entity: any, 
    t: number, 
    isPlayer: boolean,
    displayName?: string
  ) {
    if (!entity) return;
    ctx.save();
    const dirSign = entity.facingRight ? 1 : -1;
    const ex = Number.isFinite(entity.x) ? entity.x : 200;
    const ey = Number.isFinite(entity.y) ? entity.y : 450;
    const headX = (entity.head && Number.isFinite(entity.head.x)) ? entity.head.x : ex + 12;
    const headY = (entity.head && Number.isFinite(entity.head.y)) ? entity.head.y : ey + 6;
    const chestX = (entity.chest && Number.isFinite(entity.chest.x)) ? entity.chest.x : headX;
    const chestY = (entity.chest && Number.isFinite(entity.chest.y)) ? entity.chest.y : headY + 12;
    const hipsX = (entity.hips && Number.isFinite(entity.hips.x)) ? entity.hips.x : chestX;
    const hipsY = (entity.hips && Number.isFinite(entity.hips.y)) ? entity.hips.y : chestY + 14;

    // 1. Procedural Tail Chain (Optimized single-pass stroke without gradient allocations)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (Array.isArray(entity.tail) && entity.tail.length > 1) {
      const tailColor = entity.state === 'dead' ? '#cbd5e1' : '#f1f5f9';
      const tailOutline = entity.state === 'dead' ? 'rgba(51, 65, 85, 0.4)' : '#0f172a';

      for (let i = 1; i < entity.tail.length; i++) {
        const seg = entity.tail[i];
        const prev = entity.tail[i - 1];
        if (!seg || !prev) continue;
        const px = Number.isFinite(prev.x) ? prev.x : hipsX;
        const py = Number.isFinite(prev.y) ? prev.y : hipsY;
        const sx = Number.isFinite(seg.x) ? seg.x : hipsX;
        const sy = Number.isFinite(seg.y) ? seg.y : hipsY;

        const thickness = 13.5 - (i * 1.3); 
        ctx.strokeStyle = tailColor;
        ctx.lineWidth = Math.max(thickness, 1.5);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.stroke();

        ctx.strokeStyle = tailOutline;
        ctx.lineWidth = Math.max(thickness + 1.2, 2.2);
        ctx.stroke();
      }
    }

    // 2. Warm organic skin gradient
    let slugGrad: CanvasGradient | string;
    try {
      const grad = ctx.createLinearGradient(
        headX, headY - 10,
        hipsX, hipsY + 12
      );
      if (entity.state === 'dead') {
        grad.addColorStop(0, '#cbd5e1');
        grad.addColorStop(0.5, '#94a3b8');
        grad.addColorStop(1, '#64748b');
      } else {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#f1f5f9');
        grad.addColorStop(1, '#e2e8f0');
      }
      slugGrad = grad;
    } catch {
      slugGrad = entity.state === 'dead' ? '#94a3b8' : '#f8fafc';
    }

    ctx.fillStyle = slugGrad;
    ctx.strokeStyle = entity.state === 'dead' ? '#334155' : '#0f172a';
    ctx.lineWidth = 1.3;

    // 3. Feet / Paws
    if (entity.isGrounded && entity.state !== 'dead') {
      const feetY = hipsY + (entity.crouching ? 8 : 11.5);
      ctx.fillStyle = '#faf0db';
      ctx.strokeStyle = '#855140';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      ctx.ellipse(hipsX - 7, feetY, 4.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(hipsX + 7, feetY, 4.5, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 4. Arms / Hands / Held item
    if (entity.isClimbing) {
      ctx.strokeStyle = '#faf0db';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(chestX - 5, chestY - 4);
      ctx.quadraticCurveTo(chestX + (dirSign * 14), chestY - 9, chestX + (dirSign * 8), chestY + 1);
      ctx.stroke();

      ctx.strokeStyle = '#855140';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // Render Held Item while climbing
      if (entity.heldItem) {
        const itemType = (typeof entity.heldItem === 'string'
          ? entity.heldItem
          : entity.heldItem?.type) as ItemType;

        if (itemType === 'spear' || itemType === 'rock' || itemType === 'berry') {
          drawWorldItem(ctx, {
            id: 'held-climb-display',
            type: itemType,
            x: chestX + (dirSign * 8),
            y: chestY - 1,
            rotation: dirSign > 0 ? -0.4 : 0.4,
            vx: 0,
            vy: 0,
            isHeld: true,
            isStuck: false,
            isAirborne: false,
          });
        }
      }

    } else if (entity.state === 'normal') {
      const evx = Number.isFinite(entity.vx) ? entity.vx : 0;
      const evy = Number.isFinite(entity.vy) ? entity.vy : 0;
      const armSwing = Math.abs(evx) > 0.4 ? Math.sin(t * 2.0) * 4 : 0;
      ctx.strokeStyle = '#faf0db';
      ctx.lineWidth = 3.0;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(chestX - 4, chestY + 1);
      ctx.lineTo(chestX - 9 + armSwing, chestY + 7 + (evy * 0.4));
      ctx.moveTo(chestX + 4, chestY + 1);
      ctx.lineTo(chestX + 9 - armSwing, chestY + 7 + (evy * 0.4));
      ctx.stroke();

      // Render Held Item in front paw (Works for both local WorldItem object and remote string packet)
      if (entity.heldItem) {
        const itemType = (typeof entity.heldItem === 'string'
          ? entity.heldItem
          : entity.heldItem?.type) as ItemType;

        if (itemType === 'spear' || itemType === 'rock' || itemType === 'berry') {
          drawWorldItem(ctx, {
            id: 'held-display',
            type: itemType,
            x: chestX + (dirSign * 10),
            y: chestY + 4,
            rotation: dirSign > 0 ? -0.2 : 0.2,
            vx: 0,
            vy: 0,
            isHeld: true,
            isStuck: false,
            isAirborne: false,
          });
        }
      }

    } else if (entity.state === 'stunned') {
      ctx.strokeStyle = '#faf0db';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      const dazeArm = Math.sin(t * 4) * 3;
      ctx.beginPath();
      ctx.moveTo(chestX - 5, chestY);
      ctx.lineTo(chestX - 11, chestY + 5 + dazeArm);
      ctx.moveTo(chestX + 5, chestY);
      ctx.lineTo(chestX + 11, chestY + 5 - dazeArm);
      ctx.stroke();

    } else if (entity.state === 'dead') {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(chestX - 4, chestY);
      ctx.lineTo(chestX - 12, chestY + 3);
      ctx.moveTo(chestX + 4, chestY);
      ctx.lineTo(chestX + 10, chestY + 4);
      ctx.stroke();
    }

    // 5. Organically Connected Soft Body Blobs (Hips, Chest, Head)
    const headRad = entity.state === 'dead' ? 9.0 : 10.0;
    const chestRad = entity.state === 'dead' ? 10.5 : (entity.crouching ? 12.5 : 11.6);
    const hipsRad = entity.state === 'dead' ? 11.5 : (entity.crouching ? 13.5 : 12.8);

    ctx.fillStyle = slugGrad;
    ctx.beginPath();
    ctx.arc(hipsX, hipsY, hipsRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(chestX, chestY, chestRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(headX, headY, headRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hulls
    ctx.beginPath();
    ctx.moveTo(headX - headRad, headY);
    ctx.lineTo(chestX - chestRad, chestY);
    ctx.lineTo(hipsX - hipsRad, hipsY);
    ctx.lineTo(hipsX + hipsRad, hipsY);
    ctx.lineTo(chestX + chestRad, chestY);
    ctx.lineTo(headX + headRad, headY);
    ctx.closePath();
    ctx.fillStyle = slugGrad;
    ctx.fill();

    // Smooth outer contour lines
    ctx.strokeStyle = entity.state === 'dead' ? '#334155' : '#855140';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(headX - headRad, headY);
    ctx.lineTo(chestX - chestRad, chestY);
    ctx.lineTo(hipsX - hipsRad, hipsY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(headX + headRad, headY);
    ctx.lineTo(chestX + chestRad, chestY);
    ctx.lineTo(hipsX + hipsRad, hipsY);
    ctx.stroke();

    // 6. Pearlescent belly patch
    if (entity.state !== 'dead') {
      try {
        const bellyGrad = ctx.createRadialGradient(
          chestX + (dirSign * 2), chestY + 4, 1,
          chestX + (dirSign * 2), chestY + 6, 12
        );
        bellyGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        bellyGrad.addColorStop(0.7, 'rgba(254, 243, 199, 0.35)');
        bellyGrad.addColorStop(1, 'rgba(254, 243, 199, 0)');

        ctx.fillStyle = bellyGrad;
        ctx.beginPath();
        ctx.ellipse(
          chestX + (dirSign * 2), 
          chestY + 5, 
          6.5, 
          entity.crouching ? 5 : 9, 
          0, 0, Math.PI * 2
        );
        ctx.fill();
      } catch {
        // Safe skip
      }
    }

    // 7. Long Floppy Rounded Ears
    const earLeftX = headX - 4.8;
    const earLeftY = headY - 7;
    const earRightX = headX + 4.8;
    const earRightY = headY - 7;
    const earSway = Number.isFinite(entity.earSway) ? entity.earSway : 0;

    ctx.fillStyle = entity.state === 'dead' ? '#94a3b8' : '#fef08a';
    ctx.strokeStyle = entity.state === 'dead' ? '#334155' : '#855140';
    ctx.lineWidth = 1.3;

    // Left Ear
    ctx.save();
    ctx.translate(earLeftX, earLeftY);
    const earAngLeft = entity.state === 'dead' 
      ? -0.8 
      : (entity.state === 'stunned' ? -0.45 + (earSway * 0.08) : -0.15 + (earSway * 0.05));
    ctx.beginPath();
    ctx.ellipse(0, -9, 4.4, 11.5, earAngLeft, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (entity.state !== 'dead') {
      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.ellipse(0, -9, 2.0, 7.5, earAngLeft, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Right Ear
    ctx.save();
    ctx.translate(earRightX, earRightY);
    const earAngRight = entity.state === 'dead' 
      ? 0.8 
      : (entity.state === 'stunned' ? 0.45 + (earSway * 0.08) : 0.15 + (earSway * 0.05));
    ctx.fillStyle = entity.state === 'dead' ? '#94a3b8' : '#fef08a';
    ctx.beginPath();
    ctx.ellipse(0, -9, 4.4, 11.5, earAngRight, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (entity.state !== 'dead') {
      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath();
      ctx.ellipse(0, -9, 2.0, 7.5, earAngRight, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 8. Face Features: Eyes & Expressions
    const faceX = headX + (dirSign * 4.5);
    const faceY = headY - 1.2;

    if (entity.state === 'dead') {
      // Crossed '× ×' eyes
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';

      const leX = faceX - 3.5;
      const leY = faceY;
      ctx.beginPath();
      ctx.moveTo(leX - 3, leY - 3);
      ctx.lineTo(leX + 3, leY + 3);
      ctx.moveTo(leX + 3, leY - 3);
      ctx.lineTo(leX - 3, leY + 3);
      ctx.stroke();

      const reX = faceX + 3.5;
      const reY = faceY;
      ctx.beginPath();
      ctx.moveTo(reX - 3, reY - 3);
      ctx.lineTo(reX + 3, reY + 3);
      ctx.moveTo(reX + 3, reY - 3);
      ctx.lineTo(reX - 3, reY + 3);
      ctx.stroke();

    } else if (entity.state === 'stunned') {
      // Dazed Squint '> <' and spinning dizzy stars over head
      ctx.strokeStyle = '#0f0b12';
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(faceX - 5.5, faceY - 2.5);
      ctx.lineTo(faceX - 2.5, faceY);
      ctx.lineTo(faceX - 5.5, faceY + 2.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(faceX + 5.5, faceY - 2.5);
      ctx.lineTo(faceX + 2.5, faceY);
      ctx.lineTo(faceX + 5.5, faceY + 2.5);
      ctx.stroke();

      // Tiny dazed open mouth
      ctx.fillStyle = '#0f0b12';
      ctx.beginPath();
      ctx.ellipse(faceX, faceY + 4.5, 1.8, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Spinning Dizzy Stars orbiting head
      const starCount = 3;
      for (let s = 0; s < starCount; s++) {
        const starAngle = (t * 4.0) + (s * (Math.PI * 2 / starCount));
        const sx = headX + Math.cos(starAngle) * 14;
        const sy = headY - 18 + Math.sin(starAngle) * 5;

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (entity.state === 'sleeping') {
      // Peaceful sleeping curved eyes '‿ ‿' & floating zZz
      ctx.strokeStyle = '#0f0b12';
      ctx.lineWidth = 2.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(faceX - 3.5, faceY - 1, 2.8, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(faceX + 3.5, faceY - 1, 2.8, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();

      // Floating gentle zZz
      const zOffset = (t * 1.8) % 3;
      ctx.font = 'bold 7px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('z', headX + 8 + zOffset * 2, headY - 8 - zOffset * 4);
      ctx.font = 'bold 9px monospace';
      ctx.fillText('Z', headX + 12 + zOffset * 2, headY - 14 - zOffset * 4);

    } else {
      // Normal beady vertical eyes with blinking
      const blinkTimer = Number.isFinite(entity.blinkTimer) ? entity.blinkTimer : 0;
      const isBlinking = blinkTimer > 3.8;
      ctx.fillStyle = '#0f0b12';

      if (isBlinking) {
        ctx.strokeStyle = '#0f0b12';
        ctx.lineWidth = 2.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(faceX - 5.5, faceY);
        ctx.lineTo(faceX - 1.0, faceY);
        ctx.moveTo(faceX + 1.0, faceY);
        ctx.lineTo(faceX + 5.5, faceY);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(faceX - 3.2, faceY, 2.5, 4.8, 0.05 * dirSign, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(faceX + 3.2, faceY, 2.5, 4.8, -0.05 * dirSign, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(faceX - 2.8, faceY - 2.0, 0.9, 0, Math.PI * 2);
        ctx.arc(faceX + 3.6, faceY - 2.0, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Tiny cute horizontal dash nose
      ctx.strokeStyle = '#0f0b12';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(faceX - 0.8, faceY + 4.2);
      ctx.lineTo(faceX + 0.8, faceY + 4.2);
      ctx.stroke();
    }

    // 9. Eating Indicator & Munching Sparkles (if Player is currently eating berry)
    if (isPlayer && isEating) {
      // Chewing particles around mouth
      const mouthX = headX + (dirSign * 6);
      const mouthY = headY + 4;
      for (let cp = 0; cp < 2; cp++) {
        const crumbOffset = Math.sin(t * 15 + cp * 2) * 4;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(mouthX + crumbOffset, mouthY + Math.abs(crumbOffset) * 0.8, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3.5s Eating Progress Circle above head
      const bubbleY = headY - 24;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(headX, bubbleY, 8.5, 0, Math.PI * 2);
      ctx.fill();

      // Background ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(headX, bubbleY, 7.5, 0, Math.PI * 2);
      ctx.stroke();

      // Progress radial fill
      const progressAng = (eatingProgress / 100) * (Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(headX, bubbleY, 7.5, -Math.PI / 2, -Math.PI / 2 + progressAng);
      ctx.stroke();
    }

    // 10. Remote Player Name Tag & Identity Pill
    if (displayName) {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      const textWidth = ctx.measureText(displayName).width;
      const tagX = headX;
      const tagY = headY - (isPlayer ? 24 : 18);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(tagX - textWidth / 2 - 4, tagY - 9, textWidth + 8, 12);
      ctx.strokeStyle = isPlayer ? '#38bdf8' : '#34d399';
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX - textWidth / 2 - 4, tagY - 9, textWidth + 8, 12);

      ctx.fillStyle = isPlayer ? '#e0f2fe' : '#ecfdf5';
      ctx.fillText(displayName, tagX, tagY);
      ctx.restore();
    }

    ctx.restore();
  }

  // Guard against mobile browser synthetic mouse events (ghost mousedown/click on touch release)
  const lastTouchTimestampRef = useRef<number>(0);

  // Touch action button handlers with instant controlsRef update
  const handlePress = (btn: 'left' | 'right' | 'up' | 'down' | 'jump', isPressed: boolean) => {
    controlsRef.current[btn] = isPressed;
    setControls(prev => ({ ...prev, [btn]: isPressed }));
  };

  // Touch & Mouse handlers that support simultaneous multi-touch without gesture conflicts
  const getContinuousTouchHandlers = (btn: 'left' | 'right' | 'up' | 'down' | 'jump') => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handlePress(btn, true);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handlePress(btn, false);
    },
    onTouchCancel: (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handlePress(btn, false);
    },
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        handlePress(btn, true);
      }
    },
    onMouseUp: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handlePress(btn, false);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      handlePress(btn, false);
    },
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  const getActionTouchHandlers = (actionRef: React.MutableRefObject<(() => void) | null>) => {
    let lastActionFired = 0;
    const trigger = (e: React.SyntheticEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - lastActionFired < 170) return;
      lastActionFired = now;
      actionRef.current?.();
    };

    return {
      onTouchStart: trigger,
      onMouseDown: (e: React.MouseEvent) => {
        if (e.button === 0) trigger(e);
      },
      onClick: trigger,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      }
    };
  };

  // Hibernation & Progress Persistence handler:
  // "пофікси сон я зажимаю кнопку прижка а слизне кот не спить... а для мультиплеєра це буде як типа він спить то його ранить нельзя і нічого більше тоєсть він сохранился а той игрок який ліг спать він до конца цикла наблюдатель..."
  const handleHibernate = () => {
    const isStarvation = foodCount < 4;

    // In multiplayer: player falls asleep, becomes invulnerable, saves progress, and enters spectator mode
    if (isMultiplayerActive) {
      soundEngine.playKarmaAscend();
      const newKarma = isStarvation ? Math.max(1, playerSave.karma - 1) : Math.min(5, playerSave.karma + 1);
      const newCycle = playerSave.cycle + 1;
      const newFood = Math.max(0, foodCount - (isStarvation ? foodCount : 4));

      const updatedSave: PlayerSaveData = {
        karma: newKarma,
        maxKarma: 5,
        cycle: newCycle,
        food: newFood,
        lastLocationId: currentLocation.id,
        playerSpawnX: Math.round(telemetry.x),
        playerSpawnY: Math.round(telemetry.y),
        hibernated: true
      };

      setPlayerSave(updatedSave);
      setFoodCount(newFood);
      try {
        localStorage.setItem('rain_world_player_progress', JSON.stringify(updatedSave));
      } catch (e) {
        console.warn('Failed to save multiplayer sleep progress:', e);
      }

      setIsSpectating(true);
      const living = Array.from(webRTCManager.remotePlayers.values()).filter(p => p.state !== 'dead');
      if (living.length > 0) {
        setSpectatedPeerId(living[0].id);
      }
      setLastAction(isStarvation 
        ? "😴 Заснули від виснаження в укритті! (Голодний сон: карма -1). Режим спостерігача."
        : "😴 Ви заснули в укритті! Прогрес збережено. Режим спостерігача активовано.");
      return;
    }

    // Single-player hibernation (including starvation hibernation if food < 4)
    setIsHibernating(true);
    soundEngine.playShelterDoor();
    if (isStarvation) {
      setLastAction("⚠️ Гібернація від виснаження! Карма знизилась через брак їжі (менше 4).");
    }

    setTimeout(() => {
      soundEngine.playKarmaAscend();
      const newKarma = isStarvation ? Math.max(1, playerSave.karma - 1) : Math.min(5, playerSave.karma + 1);
      const newCycle = playerSave.cycle + 1;
      const newFood = Math.max(0, foodCount - (isStarvation ? foodCount : 4));

      const updatedSave: PlayerSaveData = {
        karma: newKarma,
        maxKarma: 5,
        cycle: newCycle,
        food: newFood,
        lastLocationId: currentLocation.id,
        playerSpawnX: Math.round(telemetry.x),
        playerSpawnY: Math.round(telemetry.y),
        hibernated: true
      };

      setPlayerSave(updatedSave);
      setFoodCount(newFood);
      try {
        localStorage.setItem('rain_world_player_progress', JSON.stringify(updatedSave));
      } catch (e) {
        console.warn('Failed to save hibernation progress:', e);
      }

      // Reset cycle timer to fresh randomized duration
      const freshDuration = getRandomCycleSeconds();
      setCycleTotalDuration(freshDuration);
      setCycleSecondsLeft(freshDuration);
      setStormActive(false);
      setStormSeconds(0);
      soundEngine.setStormVolume(0);

      // Reset cycle items and creatures for the new fresh cycle!
      cycleRoomItemsCache.current.clear();
      cycleLizardsRef.current.clear();
      lizardCombatTimerRef.current = 0;
      pvpCombatTimerRef.current = 0;
      pvpTargetPeerIdRef.current = null;

      setTimeout(() => {
        setIsHibernating(false);
        setInShelterChamber(false);
        soundEngine.playShelterDoor();
        setLastAction(isStarvation 
          ? `Цикл ${newCycle} розпочато ослабленим (карма ${newKarma}/5). Знайдіть їжу!`
          : `Успішна гібернація! Карма підвищена до ${newKarma}/5. Цикл ${newCycle} розпочато!`);
      }, 1800);
    }, 1200);
  };

  triggerHibernateRef.current = handleHibernate;

  const handleSelectLocation = (loc: CustomLocationData) => {
    distributedSimulation.enterRoom(loc.id);
    if (heldItemType) {
      persistedHeldItemRef.current = heldItemType;
    }
    setCurrentLocation(loc);
    setShowLocationModal(false);
    setInShelterChamber(false);
    setLastAction(`Перехід до локації: ${loc.name}`);
  };

  triggerChangeLocationRef.current = handleSelectLocation;

  return (
    <div 
      ref={containerRef}
      style={{ touchAction: 'none' }}
      className="absolute inset-0 bg-[#0c0a10] z-40 flex flex-col items-center justify-between font-sans text-slate-100 overflow-hidden select-none touch-none"
    >
      
      {/* GitHub Update Notification Banner */}
      {/* "додай щоб гра на клієнті кожні 20 сикунд провіряла версіЮ фАйла на гит хабі єслі там новіша чим та що на клієнті то воно зверху показувало зверху сопщения що через 5 минут буде примусовий перезапуск сторінки..." */}
      <AnimatePresence>
        {updateCountdown !== null && (
          <motion.div
            initial={{ opacity: 0, y: -25 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -25 }}
            className="w-full z-[60] bg-gradient-to-r from-red-950 via-amber-950 to-red-950 border-b-2 border-amber-500/80 text-white px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-2xl font-mono text-[11px] sm:text-xs select-none"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping inline-block" />
              <span className="font-bold text-amber-400 tracking-wider">⚠️ ОНОВЛЕННЯ НА GITHUB!</span>
              <span className="text-zinc-200">
                Перезапуск через: <strong className="text-amber-300 font-mono text-sm font-black">{Math.floor(updateCountdown / 60)}:{String(updateCountdown % 60).padStart(2, '0')}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-amber-200/90">
              <span className="hidden sm:inline font-sans">Дійдіть до укриття (убержки) для екстреного збереження!</span>
              <button
                onClick={() => window.location.reload()}
                className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase cursor-pointer text-[9px] active:scale-95 shadow-sm"
              >
                Оновити зараз
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Ambient Control Bar */}
      <div className="w-full flex items-center justify-between px-2 py-2 sm:px-4 sm:py-3 z-50 bg-gradient-to-b from-black/85 to-transparent">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              webRTCManager.disconnect();
              onBack();
            }}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono tracking-wider shadow-sm active:scale-95"
            title="Повернутися в головне меню"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-bold">МЕНЮ</span>
          </button>

          {/* Multiplayer Room indicator if connected */}
          {networkStatus === 'connected' && (
            <div 
              className="px-2 py-1 rounded-lg border border-emerald-500/50 bg-emerald-950/70 text-emerald-300 font-mono text-[10px] flex items-center gap-1 shadow-sm"
              title={`Підключено до кімнати: ${webRTCManager.currentRoomId}`}
            >
              <Globe className="w-3 h-3 text-emerald-400" />
              <span className="font-bold">{connectedPeersCount + 1}/12</span>
              {networkPing > 0 && <span className="text-zinc-500 hidden sm:inline">({networkPing}мс)</span>}
            </div>
          )}

          {/* Location Selector Button */}
          <button
            onClick={() => setShowLocationModal(true)}
            className="px-2 py-1.5 rounded-lg border border-amber-800/60 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono tracking-wider shadow-sm active:scale-95"
            title="Переглянути та обрати готові локації Rain World"
          >
            <MapIcon className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold hidden sm:inline">{currentLocation.name.split(' (')[0]}</span>
            <span className="text-[10px] text-zinc-500">▾</span>
          </button>
        </div>

        {/* Action / State ticker (Hidden on mobile to save space) */}
        <div className="hidden md:flex items-center gap-2">
          {telemetry.state === 'dead' ? (
            <div className="px-3 py-1 rounded border border-red-800/80 bg-red-950/70 text-[10px] font-mono text-red-300 flex items-center gap-1.5 animate-pulse">
              <Skull className="w-3.5 h-3.5 text-red-400" />
              <span>ЗАГИБЕЛЬ (0 HP)</span>
            </div>
          ) : (
            <div className="px-3 py-1 rounded border border-zinc-800/40 bg-zinc-950/60 text-[10px] font-mono text-zinc-400 max-w-xs truncate flex items-center">
              <span className="text-green-500 animate-pulse mr-1">●</span> {lastAction}
            </div>
          )}
        </div>

        {/* Right side compact controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Open in Standalone Tab Button */}
          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 sm:px-2 rounded-lg border border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-xs font-mono active:scale-95 shadow-sm"
            title="Відкрити гру в окремій вкладці браузера без інтерфейсу Google AI Studio"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline font-bold">НОВА ВКЛАДКА</span>
          </a>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 sm:px-2 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-xs font-mono active:scale-95 shadow-sm"
            title={isFullscreen ? 'Вийти з повного екрана' : 'Відкрити на повний екран'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5 text-amber-400" />}
            <span className="hidden sm:inline font-bold">{isFullscreen ? 'ЗГОРНУТИ' : 'ЕКРАН'}</span>
          </button>

          {/* Zoom Level Cycle Button */}
          <button
            onClick={cycleZoom}
            className="px-2 py-1 rounded-lg border border-amber-800/60 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 font-mono text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-sm"
            title="Змінити наближення камери (1.0x, 1.35x, 1.65x, 2.0x)"
          >
            <ZoomIn className="w-3 h-3 text-amber-400" />
            <span className="font-bold">{zoomLevel}x</span>
          </button>

          {/* Touch Controls Toggle Button */}
          <button
            onClick={() => setShowTouchControls(prev => !prev)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center active:scale-95 ${
              showTouchControls
                ? 'border-amber-700/80 bg-amber-950/40 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-500 hover:text-zinc-300'
            }`}
            title={showTouchControls ? 'Сховати екранні кнопки' : 'Показати екранні кнопки'}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
          </button>


          {/* Mute toggle */}
          <button
            onClick={toggleSound}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer active:scale-95"
            title={isSoundMuted ? "Увімкнути звук" : "Вимкнути звук"}
          >
            {isSoundMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-500" />}
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 w-full max-w-5xl h-full flex items-center justify-center p-2 sm:p-4">
        
        {/* Soft vignette */}
        <div className="absolute inset-0 pointer-events-none border border-zinc-900/10 rounded-2xl z-20 shadow-[inset_0_0_80px_rgba(0,0,0,0.85)]" />
        
        {/* Canvas stage */}
        <div className="relative w-full aspect-[1000/580] max-h-[75vh] bg-black rounded-lg sm:rounded-2xl overflow-hidden border border-zinc-800/30 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-full object-contain"
          />

          {/* ON-CANVAS QUICK CONTROLS (FULLSCREEN & STANDALONE TAB) */}
          <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5">
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1.5 rounded-lg bg-black/60 hover:bg-black/85 border border-white/20 text-white/90 hover:text-cyan-300 transition-all cursor-pointer backdrop-blur-sm active:scale-95 flex items-center gap-1.5 text-[10px] font-mono shadow-lg"
              title="Відкрити гру в окремій чистій вкладці браузера (без інтерфейсу Google AI Studio)"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden xs:inline font-bold">НОВА ВКЛАДКА</span>
            </a>

            <button
              onClick={toggleFullscreen}
              className="px-2 py-1.5 rounded-lg bg-black/60 hover:bg-black/85 border border-white/20 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-sm active:scale-95 flex items-center gap-1.5 text-[10px] font-mono shadow-lg"
              title={isFullscreen ? 'Вийти з повного екрана' : 'Відкрити гру на повний екран'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5 text-amber-400" />}
              <span className="hidden xs:inline font-bold">{isFullscreen ? 'ЗГОРНУТИ' : 'ПОВНИЙ ЕКРАН'}</span>
            </button>
          </div>

          {/* BOTTOM-LEFT GAME SCREEN OVERLAY: AUTHENTIC RAIN WORLD KARMA (10 CYCLE DOTS) & 7 FOOD PIPS */}
          <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-30 flex items-center gap-3.5 pointer-events-none select-none">
            {/* Rain World Karma Wheel with 10 Clockwise Depleting Cycle Dots */}
            <div 
              className="relative flex items-center justify-center filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]"
              title={`Рівень карми: ${playerSave.karma} / 5 • Залишок циклу: ${Math.floor(cycleSecondsLeft / 60)}хв ${cycleSecondsLeft % 60}с`}
            >
              <svg className="w-11 h-11 sm:w-12 sm:h-12 overflow-visible" viewBox="0 0 60 60" fill="none">
                {/* Background dark circle */}
                <circle cx="30" cy="30" r="26" fill="rgba(0,0,0,0.55)" />

                {/* 10 Clockwise Cycle Dots around Karma */}
                {Array.from({ length: 10 }).map((_, i) => {
                  const fraction = Math.max(0, cycleSecondsLeft / cycleTotalDuration);
                  const activePips = fraction * 10;
                  
                  let dotRadius = 0;
                  let dotOpacity = 0;
                  if (activePips >= i + 1) {
                    dotRadius = 2.4;
                    dotOpacity = 0.95;
                  } else if (activePips > i && activePips < i + 1) {
                    const portion = activePips - i;
                    dotRadius = 2.4 * portion;
                    dotOpacity = portion;
                  }

                  if (dotRadius <= 0.2) return null;

                  // Clockwise angles: index 0 is 12 o'clock (-PI/2), index 1 is 1:12, etc.
                  const angle = -Math.PI / 2 + (i / 10) * (2 * Math.PI);
                  const R = 23;
                  const dotX = 30 + R * Math.cos(angle);
                  const dotY = 30 + R * Math.sin(angle);

                  return (
                    <circle
                      key={i}
                      cx={dotX}
                      cy={dotY}
                      r={dotRadius}
                      fill="#ffffff"
                      opacity={dotOpacity}
                    />
                  );
                })}

                {/* Karma Ring & Symbols according to current Karma level */}
                <circle cx="30" cy="30" r="16" stroke="#ffffff" strokeWidth="1.8" />
                <circle cx="30" cy="30" r="10" stroke="#ffffff" strokeWidth="1.3" />
                <line x1="30" y1="14" x2="30" y2="46" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="14" y1="30" x2="46" y2="30" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="30" cy="30" r="3" fill="#ffffff" />
                
                {/* Karma level marks (1 to 5) */}
                {playerSave.karma >= 2 && <circle cx="23" cy="23" r="1.4" fill="#ffffff" />}
                {playerSave.karma >= 3 && <circle cx="37" cy="23" r="1.4" fill="#ffffff" />}
                {playerSave.karma >= 4 && <circle cx="23" cy="37" r="1.4" fill="#ffffff" />}
                {playerSave.karma >= 5 && <circle cx="37" cy="37" r="1.4" fill="#ffffff" />}

                {/* Warning glow if cycle expired and lethal storm has started */}
                {cycleSecondsLeft <= 0 && (
                  <circle cx="30" cy="30" r="26" stroke="#ef4444" strokeWidth="1.8" className="animate-pulse" />
                )}
              </svg>
            </div>

            {/* Rain World Food Pips: 4 Required + Divider + 3 Extra */}
            <div className="flex items-center gap-1.5 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {/* 4 Required Food Pips */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => {
                  const isFilled = i < foodCount;
                  const isJustFilled = i === justFilledIndex;

                  return (
                    <div
                      key={`req-${i}`}
                      className="relative flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5"
                      title={`Обов'язкова ячейка їжі ${i + 1} / 4 (потрібна для виживання)`}
                    >
                      {isFilled ? (
                        <motion.div 
                          initial={isJustFilled ? { scale: 0.3 } : false}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 350, damping: 15 }}
                          className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)]" 
                        />
                      ) : (
                        <div className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border-2 border-white/80 bg-black/40" />
                      )}

                      {/* Expanding white pulse wave when freshly filled */}
                      {isJustFilled && (
                        <>
                          <motion.div
                            initial={{ scale: 1, opacity: 1 }}
                            animate={{ scale: 3.2, opacity: 0 }}
                            transition={{ duration: 0.65, ease: "easeOut" }}
                            className="absolute inset-0 rounded-full border-2 border-white pointer-events-none"
                          />
                          <motion.div
                            initial={{ scale: 0.8, opacity: 0.85 }}
                            animate={{ scale: 2.2, opacity: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="absolute inset-0 rounded-full bg-white/50 pointer-events-none"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pip Divider Bar */}
              <div className="w-[2px] h-4 sm:h-5 bg-white/40 rounded-full mx-0.5" />

              {/* 3 Extra Surplus Food Pips */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 3 }).map((_, idx) => {
                  const pipIndex = 4 + idx;
                  const isFilled = pipIndex < foodCount;
                  const isJustFilled = pipIndex === justFilledIndex;

                  return (
                    <div
                      key={`extra-${pipIndex}`}
                      className="relative flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4"
                      title={`Додаткова ячейка їжі ${idx + 1} / 3 (зберігається на наступний цикл)`}
                    >
                      {isFilled ? (
                        <motion.div 
                          initial={isJustFilled ? { scale: 0.3 } : false}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 350, damping: 15 }}
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.95)]" 
                        />
                      ) : (
                        <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-sky-400/60 bg-sky-950/30" />
                      )}

                      {isJustFilled && (
                        <motion.div
                          initial={{ scale: 1, opacity: 1 }}
                          animate={{ scale: 3.2, opacity: 0 }}
                          transition={{ duration: 0.65, ease: "easeOut" }}
                          className="absolute inset-0 rounded-full border-2 border-sky-300 pointer-events-none"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* HOLOGRAPHIC ROOM MAP OVERLAY (КАРТА КІМНАТИ ОКРАЇН) */}
          <AnimatePresence>
            {showMapOverlay && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-2 sm:inset-4 z-40 bg-black/94 backdrop-blur-md rounded-2xl border-2 border-amber-600/60 p-3 sm:p-5 flex flex-col justify-between shadow-2xl font-mono select-none"
              >
                {/* Map Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full border border-amber-400 bg-amber-950/50 flex items-center justify-center">
                      <Compass className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-amber-400 tracking-wider">
                        ГОЛОГРАФІЧНА КАРТА: ОКРАЇНИ // SU_A01
                      </h3>
                      <p className="text-[9px] text-zinc-400">
                        Rain World Room Radar • Позиція слимакокота, предмети та труби
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowMapOverlay(false)}
                    className="p-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tactical Room Schematic SVG */}
                <div className="relative flex-1 w-full my-2 bg-zinc-950/80 rounded-xl border border-zinc-800 overflow-hidden flex items-center justify-center p-2">
                  <svg viewBox="0 0 1000 580" className="w-full h-full object-contain">
                    {/* Background grid */}
                    <defs>
                      <pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(245, 158, 11, 0.08)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="1000" height="580" fill="url(#mapgrid)" />

                    {/* Room boundaries & platforms */}
                    <rect x="0" y="520" width="1000" height="60" fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth="2" />
                    <rect x="30" y="400" width="110" height="18" fill="rgba(245, 158, 11, 0.25)" stroke="#d97706" strokeWidth="1.5" />
                    <rect x="20" y="280" width="110" height="18" fill="rgba(245, 158, 11, 0.25)" stroke="#d97706" strokeWidth="1.5" />
                    <rect x="30" y="160" width="110" height="18" fill="rgba(245, 158, 11, 0.25)" stroke="#d97706" strokeWidth="1.5" />
                    
                    <rect x="230" y="310" width="85" height="210" fill="rgba(120, 113, 108, 0.3)" stroke="#78716c" strokeWidth="1.5" />
                    <rect x="440" y="310" width="85" height="210" fill="rgba(120, 113, 108, 0.3)" stroke="#78716c" strokeWidth="1.5" />
                    <rect x="555" y="280" width="85" height="240" fill="rgba(120, 113, 108, 0.3)" stroke="#78716c" strokeWidth="1.5" />
                    <rect x="790" y="380" width="90" height="140" fill="rgba(120, 113, 108, 0.3)" stroke="#78716c" strokeWidth="1.5" />

                    <rect x="330" y="140" width="460" height="16" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" strokeWidth="1.5" />
                    <rect x="840" y="180" width="160" height="18" fill="rgba(245, 158, 11, 0.25)" stroke="#d97706" strokeWidth="1.5" />

                    {/* Exit Pipes */}
                    <g fill="#22c55e">
                      <rect x="0" y="470" width="22" height="40" fill="rgba(34, 197, 94, 0.3)" stroke="#22c55e" strokeWidth="1.5" />
                      <text x="26" y="495" fill="#22c55e" fontSize="16" fontWeight="bold">ВХІД / ВИХІД</text>

                      <rect x="978" y="470" width="22" height="40" fill="rgba(34, 197, 94, 0.3)" stroke="#22c55e" strokeWidth="1.5" />
                      <text x="870" y="495" fill="#22c55e" fontSize="16" fontWeight="bold">ВИХІД СУБ</text>
                    </g>

                    {/* NPC Position */}
                    <circle cx={telemetry.npcX} cy={telemetry.npcY} r="10" fill="#06b6d4" stroke="#ffffff" strokeWidth="2" />
                    <text x={telemetry.npcX} y={telemetry.npcY - 14} fill="#06b6d4" fontSize="14" fontWeight="bold" textAnchor="middle">
                      NPC (3 HP)
                    </text>

                    {/* Live Player Position Marker */}
                    <circle cx={telemetry.x} cy={telemetry.y} r="14" fill="#facc15" stroke="#ffffff" strokeWidth="3" className="animate-pulse" />
                    <circle cx={telemetry.x} cy={telemetry.y} r="24" fill="none" stroke="#facc15" strokeWidth="1.5" opacity="0.6" />
                    <text x={telemetry.x} y={telemetry.y - 18} fill="#facc15" fontSize="16" fontWeight="bold" textAnchor="middle">
                      ВИ (СЛИМАКОКІТ)
                    </text>
                  </svg>
                </div>

                {/* Map Footer Legend */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800 text-[10px] text-zinc-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-amber-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                      Ви ({Math.round(telemetry.x)}, {Math.round(telemetry.y)})
                    </span>
                    <span className="flex items-center gap-1 text-cyan-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
                      NPC ({telemetry.npcX}, {telemetry.npcY})
                    </span>
                    <span className="flex items-center gap-1 text-sky-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block shadow-sm" />
                      Ягід на карті: {telemetry.berriesCount}
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <CircleDot className="w-3 h-3 text-amber-400" />
                      Їжа: {foodCount} / 6
                    </span>
                  </div>

                  <button
                    onClick={() => setShowMapOverlay(false)}
                    className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-black font-bold text-[9px] cursor-pointer"
                  >
                    ЗАКРИТИ [X]
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Intro notice */}
          <AnimatePresence>
            {spawnNotification && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-6 left-1/2 -translate-x-1/2 z-30 bg-black/90 border border-amber-800/40 px-5 py-3 rounded-xl text-center shadow-xl font-sans"
              >
                <span className="text-xs uppercase tracking-[0.2em] text-amber-500 block font-bold mb-1">
                  ДОДАНО СПИС, КАМІНЬ ТА NPC !
                </span>
                <span className="text-[10px] text-zinc-400 block max-w-xs leading-normal">
                  Спис (1 HP, 1.8с/0.8с) та Камінь (0.01 HP, 1.2с/0.5с). NPC має таку ж модельку та 3 HP. Час стану та HP повністю скриті — перевіряйте через Дебаг-меню [F3]!
                </span>
                <button
                  onClick={() => setSpawnNotification(false)}
                  className="mt-2 text-[9px] font-mono font-bold tracking-widest text-slate-100 bg-amber-950/40 border border-amber-800/30 px-3 py-1 rounded hover:bg-amber-500 hover:text-black transition-all cursor-pointer"
                >
                  OK // ЗРОЗУМІЛО
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* DEAD STATE NOTIFICATION BAR - Minimalist bottom black strip */}
          <AnimatePresence>
            {isDead && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className="absolute bottom-3 inset-x-3 sm:max-w-xl sm:mx-auto z-40 bg-black/95 border border-zinc-800 text-zinc-300 px-4 py-2.5 rounded-xl shadow-2xl flex items-center justify-between gap-3 font-mono text-xs backdrop-blur-md"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="truncate text-zinc-300 text-[11px] sm:text-xs">
                    {isMultiplayerActive 
                      ? 'Ви загинули. Очікуйте завершення поточного циклу або початку наступного.' 
                      : 'Ви загинули в дикому світі.'}
                  </span>
                </div>
                {/* Respawn button strictly only in singleplayer! */}
                {!isMultiplayerActive && (
                  <button
                    onClick={() => triggerReviveRef.current?.()}
                    className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white font-bold text-[10px] shrink-0 cursor-pointer transition-colors active:scale-95"
                    title="Швидкий респавн (R)"
                  >
                    Респавн (R)
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* SPECTATOR MODE HUD - For sleeping/hibernated multiplayer observer */}
          <AnimatePresence>
            {isSpectating && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-3 inset-x-3 sm:max-w-xl sm:mx-auto z-40 bg-black/95 border border-sky-800 text-zinc-200 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 font-mono text-xs backdrop-blur-md"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping shrink-0" />
                  <div className="truncate text-left">
                    <span className="text-[10px] text-sky-400 uppercase tracking-widest block font-bold">
                      😴 СПЛЯЧКА В УКРИТТІ • РЕЖИМ СПОСТЕРІГАЧА
                    </span>
                    <span className="text-[11px] text-zinc-300 font-semibold truncate block">
                      {spectatedPeerId && webRTCManager.remotePlayers.get(spectatedPeerId)
                        ? `Спостереження: ${webRTCManager.remotePlayers.get(spectatedPeerId)?.name} (${webRTCManager.remotePlayers.get(spectatedPeerId)?.room})`
                        : 'Очікування активних гравців у циклі...'}
                    </span>
                  </div>
                </div>

                {/* Player cycle buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      const living = Array.from(webRTCManager.remotePlayers.values()).filter(p => p.state !== 'dead');
                      if (living.length === 0) return;
                      const curIdx = living.findIndex(p => p.id === spectatedPeerId);
                      const prevIdx = (curIdx - 1 + living.length) % living.length;
                      setSpectatedPeerId(living[prevIdx].id);
                    }}
                    className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-sky-300 font-bold text-[10px] cursor-pointer"
                    title="Попередній гравець"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => {
                      const living = Array.from(webRTCManager.remotePlayers.values()).filter(p => p.state !== 'dead');
                      if (living.length === 0) return;
                      const curIdx = living.findIndex(p => p.id === spectatedPeerId);
                      const nextIdx = (curIdx + 1) % living.length;
                      setSpectatedPeerId(living[nextIdx].id);
                    }}
                    className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-sky-300 font-bold text-[10px] cursor-pointer"
                    title="Наступний гравець"
                  >
                    →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>


        </div>
      </div>

      {/* ERGONOMIC DUAL-PAD SCREEN CONTROLS SECTION */}
      <AnimatePresence>
        {showTouchControls && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.15 }}
            style={{ touchAction: 'none', paddingBottom: 'max(4.5rem, env(safe-area-inset-bottom, 4.5rem))' }}
            className="w-full max-w-5xl flex items-end justify-between px-4 sm:px-8 pt-1 z-40 select-none pointer-events-none touch-none pb-16 sm:pb-20 mb-6 sm:mb-8"
          >
            {/* LEFT COMPARTMENT: HORIZONTAL NAVIGATION PAD */}
            <div 
              style={{ touchAction: 'none' }}
              className="flex items-center gap-2 sm:gap-3 pointer-events-auto bg-black/75 backdrop-blur-md p-2 sm:p-3 rounded-3xl border border-zinc-700/80 shadow-2xl touch-none select-none mb-3 sm:mb-5 ml-2 sm:ml-4"
            >
              {/* MOVE LEFT BUTTON */}
              <button
                id="touch-ctrl-left"
                type="button"
                style={{ touchAction: 'none' }}
                {...getContinuousTouchHandlers('left')}
                className={`${
                  buttonScale === 'large' 
                    ? 'w-16 h-16 sm:w-20 sm:h-20' 
                    : 'w-14 h-14 sm:w-16 sm:h-16'
                } rounded-2xl border-2 flex flex-col items-center justify-center text-white select-none shadow-xl cursor-pointer transition-all duration-75 touch-none ${
                  controls.left
                    ? 'bg-amber-500/40 border-amber-400 scale-95 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                    : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-700 hover:border-amber-500/80'
                } ${telemetry.state !== 'normal' ? 'opacity-40' : ''}`}
                title="Рух вліво (A / ←)"
              >
                <span className="text-2xl sm:text-3xl font-black">←</span>
                <span className="text-[8px] font-mono font-bold text-zinc-400 mt-[-2px]">ВЛІВО</span>
              </button>

              {/* MOVE RIGHT BUTTON */}
              <button
                id="touch-ctrl-right"
                type="button"
                style={{ touchAction: 'none' }}
                {...getContinuousTouchHandlers('right')}
                className={`${
                  buttonScale === 'large' 
                    ? 'w-16 h-16 sm:w-20 sm:h-20' 
                    : 'w-14 h-14 sm:w-16 sm:h-16'
                } rounded-2xl border-2 flex flex-col items-center justify-center text-white select-none shadow-xl cursor-pointer transition-all duration-75 touch-none ${
                  controls.right
                    ? 'bg-amber-500/40 border-amber-400 scale-95 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                    : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-700 hover:border-amber-500/80'
                } ${telemetry.state !== 'normal' ? 'opacity-40' : ''}`}
                title="Рух вправо (D / →)"
              >
                <span className="text-2xl sm:text-3xl font-black">→</span>
                <span className="text-[8px] font-mono font-bold text-zinc-400 mt-[-2px]">ВПРАВО</span>
              </button>
            </div>

            {/* RIGHT COMPARTMENT: 2-TIER ERGONOMIC ACTION CLUSTER */}
            <div 
              style={{ touchAction: 'none' }}
              className="flex flex-col items-end gap-1.5 sm:gap-2 pointer-events-auto bg-black/60 backdrop-blur-md p-1.5 sm:p-2.5 rounded-3xl border border-zinc-800/80 shadow-2xl touch-none select-none"
            >
              
              {/* UPPER TIER: ITEM ACTIONS (GRAB, THROW) + CLIMB UP */}
              <div className="flex items-center gap-2 sm:gap-2.5">
                {/* EAT BERRY BUTTON (visible when holding berry - zero latency!) */}
                {(heldItemType === 'berry' || telemetry.heldItem === 'berry') && (
                  <button
                    id="touch-ctrl-eat"
                    type="button"
                    style={{ touchAction: 'none' }}
                    {...getActionTouchHandlers(triggerEatRef)}
                    className={`h-13 sm:h-15 px-3 rounded-2xl border-2 flex flex-col items-center justify-center font-mono font-bold active:scale-90 select-none shadow-xl cursor-pointer transition-all touch-none ${
                      isEating 
                        ? 'bg-amber-400 text-black border-amber-300 animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.8)]' 
                        : 'bg-sky-950/90 hover:bg-sky-900 border-sky-400 text-sky-200 shadow-[0_0_15px_rgba(56,189,248,0.4)]'
                    } ${telemetry.state !== 'normal' ? 'opacity-40' : ''}`}
                    title="З'їсти ягоду (заповнює 1 ячейку їжі)"
                  >
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-current mb-0.5 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    </div>
                    <span className="text-[8px] tracking-tight whitespace-nowrap">
                      {isEating ? 'ЇСТЬ...' : 'ЇСТИ'}
                    </span>
                  </button>
                )}

                {/* PIGGYBACK CARRY / DROP BUTTON ("додай кнопку підйома єслі підійти до ігрока який оглушон або який зажав кнопку вниз...") */}
                {(carriedPlayerId || nearbyPickupCandidate) && (
                  <button
                    id="touch-ctrl-piggyback"
                    type="button"
                    style={{ touchAction: 'none' }}
                    {...getActionTouchHandlers(triggerPiggybackRef)}
                    className={`h-13 sm:h-15 px-2.5 rounded-2xl border-2 flex flex-col items-center justify-center font-mono font-bold active:scale-90 select-none shadow-xl cursor-pointer transition-all touch-none ${
                      carriedPlayerId
                        ? 'bg-purple-950/90 border-purple-400 text-purple-200 animate-pulse shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                        : 'bg-indigo-950/90 hover:bg-indigo-900 border-indigo-400 text-indigo-200 shadow-[0_0_12px_rgba(129,140,248,0.3)]'
                    }`}
                    title={carriedPlayerId ? 'Скинути гравця зі спини (G)' : 'Взяти гравця на спину (G)'}
                  >
                    <User className="w-3.5 h-3.5 mb-0.5" />
                    <span className="text-[7.5px] tracking-tight whitespace-nowrap">
                      {carriedPlayerId ? 'СКИНУТИ' : 'НА СПИНУ'}
                    </span>
                  </button>
                )}

                {/* ITEM GRAB / DROP BUTTON */}
                <button
                  id="touch-ctrl-grab"
                  type="button"
                  style={{ touchAction: 'none' }}
                  {...getActionTouchHandlers(triggerGrabRef)}
                  className={`w-13 h-13 sm:w-15 sm:h-15 rounded-2xl border-2 flex flex-col items-center justify-center font-mono font-bold active:scale-90 select-none shadow-xl cursor-pointer transition-all touch-none ${
                    (heldItemType || telemetry.heldItem) 
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]' 
                      : 'bg-zinc-950/90 hover:bg-zinc-900 border-cyan-700/80 text-cyan-300'
                  } ${telemetry.state !== 'normal' ? 'opacity-40' : ''}`}
                  title="Підібрати / Покласти (Z або E)"
                >
                  <CircleDot className="w-4 h-4 mb-0.5" />
                  <span className="text-[8px] tracking-tight">{(heldItemType || telemetry.heldItem) ? 'ПОКЛАСТИ' : 'ВЗЯТИ'}</span>
                </button>

                {/* ITEM THROW BUTTON */}
                <button
                  id="touch-ctrl-throw"
                  type="button"
                  style={{ touchAction: 'none' }}
                  {...getActionTouchHandlers(triggerThrowRef)}
                  className={`w-13 h-13 sm:w-15 sm:h-15 rounded-2xl border-2 flex flex-col items-center justify-center font-mono font-bold active:scale-90 select-none shadow-xl cursor-pointer transition-all touch-none ${
                    (heldItemType || telemetry.heldItem) 
                      ? 'bg-red-950/90 border-red-500 text-red-300 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
                      : 'bg-zinc-950/50 border-zinc-800 text-zinc-600 opacity-40'
                  }`}
                  title="Кинути предмет (X або Q)"
                >
                  <Crosshair className="w-4 h-4 mb-0.5 text-red-400" />
                  <span className="text-[8px] tracking-wider text-red-300">КИД</span>
                </button>

                {/* CLIMB UP BUTTON (ВГОРУ / ЛАЗІННЯ) */}
                <button
                  id="touch-ctrl-up"
                  type="button"
                  style={{ touchAction: 'none' }}
                  {...getContinuousTouchHandlers('up')}
                  className={`w-13 h-13 sm:w-15 sm:h-15 rounded-2xl border-2 flex flex-col items-center justify-center text-white select-none shadow-xl cursor-pointer transition-all duration-75 touch-none ${
                    controls.up
                      ? 'bg-amber-500/40 border-amber-400 scale-95 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                      : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-700 hover:border-amber-500/80'
                  } ${telemetry.state !== 'normal' ? 'opacity-40' : ''}`}
                  title="Піднятися вгору / Схопитися за шест (W / ↑)"
                >
                  <span className="text-xl sm:text-2xl font-black">↑</span>
                  <span className="text-[8px] font-mono font-bold text-zinc-400 mt-[-2px]">ВГОРУ</span>
                </button>
              </div>

              {/* LOWER TIER: CLIMB DOWN / CROUCH + HUGE ERGONOMIC JUMP PAD */}
              <div className="flex items-center gap-2 sm:gap-2.5">
                {/* CLIMB DOWN / CROUCH BUTTON (ВНИЗ / ПРИСІСТИ) */}
                <button
                  id="touch-ctrl-down"
                  type="button"
                  style={{ touchAction: 'none' }}
                  {...getContinuousTouchHandlers('down')}
                  className={`w-13 h-13 sm:w-15 sm:h-15 rounded-2xl border-2 flex flex-col items-center justify-center text-white select-none shadow-xl cursor-pointer transition-all duration-75 touch-none ${
                    controls.down
                      ? 'bg-amber-500/40 border-amber-400 scale-95 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                      : 'bg-zinc-950/90 hover:bg-zinc-900 border-zinc-700 hover:border-amber-500/80'
                  } ${telemetry.state !== 'normal' ? 'opacity-40' : ''}`}
                  title="Спуститися вниз / Присісти (S / ↓)"
                >
                  <span className="text-xl sm:text-2xl font-black">↓</span>
                  <span className="text-[8px] font-mono font-bold text-zinc-400 mt-[-2px]">ВНИЗ</span>
                </button>

                {/* PRIMARY JUMP ACTION BUTTON (ПРИЖОК) */}
                <button
                  id="touch-ctrl-jump"
                  type="button"
                  style={{ touchAction: 'none' }}
                  {...getContinuousTouchHandlers('jump')}
                  className={`${
                    buttonScale === 'large'
                      ? 'w-28 sm:w-34 h-13 sm:h-15'
                      : 'w-24 sm:w-28 h-13 sm:h-15'
                  } rounded-2xl border-2 flex items-center justify-center gap-2 select-none cursor-pointer transition-all duration-75 font-mono tracking-widest text-xs sm:text-sm font-bold touch-none ${
                    controls.jump
                      ? 'bg-amber-400 text-black border-amber-300 scale-95 shadow-[0_0_25px_rgba(245,158,11,0.8)]'
                      : 'bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-amber-950/90 hover:from-amber-900 hover:to-amber-950 border-amber-500 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
                  } ${telemetry.state !== 'normal' ? 'opacity-40' : ''}`}
                  title="Стрибок (Пробіл або Z)"
                >
                  <span className="text-base sm:text-lg">▲</span>
                  <span>ПРИЖОК</span>
                </button>
              </div>

            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- DEDICATED SHELTER SLEEP BUTTON (TOUCH & DESKTOP) ---------------- */}
      {/* "В убержкі досихпор не работає додай окрему кнопку яку нада зажать і буде сон" */}
      <AnimatePresence>
        {(currentLocation.isShelterRoom || inShelterChamber) && !isHibernating && !isDead && (
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-auto"
          >
            <button
              type="button"
              style={{ touchAction: 'none' }}
              onMouseDown={() => { isHoldingSleepBtnRef.current = true; setIsHoldingSleepBtn(true); }}
              onMouseUp={() => { isHoldingSleepBtnRef.current = false; setIsHoldingSleepBtn(false); }}
              onMouseLeave={() => { isHoldingSleepBtnRef.current = false; setIsHoldingSleepBtn(false); }}
              onTouchStart={(e) => { e.preventDefault(); isHoldingSleepBtnRef.current = true; setIsHoldingSleepBtn(true); }}
              onTouchEnd={(e) => { e.preventDefault(); isHoldingSleepBtnRef.current = false; setIsHoldingSleepBtn(false); }}
              onTouchCancel={(e) => { e.preventDefault(); isHoldingSleepBtnRef.current = false; setIsHoldingSleepBtn(false); }}
              className={`relative group overflow-hidden px-5 py-3 sm:px-6 sm:py-3.5 rounded-2xl border-2 flex items-center gap-3.5 font-mono font-bold shadow-2xl transition-all cursor-pointer select-none active:scale-95 ${
                isHoldingSleepBtn || sleepProgress > 0
                  ? 'bg-cyan-950/95 border-cyan-300 text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.6)] scale-105'
                  : 'bg-zinc-950/90 hover:bg-zinc-900 border-cyan-500/80 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.3)]'
              }`}
              title="Затисніть кнопку для засинання та гібернації"
            >
              {/* Progress background fill */}
              <div 
                className="absolute inset-0 bg-gradient-to-r from-cyan-600/40 via-cyan-400/50 to-cyan-300/60 transition-all pointer-events-none" 
                style={{ width: `${Math.round(sleepProgress * 100)}%` }} 
              />
              <span className="text-2xl relative z-10">
                {isHoldingSleepBtn || sleepProgress > 0 ? '💤' : '🛏️'}
              </span>
              <div className="flex flex-col text-left relative z-10">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm tracking-widest font-black uppercase text-cyan-200">
                    {sleepProgress > 0 ? `ЗАСИНАННЯ ${Math.round(sleepProgress * 100)}%` : 'ЗАТИСНІТЬ ДЛЯ СНУ'}
                  </span>
                  {sleepProgress > 0 && (
                    <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  )}
                </div>
                <span className="text-[9px] text-cyan-300/80 font-normal">
                  {sleepProgress > 0 ? 'Утримуйте до 100% щоб зберегти цикл' : 'Затисніть кнопку або клавіші [ПРОБІЛ / ВНИЗ]'}
                </span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- AUTHENTIC RAIN WORLD HIBERNATION CINEMATIC ---------------- */}
      {/* "типа не долєно на екрані менюшка появляться де можна нажать кнопку і тебе засейве там" */}
      <AnimatePresence>
        {isHibernating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6 text-center select-none"
          >
            {/* Ambient Dark Chamber Vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(40,40,45,0.4)_0%,black_80%)] pointer-events-none" />

            {/* Rising Karma Wheel */}
            <motion.div
              initial={{ scale: 0.7, opacity: 0, y: 30 }}
              animate={{ scale: [0.7, 1.15, 1], opacity: 1, y: 0 }}
              transition={{ duration: 1.4, ease: "easeOut" }}
              className="relative z-10 flex flex-col items-center"
            >
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-white/90 bg-black/80 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.35)]">
                <svg className="w-24 h-24 sm:w-32 sm:h-32" viewBox="0 0 36 36" fill="none">
                  <circle cx="18" cy="18" r="14" stroke="#ffffff" strokeWidth="1.8" />
                  <circle cx="18" cy="18" r="8.5" stroke="#ffffff" strokeWidth="1.4" />
                  <line x1="18" y1="4" x2="18" y2="32" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                  <line x1="4" y1="18" x2="32" y2="18" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="18" cy="18" r="3" fill="#ffffff" />
                  {playerSave.karma >= 2 && <circle cx="11" cy="11" r="1.4" fill="#ffffff" />}
                  {playerSave.karma >= 3 && <circle cx="25" cy="11" r="1.4" fill="#ffffff" />}
                  {playerSave.karma >= 4 && <circle cx="11" cy="25" r="1.4" fill="#ffffff" />}
                  {playerSave.karma >= 5 && <circle cx="25" cy="25" r="1.4" fill="#ffffff" />}
                </svg>
              </div>

              {/* Progress Title */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className="mt-6 space-y-1.5 font-mono"
              >
                <div className="text-xl sm:text-2xl font-black tracking-widest text-white">
                  ЦИКЛ {playerSave.cycle} ПРОЙДЕНО
                </div>
                <div className="text-xs sm:text-sm font-bold text-amber-400 tracking-wider">
                  КАРМА ПІДВИЩЕНА ДО {playerSave.karma} / 5
                </div>
                <div className="text-[11px] text-zinc-400 mt-2">
                  Прогрес надійно збережено в укритті • Злива закінчується...
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- LOCATION SELECTOR MODAL ---------------- */}
      {/* "зроби сам пару локаций" */}
      <AnimatePresence>
        {showLocationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-2xl bg-zinc-950 border border-amber-600/50 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col font-sans text-left max-h-[85vh] overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-600/60 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-amber-400">
                      ГОТОВІ ЛОКАЦІЇ RAIN WORLD
                    </h2>
                    <p className="text-[10px] text-zinc-400">
                      Оберіть одну з офіційно змодельованих кімнат для дослідження
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowLocationModal(false)}
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Location list */}
              <div className="py-4 space-y-2.5 overflow-y-auto pr-1">
                {BUILTIN_LOCATIONS.map((loc) => {
                  const isCurrent = loc.id === currentLocation.id;
                  return (
                    <div
                      key={loc.id}
                      onClick={() => handleSelectLocation(loc)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-amber-950/40 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                          : 'bg-zinc-900/60 hover:bg-zinc-850 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-xs sm:text-sm text-slate-100">
                            {loc.name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300">
                            {loc.region}
                          </span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-mono font-bold bg-amber-500 text-black">
                              ПОТОЧНА
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 flex items-center gap-3 font-mono">
                          <span>Розмір: {loc.width}×{loc.height}</span>
                          <span>•</span>
                          <span>Платформ: {loc.platforms.length}</span>
                          <span>•</span>
                          <span>Труб: {loc.transitPipes.length}</span>
                          <span>•</span>
                          <span>Ягід: {loc.items.filter(i => i.type === 'berry').length}</span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectLocation(loc);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
                          isCurrent
                            ? 'bg-amber-500 text-black'
                            : 'bg-zinc-800 hover:bg-amber-600 hover:text-black text-zinc-200'
                        }`}
                      >
                        {isCurrent ? 'ВИБРАНО' : 'УВІЙТИ'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-zinc-800 pt-3 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>Ви також можете створювати власні карти в Редакторі Локацій</span>
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                >
                  Закрити
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent keyboard controls tips banner */}
      <div className="hidden md:flex items-center gap-3 text-[9px] font-mono text-zinc-500 uppercase tracking-widest pb-4 select-none">
        <span>WASD або стрілочки — рух</span>
        <span>•</span>
        <span>ПРОБІЛ — стрибок</span>
        <span>•</span>
        <span className="text-amber-400 font-bold">Z / E — взяти / покласти</span>
        <span>•</span>
        <span className="text-red-400 font-bold">X / Q — кинути спис / камінь</span>
        {isDead && !isMultiplayerActive && (
          <>
            <span>•</span>
            <span className="text-red-400 font-bold">R — відродитися</span>
          </>
        )}
      </div>

    </div>
  );
}
