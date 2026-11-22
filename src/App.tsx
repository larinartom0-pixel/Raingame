import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Play, Volume2, VolumeX, Settings, Globe, Layers, Maximize2, Minimize2, ScrollText } from 'lucide-react';

import { WeatherState, CustomLocationData, SlugcatCharacterId, SLUGCAT_CHARACTERS } from './types';
import RainCanvas from './components/RainCanvas';
import OutskirtsLocation from './components/OutskirtsLocation';
import LocationEditor from './components/LocationEditor';
import { soundEngine } from './components/RainWorldSynth';
import MultiplayerLobbyModal from './components/MultiplayerLobbyModal';
import SettingsModal from './components/SettingsModal';
import ChangelogModal from './components/ChangelogModal';
import LoadingScreen from './components/LoadingScreen';
import { musicManager } from './audio/MusicManager';
import { webRTCManager } from './network/WebRTCManager';
import { APP_VERSION, compareVersions } from './version';
import { useGameSettings, setLanguageSetting, AppLanguage } from './settings';
import { CHARACTER_I18N, t } from './i18n';

export default function App() {
  const settings = useGameSettings();
  const lang = settings.language;
  const [hasEntered, setHasEntered] = useState(false);
  const [isGameplayActive, setIsGameplayActive] = useState(false);
  const [isEditorActive, setIsEditorActive] = useState(false);
  const [activeCustomLocation, setActiveCustomLocation] = useState<CustomLocationData | null>(null);
  const [showMultiplayerModal, setShowMultiplayerModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<SlugcatCharacterId>(() => {
    try {
      return localStorage.getItem('rw_selected_character') === 'monk' ? 'monk' : 'survivor';
    } catch {
      return 'survivor';
    }
  });

  const handleSelectCharacter = (charId: SlugcatCharacterId) => {
    setSelectedCharacter(charId);
    try {
      localStorage.setItem('rw_selected_character', charId);
    } catch {
      // ignore storage errors
    }
  };

  // Loading Screen state
  const [isLoadingWorld, setIsLoadingWorld] = useState<boolean>(false);
  const [loadingTitle, setLoadingTitle] = useState<string>('ЗАВАНТАЖЕННЯ СВІТУ');
  
  // Ambient weather settings
  const [weather, setWeather] = useState<WeatherState>({
    intensity: 0.65, // Steady atmospheric rain
    windX: 0.8,
    lightningFlash: false,
    fogDensity: 0.35
  });

  // Menu update check & silent on-screen reload state
  const [menuUpdateAvailable, setMenuUpdateAvailable] = useState<string | null>(null);
  const [menuReloading, setMenuReloading] = useState<boolean>(false);

  useEffect(() => {
    if (isGameplayActive) return;
    let isCancelled = false;
    const checkVersion = async () => {
      try {
        const base = (((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './').replace(/\/?$/, '/');
        const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const serverVer = data.version ? String(data.version).trim() : null;
        if (!serverVer || isCancelled) return;
        if (compareVersions(serverVer, APP_VERSION) > 0) {
          setMenuUpdateAvailable(serverVer);
        }
      } catch {
        // Ignore transient fetch errors
      }
    };
    checkVersion();
    const timer = setInterval(checkVersion, 20000);
    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [isGameplayActive]);

  const triggerMenuReload = () => {
    if (menuReloading) return;
    setMenuReloading(true);
    window.setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  // Single authoritative menu music lifecycle when not in gameplay
  useEffect(() => {
    if (!hasEntered) return;
    if (!isGameplayActive) {
      musicManager.playCategory('menu');
    }
  }, [hasEntered, isGameplayActive]);

  // Keep audio volumes & local identity synced with settings
  useEffect(() => {
    musicManager.setVolume(settings.audio.musicVolume);
    soundEngine.setVolume(settings.audio.sfxVolume);
    webRTCManager.setLocalIdentity(settings.nickname);
  }, [settings.audio.musicVolume, settings.audio.sfxVolume, settings.nickname]);

  // Track Fullscreen state
  useEffect(() => {
    const handleFsChange = () => {
      const fs = !!(
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as unknown as { mozFullScreenElement?: Element }).mozFullScreenElement
      );
      setIsFullscreen(fs);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      const fs = !!(
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as unknown as { mozFullScreenElement?: Element }).mozFullScreenElement
      );
      if (!fs) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if ((el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
          await (el as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen) {
          await (document as unknown as { webkitExitFullscreen: () => Promise<void> }).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  };

  const handleEnterExperience = () => {
    // Initialize procedural ambient synthesizer on user gesture
    soundEngine.init();
    
    // Unmute and start the rich audio backdrop
    soundEngine.toggleMute(false);
    setIsSoundMuted(false);
    musicManager.setMuted(false);
    
    // Set enter state (useEffect starts menu music cleanly)
    setHasEntered(true);
  };

  const toggleSound = () => {
    soundEngine.init();
    const nextState = soundEngine.toggleMute();
    setIsSoundMuted(nextState);
    musicManager.setMuted(nextState);
  };

  const handleStartSingleplayer = () => {
    if (!isSoundMuted) soundEngine.playThunder();
    webRTCManager.disconnect();
    setLoadingTitle(t(lang, 'loadingSingleplayer'));
    setIsLoadingWorld(true);
    setTimeout(() => {
      setIsGameplayActive(true);
      setIsLoadingWorld(false);
    }, 1100);
  };

  return (
    <div 
      id="rain-world-app-root" 
      style={{ touchAction: 'none' }}
      className="relative w-screen h-screen overflow-hidden bg-[#040307] select-none text-slate-200 font-sans touch-none"
    >
      
      {/* 1. ATMOSPHERIC INTERACTIVE CANVAS (Weather & Slugcat on Pipe) - Unmounted during gameplay for 60fps mobile optimization */}
      {!isGameplayActive && (
        <RainCanvas 
          weather={weather} 
          setWeather={setWeather} 
          isSoundMuted={isSoundMuted}
          graphics={settings.graphics}
          characterId={selectedCharacter}
        />
      )}

      {/* 2. CRT SCANLINES & SOFT MOODY CORNER VIGNETTE */}
      {settings.graphics.scanlines && (
        <div id="screen-glare-effect" className="absolute inset-0 pointer-events-none z-10 scanlines opacity-30" />
      )}
      {settings.graphics.vignette && (
        <div id="screen-vignette" className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.9)_100%)]" />
      )}

      {/* 3. CINEMATICS: INTRO SPLASH LAYER */}
      <AnimatePresence>
        {!hasEntered && (
          <motion.div
            id="intro-gate-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
            className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 text-center"
          >
            {/* Soft dust background lines */}
            <div className="absolute inset-0 bg-radial-vignette pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_center,rgba(100,50,0,0.15)_0%,transparent_75%)]" />

            {/* Glowing Logo Elements */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 1.0 }}
              className="space-y-6 z-10 max-w-xl"
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="h-[1px] w-8 bg-amber-500/30" />
                <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-amber-500 font-bold animate-pulse">
                  interactive experience
                </span>
                <span className="h-[1px] w-8 bg-amber-500/30" />
              </div>

              {/* Majestic Display Title Logo */}
              <h1 id="intro-main-title-logo" className="text-5xl md:text-7xl font-extrabold tracking-[0.3em] text-white select-none mr-[-0.3em] drop-shadow-[0_0_20px_rgba(255,255,255,0.12)]">
                RAIN GAME
              </h1>

              {/* First-visit Language Picker or Localized Intro Content */}
              {!settings.hasChosenLanguage ? (
                <div className="mt-6 space-y-4">
                  <div className="text-xs font-mono uppercase tracking-[0.2em] text-amber-300">
                    {t(lang, 'introChooseLang')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setLanguageSetting('uk')}
                      className="px-5 py-4 rounded-2xl border border-amber-500/50 bg-amber-950/30 hover:bg-amber-900/40 hover:border-amber-400 text-white font-mono transition-all cursor-pointer flex items-center justify-between shadow-[0_0_20px_rgba(245,158,11,0.12)]"
                    >
                      <div className="text-left">
                        <div className="text-sm font-bold text-amber-200">Українська</div>
                        <div className="text-[10px] text-zinc-400">Український інтерфейс</div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-black/60 border border-amber-500/40 text-[10px] font-bold text-amber-300">
                        UA
                      </span>
                    </motion.button>

                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setLanguageSetting('en')}
                      className="px-5 py-4 rounded-2xl border border-cyan-500/50 bg-cyan-950/30 hover:bg-cyan-900/40 hover:border-cyan-400 text-white font-mono transition-all cursor-pointer flex items-center justify-between shadow-[0_0_20px_rgba(6,182,212,0.12)]"
                    >
                      <div className="text-left">
                        <div className="text-sm font-bold text-cyan-200">English</div>
                        <div className="text-[10px] text-zinc-400">English interface</div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-black/60 border border-cyan-500/40 text-[10px] font-bold text-cyan-300">
                        EN
                      </span>
                    </motion.button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Subtitle description */}
                  <div className="space-y-2 mt-4">
                    <p className="text-sm md:text-base text-zinc-300 font-medium tracking-wide">
                      {t(lang, 'introSubtitle1')}
                    </p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                      {t(lang, 'introSubtitle2')}
                    </p>
                  </div>

                  {/* Quick language switcher pill on intro */}
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {(['uk', 'en'] as AppLanguage[]).map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setLanguageSetting(code)}
                        className={`px-3 py-1 rounded-lg border font-mono text-[10px] font-bold transition-all cursor-pointer ${
                          lang === code
                            ? 'bg-amber-950/60 border-amber-400 text-amber-200'
                            : 'bg-zinc-950/60 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {code === 'uk' ? 'UA // Українська' : 'EN // English'}
                      </button>
                    ))}
                  </div>

                  {/* Giant Play/Enter Action Trigger */}
                  <motion.button
                    id="enter-button-trigger"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleEnterExperience}
                    className="mt-6 px-8 py-3.5 rounded-full border border-amber-500/40 bg-gradient-to-r from-amber-950/40 to-yellow-950/20 text-white font-mono text-xs uppercase font-bold tracking-[0.2em] shadow-[0_0_25px_rgba(245,158,11,0.15)] hover:shadow-[0_0_35px_rgba(245,158,11,0.3)] hover:border-amber-400 hover:text-amber-300 transition-all duration-300 flex items-center gap-3.5 mx-auto cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-amber-500 text-amber-500 animate-pulse" />
                    {t(lang, 'introEnterBtn')}
                  </motion.button>
                  
                  <div className="text-[10px] font-mono text-zinc-600 mt-6 select-none uppercase tracking-widest">
                    {t(lang, 'introAudioNote')}
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. MAIN MENU OVERLAY ON THE RIGHT SIDE (OUT OF THE WAY OF THE SLUGCAT ON THE LEFT) */}
      {hasEntered && (
        <motion.div
          id="main-menu-hud-sidebar"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
          className="fixed bottom-3 inset-x-3 sm:bottom-5 sm:inset-x-8 z-20 flex flex-col gap-2.5 p-3 sm:p-4 bg-black/60 border border-zinc-800/80 rounded-2xl backdrop-blur-md shadow-2xl select-none pointer-events-auto md:fixed-none md:absolute md:inset-auto md:right-24 md:top-1/2 md:-translate-y-1/2 md:p-8 md:max-w-xs md:flex-col md:items-start md:gap-8 md:bg-zinc-950/40 md:border-zinc-900/40 md:pb-8"
        >
          {/* Menu Title Accent (Desktop Title / Mobile compact header) */}
          <div className="flex items-center justify-between w-full md:block md:space-y-1">
            <h2 className="text-xs sm:text-sm md:text-xl font-bold font-sans tracking-[0.15em] text-white flex items-center gap-2">
              <span className="hidden md:inline">{t(lang, 'menuHeadingDesktop')}</span>
              <span className="md:hidden text-amber-400 font-mono text-xs">{t(lang, 'menuHeadingMobile')}</span>
            </h2>
          </div>

          {/* Slugcat Character Selector (Виживший / Монах) */}
          <div className="w-full space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5 w-full">
              {(['survivor', 'monk'] as SlugcatCharacterId[]).map((cid) => {
                const cfg = SLUGCAT_CHARACTERS[cid];
                const charTxt = CHARACTER_I18N[lang][cid];
                const isSelected = selectedCharacter === cid;
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => handleSelectCharacter(cid)}
                    className={`px-2.5 py-2 rounded-xl border text-left font-mono transition-all cursor-pointer active:scale-95 flex items-center gap-2 ${
                      isSelected
                        ? cid === 'monk'
                          ? 'bg-yellow-950/70 border-yellow-400 text-yellow-200 shadow-[0_0_14px_rgba(250,204,21,0.3)]'
                          : 'bg-zinc-800/90 border-white text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/40"
                      style={{ backgroundColor: cfg.bodyColorMid }}
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold truncate">{charTxt.name}</div>
                      <div className="text-[9px] text-zinc-400 truncate">
                        {charTxt.shortStats}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] font-mono text-zinc-400 leading-tight px-0.5">
              {CHARACTER_I18N[lang][selectedCharacter].subtitle}
            </p>
          </div>

          {/* Interactive Options list: Grid/Row on mobile, Vertical stack on PC */}
          <div className="flex flex-col gap-2 md:gap-4 w-full">
            {/* 1. PLAY BUTTON (SOLO) - Desktop view */}
            <motion.button
              id="menu-btn-play"
              onClick={handleStartSingleplayer}
              whileHover={{ x: 8 }}
              className="group hidden md:flex items-center gap-3.5 text-left font-mono font-bold tracking-[0.2em] text-base sm:text-lg text-amber-400 hover:text-amber-300 transition-all duration-300 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
              <Play className="w-4 h-4 fill-amber-400 text-amber-400 mr-[-2px] group-hover:scale-110 transition-transform" />
              <span>{t(lang, 'soloFull')}</span>
            </motion.button>

            {/* Mobile Top Row: 2 Primary Launch Buttons (Solo & Multiplayer) */}
            <div className="grid grid-cols-2 gap-2 w-full md:hidden">
              <motion.button
                onClick={handleStartSingleplayer}
                className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-950/90 to-amber-900/60 border border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)] flex items-center justify-center gap-1.5 text-amber-300 font-mono font-bold text-xs tracking-wider cursor-pointer active:scale-98"
              >
                <Play className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{t(lang, 'soloShort')}</span>
              </motion.button>

              <motion.button
                onClick={() => {
                  if (!isSoundMuted) soundEngine.playThunder();
                  setShowMultiplayerModal(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-950/90 to-cyan-900/60 border border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.25)] flex items-center justify-center gap-1.5 text-cyan-200 font-mono font-bold text-xs tracking-wider cursor-pointer active:scale-98"
              >
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t(lang, 'multiplayer')}</span>
              </motion.button>
            </div>

            {/* 2. MULTIPLAYER P2P BUTTON (Desktop view) */}
            <motion.button
              id="menu-btn-multiplayer"
              onClick={() => {
                if (!isSoundMuted) soundEngine.playThunder();
                setShowMultiplayerModal(true);
              }}
              whileHover={{ x: 8 }}
              className="group hidden md:flex items-center gap-3.5 text-left font-mono font-bold tracking-[0.2em] text-base sm:text-lg text-cyan-300 hover:text-cyan-200 transition-all duration-300 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
              <Globe className="w-4 h-4 text-cyan-400 mr-[-2px] group-hover:rotate-45 transition-transform" />
              <span>{t(lang, 'multiplayer')}</span>
            </motion.button>

            {/* Mobile 2x2 sub-actions grid / Desktop standard vertical links */}
            <div className="grid grid-cols-2 gap-2 w-full md:flex md:flex-col md:gap-4">
              {/* 3. LOCATION EDITOR BUTTON */}
              <motion.button
                id="menu-btn-editor"
                onClick={() => {
                  if (!isSoundMuted) soundEngine.playThunder();
                  setIsEditorActive(true);
                }}
                whileHover={{ x: 8 }}
                className="group p-2 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-amber-500/50 flex items-center justify-center gap-1.5 font-mono text-[11px] font-bold text-amber-300 hover:text-amber-200 transition-all cursor-pointer active:scale-95 md:p-0 md:bg-transparent md:border-0 md:justify-start md:text-base md:sm:text-lg md:tracking-[0.2em]"
              >
                <span className="hidden md:inline-block w-1.5 h-1.5 rounded-full bg-amber-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
                <Layers className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform shrink-0" />
                <span className="truncate">{t(lang, 'editor')}</span>
              </motion.button>

              {/* 4. SETTINGS BUTTON */}
              <motion.button
                id="menu-btn-settings"
                type="button"
                onClick={() => {
                  if (!isSoundMuted) soundEngine.playThunder();
                  setShowSettingsModal(true);
                }}
                whileHover={{ x: 8 }}
                className="group p-2 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-zinc-600 flex items-center justify-center gap-1.5 font-mono text-[11px] font-bold text-slate-300 hover:text-amber-400 transition-all cursor-pointer active:scale-95 md:p-0 md:bg-transparent md:border-0 md:justify-start md:text-base md:sm:text-lg md:tracking-[0.2em]"
              >
                <span className="hidden md:inline-block w-1.5 h-1.5 rounded-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
                <Settings className="w-3.5 h-3.5 text-amber-400 md:hidden shrink-0" />
                <span className="truncate">{t(lang, 'settings')}</span>
              </motion.button>

              {/* 5. CHANGELOG BUTTON */}
              <motion.button
                id="menu-btn-changelog"
                type="button"
                onClick={() => {
                  if (!isSoundMuted) soundEngine.playThunder();
                  setShowChangelogModal(true);
                }}
                whileHover={{ x: 8 }}
                className="group p-2 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-amber-500/50 flex items-center justify-center gap-1.5 font-mono text-[11px] font-bold text-zinc-200 hover:text-amber-300 transition-all cursor-pointer active:scale-95 md:p-0 md:bg-transparent md:border-0 md:justify-start md:text-base md:sm:text-lg md:tracking-[0.2em]"
              >
                <span className="hidden md:inline-block w-1.5 h-1.5 rounded-full bg-amber-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
                <ScrollText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{t(lang, 'changelog')}</span>
              </motion.button>

              {/* 6. FULLSCREEN TOGGLE BUTTON */}
              <motion.button
                id="menu-btn-fullscreen"
                type="button"
                onClick={toggleFullscreen}
                whileHover={{ x: 8 }}
                className="group p-2 rounded-xl bg-emerald-950/40 border border-emerald-800/60 hover:border-emerald-500/80 flex items-center justify-center gap-1.5 font-mono text-[11px] font-bold text-emerald-300 hover:text-emerald-200 transition-all cursor-pointer active:scale-95 md:p-0 md:bg-transparent md:border-0 md:justify-start md:text-base md:sm:text-lg md:tracking-[0.2em]"
                title={isFullscreen ? t(lang, 'fullscreenExit') : t(lang, 'fullscreenEnter')}
              >
                <span className="hidden md:inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="truncate">{isFullscreen ? t(lang, 'fullscreenExit') : t(lang, 'fullscreenEnter')}</span>
              </motion.button>
            </div>
          </div>

          <hr className="hidden md:block border-zinc-800/40 w-full" />

          {/* Helper info (Desktop only to keep mobile clean) */}
          <div className="hidden md:block min-h-[32px] w-full">
            <div className="text-[9px] font-mono text-zinc-500 leading-relaxed uppercase tracking-wider">
              {t(lang, 'playerLabel')}: <span className="text-amber-400 font-bold">{settings.nickname}</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* 5. TOP CORNER PERSISTENT HEADER */}
      {hasEntered && (
        <motion.div
          id="active-experience-hud"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.5 }}
          className="absolute inset-x-5 top-5 z-20 flex items-center justify-between pointer-events-none"
        >
          {/* Subtle logo indicators at the very top margin */}
          <div id="active-title-indicator" className="flex flex-col text-left font-mono text-[9px] text-zinc-500 uppercase tracking-widest select-none bg-black/30 px-3 py-1.5 rounded border border-zinc-900/40 backdrop-blur-sm">
            <span className="text-amber-500/80 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" /> 
              RAIN GAME
            </span>
          </div>

          {/* Header Action Badges (Changelog, Settings & Sound Mute) */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => setShowChangelogModal(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-amber-500/60 hover:text-amber-300 backdrop-blur-md transition-all duration-300 cursor-pointer"
              title={t(lang, 'changelog')}
            >
              <ScrollText className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center border border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-amber-500/60 hover:text-amber-300 backdrop-blur-md transition-all duration-300 cursor-pointer"
              title={t(lang, 'settings')}
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Pure minimalist sound icon to mute/unmute in the corner */}
            <button
              id="audio-quick-toggle-badge"
              onClick={toggleSound}
              className={`w-9 h-9 rounded-full flex items-center justify-center border backdrop-blur-md transition-all duration-300 ${
                isSoundMuted 
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-600 hover:border-zinc-500 hover:text-zinc-200' 
                  : 'bg-amber-950/30 border-amber-600/50 text-amber-500 hover:bg-amber-900/40 shadow-[0_0_10px_rgba(217,119,6,0.15)]'
              }`}
              title={isSoundMuted ? t(lang, 'soundOff') : t(lang, 'soundOn')}
            >
              {isSoundMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4 animate-pulse" />
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Subtle corner helper text so users know what to do, out of the way of the cat */}
      {hasEntered && !isGameplayActive && (
        <motion.div
          id="micro-instruction-helper"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ duration: 7, delay: 1, repeat: 0 }}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 pointer-events-none font-mono text-[9px] text-zinc-500 tracking-widest uppercase text-center"
        >
          {t(lang, 'menuHintDesktop')}
        </motion.div>
      )}

      {/* 6. PLAYABLE GAME OVERLAY LOCATION */}
      <AnimatePresence>
        {isGameplayActive && (
          <motion.div
            key="gameplay-location-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 z-50"
          >
            <OutskirtsLocation 
              onBack={() => {
                setIsGameplayActive(false);
              }} 
              isSoundMuted={isSoundMuted}
              toggleSound={toggleSound}
              customLocation={activeCustomLocation ?? undefined}
              characterId={selectedCharacter}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6.1 LOCATION EDITOR FULLSCREEN OVERLAY */}
      <AnimatePresence>
        {isEditorActive && (
          <motion.div
            key="location-editor-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-50"
          >
            <LocationEditor
              initialLocation={activeCustomLocation ?? undefined}
              onBack={() => setIsEditorActive(false)}
              isSoundMuted={isSoundMuted}
              onPlayLocation={(loc) => {
                setActiveCustomLocation(loc);
                setIsEditorActive(false);
                setLoadingTitle(t(lang, 'loadingCustom'));
                setIsLoadingWorld(true);
                setTimeout(() => {
                  setIsGameplayActive(true);
                  setIsLoadingWorld(false);
                }, 900);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. MULTIPLAYER P2P LOBBY MODAL (ROOM LIST, CREATE ROOM, SERVER CODE) */}
      <MultiplayerLobbyModal
        isOpen={showMultiplayerModal}
        onClose={() => setShowMultiplayerModal(false)}
        selectedCharacter={selectedCharacter}
        onSelectCharacter={handleSelectCharacter}
        onConnectedToRoom={() => {
          setLoadingTitle(t(lang, 'loadingMultiplayer'));
          setIsLoadingWorld(true);
          setShowMultiplayerModal(false);
          setTimeout(() => {
            setIsGameplayActive(true);
            setIsLoadingWorld(false);
          }, 1100);
        }}
      />

      {/* 7.1 SETTINGS MODAL */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        isSoundMuted={isSoundMuted}
        toggleSound={toggleSound}
        resumeMusicCategory={isGameplayActive ? 'game' : 'menu'}
      />

      {/* 7.2 CHANGELOG MODAL */}
      <ChangelogModal
        isOpen={showChangelogModal}
        onClose={() => setShowChangelogModal(false)}
      />

      {/* 8. ATMOSPHERIC KARMA LOADING SCREEN */}
      <LoadingScreen isLoading={isLoadingWorld} title={loadingTitle} />

      {/* 9. BOTTOM-LEFT CURRENT VERSION INDICATOR */}
      <div className="fixed bottom-1.5 left-3 z-[60] pointer-events-none select-none font-mono text-[10px] tracking-wider text-zinc-400/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        v{APP_VERSION}
      </div>

      {/* 10. MAIN MENU UPDATE BANNER & SILENT RELOAD OVERLAY */}
      <AnimatePresence>
        {!isGameplayActive && menuUpdateAvailable && !menuReloading && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] bg-amber-950/90 border border-amber-500/70 rounded-xl px-3.5 py-2 flex items-center gap-3 shadow-2xl font-mono text-xs text-amber-100"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>{t(lang, 'updateAvailable')} v{menuUpdateAvailable}!</span>
            <button
              onClick={triggerMenuReload}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] uppercase cursor-pointer active:scale-95"
            >
              {t(lang, 'updateBtn')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuReloading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none"
          >
            <div className="max-w-md w-full space-y-4 border border-amber-500/40 bg-zinc-950/90 rounded-2xl p-6 shadow-2xl">
              <div className="w-10 h-10 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
              <div className="font-mono text-xl sm:text-2xl font-black tracking-[0.2em] text-amber-400 uppercase">
                {t(lang, 'reloadingTitle')}
              </div>
              <p className="text-xs sm:text-sm font-mono text-zinc-300 leading-relaxed">
                {t(lang, 'reloadingSubtitlePrefix')} v{menuUpdateAvailable}...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

