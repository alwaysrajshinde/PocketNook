import React, { useState } from 'react';
import { Wifi, Battery, Smartphone, Maximize2, Minimize2, Sparkles } from 'lucide-react';

export default function AndroidFrame({ children, isDesktopScreen = false }) {
  const [frameMode, setFrameMode] = useState('phone'); // 'phone' | 'fluid'

  // If on actual mobile screen, render full width without mockup bezel
  if (!isDesktopScreen) {
    return (
      <div className="w-full max-w-lg mx-auto min-h-dvh bg-[var(--bg-app)] flex flex-col relative transition-colors pt-safe pb-safe">
        {children}
      </div>
    );
  }

  // If user prefers fluid mobile view on desktop
  if (frameMode === 'fluid') {
    return (
      <div className="flex-1 flex flex-col items-center py-6 px-4 bg-slate-900/5 dark:bg-black/30 min-h-[calc(100vh-36px)] overflow-y-auto transition-colors">
        {/* Frame Toggle Bar */}
        <div className="w-full max-w-md flex items-center justify-between mb-4 px-3 py-2 bg-white dark:bg-[#16132A] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Android Mobile View
            </span>
          </div>
          <button
            onClick={() => setFrameMode('phone')}
            className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 dark:bg-purple-900/30 text-[#6C47FF] dark:text-[#A78BFA] rounded-xl text-xs font-semibold hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
          >
            <Smartphone size={13} />
            <span>Show Phone Frame</span>
          </button>
        </div>

        {/* Content Container */}
        <div className="w-full max-w-md bg-[var(--bg-app)] rounded-3xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden relative min-h-[780px]">
          {children}
        </div>
      </div>
    );
  }

  // Photorealistic Android Smartphone Mockup on Desktop
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 bg-slate-900/10 dark:bg-black/40 min-h-[calc(100vh-36px)] overflow-y-auto transition-colors">
      {/* Top Banner / Switcher */}
      <div className="w-[390px] flex items-center justify-between mb-4 px-4 py-2 bg-white dark:bg-[#16132A] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#6C47FF] text-white flex items-center justify-center">
            <Smartphone size={14} />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 dark:text-white block leading-tight">
              Android Reference UI
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Modern Purple UI
            </span>
          </div>
        </div>
        <button
          onClick={() => setFrameMode('fluid')}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 bg-slate-100 dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
          title="Switch to fluid width view"
        >
          <Maximize2 size={12} />
          <span>Expand</span>
        </button>
      </div>

      {/* Android Smartphone Device Shell */}
      <div className="relative w-[390px] h-[820px] bg-slate-950 rounded-[48px] p-3 shadow-2xl shadow-purple-950/25 ring-1 ring-slate-800/80 flex flex-col transition-all">
        {/* Device Outer Bezel & Edge Highlight */}
        <div className="w-full h-full bg-[var(--bg-app)] rounded-[38px] overflow-hidden flex flex-col relative border border-slate-200/30 dark:border-white/5 shadow-inner">
          {/* Android Status Bar */}
          <div className="h-8 w-full bg-[var(--bg-app)] text-slate-800 dark:text-slate-200 px-6 flex items-center justify-between text-xs font-bold select-none z-30 transition-colors">
            <span>9:41</span>
            {/* Center Front Camera Pinhole */}
            <div className="w-3.5 h-3.5 bg-black rounded-full ring-2 ring-slate-800/20" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold tracking-tighter">5G</span>
              <Wifi size={13} />
              <Battery size={15} />
            </div>
          </div>

          {/* Scrollable Phone Screen Contents */}
          <div className="flex-1 overflow-y-auto relative flex flex-col scroll-smooth">
            {children}
          </div>

          {/* Android Home Indicator Gesture Bar */}
          <div className="h-4 w-full bg-[var(--bg-app)] flex items-center justify-center py-1 z-30 select-none">
            <div className="w-32 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
