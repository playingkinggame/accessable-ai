/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { KeyRound, Lock, X, Loader2, ShieldCheck } from 'lucide-react';
import { Language } from '../lib/types';
import { translations } from '../lib/i18n';
import { ApiClient, ApiError } from '../lib/api';
import { useAccessibility } from '../lib/a11y';
import { useToast } from './Toast';

interface LoginModalProps {
  language: Language;
  isOpen: boolean;
  onSuccess: () => void;
  onDismiss: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  language,
  isOpen,
  onSuccess,
  onDismiss,
}) => {
  const t = translations[language];
  const { playAudioCue } = useAccessibility();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await ApiClient.login(password);
      setPassword('');
      playAudioCue('success');
      toast(language === 'ta' ? 'உள்நுழைவு வெற்றி' : 'Signed in successfully', 'success');
      onSuccess();
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? language === 'ta'
            ? 'கடவுச்சொல் தவறானது'
            : 'Wrong password'
          : err instanceof Error
            ? err.message
            : t.backendUnreachable;
      setError(message);
      playAudioCue('alert');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05060b]/85 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-[#0c0e18]/95 p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label={language === 'ta' ? 'மூடு' : 'Close'}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-300 border border-teal-500/20">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 id="login-title" className="text-base font-bold text-white font-sans">
              {t.loginTitle}
            </h2>
            <p className="text-xs text-slate-400 font-sans">{t.loginSubtitle}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-medium text-slate-300 mb-1 font-mono"
            >
              {t.passwordLabel}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-teal-400 font-mono"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !password}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-slate-950 font-bold text-sm transition-colors cursor-pointer shadow-md shadow-teal-500/20"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.signingIn}</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>{t.signIn}</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-500 font-sans text-center">
            {language === 'ta'
              ? 'இது backend/.env கோப்பில் உள்ள APP_PASSWORD மதிப்பு (மாதிரிக் கோப்பில் change-me).'
              : 'This is APP_PASSWORD from backend/.env (the example file ships change-me).'}
          </p>
        </form>
      </motion.div>
    </div>
  );
};
