// Persistent Settings & Identity Manager (Nickname, Graphics, Audio, Keybindings)
import { useEffect, useState } from 'react';

export type GraphicsPreset = 'low' | 'medium' | 'high';

export interface GraphicsSettings {
  preset: GraphicsPreset;
  rainEffects: boolean;
  particles: boolean;
  scanlines: boolean;
  vignette: boolean;
  glowEffects: boolean;
  resolutionScale: number; // 0.65 | 0.85 | 1 | 1.5
}

export interface AudioSettings {
  musicVolume: number; // 0..1
  sfxVolume: number;   // 0..1
}

export interface KeyBindings {
  moveLeft: string;
  moveRight: string;
  moveUp: string;
  moveDown: string;
  jump: string;
  grab: string;
  throwItem: string;
  eatBerry: string;
  toggleMap: string;
  carryPeer: string;
}

export interface GameSettings {
  nickname: string;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  keybinds: KeyBindings;
}

export const NICKNAME_STORAGE_KEY = 'rw_player_name';
export const SETTINGS_STORAGE_KEY = 'rw_game_settings_v1';

export const DEFAULT_KEYBINDS: KeyBindings = {
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  jump: 'Space',
  grab: 'KeyZ',
  throwItem: 'KeyX',
  eatBerry: 'KeyE',
  toggleMap: 'KeyM',
  carryPeer: 'KeyG',
};

export const KEYBIND_LABELS: Record<keyof KeyBindings, string> = {
  moveLeft: 'Рух вліво',
  moveRight: 'Рух вправо',
  moveUp: 'Вгору / Лізти по жердині',
  moveDown: 'Вниз / Присісти',
  jump: 'Стрибок',
  grab: 'Взяти / Покласти предмет',
  throwItem: 'Кинути спис або камінь',
  eatBerry: "З'їсти ягоду",
  toggleMap: 'Карта локації',
  carryPeer: 'Взяти гравця на спину',
};

export const GRAPHICS_PRESETS: Record<GraphicsPreset, GraphicsSettings> = {
  low: {
    preset: 'low',
    rainEffects: false,
    particles: false,
    scanlines: false,
    vignette: false,
    glowEffects: false,
    resolutionScale: 0.7,
  },
  medium: {
    preset: 'medium',
    rainEffects: true,
    particles: true,
    scanlines: true,
    vignette: true,
    glowEffects: false,
    resolutionScale: 1,
  },
  high: {
    preset: 'high',
    rainEffects: true,
    particles: true,
    scanlines: true,
    vignette: true,
    glowEffects: true,
    resolutionScale: 1,
  },
};

export function getPersistentNickname(): string {
  if (typeof window === 'undefined') return 'Слимакокіт-001';
  try {
    const saved = localStorage.getItem(NICKNAME_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim().slice(0, 20);
    }
    const generated = `Слимакокіт-${Math.floor(Math.random() * 899 + 100)}`;
    localStorage.setItem(NICKNAME_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'Слимакокіт-001';
  }
}

export function setPersistentNickname(name: string): string {
  const cleaned = name.trim().slice(0, 20) || getPersistentNickname();
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, cleaned);
  } catch {
    // ignore storage errors
  }
  return cleaned;
}

