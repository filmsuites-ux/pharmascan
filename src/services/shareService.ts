/**
 * Share & Export Service
 * Supports native Android Share Sheet via Web Share API (navigator.share),
 * clean formatted reports for WhatsApp, SMS, Email, and print/download fallbacks.
 */

import { AgencyFinancialSummary, Invoice, InvoiceItem, Payment } from '../types/pharmacy';

export interface ShareResult {
  success: boolean;
  sharedVia: 'android_share_sheet' | 'download_fallback' | 'clipboard_fallback' | 'cancelled';
  message: string;
}

/**
 * Triggers the Android Native Share Sheet (or system share sheet) with a File
 * Supports WhatsApp, Gmail, Drive, Files, Nearby Share, etc.
 * Gracefully falls back to download + clipboard if device lacks Web Share File API.
 */
export async function shareBlobFile(
  blob: Blob,
  filename: string,
  title: string,
  mimeType: string = 'application/pdf',
  fallbackText?: string
): Promise<ShareResult> {
  const file = new File([blob], filename, { type: mimeType });

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: fallbackText || title,
        });
        return {
          success: true,
          sharedVia: 'android_share_sheet',
          message: 'Android Share Sheet opened successfully.',
        };
      } else if (fallbackText) {
        // Device supports text share but not file share
        await navigator.share({
          title,
          text: fallbackText,
        });
        downloadBlob(blob, filename);
        return {
          success: true,
          sharedVia: 'android_share_sheet',
          message: 'Summary shared via Android Share Sheet & document downloaded.',
        };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          sharedVia: 'cancelled',
          message: 'Sharing cancelled by user.',
        };
      }
      console.warn('Native share failed, falling back:', err);
      // Fallback: Trigger download so document is never lost
      downloadBlob(blob, filename);
      if (fallbackText) {
        copyToClipboard(fallbackText);
      }
      return {
        success: true,
        sharedVia: 'download_fallback',
        message: 'No sharing application is available on this device. Document has been saved to your downloads.',
      };
    }
  }

  // Fallback when navigator.share is completely unavailable on device/browser:
  // Trigger download so document is never lost (Requirement 14)
  downloadBlob(blob, filename);
  if (fallbackText) {
    copyToClipboard(fallbackText);
  }
  return {
    success: true,
    sharedVia: 'download_fallback',
    message: 'No sharing application is available on this device. Document has been saved to your downloads.',
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function shareTextContent(title: string, text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title,
        text,
      });
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') return false; // User dismissed share sheet
      console.warn('Native share failed, falling back to clipboard:', err);
    }
  }

  // Fallback: Copy to clipboard
  return copyToClipboard(text);
}

export async function shareImageFile(
  dataUrl: string,
  filename: string,
  title: string
): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: title,
        });
        return true;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return false;
      console.warn('Native file share failed:', err);
    }
  }

  // Fallback: trigger download
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
  return true;
}

export function copyToClipboard(text: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return true;
}

/**
 * Generates clean text summary for an individual bill / document (Requirement 14)
 */
