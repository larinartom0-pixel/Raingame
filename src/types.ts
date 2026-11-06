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
  playerSpawn: { x: number; y: number };
  npcSpawn: { x: number; y: number };
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
  playerSpawnY: 280,
  hibernated: true
};

// 1. Окраїни (Outskirts) - Класична промислова зона
export const DEFAULT_OUTSKIRTS_LOCATION: CustomLocationData = {
  id: 'outskirts-default',
  name: 'Окраїни (Outskirts)',
  region: 'SU',
  version: 1,
  width: 1000,
  height: 580,
  playerSpawn: { x: 180, y: 450 },
  npcSpawn: { x: 620, y: 520 },
  platforms: [
    // Ground floor
    { id: 'p-ground', x: 0, y: 520, w: 1000, h: 60, type: 'concrete', label: 'Окраїни' },
    // Middle Left Platform Pillars/Shelves
    { id: 'p-shelf-1', x: 30, y: 400, w: 110, h: 18, type: 'metal' },
    { id: 'p-shelf-2', x: 20, y: 280, w: 110, h: 18, type: 'metal' },
    { id: 'p-shelf-3', x: 30, y: 160, w: 110, h: 18, type: 'metal' },
    // Middle/Right Monolith Slabs
    { id: 'p-mono-1', x: 230, y: 310, w: 85, h: 210, type: 'concrete', label: '히' },
    { id: 'p-mono-2', x: 440, y: 310, w: 85, h: 210, type: 'concrete', label: '어' },
    { id: 'p-mono-3', x: 555, y: 280, w: 85, h: 240, type: 'concrete', label: 'F' },
    { id: 'p-mono-4', x: 790, y: 380, w: 90, h: 140, type: 'concrete', label: 'ㄷ' },
    // Solid protective wall barrier
    { id: 'p-wall-1', x: 710, y: 360, w: 26, h: 160, type: 'wall', label: 'БАР\'ЄР' },
    // Top suspended girders & bridges
    { id: 'p-pipe-bridge', x: 330, y: 140, w: 460, h: 16, type: 'pipe' },
    { id: 'p-metal-bridge', x: 840, y: 180, w: 160, h: 18, type: 'metal' },
  ],
  poles: [
    { id: 'pole-1', x: 160, yMin: 140, yMax: 520 },
    { id: 'pole-2', x: 355, yMin: 20, yMax: 520 },
    { id: 'pole-3', x: 480, yMin: 140, yMax: 520 },
    { id: 'pole-4', x: 597, yMin: 10, yMax: 520 },
    { id: 'pole-5', x: 730, yMin: 40, yMax: 520 },
    { id: 'pole-6', x: 920, yMin: 180, yMax: 520 }
  ],
  transitPipes: [
    // Local internal shortcuts
    { id: 'pipe-shortcut-1', startX: 130, startY: 390, endX: 340, endY: 130, label: 'Труба-перехід 1' },
    { id: 'pipe-shortcut-2', startX: 790, startY: 370, endX: 920, endY: 170, label: 'Труба-перехід 2' },
    // Entrance pipe into dedicated Shelter Room!
    { 
      id: 'pipe-shelter-enter', 
      startX: 880, 
      startY: 505, 
      endX: 930, 
      endY: 505, 
      label: 'Укриття SU-S01', 
      isShelterPipe: true,
      targetLocationId: 'shelter-outskirts',
      targetSpawnX: 100,
      targetSpawnY: 330
    },
    // Inter-region pipe to Drainage System (East side -> Drainage West)
    {
      id: 'pipe-outskirts-to-drainage',
      startX: 960,
      startY: 170,
      endX: 990,
      endY: 170,
      label: '➔ ДРЕНАЖНА СИСТЕМА',
      targetLocationId: 'drainage-system',
      targetSpawnX: 80,
      targetSpawnY: 420
    },
    // Inter-region pipe to Industrial Complex (West side -> Industrial East)
    {
      id: 'pipe-outskirts-to-industrial',
      startX: 40,
      startY: 150,
      endX: 10,
      endY: 150,
      label: '➔ ПРОМИСЛОВИЙ КОМПЛЕКС',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 1700,
      targetSpawnY: 780
    }
  ],
  items: [
    { id: 'default-spear-1', type: 'spear', x: 260, y: 290 },
    { id: 'default-rock-1', type: 'rock', x: 470, y: 290 },
    { id: 'default-berry-1', type: 'berry', x: 370, y: 120 },
    { id: 'default-berry-2', type: 'berry', x: 410, y: 120 },
    { id: 'default-berry-3', type: 'berry', x: 450, y: 120 },
    { id: 'default-berry-4', type: 'berry', x: 490, y: 120 },
    { id: 'default-berry-5', type: 'berry', x: 530, y: 120 },
    { id: 'default-berry-6', type: 'berry', x: 80, y: 260 },
    { id: 'default-berry-7', type: 'berry', x: 900, y: 160 }
  ]
};

