/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VoiceState } from '../lib/types';

interface VoiceOrbProps {
  state: VoiceState;
  volume?: number; // 0.0 to 1.0
  size?: number;
  onClick?: () => void;
  interactive?: boolean;
  className?: string;
  language?: 'ta' | 'en';
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  volume = 0.2,
  size = 280,
  onClick,
  interactive = true,
  className = '',
  language = 'ta',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Particle/waveform rendering loop on HTML5 canvas for 60fps smoothness
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let t = 0;

    const render = () => {
      t += 0.03;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = (size * 0.42) * (1 + (state === 'listening' ? volume * 0.35 : 0));

      // Gradient definition based on state
      const grad = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.2,
        centerX,
        centerY,
        baseRadius * 1.5
      );

      if (state === 'idle') {
        grad.addColorStop(0, '#00E5BC');
        grad.addColorStop(0.5, 'rgba(15, 118, 110, 0.6)');
        grad.addColorStop(1, 'rgba(7, 8, 14, 0)');
      } else if (state === 'listening') {
        grad.addColorStop(0, '#00F5D4');
        grad.addColorStop(0.4, 'rgba(0, 229, 188, 0.7)');
        grad.addColorStop(0.8, 'rgba(3, 105, 161, 0.4)');
        grad.addColorStop(1, 'rgba(7, 8, 14, 0)');
      } else if (state === 'thinking') {
        grad.addColorStop(0, '#FFD166');
        grad.addColorStop(0.5, 'rgba(245, 176, 65, 0.7)');
        grad.addColorStop(0.8, 'rgba(217, 119, 6, 0.3)');
        grad.addColorStop(1, 'rgba(7, 8, 14, 0)');
      } else {
        // speaking
        grad.addColorStop(0, '#FF2A85');
        grad.addColorStop(0.4, '#F5B041');
        grad.addColorStop(0.7, '#00E5BC');
        grad.addColorStop(1, 'rgba(7, 8, 14, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();

      // Deformable organic liquid perimeter
      const points = 32;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        let waveFactor = 0;

        if (state === 'speaking') {
          waveFactor = Math.sin(angle * 6 + t * 4) * (12 + volume * 25);
        } else if (state === 'listening') {
          waveFactor = Math.sin(angle * 4 + t * 2) * (6 + volume * 20);
        } else if (state === 'thinking') {
          waveFactor = Math.cos(angle * 8 + t * 5) * 8;
        } else {
          waveFactor = Math.sin(angle * 3 + t) * 4;
        }

        const r = baseRadius + waveFactor;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();

      // Orbiting particles when thinking
      if (state === 'thinking') {
        for (let p = 0; p < 6; p++) {
          const orbitAngle = t * 2 + (p * Math.PI) / 3;
          const orbitR = baseRadius * 1.35 + Math.sin(t * 3 + p) * 10;
          const px = centerX + Math.cos(orbitAngle) * orbitR;
          const py = centerY + Math.sin(orbitAngle) * orbitR;

          ctx.fillStyle = '#F5B041';
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(245, 176, 65, 0.2)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(centerX, centerY, orbitR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [state, volume, size]);

  return (
    <div
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`Voice status: ${state}. Click to interact.`}
      className={`relative flex items-center justify-center select-none group ${
        interactive ? 'cursor-pointer focus:outline-none focus:ring-4 focus:ring-teal-500/50 rounded-full' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer reactive ripple rings */}
      <AnimatePresence>
        {state === 'listening' && (
          <>
            <motion.div
              initial={{ scale: 0.8, opacity: 0.8 }}
              animate={{
                scale: [1, 1.4 + volume * 0.5, 1.6],
                opacity: [0.6, 0.2, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeOut',
              }}
              className="absolute inset-0 rounded-full border-2 border-teal-400/40 pointer-events-none"
            />
            <motion.div
              initial={{ scale: 0.8, opacity: 0.6 }}
              animate={{
                scale: [0.9, 1.2 + volume * 0.3, 1.4],
                opacity: [0.5, 0.15, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: 0.6,
                ease: 'easeOut',
              }}
              className="absolute inset-0 rounded-full border border-teal-300/30 pointer-events-none"
            />
          </>
        )}

        {state === 'speaking' && (
          <motion.div
            animate={{
              rotate: 360,
              scale: [1, 1.05 + volume * 0.1, 1],
            }}
            transition={{
              rotate: { duration: 15, repeat: Infinity, ease: 'linear' },
              scale: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="absolute -inset-4 rounded-full border border-dashed border-magenta-500/40 pointer-events-none"
            style={{
              borderColor: 'rgba(255, 42, 133, 0.4)',
              boxShadow: '0 0 35px rgba(255, 42, 133, 0.2)',
            }}
          />
        )}
      </AnimatePresence>

      {/* HTML5 high-res Canvas */}
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        className="w-full h-full pointer-events-none filter drop-shadow-[0_0_35px_rgba(0,229,188,0.3)] transition-transform duration-300 group-hover:scale-105"
      />

      {/* Center glowing focal core */}
      <motion.div
        animate={{
          scale: state === 'speaking' ? [1, 1.15, 0.95, 1.1] : state === 'listening' ? [1, 1.2, 1] : [1, 1.05, 1],
        }}
        transition={{
          duration: state === 'speaking' ? 0.8 : 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={`absolute w-14 h-14 rounded-full backdrop-blur-md pointer-events-none flex items-center justify-center shadow-lg ${
          state === 'idle'
            ? 'bg-teal-400/30 text-teal-200 border border-teal-300/40 shadow-teal-500/30'
            : state === 'listening'
            ? 'bg-teal-400/40 text-teal-100 border border-teal-200 shadow-teal-400/50'
            : state === 'thinking'
            ? 'bg-amber-400/40 text-amber-100 border border-amber-300 shadow-amber-500/50'
            : 'bg-rose-500/40 text-rose-100 border border-rose-300 shadow-pink-500/50'
        }`}
      >
        <span className="text-xl font-bold font-serif">
          {state === 'idle' && (language === 'ta' ? 'அ' : 'A')}
          {state === 'listening' && '🎤'}
          {state === 'thinking' && '⚙️'}
          {state === 'speaking' && '🔊'}
        </span>
      </motion.div>
    </div>
  );
};
