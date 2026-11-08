import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface LoadingScreenProps {
  isLoading: boolean;
  onFinished?: () => void;
  title?: string;
}

const RAIN_WORLD_TIPS = [
  'Порада: Рожевий ящер може лазити по жердинах і стінах! Тримайте дистанцію.',
  'Порада: Якщо ящер схопив вас, не здавайтеся — при звільненні від оглушення ящер відпустить вас і буде оглушений на 5 секунд!',
  'Порада: Затисніть [ВНИЗ] для повзання. Якщо під час повзання затиснути стрибок на 1.8 с — ви зробите високий ривок (Pounce)!',
  'Порада: Ящери в першу чергу намагаються затягнути у лігво трупи, ніж нападати на живих.',
  'Порада: Камінь може відбити голову ящера та оглушити його, а спис наносить 1.0 шкоди.',
  'Порада: Для безпечної сплячки в укритті потрібно щонайменше 4 ячейки їжі.'
];

export default function LoadingScreen({ isLoading, onFinished, title = 'ЗАВАНТАЖЕННЯ СВІТУ' }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setProgress(100);
      return;
    }

    setProgress(15);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.floor(Math.random() * 15 + 8);
      });
    }, 120);

    const tipInterval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % RAIN_WORLD_TIPS.length);
    }, 2800);

    return () => {
      clearInterval(interval);
      clearInterval(tipInterval);
    };
  }, [isLoading]);

  return (
    <AnimatePresence onExitComplete={onFinished}>
      {isLoading && (
        <motion.div
          key="loading-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] bg-[#050408] flex flex-col items-center justify-between p-6 sm:p-10 select-none overflow-hidden"
        >
          {/* Ambient Rain Streaks Background */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(40,15,30,0.4)_0%,black_85%)] pointer-events-none" />
          <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(236,72,153,0.15)_0%,transparent_70%)]" />

          {/* Top Header */}
          <div className="relative z-10 w-full flex items-center justify-between text-zinc-500 font-mono text-[10px] tracking-widest uppercase">
            <span className="flex items-center gap-1.5 text-amber-500/80 font-bold">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              RAIN GAME // CYCLIC SIMULATION
            </span>
            <span>SYSTEM v2.0 • PINK LIZARD AI</span>
          </div>

          {/* Center Glowing Karma Wheel & Glyphs */}
          <div className="relative z-10 flex flex-col items-center my-auto">
            <div className="relative w-36 h-36 sm:w-48 sm:h-48 flex items-center justify-center">
              {/* Outer rotating decorative dashes */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border border-dashed border-pink-500/30"
              />

              {/* Middle pulsing ring */}
              <motion.div
                animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-3 rounded-full border-2 border-pink-500/50 shadow-[0_0_30px_rgba(236,72,153,0.3)]"
              />

              {/* Rain World Karma Wheel SVG */}
              <svg className="w-24 h-24 sm:w-32 sm:h-32 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="14" stroke="#ffffff" strokeWidth="1.8" />
                <circle cx="18" cy="18" r="8.5" stroke="#ffffff" strokeWidth="1.4" />
                <line x1="18" y1="4" x2="18" y2="32" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="4" y1="18" x2="32" y2="18" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="18" cy="18" r="3" fill="#ffffff" />
                <circle cx="11" cy="11" r="1.4" fill="#ec4899" />
                <circle cx="25" cy="11" r="1.4" fill="#ec4899" />
                <circle cx="11" cy="25" r="1.4" fill="#ec4899" />
                <circle cx="25" cy="25" r="1.4" fill="#ec4899" />
              </svg>
            </div>

            {/* Title & Progress Label */}
            <div className="mt-6 text-center space-y-1">
              <h2 className="text-sm sm:text-base font-bold font-mono tracking-[0.25em] text-white">
                {title}
              </h2>
              <p className="text-[11px] font-mono text-zinc-400">
                Синхронізація екосистеми та поведінки ящерів... {Math.min(100, progress)}%
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-56 sm:w-72 h-1.5 bg-zinc-900 rounded-full mt-4 overflow-hidden border border-zinc-800">
              <motion.div
                className="h-full bg-gradient-to-r from-pink-500 via-amber-400 to-pink-500 rounded-full"
                animate={{ width: `${Math.min(100, progress)}%` }}
                transition={{ ease: 'easeOut', duration: 0.2 }}
              />
            </div>
          </div>

          {/* Bottom Cycling Lore Tip */}
          <div className="relative z-10 max-w-md text-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={tipIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                className="text-[11px] sm:text-xs font-mono text-zinc-400 bg-black/60 border border-zinc-800/80 px-4 py-2.5 rounded-xl shadow-lg leading-relaxed"
              >
                {RAIN_WORLD_TIPS[tipIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
