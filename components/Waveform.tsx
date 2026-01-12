
import React, { useEffect, useState } from 'react';

interface WaveformProps {
  active: boolean;
  intensity: number;
}

const Waveform: React.FC<WaveformProps> = ({ active, intensity }) => {
  const bars = Array.from({ length: 64 }); // Increased density for a smoother look
  const [time, setTime] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    const animate = () => {
      setTime((prev) => prev + 1);
      animationFrameId = requestAnimationFrame(animate);
    };
    if (active) {
      animationFrameId = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [active]);

  return (
    <div className="flex items-center justify-center gap-[2px] h-32 w-full max-w-xl mx-auto overflow-hidden">
      {bars.map((_, i) => {
        // Calculate a center-weighted amplitude (Bell curve)
        const normalizedIdx = i / (bars.length - 1);
        const distanceFromCenter = Math.abs(normalizedIdx - 0.5) * 2;
        const weight = Math.pow(1 - distanceFromCenter, 1.8);
        
        // Multi-layered sine wave for more "organic" movement
        const wave1 = Math.sin((time * 0.08) + (i * 0.15));
        const wave2 = Math.sin((time * 0.05) - (i * 0.3)) * 0.5;
        const wave3 = Math.sin((time * 0.12) + (i * 0.05)) * 0.3;
        
        const combinedWave = (wave1 + wave2 + wave3) / 1.8;
        
        // Base height + animation + intensity boost
        const baseHeight = 4;
        const animatedHeight = active 
          ? (combinedWave * 40 + 50) * (intensity / 100) * weight 
          : 0;
        
        const height = Math.max(baseHeight, animatedHeight);
        
        // Dynamic glow and opacity based on intensity
        const opacity = active ? 0.3 + (intensity / 100) * 0.7 : 0.05;
        const glowStrength = active ? (intensity / 100) * 15 : 0;
        
        // Slight color variation for depth
        const isCenter = weight > 0.7;
        const barColor = isCenter && active ? 'bg-white' : 'bg-zinc-300';

        return (
          <div
            key={i}
            className={`w-[2px] rounded-full transition-all duration-75 ease-out ${barColor}`}
            style={{
              height: `${height}px`,
              opacity: opacity,
              boxShadow: active && intensity > 50 
                ? `0 0 ${glowStrength}px rgba(255,255,255,${(intensity / 100) * 0.4})` 
                : 'none',
              filter: active ? `brightness(${1 + (intensity / 200)})` : 'none'
            }}
          />
        );
      })}
    </div>
  );
};

export default Waveform;
