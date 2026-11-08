/**
 * Procedural Audio Synthesizer for Rain Game in the style of Rain World.
 * Generates rain soundscapes, thunder, and melancholic ambient tracks.
 */

class RainWorldSynth {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = true;
  
  // Audio Nodes
  private masterGain: GainNode | null = null;
  private concussionFilter: BiquadFilterNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private combatGain: GainNode | null = null;
  
  // Sequence trackers
  private melodyInterval: any = null;
  private combatLoopInterval: any = null;
  private combatFadeTimeout: any = null;
  private isCombatActive: boolean = false;
  private droneOscillators: OscillatorNode[] = [];
  private droneGains: GainNode[] = [];
  
  constructor() {
    // Lazy initialisation on first user action
  }

  public init() {
    if (this.ctx) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      // Concussion Low-Pass Filter (defaults to wide open 20kHz, muffled to 340Hz on spear death)
      this.concussionFilter = this.ctx.createBiquadFilter();
      this.concussionFilter.type = 'lowpass';
      this.concussionFilter.frequency.setValueAtTime(20000, this.ctx.currentTime);
      this.concussionFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

      // Master output
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      
      this.concussionFilter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Create Rain noise
      this.setupRainSynth();

      this.isMuted = false;
    } catch (e) {
      console.error('Failed to initialize RainWorldSynth:', e);
    }
  }

  private setupRainSynth() {
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    // Generate pinkish-brownish rain noise
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Filter towards brown noise for rumble
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 4.5; // Amplify
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Filters for rain depth
    this.rainFilter = this.ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.setValueAtTime(450, this.ctx.currentTime);

    this.rainGain = this.ctx.createGain();
    // Rain noise silenced during gameplay as requested
    this.rainGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    // Dynamic bandpass to simulate wind howling/sweeps
    const windSweep = this.ctx.createBiquadFilter();
    windSweep.type = 'peaking';
    windSweep.frequency.setValueAtTime(300, this.ctx.currentTime);
    windSweep.Q.setValueAtTime(1.5, this.ctx.currentTime);
    windSweep.gain.setValueAtTime(5, this.ctx.currentTime);

    // Connect rain nodes
    noiseSource.connect(windSweep);
    windSweep.connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);

    noiseSource.start(0);

    // Start subtle wind sweeping LFO
    this.modulateWind(windSweep);
  }

  private modulateWind(filter: BiquadFilterNode) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(0.04, this.ctx.currentTime); // very slow sweep
    
    oscGain.gain.setValueAtTime(120, this.ctx.currentTime); // sweep width
    
    osc.connect(oscGain);
    oscGain.connect(filter.frequency);
    
    osc.start(0);
  }

  private setupAmbientDrone() {
    if (!this.ctx || !this.masterGain) return;

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    this.droneGain.connect(this.masterGain);

    // We will play a looping dark chord progression (Cm9 -> Abmaj7 -> Fm -> Gsus)
    // Dynamic synth tracks
    const chords = [
      [130.81, 164.81, 196.00, 246.94], // C3, E3, G3, B3 (CMaj7)
      [110.00, 138.59, 164.81, 220.00], // A2, C#3, E3, A3 (AMin/Maj variant)
      [116.54, 138.59, 174.61, 233.08], // A#2, C#3, F3, A#3
      [97.99, 130.81, 155.56, 196.00]   // G2, C3, D#3, G3
    ];

    let progressionIndex = 0;

    const playChord = (frequencies: number[]) => {
      if (!this.ctx || !this.droneGain || this.isMuted) return;

      const now = this.ctx.currentTime;
      
      // Stop previous
      this.droneOscillators.forEach((osc, idx) => {
        try {
          const gain = this.droneGains[idx];
          if (gain) {
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 3);
          }
          osc.stop(now + 3.2);
        } catch(e){}
      });

      this.droneOscillators = [];
      this.droneGains = [];

      frequencies.forEach((freq) => {
        if (!this.ctx || !this.droneGain) return;

        // Custom rich waves
        const osc = this.ctx.createOscillator();
        const gNode = this.ctx.createGain();
        
        osc.type = Math.random() > 0.4 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        // Add low frequency detuning for analogue drift
        const detuneOsc = this.ctx.createOscillator();
        const detuneGain = this.ctx.createGain();
        detuneOsc.frequency.setValueAtTime(0.1, this.ctx.currentTime);
        detuneGain.gain.setValueAtTime(Math.random() * 8 + 4, this.ctx.currentTime);
        detuneOsc.connect(detuneGain);
        detuneGain.connect(osc.detune);
        detuneOsc.start();

        gNode.gain.setValueAtTime(0, this.ctx.currentTime);
        // Slow attack
        gNode.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime + 3.5);

        // Lowpass filter for warm, dark sound
        const toneFilter = this.ctx.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.setValueAtTime(freq * 1.8, this.ctx.currentTime);

        osc.connect(toneFilter);
        toneFilter.connect(gNode);
        gNode.connect(this.droneGain);

        osc.start(0);

        this.droneOscillators.push(osc);
        this.droneGains.push(gNode);
      });
    };

    // Play first chord
    playChord(chords[0]);

    // Loop progressions every 8 seconds
    this.melodyInterval = setInterval(() => {
      progressionIndex = (progressionIndex + 1) % chords.length;
      playChord(chords[progressionIndex]);
    }, 8500);
  }

  public playThunder() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;

    // 1. Bass Rumble (Oscillator)
    const rumbleOsc = this.ctx.createOscillator();
    const rumbleGain = this.ctx.createGain();
    const rumbleFilter = this.ctx.createBiquadFilter();

    rumbleOsc.type = 'triangle';
    rumbleOsc.frequency.setValueAtTime(45, now);
    rumbleOsc.frequency.exponentialRampToValueAtTime(30, now + 4.0);

    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(80, now);

    rumbleGain.gain.setValueAtTime(0.0, now);
    rumbleGain.gain.linearRampToValueAtTime(0.4, now + 0.1); // Sudden impact
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5); // long decay

    rumbleOsc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.masterGain);

    rumbleOsc.start(now);
    rumbleOsc.stop(now + 4.6);

    // 2. Crackle (Highpassed short noise blast)
    const bufferSize = 0.5 * this.ctx.sampleRate; // half second buffer
    const crashBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = crashBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const crackSource = this.ctx.createBufferSource();
    crackSource.buffer = crashBuffer;

    const crackFilter = this.ctx.createBiquadFilter();
    crackFilter.type = 'bandpass';
    crackFilter.frequency.setValueAtTime(2500, now);
    crackFilter.Q.setValueAtTime(1.0, now);

    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.0, now);
    crackGain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    crackSource.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(this.masterGain);

    crackSource.start(now);
    crackSource.stop(now + 0.7);
  }

  public playThrow() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playHit(type: 'spear' | 'rock') {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (type === 'spear') {
      // Metallic resonant piercing thud
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Blunt stone clack
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  public playCreatureHurt() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.35);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playPickup() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.08);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public setRainIntensity(intensity: number) {
    if (!this.ctx || !this.rainFilter || !this.rainGain) return;
    const now = this.ctx.currentTime;
    
    // Scale filter cutoff and volume according to rain intensity
    const targetFreq = 200 + (intensity * 600);
    const targetGain = 0.02 + (intensity * 0.15);

    this.rainFilter.frequency.setValueAtTime(this.rainFilter.frequency.value, now);
    this.rainFilter.frequency.exponentialRampToValueAtTime(targetFreq, now + 1.5);

    this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, now);
    this.rainGain.gain.linearRampToValueAtTime(targetGain, now + 1.5);
  }

  public playEatNibble() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440 + Math.random() * 80, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playEatComplete() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Harmonious multi-tone chime (Rain World karma pip chime)
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0.0, now + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.09, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.55);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.6);
    });
  }

  // ---------------- Adaptive Combat Sound Engine ----------------
  // Real MP3 soundtracks from /Music/In_battle are now authoritatively managed by MusicManager.
  public startCombatMusic() {
    // Legacy procedural combat synth disabled to prevent overlapping with user MP3 tracks
  }

  public startCombatFadeOut(_durationSeconds = 10) {
    // Managed by MusicManager
  }

  public stopCombatMusic() {
    this.isCombatActive = false;
    if (this.combatLoopInterval) {
      clearInterval(this.combatLoopInterval);
      this.combatLoopInterval = null;
    }
  }

  private runCombatTensionLoop() {
    if (this.combatLoopInterval) clearInterval(this.combatLoopInterval);
    let beat = 0;
    const notes = [65.41, 73.42, 61.74, 55.0]; // C2, D2, B1, A1 dark tension bass
    
    this.combatLoopInterval = setInterval(() => {
      if (!this.isCombatActive || !this.ctx || !this.combatGain || this.isMuted) return;
      const now = this.ctx.currentTime;
      const freq = notes[beat % notes.length];
      beat++;

      // Heavy industrial bass pulse
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.8, now + 0.35);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(110, now + 0.35);

      oscGain.gain.setValueAtTime(0.35, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(filter);
      filter.connect(oscGain);
      oscGain.connect(this.combatGain);

      osc.start(now);
      osc.stop(now + 0.4);
    }, 450);
  }

  // Concussion effect on lethal spear hit ("Смерть від удару (Контузія)")
  public triggerConcussionMuffle() {
    if (!this.ctx || !this.concussionFilter) return;
    const now = this.ctx.currentTime;
    this.concussionFilter.frequency.cancelScheduledValues(now);
    this.concussionFilter.frequency.setValueAtTime(this.concussionFilter.frequency.value, now);
    this.concussionFilter.frequency.exponentialRampToValueAtTime(320, now + 0.15);
    this.concussionFilter.Q.setValueAtTime(4.0, now);
  }

  public resetConcussion() {
    if (!this.ctx || !this.concussionFilter) return;
    const now = this.ctx.currentTime;
    this.concussionFilter.frequency.cancelScheduledValues(now);
    this.concussionFilter.frequency.exponentialRampToValueAtTime(20000, now + 0.8);
    this.concussionFilter.Q.setValueAtTime(1.0, now + 0.8);
  }

  // Authentic Pipe Slide Whoosh Sound
  public playPipeTravel() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    // Low whoosh sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.5);
    osc.frequency.exponentialRampToValueAtTime(110, now + 1.1);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, now);
    filter.Q.setValueAtTime(2.5, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.15);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.connect(filter);
    filter.connect(gain);
    if (this.masterGain) gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 1.25);
  }

  // Hydraulic Shelter Vault Blast Door locking & steam vent sound
  public playShelterDoor() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Heavy metallic mechanical clunk
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);

    osc.connect(filter);
    filter.connect(gain);
    if (this.masterGain) gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.75);

    // Steam pneumatic hiss
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.8);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }
    const hissSrc = this.ctx.createBufferSource();
    hissSrc.buffer = noiseBuffer;

    const hissFilter = this.ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.setValueAtTime(1400, now + 0.1);

    const hissGain = this.ctx.createGain();
    hissGain.gain.setValueAtTime(0.001, now);
    hissGain.gain.linearRampToValueAtTime(0.25, now + 0.2);
    hissGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    hissSrc.connect(hissFilter);
    hissFilter.connect(hissGain);
    if (this.masterGain) hissGain.connect(this.masterGain);

    hissSrc.start(now + 0.1);
    hissSrc.stop(now + 1.0);
  }

  // Harmonic ethereal chime for Karma Ascension
  public playKarmaAscend() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const freqs = [329.63, 440.0, 523.25, 659.25, 880.0]; // E4, A4, C5, E5, A5
    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.15);

      gain.gain.setValueAtTime(0.001, now + idx * 0.15);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 1.8);

      osc.connect(gain);
      if (this.masterGain) gain.connect(this.masterGain);

      osc.start(now + idx * 0.15);
      osc.stop(now + idx * 0.15 + 1.9);
    });
  }

  // Dynamic storm rain noise volume control
  public setStormVolume(vol: number) {
    if (!this.ctx || !this.rainGain) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(0.5, vol));
    this.rainGain.gain.linearRampToValueAtTime(clamped, now + 0.2);
    if (this.rainFilter) {
      this.rainFilter.frequency.linearRampToValueAtTime(400 + clamped * 1200, now + 0.2);
    }
  }

  public toggleMute(mutedState?: boolean) {
    const newState = mutedState !== undefined ? mutedState : !this.isMuted;
    this.isMuted = newState;

    if (!this.ctx) {
      this.init();
    }

    if (this.ctx && this.masterGain) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const now = this.ctx.currentTime;
      this.masterGain.gain.linearRampToValueAtTime(newState ? 0 : 0.25, now + 0.5);
    }

    return this.isMuted;
  }

  public getMuted() {
    return this.isMuted;
  }

  public stopAll() {
    if (this.melodyInterval) {
      clearInterval(this.melodyInterval);
    }
    
    this.droneOscillators.forEach((osc) => {
      try { osc.stop(); } catch(e){}
    });
    
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const soundEngine = new RainWorldSynth();