export function generateBillSummaryText(invoice: Invoice, items?: InvoiceItem[]): string {
  if (invoice.documentType === 'RECEIPT') {
    let text = `=====================================\n`;
    text += `PHARMACY PAYMENT RECEIPT SUMMARY\n`;
    text += `(Extracted from Verified Source Document)\n`;
    text += `=====================================\n\n`;
    text += `Agency / Supplier : ${invoice.agencyName}\n`;
    text += `Receipt / Ref #   : #${invoice.invoiceNumber}\n`;
    text += `Payment Date      : ${invoice.invoiceDate}\n`;
    text += `Document Type     : PAYMENT RECEIPT\n`;
    text += `Amount Paid       : Rs. ${invoice.invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
    if (invoice.notes) {
      text += `Notes / Remarks   : ${invoice.notes}\n`;
    }
    text += `\nRecorded on: ${new Date().toLocaleDateString('en-IN')}\n`;
    text += `Traceable to original scanned payment receipt #${invoice.invoiceNumber}.\n`;
    return text;
  }

  const lineItems = items || invoice.items || [];

  let text = `=====================================\n`;
  text += `PHARMACY PURCHASE BILL SUMMARY\n`;
  text += `(Extracted from Verified Source Document)\n`;
  text += `=====================================\n\n`;
  text += `Agency / Supplier : ${invoice.agencyName}\n`;
  text += `Invoice Number    : #${invoice.invoiceNumber}\n`;
  text += `Invoice Date      : ${invoice.invoiceDate}\n`;
  text += `Document Type     : ${invoice.documentType || 'TAX INVOICE'}\n`;
  text += `Payment Status    : ${invoice.paymentStatus}\n`;
  text += `Total Amount      : Rs. ${invoice.invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  text += `Taxable Amount    : Rs. ${invoice.taxableAmount.toFixed(2)}\n`;
  text += `GST Amount        : Rs. ${invoice.gstAmount.toFixed(2)}\n\n`;

  text += `MEDICINES BILLED (${lineItems.length} items):\n`;
  text += `-------------------------------------\n`;

  lineItems.forEach((it, idx) => {
    text += `${idx + 1}. ${it.productName}\n`;
    text += `   Batch: ${it.batchNumber} | Expiry: ${it.expiryDate}\n`;
    text += `   Qty: ${it.quantity}${it.freeQuantity > 0 ? ` (+${it.freeQuantity} Free)` : ''} | Rate: Rs. ${it.purchaseRate.toFixed(2)} | MRP: Rs. ${it.mrp.toFixed(2)}\n`;
    text += `   Line Total: Rs. ${it.lineTotal.toFixed(2)}\n\n`;
  });

  text += `-------------------------------------\n`;
  text += `Net Payable Total: Rs. ${invoice.invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  text += `Generated on: ${new Date().toLocaleDateString('en-IN')}\n`;
  text += `Traceable to original scanned bill #${invoice.invoiceNumber}.\n`;

  return text;
}

/**
 * Generates clean formatted report for near-expiry and expired stock (Requirement 12)
 */
export function generateExpiryStockReportText(
  items: InvoiceItem[],
  reportTitle: string = 'EXPIRY STOCK – ACTION REQUIRED'
): string {
  let text = `=====================================\n`;
  text += `${reportTitle.toUpperCase()}\n`;
  text += `Total Batches Flagged: ${items.length}\n`;
  text += `Date: ${new Date().toLocaleDateString('en-IN')}\n`;
  text += `=====================================\n\n`;

  items.forEach((it, idx) => {
    text += `${idx + 1}. ${it.productName}\n`;
    text += `   Batch    : ${it.batchNumber}\n`;
    text += `   Expiry   : ${it.expiryDate}\n`;
    text += `   Stock Qty: ${it.quantity} packs\n`;
    text += `   Rate     : Rs. ${it.purchaseRate.toFixed(2)}\n`;
    text += `   Supplier : ${it.agencyName}\n`;
    text += `   Source   : Inv #${it.invoiceNumber} (${it.invoiceDate})\n\n`;
  });

  text += `=====================================\n`;
  text += `Please arrange credit note / stock pickup before legal return cutoff.\n`;

  return text;
}

/**
 * Generates formatted agency statement text for WhatsApp & Web Share (Requirement 7 & 23)
 */
export function generateAgencyStatementShareText(
  agencyName: string,
  openingDue: number,
  totalPurchases: number,
  totalPaid: number,
  outstandingBalance: number,
  events: Array<{
    date: string;
    type: string;
    reference: string;
    debit: number;
    credit: number;
    runningBalance: number;
  }>
): string {
  let text = `=====================================\n`;
  text += `AGENCY STATEMENT: ${agencyName.toUpperCase()}\n`;
  text += `Date: ${new Date().toLocaleDateString('en-IN')}\n`;
  text += `=====================================\n\n`;

  text += `FINANCIAL SUMMARY:\n`;
  if (openingDue > 0) {
    text += `Opening/Previous Due : Rs. ${openingDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  }
  text += `Total Purchases      : Rs. ${totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  text += `Total Paid           : Rs. ${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  text += `-------------------------------------\n`;
  text += `OUTSTANDING BALANCE  : Rs. ${outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n`;

  text += `STATEMENT DETAILS (${events.length} transactions):\n`;
  text += `-------------------------------------\n`;
  events.slice(-15).forEach((ev) => {
    const amtStr = ev.debit > 0 ? `+Rs. ${ev.debit.toFixed(2)}` : `-Rs. ${ev.credit.toFixed(2)}`;
    text += `${ev.date} | ${ev.type} (${ev.reference})\n`;
    text += `  Amount: ${amtStr} | Bal: Rs. ${ev.runningBalance.toFixed(2)}\n`;
  });

  if (events.length > 15) {
    text += `... (${events.length - 15} earlier transactions omitted for brevity)\n`;
  }

  text += `-------------------------------------\n`;
  text += `Formula: Opening Due + Purchases - Payments = Outstanding\n`;
  text += `Generated from PharmaScan Pharmacy Management System\n`;

  return text;
}

/**
 * Generates formatted text for Outstanding Dues Report (Requirement 4)
 */
export function generateOutstandingDuesText(agencies: AgencyFinancialSummary[]): string {
  const sorted = [...agencies].sort((a, b) => b.outstandingBalance - a.outstandingBalance);
  const totalOutstanding = sorted.reduce((sum, a) => sum + a.outstandingBalance, 0);

  let text = `=====================================\n`;
  text += `DISTRIBUTOR OUTSTANDING DUES REPORT\n`;
  text += `Date: ${new Date().toLocaleDateString('en-IN')}\n`;
  text += `Total Outstanding: Rs. ${totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  text += `=====================================\n\n`;

  sorted.forEach((ag, idx) => {
    if (ag.outstandingBalance > 0) {
      text += `${idx + 1}. ${ag.agency.name}\n`;
      text += `   Opening Due : Rs. ${ag.openingDue.toLocaleString('en-IN')}\n`;
      text += `   Purchases   : Rs. ${ag.totalPurchase.toLocaleString('en-IN')}\n`;
      text += `   Total Paid  : Rs. ${ag.totalPaid.toLocaleString('en-IN')}\n`;
      text += `   Balance Due : Rs. ${ag.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n`;
    }
  });

  text += `-------------------------------------\n`;
  text += `PharmaScan Pharmacy Management System\n`;
  return text;
}

/**
 * Generates single payment receipt summary text
 */
export function generateSinglePaymentText(payment: Payment): string {
  let text = `=====================================\n`;
  text += `PHARMACY PAYMENT DISBURSEMENT RECEIPT\n`;
  text += `=====================================\n\n`;
  text += `Agency / Supplier : ${payment.agencyName}\n`;
  text += `Payment Date      : ${payment.paymentDate}\n`;
  text += `Amount Paid       : Rs. ${payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
  text += `Payment Method    : ${payment.paymentMethod}\n`;
  text += `Ref / Cheque #    : ${payment.referenceNumber || 'N/A'}\n`;
  if (payment.notes) {
    text += `Remarks           : ${payment.notes}\n`;
  }
  text += `\nRecorded in PharmaScan Rx on: ${new Date().toLocaleDateString('en-IN')}\n`;
  return text;
}

/**
 * Generates Low Stock List Text (Requirement 9)
 */
export function generateLowStockListText(
  medicines: Array<{ displayName: string; currentQty: number; minQty: number; agencyName: string }>
): string {
  let text = `=====================================\n`;
  text += `PHARMACY LOW-STOCK REORDER LIST\n`;
  text += `Date: ${new Date().toLocaleDateString('en-IN')}\n`;
  text += `Total Items Flagged: ${medicines.length}\n`;
  text += `=====================================\n\n`;

  medicines.forEach((m, idx) => {
    text += `${idx + 1}. ${m.displayName}\n`;
    text += `   In Stock: ${m.currentQty} units | Min Level: ${m.minQty} units\n`;
    text += `   Primary Supplier: ${m.agencyName}\n\n`;
  });

  text += `-------------------------------------\n`;
  text += `Please reorder from distributors before stock out.\n`;
  return text;
}

/**
 * Shares an actual Android APK package file (.apk) using Android Native Share Sheet
 * MIME type: application/vnd.android.package-archive
 */
export async function shareAndroidApkFile(
  apkBlob: Blob,
  filename: string = 'PharmaScan.apk'
): Promise<ShareResult> {
  return shareBlobFile(
    apkBlob,
    filename,
    'PharmaScan APK',
    'application/vnd.android.package-archive',
    'PharmaScan Pharmacy Management Installable Android Package'
  );
}

