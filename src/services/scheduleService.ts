import {
  Agency,
  AgencyHistoricalDate,
  AgencySchedule,
  Invoice,
  Payment,
  PredictionConfidence,
  ScheduleManualOverride,
  ScheduleStatusLabel,
  UpcomingVisitsGrouped,
} from '../types/pharmacy';
import { getAgencies, saveAgency } from '../db/indexedDb';

const OVERRIDES_STORAGE_KEY = 'pharmacy_agency_schedule_overrides_v1';
const REMINDERS_STORAGE_KEY = 'pharmacy_schedule_reminders_settings_v1';

/**
 * Returns current date string as YYYY-MM-DD
 */
export function getAppTodayDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates calendar difference in days between two YYYY-MM-DD dates (target - base)
 */
export function getDaysDifference(targetDateStr: string, baseDateStr: string): number {
  if (!targetDateStr || !baseDateStr) return 0;
  const t = new Date(targetDateStr + 'T00:00:00');
  const b = new Date(baseDateStr + 'T00:00:00');
  const diffMs = t.getTime() - b.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Adds N days to a YYYY-MM-DD string and returns new YYYY-MM-DD
 */
export function addDaysToDate(dateStr: string, daysToAdd: number): string {
  if (!dateStr) return getAppTodayDate();
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + daysToAdd);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats YYYY-MM-DD into a clean, readable human string (e.g. 15 Oct 2026)
 */
export function formatScheduleDate(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
  } catch {}
  return dateStr;
}

/**
 * Statistical calculations: Median, Mean, Mode
 */
