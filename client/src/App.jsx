import React, { useState, useEffect } from 'react';
import WindowsSidebar from './components/WindowsSidebar';
import WindowsHeader from './components/WindowsHeader';
import Header from './components/Header';
import Navbar from './components/Navbar';
import AndroidHome from './pages/AndroidHome';
import Home from './pages/Home';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import AddExpenseModal from './components/AddExpenseModal';
import NotificationsModal from './components/NotificationsModal';
import OnboardingTourModal from './components/OnboardingTourModal';
import ReleaseNotesModal from './components/ReleaseNotesModal';
import IntelligentImportModal from './components/import/IntelligentImportModal';
import ImportHistoryModal from './components/import/ImportHistoryModal';
import WelcomeGreetingOverlay from './components/WelcomeGreetingOverlay';
import SyncProgressIndicator from './components/SyncProgressIndicator';
import AuthGate from './components/AuthGate';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { FontSizeProvider } from './context/FontSizeContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';
import { ShieldCheck, X, WifiOff, RefreshCw, Download } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import * as api from './services/api';
import syncService from './services/syncService';
import {
  checkForAppUpdates,
  downloadAndStageAppUpdate,
  applyStagedBundleNow,
  openNativeApkDownload
} from './services/appUpdateService';
import { APP_VERSION, APP_CHANGELOG_SUMMARY, APP_SHORT_DATE, APP_RELEASE_TIME } from './constants/version';
import { exportTransactionsToExcel, exportDataToJson } from './services/exportService';
import * as routeService from './services/routeService';
import {
  shouldShowWelcomeGreeting,
  markWelcomeGreetingShown,
  resetSessionGreeting,
  recordSessionActivity
} from './services/welcomeSessionService';
import NotFoundRoute from './components/NotFoundRoute';

