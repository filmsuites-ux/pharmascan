import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  X,
  Check,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Building2,
  IndianRupee,
} from 'lucide-react';
import { AgencySchedule, ScheduleManualOverride } from '../../types/pharmacy';
import {
  addDaysToDate,
  formatScheduleDate,
  getAppTodayDate,
  removeScheduleOverride,
  saveScheduleOverride,
} from '../../services/scheduleService';

interface EditScheduleModalProps {
  isOpen: boolean;
  schedule: AgencySchedule | null;
  onClose: () => void;
  onSaved: () => void;
}

export const EditScheduleModal: React.FC<EditScheduleModalProps> = ({
  isOpen,
  schedule,
  onClose,
  onSaved,
}) => {
  const [nextExpectedDate, setNextExpectedDate] = useState<string>('');
  const [expectedIntervalDays, setExpectedIntervalDays] = useState<number>(15);
  const [visitDayPattern, setVisitDayPattern] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (schedule) {
      const today = getAppTodayDate();
      setNextExpectedDate(
        schedule.manualOverride?.nextExpectedDate ||
        schedule.nextExpectedDate ||
        addDaysToDate(today, 15)
      );
      setExpectedIntervalDays(
        schedule.manualOverride?.expectedIntervalDays ||
        schedule.typicalIntervalDays ||
        15
      );
      setVisitDayPattern(schedule.manualOverride?.visitDayPattern || '');
      setNotes(schedule.manualOverride?.notes || '');
      setError(null);
    }
  }, [schedule, isOpen]);

  if (!isOpen || !schedule) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextExpectedDate) {
      setError('Please select a valid next expected visit date.');
      return;
    }
    if (!expectedIntervalDays || expectedIntervalDays <= 0) {
      setError('Expected interval must be at least 1 day.');
      return;
    }

    setIsSaving(true);
    try {
      const override: ScheduleManualOverride = {
        agencyId: schedule.agencyId,
        nextExpectedDate,
        expectedIntervalDays: Number(expectedIntervalDays),
        visitDayPattern: visitDayPattern.trim(),
        notes: notes.trim(),
        updatedAt: new Date().toISOString(),
      };
      await saveScheduleOverride(override);
      setIsSaving(false);
      onSaved();
      onClose();
    } catch (err) {
      setIsSaving(false);
      setError('Failed to save schedule update. Please retry.');
    }
  };

  const handleResetToAuto = async () => {
    setIsSaving(true);
    try {
      await removeScheduleOverride(schedule.agencyId);
      setIsSaving(false);
      onSaved();
      onClose();
    } catch (err) {
      setIsSaving(false);
      setError('Failed to reset schedule.');
    }
  };

  const handleQuickAddDays = (days: number) => {
    const today = getAppTodayDate();
    setNextExpectedDate(addDaysToDate(today, days));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/15 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">
                Edit Agency Visit Schedule
              </h3>
              <p className="text-xs text-slate-400">
                Custom visit dates &amp; recurrence intervals (Requirement 8)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Agency Summary Banner */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white text-sm">{schedule.agencyName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Outstanding:</span>
            <span className="font-mono font-bold text-emerald-400">
              ₹{schedule.outstandingBalance.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-700/60 rounded-xl text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Historical Data Context */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Historical Activity:</span>
              <span className="text-white font-medium">
                {schedule.recordedVisitsCount > 0
                  ? `${schedule.recordedVisitsCount} recorded visits (${schedule.intervalsInDays.length} intervals)`
                  : 'No prior bills or payments'}
              </span>
            </div>
            {schedule.lastActivityDate && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Last Activity Date:</span>
                <span className="text-emerald-300 font-medium">
                  {formatScheduleDate(schedule.lastActivityDate)}
                </span>
              </div>
            )}
            {schedule.typicalIntervalDays && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Learned Interval:</span>
                <span className="text-teal-300 font-mono">
                  {schedule.typicalIntervalDays} days{' '}
                  {schedule.isIrregular ? '(Irregular)' : '(Typical)'}
                </span>
              </div>
            )}
          </div>

          {/* Next Expected Visit Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Next Expected Visit Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={nextExpectedDate}
              onChange={(e) => setNextExpectedDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none font-medium"
              required
            />
            {/* Quick shortcuts */}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-500">Quick set:</span>
              <button
                type="button"
                onClick={() => handleQuickAddDays(0)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleQuickAddDays(1)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => handleQuickAddDays(2)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold"
              >
                In 2 Days
              </button>
              <button
                type="button"
                onClick={() => handleQuickAddDays(7)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold"
              >
                In 7 Days
              </button>
              <button
                type="button"
                onClick={() => handleQuickAddDays(15)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold"
              >
                In 15 Days
              </button>
            </div>
          </div>

          {/* Expected Interval (Days) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Expected Visit Interval (Days) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="365"
                value={expectedIntervalDays}
                onChange={(e) => setExpectedIntervalDays(parseInt(e.target.value) || 1)}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                days
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Common schedules: 7 days (weekly), 14-15 days (bi-weekly), 30 days (monthly).
            </p>
          </div>

          {/* Visit Day / Pattern Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Agency Visit Day / Pattern (Optional)
            </label>
            <input
              type="text"
              value={visitDayPattern}
              onChange={(e) => setVisitDayPattern(e.target.value)}
              placeholder="e.g. Every alternate Wednesday / 1st &amp; 15th of month"
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Internal Reminder Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Prepare cheque for Augmentin consignment / Rep name Ramesh"
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            {schedule.isManualOverride ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleResetToAuto}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Remove manual override and re-enable automated calculation from purchase/payment records"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Auto-Learn
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                Save Schedule
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
