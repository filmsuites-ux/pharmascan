/**
 * Resilient Network Client for PharmaScan
 *
 * Capabilities:
 * 1. Request timeouts with AbortController
 * 2. Exponential backoff retry for TRANSIENT errors (502, 503, 504, ECONNREFUSED, TypeError: Failed to fetch)
 * 3. Immediate rejection / zero retry for PERMANENT errors (400, 401, 403, 404, 422)
 * 4. Structured error classification: OFFLINE | TIMEOUT | SERVER_ERROR | AUTH_ERROR | CLIENT_ERROR
 * 5. Sanitized diagnostic logging without logging passwords, tokens, or pharmacy patient/financial secrets
 * 6. Server health check and roundtrip latency measurement
 */

export type NetworkErrorKind =
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'SERVER_ERROR'
  | 'AUTH_ERROR'
  | 'CLIENT_ERROR'
  | 'UNKNOWN';

export interface NetworkErrorDetails {
  kind: NetworkErrorKind;
  status?: number;
  message: string;
  isRetryable: boolean;
  endpoint: string;
  durationMs: number;
}

export class NetworkError extends Error {
  details: NetworkErrorDetails;

  constructor(details: NetworkErrorDetails) {
    super(details.message);
    this.name = 'NetworkError';
    this.details = details;
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  abortSignal?: AbortSignal;
}

export interface ServerHealthStatus {
  isOnline: boolean;
  isServerAvailable: boolean;
  hasGeminiKey: boolean;
  latencyMs: number;
  lastChecked: string;
  error?: string;
}

let lastKnownHealth: ServerHealthStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isServerAvailable: true,
  hasGeminiKey: true,
  latencyMs: 0,
  lastChecked: new Date().toISOString(),
};

const sanitizedLog = (message: string, meta?: Record<string, any>) => {
  if (process.env.NODE_ENV === 'development') {
    const sanitizedMeta = meta
      ? Object.fromEntries(
          Object.entries(meta).map(([k, v]) => {
            if (/token|auth|key|secret|password|bearer/i.test(k)) {
              return [k, '[REDACTED]'];
            }
            return [k, v];
          })
        )
      : undefined;
    console.debug(`[NetworkClient] ${message}`, sanitizedMeta || '');
  }
};

/**
 * Executes a fetch request with timeout and exponential backoff for transient errors.
 */
