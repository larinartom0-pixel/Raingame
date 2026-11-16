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

export interface PlayerSaveData {
  karma: number; // 1 to 5
  maxKarma: number; // 5
  cycle: number; // 1, 2, 3...
  food: number; // 0 to 7 (4 required + 3 extra)
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
  resolveSafeSpawn
} from './world/locations';
