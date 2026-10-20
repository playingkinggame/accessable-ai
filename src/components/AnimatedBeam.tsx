/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Mic, Search, FileText, Volume2 } from 'lucide-react';

interface AnimatedBeamProps {
  activeStep?: number; // 0 to 3
  language?: 'ta' | 'en';
  className?: string;
}

export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  activeStep = 1,
  language = 'ta',
  className = '',
}) => {
  const steps = [
    {
      id: 0,
      icon: Mic,
      label_ta: '1. பேச்சுப் பதிவு',
      desc_ta: 'குரல் உள்ளீடு ஏற்பு',
      label_en: '1. Speech Capture',
      desc_en: 'Real-time audio stream',
      color: 'teal',
      glow: 'shadow-teal-500/40',
    },
    {
      id: 1,
      icon: Search,
      label_ta: '2. சொற்பொருள் தேடல்',
      desc_ta: 'ஆவணங்களில் தேடல்',
      label_en: '2. Semantic Search',
      desc_en: 'Dense vector retrieval',
      color: 'amber',
      glow: 'shadow-amber-500/40',
    },
    {
      id: 2,
      icon: FileText,
      label_ta: '3. ஆதாரம் சரிபார்ப்பு',
      desc_ta: 'பக்க எண் சான்று',
      label_en: '3. Exact Citation',
      desc_en: 'PDF page verification',
      color: 'rose',
      glow: 'shadow-rose-500/40',
    },
    {
      id: 3,
      icon: Volume2,
      label_ta: '4. குரல் வழி விளக்கம்',
      desc_ta: 'நேரடி ஒலிபரப்பு',
      label_en: '4. Voice Synthesis',
      desc_en: 'Audio answer with cards',
      color: 'teal',
      glow: 'shadow-teal-500/40',
    },
  ];

  return (
    <div className={`w-full max-w-4xl mx-auto py-6 px-4 ${className}`}>
      <div className="relative flex items-center justify-between">
        {/* Connecting Background Line */}
        <div className="absolute top-1/2 left-8 right-8 -translate-y-1/2 h-[2px] bg-slate-800 z-0" />

        {/* Animated flow pulse line */}
        <div className="absolute top-1/2 left-8 right-8 -translate-y-1/2 h-[2px] overflow-hidden pointer-events-none z-0">
          <motion.div
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="w-1/3 h-full bg-gradient-to-r from-transparent via-teal-400 to-amber-400 opacity-90 blur-[1px]"
          />
        </div>

        {/* 4 Pipeline Node Circles */}
        {steps.map((step) => {
          const Icon = step.icon;
          const isActive = step.id <= activeStep;
          const primaryLabel = language === 'ta' ? step.label_ta : step.label_en;
          const secondaryLabel = language === 'ta' ? step.desc_ta : step.desc_en;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center">
              <motion.div
                whileHover={{ scale: 1.1 }}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
                  isActive
                    ? 'bg-[#0f1422] border-teal-400 text-teal-300 shadow-lg shadow-teal-500/20'
                    : 'bg-[#090b12] border-slate-800 text-slate-500'
                }`}
              >
                <Icon className="w-6 h-6" />
                {isActive && (
                  <motion.div
                    animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.2, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 rounded-2xl border border-teal-400/50 pointer-events-none"
                  />
                )}
              </motion.div>

              <div className="mt-3 text-center">
                <p className="text-xs font-semibold text-amber-400">{primaryLabel}</p>
                <p className="text-[11px] text-slate-400 font-sans">{secondaryLabel}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
