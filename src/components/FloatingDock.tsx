/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Mic, MessageSquare, Library, Activity, Settings, Home } from 'lucide-react';
import { ActiveScreen, Language } from '../lib/types';
import { useAccessibility } from '../lib/a11y';

interface FloatingDockProps {
  currentScreen: ActiveScreen;
  onNavigate: (screen: ActiveScreen) => void;
  language?: Language;
  className?: string;
}

export const FloatingDock: React.FC<FloatingDockProps> = ({
  currentScreen,
  onNavigate,
  language = 'ta',
  className = '',
}) => {
  const { playAudioCue } = useAccessibility();

  const dockItems: { id: ActiveScreen; label_ta: string; label_en: string; icon: React.ElementType; isLive?: boolean }[] = [
    { id: 'landing', label_ta: 'முகப்பு', label_en: 'Home', icon: Home },
    { id: 'talk', label_ta: 'குரல்', label_en: 'Talk', icon: Mic, isLive: true },
    { id: 'chat', label_ta: 'அரட்டை', label_en: 'Chat', icon: MessageSquare },
    { id: 'library', label_ta: 'ஆவணங்கள்', label_en: 'Library', icon: Library },
    { id: 'eval', label_ta: 'மதிப்பீடு', label_en: 'Eval', icon: Activity },
    { id: 'settings', label_ta: 'அமைப்புகள்', label_en: 'Settings', icon: Settings },
  ];

  return (
    <nav
      aria-label="Main Navigation"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 select-none ${className}`}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-full bg-[#0c0e18]/90 backdrop-blur-2xl border border-white/10 shadow-[0_10px_35px_rgba(0,0,0,0.7)] ring-1 ring-white/5">
        {dockItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentScreen === item.id;
          const label = language === 'ta' ? item.label_ta : item.label_en;

          return (
            <motion.button
              key={item.id}
              type="button"
              whileHover={{ scale: 1.12, y: -3 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                playAudioCue('beep');
                onNavigate(item.id);
              }}
              aria-label={`${item.label_en} (${item.label_ta})`}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                isActive
                  ? 'bg-gradient-to-r from-teal-500/30 to-amber-500/20 text-white border border-teal-400/50 shadow-md shadow-teal-500/20 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-300' : 'text-slate-400'}`} />
              <span className="hidden sm:inline font-sans">{label}</span>

              {item.isLive && (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse shrink-0" title="Live Voice" />
              )}

              {isActive && (
                <motion.div
                  layoutId="dock-indicator"
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-teal-400"
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