// 2. Дренажна система (Drainage System) - Затоплені бетонні колектори та довгі труби
export const DRAINAGE_SYSTEM_LOCATION: CustomLocationData = {
  id: 'drainage-system',
  name: 'Дренажна система (Drainage System)',
  region: 'DS',
  version: 1,
  width: 1600,
  height: 800,
  playerSpawn: { x: 100, y: 400 },
  npcSpawn: { x: 1350, y: 700 },
  platforms: [
    // Bottom reservoir floor
    { id: 'ds-ground-1', x: 0, y: 740, w: 600, h: 60, type: 'concrete', label: 'Дренаж-Захід' },
    { id: 'ds-ground-2', x: 750, y: 740, w: 850, h: 60, type: 'concrete', label: 'Дренаж-Схід' },
    // Water basin gap in middle (600..750)
    { id: 'ds-basin-bottom', x: 580, y: 780, w: 190, h: 20, type: 'concrete' },

    // Drainage conduit walls & division blocks
    { id: 'ds-wall-left', x: 300, y: 480, w: 40, h: 260, type: 'wall', label: 'ШЛЮЗ A' },
    { id: 'ds-wall-center', x: 920, y: 440, w: 50, h: 300, type: 'wall', label: 'ШЛЮЗ B' },
    { id: 'ds-wall-divider', x: 1240, y: 320, w: 40, h: 280, type: 'wall' },

    // Upper pipe tunnels and metal platforms
    { id: 'ds-plat-1', x: 80, y: 460, w: 180, h: 22, type: 'metal' },
    { id: 'ds-plat-2', x: 380, y: 380, w: 320, h: 20, type: 'pipe' },
    { id: 'ds-plat-3', x: 740, y: 300, w: 240, h: 22, type: 'metal' },
    { id: 'ds-plat-4', x: 1020, y: 420, w: 200, h: 20, type: 'pipe' },
    { id: 'ds-plat-5', x: 1300, y: 340, w: 260, h: 22, type: 'metal' },
    { id: 'ds-high-bridge', x: 420, y: 160, w: 760, h: 18, type: 'pipe', label: 'ГОЛОВНИЙ КОЛЕКТОР' },

    // Shelter bunker safe vault in the high east cavern
    { id: 'ds-shelter', x: 1420, y: 260, w: 140, h: 80, type: 'shelter', label: '⛊ УКРИТТЯ DS-02' }
  ],
  poles: [
    { id: 'ds-pole-1', x: 180, yMin: 180, yMax: 740 },
    { id: 'ds-pole-2', x: 480, yMin: 80, yMax: 740 },
    { id: 'ds-pole-3', x: 670, yMin: 160, yMax: 780 },
    { id: 'ds-pole-4', x: 880, yMin: 140, yMax: 740 },
    { id: 'ds-pole-5', x: 1140, yMin: 120, yMax: 740 },
    { id: 'ds-pole-6', x: 1380, yMin: 220, yMax: 740 }
  ],
  transitPipes: [
    { id: 'ds-pipe-1', startX: 240, startY: 450, endX: 420, endY: 370, label: 'Колектор 1' },
    { id: 'ds-pipe-2', startX: 680, startY: 370, endX: 760, endY: 290, label: 'Колектор 2' },
    { id: 'ds-pipe-3', startX: 960, startY: 290, endX: 1040, endY: 410, label: 'Колектор 3' },
    { id: 'ds-pipe-4', startX: 1200, startY: 410, endX: 1320, endY: 330, label: 'Колектор 4' },
    // Entrance pipe to Shelter DS-S02
    { 
      id: 'ds-pipe-shelter', 
      startX: 1380, 
      startY: 330, 
      endX: 1440, 
      endY: 300, 
      label: '⛊ УКРИТТЯ DS-S02', 
      isShelterPipe: true,
      targetLocationId: 'shelter-drainage',
      targetSpawnX: 100,
      targetSpawnY: 330
    },
    // Inter-region pipe back to Outskirts (West side -> Outskirts East)
    {
      id: 'ds-pipe-to-outskirts',
      startX: 40,
      startY: 440,
      endX: 10,
      endY: 440,
      label: '➔ ОКРАЇНИ',
      targetLocationId: 'outskirts-default',
      targetSpawnX: 920,
      targetSpawnY: 170
    },
    // Inter-region pipe to Garbage Wastes (East side -> Garbage West)
    {
      id: 'ds-pipe-to-garbage',
      startX: 1560,
      startY: 320,
      endX: 1590,
      endY: 320,
      label: '➔ СМІТТЄЗВАЛИЩЕ',
      targetLocationId: 'garbage-wastes',
      targetSpawnX: 80,
      targetSpawnY: 530
    }
  ],
  items: [
    { id: 'ds-spear-1', type: 'spear', x: 150, y: 440 },
    { id: 'ds-spear-2', type: 'spear', x: 800, y: 280 },
    { id: 'ds-spear-3', type: 'spear', x: 1350, y: 320 },
    { id: 'ds-rock-1', type: 'rock', x: 500, y: 360 },
    { id: 'ds-rock-2', type: 'rock', x: 1100, y: 400 },
    { id: 'ds-berry-1', type: 'berry', x: 440, y: 140 },
    { id: 'ds-berry-2', type: 'berry', x: 540, y: 140 },
    { id: 'ds-berry-3', type: 'berry', x: 640, y: 140 },
    { id: 'ds-berry-4', type: 'berry', x: 740, y: 140 },
    { id: 'ds-berry-5', type: 'berry', x: 840, y: 140 },
    { id: 'ds-berry-6', type: 'berry', x: 940, y: 140 },
    { id: 'ds-berry-7', type: 'berry', x: 1040, y: 140 }
  ]
};

