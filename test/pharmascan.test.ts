import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMedicineName, compareMedicines } from '../src/services/pricingService.js';
import { parseExpiryDate } from '../src/services/expiryService.js';

// ==========================================================
// 1. MEDICINE NORMALIZATION & MATCHING TESTS
// ==========================================================
test('normalizeMedicineName standardizes pharmacy abbreviations and dosages', () => {
  assert.equal(normalizeMedicineName('PCM 500 MG TABLET'), 'PARACETAMOL 500MG TAB');
  assert.equal(normalizeMedicineName('Azi 250 mg Capsule'), 'AZITHROMYCIN 250MG CAP');
  assert.equal(normalizeMedicineName('Met 500mg syrup'), 'METFORMIN 500MG SYP');
  assert.equal(normalizeMedicineName('Ciplox 500 Eye Drops'), 'CIPROFLOXACIN 500 EYE DROPS');
  assert.equal(normalizeMedicineName('Augmentin 625 Duo Tab'), 'AUGMENTIN 625 DUO TAB');
});

test('compareMedicines matches exact codes and similar names', () => {
  // Matching product code
  const codeMatch = compareMedicines('Paracetamol', 'HSN-3004', 'PCM 500', 'HSN-3004');
  assert.equal(codeMatch.match, true);
  assert.equal(codeMatch.confidence, 'EXACT');

  // Exact normalized name
  const nameMatch = compareMedicines('PCM 500mg Tab', undefined, 'Paracetamol 500 mg Tablet', undefined);
  assert.equal(nameMatch.match, true);
  assert.equal(nameMatch.confidence, 'EXACT');

  // Completely different
  const diff = compareMedicines('Amoxicillin 500', undefined, 'Cetirizine 10', undefined);
  assert.equal(diff.match, false);
  assert.equal(diff.confidence, 'DIFFERENT');
});

// ==========================================================
// 2. EXPIRY DATE PARSER TESTS
// ==========================================================
test('parseExpiryDate parses MMM-YY, MM/YY, and MM/YYYY accurately', () => {
  // MMM-YY format
  const nov26 = parseExpiryDate('NOV-26');
  assert.equal(nov26.date.getMonth(), 10); // November is 10 (0-indexed)
  assert.equal(nov26.date.getFullYear(), 2026);

  // MM/YY format
  const dec27 = parseExpiryDate('12/27');
  assert.equal(dec27.date.getMonth(), 11); // December is 11
  assert.equal(dec27.date.getFullYear(), 2027);

  // MM/YYYY format
  const mar28 = parseExpiryDate('03/2028');
  assert.equal(mar28.date.getMonth(), 2); // March is 2
  assert.equal(mar28.date.getFullYear(), 2028);

  // Missing / Not Detected fallback
  const fallback = parseExpiryDate('NOT DETECTED');
  assert.equal(fallback.formatted, 'NOT DETECTED');
  assert.ok(fallback.timestamp > Date.now());
});

// ==========================================================
// 3. FINANCIAL CALCULATIONS & LEDGER INTEGRITY TESTS
// ==========================================================
test('Financial balance calculation: purchases, opening dues, payments', () => {
  const invoices = [
    { id: '1', agencyId: 'ag-1', invoiceNumber: 'INV-001', invoiceTotal: 15400.50, documentType: 'PURCHASE_BILL' },
    { id: '2', agencyId: 'ag-1', invoiceNumber: 'INV-002', invoiceTotal: 8600.00, documentType: 'PURCHASE_BILL' },
    { id: '3', agencyId: 'ag-1', invoiceNumber: 'DUE-001', invoiceTotal: 5000.00, documentType: 'OPENING_DUE' },
    { id: '4', agencyId: 'ag-1', invoiceNumber: 'REC-001', invoiceTotal: 10000.00, documentType: 'RECEIPT' }, // Ignored from purchases
  ];

  const payments = [
    { id: 'p1', agencyId: 'ag-1', amount: 12000.00 },
    { id: 'p2', agencyId: 'ag-1', amount: 5000.00 },
  ];

  const totalPurchases = invoices
    .filter((inv) => inv.documentType !== 'RECEIPT' && inv.documentType !== 'OPENING_DUE')
    .reduce((sum, inv) => sum + inv.invoiceTotal, 0);

  const totalOpeningDues = invoices
    .filter((inv) => inv.documentType === 'OPENING_DUE')
    .reduce((sum, inv) => sum + inv.invoiceTotal, 0);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalOutstanding = Math.max(0, totalOpeningDues + totalPurchases - totalPaid);

  assert.equal(totalPurchases, 24000.50);
  assert.equal(totalOpeningDues, 5000.00);
  assert.equal(totalPaid, 17000.00);
  assert.equal(totalOutstanding, 12000.50);
});

