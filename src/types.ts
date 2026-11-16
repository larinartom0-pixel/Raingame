export interface WeatherState {
  intensity: number; // 0 (dry) to 1 (lethal downpour)
  windX: number; // wind velocity
  lightningFlash: boolean;
  fogDensity: number;
}

export type PlatformType = 'concrete' | 'metal' | 'pipe' | 'wall' | 'shelter';

export interface EditorPlatform {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: PlatformType;
  label?: string;
}

export interface EditorPole {
  id: string;
  x: number;
  yMin: number;
  yMax: number;
}

export interface EditorTransitPipe {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  label?: string;
  isShelterPipe?: boolean; // Entrance pipe to shelter hibernation chamber
  isDenPipe?: boolean; // Entrance pipe to dedicated subterranean lizard lair chamber
  targetLocationId?: string; // Inter-room transit: leads to a DIFFERENT room/location
  targetSpawnX?: number; // Where slugcat spawns in target room
  targetSpawnY?: number; // Where slugcat spawns in target room
}

export interface EditorSpawnItem {
  id: string;
  type: 'spear' | 'rock' | 'berry';
  x: number;
  y: number;
}

export interface CustomLocationData {
  id: string;
  name: string;
  region: string;
  version: number;
  width: number;
  height: number;
  isShelterRoom?: boolean; // Dedicated shelter hibernation bunker room
  isLizardDenRoom?: boolean; // Dedicated subterranean lizard lair chamber
  playerSpawn: { x: number; y: number };
  npcSpawn: { x: number; y: number };
  lizardDen?: { x: number; y: number; w: number; h: number; spawnX: number; spawnY: number };
  platforms: EditorPlatform[];
  poles: EditorPole[];
  transitPipes: EditorTransitPipe[];
  items: EditorSpawnItem[];
}

export type SlugcatCharacterId = 'survivor' | 'monk';

export interface SlugcatCharacterConfig {
  id: SlugcatCharacterId;
  name: string;
  subtitle: string;
  maxHp: number;
  incomingDamageMult: number;
  incomingStunMult: number;
  biteGrabImmunity: boolean;
  attackerStunOnGrabAttempt: number;
  outgoingDamageMult: number;
  outgoingStunMult: number;
  requiredFood: number;
  extraFood: number;
  maxFood: number;
  bodyColorTop: string;
  bodyColorMid: string;
  bodyColorBottom: string;
  contourColor: string;
  earColor: string;
  earInnerColor: string;
}

export const roundToOneDecimal = (val: number): number => Math.round(val * 10) / 10;

export const SLUGCAT_CHARACTERS: Record<SlugcatCharacterId, SlugcatCharacterConfig> = {
  survivor: {
    id: 'survivor',
    name: 'Виживший',
    subtitle: '1 HP • Стандартний баланс • 4+3 їжі',
    maxHp: 1,
    incomingDamageMult: 1.0,
    incomingStunMult: 1.0,
    biteGrabImmunity: false,
    attackerStunOnGrabAttempt: 0,
    outgoingDamageMult: 1.0,
    outgoingStunMult: 1.0,
    requiredFood: 4,
    extraFood: 3,
    maxFood: 7,
    bodyColorTop: '#ffffff',
    bodyColorMid: '#f1f5f9',
    bodyColorBottom: '#e2e8f0',
    contourColor: '#855140',
    earColor: '#fef08a',
    earInnerColor: '#fbcfe8',
  },
  monk: {
    id: 'monk',
    name: 'Монах',
    subtitle: '2 HP • -50% урону/стану • Імунітет до хвату (стан 5с) • -70% сили кидка • 2+4 їжі',
    maxHp: 2,
    incomingDamageMult: 0.5,
    incomingStunMult: 0.5,
    biteGrabImmunity: true,
    attackerStunOnGrabAttempt: 5.0,
    outgoingDamageMult: 0.3,
    outgoingStunMult: 0.3,
    requiredFood: 2,
    extraFood: 4,
    maxFood: 6,
    bodyColorTop: '#fef9c3',
    bodyColorMid: '#fde047',
    bodyColorBottom: '#facc15',
    contourColor: '#a16207',
    earColor: '#fde047',
    earInnerColor: '#fef9c3',
  }
};

export interface PlayerSaveData {
  karma: number; // 1 to 5
  maxKarma: number; // 5
  cycle: number; // 1, 2, 3...
  food: number; // 0 to maxFood
  lastLocationId: string;
  playerSpawnX?: number;
  playerSpawnY?: number;
  hibernated: boolean;
}

export const DEFAULT_PLAYER_SAVE: PlayerSaveData = {
  karma: 1,
  maxKarma: 5,
  cycle: 1,
  food: 0,
  lastLocationId: 'shelter-outskirts',
  playerSpawnX: 280,
  playerSpawnY: 295,
  hibernated: true
};

export {
  DEFAULT_OUTSKIRTS_LOCATION,
  DRAINAGE_SYSTEM_LOCATION,
  INDUSTRIAL_COMPLEX_LOCATION,
  GARBAGE_WASTES_LOCATION,
  CHIMNEY_CANOPY_LOCATION,
  SHADED_CITADEL_LOCATION,
  SHELTER_OUTSKIRTS_LOCATION,
  SHELTER_DRAINAGE_LOCATION,
  SHELTER_INDUSTRIAL_LOCATION,
  SHELTER_GARBAGE_LOCATION,
  SHELTER_CHIMNEY_LOCATION,
  SHELTER_SHADED_LOCATION,
  LIZARD_DEN_OUTSKIRTS_LOCATION,
  BUILTIN_LOCATIONS,
  getLocationById,
  getLocationFloorY,
  resolveSafeSpawn,
  resolveSafeEntitySpawn,
  resolveSafeLizardSpawn
} from './world/locations';
