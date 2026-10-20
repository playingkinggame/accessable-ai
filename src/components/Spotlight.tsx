/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';

interface SpotlightProps {
  className?: string;
  fill?: string;
  size?: number;
}

export const Spotlight: React.FC<SpotlightProps> = ({
  className = '',
  fill = 'rgba(0, 229, 188, 0.12)',
  size = 400,
}) => {
  const [position, setPosition] = useState({ x: -500, y: -500 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-30 transition-opacity duration-300 ${className}`}
      style={{
        background: `radial-gradient(${size}px circle at ${position.x}px ${position.y}px, ${fill}, transparent 80%)`,
      }}
    />
  );
};
