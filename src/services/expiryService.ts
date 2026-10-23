import { ExpiryCategory, ExpiryItemSummary, InvoiceItem } from '../types/pharmacy';

/**
 * Standardize Indian medicine expiry string to a standard Date object
 * Handles formats: MM/YY, MM/YYYY, MM-YY, MM-YYYY, YYYY-MM, MMM-YY (e.g. NOV-26)
 */
export function parseExpiryDate(expiryStr: string): { date: Date; timestamp: number; formatted: string } {
  if (!expiryStr || expiryStr.trim() === '' || expiryStr === 'NOT DETECTED') {
    // Default fallback to 1 year ahead if missing
    const fallback = new Date();
    fallback.setFullYear(fallback.getFullYear() + 1);
    return {
      date: fallback,
      timestamp: fallback.getTime(),
      formatted: 'NOT DETECTED',
    };
  }

  const clean = expiryStr.trim().toUpperCase().replace(/[\.]/g, '/');
  const now = new Date();
  let month = now.getMonth() + 1; // 1-12
  let year = now.getFullYear();

  const monthNames: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  };

  // Check for MMM-YY (e.g. NOV-26, NOV/26)
  const mmmMatch = clean.match(/^([A-Z]{3})[-/ ]?(\d{2,4})$/);
  if (mmmMatch) {
    const mName = mmmMatch[1];
    let y = parseInt(mmmMatch[2], 10);
    if (y < 100) y += 2000;
    if (monthNames[mName]) {
      month = monthNames[mName];
      year = y;
    }
  } else if (clean.includes('/') || clean.includes('-')) {
    const parts = clean.split(/[-/]/);
    if (parts.length === 2) {
      let p0 = parseInt(parts[0], 10);
      let p1 = parseInt(parts[1], 10);
      if (p0 > 12 && p1 <= 12) {
        // format YY/MM or YYYY/MM
        year = p0 < 100 ? p0 + 2000 : p0;
        month = p1;
      } else {
        // standard format MM/YY or MM/YYYY
        month = p0;
        year = p1 < 100 ? p1 + 2000 : p1;
      }
    } else if (parts.length === 3) {
      // DD/MM/YYYY or YYYY/MM/DD
      if (parseInt(parts[0], 10) > 1000) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
      } else {
        month = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        year = y < 100 ? y + 2000 : y;
      }
    }
  }

  // Ensure month in 1..12
  if (isNaN(month) || month < 1 || month > 12) month = 12;
  if (isNaN(year) || year < 2000) year = 2026;

  // Medicine expiry is traditionally until the LAST DAY of the expiry month
  const lastDay = new Date(year, month, 0).getDate();
  const expiryDate = new Date(year, month - 1, lastDay, 23, 59, 59);

  const formattedMonth = month.toString().padStart(2, '0');
  const formattedYear = year.toString();

  return {
    date: expiryDate,
    timestamp: expiryDate.getTime(),
    formatted: `${formattedMonth}/${formattedYear}`,
  };
}

/**
 * Calculates days remaining from current date to medicine expiry date
 */
export function calculateDaysRemaining(expiryTimestamp: number): number {
  const now = new Date();
  const diffMs = expiryTimestamp - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Categorize into standard pharmacy buckets:
 * - EXPIRED (< 0 days)
 * - 0–30 DAYS
 * - 31–60 DAYS
 * - 61–90 DAYS
 * - 91–180 DAYS
 * - SAFE (> 180 days)
 */
export function getExpiryCategory(daysRemaining: number): ExpiryCategory {
  if (daysRemaining < 0) return 'EXPIRED';
  if (daysRemaining <= 30) return '0_30';
  if (daysRemaining <= 60) return '31_60';
  if (daysRemaining <= 90) return '61_90';
  if (daysRemaining <= 180) return '91_180';
  return 'SAFE';
}

export function categorizeExpiryItem(item: InvoiceItem): ExpiryItemSummary {
  const daysRemaining = calculateDaysRemaining(item.expiryTimestamp);
  const category = getExpiryCategory(daysRemaining);
  return {
    item,
    category,
    daysRemaining,
    expiryFormatted: item.expiryDate || 'NOT DETECTED',
  };
}

export function formatDaysRemainingText(days: number): string {
  if (days < 0) {
    const expiredDays = Math.abs(days);
    return `Expired ${expiredDays} day${expiredDays === 1 ? '' : 's'} ago`;
  }
  if (days === 0) return 'Expires TODAY';
  if (days === 1) return 'Expires tomorrow';
  return `${days} days left`;
}
