/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const SkeletonShimmer: React.FC<SkeletonProps> = ({ className = 'h-4 w-full' }) => {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-lg bg-slate-800/60 ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
};
