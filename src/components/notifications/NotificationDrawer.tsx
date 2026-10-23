import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  AlertTriangle,
  TrendingUp,
  Clock,
  Building2,
  FileText,
  ShieldAlert,
  ArrowRight,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { OverallStats } from '../../types/pharmacy';
import {
  generateVisitReminders,
  getAllAgencySchedules,
  getScheduleReminderSettings,
  VisitReminderItem,
} from '../../services/scheduleService';
import { getAgencies, getInvoices, getPayments } from '../../db/indexedDb';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stats: OverallStats | null;
  onNavigate: (view: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  stats,
  onNavigate,
}) => {
  const [visitReminders, setVisitReminders] = useState<VisitReminderItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      const loadReminders = async () => {
        try {
          const [agencies, invoices, payments] = await Promise.all([
            getAgencies(),
            getInvoices(),
            getPayments(),
          ]);
          const schedules = await getAllAgencySchedules(agencies, invoices, payments);
          const settings = getScheduleReminderSettings();
          const items = generateVisitReminders(schedules, settings);
          setVisitReminders(items);
        } catch (err) {
          console.warn('Failed to load visit reminders in notification drawer:', err);
        }
      };
      loadReminders();
    }
  }, [isOpen]);

  if (!isOpen || !stats) return null;

  const notifications = [
    // Agency visit reminders (Requirement 13)
    ...visitReminders.map((vr) => ({
      id: vr.id,
      type: (vr.type === 'TODAY' ? 'critical' : 'warning') as 'critical' | 'warning',
      title: vr.title,
      description: vr.message,
      view: 'schedule',
      actionText: 'View Visit Schedule',
      isVisitReminder: true,
    })),
    ...(stats.expiredCount > 0
      ? [
          {
            id: 'notif-expired',
            type: 'critical' as const,
            title: `${stats.expiredCount} Expired Medicine Batch(es)`,
            description: 'Stock has passed its legal expiry date and must be removed from dispensing shelves.',
            view: 'expiry',
            actionText: 'Inspect Expired Batches',
          },
        ]
      : []),
    ...(stats.criticalExpiryCount > 0
      ? [
          {
            id: 'notif-near-expiry-30',
            type: 'warning' as const,
            title: `${stats.criticalExpiryCount} Medicine(s) Expiring within 30 Days`,
            description: 'Return to respective distributor sales representatives before final expiry window closes.',
            view: 'expiry',
            actionText: 'Review 0-30 Day Stock',
          },
        ]
      : []),
    ...(stats.priceHikesCount > 0
      ? [
          {
            id: 'notif-price-hikes',
            type: 'notice' as const,
            title: `${stats.priceHikesCount} Purchase Price Hike(s) Detected`,
            description: 'Recent bills contain higher purchase rates than prior invoices for identical medicines.',
            view: 'price_changes',
            actionText: 'View Price Changes',
          },
        ]
      : []),
    ...(stats.totalOutstanding > 0
      ? [
          {
            id: 'notif-outstanding',
            type: 'info' as const,
            title: `₹${stats.totalOutstanding.toLocaleString('en-IN')} Outstanding Distributor Balance`,
            description: 'Total payable amount remaining across active pharmacy distributors.',
            view: 'agencies',
            actionText: 'View Agency Balances',
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-slate-900 border-l border-slate-800 shadow-2xl p-6 flex flex-col justify-between animate-in slide-in-from-right duration-200">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-emerald-400" />
            <h3 className="text-white font-bold text-base">Pharmacy Alerts</h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              {notifications.length}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3 overflow-y-auto max-h-[80vh] pr-1">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              All pharmacy systems clear. No critical alerts.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  n.type === 'critical'
                    ? 'bg-red-950/30 border-red-800/80 text-red-200'
                    : n.type === 'warning'
                    ? 'bg-amber-950/30 border-amber-800/80 text-amber-200'
                    : n.type === 'notice'
                    ? 'bg-blue-950/30 border-blue-800/80 text-blue-200'
                    : 'bg-slate-950 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-sm text-white flex items-center gap-1.5">
                    {n.type === 'critical' && <ShieldAlert className="w-4 h-4 text-red-400" />}
                    {n.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    {n.type === 'notice' && <TrendingUp className="w-4 h-4 text-blue-400" />}
                    {n.title}
                  </div>
                </div>

                <p className="text-slate-400 leading-relaxed text-[11px]">{n.description}</p>

                <button
                  onClick={() => {
                    onNavigate(n.view);
                    onClose();
                  }}
                  className="font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 text-[11px] pt-1"
                >
                  {n.actionText} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
        Alerts refresh automatically based on current date & invoice scans.
      </div>
    </div>
  );
};
