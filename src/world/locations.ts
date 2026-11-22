import type { CustomLocationData, EditorPlatform } from '../types';

// Safe spawn resolver for arbitrary entity dimensions: prevents spawning inside walls/monoliths
export function resolveSafeEntitySpawn(
  loc: CustomLocationData,
  entityWidth: number,
  entityHeight: number,
  requestedX?: number,
  requestedY?: number
): { x: number; y: number } {
  const maxW = Math.max(200, loc.width || 1000);
  const maxH = Math.max(200, loc.height || 580);
  let x = typeof requestedX === 'number' && Number.isFinite(requestedX) ? requestedX : (loc.playerSpawn?.x ?? 180);
  let y = typeof requestedY === 'number' && Number.isFinite(requestedY) ? requestedY : (loc.playerSpawn?.y ?? 420);

  x = Math.max(18, Math.min(maxW - entityWidth - 18, x));
  y = Math.max(20, Math.min(maxH - entityHeight - 20, y));

  // Multiple passes ensure pushing out of one solid block does not overlap an adjacent wall
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const plat of loc.platforms) {
      const isSolidBlock = plat.type === 'wall' || plat.type === 'shelter' || plat.h >= 45;
      if (!isSolidBlock) continue;
      const overlapX = x + entityWidth > plat.x && x < plat.x + plat.w;
      const overlapY = y + entityHeight > plat.y + 4 && y < plat.y + plat.h - 4;
      if (overlapX && overlapY) {
        if (y + entityHeight - plat.y <= 38 && plat.y >= entityHeight + 8) {
          y = plat.y - entityHeight - 2;
          moved = true;
        } else {
          const distLeft = Math.abs(x + entityWidth - plat.x);
          const distRight = Math.abs(plat.x + plat.w - x);
          if (distLeft <= distRight && plat.x - entityWidth - 4 >= 16) {
            x = plat.x - entityWidth - 4;
            moved = true;
          } else if (plat.x + plat.w + 4 <= maxW - entityWidth - 16) {
            x = plat.x + plat.w + 4;
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }

  return { x: Math.round(x), y: Math.round(y) };
}

export function resolveSafeSpawn(
  loc: CustomLocationData,
  requestedX?: number,
  requestedY?: number
): { x: number; y: number } {
  return resolveSafeEntitySpawn(loc, 24, 38, requestedX, requestedY);
}

export function resolveSafeLizardSpawn(
  loc: CustomLocationData,
  requestedX?: number,
  requestedY?: number
): { x: number; y: number } {
  return resolveSafeEntitySpawn(loc, 52, 24, requestedX, requestedY);
}

export function getLocationFloorY(loc: CustomLocationData): number {
  let lowestTop = (loc.height || 580) - 60;
  let widestFloor: EditorPlatform | null = null;
  for (const plat of loc.platforms) {
    if (plat.w >= 200 && plat.y >= (loc.height || 580) * 0.55) {
      if (!widestFloor || plat.w > widestFloor.w) {
        widestFloor = plat;
      }
    }
  }
  if (widestFloor) {
    lowestTop = widestFloor.y;
  }
  return lowestTop;
}

// ============================================================================
// MAIN WORLD REGIONS (6 INTERCONNECTED BIOMES)
// Every pipe sits 20-25px above a walkable surface and connects bidirectionally.
// Every tall barrier has vertical climbing poles flanking it so pathfinding works cleanly.
// ============================================================================

// 1. Окраїни (Outskirts - SU)
export const DEFAULT_OUTSKIRTS_LOCATION: CustomLocationData = {
  id: 'outskirts-default',
  name: 'Окраїни (Outskirts)',
  region: 'SU',
  version: 2,
  width: 1200,
  height: 640,
  playerSpawn: { x: 180, y: 530 },
  npcSpawn: { x: 820, y: 530 },
  lizardDen: { x: 1005, y: 135, w: 75, h: 65, spawnX: 985, spawnY: 155 },
  platforms: [
    // Continuous ground floor
    { id: 'su-ground', x: 0, y: 580, w: 1200, h: 60, type: 'concrete', label: 'Окраїни' },

    // Left stepped tower shelves
    { id: 'su-shelf-1', x: 30, y: 460, w: 150, h: 18, type: 'metal' },
    { id: 'su-shelf-2', x: 20, y: 340, w: 150, h: 18, type: 'metal' },
    { id: 'su-shelf-3', x: 30, y: 220, w: 150, h: 18, type: 'metal' },

    // Walkable monolith platforms (stepped heights so Slugcat & Lizards can traverse smoothly)
    { id: 'su-mono-1', x: 240, y: 430, w: 110, h: 150, type: 'concrete', label: '히' },
    { id: 'su-mono-2', x: 460, y: 370, w: 110, h: 210, type: 'concrete', label: '어' },
    { id: 'su-mono-3', x: 630, y: 320, w: 100, h: 260, type: 'concrete', label: 'F' },
    { id: 'su-mono-4', x: 840, y: 420, w: 120, h: 160, type: 'concrete', label: 'ㄷ' },

    // Barrier wall with poles on both sides
    { id: 'su-wall-1', x: 765, y: 420, w: 24, h: 160, type: 'wall', label: "БАР'ЄР" },

    // Upper steel transit girders & lizard den ledge
    { id: 'su-bridge-mid', x: 320, y: 200, w: 480, h: 18, type: 'pipe', label: 'ВЕРХНЯ МАГІСТРАЛЬ' },
    { id: 'su-bridge-den', x: 920, y: 200, w: 260, h: 20, type: 'metal', label: 'ПЛАТФОРМА ЛІГВА' }
  ],
  poles: [
    { id: 'su-pole-1', x: 185, yMin: 180, yMax: 580 },
    { id: 'su-pole-2', x: 385, yMin: 100, yMax: 580 },
    { id: 'su-pole-3', x: 590, yMin: 140, yMax: 580 },
    { id: 'su-pole-4', x: 745, yMin: 160, yMax: 580 },
    { id: 'su-pole-5', x: 810, yMin: 160, yMax: 580 },
    { id: 'su-pole-6', x: 980, yMin: 160, yMax: 580 }
  ],
  transitPipes: [
    // Local internal shortcuts (both ends grounded cleanly above walkable surfaces)
    { id: 'su-sc-1', startX: 140, startY: 438, endX: 460, endY: 178, label: 'Тунель-шлях 1' },
    { id: 'su-sc-2', startX: 680, startY: 556, endX: 900, endY: 398, label: 'Тунель-шлях 2' },

    // Entrance to dedicated Shelter SU-S01
    {
      id: 'pipe-shelter-enter',
      startX: 1060,
      startY: 556,
      endX: 1110,
      endY: 556,
      label: '⛊ УКРИТТЯ SU-S01',
      isShelterPipe: true,
      targetLocationId: 'shelter-outskirts',
      targetSpawnX: 120,
      targetSpawnY: 315
    },

    // Subterranean Transit Tunnel into dedicated Lizard Den chamber
    {
      id: 'pipe-outskirts-to-den',
      startX: 1040,
      startY: 178,
      endX: 1085,
      endY: 178,
      label: '▼ ЛІГВО РОЖЕВОГО ЯЩЕРА',
      isDenPipe: true,
      targetLocationId: 'lizard-den-outskirts',
      targetSpawnX: 120,
      targetSpawnY: 315
    },

    // East Pipe -> Drainage System West
    {
      id: 'pipe-outskirts-to-drainage',
      startX: 1160,
      startY: 556,
      endX: 1190,
      endY: 556,
      label: '➔ ДРЕНАЖНА СИСТЕМА',
      targetLocationId: 'drainage-system',
      targetSpawnX: 95,
      targetSpawnY: 500
    },

    // West Pipe -> Industrial Complex East
    {
      id: 'pipe-outskirts-to-industrial',
      startX: 45,
      startY: 556,
      endX: 12,
      endY: 556,
      label: '➔ ПРОМИСЛОВИЙ КОМПЛЕКС',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 1690,
      targetSpawnY: 770
    }
  ],
  items: [
    { id: 'su-spear-1', type: 'spear', x: 280, y: 410 },
    { id: 'su-spear-2', type: 'spear', x: 660, y: 300 },
    { id: 'su-espear-1', type: 'explosive_spear', x: 705, y: 300 },
    { id: 'su-rock-1', type: 'rock', x: 495, y: 350 },
    { id: 'su-rock-2', type: 'rock', x: 890, y: 400 },
    { id: 'su-cherry-1', type: 'cherrybomb', x: 325, y: 410 },
    { id: 'su-pearl-1', type: 'pearl', x: 85, y: 200, pearlVariant: 0 },
    { id: 'su-batfly-1', type: 'batfly', x: 420, y: 270 },
    { id: 'su-batfly-2', type: 'batfly', x: 740, y: 240 },
    { id: 'su-berry-1', type: 'berry', x: 370, y: 180 },
    { id: 'su-berry-2', type: 'berry', x: 430, y: 180 },
    { id: 'su-berry-3', type: 'berry', x: 510, y: 180 },
    { id: 'su-berry-4', type: 'berry', x: 620, y: 180 },
    { id: 'su-berry-5', type: 'berry', x: 95, y: 320 },
    { id: 'su-berry-6', type: 'berry', x: 1090, y: 180 }
  ]
};

// 2. Дренажна система (Drainage System - DS)
export const DRAINAGE_SYSTEM_LOCATION: CustomLocationData = {
  id: 'drainage-system',
  name: 'Дренажна система (Drainage System)',
  region: 'DS',
  version: 2,
  width: 1600,
  height: 760,
  playerSpawn: { x: 100, y: 500 },
  npcSpawn: { x: 1260, y: 650 },
  lizardDen: { x: 1360, y: 635, w: 80, h: 65, spawnX: 1330, spawnY: 655 },
  platforms: [
    // Continuous stepped bottom basin (no inescapable void pit!)
    { id: 'ds-ground-w', x: 0, y: 700, w: 620, h: 60, type: 'concrete', label: 'Дренаж-Захід' },
    { id: 'ds-basin-bridge', x: 620, y: 720, w: 140, h: 40, type: 'metal', label: 'РЕШІТКА' },
    { id: 'ds-ground-e', x: 760, y: 700, w: 840, h: 60, type: 'concrete', label: 'Дренаж-Схід' },

    // Sluice walls (flanked by poles on both sides)
    { id: 'ds-wall-left', x: 340, y: 470, w: 34, h: 230, type: 'wall', label: 'ШЛЮЗ A' },
    { id: 'ds-wall-center', x: 940, y: 440, w: 40, h: 260, type: 'wall', label: 'ШЛЮЗ B' },

    // West entrance shelf & interconnected upper pipe conduits
    { id: 'ds-west-entry', x: 0, y: 540, w: 220, h: 22, type: 'metal', label: 'ВХІД SU' },
    { id: 'ds-plat-mid1', x: 250, y: 450, w: 300, h: 20, type: 'pipe' },
    { id: 'ds-plat-top', x: 460, y: 280, w: 540, h: 18, type: 'pipe', label: 'ВЕРХНІЙ КОЛЕКТОР' },
    { id: 'ds-plat-mid2', x: 800, y: 420, w: 340, h: 20, type: 'metal' },
    { id: 'ds-east-deck', x: 1240, y: 380, w: 360, h: 24, type: 'concrete', label: 'ШЛЮЗ СХІДНИЙ' }
  ],
  poles: [
    { id: 'ds-pole-1', x: 190, yMin: 280, yMax: 700 },
    { id: 'ds-pole-2', x: 315, yMin: 280, yMax: 700 },
    { id: 'ds-pole-3', x: 410, yMin: 240, yMax: 700 },
    { id: 'ds-pole-4', x: 690, yMin: 240, yMax: 720 },
    { id: 'ds-pole-5', x: 910, yMin: 240, yMax: 700 },
    { id: 'ds-pole-6', x: 1020, yMin: 240, yMax: 700 },
    { id: 'ds-pole-7', x: 1280, yMin: 260, yMax: 700 }
  ],
  transitPipes: [
    { id: 'ds-sc-1', startX: 280, startY: 428, endX: 520, endY: 258, label: 'Колектор 1' },
    { id: 'ds-sc-2', startX: 850, startY: 398, endX: 1120, endY: 676, label: 'Колектор 2' },

    // Shelter DS-S02
    {
      id: 'ds-pipe-shelter',
      startX: 1360,
      startY: 356,
      endX: 1410,
      endY: 356,
      label: '⛊ УКРИТТЯ DS-S02',
      isShelterPipe: true,
      targetLocationId: 'shelter-drainage',
      targetSpawnX: 120,
      targetSpawnY: 315
    },

    // West Pipe -> Outskirts East
    {
      id: 'ds-pipe-to-outskirts',
      startX: 45,
      startY: 516,
      endX: 12,
      endY: 516,
      label: '➔ ОКРАЇНИ',
      targetLocationId: 'outskirts-default',
      targetSpawnX: 1105,
      targetSpawnY: 530
    },

    // East Pipe -> Garbage Wastes West
    {
      id: 'ds-pipe-to-garbage',
      startX: 1555,
      startY: 356,
      endX: 1588,
      endY: 356,
      label: '➔ СМІТТЄЗВАЛИЩЕ',
      targetLocationId: 'garbage-wastes',
      targetSpawnX: 95,
      targetSpawnY: 590
    }
  ],
  items: [
    { id: 'ds-spear-1', type: 'spear', x: 140, y: 520 },
    { id: 'ds-spear-2', type: 'spear', x: 860, y: 400 },
    { id: 'ds-spear-3', type: 'spear', x: 1310, y: 360 },
    { id: 'ds-cherry-1', type: 'cherrybomb', x: 520, y: 430 },
    { id: 'ds-pearl-1', type: 'pearl', x: 690, y: 260, pearlVariant: 1 },
    { id: 'ds-batfly-1', type: 'batfly', x: 610, y: 380 },
    { id: 'ds-batfly-2', type: 'batfly', x: 1120, y: 300 },
    { id: 'ds-rock-1', type: 'rock', x: 480, y: 680 },
    { id: 'ds-rock-2', type: 'rock', x: 1100, y: 680 },
    { id: 'ds-berry-1', type: 'berry', x: 520, y: 260 },
    { id: 'ds-berry-2', type: 'berry', x: 600, y: 260 },
    { id: 'ds-berry-3', type: 'berry', x: 760, y: 260 },
    { id: 'ds-berry-4', type: 'berry', x: 840, y: 260 },
    { id: 'ds-berry-5', type: 'berry', x: 920, y: 260 }
  ]
};

// 3. Промисловий комплекс (Industrial Complex - HI)
export const INDUSTRIAL_COMPLEX_LOCATION: CustomLocationData = {
  id: 'industrial-complex',
  name: 'Промисловий комплекс (Industrial Complex)',
  region: 'HI',
  version: 2,
  width: 1800,
  height: 880,
  playerSpawn: { x: 150, y: 760 },
  npcSpawn: { x: 1380, y: 760 },
  lizardDen: { x: 1440, y: 755, w: 80, h: 65, spawnX: 1410, spawnY: 775 },
  platforms: [
    // Bottom foundation
    { id: 'hi-ground', x: 0, y: 820, w: 1800, h: 60, type: 'concrete', label: 'ПРОМ-ЗОНА' },

    // West, Center & East towers
    { id: 'hi-tower-1', x: 260, y: 380, w: 90, h: 440, type: 'concrete', label: 'ВЕЖА 1' },
    { id: 'hi-tower-2', x: 780, y: 240, w: 120, h: 580, type: 'concrete', label: 'ВЕЖА 2' },
    { id: 'hi-tower-3', x: 1320, y: 340, w: 100, h: 480, type: 'concrete', label: 'ВЕЖА 3' },

    // Catwalk bridges connecting all towers and outer ledges
    { id: 'hi-catwalk-west', x: 0, y: 260, w: 280, h: 20, type: 'pipe', label: 'ТУНЕЛЬ НА ЗВАЛИЩЕ' },
    { id: 'hi-catwalk-1', x: 350, y: 520, w: 430, h: 18, type: 'metal' },
    { id: 'hi-catwalk-2', x: 900, y: 420, w: 420, h: 18, type: 'metal' },
    { id: 'hi-catwalk-east', x: 1420, y: 380, w: 380, h: 20, type: 'metal', label: 'МІСТ ЦИТАДЕЛІ' },
    { id: 'hi-pipe-sky', x: 240, y: 240, w: 1120, h: 18, type: 'pipe', label: 'МАГІСТРАЛЬ' },

    // Mid-level staging ledges
    { id: 'hi-plat-left', x: 40, y: 660, w: 170, h: 20, type: 'metal' },
    { id: 'hi-plat-mid', x: 480, y: 670, w: 220, h: 20, type: 'metal' },
    { id: 'hi-plat-right', x: 1020, y: 650, w: 240, h: 20, type: 'metal' }
  ],
  poles: [
    { id: 'hi-pole-1', x: 160, yMin: 240, yMax: 820 },
    { id: 'hi-pole-2', x: 380, yMin: 180, yMax: 820 },
    { id: 'hi-pole-3', x: 600, yMin: 220, yMax: 820 },
    { id: 'hi-pole-4', x: 940, yMin: 160, yMax: 820 },
    { id: 'hi-pole-5', x: 1180, yMin: 220, yMax: 820 },
    { id: 'hi-pole-6', x: 1480, yMin: 220, yMax: 820 },
    { id: 'hi-pole-7', x: 1670, yMin: 360, yMax: 820 }
  ],
  transitPipes: [
    { id: 'hi-sc-1', startX: 190, startY: 638, endX: 400, endY: 498, label: 'Шахта 1' },
    { id: 'hi-sc-2', startX: 740, startY: 498, endX: 930, endY: 398, label: 'Шахта 2' },
    { id: 'hi-sc-3', startX: 1280, startY: 398, endX: 1520, endY: 796, label: 'Шахта 3' },

    // Shelter HI-S01
    {
      id: 'hi-pipe-shelter',
      startX: 110,
      startY: 796,
      endX: 60,
      endY: 796,
      label: '⛊ УКРИТТЯ HI-S01',
      isShelterPipe: true,
      targetLocationId: 'shelter-industrial',
      targetSpawnX: 120,
      targetSpawnY: 315
    },

    // East Ground Pipe -> Outskirts West
    {
      id: 'hi-pipe-to-outskirts',
      startX: 1755,
      startY: 796,
      endX: 1788,
      endY: 796,
      label: '➔ ОКРАЇНИ',
      targetLocationId: 'outskirts-default',
      targetSpawnX: 95,
      targetSpawnY: 530
    },

    // West Upper Pipe -> Garbage Wastes East
    {
      id: 'hi-pipe-to-garbage',
      startX: 50,
      startY: 236,
      endX: 12,
      endY: 236,
      label: '➔ СМІТТЄЗВАЛИЩЕ',
      targetLocationId: 'garbage-wastes',
      targetSpawnX: 1300,
      targetSpawnY: 220
    },

    // Top Sky Tower Pipe -> Chimney Canopy West Ground
    {
      id: 'hi-pipe-to-chimney',
      startX: 840,
      startY: 216,
      endX: 840,
      endY: 165,
      label: '➔ ДИМАРІ (ВГОРУ)',
      targetLocationId: 'chimney-canopy',
      targetSpawnX: 145,
      targetSpawnY: 820
    },

    // East Catwalk Pipe -> Shaded Citadel West
    {
      id: 'hi-pipe-to-shaded',
      startX: 1755,
      startY: 356,
      endX: 1788,
      endY: 356,
      label: '➔ ЗАТІНЕНА ЦИТАДЕЛЬ',
      targetLocationId: 'shaded-citadel',
      targetSpawnX: 105,
      targetSpawnY: 200
    }
  ],
  items: [
    { id: 'hi-spear-1', type: 'spear', x: 290, y: 360 },
    { id: 'hi-spear-2', type: 'spear', x: 820, y: 220 },
    { id: 'hi-spear-3', type: 'spear', x: 1360, y: 320 },
    { id: 'hi-spear-4', type: 'spear', x: 560, y: 650 },
    { id: 'hi-espear-1', type: 'explosive_spear', x: 1080, y: 400 },
    { id: 'hi-pearl-1', type: 'pearl', x: 1620, y: 360, pearlVariant: 2 },
    { id: 'hi-batfly-1', type: 'batfly', x: 540, y: 380 },
    { id: 'hi-batfly-2', type: 'batfly', x: 1120, y: 310 },
    { id: 'hi-rock-1', type: 'rock', x: 420, y: 500 },
    { id: 'hi-rock-2', type: 'rock', x: 960, y: 400 },
    { id: 'hi-rock-3', type: 'rock', x: 1120, y: 630 },
    { id: 'hi-berry-1', type: 'berry', x: 420, y: 220 },
    { id: 'hi-berry-2', type: 'berry', x: 520, y: 220 },
    { id: 'hi-berry-3', type: 'berry', x: 640, y: 220 },
    { id: 'hi-berry-4', type: 'berry', x: 1020, y: 220 },
    { id: 'hi-berry-5', type: 'berry', x: 1140, y: 220 }
  ]
};

// 4. Сміттєзвалище (Garbage Wastes - GW)
export const GARBAGE_WASTES_LOCATION: CustomLocationData = {
  id: 'garbage-wastes',
  name: 'Сміттєзвалище (Garbage Wastes)',
  region: 'GW',
  version: 2,
  width: 1400,
  height: 700,
  playerSpawn: { x: 110, y: 590 },
  npcSpawn: { x: 1080, y: 590 },
  lizardDen: { x: 1250, y: 575, w: 80, h: 65, spawnX: 1220, spawnY: 595 },
  platforms: [
    // Scrap floor
    { id: 'gw-ground', x: 0, y: 640, w: 1400, h: 60, type: 'concrete', label: 'КУПИ МЕТАЛОБРУХТУ' },

    // Scrap piles & flanked barrier walls
    { id: 'gw-pile-1', x: 250, y: 490, w: 120, h: 150, type: 'metal', label: 'БРУХТ' },
    { id: 'gw-wall-1', x: 375, y: 410, w: 28, h: 230, type: 'wall', label: 'ЩИТ' },
    { id: 'gw-pile-2', x: 540, y: 430, w: 150, h: 210, type: 'concrete' },
    { id: 'gw-pile-3', x: 800, y: 460, w: 120, h: 180, type: 'metal' },
    { id: 'gw-wall-2', x: 925, y: 390, w: 28, h: 250, type: 'wall', label: 'ЗВАЛИЩЕ' },

    // Overhead rusty pipes forming continuous high traversal route
    { id: 'gw-pipe-1', x: 80, y: 270, w: 360, h: 18, type: 'pipe' },
    { id: 'gw-pipe-2', x: 470, y: 230, w: 430, h: 18, type: 'pipe' },
    { id: 'gw-pipe-3', x: 930, y: 270, w: 470, h: 18, type: 'pipe', label: 'СХІДНИЙ ВИХІД' }
  ],
  poles: [
    { id: 'gw-pole-1', x: 190, yMin: 250, yMax: 640 },
    { id: 'gw-pole-2', x: 435, yMin: 210, yMax: 640 },
    { id: 'gw-pole-3', x: 740, yMin: 210, yMax: 640 },
    { id: 'gw-pole-4', x: 990, yMin: 230, yMax: 640 },
    { id: 'gw-pole-5', x: 1200, yMin: 250, yMax: 640 }
  ],
  transitPipes: [
    { id: 'gw-sc-1', startX: 280, startY: 468, endX: 520, endY: 208, label: 'Нора брухту 1' },
    { id: 'gw-sc-2', startX: 670, startY: 408, endX: 980, endY: 248, label: 'Нора брухту 2' },

    // Shelter GW-S05
    {
      id: 'gw-pipe-shelter',
      startX: 1120,
      startY: 616,
      endX: 1170,
      endY: 616,
      label: '⛊ УКРИТТЯ GW-S05',
      isShelterPipe: true,
      targetLocationId: 'shelter-garbage',
      targetSpawnX: 120,
      targetSpawnY: 315
    },

    // West Pipe -> Drainage System East
    {
      id: 'gw-pipe-to-drainage',
      startX: 45,
      startY: 616,
      endX: 12,
      endY: 616,
      label: '➔ ДРЕНАЖНА СИСТЕМА',
      targetLocationId: 'drainage-system',
      targetSpawnX: 1500,
      targetSpawnY: 335
    },

    // East Pipe -> Industrial Complex West Upper
    {
      id: 'gw-pipe-to-industrial',
      startX: 1355,
      startY: 246,
      endX: 1388,
      endY: 246,
      label: '➔ ПРОМИСЛОВИЙ КОМПЛЕКС',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 105,
      targetSpawnY: 215
    }
  ],
  items: [
    { id: 'gw-spear-1', type: 'spear', x: 300, y: 470 },
    { id: 'gw-spear-2', type: 'spear', x: 600, y: 410 },
    { id: 'gw-spear-3', type: 'spear', x: 840, y: 440 },
    { id: 'gw-espear-1', type: 'explosive_spear', x: 640, y: 410 },
    { id: 'gw-cherry-1', type: 'cherrybomb', x: 290, y: 250 },
    { id: 'gw-cherry-2', type: 'cherrybomb', x: 880, y: 440 },
    { id: 'gw-pearl-1', type: 'pearl', x: 1060, y: 250, pearlVariant: 3 },
    { id: 'gw-batfly-1', type: 'batfly', x: 480, y: 320 },
    { id: 'gw-rock-1', type: 'rock', x: 160, y: 620 },
    { id: 'gw-rock-2', type: 'rock', x: 480, y: 620 },
    { id: 'gw-rock-3', type: 'rock', x: 760, y: 620 },
    { id: 'gw-berry-1', type: 'berry', x: 520, y: 210 },
    { id: 'gw-berry-2', type: 'berry', x: 600, y: 210 },
    { id: 'gw-berry-3', type: 'berry', x: 680, y: 210 },
    { id: 'gw-berry-4', type: 'berry', x: 760, y: 210 }
  ]
};

// 5. Димарі (Chimney Canopy - CC)
export const CHIMNEY_CANOPY_LOCATION: CustomLocationData = {
  id: 'chimney-canopy',
  name: 'Димарі (Chimney Canopy)',
  region: 'CC',
  version: 2,
  width: 1600,
  height: 940,
  playerSpawn: { x: 145, y: 820 },
  npcSpawn: { x: 1080, y: 480 },
  lizardDen: { x: 1310, y: 805, w: 80, h: 65, spawnX: 1280, spawnY: 825 },
  platforms: [
    // Continuous stepped lower bridge & foundation (no death trap pit)
    { id: 'cc-ground-left', x: 0, y: 870, w: 460, h: 70, type: 'concrete', label: 'ЗАХІДНИЙ ПІЛОН' },
    { id: 'cc-ground-bridge', x: 460, y: 890, w: 720, h: 50, type: 'pipe', label: 'НИЖНІЙ ПЕРЕХІД' },
    { id: 'cc-ground-right', x: 1180, y: 870, w: 420, h: 70, type: 'concrete', label: 'СХІДНИЙ ПІЛОН' },

    // Towering chimney structures
    { id: 'cc-tower-w', x: 240, y: 400, w: 100, h: 470, type: 'concrete', label: 'ВЕЖА CC-1' },
    { id: 'cc-tower-mid', x: 720, y: 280, w: 120, h: 610, type: 'concrete', label: 'ГОЛОВНИЙ ДИМАР' },
    { id: 'cc-tower-e', x: 1240, y: 360, w: 100, h: 510, type: 'concrete', label: 'ВЕЖА CC-2' },

    // High-altitude metal catwalks
    { id: 'cc-catwalk-low', x: 340, y: 650, w: 380, h: 18, type: 'metal' },
    { id: 'cc-catwalk-mid', x: 840, y: 530, w: 400, h: 18, type: 'metal' },
    { id: 'cc-catwalk-high', x: 340, y: 380, w: 380, h: 18, type: 'metal', label: 'МЕТАЛЕВИЙ МІСТ' },
    { id: 'cc-catwalk-sky', x: 840, y: 260, w: 440, h: 18, type: 'metal', label: 'ВЕРХНІЙ МІСТ' },

    // Outer pipe ledges
    { id: 'cc-pipe-w', x: 60, y: 500, w: 180, h: 18, type: 'pipe' },
    { id: 'cc-pipe-e', x: 1340, y: 500, w: 260, h: 18, type: 'pipe', label: 'ШЛЯХ ДО ЦИТАДЕЛІ' }
  ],
  poles: [
    { id: 'cc-pole-1', x: 170, yMin: 380, yMax: 870 },
    { id: 'cc-pole-2', x: 375, yMin: 340, yMax: 890 },
    { id: 'cc-pole-3', x: 580, yMin: 340, yMax: 890 },
    { id: 'cc-pole-4', x: 880, yMin: 240, yMax: 890 },
    { id: 'cc-pole-5', x: 1120, yMin: 240, yMax: 890 },
    { id: 'cc-pole-6', x: 1410, yMin: 340, yMax: 870 }
  ],
  transitPipes: [
    { id: 'cc-sc-1', startX: 290, startY: 378, endX: 430, endY: 628, label: 'Шахта CC-1' },
    { id: 'cc-sc-2', startX: 800, startY: 508, endX: 940, endY: 238, label: 'Шахта CC-2' },

    // Shelter CC-S03 (on accessible catwalk-high)
    {
      id: 'cc-pipe-shelter',
      startX: 640,
      startY: 356,
      endX: 690,
      endY: 356,
      label: '⛊ УКРИТТЯ CC-S03',
      isShelterPipe: true,
      targetLocationId: 'shelter-chimney',
      targetSpawnX: 120,
      targetSpawnY: 315
    },

    // Down Pipe -> Industrial Complex Top Sky
    {
      id: 'cc-pipe-to-industrial',
      startX: 70,
      startY: 846,
      endX: 70,
      endY: 890,
      label: '➔ ПРОМ-КОМПЛЕКС (ВНИЗ)',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 840,
      targetSpawnY: 195
    },

    // East Pipe -> Shaded Citadel West
    {
      id: 'cc-pipe-to-shaded',
      startX: 1555,
      startY: 476,
      endX: 1588,
      endY: 476,
      label: '➔ ЗАТІНЕНА ЦИТАДЕЛЬ',
      targetLocationId: 'shaded-citadel',
      targetSpawnX: 105,
      targetSpawnY: 200
    }
  ],
  items: [
    { id: 'cc-spear-1', type: 'spear', x: 270, y: 380 },
    { id: 'cc-spear-2', type: 'spear', x: 760, y: 260 },
    { id: 'cc-spear-3', type: 'spear', x: 1280, y: 340 },
    { id: 'cc-espear-1', type: 'explosive_spear', x: 1020, y: 240 },
    { id: 'cc-pearl-1', type: 'pearl', x: 1180, y: 240, pearlVariant: 1 },
    { id: 'cc-batfly-1', type: 'batfly', x: 510, y: 520 },
    { id: 'cc-batfly-2', type: 'batfly', x: 1040, y: 410 },
    { id: 'cc-rock-1', type: 'rock', x: 400, y: 630 },
    { id: 'cc-rock-2', type: 'rock', x: 960, y: 240 },
    { id: 'cc-berry-1', type: 'berry', x: 440, y: 360 },
    { id: 'cc-berry-2', type: 'berry', x: 520, y: 360 },
    { id: 'cc-berry-3', type: 'berry', x: 920, y: 510 },
    { id: 'cc-berry-4', type: 'berry', x: 1000, y: 510 }
  ]
};

// 6. Затінена цитадель (Shaded Citadel - SH)
export const SHADED_CITADEL_LOCATION: CustomLocationData = {
  id: 'shaded-citadel',
  name: 'Затінена цитадель (Shaded Citadel)',
  region: 'SH',
  version: 2,
  width: 1500,
  height: 740,
  playerSpawn: { x: 105, y: 200 },
  npcSpawn: { x: 1180, y: 620 },
  lizardDen: { x: 1280, y: 615, w: 80, h: 65, spawnX: 1250, spawnY: 635 },
  platforms: [
    // Temple floor
    { id: 'sh-ground', x: 0, y: 680, w: 1500, h: 60, type: 'concrete', label: 'СКЛЕП ЦИТАДЕЛІ' },

    // Ancient stone pillars
    { id: 'sh-pillar-1', x: 250, y: 360, w: 90, h: 320, type: 'concrete', label: 'КОЛОНА 1' },
    { id: 'sh-pillar-2', x: 560, y: 300, w: 90, h: 380, type: 'concrete', label: 'КОЛОНА 2' },
    { id: 'sh-pillar-3', x: 920, y: 340, w: 100, h: 340, type: 'concrete', label: 'КОЛОНА 3' },
    { id: 'sh-pillar-4', x: 1240, y: 380, w: 90, h: 300, type: 'concrete', label: 'КОЛОНА 4' },

    // Temple arches & aqueduct
    { id: 'sh-arch-1', x: 0, y: 240, w: 280, h: 22, type: 'concrete', label: 'ВХІД ДИМАРІВ' },
    { id: 'sh-arch-2', x: 340, y: 440, w: 220, h: 20, type: 'metal' },
    { id: 'sh-arch-3', x: 650, y: 360, w: 270, h: 22, type: 'concrete' },
    { id: 'sh-arch-4', x: 1020, y: 450, w: 220, h: 20, type: 'metal' },
    { id: 'sh-high-beam', x: 430, y: 170, w: 660, h: 18, type: 'pipe', label: 'АКВЕДУК ТЕМРЯВИ' },

    // Crypt barriers flanked by poles
    { id: 'sh-wall-1', x: 420, y: 460, w: 28, h: 220, type: 'wall' },
    { id: 'sh-wall-2', x: 1110, y: 470, w: 28, h: 210, type: 'wall' }
  ],
  poles: [
    { id: 'sh-pole-1', x: 175, yMin: 220, yMax: 680 },
    { id: 'sh-pole-2', x: 480, yMin: 170, yMax: 680 },
    { id: 'sh-pole-3', x: 780, yMin: 170, yMax: 680 },
    { id: 'sh-pole-4', x: 1060, yMin: 170, yMax: 680 },
    { id: 'sh-pole-5', x: 1370, yMin: 240, yMax: 680 }
  ],
  transitPipes: [
    { id: 'sh-sc-1', startX: 295, startY: 338, endX: 370, endY: 418, label: 'Гробниця 1' },
    { id: 'sh-sc-2', startX: 680, startY: 338, endX: 1040, endY: 428, label: 'Гробниця 2' },

    // Shelter SH-S04
    {
      id: 'sh-pipe-shelter',
      startX: 760,
      startY: 656,
      endX: 810,
      endY: 656,
      label: '⛊ УКРИТТЯ SH-S04',
      isShelterPipe: true,
      targetLocationId: 'shelter-shaded',
      targetSpawnX: 120,
      targetSpawnY: 315
    },

    // West Pipe -> Chimney Canopy East
    {
      id: 'sh-pipe-to-chimney',
      startX: 45,
      startY: 216,
      endX: 12,
      endY: 216,
      label: '➔ ДИМАРІ',
      targetLocationId: 'chimney-canopy',
      targetSpawnX: 1495,
      targetSpawnY: 460
    },

    // East Pipe -> Industrial Complex East Catwalk
    {
      id: 'sh-pipe-to-industrial',
      startX: 1455,
      startY: 656,
      endX: 1488,
      endY: 656,
      label: '➔ ПРОМИСЛОВИЙ КОМПЛЕКС',
      targetLocationId: 'industrial-complex',
      targetSpawnX: 1695,
      targetSpawnY: 335
    }
  ],
  items: [
    { id: 'sh-spear-1', type: 'spear', x: 270, y: 340 },
    { id: 'sh-spear-2', type: 'spear', x: 950, y: 320 },
    { id: 'sh-cherry-1', type: 'cherrybomb', x: 440, y: 420 },
    { id: 'sh-pearl-1', type: 'pearl', x: 1120, y: 430, pearlVariant: 2 },
    { id: 'sh-batfly-1', type: 'batfly', x: 650, y: 260 },
    { id: 'sh-batfly-2', type: 'batfly', x: 900, y: 260 },
    { id: 'sh-rock-1', type: 'rock', x: 190, y: 660 },
    { id: 'sh-rock-2', type: 'rock', x: 740, y: 340 },
    { id: 'sh-rock-3', type: 'rock', x: 1320, y: 660 },
    { id: 'sh-berry-1', type: 'berry', x: 480, y: 150 },
    { id: 'sh-berry-2', type: 'berry', x: 560, y: 150 },
    { id: 'sh-berry-3', type: 'berry', x: 640, y: 150 },
    { id: 'sh-berry-4', type: 'berry', x: 720, y: 150 },
    { id: 'sh-berry-5', type: 'berry', x: 800, y: 150 }
  ]
};

// ============================================================================
// DEDICATED SHELTER ROOMS (БУНКЕРИ ГІБЕРНАЦІЇ)
// ============================================================================

function makeShelterLocation(cfg: {
  id: string;
  name: string;
  region: string;
  label: string;
  exitLabel: string;
  exitTargetId: string;
  exitX: number;
  exitY: number;
  berryPositions: Array<{ id: string; x: number; y: number }>;
}): CustomLocationData {
  return {
    id: cfg.id,
    name: cfg.name,
    region: cfg.region,
    version: 2,
    width: 580,
    height: 420,
    isShelterRoom: true,
    playerSpawn: { x: 280, y: 295 },
    npcSpawn: { x: 420, y: 310 },
    platforms: [
      { id: `${cfg.id}-floor`, x: 0, y: 360, w: 580, h: 60, type: 'metal', label: cfg.label },
      { id: `${cfg.id}-wall-l`, x: 0, y: 0, w: 56, h: 360, type: 'wall' },
      { id: `${cfg.id}-wall-r`, x: 524, y: 0, w: 56, h: 360, type: 'wall' },
      { id: `${cfg.id}-ceiling`, x: 0, y: 0, w: 580, h: 48, type: 'concrete' },
      { id: `${cfg.id}-bunk`, x: 210, y: 340, w: 160, h: 20, type: 'concrete' },
      { id: `${cfg.id}-pipe`, x: 80, y: 165, w: 420, h: 16, type: 'pipe' }
    ],
    poles: [
      { id: `${cfg.id}-pole-1`, x: 150, yMin: 48, yMax: 360 },
      { id: `${cfg.id}-pole-2`, x: 430, yMin: 48, yMax: 360 }
    ],
    transitPipes: [
      {
        id: `${cfg.id}-exit-pipe`,
        startX: 110,
        startY: 336,
        endX: 62,
        endY: 336,
        label: cfg.exitLabel,
        targetLocationId: cfg.exitTargetId,
        targetSpawnX: cfg.exitX,
        targetSpawnY: cfg.exitY
      }
    ],
    items: cfg.berryPositions.map(b => ({ id: b.id, type: 'berry', x: b.x, y: b.y }))
  };
}

export const SHELTER_OUTSKIRTS_LOCATION = makeShelterLocation({
  id: 'shelter-outskirts',
  name: 'Укриття SU-S01 (Shelter)',
  region: 'SU',
  label: 'УКРИТТЯ SU-S01',
  exitLabel: '➔ ВИХІД В ОКРАЇНИ',
  exitTargetId: 'outskirts-default',
  exitX: 1015,
  exitY: 530,
  berryPositions: [
    { id: 'su-sh-fruit-1', x: 340, y: 320 },
    { id: 'su-sh-fruit-2', x: 240, y: 320 }
  ]
});

export const SHELTER_DRAINAGE_LOCATION = makeShelterLocation({
  id: 'shelter-drainage',
  name: 'Укриття DS-S02 (Shelter)',
  region: 'DS',
  label: 'УКРИТТЯ DS-S02',
  exitLabel: '➔ ВИХІД У ДРЕНАЖ',
  exitTargetId: 'drainage-system',
  exitX: 1315,
  exitY: 335,
  berryPositions: [{ id: 'ds-sh-fruit-1', x: 290, y: 320 }]
});

export const SHELTER_INDUSTRIAL_LOCATION = makeShelterLocation({
  id: 'shelter-industrial',
  name: 'Укриття HI-S01 (Shelter)',
  region: 'HI',
  label: 'УКРИТТЯ HI-S01',
  exitLabel: '➔ ВИХІД У ПРОМ-ЗОНУ',
  exitTargetId: 'industrial-complex',
  exitX: 155,
  exitY: 770,
  berryPositions: [{ id: 'hi-sh-fruit-1', x: 290, y: 320 }]
});

export const SHELTER_GARBAGE_LOCATION = makeShelterLocation({
  id: 'shelter-garbage',
  name: 'Укриття GW-S05 (Shelter)',
  region: 'GW',
  label: 'УКРИТТЯ GW-S05',
  exitLabel: '➔ ВИХІД НА ЗВАЛИЩЕ',
  exitTargetId: 'garbage-wastes',
  exitX: 1075,
  exitY: 590,
  berryPositions: [{ id: 'gw-sh-fruit-1', x: 290, y: 320 }]
});

export const SHELTER_CHIMNEY_LOCATION = makeShelterLocation({
  id: 'shelter-chimney',
  name: 'Укриття CC-S03 (Shelter)',
  region: 'CC',
  label: 'УКРИТТЯ CC-S03',
  exitLabel: '➔ ВИХІД У ДИМАРІ',
  exitTargetId: 'chimney-canopy',
  exitX: 595,
  exitY: 335,
  berryPositions: [{ id: 'cc-sh-fruit-1', x: 290, y: 320 }]
});

export const SHELTER_SHADED_LOCATION = makeShelterLocation({
  id: 'shelter-shaded',
  name: 'Укриття SH-S04 (Shelter)',
  region: 'SH',
  label: 'УКРИТТЯ SH-S04',
  exitLabel: '➔ ВИХІД У ЦИТАДЕЛЬ',
  exitTargetId: 'shaded-citadel',
  exitX: 715,
  exitY: 630,
  berryPositions: [{ id: 'sh-sh-fruit-1', x: 290, y: 320 }]
});

// 13. Subterranean Lizard Den Location (Лігво Рожевого Ящера)
export const LIZARD_DEN_OUTSKIRTS_LOCATION: CustomLocationData = {
  id: 'lizard-den-outskirts',
  name: 'Лігво Рожевого Ящера (Lizard Den)',
  region: 'SU-DEN',
  version: 2,
  width: 800,
  height: 520,
  isLizardDenRoom: true,
  playerSpawn: { x: 135, y: 315 },
  npcSpawn: { x: 420, y: 340 },
  platforms: [
    { id: 'den-floor', x: 0, y: 440, w: 800, h: 80, type: 'concrete', label: 'ДНО ЛІГВА' },
    { id: 'den-wall-l', x: 0, y: 0, w: 66, h: 440, type: 'wall' },
    { id: 'den-wall-r', x: 734, y: 0, w: 66, h: 440, type: 'wall' },
    { id: 'den-ceiling', x: 0, y: 0, w: 800, h: 56, type: 'concrete' },
    { id: 'den-shelf-entry', x: 66, y: 360, w: 165, h: 22, type: 'pipe', label: 'ВХІДНИЙ ТУНЕЛЬ' },
    { id: 'den-nest-main', x: 300, y: 380, w: 260, h: 26, type: 'concrete', label: 'ГНІЗДО ХИЖАКА' },
    { id: 'den-upper-1', x: 200, y: 220, w: 180, h: 20, type: 'metal' },
    { id: 'den-upper-2', x: 480, y: 200, w: 190, h: 20, type: 'concrete' }
  ],
  poles: [
    { id: 'den-pole-1', x: 225, yMin: 56, yMax: 440 },
    { id: 'den-pole-2', x: 520, yMin: 56, yMax: 440 }
  ],
  transitPipes: [
    {
      id: 'den-exit-pipe',
      startX: 115,
      startY: 336,
      endX: 72,
      endY: 336,
      label: '➔ ВИХІД В ОКРАЇНИ',
      isDenPipe: true,
      targetLocationId: 'outskirts-default',
      targetSpawnX: 995,
      targetSpawnY: 155
    }
  ],
  items: [
    { id: 'den-spear-1', type: 'spear', x: 360, y: 360 },
    { id: 'den-rock-1', type: 'rock', x: 460, y: 360 },
    { id: 'den-berry-1', type: 'berry', x: 240, y: 200 },
    { id: 'den-berry-2', type: 'berry', x: 550, y: 180 }
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
  SHELTER_SHADED_LOCATION,
  LIZARD_DEN_OUTSKIRTS_LOCATION
];

export function getLocationById(id: string | undefined | null): CustomLocationData | undefined {
  if (!id) return undefined;
  return BUILTIN_LOCATIONS.find(l => l.id === id);
}
