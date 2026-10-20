/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Trash2, Layers, BookOpen, Clock, HardDrive, CheckCircle2 } from 'lucide-react';
import { DocumentItem, Language } from '../lib/types';
import { translations } from '../lib/i18n';
import { FileDropzone } from '../components/FileDropzone';
import { ApiClient, ApiError } from '../lib/api';
import { useToast } from '../components/Toast';
import { useAccessibility } from '../lib/a11y';

interface LibraryScreenProps {
  language: Language;
  documents: DocumentItem[];
  onRefreshDocs: () => Promise<void>;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  language,
  documents,
  onRefreshDocs,
}) => {
  const t = translations[language];
  const { toast } = useToast();
  const { playAudioCue } = useAccessibility();
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      await ApiClient.uploadDocument(file);
      await onRefreshDocs();
      toast(t.docAdded, 'success');
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      }
      // Re-thrown so FileDropzone can show its inline error too.
      throw err;
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeletingId(id);
    playAudioCue('beep');
    try {
      await ApiClient.deleteDocument(id);
      await onRefreshDocs();
      toast(t.docDeleted, 'info');
      playAudioCue('success');
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        toast(
          err instanceof Error ? `${t.deleteDoc} ${name}: ${err.message}` : 'Failed to delete document',
          'error'
        );
      }
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = documents.reduce((acc, d) => acc + (d.pages ?? 0), 0);
  const totalChunks = documents.reduce((acc, d) => acc + d.chunks, 0);

  return (
    <div className="relative min-h-[calc(100vh-80px)] w-full max-w-6xl mx-auto px-4 py-6 pb-28 flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white font-sans flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-400" />
            {t.libraryTitle}
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-0.5">{t.librarySubtitle}</p>
        </div>

        {/* Quick summary counters */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-3 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300">
            <span className="font-bold text-white">{documents.length}</span> {t.statDocs}
          </div>
          {totalPages > 0 && (
            <div className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
              <span className="font-bold text-white">{totalPages}</span> {t.docPages}
            </div>
          )}
          <div className="px-3 py-1 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-300">
            <span className="font-bold text-white">{totalChunks}</span> {t.docChunks}
          </div>
        </div>
      </div>

      {/* File Dropzone Uploader */}
      <div className="mb-8">
        <FileDropzone
          onFileSelect={handleUploadFile}
          isUploading={isUploading}
          language={language}
        />
      </div>

      {/* Documents Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-300 font-sans flex items-center gap-2">
          <span>{language === 'ta' ? 'அங்கீகரிக்கப்பட்ட ஆவணங்கள்' : 'Active Indexed Knowledge Base'}</span>
          <span className="text-xs text-slate-500 font-mono">({documents.length})</span>
        </h3>

        {documents.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-800 p-10 flex flex-col items-center justify-center text-center text-slate-500">
            <BookOpen className="w-8 h-8 text-slate-600 mb-3" />
            <p className="text-sm font-bold text-slate-300">{t.emptyDocuments}</p>
            <p className="text-xs mt-1">{t.emptyDocumentsHint}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {documents.map((doc) => (
              <motion.div
                key={doc.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="rounded-xl border border-slate-800 bg-[#0c0e18]/90 p-4.5 backdrop-blur-md hover:border-teal-500/40 hover:bg-[#101422] transition-all flex flex-col justify-between group shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        {doc.category && (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                            {language === 'en' ? (doc.category_en || doc.category) : doc.category}
                          </span>
                        )}
                        <h4 className={`text-sm font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-2 mt-1 ${language === 'ta' ? 'tamil-text' : 'font-sans'}`}>
                          {language === 'en' ? (doc.name_en || doc.name) : doc.name}
                        </h4>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id, doc.name)}
                      disabled={deletingId === doc.id}
                      title={t.deleteDoc}
                      aria-label={`${t.deleteDoc} ${doc.name}`}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Metadata Row (only metrics the backend actually reports) */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <div className="flex items-center gap-3">
                    {doc.pages !== undefined && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                        {doc.pages} {t.docPages}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      {doc.chunks} {t.docChunks}
                    </span>
                    {doc.size && (
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5 text-pink-400" />
                        {doc.size}
                      </span>
                    )}
                  </div>

                  <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Active RAG
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
