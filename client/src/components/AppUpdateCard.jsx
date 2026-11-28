import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  RefreshCw, Download, CheckCircle2, AlertCircle, ShieldCheck, RotateCw
} from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import { getInstalledVersionInfo } from '../services/appUpdateService';

export default function AppUpdateCard({
  nativeUpdateState = null,
  isCheckingUpdates = false,
  isDownloadingUpdate = false,
  updateProgress = 0,
  onCheckUpdates = null,
  onDownloadUpdate = null,
  onApplyUpdate = null,
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
              App Updates
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Signed OTA delivery (ECDSA P-256 + SHA-256)
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

      {/* Live Status Message / Release Notes / Error Banner */}
      {(nativeUpdateState?.message || nativeUpdateState?.error) && (
        <div
          data-testid="app-update-status-banner"
          className={`p-3 rounded-xl border text-xs space-y-1 ${
            status === 'error'
              ? 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300'
              : status === 'ready_to_install' || status === 'applied'
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-300'
                : status === 'update_available' || status === 'web_update_available' || status === 'native_update_required'
                  ? 'bg-purple-500/10 border-purple-500/25 text-purple-900 dark:text-purple-200'
                  : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            {status === 'error' ? (
              <AlertCircle size={14} className="shrink-0 text-rose-500" />
            ) : status === 'ready_to_install' || status === 'applied' || status === 'up_to_date' ? (
              <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
            ) : null}
            <span>{nativeUpdateState?.error || nativeUpdateState?.message}</span>
          </div>

          {nativeUpdateState?.latestVersion && (status === 'update_available' || status === 'ready_to_install' || status === 'native_update_required') && (
            <div className="text-[11px] font-semibold opacity-90">
              Latest version: v{nativeUpdateState.latestVersion}
              {nativeUpdateState.sizeBytes > 0 ? ` (${Math.max(0.1, nativeUpdateState.sizeBytes / (1024 * 1024)).toFixed(1)} MB)` : ''}
            </div>
          )}

          {nativeUpdateState?.releaseNotes && (
            <p className="text-[11px] opacity-85 leading-relaxed">
              {nativeUpdateState.releaseNotes}
            </p>
          )}
        </div>
      )}

      {/* Download Progress Bar */}
      {(isDownloadingUpdate || status === 'downloading') && (
        <div className="space-y-1" data-testid="app-update-progress">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#6C47FF] dark:text-[#C084FC]">
            <span>Downloading &amp; verifying package...</span>
            <span>{updateProgress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#5B27DC] to-[#8B5CF6] transition-all duration-200"
              style={{ width: `${Math.max(4, updateProgress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        {(status === 'update_available' || status === 'web_update_available') && onDownloadUpdate && (
          <button
            type="button"
            data-testid="settings-update-now-btn"
            onClick={onDownloadUpdate}
            disabled={isDownloadingUpdate}
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Download size={14} />
            <span>{isDownloadingUpdate ? `Downloading (${updateProgress}%)` : `Update Now (v${nativeUpdateState.latestVersion})`}</span>
          </button>
        )}

        {status === 'ready_to_install' && onApplyUpdate && (
          <button
            type="button"
            data-testid="settings-restart-apply-btn"
            onClick={onApplyUpdate}
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <RotateCw size={14} />
            <span>Restart App to Apply</span>
          </button>
        )}

        {status === 'native_update_required' && onDownloadNativeApk && (
          <button
            type="button"
            data-testid="settings-download-apk-btn"
            onClick={onDownloadNativeApk}
            className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Download size={14} />
            <span>Download Signed APK</span>
          </button>
        )}

        {onCheckUpdates && (
          <button
            type="button"
            data-testid="settings-check-updates-btn"
            onClick={onCheckUpdates}
            disabled={isCheckingUpdates || isDownloadingUpdate}
            className="flex-1 py-2.5 px-4 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <RefreshCw size={14} className={isCheckingUpdates ? 'animate-spin' : ''} />
            <span>{isCheckingUpdates ? 'Checking...' : 'Check for Updates'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
