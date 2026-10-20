/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilitySettings, Language } from './types';

const STORAGE_KEY = 'accessable_a11y_prefs';

const defaultSettings: AccessibilitySettings = {
  fontSize: 100, // 100% to 200%
  highContrast: false,
  reduceMotion: false,
  readAloud: true,
  theme: 'dark',
  audioFeedback: true,
  language: 'ta',
};

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateSettings: (partial: Partial<AccessibilitySettings>) => void;
  playAudioCue: (type: 'beep' | 'toggle' | 'success' | 'alert') => void;
  speakText: (text: string, lang?: 'ta' | 'en') => void;
  stopSpeaking: () => void;
  isSpeaking: boolean;
}

const AccessibilityContext = createContext<AccessibilityContextType>({
  settings: defaultSettings,
  updateSettings: () => {},
  playAudioCue: () => {},
  speakText: () => {},
  stopSpeaking: () => {},
  isSpeaking: false,
});

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) };
      }
    } catch {
      // fallback
    }
    return defaultSettings;
  });

  const [isSpeaking, setIsSpeaking] = useState(false);

  // Apply settings to DOM element
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }

    const root = document.documentElement;
    // Font scale
    root.style.fontSize = `${(settings.fontSize / 100) * 16}px`;

    // Contrast
    if (settings.highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }

    // Theme
    if (settings.theme === 'light') {
      document.body.classList.add('theme-light');
      document.body.classList.remove('bg-[#08090E]');
      document.body.classList.add('bg-slate-50', 'text-slate-900');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.remove('bg-slate-50', 'text-slate-900');
      document.body.classList.add('bg-[#08090E]');
    }

    // Reduce motion
    if (settings.reduceMotion) {
      root.classList.add('motion-reduce');
    } else {
      root.classList.remove('motion-reduce');
    }
  }, [settings]);

  const updateSettings = (partial: Partial<AccessibilitySettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      if (partial.audioFeedback !== false && updated.audioFeedback) {
        playAudioCue('toggle');
      }
      return updated;
    });
  };

  // Pleasant Web Audio tone synthesizer
  const playAudioCue = (type: 'beep' | 'toggle' | 'success' | 'alert') => {
    if (!settings.audioFeedback && type !== 'alert') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'beep') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'toggle') {
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'alert') {
        osc.frequency.setValueAtTime(320, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {
      // Audio context might be restricted before user gesture
    }
  };

  // Speech synthesis
  const speakText = (text: string, lang: 'ta' | 'en' = 'ta') => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    // Strip citation markers like [1], [2] before speaking for clearer listening
    const cleanText = text.replace(/\[\d+\]/g, '').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang === 'ta' ? 'ta-IN' : 'en-US';
    utterance.rate = 0.95; // Slightly slower for clear accessibility comprehension

    // Pick best matching voice
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang.startsWith(lang === 'ta' ? 'ta' : 'en'));
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  return (
    <AccessibilityContext.Provider
      value={{
        settings,
        updateSettings,
        playAudioCue,
        speakText,
        stopSpeaking,
        isSpeaking,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = () => useContext(AccessibilityContext);

/** Language lives with the other persisted preferences so it survives a reload. */
export const useLanguage = () => {
  const { settings, updateSettings } = useAccessibility();
  const language = settings.language;
  const setLanguage = (lang: Language) => updateSettings({ language: lang });
  return { language, setLanguage };
};
