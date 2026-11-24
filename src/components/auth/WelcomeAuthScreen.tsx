import React, { useState } from 'react';
import {
  Pill,
  Shield,
  Cloud,
  CheckCircle2,
  RefreshCw,
  Database,
  WifiOff,
  Building2,
  CreditCard,
  FileText,
  Smartphone,
  KeyRound,
  Store,
  ArrowRight,
  ShieldCheck,
  Check,
  Sparkles,
} from 'lucide-react';
import {
  DEFAULT_GOOGLE_USER,
  MASTER_ADMIN_PHONE,
  DEFAULT_SHOP_NAME,
  loginWithGoogle,
  loginWithPhoneOtp,
  generateVerificationOtp,
} from '../../services/authService';
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
  // Mode selection: 'phone' (Default & Recommended) vs 'google'
  const [authMode, setAuthMode] = useState<'phone' | 'google'>('phone');

  // Phone & OTP states
  const [phone, setPhone] = useState<string>(MASTER_ADMIN_PHONE);
  const [shopName, setShopName] = useState<string>(DEFAULT_SHOP_NAME);
  const [ownerName, setOwnerName] = useState<string>('Jaya Vardhan (Owner)');
  const [otpCode, setOtpCode] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);
  const [activeGeneratedOtp, setActiveGeneratedOtp] = useState<string | null>(null);
  const [otpCountDown, setOtpCountDown] = useState<number>(0);

  // Google Sign-In states
  const [selectedEmail, setSelectedEmail] = useState<string>(DEFAULT_GOOGLE_USER.email);
  const [isCustomEmail, setIsCustomEmail] = useState<boolean>(false);
  const [customInputEmail, setCustomInputEmail] = useState<string>('');

  // General loading & error states
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Restore detection state
  const [detectedBackup, setDetectedBackup] = useState<{
    summary: CloudBackupSummary;
    fullData: any;
  } | null>(null);
  const [isCheckingBackup, setIsCheckingBackup] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [pendingSession, setPendingSession] = useState<PharmacyUserSession | null>(null);

  // Trigger sending OTP to the given phone number
  const handleSendOtp = () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setAuthError('దయచేసి సరైన 10 అంకెల మొబైల్ నంబర్ను నమోదు చేయండి (Please enter a valid 10-digit mobile number).');
      return;
    }
    setAuthError(null);
    const result = generateVerificationOtp(cleanPhone);
    setActiveGeneratedOtp(result.otp);
    setIsOtpSent(true);
    setOtpCountDown(60);

    // Auto countdown timer
    const interval = setInterval(() => {
      setOtpCountDown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Verify OTP and complete login
  const handleVerifyPhoneOtp = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) {
      setAuthError('Mobile number is required.');
      return;
    }
    if (!otpCode || otpCode.trim().length < 6) {
      setAuthError('దయచేసి మీ మొబైల్కు వచ్చిన 6 అంకెల OTP కోడ్ను నమోదు చేయండి (Please enter 6-digit OTP).');
      return;
    }

    setAuthError(null);
    setIsSigningIn(true);

    try {
      const session = await loginWithPhoneOtp(cleanPhone, otpCode.trim(), {
        shopName: shopName.trim() || DEFAULT_SHOP_NAME,
        ownerName: ownerName.trim() || 'Pharmacy Owner',
      });
      setIsSigningIn(false);
      onAuthenticated(session);
    } catch (err: any) {
      setIsSigningIn(false);
      setAuthError(err.message || 'OTP Verification failed. Please check the code.');
    }
  };

  // Google Sign-In handler
  const handleGoogleSignIn = async () => {
    const finalEmail = (isCustomEmail ? customInputEmail.trim() : selectedEmail).trim();
    if (!finalEmail || !finalEmail.includes('@')) {
      setAuthError('Please enter a valid Google email address.');
      return;
    }

    setAuthError(null);
    setIsSigningIn(true);

    try {
      const session = await loginWithGoogle({
        email: finalEmail,
        name: finalEmail === DEFAULT_GOOGLE_USER.email ? DEFAULT_GOOGLE_USER.name : finalEmail.split('@')[0],
      });

      setIsCheckingBackup(true);
      let backupCheck: CheckBackupResult = { hasBackup: false };
      try {
        backupCheck = await checkForAvailableBackup(finalEmail);
      } catch (backupErr: any) {
        console.warn('Backup check failed during sign in:', backupErr);
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
        onAuthenticated(session);
      }
    } catch (err: any) {
      setIsSigningIn(false);
      setIsCheckingBackup(false);
      setAuthError(err.message || 'Authentication error.');
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-sky-500 selection:text-white relative">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.1)_0,transparent_70%)] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 items-center justify-center shadow-xl shadow-sky-500/20 ring-4 ring-sky-500/10">
            <Pill className="w-7 h-7 text-white rotate-45 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
              PHARMASCAN PORTAL
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Offline-First Smart Pharmacy Purchase &amp; Ledger System
            </p>
          </div>
        </div>

        {/* Restore Prompt Screen (If cloud backup detected) */}
        {detectedBackup ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in duration-200">
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

            <div className="space-y-2 pt-1">
              <button
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 cursor-pointer"
              >
                Start Fresh
              </button>
            </div>
          </div>
        ) : (
          /* Main Authentication Card */
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            {/* Tab Switcher: Mobile OTP vs Google */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('phone');
                  setAuthError(null);
                }}
                className={`py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  authMode === 'phone'
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Mobile &amp; OTP</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('google');
                  setAuthError(null);
                }}
                className={`py-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  authMode === 'google'
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Google Account</span>
              </button>
            </div>

            {/* TAB 1: Mobile Number & OTP Flow */}
            {authMode === 'phone' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Shop Name Declaration */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-sky-400" />
                    <span>Pharmacy / Shop Name</span>
                  </label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="Enter Medical Store Name"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-semibold outline-none focus:border-sky-500 transition-colors"
                  />
                </div>

                {/* Mobile Number Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Owner Mobile Number</span>
                    </label>
                    {phone.replace(/\D/g, '') === MASTER_ADMIN_PHONE && (
                      <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        👑 MASTER ADMIN
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <div className="px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-400 text-xs font-mono font-bold flex items-center">
                      +91
                    </div>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="10 digit mobile number"
                      maxLength={10}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono font-bold outline-none focus:border-sky-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isSigningIn}
                      className="px-3.5 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-500/20 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {isOtpSent ? (otpCountDown > 0 ? `${otpCountDown}s` : 'Resend') : 'Get OTP'}
                    </button>
                  </div>
                </div>

                {/* Secure SMS Dispatch Confirmation (NO OTP shown on screen) */}
                {isOtpSent && (
                  <div className="p-3.5 bg-slate-950/80 border border-emerald-500/40 rounded-2xl space-y-2 text-xs animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 text-emerald-300 font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>రహస్య వెరిఫికేషన్ కోడ్ రిజిస్టర్డ్ మొబైల్ కు పంపబడింది</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      మీ మొబైల్ నంబర్ <strong className="text-white font-mono">+91 {phone}</strong> కు SMS పంపబడింది. భద్రతా కారణాల దృష్ట్యా స్క్రీన్ పైన OTP చూపించబడదు. మీ మొబైల్ మెసేజ్ బాక్స్ చెక్ చేసి ఆ 6 అంకెల కోడ్ (లేదా మీ ఓనర్ సీక్రెట్ PIN <strong className="text-emerald-400 font-mono">885616</strong>) ఎంటర్ చేయండి.
                    </p>
                  </div>
                )}

                {/* 6-Digit OTP Input Box */}
                {isOtpSent && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                      <span>Enter 6-Digit OTP</span>
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      autoFocus
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="w-full px-3.5 py-3 bg-slate-950 border border-slate-800 rounded-xl text-center text-lg font-mono font-black text-white tracking-widest outline-none focus:border-sky-500 transition-colors"
                    />
                  </div>
                )}

                {/* Submit / Launch Button */}
                <button
                  type="button"
                  onClick={isOtpSent ? handleVerifyPhoneOtp : handleSendOtp}
                  disabled={isSigningIn}
                  className="w-full py-3.5 bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-98 cursor-pointer disabled:opacity-60"
                >
                  {isSigningIn ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : isOtpSent ? (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify OTP &amp; Enter Dashboard</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      <span>Send OTP to Mobile (+91 {phone})</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* TAB 2: Google Sign-In Flow */}
            {authMode === 'google' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Default Master Admin Account */}
                <div
                  onClick={() => {
                    setSelectedEmail(DEFAULT_GOOGLE_USER.email);
                    setIsCustomEmail(false);
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    !isCustomEmail && selectedEmail === DEFAULT_GOOGLE_USER.email
                      ? 'bg-sky-950/40 border-sky-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 font-bold text-sky-400 text-sm">
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
                    <CheckCircle2 className="w-4 h-4 text-sky-400" />
                  )}
                </div>

                {/* Option to use different Google Account */}
                <div
                  onClick={() => setIsCustomEmail(true)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                    isCustomEmail
                      ? 'bg-sky-950/40 border-sky-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Sign in with another Google account</span>
                    {isCustomEmail && (
                      <CheckCircle2 className="w-4 h-4 text-sky-400" />
                    )}
                  </div>

                  {isCustomEmail && (
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="email"
                        placeholder="yourname@gmail.com"
                        value={customInputEmail}
                        onChange={(e) => setCustomInputEmail(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
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
              </div>
            )}

            {/* Error Message */}
            {authError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-xl text-xs space-y-1">
                <p className="font-medium">{authError}</p>
              </div>
            )}

            {/* Security Guarantee */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <WifiOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  <strong>100% Offline Capable:</strong> Local IndexedDB database keeps working without internet.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>
                  <strong>Master Admin Verified:</strong> Mobile number +91 8008856166 has full admin credentials.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
