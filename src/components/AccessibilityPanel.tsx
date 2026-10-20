/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Eye, Type, Volume2, Sparkles, Moon, Sun, Bell, RotateCcw } from 'lucide-react';
import { useAccessibility } from '../lib/a11y';
import { Language } from '../lib/types';
import { translations } from '../lib/i18n';

interface AccessibilityPanelProps {
  language: Language;
  className?: string;
}

export const AccessibilityPanel: React.FC<AccessibilityPanelProps> = ({
  language,
  className = '',
}) => {
  const { settings, updateSettings, playAudioCue } = useAccessibility();
  const t = translations[language];

  const resetToDefault = () => {
    updateSettings({
      fontSize: 100,
      highContrast: false,
      reduceMotion: false,
      readAloud: true,
      theme: 'dark',
      audioFeedback: true,
    });
    playAudioCue('beep');
  };

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-[#0c0e18]/90 backdrop-blur-xl p-6 shadow-xl ${className}`}
      aria-label="பார்வை அணுகல்தன்மை பலகை / Accessibility Controls"
    >
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-300 border border-teal-500/20">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-sans">{t.settingsTitle}</h3>
            <p className="text-xs text-slate-400 font-sans">{t.settingsSubtitle}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={resetToDefault}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors border border-slate-800"
          title="மீட்டமை / Reset"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      <div className="mt-6 space-y-6">
        {/* Font Size Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-200 font-medium font-sans">
              <Type className="w-4 h-4 text-amber-400" />
              {t.fontSize}
            </span>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-teal-300">
              {settings.fontSize}%
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 font-mono">100%</span>
            <input
              type="range"
              min="100"
              max="200"
              step="10"
              value={settings.fontSize}
              onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value, 10) })}
              className="w-full accent-teal-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
              aria-label="Font scale adjustment slider"
            />
            <span className="text-xs text-slate-400 font-mono">200%</span>
          </div>

          <p className={`text-xs text-slate-400 italic bg-[#07080e]/50 p-2.5 rounded-lg border border-slate-800/50 ${language === 'ta' ? 'tamil-text' : 'font-sans'}`}>
            {language === 'ta'
              ? 'மாதிரி எழுத்து: தமிழ்நாடு அரசின் திட்டங்களை எளிதாக வாசித்து அறியலாம்.'
              : 'Typography Preview: Verified citizen welfare guidelines with live citations.'}
          </p>
        </div>

        {/* Toggles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* High Contrast */}
          <div
            onClick={() => updateSettings({ highContrast: !settings.highContrast })}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start justify-between select-none ${
              settings.highContrast
                ? 'bg-amber-400/10 border-amber-400/80 text-white shadow-lg shadow-amber-500/10'
                : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="space-y-1 pr-2">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">{t.highContrast}</span>
              </div>
              <p className="text-[11px] text-slate-400">{t.highContrastDesc}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.highContrast}
              readOnly
              className="mt-1 accent-amber-400 cursor-pointer w-4 h-4"
            />
          </div>

          {/* Reduce Motion */}
          <div
            onClick={() => updateSettings({ reduceMotion: !settings.reduceMotion })}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start justify-between select-none ${
              settings.reduceMotion
                ? 'bg-teal-400/10 border-teal-400/80 text-white shadow-lg shadow-teal-500/10'
                : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="space-y-1 pr-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-bold text-white">{t.reduceMotion}</span>
              </div>
              <p className="text-[11px] text-slate-400">{t.reduceMotionDesc}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              readOnly
              className="mt-1 accent-teal-400 cursor-pointer w-4 h-4"
            />
          </div>

          {/* Read Aloud */}
          <div
            onClick={() => updateSettings({ readAloud: !settings.readAloud })}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start justify-between select-none ${
              settings.readAloud
                ? 'bg-emerald-400/10 border-emerald-400/80 text-white shadow-lg shadow-emerald-500/10'
                : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="space-y-1 pr-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">{t.autoReadAloud}</span>
              </div>
              <p className="text-[11px] text-slate-400">{t.autoReadAloudDesc}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.readAloud}
              readOnly
              className="mt-1 accent-emerald-400 cursor-pointer w-4 h-4"
            />
          </div>

          {/* Sound Feedback */}
          <div
            onClick={() => updateSettings({ audioFeedback: !settings.audioFeedback })}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start justify-between select-none ${
              settings.audioFeedback
                ? 'bg-pink-400/10 border-pink-400/80 text-white shadow-lg shadow-pink-500/10'
                : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="space-y-1 pr-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-bold text-white">{t.soundFeedback}</span>
              </div>
              <p className="text-[11px] text-slate-400">{t.soundFeedbackDesc}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.audioFeedback}
              readOnly
              className="mt-1 accent-pink-400 cursor-pointer w-4 h-4"
            />
          </div>
        </div>

        {/* Theme Mode */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-xs text-slate-300 font-medium font-sans">{t.themeMode}:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateSettings({ theme: 'dark' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                settings.theme === 'dark'
                  ? 'bg-slate-800 text-teal-300 border-teal-400/50'
                  : 'text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-teal-400" />
              <span>{t.darkTheme}</span>
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ theme: 'light' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                settings.theme === 'light'
                  ? 'bg-amber-100 text-amber-900 border-amber-400'
                  : 'text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>{t.lightTheme}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