// ==========================================================
// 4. DUPLICATE INVOICE & PAYMENT DETECTION LOGIC
// ==========================================================
test('Duplicate invoice detection catches identical bill numbers and amounts', () => {
  const existingInvoices = [
    { agencyId: 'ag-1', agencyName: 'Cipla Distributors', invoiceNumber: 'INV-9041', invoiceDate: '2026-10-15', invoiceTotal: 4520.00, documentType: 'PURCHASE_BILL' },
  ];

  function checkDup(agencyId: string, invoiceNumber: string, invoiceDate: string, invoiceTotal: number) {
    const cleanNum = invoiceNumber.trim().toUpperCase();
    for (const inv of existingInvoices) {
      if (inv.documentType === 'RECEIPT') continue;
      const existingNum = (inv.invoiceNumber || '').trim().toUpperCase();
      if (inv.agencyId === agencyId && existingNum === cleanNum) {
        return { isDuplicate: true, reason: 'SAME_AGENCY_AND_NUMBER' };
      }
      if (existingNum === cleanNum && inv.invoiceDate === invoiceDate && Math.abs(inv.invoiceTotal - invoiceTotal) < 1.0) {
        return { isDuplicate: true, reason: 'CROSS_AGENCY_MATCH' };
      }
    }
    return { isDuplicate: false };
  }

  // Exact duplicate under same agency
  assert.deepEqual(checkDup('ag-1', 'INV-9041', '2026-10-15', 4520.00), { isDuplicate: true, reason: 'SAME_AGENCY_AND_NUMBER' });

  // Matching bill number + date + amount under different agency ID
  assert.deepEqual(checkDup('ag-2', 'INV-9041', '2026-10-15', 4520.00), { isDuplicate: true, reason: 'CROSS_AGENCY_MATCH' });

  // Different invoice number
  assert.deepEqual(checkDup('ag-1', 'INV-9042', '2026-10-15', 4520.00), { isDuplicate: false });
});

test('Duplicate payment detection catches duplicate UTR/Cheque reference', () => {
  const existingPayments = [
    { agencyId: 'ag-1', amount: 15000, paymentDate: '2026-10-20', referenceNumber: 'UTR-98234123' },
  ];

  function checkDupPay(agencyId: string, amount: number, paymentDate: string, referenceNumber?: string) {
    const cleanRef = referenceNumber?.trim().toUpperCase();
    for (const pay of existingPayments) {
      if (pay.agencyId !== agencyId) continue;
      const existingRef = (pay.referenceNumber || '').trim().toUpperCase();
      if (cleanRef && cleanRef.length > 2 && existingRef === cleanRef) {
        return { isDuplicate: true, reason: 'DUPLICATE_REFERENCE' };
      }
      if (pay.amount === amount && pay.paymentDate === paymentDate) {
        return { isDuplicate: true, reason: 'SAME_DATE_AND_AMOUNT' };
      }
    }
    return { isDuplicate: false };
  }

  assert.deepEqual(checkDupPay('ag-1', 15000, '2026-10-20', 'UTR-98234123'), { isDuplicate: true, reason: 'DUPLICATE_REFERENCE' });
  assert.deepEqual(checkDupPay('ag-1', 15000, '2026-10-20', undefined), { isDuplicate: true, reason: 'SAME_DATE_AND_AMOUNT' });
  assert.deepEqual(checkDupPay('ag-1', 12000, '2026-10-21', 'UTR-99999999'), { isDuplicate: false });
});

