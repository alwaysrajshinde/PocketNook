import React from 'react';
import { Sparkles, X, Check, Smartphone, Palette, ShieldCheck, Zap, Layers, History, ArrowRight, FileSpreadsheet, WifiOff, Tag, LayoutDashboard, Calendar, Clock } from 'lucide-react';
import { APP_VERSION, APP_RELEASE_DATE, APP_RELEASE_TIME, APP_SHORT_DATE, APP_INKED_VERSION } from '../constants/version';

export default function ReleaseNotesModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const highlights = [
    {
      icon: Sparkles,
      title: 'Welcome Back Motivational Overlay',
      description: 'Luxury launch greeting with glowing lotus emblem, dynamic time-adaptive greeting, and financial motivation quotes designed to build consistent money habits.',
      tag: 'New Design'
    },
    {
      icon: Smartphone,
      title: 'Single-Page Mobile Add Expense (No Scroll)',
      description: 'Streamlined form layout fitting 100% on a single screen without scrolling. Quick amount chips and tactile category selector for rapid 1-tap logging.',
      tag: 'Mobile Experience'
    },
    {
      icon: Palette,
      title: 'Custom Fintech Dropdowns',
      description: 'Replaced unstyled browser-native select popups with elegant dark glassmorphic dropdown cards, smooth transitions, and chevron indicators.',
      tag: 'UI/UX Polish'
    },
    {
      icon: LayoutDashboard,
      title: 'Unified Single-Row Reports & 360° Closed Donut',
      description: 'Consolidated dual navigation rows into one clean 4-segment tab bar. Category donut chart now renders a guaranteed complete 360° circle with a 6-month spending trend.',
      tag: 'Analytics'
    },
    {
      icon: Clock,
      title: 'Inked Date & Exact Release Timestamp',
      description: 'Transparent platform build tracking with exact release date and time inked directly across desktop and mobile headers, sidebars, and settings.',
      tag: 'Build Metadata'
    },
    {
      icon: FileSpreadsheet,
      title: 'Google Sheets Direct Cloud Sync (Upcoming)',
      description: 'Previewing direct 1-click cloud sync to Google Sheets and Drive. Dedicated preview section in Settings.',
      tag: 'Upcoming Feature'
    },
    {
      icon: FileSpreadsheet,
      title: 'Intelligent Expense Import System',
      description: 'Import transactions seamlessly from Excel (.xlsx, .xls), CSVs, direct clipboard table paste, and bank statements with smart column detection and 1-click safe undo.',
      tag: 'Data Import'
    },
    {
      icon: WifiOff,
      title: 'Complete Offline-First Architecture',
      description: 'Full PWA offline caching with IndexedDB transaction queue and automatic background synchronization to Firebase when connectivity resumes.',
      tag: 'Architecture'
    },
    {
      icon: Tag,
      title: '15 Standard Categories & Smart Removal Guard',
      description: 'Clean default taxonomy for new users, suggested 1-click additions, and protective deletion guards offering transaction reassign or archive choices.',
      tag: 'Category Management'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-safe-overlay bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-[#16132A] rounded-3xl shadow-2xl p-6 z-10 border border-slate-100 dark:border-white/10 space-y-5 animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-purple-50 dark:bg-purple-900/40 text-[#6C47FF] dark:text-[#A78BFA] flex items-center justify-center shadow-xs">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  What's New in PocketNook
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-[#6C47FF] dark:text-[#A78BFA] text-[10px] font-black tracking-wide">
                  {APP_VERSION}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                <Calendar size={12} className="text-[#6C47FF] dark:text-[#A78BFA]" />
                <span>Last Updated: <strong className="text-slate-700 dark:text-slate-200">{APP_SHORT_DATE} at {APP_RELEASE_TIME}</strong></span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
          {highlights.map((h, i) => {
            const Icon = h.icon;
            return (
              <div
                key={i}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-start gap-3.5 transition-all hover:border-purple-200 dark:hover:border-purple-900/40"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-[#6C47FF] dark:text-[#A78BFA] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
                  <Icon size={16} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {h.title}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 bg-white dark:bg-white/10 px-2 py-0.5 rounded-md border border-slate-200 dark:border-white/10 flex-shrink-0">
                      {h.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {h.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] text-slate-400">
            Powered by Firebase &amp; Google Cloud Platform
          </span>
          <button
            onClick={onClose}
            className="py-2 px-5 bg-gradient-to-r from-[#6C47FF] to-[#8B5CF6] text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/25 hover:opacity-95 transition-all cursor-pointer"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
}
