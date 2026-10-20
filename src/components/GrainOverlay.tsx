/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface GrainOverlayProps {
  opacity?: number;
  className?: string;
}

export const GrainOverlay: React.FC<GrainOverlayProps> = ({ opacity = 0.035, className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-40 select-none ${className}`}
      style={{ opacity }}
    >
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <filter id="grain-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-noise)" />
      </svg>
    </div>
  );
};
