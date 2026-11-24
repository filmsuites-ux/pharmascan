import React, { useState, useEffect } from 'react';
import {
  Camera,
  Search,
  Bell,
  Building2,
  FileText,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Pill,
  BarChart3,
  Wifi,
  WifiOff,
  Sparkles,
  Smartphone,
  RotateCcw,
  LogOut,
  Store,
  Crown,
  ShieldCheck,
} from 'lucide-react';
import { OverallStats, PharmacyUserSession } from '../types/pharmacy';
import { NotificationDrawer } from './notifications/NotificationDrawer';
import { GlobalSearchModal } from './search/GlobalSearchModal';
import { Cloud } from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenScanner: () => void;
  stats: OverallStats | null;
  currentUser?: PharmacyUserSession | null;
  onOpenCloudBackup?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenShareApk?: () => void;
  onOpenDatabaseReset?: () => void;
  onOpenShopVault?: () => void;
  onOpenMasterAdmin?: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenScanner,
  stats,
  currentUser,
  onOpenCloudBackup,
  onOpenDiagnostics,
  onOpenShareApk,
  onOpenDatabaseReset,
  onOpenShopVault,
  onOpenMasterAdmin,
  onLogout,
}) => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const totalAlertsCount =
    (stats?.expiredCount || 0) +
    (stats?.criticalExpiryCount || 0) +
    (stats?.priceHikesCount || 0);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'orders', label: 'Smart Orders' },
    { id: 'schedule', label: 'Visits Schedule' },
    { id: 'agencies', label: 'Agencies' },
    { id: 'documents', label: 'Documents' },
    { id: 'payments', label: 'Payments' },
    {
      id: 'price_changes',
      label: 'Price Changes',
      badge: stats?.priceHikesCount ? stats.priceHikesCount : undefined,
      badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
    },
    {
      id: 'expiry',
      label: 'Near Expiry',
      badge: stats?.nearExpiryCount ? stats.nearExpiryCount : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    { id: 'medicines', label: 'Medicines' },
    { id: 'reports', label: 'Reports' },
  ];

  return (
    <>
      <header className="spatial-dock sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Left: Brand Identity & Shop Name */}
            <div className="flex items-center gap-3 shrink-0">
              <div
                onClick={() => onNavigate('dashboard')}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/25 border border-sky-400/30 group-hover:scale-105 transition-transform">
                  <Pill className="w-5 h-5 text-white rotate-45 stroke-[2.2]" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-black text-lg tracking-tight">
                      Pharma<span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-teal-300">Scan</span>
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-400/25 uppercase tracking-wider">
                      Spatial
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    Pharmacy Intelligence &amp; Ledger
                  </div>
                </div>
              </div>

              {/* Verified Shop Name Badge */}
              <button
                type="button"
                onClick={onOpenShopVault}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-emerald-500/30 text-white text-xs cursor-pointer group shadow-sm transition-all"
                title="View Pharmacy Registration & Form 20/21 Drug Licenses"
              >
                <Store className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="font-extrabold text-[11px] text-emerald-300">
                  {currentUser?.shopName || 'Srikrishna Medical'}
                </span>
                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Verified
                </span>
              </button>
            </div>

            {/* Center-Right Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-sky-500/15 text-sky-300 border border-sky-400/30 shadow-[0_2px_12px_rgba(56,189,248,0.2)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${item.badgeColor}`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right: Search, Notifications & THE PROMINENT "SCAN BILL" BUTTON */}
            <div className="flex items-center gap-2">
              {/* Global Search Trigger */}
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 bg-slate-900/70 hover:bg-slate-800/80 text-slate-400 hover:text-white rounded-xl border border-white/10 transition-colors flex items-center gap-2 text-xs cursor-pointer shadow-sm"
                title="Search medicines, bills, batches (Cmd+K)"
              >
                <Search className="w-4 h-4 text-sky-400" />
                <span className="hidden xl:inline text-slate-400 font-mono text-[11px]">
                  Search...
                </span>
              </button>

              {/* Offline / Online Indicator */}
              <button
                onClick={onOpenDiagnostics}
                className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-medium border transition-colors cursor-pointer ${
                  isOnline
                    ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-500/30'
                }`}
                title={isOnline ? 'Online • Click for Server Latency & Diagnostics' : 'Offline • Local Database Active (Click for Details)'}
              >
                {isOnline ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-amber-400" />}
                <span>{isOnline ? 'Sync Ready' : 'Offline Safe'}</span>
              </button>

              {/* Notification Bell */}
              <button
                onClick={() => setShowNotifications(true)}
                className="relative p-2 bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 hover:text-white rounded-xl border border-white/10 transition-colors cursor-pointer"
                title="Pharmacy Expiry & Price Alerts"
              >
                <Bell className="w-4 h-4 text-slate-300" />
                {totalAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white font-bold text-[9px] rounded-full flex items-center justify-center animate-pulse shadow-md shadow-rose-500/50">
                    {totalAlertsCount}
                  </span>
                )}
              </button>

              {/* Google Cloud Backup & Account Button */}
              {onOpenCloudBackup && (
                <button
                  onClick={onOpenCloudBackup}
                  className="px-2.5 py-1.5 bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-teal-400/40 transition-all flex items-center gap-1.5 text-xs cursor-pointer group shadow-sm"
                  title="Google Account & Cloud Backup"
                >
                  <Cloud className="w-4 h-4 text-teal-400 group-hover:scale-110 transition-transform" />
                  <span className="hidden xl:inline text-[11px] font-semibold text-slate-300">
                    {currentUser?.name ? currentUser.name.split(' ')[0] : 'Cloud Sync'}
                  </span>
                </button>
              )}

              {/* Share APK Button */}
              {onOpenShareApk && (
                <button
                  onClick={onOpenShareApk}
                  className="px-2.5 py-1.5 bg-slate-900/70 hover:bg-slate-800/80 text-slate-300 hover:text-white rounded-xl border border-white/10 hover:border-sky-400/40 transition-all flex items-center gap-1.5 text-xs cursor-pointer group shadow-sm"
                  title="Download & Share APK / Multi-Device App"
                >
                  <Smartphone className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                  <span className="hidden sm:inline text-[11px] font-semibold text-slate-300">
                    APK / App
                  </span>
                </button>
              )}

              {/* Verified Database Reset Button */}
              {onOpenDatabaseReset && (
                <button
                  onClick={onOpenDatabaseReset}
                  className="px-2 py-1.5 bg-slate-900/70 hover:bg-slate-800/80 text-slate-400 hover:text-amber-400 rounded-xl border border-white/10 hover:border-amber-500/30 transition-all flex items-center gap-1.5 text-xs cursor-pointer group"
                  title="Reset Database & Clean Start"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400/80 group-hover:-rotate-90 transition-transform" />
                  <span className="hidden xl:inline text-[11px] font-semibold text-slate-400">
                    Reset
                  </span>
                </button>
              )}

              {/* Master Admin Portal Trigger (Visible for 8008856166 or isMasterAdmin) */}
              {(currentUser?.isMasterAdmin || currentUser?.phone === '8008856166') && onOpenMasterAdmin && (
                <button
                  type="button"
                  onClick={onOpenMasterAdmin}
                  className="px-2.5 py-1.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-yellow-500/30 text-amber-300 hover:text-white rounded-xl border border-amber-500/40 transition-all flex items-center gap-1.5 text-xs cursor-pointer shadow-sm shadow-amber-950/40"
                  title="Master Admin Super Portal (+91 8008856166)"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline text-[11px] font-black tracking-wide text-amber-200">
                    Admin
                  </span>
                </button>
              )}

              {/* Dedicated User Logout Button */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white rounded-xl border border-rose-500/30 hover:border-rose-400/60 transition-all flex items-center gap-1.5 text-xs cursor-pointer group shadow-sm shadow-rose-950/40"
                  title="Logout from Pharmacy Session"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span className="hidden sm:inline text-[11px] font-bold text-rose-200">
                    Logout
                  </span>
                </button>
              )}

              {/* ============================================================== */}
              {/* THE PROMINENT "SCAN BILL" BUTTON (Spatial Cyan-Blue Glow) */}
              {/* ============================================================== */}
              <button
                onClick={onOpenScanner}
                className="px-4 py-2 bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-sky-500/25 flex items-center gap-2 transition-all transform active:scale-95 border border-sky-300/40 cursor-pointer"
              >
                <Camera className="w-4 h-4 stroke-[2.5]" />
                <span className="hidden sm:inline">SCAN BILL</span>
                <span className="sm:hidden">SCAN</span>
              </button>
            </div>
          </div>

          {/* Mobile Secondary Nav */}
          <div className="flex lg:hidden overflow-x-auto py-2 border-t border-white/5 gap-1.5 scrollbar-none items-center">
            {onLogout && (
              <button
                onClick={onLogout}
                className="px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap bg-rose-950/70 hover:bg-rose-900/80 text-rose-300 border border-rose-500/40 flex items-center gap-1 shrink-0 cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-3 h-3 text-rose-400" />
                <span>Logout</span>
              </button>
            )}
            {onOpenShareApk && (
              <button
                onClick={onOpenShareApk}
                className="px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap bg-sky-950/70 hover:bg-sky-900/80 text-sky-300 border border-sky-500/40 flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                <span>APK / App</span>
              </button>
            )}
            {navItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                    isActive
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="text-[9px] px-1 rounded-full bg-slate-900 text-white font-bold">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Slide-out notification drawer */}
      <NotificationDrawer
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        stats={stats}
        onNavigate={onNavigate}
      />

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onSelectAgency={(id) => onNavigate('agencies')}
      />
    </>
  );
};
