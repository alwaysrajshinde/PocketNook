import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, CheckCircle2, ShieldCheck } from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import { getInstalledVersionInfo } from '../services/appUpdateService';

export default function AppUpdateCard({
  nativeUpdateState = null,
  onDownloadNativeApk = null,
  compact = false
}) {
  const [versionInfo, setVersionInfo] = useState(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    getInstalledVersionInfo().then(setVersionInfo).catch(() => {});
  }, [nativeUpdateState?.status, nativeUpdateState?.activeBundleVersion]);

  const status = nativeUpdateState?.status;
  const appVer = versionInfo?.nativeVersionName || APP_VERSION.replace(/^v/, '');
  const buildCode = versionInfo?.nativeVersionCode || 1;
  const webVer = versionInfo?.webVersion || appVer;
  const bundleLabel = versionInfo?.activeBundleId && versionInfo.activeBundleId !== 'builtin' && versionInfo.activeBundleId !== 'web'
    ? `OTA (${versionInfo.activeBundleId.slice(0, 8)})`
    : (isNative ? 'Built-in' : 'Web');

  const getAutomaticStatusCopy = () => {
    if (status === 'native_update_required') {
      return `PocketNook v${nativeUpdateState.latestVersion} requires installing a newer signed Android APK.`;
    }
    if (status === 'ready_to_install' && nativeUpdateState?.stagedVersion) {
      return `Update v${nativeUpdateState.stagedVersion} verified — will apply automatically on next cold launch.`;
    }
    if (status === 'downloading') {
      return `Downloading verified update v${nativeUpdateState?.latestVersion || ''} quietly in the background...`.trim();
    }
    if (status === 'offline') {
      return 'Automatic updates enabled · Waiting for network connection.';
    }
    if (status === 'up_to_date') {
      return `Automatic updates enabled · Up to date (v${webVer}).`;
    }
    if (status === 'error') {
      return 'Automatic updates enabled · Will retry cleanly on the next check.';
    }
    return isNative
      ? 'Automatic background updates enabled · Updates apply automatically on next launch.'
      : 'Web build active · Android APK receives signed background OTA updates automatically.';
  };

  return (
    <div
      data-testid="app-updates-panel"
      className={`rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#16132A] ${compact ? 'p-3.5 space-y-3' : 'p-4 sm:p-5 space-y-3.5'} transition-colors`}
    >
      {/* Version Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-[#281D4C] text-[#6C47FF] dark:text-[#C084FC] flex items-center justify-center shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              App Version &amp; Updates
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Automatic signed delivery (ECDSA P-256 + SHA-256)
            </p>
          </div>
        </div>
        <span className="shrink-0 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/40 text-[#6C47FF] dark:text-[#C084FC]">
          v{webVer}
        </span>
      </div>

      {/* Installed & Active OTA Version Grid */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
          <span className="text-slate-400 block text-[10px] font-semibold uppercase">Installed App</span>
          <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
            v{appVer} (Build {buildCode})
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
          <span className="text-slate-400 block text-[10px] font-semibold uppercase">Active Web / OTA</span>
          <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
            v{webVer} · {bundleLabel}
          </span>
        </div>
      </div>

      {/* Read-Only Automatic Update Status */}
      <div
        data-testid="app-update-status-banner"
        className={`p-3 rounded-xl border text-xs space-y-1 ${
          status === 'native_update_required'
            ? 'bg-amber-500/10 border-amber-500/25 text-amber-900 dark:text-amber-200'
            : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 font-semibold">
          {status !== 'native_update_required' && (
            <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
          )}
          <span>{getAutomaticStatusCopy()}</span>
        </div>

        {status === 'native_update_required' && nativeUpdateState?.releaseNotes && (
          <p className="text-[11px] opacity-85 leading-relaxed">
            {nativeUpdateState.releaseNotes}
          </p>
        )}
      </div>

      {/* Action Button ONLY when a native Android APK upgrade is strictly required */}
      {status === 'native_update_required' && onDownloadNativeApk && (
        <button
          type="button"
          data-testid="settings-download-apk-btn"
          onClick={onDownloadNativeApk}
          className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <Download size={14} />
          <span>Download Signed APK</span>
        </button>
      )}
    </div>
  );
}
