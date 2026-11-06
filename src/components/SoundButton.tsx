import { useState } from 'react';
import { Volume2, VolumeX, Radio } from 'lucide-react';
import { soundEngine } from './RainWorldSynth';

interface SoundButtonProps {
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
}

export default function SoundButton({ isMuted, setIsMuted }: SoundButtonProps) {
  const [showTooltip, setShowTooltip] = useState(true);

  const handleToggle = () => {
    // Initialise audio on user gesture
    soundEngine.init();
    
    const nextState = soundEngine.toggleMute();
    setIsMuted(nextState);
    setShowTooltip(false);
  };

  return (
    <div id="sound-engine-control" className="relative z-50 flex items-center gap-3">
      {showTooltip && (
        <span 
          id="sound-opt-in-tip"
          className="bg-zinc-900/95 border border-amber-900/70 text-[10px] uppercase tracking-wider font-mono text-amber-500/90 px-3 py-1.5 rounded-md shadow-lg animate-pulse"
        >
          🔇 Ввімкни звук для атмосфери (Rain & Drone)
        </span>
      )}
      
      <button
        id="sound-toggle-trigger"
        onClick={handleToggle}
        className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-300 ${
          isMuted 
            ? 'bg-zinc-950/70 border-zinc-800 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200' 
            : 'bg-amber-950/40 border-amber-600 text-amber-500 hover:bg-amber-950/70 hover:scale-105 shadow-[0_0_12px_rgba(217,119,6,0.25)]'
        }`}
        title={isMuted ? 'Ввімкнути атмосферу' : 'Вимкнути звук'}
      >
        {isMuted ? (
          <VolumeX className="w-5 h-5" />
        ) : (
          <Volume2 className="w-5 h-5 animate-bounce-slow" />
        )}
      </button>

      {/* Small live audio wave badge */}
      {!isMuted && (
        <span 
          id="audio-synth-pulse-signal" 
          className="flex items-center gap-1 font-mono text-[9px] text-amber-600 uppercase tracking-widest"
        >
          <Radio className="w-3 h-3 text-amber-500 animate-pulse" />
          Synth Live
        </span>
      )}
    </div>
  );
}