// 3. Промисловий комплекс (Industrial Complex) - Високі вежі, металеві ферми та кабелі
export const INDUSTRIAL_COMPLEX_LOCATION: CustomLocationData = {
  id: 'industrial-complex',
  name: 'Промисловий комплекс (Industrial Complex)',
  region: 'HI',
  version: 1,
  width: 1800,
  height: 900,
  playerSpawn: { x: 150, y: 650 },
  npcSpawn: { x: 1400, y: 650 },
  platforms: [
    // Bottom foundation
    { id: 'hi-ground', x: 0, y: 820, w: 1800, h: 80, type: 'concrete', label: 'ПРОМ-ЗОНА' },
    
    // Tower 1 (West Chimney)
    { id: 'hi-tower-1', x: 260, y: 320, w: 90, h: 500, type: 'concrete', label: 'ВЕЖА 1' },
    { id: 'hi-tower-1-wall', x: 250, y: 300, w: 110, h: 20, type: 'wall' },

    // Tower 2 (Center Smokestack)
    { id: 'hi-tower-2', x: 780, y: 220, w: 110, h: 600, type: 'concrete', label: 'ВЕЖА 2' },
    { id: 'hi-tower-2-top', x: 760, y: 200, w: 150, h: 20, type: 'metal' },

    // Tower 3 (East Silo)
    { id: 'hi-tower-3', x: 1320, y: 280, w: 100, h: 540, type: 'concrete', label: 'ВЕЖА 3' },

    // Metal scaffolds & Catwalk bridges connecting the towers
    { id: 'hi-catwalk-1', x: 350, y: 460, w: 430, h: 18, type: 'metal' },
    { id: 'hi-catwalk-2', x: 890, y: 380, w: 430, h: 18, type: 'metal' },
    { id: 'hi-pipe-sky', x: 150, y: 240, w: 1200, h: 16, type: 'pipe', label: 'МАГІСТРАЛЬ ВИСОКОГО ТИСКУ' },
    
    // Low platforms & security shelters
    { id: 'hi-plat-left', x: 40, y: 680, w: 160, h: 20, type: 'metal' },
    { id: 'hi-plat-mid', x: 480, y: 640, w: 220, h: 20, type: 'metal' },
    { id: 'hi-plat-right', x: 1020, y: 640, w: 240, h: 20, type: 'metal' }
  ],
  poles: [
    { id: 'hi-pole-1', x: 160, yMin: 240, yMax: 820 },
    { id: 'hi-pole-2', x: 380, yMin: 140, yMax: 820 },
    { id: 'hi-pole-3', x: 620, yMin: 200, yMax: 820 },
    { id: 'hi-pole-4', x: 920, yMin: 100, yMax: 820 },
    { id: 'hi-pole-5', x: 1180, yMin: 180, yMax: 820 },
    { id: 'hi-pole-6', x: 1460, yMin: 220, yMax: 820 },
    { id: 'hi-pole-7', x: 1680, yMin: 320, yMax: 820 }
  ],
  transitPipes: [
    { id: 'hi-pipe-1', startX: 200, startY: 670, endX: 370, endY: 450, label: 'Труба шахти 1' },
    { id: 'hi-pipe-2', startX: 760, startY: 450, endX: 910, endY: 370, label: 'Труба шахти 2' },
    { id: 'hi-pipe-3', startX: 1300, startY: 370, endX: 1440, endY: 630, label: 'Труба шахти 3' },
    // Entrance pipe to Shelter HI-S01
    { 
      id: 'hi-pipe-shelter', 
      startX: 60, 
      startY: 810, 
      endX: 100, 
      endY: 780, 
      label: '⛊ УКРИТТЯ HI-S01', 
      isShelterPipe: true,
      targetLocationId: 'shelter-industrial',
      targetSpawnX: 100,
      targetSpawnY: 330
    },
    // Inter-region pipe back to Outskirts (East ground -> Outskirts West)
    {
      id: 'hi-pipe-to-outskirts',
      startX: 1740,
      startY: 800,
      endX: 1780,
      endY: 800,
      label: '➔ ОКРАЇНИ',
      targetLocationId: 'outskirts-default',
      targetSpawnX: 80,
      targetSpawnY: 150
    },
    // Inter-region pipe to Garbage Wastes (West top -> Garbage East)
    {
      id: 'hi-pipe-to-garbage',
      startX: 120,
      startY: 220,
      endX: 30,
      endY: 220,
      label: '➔ СМІТТЄЗВАЛИЩЕ',
      targetLocationId: 'garbage-wastes',
      targetSpawnX: 1300,
      targetSpawnY: 240
    },
    // Inter-region pipe to Chimney Canopy (Top sky tower -> Chimney Canopy bottom)
    {
      id: 'hi-pipe-to-chimney',
      startX: 835,
      startY: 190,
      endX: 835,
      endY: 140,
      label: '➔ ДИМАРІ (ВГОРУ)',
      targetLocationId: 'chimney-canopy',
      targetSpawnX: 140,
      targetSpawnY: 820
    },
    // Inter-region pipe to Shaded Citadel (East upper catwalk -> Shaded Citadel West)
    {
      id: 'hi-pipe-to-shaded',
      startX: 1740,
      startY: 370,
      endX: 1780,
      endY: 370,
      label: '➔ ЗАТІНЕНА ЦИТАДЕЛЬ',
      targetLocationId: 'shaded-citadel',
      targetSpawnX: 100,
      targetSpawnY: 220
    }
  ],
  items: [
    { id: 'hi-spear-1', type: 'spear', x: 280, y: 310 },
    { id: 'hi-spear-2', type: 'spear', x: 820, y: 210 },
    { id: 'hi-spear-3', type: 'spear', x: 1350, y: 270 },
    { id: 'hi-spear-4', type: 'spear', x: 550, y: 630 },
    { id: 'hi-rock-1', type: 'rock', x: 400, y: 450 },
    { id: 'hi-rock-2', type: 'rock', x: 950, y: 370 },
    { id: 'hi-rock-3', type: 'rock', x: 1100, y: 630 },
    { id: 'hi-berry-1', type: 'berry', x: 420, y: 220 },
    { id: 'hi-berry-2', type: 'berry', x: 520, y: 220 },
    { id: 'hi-berry-3', type: 'berry', x: 620, y: 220 },
    { id: 'hi-berry-4', type: 'berry', x: 980, y: 220 },
    { id: 'hi-berry-5', type: 'berry', x: 1080, y: 220 },
    { id: 'hi-berry-6', type: 'berry', x: 1180, y: 220 }
  ]
};

