import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarClock, X, Plus, AlertCircle, CheckCircle2, PauseCircle,
  PlayCircle, Trash2, Calendar, DollarSign, Bell, ShieldCheck,
  Tag, ArrowRight, Sparkles, RefreshCw, Layers
} from 'lucide-react';
import {
  getRecurringSubscriptions,
  saveRecurringSubscription,
  deleteRecurringSubscription,
  toggleSubscriptionStatus,
  calculateMonthlyBurnRate,
  getUpcomingRenewals,
  recordBillPaymentAsExpense,
  calculateNextDueDate
} from '../services/recurringExpensesService';
import { useToast } from '../context/ToastContext';

export default function RecurringSubscriptionsModal({
  isOpen,
  onClose,
  formatCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`,
  categories = [],
  onRefreshAll = null
}) {
  const { showToast } = useToast();
  const [subscriptions, setSubscriptions] = useState([]);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'upcoming' | 'add'
  const [editingSub, setEditingSub] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('Subscriptions');
  const [formFrequency, setFormFrequency] = useState('monthly');
  const [formBillingDay, setFormBillingDay] = useState(1);
  const [formPaymentMethod, setFormPaymentMethod] = useState('UPI');
  const [formNotes, setFormNotes] = useState('');

  // Load subscriptions on mount or open
  useEffect(() => {
    if (isOpen) {
      setSubscriptions(getRecurringSubscriptions());
    }
  }, [isOpen]);

  // Listen for local updates
  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail?.subscriptions) {
        setSubscriptions(e.detail.subscriptions);
      } else {
        setSubscriptions(getRecurringSubscriptions());
      }
    };
    window.addEventListener('recurring_subscriptions_updated', handleUpdate);
    return () => window.removeEventListener('recurring_subscriptions_updated', handleUpdate);
  }, []);

  const burnRate = useMemo(() => calculateMonthlyBurnRate(subscriptions), [subscriptions]);
  const upcomingRenewals = useMemo(() => getUpcomingRenewals(subscriptions, 7), [subscriptions]);

  const handleStartAdd = () => {
    setEditingSub(null);
    setFormName('');
    setFormAmount('');
    setFormCategory(categories[0]?.name || 'Subscriptions');
    setFormFrequency('monthly');
    setFormBillingDay(new Date().getDate());
    setFormPaymentMethod('UPI');
    setFormNotes('');
    setActiveTab('add');
  };

  const handleStartEdit = (sub) => {
    setEditingSub(sub);
    setFormName(sub.name || '');
    setFormAmount(sub.amount || '');
    setFormCategory(sub.category || 'Subscriptions');
    setFormFrequency(sub.frequency || 'monthly');
    setFormBillingDay(sub.billingDay || 1);
    setFormPaymentMethod(sub.paymentMethod || 'UPI');
    setFormNotes(sub.notes || '');
    setActiveTab('add');
  };

  const handleSaveForm = (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Please enter a subscription name', 'error');
      return;
    }
    const numAmount = parseFloat(formAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const payload = {
      id: editingSub ? editingSub.id : undefined,
      name: formName.trim(),
      amount: numAmount,
      category: formCategory,
      frequency: formFrequency,
      billingDay: parseInt(formBillingDay, 10) || 1,
      paymentMethod: formPaymentMethod,
      notes: formNotes.trim(),
      status: editingSub ? editingSub.status : 'active',
      nextDueDate: calculateNextDueDate(formFrequency, formBillingDay)
    };

    saveRecurringSubscription(payload);
    showToast(
      editingSub ? 'Subscription updated successfully' : 'New recurring subscription added',
      'success'
    );
    setActiveTab('list');
    setEditingSub(null);
  };

  const handleTogglePause = (subId) => {
    const updated = toggleSubscriptionStatus(subId);
    const sub = updated.find(s => s.id === subId);
    showToast(
      sub?.status === 'paused' ? 'Subscription paused' : 'Subscription resumed',
      'info'
    );
  };

  const handleDelete = (subId, name) => {
    deleteRecurringSubscription(subId);
    showToast(`Deleted "${name}"`, 'success');
  };

  const handleLogExpense = async (sub) => {
    try {
      setIsSubmitting(true);
      await recordBillPaymentAsExpense(sub);
      showToast(`Logged ₹${sub.amount} for "${sub.name}" in your ledger!`, 'success');
      if (onRefreshAll) onRefreshAll();
    } catch (err) {
      showToast('Failed to log recurring expense', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 modal-safe-overlay bg-black/70 backdrop-blur-sm animate-fade-in"
      data-testid="recurring-subscriptions-modal"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#16132A] rounded-3xl border border-slate-200/80 dark:border-purple-500/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-purple-500/10 flex items-center justify-between bg-gradient-to-r from-purple-500/5 via-transparent to-pink-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6C47FF] to-[#A78BFA] flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <CalendarClock size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Recurring Subscriptions &amp; Bills
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  ₹0 Server Cost
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Client-side foreground tracking &amp; advance renewal alerts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close Modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Burn Rate Summary Banner */}
        <div className="px-6 py-3.5 bg-slate-50/70 dark:bg-[#1A1633] border-b border-slate-100 dark:border-purple-500/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center sm:text-left">
          <div className="p-2 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Monthly Burn Rate</div>
            <div
              className="text-base sm:text-lg font-black text-[#6C47FF] dark:text-[#C084FC]"
              data-testid="monthly-burn-rate-amount"
            >
              {formatCurrency(burnRate.monthlyTotal)}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Annual Total</div>
            <div className="text-base sm:text-lg font-bold text-slate-700 dark:text-slate-200">
              {formatCurrency(burnRate.yearlyTotal)}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Subs</div>
            <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {burnRate.activeCount} <span className="text-xs text-slate-400 font-normal">({burnRate.pausedCount} paused)</span>
            </div>
          </div>
          <div className="p-2 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-100 dark:border-white/5">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Renewals Due &lt;7d</div>
            <div className="text-base sm:text-lg font-bold text-amber-500 flex items-center gap-1 justify-center sm:justify-start">
              <Bell size={14} />
              <span>{upcomingRenewals.length}</span>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="px-6 pt-3 flex items-center justify-between border-b border-slate-100 dark:border-white/5">
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="tab-active-subs"
              onClick={() => setActiveTab('list')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeTab === 'list'
                  ? 'border-[#6C47FF] text-[#6C47FF] dark:text-[#C084FC]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              All Subscriptions ({subscriptions.length})
            </button>
            <button
              type="button"
              data-testid="tab-upcoming-subs"
              onClick={() => setActiveTab('upcoming')}
              className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'upcoming'
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <AlertCircle size={13} />
              <span>Upcoming Renewals ({upcomingRenewals.length})</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="btn-add-subscription"
            onClick={handleStartAdd}
            className="mb-2 px-3 py-1.5 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Subscription</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {activeTab === 'add' ? (
            /* Add / Edit Subscription Form */
            <form onSubmit={handleSaveForm} className="space-y-4 max-w-lg mx-auto">
              <div className="text-sm font-bold text-slate-900 dark:text-white pb-1 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
                <span>{editingSub ? 'Edit Subscription' : 'New Recurring Subscription'}</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Subscription Name *
                </label>
                <input
                  type="text"
                  data-testid="input-sub-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Netflix, Spotify, Gym Membership"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    data-testid="input-sub-amount"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="499"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Billing Frequency
                  </label>
                  <select
                    data-testid="select-sub-frequency"
                    value={formFrequency}
                    onChange={(e) => setFormFrequency(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Billing Day ({formFrequency === 'weekly' ? '1=Mon .. 7=Sun' : 'Day of Month: 1-31'})
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={formFrequency === 'weekly' ? '7' : '31'}
                    data-testid="input-sub-billing-day"
                    value={formBillingDay}
                    onChange={(e) => setFormBillingDay(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Payment Method
                  </label>
                  <select
                    data-testid="select-sub-payment-method"
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                  >
                    <option value="UPI">UPI / Auto-Pay</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Net Banking">Net Banking</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  data-testid="select-sub-category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                >
                  {categories.length > 0 ? (
                    categories.map(c => (
                      <option key={c.id || c.name} value={c.name}>{c.name}</option>
                    ))
                  ) : (
                    <>
                      <option value="Entertainment">Entertainment</option>
                      <option value="Utilities">Utilities</option>
                      <option value="Shopping">Shopping</option>
                      <option value="Subscriptions">Subscriptions</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Shared with family, plan details"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  data-testid="btn-save-subscription"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] text-white font-bold text-sm transition-all shadow-md shadow-purple-500/20 cursor-pointer"
                >
                  {editingSub ? 'Update Subscription' : 'Add Subscription'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : activeTab === 'upcoming' ? (
            /* Upcoming Renewals List */
            upcomingRenewals.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">All Clear!</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  No subscriptions or recurring bills are due within the next 7 days.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="text-xs text-slate-500 dark:text-slate-400 pb-1">
                  Active bills scheduled to renew in the next 7 days:
                </div>
                {upcomingRenewals.map((sub) => (
                  <div
                    key={sub.id}
                    data-testid={`upcoming-item-${sub.id}`}
                    className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold flex-shrink-0">
                        <Bell size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{sub.name}</span>
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold uppercase">
                            Due in {sub.daysRemaining === 0 ? 'Today' : `${sub.daysRemaining}d`}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Due date: <span className="font-semibold text-slate-700 dark:text-slate-200">{sub.nextDueDate}</span> · {sub.frequency} via {sub.paymentMethod}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 justify-between sm:justify-end">
                      <div className="text-base font-black text-slate-900 dark:text-white">
                        {formatCurrency(sub.amount)}
                      </div>
                      <button
                        type="button"
                        data-testid={`btn-log-expense-${sub.id}`}
                        disabled={isSubmitting}
                        onClick={() => handleLogExpense(sub)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 size={13} />
                        <span>Log Paid</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* All Subscriptions List */
            subscriptions.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <CalendarClock size={36} className="mx-auto text-slate-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">No subscriptions tracked yet</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Add your streaming services, utility bills, rent, or memberships to track monthly burn rate.
                </p>
                <button
                  type="button"
                  onClick={handleStartAdd}
                  className="px-4 py-2 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] text-white text-xs font-bold cursor-pointer"
                >
                  Add Your First Subscription
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {subscriptions.map((sub) => {
                  const isPaused = sub.status === 'paused';
                  return (
                    <div
                      key={sub.id}
                      data-testid={`subscription-item-${sub.id}`}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isPaused
                          ? 'border-slate-200/50 dark:border-white/5 bg-slate-50/40 dark:bg-white/[0.01] opacity-60'
                          : 'border-slate-200 dark:border-purple-500/15 bg-white dark:bg-white/[0.02] hover:border-purple-500/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                          isPaused
                            ? 'bg-slate-200 dark:bg-white/10 text-slate-400'
                            : 'bg-purple-500/10 text-[#6C47FF] dark:text-[#C084FC] border border-purple-500/20'
                        }`}>
                          <CalendarClock size={16} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{sub.name}</span>
                            <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase ${
                              isPaused
                                ? 'bg-slate-200 dark:bg-white/10 text-slate-500'
                                : 'bg-purple-500/15 text-[#6C47FF] dark:text-[#C084FC]'
                            }`}>
                              {sub.frequency}
                            </span>
                            {isPaused && (
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-500/15 text-slate-500 font-bold uppercase">
                                Paused
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {sub.category} · Next: <span className="font-semibold text-slate-700 dark:text-slate-200">{sub.nextDueDate || 'Auto'}</span> · via {sub.paymentMethod || 'UPI'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 justify-between sm:justify-end">
                        <div className="text-right">
                          <div className="text-base font-black text-slate-900 dark:text-white">
                            {formatCurrency(sub.amount)}
                          </div>
                          <div className="text-[10px] text-slate-400 capitalize">
                            /{sub.frequency === 'yearly' ? 'yr' : sub.frequency === 'weekly' ? 'wk' : 'mo'}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {!isPaused && (
                            <button
                              type="button"
                              data-testid={`btn-log-expense-${sub.id}`}
                              disabled={isSubmitting}
                              title="Log expense now into transaction history"
                              onClick={() => handleLogExpense(sub)}
                              className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid={`btn-toggle-pause-${sub.id}`}
                            title={isPaused ? 'Resume subscription' : 'Pause subscription'}
                            onClick={() => handleTogglePause(sub.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                          >
                            {isPaused ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                          </button>
                          <button
                            type="button"
                            data-testid={`btn-delete-sub-${sub.id}`}
                            title="Delete subscription"
                            onClick={() => handleDelete(sub.id, sub.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Footer info banner */}
        <div className="px-6 py-2.5 bg-slate-50 dark:bg-black/20 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-500" />
            <span>100% Client-Side Engine • Private &amp; Offline • ₹0 External Cost</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-bold text-[#6C47FF] dark:text-[#C084FC] hover:underline cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
