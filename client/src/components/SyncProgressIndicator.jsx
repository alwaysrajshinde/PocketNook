import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import syncService from '../services/syncService';

export default function SyncProgressIndicator({ syncState, isDesktop = false }) {
  const [showSyncedBanner, setShowSyncedBanner] = useState(false);
  const prevSyncingRef = useRef(false);

  // Detect transition from syncing -> synced to show completed confirmation badge for 2.5s
  useEffect(() => {
    if (prevSyncingRef.current && !syncState.isSyncing && syncState.status === 'synced' && syncState.isOnline) {
      setShowSyncedBanner(true);
      const timer = setTimeout(() => {
        setShowSyncedBanner(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
    prevSyncingRef.current = syncState.isSyncing;
  }, [syncState.isSyncing, syncState.status, syncState.isOnline]);

  const shouldRender = 
    !syncState.isOnline || 
    syncState.status === 'syncing' || 
    syncState.status === 'error' || 
    syncState.status === 'failed' ||
    (syncState.isOnline && syncState.pendingCount > 0) ||
    showSyncedBanner;

  if (!shouldRender) return null;

  const handleRetry = (e) => {
    e.stopPropagation();
    if (syncService.triggerAutoSync) {
      syncService.triggerAutoSync();
    }
  };

  const isSyncing = syncState.status === 'syncing' || syncState.isSyncing;
  const isError = syncState.status === 'error' || syncState.status === 'failed';
  const isOffline = !syncState.isOnline;

  return (
    <div 
      className={`relative overflow-hidden transition-all duration-300 border-b select-none ${
        isSyncing
          ? 'bg-purple-950/40 border-[#6C47FF]/30 text-purple-200'
          : isError
          ? 'bg-rose-950/40 border-rose-500/30 text-rose-200'
          : isOffline
          ? 'bg-amber-950/30 border-amber-500/20 text-amber-200'
          : 'bg-emerald-950/30 border-emerald-500/20 text-emerald-200'
      } ${isDesktop ? 'px-6 py-2.5' : 'px-4 py-2'}`}
    >
      <div className="flex items-center justify-center gap-2.5 text-xs font-semibold">
        {isSyncing ? (
          <>
            <RefreshCw size={13} className="animate-spin text-[#8B5CF6] flex-shrink-0" />
            <span className="truncate">
              Syncing {syncState.pendingCount > 0 ? `${syncState.pendingCount} offline change${syncState.pendingCount > 1 ? 's' : ''}` : 'offline changes'} with cloud...
            </span>
          </>
        ) : isError ? (
          <>
            <AlertCircle size={13} className="text-rose-400 flex-shrink-0" />
            <span className="truncate">Synchronization paused</span>
            <button
              onClick={handleRetry}
              className="ml-2 px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition-colors cursor-pointer"
            >
              Retry
            </button>
          </>
        ) : isOffline ? (
          <>
            <WifiOff size={13} className="text-amber-400 flex-shrink-0" />
            <span className="truncate">
              Offline Mode · Changes saved locally {syncState.pendingCount > 0 ? `(${syncState.pendingCount} pending sync)` : ''}
            </span>
          </>
        ) : showSyncedBanner ? (
          <>
            <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />
            <span className="truncate">All changes synchronized</span>
          </>
        ) : null}
      </div>

      {/* Elegant Indeterminate Scanning Beam for Syncing State */}
      {isSyncing && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-950/80 overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#8B5CF6] to-transparent animate-shimmer" />
        </div>
      )}
    </div>
  );
}