export function calculateMedian(numbers: number[]): number {
  if (!numbers || numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function calculateAverage(numbers: number[]): number {
  if (!numbers || numbers.length === 0) return 0;
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  return Number((sum / numbers.length).toFixed(1));
}

export function calculateMode(numbers: number[]): number {
  if (!numbers || numbers.length === 0) return 0;
  const counts: Record<number, number> = {};
  let maxCount = 0;
  let mode = numbers[0];

  for (const n of numbers) {
    counts[n] = (counts[n] || 0) + 1;
    if (counts[n] > maxCount) {
      maxCount = counts[n];
      mode = n;
    }
  }
  return mode;
}

/**
 * Checks if interval sequence is irregular (Requirement 10)
 */
export function checkIrregularity(intervals: number[]): { isIrregular: boolean; reason?: string } {
  if (intervals.length < 2) {
    return { isIrregular: false };
  }
  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  const spread = max - min;
  const avg = calculateAverage(intervals);

  // If spread is more than 8 days or standard variance exceeds 45% of average, flag as irregular
  if (spread >= 8 && intervals.length >= 3) {
    return {
      isIrregular: true,
      reason: `Intervals range widely from ${min} to ${max} days (inconsistent pattern)`,
    };
  }
  if (avg > 0 && spread / avg > 0.6 && intervals.length >= 3) {
    return {
      isIrregular: true,
      reason: `Variations between visit dates are irregular (${intervals.join(', ')} days)`,
    };
  }
  return { isIrregular: false };
}

/**
 * Core Algorithm: Calculates schedule for a single agency from real historical records (Requirements 1, 2, 3, 4, 7, 10, 14)
 */
export function calculateAgencySchedule(
  agency: Agency,
  agencyInvoices: Invoice[] = [],
  agencyPayments: Payment[] = [],
  manualOverride?: ScheduleManualOverride,
  todayStr: string = getAppTodayDate()
): AgencySchedule {
  // 1. Gather all activity dates (Purchase bills + Payment receipts)
  const activities: AgencyHistoricalDate[] = [];

  for (const inv of agencyInvoices) {
    if (inv.invoiceDate && inv.invoiceDate.trim()) {
      activities.push({
        date: inv.invoiceDate.trim(),
        type: inv.documentType === 'RECEIPT' ? 'RECEIPT' : 'PURCHASE',
        referenceId: inv.id,
        referenceNumber: inv.invoiceNumber,
        amount: inv.invoiceTotal,
      });
    }
  }

  for (const pay of agencyPayments) {
    if (pay.paymentDate && pay.paymentDate.trim()) {
      activities.push({
        date: pay.paymentDate.trim(),
        type: 'PAYMENT',
        referenceId: pay.id,
        referenceNumber: pay.referenceNumber,
        amount: pay.amount,
      });
    }
  }

  // Sort activities chronologically
  activities.sort((a, b) => a.date.localeCompare(b.date));

  // Extract unique sorted activity dates
  const uniqueDates = Array.from(new Set(activities.map((a) => a.date))).sort();

  // Find last purchase date and last payment date
  const purchaseDates = activities.filter((a) => a.type === 'PURCHASE').map((a) => a.date);
  const paymentDates = activities.filter((a) => a.type === 'PAYMENT' || a.type === 'RECEIPT').map((a) => a.date);
  const lastPurchaseDate = purchaseDates.length > 0 ? purchaseDates[purchaseDates.length - 1] : null;
  const lastPaymentDate = paymentDates.length > 0 ? paymentDates[paymentDates.length - 1] : null;
  const lastActivityDate = uniqueDates.length > 0 ? uniqueDates[uniqueDates.length - 1] : null;

  // Calculate intervals in days between consecutive dates (Requirement 2)
  const intervalsInDays: number[] = [];
  for (let i = 1; i < uniqueDates.length; i++) {
    const diff = getDaysDifference(uniqueDates[i], uniqueDates[i - 1]);
    if (diff > 0) {
      intervalsInDays.push(diff);
    }
  }

  // Calculate statistical metrics (Requirement 14)
  const avg = intervalsInDays.length > 0 ? calculateAverage(intervalsInDays) : null;
  const med = intervalsInDays.length > 0 ? calculateMedian(intervalsInDays) : null;
  const mode = intervalsInDays.length > 0 ? calculateMode(intervalsInDays) : null;

  // Robust typical interval: prefer median/mode, fallback to average
  let typicalIntervalDays: number | null = med;
  if (manualOverride?.expectedIntervalDays && manualOverride.expectedIntervalDays > 0) {
    typicalIntervalDays = manualOverride.expectedIntervalDays;
  }

  // Check regularity
  const irregularityCheck = checkIrregularity(intervalsInDays);
  const isIrregular = irregularityCheck.isIrregular;

  // Calculate Outstanding Balance: purchases - payments
  const totalPurchase = agencyInvoices
    .filter((inv) => inv.documentType !== 'RECEIPT')
    .reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);
  const totalPaid = agencyPayments.reduce((sum, pay) => sum + (pay.amount || 0), 0);
  const outstandingBalance = Math.max(0, totalPurchase - totalPaid);

  // Prediction determination
  let nextExpectedDate: string | null = null;
  let confidence: PredictionConfidence = 'LOW';
  let statusLabel: ScheduleStatusLabel = 'Not Enough Data';
  let isManualOverride = false;
  let sourceExplanation = '';

  // Case A: Manual Override present (Requirement 8)
  if (manualOverride?.nextExpectedDate) {
    isManualOverride = true;
    nextExpectedDate = manualOverride.nextExpectedDate;
    confidence = 'HIGH';
    statusLabel = 'Manually Set';
    sourceExplanation = `Schedule manually set by user (${manualOverride.expectedIntervalDays || typicalIntervalDays || 15} days interval)`;
  }
  // Case B: Not enough historical data (0 or 1 recorded date) (Requirement 4)
  else if (uniqueDates.length <= 1) {
    confidence = 'LOW';
    statusLabel = 'Not Enough Data';
    nextExpectedDate = null;
    sourceExplanation = uniqueDates.length === 1
      ? 'Only 1 recorded date in history. Need more purchases or receipts to predict visit schedule.'
      : 'No historical bills or payments recorded yet.';
  }
  // Case C: Real historical pattern exists (Requirements 2, 3, 10)
  else if (lastActivityDate && typicalIntervalDays && typicalIntervalDays > 0) {
    // Project next expected visit: Last known date + typical interval
    let projectedDate = addDaysToDate(lastActivityDate, typicalIntervalDays);

    // If the projected date from the last activity was in the past, cycle forward by typical interval
    // so we reflect the active current/upcoming cycle
    if (getDaysDifference(projectedDate, todayStr) < -3) {
      let cycleDate = projectedDate;
      while (getDaysDifference(cycleDate, todayStr) < 0) {
        cycleDate = addDaysToDate(cycleDate, typicalIntervalDays);
      }
      projectedDate = cycleDate;
    }

    nextExpectedDate = projectedDate;

    // Determine confidence based on consistency and data volume
    if (isIrregular) {
      confidence = 'LOW';
      statusLabel = 'Schedule Irregular';
      sourceExplanation = `Schedule is irregular (${intervalsInDays.join(', ')} days). Estimated median interval is ${typicalIntervalDays} days.`;
    } else if (intervalsInDays.length >= 3) {
      confidence = 'HIGH';
      sourceExplanation = `Learned from ${uniqueDates.length} historical dates (typical ${typicalIntervalDays} days interval).`;
    } else {
      confidence = 'MEDIUM';
      sourceExplanation = `Estimated from ${uniqueDates.length} historical dates (~${typicalIntervalDays} days interval).`;
    }
  }

  // Calculate days until next visit and human status label (Requirement 5 & 18)
  let daysUntilNextVisit: number | null = null;

  if (nextExpectedDate) {
    daysUntilNextVisit = getDaysDifference(nextExpectedDate, todayStr);

    if (daysUntilNextVisit === 0) {
      statusLabel = 'Expected Today';
    } else if (daysUntilNextVisit === 1) {
      statusLabel = 'Expected Tomorrow';
    } else if (daysUntilNextVisit === 2) {
      statusLabel = 'Expected in 2 Days';
    } else if (daysUntilNextVisit > 2) {
      statusLabel = 'Upcoming';
    } else if (daysUntilNextVisit < 0) {
      statusLabel = 'Overdue';
    }

    // Keep manual status indication distinct if set manually
    if (isManualOverride && daysUntilNextVisit > 2) {
      statusLabel = 'Manually Set';
    }
  }

  return {
    agencyId: agency.id,
    agencyName: agency.name,
    outstandingBalance,
    totalPurchase,
    totalPaid,
    historicalDates: uniqueDates,
    activityHistory: activities,
    recordedVisitsCount: uniqueDates.length,
    intervalsInDays,
    averageIntervalDays: avg,
    medianIntervalDays: med,
    modeIntervalDays: mode,
    typicalIntervalDays,
    lastActivityDate,
    lastPurchaseDate,
    lastPaymentDate,
    nextExpectedDate,
    daysUntilNextVisit,
    confidence,
    statusLabel,
    isManualOverride,
    manualOverride,
    isIrregular,
    sourceExplanation,
  };
}

/**
 * Groups and sorts schedules into Today / Tomorrow / Day After Tomorrow / Next 7 Days (Requirement 5 & 12)
 */
export function groupAgencySchedules(
  schedules: AgencySchedule[],
  todayStr: string = getAppTodayDate()
): UpcomingVisitsGrouped {
  const today: AgencySchedule[] = [];
  const tomorrow: AgencySchedule[] = [];
  const dayAfterTomorrow: AgencySchedule[] = [];
  const next7Days: AgencySchedule[] = [];
  const allUpcoming: AgencySchedule[] = [];
  const irregularOrNeedsData: AgencySchedule[] = [];

  for (const s of schedules) {
    if (!s.nextExpectedDate || s.statusLabel === 'Not Enough Data') {
      irregularOrNeedsData.push(s);
      continue;
    }

    const diff = s.daysUntilNextVisit ?? getDaysDifference(s.nextExpectedDate, todayStr);

    if (diff === 0) {
      today.push(s);
      allUpcoming.push(s);
    } else if (diff === 1) {
      tomorrow.push(s);
      allUpcoming.push(s);
    } else if (diff === 2) {
      dayAfterTomorrow.push(s);
      allUpcoming.push(s);
    } else if (diff >= 3 && diff <= 7) {
      next7Days.push(s);
      allUpcoming.push(s);
    } else if (diff > 7) {
      allUpcoming.push(s);
    } else if (diff < 0) {
      // Overdue visits are grouped into Today for immediate attention
      today.push(s);
      allUpcoming.push(s);
    }

    if (s.isIrregular) {
      irregularOrNeedsData.push(s);
    }
  }

  // Sort upcoming by closest date first
  const sortByVisitDate = (a: AgencySchedule, b: AgencySchedule) => {
    if (!a.nextExpectedDate) return 1;
    if (!b.nextExpectedDate) return -1;
    return a.nextExpectedDate.localeCompare(b.nextExpectedDate);
  };

  today.sort(sortByVisitDate);
  tomorrow.sort(sortByVisitDate);
  dayAfterTomorrow.sort(sortByVisitDate);
  next7Days.sort(sortByVisitDate);
  allUpcoming.sort(sortByVisitDate);

  // Total Expected Outstanding for Upcoming Visits (Requirement 12)
  // Sum outstanding balance of agencies expected Today, Tomorrow, or Day After Tomorrow
  const soonAgencies = [...today, ...tomorrow, ...dayAfterTomorrow];
  const uniqueSoonAgencyIds = new Set<string>();
  let totalOutstandingSoon = 0;

  for (const ag of soonAgencies) {
    if (!uniqueSoonAgencyIds.has(ag.agencyId)) {
      uniqueSoonAgencyIds.add(ag.agencyId);
      totalOutstandingSoon += ag.outstandingBalance;
    }
  }

  return {
    today,
    tomorrow,
    dayAfterTomorrow,
    next7Days,
    allUpcoming,
    irregularOrNeedsData,
    totalOutstandingSoon,
  };
}

/**
 * Calculates schedules for all agencies in database
 */
export async function getAllAgencySchedules(
  agencies: Agency[],
  invoices: Invoice[],
  payments: Payment[],
  todayStr: string = getAppTodayDate()
): Promise<AgencySchedule[]> {
  const overrides = await getScheduleOverrides();

  return agencies.map((ag) => {
    const agInvoices = invoices.filter((i) => i.agencyId === ag.id);
    const agPayments = payments.filter((p) => p.agencyId === ag.id);
    const override = ag.scheduleOverride || overrides[ag.id];

    return calculateAgencySchedule(ag, agInvoices, agPayments, override, todayStr);
  });
}

// ----------------------------------------------------
// PERSISTENCE FOR MANUAL SCHEDULE OVERRIDES (Requirement 8 & 19)
// ----------------------------------------------------

export async function getScheduleOverrides(): Promise<Record<string, ScheduleManualOverride>> {
  try {
    const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to parse schedule overrides from storage:', err);
    return {};
  }
}

export async function saveScheduleOverride(override: ScheduleManualOverride): Promise<void> {
  try {
    // 1. Save to localStorage backup
    const current = await getScheduleOverrides();
    current[override.agencyId] = override;
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(current));

    // 2. Also persist onto Agency record in IndexedDB if agency exists
    const agencies = await getAgencies();
    const target = agencies.find((a) => a.id === override.agencyId);
    if (target) {
      target.scheduleOverride = override;
      target.updatedAt = new Date().toISOString();
      await saveAgency(target);
    }
  } catch (err) {
    console.error('Error saving schedule override:', err);
  }
}