function loadInitialSettings(): GameSettings {
  const nickname = getPersistentNickname();
  const fallback: GameSettings = {
    nickname,
    graphics: { ...GRAPHICS_PRESETS.high },
    audio: { musicVolume: 0.65, sfxVolume: 0.75 },
    keybinds: { ...DEFAULT_KEYBINDS },
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const preset: GraphicsPreset =
      parsed?.graphics?.preset === 'low' ||
      parsed?.graphics?.preset === 'medium' ||
      parsed?.graphics?.preset === 'high'
        ? parsed.graphics.preset
        : 'high';

    return {
      nickname,
      graphics: {
        preset,
        rainEffects:
          typeof parsed?.graphics?.rainEffects === 'boolean'
            ? parsed.graphics.rainEffects
            : GRAPHICS_PRESETS[preset].rainEffects,
        particles:
          typeof parsed?.graphics?.particles === 'boolean'
            ? parsed.graphics.particles
            : GRAPHICS_PRESETS[preset].particles,
        scanlines:
          typeof parsed?.graphics?.scanlines === 'boolean'
            ? parsed.graphics.scanlines
            : GRAPHICS_PRESETS[preset].scanlines,
        vignette:
          typeof parsed?.graphics?.vignette === 'boolean'
            ? parsed.graphics.vignette
            : GRAPHICS_PRESETS[preset].vignette,
        glowEffects:
          typeof parsed?.graphics?.glowEffects === 'boolean'
            ? parsed.graphics.glowEffects
            : GRAPHICS_PRESETS[preset].glowEffects,
        resolutionScale:
          typeof parsed?.graphics?.resolutionScale === 'number' &&
          parsed.graphics.resolutionScale >= 0.5 &&
          parsed.graphics.resolutionScale <= 2
            ? parsed.graphics.resolutionScale
            : 1,
      },
      audio: {
        musicVolume:
          typeof parsed?.audio?.musicVolume === 'number'
            ? Math.max(0, Math.min(1, parsed.audio.musicVolume))
            : 0.65,
        sfxVolume:
          typeof parsed?.audio?.sfxVolume === 'number'
            ? Math.max(0, Math.min(1, parsed.audio.sfxVolume))
            : 0.75,
      },
      keybinds: {
        moveLeft: typeof parsed?.keybinds?.moveLeft === 'string' ? parsed.keybinds.moveLeft : DEFAULT_KEYBINDS.moveLeft,
        moveRight: typeof parsed?.keybinds?.moveRight === 'string' ? parsed.keybinds.moveRight : DEFAULT_KEYBINDS.moveRight,
        moveUp: typeof parsed?.keybinds?.moveUp === 'string' ? parsed.keybinds.moveUp : DEFAULT_KEYBINDS.moveUp,
        moveDown: typeof parsed?.keybinds?.moveDown === 'string' ? parsed.keybinds.moveDown : DEFAULT_KEYBINDS.moveDown,
        jump: typeof parsed?.keybinds?.jump === 'string' ? parsed.keybinds.jump : DEFAULT_KEYBINDS.jump,
        grab: typeof parsed?.keybinds?.grab === 'string' ? parsed.keybinds.grab : DEFAULT_KEYBINDS.grab,
        throwItem: typeof parsed?.keybinds?.throwItem === 'string' ? parsed.keybinds.throwItem : DEFAULT_KEYBINDS.throwItem,
        eatBerry: typeof parsed?.keybinds?.eatBerry === 'string' ? parsed.keybinds.eatBerry : DEFAULT_KEYBINDS.eatBerry,
        toggleMap: typeof parsed?.keybinds?.toggleMap === 'string' ? parsed.keybinds.toggleMap : DEFAULT_KEYBINDS.toggleMap,
        carryPeer: typeof parsed?.keybinds?.carryPeer === 'string' ? parsed.keybinds.carryPeer : DEFAULT_KEYBINDS.carryPeer,
      },
    };
  } catch {
    return fallback;
  }
}

let currentSettings: GameSettings = loadInitialSettings();
const listeners = new Set<(settings: GameSettings) => void>();

function emitSettings() {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        graphics: currentSettings.graphics,
        audio: currentSettings.audio,
        keybinds: currentSettings.keybinds,
      })
    );
  } catch {
    // ignore storage errors
  }
  listeners.forEach((cb) => cb(currentSettings));
}

export function getGameSettings(): GameSettings {
  return currentSettings;
}

export function updateNicknameSetting(name: string): string {
  const saved = setPersistentNickname(name);
  currentSettings = {
    ...currentSettings,
    nickname: saved,
  };
  emitSettings();
  return saved;
}

export function updateGraphicsSettings(partial: Partial<GraphicsSettings>) {
  currentSettings = {
    ...currentSettings,
    graphics: {
      ...currentSettings.graphics,
      ...partial,
    },
  };
  emitSettings();
}

export function applyGraphicsPreset(preset: GraphicsPreset) {
  currentSettings = {
    ...currentSettings,
    graphics: { ...GRAPHICS_PRESETS[preset] },
  };
  emitSettings();
}

export function updateAudioSettings(partial: Partial<AudioSettings>) {
  currentSettings = {
    ...currentSettings,
    audio: {
      ...currentSettings.audio,
      ...partial,
    },
  };
  emitSettings();
}

export function updateKeybind(action: keyof KeyBindings, newCode: string) {
  const prevCode = currentSettings.keybinds[action];
  const nextKeybinds = { ...currentSettings.keybinds };

  // Swap cleanly if another action already uses this key code
  (Object.keys(nextKeybinds) as Array<keyof KeyBindings>).forEach((k) => {
    if (k !== action && nextKeybinds[k] === newCode) {
      nextKeybinds[k] = prevCode;
    }
  });
  nextKeybinds[action] = newCode;

  currentSettings = {
    ...currentSettings,
    keybinds: nextKeybinds,
  };
  emitSettings();
}

export function resetKeybinds() {
  currentSettings = {
    ...currentSettings,
    keybinds: { ...DEFAULT_KEYBINDS },
  };
  emitSettings();
}

export function subscribeGameSettings(cb: (settings: GameSettings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useGameSettings(): GameSettings {
  const [settings, setSettings] = useState<GameSettings>(() => getGameSettings());
  useEffect(() => {
    setSettings(getGameSettings());
    return subscribeGameSettings(setSettings);
  }, []);
  return settings;
}

export function formatKeyCode(code: string): string {
  if (!code) return '—';
  if (code === 'Space') return 'ПРОБІЛ';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'Tab') return 'TAB';
  if (code === 'Enter') return 'ENTER';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  return code.toUpperCase();
}
