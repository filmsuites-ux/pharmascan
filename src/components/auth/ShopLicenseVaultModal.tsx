import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  Phone,
  FileCheck2,
  Award,
  Calendar,
  Lock,
  KeyRound,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { PharmacyUserSession } from '../../types/pharmacy';
import { generateVerificationOtp, verifyOtp } from '../../services/authService';

interface ShopLicenseVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PharmacyUserSession | null;
  onUpdateShopInfo?: (updatedSession: PharmacyUserSession) => void;
}

export const ShopLicenseVaultModal: React.FC<ShopLicenseVaultModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdateShopInfo,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [shopName, setShopName] = useState(currentUser?.shopName || 'Jaya Medical Store');
  const [phone, setPhone] = useState(currentUser?.phone || '8008856166');
  const [pharmacistName, setPharmacistName] = useState(
    currentUser?.drugLicenses?.pharmacistName || 'P. Jaya Vardhan'
  );
  const [form20, setForm20] = useState(currentUser?.drugLicenses?.form20 || 'TS/HYD/20B/2026/8941');
  const [form21, setForm21] = useState(currentUser?.drugLicenses?.form21 || 'TS/HYD/21B/2026/8942');
  const [regNo, setRegNo] = useState(currentUser?.drugLicenses?.pharmacistRegNo || 'PCI-TS-89412');

  // OTP state for saving modifications
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [generatedOtpDisplay, setGeneratedOtpDisplay] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSendOtp = () => {
    const cleanPhone = phone.replace(/\D/g, '') || '8008856166';
    const res = generateVerificationOtp(cleanPhone);
    setGeneratedOtpDisplay(res.otp);
    setOtpSent(true);
    setOtpError(null);
  };

  const handleSaveWithOtp = () => {
    const cleanPhone = phone.replace(/\D/g, '') || '8008856166';
    if (!verifyOtp(cleanPhone, otpValue)) {
      setOtpError('Invalid OTP code. Please enter the 6-digit code shown.');
      return;
    }

    if (currentUser && onUpdateShopInfo) {
      const updated: PharmacyUserSession = {
        ...currentUser,
        shopName,
        phone: cleanPhone,
        drugLicenses: {
          ...currentUser.drugLicenses,
          form20,
          form21,
          pharmacistName,
          pharmacistRegNo: regNo,
        },
      };
      onUpdateShopInfo(updated);
      try {
        localStorage.setItem('pharmascan_auth_session', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to update session:', err);
      }
    }
    setIsEditing(false);
    setOtpSent(false);
    setOtpValue('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-emerald-950/60 via-slate-900 to-teal-950/40 border-b border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Drug License &amp; Shop Vault
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Verified Legal Compliance
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Pharmacy Act &amp; Drugs and Cosmetics Rules 1945
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Shop Header Card */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Authorized Medical Store</div>
                <div className="text-base font-extrabold text-white">
                  {currentUser?.shopName || 'Jaya Medical Store'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Owner Mobile</div>
              <div className="text-xs font-mono font-bold text-emerald-400">
                +91 {currentUser?.phone || '8008856166'}
              </div>
            </div>
          </div>

          {/* Licenses Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Form 20 */}
            <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                  Form 20 License
                </span>
                <button
                  onClick={() => handleCopy(form20, 'form20')}
                  className="text-slate-500 hover:text-emerald-400 transition-colors cursor-pointer"
                  title="Copy License Number"
                >
                  {copiedField === 'form20' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="font-mono text-xs font-extrabold text-white tracking-wide">
                {form20}
              </div>
              <div className="text-[10px] text-emerald-400/80 mt-1">Retail Drug License (Allopathic)</div>
            </div>

            {/* Form 21 */}
            <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                  Form 21 License
                </span>
                <button
                  onClick={() => handleCopy(form21, 'form21')}
                  className="text-slate-500 hover:text-emerald-400 transition-colors cursor-pointer"
                  title="Copy License Number"
                >
                  {copiedField === 'form21' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="font-mono text-xs font-extrabold text-white tracking-wide">
                {form21}
              </div>
              <div className="text-[10px] text-emerald-400/80 mt-1">Schedule C &amp; C(1) Biologicals</div>
            </div>

            {/* Registered Pharmacist */}
            <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-sky-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-sky-400" />
                  Registered Pharmacist
                </span>
                <button
                  onClick={() => handleCopy(pharmacistName, 'pharmacist')}
                  className="text-slate-500 hover:text-sky-400 transition-colors cursor-pointer"
                >
                  {copiedField === 'pharmacist' ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="text-xs font-extrabold text-white">
                {pharmacistName}
              </div>
              <div className="text-[10px] text-sky-400/80 mt-1">Reg No: {regNo}</div>
            </div>

            {/* Validity / Renewal */}
            <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-amber-500/30 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  Renewal Status
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                  Active
                </span>
              </div>
              <div className="text-xs font-extrabold text-white">
                Valid Till: 31-Dec-2028
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Govt. Drug Control Dept.</div>
            </div>
          </div>

          {/* Edit Form with OTP Guard */}
          {isEditing ? (
            <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <KeyRound className="w-4 h-4" />
                <span>Modify Shop Credentials (OTP Protected)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Shop Name</label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Owner Mobile</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              {otpSent && generatedOtpDisplay && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between text-emerald-300 font-bold">
                    <span>SMS OTP Sent to +91 {phone}</span>
                    <span className="text-[10px] font-mono bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-200">
                      Code: {generatedOtpDisplay}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Enter the 6-digit OTP code below to confirm license modifications.
                  </p>
                </div>
              )}

              {otpSent ? (
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value)}
                    className="w-40 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono text-base font-bold text-white tracking-widest outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleSaveWithOtp}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Confirm &amp; Update
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setOtpSent(false);
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSendOtp}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Send Verification OTP</span>
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {otpError && (
                <div className="text-xs text-rose-400 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{otpError}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-400">Need to update registration or licenses?</span>
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold cursor-pointer transition-colors"
              >
                Edit with OTP
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-center text-[11px] text-slate-400">
          PharmaScan Vault protects your Drug Inspector inspections and GST billing audit records.
        </div>
      </div>
    </div>
  );
};