// 4. Сміттєзвалище (Garbage Wastes) - Вузькі тунелі, барикади зі сміття та списами
export const GARBAGE_WASTES_LOCATION: CustomLocationData = {
  id: 'garbage-wastes',
  name: 'Сміттєзвалище (Garbage Wastes)',
  region: 'GW',
  version: 1,
  width: 1400,
  height: 700,
  playerSpawn: { x: 140, y: 550 },
  npcSpawn: { x: 1150, y: 580 },
  platforms: [
    // Scrap floor
    { id: 'gw-ground', x: 0, y: 620, w: 1400, h: 80, type: 'concrete', label: 'КУПИ МЕТАЛОБРУХТУ' },
    
    // Scrap piles / barriers
    { id: 'gw-pile-1', x: 260, y: 460, w: 120, h: 160, type: 'metal', label: 'БРУХТ' },
    { id: 'gw-wall-1', x: 380, y: 380, w: 30, h: 240, type: 'wall', label: 'ЩИТ' },
    { id: 'gw-pile-2', x: 550, y: 400, w: 140, h: 220, type: 'concrete' },
    { id: 'gw-pile-3', x: 800, y: 440, w: 120, h: 180, type: 'metal' },
    { id: 'gw-wall-2', x: 920, y: 360, w: 30, h: 260, type: 'wall', label: 'ЗВАЛИЩЕ' },

    // Overhead rusty pipes
    { id: 'gw-pipe-1', x: 100, y: 260, w: 340, h: 18, type: 'pipe' },
    { id: 'gw-pipe-2', x: 480, y: 220, w: 420, h: 18, type: 'pipe' },
    { id: 'gw-pipe-3', x: 940, y: 260, w: 380, h: 18, type: 'pipe' }
  ],
  poles: [
    { id: 'gw-pole-1', x: 200, yMin: 260, yMax: 620 },
    { id: 'gw-pole-2', x: 440, yMin: 180, yMax: 620 },
    { id: 'gw-pole-3', x: 740, yMin: 140, yMax: 620 },
    { id: 'gw-pole-4', x: 980, yMin: 180, yMax: 620 },
    { id: 'gw-pole-5', x: 1240, yMin: 240, yMax: 620 }
  ],
  transitPipes: [
    { id: 'gw-pipe-sc-1', startX: 220, startY: 450, endX: 420, endY: 370, label: 'Нора брухту 1' },
    { id: 'gw-pipe-sc-2', startX: 720, startY: 390, endX: 940, endY: 350, label: 'Нора брухту 2' },
    // Entrance pipe to Shelter GW-S05
    { 
      id: 'gw-pipe-shelter', 
      startX: 1140, 
      startY: 610, 
      endX: 1220, 
      endY: 580, 
      label: '⛊ УКРИТТЯ GW-S05', 
      isShelterPipe: true,
      targetLocationId: 'shelter-garbage',
      targetSpawnX: 100,
      targetSpawnY: 330
    },
    // Inter-region pipe back to Drainage System (West side -> Drainage East)
    {
      id: 'gw-pipe-to-drainage',
      startX: 40,
      startY: 550,
      endX: 10,
      endY: 550,
      label: '➔ ДРЕНАЖНА СИСТЕМА',
      targetLocationId: 'drainage-system',
      targetSpawnX: 1500,
      targetSpawnY: 320
    },
    // Inter-region pipe to Industrial Complex (East side -> Industrial West)
    {
      id: 'gw-pipe-to-industrial',
      startX: 1360,
      startY: 240,
      endX: 1390,
      endY: 240,
      label: '➔ ПРОМИСЛОВИЙ КОМПЛЕКС',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 160,
      targetSpawnY: 220
    }
  ],
  items: [
    { id: 'gw-spear-1', type: 'spear', x: 290, y: 450 },
    { id: 'gw-spear-2', type: 'spear', x: 600, y: 390 },
    { id: 'gw-spear-3', type: 'spear', x: 840, y: 430 },
    { id: 'gw-rock-1', type: 'rock', x: 180, y: 610 },
    { id: 'gw-rock-2', type: 'rock', x: 480, y: 610 },
    { id: 'gw-rock-3', type: 'rock', x: 760, y: 610 },
    { id: 'gw-rock-4', type: 'rock', x: 1040, y: 610 },
    { id: 'gw-berry-1', type: 'berry', x: 520, y: 200 },
    { id: 'gw-berry-2', type: 'berry', x: 600, y: 200 },
    { id: 'gw-berry-3', type: 'berry', x: 680, y: 200 },
    { id: 'gw-berry-4', type: 'berry', x: 760, y: 200 },
    { id: 'gw-berry-5', type: 'berry', x: 840, y: 200 }
  ]
};