export async function safeFetch<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<{ data: T; status: number; durationMs: number }> {
  const {
    timeoutMs = 15000,
    maxRetries = 2,
    retryDelayMs = 800,
    abortSignal,
    ...fetchOptions
  } = options;

  let attempt = 0;
  const startTime = Date.now();

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    let timeoutId: any = null;

    // Combine caller's abortSignal if provided
    let combinedSignal: AbortSignal = controller.signal;
    if (abortSignal) {
      if (abortSignal.aborted) {
        throw new NetworkError({
          kind: 'CLIENT_ERROR',
          message: 'Request was cancelled by user.',
          isRetryable: false,
          endpoint: url,
          durationMs: Date.now() - startTime,
        });
      }
      abortSignal.addEventListener('abort', () => controller.abort());
    }

    const resolvedUrl = url.startsWith('/') && typeof window === 'undefined'
      ? `http://127.0.0.1:3000${url}`
      : url;

    timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const attemptStart = Date.now();

    try {
      const isDeviceOffline = typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isDeviceOffline) {
        throw new NetworkError({
          kind: 'OFFLINE',
          message: 'Device appears to be offline. Local pharmacy data remains fully accessible.',
          isRetryable: true,
          endpoint: resolvedUrl,
          durationMs: Date.now() - attemptStart,
        });
      }

      const response = await fetch(resolvedUrl, {
        ...fetchOptions,
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);
      const attemptDuration = Date.now() - attemptStart;

      // Handle HTTP status codes
      if (!response.ok) {
        const status = response.status;
        let errorMessage = `HTTP error ${status}`;
        try {
          const errBody = await response.json();
          if (errBody && errBody.error) {
            errorMessage = errBody.error;
          }
        } catch {
          // Non-JSON error body (e.g. gateway 504 text)
        }

        // Categorize
        if (status === 401 || status === 403) {
          throw new NetworkError({
            kind: 'AUTH_ERROR',
            status,
            message: `Authentication session expired or invalid (${status}).`,
            isRetryable: false,
            endpoint: url,
            durationMs: attemptDuration,
          });
        }

        if (status >= 400 && status < 500) {
          // Permanent client error - do NOT retry
          throw new NetworkError({
            kind: 'CLIENT_ERROR',
            status,
            message: errorMessage,
            isRetryable: false,
            endpoint: url,
            durationMs: attemptDuration,
          });
        }

        // 502, 503, 504 are transient gateway / server restart errors - retryable
        const isTransientServer = status === 502 || status === 503 || status === 504;
        throw new NetworkError({
          kind: 'SERVER_ERROR',
          status,
          message: isTransientServer
            ? `Server temporarily unavailable (${status}). It may be starting up.`
            : `Server error (${status}): ${errorMessage}`,
          isRetryable: isTransientServer,
          endpoint: url,
          durationMs: attemptDuration,
        });
      }

      // Success
      let parsedData: any;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        parsedData = await response.json();
      } else {
        parsedData = await response.text();
      }

      sanitizedLog(`Request succeeded to ${url}`, {
        durationMs: Date.now() - startTime,
        status: response.status,
      });

      return {
        data: parsedData as T,
        status: response.status,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const attemptDuration = Date.now() - attemptStart;

      let netErr: NetworkError;
      if (err instanceof NetworkError) {
        netErr = err;
      } else if (err.name === 'AbortError') {
        const isTimeout = !abortSignal?.aborted;
        netErr = new NetworkError({
          kind: isTimeout ? 'TIMEOUT' : 'CLIENT_ERROR',
          message: isTimeout
            ? `Request to server timed out after ${Math.round(timeoutMs / 1000)}s.`
            : 'Request was cancelled.',
          isRetryable: isTimeout,
          endpoint: url,
          durationMs: attemptDuration,
        });
      } else {
        // Network drop / DNS failure / failed to fetch
        const isDeviceOffline = typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false;
        netErr = new NetworkError({
          kind: isDeviceOffline ? 'OFFLINE' : 'SERVER_ERROR',
          message: isDeviceOffline
            ? 'No internet connection detected. Working in offline mode.'
            : 'Unable to connect to server. Please check your network or try again.',
          isRetryable: true,
          endpoint: resolvedUrl,
          durationMs: attemptDuration,
        });
      }

      // Check if we should retry
      if (netErr.details.isRetryable && attempt <= maxRetries) {
        const jitter = Math.random() * 200;
        const delay = retryDelayMs * Math.pow(2, attempt - 1) + jitter;
        sanitizedLog(`Retrying ${url} (attempt ${attempt}/${maxRetries}) in ${Math.round(delay)}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      sanitizedLog(`Request failed permanently to ${url}`, {
        kind: netErr.details.kind,
        status: netErr.details.status,
        totalDurationMs: Date.now() - startTime,
      });

      throw netErr;
    }
  }

  throw new NetworkError({
    kind: 'SERVER_ERROR',
    message: 'Max retry attempts exceeded.',
    isRetryable: false,
    endpoint: url,
    durationMs: Date.now() - startTime,
  });
}

/**
 * Probes server health endpoint with a quick timeout (default 3.5s).
 * Does not throw; returns structured health state.
 */
export async function checkServerHealth(timeoutMs = 3500): Promise<ServerHealthStatus> {
  const isDeviceOffline = typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false;
  if (isDeviceOffline) {
    lastKnownHealth = {
      isOnline: false,
      isServerAvailable: false,
      hasGeminiKey: false,
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      error: 'Device is offline',
    };
    return lastKnownHealth;
  }

  const start = Date.now();
  try {
    const res = await safeFetch<{ status: string; hasGeminiKey?: boolean }>('/api/health', {
      timeoutMs,
      maxRetries: 1,
      retryDelayMs: 400,
    });

    const latency = res.durationMs;
    lastKnownHealth = {
      isOnline: true,
      isServerAvailable: res.status === 200,
      hasGeminiKey: Boolean(res.data?.hasGeminiKey),
      latencyMs: latency,
      lastChecked: new Date().toISOString(),
    };
    return lastKnownHealth;
  } catch (err: any) {
    lastKnownHealth = {
      isOnline: true,
      isServerAvailable: false,
      hasGeminiKey: false,
      latencyMs: Date.now() - start,
      lastChecked: new Date().toISOString(),
      error: err.message || 'Server not responding',
    };
    return lastKnownHealth;
  }
}

/**
 * Returns the cached health status.
 */
export function getLastKnownHealth(): ServerHealthStatus {
  return lastKnownHealth;
}
