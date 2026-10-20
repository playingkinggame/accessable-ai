/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Command,
  Eye,
  Volume2,
  Mic,
  ShieldCheck,
  Globe,
  Sliders,
} from 'lucide-react';
import { ActiveScreen, DocumentItem, EvalResults, SystemStats } from './lib/types';
import { translations } from './lib/i18n';
import { AccessibilityProvider, useAccessibility, useLanguage } from './lib/a11y';
import { ToastProvider, useToast } from './components/Toast';
import { LoginModal } from './components/LoginModal';
import { AuroraBackground } from './components/AuroraBackground';
import { GrainOverlay } from './components/GrainOverlay';
import { Spotlight } from './components/Spotlight';
import { FloatingDock } from './components/FloatingDock';
import { CommandPalette } from './components/CommandPalette';
import { LanguageToggle } from './components/LanguageToggle';
import { ApiClient, ApiError, getAuthToken, onUnauthorized } from './lib/api';

// Screens
import { LandingScreen } from './screens/LandingScreen';
import { TalkScreen } from './screens/TalkScreen';
import { ChatScreen } from './screens/ChatScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { EvalScreen } from './screens/EvalScreen';
import { SettingsScreen } from './screens/SettingsScreen';

function AppContent() {
  // Language is stored with the accessibility preferences, so it survives a reload.
  const { language, setLanguage } = useLanguage();
  const [currentScreen, setCurrentScreen] = useState<ActiveScreen>('landing');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    documents: 0,
    chunks: 0,
    questions_answered: 0,
    avg_latency_ms: 0,
  });
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [initialChatQuestion, setInitialChatQuestion] = useState<string>('');

  const { settings, updateSettings, playAudioCue } = useAccessibility();
  const { toast } = useToast();
  const t = translations[language];

  // Load the eval accuracy shown on the landing tile (null = no run yet).
  const loadAccuracy = async () => {
    try {
      const results = await ApiClient.getEvalResults();
      setAccuracy(results.total > 0 ? results.accuracy : null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setAccuracy(null);
      console.warn('Unable to load eval results', err);
    }
  };

  // Initial data load (documents + stats + accuracy)
  const loadInitialData = async () => {
    try {
      const [docs, statData] = await Promise.all([
        ApiClient.getDocuments(),
        ApiClient.getStats(),
      ]);
      setDocuments(docs);
      setStats(statData);
      setIsLoginOpen(false);
      await loadAccuracy();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setIsLoginOpen(true);
        return;
      }
      setDocuments([]);
      setAccuracy(null);
      toast(
        err instanceof Error
          ? `${t.backendUnreachable}: ${err.message}`
          : t.backendUnreachable,
        'error'
      );
    }
  };

  // Boot: ask the backend whether a password is required so the sign-in dialog can
  // appear immediately instead of after a rejected request.
  useEffect(() => {
    const boot = async () => {
      try {
        const config = await ApiClient.getConfig();
        if (config.auth_required && !getAuthToken()) {
          setIsLoginOpen(true);
          return;
        }
      } catch (err) {
        // Fall through to the document load, which reports unreachable backends.
        console.warn('Unable to read /api/config', err);
      }
      await loadInitialData();
    };
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any 401 from any request clears the token and re-opens the sign-in dialog.
  useEffect(
    () =>
      onUnauthorized(() => {
        setDocuments([]);
        setStats({ documents: 0, chunks: 0, questions_answered: 0, avg_latency_ms: 0 });
        setAccuracy(null);
        setIsLoginOpen(true);
      }),
    []
  );

  // Global keyboard shortcut for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        playAudioCue('beep');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playAudioCue]);

  // Sync document lang attribute
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const handleSelectSampleQuestion = (question: string) => {
    setInitialChatQuestion(question);
    setCurrentScreen('talk');
    playAudioCue('beep');
  };

  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col font-sans overflow-x-hidden selection:bg-teal-500/30 selection:text-teal-200">
      {/* Background Ambience & Lighting */}
      <AuroraBackground showRadialGradient={true} className="fixed inset-0 z-0 pointer-events-none" />
      <Spotlight size={480} fill="rgba(0, 229, 188, 0.08)" />
      <GrainOverlay opacity={0.03} />

      {/* Top Header Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#07080e]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <button
            type="button"
            onClick={() => {
              setCurrentScreen('landing');
              playAudioCue('beep');
            }}
            className="flex items-center gap-3 group text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-400 rounded-lg p-1"
          >
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-400 via-teal-400 to-rose-500 p-[1.5px] shadow-lg shadow-teal-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-[10px] bg-[#0c0e18] flex items-center justify-center font-bold text-teal-300 font-serif text-lg">
                {language === 'ta' ? 'அ' : 'A'}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white tracking-tight text-base sm:text-lg group-hover:text-teal-300 transition-colors">
                  AccessAble AI
                </span>
                <span className="text-xs font-serif font-bold text-amber-400">
                  {language === 'ta' ? '| அணுகல் AI' : '| Accessible AI'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono tracking-wider">
                {language === 'ta' ? 'தமிழ் குரல் & RAG தளம்' : 'Tamil Voice & Accessible PDF RAG'}
              </p>
            </div>
          </button>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Contrast Quick Toggle */}
            <button
              type="button"
              onClick={() => {
                updateSettings({ highContrast: !settings.highContrast });
                playAudioCue('toggle');
              }}
              title={
                settings.highContrast
                  ? (language === 'ta' ? 'இயல்பு நிற முறை' : 'Standard Contrast')
                  : (language === 'ta' ? 'உயர் மாறுபட்ட பார்வை' : 'High Contrast View')
              }
              aria-label="Toggle High Contrast"
              className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                settings.highContrast
                  ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Eye className="w-4 h-4" />
            </button>

            {/* Command Palette Trigger */}
            <button
              type="button"
              onClick={() => {
                setIsCommandPaletteOpen(true);
                playAudioCue('beep');
              }}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-slate-700 text-slate-400 hover:text-white text-xs font-mono transition-colors cursor-pointer"
            >
              <Command className="w-3.5 h-3.5" />
              <span>Ctrl K</span>
            </button>

            {/* Bilingual Language Switch */}
            <LanguageToggle
              currentLanguage={language}
              onToggle={(lang) => setLanguage(lang)}
            />
          </div>
        </div>
      </header>

      {/* Main Screen Content with Page Transitions */}
      <main className="relative z-10 flex-1 w-full" id="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScreen}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {currentScreen === 'landing' && (
              <LandingScreen
                language={language}
                onNavigate={(s) => setCurrentScreen(s)}
                stats={stats}
                accuracy={accuracy}
                onSelectSampleQuestion={handleSelectSampleQuestion}
              />
            )}

            {currentScreen === 'talk' && (
              <TalkScreen language={language} />
            )}

            {currentScreen === 'chat' && (
              <ChatScreen
                language={language}
                documents={documents}
                initialQuestion={initialChatQuestion}
              />
            )}

            {currentScreen === 'library' && (
              <LibraryScreen
                language={language}
                documents={documents}
                onRefreshDocs={loadInitialData}
              />
            )}

            {currentScreen === 'eval' && (
              <EvalScreen
                language={language}
                onResults={(results: EvalResults) =>
                  setAccuracy(results.total > 0 ? results.accuracy : null)
                }
              />
            )}

            {currentScreen === 'settings' && (
              <SettingsScreen
                language={language}
                onSignOut={() => {
                  // Drop everything that was loaded with the previous session.
                  setDocuments([]);
                  setStats({ documents: 0, chunks: 0, questions_answered: 0, avg_latency_ms: 0 });
                  setAccuracy(null);
                  setIsLoginOpen(true);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Dock Bottom Navigation */}
      <FloatingDock
        currentScreen={currentScreen}
        onNavigate={(screen) => setCurrentScreen(screen)}
        language={language}
      />

      {/* Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(screen) => setCurrentScreen(screen)}
        language={language}
        onToggleLanguage={() => setLanguage(language === 'ta' ? 'en' : 'ta')}
      />

      <LoginModal
        language={language}
        isOpen={isLoginOpen}
        onSuccess={() => {
          setIsLoginOpen(false);
          void loadInitialData();
        }}
        onDismiss={() => {
          setIsLoginOpen(false);
          toast(t.signInRequired, 'info');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AccessibilityProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AccessibilityProvider>
  );
}
