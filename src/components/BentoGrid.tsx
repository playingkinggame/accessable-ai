/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export const BentoGrid: React.FC<BentoGridProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-3 gap-4 max-w-7xl mx-auto w-full px-4 ${className}`}
    >
      {children}
    </div>
  );
};

interface BentoCardProps {
  title: string;
  titleTamil?: string;
  description: string;
  headerGraphic: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
  badge?: string;
  badgeColor?: 'teal' | 'gold' | 'magenta';
  onClick?: () => void;
}

export const BentoCard: React.FC<BentoCardProps> = ({
  title,
  titleTamil,
  description,
  headerGraphic,
  icon,
  className = '',
  badge,
  badgeColor = 'teal',
  onClick,
}) => {
  const badgeClasses = {
    teal: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    gold: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    magenta: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e111a]/80 backdrop-blur-md p-6 flex flex-col justify-between transition-colors hover:border-teal-500/30 hover:bg-[#121622]/90 ${className} ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 pointer-events-none transition-colors" />

      {/* Header graphic / visual */}
      <div className="w-full h-36 rounded-xl overflow-hidden mb-5 bg-[#090b12] border border-white/5 flex items-center justify-center p-3 relative">
        {headerGraphic}
      </div>

      {/* Content */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-teal-400 group-hover:text-amber-400 transition-colors">
            {icon}
          </div>
          {badge && (
            <span
              className={`text-xs px-2.5 py-1 rounded-full border font-mono font-medium ${badgeClasses[badgeColor]}`}
            >
              {badge}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {titleTamil && (
            <span className="text-xs font-semibold text-amber-400 tracking-wide block font-serif">
              {titleTamil}
            </span>
          )}
          <h3 className="text-lg font-bold text-white group-hover:text-teal-300 transition-colors">
            {title}
          </h3>
        </div>

        <p className="mt-2 text-sm text-slate-400 leading-relaxed font-sans">{description}</p>
      </div>
    </motion.div>
  );
};
