import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Sparkles, Volume2, VolumeX, Zap, Heart, 
  Skull, RotateCcw, AlertTriangle, Activity, X, 
  Sword, CircleDot, User, PlusCircle, Trash2, Crosshair,
  ZoomIn, ZoomOut, Gamepad2, Eye, EyeOff, Maximize2, Minimize2,
  Map as MapIcon, Compass, Globe, Users, Clock, Wifi, Settings,
  Shield, Home, Lock, Unlock, CloudRain, Layers, Moon
} from 'lucide-react';
import { soundEngine } from './RainWorldSynth';
import { musicManager } from '../audio/MusicManager';
import { PinkLizard, LizardDen } from '../entities/PinkLizard';
import { webRTCManager } from '../network/WebRTCManager';
import { distributedSimulation } from '../network/DistributedSimulation';
import { RemotePlayer, NetworkPacket } from '../network/types';
import { 
  CustomLocationData, EditorTransitPipe, PlatformType, 
  PlayerSaveData, DEFAULT_PLAYER_SAVE, BUILTIN_LOCATIONS,
  DEFAULT_OUTSKIRTS_LOCATION, SHELTER_OUTSKIRTS_LOCATION,
  getLocationById, getLocationFloorY, resolveSafeSpawn, resolveSafeLizardSpawn,
  SlugcatCharacterId, SLUGCAT_CHARACTERS, roundToOneDecimal,
  ItemType, WeaponItemType, ShelterPearlSave
} from '../types';
import { APP_VERSION, compareVersions } from '../version';
import SettingsModal from './SettingsModal';
import { useGameSettings, formatKeyCode, KeyBindings, GameSettings } from '../settings';
import { t } from '../i18n';

interface OutskirtsLocationProps {
  onBack: () => void;
  isSoundMuted: boolean;
  toggleSound: () => void;
  customLocation?: CustomLocationData;
  characterId?: SlugcatCharacterId;
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
export type { ItemType };

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
  stuckWallNormal?: number; // -1 pointing left out of wall, 1 pointing right out of wall
  isAirborne: boolean; // Thrown and active for collision
  thrownBy?: 'player' | 'npc' | string;
  stuckLizardId?: string;
  sleeping?: boolean; // Resting on floor/platform, physics calculations paused
  pearlVariant?: number; // 0: White, 1: Cyan Data, 2: Pink, 3: Gold
  explosiveArmed?: boolean;
  fuseTimer?: number;
  cherryPopCount?: number;
  flyAlive?: boolean;
  flyStunTimer?: number;
  wingPhase?: number;
  flyTargetVx?: number;
  flyTargetVy?: number;
  flyDecisionTimer?: number;
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
  roomLizards: Array<{ id: string; x: number; y: number }>;

