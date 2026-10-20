/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Language } from '../lib/types';

interface LanguageToggleProps {
  currentLanguage: Language;
  onToggle: (lang: Language) => void;
  className?: string;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  currentLanguage,
  onToggle,
  className = '',
}) => {
  // The accessibility provider plays the toggle cue through updateSettings().
  return (
    <div
      className={`inline-flex items-center p-1 rounded-full bg-[#0c0e18] border border-white/10 shadow-inner ${className}`}
      role="radiogroup"
      aria-label="Language selection"
    >
      <button
        type="button"
        role="radio"
        aria-checked={currentLanguage === 'ta'}
        onClick={() => {
          if (currentLanguage !== 'ta') {
            onToggle('ta');
          }
        }}
        className={`relative px-3 py-1 text-xs font-semibold rounded-full transition-colors duration-200 cursor-pointer select-none font-serif ${
          currentLanguage === 'ta' ? 'text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {currentLanguage === 'ta' && (
          <motion.div
            layoutId="lang-pill"
            className="absolute inset-0 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full shadow-md"
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
          />
        )}
        <span className="relative z-10">தமிழ்</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={currentLanguage === 'en'}
        onClick={() => {
          if (currentLanguage !== 'en') {
            onToggle('en');
          }
        }}
        className={`relative px-3 py-1 text-xs font-semibold rounded-full transition-colors duration-200 cursor-pointer select-none font-mono ${
          currentLanguage === 'en' ? 'text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {currentLanguage === 'en' && (
          <motion.div
            layoutId="lang-pill"
            className="absolute inset-0 bg-gradient-to-r from-teal-400 to-emerald-300 rounded-full shadow-md"
            transition={{ type: 'spring', stiffness: 450, damping: 30 }}
          />
        )}
        <span className="relative z-10">EN</span>
      </button>
    </div>
  );
};
