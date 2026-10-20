/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { CitationChip } from './CitationChip';

interface TextRevealProps {
  text: string;
  isStreaming?: boolean;
  onCitationClick?: (n: number) => void;
  className?: string;
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  isStreaming = false,
  onCitationClick,
  className = '',
}) => {
  // Parse text into tokens: words and [n] citations
  // Preserve Tamil syllables intact
  const parts = text.split(/(\[\d+\])/g);

  return (
    <div className={`leading-relaxed tracking-normal font-sans text-slate-100 ${className}`}>
      {parts.map((part, index) => {
        const citationMatch = part.match(/^\[(\d+)\]$/);
        if (citationMatch) {
          const num = parseInt(citationMatch[1], 10);
          return (
            <CitationChip
              key={index}
              number={num}
              onClick={() => onCitationClick?.(num)}
            />
          );
        }

        const isTamil = /[\u0B80-\u0BFF]/.test(part);
        return (
          <span key={index} className={isTamil ? 'tamil-text inline' : 'font-sans inline'}>
            {part}
          </span>
        );
      })}

      {isStreaming && (
        <motion.span
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="inline-block w-2 h-4 ml-1 bg-teal-400 rounded-sm align-middle"
          aria-hidden="true"
        />
      )}
    </div>
  );
};
