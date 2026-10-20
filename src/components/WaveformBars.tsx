/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';

interface WaveformBarsProps {
  active?: boolean;
  barCount?: number;
  className?: string;
  color?: 'teal' | 'gold' | 'magenta';
  volume?: number;
}

export const WaveformBars: React.FC<WaveformBarsProps> = ({
  active = false,
  barCount = 18,
  className = '',
  color = 'teal',
  volume = 0.5,
}) => {
  const colorMap = {
    teal: 'bg-teal-400 shadow-[0_0_8px_rgba(0,229,188,0.5)]',
    gold: 'bg-amber-400 shadow-[0_0_8px_rgba(245,176,65,0.5)]',
    magenta: 'bg-rose-500 shadow-[0_0_8px_rgba(255,42,133,0.5)]',
  };

  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center gap-[3px] h-8 px-2 select-none ${className}`}
    >
      {Array.from({ length: barCount }).map((_, i) => {
        // Pre-calculated wave pattern variations
        const delay = (i % 6) * 0.08;
        const baseHeight = 15 + Math.sin(i * 0.6) * 10;
        const targetHeight = active
          ? Math.min(100, Math.max(20, baseHeight + volume * 70 * Math.sin(i + 1)))
          : 15;

        return (
          <motion.div
            key={i}
            className={`w-[3px] rounded-full transition-colors ${colorMap[color]}`}
            animate={{
              height: active ? [`${baseHeight}%`, `${targetHeight}%`, `${baseHeight}%`] : '15%',
            }}
            transition={{
              duration: active ? 0.45 + (i % 3) * 0.15 : 0.2,
              repeat: active ? Infinity : 0,
              repeatType: 'mirror',
              delay,
              ease: 'easeInOut',
            }}
          />
        );
      })}
    </div>
  );
};
