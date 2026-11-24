// Rain World Authentic Music Manager using Web Audio API
// Auto-discovers audio files from Music/Main_menu, Music/In_game, Music/In_battle
// 100% immune to OS Media Player Notification (MediaSession) in notification shade
// Eliminates track overlapping via single authoritative source cross-fading

import initialMusicManifest, { type DiscoveredTrackManifestItem } from 'virtual:music-manifest';
import { getGameSettings } from '../settings';
import { parseAudioMetadata, prettifyAudioFilename, type ParsedAudioMetadata } from './id3Parser';

export type MusicCategory = 'menu' | 'game' | 'battle' | 'none';

export interface MusicTrackInfo {
  id: string;
  title: string;
  artist: string;
  category: 'menu' | 'game' | 'battle';
  url: string;
  filename: string;
  sizeBytes?: number;
  coverUrl?: string;
  sidecarCoverUrl?: string;
}

export interface PreloadProgressInfo {
  loaded: number;
  total: number;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  currentTitle: string;
}

const BASE_URL = (
  ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './'
).replace(/\/?$/, '/');

function resolveAssetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return `${BASE_URL}${clean}`;
}

const FAILED_RETRY_COOLDOWN_MS = 15000;

export interface MusicManagerState {
  currentCategory: MusicCategory;
  currentTrackUrl: string;
  currentTrackTitle: string;
  currentTrackArtist: string;
  currentTrackCoverUrl?: string;
  isPreviewing: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  lastError: string | null;
  playbackEventId: number;
  catalogVersion: number;
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

  // Dynamic catalog & extracted ID3 metadata
  private catalog: MusicTrackInfo[] = [];
  private trackByUrl: Map<string, MusicTrackInfo> = new Map();
  private parsedMetaCache: Map<string, ParsedAudioMetadata> = new Map();
  private catalogVersion: number = 0;
  private playbackEventId: number = 0;
  private refreshPromise: Promise<MusicTrackInfo[]> | null = null;

  // Loading & retry state so periodic callers never spam or abort in-flight downloads
  private isLoading: boolean = false;
  private failedCooldowns: Map<string, number> = new Map();

  // Monotonic token to cancel out-of-order asynchronous loads
  private requestToken: number = 0;

  // In-memory cache for raw bytes & decoded audio buffers
  private rawArrayBufferCache: Map<string, ArrayBuffer> = new Map();
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer>> = new Map();
  private preloadAllPromise: Promise<void> | null = null;
  private preloadListeners: Set<(info: PreloadProgressInfo) => void> = new Set();
  private lastPreloadProgress: PreloadProgressInfo = {
    loaded: 0,
    total: 0,
    loadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    currentTitle: '',
  };
  private listeners: Set<(state: MusicManagerState) => void> = new Set();

