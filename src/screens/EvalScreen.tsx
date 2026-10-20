/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  BarChart3,
  Search,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { EvalResults, Language } from '../lib/types';
import { translations } from '../lib/i18n';
import { ApiClient, ApiError } from '../lib/api';
import { NumberTicker } from '../components/NumberTicker';
import { useAccessibility } from '../lib/a11y';
import { useToast } from '../components/Toast';

interface EvalScreenProps {
  language: Language;
  onResults?: (results: EvalResults) => void;
}

export const EvalScreen: React.FC<EvalScreenProps> = ({ language, onResults }) => {
  const t = translations[language];
  const { playAudioCue } = useAccessibility();
  const { toast } = useToast();

  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<EvalResults | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');

  // Load the last stored run instead of triggering a new (expensive) evaluation.
  useEffect(() => {
    const loadStoredResults = async () => {
      try {
        setResults(await ApiClient.getEvalResults());
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return;
        toast(err instanceof Error ? err.message : 'Failed to load eval results', 'error');
      }
    };
    void loadStoredResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRunEval = async () => {
    setIsRunning(true);
    playAudioCue('beep');
    try {
      const res = await ApiClient.runEval();
      setResults(res);
      onResults?.(res);
      playAudioCue('success');
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        toast(err instanceof Error ? err.message : 'Evaluation failed', 'error');
      }
    } finally {
      setIsRunning(false);
    }
  };

  const items = results?.items || [];
  const categories = [
    'all',
    ...Array.from(
      new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))
    ),
  ];

  const filteredItems = items.filter((item) => {
    const matchesCat = filterCategory === 'all' || item.category === filterCategory;
    const matchesSearch =
      item.q.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (item.q_en ? item.q_en.toLowerCase().includes(searchFilter.toLowerCase()) : false);
    return matchesCat && matchesSearch;
  });

  // Latency aggregated per source document from the real eval run.
  const chartBuckets = new Map<string, { latency: number; count: number; correct: number }>();
  items.forEach((item) => {
    const key = item.sources[0]?.doc || item.category || 'unspecified';
    const bucket = chartBuckets.get(key) ?? { latency: 0, count: 0, correct: 0 };
    bucket.latency += item.latency_ms;
    bucket.count += 1;
    bucket.correct += item.correct ? 1 : 0;
    chartBuckets.set(key, bucket);
  });
  const chartData = Array.from(chartBuckets.entries()).map(([name, bucket]) => ({
    name: name.replace(/\.[a-z0-9]+$/i, '').slice(0, 18),
    latency: bucket.count ? Math.round(bucket.latency / bucket.count) : 0,
    passRate: bucket.count ? Math.round((bucket.correct / bucket.count) * 100) : 0,
  }));

  return (
    <div className="relative min-h-[calc(100vh-80px)] w-full max-w-6xl mx-auto px-4 py-6 pb-28 flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white font-sans flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            {t.evalTitle}
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-0.5">{t.evalSubtitle}</p>
        </div>

        <button
          type="button"
          onClick={handleRunEval}
          disabled={isRunning}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-teal-400 to-emerald-400 text-slate-950 font-bold text-xs hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-lg shadow-teal-500/20 disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <RotateCcw className="w-4 h-4 animate-spin" />
              <span>{t.evalRunning}</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-slate-950" />
              <span>{t.runEval}</span>
            </>
          )}
        </button>
      </div>

      {/* Empty state: no evaluation has been stored yet */}
      {items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 mb-8 flex flex-col items-center justify-center text-center text-slate-500">
          <BarChart3 className="w-9 h-9 text-slate-600 mb-3" />
          <p className="text-sm font-bold text-slate-300">{t.emptyEval}</p>
          <p className="text-xs mt-1">{t.emptyEvalHint}</p>
        </div>
      )}

      {/* Metrics Row */}
      {results && items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Accuracy Score Ring Card */}
          <div className="p-4 rounded-2xl bg-[#0c0e18]/90 border border-slate-800 flex items-center gap-4">
            <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="#1e293b"
                  strokeWidth="5"
                  fill="none"
                />
                <motion.circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="#00E5BC"
                  strokeWidth="5"
                  strokeDasharray={163}
                  initial={{ strokeDashoffset: 163 }}
                  animate={{
                    strokeDashoffset: 163 - (163 * results.accuracy) / 100,
                  }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute font-mono text-sm font-extrabold text-teal-300">
                {results.accuracy}%
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-400 font-sans">{t.accuracyScore}</span>
              <p className="text-sm font-bold text-white font-mono mt-0.5">
                {results.correct} / {results.total} Passed
              </p>
            </div>
          </div>

          {/* Average Latency */}
          <div className="p-4 rounded-2xl bg-[#0c0e18]/90 border border-slate-800 flex flex-col justify-center">
            <span className="text-xs text-slate-400 font-sans flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              {t.avgLatency}
            </span>
            <div className="mt-1 text-2xl font-black text-amber-300 font-mono">
              <NumberTicker value={results.avg_latency_ms} suffix="ms" />
            </div>
          </div>

          {/* P95 Latency */}
          <div className="p-4 rounded-2xl bg-[#0c0e18]/90 border border-slate-800 flex flex-col justify-center">
            <span className="text-xs text-slate-400 font-sans flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-pink-400" />
              {t.p95Latency}
            </span>
            <div className="mt-1 text-2xl font-black text-pink-300 font-mono">
              <NumberTicker value={results.p95_latency_ms} suffix="ms" />
            </div>
          </div>

          {/* Tested Questions count */}
          <div className="p-4 rounded-2xl bg-[#0c0e18]/90 border border-slate-800 flex flex-col justify-center">
            <span className="text-xs text-slate-400 font-sans flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              {t.questionsTested}
            </span>
            <div className="mt-1 text-2xl font-black text-emerald-300 font-mono">
              <NumberTicker value={results.total} suffix=" Qs" />
            </div>
          </div>
        </div>
      )}

      {/* Latency & Quality Chart */}
      {chartData.length > 0 && (
      <div className="p-5 rounded-2xl bg-[#0c0e18]/90 border border-slate-800 mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold text-white font-sans flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-400" />
            {language === 'ta' ? 'ஆவண வாரியான பதில் தாமதம் (ms)' : 'Answer Latency by Source Document (ms)'}
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {language === 'ta' ? 'சொற்பொருள் தேடல்' : 'Real-time vector lookup'}
          </span>
        </div>

        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#07080e',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="latency" radius={[6, 6, 0, 0]}>
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={['#00E5BC', '#F5B041', '#FF2A85', '#38BDF8'][index % 4]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
          {categories.map((cat) => {
            const label = cat === 'all'
              ? `${language === 'ta' ? 'அனைத்தும்' : 'All'} (${items.length})`
              : cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-full capitalize font-medium transition-colors cursor-pointer whitespace-nowrap border ${
                  filterCategory === cat
                    ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search Filter */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder={language === 'ta' ? 'கேள்விகளைத் தேட...' : 'Search benchmark queries...'}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400 font-sans"
          />
        </div>
      </div>

      {/* Benchmark Questions Table */}
      {items.length > 0 && (
      <div className="rounded-2xl border border-slate-800 bg-[#0c0e18]/90 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#090b12] text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
              <tr>
                <th className="p-3.5">#</th>
                <th className="p-3.5">{language === 'ta' ? 'கேள்வி / Query' : 'Benchmark Query'}</th>
                <th className="p-3.5">{t.evalCategory}</th>
                <th className="p-3.5">{language === 'ta' ? 'ஆதாரம்' : 'Ground Truth'}</th>
                <th className="p-3.5">{language === 'ta' ? 'தாமதம்' : 'Latency'}</th>
                <th className="p-3.5">{language === 'ta' ? 'நிலை' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredItems.map((item, index) => {
                const primaryQ = language === 'en' ? (item.q_en || item.q) : item.q;
                const answerText = language === 'en' ? (item.answer_en || item.answer) : item.answer;
                const catLabel =
                  language === 'en' ? (item.category_en || item.category) : item.category;

                return (
                  <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-mono text-slate-500">{index + 1}</td>
                    <td className="p-3.5 max-w-sm">
                      <p className={`font-semibold text-slate-100 ${language === 'ta' ? 'tamil-text' : 'font-sans'}`}>
                        {primaryQ}
                      </p>
                      {language === 'ta' && item.q_en && (
                        <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                          {item.q_en}
                        </p>
                      )}
                      <p className="text-[11px] text-teal-300/90 mt-1 italic font-sans">
                        "{answerText}"
                      </p>
                    </td>
                    <td className="p-3.5">
                      {catLabel ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                          {catLabel}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-600">—</span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-slate-300 whitespace-nowrap">
                      {item.sources?.[0] ? (
                        <span className="text-amber-400 font-medium">
                          {item.sources[0].doc.split('_')[0]} (P.{item.sources[0].page})
                        </span>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-slate-300 whitespace-nowrap">
                      {item.latency_ms}ms
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      {item.correct ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                          <CheckCircle2 className="w-3 h-3" />
                          {t.statusPass}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono">
                          <XCircle className="w-3 h-3" />
                          {t.statusFail}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};
