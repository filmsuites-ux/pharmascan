import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  Building2,
  FileText,
  CreditCard,
  Pill,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { PharmacyUserSession, CloudBackupSummary } from '../../types/pharmacy';
import {
  performCloudBackup,
  checkForAvailableBackup,
  restorePharmacyData,
} from '../../services/cloudBackupService';
import { developerResetAllData } from '../../db/indexedDb';

interface CloudBackupModalProps {
  isOpen: boolean;
  currentUser: PharmacyUserSession;
  onClose: () => void;
  onDataRestored: () => void;
  onDeveloperReset: () => void;
  onOpenDatabaseReset?: () => void;
}

export const CloudBackupModal: React.FC<CloudBackupModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onDataRestored,
  onDeveloperReset,
  onOpenDatabaseReset,
}) => {
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupResult, setBackupResult] = useState<{
    success: boolean;
    message: string;
    savedAt?: string;
    summary?: CloudBackupSummary;
  } | null>(null);

  const [lastBackupSummary, setLastBackupSummary] = useState<CloudBackupSummary | null>(null);
  const [isLoadingBackupInfo, setIsLoadingBackupInfo] = useState<boolean>(false);

  // Restore State
  const [isCheckingRestore, setIsCheckingRestore] = useState<boolean>(false);
  const [availableRestoreData, setAvailableRestoreData] = useState<any | null>(null);
  const [availableRestoreSummary, setAvailableRestoreSummary] = useState<CloudBackupSummary | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);

  // Developer Reset State
  const [showDevResetConfirm, setShowDevResetConfirm] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  useEffect(() => {
    async function loadLatestInfo() {
      if (isOpen && currentUser.email) {
        setIsLoadingBackupInfo(true);
        const check = await checkForAvailableBackup(currentUser.email);
        setIsLoadingBackupInfo(false);
        if (check.hasBackup && check.summary) {
          setLastBackupSummary(check.summary);
          setAvailableRestoreData(check.fullData);
          setAvailableRestoreSummary(check.summary);
        }
      }
    }
    loadLatestInfo();
  }, [isOpen, currentUser.email]);

  if (!isOpen) return null;

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    setBackupResult(null);
    try {
      const res = await performCloudBackup(currentUser.email);
      setBackupResult(res);
      if (res.success && res.summary) {
        setLastBackupSummary(res.summary);
        setAvailableRestoreSummary(res.summary);
      }
    } catch (e: any) {
      setBackupResult({
        success: false,
        message: e.message || 'Backup failed. Local database remains safe and intact.',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleInitiateRestore = async () => {
    setIsCheckingRestore(true);
    try {
      const check = await checkForAvailableBackup(currentUser.email);
      if (check.hasBackup && check.fullData) {
        setAvailableRestoreData(check.fullData);
        setAvailableRestoreSummary(check.summary || null);
        setShowRestoreConfirm(true);
      } else {
        alert('No cloud backup found for this Google account yet. Please tap "Backup Now" first.');
      }
    } catch (e: any) {
      alert(`Could not retrieve cloud backup: ${e.message}`);
    } finally {
      setIsCheckingRestore(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!availableRestoreData) return;
    setIsRestoring(true);
    try {
      const res = await restorePharmacyData(availableRestoreData);
      setRestoreSuccessMessage(res.message);
      setShowRestoreConfirm(false);
      onDataRestored();
    } catch (e: any) {
      alert(`Restore failed: ${e.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleConfirmDevReset = async () => {
    setIsResetting(true);
    try {
      await developerResetAllData();
      setShowDevResetConfirm(false);
      onDeveloperReset();
    } catch (e: any) {
      alert(`Reset error: ${e.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Google Cloud Backup &amp; Account
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  Connected
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Safe cloud sync for phone changes, reinstallations, and disaster recovery.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* User Account Card */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-black text-slate-950 text-base shadow-md">
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'G'}
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {currentUser.name}
                  <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Google Account
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono">{currentUser.email}</div>
              </div>
            </div>

            <div className="text-right hidden sm:block">
              <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 justify-end">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Offline-First Enabled
              </span>
              <span className="text-[10px] text-slate-500">Local DB Primary</span>
            </div>
          </div>

          {/* Feedback messages */}
          {backupResult && (
            <div
              className={`p-4 rounded-2xl border text-xs font-medium flex items-start gap-3 animate-in fade-in ${
                backupResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-red-950/40 border-red-500/50 text-red-300'
              }`}
            >
              {backupResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className="font-bold">{backupResult.message}</div>
                {backupResult.savedAt && (
                  <div className="text-[11px] text-slate-400 font-mono">
                    Timestamp: {new Date(backupResult.savedAt).toLocaleString('en-IN')}
                  </div>
                )}
              </div>
            </div>
          )}

          {restoreSuccessMessage && (
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 rounded-2xl text-xs font-medium flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{restoreSuccessMessage}</span>
            </div>
          )}

          {/* Backup Action & Info Section */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-teal-400" />
                  Cloud Backup Status
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Last Backup:{' '}
                  {lastBackupSummary ? (
                    <strong className="text-slate-200 font-mono">
                      {new Date(lastBackupSummary.savedAt).toLocaleString('en-IN')}
                    </strong>
                  ) : (
                    <span className="text-amber-400 font-medium">No cloud backup created yet</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleBackupNow}
                  disabled={isBackingUp}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
                >
                  {isBackingUp ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Backing Up...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Backup Now</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleInitiateRestore}
                  disabled={isCheckingRestore || isRestoring}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isCheckingRestore ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      <span>Restore Data</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Backup Scope Checklist */}
            {lastBackupSummary && (
              <div className="pt-3 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Items in Cloud Snapshot
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Agencies</span>
                    <strong className="text-white text-sm">{lastBackupSummary.agenciesCount}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Purchase Bills</span>
                    <strong className="text-emerald-400 text-sm">{lastBackupSummary.invoicesCount}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Payments</span>
                    <strong className="text-purple-400 text-sm">{lastBackupSummary.paymentsCount}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Opening Dues</span>
                    <strong className="text-amber-400 text-sm">{lastBackupSummary.openingDuesCount}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Restore Confirmation Dialog (Requirement 5) */}
          {showRestoreConfirm && availableRestoreSummary && (
            <div className="p-5 bg-teal-950/30 border border-teal-500/50 rounded-2xl space-y-4 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-500/20 text-teal-300 rounded-xl">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Confirm Cloud Data Restore</h4>
                  <p className="text-xs text-slate-400">
                    Backup dated:{' '}
                    <strong className="text-teal-300 font-mono">
                      {new Date(availableRestoreSummary.savedAt).toLocaleString('en-IN')}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-1 text-slate-300">
                <div className="font-semibold text-white mb-1">What will be safely restored:</div>
                <div>• {availableRestoreSummary.agenciesCount} Distributor Agencies &amp; GSTINs</div>
                <div>• {availableRestoreSummary.invoicesCount} Purchase Invoices (including bill scans)</div>
                <div>• {availableRestoreSummary.paymentsCount} Payment Records &amp; Cheque/UTR numbers</div>
                <div>• {availableRestoreSummary.openingDuesCount} Previous / Opening Due balances</div>
                <div>• {availableRestoreSummary.itemsCount} Medicine inventory &amp; batch items</div>
              </div>

              <p className="text-[11px] text-emerald-400">
                ✓ Non-destructive: Records are matched by unique ID to prevent duplicates.
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowRestoreConfirm(false)}
                  disabled={isRestoring}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRestore}
                  disabled={isRestoring}
                  className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isRestoring ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Restoring Database...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Restore</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Database Reset & Clean State Section (Issue 1) */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <RotateCcw className="w-4 h-4 text-red-400" />
                <span className="font-bold text-slate-300">Database Reset &amp; Clean Start</span>
              </div>
              <span className="text-[10px] text-red-400 font-mono">Verified Zero Out</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Clear all test bills, payment receipts, agency balances, and stock records. Guaranteed zero balances with automatic pre-reset safety backup download.
            </p>

            <button
              onClick={() => {
                if (onOpenDatabaseReset) {
                  onClose();
                  onOpenDatabaseReset();
                } else {
                  setShowDevResetConfirm(true);
                }
              }}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-red-950/40 text-slate-300 hover:text-red-400 text-xs font-medium rounded-lg border border-slate-800 hover:border-red-600/40 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-400" />
              <span>Open Database Reset &amp; Safety Backup</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span>Zero Google password storage. Pure OAuth &amp; local IndexedDB.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white font-semibold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
