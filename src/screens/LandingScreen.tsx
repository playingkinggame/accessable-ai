/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Mic, ArrowRight, ShieldCheck, Sparkles, BookOpen, Volume2, Search, Cpu } from 'lucide-react';
import { ActiveScreen, Language, SystemStats } from '../lib/types';
import { translations } from '../lib/i18n';
import { VoiceOrb } from '../components/VoiceOrb';
import { BentoGrid, BentoCard } from '../components/BentoGrid';
import { AnimatedBeam } from '../components/AnimatedBeam';
import { Marquee } from '../components/Marquee';
import { NumberTicker } from '../components/NumberTicker';
import { GlowBorderCard } from '../components/GlowBorderCard';
import { WaveformBars } from '../components/WaveformBars';
import { KolamPattern } from '../components/KolamPattern';

interface LandingScreenProps {
  language: Language;
  onNavigate: (screen: ActiveScreen) => void;
  stats: SystemStats;
  /** Real accuracy (0-100) from GET /api/eval/results, or null when no run exists. */
  accuracy: number | null;
  onSelectSampleQuestion: (q: string) => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  language,
  onNavigate,
  stats,
  accuracy,
  onSelectSampleQuestion,
}) => {
  const t = translations[language];

  const sampleQuestions = [
    {
      text_ta: 'முதலமைச்சரின் மருத்துவக் காப்பீட்டுத் திட்டத்தில் ரூ. 5 லட்சம் பெறுவது எப்படி?',
      text_en: 'How to claim up to ₹5 Lakhs under CMCHIS medical insurance?',
      category: 'மருத்துவம்',
      category_en: 'Healthcare',
    },
    {
      text_ta: 'PM-KISAN திட்டத்தில் ஆண்டுக்கு ரூ. 6,000 மானியம் பெற தகுதி என்ன?',
      text_en: 'What is the eligibility for PM-KISAN ₹6,000 farmer subsidy?',
      category: 'விவசாயம்',
      category_en: 'Agriculture',
    },
    {
      text_ta: 'புதுமைப் பெண் திட்டத்தில் கல்லூரி மாணவிகளுக்கு மாதம் ரூ. 1000 எங்கு விண்ணப்பிப்பது?',
      text_en: 'Where to apply for Pudhumai Penn ₹1,000 monthly college stipend?',
      category: 'கல்வி',
      category_en: 'Education',
    },
    {
      text_ta: 'பார்வைக் குறைபாடுள்ளவர்களுக்கு என்னென்ன உபகரணங்கள் இலவசமாக கிடைக்கும்?',
      text_en: 'What assistive devices are provided free for visually impaired citizens?',
      category: 'சமூக நலம்',
      category_en: 'Welfare',
    },
  ];

  return (
    <div className="relative min-h-screen pb-32 pt-8 flex flex-col items-center">
      {/* Background Kolam Accent */}
      <KolamPattern opacity={0.08} />

      {/* Hero Section */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 text-center flex flex-col items-center">
        {/* Top Announcement Pill */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-medium mb-6 shadow-sm shadow-teal-500/10"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-serif">{t.heroBadge}</span>
          <span className="w-1 h-1 rounded-full bg-teal-400" />
          <span className="text-[11px] font-mono text-slate-400">Low Vision & Low Literacy First</span>
        </motion.div>

        {/* Giant Living Voice Orb */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="my-4 flex flex-col items-center"
        >
          <VoiceOrb
            state="speaking"
            volume={0.65}
            size={240}
            language={language}
            onClick={() => onNavigate('talk')}
            className="cursor-pointer"
          />
          <div className="mt-4 px-3 py-1 rounded-full bg-slate-900/80 border border-teal-500/20 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
            <span className="text-xs font-mono text-teal-300">
              {language === 'ta' ? 'குரல் கொடுக்க தயார்' : 'Ready to listen'}
            </span>
          </div>
        </motion.div>

        {/* Heading & Subheading */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white mt-4 max-w-4xl leading-[1.25] font-sans"
        >
          {language === 'ta' ? (
            <>
              தமிழில் பேசுங்கள்.{' '}
              <span className="bg-gradient-to-r from-amber-400 via-teal-300 to-rose-400 bg-clip-text text-transparent">
                அரசாணை ஆதாரங்களை
              </span>{' '}
              உடனே கேளுங்கள்.
            </>
          ) : (
            <>
              Speak in Tamil.{' '}
              <span className="bg-gradient-to-r from-teal-400 via-amber-300 to-pink-500 bg-clip-text text-transparent">
                Hear Grounded Answers
              </span>{' '}
              with Live PDF Citations.
            </>
          )}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`mt-5 text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed ${language === 'ta' ? 'tamil-text' : 'font-sans'}`}
        >
          {t.heroSubheading}
        </motion.p>

        {/* Call to Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <button
            type="button"
            onClick={() => onNavigate('talk')}
            className="flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-gradient-to-r from-teal-400 to-teal-500 text-slate-950 font-bold text-sm shadow-[0_0_25px_rgba(0,229,188,0.4)] hover:shadow-[0_0_35px_rgba(0,229,188,0.6)] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer font-serif"
          >
            <Mic className="w-5 h-5 text-slate-950" />
            <span>{t.startTalking}</span>
            <ArrowRight className="w-4 h-4 text-slate-950" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#121624] text-white border border-slate-700/80 font-semibold text-sm hover:border-teal-400 hover:bg-[#181d30] transition-all duration-200 cursor-pointer"
          >
            <span>{t.openChat}</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('library')}
            className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-transparent text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>{t.exploreLibrary}</span>
          </button>
        </motion.div>
      </div>

      {/* Marquee with Sample Questions */}
      <div className="w-full max-w-6xl mt-12 mb-4">
        <p className="text-center text-xs font-medium text-slate-400 mb-2 font-mono">
          {t.quickQuestions}
        </p>
        <Marquee
          questions={sampleQuestions}
          language={language}
          onSelectQuestion={(q) => onSelectSampleQuestion(q)}
        />
      </div>

      {/* Stats Counter Bar */}
      <div className="w-full max-w-5xl px-4 mt-8">
        <div
          className={`grid grid-cols-2 gap-4 p-5 rounded-2xl bg-[#0c0f1a]/80 border border-slate-800/80 backdrop-blur-xl ${
            accuracy === null ? 'sm:grid-cols-3' : 'sm:grid-cols-4'
          }`}
        >
          <div className="text-center space-y-1">
            <span className="text-xs text-slate-400 font-sans block">{t.statDocs}</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-teal-400 font-mono">
              <NumberTicker value={stats.documents} />
            </span>
          </div>

          <div className="text-center space-y-1">
            <span className="text-xs text-slate-400 font-sans block">{t.statChunks}</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono">
              <NumberTicker value={stats.chunks} />
            </span>
          </div>

          <div className="text-center space-y-1">
            <span className="text-xs text-slate-400 font-sans block">{t.statAnswered}</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-pink-400 font-mono">
              <NumberTicker value={stats.questions_answered} />
            </span>
          </div>

          {/* Accuracy only exists once a real evaluation run has been stored. */}
          {accuracy !== null && (
            <div className="text-center space-y-1">
              <span className="text-xs text-slate-400 font-sans block">{t.statAccuracy}</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
                <NumberTicker value={accuracy} suffix="%" />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="w-full max-w-5xl px-4 mt-16">
        <div className="text-center mb-6">
          <span className="text-xs font-mono text-amber-400 uppercase tracking-widest">
            {language === 'ta' ? 'கட்டமைப்பு' : 'Architecture'}
          </span>
          <h2 className="text-2xl font-bold text-white mt-1 font-sans">{t.pipelineTitle}</h2>
        </div>
        <GlowBorderCard glowColor="multi">
          <AnimatedBeam activeStep={2} language={language} />
        </GlowBorderCard>
      </div>

      {/* Bento Grid Feature Cards */}
      <div className="w-full max-w-6xl px-4 mt-16">
        <div className="text-center mb-8">
          <span className="text-xs font-mono text-teal-400 uppercase tracking-widest">
            {language === 'ta' ? 'முக்கிய சிறப்புகள்' : 'Core Capabilities'}
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1 font-sans">
            {language === 'ta'
              ? 'அணுகல் AI-ன் முக்கிய சிறப்பம்சங்கள்'
              : 'Built for High Impact & Zero Friction'}
          </h2>
        </div>

        <BentoGrid>
          <BentoCard
            title={language === 'ta' ? 'முழுமையான தமிழ் குரல் ஏற்பு' : 'Tamil-First Natural Voice'}
            titleTamil={language === 'ta' ? 'குரல் வழி இயக்கம்' : undefined}
            description={
              language === 'ta'
                ? 'வட்டார வழக்கு மற்றும் சாதாரண பேச்சுத் தமிழை புரிந்து கொண்டு துல்லியமாக பதிலளிக்கும்.'
                : 'Understands regional Tamil dialects with ultra-low latency streaming speech recognition.'
            }
            badge={language === 'ta' ? 'குரல் மாதிரி' : 'Bhashini + Voice'}
            badgeColor="teal"
            icon={<Mic className="w-5 h-5" />}
            headerGraphic={<WaveformBars active={true} color="teal" volume={0.8} barCount={24} />}
            onClick={() => onNavigate('talk')}
          />

          <BentoCard
            title={language === 'ta' ? 'ஆதாரம் சரிபார்க்கப்பட்ட RAG' : 'Grounded Page Citations'}
            titleTamil={language === 'ta' ? 'நம்பகமான ஆதாரம்' : undefined}
            description={
              language === 'ta'
                ? 'உண்மைப் பிழைகள் இன்றி, அரசாணை மற்றும் ஆவணத்தின் பக்கம் எண்ணுடன் நேரடி மேற்கோள்.'
                : 'Zero hallucinations. Every statement is linked to an exact PDF page and verifiable paragraph.'
            }
            badge={language === 'ta' ? 'உண்மைச் சான்று' : 'Exact Citations'}
            badgeColor="gold"
            icon={<ShieldCheck className="w-5 h-5" />}
            headerGraphic={
              <div className="flex flex-col items-center gap-1.5 text-center text-xs text-amber-300 font-mono">
                <span className="px-3 py-1 rounded bg-amber-500/20 border border-amber-500/30">
                  CMCHIS_2025.pdf (Page 6)
                </span>
                <span className="text-[10px] text-slate-400">
                  {language === 'ta' ? 'பக்கம் வாரியான ஆதாரம்' : 'Page-level grounding'}
                </span>
              </div>
            }
            onClick={() => onNavigate('chat')}
          />

          <BentoCard
            title={language === 'ta' ? 'பார்வை குறைபாடுடையோருக்கான எளிய வடிவம்' : 'Low-Vision Accessibility'}
            titleTamil={language === 'ta' ? 'அணுகல்தன்மை' : undefined}
            description={
              language === 'ta'
                ? '200% வரை எழுத்து அளவு மாற்றுதல், உயர் மாறுபட்ட கருப்பு-மஞ்சள் முறை, மற்றும் தானியங்கி குரல் வாசிப்பு.'
                : 'Up to 200% typography scaling, high-contrast black/gold mode, and automatic speech readback.'
            }
            badge={language === 'ta' ? 'பார்வை உதவி' : 'WCAG AAA'}
            badgeColor="magenta"
            icon={<Volume2 className="w-5 h-5" />}
            headerGraphic={
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded bg-black border-2 border-yellow-400 text-yellow-300 font-bold text-xs font-mono">
                  HIGH CONTRAST
                </span>
                <span className="text-xl font-bold text-teal-400">Aa+</span>
              </div>
            }
            onClick={() => onNavigate('settings')}
          />
        </BentoGrid>
      </div>
    </div>
  );
};
