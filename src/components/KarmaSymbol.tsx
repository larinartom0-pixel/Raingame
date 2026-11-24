import React from 'react';
import type { AppLanguage } from '../settings';
import { MAX_KARMA } from '../types';

interface KarmaSymbolProps {
  karma: number; // 1 to 10
  size?: number;
  className?: string;
  isDanger?: boolean;
  accentColor?: string;
}

export function getKarmaLabel(karma: number, lang: AppLanguage): string {
  const k = Math.max(1, Math.min(MAX_KARMA, Math.round(karma || 1)));
  if (lang === 'en') {
    const names = [
      'I • Instinct',
      'II • Focus',
      'III • Bond',
      'IV • Stillness',
      'V • Resonance',
      'VI • Detachment',
      'VII • Awakening',
      'VIII • Harmony',
      'IX • Threshold',
      'X • Ascension',
    ];
    return names[k - 1];
  }
  const namesUk = [
    'I • Інстинкт',
    'II • Зосередженість',
    'III • Звʼязок',
    'IV • Спокій',
    'V • Резонанс',
    'VI • Зречення',
    'VII • Пробудження',
    'VIII • Гармонія',
    'IX • Поріг',
    'X • Вознесіння',
  ];
  return namesUk[k - 1];
}

export default function KarmaSymbol({
  karma,
  size = 38,
  className = '',
  isDanger = false,
  accentColor,
}: KarmaSymbolProps) {
  const level = Math.max(1, Math.min(MAX_KARMA, Math.round(karma || 1)));
  const isAscended = level >= 6;
  const stroke = accentColor || (isDanger ? '#fca5a5' : isAscended ? '#fde68a' : '#ffffff');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
    >
      {/* Outer sacred double ring (ascended tiers 6-10 feature a celestial segmented outer halo) */}
      {isAscended && (
        <circle
          cx="32"
          cy="32"
          r="29.2"
          stroke={stroke}
          strokeWidth="1.1"
          strokeDasharray="2.5 3.5"
          opacity="0.7"
        />
      )}
      <circle
        cx="32"
        cy="32"
        r="26.5"
        stroke={stroke}
        strokeWidth="2.4"
        opacity="0.95"
      />
      <circle
        cx="32"
        cy="32"
        r="21.5"
        stroke={stroke}
        strokeWidth="1.2"
        opacity={isAscended ? 0.65 : 0.45}
      />

      {/* Cardinal alignment notches */}
      <line x1="32" y1="3" x2="32" y2="8.5" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="32" y1="55.5" x2="32" y2="61" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="3" y1="32" x2="8.5" y2="32" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="55.5" y1="32" x2="61" y2="32" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />

      {/* Diagonal ascension ticks for Karma 6-10 */}
      {isAscended && (
        <g stroke={stroke} strokeWidth="1.7" strokeLinecap="round" opacity="0.8">
          <line x1="11.5" y1="11.5" x2="14.8" y2="14.8" />
          <line x1="52.5" y1="11.5" x2="49.2" y2="14.8" />
          <line x1="11.5" y1="52.5" x2="14.8" y2="49.2" />
          <line x1="52.5" y1="52.5" x2="49.2" y2="49.2" />
        </g>
      )}

      {/* Karma 1: Vertical Spear-Anchor Instinct */}
      {level === 1 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <line x1="32" y1="12" x2="32" y2="52" strokeWidth="2.8" />
          <path d="M22 25 C22 18 42 18 42 25" strokeWidth="2.2" />
          <path d="M24 39 L32 48 L40 39" strokeWidth="2.4" />
          <circle cx="32" cy="31" r="4.2" fill={stroke} />
        </g>
      )}

      {/* Karma 2: Twin Crescent Dualism */}
      {level === 2 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <line x1="32" y1="12" x2="32" y2="52" strokeWidth="2.4" />
          <path d="M21 18 A14 14 0 0 0 21 46" strokeWidth="2.4" />
          <path d="M43 18 A14 14 0 0 1 43 46" strokeWidth="2.4" />
          <circle cx="32" cy="22" r="2.8" fill={stroke} />
          <circle cx="32" cy="42" r="2.8" fill={stroke} />
          <line x1="18" y1="32" x2="46" y2="32" strokeWidth="1.6" opacity="0.6" />
        </g>
      )}

      {/* Karma 3: Interlocking Triad Bond */}
      {level === 3 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="32,13 48,43 16,43" strokeWidth="2.3" fill="none" />
          <circle cx="32" cy="33" r="6.5" strokeWidth="2.0" />
          <line x1="32" y1="13" x2="32" y2="26.5" strokeWidth="2.0" />
          <line x1="48" y1="43" x2="37.5" y2="36.5" strokeWidth="2.0" />
          <line x1="16" y1="43" x2="26.5" y2="36.5" strokeWidth="2.0" />
          <circle cx="32" cy="33" r="2.6" fill={stroke} />
        </g>
      )}

      {/* Karma 4: Four-Fold Cross Compass */}
      {level === 4 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <line x1="32" y1="11" x2="32" y2="53" strokeWidth="2.3" />
          <line x1="11" y1="32" x2="53" y2="32" strokeWidth="2.3" />
          <polygon points="32,19 45,32 32,45 19,32" strokeWidth="2.2" fill="none" />
          <circle cx="22" cy="22" r="2.2" fill={stroke} />
          <circle cx="42" cy="22" r="2.2" fill={stroke} />
          <circle cx="22" cy="42" r="2.2" fill={stroke} />
          <circle cx="42" cy="42" r="2.2" fill={stroke} />
          <circle cx="32" cy="32" r="3.4" fill={stroke} />
        </g>
      )}

      {/* Karma 5: Full Radiant Mandala Resonance */}
      {level === 5 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="32" cy="32" r="13.5" strokeWidth="2.1" />
          <polygon points="32,11 39,25 53,32 39,39 32,53 25,39 11,32 25,25" strokeWidth="2.0" fill="none" />
          <line x1="20" y1="20" x2="44" y2="44" strokeWidth="1.7" opacity="0.8" />
          <line x1="44" y1="20" x2="20" y2="44" strokeWidth="1.7" opacity="0.8" />
          <circle cx="32" cy="32" r="5" fill={stroke} />
          <circle cx="32" cy="14.5" r="2" fill={stroke} />
          <circle cx="32" cy="49.5" r="2" fill={stroke} />
          <circle cx="14.5" cy="32" r="2" fill={stroke} />
          <circle cx="49.5" cy="32" r="2" fill={stroke} />
        </g>
      )}

      {/* Karma 6: Hexagonal Echo Seal — Detachment */}
      {level === 6 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <polygon points="32,13 48.5,22.5 48.5,41.5 32,51 15.5,41.5 15.5,22.5" strokeWidth="2.1" fill="none" />
          <line x1="32" y1="13" x2="32" y2="51" strokeWidth="1.9" />
          <path d="M18 25 C24 30 40 30 46 25" strokeWidth="2.0" />
          <path d="M18 39 C24 34 40 34 46 39" strokeWidth="2.0" />
          <circle cx="32" cy="32" r="4.2" fill={stroke} />
          <circle cx="32" cy="17.5" r="1.8" fill={stroke} />
          <circle cx="32" cy="46.5" r="1.8" fill={stroke} />
        </g>
      )}

      {/* Karma 7: Seven-Rayed Eye of Insight — Awakening */}
      {level === 7 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 32 C20 20 44 20 50 32 C44 44 20 44 14 32 Z" strokeWidth="2.2" />
          <circle cx="32" cy="32" r="7.5" strokeWidth="2.0" />
          <circle cx="32" cy="32" r="3.2" fill={stroke} />
          <line x1="32" y1="12" x2="32" y2="21" strokeWidth="2.1" />
          <line x1="32" y1="43" x2="32" y2="52" strokeWidth="2.1" />
          <line x1="21" y1="15" x2="25" y2="22" strokeWidth="1.7" />
          <line x1="43" y1="15" x2="39" y2="22" strokeWidth="1.7" />
          <circle cx="19" cy="47" r="1.7" fill={stroke} />
          <circle cx="45" cy="47" r="1.7" fill={stroke} />
        </g>
      )}

      {/* Karma 8: Eight-Fold Sacred Octagram — Harmony */}
      {level === 8 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <rect x="20" y="20" width="24" height="24" strokeWidth="2.0" />
          <polygon points="32,14 50,32 32,50 14,32" strokeWidth="2.0" fill="none" />
          <circle cx="32" cy="32" r="7.2" strokeWidth="1.9" />
          <circle cx="32" cy="32" r="3.0" fill={stroke} />
          <circle cx="32" cy="14" r="1.9" fill={stroke} />
          <circle cx="32" cy="50" r="1.9" fill={stroke} />
          <circle cx="14" cy="32" r="1.9" fill={stroke} />
          <circle cx="50" cy="32" r="1.9" fill={stroke} />
        </g>
      )}

      {/* Karma 9: Triple-Tiered Void Gate — Threshold */}
      {level === 9 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 26 A16 16 0 0 0 48 26" strokeWidth="2.2" />
          <path d="M21 44 C21 36 43 36 43 44" strokeWidth="2.0" />
          <circle cx="32" cy="24" r="7.5" strokeWidth="2.1" />
          <circle cx="32" cy="24" r="3.1" fill={stroke} />
          <line x1="32" y1="11" x2="32" y2="16.5" strokeWidth="2.1" />
          <line x1="32" y1="31.5" x2="32" y2="52" strokeWidth="2.2" />
          <polygon points="32,45 36,49 32,53 28,49" fill={stroke} />
          <circle cx="18" cy="19" r="1.8" fill={stroke} />
          <circle cx="46" cy="19" r="1.8" fill={stroke} />
        </g>
      )}

      {/* Karma 10 (X): Iconic Void Cross — Ascension */}
      {level === 10 && (
        <g stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
          {/* Bold central Ascension X */}
          <line x1="17" y1="17" x2="47" y2="47" strokeWidth="3.2" />
          <line x1="47" y1="17" x2="17" y2="47" strokeWidth="3.2" />
          {/* Inner sacred ring & diamond void core */}
          <circle cx="32" cy="32" r="11.5" strokeWidth="1.9" />
          <polygon points="32,24 40,32 32,40 24,32" fill={stroke} />
          <circle cx="32" cy="32" r="2.6" fill="#09090b" stroke="none" />
          {/* Four cardinal ascension sparks */}
          <circle cx="32" cy="13.5" r="2.1" fill={stroke} />
          <circle cx="32" cy="50.5" r="2.1" fill={stroke} />
          <circle cx="13.5" cy="32" r="2.1" fill={stroke} />
          <circle cx="50.5" cy="32" r="2.1" fill={stroke} />
        </g>
      )}
    </svg>
  );
}
