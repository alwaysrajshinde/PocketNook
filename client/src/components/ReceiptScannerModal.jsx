import React, { useState, useRef } from 'react';
import {
  Camera, Upload, X, CheckCircle2, AlertCircle, ShieldCheck,
  RefreshCw, Sparkles, FileText, ArrowRight, DollarSign, Calendar
} from 'lucide-react';
import { processReceiptFile, saveScannedReceiptExpense } from '../services/receiptScannerService';
import { useToast } from '../context/ToastContext';

export default function ReceiptScannerModal({
  isOpen,
  onClose,
  formatCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`,
  categories = [],
  onRefreshAll = null
}) {
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedResult, setScannedResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Editable Form fields
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [paymentMethod, setPaymentMethod] = useState('UPI');

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const result = await processReceiptFile(file);
      setScannedResult(result);
      setVendor(result.vendor);
      setAmount(String(result.amount));
      setDate(result.date);
      setCategory(result.category);
      setPaymentMethod(result.paymentMethod || 'UPI');
      showToast('Receipt parsed successfully on-device', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to process receipt image. Please try another.', 'error');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!vendor.trim()) {
      showToast('Please specify a vendor name', 'error');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    try {
      setIsSaving(true);
      await saveScannedReceiptExpense({
        vendor: vendor.trim(),
        amount: numAmount,
        date: date || new Date().toISOString().slice(0, 10),
        category,
        paymentMethod
      });
      showToast(`Expense logged: ₹${numAmount} at ${vendor}`, 'success');
      if (onRefreshAll) onRefreshAll();
      handleReset();
      onClose();
    } catch (err) {
      console.error(err);
      showToast('Failed to log scanned expense', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setScannedResult(null);
    setVendor('');
    setAmount('');
    setDate('');
    setCategory('Groceries');
    setPaymentMethod('UPI');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 modal-safe-overlay bg-black/70 backdrop-blur-sm animate-fade-in"
      data-testid="receipt-scanner-modal"
    >
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#16132A] rounded-3xl border border-slate-200/80 dark:border-purple-500/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in">
        
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-purple-500/10 flex items-center justify-between bg-gradient-to-r from-emerald-500/5 via-transparent to-purple-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Camera size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Smart Receipt Scanner &amp; OCR
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  100% On-Device
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Zero Cloud Calls · Complete Privacy · ₹0 API Costs
              </p>
            </div>
          </div>
          <button
            onClick={() => { handleReset(); onClose(); }}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close Modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Hidden File Inputs */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          data-testid="receipt-file-input"
          className="hidden"
          onChange={handleFileSelected}
        />
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          data-testid="receipt-camera-input"
          className="hidden"
          onChange={handleFileSelected}
        />

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isProcessing ? (
            /* Loading State */
            <div className="py-16 text-center space-y-3">
              <RefreshCw size={36} className="mx-auto text-emerald-500 animate-spin" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Preprocessing Image &amp; Scanning On-Device...
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Applying canvas contrast filters and extracting vendor, date and amounts locally with zero server requests.
              </p>
            </div>
          ) : !scannedResult ? (
            /* Upload / Capture Initial State */
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-200 dark:border-purple-500/30 rounded-3xl p-8 text-center bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100/50 dark:hover:bg-purple-950/10 transition-colors">
                <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <Camera size={30} />
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Upload or Snap a Receipt
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
                  Select a receipt photo or capture one with your mobile camera. Our on-device engine instantly reads the merchant, amount, and date.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    data-testid="receipt-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-purple-500/20 cursor-pointer transition-all"
                  >
                    <Upload size={15} />
                    <span>Choose File / Photo</span>
                  </button>
                  <button
                    type="button"
                    data-testid="receipt-camera-btn"
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer transition-all"
                  >
                    <Camera size={15} />
                    <span>Open Camera</span>
                  </button>
                </div>
              </div>

              {/* Privacy highlights card */}
              <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/15 flex items-start gap-3">
                <ShieldCheck size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    Why On-Device Processing Matters
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Commercial cloud OCR platforms (Google Cloud Vision, AWS Textract) charge per-receipt API fees and send your personal financial purchases to third-party data centers. Our on-device architecture guarantees ₹0 operating costs and 100% offline data confidentiality.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Verification & Review Screen */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Left Column: Receipt Preview */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Receipt Preview</span>
                  <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    <span>Parsed in {scannedResult.executionTimeMs}ms</span>
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-900 flex items-center justify-center max-h-[360px]">
                  <img
                    src={scannedResult.previewUrl}
                    alt="Scanned Receipt"
                    data-testid="receipt-preview-img"
                    className="max-h-[360px] object-contain w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                >
                  Scan a Different Receipt
                </button>
              </div>

              {/* Right Column: Editable Fields */}
              <form onSubmit={handleSaveExpense} className="space-y-3.5">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 pb-1 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <span>Verify Extracted Details</span>
                  <span className="text-[10px] font-semibold text-purple-600 dark:text-[#C084FC]">
                    Verify before logging
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Merchant / Vendor *
                  </label>
                  <input
                    type="text"
                    data-testid="receipt-extracted-vendor"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="e.g. Starbucks, Apollo, Reliance"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Total Amount (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      data-testid="receipt-extracted-amount"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="450.00"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      data-testid="receipt-extracted-date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Category
                    </label>
                    <select
                      data-testid="receipt-extracted-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                    >
                      {categories.length > 0 ? (
                        categories.map(c => (
                          <option key={c.id || c.name} value={c.name}>{c.name}</option>
                        ))
                      ) : (
                        <>
                          <option value="Food & Dining">Food &amp; Dining</option>
                          <option value="Groceries">Groceries</option>
                          <option value="Shopping">Shopping</option>
                          <option value="Transportation">Transportation</option>
                          <option value="Healthcare">Healthcare</option>
                          <option value="Utilities">Utilities</option>
                          <option value="Other">Other</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Mode
                    </label>
                    <select
                      data-testid="receipt-extracted-payment"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#6C47FF]"
                    >
                      <option value="UPI">UPI / GPay / PhonePe</option>
                      <option value="Cash">Cash</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Debit Card">Debit Card</option>
                      <option value="Net Banking">Net Banking</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    data-testid="btn-add-scanned-expense"
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    <span>{isSaving ? 'Logging Expense...' : 'Add to Expenses'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer info banner */}
        <div className="px-6 py-2.5 bg-slate-50 dark:bg-black/20 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-emerald-500" />
            <span>100% On-Device Engine • Safe &amp; Offline • Zero Third-Party Uploads</span>
          </div>
          <button
            onClick={() => { handleReset(); onClose(); }}
            className="text-xs font-bold text-[#6C47FF] dark:text-[#C084FC] hover:underline cursor-pointer"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
