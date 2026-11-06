import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from './RainWorldSynth';
import { WeatherState } from '../types';

interface RainCanvasProps {
  weather: WeatherState;
  setWeather: React.Dispatch<React.SetStateAction<WeatherState>>;
  isSoundMuted: boolean;
}

export default function RainCanvas({ weather, setWeather, isSoundMuted }: RainCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const timeRef = useRef(0);
  const lightningTimerRef = useRef<any>(null);

  // Rain dropping pool
  const rainDropsRef = useRef<Array<{
    x: number;
    y: number;
    vy: number;
    vx: number;
    length: number;
    alpha: number;
  }>>([]);

  // Splash particle pool
  const splashesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: string;
  }>>([]);

  // Dust specks floating around
  const dustRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
  }>>([]);

  // Handle cursor hover tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Set up procedural lightning strikes
  useEffect(() => {
    const triggerLightning = () => {
      // Trigger lightning flash state
      setWeather(prev => ({ ...prev, lightningFlash: true }));
      
      // Play thunder audio via the procedural synthesizer (if sound is active)
      if (!isSoundMuted) {
        soundEngine.playThunder();
      }

      // First flash end
      setTimeout(() => {
        setWeather(prev => ({ ...prev, lightningFlash: false }));
        
        // Double-strike chance!
        if (Math.random() > 0.4) {
          setTimeout(() => {
            setWeather(prev => ({ ...prev, lightningFlash: true }));
            setTimeout(() => {
              setWeather(prev => ({ ...prev, lightningFlash: false }));
            }, 60 + Math.random() * 80);
          }, 150 + Math.random() * 100);
        }
      }, 100 + Math.random() * 100);

      // Reschedule next strike
      scheduleNextLightning();
    };

    const scheduleNextLightning = () => {
      const wait = 15000 + Math.random() * 25000; // between 15 and 40 seconds
      lightningTimerRef.current = setTimeout(triggerLightning, wait);
    };

    scheduleNextLightning();

    return () => {
      if (lightningTimerRef.current) {
        clearTimeout(lightningTimerRef.current);
      }
    };
  }, [isSoundMuted, setWeather]);

  // Adjust rain audio synthesis when intensity updates
  useEffect(() => {
    soundEngine.setRainIntensity(weather.intensity);
  }, [weather.intensity]);

  // Initialise structures and run loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize monitoring
    const handleResize = () => {
      if (!containerRef.current || !canvas) return;
      canvas.width = containerRef.current.clientWidth;
      canvas.height = containerRef.current.clientHeight;

      // Populate dust
      if (dustRef.current.length === 0) {
        dustRef.current = Array.from({ length: 60 }, () => ({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() * 0.4 - 0.2),
          vy: -(Math.random() * 0.3 + 0.1),
          size: Math.random() * 2.5 + 0.5,
          alpha: Math.random() * 0.4 + 0.1,
        }));
      }
    };

    // Use ResizeObserver for responsive canvas scaling without breakages
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    handleResize();

    // Loop
    let animationId: number;
    
    // Slugcat state variables
    const slugcat = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      breathFactor: 0,
      tailWag: 0,
    };

    const render = () => {
      timeRef.current += 0.05;
      const t = timeRef.current;
      const width = canvas.width;
      const height = canvas.height;

      // Draw background Sky Atmosphere (Rain World iconic rust/midnight purple sunset palette)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      if (weather.lightningFlash) {
        // Highly illuminated sky during lightning
        skyGrad.addColorStop(0, '#585973');
        skyGrad.addColorStop(0.5, '#2e3047');
        skyGrad.addColorStop(1, '#1b1d28');
      } else {
        // Moody dark post-industrial sky (dark violet/maroon gradients)
        skyGrad.addColorStop(0, '#090812');
        skyGrad.addColorStop(0.4, '#151324');
        skyGrad.addColorStop(0.75, '#1e1620'); // hints of acid rust orange
        skyGrad.addColorStop(1, '#0c0a0f');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Apply dynamic wind drifts
      const windForce = weather.intensity * 4 + weather.windX;

      // 1. DRAW FAR BACKGROUND ELEMENTS (Iterator Silhouettes / Pillars)
      ctx.save();
      ctx.fillStyle = weather.lightningFlash ? '#251e2b' : '#0a0810';
      
      // Giant cooling tower silhouette
      ctx.beginPath();
      ctx.moveTo(width * 0.1, height);
      ctx.quadraticCurveTo(width * 0.15, height * 0.4, width * 0.2, height * 0.1);
      ctx.lineTo(width * 0.28, height * 0.1);
      ctx.quadraticCurveTo(width * 0.33, height * 0.4, width * 0.38, height);
      ctx.closePath();
      ctx.fill();

      // Industrial girders far away
      ctx.fillStyle = weather.lightningFlash ? '#2a2235' : '#100c19';
      ctx.fillRect(width * 0.55, height * 0.3, 40, height * 0.7);
      ctx.fillRect(width * 0.5, height * 0.45, width * 0.4, 15);
      
      // Truss crossing lines
      ctx.strokeStyle = weather.lightningFlash ? '#3d304f' : '#150f24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let gy = height * 0.45; gy < height; gy += 60) {
        ctx.moveTo(width * 0.55, gy);
        ctx.lineTo(width * 0.55 + 40, gy + 30);
        ctx.moveTo(width * 0.55 + 40, gy);
        ctx.lineTo(width * 0.55, gy + 30);
      }
      ctx.stroke();
      ctx.restore();

      // Draw background fog
      ctx.fillStyle = `rgba(14, 12, 18, ${0.45 * weather.intensity})`;
      ctx.fillRect(0, height * 0.5, width, height * 0.5);

      // 2. DRAW FLOATING DUST SPECKS (Warm micro-particles floating)
      ctx.save();
      dustRef.current.forEach((dust) => {
        // move
        dust.y += dust.vy + (Math.sin(t + dust.x) * 0.05);
        dust.x += dust.vx + Math.sin(t + dust.y) * 0.1;

        if (dust.y < -10) dust.y = height + 10;
        if (dust.x < -10) dust.x = width + 10;
        if (dust.x > width + 10) dust.x = -10;

        ctx.fillStyle = `rgba(250, 160, 90, ${dust.alpha * (weather.lightningFlash ? 2.5 : 1.0)})`;
        ctx.shadowBlur = weather.lightningFlash ? 8 : 2;
        ctx.shadowColor = '#f97316';
        ctx.beginPath();
        ctx.arc(dust.x, dust.y, dust.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // 3. DRAW MIDGROUND STRUCTURES (Ropes and heavy Cables)
      ctx.save();
      ctx.strokeStyle = weather.lightningFlash ? '#342948' : '#171124';
      ctx.lineWidth = 4;
      ctx.beginPath();
      // Swagging cables
      ctx.moveTo(0, height * 0.3);
      ctx.quadraticCurveTo(width * 0.4, height * 0.65, width, height * 0.4);
      ctx.moveTo(0, height * 0.38);
      ctx.quadraticCurveTo(width * 0.6, height * 0.75, width, height * 0.25);
      ctx.stroke();
      ctx.restore();

      // 4. THE PROTAGONIST'S PIPE (where Slugcat sits in focus)
      // Placed centrally-left in standard cinematic styling
      const pipeY = height * 0.65;
      const pipeLeft = width * 0.2;
      const pipeRight = width * 0.8;
      
      ctx.save();
      // Draw industrial girders framing of the foreground
      const fgGlowGrad = ctx.createLinearGradient(0, pipeY, 0, height);
      fgGlowGrad.addColorStop(0, '#12111d');
      fgGlowGrad.addColorStop(1, '#06050b');
      ctx.fillStyle = fgGlowGrad;
      
      // Main concrete block pipe resting on
      ctx.fillRect(pipeLeft - 50, pipeY, 120, height - pipeY + 100);
      
      // Draw rusty supporting pipe details
      ctx.strokeStyle = '#29201a';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pipeLeft, pipeY);
      ctx.lineTo(pipeRight, pipeY + 20); // slightly sagging
      ctx.stroke();

      // Pipe high-light
      ctx.strokeStyle = weather.lightningFlash ? '#aa9080' : '#45352b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pipeLeft, pipeY - 4);
      ctx.lineTo(pipeRight, pipeY + 16);
      ctx.stroke();

      // Concrete outline
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#272635';
      ctx.strokeRect(pipeLeft - 50, pipeY, 120, height - pipeY + 100);
      ctx.restore();

      // 5. DRAW THE SLUGCAT SILHOUETTE
      // Slugcat is positioned at pipeLeft + 10
      const scX = pipeLeft + 10;
      const scY = pipeY; // sitting on top of pipe

      // Animations state updates
      slugcat.breathFactor = Math.sin(t * 0.7) * 1.4; // breathing expand factor
      slugcat.tailWag = Math.cos(t * 0.3) * 6; // tail wave

      ctx.save();
      
      // Smooth tail
      ctx.beginPath();
      ctx.strokeStyle = '#f1eedb';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.moveTo(scX, scY + 30);
      ctx.quadraticCurveTo(
        scX - 25 + slugcat.tailWag, 
        scY + 45 + slugcat.breathFactor, 
        scX - 45 + slugcat.tailWag * 1.4, 
        scY + 35
      );
      ctx.stroke();

      // Core body (round and squishy, slightly offset based on breath)
      ctx.fillStyle = '#fdfdf6'; // Soft pearly white slugcat
      ctx.beginPath();
      // Body shape
      const rx = 18 + slugcat.breathFactor * 0.3;
      const ry = 28 + slugcat.breathFactor;
      ctx.ellipse(scX, scY - 12 + slugcat.breathFactor * 0.5, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Head shape (merges nicely)
      ctx.beginPath();
      ctx.arc(scX, scY - 33 + slugcat.breathFactor * 0.8, 15, 0, Math.PI * 2);
      ctx.fill();

      // Ears (cute pointed white nubs)
      const earBreath = slugcat.breathFactor * 0.4;
      // Left ear
      ctx.beginPath();
      ctx.moveTo(scX - 12, scY - 42);
      ctx.quadraticCurveTo(scX - 13, scY - 62 + earBreath, scX - 3, scY - 45);
      ctx.closePath();
      ctx.fill();

      // Right ear
      ctx.beginPath();
      ctx.moveTo(scX + 3, scY - 45);
      ctx.quadraticCurveTo(scX + 11, scY - 62 + earBreath, scX + 12, scY - 42);
      ctx.closePath();
      ctx.fill();

      // Small chubby crawling arms resting on pipe
      ctx.beginPath();
      ctx.ellipse(scX - 10, scY + 10, 6, 8, Math.PI / 4, 0, Math.PI * 2);
      ctx.ellipse(scX + 10, scY + 10, 6, 8, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      // 6. SLUGCAT EYES (LARGE GLOWING OBSIDIAN SPHERES WITH WHITE HIGHLIGHTS)
      // Eyes dynamically look toward cursor mouseRef
      const eyeL_X = scX - 7;
      const eyeR_X = scX + 7;
      const eyeY = scY - 33 + slugcat.breathFactor * 0.8;

      // Calculate vector towards cursor
      const dx = mouseRef.current.x - scX;
      const dy = mouseRef.current.y - eyeY;
      const angle = Math.atan2(dy, dx);
      // Limit eye motion length
      const maxEyeOffset = 2.5;
      const eyeOffX = Math.cos(angle) * maxEyeOffset;
      const eyeOffY = Math.sin(angle) * maxEyeOffset;

      ctx.fillStyle = '#111015'; // Dark obsidian black pits

      // Left eye
      ctx.beginPath();
      ctx.arc(eyeL_X + eyeOffX, eyeY + eyeOffY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Right eye
      ctx.beginPath();
      ctx.arc(eyeR_X + eyeOffX, eyeY + eyeOffY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Small glowing eye glint (signature Rain World expression)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeL_X + eyeOffX - 1, eyeY + eyeOffY - 1, 1.2, 0, Math.PI * 2);
      ctx.arc(eyeR_X + eyeOffX - 1, eyeY + eyeOffY - 1, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Soft breathing glow around the Slugcat during lightning strikes
      if (weather.lightningFlash) {
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#ffffff';
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();

      // 7. DRAW DETAILED RAIN AND COLLISION SYSTEM
      // Generate individual droplets based on current scene intensity setting
      const targetCount = weather.intensity * 120 + 30;
      while (rainDropsRef.current.length < targetCount) {
        rainDropsRef.current.push({
          x: Math.random() * width,
          y: Math.random() * -200, // enter from overhead
          vy: Math.random() * 22 + 18, // high speed falling
          vx: windForce + (Math.random() * 2 - 1),
          length: Math.random() * 25 + 15,
          alpha: Math.random() * 0.45 + 0.15,
        });
      }

      ctx.save();
      // Style rain streaks with gradient-like lines
      rainDropsRef.current.forEach((drop, idx) => {
        // move rain particle
        drop.y += drop.vy;
        drop.x += drop.vx;

        // Draw streak
        ctx.strokeStyle = `rgba(165, 180, 252, ${drop.alpha})`; // Lavender tint
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - (drop.vx * 0.4), drop.y - drop.length);
        ctx.stroke();

        // PIPE COLLISION CHECK (Check if drop hits the pipe wire)
        // Pipe ranges from pipeLeft to pipeRight at pipeY
        const hitPipe = 
          drop.y >= pipeY && 
          drop.y - drop.vy <= pipeY && 
          drop.x >= pipeLeft && 
          drop.x <= pipeRight;

        // FLOOR COLLISION CHECK (Bottom of screen ripples)
        const hitFloor = drop.y >= height;

        if (hitPipe || hitFloor) {
          const impactX = hitPipe ? drop.x : drop.x;
          const impactY = hitPipe ? pipeY : height;
          
          // Spawn splashing burst particles
          const splashCount = Math.floor(Math.random() * 3) + 2;
          for (let s = 0; s < splashCount; s++) {
            splashesRef.current.push({
              x: impactX,
              y: impactY - 2,
              vx: (Math.random() * 4 - 2) + (drop.vx * 0.2),
              vy: -(Math.random() * 3 + 1),
              life: 0,
              maxLife: Math.random() * 12 + 6,
              color: `rgba(190, 218, 255, ${drop.alpha * 1.5})`
            });
          }

          // Reset droplet at the top
          drop.y = Math.random() * -100;
          drop.x = Math.random() * (width + 300) - 150;
          drop.vx = windForce + (Math.random() * 2 - 1);
        }
      });

      // Filter out rain drop dead ones (if they blow completely off sides)
      rainDropsRef.current = rainDropsRef.current.map((drop) => {
        if (drop.x < -300 || drop.x > width + 300) {
          return {
            x: Math.random() * width,
            y: Math.random() * -100,
            vy: Math.random() * 22 + 18,
            vx: windForce + (Math.random() * 2 - 1),
            length: Math.random() * 25 + 15,
            alpha: Math.random() * 0.45 + 0.15,
          };
        }
        return drop;
      });
      ctx.restore();

      // 8. ANIMATE ACCUMULATED RUNTIME SPLASH ACCRETIONS
      ctx.save();
      splashesRef.current.forEach((sp, idx) => {
        // Apply gravity to splash particles
        sp.y += sp.vy;
        sp.x += sp.vx;
        sp.vy += 0.22; // gravity drop multiplier
        sp.life++;

        // Draw splash particle
        ctx.fillStyle = sp.color;
        ctx.fillRect(sp.x, sp.y, 1.8, 1.8);
      });

      // Erase dead splashes
      splashesRef.current = splashesRef.current.filter((sp) => sp.life < sp.maxLife);
      ctx.restore();

      // 9. CONDENSATION WATER DRIPS (Procedural dripping from pipe corners)
      if (t % 12 < 0.1 && Math.random() > 0.4) {
        // Spawn a slow vertical drip from the pipe under slugcat's platform ledge
        splashesRef.current.push({
          x: pipeLeft + 60,
          y: pipeY + 9,
          vx: 0,
          vy: 2.2, // falling down
          life: 0,
          maxLife: 80, // survives longer to fall to bottom
          color: 'rgba(255,255,255,0.45)'
        });
      }

      // Draw subtle steam/mist at slugcat's mouth (breathing mist!)
      // Spawns on a slow frequency
      if (Math.sin(t * 0.7) > 0.95 && Math.random() > 0.6) {
        const mistX = scX + 2;
        const mistY = scY - 26;
        for (let m = 0; m < 5; m++) {
          splashesRef.current.push({
            x: mistX,
            y: mistY,
            vx: Math.random() * 0.6 + 0.2, // drift forward
            vy: -(Math.random() * 0.4 + 0.1), // drift up
            life: 0,
            maxLife: Math.random() * 20 + 15,
            color: `rgba(255, 255, 255, ${Math.random() * 0.12 + 0.05})`
          });
        }
      }

      // 10. LIGHTNING FORERUNNER SPARKS (Glowing neon points / broken conduits far away)
      const conduitX = width * 0.7;
      const conduitY = height * 0.45;
      
      // Flickering active wire spark
      if (Math.random() > 0.92) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#06b6d2';
        ctx.fillStyle = '#06b6d2';
        ctx.beginPath();
        ctx.arc(conduitX, conduitY, Math.random() * 3.5 + 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    // Clean up
    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
    };
  }, [weather.intensity, weather.windX, weather.lightningFlash]);

  return (
    <div id="rain-canvas-ambient-wrapper" ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none z-0">
      <canvas id="ambient-rain-rendering-canvas" ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
