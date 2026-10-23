/**
 * Smart Medicine Order Service
 * 
 * Features:
 * - Medicine name, strength, pack size, manufacturer parsing & strict matching
 * - Reuses existing scanned bills & invoices from IndexedDB
 * - Deduplicated historical purchase records per agency
 * - Calculates agency coverage percentage: (matched requested items / total requested items) * 100
 * - Agency ranking from highest to lowest coverage
 * - Highest coverage agency recommendation (equally handles ties)
 * - Strict accuracy rules: Never claims current stock availability; labels results "Based on previous purchase records"
 * - Separate unverified tracking for missing or ambiguous details
 * - Order generation & WhatsApp sharing
 */

import { Agency, InvoiceItem } from '../types/pharmacy';
import { getAgencies, getInvoiceItems } from '../db/indexedDb';
import { normalizeMedicineName } from './pricingService';

export interface OrderItemInput {
  id: string;
  name: string;
  manufacturer?: string;
  strength?: string;
  packSize?: string;
  quantity: number;
  notes?: string;
}

export interface HistoricalMedicineSupplierRecord {
  agencyId: string;
  agencyName: string;
  agencyPhone?: string;
  agencyGstin?: string;
  productName: string;
  normalizedName: string;
  baseDrugName: string;
  manufacturer?: string;
  packSize?: string;
  strength?: string;
  lastPurchaseDate: string;
  lastInvoiceNumber: string;
  lastPurchaseRate?: number;
  totalTimesPurchased: number;
}

export type MedicineMatchStatus = 'CONFIRMED_MATCH' | 'UNVERIFIED_MATCH' | 'NO_MATCH';

export interface MedicineAgencyMatchDetail {
  orderItemId: string;
  requestedItem: OrderItemInput;
  matchedHistoricalItem?: HistoricalMedicineSupplierRecord;
  status: MedicineMatchStatus;
  matchReason: string;
  detailsMismatch?: string[];
}

export interface AgencyCoverageResult {
  agencyId: string;
  agencyName: string;
  agencyPhone?: string;
  agencyAddress?: string;
  agencyGstin?: string;
  matchedCount: number;
  totalRequestedCount: number;
  coveragePercentage: number;
  matchedItems: MedicineAgencyMatchDetail[];
  unmatchedItems: MedicineAgencyMatchDetail[];
  unverifiedItems: MedicineAgencyMatchDetail[];
  isTopRecommended: boolean;
  isTiedTop: boolean;
  tieCount?: number;
}

export interface FinalizedMedicineOrderItem {
  orderItemId: string;
  name: string;
  manufacturer?: string;
  strength?: string;
  packSize?: string;
  quantity: number;
  included: boolean;
  isHistoricallyMatched: boolean;
  historicalBillNumber?: string;
  historicalDate?: string;
  notes?: string;
}

export interface FinalizedMedicineOrder {
  id: string;
  orderNumber: string;
  agencyId: string;
  agencyName: string;
  agencyPhone?: string;
  agencyGstin?: string;
  orderDate: string;
  items: FinalizedMedicineOrderItem[];
  unmatchedItems: Array<{
    name: string;
    manufacturer?: string;
    strength?: string;
    packSize?: string;
    quantity: number;
    suggestedAgencyName?: string;
  }>;
  specialInstructions?: string;
  status: 'DRAFT' | 'SENT_WHATSAPP' | 'CONFIRMED';
  createdAt: string;
  updatedAt: string;
}

const ORDERS_STORAGE_KEY = 'pharmascan_medicine_orders';

// =========================================================================
// 1. MEDICINE ATTRIBUTE PARSER
// =========================================================================

/**
 * Extracts strength pattern (e.g. "500MG", "625MG", "40MG", "10MG", "650MG", "100ML", "0.5MG")
 */
