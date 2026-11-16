// Rain World Authentic Music Manager using Web Audio API
// 100% immune to OS Media Player Notification (MediaSession) in notification shade
// Eliminates track overlapping via single authoritative source cross-fading

import { getGameSettings } from '../settings';

export type MusicCategory = 'menu' | 'game' | 'battle' | 'none';

export interface MusicTrackInfo {
  id: string;
  title: string;
  category: 'menu' | 'game' | 'battle';
  url: string;
}

const BASE_URL = (((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './').replace(/\/?$/, '/');

function resolveAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return `${BASE_URL}${clean}`;
}

export const MUSIC_TRACK_CATALOG: MusicTrackInfo[] = [
  { id: 'menu_1', title: 'Меню #1 — Окраїни (Атмосфера)', category: 'menu', url: resolveAssetUrl('Music/Main_menu/main_menu1.mp3') },
  { id: 'menu_2', title: 'Меню #2 — Вічна злива', category: 'menu', url: resolveAssetUrl('Music/Main_menu/main_menu2.mp3') },
  { id: 'game_1', title: 'У грі #1 — Руїни', category: 'game', url: resolveAssetUrl('Music/In_game/in_game1.mp3') },
  { id: 'game_2', title: 'У грі #2 — Дослідження', category: 'game', url: resolveAssetUrl('Music/In_game/in_game2.mp3') },
  { id: 'game_3', title: 'У грі #3 — Тунель', category: 'game', url: resolveAssetUrl('Music/In_game/in_game3.mp3') },
  { id: 'battle_1', title: 'Бій #1 — Небезпека', category: 'battle', url: resolveAssetUrl('Music/In_battle/in_battle1.mp3') },
  { id: 'battle_2', title: 'Бій #2 — Загроза', category: 'battle', url: resolveAssetUrl('Music/In_battle/in_battle2.mp3') },
  { id: 'battle_3', title: 'Бій #3 — Переслідування', category: 'battle', url: resolveAssetUrl('Music/In_battle/in_battle3.mp3') },
  { id: 'battle_4', title: 'Бій #4 — Сутичка', category: 'battle', url: resolveAssetUrl('Music/In_battle/in_battle4.mp3') },
];

const TRACKS: Record<'menu' | 'game' | 'battle', string[]> = {
  menu: MUSIC_TRACK_CATALOG.filter(t => t.category === 'menu').map(t => t.url),
  game: MUSIC_TRACK_CATALOG.filter(t => t.category === 'game').map(t => t.url),
  battle: MUSIC_TRACK_CATALOG.filter(t => t.category === 'battle').map(t => t.url),
};

const FAILED_RETRY_COOLDOWN_MS = 15000;

export interface MusicManagerState {
  currentCategory: MusicCategory;
  currentTrackUrl: string;
  isPreviewing: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  lastError: string | null;
}

class MusicManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private hpFilter: BiquadFilterNode | null = null;

  // Active audio nodes
  private currentSource: AudioBufferSourceNode | null = null;
  private currentGain: GainNode | null = null;
  private activeNodes: Set<{ source: AudioBufferSourceNode; gain: GainNode; timerId: number | null }> = new Set();

  private currentCategory: MusicCategory = 'none';
  private categoryBeforePreview: MusicCategory = 'none';
  private currentTrackUrl: string = '';
  private currentTrackIndex: number = 0;

  private isMuted: boolean = false;
  private volume: number = getGameSettings().audio.musicVolume;
  private isUnlocked: boolean = false;
  private isPreviewing: boolean = false;
  private lastError: string | null = null;
  private currentHpRatio: number = 1.0;

  // Loading & retry state so periodic callers never spam or abort in-flight downloads
  private isLoading: boolean = false;
  private failedCooldowns: Map<string, number> = new Map();

  // Monotonic token to cancel out-of-order asynchronous loads
  private requestToken: number = 0;

  // In-memory cache for decoded audio buffers
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer>> = new Map();
  private listeners: Set<(state: MusicManagerState) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
        this.unlockAudioContext();
      };
      window.addEventListener('click', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true });

      // Disable any browser OS media player session notifications
      this.clearMediaSession();

      // Preload first menu and game tracks in background
      setTimeout(() => {
        this.preloadTrack(TRACKS.menu[0]);
        this.preloadTrack(TRACKS.game[0]);
      }, 500);
    }
  }

  private clearMediaSession() {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
        const actions: MediaSessionAction[] = [
          'play', 'pause', 'seekbackward', 'seekforward',
          'previoustrack', 'nexttrack', 'stop'
        ];
        for (const act of actions) {
          try {
            navigator.mediaSession.setActionHandler(act, null);
          } catch {}
        }
      } catch {}
    }
  }

  private computeFilterFreq(hpRatio: number): number {
    const minFreq = 380;
    const maxFreq = 20000;
    return minFreq * Math.pow(maxFreq / minFreq, hpRatio);
  }

  private getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      
      // Dynamic low-pass filter for HP-based underwater / concussive muffled effect
      // "чим менше хп тип приглушоней звук ну ніби під водою"
      this.hpFilter = this.ctx.createBiquadFilter();
      this.hpFilter.type = 'lowpass';
      this.hpFilter.frequency.setValueAtTime(this.computeFilterFreq(this.currentHpRatio), this.ctx.currentTime);
      this.hpFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

      // Audio route: currentSource -> currentGain -> masterGain -> hpFilter -> destination
      this.masterGain.connect(this.hpFilter);
      this.hpFilter.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private unlockAudioContext() {
    this.isUnlocked = true;
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (this.currentCategory !== 'none' && !this.currentSource && !this.isLoading && this.activeNodes.size === 0) {
      this.playCategory(this.currentCategory, true);
    }
  }

  public setHealthFilter(hpRatio: number) {
    this.currentHpRatio = Math.max(0, Math.min(1, Number.isFinite(hpRatio) ? hpRatio : 1));
    if (!this.ctx || !this.hpFilter) return;

    // Exponential frequency curve from 380 Hz (muffled underwater) to 20,000 Hz (crystal clear full health)
    const targetFreq = this.computeFilterFreq(this.currentHpRatio);
    const now = this.ctx.currentTime;
    this.hpFilter.frequency.cancelScheduledValues(now);
    this.hpFilter.frequency.setTargetAtTime(targetFreq, now, 0.2);
  }

  private notifyListeners() {
    const snapshot = this.getState();
    this.listeners.forEach((cb) => cb(snapshot));
  }

  public getState(): MusicManagerState {
    return {
      currentCategory: this.currentCategory,
      currentTrackUrl: this.currentTrackUrl,
      isPreviewing: this.isPreviewing,
      isLoading: this.isLoading,
      isPlaying: !!this.currentSource && !this.isLoading,
      isMuted: this.isMuted,
      volume: this.volume,
      lastError: this.lastError,
    };
  }

  public subscribe(cb: (state: MusicManagerState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : this.volume, now + 0.15);
    }
    this.notifyListeners();
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && !this.isMuted) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(this.volume, now + 0.15);
    }
    this.notifyListeners();
  }

  public getVolume(): number {
    return this.volume;
  }

  private async loadTrackBuffer(url: string): Promise<AudioBuffer> {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!;
    }
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url)!;
    }

    const promise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} while fetching ${url}`);
        }
        const arrayBuf = await res.arrayBuffer();
        const ctx = this.getAudioContext();
        // slice to avoid detached buffer issues in some engines
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        this.bufferCache.set(url, decoded);
        this.failedCooldowns.delete(url);
        return decoded;
      } catch (err) {
        this.failedCooldowns.set(url, Date.now() + FAILED_RETRY_COOLDOWN_MS);
        throw err;
      } finally {
        this.loadingPromises.delete(url);
      }
    })();

    this.loadingPromises.set(url, promise);
    return promise;
  }

  private preloadTrack(url: string) {
    this.loadTrackBuffer(url).catch(() => {});
  }

  private stopAllActiveSources(fadeDuration: number = 0.22) {
    const ctx = this.ctx;
    const nodes = Array.from(this.activeNodes);
    for (const entry of nodes) {
      if (entry.timerId !== null) {
        window.clearTimeout(entry.timerId);
        entry.timerId = null;
      }
      entry.source.onended = null;

      if (ctx && fadeDuration > 0.02) {
        const now = ctx.currentTime;
        try {
          entry.gain.gain.cancelScheduledValues(now);
          entry.gain.gain.setValueAtTime(Math.max(0.0001, entry.gain.gain.value), now);
          entry.gain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
        } catch {}

        entry.timerId = window.setTimeout(() => {
          try {
            entry.source.stop();
          } catch {}
          try {
            entry.source.disconnect();
            entry.gain.disconnect();
          } catch {}
          this.activeNodes.delete(entry);
        }, fadeDuration * 1000 + 30);
      } else {
        try {
          entry.source.stop();
        } catch {}
        try {
          entry.source.disconnect();
          entry.gain.disconnect();
        } catch {}
        this.activeNodes.delete(entry);
      }
    }

    this.currentSource = null;
    this.currentGain = null;
  }

  public playCategory(category: MusicCategory, forceRestart: boolean = false) {
    // Do not interrupt active user track preview from Settings Music Tester
    if (this.isPreviewing && !forceRestart) {
      if (category !== 'none') {
        this.categoryBeforePreview = category;
      }
      return;
    }

    // Already playing or loading this exact category, don't restart or layer another song
    if (
      category === this.currentCategory &&
      !forceRestart &&
      (this.currentSource || this.isLoading || this.activeNodes.size > 0)
    ) {
      return;
    }

    if (category === 'none') {
      this.stop();
      return;
    }

    const playlist = TRACKS[category];
    if (!playlist || playlist.length === 0) return;

    // Immediately silence previous category audio so menu and game music never overlap
    if (category !== this.currentCategory || forceRestart) {
      this.stopAllActiveSources(0.22);
    }

    // Filter out tracks that recently failed (unless cooldown expired)
    const nowMs = Date.now();
    const availableIndices = playlist
      .map((url, idx) => ({ url, idx }))
      .filter(entry => (this.failedCooldowns.get(entry.url) || 0) <= nowMs);

    if (availableIndices.length === 0) {
      this.currentCategory = category;
      this.isLoading = false;
      this.requestToken++;
      return;
    }

    this.currentCategory = category;
    const token = ++this.requestToken;

    // Pick random available track index from category
    const chosen = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    this.currentTrackIndex = chosen.idx;

    this.loadAndPlay(chosen.url, category, token);
  }

  public async playPreviewTrack(trackUrl: string) {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    this.isUnlocked = true;

    if (!this.isPreviewing && this.currentCategory !== 'none') {
      this.categoryBeforePreview = this.currentCategory;
    }
    this.isPreviewing = true;
    this.lastError = null;
    this.stopAllActiveSources(0.15);

    const token = ++this.requestToken;
    this.isLoading = true;
    this.currentTrackUrl = trackUrl;
    this.notifyListeners();

    try {
      // Clear cooldown on explicit user preview test
      this.failedCooldowns.delete(trackUrl);
      const buffer = await this.loadTrackBuffer(trackUrl);
      if (this.requestToken !== token || !this.isPreviewing) return;

      this.isLoading = false;
      const now = ctx.currentTime;
      const newSource = ctx.createBufferSource();
      newSource.buffer = buffer;
      newSource.loop = true;

      const newGain = ctx.createGain();
      newGain.gain.setValueAtTime(0.0001, now);
      newGain.gain.linearRampToValueAtTime(1.0, now + 0.25);

      newSource.connect(newGain);
      if (this.masterGain) {
        newGain.connect(this.masterGain);
      }

      const nodeEntry = { source: newSource, gain: newGain, timerId: null as number | null };
      this.activeNodes.add(nodeEntry);
      newSource.onended = () => {
        this.activeNodes.delete(nodeEntry);
        if (this.currentSource === newSource) {
          this.currentSource = null;
          this.currentGain = null;
          this.notifyListeners();
        }
      };

      newSource.start(0);
      this.currentSource = newSource;
      this.currentGain = newGain;
      this.currentTrackUrl = trackUrl;
      this.notifyListeners();
    } catch {
      if (this.requestToken === token) {
        this.isLoading = false;
        this.currentSource = null;
        this.currentGain = null;
        this.lastError = 'Файл аудіо недоступний або не знайдений';
        this.notifyListeners();
      }
    }
  }

  public stopPreview(resumeCategory?: MusicCategory) {
    if (!this.isPreviewing) return;
    this.isPreviewing = false;
    this.lastError = null;
    this.isLoading = false;
    this.requestToken++;
    this.stopAllActiveSources(0.2);
    const targetCat = resumeCategory ?? this.categoryBeforePreview;
    if (targetCat && targetCat !== 'none') {
      this.currentCategory = 'none';
      this.playCategory(targetCat, true);
    } else {
      this.currentTrackUrl = '';
      this.notifyListeners();
    }
  }

  private async loadAndPlay(trackUrl: string, category: MusicCategory, token: number) {
    this.isLoading = true;
    this.lastError = null;
    this.notifyListeners();
    try {
      const buffer = await this.loadTrackBuffer(trackUrl);

      // Discard if user switched categories while track was decoding
      if (this.requestToken !== token || this.currentCategory !== category || this.isPreviewing) {
        return;
      }

      this.isLoading = false;
      this.executeCrossFade(buffer, trackUrl, category, token);
    } catch (err) {
      if (this.requestToken === token) {
        this.isLoading = false;
        this.notifyListeners();
      }
      console.warn('Could not load soundtrack:', trackUrl, err);
    }
  }

  private executeCrossFade(buffer: AudioBuffer, trackUrl: string, category: MusicCategory, token: number) {
    if (this.requestToken !== token || this.currentCategory !== category || this.isPreviewing) {
      return;
    }

    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.clearMediaSession();

    // Stop any lingering previous sources cleanly before starting the new source
    this.stopAllActiveSources(0.25);

    const now = ctx.currentTime;
    const fadeDuration = 0.45;

    // Create new buffer source and gain node
    const newSource = ctx.createBufferSource();
    newSource.buffer = buffer;
    newSource.loop = false;

    const newGain = ctx.createGain();
    newGain.gain.setValueAtTime(0.0001, now);
    newGain.gain.linearRampToValueAtTime(1.0, now + fadeDuration);

    newSource.connect(newGain);
    if (this.masterGain) {
      newGain.connect(this.masterGain);
    }

    const nodeEntry = { source: newSource, gain: newGain, timerId: null as number | null };
    this.activeNodes.add(nodeEntry);

    // Auto-advance to next track in category when current finishes
    newSource.onended = () => {
      this.activeNodes.delete(nodeEntry);
      if (this.currentSource === newSource) {
        this.currentSource = null;
        this.currentGain = null;
      }
      if (this.requestToken === token && this.currentCategory === category && !this.isPreviewing) {
        const playlist = TRACKS[category];
        this.currentTrackIndex = (this.currentTrackIndex + 1) % playlist.length;
        const nextUrl = playlist[this.currentTrackIndex];
        const nextToken = ++this.requestToken;
        this.loadAndPlay(nextUrl, category, nextToken);
      }
    };

    newSource.start(0);

    this.currentSource = newSource;
    this.currentGain = newGain;
    this.currentTrackUrl = trackUrl;
    this.notifyListeners();
  }

  public stop(fadeSeconds: number = 0.35) {
    this.isPreviewing = false;
    this.currentCategory = 'none';
    this.isLoading = false;
    this.requestToken++;
    this.stopAllActiveSources(fadeSeconds);
    this.clearMediaSession();
    this.notifyListeners();
  }

  public getCurrentCategory(): MusicCategory {
    return this.currentCategory;
  }
}

export const musicManager = new MusicManager();