// 5. Димарі (Chimney Canopy) - Високі вежі над хмарами, металеві ферми та запаморочлива висота
export const CHIMNEY_CANOPY_LOCATION: CustomLocationData = {
  id: 'chimney-canopy',
  name: 'Димарі (Chimney Canopy)',
  region: 'CC',
  version: 1,
  width: 1600,
  height: 950,
  playerSpawn: { x: 160, y: 800 },
  npcSpawn: { x: 1100, y: 420 },
  platforms: [
    // Bottom foundation with abyssal gaps
    { id: 'cc-ground-left', x: 0, y: 870, w: 420, h: 80, type: 'concrete', label: 'НИЖНІЙ ПІЛОН' },
    { id: 'cc-ground-right', x: 1180, y: 870, w: 420, h: 80, type: 'concrete', label: 'СХІДНИЙ ПІЛОН' },

    // Tall vertical chimney towers
    { id: 'cc-tower-w', x: 220, y: 380, w: 100, h: 500, type: 'concrete', label: 'ВЕЖА CC-1' },
    { id: 'cc-tower-mid', x: 720, y: 260, w: 120, h: 620, type: 'concrete', label: 'ГОЛОВНИЙ ДИМАР' },
    { id: 'cc-tower-e', x: 1260, y: 340, w: 110, h: 540, type: 'concrete', label: 'ВЕЖА CC-2' },

    // Suspended high-altitude catwalks & narrow girders
    { id: 'cc-catwalk-low', x: 320, y: 640, w: 400, h: 18, type: 'metal' },
    { id: 'cc-catwalk-mid', x: 840, y: 520, w: 420, h: 18, type: 'metal' },
    { id: 'cc-catwalk-high', x: 340, y: 360, w: 380, h: 18, type: 'metal' },
    { id: 'cc-catwalk-sky', x: 840, y: 240, w: 460, h: 18, type: 'metal', label: 'ВЕРХНІЙ МІСТ' },

    // Concrete walls and wind baffles
    { id: 'cc-wall-1', x: 700, y: 240, w: 20, h: 80, type: 'wall' },
    { id: 'cc-wall-2', x: 840, y: 220, w: 20, h: 80, type: 'wall' },

    // Narrow high pipes
    { id: 'cc-pipe-1', x: 120, y: 480, w: 200, h: 16, type: 'pipe' },
    { id: 'cc-pipe-2', x: 1370, y: 480, w: 220, h: 16, type: 'pipe' }
  ],
  poles: [
    { id: 'cc-pole-1', x: 160, yMin: 380, yMax: 870 },
    { id: 'cc-pole-2', x: 360, yMin: 340, yMax: 870 },
    { id: 'cc-pole-3', x: 580, yMin: 340, yMax: 640 },
    { id: 'cc-pole-4', x: 880, yMin: 220, yMax: 880 },
    { id: 'cc-pole-5', x: 1100, yMin: 240, yMax: 880 },
    { id: 'cc-pole-6', x: 1420, yMin: 320, yMax: 870 }
  ],
  transitPipes: [
    { id: 'cc-pipe-sc-1', startX: 300, startY: 370, endX: 420, endY: 630, label: 'Шахта CC-1' },
    { id: 'cc-pipe-sc-2', startX: 820, startY: 510, endX: 940, endY: 230, label: 'Шахта CC-2' },
    // Entrance pipe to Shelter CC-S03
    {
      id: 'cc-pipe-shelter',
      startX: 640,
      startY: 460,
      endX: 680,
      endY: 460,
      label: '⛊ УКРИТТЯ CC-S03',
      isShelterPipe: true,
      targetLocationId: 'shelter-chimney',
      targetSpawnX: 100,
      targetSpawnY: 330
    },
    // Inter-region pipe down to Industrial Complex (South pylon -> Industrial top)
    {
      id: 'cc-pipe-to-industrial',
      startX: 120,
      startY: 850,
      endX: 120,
      endY: 900,
      label: '➔ ПРОМ-КОМПЛЕКС (ВНИЗ)',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 835,
      targetSpawnY: 230
    },
    // Inter-region pipe to Shaded Citadel (East upper girder -> Shaded Citadel West)
    {
      id: 'cc-pipe-to-shaded',
      startX: 1540,
      startY: 500,
      endX: 1580,
      endY: 500,
      label: '➔ ЗАТІНЕНА ЦИТАДЕЛЬ',
      targetLocationId: 'shaded-citadel',
      targetSpawnX: 100,
      targetSpawnY: 220
    }
  ],
  items: [
    { id: 'cc-spear-1', type: 'spear', x: 260, y: 360 },
    { id: 'cc-spear-2', type: 'spear', x: 780, y: 240 },
    { id: 'cc-spear-3', type: 'spear', x: 1300, y: 320 },
    { id: 'cc-rock-1', type: 'rock', x: 380, y: 620 },
    { id: 'cc-rock-2', type: 'rock', x: 960, y: 220 },
    { id: 'cc-berry-1', type: 'berry', x: 440, y: 340 },
    { id: 'cc-berry-2', type: 'berry', x: 520, y: 340 },
    { id: 'cc-berry-3', type: 'berry', x: 920, y: 500 },
    { id: 'cc-berry-4', type: 'berry', x: 1000, y: 500 },
    { id: 'cc-berry-5', type: 'berry', x: 1080, y: 500 }
  ]
};

