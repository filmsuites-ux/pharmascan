/**
 * Performance & Startup Diagnostics Tracker
 *
 * Measures:
 * - App initialization duration (IndexedDB open, seeding check)
 * - Essential data load time (single-pass balance reconciliation)
 * - Background analytics load time
 * - Network latency and health checks
 *
 * Privacy & Safety:
 * - Never logs passwords, tokens, API keys, or patient/medicine details.
 * - Records only numeric timestamps, phase names, and sanitized error summaries.
 */

export interface PerformanceStepMetric {
  name: string;
  durationMs: number;
  timestamp: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  details?: string;
}

export interface StartupDiagnostics {
  appStartTime: string;
  totalStartupMs: number;
  steps: PerformanceStepMetric[];
  dbReady: boolean;
  serverReachable: boolean;
  serverLatencyMs: number;
  isOffline: boolean;
}

const metrics: PerformanceStepMetric[] = [];
let appStartEpoch = Date.now();

export function markAppStart(): void {
  appStartEpoch = Date.now();
  metrics.length = 0; // reset for new run
}

export function recordStepMetric(
  name: string,
  durationMs: number,
  status: 'SUCCESS' | 'WARNING' | 'ERROR' = 'SUCCESS',
  details?: string
): void {
  metrics.push({
    name,
    durationMs: Math.max(0, Math.round(durationMs)),
    timestamp: new Date().toISOString(),
    status,
    details,
  });

  if (process.env.NODE_ENV === 'development') {
    console.debug(`[Perf Tracker] Step '${name}' took ${Math.round(durationMs)}ms [${status}]`);
  }
}

export function getStartupDiagnostics(
  dbReady = true,
  serverReachable = true,
  serverLatencyMs = 0
): StartupDiagnostics {
  const totalStartupMs = Date.now() - appStartEpoch;
  return {
    appStartTime: new Date(appStartEpoch).toISOString(),
    totalStartupMs: Math.round(totalStartupMs),
    steps: [...metrics],
    dbReady,
    serverReachable,
    serverLatencyMs,
    isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  };
}
