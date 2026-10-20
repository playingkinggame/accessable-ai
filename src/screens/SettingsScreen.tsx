/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Settings,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Activity,
  Loader2,
} from 'lucide-react';
import { Language } from '../lib/types';
import { translations } from '../lib/i18n';
import { AccessibilityPanel } from '../components/AccessibilityPanel';
import { API_BASE_URL, ApiClient, clearAuthToken } from '../lib/api';
import { useToast } from '../components/Toast';
import { useAccessibility } from '../lib/a11y';

interface SettingsScreenProps {
  language: Language;
  onSignOut: () => void;
}

type HealthState = 'checking' | 'online' | 'offline';

const HEALTH_POLL_MS = 15000;

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ language, onSignOut }) => {
  const t = translations[language];
  const { toast } = useToast();
  const { playAudioCue } = useAccessibility();

  const [health, setHealth] = useState<HealthState>('checking');
  const [models, setModels] = useState<string[]>([]);

  const checkHealth = async () => {
    setHealth('checking');
    try {
      const status = await ApiClient.getHealth();
      setModels(status.models);
      setHealth(status.online ? 'online' : 'offline');
    } catch (err) {
      setModels([]);
      setHealth('offline');
      console.warn('Health check failed', err);
    }
  };

  useEffect(() => {
    void checkHealth();
    const timer = setInterval(() => {
      void checkHealth();
    }, HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const handleSignOut = () => {
    clearAuthToken();
    playAudioCue('alert');
    toast(t.signOut, 'info');
    onSignOut();
  };

  return (
    <div className="relative min-h-[calc(100vh-80px)] w-full max-w-5xl mx-auto px-4 py-6 pb-28 flex flex-col space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800/80">
        <h2 className="text-xl font-bold text-white font-sans flex items-center gap-2">
          <Settings className="w-5 h-5 text-teal-400" />
          {t.settingsTitle}
        </h2>
        <p className="text-xs text-slate-400 font-sans mt-0.5">{t.settingsSubtitle}</p>
      </div>

      {/* Accessibility Controls Panel */}
      <AccessibilityPanel language={language} />

      {/* Backend Configuration */}
      <div className="rounded-2xl border border-slate-800 bg-[#0c0e18]/90 backdrop-blur-xl p-6 shadow-xl">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white font-sans">{t.backendSettings}</h3>
            <p className="text-xs text-slate-400 font-sans">
              LiveKit WebRTC &amp; FastAPI RAG Server Connection
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {/* Read-only backend URL */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1 font-mono">
              {t.apiUrl}
            </label>
            <div className="relative">
              <Server className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={API_BASE_URL}
                readOnly
                aria-readonly="true"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 focus:outline-none font-mono cursor-default"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-sans">
              Configured via the VITE_API_URL environment variable.
            </p>
          </div>

          {/* Live health indicator */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              health === 'online'
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : health === 'offline'
                  ? 'border-rose-500/30 bg-rose-500/5'
                  : 'border-slate-700 bg-slate-900/60'
            }`}
          >
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" />
                {t.backendStatus}
              </span>
              <p
                className={`text-xs font-mono flex items-center gap-1.5 ${
                  health === 'online'
                    ? 'text-emerald-300'
                    : health === 'offline'
                      ? 'text-rose-300'
                      : 'text-slate-400'
                }`}
                role="status"
                aria-live="polite"
              >
                {health === 'checking' && <Loader2 className="w-3 h-3 animate-spin" />}
                {health === 'online' && <CheckCircle2 className="w-3 h-3" />}
                {health === 'offline' && <AlertCircle className="w-3 h-3" />}
                {health === 'checking'
                  ? t.statusChecking
                  : health === 'online'
                    ? t.statusOnline
                    : t.statusOffline}
              </p>
              {health === 'online' && models.length > 0 && (
                <p className="text-[11px] text-slate-400 font-mono truncate">
                  {t.statusModels}: {models.join(' → ')}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                playAudioCue('beep');
                void checkHealth();
              }}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-teal-400 text-slate-300 hover:text-white text-xs font-mono transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${health === 'checking' ? 'animate-spin' : ''}`} />
              <span>{t.recheck}</span>
            </button>
          </div>

          {/* Sign out */}
          <div className="pt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-rose-500/50 hover:text-rose-300 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{t.signOut}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