// 6. Затінена цитадель (Shaded Citadel) - Стародавні підземні склепи, темні кам'яні колони
export const SHADED_CITADEL_LOCATION: CustomLocationData = {
  id: 'shaded-citadel',
  name: 'Затінена цитадель (Shaded Citadel)',
  region: 'SH',
  version: 1,
  width: 1500,
  height: 750,
  playerSpawn: { x: 120, y: 220 },
  npcSpawn: { x: 1250, y: 620 },
  platforms: [
    // Subterranean temple floor
    { id: 'sh-ground', x: 0, y: 670, w: 1500, h: 80, type: 'concrete', label: 'СКЛЕП ЦИТАДЕЛІ' },

    // Heavy stone temple monoliths & pillars
    { id: 'sh-pillar-1', x: 240, y: 340, w: 90, h: 330, type: 'concrete', label: 'КОЛОНА 1' },
    { id: 'sh-pillar-2', x: 560, y: 280, w: 90, h: 390, type: 'concrete', label: 'КОЛОНА 2' },
    { id: 'sh-pillar-3', x: 920, y: 320, w: 100, h: 350, type: 'concrete', label: 'КОЛОНА 3' },
    { id: 'sh-pillar-4', x: 1240, y: 360, w: 90, h: 310, type: 'concrete', label: 'КОЛОНА 4' },

    // Stone lintels & crypt arches
    { id: 'sh-arch-1', x: 80, y: 240, w: 240, h: 22, type: 'concrete' },
    { id: 'sh-arch-2', x: 330, y: 420, w: 230, h: 20, type: 'metal' },
    { id: 'sh-arch-3', x: 650, y: 340, w: 270, h: 22, type: 'concrete' },
    { id: 'sh-arch-4', x: 1020, y: 440, w: 220, h: 20, type: 'metal' },
    { id: 'sh-high-beam', x: 440, y: 160, w: 640, h: 18, type: 'pipe', label: 'АКВЕДУК ТЕМРЯВИ' },

    // Ancient stone security walls
    { id: 'sh-wall-1', x: 400, y: 440, w: 30, h: 230, type: 'wall' },
    { id: 'sh-wall-2', x: 1100, y: 460, w: 30, h: 210, type: 'wall' }
  ],
  poles: [
    { id: 'sh-pole-1', x: 160, yMin: 220, yMax: 670 },
    { id: 'sh-pole-2', x: 480, yMin: 160, yMax: 670 },
    { id: 'sh-pole-3', x: 780, yMin: 140, yMax: 670 },
    { id: 'sh-pole-4', x: 1080, yMin: 160, yMax: 670 },
    { id: 'sh-pole-5', x: 1360, yMin: 240, yMax: 670 }
  ],
  transitPipes: [
    { id: 'sh-pipe-sc-1', startX: 300, startY: 330, endX: 360, endY: 410, label: 'Гробниця 1' },
    { id: 'sh-pipe-sc-2', startX: 680, startY: 330, endX: 1040, endY: 430, label: 'Гробниця 2' },
    // Entrance pipe to Shelter SH-S04
    {
      id: 'sh-pipe-shelter',
      startX: 760,
      startY: 660,
      endX: 800,
      endY: 660,
      label: '⛊ УКРИТТЯ SH-S04',
      isShelterPipe: true,
      targetLocationId: 'shelter-shaded',
      targetSpawnX: 100,
      targetSpawnY: 330
    },
    // Inter-region pipe to Chimney Canopy (West crypt -> Chimney Canopy East)
    {
      id: 'sh-pipe-to-chimney',
      startX: 40,
      startY: 220,
      endX: 10,
      endY: 220,
      label: '➔ ДИМАРІ',
      targetLocationId: 'chimney-canopy',
      targetSpawnX: 1500,
      targetSpawnY: 500
    },
    // Inter-region pipe to Industrial Complex (South/East -> Industrial catwalk)
    {
      id: 'sh-pipe-to-industrial',
      startX: 1440,
      startY: 650,
      endX: 1480,
      endY: 650,
      label: '➔ ПРОМИСЛОВИЙ КОМПЛЕКС',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 1700,
      targetSpawnY: 370
    }
  ],
  items: [
    { id: 'sh-spear-1', type: 'spear', x: 260, y: 320 },
    { id: 'sh-spear-2', type: 'spear', x: 940, y: 300 },
    { id: 'sh-rock-1', type: 'rock', x: 180, y: 650 },
    { id: 'sh-rock-2', type: 'rock', x: 740, y: 320 },
    { id: 'sh-rock-3', type: 'rock', x: 1300, y: 650 },
    { id: 'sh-berry-1', type: 'berry', x: 480, y: 140 },
    { id: 'sh-berry-2', type: 'berry', x: 560, y: 140 },
    { id: 'sh-berry-3', type: 'berry', x: 640, y: 140 },
    { id: 'sh-berry-4', type: 'berry', x: 720, y: 140 },
    { id: 'sh-berry-5', type: 'berry', x: 800, y: 140 },
    { id: 'sh-berry-6', type: 'berry', x: 880, y: 140 }
  ]
};

// ============================================================================
// DEDICATED SHELTER ROOMS (ОКРЕМІ КАРТИ УКРИТТІВ ДЛЯ ГІБЕРНАЦІЇ)
// ============================================================================

