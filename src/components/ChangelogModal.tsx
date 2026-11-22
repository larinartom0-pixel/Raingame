import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ScrollText, Sparkles, Copy, Check } from 'lucide-react';
import { CHANGELOG_ENTRIES, type ChangelogEntry } from '../changelog';
import { useGameSettings } from '../settings';
import { t } from '../i18n';
import { APP_VERSION } from '../version';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangelogModal({ isOpen, onClose }: ChangelogModalProps) {
  const { language } = useGameSettings();
  const [copiedVersion, setCopiedVersion] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyEntry = async (entry: ChangelogEntry) => {
    const items = entry.changes[language] ?? entry.changes.uk;
    const text = `v${entry.version} (${entry.date}) — ${entry.title[language]}\n${items.map((line) => `• ${line}`).join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopiedVersion(entry.version);
    setTimeout(() => {
      setCopiedVersion((prev) => (prev === entry.version ? null : prev));
    }, 1800);
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md select-none"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-black/70">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <ScrollText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold font-mono tracking-wider text-white">
                  {t(language, 'changelogTitle')}
                </h2>
                <p className="text-[10px] font-mono text-zinc-400">
                  {t(language, 'changelogSubtitle')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Changelog entries */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
            {CHANGELOG_ENTRIES.map((entry, idx) => {
              const isCurrent = entry.version === APP_VERSION || idx === 0;
              const items = entry.changes[language] ?? entry.changes.uk;
              const isCopied = copiedVersion === entry.version;
              return (
                <div
                  key={entry.version}
                  className={`p-4 rounded-xl border space-y-2.5 ${
                    isCurrent
                      ? 'bg-amber-950/20 border-amber-500/45 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
                      : 'bg-zinc-900/45 border-zinc-800/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-black/70 border border-amber-500/40 font-mono text-xs font-black text-amber-300">
                        v{entry.version}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black font-mono text-[9px] font-black tracking-wider flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {t(language, 'currentVersionBadge')}
                        </span>
                      )}
                      <span className="text-xs sm:text-sm font-bold text-white">
                        {entry.title[language]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {entry.date}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyEntry(entry)}
                        className={`px-2 py-1 rounded-lg border font-mono text-[9px] font-bold flex items-center gap-1 transition-all cursor-pointer active:scale-95 ${
                          isCopied
                            ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-300'
                            : 'bg-black/50 hover:bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
                        }`}
                        title={t(language, 'copyChangelog')}
                      >
                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{isCopied ? t(language, 'copiedChangelog') : t(language, 'copyChangelog')}</span>
                      </button>
                    </div>
                  </div>

                  <ul className="space-y-1.5 pl-1">
                    {items.map((line, i) => (
                      <li
                        key={i}
                        className="text-xs text-zinc-300 leading-relaxed flex items-start gap-2"
                      >
                        <span className="text-amber-400 mt-1 text-[10px] shrink-0">◆</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-zinc-800 bg-black/60 flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500">
              v{APP_VERSION}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-mono font-bold text-xs cursor-pointer"
            >
              {t(language, 'closeBtn')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
