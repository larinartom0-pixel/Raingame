// Rain World Authentic Music Manager using Web Audio API
// 100% immune to OS Media Player Notification (MediaSession) in notification shade
// Eliminates track overlapping via single authoritative source cross-fading

export type MusicCategory = 'menu' | 'game' | 'battle' | 'none';

const TRACKS: Record<'menu' | 'game' | 'battle', string[]> = {
  menu: [
    '/Music/Main_menu/main_menu1.mp3',
    '/Music/Main_menu/main_menu2.mp3'
  ],
  game: [
    '/Music/In_game/in_game1.mp3',
    '/Music/In_game/in_game2.mp3',
    '/Music/In_game/in_game3.mp3'
  ],
  battle: [
    '/Music/In_battle/in_battle1.mp3',
    '/Music/In_battle/in_battle2.mp3',
    '/Music/In_battle/in_battle3.mp3',
    '/Music/In_battle/in_battle4.mp3'
  ]
};

class MusicManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Active audio nodes
  private currentSource: AudioBufferSourceNode | null = null;
  private currentGain: GainNode | null = null;

  private currentCategory: MusicCategory = 'none';
  private currentTrackUrl: string = '';
  private currentTrackIndex: number = 0;

  private isMuted: boolean = false;
  private volume: number = 0.65;
  private isUnlocked: boolean = false;

  // Monotonic token to cancel out-of-order asynchronous loads
  private requestToken: number = 0;

  // In-memory cache for decoded audio buffers
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private loadingPromises: Map<string, Promise<AudioBuffer>> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlockAudioContext();
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('click', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true });

      // Disable any browser OS media player session notifications
      this.clearMediaSession();

      // Preload first menu and game tracks in background
      setTimeout(() => {
        this.preloadTrack('/Music/Main_menu/main_menu1.mp3');
        this.preloadTrack('/Music/In_game/in_game1.mp3');
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

  private getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private unlockAudioContext() {
    this.isUnlocked = true;
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (this.currentCategory !== 'none' && !this.currentSource) {
      this.playCategory(this.currentCategory, true);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : this.volume, now + 0.15);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && !this.isMuted) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(this.volume, now + 0.15);
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
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} while fetching ${url}`);
        }
        const arrayBuf = await res.arrayBuffer();
        const ctx = this.getAudioContext();
        // slice to avoid detached buffer issues in some engines
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        this.bufferCache.set(url, decoded);
        return decoded;
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

  public playCategory(category: MusicCategory, forceRestart: boolean = false) {
    // Already playing this exact category, don't restart or layer another song
    if (category === this.currentCategory && !forceRestart && this.currentSource) {
      return;
    }

    if (category === 'none') {
      this.stop();
      return;
    }

    const playlist = TRACKS[category];
    if (!playlist || playlist.length === 0) return;

    this.currentCategory = category;
    const token = ++this.requestToken;

    // Pick random track index from category
    const trackIndex = Math.floor(Math.random() * playlist.length);
    this.currentTrackIndex = trackIndex;
    const trackUrl = playlist[trackIndex];

    this.loadAndPlay(trackUrl, category, token);
  }

  private async loadAndPlay(trackUrl: string, category: MusicCategory, token: number) {
    try {
      const buffer = await this.loadTrackBuffer(trackUrl);

      // Discard if user switched categories while track was decoding
      if (this.requestToken !== token || this.currentCategory !== category) {
        return;
      }

      this.executeCrossFade(buffer, trackUrl, category, token);
    } catch (err) {
      console.warn('Could not load soundtrack:', trackUrl, err);
    }
  }

  private executeCrossFade(buffer: AudioBuffer, trackUrl: string, category: MusicCategory, token: number) {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.clearMediaSession();

    const now = ctx.currentTime;
    const fadeDuration = 1.0;

    // 1. Smoothly fade out and dispose previous source
    if (this.currentGain && this.currentSource) {
      const oldGain = this.currentGain;
      const oldSource = this.currentSource;

      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);

      // Nullify onended to prevent old track from triggering playlist loops
      oldSource.onended = null;

      setTimeout(() => {
        try {
          oldSource.stop();
          oldSource.disconnect();
          oldGain.disconnect();
        } catch {}
      }, fadeDuration * 1000 + 100);
    }

    // 2. Create new buffer source and gain node
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

    // Auto-advance to next track in category when current finishes
    newSource.onended = () => {
      if (this.requestToken === token && this.currentCategory === category) {
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
  }

  public stop(fadeSeconds: number = 0.8) {
    this.currentCategory = 'none';
    this.requestToken++;

    if (this.ctx && this.currentGain && this.currentSource) {
      const now = this.ctx.currentTime;
      const oldGain = this.currentGain;
      const oldSource = this.currentSource;

      oldSource.onended = null;
      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.linearRampToValueAtTime(0.0001, now + fadeSeconds);

      setTimeout(() => {
        try {
          oldSource.stop();
          oldSource.disconnect();
          oldGain.disconnect();
        } catch {}
      }, fadeSeconds * 1000 + 50);

      this.currentSource = null;
      this.currentGain = null;
    }

    this.clearMediaSession();
  }

  public getCurrentCategory(): MusicCategory {
    return this.currentCategory;
  }
}

export const musicManager = new MusicManager();
