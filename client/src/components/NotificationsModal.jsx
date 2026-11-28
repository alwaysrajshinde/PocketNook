import React, { useState, useEffect } from 'react';
import { X, Bell, AlertTriangle, CheckCircle, ShieldCheck, CheckCheck, Sparkles, ArrowRight, Check } from 'lucide-react';
import { APP_VERSION, APP_SHORT_DATE, APP_RELEASE_TIME, APP_CHANGELOG_SUMMARY } from '../constants/version';
import { getCurrentUserId } from '../services/api';

const STORAGE_READ_NOTIFS_KEY = 'expense_tracker_read_notifs';

export default function NotificationsModal({ 
  isOpen, 
  onClose, 
  dashboardData, 
  formatCurrency,
  onClearUnread,
  onOpenReleaseNotes
}) {
  const userId = getCurrentUserId();
  const storageKey = `${STORAGE_READ_NOTIFS_KEY}_${userId}`;

  // Persistently stored read notification IDs
  const [readIds, setReadIds] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Re-sync read state whenever modal opens or user changes
  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          setReadIds(parsed);
        }
      } catch (e) {}
    }
  }, [isOpen, storageKey]);

  if (!isOpen) return null;

  const totalSpent = dashboardData?.total_spent || 0;
  const budget = dashboardData?.budget || 0;
  const percentSpent = dashboardData?.percent_spent || 0;

  let prefs = { notify80: true, notify100: true, notifySync: true };
  try {
    const saved = localStorage.getItem('expense_tracker_notification_prefs');
    if (saved) prefs = { ...prefs, ...JSON.parse(saved) };
  } catch (e) {}

  const dynamicNotifications = [];

  // Notification 0: New Application Update Alert
  dynamicNotifications.push({
    id: `app-update-${APP_VERSION}`,
    title: `App Updated to ${APP_VERSION}`,
    description: `${APP_CHANGELOG_SUMMARY} (Updated ${APP_SHORT_DATE} at ${APP_RELEASE_TIME})`,
    time: APP_RELEASE_TIME,
    type: 'update',
    icon: Sparkles,
    actionText: "See What's New",
    onAction: () => {
      onClose();
      if (onOpenReleaseNotes) onOpenReleaseNotes();
    }
  });

  // Notification 1: Budget setting prompt if budget is 0
  if (budget === 0) {
    dynamicNotifications.push({
      id: 'set-budget',
      title: 'Set Monthly Budget',
      description: 'You have not set a monthly spending limit. Setting a target enables budget pace tracking and spending warnings.',
      time: 'Now',
      type: 'warning',
      icon: AlertTriangle
    });
  } else {
    // Notification 2: Budget threshold alerts based on user preferences
    if (percentSpent >= 100 && prefs.notify100) {
      dynamicNotifications.push({
        id: 'budget-exceeded',
        title: 'Monthly Budget Limit Exceeded',
        description: `You have spent ${formatCurrency(totalSpent)} (${percentSpent}%), which is ${formatCurrency(totalSpent - budget)} over your target limit.`,
        time: 'Critical Alert',
        type: 'warning',
        icon: AlertTriangle
      });
    } else if (percentSpent >= 80 && prefs.notify80) {
      dynamicNotifications.push({
        id: 'budget-warning',
        title: 'Spending Approaching 80% Limit',
        description: `You have spent ${formatCurrency(totalSpent)} (${percentSpent}%) of your ${formatCurrency(budget)} monthly budget.`,
        time: 'Warning Alert',
        type: 'warning',
        icon: AlertTriangle
      });
    } else if (percentSpent < 80) {
      dynamicNotifications.push({
        id: 'budget-pace',
        title: 'Monthly Budget On Track',
        description: `You have spent ${formatCurrency(totalSpent)} (${percentSpent}%) of your ${formatCurrency(budget)} monthly budget. Spending pace is healthy.`,
        time: 'Pace Status',
        type: 'success',
        icon: CheckCircle
      });
    }
  }

  // Notification 3: Cloud Vault Sync Status
  if (prefs.notifySync) {
    dynamicNotifications.push({
      id: 'vault-active',
      title: 'Cloud Vault Synchronized',
      description: 'Your expense records are encrypted and isolated in your private cloud vault with offline caching enabled.',
      time: 'Active Vault',
      type: 'info',
      icon: ShieldCheck
    });
  }

  // Calculate unread count
  const unreadNotifications = dynamicNotifications.filter(n => !readIds.includes(n.id));
  const hasUnread = unreadNotifications.length > 0;

  const handleMarkAsRead = (id) => {
    const updated = Array.from(new Set([...readIds, id]));
    setReadIds(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {}
    if (updated.length >= dynamicNotifications.length && onClearUnread) {
      onClearUnread();
    }
  };

  const handleMarkAllRead = () => {
    const allIds = dynamicNotifications.map(n => n.id);
    setReadIds(allIds);
    try {
      localStorage.setItem(storageKey, JSON.stringify(allIds));
      localStorage.setItem('expense_tracker_last_seen_version', APP_VERSION);
    } catch (e) {}
    if (onClearUnread) onClearUnread();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-safe-overlay bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#1A172B] rounded-3xl shadow-2xl p-5 z-10 space-y-4 border border-slate-100 dark:border-white/10 animate-scale-in">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-[#6C47FF] dark:text-[#8B5CF6]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Notifications</h3>
            {hasUnread && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#6C47FF] text-white">
                {unreadNotifications.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-semibold text-[#6C47FF] dark:text-[#A78BFA] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <CheckCheck size={13} />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {dynamicNotifications.length === 0 ? (
            <div className="py-8 text-center space-y-1.5">
              <CheckCircle size={28} className="mx-auto text-emerald-500" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">All caught up!</p>
              <p className="text-[11px] text-slate-400">No active notifications</p>
            </div>
          ) : (
            dynamicNotifications.map((n) => {
              const Icon = n.icon;
              const isRead = readIds.includes(n.id);

              return (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-2xl border transition-all space-y-1.5 ${
                    isRead 
                      ? 'border-slate-100 dark:border-white/5 bg-slate-50/40 dark:bg-white/[0.02] opacity-70' 
                      : 'border-purple-200/60 dark:border-purple-800/40 bg-purple-50/20 dark:bg-purple-950/20 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon
                        size={15}
                        className={
                          n.type === 'update'
                            ? 'text-[#6C47FF] dark:text-[#C084FC]'
                            : n.type === 'success'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : n.type === 'warning'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-[#6C47FF] dark:text-[#8B5CF6]'
                        }
                      />
                      <span className={`text-xs font-bold ${isRead ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                        {n.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-medium">{n.time}</span>
                      {!isRead ? (
                        <button
                          type="button"
                          onClick={() => handleMarkAsRead(n.id)}
                          title="Mark as read"
                          aria-label={`Mark ${n.title} as read`}
                          className="w-5 h-5 rounded-full bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/50 dark:hover:bg-purple-900 text-[#6C47FF] dark:text-[#C084FC] flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Check size={11} strokeWidth={2.5} />
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-0.5">
                          <Check size={10} />
                          <span>Read</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pl-6">
                    {n.description}
                  </p>

                  {n.actionText && n.onAction && (
                    <div className="pl-6 pt-0.5">
                      <button
                        type="button"
                        onClick={n.onAction}
                        className="text-[11px] font-bold text-[#6C47FF] dark:text-[#C084FC] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>{n.actionText}</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
