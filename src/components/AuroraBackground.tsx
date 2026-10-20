/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';

interface AuroraBackgroundProps {
  children?: React.ReactNode;
  className?: string;
  showRadialGradient?: boolean;
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({
  children,
  className = '',
  showRadialGradient = true,
}) => {
  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden bg-[#07080e] text-slate-100 transition-colors duration-500 ${className}`}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            x: [0, 25, 0],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -top-[20%] -left-[10%] w-[55vw] h-[55vw] rounded-full bg-gradient-to-br from-teal-500/20 via-emerald-600/10 to-transparent blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1.1, 1, 1.1],
            x: [0, -30, 0],
            y: [0, 35, 0],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-[20%] -right-[15%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-br from-amber-500/15 via-yellow-600/10 to-transparent blur-[130px]"
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            x: [20, -20, 20],
          }}
          transition={{
            duration: 26,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -bottom-[20%] left-[25%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-tr from-fuchsia-600/15 via-rose-600/10 to-transparent blur-[140px]"
        />
      </div>

      {showRadialGradient && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,8,14,0.85)_100%)] pointer-events-none" />
      )}

      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
};
