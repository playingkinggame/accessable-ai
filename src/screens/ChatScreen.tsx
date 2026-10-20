/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  Square,
  Mic,
  Volume2,
  Copy,
  Check,
  FileText,
  Sparkles,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { ChatMessage, DocumentItem, Language, SourceCitation } from '../lib/types';
import { translations } from '../lib/i18n';
import { TextReveal } from '../components/TextReveal';
import { SourceCard } from '../components/SourceCard';
import { useAccessibility } from '../lib/a11y';
import { ApiClient, ApiError } from '../lib/api';
import { useToast } from '../components/Toast';

interface ChatScreenProps {
  language: Language;
  documents: DocumentItem[];
  initialQuestion?: string;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  language,
  documents,
  initialQuestion = '',
}) => {
  const t = translations[language];
  const { speakText, stopSpeaking, settings, playAudioCue } = useAccessibility();
  const { toast } = useToast();

  const [inputMessage, setInputMessage] = useState(initialQuestion);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [activeSources, setActiveSources] = useState<SourceCitation[]>([]);
  const [highlightedSourceN, setHighlightedSourceN] = useState<number | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-intro',
      role: 'assistant',
      content:
        language === 'ta'
          ? 'வணக்கம்! நான் அணுகல் AI. தமிழ்நாடு அரசு திட்டங்கள், அரசாணைகள் மற்றும் மருத்துவக் காப்பீடு குறித்த எந்தக் கேள்வியையும் என்னிடம் கேளுங்கள். அதிகாரப்பூர்வ ஆதாரங்களுடன் விடையளிக்கிறேன்.'
          : 'Welcome to AccessAble AI. Ask any question regarding Tamil Nadu welfare schemes, government orders, or medical assistance. I provide answers strictly verified with official PDF sources.',
      timestamp: Date.now() - 60000,
    },
  ]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Stable conversation id: the backend uses it for short-term chat memory.
  const chatIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  // Auto-scroll on new message or stream chunk
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Sync initial welcome message when language toggles if no chat history yet
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'm-intro') {
        return [
          {
            id: 'm-intro',
            role: 'assistant',
            content:
              language === 'ta'
                ? 'வணக்கம்! நான் அணுகல் AI. தமிழ்நாடு அரசு திட்டங்கள், அரசாணைகள் மற்றும் மருத்துவக் காப்பீடு குறித்த எந்தக் கேள்வியையும் என்னிடம் கேளுங்கள். அதிகாரப்பூர்வ ஆதாரங்களுடன் விடையளிக்கிறேன்.'
                : 'Welcome to AccessAble AI. Ask any question regarding Tamil Nadu welfare schemes, government orders, or healthcare benefits. I provide answers strictly verified with official PDF sources.',
            timestamp: Date.now() - 60000,
          },
        ];
      }
      return prev;
    });
  }, [language]);

  // Initial question trigger if passed
  useEffect(() => {
    if (initialQuestion && messages.length === 1) {
      handleSendMessage(initialQuestion);
    }
  }, [initialQuestion]);

  // Toggle doc selection scope
  const toggleDocScope = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
    playAudioCue('beep');
  };

  // Browser speech recognition (webkitSpeechRecognition)
  const handleToggleDictation = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition: any; webkitSpeechRecognition: any })
        .SpeechRecognition ||
      (window as unknown as { SpeechRecognition: any; webkitSpeechRecognition: any })
        .webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast(
        language === 'ta'
          ? 'உங்கள் உலாவியில் குரல் உள்ளீடு ஆதரிக்கப்படவில்லை'
          : 'Speech recognition is not supported in this browser',
        'error'
      );
      return;
    }

    if (isListeningMic) {
      setIsListeningMic(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = language === 'ta' ? 'ta-IN' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListeningMic(true);
        playAudioCue('beep');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsListeningMic(false);
      };

      recognition.onerror = () => {
        setIsListeningMic(false);
      };

      recognition.onend = () => {
        setIsListeningMic(false);
      };

      recognition.start();
    } catch {
      setIsListeningMic(false);
    }
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const message = (textToSend || inputMessage).trim();
    if (!message || isGenerating) return;

    playAudioCue('beep');
    setInputMessage('');

    const userMsgId = `usr-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      },
    ]);

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    let accumulated = '';

    try {
      await ApiClient.streamChat(
        {
          message,
          docIds: selectedDocIds,
          language,
          chatId: chatIdRef.current,
        },
        {
          onToken: (token) => {
            accumulated += token;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId ? { ...msg, content: accumulated } : msg
              )
            );
          },
          onSources: (sources) => {
            setActiveSources(sources);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId ? { ...msg, sources } : msg
              )
            );
          },
          onDone: (latency_ms) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId ? { ...msg, latency_ms } : msg
              )
            );
            if (settings.readAloud) {
              speakText(accumulated, language);
            }
          },
        },
        abortControllerRef.current.signal
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // The user pressed Stop; nothing to report.
        return;
      }
      if (!(err instanceof ApiError && err.status === 401)) {
        // A 401 is handled by the global sign-in dialog, so it needs no toast.
        toast(err instanceof Error ? err.message : 'Chat request failed', 'error');
      }
      // Drop the empty assistant bubble so the transcript stays truthful.
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== assistantMsgId || msg.content.length > 0)
      );
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
    stopSpeaking();
    playAudioCue('alert');
  };

  const handleCopyText = (content: string) => {
    navigator.clipboard.writeText(content);
    toast(t.copied, 'success');
    playAudioCue('beep');
  };

  const handleCitationClick = (citationNumber: number) => {
    setHighlightedSourceN(citationNumber);
    playAudioCue('beep');
    const elem = document.getElementById(`source-card-${citationNumber}`);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => setHighlightedSourceN(null), 3000);
  };

  return (
    <div className="relative min-h-[calc(100vh-80px)] w-full max-w-7xl mx-auto px-4 py-4 pb-28 flex flex-col">
      {/* Header and Scope Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white font-sans flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            {t.chatTitle}
          </h2>
          <p className="text-xs text-slate-400 font-sans">{t.filterByDoc}</p>
        </div>

        {/* Doc Scope Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-2xl">
          <button
            type="button"
            onClick={() => setSelectedDocIds([])}
            className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer border ${
              selectedDocIds.length === 0
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            {t.allDocs}
          </button>
          {documents.map((doc) => {
            const isSelected = selectedDocIds.includes(doc.id);
            const displayName = language === 'en' ? (doc.name_en || doc.name) : doc.name;
            const shortLabel = displayName.replace(/\.[a-z0-9]+$/i, '');

            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => toggleDocScope(doc.id)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span className="max-w-[140px] truncate">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat Layout: Messages on left, Sources on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Messages Column */}
        <div className="lg:col-span-8 flex flex-col justify-between rounded-2xl bg-[#0a0d16]/90 border border-slate-800/80 backdrop-blur-xl p-4 shadow-xl">
          {/* Scrollable messages container */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 max-h-[56vh] sm:max-h-[62vh]">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] sm:max-w-[80%] rounded-2xl p-4 relative text-sm ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md'
                      : 'bg-[#101422] border border-slate-800/90 text-slate-100 shadow-md'
                  }`}
                >
                  {/* Speaker Label */}
                  <div className="flex items-center justify-between text-[11px] font-mono mb-2 opacity-80">
                    <span className="font-bold">
                      {msg.role === 'user' ? t.userSaid : t.assistantSaid}
                    </span>
                    {msg.latency_ms && (
                      <span className="text-[10px] text-teal-300">{msg.latency_ms}ms</span>
                    )}
                  </div>

                  {/* Message Content */}
                  <TextReveal
                    text={msg.content}
                    isStreaming={isGenerating && msg.role === 'assistant' && !msg.content}
                    onCitationClick={handleCitationClick}
                  />

                  {/* Assistant Actions Bar */}
                  {msg.role === 'assistant' && msg.content && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.content)}
                          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t.copyAnswer}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => speakText(msg.content, language)}
                          className="flex items-center gap-1 hover:text-teal-300 transition-colors cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>{t.readAloud}</span>
                        </button>
                      </div>

                      {msg.sources && msg.sources.length > 0 && (
                        <span className="text-[11px] text-amber-400 font-mono">
                          {msg.sources.length} {language === 'ta' ? 'ஆதாரங்கள்' : 'Sources'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2 bg-[#06080e] rounded-2xl border border-slate-700/80 p-2 focus-within:border-teal-400 transition-colors"
            >
              {/* Dictation Mic Button */}
              <button
                type="button"
                onClick={handleToggleDictation}
                aria-label={t.listeningMic}
                className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
                  isListeningMic
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Mic className="w-5 h-5" />
              </button>

              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={t.chatPlaceholder}
                disabled={isGenerating}
                className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm focus:outline-none px-2 font-sans"
              />

              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStopGenerating}
                  className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span className="hidden sm:inline">{t.stopGenerating}</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="p-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:hover:bg-teal-500 text-slate-950 font-bold transition-all cursor-pointer shadow-md shadow-teal-500/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Sources Column */}
        <div className="lg:col-span-4 flex flex-col rounded-2xl bg-[#0a0d16]/90 border border-slate-800/80 backdrop-blur-xl p-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <span className="flex items-center gap-2 text-sm font-bold text-white font-sans">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              {t.citedSources}
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-teal-300">
              {activeSources.length} {language === 'ta' ? 'ஆதாரங்கள்' : 'Sources'}
            </span>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto space-y-3 pr-1 max-h-[58vh]">
            {activeSources.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                <FileText className="w-6 h-6 text-slate-600 mb-2" />
                <p className="text-xs">{t.noSourcesYet}</p>
              </div>
            ) : (
              activeSources.map((source) => (
                <SourceCard
                  key={`${source.doc}-${source.n}`}
                  source={source}
                  isHighlighted={highlightedSourceN === source.n}
                  language={language}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