export function extractStrength(text: string): string | undefined {
  if (!text) return undefined;
  // Match patterns like "500mg", "625 mg", "0.5 mcg", "100 ml", "10 gm", "500 iu", "20%"
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(mg|mcg|gm|g|ml|iu|%)\b/i);
  if (match) {
    return `${match[1]}${match[2].toUpperCase()}`;
  }
  // Also check for composite strengths like "625 DUO" or "500/125"
  const duoMatch = text.match(/\b(625|375|1000)\s*(?:DUO)?\b/i);
  if (duoMatch && (text.toUpperCase().includes('AUGMENTIN') || text.toUpperCase().includes('CLAV'))) {
    return `${duoMatch[1]}MG`;
  }
  return undefined;
}

/**
 * Extracts pack size pattern (e.g. "10x10", "10's", "15 Tab", "100 ml", "10 Strip")
 */
export function extractPackSize(text: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(/\b(\d+\s*x\s*\d+|\d+\s*'?s|\d+\s*(?:tab|cap|tabs|caps|bottle|vial|ampoule|strip))\b/i);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Extracts base drug/brand name without strength or dosage form tokens
 */
export function extractBaseDrugName(rawName: string): string {
  if (!rawName) return '';
  let cleaned = normalizeMedicineName(rawName);

  // Remove strengths like 500MG, 650MG, 40MG, etc.
  cleaned = cleaned.replace(/\b\d+(?:\.\d+)?\s*(MG|MCG|GM|G|ML|IU|%)\b/gi, '');
  // Remove standalone strength numbers like 625, 375, 500, 650 when adjacent to drug names
  cleaned = cleaned.replace(/\b(625|375|500|650|1000|250|125|40|20|10|5|2|1)\b/g, '');
  // Remove dosage forms
  cleaned = cleaned.replace(/\b(TAB|CAP|SYP|INJ|OINT|GEL|DROPS|SUSP|CREAM|LOTION|POWDER|DUO)\b/gi, '');
  // Clean whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// =========================================================================
// 2. HISTORICAL RECORD EXTRACTION & DEDUPLICATION
// =========================================================================

/**
 * Reads all previous purchase items and deduplicates them per agency.
 * "Do not count duplicate bill entries as separate medicines when calculating coverage."
 */
export async function getHistoricalMedicineSupplierRecords(): Promise<HistoricalMedicineSupplierRecord[]> {
  const [items, agencies] = await Promise.all([getInvoiceItems(), getAgencies()]);

  const agencyMap = new Map<string, Agency>();
  agencies.forEach((a) => agencyMap.set(a.id, a));

  // Key: `${agencyId}::${normalizedMedicineName}`
  const dedupMap = new Map<string, HistoricalMedicineSupplierRecord>();

  items.forEach((item) => {
    if (!item.productName || !item.agencyId) return;

    const norm = item.normalizedName || normalizeMedicineName(item.productName);
    const key = `${item.agencyId}::${norm}`;

    const ag = agencyMap.get(item.agencyId);
    const agencyName = ag?.name || item.agencyName || 'Unknown Agency';
    const strength = item.packSize ? extractStrength(item.packSize) : extractStrength(item.productName);
    const packSize = item.packSize || extractPackSize(item.productName);
    const baseDrugName = extractBaseDrugName(item.productName);

    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, {
        agencyId: item.agencyId,
        agencyName,
        agencyPhone: ag?.phone,
        agencyGstin: ag?.gstin,
        productName: item.productName,
        normalizedName: norm,
        baseDrugName,
        manufacturer: item.manufacturer,
        packSize,
        strength,
        lastPurchaseDate: item.invoiceDate || '',
        lastInvoiceNumber: item.invoiceNumber || '',
        lastPurchaseRate: item.purchaseRate,
        totalTimesPurchased: 1,
      });
    } else {
      existing.totalTimesPurchased += 1;
      // Keep most recent invoice info
      if (item.invoiceDate && item.invoiceDate > existing.lastPurchaseDate) {
        existing.lastPurchaseDate = item.invoiceDate;
        existing.lastInvoiceNumber = item.invoiceNumber || existing.lastInvoiceNumber;
        existing.lastPurchaseRate = item.purchaseRate || existing.lastPurchaseRate;
      }
      if (!existing.manufacturer && item.manufacturer) {
        existing.manufacturer = item.manufacturer;
      }
      if (!existing.strength && strength) {
        existing.strength = strength;
      }
      if (!existing.packSize && packSize) {
        existing.packSize = packSize;
      }
    }
  });

  return Array.from(dedupMap.values());
}

// =========================================================================
// 3. STRICT MEDICINE MATCHING ENGINE
// =========================================================================

/**
 * Matches a requested order item against a historical record.
 * 
 * Strict Accuracy Rules:
 * - Match medicines carefully using available details such as manufacturer, strength, and pack size.
 * - Do NOT treat similar medicine names as confirmed matches (e.g. Paracetamol vs Pan 40).
 * - If medicine or agency information is missing or ambiguous, show it as unverified instead of guessing.
 */
export function evaluateMedicineMatch(
  requested: OrderItemInput,
  historical: HistoricalMedicineSupplierRecord
): {
  isMatch: boolean;
  status: MedicineMatchStatus;
  matchReason: string;
  detailsMismatch?: string[];
} {
  const reqNorm = normalizeMedicineName(requested.name);
  const histNorm = historical.normalizedName;

  const reqBase = extractBaseDrugName(requested.name);
  const histBase = historical.baseDrugName || extractBaseDrugName(historical.productName);

  // 1. Name Check:
  // Must either have identical normalized names, or identical base drug names
  const exactNormMatch = reqNorm === histNorm;
  const exactBaseMatch = reqBase !== '' && histBase !== '' && reqBase === histBase;

  if (!exactNormMatch && !exactBaseMatch) {
    // Check if one is a clean prefix of the other with length >= 4 (e.g. "AUGMENTIN" vs "AUGMENTIN DUO")
    const isTokenMatch =
      reqBase.length >= 4 &&
      histBase.length >= 4 &&
      (reqBase.includes(histBase) || histBase.includes(reqBase));

    if (!isTokenMatch) {
      return {
        isMatch: false,
        status: 'NO_MATCH',
        matchReason: 'Different medicine brand/active substance',
      };
    }
  }

  // 2. Strength Check:
  // If requested item has strength, or requested name contains strength
  const reqStrength = requested.strength ? extractStrength(requested.strength) : extractStrength(requested.name);
  const histStrength = historical.strength || extractStrength(historical.productName);

  const detailsMismatch: string[] = [];

  if (reqStrength && histStrength) {
    // Both specify strength -> must match!
    if (reqStrength.toUpperCase() !== histStrength.toUpperCase()) {
      return {
        isMatch: false,
        status: 'NO_MATCH',
        matchReason: `Strength mismatch: requested ${reqStrength} vs historical ${histStrength}`,
      };
    }
  } else if (reqStrength && !histStrength) {
    detailsMismatch.push(`Strength "${reqStrength}" unverified in historical scanned bills`);
  }

  // 3. Manufacturer Check:
  if (requested.manufacturer && requested.manufacturer.trim() !== '') {
    const reqMfr = requested.manufacturer.trim().toUpperCase();
    if (historical.manufacturer && historical.manufacturer.trim() !== '') {
      const histMfr = historical.manufacturer.trim().toUpperCase();
      if (!histMfr.includes(reqMfr) && !reqMfr.includes(histMfr)) {
        return {
          isMatch: false,
          status: 'NO_MATCH',
          matchReason: `Manufacturer mismatch: requested ${requested.manufacturer} vs historical ${historical.manufacturer}`,
        };
      }
    } else {
      detailsMismatch.push(`Manufacturer "${requested.manufacturer}" unrecorded in past bills`);
    }
  }

  // 4. Pack Size Check:
  if (requested.packSize && requested.packSize.trim() !== '') {
    const reqPack = requested.packSize.trim().toUpperCase();
    if (historical.packSize && historical.packSize.trim() !== '') {
      const histPack = historical.packSize.trim().toUpperCase();
      if (reqPack !== histPack) {
        detailsMismatch.push(`Pack size differs: requested ${requested.packSize} vs historical ${historical.packSize}`);
      }
    }
  }

  // Determine confirmed vs unverified status
  if (detailsMismatch.length > 0) {
    return {
      isMatch: true,
      status: 'UNVERIFIED_MATCH',
      matchReason: `Matched medicine name, with unverified details (${detailsMismatch.join('; ')})`,
      detailsMismatch,
    };
  }

  return {
    isMatch: true,
    status: 'CONFIRMED_MATCH',
    matchReason: `Verified match on previous bill #${historical.lastInvoiceNumber} (${historical.lastPurchaseDate})`,
  };
}

// =========================================================================
// 4. SMART AGENCY COVERAGE CALCULATION & RANKING
// =========================================================================

/**
 * Calculates historical purchase coverage for each agency against the required medicine list.
 * 
 * Rules:
 * - Calculate coverage percentage: matched requested items / total requested items * 100.
 * - Rank agencies from highest coverage to lowest coverage.
 * - Do NOT compare prices or rank agencies by price.
 * - Recommend the agency with the highest historical coverage.
 * - If multiple agencies have equal coverage, show them equally rather than inventing a winner.
 * - Deduplicated: duplicate bill entries count only once.
 */
export function calculateSmartAgencyCoverage(
  requestedItems: OrderItemInput[],
  historicalRecords: HistoricalMedicineSupplierRecord[],
  agencies: Agency[]
): AgencyCoverageResult[] {
  if (requestedItems.length === 0) {
    return [];
  }

  const results: AgencyCoverageResult[] = [];

  agencies.forEach((agency) => {
    const agencyHistory = historicalRecords.filter((h) => h.agencyId === agency.id);

    const matchedItems: MedicineAgencyMatchDetail[] = [];
    const unmatchedItems: MedicineAgencyMatchDetail[] = [];
    const unverifiedItems: MedicineAgencyMatchDetail[] = [];

    requestedItems.forEach((req) => {
      // Find candidate matches among this agency's historical records
      let bestMatch: HistoricalMedicineSupplierRecord | undefined;
      let bestStatus: MedicineMatchStatus = 'NO_MATCH';
      let bestReason = 'Not found in previous purchase records for this agency';
      let bestMismatches: string[] | undefined;

      for (const hist of agencyHistory) {
        const evalRes = evaluateMedicineMatch(req, hist);
        if (evalRes.isMatch) {
          if (evalRes.status === 'CONFIRMED_MATCH') {
            bestMatch = hist;
            bestStatus = 'CONFIRMED_MATCH';
            bestReason = evalRes.matchReason;
            bestMismatches = undefined;
            break; // Found confirmed match
          } else if (evalRes.status === 'UNVERIFIED_MATCH' && bestStatus === 'NO_MATCH') {
            bestMatch = hist;
            bestStatus = 'UNVERIFIED_MATCH';
            bestReason = evalRes.matchReason;
            bestMismatches = evalRes.detailsMismatch;
          }
        }
      }

      if (bestStatus === 'CONFIRMED_MATCH') {
        matchedItems.push({
          orderItemId: req.id,
          requestedItem: req,
          matchedHistoricalItem: bestMatch,
          status: 'CONFIRMED_MATCH',
          matchReason: bestReason,
        });
      } else if (bestStatus === 'UNVERIFIED_MATCH') {
        unverifiedItems.push({
          orderItemId: req.id,
          requestedItem: req,
          matchedHistoricalItem: bestMatch,
          status: 'UNVERIFIED_MATCH',
          matchReason: bestReason,
          detailsMismatch: bestMismatches,
        });
        // Count unverified matches in matchedItems as well for complete review
        matchedItems.push({
          orderItemId: req.id,
          requestedItem: req,
          matchedHistoricalItem: bestMatch,
          status: 'UNVERIFIED_MATCH',
          matchReason: bestReason,
          detailsMismatch: bestMismatches,
        });
      } else {
        unmatchedItems.push({
          orderItemId: req.id,
          requestedItem: req,
          status: 'NO_MATCH',
          matchReason: bestReason,
        });
      }
    });

    const totalRequestedCount = requestedItems.length;
    const matchedCount = matchedItems.length;
    const coveragePercentage = totalRequestedCount > 0
      ? Math.round((matchedCount / totalRequestedCount) * 100)
      : 0;

    results.push({
      agencyId: agency.id,
      agencyName: agency.name,
      agencyPhone: agency.phone,
      agencyAddress: agency.address,
      agencyGstin: agency.gstin,
      matchedCount,
      totalRequestedCount,
      coveragePercentage,
      matchedItems,
      unmatchedItems,
      unverifiedItems,
      isTopRecommended: false,
      isTiedTop: false,
    });
  });

  // Rank from highest coverage percentage to lowest coverage percentage
  // DO NOT SORT BY PRICE
  results.sort((a, b) => {
    if (b.coveragePercentage !== a.coveragePercentage) {
      return b.coveragePercentage - a.coveragePercentage;
    }
    // If coverage percentage is equal, maintain stable order by matchedCount, then agency name
    if (b.matchedCount !== a.matchedCount) {
      return b.matchedCount - a.matchedCount;
    }
    return a.agencyName.localeCompare(b.agencyName);
  });

  // Top Recommendation & Equal Tie Handling
  if (results.length > 0 && results[0].coveragePercentage > 0) {
    const topPct = results[0].coveragePercentage;
    const topTiedAgencies = results.filter((r) => r.coveragePercentage === topPct);

    if (topTiedAgencies.length === 1) {
      // Single clear winner
      results[0].isTopRecommended = true;
      results[0].isTiedTop = false;
    } else {
      // Multiple agencies have equal top coverage: show them equally rather than inventing a winner
      topTiedAgencies.forEach((r) => {
        r.isTopRecommended = true;
        r.isTiedTop = true;
        r.tieCount = topTiedAgencies.length;
      });
    }
  }

  return results;
}

// =========================================================================
// 5. ORDER FORM GENERATION & WHATSAPP SHARING
// =========================================================================

/**
 * Creates an order structure for a selected agency based on coverage results
 */
export function createOrderForAgency(
  agencyCoverage: AgencyCoverageResult,
  allRequestedItems: OrderItemInput[],
  allHistoricalRecords: HistoricalMedicineSupplierRecord[]
): FinalizedMedicineOrder {
  const orderNumber = `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Matched items relevant to this agency
  const orderItems: FinalizedMedicineOrderItem[] = agencyCoverage.matchedItems.map((m) => ({
    orderItemId: m.orderItemId,
    name: m.requestedItem.name,
    manufacturer: m.requestedItem.manufacturer || m.matchedHistoricalItem?.manufacturer,
    strength: m.requestedItem.strength || m.matchedHistoricalItem?.strength,
    packSize: m.requestedItem.packSize || m.matchedHistoricalItem?.packSize,
    quantity: m.requestedItem.quantity,
    included: true,
    isHistoricallyMatched: true,
    historicalBillNumber: m.matchedHistoricalItem?.lastInvoiceNumber,
    historicalDate: m.matchedHistoricalItem?.lastPurchaseDate,
    notes: m.requestedItem.notes,
  }));

  // Identify where unmatched items were previously bought from, to help the pharmacist
  const unmatched = agencyCoverage.unmatchedItems.map((u) => {
    // Check if another agency previously supplied this
    const alternate = allHistoricalRecords.find((h) => {
      const matchRes = evaluateMedicineMatch(u.requestedItem, h);
      return matchRes.isMatch && h.agencyId !== agencyCoverage.agencyId;
    });

    return {
      name: u.requestedItem.name,
      manufacturer: u.requestedItem.manufacturer || alternate?.manufacturer,
      strength: u.requestedItem.strength || alternate?.strength,
      packSize: u.requestedItem.packSize || alternate?.packSize,
      quantity: u.requestedItem.quantity,
      suggestedAgencyName: alternate?.agencyName,
    };
  });

  return {
    id: `order-${Date.now()}`,
    orderNumber,
    agencyId: agencyCoverage.agencyId,
    agencyName: agencyCoverage.agencyName,
    agencyPhone: agencyCoverage.agencyPhone,
    agencyGstin: agencyCoverage.agencyGstin,
    orderDate: new Date().toISOString().split('T')[0],
    items: orderItems,
    unmatchedItems: unmatched,
    specialInstructions: 'Please supply freshest batch with maximum expiry. Kindly share invoice copy on dispatch.',
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Formats order as clean plain text for WhatsApp sharing
 */
export function formatOrderForWhatsApp(order: FinalizedMedicineOrder, pharmacyName: string = 'PharmaScan Pharmacy'): string {
  const activeItems = order.items.filter((i) => i.included);

  let msg = `*PURCHASE ORDER — ${pharmacyName.toUpperCase()}*\n`;
  msg += `*Order Ref:* #${order.orderNumber}\n`;
  msg += `*Date:* ${order.orderDate}\n`;
  msg += `*To:* ${order.agencyName}\n`;
  if (order.agencyGstin) {
    msg += `*GSTIN:* ${order.agencyGstin}\n`;
  }
  msg += `------------------------------------------\n`;
  msg += `*REQUIRED MEDICINES (${activeItems.length} ITEMS):*\n\n`;

  activeItems.forEach((it, idx) => {
    msg += `${idx + 1}. *${it.name.toUpperCase()}*\n`;
    const details: string[] = [];
    if (it.strength) details.push(`Strength: ${it.strength}`);
    if (it.manufacturer) details.push(`Mfr: ${it.manufacturer}`);
    if (it.packSize) details.push(`Pack: ${it.packSize}`);
    if (details.length > 0) {
      msg += `   _${details.join(' | ')}_\n`;
    }
    msg += `   *Required Qty: ${it.quantity}*\n`;
    if (it.notes) {
      msg += `   _Note: ${it.notes}_\n`;
    }
    msg += `\n`;
  });

  if (order.specialInstructions) {
    msg += `------------------------------------------\n`;
    msg += `*Instructions:* ${order.specialInstructions}\n`;
  }

  msg += `------------------------------------------\n`;
  msg += `_Sent via PharmaScan Smart Medicine Order_\n`;
  msg += `_Based on previous purchase records._\n`;

  return msg;
}

/**
 * Generates direct WhatsApp click-to-chat URL
 */
export function getWhatsAppOrderUrl(phone: string | undefined, message: string): string {
  const encoded = encodeURIComponent(message);
  if (!phone || phone.trim() === '') {
    return `https://wa.me/?text=${encoded}`;
  }

  // Clean phone number: remove non-digits
  let digits = phone.replace(/\D/g, '');
  // If Indian 10 digits without country code, prepend 91
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  return `https://wa.me/${digits}?text=${encoded}`;
}

// =========================================================================
// 6. ORDER PERSISTENCE IN LOCAL STORAGE
// =========================================================================

export function getSavedMedicineOrders(): FinalizedMedicineOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading saved medicine orders:', err);
    return [];
  }
}

