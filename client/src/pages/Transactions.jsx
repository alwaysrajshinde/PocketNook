import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Filter, Calendar, Edit2, Trash2, ArrowDownLeft, ArrowUpRight,
  ChevronLeft, ChevronRight, ChevronDown, X, AlertCircle, FileSpreadsheet, Download, Upload
} from 'lucide-react';
import CategoryIcon from '../components/CategoryIcon';
import CustomDropdown from '../components/CustomDropdown';
import { getTransactions, getCurrentUserEmail } from '../services/api';
import { exportTransactionsToExcel, exportDataToJson } from '../services/exportService';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

export default function Transactions({
  selectedMonth,
  categories = [],
  availableMonths = [],
  onEditTransaction,
  onDeleteTransaction,
  formatCurrency,
  onSelectMonth,
  onOpenImport,
  isMobileScreen = false
}) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [transactionsData, setTransactionsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState(selectedMonth || 'all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (selectedMonth && selectedMonth !== monthFilter) {
      setMonthFilter(selectedMonth);
      setPage(1);
    }
  }, [selectedMonth]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const recentlyDeletedRef = useRef(new Set());

  const loadTransactions = async (background = false) => {
    try {
      if (!background) setLoading(true);
      const data = await getTransactions({
        month: monthFilter && monthFilter !== 'all' ? monthFilter : undefined,
        category: categoryFilter && categoryFilter !== 'all' ? categoryFilter : undefined,
        payment_mode: paymentFilter && paymentFilter !== 'all' ? paymentFilter : undefined,
        search: debouncedSearch || undefined,
        page,
        limit: 40
      });
      if (data) {
        // Filter out any recently deleted records to prevent in-flight resurrection / shuffle
        if (Array.isArray(data.transactions)) {
          data.transactions = data.transactions.filter(t => !recentlyDeletedRef.current.has(String(t.id)));
        }
        if (Array.isArray(data.grouped)) {
          data.grouped = data.grouped.map(group => ({
            ...group,
            transactions: (group.transactions || []).filter(t => !recentlyDeletedRef.current.has(String(t.id)))
          })).filter(group => group.transactions.length > 0);
        }
        setTransactionsData(data);
      }
    } catch (err) {
      console.error('Error loading transactions:', err);
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    setMonthFilter(selectedMonth || 'all');
    setPage(1);
  }, [selectedMonth]);

  useEffect(() => {
    loadTransactions();
  }, [monthFilter, categoryFilter, paymentFilter, debouncedSearch, page]);

  // Listen for local/offline updates from other components
  useEffect(() => {
    const handleLocalUpdate = (e) => {
      // If update was triggered by our own in-flight deletion, avoid re-fetch shuffle
      if (e?.detail?.action === 'delete') {
        return;
      }
      loadTransactions(true);
    };
    window.addEventListener('expense_tracker_updated', handleLocalUpdate);
    return () => window.removeEventListener('expense_tracker_updated', handleLocalUpdate);
  }, [monthFilter, categoryFilter, paymentFilter, debouncedSearch, page]);

  const handleDelete = async (id) => {
    if (deletingId) return; // Prevent duplicate clicks
    const prevData = transactionsData;
    recentlyDeletedRef.current.add(String(id));

    // Optimistic UI update: Remove immediately from state without reloading page
    if (transactionsData && transactionsData.transactions) {
      const removedTx = transactionsData.transactions.find(t => String(t.id) === String(id));
      const updatedTxs = transactionsData.transactions.filter(t => String(t.id) !== String(id));
      const amountDiff = removedTx ? (parseFloat(removedTx.amount) || 0) : 0;

      const updatedGrouped = (transactionsData.grouped || []).map(group => {
        const filteredGroupTxs = group.transactions.filter(t => String(t.id) !== String(id));
        const groupTotal = filteredGroupTxs.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
        return {
          ...group,
          total: groupTotal,
          transactions: filteredGroupTxs
        };
      }).filter(group => group.transactions.length > 0);

      setTransactionsData({
        ...transactionsData,
        transactions: updatedTxs,
        grouped: updatedGrouped,
        total_count: Math.max(0, (transactionsData.total_count || 1) - 1),
        total_amount: Math.max(0, (transactionsData.total_amount || 0) - amountDiff)
      });
    }

    setDeletingId(id);
    setDeleteConfirmId(null);

    try {
      await onDeleteTransaction(id);
      showToast('Transaction deleted successfully', 'success');
      // Notice: Do NOT call loadTransactions(true) here!
      // The optimistic deletion already accurately and cleanly updated local state and storage.
      // Re-querying in the middle of network completion caused the visual jump/shuffle.
    } catch (err) {
      recentlyDeletedRef.current.delete(String(id));
      // Rollback to previous data on failure
      setTransactionsData(prevData);
      showToast(err.message || 'Failed to delete transaction', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDateHeader = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const formatted = dt.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
    if (dateStr === todayStr) {
      return `Today · ${formatted}`;
    }
    return formatted;
  };

  const formatMonthName = (monthKey) => {
    if (!monthKey || monthKey === 'all') return 'All Months';
    const [year, month] = monthKey.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleString('default', { month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-4 px-1 sm:px-6 lg:px-8 py-2 pb-28 lg:pb-8 max-w-7xl mx-auto">
      {/* Header & Quick Action Banner (Shown on desktop; on mobile, header is handled by Header.jsx) */}
      <div className="hidden lg:flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t('expenseRecords', 'Expense Records & History')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {transactionsData?.total_count || 0} {t('entriesFound', 'entries found')} · {t('totalNetSpend', 'Total Net Spend')}: <strong className="text-slate-900 dark:text-white">{formatCurrency(transactionsData?.total_amount || 0)}</strong>
          </p>
        </div>

        {/* Desktop Quick Export and Import buttons */}
        <div className="flex items-center gap-2">
          {onOpenImport && (
            <button
              type="button"
              onClick={onOpenImport}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6C47FF] hover:bg-[#5835E5] text-white rounded-xl text-xs font-bold shadow-sm shadow-purple-600/20 transition-all cursor-pointer"
            >
              <Upload size={14} />
              <span>{t('import', 'Import')}</span>
            </button>
          )}
          <a
            href={`/api/export/excel?user_email=${encodeURIComponent(getCurrentUserEmail())}`}
            onClick={(e) => {
              if (window.location.hostname.includes('github.io') || !window.location.port) {
                e.preventDefault();
                exportTransactionsToExcel(transactionsData?.transactions || [], `Expenses_${selectedMonth || 'all'}.xlsx`);
              }
            }}
            download="Daily_Expenses_Export.xlsx"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-[#151226] border border-slate-200 dark:border-white/10 hover:border-purple-300 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs transition-colors"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span className="hidden sm:inline">{t('exportExcel', 'Export Excel')}</span>
          </a>
          <a
            href={`/api/export/json?user_email=${encodeURIComponent(getCurrentUserEmail())}`}
            onClick={(e) => {
              if (window.location.hostname.includes('github.io') || !window.location.port) {
                e.preventDefault();
                exportDataToJson(transactionsData || {}, `Expenses_${selectedMonth || 'all'}.json`);
              }
            }}
            download="expense_tracker_backup.json"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-[#151226] border border-slate-200 dark:border-white/10 hover:border-purple-300 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-xs transition-colors"
          >
            <Download size={15} className="text-[#6C47FF] dark:text-[#8B5CF6]" />
            <span className="hidden sm:inline">{t('jsonBackup', 'JSON Backup')}</span>
          </a>
        </div>
      </div>

      {/* Mobile Stats Summary Strip */}
      <div className="flex items-center justify-between px-1.5 text-xs text-slate-500 dark:text-[#A78BFA] lg:hidden">
        <span>{transactionsData?.total_count || 0} {t('entriesFound', 'entries found')}</span>
        <span>{t('totalNetSpend', 'Total Net Spend')}: <strong className="text-slate-900 dark:text-white font-bold">{formatCurrency(transactionsData?.total_amount || 0)}</strong></span>
      </div>

      {/* Filter Toolbar Card */}
      <div className="bg-white dark:bg-[#151226] rounded-3xl p-4 sm:p-5 border border-slate-100 dark:border-white/10 shadow-sm space-y-3 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="md:col-span-5 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('searchPlaceholder', 'Search by description, category, date, or amount...')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6C47FF] transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Custom Month Dropdown */}
          <div className="md:col-span-3">
            <CustomDropdown
              value={monthFilter}
              onChange={(val) => {
                setMonthFilter(val);
                setPage(1);
                if (val !== 'all' && onSelectMonth) {
                  onSelectMonth(val);
                }
              }}
              options={[
                { value: 'all', label: t('allMonths', 'All Months') },
                ...availableMonths.map((m) => ({ value: m, label: formatMonthName(m) }))
              ]}
              icon={Calendar}
              ariaLabel="Select Month Filter"
              className="w-full"
            />
          </div>

          {/* Custom Category Dropdown */}
          <div className="md:col-span-2">
            <CustomDropdown
              value={categoryFilter}
              onChange={(val) => {
                setCategoryFilter(val);
                setPage(1);
              }}
              options={[
                { value: 'all', label: t('allCategories', 'All Categories') },
                ...categories.map((c) => ({
                  value: c.name,
                  label: c.name,
                  color: c.color
                }))
              ]}
              searchable={true}
              ariaLabel="Select Category Filter"
              className="w-full"
            />
          </div>

          {/* Custom Payment Mode Dropdown */}
          <div className="md:col-span-2">
            <CustomDropdown
              value={paymentFilter}
              onChange={(val) => {
                setPaymentFilter(val);
                setPage(1);
              }}
              options={[
                { value: 'all', label: t('allModes', 'All Modes') },
                { value: 'UPI', label: 'UPI' },
                { value: 'Cash', label: 'Cash' },
                { value: 'Credit Card', label: 'Credit Card' },
                { value: 'Debit Card', label: 'Debit Card' },
                { value: 'Net Banking', label: 'Net Banking' }
              ]}
              ariaLabel="Select Payment Mode Filter"
              className="w-full"
            />
          </div>
        </div>

        {/* 1-Tap Active Filters Reset */}
        {(search || categoryFilter !== 'all' || paymentFilter !== 'all' || (monthFilter !== 'all' && monthFilter !== selectedMonth)) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5 text-xs animate-fade-in">
            <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
              Active filters applied
            </span>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategoryFilter('all');
                setPaymentFilter('all');
                setMonthFilter(selectedMonth || 'all');
                setPage(1);
              }}
              className="text-[11px] font-bold text-[#6C47FF] dark:text-[#A78BFA] hover:underline cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Transaction List Grouped By Date */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400">
          Loading transactions...
        </div>
      ) : transactionsData?.grouped?.length === 0 ? (
        <div className="bg-white dark:bg-[#151226] rounded-3xl p-10 border border-slate-100 dark:border-white/10 text-center space-y-2">
          <AlertCircle size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('noTransactions', 'No matching transactions')}</p>
          <p className="text-xs text-slate-400">Try adjusting your filters or search terms</p>
        </div>
      ) : (
        <div className="space-y-4">
          {transactionsData?.grouped?.map((group) => (
            <div
              key={group.date}
              className="bg-white dark:bg-[#151226] rounded-3xl border border-slate-100 dark:border-white/10 p-4 sm:p-5 shadow-xs space-y-3 transition-colors"
            >
              {/* Day Header with Daily Total */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-white/5">
                <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                  {formatDateHeader(group.date)}
                </span>
                <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${group.total < 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200'
                  }`}>
                  Daily: {formatCurrency(group.total)}
                </span>
              </div>

              {/* Transactions in this day */}
              <div className="divide-y divide-slate-50 dark:divide-white/5">
                {group.transactions.map((tx) => {
                  const isRefund = Boolean(tx.amount < 0 || tx.is_refund);
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between group hover:bg-slate-50/80 dark:hover:bg-white/5 p-2.5 rounded-2xl transition-all tx-row"
                    >
                      {/* Left: Icon & Details */}
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <div
                          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${tx.color || '#6C47FF'}20` }}
                        >
                          <CategoryIcon name={tx.category} icon={tx.icon} color={tx.color} size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                              {tx.description || tx.category}
                            </span>
                            {isRefund && (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                {tx.category?.toLowerCase() === 'income' || /income|salary|freelance|cashback/i.test(tx.description || '') ? 'Income' : 'Refund'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 truncate">
                            <span className="text-[10px] sm:text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate">
                              {tx.category}
                            </span>
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded flex-shrink-0">
                              {tx.payment_mode}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Amount & Actions */}
                      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                        <span className={`text-xs sm:text-sm font-extrabold tracking-tight text-right ${isRefund
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                          }`}>
                          {isRefund ? `+${formatCurrency(Math.abs(tx.amount))}` : formatCurrency(tx.amount)}
                        </span>

                        <div className="flex items-center opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity gap-1 sm:gap-1">
                          <button
                            onClick={() => onEditTransaction(tx)}
                            title="Edit"
                            aria-label={`Edit ${tx.description || tx.category}`}
                            className="p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-[#6C47FF] hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors cursor-pointer"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(tx.id)}
                            title="Delete"
                            aria-label={`Delete ${tx.description || tx.category}`}
                            className="p-2 sm:p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {transactionsData?.total_pages > 1 && (
            <div className="flex items-center justify-between py-3 bg-white dark:bg-[#151226] px-5 rounded-2xl border border-slate-100 dark:border-white/10 shadow-xs transition-colors">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-1.5"
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>

              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Page {page} of {transactionsData.total_pages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(transactionsData.total_pages, p + 1))}
                disabled={page === transactionsData.total_pages}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-1.5"
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-safe-overlay bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="fixed inset-0" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative z-10 bg-white dark:bg-[#1A172B] rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-slate-100 dark:border-white/10 animate-scale-in">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Delete Transaction?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Are you sure you want to permanently delete this record? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deletingId === deleteConfirmId}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {deletingId === deleteConfirmId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
