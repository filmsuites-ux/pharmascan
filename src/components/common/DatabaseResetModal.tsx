import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
  FileText,
  Building2,
  CreditCard,
  Pill,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  executeVerifiedDatabaseReset,
  createPreResetSafetyBackup,
  downloadSafetyBackupJson,
  getDatabaseRecordCounts,
  loadSampleDemoData,
  DatabaseCounts,
  ResetResult,
} from '../../services/resetService';
import { PharmacyUserSession } from '../../types/pharmacy';

interface DatabaseResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: PharmacyUserSession | null;
  onResetCompleted: (result: ResetResult) => void;
  onDemoDataLoaded?: () => void;
  onSignOut?: () => void;
}

export const DatabaseResetModal: React.FC<DatabaseResetModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onResetCompleted,
  onDemoDataLoaded,
  onSignOut,
}) => {
  const [counts, setCounts] = useState<DatabaseCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState<boolean>(true);
  const [confirmText, setConfirmText] = useState<string>('');
  const [preserveSession, setPreserveSession] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedResult, setVerifiedResult] = useState<ResetResult | null>(null);
  const [hasDownloadedBackup, setHasDownloadedBackup] = useState<boolean>(false);

  const loadCounts = async () => {
    setLoadingCounts(true);
    try {
      const c = await getDatabaseRecordCounts();
      setCounts(c);
    } catch (err: any) {
      console.error('Failed to load database counts:', err);
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCounts();
      setConfirmText('');
      setError(null);
      setVerifiedResult(null);
      setHasDownloadedBackup(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadSafetyBackup = async () => {
    try {
      const backup = await createPreResetSafetyBackup(currentUser?.email);
      downloadSafetyBackupJson(backup);
      setHasDownloadedBackup(true);
    } catch (err: any) {
      setError(`Failed to create backup: ${err.message}`);
    }
  };

  const handleExecuteReset = async () => {
    if (confirmText.trim().toUpperCase() !== 'RESET') {
      setError('Please type RESET in the confirmation box to authorize deletion.');
      return;
    }

    setIsResetting(true);
    setError(null);

    try {
      const result = await executeVerifiedDatabaseReset({
        preserveUserSession: preserveSession,
        clearCloudBackup: true,
        userEmail: currentUser?.email,
        autoDownloadBackup: true,
      });

      setVerifiedResult(result);
      onResetCompleted(result);

      if (!preserveSession && onSignOut) {
        setTimeout(() => {
          onSignOut();
        }, 1500);
      }
    } catch (err: any) {
      console.error('Reset execution error:', err);
      setError(err.message || 'Database reset failed verification.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleLoadDemo = async () => {
    setIsResetting(true);
    try {
      await loadSampleDemoData();
      onDemoDataLoaded?.();
      onClose();
    } catch (err: any) {
      setError(`Failed to load demo data: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col my-auto max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Database Reset &amp; Clean Start
              </h2>
              <p className="text-xs text-slate-400">
                Verified zero-record reset with automatic pre-reset safety backup
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Success State */}
          {verifiedResult ? (
            <div className="p-5 bg-emerald-950/40 border border-emerald-700/60 rounded-2xl space-y-4 animate-in fade-in">
              <div className="flex items-center gap-3 text-emerald-300">
                <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-base text-white">Database Reset Verified!</h3>
                  <p className="text-xs text-emerald-200/80">
                    All test records were deleted and confirmed directly against IndexedDB.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-center text-xs">
                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                  <div className="text-slate-400">Agencies</div>
                  <div className="text-lg font-bold text-white font-mono">0</div>
                  <div className="text-[10px] text-emerald-400">Verified Empty</div>
                </div>
                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                  <div className="text-slate-400">Bills / Receipts</div>
                  <div className="text-lg font-bold text-white font-mono">0</div>
                  <div className="text-[10px] text-emerald-400">Verified Empty</div>
                </div>
                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                  <div className="text-slate-400">Payments</div>
                  <div className="text-lg font-bold text-white font-mono">0</div>
                  <div className="text-[10px] text-emerald-400">Verified Empty</div>
                </div>
                <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                  <div className="text-slate-400">Stock Items</div>
                  <div className="text-lg font-bold text-white font-mono">0</div>
                  <div className="text-[10px] text-emerald-400">Verified Empty</div>
                </div>
              </div>

              <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs space-y-1.5 text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Safety Backup File:</span>
                  <span className="text-emerald-300 font-mono text-[11px]">Downloaded to device</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Dashboard Balances:</span>
                  <span className="text-white font-mono font-bold">₹0.00 (Zero Out)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Auto-Seed Guard:</span>
                  <span className="text-teal-300 font-mono text-[11px]">CLEAN_EMPTY locked</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => downloadSafetyBackupJson(verifiedResult.backup)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Backup Again
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 cursor-pointer"
                >
                  Done &amp; View Clean Dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Safety Backup Guarantee Banner */}
              <div className="p-4 bg-teal-950/30 border border-teal-800/60 rounded-2xl flex items-start gap-3">
                <Download className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider">
                    Safety Backup Protection Active
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    A full snapshot of all current records will be generated and automatically downloaded as a JSON file before deletion occurs. You can restore your data at any time from the Reports screen.
                  </p>
                  <button
                    onClick={handleDownloadSafetyBackup}
                    className="mt-1 text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 cursor-pointer underline"
                  >
                    Download Safety Backup Now (Pre-emptive)
                    {hasDownloadedBackup && <span className="text-emerald-400 text-[11px]">✓ Saved</span>}
                  </button>
                </div>
              </div>

              {/* Exact Deletion Scope Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
                  <span>Current Stored Records (IndexedDB Backend)</span>
                  {loadingCounts ? (
                    <span className="text-slate-500 font-normal">Loading...</span>
                  ) : (
                    <span className="text-slate-400 font-mono">
                      {(counts?.agencies || 0) + (counts?.invoices || 0) + (counts?.payments || 0) + (counts?.items || 0)} total records
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-center">
                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs mb-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Agencies</span>
                    </div>
                    <div className="text-base font-bold text-white font-mono">
                      {counts?.agencies ?? '...'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-center">
                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs mb-1">
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Bills/Receipts</span>
                    </div>
                    <div className="text-base font-bold text-white font-mono">
                      {counts?.invoices ?? '...'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-center">
                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs mb-1">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Payments</span>
                    </div>
                    <div className="text-base font-bold text-white font-mono">
                      {counts?.payments ?? '...'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-center">
                    <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs mb-1">
                      <Pill className="w-3.5 h-3.5 text-teal-400" />
                      <span>Stock Items</span>
                    </div>
                    <div className="text-base font-bold text-white font-mono">
                      {counts?.items ?? '...'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scope & User Session Option */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5">
                <div className="text-xs font-semibold text-slate-300">Session &amp; Cloud Account Handling:</div>
                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
                  <input
                    type="radio"
                    name="preserveSession"
                    checked={preserveSession}
                    onChange={() => setPreserveSession(true)}
                    className="accent-emerald-500"
                  />
                  <span>
                    <strong>Preserve Google Sign-In:</strong> Clear database to zero balances, but remain logged in as {currentUser?.name || 'current user'}.
                  </span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
                  <input
                    type="radio"
                    name="preserveSession"
                    checked={!preserveSession}
                    onChange={() => setPreserveSession(false)}
                    className="accent-emerald-500"
                  />
                  <span>
                    <strong>Complete Developer Reset:</strong> Clear database and return to initial Google Sign-In screen.
                  </span>
                </label>
              </div>

              {/* Error display */}
              {error && (
                <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Type RESET Confirmation Input */}
              <div className="p-4 bg-red-950/20 border border-red-800/60 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Explicit Confirmation Required</span>
                </div>
                <p className="text-xs text-slate-300">
                  To confirm permanent deletion of all test records and lock the clean zero-balance state, type <strong className="text-white font-mono bg-red-900/40 px-1.5 py-0.5 rounded border border-red-700/50">RESET</strong> below:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type RESET here"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono uppercase tracking-widest"
                  />
                  <button
                    onClick={handleExecuteReset}
                    disabled={confirmText.trim().toUpperCase() !== 'RESET' || isResetting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {isResetting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Confirm Reset</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Alternative: Load Sample Demo Dataset */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Want to test with sample Indian pharmacy bills again?</span>
                <button
                  onClick={handleLoadDemo}
                  disabled={isResetting}
                  className="text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Re-seed Demo Dataset
                </button>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!verifiedResult && (
          <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
            <span>IndexedDB persistent schema preserved • API credentials untouched</span>
            <button
              onClick={onClose}
              disabled={isResetting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