// 7. Укриття Окраїн (Shelter SU-S01)
export const SHELTER_OUTSKIRTS_LOCATION: CustomLocationData = {
  id: 'shelter-outskirts',
  name: 'Укриття SU-S01 (Shelter)',
  region: 'SU',
  version: 1,
  width: 580,
  height: 420,
  isShelterRoom: true,
  playerSpawn: { x: 280, y: 320 },
  npcSpawn: { x: 420, y: 320 },
  platforms: [
    { id: 'su-sh-floor', x: 0, y: 360, w: 580, h: 60, type: 'metal', label: 'УКРИТТЯ SU-S01' },
    { id: 'su-sh-wall-l', x: 0, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'su-sh-wall-r', x: 520, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'su-sh-ceiling', x: 0, y: 0, w: 580, h: 50, type: 'concrete' },
    { id: 'su-sh-bunk', x: 210, y: 340, w: 160, h: 20, type: 'concrete' },
    { id: 'su-sh-pipe', x: 80, y: 160, w: 420, h: 16, type: 'pipe' }
  ],
  poles: [
    { id: 'su-sh-pole-1', x: 150, yMin: 50, yMax: 360 },
    { id: 'su-sh-pole-2', x: 430, yMin: 50, yMax: 360 }
  ],
  transitPipes: [
    {
      id: 'su-sh-exit-pipe',
      startX: 100,
      startY: 330,
      endX: 100,
      endY: 330,
      label: '➔ ВИХІД В ОКРАЇНИ',
      targetLocationId: 'outskirts-default',
      targetSpawnX: 860,
      targetSpawnY: 480
    }
  ],
  items: [
    { id: 'su-sh-fruit-1', type: 'berry', x: 340, y: 330 },
    { id: 'su-sh-fruit-2', type: 'berry', x: 240, y: 330 }
  ]
};

// 8. Укриття Дренажної системи (Shelter DS-S02)
export const SHELTER_DRAINAGE_LOCATION: CustomLocationData = {
  id: 'shelter-drainage',
  name: 'Укриття DS-S02 (Shelter)',
  region: 'DS',
  version: 1,
  width: 580,
  height: 420,
  isShelterRoom: true,
  playerSpawn: { x: 280, y: 320 },
  npcSpawn: { x: 420, y: 320 },
  platforms: [
    { id: 'ds-sh-floor', x: 0, y: 360, w: 580, h: 60, type: 'metal', label: 'УКРИТТЯ DS-S02' },
    { id: 'ds-sh-wall-l', x: 0, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'ds-sh-wall-r', x: 520, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'ds-sh-ceiling', x: 0, y: 0, w: 580, h: 50, type: 'concrete' },
    { id: 'ds-sh-bunk', x: 210, y: 340, w: 160, h: 20, type: 'concrete' },
    { id: 'ds-sh-pipe', x: 80, y: 160, w: 420, h: 16, type: 'pipe' }
  ],
  poles: [
    { id: 'ds-sh-pole-1', x: 150, yMin: 50, yMax: 360 },
    { id: 'ds-sh-pole-2', x: 430, yMin: 50, yMax: 360 }
  ],
  transitPipes: [
    {
      id: 'ds-sh-exit-pipe',
      startX: 100,
      startY: 330,
      endX: 100,
      endY: 330,
      label: '➔ ВИХІД У ДРЕНАЖ',
      targetLocationId: 'drainage-system',
      targetSpawnX: 1360,
      targetSpawnY: 310
    }
  ],
  items: [
    { id: 'ds-sh-fruit-1', type: 'berry', x: 290, y: 330 }
  ]
};

// 9. Укриття Промислового комплексу (Shelter HI-S01)
export const SHELTER_INDUSTRIAL_LOCATION: CustomLocationData = {
  id: 'shelter-industrial',
  name: 'Укриття HI-S01 (Shelter)',
  region: 'HI',
  version: 1,
  width: 580,
  height: 420,
  isShelterRoom: true,
  playerSpawn: { x: 280, y: 320 },
  npcSpawn: { x: 420, y: 320 },
  platforms: [
    { id: 'hi-sh-floor', x: 0, y: 360, w: 580, h: 60, type: 'metal', label: 'УКРИТТЯ HI-S01' },
    { id: 'hi-sh-wall-l', x: 0, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'hi-sh-wall-r', x: 520, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'hi-sh-ceiling', x: 0, y: 0, w: 580, h: 50, type: 'concrete' },
    { id: 'hi-sh-bunk', x: 210, y: 340, w: 160, h: 20, type: 'concrete' },
    { id: 'hi-sh-pipe', x: 80, y: 160, w: 420, h: 16, type: 'pipe' }
  ],
  poles: [
    { id: 'hi-sh-pole-1', x: 150, yMin: 50, yMax: 360 },
    { id: 'hi-sh-pole-2', x: 430, yMin: 50, yMax: 360 }
  ],
  transitPipes: [
    {
      id: 'hi-sh-exit-pipe',
      startX: 100,
      startY: 330,
      endX: 100,
      endY: 330,
      label: '➔ ВИХІД У ПРОМ-КОМПЛЕКС',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 120,
      targetSpawnY: 790
    }
  ],
  items: [
    { id: 'hi-sh-fruit-1', type: 'berry', x: 250, y: 330 },
    { id: 'hi-sh-fruit-2', type: 'berry', x: 330, y: 330 }
  ]
};