function MainApp() {
  const { theme, toggleTheme, isDark } = useTheme();
  const { user, logout, resendVerificationEmail } = useAuth();
  const { showToast } = useToast();

  // Screen size detection for responsive platform presentation
  const [isDesktopScreen, setIsDesktopScreen] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopScreen(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [currentRoute, setCurrentRoute] = useState(() => routeService.parseRoute());
  const [activeTab, setActiveTab] = useState(() => {
    const r = routeService.parseRoute();
    return r.isValid ? r.tab : 'not_found';
  });
  const [settingsSection, setSettingsSection] = useState(() => {
    const r = routeService.parseRoute();
    return r.section || null;
  });
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [availableMonths, setAvailableMonths] = useState([new Date().toISOString().slice(0, 7)]);
  const [dashboardData, setDashboardData] = useState(null);
  const [reportsData, setReportsData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(() => shouldShowWelcomeGreeting(user?.uid));
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(() => {
    try {
      const uId = localStorage.getItem('expense_tracker_current_user_id') || 'guest';
      const readNotifs = localStorage.getItem(`expense_tracker_read_notifs_${uId}`);
      const lastSeen = localStorage.getItem('expense_tracker_last_seen_version');
      if (lastSeen !== APP_VERSION) {
        return true; // Brand new version update notification exists!
      }
      if (readNotifs) {
        const parsed = JSON.parse(readNotifs);
        if (Array.isArray(parsed) && parsed.includes(`app-update-${APP_VERSION}`)) {
          return false;
        }
      }
      return true;
    } catch (e) {
      return true;
    }
  });
  const [isOnboardingTourOpen, setIsOnboardingTourOpen] = useState(false);
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);

  // Notify user whenever a new version / push is deployed (ONCE per version release, never on every refresh)
  useEffect(() => {
    try {
      const lastNotified = localStorage.getItem('expense_tracker_update_toast_version');
      const lastSeen = localStorage.getItem('expense_tracker_last_seen_version');

      // Keep unread notification dot visible if user hasn't visited notifications
      if (lastSeen !== APP_VERSION) {
        setHasUnreadNotifs(true);
      }

        if (lastNotified !== APP_VERSION) {
          localStorage.setItem('expense_tracker_update_toast_version', APP_VERSION);
          const timer = setTimeout(() => {
            showToast(`🚀 App updated to ${APP_VERSION} (${APP_SHORT_DATE}, ${APP_RELEASE_TIME})!`, 'info', 4000);
          }, 3500);
          return () => clearTimeout(timer);
        }
    } catch (e) {}
  }, []);

  // Track user interaction heartbeat to identify extended absence / session return
  useEffect(() => {
    const handleActivity = () => recordSessionActivity();
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, []);

  const handleLogout = async () => {
    resetSessionGreeting();
    if (logout) await logout();
  };

  const [nativeUpdateState, setNativeUpdateState] = useState(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);

  const handleCheckForUpdates = async ({ manual = false } = {}) => {
    try {
      setIsCheckingUpdates(true);
      const result = await checkForAppUpdates({ autoDownload: false });
      setNativeUpdateState(result);
      if (manual) {
        if (result?.status === 'update_available') {
          showToast(`Update v${result.latestVersion} available! Tap Update Now to install.`, 'info', 5000);
        } else if (result?.status === 'ready_to_install') {
          showToast(`Update v${result.stagedVersion} ready! Tap Restart App to apply.`, 'success', 5000);
        } else if (result?.status === 'native_update_required') {
          showToast(`PocketNook v${result.latestVersion} requires a new signed APK.`, 'info', 5000);
        } else if (result?.status === 'up_to_date') {
          showToast(result.message || 'PocketNook is up to date!', 'success');
        } else if (result?.status === 'offline') {
          showToast('Offline — update check skipped.', 'info');
        } else if (result?.error) {
          showToast(result.error, 'warning');
        }
      }
      return result;
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleDownloadAndInstallUpdate = async () => {
    try {
      setIsDownloadingUpdate(true);
      setUpdateProgress(0);
      const result = await downloadAndStageAppUpdate({
        onProgress: (pct) => setUpdateProgress(pct)
      });
      setNativeUpdateState(result);
      if (result?.status === 'ready_to_install') {
        showToast(result.message || 'Update downloaded & verified! Tap Restart to apply.', 'success', 5000);
      } else if (result?.status === 'web_update_available') {
        showToast(result.message, 'info', 4000);
      } else if (result?.error) {
        showToast(result.error, 'warning', 5000);
      }
      return result;
    } finally {
      setIsDownloadingUpdate(false);
    }
  };

  // Native Capacitor Android status bar, SystemBars style sync, splash hide, and update check
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    SplashScreen.hide().catch(() => {});
    handleCheckForUpdates({ manual: false }).catch(() => {});

    let stateSub = null;
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && navigator.onLine) {
        checkForAppUpdates({ autoDownload: false }).then(setNativeUpdateState).catch(() => {});
      }
    }).then((h) => { stateSub = h; }).catch(() => {});

    return () => {
      stateSub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const style = isDark ? 'DARK' : 'LIGHT';
    StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: isDark ? '#0d0b18' : '#f4f5fa' }).catch(() => {});
    try {
      Capacitor.Plugins?.SystemBars?.setStyle?.({ style }).catch?.(() => {});
    } catch {}
  }, [isDark]);

  // Wipe sensitive in-memory financial state immediately on logout / account switch
  useEffect(() => {
    const handleClearInMemoryState = () => {
      setDashboardData(null);
      setReportsData(null);
      setCategories([]);
      setAvailableMonths([new Date().toISOString().slice(0, 7)]);
      setSettings({
        monthly_budget: '12000',
        currency: '₹',
        user_name: 'User',
        user_email: ''
      });
    };
    window.addEventListener('expense_tracker_logout', handleClearInMemoryState);
    return () => window.removeEventListener('expense_tracker_logout', handleClearInMemoryState);
  }, []);



  // Live Sync & Network State
  const [syncState, setSyncState] = useState(() => {
    return syncService.getState ? syncService.getState() : { status: 'synced', isOnline: true };
  });

  useEffect(() => {
    if (syncService.subscribe) {
      const unsub = syncService.subscribe((state) => {
        setSyncState(state);
      });
      return () => unsub();
    }
  }, []);

  useEffect(() => {
    const handleSyncRefresh = () => {
      handleRefreshAll();
    };
    const handleLocalUpdate = () => {
      loadMonthData(selectedMonth);
    };
    window.addEventListener('expense_tracker_synced', handleSyncRefresh);
    window.addEventListener('expense_tracker_updated', handleLocalUpdate);
    return () => {
      window.removeEventListener('expense_tracker_synced', handleSyncRefresh);
      window.removeEventListener('expense_tracker_updated', handleLocalUpdate);
    };
  }, [selectedMonth]);

  const cleanUserEmail = (user?.email || '').toLowerCase();
  const isEmailVerified = Boolean(
    user?.emailVerified ||
    user?.isGoogleUser ||
    cleanUserEmail === 'raaajshinde@gmail.com' ||
    (cleanUserEmail && typeof window !== 'undefined' && localStorage.getItem(`et_email_verified_${cleanUserEmail}`) === 'true')
  );

  const [dismissedEmailBanner, setDismissedEmailBanner] = useState(() => {
    if (typeof window === 'undefined') return false;
    const clean = (user?.email || '').toLowerCase();
    return localStorage.getItem(`et_dismiss_verify_banner_${clean}`) === 'true' || sessionStorage.getItem('et_dismiss_verify_banner') === 'true';
  });

  const handleDismissEmailBanner = () => {
    setDismissedEmailBanner(true);
    if (typeof window !== 'undefined') {
      const clean = (user?.email || '').toLowerCase();
      if (clean) localStorage.setItem(`et_dismiss_verify_banner_${clean}`, 'true');
      sessionStorage.setItem('et_dismiss_verify_banner', 'true');
    }
  };

  const [settings, setSettings] = useState({
    monthly_budget: '12000',
    currency: '₹',
    user_name: user?.name || (user?.email ? user.email.split('@')[0] : 'User'),
    user_email: user?.email || ''
  });

  useEffect(() => {
    if (user) {
      setSettings(prev => ({
        ...prev,
        user_name: user.name || (user.email ? user.email.split('@')[0] : 'User'),
        user_email: user.email || ''
      }));
    }
  }, [user]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportHistoryOpen, setIsImportHistoryOpen] = useState(false);
  const [reportsActiveTab, setReportsActiveTab] = useState(() => {
    const r = routeService.parseRoute();
    return r.reportsTab || 'overview';
  });
  const [settingsSearch, setSettingsSearch] = useState('');

  const handleNavigate = (newRoute, replace = false) => {
    const tab = newRoute.tab || 'home';
    const section = newRoute.section !== undefined ? newRoute.section : null;
    const repTab = newRoute.reportsTab || reportsActiveTab || 'overview';

    setActiveTab(tab);
    setSettingsSection(section);
    if (newRoute.reportsTab) {
      setReportsActiveTab(newRoute.reportsTab);
    }
    setCurrentRoute({ tab, section, reportsTab: repTab, isValid: true });
    routeService.syncRouteToUrl({ tab, section, reportsTab: repTab }, replace);
  };

  const handleReportsTabChange = (newRepTab) => {
    setReportsActiveTab(newRepTab);
    routeService.syncRouteToUrl({ tab: 'reports', section: null, reportsTab: newRepTab }, true);
  };

  const handleExportExcel = async () => {
    try {
      let txs = api.getLocalTransactions();
      const remote = await api.getTransactions({
        month: selectedMonth && selectedMonth !== 'all' ? selectedMonth : undefined,
        limit: 10000
      });
      if (remote?.transactions?.length > 0) {
        txs = remote.transactions;
      }
      await exportTransactionsToExcel(txs, `Expenses_${selectedMonth || 'all'}.xlsx`);
      showToast('Excel ledger exported successfully!', 'success');
    } catch (e) {
      console.error('Export Excel failed:', e);
      showToast('Excel export failed', 'error');
    }
  };

  const handleExportJson = async () => {
    try {
      const data = await api.getTransactions({
        month: selectedMonth && selectedMonth !== 'all' ? selectedMonth : undefined,
        limit: 10000
      });
      await exportDataToJson(
        { exported_at: new Date().toISOString(), month: selectedMonth || 'all', categories, transactions: data?.transactions || api.getLocalTransactions() },
        `Expenses_${selectedMonth || 'all'}.json`
      );
      showToast('JSON backup exported successfully!', 'success');
    } catch (e) {
      console.error('Export JSON failed:', e);
      showToast('JSON backup failed', 'error');
    }
  };

  // URL routing, Browser History (Back / Forward) and Native Modal Dismissal handler
  useEffect(() => {
    // Initial canonical sync
    const initial = routeService.parseRoute();
    if (initial.isValid) {
      routeService.syncRouteToUrl(initial, true);
    }

    const handleLocationChange = () => {
      // 1. Dismiss active modals on back navigation if open
      if (isAddModalOpen) {
        setIsAddModalOpen(false);
        setEditingTransaction(null);
        return;
      }
      if (isImportModalOpen) {
        setIsImportModalOpen(false);
        return;
      }
      if (isImportHistoryOpen) {
        setIsImportHistoryOpen(false);
        return;
      }
      if (isNotificationsOpen) {
        setIsNotificationsOpen(false);
        return;
      }
      if (isReleaseNotesOpen) {
        setIsReleaseNotesOpen(false);
        return;
      }
      if (isOnboardingTourOpen) {
        setIsOnboardingTourOpen(false);
        return;
      }

      // 2. Synchronize route state with new URL
      const parsed = routeService.parseRoute();
      setCurrentRoute(parsed);
      if (parsed.isValid) {
        setActiveTab(parsed.tab);
        setSettingsSection(parsed.section);
        if (parsed.reportsTab) {
          setReportsActiveTab(parsed.reportsTab);
        }
      } else {
        setActiveTab('not_found');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    let lastBackPress = 0;
    let backSub = null;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', () => {
        if (isAddModalOpen) { setIsAddModalOpen(false); setEditingTransaction(null); return; }
        if (isImportModalOpen) { setIsImportModalOpen(false); return; }
        if (isImportHistoryOpen) { setIsImportHistoryOpen(false); return; }
        if (isNotificationsOpen) { setIsNotificationsOpen(false); return; }
        if (isReleaseNotesOpen) { setIsReleaseNotesOpen(false); return; }
        if (isOnboardingTourOpen) { setIsOnboardingTourOpen(false); return; }
        if (activeTab === 'settings' && settingsSection) {
          handleNavigate({ tab: 'settings', section: null });
          return;
        }
        if (activeTab !== 'home') {
          handleNavigate({ tab: 'home', section: null });
          return;
        }
        const now = Date.now();
        if (now - lastBackPress < 2000) {
          CapacitorApp.exitApp().catch(() => {});
        } else {
          lastBackPress = now;
          showToast('Press back again to exit PocketNook', 'info', 2000);
        }
      }).then((h) => { backSub = h; }).catch(() => {});
    }

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
      backSub?.remove?.();
    };
  }, [isAddModalOpen, isImportModalOpen, isImportHistoryOpen, isNotificationsOpen, isReleaseNotesOpen, isOnboardingTourOpen, activeTab, settingsSection]);

  const openAddModal = (tx = null) => {
    setEditingTransaction(tx);
    setIsAddModalOpen(true);
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ modal: 'add' }, '');
    }
  };

  const openNotificationsModal = () => {
    setIsNotificationsOpen(true);
    setHasUnreadNotifs(false);
    try {
      localStorage.setItem('expense_tracker_last_seen_version', APP_VERSION);
    } catch (e) {}
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ modal: 'notifications' }, '');
    }
  };

  const openReleaseNotesModal = () => {
    setIsReleaseNotesOpen(true);
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ modal: 'releaseNotes' }, '');
    }
  };

  const handleResendVerification = async () => {
    try {
      if (resendVerificationEmail) {
        await resendVerificationEmail();
      }
      showToast('Verification email sent! Please check your inbox and spam folder.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to send verification email', 'error');
    }
  };

  // Load initial data
  const loadInitialData = async () => {
    try {
      const [cats, sett] = await Promise.all([
        api.getCategories(),
        api.getSettings()
      ]);
      setCategories(cats);
      const isRaj = user?.email?.toLowerCase() === 'raaajshinde@gmail.com';
      const rawBudget = sett.monthly_budget !== undefined && sett.monthly_budget !== null && sett.monthly_budget !== '' 
        ? String(sett.monthly_budget) 
        : (isRaj ? '12000' : '12000');
      const updatedSettings = {
        monthly_budget: rawBudget,
        currency: sett.currency || '₹',
        user_name: user?.name || sett.user_name || (user?.email ? user.email.split('@')[0] : 'User'),
        user_email: user?.email || sett.user_email || ''
      };
      setSettings(updatedSettings);

      // First-time onboarding tour check for new accounts
      const tourKey = 'et_tour_completed_' + (user?.uid || user?.email || 'guest');
      const alreadySeen = localStorage.getItem(tourKey) === 'true';
      const budgetZero = (parseFloat(updatedSettings.monthly_budget) || 0) === 0;

      if (!isRaj && !alreadySeen && (budgetZero || !sett.onboarding_completed)) {
        setIsOnboardingTourOpen(true);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  };

  // Load monthly dashboard & reports data
  const loadMonthData = async (month) => {
    try {
      const [dash, rep] = await Promise.all([
        api.getDashboard(month),
        api.getReports(month)
      ]);
      setDashboardData(dash);
      setReportsData(rep);
      if (dash.available_months && dash.available_months.length > 0) {
        setAvailableMonths(dash.available_months);
      }
      if (dash && dash.budget !== undefined && Number(dash.budget) > 0) {
        setSettings(prev => ({
          ...prev,
          monthly_budget: String(dash.budget)
        }));
      }
    } catch (err) {
      console.error('Error loading month data:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [user]);

  useEffect(() => {
    loadMonthData(selectedMonth);
  }, [selectedMonth]);

  const handleRefreshAll = () => {
    loadInitialData();
    loadMonthData(selectedMonth);
  };

  const handleSidebarTabChange = (tabId) => {
    if (tabId === 'categories') {
      handleNavigate({ tab: 'settings', section: 'categories' });
    } else if (tabId === 'budget') {
      handleNavigate({ tab: 'settings', section: 'budget' });
    } else if (tabId === 'import_export') {
      setIsImportModalOpen(true);
    } else if (tabId === 'backup_restore') {
      handleNavigate({ tab: 'settings', section: 'data' });
    } else if (tabId === 'settings') {
      handleNavigate({ tab: 'settings', section: null });
    } else {
      handleNavigate({ tab: tabId, section: null });
    }
  };

  // Currency formatter
  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    const formatted = Math.abs(num).toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
    const curr = settings.currency || '₹';
    return num < 0 ? `-${curr}${formatted}` : `${curr}${formatted}`;
  };

  const handleSaveTransaction = async (data) => {
    try {
      if (data.id) {
        await api.updateTransaction(data.id, data);
        showToast('Expense updated successfully!', 'success');
      } else {
        await api.createTransaction(data);
        showToast('Expense added successfully!', 'success');
      }
    } catch (err) {
      console.warn('Direct API save error, retained in sync queue:', err);
      showToast('Saved offline. Will synchronize when online.', 'info');
    }
    handleRefreshAll();
  };

  const handleDeleteTransaction = async (id) => {
    try {
      await api.deleteTransaction(id);
      // Silently refresh month data (dashboard & reports) in background without screen reload
      loadMonthData(selectedMonth);
    } catch (err) {
      console.warn('Delete transaction error:', err);
      throw err; // Allow caller (Transactions.jsx) to catch and rollback state
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors flex flex-col font-sans">
      {/* ========================================================
          1. WINDOWS DESKTOP DASHBOARD (>= 1024px)
          Strictly following Purple Expense Tracker Dashboard.png
         ======================================================== */}
      {isDesktopScreen ? (
        <div className="flex-1 flex overflow-hidden h-screen">
          {/* Left Windows Sidebar with 9 navigation items and Raj Shinde profile footer */}
          <div className="flex-shrink-0">
            <WindowsSidebar
              activeTab={activeTab === 'settings' ? settingsSection : activeTab}
              onTabChange={handleSidebarTabChange}
              onOpenAddExpense={() => openAddModal(null)}
              userName={settings.user_name || user?.name || 'User'}
              userEmail={settings.user_email || user?.email || ''}
              onLogout={handleLogout}
              onOpenReleaseNotes={() => setIsReleaseNotesOpen(true)}
            />
          </div>

          {/* Main Desktop Work Area */}
          <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
            {/* Real-time Offline / Syncing Progress Indicator (Desktop) */}
            <SyncProgressIndicator syncState={syncState} isDesktop={true} />

            {/* Unverified Email Warning Banner (Desktop) */}
            {user && !isEmailVerified && !dismissedEmailBanner && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-4 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <ShieldCheck size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <span className="font-medium truncate">
                    Please verify your email ({user.email}). Email verification helps confirm you own this address, protects your account, and enables password recovery.
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className="font-bold text-[#6C47FF] dark:text-[#A78BFA] hover:underline cursor-pointer"
                  >
                    Resend Email
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissEmailBanner}
                    aria-label="Dismiss verification notification"
                    title="Dismiss for this session"
                    className="p-1 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* Windows Header Bar (Matching Purple Expense Tracker Dashboard.png) */}
            <div className="px-5 sm:px-7 pt-5">
              <WindowsHeader
                userName={settings.user_name || user?.name || 'User'}
                userEmail={settings.user_email || user?.email || ''}
                selectedMonth={selectedMonth}
                availableMonths={availableMonths}
                onSelectMonth={setSelectedMonth}
                onOpenNotifications={openNotificationsModal}
                onOpenProfile={() => {
                  handleNavigate({ tab: 'settings', section: 'profile' });
                }}
                onLogout={handleLogout}
                hasUnreadNotifications={hasUnreadNotifs}
                onRefresh={handleRefreshAll}
                activeTab={activeTab}
                authProvider={user?.providerId || 'password'}
                emailVerified={Boolean(user?.emailVerified || user?.isGoogleUser)}
                onResendVerification={handleResendVerification}
              />
            </div>

            {/* Main Desktop Views */}
            <main className="flex-1 px-5 sm:px-7 py-4 pb-8">
              <div key={activeTab} className="page-enter">
                {activeTab === 'home' && (
                <Home
                  dashboardData={dashboardData}
                  reportsData={reportsData}
                  categories={categories}
                  selectedMonth={selectedMonth}
                  availableMonths={availableMonths}
                  onOpenAddExpense={() => openAddModal(null)}
                  onQuickAddExpense={handleSaveTransaction}
                  onViewAllCategories={() => {
                    handleNavigate({ tab: 'settings', section: 'categories' });
                  }}
                  onViewAllTransactions={() => handleNavigate({ tab: 'transactions' })}
                  onSetBudget={() => {
                    handleNavigate({ tab: 'settings', section: 'budget' });
                  }}
                  formatCurrency={formatCurrency}
                  onSelectMonth={setSelectedMonth}
                />
              )}

              {activeTab === 'transactions' && (
                <Transactions
                  selectedMonth={selectedMonth}
                  categories={categories}
                  availableMonths={availableMonths}
                  onEditTransaction={(tx) => openAddModal(tx)}
                  onDeleteTransaction={handleDeleteTransaction}
                  formatCurrency={formatCurrency}
                  onSelectMonth={setSelectedMonth}
                  onOpenImport={() => setIsImportModalOpen(true)}
                />
              )}

              {activeTab === 'reports' && (
                <Reports
                  reportsData={reportsData}
                  selectedMonth={selectedMonth}
                  availableMonths={availableMonths}
                  onSelectMonth={setSelectedMonth}
                  formatCurrency={formatCurrency}
                  activeTab={reportsActiveTab}
                  onTabChange={handleReportsTabChange}
                  isMobileScreen={false}
                />
              )}

              {activeTab === 'settings' && (
                <Settings
                  settings={settings}
                  categories={categories}
                  initialSection={settingsSection}
                  isDesktopScreen={true}
                  selectedMonth={selectedMonth}
                  availableMonths={availableMonths}
                  onLogout={handleLogout}
                  onOpenTour={() => setIsOnboardingTourOpen(true)}
                  onOpenReleaseNotes={openReleaseNotesModal}
                  onSectionChange={(sec) => handleNavigate({ tab: 'settings', section: sec }, true)}
                  settingsSearch={settingsSearch}
                  setSettingsSearch={setSettingsSearch}
                  onUpdateSettings={async (data) => {
                    const updated = await api.updateSettings(data);
                    setSettings(prev => ({ ...prev, ...updated }));
                    if (data.user_name) {
                      setUser(prev => prev ? ({ ...prev, name: data.user_name, displayName: data.user_name }) : prev);
                    }
                    showToast('Settings saved successfully', 'success');
                  }}
                  onUpdateBudget={async (month, budget) => {
                    await api.updateBudget(month, budget);
                    loadMonthData(selectedMonth);
                    showToast(`Monthly budget set to ${formatCurrency(budget)}`, 'success');
                  }}
                  onAddCategory={async (cat) => {
                    await api.createCategory(cat);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast(`Category "${cat.name}" added successfully`, 'success');
                  }}
                  onUpdateCategory={async (id, data) => {
                    await api.updateCategory(id, data);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast(`Category updated successfully`, 'success');
                  }}
                  onArchiveCategory={async (id) => {
                    await api.archiveCategory(id);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast('Category archived', 'info');
                  }}
                  onRestoreCategory={async (id) => {
                    await api.restoreCategory(id);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast('Category restored', 'success');
                  }}
                  onReassignCategory={async (oldCatName, newCatName, categoryIdToDelete) => {
                    const reassigned = await api.reassignCategoryTransactions(oldCatName, newCatName);
                    if (categoryIdToDelete) {
                      await api.deleteCategory(categoryIdToDelete);
                    }
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    handleRefreshAll();
                    showToast(`Reassigned ${reassigned} transactions to "${newCatName}" and removed category`, 'success');
                  }}
                  onDeleteCategory={async (id) => {
                    await api.deleteCategory(id);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast('Category deleted', 'info');
                  }}
                  onImportFile={api.importExcelOrCsv}
                  onRestoreBackup={api.restoreBackup}
                  onExportExcel={handleExportExcel}
                  onExportJson={handleExportJson}
                  nativeUpdateState={nativeUpdateState}
                  isCheckingUpdates={isCheckingUpdates}
                  isDownloadingUpdate={isDownloadingUpdate}
                  updateProgress={updateProgress}
                  onCheckUpdates={() => handleCheckForUpdates({ manual: true })}
                  onDownloadUpdate={handleDownloadAndInstallUpdate}
                  onApplyUpdate={async () => {
                    if (nativeUpdateState?.stagedBundleId) {
                      await applyStagedBundleNow(nativeUpdateState.stagedBundleId);
                    }
                  }}
                  onDownloadNativeApk={() => openNativeApkDownload(nativeUpdateState?.apkUrl)}
                  onRefreshAll={handleRefreshAll}
                  onOpenImport={() => setIsImportModalOpen(true)}
                  onOpenImportHistory={() => setIsImportHistoryOpen(true)}
                  onOpenNotifications={() => setIsNotificationsOpen(true)}
                  hasUnreadNotifs={hasUnreadNotifs}
                  formatCurrency={formatCurrency}
                  selectedMonth={selectedMonth}
                />
              )}

              {activeTab === 'not_found' && (
                <NotFoundRoute
                  rawPath={currentRoute?.rawPath}
                  onGoHome={() => handleNavigate({ tab: 'home' })}
                />
              )}
              </div>
            </main>
          </div>
        </div>
      ) : (
        /* ========================================================
           2. ANDROID MOBILE EDITION (< 1024px)
           Strictly following Modern Purple Expense Tracker UI.png
           ======================================================== */
        <div className="w-full max-w-lg mx-auto min-h-dvh bg-[var(--bg-app)] flex flex-col relative transition-colors">
          {/* Global Android Edge-to-Edge Status Bar Safe-Area Cap (WhatsApp-style top clearance + scroll shield) */}
          <div
            aria-hidden="true"
            data-testid="android-status-bar-shield"
            className="sticky top-0 z-40 w-full bg-[var(--bg-app)]/95 backdrop-blur-md shrink-0 transition-colors"
            style={{ height: 'var(--pn-safe-top)' }}
          />

          {/* Real-time Offline / Syncing Progress Indicator (Mobile) */}
          <SyncProgressIndicator syncState={syncState} isDesktop={false} />

          {/* Native Android Update Prompt Banner */}
          {Capacitor.isNativePlatform() && (
            nativeUpdateState?.status === 'update_available' ||
            nativeUpdateState?.status === 'downloading' ||
            nativeUpdateState?.status === 'ready_to_install' ||
            nativeUpdateState?.status === 'native_update_required'
          ) && (
            <div className="bg-purple-500/10 border-b border-purple-500/20 px-4 py-2 text-xs text-purple-900 dark:text-purple-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Download size={14} className="text-[#6C47FF] dark:text-[#C4B5FD] shrink-0" />
                <span className="truncate font-semibold">
                  {nativeUpdateState.status === 'ready_to_install'
                    ? `Update v${nativeUpdateState.stagedVersion} verified & ready`
                    : nativeUpdateState.status === 'downloading' || isDownloadingUpdate
                      ? `Downloading update (${updateProgress}%)...`
                      : nativeUpdateState.status === 'update_available'
                        ? `Update v${nativeUpdateState.latestVersion} available`
                        : `New Android APK v${nativeUpdateState.latestVersion} available`}
                </span>
              </div>
              <button
                type="button"
                disabled={isDownloadingUpdate}
                onClick={async () => {
                  if (nativeUpdateState.status === 'ready_to_install' && nativeUpdateState.stagedBundleId) {
                    await applyStagedBundleNow(nativeUpdateState.stagedBundleId);
                  } else if (nativeUpdateState.status === 'update_available') {
                    await handleDownloadAndInstallUpdate();
                  } else {
                    await openNativeApkDownload(nativeUpdateState.apkUrl);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-[#6C47FF] disabled:opacity-60 text-white font-bold text-[11px] shrink-0 cursor-pointer"
              >
                {nativeUpdateState.status === 'ready_to_install'
                  ? 'Restart & Apply'
                  : nativeUpdateState.status === 'downloading' || isDownloadingUpdate
                    ? `${updateProgress}%`
                    : nativeUpdateState.status === 'update_available'
                      ? 'Update Now'
                      : 'Download APK'}
              </button>
            </div>
          )}

          {/* Unverified Email Warning Banner (Mobile) */}
          {user && !isEmailVerified && !dismissedEmailBanner && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2 transition-colors">
              <div className="flex-1 min-w-0 pr-1">
                <span className="font-semibold block truncate">Please verify your email ({user.email})</span>
                <span className="text-[10px] text-amber-700 dark:text-amber-400/90 line-clamp-1">Protects your account &amp; enables password recovery</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  className="font-bold text-[#6C47FF] dark:text-[#A78BFA] hover:underline cursor-pointer text-[11px]"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={handleDismissEmailBanner}
                  aria-label="Dismiss verification notification"
                  title="Dismiss for this session"
                  className="p-1 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Android Mobile Header */}
          <Header
            userName={settings.user_name || user?.name || 'User'}
            userEmail={settings.user_email || user?.email || ''}
            selectedMonth={selectedMonth}
            availableMonths={availableMonths}
            onSelectMonth={setSelectedMonth}
            onOpenNotifications={openNotificationsModal}
            onOpenProfile={() => {
              handleNavigate({ tab: 'settings', section: 'profile' });
            }}
            onLogout={handleLogout}
            hasUnreadNotifications={hasUnreadNotifs}
            activeTab={activeTab}
            authProvider={user?.providerId || 'password'}
            emailVerified={Boolean(user?.emailVerified || user?.isGoogleUser)}
            onResendVerification={handleResendVerification}
            onOpenImport={() => setIsImportModalOpen(true)}
            onExportExcel={handleExportExcel}
            onExportJson={handleExportJson}
            reportsActiveTab={reportsActiveTab}
            onSelectReportsTab={handleReportsTabChange}
            settingsSearch={settingsSearch}
            onSettingsSearchChange={setSettingsSearch}
          />

          {/* Android Mobile Main Tabs */}
          <main className="flex-1 pb-safe-main">
            <div key={activeTab} className="page-enter">
              {activeTab === 'home' && (
              <AndroidHome
                dashboardData={dashboardData}
                categories={categories}
                onOpenAddExpense={() => openAddModal(null)}
                onQuickAddExpense={handleSaveTransaction}
                onEditTransaction={(tx) => openAddModal(tx)}
                onViewAllCategories={() => {
                  handleNavigate({ tab: 'settings', section: 'categories' });
                }}
                onViewAllTransactions={() => handleNavigate({ tab: 'transactions' })}
                onSetBudget={() => {
                  handleNavigate({ tab: 'settings', section: 'budget' });
                }}
                formatCurrency={formatCurrency}
              />
            )}

            {activeTab === 'transactions' && (
              <div className="px-3">
                <Transactions
                  selectedMonth={selectedMonth}
                  categories={categories}
                  availableMonths={availableMonths}
                  onEditTransaction={(tx) => openAddModal(tx)}
                  onDeleteTransaction={handleDeleteTransaction}
                  formatCurrency={formatCurrency}
                  onSelectMonth={setSelectedMonth}
                  onOpenImport={() => setIsImportModalOpen(true)}
                  isMobileScreen={true}
                />
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="px-3">
                <Reports
                  reportsData={reportsData}
                  selectedMonth={selectedMonth}
                  availableMonths={availableMonths}
                  onSelectMonth={setSelectedMonth}
                  formatCurrency={formatCurrency}
                  activeTab={reportsActiveTab}
                  onTabChange={handleReportsTabChange}
                  isMobileScreen={true}
                />
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="px-3">
                <Settings
                  settings={settings}
                  categories={categories}
                  initialSection={settingsSection}
                  isDesktopScreen={false}
                  selectedMonth={selectedMonth}
                  availableMonths={availableMonths}
                  onLogout={handleLogout}
                  onOpenTour={() => setIsOnboardingTourOpen(true)}
                  onOpenReleaseNotes={openReleaseNotesModal}
                  onSectionChange={(sec) => handleNavigate({ tab: 'settings', section: sec }, true)}
                  settingsSearch={settingsSearch}
                  setSettingsSearch={setSettingsSearch}
                  onUpdateSettings={async (data) => {
                    const updated = await api.updateSettings(data);
                    setSettings(prev => ({ ...prev, ...updated }));
                    if (data.user_name) {
                      setUser(prev => prev ? ({ ...prev, name: data.user_name, displayName: data.user_name }) : prev);
                    }
                    showToast('Settings saved successfully', 'success');
                  }}
                  onUpdateBudget={async (month, budget) => {
                    await api.updateBudget(month, budget);
                    loadMonthData(selectedMonth);
                    showToast(`Monthly budget set to ${formatCurrency(budget)}`, 'success');
                  }}
                  onAddCategory={async (cat) => {
                    await api.createCategory(cat);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast(`Category "${cat.name}" added successfully`, 'success');
                  }}
                  onUpdateCategory={async (id, data) => {
                    await api.updateCategory(id, data);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast(`Category updated successfully`, 'success');
                  }}
                  onArchiveCategory={async (id) => {
                    await api.archiveCategory(id);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast('Category archived', 'info');
                  }}
                  onRestoreCategory={async (id) => {
                    await api.restoreCategory(id);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast('Category restored', 'success');
                  }}
                  onReassignCategory={async (oldCatName, newCatName, categoryIdToDelete) => {
                    const reassigned = await api.reassignCategoryTransactions(oldCatName, newCatName);
                    if (categoryIdToDelete) {
                      await api.deleteCategory(categoryIdToDelete);
                    }
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    handleRefreshAll();
                    showToast(`Reassigned ${reassigned} transactions to "${newCatName}" and removed category`, 'success');
                  }}
                  onDeleteCategory={async (id) => {
                    await api.deleteCategory(id);
                    const updatedCats = await api.getCategories();
                    setCategories(updatedCats);
                    showToast('Category deleted', 'info');
                  }}
                  onImportFile={api.importExcelOrCsv}
                  onRestoreBackup={api.restoreBackup}
                  onExportExcel={handleExportExcel}
                  onExportJson={handleExportJson}
                  nativeUpdateState={nativeUpdateState}
                  isCheckingUpdates={isCheckingUpdates}
                  isDownloadingUpdate={isDownloadingUpdate}
                  updateProgress={updateProgress}
                  onCheckUpdates={() => handleCheckForUpdates({ manual: true })}
                  onDownloadUpdate={handleDownloadAndInstallUpdate}
                  onApplyUpdate={async () => {
                    if (nativeUpdateState?.stagedBundleId) {
                      await applyStagedBundleNow(nativeUpdateState.stagedBundleId);
                    }
                  }}
                  onDownloadNativeApk={() => openNativeApkDownload(nativeUpdateState?.apkUrl)}
                  onRefreshAll={handleRefreshAll}
                  onOpenImport={() => setIsImportModalOpen(true)}
                  onOpenImportHistory={() => setIsImportHistoryOpen(true)}
                  onOpenNotifications={() => setIsNotificationsOpen(true)}
                  hasUnreadNotifs={hasUnreadNotifs}
                  formatCurrency={formatCurrency}
                  selectedMonth={selectedMonth}
                />
              </div>
            )}

            {activeTab === 'not_found' && (
              <div className="px-3">
                <NotFoundRoute
                  rawPath={currentRoute?.rawPath}
                  onGoHome={() => handleNavigate({ tab: 'home' })}
                />
              </div>
            )}
            </div>
          </main>

          {/* Android Mobile Bottom Navigation Bar with Center FAB */}
          <Navbar
            activeTab={activeTab === 'not_found' ? 'home' : activeTab}
            onTabChange={(tab) => {
              handleNavigate({ tab, section: null });
            }}
            onOpenAddExpense={() => openAddModal(null)}
          />
        </div>
      )}

      {/* Global Add / Edit Expense Modal */}
      <AddExpenseModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingTransaction(null);
        }}
        onSave={handleSaveTransaction}
        categories={categories}
        editingTransaction={editingTransaction}
        initialDate={dashboardData?.today_date || new Date().toISOString().slice(0, 10)}
        onSaveAnotherSuccess={() => showToast('Expense saved! Ready for next.', 'success')}
        currency={settings?.currency || '₹'}
      />

      {/* Global Notifications Modal */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        dashboardData={dashboardData}
        formatCurrency={formatCurrency}
        onClearUnread={() => setHasUnreadNotifs(false)}
        onOpenReleaseNotes={openReleaseNotesModal}
      />

      {/* Release Notes Modal (v1.1.0) */}
      <ReleaseNotesModal
        isOpen={isReleaseNotesOpen}
        onClose={() => setIsReleaseNotesOpen(false)}
      />

      {/* First-Time User Guided Tour & Onboarding Modal */}
      <OnboardingTourModal
        isOpen={isOnboardingTourOpen}
        onClose={() => {
          setIsOnboardingTourOpen(false);
          const tourKey = 'et_tour_completed_' + (user?.uid || user?.email || 'guest');
          localStorage.setItem(tourKey, 'true');
        }}
        onSaveBudget={async (numericBudget) => {
          await api.updateBudget(selectedMonth, numericBudget);
          setSettings(prev => ({ ...prev, monthly_budget: String(numericBudget) }));
          const tourKey = 'et_tour_completed_' + (user?.uid || user?.email || 'guest');
          localStorage.setItem(tourKey, 'true');
          loadMonthData(selectedMonth);
          showToast(`Monthly budget set to ${formatCurrency(numericBudget)}!`, 'success');
        }}
        currency={settings.currency || '₹'}
        userName={settings.user_name || 'User'}
      />

      {/* Intelligent Expense Import Modal (Excel, CSV, Bank Statements) */}
      <IntelligentImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        userCategories={categories}
        formatCurrency={formatCurrency}
        onImportComplete={(result) => {
          if (result && result.affectedMonths && result.affectedMonths.length > 0) {
            setAvailableMonths(prev => {
              const combined = Array.from(new Set([...prev, ...result.affectedMonths]));
              return combined.sort().reverse();
            });
            if (result.latestMonth) {
              setSelectedMonth(result.latestMonth);
            }
          }
          handleRefreshAll();
          showToast(`Imported ${result?.importedCount || 'transactions'} successfully!`, 'success');
        }}
      />

      {/* Import History & 1-Click Safe Undo Modal */}
      <ImportHistoryModal
        isOpen={isImportHistoryOpen}
        onClose={() => setIsImportHistoryOpen(false)}
        onUndoComplete={() => {
          handleRefreshAll();
          showToast('Import batch reverted successfully!', 'info');
        }}
      />
      {/* User's Custom Welcome Back Motivational Overlay */}
      {showWelcomeOverlay && (
        <WelcomeGreetingOverlay
          userName={user?.displayName || user?.name || settings?.user_name || (user?.email ? user.email.split('@')[0] : 'Raj')}
          onDismiss={() => {
            markWelcomeGreetingShown();
            setShowWelcomeOverlay(false);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FontSizeProvider>
        <AuthProvider>
          <LanguageProvider>
            <AuthGate>
              <ToastProvider>
                <MainApp />
              </ToastProvider>
            </AuthGate>
          </LanguageProvider>
        </AuthProvider>
      </FontSizeProvider>
    </ThemeProvider>
  );
}
