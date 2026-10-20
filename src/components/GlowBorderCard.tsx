/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';

interface GlowBorderCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: 'teal' | 'gold' | 'magenta' | 'multi';
  active?: boolean;
  onClick?: () => void;
  interactive?: boolean;
}

export const GlowBorderCard: React.FC<GlowBorderCardProps> = ({
  children,
  className = '',
  glowColor = 'multi',
  active = false,
  onClick,
  interactive = false,
}) => {
  const gradientBorders = {
    teal: 'from-teal-400 via-emerald-400 to-cyan-500',
    gold: 'from-amber-400 via-yellow-500 to-orange-400',
    magenta: 'from-pink-500 via-rose-500 to-fuchsia-600',
    multi: 'from-teal-400 via-amber-400 to-rose-500',
  };

  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`relative rounded-2xl p-[1px] transition-all duration-300 group ${
        interactive ? 'cursor-pointer hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-teal-400' : ''
      } ${className}`}
    >
      {/* Animated gradient outline */}
      <motion.div
        animate={{
          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'linear',
        }}
        className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${gradientBorders[glowColor]} ${
          active ? 'opacity-100' : 'opacity-40 group-hover:opacity-85'
        } transition-opacity duration-300 blur-[2px] bg-[length:200%_200%]`}
      />

      {/* Glass card content layer */}
      <div className="relative h-full w-full rounded-2xl bg-[#0c0e17]/90 backdrop-blur-xl p-5 border border-white/5 transition-colors group-hover:bg-[#0f121d]/95">
        {children}
      </div>
    </div>
  );
};