  constructor() {
    this.applyManifestItems(Array.isArray(initialMusicManifest) ? initialMusicManifest : [], false);

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
    }
  }

  private applyManifestItems(items: DiscoveredTrackManifestItem[], bumpVersion: boolean) {
    const nextCatalog: MusicTrackInfo[] = [];
    const nextMap = new Map<string, MusicTrackInfo>();

    for (const item of items) {
      if (!item || !item.relativeUrl) continue;
      const url = resolveAssetUrl(item.relativeUrl);
      const sidecarCoverUrl = item.sidecarCoverUrl ? resolveAssetUrl(item.sidecarCoverUrl) : undefined;
      const parsed = this.parsedMetaCache.get(url);
      const existing = this.trackByUrl.get(url);

      const info: MusicTrackInfo = {
        id: item.id,
        category: item.category,
        filename: item.filename,
        url,
        sizeBytes: typeof item.sizeBytes === 'number' && item.sizeBytes > 0 ? item.sizeBytes : existing?.sizeBytes,
        sidecarCoverUrl,
        title: parsed?.title || existing?.title || item.title || prettifyAudioFilename(item.filename).title,
        artist: parsed?.artist || existing?.artist || item.artist || 'Rain Game OST',
        coverUrl: parsed?.coverUrl || existing?.coverUrl || sidecarCoverUrl,
      };

      nextCatalog.push(info);
      nextMap.set(url, info);
    }

    this.catalog = nextCatalog;
    this.trackByUrl = nextMap;
    if (bumpVersion) {
      this.catalogVersion++;
      this.notifyListeners();
    }
  }

  public getCatalog(): MusicTrackInfo[] {
    return this.catalog;
  }

  public getTrackByUrl(url: string): MusicTrackInfo | undefined {
    return this.trackByUrl.get(url);
  }

  public async refreshCatalog(): Promise<MusicTrackInfo[]> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}Music/manifest.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as DiscoveredTrackManifestItem[];
          if (Array.isArray(data)) {
            this.applyManifestItems(data, true);
          }
        }
      } catch {
        // Offline / fallback to build-time virtual manifest
      } finally {
        this.refreshPromise = null;
      }
      return this.catalog;
    })();

    return this.refreshPromise;
  }

  private getTracksForCategory(category: MusicCategory): MusicTrackInfo[] {
    if (category === 'none') return [];
    return this.catalog.filter((t) => t.category === category);
  }

  private resolveCurrentTrackMetadata(): {
    title: string;
    artist: string;
    coverUrl?: string;
  } {
    if (!this.currentTrackUrl) {
      return { title: '', artist: '', coverUrl: undefined };
    }
    const fromCatalog = this.trackByUrl.get(this.currentTrackUrl);
    const fromParsed = this.parsedMetaCache.get(this.currentTrackUrl);
    const fallbackFilename = this.currentTrackUrl.split('/').pop()?.split('?')[0] || '';
    const prettified = prettifyAudioFilename(fallbackFilename);

    return {
      title: fromParsed?.title || fromCatalog?.title || prettified.title,
      artist: fromParsed?.artist || fromCatalog?.artist || prettified.artist || 'Rain Game OST',
      coverUrl: fromParsed?.coverUrl || fromCatalog?.coverUrl || fromCatalog?.sidecarCoverUrl,
    };
  }

  private clearMediaSession() {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
        const actions: MediaSessionAction[] = [
          'play',
          'pause',
          'seekbackward',
          'seekforward',
          'previoustrack',
          'nexttrack',
          'stop',
        ];
        for (const act of actions) {
          try {
            navigator.mediaSession.setActionHandler(act, null);
          } catch {
            // ignore unsupported actions
          }
        }
      } catch {
        // ignore
      }
    }
  }

  private computeFilterFreq(hpRatio: number): number {
    const minFreq = 380;
    const maxFreq = 20000;
    return minFreq * Math.pow(maxFreq / minFreq, hpRatio);
  }

  private getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Dynamic low-pass filter for HP-based underwater / concussive muffled effect
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
    const meta = this.resolveCurrentTrackMetadata();
    return {
      currentCategory: this.currentCategory,
      currentTrackUrl: this.currentTrackUrl,
      currentTrackTitle: meta.title,
      currentTrackArtist: meta.artist,
      currentTrackCoverUrl: meta.coverUrl,
      isPreviewing: this.isPreviewing,
      isLoading: this.isLoading,
      isPlaying: !!this.currentSource && !this.isLoading,
      isMuted: this.isMuted,
      volume: this.volume,
      lastError: this.lastError,
      playbackEventId: this.playbackEventId,
      catalogVersion: this.catalogVersion,
    };
  }

  public subscribe(cb: (state: MusicManagerState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public setMuted(muted: boolean) {
    const wasMuted = this.isMuted;
    this.isMuted = muted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : this.volume, now + 0.15);
    }
    // Show Now Playing vinyl toast when unmuting while a track is already actively playing
    if (wasMuted && !muted && this.currentSource && !this.isLoading && this.currentTrackUrl) {
      this.playbackEventId++;
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

  private async fetchArrayBufferWithProgress(
    url: string,
    expectedBytes?: number,
    onProgressBytes?: (receivedBytes: number, totalBytes: number) => void
  ): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} while fetching ${url}`);
    }

    const totalHeader = res.headers.get('Content-Length');
    const headerBytes = totalHeader ? Number(totalHeader) : 0;
    const totalBytes = expectedBytes && expectedBytes > 0 ? expectedBytes : headerBytes;
    const reader = res.body?.getReader();

    if (!reader) {
      const buf = await res.arrayBuffer();
      onProgressBytes?.(buf.byteLength, totalBytes || buf.byteLength);
      return buf;
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    let lastEmitMs = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        const now = performance.now();
        if (now - lastEmitMs >= 45) {
          lastEmitMs = now;
          onProgressBytes?.(received, Math.max(totalBytes, received));
        }
      }
    }

    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    onProgressBytes?.(received, Math.max(totalBytes, received));
    return merged.buffer;
  }

  private async decodeBufferSafe(arrayBuf: ArrayBuffer, preferOffline: boolean): Promise<AudioBuffer | null> {
    try {
      if (preferOffline && !this.ctx && typeof window !== 'undefined') {
        const OfflineCtx =
          window.OfflineAudioContext ||
          (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
        if (OfflineCtx) {
          const offlineCtx = new OfflineCtx(2, 44100, 44100);
          return await offlineCtx.decodeAudioData(arrayBuf.slice(0));
        }
      }
      const ctx = this.getAudioContext();
      return await ctx.decodeAudioData(arrayBuf.slice(0));
    } catch {
      return null;
    }
  }

  private extractAndCacheMetadata(url: string, arrayBuf: ArrayBuffer) {
    const trackEntry = this.trackByUrl.get(url);
    const filename = trackEntry?.filename || url.split('/').pop()?.split('?')[0] || 'track.mp3';
    const parsed = parseAudioMetadata(arrayBuf, url, filename);
    const mergedCover = parsed.coverUrl || trackEntry?.sidecarCoverUrl;
    const enrichedMeta: ParsedAudioMetadata = {
      ...parsed,
      coverUrl: mergedCover,
    };
    this.parsedMetaCache.set(url, enrichedMeta);

    if (trackEntry) {
      trackEntry.title = enrichedMeta.title;
      trackEntry.artist = enrichedMeta.artist;
      trackEntry.coverUrl = mergedCover;
      this.catalogVersion++;
    }
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
        let arrayBuf = this.rawArrayBufferCache.get(url);
        if (!arrayBuf) {
          arrayBuf = await this.fetchArrayBufferWithProgress(url);
          this.rawArrayBufferCache.set(url, arrayBuf);
          this.extractAndCacheMetadata(url, arrayBuf);
        }

        const ctx = this.getAudioContext();
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

  public subscribePreloadProgress(cb: (info: PreloadProgressInfo) => void): () => void {
    this.preloadListeners.add(cb);
    if (this.lastPreloadProgress.total > 0 || this.lastPreloadProgress.percent > 0) {
      cb(this.lastPreloadProgress);
    }
    return () => {
      this.preloadListeners.delete(cb);
    };
  }

  public async preloadAllTracks(onProgress?: (info: PreloadProgressInfo) => void): Promise<void> {
    if (onProgress) {
      this.preloadListeners.add(onProgress);
      if (this.lastPreloadProgress.total > 0 || this.lastPreloadProgress.percent > 0) {
        onProgress(this.lastPreloadProgress);
      }
    }

    if (this.preloadAllPromise) {
      return this.preloadAllPromise;
    }

    this.preloadAllPromise = (async () => {
      await this.refreshCatalog();

      // Prioritize menu tracks first so the main menu soundtrack is guaranteed ready earliest
      const priorityRank: Record<'menu' | 'game' | 'battle', number> = {
        menu: 0,
        game: 1,
        battle: 2,
      };
      const tracks = [...this.catalog].sort(
        (a, b) => priorityRank[a.category] - priorityRank[b.category]
      );

      const total = tracks.length;
      if (total === 0) {
        this.lastPreloadProgress = {
          loaded: 0,
          total: 0,
          loadedBytes: 0,
          totalBytes: 0,
          percent: 100,
          currentTitle: '',
        };
        this.preloadListeners.forEach((cb) => cb(this.lastPreloadProgress));
        return;
      }

      const FALLBACK_TRACK_BYTES = 4_200_000;
      const targetBytesArr = tracks.map((tr) =>
        tr.sizeBytes && tr.sizeBytes > 0 ? tr.sizeBytes : FALLBACK_TRACK_BYTES
      );
      const receivedBytesArr = new Array<number>(total).fill(0);
      const doneArr = new Array<boolean>(total).fill(false);
      let completedCount = 0;
      let latestTitle = tracks[0].title;

      const emitProgress = () => {
        let loadedBytes = 0;
        let totalBytes = 0;
        let weightedProgressBytes = 0;

        for (let i = 0; i < total; i++) {
          const target = Math.max(targetBytesArr[i], receivedBytesArr[i]);
          totalBytes += target;
          if (doneArr[i]) {
            loadedBytes += target;
            weightedProgressBytes += target;
          } else {
            const clampedRecv = Math.min(target, receivedBytesArr[i]);
            loadedBytes += clampedRecv;
            weightedProgressBytes += clampedRecv * 0.94;
          }
        }

        const percent =
          totalBytes > 0
            ? Math.min(100, Math.round((weightedProgressBytes / totalBytes) * 100))
            : Math.min(100, Math.round((completedCount / total) * 100));

        this.lastPreloadProgress = {
          loaded: completedCount,
          total,
          loadedBytes,
          totalBytes,
          percent,
          currentTitle: latestTitle,
        };
        this.preloadListeners.forEach((cb) => cb(this.lastPreloadProgress));
      };

      emitProgress();

      let cursor = 0;
      const concurrency = Math.min(3, total);

      const worker = async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= total) break;
          const track = tracks[idx];
          latestTitle = track.title;

          try {
            if (this.bufferCache.has(track.url)) {
              receivedBytesArr[idx] = targetBytesArr[idx];
              doneArr[idx] = true;
            } else {
              let arrayBuf = this.rawArrayBufferCache.get(track.url);
              if (!arrayBuf) {
                arrayBuf = await this.fetchArrayBufferWithProgress(
                  track.url,
                  targetBytesArr[idx],
                  (received, expected) => {
                    if (expected > targetBytesArr[idx]) {
                      targetBytesArr[idx] = expected;
                    }
                    receivedBytesArr[idx] = received;
                    emitProgress();
                  }
                );
                this.rawArrayBufferCache.set(track.url, arrayBuf);
                this.extractAndCacheMetadata(track.url, arrayBuf);
              } else {
                receivedBytesArr[idx] = arrayBuf.byteLength;
              }

              const decoded = await this.decodeBufferSafe(arrayBuf, true);
              if (decoded) {
                this.bufferCache.set(track.url, decoded);
              }
              this.failedCooldowns.delete(track.url);
              receivedBytesArr[idx] = targetBytesArr[idx];
              doneArr[idx] = true;
            }
          } catch {
            // Do not stall startup loading if a single audio file fails
            receivedBytesArr[idx] = targetBytesArr[idx];
            doneArr[idx] = true;
          } finally {
            completedCount++;
            emitProgress();
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      this.notifyListeners();
    })();

    return this.preloadAllPromise;
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
        } catch {
          // ignore
        }

        entry.timerId = window.setTimeout(() => {
          try {
            entry.source.stop();
          } catch {
            // ignore
          }
          try {
            entry.source.disconnect();
            entry.gain.disconnect();
          } catch {
            // ignore
          }
          this.activeNodes.delete(entry);
        }, fadeDuration * 1000 + 30);
      } else {
        try {
          entry.source.stop();
        } catch {
          // ignore
        }
        try {
          entry.source.disconnect();
          entry.gain.disconnect();
        } catch {
          // ignore
        }
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

    const playlist = this.getTracksForCategory(category);
    if (!playlist || playlist.length === 0) {
      this.currentCategory = category;
      return;
    }

    // Immediately silence previous category audio so menu and game music never overlap
    if (category !== this.currentCategory || forceRestart) {
      this.stopAllActiveSources(0.22);
    }

    const nowMs = Date.now();
    const availableIndices = playlist
      .map((item, idx) => ({ url: item.url, idx }))
      .filter((entry) => (this.failedCooldowns.get(entry.url) || 0) <= nowMs);

    if (availableIndices.length === 0) {
      this.currentCategory = category;
      this.isLoading = false;
      this.requestToken++;
      return;
    }

    this.currentCategory = category;
    const token = ++this.requestToken;

    // Avoid picking the exact same track twice in a row when multiple tracks exist
    const filteredPool =
      availableIndices.length > 1
        ? availableIndices.filter((entry) => entry.url !== this.currentTrackUrl)
        : availableIndices;
    const pool = filteredPool.length > 0 ? filteredPool : availableIndices;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
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
      this.playbackEventId++;
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
    this.currentTrackUrl = trackUrl;
    this.notifyListeners();
    try {
      const buffer = await this.loadTrackBuffer(trackUrl);

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
    this.stopAllActiveSources(0.25);

    const now = ctx.currentTime;
    const fadeDuration = 0.45;

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

    newSource.onended = () => {
      this.activeNodes.delete(nodeEntry);
      if (this.currentSource === newSource) {
        this.currentSource = null;
        this.currentGain = null;
      }
      if (this.requestToken === token && this.currentCategory === category && !this.isPreviewing) {
        const playlist = this.getTracksForCategory(category);
        if (playlist.length > 0) {
          this.currentTrackIndex = (this.currentTrackIndex + 1) % playlist.length;
          const nextUrl = playlist[this.currentTrackIndex].url;
          const nextToken = ++this.requestToken;
          this.loadAndPlay(nextUrl, category, nextToken);
        }
      }
    };

    newSource.start(0);

    this.currentSource = newSource;
    this.currentGain = newGain;
    this.currentTrackUrl = trackUrl;
    this.playbackEventId++;
    this.notifyListeners();
  }

  public stop(fadeSeconds: number = 0.35) {
    this.isPreviewing = false;
    this.currentCategory = 'none';
    this.currentTrackUrl = '';
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
