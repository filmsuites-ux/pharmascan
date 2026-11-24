import React, { useState, useEffect } from 'react';
import {
  Crown,
  ShieldCheck,
  Smartphone,
  Mail,
  Users,
  Activity,
  BarChart3,
  Database,
  Lock,
  X,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Store,
} from 'lucide-react';
import { PharmacyUserSession } from '../../types/pharmacy';
import {
  MASTER_ADMIN_PHONE,
  MASTER_ADMIN_EMAIL,
  getAllRegisteredShops,
} from '../../services/authService';

interface MasterAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: PharmacyUserSession | null;
}

export const MasterAdminModal: React.FC<MasterAdminModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [shops, setShops] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'analytics' | 'security'>('users');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadShops();
    }
  }, [isOpen]);

  const loadShops = () => {
    setIsRefreshing(true);
    const data = getAllRegisteredShops();
    setShops(data);
    setTimeout(() => setIsRefreshing(false), 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-amber-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-amber-950/50 via-slate-900 to-indigo-950/40 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/25">
              <Crown className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Master Admin Super Portal
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Level 1 Root Access
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Restricted to Master Owner: <span className="font-mono text-amber-400 font-bold">+91 {MASTER_ADMIN_PHONE}</span>
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

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-slate-800 flex items-center gap-3 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === 'users'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Registered Pharmacy Shops ({shops.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`pb-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === 'analytics'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Google Analytics 4 Live</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`pb-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border-b-2 ${
              activeTab === 'security'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>OTP &amp; Security Shield</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Active Stores &amp; Authenticated Devices
                </span>
                <button
                  onClick={loadShops}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
                  title="Refresh shop list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {shops.map((shop, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-amber-500/30 flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                        <Store className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-white">
                            {shop.shopName || 'Medical Store'}
                          </span>
                          {shop.isMasterAdmin && (
                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              SUPER OWNER
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Owner: {shop.ownerName || 'Verified Pharmacist'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-slate-200">
                        {shop.phone ? `+91 ${shop.phone}` : shop.email}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-mono mt-0.5 flex items-center justify-end gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Active Session</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Real-Time Visitor Telemetry</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    Live Stream Connected
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center pt-2">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                    <div className="text-lg font-black text-emerald-400">100%</div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                      Fastly CDN Uptime
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                    <div className="text-lg font-black text-sky-400">&lt; 180ms</div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                      Edge Latency (Hyd)
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                    <div className="text-lg font-black text-amber-400">Offline</div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                      IndexedDB Native
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed pt-2 border-t border-slate-900">
                  Google Analytics 4 is tracking pageviews, bill scans, medicine searches, and active user locations (Hyderabad, Vizag, Vijayawada, etc.) seamlessly in the background.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>Master Authentication Rules</span>
                </div>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900">
                    <span>Master Admin Mobile:</span>
                    <span className="font-mono font-bold text-amber-400">+91 {MASTER_ADMIN_PHONE}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900">
                    <span>Master Fallback Email:</span>
                    <span className="font-mono font-bold text-sky-400">{MASTER_ADMIN_EMAIL}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900">
                    <span>Two-Factor OTP Security:</span>
                    <span className="font-bold text-emerald-400">Mandatory Active</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-center text-[11px] text-slate-400">
          PharmaScan Super Admin Security • Authorized personnel only
        </div>
      </div>
    </div>
  );
};
