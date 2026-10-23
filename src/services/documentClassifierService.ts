import { DocumentType } from '../types/pharmacy';

export interface ClassificationResult {
  documentType: 'PURCHASE_BILL' | 'RECEIPT';
  confidence: 'HIGH' | 'LOW';
  reason: string;
  isUncertain: boolean;
  scores: {
    purchaseScore: number;
    receiptScore: number;
  };
}

/**
 * Multi-signal document classifier:
 * Analyzes OCR text, structural indicators, and layout to classify between
 * PURCHASE BILL and PAYMENT RECEIPT.
 *
 * If confidence is high: auto-classifies.
 * If confidence is low: flags as uncertain and lets user choose.
 */
export function classifyDocument(
  text: string,
  hints?: {
    itemsCount?: number;
    hasBatchNumbers?: boolean;
    hasExpiryDates?: boolean;
    hasTaxTable?: boolean;
    detectedTypeHint?: string;
  }
): ClassificationResult {
  const normalized = (text || '').toLowerCase();

  let purchaseScore = 0;
  let receiptScore = 0;
  const purchaseMatches: string[] = [];
  const receiptMatches: string[] = [];

  // PURCHASE BILL indicators (Requirement 1)
  const purchaseKeywords = [
    { pattern: /\b(tax\s*invoice|tax\s*bill|purchase\s*invoice|purchase\s*bill)\b/g, weight: 4, name: 'Tax Invoice / Purchase Bill' },
    { pattern: /\b(invoice\s*no|inv\s*no|bill\s*no|bill\s*#|invoice\s*#)\b/g, weight: 3, name: 'Invoice Number' },
    { pattern: /\b(invoice\s*date|bill\s*date|dated)\b/g, weight: 2, name: 'Invoice Date' },
    { pattern: /\b(batch\s*no|b\.?\s*no|batch)\b/g, weight: 3, name: 'Batch Number' },
    { pattern: /\b(exp\.?\s*date|expiry|exp\s*dt)\b/g, weight: 3, name: 'Expiry Date' },
    { pattern: /\b(m\.?r\.?p\.?|ptr|pts)\b/g, weight: 3, name: 'MRP / PTR / PTS' },
    { pattern: /\b(hsn\s*code|hsn|sac)\b/g, weight: 2, name: 'HSN Code' },
    { pattern: /\b(cgst|sgst|igst|taxable\s*amount|gstin)\b/g, weight: 2, name: 'GST / Tax breakdown' },
    { pattern: /\b(qty|quantity|free\s*qty|billed\s*qty)\b/g, weight: 2, name: 'Quantity details' },
    { pattern: /\b(tab|tablet|capsule|inj|injection|syrup|syp|strips|ointment)\b/g, weight: 2, name: 'Medicine dosage forms' },
    { pattern: /\b(d\.?l\.?\s*no|drug\s*licence|drug\s*license)\b/g, weight: 2, name: 'Drug License' },
    { pattern: /\b(distributor|stockist|agencies|agency|pharmaceuticals|pharma)\b/g, weight: 1, name: 'Pharma Supplier' },
  ];

  // PAYMENT RECEIPT indicators (Requirement 1)
  const receiptKeywords = [
    { pattern: /\b(payment\s*receipt|money\s*receipt|official\s*receipt|cash\s*receipt)\b/g, weight: 5, name: 'Payment/Money Receipt header' },
    { pattern: /\b(received\s*with\s*thanks|received\s*from|received\s*the\s*sum)\b/g, weight: 4, name: 'Received with thanks' },
    { pattern: /\b(amount\s*paid|payment\s*received|paid\s*amount|net\s*paid)\b/g, weight: 4, name: 'Amount Paid / Payment Received' },
    { pattern: /\b(cheque\s*no|chq\s*no|utr\s*no|utr|upi\s*ref|transaction\s*id|txn\s*id|transaction\s*ref)\b/g, weight: 4, name: 'Transaction / Cheque / UTR Reference' },
    { pattern: /\b(payment\s*date|receipt\s*date|paid\s*date)\b/g, weight: 3, name: 'Payment Date' },
    { pattern: /\b(payment\s*mode|by\s*cash|by\s*cheque|by\s*upi|by\s*neft|by\s*rtgs|by\s*bank\s*transfer)\b/g, weight: 3, name: 'Payment Method' },
    { pattern: /\b(towards\s*bill|against\s*bill|against\s*inv|on\s*account\s*of|being\s*payment)\b/g, weight: 3, name: 'Payment on account' },
    { pattern: /\b(previous\s*balance|old\s*balance|prior\s*balance)\b/g, weight: 3, name: 'Previous Balance' },
    { pattern: /\b(remaining\s*balance|current\s*balance|balance\s*due|outstanding\s*balance)\b/g, weight: 3, name: 'Remaining / Outstanding Balance' },
    { pattern: /\b(voucher|credit\s*voucher|payment\s*voucher|debit\s*voucher)\b/g, weight: 3, name: 'Payment Voucher' },
  ];

  // Evaluate Purchase keywords
  for (const item of purchaseKeywords) {
    if (item.pattern.test(normalized)) {
      purchaseScore += item.weight;
      purchaseMatches.push(item.name);
    }
  }

  // Evaluate Receipt keywords
  for (const item of receiptKeywords) {
    if (item.pattern.test(normalized)) {
      receiptScore += item.weight;
      receiptMatches.push(item.name);
    }
  }

  // Structural signals from extracted items
  if (hints?.itemsCount && hints.itemsCount > 0) {
    purchaseScore += Math.min(6, hints.itemsCount * 2);
  }
  if (hints?.hasBatchNumbers) {
    purchaseScore += 3;
  }
  if (hints?.hasExpiryDates) {
    purchaseScore += 3;
  }
  if (hints?.hasTaxTable) {
    purchaseScore += 2;
  }

  // If there are NO medicine line items but strong payment keywords, boost receipt
  if ((!hints?.itemsCount || hints.itemsCount === 0) && receiptScore >= 3) {
    receiptScore += 4;
  }

  // Check hint from upstream AI if provided
  if (hints?.detectedTypeHint === 'RECEIPT') {
    receiptScore += 4;
  } else if (hints?.detectedTypeHint === 'PURCHASE_BILL' || hints?.detectedTypeHint === 'TAX_INVOICE') {
    purchaseScore += 4;
  }

  // Decision logic (Requirement 1: multiple signals, confidence thresholds)
  const scoreDiff = Math.abs(purchaseScore - receiptScore);
  const totalScore = purchaseScore + receiptScore;

  if (totalScore < 3) {
    // Both signals are weak -> uncertain
    return {
      documentType: 'PURCHASE_BILL',
      confidence: 'LOW',
      isUncertain: true,
      reason: 'Few recognizable keywords detected. Please confirm if this is a Purchase Bill or Payment Receipt.',
      scores: { purchaseScore, receiptScore },
    };
  }

  if (receiptScore >= 4 && receiptScore > purchaseScore * 1.3) {
    return {
      documentType: 'RECEIPT',
      confidence: 'HIGH',
      isUncertain: false,
      reason: `Auto-detected Payment Receipt based on signals: ${receiptMatches.slice(0, 3).join(', ')}.`,
      scores: { purchaseScore, receiptScore },
    };
  }

  if (purchaseScore >= 4 && purchaseScore > receiptScore * 1.3) {
    return {
      documentType: 'PURCHASE_BILL',
      confidence: 'HIGH',
      isUncertain: false,
      reason: `Auto-detected Purchase Bill based on signals: ${purchaseMatches.slice(0, 3).join(', ')}.`,
      scores: { purchaseScore, receiptScore },
    };
  }

  // Close score or ambiguous
  return {
    documentType: purchaseScore >= receiptScore ? 'PURCHASE_BILL' : 'RECEIPT',
    confidence: 'LOW',
    isUncertain: true,
    reason: `Document type uncertain (Purchase score: ${purchaseScore}, Receipt score: ${receiptScore}). Please verify document type.`,
    scores: { purchaseScore, receiptScore },
  };
}
