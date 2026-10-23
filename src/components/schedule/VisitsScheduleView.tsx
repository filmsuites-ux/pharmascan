import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Building2,
  IndianRupee,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Edit2,
  Plus,
  ArrowRight,
  Bell,
  Wallet,
  FileText,
  CreditCard,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Info,
} from 'lucide-react';
import { Agency, AgencySchedule, Invoice, Payment } from '../../types/pharmacy';
import {
  formatScheduleDate,
  getAllAgencySchedules,
  getAppTodayDate,
  getScheduleReminderSettings,
  groupAgencySchedules,
  saveScheduleReminderSettings,
  ScheduleReminderSettings,
} from '../../services/scheduleService';
import { getAgencies, getInvoices, getPayments } from '../../db/indexedDb';
import { EditScheduleModal } from './EditScheduleModal';

interface VisitsScheduleViewProps {
  onSelectAgency?: (agencyId: string) => void;
  onScanBill?: () => void;
}

export const VisitsScheduleView: React.FC<VisitsScheduleViewProps> = ({
  onSelectAgency,
  onScanBill,
}) => {
  const [schedules, setSchedules] = useState<AgencySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<
    'ALL' | 'TODAY' | 'TOMORROW' | 'DAY_AFTER' | 'NEXT_7_DAYS' | 'IRREGULAR' | 'NEEDS_DATA' | 'MANUAL'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAgencyId, setExpandedAgencyId] = useState<string | null>(null);

  // Edit modal
  const [editingSchedule, setEditingSchedule] = useState<AgencySchedule | null>(null);

  // Reminders settings
  const [reminderSettings, setReminderSettings] = useState<ScheduleReminderSettings>(
    getScheduleReminderSettings()
  );
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const [agencies, invoices, payments] = await Promise.all([
        getAgencies(),
        getInvoices(),
        getPayments(),
      ]);
      const data = await getAllAgencySchedules(agencies, invoices, payments);
      setSchedules(data);
    } catch (err) {
      console.error('Failed to load agency schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const handleSaveReminderSettings = (newSettings: ScheduleReminderSettings) => {
    setReminderSettings(newSettings);
    saveScheduleReminderSettings(newSettings);
  };

  const handleRequestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        handleSaveReminderSettings({ ...reminderSettings, browserNotifications: true });
        new Notification('PharmaScan Visit Reminders Enabled', {
          body: 'You will receive reminders on agency visit dates.',
        });
      }
    }
  };

  const grouped = groupAgencySchedules(schedules);
  const todayStr = getAppTodayDate();

  // Filtered schedules
  const filteredSchedules = schedules.filter((s) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!s.agencyName.toLowerCase().includes(q)) {
        return false;
      }
    }

    // Tab filter
    if (activeFilter === 'TODAY') {
      return (s.daysUntilNextVisit ?? 999) <= 0 && s.nextExpectedDate !== null;
    }
    if (activeFilter === 'TOMORROW') {
      return s.daysUntilNextVisit === 1;
    }
    if (activeFilter === 'DAY_AFTER') {
      return s.daysUntilNextVisit === 2;
    }
    if (activeFilter === 'NEXT_7_DAYS') {
      const d = s.daysUntilNextVisit ?? 999;
      return d >= 0 && d <= 7 && s.nextExpectedDate !== null;
    }
    if (activeFilter === 'IRREGULAR') {
      return s.isIrregular;
    }
    if (activeFilter === 'NEEDS_DATA') {
      return s.statusLabel === 'Not Enough Data';
    }
    if (activeFilter === 'MANUAL') {
      return s.isManualOverride;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Executive Header Banner */}
      <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded-full border border-teal-500/20 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Historical Pattern Intelligence
            </span>
            <span className="text-xs text-slate-400">
              • Today: <strong>{formatScheduleDate(todayStr)}</strong>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Agency Visit &amp; Payment Schedule Tracker
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Learns distributor recurring visit patterns from historical purchase bills and payment receipts. Predicts who is expected today, tomorrow, and upcoming payment cashflow requirements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowNotificationBanner(!showNotificationBanner)}
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
              reminderSettings.enabled
                ? 'bg-slate-800 hover:bg-slate-700 text-teal-300 border-teal-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <Bell className="w-4 h-4 text-teal-400" />
            <span>Reminders: {reminderSettings.enabled ? 'Active' : 'Off'}</span>
          </button>

          {onScanBill && (
            <button
              onClick={onScanBill}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              Scan New Document
            </button>
          )}
        </div>
      </div>

      {/* Optional Reminders Configuration Banner (Requirement 13) */}
      {showNotificationBanner && (
        <div className="p-4 bg-slate-900 border border-teal-500/30 rounded-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Bell className="w-4 h-4 text-teal-400" />
              <span>Agency Visit Notification Preferences</span>
            </div>
            <button
              onClick={() => setShowNotificationBanner(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderSettings.enabled}
                onChange={(e) =>
                  handleSaveReminderSettings({ ...reminderSettings, enabled: e.target.checked })
                }
                className="rounded border-slate-700 text-teal-500 focus:ring-teal-400 bg-slate-900"
              />
              <div>
                <div className="font-semibold text-white">Expected Today Reminders</div>
                <div className="text-[11px] text-slate-400">Shows reminder on arrival day with outstanding balance</div>
              </div>
            </label>

            <label className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderSettings.oneDayBefore}
                onChange={(e) =>
                  handleSaveReminderSettings({ ...reminderSettings, oneDayBefore: e.target.checked })
                }
                className="rounded border-slate-700 text-teal-500 focus:ring-teal-400 bg-slate-900"
              />
              <div>
                <div className="font-semibold text-white">1-Day Advance Reminder</div>
                <div className="text-[11px] text-slate-400">Alerts you the day before to prepare cash / cheques</div>
              </div>
            </label>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Browser Notifications</div>
                <div className="text-[11px] text-slate-400">
                  {reminderSettings.browserNotifications ? 'Permission active' : 'Optional system push alerts'}
                </div>
              </div>
              {!reminderSettings.browserNotifications && (
                <button
                  type="button"
                  onClick={handleRequestBrowserPermission}
                  className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 font-semibold rounded-lg border border-teal-500/40 text-[11px]"
                >
                  Enable
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4 CORE METRIC CARDS (Requirements 5 & 12) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today */}
        <div
          onClick={() => setActiveFilter('TODAY')}
          className={`spatial-stat-card p-4 rounded-2xl cursor-pointer transition-all ${
            activeFilter === 'TODAY'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/10'
              : 'hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              Expected Today
            </span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">
            {grouped.today.length} <span className="text-xs font-semibold text-slate-400 font-sans">Agencies</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {grouped.today.length > 0
              ? grouped.today.map((s) => s.agencyName).slice(0, 2).join(', ') + (grouped.today.length > 2 ? '...' : '')
              : 'No visits expected today'}
          </div>
        </div>

        {/* Card 2: Tomorrow */}
        <div
          onClick={() => setActiveFilter('TOMORROW')}
          className={`spatial-stat-card p-4 rounded-2xl cursor-pointer transition-all ${
            activeFilter === 'TOMORROW'
              ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-lg shadow-teal-500/10'
              : 'hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider">
              Expected Tomorrow
            </span>
            <div className="p-2 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">
            {grouped.tomorrow.length} <span className="text-xs font-semibold text-slate-400 font-sans">Agencies</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {grouped.tomorrow.length > 0
              ? grouped.tomorrow.map((s) => s.agencyName).slice(0, 2).join(', ') + (grouped.tomorrow.length > 2 ? '...' : '')
              : 'No visits scheduled tomorrow'}
          </div>
        </div>

        {/* Card 3: Day After Tomorrow */}
        <div
          onClick={() => setActiveFilter('DAY_AFTER')}
          className={`spatial-stat-card p-4 rounded-2xl cursor-pointer transition-all ${
            activeFilter === 'DAY_AFTER'
              ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg shadow-blue-500/10'
              : 'hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
              Day After Tomorrow
            </span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">
            {grouped.dayAfterTomorrow.length} <span className="text-xs font-semibold text-slate-400 font-sans">Agencies</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {grouped.dayAfterTomorrow.length > 0
              ? grouped.dayAfterTomorrow.map((s) => s.agencyName).slice(0, 2).join(', ') + (grouped.dayAfterTomorrow.length > 2 ? '...' : '')
              : 'No visits scheduled'}
          </div>
        </div>

        {/* Card 4: Upcoming Outstanding Payment Requirement (Requirement 12) */}
        <div className="spatial-stat-card p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              Expected Soon Balance
            </span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono tabular-nums tracking-tight mt-1">
            ₹{grouped.totalOutstandingSoon.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Total dues for agencies expected in next 2 days
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* UPCOMING AGENCY PAYMENTS PLANNING LIST (Requirement 12) */}
      {/* ========================================================================= */}
      {(grouped.today.length > 0 || grouped.tomorrow.length > 0 || grouped.dayAfterTomorrow.length > 0) && (
        <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Upcoming Agency Payments Planning
              </h2>
            </div>
            <div className="text-xs font-mono font-bold text-slate-300">
              Expected Outstanding for Upcoming Visits:{' '}
              <span className="text-emerald-400 font-black">
                ₹{grouped.totalOutstandingSoon.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Today's Payments */}
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 border-b border-slate-800/60 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  TODAY
                </span>
                <span>₹{grouped.today.reduce((sum, a) => sum + a.outstandingBalance, 0).toLocaleString('en-IN')}</span>
              </div>
              {grouped.today.length === 0 ? (
                <div className="text-slate-500 py-2 text-center text-[11px]">No agency visits today</div>
              ) : (
                <div className="space-y-1.5">
                  {grouped.today.map((ag, idx) => (
                    <div key={ag.agencyId} className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-200 truncate max-w-[140px]">
                        {idx + 1}. {ag.agencyName}
                      </span>
                      <span className="font-mono font-bold text-emerald-400">
                        ₹{ag.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tomorrow's Payments */}
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-teal-400 border-b border-slate-800/60 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-teal-400" />
                  TOMORROW
                </span>
                <span>₹{grouped.tomorrow.reduce((sum, a) => sum + a.outstandingBalance, 0).toLocaleString('en-IN')}</span>
              </div>
              {grouped.tomorrow.length === 0 ? (
                <div className="text-slate-500 py-2 text-center text-[11px]">No agency visits tomorrow</div>
              ) : (
                <div className="space-y-1.5">
                  {grouped.tomorrow.map((ag, idx) => (
                    <div key={ag.agencyId} className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-200 truncate max-w-[140px]">
                        {idx + 1}. {ag.agencyName}
                      </span>
                      <span className="font-mono font-bold text-teal-400">
                        ₹{ag.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Day After Tomorrow's Payments */}
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-blue-400 border-b border-slate-800/60 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  DAY AFTER TOMORROW
                </span>
                <span>₹{grouped.dayAfterTomorrow.reduce((sum, a) => sum + a.outstandingBalance, 0).toLocaleString('en-IN')}</span>
              </div>
              {grouped.dayAfterTomorrow.length === 0 ? (
                <div className="text-slate-500 py-2 text-center text-[11px]">No agency visits scheduled</div>
              ) : (
                <div className="space-y-1.5">
                  {grouped.dayAfterTomorrow.map((ag, idx) => (
                    <div key={ag.agencyId} className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-200 truncate max-w-[140px]">
                        {idx + 1}. {ag.agencyName}
                      </span>
                      <span className="font-mono font-bold text-blue-400">
                        ₹{ag.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic">
            * Cashflow planning only. Outstanding balances are not automatically paid; balances are deducted upon verified payment entry.
          </p>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeFilter === 'ALL'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            All Agencies ({schedules.length})
          </button>

          <button
            onClick={() => setActiveFilter('TODAY')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeFilter === 'TODAY'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Today ({grouped.today.length})
          </button>

          <button
            onClick={() => setActiveFilter('TOMORROW')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeFilter === 'TOMORROW'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Tomorrow ({grouped.tomorrow.length})
          </button>

          <button
            onClick={() => setActiveFilter('DAY_AFTER')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeFilter === 'DAY_AFTER'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Day After Tomorrow ({grouped.dayAfterTomorrow.length})
          </button>

          <button
            onClick={() => setActiveFilter('NEXT_7_DAYS')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeFilter === 'NEXT_7_DAYS'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Next 7 Days ({grouped.next7Days.length})
          </button>

          <button
            onClick={() => setActiveFilter('IRREGULAR')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeFilter === 'IRREGULAR'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Schedule Irregular
          </button>

          <button
            onClick={() => setActiveFilter('NEEDS_DATA')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeFilter === 'NEEDS_DATA'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Not Enough Data
          </button>

          <button
            onClick={() => setActiveFilter('MANUAL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeFilter === 'MANUAL'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Manually Set
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search agency..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* Agency Schedules List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs">
            Analyzing historical purchase and payment records...
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs space-y-2">
            <p>No agencies match the selected visit filter.</p>
            <button
              onClick={() => {
                setActiveFilter('ALL');
                setSearchQuery('');
              }}
              className="text-emerald-400 font-semibold text-xs hover:underline"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredSchedules.map((schedule) => {
            const isExpanded = expandedAgencyId === schedule.agencyId;
            const diff = schedule.daysUntilNextVisit;
            const isToday = diff === 0;
            const isTomorrow = diff === 1;
            const isDayAfter = diff === 2;

            return (
              <div
                key={schedule.agencyId}
                className={`bg-slate-900 hover:bg-slate-850/80 border rounded-2xl transition-all shadow-md overflow-hidden ${
                  isToday
                    ? 'border-emerald-500/60 ring-1 ring-emerald-500/30'
                    : isTomorrow
                    ? 'border-teal-500/50'
                    : isDayAfter
                    ? 'border-blue-500/40'
                    : 'border-slate-800'
                }`}
              >
                {/* Main Card Row */}
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Column: Agency & Status */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        onClick={() => onSelectAgency && onSelectAgency(schedule.agencyId)}
                        className="text-base font-bold text-white hover:text-emerald-300 transition-colors cursor-pointer truncate"
                      >
                        {schedule.agencyName}
                      </h3>

                      {/* Status Label (Requirement 18) */}
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                          isToday
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                            : isTomorrow
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                            : isDayAfter
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : schedule.statusLabel === 'Manually Set'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : schedule.statusLabel === 'Schedule Irregular'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : schedule.statusLabel === 'Not Enough Data'
                            ? 'bg-slate-800 text-slate-400 border-slate-700'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {schedule.statusLabel}
                      </span>

                      {/* Confidence Badge (Requirement 3) */}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          schedule.confidence === 'HIGH'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                            : schedule.confidence === 'MEDIUM'
                            ? 'bg-teal-950/60 text-teal-400 border-teal-800'
                            : 'bg-amber-950/60 text-amber-400 border-amber-800'
                        }`}
                      >
                        Confidence: {schedule.confidence}
                      </span>

                      {schedule.isManualOverride && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800">
                          Manual Override
                        </span>
                      )}
                    </div>

                    {/* Meta Details: Payment Planning (Requirement 6) */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <div>
                        Last Activity:{' '}
                        <strong className="text-slate-200">
                          {formatScheduleDate(schedule.lastActivityDate)}
                        </strong>
                      </div>
                      {schedule.lastPurchaseDate && (
                        <div>
                          Last Purchase:{' '}
                          <strong className="text-slate-300">
                            {formatScheduleDate(schedule.lastPurchaseDate)}
                          </strong>
                        </div>
                      )}
                      {schedule.lastPaymentDate && (
                        <div>
                          Last Payment:{' '}
                          <strong className="text-teal-300">
                            {formatScheduleDate(schedule.lastPaymentDate)}
                          </strong>
                        </div>
                      )}
                      <div>
                        Typical Visit:{' '}
                        <strong className="text-white font-mono">
                          {schedule.typicalIntervalDays ? `${schedule.typicalIntervalDays} days` : 'Need more history'}
                        </strong>
                      </div>
                    </div>

                    {/* Source Explanation */}
                    <div className="text-[11px] text-slate-500">
                      {schedule.sourceExplanation}
                    </div>
                  </div>

                  {/* Right Column: Next Expected Visit Date, Outstanding & Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 shrink-0 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                    {/* Expected Visit Date */}
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] text-slate-400 font-medium">Next Expected Visit</div>
                      <div className="text-sm font-bold text-white flex items-center gap-1.5 sm:justify-end">
                        <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{formatScheduleDate(schedule.nextExpectedDate)}</span>
                      </div>
                      {schedule.daysUntilNextVisit !== null && (
                        <div className="text-[11px] text-slate-400">
                          {schedule.daysUntilNextVisit === 0
                            ? 'Today'
                            : schedule.daysUntilNextVisit === 1
                            ? 'Tomorrow'
                            : schedule.daysUntilNextVisit === 2
                            ? 'In 2 days'
                            : schedule.daysUntilNextVisit > 0
                            ? `In ${schedule.daysUntilNextVisit} days`
                            : `Overdue by ${Math.abs(schedule.daysUntilNextVisit)} days`}
                        </div>
                      )}
                    </div>

                    {/* Outstanding Balance */}
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 font-medium">Outstanding Balance</div>
                      <div className="text-base font-black text-emerald-400 font-mono">
                        ₹{schedule.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Paid: ₹{schedule.totalPaid.toLocaleString('en-IN')}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingSchedule(schedule)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        title="Manually set or correct next visit date and recurrence interval (Requirement 8)"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Edit Schedule</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedAgencyId(isExpanded ? null : schedule.agencyId)
                        }
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors"
                        title="Inspect date history and interval calculations (Requirement 2 & 14)"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Section: Detailed Historical Dates & Interval Analysis (Requirement 2, 14) */}
                {isExpanded && (
                  <div className="px-5 py-4 bg-slate-950 border-t border-slate-800 space-y-3 text-xs animate-in fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                      <div className="font-bold text-slate-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-400" />
                        Historical Activity Dates &amp; Intervals ({schedule.historicalDates.length} recorded dates)
                      </div>
                      {schedule.manualOverride?.visitDayPattern && (
                        <div className="text-[11px] text-purple-300 font-medium">
                          Pattern note: &ldquo;{schedule.manualOverride.visitDayPattern}&rdquo;
                        </div>
                      )}
                    </div>

                    {/* Interval Breakdown */}
                    {schedule.historicalDates.length < 2 ? (
                      <div className="p-3 bg-slate-900 rounded-xl text-slate-400 text-xs">
                        {schedule.historicalDates.length === 1 ? (
                          <span>
                            Only 1 visit date recorded on{' '}
                            <strong className="text-white">
                              {formatScheduleDate(schedule.historicalDates[0])}
                            </strong>
                            . Need at least 2 dates to compute historical intervals. You can click &ldquo;Edit Schedule&rdquo; to set a manual expectation.
                          </span>
                        ) : (
                          <span>No purchase bills or payment receipts recorded for this agency yet.</span>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-400 text-[10px]">Average Interval</span>
                            <div className="font-bold text-white font-mono mt-0.5">
                              {schedule.averageIntervalDays} days
                            </div>
                          </div>
                          <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-400 text-[10px]">Median Interval</span>
                            <div className="font-bold text-emerald-400 font-mono mt-0.5">
                              {schedule.medianIntervalDays} days
                            </div>
                          </div>
                          <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-400 text-[10px]">Most Common (Mode)</span>
                            <div className="font-bold text-teal-400 font-mono mt-0.5">
                              {schedule.modeIntervalDays} days
                            </div>
                          </div>
                          <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                            <span className="text-slate-400 text-[10px]">Historical Pattern</span>
                            <div className="font-bold font-mono mt-0.5 text-slate-200 truncate">
                              {schedule.intervalsInDays.join(', ')} days
                            </div>
                          </div>
                        </div>

                        {/* Chronological steps */}
                        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1.5 font-mono text-[11px]">
                          <div className="text-slate-400 font-sans text-xs font-semibold mb-2">
                            Chronological Activity Timeline:
                          </div>
                          {schedule.historicalDates.map((d, i) => {
                            const prevDate = i > 0 ? schedule.historicalDates[i - 1] : null;
                            const diffDays = prevDate ? schedule.intervalsInDays[i - 1] : null;

                            return (
                              <div key={d} className="flex items-center gap-2 text-slate-300">
                                <span className="text-slate-500 w-5 text-right">{i + 1}.</span>
                                <span className="text-white font-bold">{formatScheduleDate(d)}</span>
                                {diffDays !== null && (
                                  <span className="text-teal-400 font-sans text-[10px] px-2 py-0.2 rounded bg-teal-950/80 border border-teal-800">
                                    + {diffDays} days from previous
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {schedule.manualOverride?.notes && (
                      <div className="p-2.5 bg-purple-950/30 border border-purple-800/40 rounded-lg text-purple-200 text-xs">
                        <strong>User Notes:</strong> {schedule.manualOverride.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Edit Schedule Modal */}
      <EditScheduleModal
        isOpen={Boolean(editingSchedule)}
        schedule={editingSchedule}
        onClose={() => setEditingSchedule(null)}
        onSaved={loadSchedules}
      />
    </div>
  );
};
