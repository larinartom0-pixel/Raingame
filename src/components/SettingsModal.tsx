import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  User,
  Monitor,
  Keyboard,
  Music,
  Play,
  Square,
  RotateCcw,
  Volume2,
  VolumeX,
  Check,
  Sparkles,
  AlertCircle,
  Globe,
  RefreshCw,
  Disc3,
} from 'lucide-react';
import {
  useGameSettings,
  updateNicknameSetting,
  applyGraphicsPreset,
  updateGraphicsSettings,
  updateAudioSettings,
  updateKeybind,
  resetKeybinds,
  setLanguageSetting,
  formatKeyCode,
  KeyBindings,
  GraphicsPreset,
  AppLanguage,
} from '../settings';
import { musicManager, type MusicManagerState, type MusicTrackInfo } from '../audio/MusicManager';
import { soundEngine } from './RainWorldSynth';
import { webRTCManager } from '../network/WebRTCManager';
import { KEYBIND_LABELS_I18N, t } from '../i18n';

type SettingsTab = 'profile' | 'graphics' | 'controls' | 'music';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSoundMuted: boolean;
  toggleSound: () => void;
  resumeMusicCategory?: 'menu' | 'game';
}

export default function SettingsModal({
  isOpen,
  onClose,
  isSoundMuted,
  toggleSound,
  resumeMusicCategory = 'menu',
}: SettingsModalProps) {
  const settings = useGameSettings();
  const lang = settings.language;
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [nicknameInput, setNicknameInput] = useState(settings.nickname);
  const [nicknameSavedToast, setNicknameSavedToast] = useState(false);
  const [listeningAction, setListeningAction] = useState<keyof KeyBindings | null>(null);
  const [musicState, setMusicState] = useState<MusicManagerState>(() => musicManager.getState());
  const [catalogTracks, setCatalogTracks] = useState<MusicTrackInfo[]>(() => musicManager.getCatalog());
  const [isRefreshingTracks, setIsRefreshingTracks] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setListeningAction(null);
      return;
    }
    setNicknameInput(settings.nickname);
    setMusicState(musicManager.getState());
    setCatalogTracks([...musicManager.getCatalog()]);
  }, [isOpen, settings.nickname]);

  useEffect(() => {
    const unsub = musicManager.subscribe((next) => {
      setMusicState(next);
      setCatalogTracks([...musicManager.getCatalog()]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isOpen || activeTab !== 'music') return;
    let cancelled = false;
    setIsRefreshingTracks(true);
    musicManager.refreshCatalog().finally(() => {
      if (!cancelled) {
        setCatalogTracks([...musicManager.getCatalog()]);
        setIsRefreshingTracks(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab]);

  // Capture keybind remapping cleanly
  useEffect(() => {
    if (!isOpen || !listeningAction) return;

    const handleCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListeningAction(null);
        return;
      }
      updateKeybind(listeningAction, e.code);
      setListeningAction(null);
    };

    window.addEventListener('keydown', handleCapture, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleCapture, { capture: true });
    };
  }, [isOpen, listeningAction]);

  const handleClose = () => {
    setListeningAction(null);
    if (musicManager.getState().isPreviewing) {
      musicManager.stopPreview(resumeMusicCategory);
    }
    onClose();
  };

  const handleSaveNickname = () => {
    const saved = updateNicknameSetting(nicknameInput);
    setNicknameInput(saved);
    webRTCManager.setLocalIdentity(saved);
    setNicknameSavedToast(true);
    window.setTimeout(() => setNicknameSavedToast(false), 1800);
  };

  if (!isOpen) return null;

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: 'profile', label: t(lang, 'tabProfile'), icon: <User className="w-3.5 h-3.5" /> },
    { id: 'graphics', label: t(lang, 'tabGraphics'), icon: <Monitor className="w-3.5 h-3.5" /> },
    { id: 'controls', label: t(lang, 'tabControls'), icon: <Keyboard className="w-3.5 h-3.5" /> },
    { id: 'music', label: t(lang, 'tabMusic'), icon: <Music className="w-3.5 h-3.5" /> },
  ];

  const categories: Array<{ id: 'menu' | 'game' | 'battle'; title: string; badgeClass: string }> = [
    { id: 'menu', title: t(lang, 'catMenu'), badgeClass: 'text-amber-300 border-amber-700/60 bg-amber-950/40' },
    { id: 'game', title: t(lang, 'catGame'), badgeClass: 'text-emerald-300 border-emerald-700/60 bg-emerald-950/40' },
    { id: 'battle', title: t(lang, 'catBattle'), badgeClass: 'text-rose-300 border-rose-700/60 bg-rose-950/40' },
  ];

  const keybindLabels = KEYBIND_LABELS_I18N[lang];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md select-none"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-black/70">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold font-mono tracking-wider text-white">
                  {t(lang, 'settingsTitle')}
                </h2>
                <p className="text-[10px] font-mono text-zinc-400">
                  {t(lang, 'settingsSubtitle')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="grid grid-cols-4 gap-1.5 px-4 py-2.5 bg-zinc-900/50 border-b border-zinc-800/80">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setListeningAction(null);
                    setActiveTab(tab.id);
                  }}
                  className={`py-2 px-2 rounded-xl border font-mono text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-amber-950/60 border-amber-500/70 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.18)]'
                      : 'bg-zinc-950/70 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  {tab.icon}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* TAB 1: PROFILE / LANGUAGE & PERSISTENT NICKNAME */}
            {activeTab === 'profile' && (
              <div className="space-y-4">
                {/* Language Switcher */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                  <div>
                    <h3 className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      <span>{t(lang, 'languageTitle')}</span>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {t(lang, 'languageDesc')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: 'uk' as AppLanguage, label: 'Українська', sub: 'UA' },
                      { id: 'en' as AppLanguage, label: 'English', sub: 'EN' },
                    ]).map((opt) => {
                      const active = lang === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setLanguageSetting(opt.id)}
                          className={`p-2.5 rounded-xl border font-mono text-left transition-all cursor-pointer flex items-center justify-between ${
                            active
                              ? 'bg-cyan-950/60 border-cyan-400 text-cyan-100 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                              : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                          }`}
                        >
                          <span className="text-xs font-bold">{opt.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 border border-zinc-700 text-zinc-300">
                            {opt.sub}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Persistent Nickname */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                  <div>
                    <h3 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                      {t(lang, 'nicknameTitle')}
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {t(lang, 'nicknameDesc')}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveNickname();
                      }}
                      maxLength={20}
                      placeholder={t(lang, 'nicknamePlaceholder')}
                      className="flex-1 px-3 py-2 rounded-xl bg-black/80 border border-zinc-700 font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveNickname}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                    >
                      {nicknameSavedToast ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{t(lang, 'savedNick')}</span>
                        </>
                      ) : (
                        <span>{t(lang, 'saveNick')}</span>
                      )}
                    </button>
                  </div>

                  <div className="text-[10px] font-mono text-zinc-500 flex flex-wrap items-center gap-3 pt-1">
                    <span>
                      {t(lang, 'currentNick')}: <strong className="text-zinc-200">{settings.nickname}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      {t(lang, 'networkId')}: <strong className="text-cyan-400">{webRTCManager.localPlayerId}</strong>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: GRAPHICS SETTINGS */}
            {activeTab === 'graphics' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                  <div className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                    {t(lang, 'graphicsPresetTitle')}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'low', label: t(lang, 'presetLow'), desc: t(lang, 'presetLowDesc') },
                      { id: 'medium', label: t(lang, 'presetMed'), desc: t(lang, 'presetMedDesc') },
                      { id: 'high', label: t(lang, 'presetHigh'), desc: t(lang, 'presetHighDesc') },
                    ] as Array<{ id: GraphicsPreset; label: string; desc: string }>).map((p) => {
                      const active = settings.graphics.preset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => applyGraphicsPreset(p.id)}
                          className={`p-2.5 rounded-xl border text-left font-mono transition-all cursor-pointer ${
                            active
                              ? 'bg-amber-950/60 border-amber-400 text-amber-200'
                              : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                          }`}
                        >
                          <div className="text-xs font-bold">{p.label}</div>
                          <div className="text-[10px] text-zinc-500">{p.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2.5">
                  <div className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider mb-1">
                    {t(lang, 'graphicsDetailsTitle')}
                  </div>

                  {([
                    { key: 'rainEffects', label: t(lang, 'gfxRain'), desc: t(lang, 'gfxRainDesc') },
                    { key: 'particles', label: t(lang, 'gfxParticles'), desc: t(lang, 'gfxParticlesDesc') },
                    { key: 'glowEffects', label: t(lang, 'gfxGlow'), desc: t(lang, 'gfxGlowDesc') },
                    { key: 'scanlines', label: t(lang, 'gfxScanlines'), desc: t(lang, 'gfxScanlinesDesc') },
                    { key: 'vignette', label: t(lang, 'gfxVignette'), desc: t(lang, 'gfxVignetteDesc') },
                  ] as const).map((item) => {
                    const enabled = settings.graphics[item.key];
                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-3 py-2 border-b border-zinc-800/60 last:border-b-0"
                      >
                        <div>
                          <div className="text-xs font-mono font-bold text-zinc-200">{item.label}</div>
                          <div className="text-[10px] text-zinc-500">{item.desc}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateGraphicsSettings({ [item.key]: !enabled })}
                          className={`px-3 py-1 rounded-lg border font-mono text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                            enabled
                              ? 'bg-emerald-950/70 border-emerald-500/70 text-emerald-300'
                              : 'bg-zinc-950 border-zinc-700 text-zinc-500'
                          }`}
                        >
                          {enabled ? t(lang, 'enabled') : t(lang, 'disabled')}
                        </button>
                      </div>
                    );
                  })}

                  {/* Resolution scale */}
                  <div className="pt-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono font-bold text-zinc-200">
                        {t(lang, 'gfxResTitle')}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {t(lang, 'gfxResDesc')}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[0.7, 0.85, 1, 1.5].map((scale) => (
                        <button
                          key={scale}
                          type="button"
                          onClick={() => updateGraphicsSettings({ resolutionScale: scale })}
                          className={`px-2 py-1 rounded-lg border font-mono text-[10px] font-bold cursor-pointer ${
                            Math.abs(settings.graphics.resolutionScale - scale) < 0.05
                              ? 'bg-amber-500 text-black border-amber-400'
                              : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-600'
                          }`}
                        >
                          {scale}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: KEYBIND REMAPPING */}
            {activeTab === 'controls' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-zinc-400">
                    {t(lang, 'controlsHint')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setListeningAction(null);
                      resetKeybinds();
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{t(lang, 'resetDefaults')}</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {(Object.keys(keybindLabels) as Array<keyof KeyBindings>).map((actionKey) => {
                    const isListening = listeningAction === actionKey;
                    return (
                      <div
                        key={actionKey}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-zinc-900/50 border border-zinc-800/80"
                      >
                        <span className="text-xs font-mono text-zinc-200">
                          {keybindLabels[actionKey]}
                        </span>
                        <button
                          type="button"
                          onClick={() => setListeningAction(isListening ? null : actionKey)}
                          className={`min-w-[116px] px-3 py-1.5 rounded-lg border font-mono text-xs font-bold transition-all cursor-pointer ${
                            isListening
                              ? 'bg-amber-500 text-black border-amber-300 animate-pulse'
                              : 'bg-black/80 text-amber-300 border-zinc-700 hover:border-amber-500/70'
                          }`}
                        >
                          {isListening ? t(lang, 'pressKey') : formatKeyCode(settings.keybinds[actionKey], lang)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 4: MUSIC TESTER & VOLUME */}
            {activeTab === 'music' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                      {t(lang, 'audioVolumeTitle')}
                    </span>
                    <button
                      type="button"
                      onClick={toggleSound}
                      className={`px-3 py-1 rounded-lg border font-mono text-[10px] font-bold flex items-center gap-1.5 cursor-pointer ${
                        isSoundMuted
                          ? 'bg-red-950/60 border-red-600/70 text-red-300'
                          : 'bg-emerald-950/60 border-emerald-600/70 text-emerald-300'
                      }`}
                    >
                      {isSoundMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      <span>{isSoundMuted ? t(lang, 'soundOff') : t(lang, 'soundOn')}</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-300">{t(lang, 'musicVolume')}</span>
                      <span className="text-amber-300 font-bold">
                        {Math.round(settings.audio.musicVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(settings.audio.musicVolume * 100)}
                      onChange={(e) => {
                        const v = Number(e.target.value) / 100;
                        updateAudioSettings({ musicVolume: v });
                        musicManager.setVolume(v);
                      }}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-300">{t(lang, 'sfxVolume')}</span>
                      <span className="text-cyan-300 font-bold">
                        {Math.round(settings.audio.sfxVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(settings.audio.sfxVolume * 100)}
                      onChange={(e) => {
                        const v = Number(e.target.value) / 100;
                        updateAudioSettings({ sfxVolume: v });
                        soundEngine.setVolume(v);
                      }}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider">
                        {t(lang, 'musicTesterTitle')}
                      </h3>
                      <p className="text-[10px] text-zinc-400">
                        {t(lang, 'musicTesterDesc')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isRefreshingTracks) return;
                          setIsRefreshingTracks(true);
                          musicManager.refreshCatalog().finally(() => {
                            setCatalogTracks([...musicManager.getCatalog()]);
                            setIsRefreshingTracks(false);
                          });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 font-mono text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${isRefreshingTracks ? 'animate-spin' : ''}`} />
                        <span>{t(lang, 'refreshTracksBtn')}</span>
                      </button>
                      {musicState.isPreviewing && (
                        <button
                          type="button"
                          onClick={() => musicManager.stopPreview(resumeMusicCategory)}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200 font-mono text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>{t(lang, 'stopTest')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {musicState.lastError && (
                    <div className="px-3 py-2 rounded-lg bg-red-950/60 border border-red-700/60 text-red-300 text-[11px] font-mono flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{t(lang, 'trackError')}</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    {categories.map((cat) => {
                      const tracks = catalogTracks.filter((tr) => tr.category === cat.id);
                      return (
                        <div key={cat.id} className="space-y-1.5">
                          <div className={`inline-block px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${cat.badgeClass}`}>
                            {cat.title} ({tracks.length})
                          </div>
                          {tracks.length === 0 ? (
                            <div className="px-3 py-2 rounded-xl border border-dashed border-zinc-800 text-[11px] font-mono text-zinc-500">
                              {t(lang, 'noTracksInCategory')}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {tracks.map((track) => {
                                const isCurrent = musicState.currentTrackUrl === track.url;
                                const isActivelyPlaying = isCurrent && (musicState.isPlaying || musicState.isLoading);
                                return (
                                  <div
                                    key={track.id}
                                    className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border transition-all ${
                                      isCurrent && musicState.isPreviewing
                                        ? 'bg-amber-950/40 border-amber-500/70'
                                        : 'bg-black/60 border-zinc-800/80'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      {track.coverUrl ? (
                                        <img
                                          src={track.coverUrl}
                                          alt={track.title}
                                          className="w-9 h-9 rounded-lg object-cover border border-zinc-700/80 shrink-0"
                                        />
                                      ) : (
                                        <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                                          <Disc3 className={`w-4 h-4 ${isActivelyPlaying ? 'animate-spin text-amber-400' : ''}`} />
                                        </div>
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-mono text-zinc-100 font-bold truncate">
                                          {track.title}
                                        </div>
                                        <div className="text-[10px] font-mono text-zinc-400 truncate">
                                          {track.artist || t(lang, 'unknownArtist')} • {track.filename}
                                        </div>
                                        {isCurrent && (
                                          <div className="text-[10px] font-mono text-amber-400">
                                            {musicState.isLoading
                                              ? t(lang, 'trackLoading')
                                              : musicState.isPreviewing
                                              ? t(lang, 'trackPreviewing')
                                              : t(lang, 'trackPlayingBg')}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isSoundMuted) {
                                          toggleSound();
                                        }
                                        if (isCurrent && musicState.isPreviewing && isActivelyPlaying) {
                                          musicManager.stopPreview(resumeMusicCategory);
                                        } else {
                                          musicManager.playPreviewTrack(track.url);
                                        }
                                      }}
                                      className={`px-3 py-1.5 rounded-lg border font-mono text-[10px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-all ${
                                        isCurrent && musicState.isPreviewing && isActivelyPlaying
                                          ? 'bg-red-950/70 border-red-500/70 text-red-200 hover:bg-red-900/70'
                                          : 'bg-zinc-900 border-zinc-700 text-amber-300 hover:bg-amber-500 hover:text-black hover:border-amber-400'
                                      }`}
                                    >
                                      {isCurrent && musicState.isPreviewing && isActivelyPlaying ? (
                                        <>
                                          <Square className="w-3 h-3 fill-current" />
                                          <span>{t(lang, 'stopTrack')}</span>
                                        </>
                                      ) : (
                                        <>
                                          <Play className="w-3 h-3 fill-current" />
                                          <span>{t(lang, 'playTrack')}</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-zinc-800 bg-black/60 flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500">
              {t(lang, 'autoSaveNote')}
            </span>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-mono font-bold text-xs cursor-pointer"
            >
              {t(lang, 'doneBtn')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
