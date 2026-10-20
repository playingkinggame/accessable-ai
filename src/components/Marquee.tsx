/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface MarqueeProps {
  questions: { text_ta: string; text_en: string; category: string; category_en?: string }[];
  onSelectQuestion: (question: string) => void;
  language?: 'ta' | 'en';
  className?: string;
}

export const Marquee: React.FC<MarqueeProps> = ({
  questions,
  onSelectQuestion,
  language = 'ta',
  className = '',
}) => {
  // Duplicate array for seamless infinite marquee loop
  const list = [...questions, ...questions];

  return (
    <div
      aria-label="Sample queries"
      className={`relative w-full overflow-hidden py-3 select-none ${className}`}
    >
      {/* Edge gradient fade masks */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#07080e] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#07080e] to-transparent z-10 pointer-events-none" />

      <motion.div
        animate={{
          x: ['0%', '-50%'],
        }}
        transition={{
          duration: 35,
          repeat: Infinity,
          ease: 'linear',
        }}
        whileHover={{ animationPlayState: 'paused' }}
        className="flex gap-4 w-max items-center"
      >
        {list.map((item, index) => {
          const text = language === 'ta' ? item.text_ta : item.text_en;
          const category = language === 'ta' ? item.category : (item.category_en || item.category);

          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelectQuestion(text)}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#0e111a]/90 border border-slate-800 hover:border-teal-400/60 hover:bg-[#151928] text-slate-300 hover:text-white transition-all duration-200 cursor-pointer shadow-sm group text-left focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <span className="p-1 rounded-full bg-teal-500/10 text-teal-400 group-hover:text-amber-300">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span className={`text-xs font-medium whitespace-nowrap ${language === 'ta' ? 'tamil-text' : 'font-sans'}`}>
                {text}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 whitespace-nowrap">
                {category}
              </span>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
};
