import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
  X,
  Download,
} from 'lucide-react';
import {
  checkServerHealth,
  safeFetch,
  ServerHealthStatus,
} from '../../services/networkClient';
import {
  getStartupDiagnostics,
  StartupDiagnostics,
} from '../../services/performanceTracker';
import { getAppDataSnapshot, invalidateDataCache } from '../../db/indexedDb';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => Promise<void>;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
}) => {
  const [health, setHealth] = useState<ServerHealthStatus | null>(null);
  const [serverDiag, setServerDiag] = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<StartupDiagnostics | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setIsPinging(true);
    setCacheMessage(null);
    try {
      // 1. Probe server health & roundtrip latency
      const healthStatus = await checkServerHealth(4000);
      setHealth(healthStatus);

      // 2. Fetch server memory and uptime if server is available
      if (healthStatus.isServerAvailable) {
        try {
          const diagRes = await safeFetch<any>('/api/diagnostics', { timeoutMs: 3000 });
          setServerDiag(diagRes.data);
        } catch {
          setServerDiag(null);
        }
      } else {
        setServerDiag(null);
      }

      // 3. Collect client performance metrics
      const clientDiag = getStartupDiagnostics(
        true,
        healthStatus.isServerAvailable,
        healthStatus.latencyMs
      );
      setDiagnostics(clientDiag);
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen]);

  const handleClearCacheAndReconcile = async () => {
    invalidateDataCache();
    if (onRefreshData) {
      await onRefreshData();
    } else {
      await getAppDataSnapshot(true);
    }
    setCacheMessage('Data cache refreshed and all balances re-reconciled in memory.');
    setTimeout(() => setCacheMessage(null), 3000);
  };

  const handleDownloadLog = () => {
    const report = {
      timestamp: new Date().toISOString(),
      server: {
        reachable: health?.isServerAvailable ?? false,
        latencyMs: health?.latencyMs ?? 0,
        hasGeminiKey: health?.hasGeminiKey ?? false,
        uptimeSeconds: serverDiag?.uptimeSeconds,
        memory: serverDiag?.memory,
      },
      clientPerformance: diagnostics,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmascan-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                System Diagnostics &amp; Server Reliability
              </h2>
              <p className="text-xs text-slate-400">
                Live latency, startup metrics, and database health inspection
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

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Server Connection Status Card */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Server className="w-4 h-4 text-emerald-400" />
                Backend Server Status
              </span>
              <button
                onClick={runDiagnostics}
                disabled={isPinging}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1.5 text-[11px] font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                <span>{isPinging ? 'Pinging...' : 'Test Connection'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Server Availability */}
              <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-lg space-y-1">
                <div className="text-slate-400 text-[10px]">Server Availability</div>
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  {health?.isServerAvailable ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Operational</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400">Unreachable / Offline</span>
                    </>
                  )}
                </div>
              </div>

              {/* Roundtrip Latency */}
              <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-lg space-y-1">
                <div className="text-slate-400 text-[10px]">Roundtrip Latency</div>
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-200">
                    {health ? `${health.latencyMs} ms` : 'Measuring...'}
                  </span>
                </div>
              </div>

              {/* Internet Connectivity */}
              <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-lg space-y-1">
                <div className="text-slate-400 text-[10px]">Internet State</div>
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  {health?.isOnline ? (
                    <>
                      <Wifi className="w-4 h-4 text-teal-400" />
                      <span className="text-teal-400">Online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400">Offline Safe</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Server Memory and Key Status */}
            {serverDiag && (
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-900 text-[11px] text-slate-400">
                <span>
                  Uptime: <strong className="text-slate-200">{serverDiag.uptimeSeconds}s</strong>
                </span>
                <span>
                  Heap: <strong className="text-slate-200">{serverDiag.memory?.heapUsedMb} MB</strong>
                </span>
                <span>
                  Gemini API: <strong className="text-emerald-400">Configured</strong>
                </span>
              </div>
            )}
          </div>

          {/* Startup Steps & Measured Durations */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Database className="w-4 h-4 text-teal-400" />
                Startup Timing &amp; Query Performance
              </span>
              <span className="text-[11px] text-slate-400">
                Total Startup: <strong className="text-white font-mono">{diagnostics?.totalStartupMs || 0}ms</strong>
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {diagnostics && diagnostics.steps.length > 0 ? (
                diagnostics.steps.map((s, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-900 border border-slate-800/60 rounded-lg flex items-center justify-between text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-mono text-slate-200">{s.name}</span>
                      {s.details && (
                        <span className="text-slate-500 text-[10px]">({s.details})</span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-emerald-400">{s.durationMs}ms</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-center py-2">
                  No individual step metrics recorded yet.
                </div>
              )}
            </div>
          </div>

          {/* Pharmacy Data Safety & Cache Management */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Data Safety &amp; Local Re-reconciliation
            </span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              All agencies, bills, receipts, and medicine catalogs are safely isolated in local
              IndexedDB. Balances are calculated through chronological FIFO allocation.
            </p>

            {cacheMessage && (
              <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{cacheMessage}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                onClick={handleClearCacheAndReconcile}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                <span>Re-reconcile All Balances</span>
              </button>

              <button
                onClick={handleDownloadLog}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Download Diagnostics Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-850 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