// 10. Укриття Сміттєзвалища (Shelter GW-S05)
export const SHELTER_GARBAGE_LOCATION: CustomLocationData = {
  id: 'shelter-garbage',
  name: 'Укриття GW-S05 (Shelter)',
  region: 'GW',
  version: 1,
  width: 580,
  height: 420,
  isShelterRoom: true,
  playerSpawn: { x: 280, y: 320 },
  npcSpawn: { x: 420, y: 320 },
  platforms: [
    { id: 'gw-sh-floor', x: 0, y: 360, w: 580, h: 60, type: 'metal', label: 'УКРИТТЯ GW-S05' },
    { id: 'gw-sh-wall-l', x: 0, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'gw-sh-wall-r', x: 520, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'gw-sh-ceiling', x: 0, y: 0, w: 580, h: 50, type: 'concrete' },
    { id: 'gw-sh-bunk', x: 210, y: 340, w: 160, h: 20, type: 'concrete' },
    { id: 'gw-sh-pipe', x: 80, y: 160, w: 420, h: 16, type: 'pipe' }
  ],
  poles: [
    { id: 'gw-sh-pole-1', x: 150, yMin: 50, yMax: 360 },
    { id: 'gw-sh-pole-2', x: 430, yMin: 50, yMax: 360 }
  ],
  transitPipes: [
    {
      id: 'gw-sh-exit-pipe',
      startX: 100,
      startY: 330,
      endX: 100,
      endY: 330,
      label: '➔ ВИХІД У СМІТТЄЗВАЛИЩЕ',
      targetLocationId: 'garbage-wastes',
      targetSpawnX: 1180,
      targetSpawnY: 590
    }
  ],
  items: [
    { id: 'gw-sh-fruit-1', type: 'berry', x: 290, y: 330 }
  ]
};

// 11. Укриття Димарів (Shelter CC-S03)
export const SHELTER_CHIMNEY_LOCATION: CustomLocationData = {
  id: 'shelter-chimney',
  name: 'Укриття CC-S03 (Shelter)',
  region: 'CC',
  version: 1,
  width: 580,
  height: 420,
  isShelterRoom: true,
  playerSpawn: { x: 280, y: 320 },
  npcSpawn: { x: 420, y: 320 },
  platforms: [
    { id: 'cc-sh-floor', x: 0, y: 360, w: 580, h: 60, type: 'metal', label: 'УКРИТТЯ CC-S03' },
    { id: 'cc-sh-wall-l', x: 0, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'cc-sh-wall-r', x: 520, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'cc-sh-ceiling', x: 0, y: 0, w: 580, h: 50, type: 'concrete' },
    { id: 'cc-sh-bunk', x: 210, y: 340, w: 160, h: 20, type: 'concrete' },
    { id: 'cc-sh-pipe', x: 80, y: 160, w: 420, h: 16, type: 'pipe' }
  ],
  poles: [
    { id: 'cc-sh-pole-1', x: 150, yMin: 50, yMax: 360 },
    { id: 'cc-sh-pole-2', x: 430, yMin: 50, yMax: 360 }
  ],
  transitPipes: [
    {
      id: 'cc-sh-exit-pipe',
      startX: 100,
      startY: 330,
      endX: 100,
      endY: 330,
      label: '➔ ВИХІД У ДИМАРІ',
      targetLocationId: 'chimney-canopy',
      targetSpawnX: 600,
      targetSpawnY: 450
    }
  ],
  items: [
    { id: 'cc-sh-fruit-1', type: 'berry', x: 260, y: 330 },
    { id: 'cc-sh-fruit-2', type: 'berry', x: 330, y: 330 }
  ]
};

// 12. Укриття Затіненої цитаделі (Shelter SH-S04)
export const SHELTER_SHADED_LOCATION: CustomLocationData = {
  id: 'shelter-shaded',
  name: 'Укриття SH-S04 (Shelter)',
  region: 'SH',
  version: 1,
  width: 580,
  height: 420,
  isShelterRoom: true,
  playerSpawn: { x: 280, y: 320 },
  npcSpawn: { x: 420, y: 320 },
  platforms: [
    { id: 'sh-sh-floor', x: 0, y: 360, w: 580, h: 60, type: 'metal', label: 'УКРИТТЯ SH-S04' },
    { id: 'sh-sh-wall-l', x: 0, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'sh-sh-wall-r', x: 520, y: 0, w: 60, h: 360, type: 'wall' },
    { id: 'sh-sh-ceiling', x: 0, y: 0, w: 580, h: 50, type: 'concrete' },
    { id: 'sh-sh-bunk', x: 210, y: 340, w: 160, h: 20, type: 'concrete' },
    { id: 'sh-sh-pipe', x: 80, y: 160, w: 420, h: 16, type: 'pipe' }
  ],
  poles: [
    { id: 'sh-sh-pole-1', x: 150, yMin: 50, yMax: 360 },
    { id: 'sh-sh-pole-2', x: 430, yMin: 50, yMax: 360 }
  ],
  transitPipes: [
    {
      id: 'sh-sh-exit-pipe',
      startX: 100,
      startY: 330,
      endX: 100,
      endY: 330,
      label: '➔ ВИХІД У ЦИТАДЕЛЬ',
      targetLocationId: 'shaded-citadel',
      targetSpawnX: 720,
      targetSpawnY: 650
    }
  ],
  items: [
    { id: 'sh-sh-fruit-1', type: 'berry', x: 280, y: 330 }
  ]
};

export const BUILTIN_LOCATIONS: CustomLocationData[] = [
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
  SHELTER_SHADED_LOCATION
];