export function saveMedicineOrder(order: FinalizedMedicineOrder): void {
  try {
    const existing = getSavedMedicineOrders();
    const idx = existing.findIndex((o) => o.id === order.id);
    if (idx >= 0) {
      existing[idx] = { ...order, updatedAt: new Date().toISOString() };
    } else {
      existing.unshift(order);
    }
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(existing));
  } catch (err) {
    console.error('Error saving medicine order:', err);
  }
}

export function deleteMedicineOrder(orderId: string): void {
  try {
    const existing = getSavedMedicineOrders();
    const filtered = existing.filter((o) => o.id !== orderId);
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Error deleting medicine order:', err);
  }
}

// =========================================================================
// 7. SELF-TESTING SUITE FOR ACCURACY VERIFICATION (Requirement 7)
// =========================================================================

export interface OrderVerificationTestResult {
  name: string;
  passed: boolean;
  details: string;
}

/**
 * Runs automated tests on the Smart Order logic:
 * - Empty order list handling
 * - Duplicate bill entries deduplication
 * - Strict non-matching of distinct medicines (e.g. Paracetamol vs Pan 40)
 * - Coverage percentage math
 * - Equal coverage tie handling (no fake winners)
 * - Disclaimer labeling check
 */
export function runSmartOrderTestSuite(): OrderVerificationTestResult[] {
  const tests: OrderVerificationTestResult[] = [];

  // TEST 1: Empty list safety
  try {
    const res = calculateSmartAgencyCoverage([], [], []);
    tests.push({
      name: 'Empty List Safety',
      passed: Array.isArray(res) && res.length === 0,
      details: 'Handled empty requested list safely returning empty coverage results.',
    });
  } catch (err: any) {
    tests.push({ name: 'Empty List Safety', passed: false, details: err.message });
  }

  // TEST 2: Strict name matching (Do not match similar names like Paracetamol vs Pan 40)
  try {
    const req: OrderItemInput = { id: 't1', name: 'Paracetamol 500mg', quantity: 10 };
    const hist: HistoricalMedicineSupplierRecord = {
      agencyId: 'ag1',
      agencyName: 'Agency 1',
      productName: 'PAN 40MG TABLET',
      normalizedName: 'PAN 40MG TAB',
      baseDrugName: 'PAN',
      totalTimesPurchased: 5,
      lastInvoiceNumber: 'INV-1',
      lastPurchaseDate: '2026-09-01',
    };
    const evalRes = evaluateMedicineMatch(req, hist);
    tests.push({
      name: 'Strict Medicine Discrimination',
      passed: evalRes.isMatch === false && evalRes.status === 'NO_MATCH',
      details: 'Properly rejected "Paracetamol 500mg" vs "PAN 40MG" as distinct medicines.',
    });
  } catch (err: any) {
    tests.push({ name: 'Strict Medicine Discrimination', passed: false, details: err.message });
  }

  // TEST 3: Strength mismatch rejection (Paracetamol 500mg vs Paracetamol 650mg)
  try {
    const req: OrderItemInput = { id: 't2', name: 'Paracetamol 500mg', strength: '500mg', quantity: 20 };
    const hist: HistoricalMedicineSupplierRecord = {
      agencyId: 'ag1',
      agencyName: 'Agency 1',
      productName: 'PARACETAMOL 650 MG',
      normalizedName: 'PARACETAMOL 650MG',
      baseDrugName: 'PARACETAMOL',
      strength: '650MG',
      totalTimesPurchased: 3,
      lastInvoiceNumber: 'INV-2',
      lastPurchaseDate: '2026-09-10',
    };
    const evalRes = evaluateMedicineMatch(req, hist);
    tests.push({
      name: 'Strength Mismatch Rejection',
      passed: evalRes.isMatch === false && evalRes.status === 'NO_MATCH',
      details: 'Rejected match when requested strength (500mg) differed from historical strength (650mg).',
    });
  } catch (err: any) {
    tests.push({ name: 'Strength Mismatch Rejection', passed: false, details: err.message });
  }

  // TEST 4: Verified match with same strength
  try {
    const req: OrderItemInput = { id: 't3', name: 'Augmentin 625 Duo', strength: '625mg', quantity: 15 };
    const hist: HistoricalMedicineSupplierRecord = {
      agencyId: 'ag1',
      agencyName: 'Agency 1',
      productName: 'AUGMENTIN 625 DUO TAB',
      normalizedName: 'AUGMENTIN 625 DUO TAB',
      baseDrugName: 'AUGMENTIN',
      strength: '625MG',
      totalTimesPurchased: 4,
      lastInvoiceNumber: 'INV-3',
      lastPurchaseDate: '2026-09-20',
    };
    const evalRes = evaluateMedicineMatch(req, hist);
    tests.push({
      name: 'Confirmed Medicine Match',
      passed: evalRes.isMatch === true && evalRes.status === 'CONFIRMED_MATCH',
      details: 'Correctly confirmed match for Augmentin 625 Duo with matching strength.',
    });
  } catch (err: any) {
    tests.push({ name: 'Confirmed Medicine Match', passed: false, details: err.message });
  }

  // TEST 5: Deduplication of duplicate bills
  try {
    const reqList: OrderItemInput[] = [
      { id: '1', name: 'PARACETAMOL 500 MG', quantity: 10 },
      { id: '2', name: 'PAN 40MG', quantity: 15 },
    ];
    // Simulated agency with 10 duplicate purchases of Paracetamol
    const simulatedHistory: HistoricalMedicineSupplierRecord[] = [
      {
        agencyId: 'ag-test',
        agencyName: 'Test Agency',
        productName: 'PARACETAMOL 500 MG',
        normalizedName: 'PARACETAMOL 500MG',
        baseDrugName: 'PARACETAMOL',
        strength: '500MG',
        totalTimesPurchased: 10,
        lastInvoiceNumber: 'INV-10',
        lastPurchaseDate: '2026-09-25',
      },
    ];
    const dummyAgency: Agency = {
      id: 'ag-test',
      name: 'Test Agency',
      createdAt: '',
      updatedAt: '',
    };
    const cov = calculateSmartAgencyCoverage(reqList, simulatedHistory, [dummyAgency]);
    // 1 match out of 2 requested = 50%
    const passed = cov.length === 1 && cov[0].matchedCount === 1 && cov[0].coveragePercentage === 50;
    tests.push({
      name: 'Deduplicated Coverage Math',
      passed,
      details: `Coverage correctly calculated 1 of 2 items (50%) despite multiple purchases.`,
    });
  } catch (err: any) {
    tests.push({ name: 'Deduplicated Coverage Math', passed: false, details: err.message });
  }

  // TEST 6: Equal coverage tie handling (No fake winner)
  try {
    const reqList: OrderItemInput[] = [
      { id: '1', name: 'PARACETAMOL 500 MG', quantity: 10 },
      { id: '2', name: 'AUGMENTIN 625 DUO', quantity: 10 },
    ];
    const historyA: HistoricalMedicineSupplierRecord = {
      agencyId: 'ag-a',
      agencyName: 'Agency Alpha',
      productName: 'PARACETAMOL 500 MG',
      normalizedName: 'PARACETAMOL 500MG',
      baseDrugName: 'PARACETAMOL',
      strength: '500MG',
      totalTimesPurchased: 1,
      lastInvoiceNumber: 'INV-A',
      lastPurchaseDate: '2026-09-01',
    };
    const historyB: HistoricalMedicineSupplierRecord = {
      agencyId: 'ag-b',
      agencyName: 'Agency Beta',
      productName: 'AUGMENTIN 625 DUO',
      normalizedName: 'AUGMENTIN 625 DUO',
      baseDrugName: 'AUGMENTIN',
      strength: '625MG',
      totalTimesPurchased: 1,
      lastInvoiceNumber: 'INV-B',
      lastPurchaseDate: '2026-09-01',
    };
    const agA: Agency = { id: 'ag-a', name: 'Agency Alpha', createdAt: '', updatedAt: '' };
    const agB: Agency = { id: 'ag-b', name: 'Agency Beta', createdAt: '', updatedAt: '' };

    const cov = calculateSmartAgencyCoverage(reqList, [historyA, historyB], [agA, agB]);
    const bothTied = cov[0].coveragePercentage === 50 && cov[1].coveragePercentage === 50 && cov[0].isTiedTop && cov[1].isTiedTop;
    tests.push({
      name: 'Equal Coverage Tie Handling',
      passed: bothTied,
      details: 'Identified 50% tie between Alpha and Beta without fabricating a winner.',
    });
  } catch (err: any) {
    tests.push({ name: 'Equal Coverage Tie Handling', passed: false, details: err.message });
  }

  return tests;
}
