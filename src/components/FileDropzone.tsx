/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAccessibility } from '../lib/a11y';

interface FileDropzoneProps {
  onFileSelect: (file: File) => Promise<void>;
  isUploading?: boolean;
  className?: string;
  language?: 'ta' | 'en';
}

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  onFileSelect,
  isUploading = false,
  className = '',
  language = 'ta',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { playAudioCue } = useAccessibility();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg(
        language === 'ta'
          ? 'தயவுசெய்து PDF ஆவணங்களை மட்டுமே பதிவேற்றவும்'
          : 'Please upload PDF format files only'
      );
      playAudioCue('alert');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg(
        language === 'ta'
          ? 'கோப்பின் அளவு 25MB-க்கு குறைவாக இருக்க வேண்டும்'
          : 'File size must be below 25MB'
      );
      playAudioCue('alert');
      return;
    }

    setErrorMsg(null);
    try {
      await onFileSelect(file);
      setSuccessMsg(
        language === 'ta'
          ? `"${file.name}" வெற்றிகரமாக பகுப்பாய்வு செய்யப்பட்டது!`
          : `"${file.name}" indexed successfully!`
      );
      playAudioCue('success');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch {
      setErrorMsg(
        language === 'ta'
          ? 'பதிவேற்றத்தில் பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.'
          : 'Upload failed. Please try again.'
      );
      playAudioCue('alert');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload PDF Document"
        className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 cursor-pointer overflow-hidden ${
          isDragOver
            ? 'border-teal-400 bg-teal-500/10 scale-[1.01]'
            : 'border-slate-700/80 bg-[#0c0e18]/80 hover:border-teal-500/50 hover:bg-[#101422]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        {/* Indexing Shimmer Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-[#0c0e18]/90 backdrop-blur-md flex flex-col items-center justify-center z-20">
            <div className="relative">
              <svg className="w-16 h-16 animate-spin text-teal-400" viewBox="0 0 50 50">
                <circle
                  className="opacity-25"
                  cx="25"
                  cy="25"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <circle
                  className="opacity-75"
                  cx="25"
                  cy="25"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeDasharray="80"
                  strokeDashoffset="60"
                  fill="none"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <FileText className="w-6 h-6 text-amber-300 animate-pulse" />
              </div>
            </div>

            <p className="mt-4 text-sm font-semibold text-teal-300 tamil-text">
              {language === 'ta'
                ? 'பக்கங்கள் மற்றும் சொற்பொருள் துண்டுகள் பகுப்பாய்வு செய்யப்படுகின்றன...'
                : 'Generating dense vector chunks & citations...'}
            </p>
          </div>
        )}

        <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-300 mb-4 group-hover:scale-110 transition-transform">
          <UploadCloud className="w-7 h-7" />
        </div>

        <h4 className="text-base font-bold text-white mb-1">
          {language === 'ta' ? 'PDF கோப்புகளை இங்கே இழுத்துப் போடவும்' : 'Drag & Drop PDF Documents Here'}
        </h4>

        <p className={`text-xs text-slate-400 max-w-sm mb-4 ${language === 'ta' ? 'tamil-text' : 'font-sans'}`}>
          {language === 'ta'
            ? 'அல்லது கணினியிலிருந்து தேர்ந்தெடுக்க கிளிக் செய்யவும் (அதிகபட்சம் 25MB)'
            : 'or click to browse from device (max 25MB)'}
        </p>

        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
          <FileText className="w-3.5 h-3.5 text-teal-400" />
          {language === 'ta' ? 'அரசாணை / திட்ட வழிகாட்டி PDF' : 'Official Handbook / Guideline / Scheme PDF'}
        </span>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 p-3 rounded-xl bg-red-950/60 border border-red-500/30 text-red-200 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
