/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  PhoneOff,
  PhoneCall,
  Volume2,
  ShieldCheck,
  Sparkles,
  VolumeX,
  Loader2,
} from 'lucide-react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type DataPacket_Kind,
} from 'livekit-client';
import { Language, SourceCitation, VoiceState } from '../lib/types';
import { translations } from '../lib/i18n';
import { VoiceOrb } from '../components/VoiceOrb';
import { WaveformBars } from '../components/WaveformBars';
import { SourceCard } from '../components/SourceCard';
import { useAccessibility } from '../lib/a11y';
import { ApiClient, ApiError, normalizeSources } from '../lib/api';
import { useToast } from '../components/Toast';

interface TalkScreenProps {
  language: Language;
}

interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

type CallState = 'idle' | 'connecting' | 'active';

const TRANSCRIPTION_TOPIC = 'lk.transcription';
const SOURCES_TOPIC = 'folio.sources';
const STATE_TOPIC = 'folio.state';

export const TalkScreen: React.FC<TalkScreenProps> = ({ language }) => {
  const t = translations[language];
  const { playAudioCue, stopSpeaking } = useAccessibility();
  const { toast } = useToast();

  // Call state
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [micVolume, setMicVolume] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Live transcript & sources (populated only by the real LiveKit session)
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [activeSources, setActiveSources] = useState<SourceCitation[]>([]);
  const [highlightedSourceN, setHighlightedSourceN] = useState<number | null>(null);

  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<Language>(language);
  languageRef.current = language;

  const elapsedSeconds = () => Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const stopLevelLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  /** Removes every listener, handler and audio element created for the call. */
  const cleanupRoom = useCallback((disconnect: boolean) => {
    stopLevelLoop();
    const room = roomRef.current;
    roomRef.current = null;
    if (!room) return;
    room.removeAllListeners();
    try {
      room.unregisterTextStreamHandler(TRANSCRIPTION_TOPIC);
    } catch (err) {
      console.warn('No transcription handler to unregister', err);
    }
    audioContainerRef.current?.replaceChildren();
    if (disconnect) {
      room.disconnect().catch((err: unknown) => console.warn('LiveKit disconnect failed', err));
    }
  }, []);

  const startLevelLoop = (room: Room) => {
    const tick = () => {
      if (roomRef.current !== room) return;
      setMicVolume(Math.min(1, room.localParticipant.audioLevel * 4));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const upsertTranscript = (
    id: string,
    speaker: TranscriptEntry['speaker'],
    text: string
  ) => {
    const timestamp = formatTime(elapsedSeconds());
    setTranscripts((prev) => {
      if (prev.some((entry) => entry.id === id)) {
        return prev.map((entry) => (entry.id === id ? { ...entry, text, timestamp } : entry));
      }
      return [...prev, { id, speaker, text, timestamp }];
    });
  };

  const handleDataReceived = (
    payload: Uint8Array,
    _participant?: RemoteParticipant,
    _kind?: DataPacket_Kind,
    topic?: string
  ) => {
    if (!topic) return;
    let message: unknown;
    try {
      message = JSON.parse(new TextDecoder().decode(payload));
    } catch (err) {
      console.warn(`Ignoring malformed voice payload on "${topic}"`, err);
      return;
    }
    if (!message || typeof message !== 'object') return;
    const data = message as Record<string, unknown>;

    if (topic === SOURCES_TOPIC) {
      setActiveSources(normalizeSources(data.sources));
      return;
    }
    if (topic === STATE_TOPIC) {
      const next = data.state;
      if (next === 'listening' || next === 'thinking' || next === 'speaking') {
        setVoiceState(next);
      } else if (next === 'idle') {
        setVoiceState('listening');
      }
    }
  };

  const attachRoomListeners = (room: Room) => {
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        audioContainerRef.current?.appendChild(element);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((element) => element.remove());
      })
      .on(RoomEvent.DataReceived, handleDataReceived)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Reconnecting, () => {
        toast(t.voiceReconnecting, 'info');
      })
      .on(RoomEvent.Reconnected, () => {
        toast(t.voiceReconnected, 'success');
      })
      .on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        stopLevelLoop();
        setMicVolume(0);
        setCallState('idle');
        setVoiceState('idle');
        audioContainerRef.current?.replaceChildren();
        toast(t.voiceDisconnected, 'info');
      });
  };

  const registerTranscription = (room: Room) => {
    room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, participantInfo) => {
      const speaker: TranscriptEntry['speaker'] =
        participantInfo.identity === room.localParticipant.identity ? 'user' : 'assistant';
      // Key by transcription segment so an interim caption is replaced by its final text.
      const segmentId =
        reader.info.attributes?.['lk.transcription_segment_id'] ||
        reader.info.attributes?.['id'] ||
        reader.info.id;
      const entryId = `${speaker}-${segmentId}`;
      void (async () => {
        let text = '';
        try {
          for await (const chunk of reader) {
            text += chunk;
            upsertTranscript(entryId, speaker, text);
          }
        } catch (err) {
          console.warn('Transcription stream failed', err);
        }
      })();
    });
  };

  const startCall = async () => {
    if (callState !== 'idle') return;
    setCallState('connecting');
    setVoiceError(null);
    setTranscripts([]);
    setActiveSources([]);
    setAudioBlocked(false);
    playAudioCue('beep');

    try {
      const { url, token } = await ApiClient.getVoiceToken([], languageRef.current);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      attachRoomListeners(room);
      await room.connect(url, token);

      // Still inside the click gesture, so the browser allows audible playback.
      try {
        await room.startAudio();
      } catch (err) {
        console.warn('Audio playback is still blocked', err);
      }

      await room.localParticipant.setMicrophoneEnabled(true);
      registerTranscription(room);

      startedAtRef.current = Date.now();
      setCallDuration(0);
      setCallState('active');
      setVoiceState('listening');
      setIsMuted(false);
      setAudioBlocked(!room.canPlaybackAudio);
      startLevelLoop(room);
      playAudioCue('success');
    } catch (err) {
      cleanupRoom(true);
      setCallState('idle');
      setVoiceState('idle');
      const message =
        err instanceof ApiError && err.status === 503
          ? t.voiceNotConfigured
          : err instanceof Error && err.name === 'NotAllowedError'
            ? t.micAccessFailed
            : err instanceof Error
              ? err.message
              : t.voiceConnectFailed;
      setVoiceError(message);
      toast(message, 'error');
      playAudioCue('alert');
    }
  };

  const endCall = () => {
    stopSpeaking();
    cleanupRoom(true);
    setCallState('idle');
    setVoiceState('idle');
    setIsMuted(false);
    setAudioBlocked(false);
    playAudioCue('alert');
  };

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room || callState !== 'active') return;
    const nextMuted = !isMuted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted);
      setIsMuted(nextMuted);
      playAudioCue('toggle');
    } catch (err) {
      toast(err instanceof Error ? err.message : t.micAccessFailed, 'error');
    }
  };

  const enableAudio = async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
    } catch (err) {
      toast(err instanceof Error ? err.message : t.voiceConnectFailed, 'error');
    }
  };

  // Real elapsed call duration
  useEffect(() => {
    if (callState !== 'active') return;
    const timer = setInterval(() => setCallDuration(elapsedSeconds()), 1000);
    return () => clearInterval(timer);
  }, [callState]);

  // Tear the room down if the screen unmounts mid-call
  useEffect(() => () => cleanupRoom(true), [cleanupRoom]);

  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const statusLabel =
    callState === 'connecting'
      ? t.voiceConnecting
      : voiceState === 'idle'
        ? t.orbIdle
        : voiceState === 'listening'
          ? t.orbListening
          : voiceState === 'thinking'
            ? t.orbThinking
            : t.orbSpeaking;

  return (
    <div className="relative min-h-[calc(100vh-80px)] w-full max-w-7xl mx-auto px-4 py-4 pb-28 flex flex-col">
      {/* Hidden container for remote audio tracks */}
      <div ref={audioContainerRef} className="hidden" aria-hidden="true" />

      {/* Top Header Bar */}
      <div className="flex items-center justify-between py-2 border-b border-slate-800/80 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                callState === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="text-sm font-bold text-white font-serif">{t.talkTitle}</span>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-teal-300 font-mono">
            {formatTime(callDuration)}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-mono">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{t.talkSubtitle}</span>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Column: Voice Orb, Call Controls, Live Synchronized Transcript */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-[#0a0d16]/90 border border-slate-800/80 backdrop-blur-xl p-5 shadow-2xl overflow-hidden relative">
          {/* Top Status Banner */}
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-2">
            <span className="flex items-center gap-2">
              <span className="text-teal-400">STATE:</span>
              <span className="font-bold uppercase tracking-wider text-white">{statusLabel}</span>
            </span>

            <WaveformBars
              active={callState === 'active' && !isMuted}
              volume={micVolume}
              color={voiceState === 'speaking' ? 'magenta' : voiceState === 'thinking' ? 'gold' : 'teal'}
              barCount={14}
            />
          </div>

          {/* Living Orb Stage */}
          <div className="flex flex-col items-center justify-center py-6 my-auto">
            <VoiceOrb
              state={voiceState}
              volume={micVolume}
              size={220}
              language={language}
              onClick={() => {
                if (callState === 'idle') void startCall();
              }}
              className="drop-shadow-[0_0_40px_rgba(0,229,188,0.25)]"
            />
            <p
              className={`mt-4 text-xs font-medium text-slate-400 text-center max-w-sm ${
                language === 'ta' ? 'tamil-text' : 'font-sans'
              }`}
            >
              {callState === 'connecting'
                ? t.voiceConnecting
                : voiceState === 'listening'
                  ? language === 'ta'
                    ? 'உங்கள் குரலை கவனிக்கிறது. சாதாரணமாக பேசவும்.'
                    : 'Listening to your voice. Speak naturally.'
                  : voiceState === 'thinking'
                    ? language === 'ta'
                      ? 'ஆவணங்களில் அதிகாரப்பூர்வ உண்மைச் சான்றுகள் தேடப்படுகின்றன...'
                      : 'Searching the documents for grounded citations...'
                    : voiceState === 'speaking'
                      ? language === 'ta'
                        ? 'பதிலை ஒலிக்கிறது. வலதுபுறத்தில் ஆதாரப் பக்கங்களை நீங்கள் சரிபார்க்கலாம்.'
                        : 'Speaking the verified response. Citations appear on the right.'
                      : t.startVoiceHint}
            </p>

            {audioBlocked && callState === 'active' && (
              <button
                type="button"
                onClick={() => void enableAudio()}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs font-bold hover:bg-amber-500/25 transition-colors cursor-pointer"
              >
                <VolumeX className="w-4 h-4" />
                <span>{t.tapToEnableAudio}</span>
              </button>
            )}

            {voiceError && (
              <p
                role="alert"
                className="mt-4 max-w-sm text-center text-xs text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3"
              >
                {voiceError}
              </p>
            )}
          </div>

          {/* Live Captions Transcript Box */}
          <div className="mt-4 flex flex-col">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1.5 font-bold text-slate-300">
                <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                {t.liveCaptions}
              </span>
              <span className="text-[11px] font-mono text-slate-400">LiveKit &bull; {TRANSCRIPTION_TOPIC}</span>
            </div>

            <div className="h-44 overflow-y-auto space-y-3 p-3.5 rounded-xl bg-[#06080e]/80 border border-slate-800/80 text-xs font-sans">
              {transcripts.length === 0 && (
                <p className="text-slate-500 text-center py-10 text-xs">
                  {language === 'ta'
                    ? 'அழைப்பு தொடங்கியதும் பேச்சு இங்கே தோன்றும்.'
                    : 'Captions appear here once the call is connected.'}
                </p>
              )}
              {transcripts.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl leading-relaxed ${
                    item.speaker === 'user'
                      ? 'bg-teal-950/30 border border-teal-500/30 text-teal-100 ml-4'
                      : 'bg-[#121626]/80 border border-amber-500/20 text-slate-100 mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 text-[11px] font-mono">
                    <span
                      className={`font-bold ${
                        item.speaker === 'user' ? 'text-teal-300' : 'text-amber-400'
                      }`}
                    >
                      {item.speaker === 'user' ? t.userSaid : t.assistantSaid}
                    </span>
                    <span className="text-slate-400">{item.timestamp}</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${language === 'ta' ? 'tamil-text' : 'font-sans'}`}>
                    {item.text}
                  </p>
                </div>
              ))}
              <div ref={transcriptBottomRef} />
            </div>
          </div>

          {/* Bottom Call Controls */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => void toggleMute()}
              disabled={callState !== 'active'}
              aria-label={isMuted ? t.unmute : t.mute}
              className={`p-3.5 rounded-full border transition-all cursor-pointer disabled:opacity-40 ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-teal-400" />}
            </button>

            <button
              type="button"
              onClick={() => (callState === 'active' ? endCall() : void startCall())}
              disabled={callState === 'connecting'}
              aria-label={callState === 'active' ? t.endCall : t.startCall}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all cursor-pointer shadow-lg disabled:opacity-60 ${
                callState === 'active'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/30'
              }`}
            >
              {callState === 'connecting' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t.voiceConnecting}</span>
                </>
              ) : callState === 'active' ? (
                <>
                  <PhoneOff className="w-4 h-4" />
                  <span>{t.endCall}</span>
                </>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4" />
                  <span>{t.startCall}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Grounded Sources Panel */}
        <div className="lg:col-span-5 flex flex-col rounded-2xl bg-[#0a0d16]/90 border border-slate-800/80 backdrop-blur-xl p-5 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white font-sans">{t.citedSources}</h3>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
              {activeSources.length} Passages
            </span>
          </div>

          <p className="mt-2 text-xs text-slate-400 leading-relaxed tamil-text">
            {language === 'ta'
              ? 'உரையாடலில் குறிப்பிடப்படும் அதிகாரப்பூர்வ அரசாணைப் பக்கங்கள் மற்றும் சான்றுகள் இங்கே நேரலையாகத் தோன்றும்:'
              : 'Passages extracted in real-time to ground speech output:'}
          </p>

          <div className="mt-4 flex-1 overflow-y-auto space-y-3.5 pr-1">
            <AnimatePresence>
              {activeSources.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  <Sparkles className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-xs">{t.noSourcesYet}</p>
                </div>
              ) : (
                activeSources.map((source) => (
                  <motion.div
                    key={`${source.doc}-${source.n}`}
                    initial={{ opacity: 0, x: 25 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <SourceCard
                      source={source}
                      isHighlighted={highlightedSourceN === source.n}
                      language={language}
                    />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Interactive citation verification helper */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  callState === 'active' ? 'bg-emerald-400' : 'bg-slate-600'
                }`}
              />
              {language === 'ta' ? 'நேரடி LiveKit குரல் அமர்வு' : 'Live LiveKit voice session'}
            </span>
            <span className="text-teal-400">
              {language === 'ta' ? 'ஆதாரம் சரிபார்க்கப்பட்டது' : 'Grounded answers'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