export async function removeScheduleOverride(agencyId: string): Promise<void> {
  try {
    const current = await getScheduleOverrides();
    delete current[agencyId];
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(current));

    const agencies = await getAgencies();
    const target = agencies.find((a) => a.id === agencyId);
    if (target && target.scheduleOverride) {
      delete target.scheduleOverride;
      target.updatedAt = new Date().toISOString();
      await saveAgency(target);
    }
  } catch (err) {
    console.error('Error removing schedule override:', err);
  }
}

// ----------------------------------------------------
// REMINDERS & NOTIFICATIONS (Requirement 13)
// ----------------------------------------------------

export interface ScheduleReminderSettings {
  enabled: boolean;
  oneDayBefore: boolean;
  browserNotifications: boolean;
}

export function getScheduleReminderSettings(): ScheduleReminderSettings {
  try {
    const raw = localStorage.getItem(REMINDERS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return {
    enabled: true,
    oneDayBefore: true,
    browserNotifications: false,
  };
}

export function saveScheduleReminderSettings(settings: ScheduleReminderSettings): void {
  try {
    localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export interface VisitReminderItem {
  id: string;
  agencyId: string;
  agencyName: string;
  type: 'TODAY' | 'TOMORROW';
  title: string;
  message: string;
  outstandingBalance: number;
}

export function generateVisitReminders(
  schedules: AgencySchedule[],
  settings: ScheduleReminderSettings = getScheduleReminderSettings()
): VisitReminderItem[] {
  if (!settings.enabled) return [];

  const reminders: VisitReminderItem[] = [];

  for (const s of schedules) {
    if (s.daysUntilNextVisit === 0) {
      reminders.push({
        id: `remind-today-${s.agencyId}`,
        agencyId: s.agencyId,
        agencyName: s.agencyName,
        type: 'TODAY',
        title: `${s.agencyName} Expected Today`,
        message: `${s.agencyName} is expected to visit today. Current outstanding balance: ₹${s.outstandingBalance.toLocaleString('en-IN')}.`,
        outstandingBalance: s.outstandingBalance,
      });
    } else if (s.daysUntilNextVisit === 1 && settings.oneDayBefore) {
      reminders.push({
        id: `remind-tomorrow-${s.agencyId}`,
        agencyId: s.agencyId,
        agencyName: s.agencyName,
        type: 'TOMORROW',
        title: `${s.agencyName} Expected Tomorrow`,
        message: `${s.agencyName} is expected to visit tomorrow (1-day reminder). Current outstanding balance: ₹${s.outstandingBalance.toLocaleString('en-IN')}.`,
        outstandingBalance: s.outstandingBalance,
      });
    }
  }

  return reminders;
}
