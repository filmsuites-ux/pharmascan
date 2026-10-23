import { InvoiceItem } from '../types/pharmacy';

/**
 * Normalizes medicine names for pharmacy matching:
 * Handles:
 * "PARACETAMOL 500MG" vs "Paracetamol 500 mg" vs "PCM 500"
 * "AUGMENTIN 625 DUO" vs "Augmentin 625mg Duo"
 * "TELMA 40MG TAB" vs "Telma 40 Tab"
 */
export function normalizeMedicineName(rawName: string): string {
  if (!rawName) return '';

  let normalized = rawName.toUpperCase().trim();

  // Common Indian pharmacy acronyms
  normalized = normalized.replace(/\bPCM\b/g, 'PARACETAMOL');
  normalized = normalized.replace(/\bAZI\b/g, 'AZITHROMYCIN');
  normalized = normalized.replace(/\bMET\b/g, 'METFORMIN');
  normalized = normalized.replace(/\bCIPLOX\b/g, 'CIPROFLOXACIN');

  // Strip unnecessary punctuation
  normalized = normalized.replace(/[.,\-_#*]/g, ' ');

  // Normalize strength spacing (e.g. "500 MG" -> "500MG", "0.5 MG" -> "0.5MG")
  normalized = normalized.replace(/(\d+(\.\d+)?)\s*(MG|ML|GM|MCG|IU|%)/g, '$1$3');

  // Normalize dosage forms
  normalized = normalized.replace(/\bTABLET(S)?\b/g, 'TAB');
  normalized = normalized.replace(/\bCAPSULE(S)?\b/g, 'CAP');
  normalized = normalized.replace(/\bSYRUP\b/g, 'SYP');
  normalized = normalized.replace(/\bINJECTION\b/g, 'INJ');
  normalized = normalized.replace(/\bSUSPENSION\b/g, 'SUSP');
  normalized = normalized.replace(/\bOINTMENT\b/g, 'OINT');

  // Remove multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Compares two medicine records using name, strength, dosage form, and product code
 */
export function compareMedicines(
  nameA: string,
  codeA: string | undefined,
  nameB: string,
  codeB: string | undefined
): { match: boolean; confidence: 'EXACT' | 'SIMILAR' | 'DIFFERENT' } {
  // If both have product code/HSN and they match: exact
  if (codeA && codeB && codeA.trim() !== '' && codeB.trim() !== '') {
    if (codeA.trim().toUpperCase() === codeB.trim().toUpperCase()) {
      return { match: true, confidence: 'EXACT' };
    }
  }

  const normA = normalizeMedicineName(nameA);
  const normB = normalizeMedicineName(nameB);

  if (normA === normB) {
    return { match: true, confidence: 'EXACT' };
  }

  // Check token overlap
  const tokensA = normA.split(' ').filter(Boolean);
  const tokensB = normB.split(' ').filter(Boolean);

  const sharedTokens = tokensA.filter((t) => tokensB.includes(t));
  const unionCount = new Set([...tokensA, ...tokensB]).size;
  const jaccard = sharedTokens.length / (unionCount || 1);

  // If 75%+ tokens match, flag as similar
  if (jaccard >= 0.75) {
    return { match: true, confidence: 'SIMILAR' };
  }

  return { match: false, confidence: 'DIFFERENT' };
}

export interface PreviousPriceResult {
  previousRate: number;
  diff: number;
  percentDiff: number;
  type: 'INCREASE' | 'DECREASE' | 'NO_CHANGE' | 'NEW';
  prevInvoiceNumber?: string;
  prevInvoiceDate?: string;
  prevAgencyName?: string;
  matchedName?: string;
  isSimilarOnly?: boolean;
}

/**
 * Looks up historical purchases for the medicine and detects price changes
 */
export function detectPriceChange(
  currentRate: number,
  productName: string,
  productCode: string | undefined,
  currentInvoiceDate: string,
  historicalItems: InvoiceItem[]
): PreviousPriceResult {
  if (!productName || currentRate <= 0) {
    return {
      previousRate: 0,
      diff: 0,
      percentDiff: 0,
      type: 'NEW',
    };
  }

  // Filter historical items that were purchased before or on the current date
  // Sorted chronologically descending (newest first)
  const candidateItems = historicalItems
    .filter((item) => {
      // Must have valid rate
      if (!item.purchaseRate || item.purchaseRate <= 0) return false;
      // If dates are provided, ensure previous invoice was earlier
      if (item.invoiceDate && currentInvoiceDate) {
        return item.invoiceDate <= currentInvoiceDate;
      }
      return true;
    })
    .sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || ''));

  let foundItem: InvoiceItem | null = null;
  let isSimilarOnly = false;

  // 1. Try exact match first
  for (const item of candidateItems) {
    const comparison = compareMedicines(productName, productCode, item.productName, item.productCode);
    if (comparison.match && comparison.confidence === 'EXACT') {
      foundItem = item;
      break;
    }
  }

  // 2. Try similar match if no exact match found
  if (!foundItem) {
    for (const item of candidateItems) {
      const comparison = compareMedicines(productName, productCode, item.productName, item.productCode);
      if (comparison.match && comparison.confidence === 'SIMILAR') {
        foundItem = item;
        isSimilarOnly = true;
        break;
      }
    }
  }

  if (!foundItem) {
    return {
      previousRate: 0,
      diff: 0,
      percentDiff: 0,
      type: 'NEW',
    };
  }

  const prevRate = foundItem.purchaseRate;
  const diff = Number((currentRate - prevRate).toFixed(2));
  const percentDiff = Number(((diff / prevRate) * 100).toFixed(1));

  let type: 'INCREASE' | 'DECREASE' | 'NO_CHANGE' | 'NEW' = 'NO_CHANGE';
  if (diff > 0.05) {
    type = 'INCREASE';
  } else if (diff < -0.05) {
    type = 'DECREASE';
  }

  return {
    previousRate: prevRate,
    diff,
    percentDiff,
    type,
    prevInvoiceNumber: foundItem.invoiceNumber,
    prevInvoiceDate: foundItem.invoiceDate,
    prevAgencyName: foundItem.agencyName,
    matchedName: foundItem.productName,
    isSimilarOnly,
  };
}
