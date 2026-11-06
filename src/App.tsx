import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Play, Volume2, VolumeX, Settings, Compass, HelpCircle, Globe, Users, ExternalLink, Layers } from 'lucide-react';

import { WeatherState, CustomLocationData } from './types';
import RainCanvas from './components/RainCanvas';
import OutskirtsLocation from './components/OutskirtsLocation';
import LocationEditor from './components/LocationEditor';
import { soundEngine } from './components/RainWorldSynth';
import MultiplayerLobbyModal from './components/MultiplayerLobbyModal';

export default function App() {
  const [hasEntered, setHasEntered] = useState(false);
  const [isGameplayActive, setIsGameplayActive] = useState(false);
  const [isEditorActive, setIsEditorActive] = useState(false);
  const [activeCustomLocation, setActiveCustomLocation] = useState<CustomLocationData | null>(null);
  const [showMultiplayerModal, setShowMultiplayerModal] = useState(false);
  const [isSoundMuted, setIsSoundMuted] = useState(true);
  const [activeFeedback, setActiveFeedback] = useState<string | null>(null);
  
  // Ambient weather settings
  const [weather, setWeather] = useState<WeatherState>({
    intensity: 0.65, // Steady atmospheric rain
    windX: 0.8,
    lightningFlash: false,
    fogDensity: 0.35
  });

  const handleEnterExperience = () => {
    // Initialize procedural ambient synthesizer on user gesture
    soundEngine.init();
    
    // Unmute and start the rich audio backdrop
    soundEngine.toggleMute(false);
    setIsSoundMuted(false);
    
    // Set enter state
    setHasEntered(true);
  };

  const toggleSound = () => {
    soundEngine.init();
    const nextState = soundEngine.toggleMute();
    setIsSoundMuted(nextState);
  };

  const handleMenuClick = (actionName: string) => {
    setActiveFeedback(actionName);
    if (!isSoundMuted) {
      soundEngine.playThunder(); 
    }
    if (actionName === 'play') {
      setTimeout(() => {
        setIsGameplayActive(true);
        setActiveFeedback(null);
      }, 500);
    } else {
      setTimeout(() => {
        setActiveFeedback(null);
      }, 1500);
    }
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
        />
      )}

      {/* 2. CRT SCANLINES & SOFT MOODY CORNER VIGNETTE */}
      <div id="screen-glare-effect" className="absolute inset-0 pointer-events-none z-10 scanlines opacity-30" />
      <div id="screen-vignette" className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.9)_100%)]" />

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

              {/* Subtitle description */}
              <div className="space-y-2 mt-4">
                <p className="text-sm md:text-base text-zinc-300 font-medium tracking-wide">
                  Атмосферний інтро-арт з інтерактивним Слимакокотом
                </p>
                <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                  Пориньте у похмурий світ вічної зливи. Слимакокіт відпочиває на іржавій трубі та пильно стежить поглядом за рухом вашого курсору.
                </p>
              </div>

              {/* Giant Play/Enter Action Trigger */}
              <motion.button
                id="enter-button-trigger"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleEnterExperience}
                className="mt-8 px-8 py-3.5 rounded-full border border-amber-500/40 bg-gradient-to-r from-amber-950/40 to-yellow-950/20 text-white font-mono text-xs uppercase font-bold tracking-[0.2em] shadow-[0_0_25px_rgba(245,158,11,0.15)] hover:shadow-[0_0_35px_rgba(245,158,11,0.3)] hover:border-amber-400 hover:text-amber-300 transition-all duration-300 flex items-center gap-3.5 mx-auto cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-amber-500 text-amber-500 animate-pulse" />
                РОЗПОЧАТИ // ENTER
              </motion.button>
              
              <div className="text-[10px] font-mono text-zinc-600 mt-6 select-none uppercase tracking-widest">
                Включно з унікальним процедурним аудіо-синтезатором
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. MAIN MENU OVERLAY ON THE RIGHT SIDE (OUT OF THE WAY OF THE SLUGCAT ON THE LEFT) */}
      {hasEntered && (
        <motion.div
          id="main-menu-hud-sidebar"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.0, delay: 0.3 }}
          className="absolute right-6 md:right-24 top-1/2 -translate-y-1/2 z-20 flex flex-col items-start gap-8 select-none p-6 md:p-8 max-w-xs bg-zinc-950/40 border border-zinc-900/40 rounded-2xl backdrop-blur-md pointer-events-auto shadow-2xl"
        >
          {/* Menu Title Accent */}
          <div className="space-y-1">
            <h2 className="text-xl font-bold font-sans tracking-[0.15em] text-white">
              MAIN MENU
            </h2>
          </div>

          {/* Interactive Options list */}
          <div className="flex flex-col gap-4 w-full">
            {/* 1. PLAY BUTTON (SOLO) */}
            <motion.button
              id="menu-btn-play"
              onClick={() => handleMenuClick('play')}
              whileHover={{ x: 8 }}
              className="group flex items-center gap-3.5 text-left font-mono font-bold tracking-[0.2em] text-base sm:text-lg hover:text-amber-400 transition-all duration-300 text-slate-300 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
              ОДИНОЧНА ГРА
            </motion.button>

            {/* 2. MULTIPLAYER P2P BUTTON */}
            <motion.button
              id="menu-btn-multiplayer"
              onClick={() => {
                if (!isSoundMuted) soundEngine.playThunder();
                setShowMultiplayerModal(true);
              }}
              whileHover={{ x: 8 }}
              className="group flex items-center gap-3.5 text-left font-mono font-bold tracking-[0.2em] text-base sm:text-lg text-cyan-300 hover:text-cyan-200 transition-all duration-300 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
              <Globe className="w-4 h-4 text-cyan-400 mr-[-2px] group-hover:rotate-45 transition-transform" />
              МЕРЕЖА [P2P]
            </motion.button>

            {/* 3. LOCATION EDITOR BUTTON */}
            <motion.button
              id="menu-btn-editor"
              onClick={() => {
                if (!isSoundMuted) soundEngine.playThunder();
                setIsEditorActive(true);
              }}
              whileHover={{ x: 8 }}
              className="group flex items-center gap-3.5 text-left font-mono font-bold tracking-[0.2em] text-base sm:text-lg text-amber-300 hover:text-amber-200 transition-all duration-300 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
              <Layers className="w-4 h-4 text-amber-400 mr-[-2px] group-hover:rotate-12 transition-transform" />
              РЕДАКТОР ЛОКАЦІЙ
            </motion.button>

            {/* 4. SETTINGS BUTTON */}
            <motion.button
              id="menu-btn-settings"
              onClick={() => handleMenuClick('settings')}
              whileHover={{ x: 8 }}
              className="group flex items-center gap-3.5 text-left font-mono font-bold tracking-[0.2em] text-base sm:text-lg hover:text-amber-400 transition-all duration-300 text-slate-300 cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
              НАСТРОЙКИ
            </motion.button>

            {/* 4. OPEN STANDALONE TAB BUTTON */}
            <motion.a
              id="menu-btn-standalone"
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ x: 8 }}
              className="group flex items-center gap-3.5 text-left font-mono font-bold tracking-[0.2em] text-base sm:text-lg text-emerald-400 hover:text-emerald-300 transition-all duration-300 cursor-pointer"
              title="Відкрити гру в окремій вкладці браузера без інтерфейсу Google AI Studio"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-0 group-hover:scale-130" />
              <ExternalLink className="w-4 h-4 text-emerald-400 mr-[-2px] group-hover:rotate-12 transition-transform" />
              ОКРЕМА ВКЛАДКА
            </motion.a>
          </div>

          <hr className="border-zinc-800/40 w-full" />

          {/* Notification dynamic feedback */}
          <div className="min-h-[40px] w-full">
            <AnimatePresence mode="wait">
              {activeFeedback ? (
                <motion.div
                  key="feedback-notif"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="p-2 bg-amber-950/20 border border-amber-900/30 rounded text-[9px] font-mono text-zinc-400 leading-normal"
                >
                  <span className="text-amber-400 font-bold uppercase tracking-wider block">
                    {activeFeedback === 'play' ? '// Режим гри' : '// Настройки'}
                  </span>
                  Функція розробляється. Слимакокіт все одно стежить за твоєю мишкою!
                </motion.div>
              ) : (
                <div className="text-[9px] font-mono text-zinc-600 leading-relaxed uppercase tracking-wider">
                  Курсор керує поглядом кота на лівій стороні екрана.
                </div>
              )}
            </AnimatePresence>
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

          {/* Header Action Badges (Standalone Tab & Sound Mute) */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950/80 hover:bg-zinc-900 text-zinc-400 hover:text-cyan-300 transition-all text-xs font-mono flex items-center gap-1.5 backdrop-blur-md shadow-md active:scale-95"
              title="Відкрити гру в окремій вкладці браузера без інтерфейсу Google AI Studio"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline font-bold">НОВА ВКЛАДКА</span>
            </a>

            {/* Pure minimalist sound icon to mute/unmute in the corner */}
            <button
              id="audio-quick-toggle-badge"
              onClick={toggleSound}
              className={`w-9 h-9 rounded-full flex items-center justify-center border backdrop-blur-md transition-all duration-300 ${
                isSoundMuted 
                  ? 'bg-zinc-950/60 border-zinc-800 text-zinc-600 hover:border-zinc-500 hover:text-zinc-200' 
                  : 'bg-amber-950/30 border-amber-600/50 text-amber-500 hover:bg-amber-900/40 shadow-[0_0_10px_rgba(217,119,6,0.15)]'
              }`}
              title={isSoundMuted ? "Увімкнути звук дощу" : "Вимкнути звук дощу"}
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
          Погляньте на Слимакокота // Рухайте курсором для взаємодії
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
              onBack={() => setIsGameplayActive(false)} 
              isSoundMuted={isSoundMuted}
              toggleSound={toggleSound}
              customLocation={activeCustomLocation ?? undefined}
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
                setIsGameplayActive(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. MULTIPLAYER P2P LOBBY MODAL (ROOM LIST, CREATE ROOM, SERVER CODE) */}
      <MultiplayerLobbyModal
        isOpen={showMultiplayerModal}
        onClose={() => setShowMultiplayerModal(false)}
        onConnectedToRoom={() => {
          setIsGameplayActive(true);
          setShowMultiplayerModal(false);
        }}
      />

    </div>
  );
}

