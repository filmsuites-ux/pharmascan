import React, { useState } from 'react';
import {
  Pill,
  Shield,
  Cloud,
  CheckCircle2,
  RefreshCw,
  Database,
  ArrowRight,
  WifiOff,
  Sparkles,
  Lock,
  Layers,
  Building2,
  CreditCard,
  FileText,
} from 'lucide-react';
import { DEFAULT_GOOGLE_USER, loginWithGoogle } from '../../services/authService';
import {
  checkForAvailableBackup,
  restorePharmacyData,
  CheckBackupResult,
} from '../../services/cloudBackupService';
import { CloudBackupSummary, PharmacyUserSession } from '../../types/pharmacy';

interface WelcomeAuthScreenProps {
  onAuthenticated: (session: PharmacyUserSession) => void;
}

export const WelcomeAuthScreen: React.FC<WelcomeAuthScreenProps> = ({
  onAuthenticated,
}) => {
  const [selectedEmail, setSelectedEmail] = useState<string>(DEFAULT_GOOGLE_USER.email);
  const [isCustomEmail, setIsCustomEmail] = useState<boolean>(false);
  const [customInputEmail, setCustomInputEmail] = useState<string>('');
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Restore detection state (Requirement 5)
  const [detectedBackup, setDetectedBackup] = useState<{
    summary: CloudBackupSummary;
    fullData: any;
  } | null>(null);
  const [isCheckingBackup, setIsCheckingBackup] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [pendingSession, setPendingSession] = useState<PharmacyUserSession | null>(null);

  const handleSignIn = async () => {
    const finalEmail = (isCustomEmail ? customInputEmail.trim() : selectedEmail).trim();
    if (!finalEmail || !finalEmail.includes('@')) {
      setAuthError('Please enter a valid Google email address.');
      return;
    }

    setAuthError(null);
    setIsSigningIn(true);

    try {
      // 1. Authenticate session locally
      const session = await loginWithGoogle({
        email: finalEmail,
        name: finalEmail === DEFAULT_GOOGLE_USER.email ? DEFAULT_GOOGLE_USER.name : finalEmail.split('@')[0],
      });

      // 2. Check for available cloud backup for this Google account (Requirement 5)
      setIsCheckingBackup(true);
      let backupCheck: CheckBackupResult = { hasBackup: false };
      try {
        backupCheck = await checkForAvailableBackup(finalEmail);
      } catch (backupErr: any) {
        console.warn('Backup check failed during sign in, continuing with local session:', backupErr);
      }
      setIsCheckingBackup(false);
      setIsSigningIn(false);

      if (backupCheck.hasBackup && backupCheck.summary) {
        setPendingSession(session);
        setDetectedBackup({
          summary: backupCheck.summary,
          fullData: backupCheck.fullData,
        });
      } else {
        // Proceed directly to main dashboard
        onAuthenticated(session);
      }
    } catch (err: any) {
      setIsSigningIn(false);
      setIsCheckingBackup(false);
      setAuthError(err.message || 'Authentication error. You can still continue in offline mode.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!detectedBackup || !pendingSession) return;
    setIsRestoring(true);
    try {
      await restorePharmacyData(detectedBackup.fullData);
      onAuthenticated(pendingSession);
    } catch (err: any) {
      setIsRestoring(false);
      setAuthError(`Restore failed: ${err.message}. You can choose "Start Fresh" to continue.`);
    }
  };

  const handleStartFresh = () => {
    if (pendingSession) {
      onAuthenticated(pendingSession);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-emerald-500 selection:text-slate-950">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 items-center justify-center shadow-xl shadow-emerald-500/20 ring-4 ring-emerald-500/10">
            <Pill className="w-8 h-8 text-slate-950 rotate-45" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase">
              WELCOME TO PHARMACY MANAGEMENT
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              PharmaScan • Offline-First Smart Purchase & Distributor Tracker
            </p>
          </div>
        </div>

        {/* Restore Prompt Screen (Requirement 5) */}
        {detectedBackup ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="p-2.5 bg-teal-500/10 text-teal-400 rounded-xl">
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Previous Cloud Backup Detected!</h2>
                <p className="text-xs text-slate-400">
                  Account: <strong className="text-slate-200">{detectedBackup.summary.userEmail}</strong>
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Backup Date &amp; Time:</span>
                <span className="font-semibold text-white font-mono">
                  {new Date(detectedBackup.summary.savedAt).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>{detectedBackup.summary.agenciesCount} Agencies</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{detectedBackup.summary.invoicesCount} Invoices</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                  <span>{detectedBackup.summary.paymentsCount} Payments</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Pill className="w-3.5 h-3.5 text-teal-400" />
                  <span>{detectedBackup.summary.medicinesCount} Medicines</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-medium text-center">
              Restore your previous pharmacy data safely without duplicates?
            </p>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Restoring Database...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Restore Previous Data</span>
                  </>
                )}
              </button>

              <button
                onClick={handleStartFresh}
                disabled={isRestoring}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-semibold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
              >
                Start Fresh (Keep Cloud Backup)
              </button>
            </div>
          </div>
        ) : (
          /* Main Google Sign-In Card */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-6">
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Select Your Google Account
              </span>

              {/* Default Account Option */}
              <div
                onClick={() => {
                  setSelectedEmail(DEFAULT_GOOGLE_USER.email);
                  setIsCustomEmail(false);
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  !isCustomEmail && selectedEmail === DEFAULT_GOOGLE_USER.email
                    ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700 font-bold text-emerald-400 text-sm">
                    G
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white">
                      {DEFAULT_GOOGLE_USER.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {DEFAULT_GOOGLE_USER.email}
                    </div>
                  </div>
                </div>
                {!isCustomEmail && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
              </div>

              {/* Option to use different Google Account */}
              <div
                onClick={() => setIsCustomEmail(true)}
                className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                  isCustomEmail
                    ? 'bg-emerald-950/30 border-emerald-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Sign in with another Google account</span>
                  {isCustomEmail && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                </div>

                {isCustomEmail && (
                  <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="email"
                      placeholder="yourname@gmail.com"
                      value={customInputEmail}
                      onChange={(e) => setCustomInputEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {authError && (
              <div className="p-3.5 bg-red-950/40 border border-red-800 text-red-300 rounded-xl text-xs space-y-2">
                <p className="font-medium">{authError}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleSignIn}
                    className="px-3 py-1 bg-red-900/60 hover:bg-red-800 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    Retry Connection
                  </button>
                  <button
                    onClick={async () => {
                      const finalEmail = (isCustomEmail ? customInputEmail.trim() : selectedEmail).trim();
                      if (finalEmail) {
                        const session = await loginWithGoogle({ email: finalEmail });
                        onAuthenticated(session);
                      }
                    }}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-medium cursor-pointer transition-colors"
                  >
                    Continue in Offline Mode
                  </button>
                </div>
              </div>
            )}

            {/* Prominent Google Sign-In Button */}
            <button
              onClick={handleSignIn}
              disabled={isSigningIn || isCheckingBackup}
              className="w-full py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs rounded-xl shadow-lg shadow-white/10 flex items-center justify-center gap-3 transition-all transform active:scale-98 cursor-pointer disabled:opacity-60"
            >
              {isSigningIn || isCheckingBackup ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                  <span>Connecting Google Account...</span>
                </>
              ) : (
                <>
                  {/* Google SVG Logo */}
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span className="font-extrabold tracking-wide">Sign in with Google</span>
                </>
              )}
            </button>

            {/* Offline & Security Guarantee */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <WifiOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  <strong>100% Offline Capable:</strong> Google sign-in is NOT required for daily pharmacy work after initial setup.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>
                  <strong>Zero Password Storage:</strong> Passwords are never stored on device. Used solely for Cloud Backup &amp; Device Replacement.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
