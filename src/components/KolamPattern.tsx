/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';

interface KolamPatternProps {
  className?: string;
  opacity?: number;
}

export const KolamPattern: React.FC<KolamPatternProps> = ({ className = '', opacity = 0.15 }) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity }}
    >
      <svg
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="kolam-grid"
            width="160"
            height="160"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            {/* Dots / Pulli */}
            <circle cx="80" cy="80" r="2.5" fill="#F5B041" opacity="0.8" />
            <circle cx="20" cy="20" r="1.5" fill="#00E5BC" opacity="0.6" />
            <circle cx="140" cy="20" r="1.5" fill="#00E5BC" opacity="0.6" />
            <circle cx="20" cy="140" r="1.5" fill="#00E5BC" opacity="0.6" />
            <circle cx="140" cy="140" r="1.5" fill="#00E5BC" opacity="0.6" />

            {/* Sikku / Looped curved lines */}
            <path
              d="M 80,20 C 110,20 140,50 140,80 C 140,110 110,140 80,140 C 50,140 20,110 20,80 C 20,50 50,20 80,20 Z"
              fill="none"
              stroke="#F5B041"
              strokeWidth="1.2"
              strokeDasharray="4 4"
            />
            <path
              d="M 20,80 Q 80,80 80,20 Q 80,80 140,80 Q 80,80 80,140 Q 80,80 20,80"
              fill="none"
              stroke="#00E5BC"
              strokeWidth="0.9"
            />
            <rect
              x="50"
              y="50"
              width="60"
              height="60"
              fill="none"
              stroke="#FF2A85"
              strokeWidth="0.8"
              transform="rotate(45 80 80)"
              opacity="0.7"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#kolam-grid)" />
      </svg>
    </div>
  );
};
