/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, ChevronDown, ChevronUp, Copy, Check, ExternalLink } from 'lucide-react';
import { SourceCitation } from '../lib/types';

interface SourceCardProps {
  source: SourceCitation;
  isHighlighted?: boolean;
  id?: string;
  className?: string;
  language?: 'ta' | 'en';
}

export const SourceCard: React.FC<SourceCardProps> = ({
  source,
  isHighlighted = false,
  id,
  className = '',
  language = 'ta',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const relevancePercentage = Math.round(source.score * 100);
  const displayText = (language === 'en' && source.text_en) ? source.text_en : source.text;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      id={id || `source-card-${source.n}`}
      layout
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`relative rounded-xl border transition-all duration-300 overflow-hidden ${
        isHighlighted
          ? 'bg-[#181c2b] border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-400/20'
          : 'bg-[#0e111a]/90 border-slate-800/80 hover:border-teal-500/40 hover:bg-[#131622]'
      } ${className}`}
    >
      {/* Top Bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="p-4 cursor-pointer flex items-start justify-between gap-3 select-none"
      >
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500/20 border border-teal-500/30 text-teal-300 font-mono font-bold text-xs shrink-0 mt-0.5">
            {source.n}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5 line-clamp-1 font-mono">
                <FileText className="w-3.5 h-3.5 text-teal-400" />
                {source.doc}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/90 text-amber-300 border border-amber-400/20 font-sans">
                {language === 'ta' ? `பக்கம் ${source.page}` : `Page ${source.page}`}
              </span>
            </div>

            {/* Relevance progress bar */}
            <div className="mt-2 flex items-center gap-2">
              <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${relevancePercentage}%` }}
                  transition={{ duration: 0.8 }}
                  className={`h-full rounded-full ${
                    relevancePercentage > 90
                      ? 'bg-emerald-400'
                      : relevancePercentage > 75
                      ? 'bg-teal-400'
                      : 'bg-amber-400'
                  }`}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {relevancePercentage}% {language === 'ta' ? 'பொருத்தம்' : 'Match'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            title={language === 'ta' ? 'நகலெடு' : 'Copy citation'}
            aria-label="Copy citation text"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <div className="text-slate-400">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Snippet passage with highlight */}
      <div className="px-4 pb-3">
        <p className={`text-xs leading-relaxed text-slate-300 bg-[#07080e]/60 rounded-lg p-2.5 border border-white/5 ${language === 'ta' ? 'tamil-text' : 'font-sans'}`}>
          <span className="text-amber-300 font-semibold mr-1.5">"</span>
          {displayText}
          <span className="text-amber-300 font-semibold ml-1.5">"</span>
        </p>
      </div>

      {/* Expanded detailed metadata */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-800/80 px-4 py-3 bg-[#0a0c14] text-xs text-slate-400 space-y-2"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono text-slate-400">Semantic Score: {source.score.toFixed(4)}</span>
              <span className="text-teal-400 flex items-center gap-1 cursor-pointer hover:underline font-sans">
                {language === 'ta' ? 'முழு பக்கத்தை திற' : 'View Full Page'} <ExternalLink className="w-3 h-3" />
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal font-sans">
              {language === 'ta'
                ? 'அரசாணை மற்றும் ஆவணத்தின் சரிபார்க்கப்பட்ட அசல் பகுப்பாய்வு துண்டு (Chunk). இத்தரவு உண்மைப் பிழைகளை தவிர்க்க நேரடியாக பயன்படுத்தப்பட்டது.'
                : 'Verified official excerpt from document chunk. Direct semantic grounding prevents hallucinations.'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
