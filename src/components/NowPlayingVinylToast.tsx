import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Disc3 } from 'lucide-react';
import { musicManager, type MusicCategory, type MusicManagerState } from '../audio/MusicManager';
import { useGameSettings } from '../settings';
import { t } from '../i18n';

const DISPLAY_DURATION_MS = 4800;

export default function NowPlayingVinylToast() {
  const { language: lang } = useGameSettings();
  const [musicState, setMusicState] = useState<MusicManagerState>(() => musicManager.getState());
  const [visibleToast, setVisibleToast] = useState<{
    eventId: number;
    title: string;
    artist: string;
    coverUrl?: string;
    category: MusicCategory;
  } | null>(null);

  const lastHandledEventIdRef = useRef<number>(0);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = musicManager.subscribe(setMusicState);
    return unsub;
  }, []);

  useEffect(() => {
    // Hide immediately if sound was muted or stopped
    if (musicState.isMuted || !musicState.isPlaying || !musicState.currentTrackUrl) {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setVisibleToast(null);
      return;
    }

    if (
      musicState.playbackEventId > 0 &&
      musicState.playbackEventId !== lastHandledEventIdRef.current
    ) {
      lastHandledEventIdRef.current = musicState.playbackEventId;
      const trackFromCatalog = musicManager.getTrackByUrl(musicState.currentTrackUrl);
      const resolvedCategory: MusicCategory =
        musicState.isPreviewing && trackFromCatalog
          ? trackFromCatalog.category
          : musicState.currentCategory;

      setVisibleToast({
        eventId: musicState.playbackEventId,
        title: musicState.currentTrackTitle || 'Unknown Track',
        artist: musicState.currentTrackArtist || t(lang, 'unknownArtist'),
        coverUrl: musicState.currentTrackCoverUrl,
        category: resolvedCategory,
      });

      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
      hideTimerRef.current = window.setTimeout(() => {
        setVisibleToast(null);
        hideTimerRef.current = null;
      }, DISPLAY_DURATION_MS);
    }
  }, [
    musicState.playbackEventId,
    musicState.isMuted,
    musicState.isPlaying,
    musicState.currentTrackUrl,
    musicState.currentTrackTitle,
    musicState.currentTrackArtist,
    musicState.currentTrackCoverUrl,
    musicState.currentCategory,
    musicState.isPreviewing,
    lang,
  ]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const badgeStyle =
    visibleToast?.category === 'battle'
      ? {
          text: t(lang, 'catBattleShort'),
          cls: 'text-rose-300 border-rose-500/50 bg-rose-950/60',
          accent: 'from-rose-500 via-amber-400 to-rose-400',
          glow: 'shadow-[0_10px_35px_rgba(244,63,94,0.22)]',
          barColor: 'bg-rose-400',
        }
      : visibleToast?.category === 'game'
      ? {
          text: t(lang, 'catGameShort'),
          cls: 'text-emerald-300 border-emerald-500/50 bg-emerald-950/60',
          accent: 'from-emerald-400 via-cyan-400 to-amber-400',
          glow: 'shadow-[0_10px_35px_rgba(16,185,129,0.22)]',
          barColor: 'bg-emerald-400',
        }
      : {
          text: t(lang, 'catMenuShort'),
          cls: 'text-amber-300 border-amber-500/50 bg-amber-950/60',
          accent: 'from-amber-400 via-orange-400 to-yellow-300',
          glow: 'shadow-[0_10px_35px_rgba(245,158,11,0.22)]',
          barColor: 'bg-amber-400',
        };

  return (
    <div className="fixed top-14 sm:top-16 left-3 sm:left-4 z-[130] pointer-events-none select-none">
      <AnimatePresence mode="wait">
        {visibleToast && (
          <motion.div
            key={visibleToast.eventId}
            initial={{ x: -380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -380, opacity: 0 }}
            transition={{
              x: { type: 'spring', stiffness: 260, damping: 24 },
              opacity: { duration: 0.28 },
            }}
            className={`relative flex items-center gap-3 pl-2.5 pr-4 py-2.5 rounded-2xl bg-zinc-950/92 border border-zinc-700/80 backdrop-blur-xl overflow-hidden max-w-[88vw] sm:max-w-[340px] ${badgeStyle.glow}`}
          >
            {/* Spinning Vinyl Disc */}
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3.2, ease: 'linear' }}
                className="relative w-full h-full rounded-full bg-zinc-950 border border-zinc-700/80 shadow-[0_0_16px_rgba(0,0,0,0.85)] flex items-center justify-center overflow-hidden"
                style={{
                  backgroundImage:
                    'repeating-radial-gradient(circle at center, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 4px), conic-gradient(from 40deg, rgba(255,255,255,0.14), transparent 22%, rgba(255,255,255,0.08) 48%, transparent 72%, rgba(255,255,255,0.14))',
                }}
              >
                {/* Center Cover Artwork / Label */}
                {visibleToast.coverUrl ? (
                  <img
                    src={visibleToast.coverUrl}
                    alt={visibleToast.title}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-2 ring-zinc-900 shadow-md"
                  />
                ) : (
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-amber-500/80 via-orange-600/80 to-zinc-900 ring-2 ring-zinc-900 flex items-center justify-center">
                    <Disc3 className="w-4 h-4 text-amber-100/90" />
                  </div>
                )}

                {/* Vinyl Center Spindle Hole */}
                <div className="absolute w-2.5 h-2.5 rounded-full bg-zinc-950 border border-zinc-500/70 shadow-inner" />
              </motion.div>
            </div>

            {/* Track Info */}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded border font-mono text-[8px] sm:text-[9px] font-bold tracking-wider uppercase ${badgeStyle.cls}`}
                >
                  {badgeStyle.text}
                </span>
                <span className="font-mono text-[9px] tracking-[0.16em] text-zinc-400 uppercase truncate">
                  {t(lang, 'nowPlayingLabel')}
                </span>
                {/* Tiny animated equalizer bars */}
                <span className="flex items-end gap-[2px] h-2.5 ml-auto shrink-0">
                  <motion.span
                    animate={{ height: ['35%', '100%', '45%'] }}
                    transition={{ repeat: Infinity, duration: 0.65, ease: 'easeInOut' }}
                    className={`w-[2px] rounded-full ${badgeStyle.barColor}`}
                  />
                  <motion.span
                    animate={{ height: ['90%', '35%', '85%'] }}
                    transition={{ repeat: Infinity, duration: 0.52, ease: 'easeInOut' }}
                    className={`w-[2px] rounded-full ${badgeStyle.barColor}`}
                  />
                  <motion.span
                    animate={{ height: ['50%', '95%', '30%'] }}
                    transition={{ repeat: Infinity, duration: 0.74, ease: 'easeInOut' }}
                    className={`w-[2px] rounded-full ${badgeStyle.barColor}`}
                  />
                </span>
              </div>

              <div className="text-xs sm:text-sm font-bold text-white truncate leading-snug">
                {visibleToast.title}
              </div>
              <div className="text-[11px] font-mono text-amber-300/90 truncate">
                {visibleToast.artist || t(lang, 'unknownArtist')}
              </div>
            </div>

            {/* Auto-dismiss countdown progress line */}
            <motion.div
              key={`bar-${visibleToast.eventId}`}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: DISPLAY_DURATION_MS / 1000, ease: 'linear' }}
              style={{ transformOrigin: 'left center' }}
              className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${badgeStyle.accent} opacity-80`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