// ==========================================================
// 5. MULTI-PHARMACY ACCOUNT ISOLATION TESTS
// ==========================================================
test('Multi-pharmacy data isolation sanitizes email and scopes directories', () => {
  function getPharmacyStorageDir(email: string): string {
    const cleanEmail = email.replace(/[^a-zA-Z0-9@._-]/g, '_').replace(/\.{2,}/g, '_').replace(/_+/g, '_');
    // Prevent directory traversal
    assert.ok(!cleanEmail.includes('..'));
    assert.ok(!cleanEmail.includes('/'));
    assert.ok(!cleanEmail.includes('\\'));
    return `backups/${cleanEmail}`;
  }

  const dirA = getPharmacyStorageDir('jaya.pharmacy@gmail.com');
  const dirB = getPharmacyStorageDir('apollo.medical@gmail.com');
  const dirMalicious = getPharmacyStorageDir('../../../etc/passwd@domain.com');

  assert.equal(dirA, 'backups/jaya.pharmacy@gmail.com');
  assert.equal(dirB, 'backups/apollo.medical@gmail.com');
  assert.notEqual(dirA, dirB); // Strict isolation
  assert.equal(dirMalicious, 'backups/_etc_passwd@domain.com'); // Traversal prevented
});

// ==========================================================
// 6. WHATSAPP & TEXT REPORT FORMATTING TESTS
// ==========================================================
test('WhatsApp export text formatting includes all essential bill fields', async () => {
  const { generateBillSummaryText } = await import('../src/services/shareService.js');
  const mockInvoice: any = {
    id: 'inv-1',
    agencyName: 'Sun Pharma Distribution',
    invoiceNumber: 'SP-2026-99',
    invoiceDate: '2026-10-25',
    invoiceTotal: 12500,
    taxableAmount: 11160.71,
    gstAmount: 1339.29,
    documentType: 'TAX INVOICE',
    paymentStatus: 'UNPAID',
    items: [
      {
        productName: 'Dolo 650mg Tab',
        batchNumber: 'DL9012',
        expiryDate: '12/28',
        quantity: 50,
        freeQuantity: 5,
        purchaseRate: 25.50,
        mrp: 35.00,
        lineTotal: 1275.00,
      },
    ],
  };

  const summary = generateBillSummaryText(mockInvoice);
  assert.ok(summary.includes('Sun Pharma Distribution'));
  assert.ok(summary.includes('#SP-2026-99'));
  assert.ok(summary.includes('Dolo 650mg Tab'));
  assert.ok(summary.includes('Batch: DL9012'));
  assert.ok(summary.includes('12/28'));
  assert.ok(summary.includes('12,500'));
});

// ==========================================================
// 7. SCHEDULE & VISIT PREDICTION TESTS
// ==========================================================
test('Schedule service computes day differences and date additions correctly', async () => {
  const { getDaysDifference, addDaysToDate } = await import('../src/services/scheduleService.js');
  
  assert.equal(getDaysDifference('2026-11-15', '2026-11-10'), 5);
  assert.equal(getDaysDifference('2026-11-10', '2026-11-15'), -5);
  assert.equal(getDaysDifference('2026-11-10', '2026-11-10'), 0);

  assert.equal(addDaysToDate('2026-11-10', 7), '2026-11-17');
  assert.equal(addDaysToDate('2026-11-28', 5), '2026-12-03');
});

