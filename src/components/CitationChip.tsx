/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';

interface CitationChipProps {
  number: number;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}

export const CitationChip: React.FC<CitationChipProps> = ({
  number,
  onClick,
  className = '',
  active = false,
}) => {
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.15, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={`ஆதாரம் ${number} பார்க்கவும் / View source citation ${number}`}
      className={`inline-flex items-center justify-center mx-1 px-1.5 py-0.5 text-xs font-mono font-bold rounded-md transition-all duration-200 cursor-pointer select-none align-baseline ${
        active
          ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 ring-offset-2 ring-offset-[#08090e] shadow-lg shadow-amber-400/40'
          : 'bg-teal-950/80 text-teal-300 border border-teal-500/40 hover:bg-teal-800/80 hover:text-white hover:border-teal-400'
      } ${className}`}
    >
      [{number}]
    </motion.button>
  );
};
