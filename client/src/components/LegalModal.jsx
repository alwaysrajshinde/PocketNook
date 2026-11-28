import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, FileText, Lock, Globe, Check } from 'lucide-react';
import { APP_INKED_VERSION } from '../constants/version';

export default function LegalModal({ isOpen, onClose, initialTab = 'privacy' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-safe-overlay bg-slate-900/60 backdrop-blur-sm animate-fade-in" style={{ touchAction: 'none' }}>
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#16132A] rounded-3xl shadow-2xl z-10 max-h-[85vh] flex flex-col overflow-hidden border border-slate-100 dark:border-white/10 transition-colors animate-scale-in" style={{ overscrollBehavior: 'contain' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-900/30 text-[#6C47FF] dark:text-[#A78BFA] flex items-center justify-center">
              {activeTab === 'privacy' ? <ShieldCheck size={20} /> : <FileText size={20} />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white">
                {activeTab === 'privacy' ? 'Privacy Policy & Data Sovereign Charter' : 'Terms of Service & Usage Agreement'}
              </h2>
              <p className="text-xs text-slate-400">PocketNook Legal Governance · {APP_INKED_VERSION}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="flex border-b border-slate-100 dark:border-white/5 px-6 pt-3 bg-slate-50/50 dark:bg-white/[0.02]">
          <button
            onClick={() => setActiveTab('privacy')}
            className={`pb-3 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'privacy'
                ? 'text-[#6C47FF] dark:text-[#A78BFA]'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            Privacy Policy
            {activeTab === 'privacy' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6C47FF] dark:bg-[#A78BFA] rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`pb-3 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'terms'
                ? 'text-[#6C47FF] dark:text-[#A78BFA]'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            Terms of Service
            {activeTab === 'terms' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6C47FF] dark:bg-[#A78BFA] rounded-full" />
            )}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {activeTab === 'privacy' ? (
            <>
              <section className="space-y-1.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Lock size={15} className="text-[#6C47FF]" />
                  1. Our Core Privacy Commitment
                </h3>
                <p>
                  At <strong>PocketNook</strong>, privacy is not an afterthought; it is our foundational engineering principle. We believe personal financial data should belong exclusively to the individual who generated it. We do not sell, rent, monetize, or broker your personal financial records to third-party advertisers, credit bureaus, or financial intermediaries.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
                  <Globe size={15} className="text-[#6C47FF]" />
                  2. What Information We Collect
                </h3>
                <p>We collect and process only the minimal data points necessary to deliver personal expense accounting:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Account Identity:</strong> Your email address and optional display name to authenticate your session and isolate your database space.</li>
                  <li><strong>Financial Transaction Records:</strong> User-entered amounts, category labels, dates, payment mode choices (e.g. UPI, Cash, Card), and optional descriptions.</li>
                  <li><strong>Custom Configuration:</strong> Your target monthly budget threshold, currency symbol (₹, $, €, £), and custom category preferences.</li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-white">3. Data Storage &amp; Cloud Security</h3>
                <p>
                  Your information is encrypted in transit using industry-standard TLS 1.3/HTTPS and stored in isolated Google Cloud Firestore databases protected by strict User ID Authentication Security Rules. Your financial ledger is strictly isolated to your verified account.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-white">4. Your Sovereign Data Rights</h3>
                <p>You retain 100% sovereign ownership over your financial records:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Right to Export:</strong> Download your entire ledger anytime in unencrypted Microsoft Excel (<code className="bg-slate-100 dark:bg-white/10 px-1 rounded">.xlsx</code>), CSV, or structured JSON.</li>
                  <li><strong>Right to Erasure (Forget Me):</strong> Permanently delete your account and all associated transaction records directly from Settings.</li>
                </ul>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-1.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
                  <FileText size={15} className="text-[#6C47FF]" />
                  1. Acceptance of Terms
                </h3>
                <p>
                  By accessing or using the <strong>PocketNook</strong> application, you agree to be bound by these Terms of Service. If you do not agree with any portion of these terms, please discontinue use immediately.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-white">2. Permitted Use &amp; Individual Bookkeeping</h3>
                <p>
                  The platform is provided for personal, non-commercial bookkeeping and budgeting purposes. You agree not to use the service for fraudulent, deceptive, or unauthorized activities, nor attempt to access or modify records belonging to other users.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-white">3. Disclaimer of Financial Advice</h3>
                <p>
                  <strong>PocketNook is a software utility, not a certified financial advisor or banking institution.</strong> Visual calculations, monthly pace projections, and burn-rate metrics are provided for informational convenience only and should not be construed as legal, tax, or investment advice.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-sm text-slate-800 dark:text-white">4. Service Availability &amp; Disclaimer of Warranties</h3>
                <p>
                  While we strive for 99.9% cloud uptime and offer robust offline IndexedDB caching, the service is provided on an "AS IS" and "AS AVAILABLE" basis. We encourage users to maintain periodic offline JSON or Excel backups using our one-click export utilities.
                </p>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
          <span className="text-[11px] text-slate-400">
            Questions? Contact support at <a href="mailto:raaajshinde@gmail.com" className="text-[#6C47FF] hover:underline">raaajshinde@gmail.com</a>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#6C47FF] hover:bg-[#5835E5] text-white text-xs font-bold shadow-md shadow-purple-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Check size={14} />
            <span>I Understand</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