  // World Items & Metrics
  spearsCount: number;
  rocksCount: number;
  berriesCount: number;
  pearlsCount: number;
  batfliesCount: number;
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

export default function OutskirtsLocation({
  onBack,
  isSoundMuted,
  toggleSound,
  customLocation,
  characterId = 'survivor'
}: OutskirtsLocationProps) {
  const settings = useGameSettings();
  const lang = settings.language;
  const settingsRef = useRef<GameSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const isSettingsOpenRef = useRef(false);
  const resetControlsActionRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    isSettingsOpenRef.current = showSettingsModal;
    if (showSettingsModal) {
      resetControlsActionRef.current?.();
    }
  }, [showSettingsModal]);

  const charConfig = SLUGCAT_CHARACTERS[characterId] || SLUGCAT_CHARACTERS.survivor;
  const charConfigRef = useRef(charConfig);
  useEffect(() => {
    charConfigRef.current = charConfig;
  }, [charConfig]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Controls state
  const [controls, setControls] = useState({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
  });

  const controlsRef = useRef({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
  });

  // Notifications and actions
  const [spawnNotification, setSpawnNotification] = useState(true);
  const [lastAction, setLastAction] = useState<string>('Слимакокіт готовий! Спис і камінь на карті.');

  // Sync music mute state with global sound toggle
  useEffect(() => {
    musicManager.setMuted(isSoundMuted);
  }, [isSoundMuted]);

  const isExitingRef = useRef(false);

  // Start exploration in-game music on location enter (App.tsx handles menu music on exit)
  useEffect(() => {
    isExitingRef.current = false;
    musicManager.playCategory('game');
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
    hp: charConfig.maxHp,
    maxHp: charConfig.maxHp,
    stunTimer: 0, // Hidden stun timer
    heldItem: null,

    npcState: 'normal',
    npcHp: 3, // Hidden NPC HP (3 HP)
    npcMaxHp: 3,
    npcStunTimer: 0, // Hidden NPC stun timer
    npcX: 620,
    npcY: 520,
    roomLizards: [],

    spearsCount: 1,
    rocksCount: 1,
    berriesCount: 5,
    pearlsCount: 0,
    batfliesCount: 0,
    foodCount: 0,
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
          hibernated: !!p.hibernated,
          shelterPearls: Array.isArray(p.shelterPearls) ? p.shelterPearls : []
        };
      }
    } catch (e) {
      console.warn('Failed to load player progress:', e);
    }
    return DEFAULT_PLAYER_SAVE;
  });
  const playerSaveRef = useRef<PlayerSaveData>(playerSave);
  useEffect(() => {
    playerSaveRef.current = playerSave;
  }, [playerSave]);

  const isSoundMutedRef = useRef<boolean>(isSoundMuted);
  useEffect(() => {
    isSoundMutedRef.current = isSoundMuted;
  }, [isSoundMuted]);

  // Current active location (supports built-in locations and custom editor locations)
  const [currentLocation, setCurrentLocation] = useState<CustomLocationData>(() => {
    if (customLocation) return customLocation;
    const targetId = playerSave.lastLocationId || 'shelter-outskirts';
    return getLocationById(targetId) || DEFAULT_OUTSKIRTS_LOCATION;
  });
  const currentLocationRef = useRef<CustomLocationData>(currentLocation);
  const transitionToLocationRef = useRef<((
    loc: CustomLocationData,
    spawnX?: number,
    spawnY?: number,
    exitVelocity?: { vx: number; vy: number },
    actionMsg?: string
  ) => void) | null>(null);
  const needsCycleResetRef = useRef<boolean>(false);
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);

  useEffect(() => {
    if (customLocation) {
      if (transitionToLocationRef.current) {
        transitionToLocationRef.current(customLocation);
      } else {
        currentLocationRef.current = customLocation;
        setCurrentLocation(customLocation);
      }
    }
  }, [customLocation]);

  // Synchronize distributedSimulation.currentRoom with currentLocation.id
  useEffect(() => {
    distributedSimulation.enterRoom(currentLocation.id);
  }, [currentLocation.id]);

  // Food Pips State: Survivor (4+3=7) or Monk (2+4=6)
  const [foodCount, setFoodCount] = useState<number>(() => Math.min(charConfig.maxFood, playerSave.food ?? 0));
  const foodCountRef = useRef<number>(foodCount);
  useEffect(() => {
    foodCountRef.current = foodCount;
  }, [foodCount]);
  const [isEating, setIsEating] = useState<boolean>(false);
  const [eatingProgress, setEatingProgress] = useState<number>(0);
  const [justFilledIndex, setJustFilledIndex] = useState<number | null>(null);

  // Dedicated Shelter Hibernation Chamber state
  const [inShelterChamber, setInShelterChamber] = useState<boolean>(false);
  const inShelterChamberRef = useRef(false);
  useEffect(() => {
    inShelterChamberRef.current = inShelterChamber;
  }, [inShelterChamber]);

  const [isHibernating, setIsHibernating] = useState<boolean>(false);
  const isHibernatingRef = useRef<boolean>(false);
  useEffect(() => {
    isHibernatingRef.current = isHibernating;
  }, [isHibernating]);

  // Cycle items persistence cache across room switches
  const cycleRoomItemsCache = useRef<Map<string, WorldItem[]>>(new Map<string, WorldItem[]>());

  // Cycle world lizards persistence and ambient simulation across rooms
  // "ящери чогось нічого не роблять пока в тій комнаті нема игрока хоча всі комнати должні работать даже єслі нема игрока просто в упрощоном виді"
  const cycleLizardsRef = useRef<Map<string, LizardStoreEntry>>(new Map<string, LizardStoreEntry>());

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

  // GitHub Version Polling & Auto-Restart Screen State (no native browser dialogs)
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);
  const [updateDetected, setUpdateDetected] = useState<boolean>(false);
  const [reloadOverlay, setReloadOverlay] = useState<{ title: string; subtitle: string } | null>(null);
  const reloadTriggeredRef = useRef<boolean>(false);
  const clientVersionRef = useRef<string>(APP_VERSION);

  const triggerAutoReload = (title: string, subtitle: string, delayMs: number = 1400) => {
    if (reloadTriggeredRef.current) return;
    reloadTriggeredRef.current = true;
    setReloadOverlay({ title, subtitle });
    window.setTimeout(() => {
      window.location.reload();
    }, delayMs);
  };

  useEffect(() => {
    let isCancelled = false;

    const checkVersion = async () => {
      try {
        const base = (((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './').replace(/\/?$/, '/');
        const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverVer = data.version ? String(data.version) : null;
        if (!serverVer) return;

        if (compareVersions(serverVer, clientVersionRef.current) > 0) {
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
      triggerAutoReload(
        'ПЕРЕЗАВАНТАЖЕННЯ...',
        'Час очікування вийшов. Оновлення гри до нової версії...',
        1200
      );
      return;
    }

    const timer = setInterval(() => {
      setUpdateCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [updateCountdown]);

  // Shelter save & silent on-screen auto-reload when update is pending and player is inside shelter
  useEffect(() => {
    if (updateCountdown !== null && updateCountdown > 0 && !reloadTriggeredRef.current) {
      if (currentLocation.isShelterRoom || inShelterChamber) {
        const emergencySave: PlayerSaveData = {
          karma: playerSave.karma,
          maxKarma: 5,
          cycle: playerSave.cycle + 1,
          food: Math.max(charConfig.requiredFood, foodCount),
          lastLocationId: currentLocation.id,
          playerSpawnX: 160,
          playerSpawnY: 280,
          hibernated: true,
          shelterPearls: playerSave.shelterPearls || []
        };
        try {
          localStorage.setItem('rain_world_player_progress', JSON.stringify(emergencySave));
        } catch (e) {
          console.warn('Emergency save error:', e);
        }
        triggerAutoReload(
          'ПЕРЕЗАВАНТАЖЕННЯ...',
          'Ви в укритті — прогрес збережено! Встановлюємо оновлення гри...',
          1500
        );
      }
    }
  }, [updateCountdown, currentLocation.isShelterRoom, inShelterChamber, currentLocation.id, foodCount, playerSave, charConfig.requiredFood]);

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
  const isMultiplayerActiveRef = useRef<boolean>(isMultiplayerActive);
  useEffect(() => {
    isMultiplayerActiveRef.current = isMultiplayerActive;
  }, [isMultiplayerActive]);

  // Persistent entity & world references (never reset on mute, flash, or room transition)
  const playerPosRef = useRef<{ x: number; y: number }>({ x: 180, y: 450 });

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
  const triggerForceDeathRef = useRef<((reason: string) => void) | null>(null);
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
  const getShelterPearlsSnapshotRef = useRef<(() => ShelterPearlSave[]) | null>(null);

  // Trigger manual lightning for visual ambiance
  const [isFlashing, setIsFlashing] = useState(false);
  const isFlashingRef = useRef<boolean>(false);
  useEffect(() => {
    isFlashingRef.current = isFlashing;
  }, [isFlashing]);

  const handleLightningStrike = () => {
    setIsFlashing(true);
    isFlashingRef.current = true;
    if (!isSoundMutedRef.current) {
      soundEngine.playThunder();
    }
    setLastAction('Гроза вдарила по руїнах!');
    setTimeout(() => {
      setIsFlashing(false);
      isFlashingRef.current = false;
    }, 150 + Math.random() * 150);
  };

  // Main persistent game loop & physics (runs ONCE on mount — never resets player HP or rooms!)
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
    let lastLizardsSyncMs = 0;
    let shelterSleepTimer = 0;
    let roomTransitionGraceTimer = 0;
    let singleplayerDeathTimer = 0;
    let sleepMsgCooldown = 0;

    // Room geometry cache helper
    interface RoomEnvCache {
      id: string;
      width: number;
      height: number;
      floorY: number;
      platforms: Platform[];
      poles: ClimbPole[];
      transitPipes: EditorTransitPipe[];
      denData: LizardDen | null;
      wormGrasses: WormGrass[];
    }

    const buildRoomEnv = (loc: CustomLocationData): RoomEnvCache => {
      const rw = loc.width || 1000;
      const rh = loc.height || 580;
      const floorY = getLocationFloorY(loc);
      const grasses: WormGrass[] = [];
      for (let gx = 10; gx < rw; gx += 15) {
        grasses.push({
          x: gx,
          height: 12 + Math.random() * 20,
          phase: Math.random() * Math.PI * 2,
          swaySpeed: 0.03 + Math.random() * 0.04
        });
      }
      return {
        id: loc.id,
        width: rw,
        height: rh,
        floorY,
        platforms: loc.platforms.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, type: p.type, label: p.label })),
        poles: loc.poles.map(p => ({ x: p.x, yMin: p.yMin, yMax: p.yMax })),
        transitPipes: loc.transitPipes || [],
        denData: loc.lizardDen ?? null,
        wormGrasses: grasses
      };
    };

    const roomEnvCache = new Map<string, RoomEnvCache>();
    const getRoomEnv = (loc: CustomLocationData): RoomEnvCache => {
      let cached = roomEnvCache.get(loc.id);
      if (!cached) {
        cached = buildRoomEnv(loc);
        roomEnvCache.set(loc.id, cached);
      }
      return cached;
    };

    let activeLoc = currentLocationRef.current;
    let activeEnv = getRoomEnv(activeLoc);

    // Dynamic Camera Tracking State
    const initialZoom = zoomRef.current;
    const initialViewW = CANVAS_WIDTH / initialZoom;
    const initialViewH = CANVAS_HEIGHT / initialZoom;
    const savedStartX = (playerSaveRef.current.lastLocationId === activeLoc.id && typeof playerSaveRef.current.playerSpawnX === 'number')
      ? playerSaveRef.current.playerSpawnX
      : activeLoc.playerSpawn?.x;
    const savedStartY = (playerSaveRef.current.lastLocationId === activeLoc.id && typeof playerSaveRef.current.playerSpawnY === 'number')
      ? playerSaveRef.current.playerSpawnY
      : activeLoc.playerSpawn?.y;
    const safeInitialSpawn = resolveSafeSpawn(activeLoc, savedStartX, savedStartY);

    const camera = {
      x: Math.max(0, Math.min(Math.max(0, activeEnv.width - initialViewW), (safeInitialSpawn.x + 12) - initialViewW / 2)),
      y: Math.max(0, Math.min(Math.max(0, activeEnv.height - initialViewH), (safeInitialSpawn.y + 19) - initialViewH / 2)),
    };

    // Persistent Player Physics State (survives all room transitions, sound mutes, and flashes)
    const initCfg = charConfigRef.current;
    const player = {
      x: safeInitialSpawn.x,
      y: safeInitialSpawn.y,
      vx: 0,
      vy: 0,
      width: 24,
      height: 38,
      isGrounded: false,
      isClimbing: false,
      climbPoleX: 0,

      state: 'normal' as SlugcatState,
      hp: initCfg.maxHp,
      maxHp: initCfg.maxHp,
      characterId: initCfg.id,
      biteGrabImmunity: initCfg.biteGrabImmunity,
      attackerStunOnGrabAttempt: initCfg.attackerStunOnGrabAttempt,
      isPipeProtected: false,
      stunTimer: 0,
      heldItem: null as WorldItem | null,

      head: { x: safeInitialSpawn.x + 12, y: safeInitialSpawn.y + 6, vx: 0, vy: 0 },
      chest: { x: safeInitialSpawn.x + 12, y: safeInitialSpawn.y + 18, vx: 0, vy: 0 },
      hips: { x: safeInitialSpawn.x + 12, y: safeInitialSpawn.y + 30, vx: 0, vy: 0 },
      tail: Array.from({ length: 9 }, (_, i) => ({ x: safeInitialSpawn.x + 12, y: safeInitialSpawn.y + 30 + i * 4 })),

      facingRight: true,
      earSway: 0,
      crouching: false,
      blinkTimer: 0,
      ragdollAngle: 0,
    };
    playerPosRef.current = { x: player.x, y: player.y };

    const isWorldAuthority = (): boolean => !webRTCManager.currentRoomId || webRTCManager.isRoomHost;
    let lizardsInitializedForCycle = false;

    const ensureCycleLizardsInitialized = () => {
      if (!isWorldAuthority() || lizardsInitializedForCycle) return;
      lizardsInitializedForCycle = true;
      if (cycleLizardsRef.current.size > 0) return;

      for (const loc of BUILTIN_LOCATIONS) {
        if (loc.isShelterRoom || loc.isLizardDenRoom) continue;
        const spawnChance = loc.id === 'outskirts-default' ? 0.92 : 0.72;
        if (Math.random() < spawnChance) {
          const spawnX = loc.npcSpawn?.x ?? loc.lizardDen?.spawnX ?? Math.round((loc.width || 1000) * 0.68);
          const spawnY = loc.npcSpawn?.y ?? loc.lizardDen?.spawnY ?? Math.max(120, getLocationFloorY(loc) - 28);
          const safe = resolveSafeLizardSpawn(loc, spawnX, spawnY);
          const liz = new PinkLizard(`pink-lizard-${loc.id}`, safe.x, safe.y);
          cycleLizardsRef.current.set(`pink-lizard-${loc.id}`, {
            id: `pink-lizard-${loc.id}`,
            roomId: loc.id,
            lizard: liz
          });
        }
      }
    };
    ensureCycleLizardsInitialized();

    let activeRoomLizards: LizardStoreEntry[] = [];
    let currentLizardEntry: LizardStoreEntry | null = null;
    let pinkLizard: PinkLizard | null = null;

    const refreshActiveRoomLizard = () => {
      activeRoomLizards = [];
      for (const entry of cycleLizardsRef.current.values()) {
        if (entry.roomId === activeLoc.id) {
          activeRoomLizards.push(entry);
        }
      }
      currentLizardEntry = activeRoomLizards[0] || null;
      pinkLizard = currentLizardEntry ? currentLizardEntry.lizard : null;
    };
    refreshActiveRoomLizard();

    const getItemLabel = (type: ItemType): string => {
      switch (type) {
        case 'spear': return 'Спис';
        case 'explosive_spear': return 'Вибуховий спис';
        case 'rock': return 'Камінь';
        case 'berry': return 'Ягоду';
        case 'cherrybomb': return 'Бомбу-рослину';
        case 'pearl': return 'Перлину';
        case 'batfly': return 'Муху-кажана';
      }
    };

    const isEdibleItemType = (type?: ItemType | null): boolean =>
      type === 'berry' || type === 'batfly';

    // Persistent Room Items Generator & Cache across room transitions within the same cycle
    let itemIdCounter = 1;
    const getOrInitRoomItems = (loc: CustomLocationData): WorldItem[] => {
      if (cycleRoomItemsCache.current.has(loc.id)) {
        return cycleRoomItemsCache.current.get(loc.id)!.map(it => ({ ...it }));
      }
      const floorY = getLocationFloorY(loc);
      const candidates = loc.items && loc.items.length > 0
        ? loc.items
        : [
            { id: `${loc.id}-spear-def`, type: 'spear' as ItemType, x: 260, y: floorY - 8 },
            { id: `${loc.id}-rock-def`, type: 'rock' as ItemType, x: 380, y: floorY - 6 },
            { id: `${loc.id}-berry-def`, type: 'berry' as ItemType, x: 480, y: floorY - 10 },
          ];
      const spawned: WorldItem[] = [];
      candidates.forEach((cand, idx) => {
        const isSpecialItem =
          cand.type === 'pearl' ||
          cand.type === 'explosive_spear' ||
          cand.type === 'cherrybomb' ||
          cand.type === 'batfly';
        const spawnChance = (loc.isShelterRoom || idx < 3 || isSpecialItem) ? 1.0 : 0.78;
        if (Math.random() <= spawnChance) {
          spawned.push({
            id: cand.id || `${loc.id}-item-${itemIdCounter++}`,
            type: cand.type as ItemType,
            x: cand.x,
            y: cand.y,
            vx: 0,
            vy: 0,
            rotation: (cand.type === 'spear' || cand.type === 'explosive_spear') ? 0.1 : 0,
            isHeld: false,
            isStuck: false,
            isAirborne: false,
            sleeping: cand.type !== 'batfly',
            pearlVariant: cand.type === 'pearl' ? (cand.pearlVariant ?? (idx % 4)) : undefined,
            flyAlive: cand.type === 'batfly' ? true : undefined,
            wingPhase: cand.type === 'batfly' ? Math.random() * 10 : undefined,
            flyDecisionTimer: cand.type === 'batfly' ? 0 : undefined,
          });
        }
      });

      // Restore pearls permanently stored inside this shelter room across cycles/reloads
      if (loc.isShelterRoom && Array.isArray(playerSaveRef.current.shelterPearls)) {
        for (const savedPearl of playerSaveRef.current.shelterPearls) {
          if (savedPearl.roomId === loc.id && !spawned.some(s => s.id === savedPearl.id)) {
            spawned.push({
              id: savedPearl.id,
              type: 'pearl',
              x: savedPearl.x,
              y: savedPearl.y,
              vx: 0,
              vy: 0,
              rotation: 0,
              isHeld: false,
              isStuck: false,
              isAirborne: false,
              sleeping: true,
              pearlVariant: savedPearl.pearlVariant ?? 0,
            });
          }
        }
      }

      cycleRoomItemsCache.current.set(loc.id, spawned.map(it => ({ ...it })));
      return spawned;
    };

    const items: WorldItem[] = [];
    if (isWorldAuthority()) {
      for (const it of getOrInitRoomItems(activeLoc)) {
        items.push(it);
      }
    }

    const syncRoomItemsCache = (roomId: string = activeLoc.id, list: WorldItem[] = items) => {
      cycleRoomItemsCache.current.set(
        roomId,
        list.filter(it => !it.isHeld || it.heldBy !== 'player').map(it => ({ ...it }))
      );
    };

    // Visual Explosions, Ricochet Sparks & Screen Shake FX
    interface SparkParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
      color: string;
    }
    interface ShockwaveEffect {
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      life: number;
      maxLife: number;
      color: string;
    }
    const sparks: SparkParticle[] = [];
    const shockwaves: ShockwaveEffect[] = [];
    let cameraShakeTimer = 0;
    let cameraShakeIntensity = 0;

    const spawnSparks = (cx: number, cy: number, count: number, palette: string[], baseSpeed: number = 4.5) => {
      if (!settingsRef.current.graphics.particles) return;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = baseSpeed * (0.4 + Math.random() * 0.9);
        const life = 0.22 + Math.random() * 0.35;
        sparks.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 0.8,
          life,
          maxLife: life,
          size: 1.4 + Math.random() * 2.4,
          color: palette[Math.floor(Math.random() * palette.length)]
        });
      }
    };

    // Seamless transition between rooms preserving HP, stun, state, heldItem, and cached world state
    const transitionToLocation = (
      targetLoc: CustomLocationData,
      requestedSpawnX?: number,
      requestedSpawnY?: number,
      exitVelocity?: { vx: number; vy: number },
      actionMsg?: string
    ) => {
      // 1. Save outgoing room's items (excluding local player's held item, which travels with player!)
      syncRoomItemsCache(activeLoc.id, items);

      // 2. Switch active location & environment immediately
      activeLoc = targetLoc;
      activeEnv = getRoomEnv(targetLoc);
      currentLocationRef.current = targetLoc;
      distributedSimulation.enterRoom(targetLoc.id);

      // 3. Load persistent items for destination room & carry player's heldItem across
      const carriedItem = player.heldItem;
      items.length = 0;
      if (isWorldAuthority()) {
        const roomItems = getOrInitRoomItems(targetLoc);
        for (const it of roomItems) {
          if (!carriedItem || it.id !== carriedItem.id) {
            items.push(it);
          }
        }
      }

      // 4. Resolve safe spawn coordinates inside target room
      const safe = resolveSafeSpawn(targetLoc, requestedSpawnX, requestedSpawnY);
      player.x = safe.x;
      player.y = safe.y;
      if (exitVelocity) {
        player.vx = exitVelocity.vx;
        player.vy = exitVelocity.vy;
        if (Math.abs(exitVelocity.vx) > 0.05) {
          player.facingRight = exitVelocity.vx > 0;
        }
      } else {
        player.vx = 0;
        player.vy = 0;
      }
      player.isClimbing = false;
      player.isGrounded = false;
      playerPosRef.current = { x: player.x, y: player.y };

      // Re-anchor skeleton cleanly so tail/limbs do not stretch across the screen
      player.head = { x: player.x + player.width / 2, y: player.y + 6, vx: 0, vy: 0 };
      player.chest = { x: player.x + player.width / 2, y: player.y + 18, vx: 0, vy: 0 };
      player.hips = { x: player.x + player.width / 2, y: player.y + 30, vx: 0, vy: 0 };
      player.tail = Array.from({ length: 9 }, (_, i) => ({ x: player.x + player.width / 2, y: player.y + 30 + i * 4 }));

      if (carriedItem) {
        const dir = player.facingRight ? 1 : -1;
        carriedItem.x = player.chest.x + dir * 9;
        carriedItem.y = player.chest.y + 3;
        carriedItem.isHeld = true;
        carriedItem.heldBy = 'player';
        items.push(carriedItem);
      }

      // 5. Snap camera directly inside new room bounds
      const zw = CANVAS_WIDTH / zoomRef.current;
      const zh = CANVAS_HEIGHT / zoomRef.current;
      camera.x = Math.max(0, Math.min(Math.max(0, activeEnv.width - zw), (player.x + 12) - zw / 2));
      camera.y = Math.max(0, Math.min(Math.max(0, activeEnv.height - zh), (player.y + 19) - zh / 2));

      // 6. Refresh lizard handle & React HUD state
      roomTransitionGraceTimer = 1.6;
      refreshActiveRoomLizard();
      setCurrentLocation(targetLoc);
      setInShelterChamber(!!targetLoc.isShelterRoom);
      inShelterChamberRef.current = !!targetLoc.isShelterRoom;
      setShowLocationModal(false);
      if (actionMsg) {
        setLastAction(actionMsg);
      }

      // 7. In multiplayer client mode, request authoritative state for this new room
      if (!isWorldAuthority() && webRTCManager.connectionStatus === 'connected') {
        webRTCManager.broadcastPacket({
          type: 'REQUEST_WORLD_SYNC',
          senderId: webRTCManager.localPlayerId,
          room: targetLoc.id
        });
      }
    };
    transitionToLocationRef.current = transitionToLocation;
    triggerChangeLocationRef.current = (loc: CustomLocationData) => {
      transitionToLocation(loc, undefined, undefined, undefined, `Перехід до локації: ${loc.name}`);
    };

    const restartCycleFromSavedShelter = () => {
      const cfg = charConfigRef.current;
      const save = playerSaveRef.current;
      const savedLoc = getLocationById(save.lastLocationId) || SHELTER_OUTSKIRTS_LOCATION;
      const newKarma = Math.max(1, save.karma - 1);
      const resetFood = Math.min(cfg.maxFood, save.food ?? 0);

      const updatedSave: PlayerSaveData = {
        ...save,
        karma: newKarma,
        lastLocationId: savedLoc.id,
        hibernated: false
      };
      playerSaveRef.current = updatedSave;
      setPlayerSave(updatedSave);
      foodCountRef.current = resetFood;
      setFoodCount(resetFood);
      try {
        localStorage.setItem('rain_world_player_progress', JSON.stringify(updatedSave));
      } catch (e) {
        console.warn('Failed to save progress on cycle restart:', e);
      }

      player.state = 'normal';
      player.hp = cfg.maxHp;
      player.maxHp = cfg.maxHp;
      player.characterId = cfg.id;
      player.stunTimer = 0;
      player.ragdollAngle = 0;
      if (player.heldItem) {
        player.heldItem = null;
        setHeldItemType(null);
      }

      cycleRoomItemsCache.current.clear();
      cycleLizardsRef.current.clear();
      lizardsInitializedForCycle = false;
      ensureCycleLizardsInitialized();
      lizardCombatTimerRef.current = 0;
      pvpCombatTimerRef.current = 0;
      pvpTargetPeerIdRef.current = null;

      const freshDuration = getRandomCycleSeconds();
      setCycleTotalDuration(freshDuration);
      setCycleSecondsLeft(freshDuration);
      setStormActive(false);
      setStormSeconds(0);
      soundEngine.setStormVolume(0);
      soundEngine.resetConcussion();
      setIsDead(false);

      transitionToLocation(
        savedLoc,
        save.playerSpawnX,
        save.playerSpawnY,
        undefined,
        `🔄 Цикл закінчився! Новий цикл розпочато з останнього укриття: ${savedLoc.name} (Карма ${newKarma}/5).`
      );
    };

    // Helper to spawn item
    const spawnItem = (type: ItemType, spawnX?: number, spawnY?: number) => {
      const sx = spawnX ?? (player.x + (player.facingRight ? 35 : -35));
      const sy = spawnY ?? (player.y - 10);
      const newItem: WorldItem = {
        id: `${activeLoc.id}-item-${itemIdCounter++}-${Date.now().toString(36)}`,
        type,
        x: Math.max(20, Math.min(activeEnv.width - 20, sx)),
        y: Math.max(30, Math.min(activeEnv.floorY - 6, sy)),
        vx: (Math.random() - 0.5) * 2,
        vy: -2,
        rotation: Math.random() * 0.4 - 0.2,
        isHeld: false,
        isStuck: false,
        isAirborne: false,
        sleeping: false,
        pearlVariant: type === 'pearl' ? Math.floor(Math.random() * 4) : undefined,
        flyAlive: type === 'batfly' ? true : undefined,
        wingPhase: type === 'batfly' ? Math.random() * 10 : undefined,
        flyDecisionTimer: type === 'batfly' ? 0 : undefined,
      };
      items.push(newItem);
      syncRoomItemsCache();
      soundEngine.playPickup();
      setLastAction(`Заспавнено: ${getItemLabel(type)} на (${Math.round(sx)}, ${Math.round(sy)})`);
      if (isWorldAuthority() && webRTCManager.remotePlayers.size > 0) {
        sendAuthoritativeItemsSync();
      }
    };

    // Damage & Stun application function with Monk damage/stun resistance & 1-decimal rounding
    const applyHit = (
      target: typeof player,
      weapon: WeaponItemType,
      overrideBaseDamage?: number,
      overrideBaseInitStun?: number,
      overrideBaseAddStun?: number
    ) => {
      if (target.state === 'dead') return;
      const cfg = charConfigRef.current;

      const isSpearWeapon = weapon === 'spear' || weapon === 'explosive_spear';
      const baseDmg = overrideBaseDamage ?? (isSpearWeapon ? 1.0 : weapon === 'cherrybomb' ? 0.35 : 0.01);
      const baseInitStun = overrideBaseInitStun ?? (isSpearWeapon ? 1.8 : weapon === 'cherrybomb' ? 3.0 : 1.2);
      const baseAddStun = overrideBaseAddStun ?? (isSpearWeapon ? 0.8 : 0.5);

      const damage = Math.round(baseDmg * cfg.incomingDamageMult * 1000) / 1000;
      const initialStun = roundToOneDecimal(baseInitStun * cfg.incomingStunMult);
      const addedStun = roundToOneDecimal(baseAddStun * cfg.incomingStunMult);

      const wasAlreadyStunned = target.state === 'stunned' || target.stunTimer > 0;

      // Apply HP damage
      target.hp = Math.max(0, target.hp - damage);

      const wLabel =
        weapon === 'explosive_spear'
          ? 'вибухового списа'
          : weapon === 'cherrybomb'
          ? 'бомби-рослини'
          : weapon === 'spear'
          ? 'списа'
          : 'каменя';

      if (target.hp <= 0) {
        target.state = 'dead';
        target.stunTimer = 0;
        target.vy = -3.5;
        player.isClimbing = false;
        setIsDead(true);
        if (isSpearWeapon) {
          soundEngine.triggerConcussionMuffle();
        }
        soundEngine.playHit(weapon);
        soundEngine.playThunder();
        setLastAction(`Слимакокіт загинув від ${wLabel}!`);
      } else {
        if (wasAlreadyStunned) {
          target.stunTimer = roundToOneDecimal(target.stunTimer + addedStun);
          setLastAction(`Удар (${wLabel}) додав +${addedStun.toFixed(1)}с стану гравцю!`);
        } else {
          target.state = 'stunned';
          target.stunTimer = initialStun;
          setLastAction(`Слимакокіт оглушений (${initialStun.toFixed(1)}с)!`);
        }
        target.vy = -2.0;
        player.isClimbing = false;
        soundEngine.playHit(weapon);
      }
    };

    const detonateExplosion = (
      cx: number,
      cy: number,
      radius: number,
      maxDmg: number,
      maxStun: number,
      mode: 'explosive_spear' | 'cherrybomb',
      thrownBy?: string
    ) => {
      if (mode === 'explosive_spear') {
        soundEngine.playExplosion();
        shockwaves.push({ x: cx, y: cy, radius: 10, maxRadius: radius, life: 0.34, maxLife: 0.34, color: '#fb923c' });
        shockwaves.push({ x: cx, y: cy, radius: 4, maxRadius: radius * 0.65, life: 0.24, maxLife: 0.24, color: '#fef08a' });
        spawnSparks(cx, cy, 26, ['#fef08a', '#fb923c', '#ef4444', '#ffffff'], 7.5);
        cameraShakeTimer = 0.38;
        cameraShakeIntensity = 8.5;
      } else {
        soundEngine.playCherryPop();
        setTimeout(() => soundEngine.playCherryPop(), 75);
        setTimeout(() => soundEngine.playCherryPop(), 150);
        shockwaves.push({ x: cx, y: cy, radius: 8, maxRadius: radius, life: 0.28, maxLife: 0.28, color: '#f87171' });
        spawnSparks(cx, cy, 22, ['#fca5a5', '#ef4444', '#fef08a', '#ffffff'], 6.2);
        cameraShakeTimer = 0.24;
        cameraShakeIntensity = 5.5;
      }

      const cfg = charConfigRef.current;
      const dmgMult = thrownBy === 'player' ? cfg.outgoingDamageMult : 1.0;
      const stunMult = thrownBy === 'player' ? cfg.outgoingStunMult : 1.0;

      // Damage, stun & knockback lizards within blast radius
      let hitLizCount = 0;
      for (const lizEntry of activeRoomLizards) {
        const liz = lizEntry.lizard;
        if (liz.state === 'dead' || liz.pipeTransit) continue;
        const lx = liz.x + liz.width / 2;
        const ly = liz.y + liz.height / 2;
        const dist = Math.hypot(lx - cx, ly - cy);
        if (dist <= radius) {
          hitLizCount++;
          const falloff = Math.max(0.45, 1 - (dist / radius) * 0.55);
          const dmg = Math.round(maxDmg * falloff * dmgMult * 100) / 100;
          const stun = roundToOneDecimal(maxStun * falloff * stunMult);
          const pushDirX = dist > 1 ? (lx - cx) / dist : (liz.facingRight ? -1 : 1);
          const kbVx = pushDirX * (mode === 'explosive_spear' ? 11.5 : 8.5) * falloff;
          const kbVy = -(mode === 'explosive_spear' ? 6.2 : 4.8) * falloff;

          if (isWorldAuthority()) {
            liz.takeDamage(dmg, stun);
            liz.vx += kbVx;
            liz.vy += kbVy;
            sendAuthoritativeLizardsSync();
          } else {
            webRTCManager.broadcastPacket({
              type: 'LIZARD_HIT',
              senderId: webRTCManager.localPlayerId,
              lizardId: liz.id,
              room: activeLoc.id,
              weaponType: mode,
              damage: dmg,
              stunDuration: stun,
              knockbackVx: kbVx,
              knockbackVy: kbVy
            });
          }
        }
      }

      // Blast knockback / self-damage if player stands right next to blast
      const pCx = player.x + player.width / 2;
      const pCy = player.y + player.height / 2;
      const pDist = Math.hypot(pCx - cx, pCy - cy);
      if (pDist <= radius * 0.72 && player.state !== 'dead') {
        const falloff = Math.max(0.3, 1 - (pDist / (radius * 0.72)) * 0.7);
        const pushDirX = pDist > 1 ? (pCx - cx) / pDist : 1;
        player.vx += pushDirX * (mode === 'explosive_spear' ? 8.5 : 6.0) * falloff;
        player.vy = -4.5 * falloff;
        player.isGrounded = false;
        player.isClimbing = false;
        if (pDist < radius * 0.45) {
          applyHit(player, mode, mode === 'explosive_spear' ? 0.55 : 0.08, mode === 'explosive_spear' ? 2.0 : 1.4, 0.8);
        }
      }

      // Remote peer blast hit sync
      if (thrownBy === 'player') {
        for (const rp of webRTCManager.remotePlayers.values()) {
          if (rp.room !== activeLoc.id || rp.state === 'dead') continue;
          const rDist = Math.hypot((rp.x + 12) - cx, (rp.y + 19) - cy);
          if (rDist <= radius * 0.85) {
            distributedSimulation.registerClientSideHit(
              rp.id,
              mode,
              cx,
              cy,
              cfg.outgoingDamageMult,
              cfg.outgoingStunMult
            );
          }
        }
      }

      // Knock nearby loose items and stun nearby batflies
      for (const other of items) {
        if (other.isHeld || other.isStuck) continue;
        const oDist = Math.hypot(other.x - cx, other.y - cy);
        if (oDist <= radius && oDist > 1) {
          const push = (1 - oDist / radius) * 7.5;
          other.sleeping = false;
          other.vx += ((other.x - cx) / oDist) * push;
          other.vy -= 2.5 + push * 0.4;
          if (other.type === 'batfly') {
            other.flyStunTimer = 5.0;
          }
        }
      }

      if (hitLizCount > 0) {
        setLastAction(
          mode === 'explosive_spear'
            ? `💥 Вибуховий спис підірвав ящера (стан до ${maxStun.toFixed(1)}с)!`
            : `🍒💥 Бомба-рослина оглушила ящера (${maxStun.toFixed(1)}с) і відкинула його!`
        );
      } else {
        setLastAction(mode === 'explosive_spear' ? '💥 Потужний вибух списа!' : '🍒💥 Гучний хлопок бомби-рослини!');
      }
    };

    // Grab / Pick up item handler (including pulling stuck spears out of bodies/walls & catching batflies)
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
        if (!controlsRef.current.down) {
          player.crouching = false;
        }
      }

      // If already holding an item, drop it
      if (player.heldItem) {
        const item = player.heldItem;
        item.isHeld = false;
        item.heldBy = undefined;
        item.isStuck = false;
        item.stuckTarget = undefined;
        item.stuckWallNormal = undefined;
        item.x = player.x + (player.facingRight ? 18 : -18);
        item.y = player.y + 12;
        item.vx = player.facingRight ? 1.8 : -1.8;
        item.vy = 0.5;
        item.isAirborne = false;
        item.sleeping = false;
        if (item.type === 'batfly' && item.flyAlive !== false) {
          item.flyStunTimer = 0.45; // Brief flutter release delay
        }
        player.heldItem = null;
        setHeldItemType(null);
        if (item.type === 'pearl') soundEngine.playPearlChime();
        else soundEngine.playPickup();
        setLastAction(`Покладено: ${getItemLabel(item.type)}`);

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
          room: activeLoc.id
        });
        syncRoomItemsCache();
        if (isWorldAuthority() && webRTCManager.remotePlayers.size > 0) {
          sendAuthoritativeItemsSync();
        }
        return;
      }

      // Find closest item within reach (generous reach for running, jumping, and mid-air batfly catching)
      let closestItem: WorldItem | null = null;
      let closestDist = 92;

      const px = player.x + player.width / 2;
      const py = player.y + player.height / 2;
      const forwardDir = player.facingRight ? 1 : -1;
      const reachFrontX = px + forwardDir * 18;

      for (const item of items) {
        if (item.isHeld || item.explosiveArmed) continue;

        let effItemX = item.x;
        if ((item.type === 'spear' || item.type === 'explosive_spear') && !item.isStuck) {
          effItemX = Math.max(item.x - 18, Math.min(item.x + 18, reachFrontX));
        }

        const dx = Math.abs(effItemX - reachFrontX);
        const dy = Math.abs(item.y - py);
        const reachX = item.type === 'batfly' ? 92 : 85;
        const reachY = item.type === 'batfly' ? 74 : 60;

        if (dx <= reachX && dy <= reachY) {
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
        closestItem.stuckWallNormal = undefined;
        closestItem.isAirborne = false;
        closestItem.sleeping = false;
        closestItem.vx = 0;
        closestItem.vy = 0;
        player.heldItem = closestItem;
        setHeldItemType(closestItem.type);
        if (closestItem.type === 'pearl') soundEngine.playPearlChime();
        else soundEngine.playPickup();

        webRTCManager.broadcastPacket({
          type: 'ITEM_PICKUP',
          senderId: webRTCManager.localPlayerId,
          itemId: closestItem.id,
          itemType: closestItem.type,
          x: closestItem.x,
          y: closestItem.y,
          room: activeLoc.id
        });
        syncRoomItemsCache();
        if (isWorldAuthority() && webRTCManager.remotePlayers.size > 0) {
          sendAuthoritativeItemsSync();
        }

        const typeLabel = getItemLabel(closestItem.type);

        if (wasStuckInCreature) {
          setLastAction(`Витягнуто ${typeLabel.toLowerCase()} з тіла!`);
        } else if (wasStuckInWall) {
          setLastAction(`Витягнуто ${typeLabel.toLowerCase()} зі стіни!`);
        } else if (closestItem.type === 'berry') {
          setLastAction(`Підібрано Ягоду! Натисніть кнопку «ЇСТИ» щоб поповнити їжу.`);
        } else if (closestItem.type === 'batfly') {
          setLastAction(`🦇 Спіймано Муху-кажана! Натисніть «ЇСТИ» (+1 їжі).`);
        } else if (closestItem.type === 'pearl') {
          setLastAction(`🦪 Знайдено Перлину! Віднесіть в укриття, щоб зберегти між циклами.`);
        } else if (closestItem.type === 'explosive_spear') {
          setLastAction(`🧨 Взято Вибуховий спис! Кидок [X] підірве ціль!`);
        } else if (closestItem.type === 'cherrybomb') {
          setLastAction(`🍒 Взято Бомбу-рослину! Кидок [X] оглушить ящера!`);
        } else {
          setLastAction(`Підібрано: ${typeLabel} (Клавіша X або кнопка КИД)`);
        }
      }
    };

    // Throw held item handler
    let lastThrowTimestamp = 0;
    const handleThrow = () => {
      if (player.state !== 'normal' || !player.heldItem) return;

      const now = performance.now();
      if (now - lastThrowTimestamp < 170) return;
      lastThrowTimestamp = now;

      if (isEating) {
        isEating = false;
        eatingTimer = 0;
        setIsEating(false);
        setEatingProgress(0);
        if (!controlsRef.current.down) {
          player.crouching = false;
        }
      }

      const item = player.heldItem;
      const dir = player.facingRight ? 1 : -1;

      item.isHeld = false;
      item.heldBy = undefined;
      item.isStuck = false;
      item.stuckTarget = undefined;
      item.stuckWallNormal = undefined;
      item.x = player.chest.x + (dir * 16);
      item.y = player.chest.y + 1;
      item.isAirborne = item.type !== 'batfly';
      item.sleeping = false;
      item.thrownBy = 'player';

      if (item.type === 'spear' || item.type === 'explosive_spear') {
        item.vx = dir * 26.5;
        item.vy = 0.55;
        item.rotation = Math.atan2(item.vy, item.vx);
      } else if (item.type === 'cherrybomb') {
        item.vx = dir * 16.5;
        item.vy = -1.6;
        item.rotation = 0;
        item.explosiveArmed = true;
        item.fuseTimer = 0.55;
        item.cherryPopCount = 2;
        soundEngine.playCherryPop();
      } else if (item.type === 'rock') {
        item.vx = dir * 18.5;
        item.vy = 0.75;
        item.rotation = 0;
      } else if (item.type === 'batfly') {
        item.vx = dir * 5.2;
        item.vy = -2.2;
        item.rotation = 0;
        item.flyStunTimer = item.flyAlive === false ? 0 : 0.5;
      } else {
        item.vx = dir * 14.5;
        item.vy = 0.65;
        item.rotation = 0;
      }

      if (item.type === 'spear' || item.type === 'explosive_spear' || item.type === 'rock' || item.type === 'cherrybomb') {
        const speed = Math.hypot(item.vx, item.vy);
        if (speed > 1) {
          const dirX = item.vx / speed;
          const dirY = item.vy / speed;

          for (const rp of webRTCManager.remotePlayers.values()) {
            if (rp.state === 'dead' || rp.room !== activeLoc.id) continue;
            const tx = rp.x + 12;
            const ty = rp.y + 19;
            const dx = tx - item.x;
            const dy = ty - item.y;
            const proj = dx * dirX + dy * dirY;
            if (proj > 10 && proj < 750) {
              const closestX = item.x + dirX * proj;
              const closestY = item.y + dirY * proj;
              const perpDist = Math.hypot(tx - closestX, ty - closestY);
              if (perpDist < 38) {
                pvpCombatTimerRef.current = 60.0;
                pvpTargetPeerIdRef.current = rp.id;
                webRTCManager.broadcastPacket({
                  type: 'PVP_COMBAT_TRIGGER',
                  senderId: webRTCManager.localPlayerId,
                  targetId: rp.id,
                  room: activeLoc.id
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
      setLastAction(`Кинуто: ${getItemLabel(item.type)}!`);

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
        room: activeLoc.id
      });
      if (isWorldAuthority() && webRTCManager.remotePlayers.size > 0) {
        sendAuthoritativeItemsSync();
      }
    };

    // Eating food handler (Berries & Batflies)
    let isEating = false;
    let eatingTimer = 0;
    let nibbleTimer = 0;
    let eatingSlowdownTimer = 0;

    const handleToggleEat = () => {
      if (player.state !== 'normal') return;

      if (!player.heldItem || !isEdibleItemType(player.heldItem.type)) {
        setLastAction("Щоб їсти, візьміть ягоду або муху-кажана в лапи!");
        return;
      }

      const cfg = charConfigRef.current;
      if (foodCountRef.current >= cfg.maxFood) {
        setLastAction(`Шлунок вже повний! (${cfg.maxFood} / ${cfg.maxFood} ячейок: ${cfg.requiredFood} обов'язкові + ${cfg.extraFood} додаткові)`);
        return;
      }

      if (isEating) {
        isEating = false;
        eatingTimer = 0;
        setIsEating(false);
        setEatingProgress(0);
        if (!controlsRef.current.down) {
          player.crouching = false;
        }
        setLastAction("Поїдання перервано.");
      } else {
        isEating = true;
        eatingTimer = 0;
        nibbleTimer = 0;
        setIsEating(true);
        setEatingProgress(0);
        setLastAction(
          player.heldItem.type === 'batfly'
            ? "Поїдання мухи-кажана... Не рухайтесь!"
            : "Початок поїдання ягоди... Не рухайтесь під час їжі!"
        );
        if (!isSoundMutedRef.current) soundEngine.playEatNibble();
      }
    };

    triggerGrabRef.current = handleGrab;
    triggerThrowRef.current = handleThrow;
    triggerEatRef.current = handleToggleEat;
    getShelterPearlsSnapshotRef.current = () => {
      const shelterId = activeLoc.id;
      return items
        .filter((it) => it.type === 'pearl' && (!it.isHeld || it.heldBy === 'player'))
        .map((it, idx) => ({
          id: it.id,
          pearlVariant: it.pearlVariant ?? (idx % 4),
          roomId: shelterId,
          x: Math.round(it.isHeld ? Math.max(80, Math.min(activeEnv.width - 80, player.x + 12)) : it.x),
          y: Math.round(it.isHeld ? Math.min(activeEnv.floorY - 8, player.y + 24) : it.y),
        }));
    };

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
        rp.room === activeLoc.id &&
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
        if (!controlsRef.current.down) {
          player.crouching = false;
        }
      }
      syncRoomItemsCache();
      setLastAction('Всі предмети очищено з карти');
    };

    triggerAddFoodRef.current = () => {
      const cfg = charConfigRef.current;
      const nextFood = Math.min(cfg.maxFood, foodCountRef.current + 1);
      foodCountRef.current = nextFood;
      setFoodCount(nextFood);
      setJustFilledIndex(nextFood - 1);
      setTimeout(() => setJustFilledIndex(null), 800);
      if (!isSoundMutedRef.current) soundEngine.playEatComplete();
      setLastAction(`Додано +1 ячейку їжі (${nextFood} / ${cfg.maxFood}: ${Math.min(cfg.requiredFood, nextFood)} обов'язк. + ${Math.max(0, nextFood - cfg.requiredFood)} додатк.)`);
    };

    triggerResetFoodRef.current = () => {
      const cfg = charConfigRef.current;
      foodCountRef.current = 0;
      setFoodCount(0);
      setLastAction(`Їжу скинуто до 0 / ${cfg.maxFood}`);
    };

    triggerResetNpcRef.current = () => {
      if (pinkLizard) {
        pinkLizard.hp = 3.5;
        pinkLizard.state = 'patrol';
        pinkLizard.stunTimer = 0;
        const safe = resolveSafeLizardSpawn(
          activeLoc,
          activeEnv.denData?.spawnX ?? activeLoc.npcSpawn.x,
          activeEnv.denData?.spawnY ?? activeLoc.npcSpawn.y
        );
        pinkLizard.x = safe.x;
        pinkLizard.y = safe.y;
        pinkLizard.resetProceduralPose(safe.x, safe.y);
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
        if (!isSoundMutedRef.current) soundEngine.playThunder();
      }
    };

    triggerForceDeathRef.current = (reason: string) => {
      if (player.state === 'dead') return;
      player.hp = 0;
      player.state = 'dead';
      player.stunTimer = 0;
      player.isClimbing = false;
      player.vy = -2.8;
      setIsDead(true);
      setLastAction(reason);
      if (!isSoundMutedRef.current) soundEngine.playThunder();
    };

    triggerResetPosRef.current = () => {
      const cfg = charConfigRef.current;
      const safe = resolveSafeSpawn(activeLoc);
      player.x = safe.x;
      player.y = safe.y;
      player.vx = 0;
      player.vy = 0;
      player.state = 'normal';
      player.hp = cfg.maxHp;
      player.maxHp = cfg.maxHp;
      player.stunTimer = 0;
      player.ragdollAngle = 0;
      playerPosRef.current = { x: player.x, y: player.y };
      setIsDead(false);
      soundEngine.resetConcussion();
      const vw = CANVAS_WIDTH / zoomRef.current;
      const vh = CANVAS_HEIGHT / zoomRef.current;
      camera.x = Math.max(0, Math.min(Math.max(0, activeEnv.width - vw), (player.x + 12) - vw / 2));
      camera.y = Math.max(0, Math.min(Math.max(0, activeEnv.height - vh), (player.y + 19) - vh / 2));
      setLastAction('Позицію скинуто на старт.');
    };

    // ---------------- WebRTC Authoritative World & Item Synchronizers ----------------
    const sendAuthoritativeItemsSync = (targetPeerId?: string, requestedRoomId?: string) => {
      const targetRoomId = requestedRoomId || activeLoc.id;
      let roomItemList: WorldItem[];
      if (targetRoomId === activeLoc.id) {
        roomItemList = items;
      } else {
        const destLoc = getLocationById(targetRoomId);
        if (!destLoc) return;
        roomItemList = getOrInitRoomItems(destLoc);
      }

      const syncPacket: NetworkPacket = {
        type: 'ITEMS_SYNC',
        senderId: webRTCManager.localPlayerId,
        room: targetRoomId,
        items: roomItemList.map(it => ({
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
          isAirborne: !!it.isAirborne,
          pearlVariant: it.pearlVariant,
          flyAlive: it.flyAlive
        }))
      };
      if (targetPeerId) {
        webRTCManager.sendPacketToPeer(targetPeerId, syncPacket);
      } else {
        webRTCManager.broadcastPacket(syncPacket);
      }
    };

    const sendAuthoritativeLizardsSync = (targetPeerId?: string) => {
      if (!isWorldAuthority()) return;
      const syncPacket: NetworkPacket = {
        type: 'LIZARDS_SYNC',
        senderId: webRTCManager.localPlayerId,
        timestamp: Date.now(),
        lizards: Array.from<LizardStoreEntry>(cycleLizardsRef.current.values()).map((e) => e.lizard.toNetworkSnapshot(e.roomId))
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
      if (isWorldAuthority()) {
        sendAuthoritativeItemsSync();
        sendAuthoritativeLizardsSync();
      } else if (webRTCManager.connectionStatus === 'connected') {
        webRTCManager.broadcastPacket({
          type: 'REQUEST_WORLD_SYNC',
          senderId: webRTCManager.localPlayerId,
          room: activeLoc.id
        });
      }
    });

    const unregisterStatus = webRTCManager.onStatusChange((status) => {
      setNetworkStatus(status);
      setConnectedPeersCount(webRTCManager.getConnectedPeerCount());
      setNetworkPing(webRTCManager.getAveragePing());
      if (status === 'error' && webRTCManager.lastError) {
        setLastAction(`❌ ${webRTCManager.lastError}`);
      } else if (status === 'connected') {
        if (!isWorldAuthority()) {
          items.length = 0;
          if (player.heldItem) items.push(player.heldItem);
          webRTCManager.broadcastPacket({
            type: 'REQUEST_WORLD_SYNC',
            senderId: webRTCManager.localPlayerId,
            room: activeLoc.id
          });
        } else {
          sendAuthoritativeItemsSync();
          sendAuthoritativeLizardsSync();
        }
      }
    });

    // Client-Side Hit Registration listener
    const unregisterHit = distributedSimulation.onHitReceived((hit) => {
      if (player.state === 'dead') return;
      applyHit(player, hit.weaponType, hit.damage, hit.stunDuration, roundToOneDecimal(hit.stunDuration * 0.45));
      pvpCombatTimerRef.current = 60.0;
      pvpTargetPeerIdRef.current = hit.attackerId;
      musicManager.playCategory('battle');
    });

    // P2P DataChannel packet dispatcher
    const unregisterPackets = webRTCManager.onPacket((packet) => {
      if (packet.type === 'REQUEST_ITEMS_SYNC' || packet.type === 'REQUEST_WORLD_SYNC') {
        if (isWorldAuthority()) {
          sendAuthoritativeItemsSync(packet.senderId, packet.room);
          sendAuthoritativeLizardsSync(packet.senderId);
          webRTCManager.sendPacketToPeer(packet.senderId, {
            type: 'CYCLE_SYNC',
            hostId: webRTCManager.localPlayerId,
            cycleRemainingSeconds: cycleSecondsLeftRef.current,
            isRainFlooding: cycleSecondsLeftRef.current <= 0
          });
        }
      } else if (packet.type === 'THROW_ITEM') {
        if (packet.room === activeLoc.id) {
          const isSpearNet = packet.itemType === 'spear' || packet.itemType === 'explosive_spear';
          const isCherryNet = packet.itemType === 'cherrybomb';
          let existing = items.find(it => (packet.itemId && it.id === packet.itemId) || it.heldBy === packet.senderId);
          if (existing) {
            existing.isHeld = false;
            existing.heldBy = undefined;
            existing.isStuck = false;
            existing.stuckTarget = undefined;
            existing.stuckWallNormal = undefined;
            existing.isAirborne = packet.itemType !== 'batfly';
            existing.sleeping = false;
            existing.thrownBy = 'npc';
            existing.x = packet.x;
            existing.y = packet.y;
            existing.vx = packet.vx;
            existing.vy = packet.vy;
            existing.rotation = packet.rotation ?? (isSpearNet ? Math.atan2(packet.vy, packet.vx) : 0);
            if (isCherryNet) {
              existing.explosiveArmed = true;
              existing.fuseTimer = 0.55;
              existing.cherryPopCount = 2;
            }
          } else {
            items.push({
              id: packet.itemId || `net-throw-${Date.now()}-${Math.random()}`,
              type: packet.itemType,
              x: packet.x,
              y: packet.y,
              vx: packet.vx,
              vy: packet.vy,
              rotation: packet.rotation ?? (isSpearNet ? Math.atan2(packet.vy, packet.vx) : 0),
              isHeld: false,
              isStuck: false,
              isAirborne: packet.itemType !== 'batfly',
              sleeping: false,
              thrownBy: 'npc',
              explosiveArmed: isCherryNet ? true : undefined,
              fuseTimer: isCherryNet ? 0.55 : undefined,
              cherryPopCount: isCherryNet ? 2 : undefined,
              flyAlive: packet.itemType === 'batfly' ? true : undefined,
            });
          }

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

          const rp = webRTCManager.remotePlayers.get(packet.senderId);
          if (rp) rp.heldItem = null;
          syncRoomItemsCache();
          soundEngine.playThrow();
          setLastAction(`Гравець кинув ${getItemLabel(packet.itemType).toLowerCase()}!`);
        } else if (isWorldAuthority()) {
          const roomLoc = getLocationById(packet.room);
          if (roomLoc) {
            const roomItems = getOrInitRoomItems(roomLoc);
            const target = roomItems.find(it => (packet.itemId && it.id === packet.itemId) || it.heldBy === packet.senderId);
            if (target) {
              target.isHeld = false;
              target.heldBy = undefined;
              target.x = packet.x;
              target.y = packet.y;
              target.vx = 0;
              target.vy = 0;
            }
            syncRoomItemsCache(packet.room, roomItems);
          }
        }
      } else if (packet.type === 'ITEM_PICKUP') {
        if (packet.room === activeLoc.id) {
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
          if (rp) rp.heldItem = packet.itemType;
          syncRoomItemsCache();
          soundEngine.playPickup();
        } else if (isWorldAuthority()) {
          const roomLoc = getLocationById(packet.room);
          if (roomLoc) {
            const roomItems = getOrInitRoomItems(roomLoc);
            const target = roomItems.find(it => it.id === packet.itemId || (!it.isHeld && it.type === packet.itemType && Math.hypot(it.x - packet.x, it.y - packet.y) < 65));
            if (target) {
              target.isHeld = true;
              target.heldBy = packet.senderId;
            }
            syncRoomItemsCache(packet.room, roomItems);
          }
        }
      } else if (packet.type === 'ITEM_DROP') {
        if (packet.room === activeLoc.id) {
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
          if (rp) rp.heldItem = null;
          syncRoomItemsCache();
          soundEngine.playPickup();
        } else if (isWorldAuthority()) {
          const roomLoc = getLocationById(packet.room);
          if (roomLoc) {
            const roomItems = getOrInitRoomItems(roomLoc);
            const target = roomItems.find(it => it.id === packet.itemId || it.heldBy === packet.senderId);
            if (target) {
              target.isHeld = false;
              target.heldBy = undefined;
              target.x = packet.x;
              target.y = packet.y;
            } else {
              roomItems.push({
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
            syncRoomItemsCache(packet.room, roomItems);
          }
        }
      } else if (packet.type === 'ITEM_CONSUMED') {
        if (packet.room === activeLoc.id) {
          const idx = items.findIndex(it => it.id === packet.itemId || (it.heldBy === packet.senderId && isEdibleItemType(it.type)));
          if (idx >= 0) items.splice(idx, 1);
          const rp = webRTCManager.remotePlayers.get(packet.senderId);
          if (rp) rp.heldItem = null;
          syncRoomItemsCache();
        } else if (isWorldAuthority()) {
          const roomLoc = getLocationById(packet.room);
          if (roomLoc) {
            const roomItems = getOrInitRoomItems(roomLoc);
            const idx = roomItems.findIndex(it => it.id === packet.itemId || (it.heldBy === packet.senderId && isEdibleItemType(it.type)));
            if (idx >= 0) roomItems.splice(idx, 1);
            syncRoomItemsCache(packet.room, roomItems);
          }
        }
      } else if (packet.type === 'PVP_COMBAT_TRIGGER') {
        if (packet.targetId === webRTCManager.localPlayerId || packet.senderId === pvpTargetPeerIdRef.current) {
          pvpCombatTimerRef.current = 60.0;
          pvpTargetPeerIdRef.current = packet.senderId;
        }
      } else if (packet.type === 'ITEMS_SYNC') {
        if (packet.room === activeLoc.id && !isWorldAuthority()) {
          const localHeldId = player.heldItem ? player.heldItem.id : null;
          const hostItemMap = new Map(packet.items.map(it => [it.id, it]));

          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            if (it.id !== localHeldId && !hostItemMap.has(it.id)) {
              items.splice(i, 1);
            }
          }

          for (const sItem of packet.items) {
            if (sItem.id === localHeldId) continue;
            let localItem = items.find(it => it.id === sItem.id);
            const isFlyAlive = sItem.type === 'batfly' && sItem.flyAlive !== false;
            if (localItem) {
              localItem.type = sItem.type;
              localItem.x = sItem.x;
              localItem.y = sItem.y;
              localItem.vx = sItem.vx;
              localItem.vy = sItem.vy;
              if (sItem.rotation !== undefined) localItem.rotation = sItem.rotation;
              if (sItem.pearlVariant !== undefined) localItem.pearlVariant = sItem.pearlVariant;
              if (sItem.flyAlive !== undefined) localItem.flyAlive = sItem.flyAlive;
              localItem.isHeld = sItem.isHeld;
              localItem.heldBy = sItem.heldBy;
              localItem.isStuck = sItem.isStuck;
              localItem.stuckTarget = sItem.stuckTarget;
              localItem.isAirborne = sItem.isAirborne;
              localItem.sleeping = !isFlyAlive && !sItem.isAirborne && !sItem.isHeld && Math.abs(sItem.vx) < 0.1 && Math.abs(sItem.vy) < 0.1;
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
                sleeping: !isFlyAlive && !sItem.isAirborne && !sItem.isHeld,
                pearlVariant: sItem.pearlVariant,
                flyAlive: sItem.flyAlive ?? (sItem.type === 'batfly' ? true : undefined),
                wingPhase: sItem.type === 'batfly' ? Math.random() * 10 : undefined,
              });
            }
          }
        }
      } else if (packet.type === 'LIZARDS_SYNC') {
        if (!isWorldAuthority()) {
          const seenIds = new Set<string>();
          for (const snap of packet.lizards) {
            seenIds.add(snap.id);
            let entry = cycleLizardsRef.current.get(snap.id);
            const prevRoom = entry?.roomId;
            if (!entry) {
              const liz = new PinkLizard(snap.id, snap.x, snap.y);
              entry = { id: snap.id, roomId: snap.roomId, lizard: liz };
              cycleLizardsRef.current.set(snap.id, entry);
            }
            const roomChanged = prevRoom !== undefined && prevRoom !== snap.roomId;
            entry.roomId = snap.roomId;
            entry.lizard.applyNetworkSnapshot(snap as any, roomChanged);

            // If this lizard grabbed US and pulled us through a pipe into another room, follow automatically!
            if (snap.grabbedTarget === 'peer' && snap.grabbedPeerId === webRTCManager.localPlayerId && snap.roomId !== activeLoc.id) {
              const destLoc = getLocationById(snap.roomId);
              if (destLoc) {
                transitionToLocation(destLoc, snap.x, snap.y, undefined, `Ящер затягнув вас у кімнату: ${destLoc.name}!`);
              }
            }
          }
          for (const key of Array.from<string>(cycleLizardsRef.current.keys())) {
            if (!seenIds.has(key)) {
              cycleLizardsRef.current.delete(key);
            }
          }
          refreshActiveRoomLizard();
        }
      } else if (packet.type === 'LIZARD_HIT') {
        if (isWorldAuthority()) {
          const entry = cycleLizardsRef.current.get(packet.lizardId);
          if (entry && entry.lizard.state !== 'dead') {
            entry.lizard.takeDamage(packet.damage, packet.stunDuration);
            entry.lizard.vx += packet.knockbackVx;
            entry.lizard.vy += packet.knockbackVy;
            soundEngine.playHit(packet.weaponType);
            sendAuthoritativeLizardsSync();
          }
        }
      } else if (packet.type === 'LIZARD_BITE_PEER') {
        if (packet.targetId === webRTCManager.localPlayerId && player.state !== 'dead') {
          const cfg = charConfigRef.current;
          const actualDmg = Math.round(packet.damage * cfg.incomingDamageMult * 1000) / 1000;
          soundEngine.playCreatureHurt();
          player.hp = Math.max(0, player.hp - actualDmg);
          player.isClimbing = false;

          if (!packet.grabbed || cfg.biteGrabImmunity) {
            player.vy = -3.0;
            if (player.hp <= 0) {
              player.state = 'dead';
              setIsDead(true);
              setLastAction(`Розовий ящер завдав смертельного удару (${actualDmg.toFixed(2)} HP)!`);
            } else {
              setLastAction(`🛡️ Імунітет Монаха до укусу! Ящер відкинутий і оглушений на ${cfg.attackerStunOnGrabAttempt.toFixed(1)}с! (-${actualDmg.toFixed(2)} HP)`);
            }
          } else {
            const actualStun = roundToOneDecimal(packet.stunDuration * cfg.incomingStunMult);
            player.state = player.hp <= 0 ? 'dead' : 'stunned';
            player.stunTimer = player.hp <= 0 ? 0 : actualStun;
            if (player.hp <= 0) {
              setIsDead(true);
              setLastAction(`Розовий ящер вкусив на смерть (${actualDmg.toFixed(2)} урону)!`);
            } else {
              setLastAction(`Розовий ящер вкусив (${actualDmg.toFixed(2)} урону) і схопив у пащу! Стан ${actualStun.toFixed(1)}с!`);
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

    // Ensure no lingering lobby input/button holds keyboard focus when entering world
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    containerRef.current?.focus({ preventScroll: true });

    // Layout-independent Key handlers (supports EN, UKR, RU keyboard layouts + prevents button focus trap)
    const isTypingTarget = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);

    const setControlFlag = (btn: 'left' | 'right' | 'up' | 'down' | 'jump', pressed: boolean) => {
      if (controlsRef.current[btn] === pressed) return;
      controlsRef.current[btn] = pressed;
      setControls(prev => (prev[btn] === pressed ? prev : { ...prev, [btn]: pressed }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || isSettingsOpenRef.current) return;

      // Prevent focused UI buttons from stealing Space / Enter / WASD
      if (document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLAnchorElement) {
        document.activeElement.blur();
      }

      const code = e.code;
      const kb: KeyBindings = settingsRef.current.keybinds;
      const usedCodes = new Set<string>(Object.values(kb));

      const isLeft = code === kb.moveLeft || (!usedCodes.has('ArrowLeft') && code === 'ArrowLeft');
      const isRight = code === kb.moveRight || (!usedCodes.has('ArrowRight') && code === 'ArrowRight');
      const isUp = code === kb.moveUp || (!usedCodes.has('ArrowUp') && code === 'ArrowUp');
      const isDown = code === kb.moveDown || (!usedCodes.has('ArrowDown') && code === 'ArrowDown');
      const isJump = code === kb.jump;
      const isMap = code === kb.toggleMap || (!usedCodes.has('Tab') && code === 'Tab');
      const isEat = code === kb.eatBerry;
      const isGrab =
        code === kb.grab ||
        (!usedCodes.has('KeyC') && code === 'KeyC') ||
        (!usedCodes.has('KeyF') && code === 'KeyF') ||
        (kb.eatBerry === 'KeyE' && code === 'KeyE');
      const isThrow = code === kb.throwItem || (!usedCodes.has('KeyQ') && code === 'KeyQ');
      const isCarry = code === kb.carryPeer;

      if (isMap) {
        e.preventDefault();
        if (!e.repeat) setShowMapOverlay(prev => !prev);
        return;
      }

      if (isEat && isEdibleItemType(player.heldItem?.type)) {
        e.preventDefault();
        if (!e.repeat) triggerEatRef.current?.();
        return;
      }

      if (isGrab) {
        const isJumpOverlap = code === kb.jump;
        if (!e.repeat && (!isJumpOverlap || (player.isGrounded && controlsRef.current.down))) {
          triggerGrabRef.current?.();
        }
      }

      if (isThrow) {
        e.preventDefault();
        if (!e.repeat) triggerThrowRef.current?.();
        return;
      }

      if (isCarry) {
        e.preventDefault();
        if (!e.repeat) triggerPiggybackRef.current?.();
        return;
      }

      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code) ||
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)
      ) {
        e.preventDefault();
      }

      if (isLeft) setControlFlag('left', true);
      if (isRight) setControlFlag('right', true);
      if (isUp) setControlFlag('up', true);
      if (isDown) setControlFlag('down', true);
      if (isJump) setControlFlag('jump', true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const kb: KeyBindings = settingsRef.current.keybinds;
      const usedCodes = new Set<string>(Object.values(kb));

      if (code === kb.moveLeft || (!usedCodes.has('ArrowLeft') && code === 'ArrowLeft')) {
        setControlFlag('left', false);
      }
      if (code === kb.moveRight || (!usedCodes.has('ArrowRight') && code === 'ArrowRight')) {
        setControlFlag('right', false);
      }
      if (code === kb.moveUp || (!usedCodes.has('ArrowUp') && code === 'ArrowUp')) {
        setControlFlag('up', false);
      }
      if (code === kb.moveDown || (!usedCodes.has('ArrowDown') && code === 'ArrowDown')) {
        setControlFlag('down', false);
      }
      if (code === kb.jump) {
        setControlFlag('jump', false);
      }
    };

    const resetAllControls = () => {
      controlsRef.current.left = false;
      controlsRef.current.right = false;
      controlsRef.current.up = false;
      controlsRef.current.down = false;
      controlsRef.current.jump = false;
      setControls({ left: false, right: false, up: false, down: false, jump: false });
    };
    resetControlsActionRef.current = resetAllControls;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        resetAllControls();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', resetAllControls);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let musicCheckTimer = 0;

    // Main animation loop
    const tick = () => {
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      t += 0.05;

      frameCounter++;
      if (frameCounter % 30 === 0) {
        currentFps = Math.round(1 / Math.max(0.001, delta));
      }

      if (needsCycleResetRef.current) {
        needsCycleResetRef.current = false;
        lizardsInitializedForCycle = false;
        ensureCycleLizardsInitialized();
        const keptItem = player.heldItem;
        items.length = 0;
        if (isWorldAuthority()) {
          for (const it of getOrInitRoomItems(activeLoc)) {
            if (!keptItem || it.id !== keptItem.id) {
              items.push(it);
            }
          }
        }
        if (keptItem) items.push(keptItem);
        if (isWorldAuthority() && webRTCManager.remotePlayers.size > 0) {
          sendAuthoritativeItemsSync();
          sendAuthoritativeLizardsSync();
        }
      }

      refreshActiveRoomLizard();
      const ctrl = controlsRef.current;

      if (roomTransitionGraceTimer > 0) {
        roomTransitionGraceTimer = Math.max(0, roomTransitionGraceTimer - delta);
      }
      if (sleepMsgCooldown > 0) {
        sleepMsgCooldown = Math.max(0, sleepMsgCooldown - delta);
      }

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

      // Singleplayer death -> automatic cycle end & restart from last saved shelter
      if (player.state === 'dead' && !isMultiplayerActiveRef.current) {
        singleplayerDeathTimer += delta;
        if (singleplayerDeathTimer >= 2.2) {
          singleplayerDeathTimer = 0;
          restartCycleFromSavedShelter();
        }
      } else {
        singleplayerDeathTimer = 0;
      }

      // ---------------- Authoritative Pink Lizard Simulation vs Client Interpolation ----------------
      if (isWorldAuthority()) {
        const roomPeers = new Map<string, Array<{
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
        }>>();
        for (const p of webRTCManager.remotePlayers.values()) {
          const rId = p.room || activeLoc.id;
          let list = roomPeers.get(rId);
          if (!list) {
            list = [];
            roomPeers.set(rId, list);
          }
          const peerCharCfg = SLUGCAT_CHARACTERS[p.characterId === 'monk' ? 'monk' : 'survivor'];
          list.push({
            id: p.id,
            name: p.name || 'Слимакокіт',
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            hp: p.hp ?? peerCharCfg.maxHp,
            state: p.state || 'normal',
            room: rId,
            biteGrabImmunity: peerCharCfg.biteGrabImmunity,
            attackerStunOnGrabAttempt: peerCharCfg.attackerStunOnGrabAttempt,
          });
        }

        const activeRooms = new Set<string>([activeLoc.id, ...roomPeers.keys()]);
        const localCfg = charConfigRef.current;
        player.characterId = localCfg.id;
        player.biteGrabImmunity = localCfg.biteGrabImmunity;
        player.attackerStunOnGrabAttempt = localCfg.attackerStunOnGrabAttempt;
        player.isPipeProtected = !!pipeTransit || roomTransitionGraceTimer > 0;

        cycleLizardsRef.current.forEach((entry: LizardStoreEntry) => {
          const liz = entry.lizard;
          const roomLoc = getLocationById(entry.roomId) || activeLoc;
          const rEnv = getRoomEnv(roomLoc);

          if (activeRooms.has(entry.roomId)) {
            const isLocalRoom = entry.roomId === activeLoc.id;
            const peersHere = roomPeers.get(entry.roomId) || [];

            liz.update(
              delta,
              isLocalRoom ? player : null,
              peersHere,
              rEnv.platforms,
              rEnv.poles,
              rEnv.denData,
              (damage: number, grabbed: boolean) => {
                soundEngine.playCreatureHurt();
                const cfg = charConfigRef.current;
                const actualDmg = Math.round(damage * cfg.incomingDamageMult * 1000) / 1000;
                player.hp = Math.max(0, player.hp - actualDmg);
                player.isClimbing = false;

                if (!grabbed) {
                  player.vx = (player.x < liz.x ? -1 : 1) * 4.5;
                  player.vy = -3.0;
                  if (player.hp <= 0) {
                    player.state = 'dead';
                    setIsDead(true);
                    setLastAction(`Розовий ящер завдав смертельного удару (${actualDmg.toFixed(2)} HP)!`);
                  } else {
                    setLastAction(`🛡️ Імунітет Монаха до укусу! Ящер відкинутий і оглушений на ${cfg.attackerStunOnGrabAttempt.toFixed(1)}с! (-${actualDmg.toFixed(2)} HP)`);
                  }
                } else {
                  const actualStun = roundToOneDecimal(20.0 * cfg.incomingStunMult);
                  player.state = player.hp <= 0 ? 'dead' : 'stunned';
                  player.stunTimer = player.hp <= 0 ? 0 : actualStun;
                  if (player.hp <= 0) {
                    setIsDead(true);
                    setLastAction(`Розовий ящер вкусив на смерть (${actualDmg.toFixed(2)} урону)!`);
                  } else {
                    setLastAction(`Розовий ящер вкусив (${actualDmg.toFixed(2)} урону) і схопив у пащу! Стан ${actualStun.toFixed(1)}с!`);
                  }
                }
              },
              () => {
                if (entry.roomId === activeLoc.id) {
                  soundEngine.playCreatureHurt();
                }
              },
              (peerId: string, damage: number, grabbed: boolean) => {
                if (entry.roomId === activeLoc.id) {
                  soundEngine.playCreatureHurt();
                }
                webRTCManager.sendPacketToPeer(peerId, {
                  type: 'LIZARD_BITE_PEER',
                  senderId: webRTCManager.localPlayerId,
                  targetId: peerId,
                  lizardId: entry.id,
                  room: entry.roomId,
                  damage,
                  stunDuration: grabbed ? 20.0 : 0,
                  grabbed
                });
              },
              rEnv.transitPipes,
              (targetRoomId: string, spawnX?: number, spawnY?: number) => {
                const destLoc = getLocationById(targetRoomId);
                if (!destLoc) return;
                const prevRoomId = entry.roomId;
                const retPipe = destLoc.transitPipes.find(p => p.targetLocationId === prevRoomId);
                const destSafe = resolveSafeLizardSpawn(
                  destLoc,
                  spawnX ?? retPipe?.startX,
                  spawnY ?? retPipe?.startY
                );
                entry.roomId = targetRoomId;
                if (retPipe) {
                  liz.startPipeEmergence(
                    retPipe.endX,
                    retPipe.endY,
                    destSafe.x + liz.width / 2,
                    destSafe.y + liz.height / 2,
                    0.85
                  );
                } else {
                  liz.x = destSafe.x;
                  liz.y = destSafe.y;
                  liz.resetProceduralPose(destSafe.x, destSafe.y);
                }

                if (liz.grabbedTarget === 'player') {
                  transitionToLocation(
                    destLoc,
                    destSafe.x,
                    destSafe.y,
                    undefined,
                    `Ящер затягнув вас через трубу у кімнату: ${destLoc.name}!`
                  );
                } else if (prevRoomId === activeLoc.id || targetRoomId === activeLoc.id) {
                  setLastAction(`Ящер проліз через трубу у кімнату: ${destLoc.name}!`);
                }
                refreshActiveRoomLizard();
                if (webRTCManager.remotePlayers.size > 0) {
                  sendAuthoritativeLizardsSync();
                }
              },
              () => {
                if (entry.roomId === activeLoc.id) {
                  setLastAction('Ящер заліз у лігво, залишив здобич, виліз назовні та пішов далі полювати!');
                }
              },
              { width: rEnv.width, height: rEnv.height, roomId: roomLoc.id }
            );
          } else {
            // Simplified simulation for empty rooms with natural pipe emergence (never pops mid-air)
            if (liz.pipeTransit) {
              liz.pipeTransit.progress += delta / liz.pipeTransit.duration;
              const p = Math.min(1, liz.pipeTransit.progress);
              liz.x = liz.pipeTransit.fromX + (liz.pipeTransit.toX - liz.pipeTransit.fromX) * p - liz.width / 2;
              liz.y = liz.pipeTransit.fromY + (liz.pipeTransit.toY - liz.pipeTransit.fromY) * p - liz.height / 2;
              if (p >= 1) {
                liz.pipeTransit = null;
                liz.pipeCooldown = 8.0;
              }
              liz.updateProceduralBody();
              return;
            }

            if (liz.state === 'dead') return;
            if (liz.stunTimer > 0) {
              liz.stunTimer = Math.max(0, liz.stunTimer - delta);
              if (liz.stunTimer === 0 && liz.state === 'stunned') {
                liz.state = 'patrol';
              }
              return;
            }
            if (liz.pipeCooldown > 0) {
              liz.pipeCooldown = Math.max(0, liz.pipeCooldown - delta);
            }

            // Persistent chase memory: if player escaped through an inter-room pipe, follow them!
            if (liz.pipePursuitMemory && liz.pipePursuitMemory.timer > 0) {
              liz.pipePursuitMemory.timer -= delta;
              liz.pipePursuitMemory.reactDelay = Math.max(0, liz.pipePursuitMemory.reactDelay - delta);
              const lxMid = liz.x + liz.width / 2;
              const distToPipeX = liz.pipePursuitMemory.entryX - lxMid;
              if (Math.abs(distToPipeX) > 10) {
                liz.facingRight = distToPipeX > 0;
                liz.x += Math.sign(distToPipeX) * (delta * 155);
              }
              liz.y = Math.max(60, Math.min(rEnv.floorY - liz.height, liz.pipePursuitMemory.entryY - liz.height / 2));
              liz.updateProceduralBody();

              if (
                liz.pipePursuitMemory.targetRoomId &&
                liz.pipePursuitMemory.reactDelay <= 0 &&
                liz.pipeCooldown <= 0 &&
                Math.abs(distToPipeX) < 80
              ) {
                const destRoom = getLocationById(liz.pipePursuitMemory.targetRoomId);
                if (destRoom && !destRoom.isShelterRoom) {
                  const retPipe = destRoom.transitPipes.find(p => p.targetLocationId === entry.roomId);
                  const destSafe = resolveSafeLizardSpawn(
                    destRoom,
                    liz.pipePursuitMemory.spawnX ?? retPipe?.startX,
                    liz.pipePursuitMemory.spawnY ?? retPipe?.startY
                  );
                  entry.roomId = destRoom.id;
                  liz.pipePursuitMemory = null;
                  liz.state = 'hunt';
                  liz.lostPlayerTimer = 15.0;
                  liz.lastKnownPreyX = destSafe.x;
                  liz.lastKnownPreyY = destSafe.y;
                  liz.pipeCooldown = 5.0;
                  if (retPipe) {
                    liz.startPipeEmergence(
                      retPipe.endX,
                      retPipe.endY,
                      destSafe.x + liz.width / 2,
                      destSafe.y + liz.height / 2,
                      0.85
                    );
                  } else {
                    liz.x = destSafe.x;
                    liz.y = destSafe.y;
                    liz.vx = 0;
                    liz.vy = 0;
                    liz.resetProceduralPose(destSafe.x, destSafe.y);
                  }
                  refreshActiveRoomLizard();
                  if (destRoom.id === activeLoc.id) {
                    setLastAction(`Ящер вистежив вас і проліз у кімнату: ${destRoom.name}!`);
                  }
                  if (webRTCManager.remotePlayers.size > 0) {
                    sendAuthoritativeLizardsSync();
                  }
                  return;
                }
              }

              if (liz.pipePursuitMemory && liz.pipePursuitMemory.timer <= 0) {
                liz.pipePursuitMemory = null;
                liz.state = 'patrol';
              }
              return;
            }

            liz.x += (liz.facingRight ? 1 : -1) * (delta * 85);
            liz.y = Math.max(60, Math.min(rEnv.floorY - liz.height, liz.y));
            if (liz.x < 60) {
              liz.x = 60;
              liz.facingRight = true;
            } else if (liz.x > rEnv.width - 80) {
              liz.x = rEnv.width - 80;
              liz.facingRight = false;
            }
            liz.updateProceduralBody();

            if (liz.pipeCooldown <= 0 && rEnv.transitPipes.length > 0) {
              const interPipes = rEnv.transitPipes.filter(p => !!p.targetLocationId && !p.isShelterPipe);
              if (interPipes.length > 0 && Math.random() < 0.0012) {
                const chosenPipe = interPipes[Math.floor(Math.random() * interPipes.length)];
                if (chosenPipe.targetLocationId) {
                  const destRoom = getLocationById(chosenPipe.targetLocationId);
                  if (destRoom) {
                    const retPipe = destRoom.transitPipes.find(p => p.targetLocationId === entry.roomId);
                    const destSafe = resolveSafeLizardSpawn(
                      destRoom,
                      chosenPipe.targetSpawnX ?? retPipe?.startX,
                      chosenPipe.targetSpawnY ?? retPipe?.startY
                    );
                    entry.roomId = destRoom.id;
                    liz.pipeCooldown = 12.0;
                    if (retPipe) {
                      liz.startPipeEmergence(
                        retPipe.endX,
                        retPipe.endY,
                        destSafe.x + liz.width / 2,
                        destSafe.y + liz.height / 2,
                        0.85
                      );
                    } else {
                      liz.x = destSafe.x;
                      liz.y = destSafe.y;
                      liz.vx = 0;
                      liz.vy = 0;
                      liz.resetProceduralPose(destSafe.x, destSafe.y);
                    }
                  }
                }
              }
            }
          }
        });

        // 20 Hz Authoritative Lizards Sync Broadcast to clients
        if (webRTCManager.remotePlayers.size > 0 && now - lastLizardsSyncMs >= 50) {
          lastLizardsSyncMs = now;
          sendAuthoritativeLizardsSync();
        }
      } else {
        // Non-host client: smooth interpolation toward host lizard snapshots
        cycleLizardsRef.current.forEach((entry: LizardStoreEntry) => {
          entry.lizard.interpolateClient(delta);
        });
        if (pinkLizard && pinkLizard.grabbedTarget === 'peer' && pinkLizard.grabbedPeerId === webRTCManager.localPlayerId && player.state !== 'dead') {
          const mouthOffsetX = pinkLizard.facingRight ? pinkLizard.width - 2 : -10;
          player.x = pinkLizard.x + mouthOffsetX;
          player.y = pinkLizard.y + 4;
          player.vx = pinkLizard.vx;
          player.vy = pinkLizard.vy;
        }
      }

      // ---------------- Visible Lizard Den Mechanics ----------------
      // "і зроби ящеру свою убержку ну видиму куда даже зайти можна но игрока якого заніс туда ящер буде медлено получать урон 0.01 урон в 3 сикунди та стан ставитиметься на паузу поки він там"
      // ---------------- Visible Lizard Den Mechanics ----------------
      const isInsideLizardDen = Boolean(
        activeLoc.isLizardDenRoom ||
        (!activeLoc.isShelterRoom && activeEnv.denData && (
          player.x + 12 >= activeEnv.denData.x &&
          player.x + 12 <= activeEnv.denData.x + activeEnv.denData.w &&
          player.y + 19 >= activeEnv.denData.y &&
          player.y + 19 <= activeEnv.denData.y + activeEnv.denData.h + 24
        ))
      );

      if (isInsideLizardDen && player.state !== 'dead') {
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
      musicManager.setHealthFilter(player.hp / player.maxHp);

      // ---------------- Dynamic Music Category Switching with Exact 60s Timers ----------------
      for (const entry of activeRoomLizards) {
        const liz = entry.lizard;
        if (liz.state === 'dead') continue;
        const distToLizard = Math.hypot((player.x + 12) - (liz.x + 26), (player.y + 19) - (liz.y + 12));
        if (distToLizard < 480 || liz.grabbedTarget === 'player' || liz.state === 'hunt') {
          lizardCombatTimerRef.current = 60.0;
          break;
        }
      }

      if (lizardCombatTimerRef.current > 0) {
        lizardCombatTimerRef.current = Math.max(0, lizardCombatTimerRef.current - delta);
      }

      if (pvpCombatTimerRef.current > 0) {
        const targetPeer = pvpTargetPeerIdRef.current ? webRTCManager.remotePlayers.get(pvpTargetPeerIdRef.current) : null;
        const inSameRoom = targetPeer && targetPeer.room === activeLoc.id;
        const drainRate = inSameRoom ? 1.0 : 3.0;
        pvpCombatTimerRef.current = Math.max(0, pvpCombatTimerRef.current - delta * drainRate);
      }

      musicCheckTimer += delta;
      if (musicCheckTimer > 0.3 && !isExitingRef.current) {
        musicCheckTimer = 0;
        const inCombat = (lizardCombatTimerRef.current > 0) || (pvpCombatTimerRef.current > 0);
        musicManager.playCategory(inCombat ? 'battle' : 'game');
      }

      // ---------------- Player Physics Updates ----------------
      const canControl = player.state === 'normal';

      // Lethal Downpour upon cycle expiry:
      if (cycleSecondsLeftRef.current <= 0) {
        localStormSeconds += delta;
        setStormActive(true);
        setStormSeconds(localStormSeconds);
        const stormIntensity = Math.min(1.0, localStormSeconds / 25.0);
        soundEngine.setStormVolume(stormIntensity * 0.85);

        if (!inShelterChamberRef.current && !activeLoc.isShelterRoom && !activeLoc.isLizardDenRoom && player.state === 'normal') {
          const dps = 1.0 / 60.0;
          player.hp = Math.max(0, player.hp - dps * delta);
          if (player.hp <= 0) {
            player.state = 'dead';
            player.vy = -2.5;
            setLastAction('Нищівна злива змила слимакокота! Цикл закінчено трагічно.');
            if (!isSoundMutedRef.current) soundEngine.playThunder();
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

      // Pipe Conduit Transit: 1.1s delayed sliding travel through pipe (no telemetry/state resets!)
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
          if (pipeTransit.targetLocationId) {
            const targetLoc = getLocationById(pipeTransit.targetLocationId);
            if (targetLoc) {
              const reqX = pipeTransit.targetSpawnX;
              const reqY = pipeTransit.targetSpawnY;
              const exitDir = (reqX ?? targetLoc.playerSpawn.x) < (targetLoc.width / 2) ? 1 : -1;
              pipeTransit = null;
              lastTransitTimestamp = performance.now();
              soundEngine.playPickup();
              transitionToLocation(
                targetLoc,
                reqX,
                reqY,
                { vx: exitDir * 2.5, vy: -1.6 },
                targetLoc.isShelterRoom
                  ? 'Ви залізли у безпечне укриття для гібернації!'
                  : `Ви перейшли у локацію: ${targetLoc.name}!`
              );
            } else {
              pipeTransit = null;
              lastTransitTimestamp = performance.now();
            }
          } else if (pipeTransit.isShelter) {
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
            roomTransitionGraceTimer = 1.6;
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
          player.crouching = false;
          eatingSlowdownTimer = 1.0; // 1 second of slowdown penalty
          player.vx *= 0.2; // sudden stumble / momentum loss
          setLastAction("Рух перервав їжу! Слимакокіт спіткнувся.");
        }
      }

      // Pole Grabbing logic (only if normal and alive and not eating)
      let touchingPole: ClimbPole | null = null;
      if (canControl && !isEating) {
        for (const p of activeEnv.poles) {
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
          if (!isSoundMutedRef.current) {
            soundEngine.playThunder();
          }
        }
      } else {
        if (isEating) {
          player.isClimbing = false;
          player.crouching = true;
          player.vx *= 0.6;
          if (Math.abs(player.vx) < 0.05) player.vx = 0;
        } else if (canControl) {
          const isCarrying = !!carriedPlayerIdRef.current;
          const carryDebuff = isCarrying ? 0.90 : 1.0;
          const isSlowed = eatingSlowdownTimer > 0;
          const accel = (isSlowed ? 0.22 : 0.55) * carryDebuff;
          const baseWalkSpeed = (player.crouching ? 2.2 : 4.8) * carryDebuff;
          const maxWalkSpeed = (isSlowed ? Math.min(baseWalkSpeed, 2.0) : baseWalkSpeed);
          const friction = player.isGrounded ? (isSlowed ? 0.74 : 0.82) : 0.98;

          if (ctrl.down && player.isGrounded) {
            player.crouching = true;
          }

          if (ctrl.up && player.crouching) {
            player.crouching = false;
            pounceChargeTimer = 0;
          }

          if (!player.isGrounded) {
            pounceChargeTimer = 0;
          }

          const isChargingPounce = player.crouching && player.isGrounded && ctrl.jump;

          if (isChargingPounce) {
            player.vx *= 0.55;
            if (Math.abs(player.vx) < 0.05) player.vx = 0;
            pounceChargeTimer += delta;

            if (pounceChargeTimer >= 2.0) {
              const dir = player.facingRight ? 1 : -1;
              player.vx = dir * 11.5 * carryDebuff;
              player.vy = -7.6 * carryDebuff;
              player.isGrounded = false;
              player.crouching = false;
              pounceChargeTimer = 0;
              if (!isSoundMutedRef.current) soundEngine.playThunder();
              setLastAction('Високий ривок Слимакокота (Pounce)!');
            }
          } else {
            if (pounceChargeTimer >= 1.8) {
              const dir = player.facingRight ? 1 : -1;
              player.vx = dir * 11.5 * carryDebuff;
              player.vy = -7.6 * carryDebuff;
              player.isGrounded = false;
              player.crouching = false;
              pounceChargeTimer = 0;
              if (!isSoundMutedRef.current) soundEngine.playThunder();
              setLastAction('Високий ривок Слимакокота (Pounce)!');
            } else if (pounceChargeTimer > 0 && pounceChargeTimer < 1.8 && !ctrl.jump && prevJumpPressed) {
              player.vy = (isSlowed ? -6.8 : -8.5) * carryDebuff;
              player.isGrounded = false;
              player.crouching = false;
              pounceChargeTimer = 0;
              if (!isSoundMutedRef.current) soundEngine.playThunder();
              setLastAction('Стрибок з положення лежачи!');
            } else {
              pounceChargeTimer = 0;

              if (ctrl.left) {
                player.vx -= accel;
                player.facingRight = false;
              } else if (ctrl.right) {
                player.vx += accel;
                player.facingRight = true;
              } else {
                player.vx *= friction;
              }

              if (ctrl.jump && !prevJumpPressed && player.isGrounded) {
                player.vy = (isSlowed ? -6.8 : -8.5) * carryDebuff;
                player.isGrounded = false;
                player.crouching = false;
                setLastAction(isSlowed ? 'Важкий стрибок...' : (isCarrying ? 'Стрибок із гравцем на спині (-10%)' : 'Класичний стрибок Слимакокота!'));
                if (!isSoundMutedRef.current) {
                  soundEngine.playThunder();
                }
              }
            }
          }

          if (player.vx > maxWalkSpeed) player.vx = maxWalkSpeed;
          if (player.vx < -maxWalkSpeed) player.vx = -maxWalkSpeed;

          if (carriedPlayerIdRef.current) {
            const carriedPeer = webRTCManager.remotePlayers.get(carriedPlayerIdRef.current);
            if (carriedPeer) {
              carriedPeer.x = player.x + (player.facingRight ? -4 : 4);
              carriedPeer.y = player.y - 14;
            }
          }

          const carrier = Array.from(webRTCManager.remotePlayers.values()).find(rp => rp.carryingPeerId === webRTCManager.localPlayerId);
          if (carrier) {
            if (ctrl.jump && !prevJumpPressed) {
              player.vy = -7.5;
              player.vx = player.facingRight ? 4.5 : -4.5;
              player.isGrounded = false;
              if (!isSoundMutedRef.current) soundEngine.playThunder();
              setLastAction('Ви зістрибнули зі спини гравця!');
            } else {
              player.x = carrier.x + (carrier.facingRight ? -4 : 4);
              player.y = carrier.y - 14;
            }
          }

          const pickupCand = Array.from(webRTCManager.remotePlayers.values()).find(rp =>
            rp.room === activeLoc.id &&
            (rp.stunTimer > 0 || rp.crouching) &&
            Math.hypot((player.x + 12) - (rp.x + 12), (player.y + 19) - (rp.y + 19)) < 44
          );
          setNearbyPickupCandidate(pickupCand ? { id: pickupCand.id, name: pickupCand.name } : null);

          prevJumpPressed = ctrl.jump;
        } else {
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
        for (const plat of activeEnv.platforms) {
          const isSolidWall = plat.type === 'wall' || plat.type === 'shelter';

          if (isSolidWall || plat.h >= 45) {
            const yOverlap = player.y + player.height > plat.y + 6 && player.y < plat.y + plat.h - 6;
            if (yOverlap) {
              if (player.x + player.width >= plat.x && (player.x + player.width - player.vx) <= plat.x + 8) {
                player.x = plat.x - player.width;
                player.vx = 0;
              } else if (player.x <= plat.x + plat.w && (player.x - player.vx) >= plat.x + plat.w - 8) {
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

        // Wall-stuck horizontal spears act as climbable/standable horizontal rungs!
        if (!ctrl.down && player.vy >= 0) {
          for (const stuckSpear of items) {
            if (
              (stuckSpear.type !== 'spear' && stuckSpear.type !== 'explosive_spear') ||
              !stuckSpear.isStuck ||
              stuckSpear.stuckTarget ||
              Math.abs(Math.cos(stuckSpear.rotation)) <= 0.75
            ) {
              continue;
            }
            const spearLeft = stuckSpear.x - 24;
            const spearRight = stuckSpear.x + 24;
            const barY = stuckSpear.y - 2;
            if (player.x + player.width > spearLeft && player.x < spearRight) {
              const wasAbove = (player.y + player.height - player.vy) <= barY + 6;
              const isAtBar = player.y + player.height >= barY && player.y + player.height <= barY + 14;
              if (wasAbove && isAtBar) {
                player.y = barY - player.height;
                player.vy = 0;
                player.isGrounded = true;
              }
            }
          }
        }

        // Screen boundary collisions across dynamic room width & floor/ceiling
        if (player.x < 10) {
          player.x = 10;
          player.vx = 0;
        }
        if (player.x > activeEnv.width - player.width - 10) {
          player.x = activeEnv.width - player.width - 10;
          player.vx = 0;
        }
        if (player.y < 10) {
          player.y = 10;
          player.vy = 0.1;
        }

        // Dedicated Shelter Room physical hibernation with food & rain rules:
        // - Cannot sleep if required food pips aren't filled (unless raining -> kills player!)
        if ((activeLoc.isShelterRoom || inShelterChamberRef.current) && canControl && !isHibernatingRef.current && !pipeTransit) {
          const isHoldingSleep = ctrl.jump || ctrl.down || player.crouching || isHoldingSleepBtnRef.current;
          const reqFood = charConfigRef.current.requiredFood;
          const hasReqFood = foodCountRef.current >= reqFood;
          const isRainingNow = cycleSecondsLeftRef.current <= 0;

          if (isHoldingSleep && player.isGrounded) {
            if (!hasReqFood && !isRainingNow) {
              shelterSleepTimer = 0;
              setSleepProgress(0);
              if (sleepMsgCooldown <= 0) {
                sleepMsgCooldown = 1.5;
                setLastAction(`❌ Не можна спати! Заповніть обов'язкові ячейки їжі (${foodCountRef.current} / ${reqFood}).`);
              }
            } else {
              player.vx *= 0.5;
              const chargeSpeed = !hasReqFood && isRainingNow ? 3.2 : 1.0;
              shelterSleepTimer += delta * chargeSpeed;
              setSleepProgress(Math.min(1, shelterSleepTimer / 1.5));
              if (shelterSleepTimer >= 1.5) {
                shelterSleepTimer = 0;
                setSleepProgress(0);
                isHoldingSleepBtnRef.current = false;
                setIsHoldingSleepBtn(false);
                triggerHibernateRef.current?.();
              }
            }
          } else {
            shelterSleepTimer = Math.max(0, shelterSleepTimer - delta * 2.5);
            setSleepProgress(Math.min(1, shelterSleepTimer / 1.5));
          }
        } else {
          shelterSleepTimer = 0;
          setSleepProgress(0);
        }

        // Rain World shortcut transit pipes check
        if (canControl && !isEating && !pipeTransit && activeEnv.transitPipes.length > 0) {
          const pipeNow = performance.now();
          if (pipeNow - lastTransitTimestamp > 1200) {
            const px = player.x + player.width / 2;
            const py = player.y + player.height / 2;
            for (const pipe of activeEnv.transitPipes) {
              const distA = Math.hypot(px - pipe.startX, py - pipe.startY);
              const distB = Math.hypot(px - pipe.endX, py - pipe.endY);
              if (distA < 30) {
                lastTransitTimestamp = pipeNow;
                pipeTransit = {
                  startX: pipe.startX,
                  startY: pipe.startY,
                  endX: pipe.endX,
                  endY: pipe.endY,
                  progress: 0,
                  duration: 0.95,
                  isShelter: !!pipe.isShelterPipe,
                  targetLocationId: pipe.targetLocationId,
                  targetSpawnX: pipe.targetSpawnX,
                  targetSpawnY: pipe.targetSpawnY
                };
                if (isWorldAuthority() && !pipe.isShelterPipe && !pipe.isDenPipe) {
                  for (const entry of activeRoomLizards) {
                    const liz = entry.lizard;
                    if (liz.state === 'dead' || liz.state === 'stunned') continue;
                    const distToLiz = Math.hypot(px - (liz.x + liz.width / 2), py - (liz.y + liz.height / 2));
                    if (liz.state === 'hunt' || liz.lostPlayerTimer > 0 || distToLiz < 760) {
                      liz.rememberPreyPipeEntry({
                        pipeId: pipe.id,
                        fromRoomId: activeLoc.id,
                        targetRoomId: pipe.targetLocationId,
                        entryX: pipe.startX,
                        entryY: pipe.startY,
                        spawnX: pipe.targetSpawnX,
                        spawnY: pipe.targetSpawnY
                      });
                    }
                  }
                }
                soundEngine.playPipeTravel();
                setLastAction(pipe.isShelterPipe
                  ? 'Залізає у герметичний шлюз укриття...'
                  : pipe.targetLocationId
                    ? `Залізає у перехід: ${pipe.label || 'на іншу карту'}...`
                    : 'Залізає у трубу-перехід...');
                break;
              } else if (distB < 28 && !pipe.isShelterPipe && !pipe.targetLocationId) {
                lastTransitTimestamp = pipeNow;
                pipeTransit = {
                  startX: pipe.endX,
                  startY: pipe.endY,
                  endX: pipe.startX,
                  endY: pipe.startY,
                  progress: 0,
                  duration: 0.95,
                  isShelter: false
                };
                if (isWorldAuthority()) {
                  for (const entry of activeRoomLizards) {
                    const liz = entry.lizard;
                    if (liz.state === 'dead' || liz.state === 'stunned') continue;
                    const distToLiz = Math.hypot(px - (liz.x + liz.width / 2), py - (liz.y + liz.height / 2));
                    if (liz.state === 'hunt' || liz.lostPlayerTimer > 0 || distToLiz < 760) {
                      liz.rememberPreyPipeEntry({
                        pipeId: pipe.id,
                        fromRoomId: activeLoc.id,
                        entryX: pipe.endX,
                        entryY: pipe.endY
                      });
                    }
                  }
                }
                soundEngine.playPipeTravel();
                setLastAction('Залізає у трубу-перехід...');
                break;
              }
            }
          }
        }
      }

      playerPosRef.current = { x: player.x, y: player.y };

      // ---------------- Update Explosions, Sparks, Shockwaves & Camera Shake ----------------
      if (cameraShakeTimer > 0) {
        cameraShakeTimer = Math.max(0, cameraShakeTimer - delta);
      }
      for (let si = shockwaves.length - 1; si >= 0; si--) {
        const sw = shockwaves[si];
        sw.life -= delta;
        const progress = 1 - Math.max(0, sw.life / sw.maxLife);
        sw.radius = 6 + (sw.maxRadius - 6) * (1 - Math.pow(1 - progress, 2));
        if (sw.life <= 0) {
          shockwaves.splice(si, 1);
        }
      }
      for (let pi = sparks.length - 1; pi >= 0; pi--) {
        const sp = sparks[pi];
        sp.life -= delta;
        sp.vy += 0.14;
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.96;
        if (sp.life <= 0) {
          sparks.splice(pi, 1);
        }
      }

      // ---------------- Update World Items Physics & Collisions ----------------
      const itemsToRemove = new Set<string>();
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

        // Countdown armed fuse for explosive_spear and cherrybomb
        if (item.explosiveArmed) {
          item.fuseTimer = (item.fuseTimer ?? 0.35) - delta;
          if (Math.random() < 0.65) {
            spawnSparks(item.x, item.y, 2, ['#fef08a', '#fb923c', '#ef4444'], 2.4);
          }
          if (item.type === 'cherrybomb' && (item.cherryPopCount ?? 0) > 0 && item.fuseTimer < 0.32) {
            item.cherryPopCount = 0;
            soundEngine.playCherryPop();
          }
          if (item.fuseTimer <= 0) {
            detonateExplosion(
              item.x,
              item.y,
              item.type === 'explosive_spear' ? 145 : 130,
              item.type === 'explosive_spear' ? 2.4 : 0.45,
              item.type === 'explosive_spear' ? 4.2 : 4.5,
              item.type === 'explosive_spear' ? 'explosive_spear' : 'cherrybomb',
              item.thrownBy
            );
            itemsToRemove.add(item.id);
            continue;
          }
        }

        if (item.isStuck) {
          item.sleeping = true;
          // Attached to stuck target (Lizard or Player)
          if (item.stuckTarget === 'lizard') {
            const stuckLiz = (item.stuckLizardId
              ? activeRoomLizards.find(e => e.id === item.stuckLizardId)?.lizard
              : null) || pinkLizard;
            if (stuckLiz) {
              item.x = (stuckLiz.x + stuckLiz.width / 2) + (item.stuckOffsetX ?? 0);
              item.y = (stuckLiz.y + stuckLiz.height / 2) + (item.stuckOffsetY ?? 0);
              item.rotation = item.stuckAngle ?? 0;
            }
          } else if (item.stuckTarget === 'player') {
            item.x = player.chest.x + (item.stuckOffsetX ?? 0);
            item.y = player.chest.y + (item.stuckOffsetY ?? 0);
            item.rotation = (item.stuckAngle ?? 0) + (player.ragdollAngle ?? 0);
          }
          // Firmly stuck (in creature or wall/floor), static until picked up or detonated
          continue;
        }

        // Living Batfly autonomous flight / knocked-down stun behavior
        if (item.type === 'batfly' && item.flyAlive !== false) {
          item.sleeping = false;
          if ((item.flyStunTimer ?? 0) > 0) {
            item.flyStunTimer = Math.max(0, (item.flyStunTimer ?? 0) - delta);
            item.vy += 0.34;
            if (item.vy > 9) item.vy = 9;
            item.vx *= 0.90;
            item.x += item.vx;
            item.y += item.vy;
            item.rotation = Math.sin(t * 6) * 0.35;
          } else {
            item.wingPhase = (item.wingPhase ?? 0) + delta * 26;
            item.flyDecisionTimer = (item.flyDecisionTimer ?? 0) - delta;

            const pxMid = player.x + player.width / 2;
            const pyMid = player.y + player.height / 2;
            const distToPlayer = Math.hypot(item.x - pxMid, item.y - pyMid);

            let nearestLizDist = 9999;
            let nearestLizX = 0;
            let nearestLizY = 0;
            for (const lizEntry of activeRoomLizards) {
              const l = lizEntry.lizard;
              if (l.state === 'dead') continue;
              const d = Math.hypot(item.x - (l.x + l.width / 2), item.y - (l.y + l.height / 2));
              if (d < nearestLizDist) {
                nearestLizDist = d;
                nearestLizX = l.x + l.width / 2;
                nearestLizY = l.y + l.height / 2;
              }
            }

            if (distToPlayer < 82) {
              const awayAng = Math.atan2(item.y - pyMid, item.x - pxMid);
              item.flyTargetVx = Math.cos(awayAng) * 3.1;
              item.flyTargetVy = Math.sin(awayAng) * 2.4 - 0.6;
              item.flyDecisionTimer = 0.35;
            } else if (nearestLizDist < 105) {
              const awayAng = Math.atan2(item.y - nearestLizY, item.x - nearestLizX);
              item.flyTargetVx = Math.cos(awayAng) * 3.4;
              item.flyTargetVy = Math.sin(awayAng) * 2.6 - 0.6;
              item.flyDecisionTimer = 0.45;
            } else if ((item.flyDecisionTimer ?? 0) <= 0) {
              item.flyDecisionTimer = 0.65 + Math.random() * 1.1;
              const randAng = Math.random() * Math.PI * 2;
              item.flyTargetVx = Math.cos(randAng) * (1.4 + Math.random() * 1.5);
              item.flyTargetVy = Math.sin(randAng) * 1.3;
            }

            if (item.x < 65) item.flyTargetVx = Math.abs(item.flyTargetVx ?? 1.8) + 0.8;
            if (item.x > activeEnv.width - 65) item.flyTargetVx = -Math.abs(item.flyTargetVx ?? 1.8) - 0.8;
            if (item.y < 55) item.flyTargetVy = Math.abs(item.flyTargetVy ?? 1.0) + 0.5;
            if (item.y > activeEnv.floorY - 42) item.flyTargetVy = -Math.abs(item.flyTargetVy ?? 1.2) - 0.8;

            item.vx += ((item.flyTargetVx ?? 0) - item.vx) * 0.12;
            item.vy += ((item.flyTargetVy ?? 0) - item.vy) * 0.12 + Math.sin(item.wingPhase * 0.5) * 0.16;
            item.x += item.vx;
            item.y += item.vy;
            item.rotation = item.vx * 0.12;

            // Keep batfly out of solid blocks
            for (const plat of activeEnv.platforms) {
              if (plat.type === 'wall' || plat.type === 'shelter' || plat.h >= 30) {
                if (item.x > plat.x - 8 && item.x < plat.x + plat.w + 8 && item.y > plat.y - 8 && item.y < plat.y + plat.h + 8) {
                  if (item.y < plat.y + 12) {
                    item.y = plat.y - 10;
                    item.vy = -1.6;
                    item.flyTargetVy = -1.4;
                  } else {
                    const centerPlatX = plat.x + plat.w / 2;
                    item.vx = item.x < centerPlatX ? -2.2 : 2.2;
                    item.flyTargetVx = item.vx;
                    item.x += item.vx * 2;
                  }
                }
              }
            }
          }

          if (item.x < 18) { item.x = 18; item.vx = Math.abs(item.vx); }
          if (item.x > activeEnv.width - 18) { item.x = activeEnv.width - 18; item.vx = -Math.abs(item.vx); }
          if (item.y < 24) { item.y = 24; item.vy = Math.abs(item.vy); }
          if (item.y >= activeEnv.floorY - 5) {
            item.y = activeEnv.floorY - 5;
            item.vy = (item.flyStunTimer ?? 0) > 0 ? 0 : -1.5;
            item.vx *= 0.8;
          }
          continue;
        }

        // Performance optimization: resting items skip expensive physics calculations
        if (item.sleeping) {
          continue;
        }

        const isSpearItem = item.type === 'spear' || item.type === 'explosive_spear';

        // Aerodynamics and gravity during flight
        if (item.isAirborne) {
          if (isSpearItem) {
            item.vy += 0.08;
            item.vx *= 0.998;
            item.rotation = Math.atan2(item.vy, item.vx);
          } else if (item.type === 'rock' || item.type === 'cherrybomb' || item.type === 'pearl') {
            item.vy += 0.22;
            item.vx *= 0.995;
            item.rotation += item.vx * 0.08;
          } else {
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

        // Airborne weapon hit test against Batflies, Lizards, Players, and Walls
        if (item.isAirborne) {
          // 0. Check collision with Batflies in flight (Rock stuns, Spear knocks/kills, Cherrybomb detonates)
          let hitBatfly = false;
          if (item.type === 'rock' || isSpearItem || item.type === 'cherrybomb') {
            for (const other of items) {
              if (other === item || other.type !== 'batfly' || other.isHeld) continue;
              const bDist = Math.hypot(item.x - other.x, item.y - other.y);
              if (bDist < 28) {
                hitBatfly = true;
                if (item.type === 'cherrybomb') {
                  detonateExplosion(item.x, item.y, 130, 0.45, 4.5, 'cherrybomb', item.thrownBy);
                  itemsToRemove.add(item.id);
                } else if (item.type === 'rock') {
                  other.flyStunTimer = 5.0;
                  other.vx = item.vx * 0.18;
                  other.vy = 1.8;
                  item.isAirborne = false;
                  item.vx = -item.vx * 0.35;
                  item.vy = -1.6;
                  soundEngine.playHit('rock');
                  spawnSparks(other.x, other.y, 6, ['#e2e8f0', '#94a3b8'], 3.0);
                  setLastAction('🪨 Ви збили Муху-кажана каменем! Підбирайте [Z/E]!');
                } else {
                  other.flyAlive = false;
                  other.flyStunTimer = 0;
                  other.sleeping = false;
                  other.vx = item.vx * 0.25;
                  other.vy = 2.0;
                  soundEngine.playHit(item.type === 'explosive_spear' ? 'explosive_spear' : 'spear');
                  if (item.type === 'explosive_spear') {
                    item.explosiveArmed = true;
                    item.fuseTimer = 0.25;
                  }
                  setLastAction('🦇 Спис збив Муху-кажана!');
                }
                break;
              }
            }
          }
          if (hitBatfly && itemsToRemove.has(item.id)) continue;

          // 1. Check collision with ALL Pink Lizards currently in this room
          let hitAnyLizard = false;
          for (const lizEntry of activeRoomLizards) {
            const targetLiz = lizEntry.lizard;
            if (targetLiz.state === 'dead' || targetLiz.pipeTransit) continue;
            const lizDist = Math.hypot(item.x - (targetLiz.x + targetLiz.width / 2), item.y - (targetLiz.y + targetLiz.height / 2));
            if (lizDist < 36) {
              hitAnyLizard = true;
              if (item.type === 'berry' || item.type === 'pearl') {
                item.isAirborne = false;
                item.vx = -item.vx * 0.28;
                item.vy = -1.6;
                if (item.type === 'pearl') soundEngine.playPearlChime();
                else soundEngine.playPickup();
                break;
              }
              if (item.type === 'cherrybomb') {
                detonateExplosion(item.x, item.y, 130, 0.45, 4.5, 'cherrybomb', item.thrownBy);
                itemsToRemove.add(item.id);
                break;
              }
              const cfg = charConfigRef.current;
              const kbVx = item.vx * 0.14;
              const kbVy = -2.2;
              if (isSpearItem) {
                const isExpl = item.type === 'explosive_spear';
                const dmg = Math.round((isExpl ? 0.85 : 1.0) * cfg.outgoingDamageMult * 100) / 100;
                const stun = roundToOneDecimal((isExpl ? 2.0 : 2.5) * cfg.outgoingStunMult);
                soundEngine.playHit(isExpl ? 'explosive_spear' : 'spear');
                if (isWorldAuthority()) {
                  targetLiz.takeDamage(dmg, stun);
                  targetLiz.vx += kbVx;
                  targetLiz.vy += kbVy;
                  sendAuthoritativeLizardsSync();
                } else {
                  webRTCManager.broadcastPacket({
                    type: 'LIZARD_HIT',
                    senderId: webRTCManager.localPlayerId,
                    lizardId: targetLiz.id,
                    room: activeLoc.id,
                    weaponType: isExpl ? 'explosive_spear' : 'spear',
                    damage: dmg,
                    stunDuration: stun,
                    knockbackVx: kbVx,
                    knockbackVy: kbVy
                  });
                }
                item.isAirborne = false;
                item.isStuck = true;
                item.stuckTarget = 'lizard';
                item.stuckLizardId = targetLiz.id;
                item.stuckOffsetX = (targetLiz.facingRight ? -1 : 1) * 8;
                item.stuckOffsetY = (Math.random() - 0.5) * 6;
                item.stuckAngle = item.rotation;
                item.vx = 0;
                item.vy = 0;
                if (isExpl) {
                  item.explosiveArmed = true;
                  item.fuseTimer = 0.28;
                  setLastAction(`🧨 Вибуховий спис упʼявся в ящера — детонація!`);
                } else {
                  setLastAction(`Спис влучив у ящера (-${dmg.toFixed(1)} HP, стан ${stun.toFixed(1)}с)!`);
                }
              } else {
                const dmg = Math.round(0.2 * cfg.outgoingDamageMult * 100) / 100;
                const stun = roundToOneDecimal(1.8 * cfg.outgoingStunMult);
                soundEngine.playHit('rock');
                if (isWorldAuthority()) {
                  targetLiz.takeDamage(dmg, stun);
                  targetLiz.vx += kbVx * 0.6;
                  targetLiz.vy += kbVy * 0.6;
                  sendAuthoritativeLizardsSync();
                } else {
                  webRTCManager.broadcastPacket({
                    type: 'LIZARD_HIT',
                    senderId: webRTCManager.localPlayerId,
                    lizardId: targetLiz.id,
                    room: activeLoc.id,
                    weaponType: 'rock',
                    damage: dmg,
                    stunDuration: stun,
                    knockbackVx: kbVx * 0.6,
                    knockbackVy: kbVy * 0.6
                  });
                }
                item.isAirborne = false;
                item.vx = -item.vx * 0.35;
                item.vy = -1.8;
                setLastAction(`Камінь влучив у ящера! Стан ${stun.toFixed(1)}с (-${dmg.toFixed(2)} HP)`);
              }
              break;
            }
          }
          if (hitAnyLizard) continue;

          // 2. Check collision with Player
          const playerDist = Math.hypot(item.x - (player.x + player.width / 2), item.y - (player.y + player.height / 2));
          if (playerDist < 26 && item.thrownBy !== 'player') {
            if (item.type === 'berry' || item.type === 'pearl') {
              item.isAirborne = false;
              item.vx = -item.vx * 0.28;
              item.vy = -1.6;
              if (item.type === 'pearl') soundEngine.playPearlChime();
              else soundEngine.playPickup();
              continue;
            }
            if (item.type === 'cherrybomb') {
              detonateExplosion(item.x, item.y, 130, 0.45, 4.5, 'cherrybomb', item.thrownBy);
              itemsToRemove.add(item.id);
              continue;
            }
            applyHit(player, item.type as WeaponItemType);
            if (isSpearItem) {
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
              if (item.type === 'explosive_spear') {
                item.explosiveArmed = true;
                item.fuseTimer = 0.28;
              }
            } else {
              item.isAirborne = false;
              item.vx = -item.vx * 0.35;
              item.vy = -1.8;
            }
            continue;
          }

          // 3. Check collision with Remote Players
          if (item.isAirborne && item.thrownBy === 'player') {
            for (const rp of webRTCManager.remotePlayers.values()) {
              if (rp.room !== activeLoc.id || rp.state === 'dead') continue;
              const remoteDist = Math.hypot(item.x - (rp.x + 12), item.y - (rp.y + 19));
              if (remoteDist < 26) {
                if (item.type === 'berry' || item.type === 'pearl') {
                  item.isAirborne = false;
                  item.vx = -item.vx * 0.28;
                  item.vy = -1.6;
                  if (item.type === 'pearl') soundEngine.playPearlChime();
                  else soundEngine.playPickup();
                  continue;
                }
                if (item.type === 'cherrybomb') {
                  detonateExplosion(item.x, item.y, 130, 0.45, 4.5, 'cherrybomb', item.thrownBy);
                  itemsToRemove.add(item.id);
                  break;
                }
                const cfg = charConfigRef.current;
                distributedSimulation.registerClientSideHit(
                  rp.id,
                  item.type as WeaponItemType,
                  item.x,
                  item.y,
                  cfg.outgoingDamageMult,
                  cfg.outgoingStunMult
                );
                pvpCombatTimerRef.current = 60.0;
                pvpTargetPeerIdRef.current = rp.id;
                musicManager.playCategory('battle');
                if (isSpearItem) {
                  item.isAirborne = false;
                  item.isStuck = true;
                  item.vx = 0;
                  item.vy = 0;
                  if (item.type === 'explosive_spear') {
                    item.explosiveArmed = true;
                    item.fuseTimer = 0.28;
                  }
                } else {
                  item.isAirborne = false;
                  item.vx = -item.vx * 0.35;
                  item.vy = -1.8;
                }
                setLastAction(`ВЛУЧАННЯ! Ваш ${getItemLabel(item.type).toLowerCase()} вразив гравця ${rp.name}!`);
                break;
              }
            }
            if (itemsToRemove.has(item.id)) continue;
          }

          // 4. Airborne solid wall/monolith/metal collision (Ricochet & Wall-Stuck Spear Ledges!)
          let hitSolidWall = false;
          for (const plat of activeEnv.platforms) {
            if (plat.type === 'wall' || plat.type === 'shelter' || plat.type === 'metal' || plat.h >= 30) {
              if (item.x >= plat.x && item.x <= plat.x + plat.w && item.y >= plat.y && item.y <= plat.y + plat.h) {
                if (item.type === 'cherrybomb') {
                  detonateExplosion(item.x, item.y, 130, 0.45, 4.5, 'cherrybomb', item.thrownBy);
                  itemsToRemove.add(item.id);
                  hitSolidWall = true;
                  break;
                }
                if (isSpearItem) {
                  if (plat.type === 'metal') {
                    // Metal deflects spears with bright sparks & metallic clang!
                    const prevVx = item.vx;
                    item.vx = -prevVx * 0.58;
                    item.vy = -2.8;
                    item.isAirborne = false;
                    item.rotation = Math.atan2(item.vy, item.vx);
                    item.x = prevVx >= 0 ? plat.x - 4 : plat.x + plat.w + 4;
                    soundEngine.playRicochet();
                    spawnSparks(item.x, item.y, 12, ['#fde68a', '#fbbf24', '#ffffff'], 4.5);
                    if (item.type === 'explosive_spear') {
                      item.explosiveArmed = true;
                      item.fuseTimer = 0.35;
                    } else {
                      setLastAction('⚡ Спис зрикошетив від металу з іскрами!');
                    }
                  } else {
                    // Concrete/Wall/Shelter embeds horizontally so Slugcat can climb onto it!
                    const hitFromLeft = item.vx >= 0;
                    item.isStuck = true;
                    item.isAirborne = false;
                    item.sleeping = true;
                    item.stuckWallNormal = hitFromLeft ? -1 : 1;
                    item.x = hitFromLeft ? plat.x - 14 : plat.x + plat.w + 14;
                    item.rotation = hitFromLeft ? 0 : Math.PI;
                    item.vx = 0;
                    item.vy = 0;
                    soundEngine.playHit(item.type === 'explosive_spear' ? 'explosive_spear' : 'spear');
                    if (item.type === 'explosive_spear') {
                      item.explosiveArmed = true;
                      item.fuseTimer = 0.35;
                      setLastAction('🧨 Вибуховий спис встромився у стіну — вибух!');
                    } else {
                      setLastAction('🪜 Спис застряг у стіні — на нього можна залізти!');
                    }
                  }
                } else {
                  item.isAirborne = false;
                  item.vx = -item.vx * 0.38;
                  item.vy = -1.6;
                  item.x = item.vx <= 0 ? plat.x - 2 : plat.x + plat.w + 2;
                  if (item.type === 'rock') soundEngine.playHit('rock');
                  else if (item.type === 'pearl') soundEngine.playPearlChime();
                }
                hitSolidWall = true;
                break;
              }
            }
          }
          if (hitSolidWall) continue;
        }

        // Dynamic room boundary collisions:
        if (item.type === 'cherrybomb' && item.isAirborne && (item.x <= 20 || item.x >= activeEnv.width - 20)) {
          detonateExplosion(item.x, item.y, 130, 0.45, 4.5, 'cherrybomb', item.thrownBy);
          itemsToRemove.add(item.id);
          continue;
        }
        if (isSpearItem && item.isAirborne) {
          if (item.x <= 20 && item.vx < 0) {
            item.isStuck = true;
            item.isAirborne = false;
            item.sleeping = true;
            item.stuckWallNormal = 1;
            item.x = 24;
            item.vx = 0;
            item.vy = 0;
            item.rotation = Math.PI;
            soundEngine.playHit(item.type === 'explosive_spear' ? 'explosive_spear' : 'spear');
            if (item.type === 'explosive_spear') {
              item.explosiveArmed = true;
              item.fuseTimer = 0.35;
            } else {
              setLastAction('🪜 Спис застряг у стіні — на нього можна залізти!');
            }
            continue;
          }
          if (item.x >= activeEnv.width - 20 && item.vx > 0) {
            item.isStuck = true;
            item.isAirborne = false;
            item.sleeping = true;
            item.stuckWallNormal = -1;
            item.x = activeEnv.width - 24;
            item.vx = 0;
            item.vy = 0;
            item.rotation = 0;
            soundEngine.playHit(item.type === 'explosive_spear' ? 'explosive_spear' : 'spear');
            if (item.type === 'explosive_spear') {
              item.explosiveArmed = true;
              item.fuseTimer = 0.35;
            } else {
              setLastAction('🪜 Спис застряг у стіні — на нього можна залізти!');
            }
            continue;
          }
        }

        if (item.x < 15) { item.x = 15; item.vx = -item.vx * 0.4; }
        if (item.x > activeEnv.width - 15) { item.x = activeEnv.width - 15; item.vx = -item.vx * 0.4; }

        // Dynamic room floor collision
        const itemFloorY = activeEnv.floorY - 2;
        if (item.y >= itemFloorY) {
          item.y = itemFloorY;
          if (item.type === 'cherrybomb' && item.isAirborne) {
            detonateExplosion(item.x, item.y, 130, 0.45, 4.5, 'cherrybomb', item.thrownBy);
            itemsToRemove.add(item.id);
            continue;
          }
          if (isSpearItem && item.isAirborne && item.vy > 4.5) {
            item.isStuck = true;
            item.isAirborne = false;
            item.sleeping = true;
            item.vx = 0;
            item.vy = 0;
            item.rotation = Math.PI / 3;
            soundEngine.playHit(item.type === 'explosive_spear' ? 'explosive_spear' : 'spear');
            if (item.type === 'explosive_spear') {
              item.explosiveArmed = true;
              item.fuseTimer = 0.35;
            }
          } else {
            if (item.type === 'pearl' && Math.abs(item.vy) > 1.8) {
              soundEngine.playPearlChime();
            }
            item.vy = 0;
            item.vx *= 0.8;
            item.isAirborne = false;
            if (Math.abs(item.vx) < 0.1) {
              item.vx = 0;
              item.sleeping = true;
            }
          }
        }

        // Platform top landing
        if (!item.isAirborne || isSpearItem) {
          for (const plat of activeEnv.platforms) {
            if (item.x >= plat.x && item.x <= plat.x + plat.w) {
              const wasAbove = (item.y - item.vy) <= plat.y + 4;
              const isAtTop = item.y >= plat.y && item.y <= plat.y + 8;
              if (wasAbove && isAtTop && item.vy >= 0) {
                item.y = plat.y - 2;
                if (item.type === 'cherrybomb' && item.isAirborne) {
                  detonateExplosion(item.x, item.y, 130, 0.45, 4.5, 'cherrybomb', item.thrownBy);
                  itemsToRemove.add(item.id);
                  break;
                }
                if (isSpearItem && plat.type === 'metal' && (item.isAirborne || Math.abs(item.vy) > 1.6)) {
                  item.vy = -Math.max(2.2, Math.abs(item.vy) * 0.5);
                  item.vx *= 0.82;
                  item.isAirborne = false;
                  soundEngine.playRicochet();
                  spawnSparks(item.x, item.y, 6, ['#fde68a', '#fbbf24', '#ffffff'], 3.2);
                  break;
                }
                if ((item.type === 'rock' || item.type === 'berry' || item.type === 'pearl') && Math.abs(item.vy) > 2) {
                  item.vy = -item.vy * (item.type === 'pearl' ? 0.52 : item.type === 'berry' ? 0.25 : 0.4);
                  item.vx *= 0.65;
                  if (item.type === 'rock') soundEngine.playHit('rock');
                  else if (item.type === 'pearl') soundEngine.playPearlChime();
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
            }
          }
        }
      }

      if (itemsToRemove.size > 0) {
        for (let idx = items.length - 1; idx >= 0; idx--) {
          if (itemsToRemove.has(items[idx].id)) {
            items.splice(idx, 1);
          }
        }
        syncRoomItemsCache();
        if (isWorldAuthority() && webRTCManager.remotePlayers.size > 0) {
          sendAuthoritativeItemsSync();
        }
      }

      // ---------------- Update Food Eating Logic (Berries & Batflies, 3.5s) ----------------
      if (isEating) {
        if (player.state !== 'normal' || !player.heldItem || !isEdibleItemType(player.heldItem.type)) {
          isEating = false;
          eatingTimer = 0;
          setIsEating(false);
          setEatingProgress(0);
          if (!ctrl.down) {
            player.crouching = false;
          }
        } else {
          eatingTimer += delta;
          nibbleTimer += delta;
          if (nibbleTimer >= 0.45) {
            nibbleTimer = 0;
            if (!isSoundMutedRef.current) soundEngine.playEatNibble();
          }

          eatingUiThrottleTimer += delta;
          if (eatingUiThrottleTimer >= 0.12) {
            eatingUiThrottleTimer = 0;
            const progressPct = Math.min(100, (eatingTimer / 3.5) * 100);
            setEatingProgress(progressPct);
          }

          player.head.y += Math.sin(t * 14) * 0.5;
          player.earSway += Math.sin(t * 12) * 0.6;

          if (eatingTimer >= 3.5) {
            isEating = false;
            eatingTimer = 0;
            setIsEating(false);
            setEatingProgress(0);
            player.crouching = false;

            const consumedItem = player.heldItem;
            const wasBatfly = consumedItem?.type === 'batfly';
            player.heldItem = null;
            setHeldItemType(null);
            const bIdx = items.indexOf(consumedItem);
            if (bIdx >= 0) {
              items.splice(bIdx, 1);
            }
            syncRoomItemsCache();

            if (consumedItem) {
              webRTCManager.broadcastPacket({
                type: 'ITEM_CONSUMED',
                senderId: webRTCManager.localPlayerId,
                itemId: consumedItem.id,
                room: activeLoc.id
              });
            }

            const cfg = charConfigRef.current;
            const nextFood = Math.min(cfg.maxFood, foodCountRef.current + 1);
            foodCountRef.current = nextFood;
            setFoodCount(nextFood);
            setJustFilledIndex(nextFood - 1);
            setTimeout(() => setJustFilledIndex(null), 800);

            if (!isSoundMutedRef.current) soundEngine.playEatComplete();
            setLastAction(
              `${wasBatfly ? "🦇 Муху-кажана з'їдено!" : "Ягоду з'їдено!"} +1 ячейка їжі (${nextFood} / ${cfg.maxFood}: ${Math.min(cfg.requiredFood, nextFood)} обов'язк. + ${Math.max(0, nextFood - cfg.requiredFood)} додатк.)`
            );
          }
        }
      }

      // ---------------- Procedural Skeleton Physics (Player) ----------------
      updateSkeleton(player, t, delta);

      // ---------------- Procedural Skeleton Physics (Remote Peers) ----------------
      for (const rp of webRTCManager.remotePlayers.values()) {
        if (rp.room === activeLoc.id) {
          updateSkeleton(rp, t, delta);
        }
      }

      // Throttled WebRTC P2P Player State Broadcast (25 Hz)
      if (webRTCManager.connectionStatus === 'connected' && t - lastBroadcastTime > 0.04) {
        lastBroadcastTime = t;
        webRTCManager.broadcastPlayerState({
          characterId: charConfigRef.current.id,
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
          room: activeLoc.id,
          carriedBy: null,
          carryingPeerId: carriedPlayerIdRef.current,
          head: player.head,
          chest: player.chest,
          hips: player.hips,
          tail: player.tail
        });
      }

      // Authoritative item synchronization from room host to peers (every 1.0s)
      if (isWorldAuthority() && webRTCManager.remotePlayers.size > 0 && t - lastItemsSyncTime > 1.0) {
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
        let pearls = 0;
        let batflies = 0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i].type;
          if (it === 'spear' || it === 'explosive_spear') spears++;
          else if (it === 'rock' || it === 'cherrybomb') rocks++;
          else if (it === 'berry') berries++;
          else if (it === 'pearl') pearls++;
          else if (it === 'batfly') batflies++;
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
          roomLizards: activeRoomLizards.map(e => ({
            id: e.id,
            x: Math.round(e.lizard.x + e.lizard.width / 2),
            y: Math.round(e.lizard.y + e.lizard.height / 2)
          })),

          spearsCount: spears,
          rocksCount: rocks,
          berriesCount: berries,
          pearlsCount: pearls,
          batfliesCount: batflies,
          foodCount: foodCountRef.current,
          isEating,
          eatingProgress: Math.min(100, Math.round((eatingTimer / 3.5) * 100)),
          fps: currentFps,
          particles: sparks.length,
        });

        setIsDead(player.state === 'dead');
      }

      // ---------------- Dynamic Camera Tracking & Zoom ----------------
      const currentZoom = zoomRef.current;
      const viewW = CANVAS_WIDTH / currentZoom;
      const viewH = CANVAS_HEIGHT / currentZoom;

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
          if (specPeer.room && specPeer.room !== activeLoc.id) {
            const loc = getLocationById(specPeer.room);
            if (loc) {
              transitionToLocation(loc, specPeer.x, specPeer.y);
            }
          }
        }
      }

      const targetCamX = (focusX + leadX) - viewW / 2;
      const targetCamY = focusY - viewH / 2;

      const maxCamX = Math.max(0, activeEnv.width - viewW);
      const maxCamY = Math.max(0, activeEnv.height - viewH);
      const clampedCamX = Math.max(0, Math.min(maxCamX, targetCamX));
      const clampedCamY = Math.max(0, Math.min(maxCamY, targetCamY));

      camera.x += (clampedCamX - camera.x) * 0.12;
      camera.y += (clampedCamY - camera.y) * 0.12;

      const shakeDecay = cameraShakeTimer > 0 ? Math.min(1, cameraShakeTimer / 0.35) : 0;
      const shakeOffsetX = shakeDecay > 0 ? (Math.random() - 0.5) * 2 * cameraShakeIntensity * shakeDecay : 0;
      const shakeOffsetY = shakeDecay > 0 ? (Math.random() - 0.5) * 2 * cameraShakeIntensity * shakeDecay : 0;

      // ---------------- Drawing & Rendering ----------------
      const gfx = settingsRef.current.graphics;
      const resScale = gfx.resolutionScale || 1;
      const targetCanvasW = Math.round(CANVAS_WIDTH * resScale);
      const targetCanvasH = Math.round(CANVAS_HEIGHT * resScale);
      if (canvas.width !== targetCanvasW || canvas.height !== targetCanvasH) {
        canvas.width = targetCanvasW;
        canvas.height = targetCanvasH;
      }
      ctx.setTransform(resScale, 0, 0, resScale, 0, 0);

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Deep dark void background
      ctx.fillStyle = '#120f18';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Apply Camera Zoom & Translation
      ctx.save();
      ctx.scale(currentZoom, currentZoom);
      ctx.translate(-camera.x + shakeOffsetX, -camera.y + shakeOffsetY);

      // 1. Storm sky background and depth fog gradients
      ctx.fillStyle = '#1c1822';
      ctx.fillRect(0, 0, activeEnv.width, activeEnv.height);

      // Distant horizontal drooping wires
      ctx.strokeStyle = '#2b2434';
      ctx.lineWidth = 1.0;
      for (let yLevel = 60; yLevel < activeEnv.height - 120; yLevel += 90) {
        ctx.beginPath();
        ctx.moveTo(0, yLevel);
        ctx.quadraticCurveTo(activeEnv.width / 2, yLevel + 45, activeEnv.width, yLevel - 15);
        ctx.stroke();
      }

      // Distant industrial girders silhouetted
      ctx.fillStyle = '#221d2a';
      ctx.fillRect(100, 80, 50, activeEnv.height - 80);
      ctx.fillRect(Math.min(700, activeEnv.width - 140), 40, 60, activeEnv.height - 40);

      // Faint background block drawings
      ctx.fillStyle = '#262030';
      ctx.fillRect(360, 200, 280, 100);
      ctx.strokeStyle = '#32293e';
      ctx.lineWidth = 4;
      ctx.strokeRect(360, 200, 280, 100);

      // 2. Render Climbing Poles
      activeEnv.poles.forEach((pole) => {
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
      activeEnv.platforms.forEach((plat) => {
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
          ctx.quadraticCurveTo(plat.x + plat.w / 2, plat.y + 20, plat.x + plat.w, plat.y);
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
          ctx.fillStyle = '#17141f';
          ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

          ctx.strokeStyle = '#2e2536';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

          ctx.fillStyle = '#2d1c17';
          for (let py = plat.y + 12; py < plat.y + plat.h - 10; py += 36) {
            ctx.fillRect(plat.x + 3, py, Math.max(8, plat.w - 6), 18);
          }

          ctx.fillStyle = '#4a2c22';
          for (let ry = plat.y + 8; ry < plat.y + plat.h; ry += 24) {
            ctx.beginPath();
            ctx.arc(plat.x + 5, ry, 2, 0, Math.PI * 2);
            ctx.arc(plat.x + plat.w - 5, ry, 2, 0, Math.PI * 2);
            ctx.fill();
          }

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
          ctx.fillStyle = '#14111d';
          ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

          ctx.strokeStyle = '#382a3c';
          ctx.lineWidth = 3;
          ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

          ctx.fillStyle = '#1d1726';
          ctx.fillRect(plat.x + 6, plat.y + 6, plat.w - 12, plat.h - 12);

          ctx.fillStyle = '#2e1c24';
          ctx.fillRect(plat.x + 8, plat.y + 8, 14, plat.h - 16);
          ctx.fillRect(plat.x + plat.w - 22, plat.y + 8, 14, plat.h - 16);

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

      // 3.1 Draw Transit Shortcut Pipes (Unified clean portals & conduits)
      activeEnv.transitPipes.forEach((pipe, idx) => {
        ctx.save();
        const isInterRoom = !!pipe.targetLocationId;
        const isShelter = !!pipe.isShelterPipe;
        const isDen = !!pipe.isDenPipe;

        const drawPipePortal = (x: number, y: number, shelter: boolean, targetX: number, targetY: number, den?: boolean) => {
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = shelter ? '#0284c7' : (den ? '#ec4899' : '#047857');
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#030712';
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();

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
          ctx.strokeStyle = isShelter ? '#0c4a6e' : (isDen ? '#831843' : '#064e3b');
          ctx.lineWidth = 16;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pipe.startX, pipe.startY);
          ctx.lineTo(pipe.endX, pipe.endY);
          ctx.stroke();

          ctx.strokeStyle = isShelter ? '#0284c7' : (isDen ? '#ec4899' : '#047857');
          ctx.lineWidth = 8;
          ctx.stroke();

          drawPipePortal(pipe.startX, pipe.startY, isShelter, pipe.endX, pipe.endY, isDen);

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
          const signX = Math.max(10, Math.min(activeEnv.width - signW - 10, pipe.startX - signW / 2));
          const signY = Math.max(12, pipe.startY - 26);

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

          ctx.fillStyle = isNearby
            ? '#ffffff'
            : (isShelter ? '#7dd3fc' : (isDen ? '#fbcfe8' : '#a7f3d0'));
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(signText, signX + signW / 2, signY + signH / 2);
        }

        ctx.restore();
      });

      // 4. Glow Grass (Worm Grass)
      if (gfx.particles) {
        const groundFloorY = activeEnv.floorY;
        ctx.strokeStyle = '#12411e';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        for (let i = 0; i < activeEnv.wormGrasses.length; i++) {
          const grass = activeEnv.wormGrasses[i];
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
        for (let i = 0; i < activeEnv.wormGrasses.length; i++) {
          const grass = activeEnv.wormGrasses[i];
          const sway = Math.sin(t * grass.swaySpeed + grass.phase) * 6;
          ctx.moveTo(grass.x + sway + 2.5, groundFloorY - grass.height);
          ctx.arc(grass.x + sway, groundFloorY - grass.height, 2.5, 0, Math.PI * 2);
        }
        ctx.fill();
      }

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
      if (activeEnv.denData && !activeLoc.isShelterRoom) {
        const dData = activeEnv.denData;
        ctx.save();
        ctx.fillStyle = '#0f0514';
        ctx.beginPath();
        ctx.roundRect(dData.x, dData.y, dData.w, dData.h, 14);
        ctx.fill();

        ctx.fillStyle = '#2d0a35';
        for (let i = 0; i < 5; i++) {
          const toothX = dData.x + 8 + i * (dData.w / 5);
          ctx.beginPath();
          ctx.moveTo(toothX - 6, dData.y);
          ctx.lineTo(toothX, dData.y + 16);
          ctx.lineTo(toothX + 6, dData.y);
          ctx.closePath();
          ctx.fill();
        }

        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        if (gfx.glowEffects) {
          const glowRad = 22 + Math.sin(t * 3) * 5;
          const glowGrad = ctx.createRadialGradient(
            dData.x + dData.w / 2, dData.y + dData.h / 2, 4,
            dData.x + dData.w / 2, dData.y + dData.h / 2, glowRad
          );
          glowGrad.addColorStop(0, 'rgba(236, 72, 153, 0.45)');
          glowGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(dData.x + dData.w / 2, dData.y + dData.h / 2, glowRad, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#f472b6';
        ctx.textAlign = 'center';
        ctx.fillText('⛊ ЛІГВО ЯЩЕРА', dData.x + dData.w / 2, dData.y - 6);
        ctx.restore();
      }

      for (const entry of activeRoomLizards) {
        entry.lizard.render(ctx, t);
      }

      // 7. Draw Player OR Traveling Slugcat Silhouette in Pipe
      if (pipeTransit) {
        const p = Math.min(1, pipeTransit.progress);
        const curX = pipeTransit.startX + (pipeTransit.endX - pipeTransit.startX) * p;
        const curY = pipeTransit.startY + (pipeTransit.endY - pipeTransit.startY) * p;
        const transitAngle = Math.atan2(pipeTransit.endY - pipeTransit.startY, pipeTransit.endX - pipeTransit.startX);

        ctx.save();
        ctx.fillStyle = charConfigRef.current.bodyColorTop;
        if (gfx.glowEffects) {
          ctx.shadowColor = pipeTransit.isShelter ? '#38bdf8' : '#34d399';
          ctx.shadowBlur = 12;
        }
        ctx.beginPath();
        ctx.ellipse(curX, curY, 11, 7, transitAngle, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        renderSlugcatCharacter(ctx, player, t, true, webRTCManager.localPlayerName);
      }

      // 7.05 Draw Shelter Hibernation Sleep Meter and In-World Prompts
      if ((activeLoc.isShelterRoom || inShelterChamberRef.current) && !pipeTransit && !isHibernatingRef.current) {
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
      for (const rp of webRTCManager.remotePlayers.values()) {
        if (rp.room === activeLoc.id) {
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

      // 8.1 Draw explosion shockwaves and metallic ricochet/explosion sparks
      if (shockwaves.length > 0 || sparks.length > 0) {
        ctx.save();
        for (const sw of shockwaves) {
          const alpha = Math.max(0, sw.life / sw.maxLife);
          ctx.strokeStyle = sw.color;
          ctx.globalAlpha = alpha * 0.85;
          ctx.lineWidth = 3.5 * alpha + 1;
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = sw.color;
          ctx.globalAlpha = alpha * 0.18;
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius * 0.75, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const sp of sparks) {
          const alpha = Math.max(0, sp.life / sp.maxLife);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = sp.color;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Lethal Downpour storm visual rendering on canvas
      if (localStormSeconds > 0) {
        const intensity = Math.min(1.0, localStormSeconds / 25.0);
        ctx.save();
        ctx.fillStyle = `rgba(3, 7, 18, ${Math.min(0.82, 0.15 + intensity * 0.67)})`;
        ctx.fillRect(camera.x - 20, camera.y - 20, viewW + 40, viewH + 40);

        if (gfx.rainEffects) {
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

          if (gfx.particles) {
            ctx.fillStyle = `rgba(224, 242, 254, ${0.15 + intensity * 0.45})`;
            for (let s = 0; s < 30; s++) {
              const sx = camera.x + ((s * 47 + t * 45) % viewW);
              const sy = activeEnv.floorY + 2 + Math.sin(t * 8 + s) * 6;
              ctx.beginPath();
              ctx.arc(sx, sy, 1.2 + (s % 3) * 0.6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        ctx.restore();
      }

      // Restore camera zoom & position
      ctx.restore();

      // Full screen-space flash overlay for lightning storm
      if (isFlashingRef.current && gfx.rainEffects) {
        ctx.fillStyle = 'rgba(235, 240, 255, 0.45)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      syncRoomItemsCache();
      cancelAnimationFrame(animId);
      resetControlsActionRef.current = null;
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', resetAllControls);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unregisterPeerList();
      unregisterStatus();
      unregisterHit();
      unregisterPackets();
      clearInterval(cycleInterval);
    };
  }, []);

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

  // Draw Items (Spears, Explosive Spears, Rocks, Cherrybombs, Pearls, Berries, Batflies)
  function drawWorldItem(ctx: CanvasRenderingContext2D, item: WorldItem) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);

    if (item.type === 'spear' || item.type === 'explosive_spear') {
      const isExplosive = item.type === 'explosive_spear';
      const isWallClimbingRung = item.isStuck && !item.stuckTarget && Math.abs(Math.cos(item.rotation)) > 0.75;

      // Subtle climbable ledge cue for wall-stuck horizontal spears
      if (isWallClimbingRung) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.32)';
        ctx.lineWidth = 7.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.lineTo(22, 0);
        ctx.stroke();
      }

      // Shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(-22, 2);
      ctx.lineTo(22, 2);
      ctx.stroke();

      // Main metal shaft
      ctx.strokeStyle = isExplosive ? '#475569' : '#64748b';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(22, 0);
      ctx.stroke();

      // Sharp piercing blade tip
      ctx.fillStyle = isExplosive ? '#fca5a5' : '#cbd5e1';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(22, -3.2);
      ctx.lineTo(28, 0);
      ctx.lineTo(22, 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Handle wrap
      ctx.strokeStyle = isExplosive ? '#991b1b' : '#b45309';
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();

      if (isExplosive) {
        // Red explosive cloth charge tied near spearhead
        ctx.fillStyle = item.explosiveArmed && Math.floor(performance.now() / 60) % 2 === 0 ? '#fef08a' : '#dc2626';
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(10, -4.2, 10, 8.4, 2.5);
        ctx.fill();
        ctx.stroke();

        // Sparking tip glow
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.arc(15, 0, item.explosiveArmed ? 3.2 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Tiny metallic glint
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(16, -1, 4, 1.2);
      }

    } else if (item.type === 'rock') {
      // Natural textured rubble stone / pebble
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();

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

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(2, -4);
      ctx.stroke();

    } else if (item.type === 'cherrybomb') {
      // Rain World Cherrybomb cluster (3 crimson spheres on branching stems)
      const isFlickering = item.explosiveArmed && Math.floor(performance.now() / 55) % 2 === 0;
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(-4, 1);
      ctx.moveTo(0, -8);
      ctx.lineTo(4, 1);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 4);
      ctx.stroke();

      const pods = [
        { x: -4.2, y: 1.5, r: 4.0 },
        { x: 4.2, y: 1.5, r: 4.0 },
        { x: 0, y: 4.5, r: 4.2 },
      ];
      for (const pod of pods) {
        ctx.fillStyle = isFlickering ? '#fef08a' : '#ef4444';
        ctx.strokeStyle = '#450a0a';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(pod.x, pod.y, pod.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fecaca';
        ctx.beginPath();
        ctx.arc(pod.x - 1.2, pod.y - 1.2, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (item.type === 'pearl') {
      // Iridescent collectible Data Pearl (4 variants)
      const palettes = [
        { hi: '#ffffff', mid: '#f8fafc', rim: '#cbd5e1', glow: 'rgba(248, 250, 252, 0.35)' },
        { hi: '#fce7f3', mid: '#f472b6', rim: '#9d174d', glow: 'rgba(244, 114, 182, 0.38)' },
        { hi: '#cffafe', mid: '#22d3ee', rim: '#0e7490', glow: 'rgba(34, 211, 238, 0.38)' },
        { hi: '#fef3c7', mid: '#fbbf24', rim: '#b45309', glow: 'rgba(251, 191, 36, 0.38)' },
      ];
      const pal = palettes[(item.pearlVariant ?? 0) % palettes.length];

      ctx.fillStyle = pal.glow;
      ctx.beginPath();
      ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
      ctx.fill();

      const pGrad = ctx.createRadialGradient(-2.2, -2.5, 1, 0, 0, 6.5);
      pGrad.addColorStop(0, pal.hi);
      pGrad.addColorStop(0.55, pal.mid);
      pGrad.addColorStop(1, pal.rim);

      ctx.fillStyle = pGrad;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-2.0, -2.2, 1.7, 0, Math.PI * 2);
      ctx.fill();

    } else if (item.type === 'batfly') {
      // Rain World Batfly: tiny dark body + flapping translucent wings
      const isKnocked = item.flyAlive === false || (item.flyStunTimer ?? 0) > 0;
      const flap = isKnocked ? -0.35 : Math.sin(item.wingPhase ?? (performance.now() * 0.025)) * 0.85;

      // Left & right wings
      ctx.fillStyle = isKnocked ? 'rgba(148, 163, 184, 0.45)' : 'rgba(226, 232, 240, 0.72)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.0;

      ctx.save();
      ctx.rotate(-0.4 + flap);
      ctx.beginPath();
      ctx.ellipse(-6, -3, 6.5, 2.8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.rotate(0.4 - flap);
      ctx.beginPath();
      ctx.ellipse(6, -3, 6.5, 2.8, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Body
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.2, 5.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Tiny ears
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(-2.5, -4);
      ctx.lineTo(-4, -8);
      ctx.lineTo(-0.5, -5);
      ctx.moveTo(2.5, -4);
      ctx.lineTo(4, -8);
      ctx.lineTo(0.5, -5);
      ctx.fill();

      // Glowing eyes (dim if dead/stunned)
      ctx.fillStyle = isKnocked ? '#64748b' : '#f8fafc';
      ctx.beginPath();
      ctx.arc(-1.5, -1.5, 1.0, 0, Math.PI * 2);
      ctx.arc(1.5, -1.5, 1.0, 0, Math.PI * 2);
      ctx.fill();

    } else if (item.type === 'berry') {
      // Rain World Blue Fruit / Danglefruit (1 berry = 1 food pip, 3.5s eat time)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 5, 8, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(2, -9, 3.5, -11.5);
      ctx.stroke();

      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(1, -6, 2.5, 1.4, -0.4, 0, Math.PI * 2);
      ctx.fill();

      const berryGrad = ctx.createRadialGradient(-2, -1, 1, 0, 1, 8.5);
      berryGrad.addColorStop(0, '#7dd3fc');
      berryGrad.addColorStop(0.35, '#38bdf8');
      berryGrad.addColorStop(0.7, '#2563eb');
      berryGrad.addColorStop(1, '#1e1b4b');

      ctx.fillStyle = berryGrad;
      ctx.strokeStyle = '#1e1b4b';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      ctx.arc(0, 0, 6.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(-2.8, 2, 3.4, 0, Math.PI * 2);
      ctx.arc(2.8, 2, 3.4, 0, Math.PI * 2);
      ctx.arc(0, -1.8, 3.8, 0, Math.PI * 2);
      ctx.fill();

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

    const charColors = SLUGCAT_CHARACTERS[entity.characterId === 'monk' ? 'monk' : 'survivor'];

    // 1. Procedural Tail Chain (Optimized single-pass stroke without gradient allocations)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (Array.isArray(entity.tail) && entity.tail.length > 1) {
      const tailColor = entity.state === 'dead'
        ? (entity.characterId === 'monk' ? '#d4c36a' : '#cbd5e1')
        : charColors.bodyColorMid;
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
        grad.addColorStop(0, entity.characterId === 'monk' ? '#e5d478' : '#cbd5e1');
        grad.addColorStop(0.5, entity.characterId === 'monk' ? '#b39f49' : '#94a3b8');
        grad.addColorStop(1, entity.characterId === 'monk' ? '#7c6d2c' : '#64748b');
      } else {
        grad.addColorStop(0, charColors.bodyColorTop);
        grad.addColorStop(0.4, charColors.bodyColorMid);
        grad.addColorStop(1, charColors.bodyColorBottom);
      }
      slugGrad = grad;
    } catch {
      slugGrad = entity.state === 'dead' ? '#94a3b8' : charColors.bodyColorMid;
    }

    ctx.fillStyle = slugGrad;
    ctx.strokeStyle = entity.state === 'dead' ? '#334155' : '#0f172a';
    ctx.lineWidth = 1.3;

    // 3. Feet / Paws
    if (entity.isGrounded && entity.state !== 'dead') {
      const feetY = hipsY + (entity.crouching ? 8 : 11.5);
      ctx.fillStyle = charColors.bodyColorTop;
      ctx.strokeStyle = charColors.contourColor;
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
      ctx.strokeStyle = charColors.bodyColorTop;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(chestX - 5, chestY - 4);
      ctx.quadraticCurveTo(chestX + (dirSign * 14), chestY - 9, chestX + (dirSign * 8), chestY + 1);
      ctx.stroke();

      ctx.strokeStyle = charColors.contourColor;
      ctx.lineWidth = 1.0;
      ctx.stroke();

      // Render Held Item while climbing
      if (entity.heldItem) {
        const itemType = (typeof entity.heldItem === 'string'
          ? entity.heldItem
          : entity.heldItem?.type) as ItemType | undefined;

        if (itemType) {
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
            pearlVariant: typeof entity.heldItem === 'object' ? entity.heldItem?.pearlVariant : 0,
            flyAlive: typeof entity.heldItem === 'object' ? entity.heldItem?.flyAlive : true,
          });
        }
      }

    } else if (entity.state === 'normal') {
      const evx = Number.isFinite(entity.vx) ? entity.vx : 0;
      const evy = Number.isFinite(entity.vy) ? entity.vy : 0;
      const armSwing = Math.abs(evx) > 0.4 ? Math.sin(t * 2.0) * 4 : 0;
      ctx.strokeStyle = charColors.bodyColorTop;
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
          : entity.heldItem?.type) as ItemType | undefined;

        if (itemType) {
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
            pearlVariant: typeof entity.heldItem === 'object' ? entity.heldItem?.pearlVariant : 0,
            flyAlive: typeof entity.heldItem === 'object' ? entity.heldItem?.flyAlive : true,
          });
        }
      }

    } else if (entity.state === 'stunned') {
      ctx.strokeStyle = charColors.bodyColorTop;
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
    ctx.strokeStyle = entity.state === 'dead' ? '#334155' : charColors.contourColor;
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
        bellyGrad.addColorStop(0, entity.characterId === 'monk' ? 'rgba(254, 249, 195, 0.7)' : 'rgba(255, 255, 255, 0.7)');
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

    ctx.fillStyle = entity.state === 'dead' ? '#94a3b8' : charColors.earColor;
    ctx.strokeStyle = entity.state === 'dead' ? '#334155' : charColors.contourColor;
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
      ctx.fillStyle = charColors.earInnerColor;
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
    ctx.fillStyle = entity.state === 'dead' ? '#94a3b8' : charColors.earColor;
    ctx.beginPath();
    ctx.ellipse(0, -9, 4.4, 11.5, earAngRight, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (entity.state !== 'dead') {
      ctx.fillStyle = charColors.earInnerColor;
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
    if (controlsRef.current[btn] === isPressed) return;
    controlsRef.current[btn] = isPressed;
    setControls(prev => (prev[btn] === isPressed ? prev : { ...prev, [btn]: isPressed }));
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
    const liveFood = foodCountRef.current;
    const reqFood = charConfigRef.current.requiredFood;
    const hasRequiredFood = liveFood >= reqFood;
    const isRainingNow = cycleSecondsLeftRef.current <= 0;

    if (!hasRequiredFood) {
      if (isRainingNow) {
        triggerForceDeathRef.current?.('❌ Ви спробували заснути під час зливи з порожнім шлунком і загинули!');
        return;
      }
      setLastAction(`❌ Не можна спати! Заповніть обов'язкові ячейки їжі (${liveFood} / ${reqFood}).`);
      return;
    }

    const liveSave = playerSaveRef.current;
    const saveX = Math.round(playerPosRef.current.x);
    const saveY = Math.round(playerPosRef.current.y);
    const curRoomId = currentLocationRef.current.id;
    const existingOtherPearls = (liveSave.shelterPearls || []).filter(p => p.roomId !== curRoomId);
    const currentShelterPearls = getShelterPearlsSnapshotRef.current?.() || [];
    const mergedShelterPearls = [...existingOtherPearls, ...currentShelterPearls];

    // In multiplayer: player falls asleep, becomes invulnerable, saves progress, and enters spectator mode
    if (isMultiplayerActiveRef.current) {
      soundEngine.playKarmaAscend();
      const newKarma = Math.min(5, liveSave.karma + 1);
      const newCycle = liveSave.cycle + 1;
      const newFood = Math.max(0, liveFood - reqFood);

      const updatedSave: PlayerSaveData = {
        karma: newKarma,
        maxKarma: 5,
        cycle: newCycle,
        food: newFood,
        lastLocationId: curRoomId,
        playerSpawnX: saveX,
        playerSpawnY: saveY,
        hibernated: true,
        shelterPearls: mergedShelterPearls
      };

      playerSaveRef.current = updatedSave;
      setPlayerSave(updatedSave);
      foodCountRef.current = newFood;
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
      setLastAction(
        currentShelterPearls.length > 0
          ? `😴 Ви заснули! Перлин збережено в укритті: ${currentShelterPearls.length}. Режим спостерігача.`
          : "😴 Ви заснули в укритті! Прогрес збережено. Режим спостерігача активовано."
      );
      return;
    }

    // Single-player hibernation (requires all mandatory food pips filled)
    setIsHibernating(true);
    isHibernatingRef.current = true;
    soundEngine.playShelterDoor();

    setTimeout(() => {
      soundEngine.playKarmaAscend();
      const currentSave = playerSaveRef.current;
      const curFood = foodCountRef.current;
      const newKarma = Math.min(5, currentSave.karma + 1);
      const newCycle = currentSave.cycle + 1;
      const newFood = Math.max(0, curFood - reqFood);

      const updatedSave: PlayerSaveData = {
        karma: newKarma,
        maxKarma: 5,
        cycle: newCycle,
        food: newFood,
        lastLocationId: curRoomId,
        playerSpawnX: Math.round(playerPosRef.current.x),
        playerSpawnY: Math.round(playerPosRef.current.y),
        hibernated: true,
        shelterPearls: mergedShelterPearls
      };

      playerSaveRef.current = updatedSave;
      setPlayerSave(updatedSave);
      foodCountRef.current = newFood;
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
      needsCycleResetRef.current = true;
      lizardCombatTimerRef.current = 0;
      pvpCombatTimerRef.current = 0;
      pvpTargetPeerIdRef.current = null;

      setTimeout(() => {
        setIsHibernating(false);
        isHibernatingRef.current = false;
        setInShelterChamber(false);
        soundEngine.playShelterDoor();
        setLastAction(
          currentShelterPearls.length > 0
            ? `Успішна гібернація! Карма ${newKarma}/5 • Цикл ${newCycle} • Перлин в укритті: ${currentShelterPearls.length}!`
            : `Успішна гібернація! Карма підвищена до ${newKarma}/5. Цикл ${newCycle} розпочато!`
        );
      }, 1800);
    }, 1200);
  };

  triggerHibernateRef.current = handleHibernate;

  const handleSelectLocation = (loc: CustomLocationData) => {
    setShowLocationModal(false);
    if (transitionToLocationRef.current) {
      transitionToLocationRef.current(
        loc,
        undefined,
        undefined,
        undefined,
        `Перехід до локації: ${loc.name}`
      );
    } else {
      distributedSimulation.enterRoom(loc.id);
      currentLocationRef.current = loc;
      setCurrentLocation(loc);
      setInShelterChamber(!!loc.isShelterRoom);
      setLastAction(`Перехід до локації: ${loc.name}`);
    }
  };

  return (
    <div 
      ref={containerRef}
      tabIndex={-1}
      style={{ touchAction: 'none' }}
      className="absolute inset-0 bg-[#0c0a10] z-40 flex flex-col items-center justify-between font-sans text-slate-100 overflow-hidden select-none touch-none outline-none"
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
                onClick={() => triggerAutoReload('ПЕРЕЗАВАНТАЖЕННЯ...', 'Застосування нової версії гри...', 900)}
                className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase cursor-pointer text-[9px] active:scale-95 shadow-sm"
              >
                Оновити зараз
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Silent On-Screen Auto-Reload Overlay (No browser alert dialog) */}
      <AnimatePresence>
        {reloadOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none"
          >
            <div className="max-w-md w-full space-y-4 border border-amber-500/40 bg-zinc-950/90 rounded-2xl p-6 shadow-2xl">
              <div className="w-10 h-10 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
              <div className="font-mono text-xl sm:text-2xl font-black tracking-[0.2em] text-amber-400 uppercase">
                {reloadOverlay.title}
              </div>
              <p className="text-xs sm:text-sm font-mono text-zinc-300 leading-relaxed">
                {reloadOverlay.subtitle}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Ambient Control Bar */}
      <div className="w-full flex items-center justify-between px-2 py-2 sm:px-4 sm:py-3 z-50 bg-gradient-to-b from-black/85 to-transparent">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              isExitingRef.current = true;
              musicManager.playCategory('menu');
              webRTCManager.disconnect();
              onBack();
            }}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono tracking-wider shadow-sm active:scale-95"
            title={t(lang, 'backToMenu')}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-bold">{t(lang, 'backToMenu')}</span>
          </button>

          {/* Multiplayer Room indicator if connected */}
          {networkStatus === 'connected' && (
            <div 
              className="px-2 py-1 rounded-lg border border-emerald-500/50 bg-emerald-950/70 text-emerald-300 font-mono text-[10px] flex items-center gap-1 shadow-sm"
              title={`${webRTCManager.currentRoomId}`}
            >
              <Globe className="w-3 h-3 text-emerald-400" />
              <span className="font-bold">{connectedPeersCount + 1}/12</span>
              {networkPing > 0 && <span className="text-zinc-500 hidden sm:inline">({networkPing}ms)</span>}
            </div>
          )}

          {/* Location Selector Button */}
          <button
            onClick={() => setShowLocationModal(true)}
            className="px-2 py-1.5 rounded-lg border border-amber-800/60 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono tracking-wider shadow-sm active:scale-95"
            title={t(lang, 'locationsTitle')}
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
              <span>0 HP</span>
            </div>
          ) : (
            <div className="px-3 py-1 rounded border border-zinc-800/40 bg-zinc-950/60 text-[10px] font-mono text-zinc-400 max-w-xs truncate flex items-center">
              <span className="text-green-500 animate-pulse mr-1">●</span> {lastAction}
            </div>
          )}
        </div>

        {/* Right side compact controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 sm:px-2 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-xs font-mono active:scale-95 shadow-sm"
            title={isFullscreen ? t(lang, 'fullscreenExit') : t(lang, 'fullscreenEnter')}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5 text-amber-400" />}
            <span className="hidden sm:inline font-bold">{isFullscreen ? t(lang, 'fullscreenExit') : t(lang, 'fullscreenEnter')}</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 sm:px-2 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-300 hover:text-amber-300 transition-all cursor-pointer flex items-center gap-1 text-xs font-mono active:scale-95 shadow-sm"
            title={t(lang, 'settings')}
          >
            <Settings className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline font-bold">{t(lang, 'settings')}</span>
          </button>

          {/* Zoom Level Cycle Button */}
          <button
            onClick={cycleZoom}
            className="px-2 py-1 rounded-lg border border-amber-800/60 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 font-mono text-xs flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-sm"
            title="Zoom (1.0x, 1.35x, 1.65x, 2.0x)"
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
            title="Touch Controls"
          >
            <Gamepad2 className="w-3.5 h-3.5" />
          </button>

          {/* Mute toggle */}
          <button
            onClick={toggleSound}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer active:scale-95"
            title={isSoundMuted ? t(lang, 'soundOff') : t(lang, 'soundOn')}
          >
            {isSoundMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-500" />}
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 w-full max-w-5xl h-full flex items-center justify-center p-2 sm:p-4">
        
        {/* Soft vignette */}
        {settings.graphics.vignette && (
          <div className="absolute inset-0 pointer-events-none border border-zinc-900/10 rounded-2xl z-20 shadow-[inset_0_0_80px_rgba(0,0,0,0.85)]" />
        )}
        
        {/* Canvas stage */}
        <div className="relative w-full aspect-[1000/580] max-h-[75vh] bg-black rounded-lg sm:rounded-2xl overflow-hidden border border-zinc-800/30 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="w-full h-full object-contain"
          />

          {/* ON-CANVAS QUICK CONTROLS (FULLSCREEN) */}
          <div className="absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5">
            <button
              onClick={toggleFullscreen}
              className="px-2 py-1.5 rounded-lg bg-black/60 hover:bg-black/85 border border-white/20 text-white/90 hover:text-white transition-all cursor-pointer backdrop-blur-sm active:scale-95 flex items-center gap-1.5 text-[10px] font-mono shadow-lg"
              title={isFullscreen ? t(lang, 'fullscreenExit') : t(lang, 'fullscreenEnter')}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-amber-400" /> : <Maximize2 className="w-3.5 h-3.5 text-amber-400" />}
              <span className="hidden xs:inline font-bold">{isFullscreen ? t(lang, 'fullscreenExit') : t(lang, 'fullscreenEnter')}</span>
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

            {/* Rain World Food Pips: Required + Divider + Extra */}
            <div className="flex items-center gap-1.5 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {/* Required Food Pips */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: charConfig.requiredFood }).map((_, i) => {
                  const isFilled = i < foodCount;
                  const isJustFilled = i === justFilledIndex;

                  return (
                    <div
                      key={`req-${i}`}
                      className="relative flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5"
                      title={`Обов'язкова ячейка їжі ${i + 1} / ${charConfig.requiredFood} (потрібна для виживання)`}
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

              {/* Extra Surplus Food Pips */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: charConfig.extraFood }).map((_, idx) => {
                  const pipIndex = charConfig.requiredFood + idx;
                  const isFilled = pipIndex < foodCount;
                  const isJustFilled = pipIndex === justFilledIndex;

                  return (
                    <div
                      key={`extra-${pipIndex}`}
                      className="relative flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4"
                      title={`Додаткова ячейка їжі ${idx + 1} / ${charConfig.extraFood} (зберігається на наступний цикл)`}
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
                        ГОЛОГРАФІЧНА КАРТА: {currentLocation.name.toUpperCase()} // {currentLocation.region}
                      </h3>
                      <p className="text-[9px] text-zinc-400">
                        Rain Game Room Radar • Позиція слимакокота, платформи, шести та труби
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
                  <svg
                    viewBox={`0 0 ${currentLocation.width || 1000} ${currentLocation.height || 580}`}
                    className="w-full h-full object-contain"
                  >
                    {/* Background grid */}
                    <defs>
                      <pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(245, 158, 11, 0.08)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect
                      width={currentLocation.width || 1000}
                      height={currentLocation.height || 580}
                      fill="url(#mapgrid)"
                    />

                    {/* Dynamic Platforms */}
                    {currentLocation.platforms.map((plat) => {
                      const isShelter = plat.type === 'shelter';
                      const isMetal = plat.type === 'metal';
                      const isWall = plat.type === 'wall';
                      return (
                        <rect
                          key={plat.id}
                          x={plat.x}
                          y={plat.y}
                          width={plat.w}
                          height={plat.h}
                          fill={
                            isShelter
                              ? 'rgba(34, 211, 238, 0.22)'
                              : isMetal
                              ? 'rgba(56, 189, 248, 0.22)'
                              : isWall
                              ? 'rgba(120, 113, 108, 0.35)'
                              : 'rgba(245, 158, 11, 0.2)'
                          }
                          stroke={
                            isShelter
                              ? '#22d3ee'
                              : isMetal
                              ? '#38bdf8'
                              : isWall
                              ? '#78716c'
                              : '#d97706'
                          }
                          strokeWidth="1.5"
                        />
                      );
                    })}

                    {/* Dynamic Climbing Poles */}
                    {currentLocation.poles.map((pole) => (
                      <line
                        key={pole.id}
                        x1={pole.x}
                        y1={pole.yMin}
                        x2={pole.x}
                        y2={pole.yMax}
                        stroke="#94a3b8"
                        strokeWidth="2.5"
                        strokeDasharray="4 3"
                      />
                    ))}

                    {/* Lizard Den Zone if present */}
                    {currentLocation.lizardDen && (
                      <g>
                        <rect
                          x={currentLocation.lizardDen.x}
                          y={currentLocation.lizardDen.y}
                          width={currentLocation.lizardDen.w}
                          height={currentLocation.lizardDen.h}
                          fill="rgba(236, 72, 153, 0.16)"
                          stroke="#ec4899"
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                        />
                        <text
                          x={currentLocation.lizardDen.x + currentLocation.lizardDen.w / 2}
                          y={currentLocation.lizardDen.y - 6}
                          fill="#f472b6"
                          fontSize="11"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          ЛІГВО ЯЩЕРІВ
                        </text>
                      </g>
                    )}

                    {/* Dynamic Transit Pipes & Local Shortcuts */}
                    {currentLocation.transitPipes.map((pipe) => {
                      const strokeColor = pipe.isShelterPipe
                        ? '#22d3ee'
                        : pipe.isDenPipe
                        ? '#ec4899'
                        : pipe.targetLocationId
                        ? '#22c55e'
                        : '#fbbf24';
                      const labelText = pipe.label || (pipe.isShelterPipe ? 'УБЕРЖКА' : pipe.targetLocationId ? 'ПЕРЕХІД' : 'ТУНЕЛЬ');
                      const clampedLabelX = Math.max(60, Math.min((currentLocation.width || 1000) - 60, pipe.startX));
                      const clampedLabelY = Math.max(16, pipe.startY - 12);
                      return (
                        <g key={pipe.id}>
                          <line
                            x1={pipe.startX}
                            y1={pipe.startY}
                            x2={pipe.endX}
                            y2={pipe.endY}
                            stroke={strokeColor}
                            strokeWidth="2"
                            strokeDasharray="4 4"
                            opacity="0.7"
                          />
                          <circle
                            cx={pipe.startX}
                            cy={pipe.startY}
                            r="7"
                            fill="rgba(0,0,0,0.8)"
                            stroke={strokeColor}
                            strokeWidth="2"
                          />
                          <circle
                            cx={pipe.endX}
                            cy={pipe.endY}
                            r="4"
                            fill={strokeColor}
                            opacity="0.65"
                          />
                          <text
                            x={clampedLabelX}
                            y={clampedLabelY}
                            fill={strokeColor}
                            fontSize="11"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {labelText}
                          </text>
                        </g>
                      );
                    })}

                    {/* NPC / Lizards Radar Positions */}
                    {telemetry.roomLizards.map((lizPos) => (
                      <g key={lizPos.id}>
                        <circle cx={lizPos.x} cy={lizPos.y} r="10" fill="#ec4899" stroke="#ffffff" strokeWidth="2" />
                        <text x={lizPos.x} y={lizPos.y - 14} fill="#f472b6" fontSize="12" fontWeight="bold" textAnchor="middle">
                          ЯЩІР
                        </text>
                      </g>
                    ))}

                    {/* Live Player Position Marker */}
                    <circle cx={telemetry.x} cy={telemetry.y} r="13" fill="#facc15" stroke="#ffffff" strokeWidth="3" className="animate-pulse" />
                    <circle cx={telemetry.x} cy={telemetry.y} r="22" fill="none" stroke="#facc15" strokeWidth="1.5" opacity="0.6" />
                    <text x={telemetry.x} y={telemetry.y - 18} fill="#facc15" fontSize="14" fontWeight="bold" textAnchor="middle">
                      ВИ (СЛИМАКОКІТ)
                    </text>
                  </svg>
                </div>

                {/* Map Footer Legend */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800 text-[10px] text-zinc-400">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1 text-amber-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                      Ви ({Math.round(telemetry.x)}, {Math.round(telemetry.y)})
                    </span>
                    <span className="flex items-center gap-1 text-pink-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-pink-500 inline-block" />
                      Ящірів: {telemetry.roomLizards.length}
                    </span>
                    <span className="flex items-center gap-1 text-sky-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block shadow-sm" />
                      Ягід: {telemetry.berriesCount}
                    </span>
                    <span className="flex items-center gap-1 text-indigo-300">
                      🦇 Кажанів: {telemetry.batfliesCount}
                    </span>
                    <span className="flex items-center gap-1 text-cyan-200">
                      🦪 Перлин: {telemetry.pearlsCount} (у сховищі: {playerSave.shelterPearls?.length ?? 0})
                    </span>
                    <span className="flex items-center gap-1 text-amber-400">
                      <CircleDot className="w-3 h-3 text-amber-400" />
                      Їжа: {foodCount} / {charConfig.maxFood}
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
                      ? t(lang, 'deadMulti')
                      : t(lang, 'deadSingle')}
                  </span>
                </div>
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
                      {t(lang, 'spectatorTitle')}
                    </span>
                    <span className="text-[11px] text-zinc-300 font-semibold truncate block">
                      {spectatedPeerId && webRTCManager.remotePlayers.get(spectatedPeerId)
                        ? `${webRTCManager.remotePlayers.get(spectatedPeerId)?.name} (${webRTCManager.remotePlayers.get(spectatedPeerId)?.room})`
                        : '...'}
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
                {/* EAT FOOD BUTTON (visible when holding berry or batfly - zero latency!) */}
                {(heldItemType === 'berry' || heldItemType === 'batfly' || telemetry.heldItem === 'berry' || telemetry.heldItem === 'batfly') && (
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
                    title="З'їсти ягоду або муху-кажана (заповнює 1 ячейку їжі)"
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
        {(currentLocation.isShelterRoom || inShelterChamber) && !isHibernating && !isDead && !isSpectating && (() => {
          const hasReqFood = foodCount >= charConfig.requiredFood;
          const isRainingNow = cycleSecondsLeft <= 0 || stormActive;
          const isDangerSleep = !hasReqFood && isRainingNow;
          const isBlockedDry = !hasReqFood && !isRainingNow;
          return (
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
                  isDangerSleep
                    ? 'bg-red-950/95 border-red-500 text-red-100 shadow-[0_0_25px_rgba(239,68,68,0.55)]'
                    : isBlockedDry
                    ? 'bg-zinc-950/90 border-amber-600/70 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                    : (isHoldingSleepBtn || sleepProgress > 0)
                    ? 'bg-cyan-950/95 border-cyan-300 text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.6)] scale-105'
                    : 'bg-zinc-950/90 hover:bg-zinc-900 border-cyan-500/80 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.3)]'
                }`}
                title={isDangerSleep ? 'Злива! Спроба заснути голодним убʼє слимакокота!' : isBlockedDry ? `Потрібно ${charConfig.requiredFood} обовʼязкових ячеєк їжі` : 'Затисніть кнопку для засинання та гібернації'}
              >
                {/* Progress background fill */}
                <div 
                  className={`absolute inset-0 bg-gradient-to-r transition-all pointer-events-none ${
                    isDangerSleep
                      ? 'from-red-700/50 via-red-500/60 to-red-400/70'
                      : 'from-cyan-600/40 via-cyan-400/50 to-cyan-300/60'
                  }`}
                  style={{ width: `${Math.round(sleepProgress * 100)}%` }} 
                />
                <span className="text-2xl relative z-10">
                  {isDangerSleep ? '⚠️' : isBlockedDry ? '🔒' : (isHoldingSleepBtn || sleepProgress > 0 ? '💤' : '🛏️')}
                </span>
                <div className="flex flex-col text-left relative z-10">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs sm:text-sm tracking-widest font-black uppercase ${
                      isDangerSleep ? 'text-red-200' : isBlockedDry ? 'text-amber-300' : 'text-cyan-200'
                    }`}>
                      {isBlockedDry
                        ? `${t(lang, 'sleepNotEnoughFood')} (${foodCount}/${charConfig.requiredFood})`
                        : isDangerSleep
                        ? (sleepProgress > 0 ? `${t(lang, 'sleepDeathHunger')} ${Math.round(sleepProgress * 100)}%` : t(lang, 'sleepDangerStorm'))
                        : (sleepProgress > 0 ? `${t(lang, 'sleepSleeping')} ${Math.round(sleepProgress * 100)}%` : t(lang, 'sleepHoldPrompt'))}
                    </span>
                    {sleepProgress > 0 && (
                      <span className={`inline-block w-2 h-2 rounded-full animate-ping ${isDangerSleep ? 'bg-red-400' : 'bg-cyan-400'}`} />
                    )}
                  </div>
                  <span className={`text-[9px] font-normal ${isDangerSleep ? 'text-red-300/90' : isBlockedDry ? 'text-amber-400/80' : 'text-cyan-300/80'}`}>
                    {isBlockedDry
                      ? `${foodCount} / ${charConfig.requiredFood}`
                      : isDangerSleep
                      ? t(lang, 'sleepDeathHunger')
                      : `[${formatKeyCode(settings.keybinds.jump, lang)} / ${formatKeyCode(settings.keybinds.moveDown, lang)}]`}
                  </span>
                </div>
              </button>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ---------------- AUTHENTIC RAIN WORLD HIBERNATION CINEMATIC ---------------- */}
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
                  {lang === 'en' ? `CYCLE ${playerSave.cycle} COMPLETE` : `ЦИКЛ ${playerSave.cycle} ПРОЙДЕНО`}
                </div>
                <div className="text-xs sm:text-sm font-bold text-amber-400 tracking-wider">
                  {lang === 'en' ? `KARMA INCREASED TO ${playerSave.karma} / 5` : `КАРМА ПІДВИЩЕНА ДО ${playerSave.karma} / 5`}
                </div>
                <div className="text-[11px] text-zinc-400 mt-2">
                  {lang === 'en' ? 'Progress saved inside shelter • Storm subsiding...' : 'Прогрес надійно збережено в укритті • Злива закінчується...'}
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- LOCATION SELECTOR MODAL ---------------- */}
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
                      {t(lang, 'locationsTitle')}
                    </h2>
                    <p className="text-[10px] text-zinc-400">
                      {t(lang, 'locationsSubtitle')}
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
                              {t(lang, 'currentRoomTag')}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 flex items-center gap-3 font-mono">
                          <span>{loc.width}×{loc.height}</span>
                          <span>•</span>
                          <span>Platforms: {loc.platforms.length}</span>
                          <span>•</span>
                          <span>Pipes: {loc.transitPipes.length}</span>
                          <span>•</span>
                          <span>Berries: {loc.items.filter(i => i.type === 'berry').length}</span>
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
                        {isCurrent ? t(lang, 'selectedTag') : t(lang, 'enterRoomBtn')}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-zinc-800 pt-3 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>Rain Game • World Rooms</span>
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="px-3 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                >
                  {t(lang, 'closeBtn')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* IN-GAME SETTINGS MODAL */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        isSoundMuted={isSoundMuted}
        toggleSound={toggleSound}
        resumeMusicCategory="game"
      />

      {/* Persistent keyboard controls tips banner */}
      <div className="hidden md:flex items-center gap-3 text-[9px] font-mono text-zinc-500 uppercase tracking-widest pb-4 select-none">
        <span>
          {formatKeyCode(settings.keybinds.moveUp, lang)}/{formatKeyCode(settings.keybinds.moveLeft, lang)}/{formatKeyCode(settings.keybinds.moveDown, lang)}/{formatKeyCode(settings.keybinds.moveRight, lang)} — {t(lang, 'moveHintWord')}
        </span>
        <span>•</span>
        <span>
          {formatKeyCode(settings.keybinds.jump, lang)} — {t(lang, 'jumpHintWord')}
        </span>
        <span>•</span>
        <span className="text-amber-400 font-bold">
          {formatKeyCode(settings.keybinds.grab, lang)} — {t(lang, 'grabHintWord')}
        </span>
        <span>•</span>
        <span className="text-red-400 font-bold">
          {formatKeyCode(settings.keybinds.throwItem, lang)} — {t(lang, 'throwHintWord')}
        </span>
      </div>

    </div>
  );
}
