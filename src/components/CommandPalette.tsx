/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Mic, MessageSquare, Library, Activity, Settings, Moon, Globe, X } from 'lucide-react';
import { ActiveScreen, Language } from '../lib/types';
import { useAccessibility } from '../lib/a11y';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: ActiveScreen) => void;
  language: Language;
  onToggleLanguage: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  language,
  onToggleLanguage,
}) => {
  const [query, setQuery] = useState('');
  const { settings, updateSettings, playAudioCue } = useAccessibility();

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          playAudioCue('beep');
          // Open handled by parent or toggle
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, playAudioCue]);

  if (!isOpen) return null;

  const commands = [
    {
      id: 'talk',
      title: language === 'ta' ? 'குரல் உரையாடலைத் தொடங்கு' : 'Start Voice Call',
      category: 'Navigation',
      icon: Mic,
      action: () => {
        onNavigate('talk');
        onClose();
      },
    },
    {
      id: 'chat',
      title: language === 'ta' ? 'எழுத்து உரையாடலைத் திறக்க' : 'Open Text Chat',
      category: 'Navigation',
      icon: MessageSquare,
      action: () => {
        onNavigate('chat');
        onClose();
      },
    },
    {
      id: 'library',
      title: language === 'ta' ? 'ஆவணப் பெட்டகத்தைப் பார்' : 'View Document Library',
      category: 'Navigation',
      icon: Library,
      action: () => {
        onNavigate('library');
        onClose();
      },
    },
    {
      id: 'eval',
      title: language === 'ta' ? 'துல்லிய மதிப்பீட்டு முடிவுகள் (Eval)' : 'Evaluation & Latency Suite',
      category: 'Benchmarks',
      icon: Activity,
      action: () => {
        onNavigate('eval');
        onClose();
      },
    },
    {
      id: 'settings',
      title: language === 'ta' ? 'அமைப்புகள் & அணுகல் பலகை' : 'Accessibility & Settings',
      category: 'Preferences',
      icon: Settings,
      action: () => {
        onNavigate('settings');
        onClose();
      },
    },
    {
      id: 'lang',
      title:
        language === 'ta'
          ? 'Switch interface to English (ஆங்கிலத்திற்கு மாற்று)'
          : 'மொழியை தமிழுக்கு மாற்று (Switch to Tamil)',
      category: 'Language',
      icon: Globe,
      action: () => {
        onToggleLanguage();
        onClose();
      },
    },
    {
      id: 'contrast',
      title:
        language === 'ta'
          ? `உயர் மாறுபட்ட பார்வை (${settings.highContrast ? 'முடக்கு' : 'இயக்கு'})`
          : `High Contrast Mode (${settings.highContrast ? 'Disable' : 'Enable'})`,
      category: 'Accessibility',
      icon: Moon,
      action: () => {
        updateSettings({ highContrast: !settings.highContrast });
        onClose();
      },
    },
  ];

  const filtered = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl rounded-2xl bg-[#0c0e18] border border-slate-700/80 shadow-2xl overflow-hidden"
        >
          {/* Search Input */}
          <div className="flex items-center px-4 py-3 border-b border-slate-800">
            <Search className="w-5 h-5 text-teal-400 mr-3" />
            <input
              type="text"
              autoFocus
              placeholder={language === 'ta' ? 'கட்டளையைத் தட்டச்சு செய்க...' : 'Type a command or search...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-white placeholder-slate-500 focus:outline-none text-sm font-sans"
            />
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Command list */}
          <div className="max-h-80 overflow-y-auto p-2 space-y-1">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 font-sans">
                {language === 'ta' ? 'முடிவுகள் எதுவும் கிடைக்கவில்லை' : 'No commands found'}
              </div>
            ) : (
              filtered.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => {
                      playAudioCue('beep');
                      cmd.action();
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl text-left hover:bg-slate-800/60 transition-colors group cursor-pointer focus:outline-none focus:bg-slate-800/90"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-800 text-teal-400 group-hover:text-amber-400">
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium text-slate-200 group-hover:text-white">
                        {cmd.title}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800/90 text-slate-400">
                      {cmd.category}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-[#08090f] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Esc to close</span>
            <span>Ctrl + K</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
