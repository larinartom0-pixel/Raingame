import React from 'react';
import type { AppLanguage } from '../settings';

interface KarmaSymbolProps {
  karma: number; // 1 to 5
  size?: number;
  className?: string;
  isDanger?: boolean;
  accentColor?: string;
}

export function getKarmaLabel(karma: number, lang: AppLanguage): string {
  const k = Math.max(1, Math.min(5, Math.round(karma || 1)));
  if (lang === 'en') {
    const names = [
      'I • Instinct',
      'II • Focus',
      'III • Bond',
      'IV • Stillness',
      'V • Resonance',
    ];
    return names[k - 1];
  }
  const namesUk = [
    'I • Інстинкт',
    'II • Зосередженість',
    'III • Звʼязок',
    'IV • Спокій',
    'V • Резонанс',
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
  const level = Math.max(1, Math.min(5, Math.round(karma || 1)));
  const stroke = accentColor || (isDanger ? '#fca5a5' : '#ffffff');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
    >
      {/* Outer sacred double ring */}
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
        opacity="0.45"
      />

      {/* Cardinal alignment notches */}
      <line x1="32" y1="3" x2="32" y2="8.5" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="32" y1="55.5" x2="32" y2="61" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="3" y1="32" x2="8.5" y2="32" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="55.5" y1="32" x2="61" y2="32" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />

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
    </svg>
  );
}
