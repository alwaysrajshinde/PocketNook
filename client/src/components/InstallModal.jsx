import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import {
  X, Smartphone, Share, PlusSquare, ArrowUpRight, CheckCircle2,
  ExternalLink, Sparkles, Download, Laptop, Compass, AlertCircle, RefreshCw, ShieldCheck
} from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import { getInstalledVersionInfo } from '../services/appUpdateService';

import AppUpdateCard from './AppUpdateCard';

export default function InstallModal({
  isOpen,
  onClose,
  nativeUpdateState = null,
  onDownloadNativeApk = null
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [nativeInfo, setNativeInfo] = useState(null);
  const isNativeAndroid = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNativeAndroid && isOpen) {
      getInstalledVersionInfo().then(setNativeInfo).catch(() => {});
    }
  }, [isNativeAndroid, isOpen]);

  useEffect(() => {
    // Check if running in standalone mode (already installed)
    const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    setIsInstalled(Boolean(standalone));

    // Detect iOS devices
    const userAgent = window.navigator.userAgent || '';
    const iOSCheck = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    setIsIOS(Boolean(iOSCheck));

    // Detect In-App Browsers (WhatsApp, Instagram, FB, LinkedIn, Telegram)
    const inAppCheck = /FBAN|FBAV|Instagram|WhatsApp|Line|Twitter|Telegram/i.test(userAgent);
    setIsInAppBrowser(Boolean(inAppCheck));

    // Listen for beforeinstallprompt on Android/Chrome
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-safe-overlay bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      style={{ touchAction: 'none' }}
    >
      <div className="fixed inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Install PocketNook"
        data-testid="install-app-modal"
        className="relative w-full max-w-md bg-white dark:bg-[#18132F] rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-white/10 shadow-2xl z-10 space-y-4 animate-scale-in max-h-[calc(92dvh-var(--pn-safe-top)-var(--pn-safe-bottom))] overflow-y-auto"
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-[#281D4C] text-[#6C47FF] dark:text-[#C084FC] flex items-center justify-center">
              <Smartphone size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Install PocketNook</h3>
              <p className="text-xs text-slate-400">Add to Home Screen for native experience</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Already Installed State or Native Android Live Update Panel */}
        {isNativeAndroid ? (
          <AppUpdateCard
            nativeUpdateState={nativeUpdateState}
            onDownloadNativeApk={onDownloadNativeApk}
            compact={true}
          />
        ) : isInstalled ? (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs space-y-2 text-center">
            <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
            <div className="font-bold text-sm">PocketNook is Installed!</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              You are running PocketNook in full-screen standalone mode with offline-first storage and instant cloud sync.
            </p>
          </div>
        ) : isIOS ? (
          /* iOS Step-by-Step Instructions */
          <div className="space-y-3.5">
            {isInAppBrowser && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <span className="font-bold">Inside in-app browser?</span>
                  <p className="text-[11px] mt-0.5 opacity-90">
                    Tap the <strong>···</strong> or <strong>🧭 Compass</strong> icon in the corner and choose <strong>"Open in Safari"</strong>. Apple only allows adding to Home Screen from Safari.
                  </p>
                </div>
              </div>
            )}

            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Apple iOS Installation (4 Easy Steps):
            </div>

            {/* Step 1 */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#6C47FF] text-white flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div className="text-xs space-y-0.5">
                <div className="font-bold text-slate-900 dark:text-white">Open in Safari</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Make sure you are using Apple Safari on your iPhone or iPad.
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#6C47FF] text-white flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div className="text-xs space-y-0.5">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Tap the Share Button</span>
                  <Share size={13} className="text-[#6C47FF] dark:text-[#C084FC]" />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tap the square icon with an upward arrow at the bottom of your Safari screen.
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#6C47FF] text-white flex items-center justify-center font-bold text-xs shrink-0">
                3
              </div>
              <div className="text-xs space-y-0.5">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Tap "Add to Home Screen"</span>
                  <PlusSquare size={13} className="text-[#6C47FF] dark:text-[#C084FC]" />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Scroll down the share sheet options and tap <strong>Add to Home Screen</strong>.
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-[#6C47FF] text-white flex items-center justify-center font-bold text-xs shrink-0">
                4
              </div>
              <div className="text-xs space-y-0.5">
                <div className="font-bold text-slate-900 dark:text-white">Tap "Add" in Top Right</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  PocketNook will appear as a native app icon on your iPhone home screen.
                </div>
              </div>
            </div>

            {/* iOS Chrome Note */}
            <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-900 dark:text-purple-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#6C47FF] dark:text-[#C084FC]" />
                <span>Using Chrome on iPhone?</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                Tap the <strong>Share</strong> button in Chrome &rarr; scroll to <strong>"Add to Home Screen"</strong>, or open the link in <strong>Safari</strong> for the full standalone PWA experience.
              </p>
            </div>
          </div>
        ) : (
          /* Android / Desktop Install */
          <div className="space-y-3.5">
            {deferredPrompt ? (
              <button
                type="button"
                onClick={handleNativeInstall}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#6C47FF] to-[#8B5CF6] text-white font-bold text-xs shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer hover:opacity-95 transition-all"
              >
                <Download size={16} />
                <span>Install PocketNook to Device</span>
              </button>
            ) : (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 text-xs space-y-2">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Laptop size={15} className="text-[#6C47FF] dark:text-[#C084FC]" />
                  <span>Manual Installation:</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  In Chrome, Edge, or Brave: click the <strong>Install</strong> icon in the address bar, or tap the three dots <strong>(⋮)</strong> and select <strong>"Install PocketNook"</strong> or <strong>"Add to Home screen"</strong>.
                </p>
              </div>
            )}

            <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-900 dark:text-purple-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#6C47FF] dark:text-[#C084FC]" />
                <span>PWA Benefits:</span>
              </div>
              <ul className="text-[11px] list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-300">
                <li>Zero download storage footprint (under 3 MB)</li>
                <li>Instant offline support with cached assets</li>
                <li>Launches full-screen without browser URL bars</li>
                <li>Real-time automatic updates on every visit</li>
              </ul>
            </div>
          </div>
        )}

        {/* Footer Close */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
