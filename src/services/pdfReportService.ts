import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AgencyFinancialSummary,
  Invoice,
  InvoiceItem,
  OverallStats,
  Payment,
} from '../types/pharmacy';
import {
  getAllAgenciesSummary,
  getInvoices,
  getInvoiceItems,
  getPayments,
  getOverallDashboardStats,
  getAgencySummary,
  getMedicineMinStockConfig,
} from '../db/indexedDb';
import { calculateDaysRemaining, formatDaysRemainingText } from './expiryService';

/**
 * Formats a currency amount into standard Indian Rupee notation (e.g., Rs. 45,280.00)
 */
function formatCurrency(amount: number): string {
  return 'Rs. ' + (amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(isoOrDateStr?: string): string {
  if (!isoOrDateStr) return 'N/A';
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) return isoOrDateStr;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Adds standard pharmacy header & branding to a PDF document
 */
function addReportHeader(
  doc: jsPDF,
  title: string,
  subtitle: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Top header banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('PHARMASCAN RX', 14, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(' • Pharmacy Purchase, Inventory & Ledger System', 64, 13);

  // Subtitle / generated note
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Report: ${title.toUpperCase()}  |  Generated: ${new Date().toLocaleString('en-IN')}`, 14, 22);

  // Document Title under banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 14, 44);

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 47, pageWidth - 14, 47);

  return 52;
}

/**
 * Adds page numbers and computer-generated footer to all pages
 */
function addReportFooters(doc: jsPDF, reportCode: string) {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);

    doc.text(`PharmaScan RX  •  Audit Reference: ${reportCode}  •  Confidential Pharmacy Record`, 14, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }
}

export interface FinancialLedgerReportOptions {
  agencyId?: string;
  period?: 'ALL' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'FINANCIAL_YEAR';
  status?: 'ALL' | 'UNPAID' | 'PAID';
  searchQuery?: string;
}

export interface InventoryReportOptions {
  filterCategory?: 'ALL' | 'NEAR_EXPIRY' | 'EXPIRED';
  agencyId?: string;
  sortBy?: 'expiry' | 'valuation' | 'name' | 'quantity';
  searchQuery?: string;
}

/**
 * EXPORT 1: Comprehensive Financial Ledger PDF Report
 * Generates audit-ready financial statement with:
 * - Executive Financial KPIs (Total Purchases, Total Payments, Total Outstandings)
 * - Agency Accounts Ledger (Supplier by supplier statement)
 * - Invoice Register with GST breakdown and balances
 * - Payment Disbursements Voucher Log
 */
export async function generateFinancialLedgerPdf(
  options?: FinancialLedgerReportOptions
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const [overallStats, allAgencySummaries, allInvoices, allPayments] = await Promise.all([
    getOverallDashboardStats(),
    getAllAgenciesSummary(),
    getInvoices(),
    getPayments(),
  ]);

  const agencyFilter = options?.agencyId && options.agencyId !== 'ALL' ? options.agencyId : null;
  const period = options?.period || 'ALL';
  const statusFilter = options?.status || 'ALL';

  // Date filtering helper
  const now = new Date();
  const isDateInPeriod = (dateStr?: string) => {
    if (!dateStr || period === 'ALL') return true;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;

    if (period === 'THIS_MONTH') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period === 'LAST_30_DAYS') {
      const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 30;
    }
    if (period === 'LAST_90_DAYS') {
      const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 90;
    }
    if (period === 'FINANCIAL_YEAR') {
      // Indian Financial Year: April 1 to March 31
      const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const fyStartDate = new Date(fyStartYear, 3, 1);
      return d >= fyStartDate;
    }
    return true;
  };

  // Filter Invoices
  const searchQuery = options?.searchQuery?.trim().toLowerCase();
  let filteredInvoices = allInvoices.filter((inv) => {
    if (agencyFilter && inv.agencyId !== agencyFilter) return false;
    if (!isDateInPeriod(inv.invoiceDate)) return false;
    if (statusFilter === 'UNPAID' && inv.paymentStatus === 'PAID') return false;
    if (statusFilter === 'PAID' && inv.paymentStatus !== 'PAID') return false;
    if (searchQuery) {
      const match =
        (inv.invoiceNumber || '').toLowerCase().includes(searchQuery) ||
        (inv.agencyName || '').toLowerCase().includes(searchQuery);
      if (!match) return false;
    }
    return true;
  });

  // Filter Payments
  let filteredPayments = allPayments.filter((p) => {
    if (agencyFilter && p.agencyId !== agencyFilter) return false;
    if (!isDateInPeriod(p.paymentDate)) return false;
    return true;
  });

  // Filter Agencies
  let filteredAgencies = agencyFilter
    ? allAgencySummaries.filter((ag) => ag.agency.id === agencyFilter)
    : allAgencySummaries;

  // Compute stats for current selection
  const totalPurchases = filteredInvoices.reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);
  const totalPaid = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalOutstanding = filteredAgencies.reduce((sum, ag) => sum + (ag.outstandingBalance || 0), 0);

  const targetAgencyName = agencyFilter
    ? filteredAgencies[0]?.agency?.name || 'Selected Distributor'
    : null;

  const reportTitle = targetAgencyName
    ? `Financial Ledger: ${targetAgencyName}`
    : 'Financial Ledger & Accounts Payable Statement';

  const periodLabel =
    period === 'THIS_MONTH'
      ? 'Current Month'
      : period === 'LAST_30_DAYS'
      ? 'Last 30 Days'
      : period === 'LAST_90_DAYS'
      ? 'Last 90 Days'
      : period === 'FINANCIAL_YEAR'
      ? 'Current FY'
      : 'All Time Records';

  const subtitle = targetAgencyName
    ? `Targeted statement of purchases, disbursements, and pending balance. Period: ${periodLabel}.`
    : `Audited summary of wholesale supplier purchases, disbursement vouchers, and outstanding balances. Period: ${periodLabel}.`;

  let currentY = addReportHeader(doc, reportTitle, subtitle);

  // Executive KPI summary box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 22, 2, 2, 'FD');

  const colWidth = (pageWidth - 28) / 3;

  // Box 1: Total Purchases
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL SELECTION PURCHASES', 18, currentY + 7);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(totalPurchases), 18, currentY + 16);

  // Box 2: Total Disbursed
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PAYMENTS DISBURSED', 18 + colWidth, currentY + 7);
  doc.setFontSize(11);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text(formatCurrency(totalPaid), 18 + colWidth, currentY + 16);

  // Box 3: Total Outstanding Balance
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('NET OUTSTANDING BALANCE', 18 + colWidth * 2, currentY + 7);
  doc.setFontSize(11);
  doc.setTextColor(220, 38, 38); // red-600
  doc.text(formatCurrency(totalOutstanding), 18 + colWidth * 2, currentY + 16);

  currentY += 28;

  // Section 1: Agency Accounts Ledger Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `1. Supplier / Agency Accounts Payable Ledger (${filteredAgencies.length} ${
      filteredAgencies.length === 1 ? 'Distributor' : 'Distributors'
    })`,
    14,
    currentY
  );
  currentY += 3;

  const agencyRows = filteredAgencies.map((ag, idx) => [
    (idx + 1).toString(),
    ag.agency.name + (ag.agency.gstin ? `\nGST: ${ag.agency.gstin}` : ''),
    ag.agency.phone || 'N/A',
    formatCurrency(ag.totalPurchase),
    formatCurrency(ag.totalPaid),
    formatCurrency(ag.outstandingBalance),
    ag.outstandingBalance <= 0 ? 'CLEAR' : `${ag.unpaidInvoicesCount} Pending`,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Supplier / Distributor', 'Phone', 'Purchases', 'Total Paid', 'Balance Due', 'Status']],
    body: agencyRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 26 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 20, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const val = data.cell.raw as string;
        if (!val.includes('0.00')) {
          data.cell.styles.textColor = [185, 28, 28]; // red
        }
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // Section 2: Purchase Invoices Register
  if (filteredInvoices.length > 0) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`2. Scanned Purchase Invoices Register (${filteredInvoices.length} Bills)`, 14, currentY);
    currentY += 3;

    const invoiceRows = filteredInvoices.map((inv) => [
      formatDate(inv.invoiceDate),
      inv.invoiceNumber,
      inv.agencyName,
      formatCurrency(inv.taxableAmount),
      formatCurrency(inv.gstAmount),
      formatCurrency(inv.invoiceTotal),
      formatCurrency(inv.paidAmount),
      formatCurrency(inv.balanceAmount),
      inv.paymentStatus,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Bill #', 'Distributor', 'Taxable', 'GST', 'Bill Total', 'Paid', 'Balance', 'Status']],
      body: invoiceRows,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 22, fontStyle: 'bold' },
        2: { cellWidth: 38 },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 16, halign: 'right' },
        5: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 14, halign: 'center' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // Section 3: Payment Disbursements Ledger
  if (filteredPayments.length > 0) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`3. Payment Disbursement Vouchers Log (${filteredPayments.length} Payments)`, 14, currentY);
    currentY += 3;

    const paymentRows = filteredPayments.map((pay, idx) => [
      (idx + 1).toString(),
      formatDate(pay.paymentDate),
      pay.agencyName,
      pay.paymentMethod,
      pay.referenceNumber || 'N/A',
      formatCurrency(pay.amount),
      pay.notes || '-',
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Date', 'Supplier Paid', 'Payment Mode', 'Reference / Cheque #', 'Amount (Rs.)', 'Notes']],
      body: paymentRows,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 45 },
        3: { cellWidth: 25 },
        4: { cellWidth: 35 },
        5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 25 },
      },
    });
  }

  addReportFooters(doc, 'FIN-LEDGER-01');

  return doc.output('blob');
}

/**
 * EXPORT 2: Comprehensive Inventory & Stock Valuation PDF Report
 * Generates inventory audit report with:
 * - Stock Valuation at Purchase Cost (PTR) and MRP
 * - Itemised stock list with batch, expiry date, quantities, pricing, and origin supplier
 * - Expiry category warnings (Expired, Critical <=30 days, Near Expiry <=90 days)
 */
export async function generateInventoryReportPdf(
  filterOrOptions?: 'ALL' | 'NEAR_EXPIRY' | 'EXPIRED' | InventoryReportOptions
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const options: InventoryReportOptions =
    typeof filterOrOptions === 'string'
      ? { filterCategory: filterOrOptions }
      : filterOrOptions || { filterCategory: 'ALL' };

  const filterCategory = options.filterCategory || 'ALL';
  const agencyFilter = options.agencyId && options.agencyId !== 'ALL' ? options.agencyId : null;
  const sortBy = options.sortBy || 'expiry';

  const [items, stats] = await Promise.all([
    getInvoiceItems(),
    getOverallDashboardStats(),
  ]);

  const now = Date.now();

  const searchQuery = options.searchQuery?.trim().toLowerCase();
  let filteredItems = items.filter((it) => {
    if (agencyFilter && it.agencyId !== agencyFilter) return false;
    if (filterCategory === 'NEAR_EXPIRY') {
      if (!(it.expiryTimestamp > 0 && it.expiryTimestamp <= now + 90 * 24 * 60 * 60 * 1000)) {
        return false;
      }
    }
    if (filterCategory === 'EXPIRED') {
      if (!(it.expiryTimestamp > 0 && it.expiryTimestamp < now)) {
        return false;
      }
    }
    if (searchQuery) {
      const match =
        (it.productName || '').toLowerCase().includes(searchQuery) ||
        (it.batchNumber || '').toLowerCase().includes(searchQuery) ||
        (it.agencyName || '').toLowerCase().includes(searchQuery) ||
        (it.manufacturer || '').toLowerCase().includes(searchQuery);
      if (!match) return false;
    }
    return true;
  });

  // Apply sorting
  filteredItems.sort((a, b) => {
    if (sortBy === 'valuation') {
      const valA = (a.quantity || 0) * (a.purchaseRate || 0);
      const valB = (b.quantity || 0) * (b.purchaseRate || 0);
      return valB - valA;
    }
    if (sortBy === 'name') {
      return (a.productName || '').localeCompare(b.productName || '');
    }
    if (sortBy === 'quantity') {
      return (b.quantity || 0) - (a.quantity || 0);
    }
    // Default: 'expiry' soonest first
    const expA = a.expiryTimestamp || Number.MAX_SAFE_INTEGER;
    const expB = b.expiryTimestamp || Number.MAX_SAFE_INTEGER;
    return expA - expB;
  });

  const baseTitle =
    filterCategory === 'NEAR_EXPIRY'
      ? 'Near Expiry Stock Return & Debit Claim Report'
      : filterCategory === 'EXPIRED'
      ? 'Expired Medicine Audit & Disposal Register'
      : 'Pharmacy Inventory & Stock Valuation Report';

  const title = agencyFilter && filteredItems.length > 0
    ? `${baseTitle} (${filteredItems[0].agencyName})`
    : baseTitle;

  let currentY = addReportHeader(
    doc,
    title,
    'Traceable pharmaceutical stock list with batch numbers, expiration timelines, unit purchase rates, and supplier provenance.'
  );

  // Valuation summary block
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 18, 2, 2, 'FD');

  const totalUnits = filteredItems.reduce((acc, it) => acc + (it.quantity || 0) + (it.freeQuantity || 0), 0);
  const totalCostValue = filteredItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.purchaseRate || 0), 0);
  const totalMrpValue = filteredItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.mrp || 0), 0);

  const colWidth = (pageWidth - 28) / 4;

  // Box 1: Total SKUs
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL MEDICINES / BATCHES', 18, currentY + 6);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${filteredItems.length} Records (${totalUnits} Units)`, 18, currentY + 14);

  // Box 2: Total Cost Valuation
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('STOCK VALUE (AT PURCHASE COST)', 18 + colWidth, currentY + 6);
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129); // emerald-600
  doc.text(formatCurrency(totalCostValue), 18 + colWidth, currentY + 14);

  // Box 3: Total MRP Valuation
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL MRP VALUATION', 18 + colWidth * 2, currentY + 6);
  doc.setFontSize(11);
  doc.setTextColor(59, 130, 246); // blue-600
  doc.text(formatCurrency(totalMrpValue), 18 + colWidth * 2, currentY + 14);

  // Box 4: Expiry Alert Count
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('EXPIRY WATCH / CRITICAL', 18 + colWidth * 3, currentY + 6);
  doc.setFontSize(11);
  doc.setTextColor(stats.criticalExpiryCount > 0 ? 220 : 100, stats.criticalExpiryCount > 0 ? 38 : 116, stats.criticalExpiryCount > 0 ? 38 : 139);
  doc.text(`${stats.nearExpiryCount} Near Expiry (${stats.expiredCount} Expired)`, 18 + colWidth * 3, currentY + 14);

  currentY += 24;

  // Inventory Table
  const tableRows = filteredItems.map((it, idx) => {
    const days = calculateDaysRemaining(it.expiryTimestamp);
    let statusText = 'Safe';
    if (days < 0) statusText = 'EXPIRED';
    else if (days <= 30) statusText = `Critical (${days}d)`;
    else if (days <= 90) statusText = `Near Exp (${days}d)`;

    const totalValuation = (it.quantity || 0) * (it.purchaseRate || 0);

    return [
      (idx + 1).toString(),
      it.productName,
      it.packSize || it.manufacturer || '-',
      it.batchNumber,
      it.expiryDate,
      (it.quantity || 0).toString(),
      (it.freeQuantity || 0).toString(),
      formatCurrency(it.purchaseRate),
      formatCurrency(it.mrp),
      formatCurrency(totalValuation),
      it.agencyName,
      it.invoiceNumber || '-',
      statusText,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [[
      '#',
      'Medicine / Product Name',
      'Pack / Mfr',
      'Batch #',
      'Expiry',
      'Billed Qty',
      'Free',
      'Rate (PTR)',
      'MRP',
      'Cost Value',
      'Supplier Agency',
      'Bill #',
      'Expiry Status',
    ]],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 48, fontStyle: 'bold' },
      2: { cellWidth: 20 },
      3: { cellWidth: 20 },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 12, halign: 'right' },
      7: { cellWidth: 20, halign: 'right' },
      8: { cellWidth: 18, halign: 'right' },
      9: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      10: { cellWidth: 38 },
      11: { cellWidth: 18 },
      12: { cellWidth: 20, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 12) {
        const txt = String(data.cell.raw || '');
        if (txt.includes('EXPIRED')) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (txt.includes('Critical') || txt.includes('Near Exp')) {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  addReportFooters(doc, 'INV-STOCK-01');

  return doc.output('blob');
}

/**
 * EXPORT 2B: Stock Report PDF (Requirement 7)
 */
export const generateStockReportPdf = generateInventoryReportPdf;

/**
 * EXPORT 2C: Expiry Report PDF (Requirement 8)
 */
export async function generateExpiryReportPdf(
  filterCategory: 'NEAR_EXPIRY' | 'EXPIRED' = 'NEAR_EXPIRY',
  agencyId?: string
): Promise<Blob> {
  return generateInventoryReportPdf({ filterCategory, agencyId });
}

/**
 * EXPORT 3: Single Agency Detailed Ledger Statement PDF (Requirement 3)
 * Generates single-distributor statement for payment reconciliation with optional date range
 */
export async function generateAgencyStatementPdf(
  agencyId: string,
  fromDate?: string,
  toDate?: string
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const summary = await getAgencySummary(agencyId);
  if (!summary) throw new Error('Agency not found');

  const allInvoices = await getInvoices();
  const allPayments = await getPayments();

  // All invoices & payments for this agency
  const agencyInvoices = allInvoices.filter((i) => i.agencyId === agencyId);
  const agencyPayments = allPayments.filter((p) => p.agencyId === agencyId);

  // Date range filters
  const fDate = fromDate ? new Date(fromDate) : null;
  const tDate = toDate ? new Date(toDate) : null;

  // Calculate opening balance before fromDate
  let priorOpeningDue = 0;
  let priorPurchases = 0;
  let priorPayments = 0;

  agencyInvoices.forEach((inv) => {
    const invD = new Date(inv.invoiceDate);
    if (fDate && invD < fDate) {
      if (inv.documentType === 'OPENING_DUE') {
        priorOpeningDue += inv.invoiceTotal || 0;
      } else if (inv.documentType !== 'RECEIPT') {
        priorPurchases += inv.invoiceTotal || 0;
      }
    } else if (!fDate && inv.documentType === 'OPENING_DUE') {
      priorOpeningDue += inv.invoiceTotal || 0;
    }
  });

  agencyPayments.forEach((p) => {
    const pD = new Date(p.paymentDate);
    if (fDate && pD < fDate) {
      priorPayments += p.amount || 0;
    }
  });

  const periodOpeningBalance = priorOpeningDue + priorPurchases - priorPayments;

  // Filter items in range
  const rangeInvoices = agencyInvoices.filter((inv) => {
    if (inv.documentType === 'OPENING_DUE') return false; // Handled in opening balance
    const d = new Date(inv.invoiceDate);
    if (fDate && d < fDate) return false;
    if (tDate && d > tDate) return false;
    return true;
  });

  const rangePayments = agencyPayments.filter((p) => {
    const d = new Date(p.paymentDate);
    if (fDate && d < fDate) return false;
    if (tDate && d > tDate) return false;
    return true;
  });

  // Build unified chronological timeline for running balance
  interface StatementRow {
    date: string;
    type: 'PURCHASE' | 'PAYMENT';
    ref: string;
    debit: number;  // Purchases add to balance
    credit: number; // Payments reduce balance
    notes?: string;
  }

  const timeline: StatementRow[] = [];
  rangeInvoices.forEach((inv) => {
    timeline.push({
      date: inv.invoiceDate,
      type: 'PURCHASE',
      ref: `Bill #${inv.invoiceNumber}`,
      debit: inv.invoiceTotal,
      credit: 0,
      notes: `${inv.itemsCount || 0} items | ${inv.paymentStatus}`,
    });
  });

  rangePayments.forEach((p) => {
    timeline.push({
      date: p.paymentDate,
      type: 'PAYMENT',
      ref: p.referenceNumber ? `Pay: ${p.referenceNumber}` : `Payment (${p.paymentMethod})`,
      debit: 0,
      credit: p.amount,
      notes: p.notes || p.paymentMethod,
    });
  });

  // Sort ascending by date
  timeline.sort((a, b) => a.date.localeCompare(b.date));

  const periodPurchases = rangeInvoices.reduce((sum, i) => sum + (i.invoiceTotal || 0), 0);
  const periodPayments = rangePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const finalBalance = periodOpeningBalance + periodPurchases - periodPayments;

  const periodSubtitle = fromDate && toDate
    ? `Statement Period: ${formatDate(fromDate)} to ${formatDate(toDate)}  |  Supplier: ${summary.agency.name}`
    : `Comprehensive Ledger Statement  |  Supplier: ${summary.agency.name}`;

  let currentY = addReportHeader(
    doc,
    `Agency Statement: ${summary.agency.name}`,
    periodSubtitle
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  // Agency info and balance card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 30, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Agency: ${summary.agency.name}`, 18, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`GSTIN: ${summary.agency.gstin || 'N/A'}  |  Drug Lic: ${summary.agency.dlNumber || 'N/A'}`, 18, currentY + 12);
  doc.text(`Contact: ${summary.agency.contactPerson || 'N/A'}  |  Phone: ${summary.agency.phone || 'N/A'}`, 18, currentY + 17);

  // Financial summary strip inside card
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Opening Due: ${formatCurrency(periodOpeningBalance)}  |  Period Purchases: ${formatCurrency(periodPurchases)}  |  Total Paid: ${formatCurrency(periodPayments)}  |  Net Balance: ${formatCurrency(finalBalance)}`,
    18,
    currentY + 24
  );

  currentY += 36;

  // Running balance table
  let running = periodOpeningBalance;
  const tableRows: string[][] = [
    [
      formatDate(fromDate || summary.agency.createdAt),
      'OPENING BALANCE',
      'Balance B/F from prior accounts',
      formatCurrency(periodOpeningBalance),
      '-',
      formatCurrency(running),
    ],
  ];

  timeline.forEach((row) => {
    running += row.debit - row.credit;
    tableRows.push([
      formatDate(row.date),
      row.type === 'PURCHASE' ? 'Purchase Bill' : 'Payment Disbursed',
      row.ref + (row.notes ? ` (${row.notes})` : ''),
      row.debit > 0 ? formatCurrency(row.debit) : '-',
      row.credit > 0 ? formatCurrency(row.credit) : '-',
      formatCurrency(running),
    ]);
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Date', 'Transaction Type', 'Particulars / Ref', 'Debit (+)', 'Credit (-)', 'Running Balance']],
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 32 },
      2: { cellWidth: 54 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(220, 38, 38);
  doc.text(`CURRENT OUTSTANDING BALANCE: ${formatCurrency(finalBalance)}`, 14, finalY);

  addReportFooters(doc, `AG-STMT-${summary.agency.id.slice(-6).toUpperCase()}`);
  return doc.output('blob');
}

/**
 * EXPORT 4: Outstanding Dues PDF Report (Requirement 4)
 * Generates clear report with Agency, Opening Due, Purchases, Payments, and Current Outstanding,
 * sorted by highest outstanding amount.
 */
export async function generateOutstandingDuesPdf(): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const allSummaries = await getAllAgenciesSummary();

  // Sort descending by highest outstanding balance
  const sorted = [...allSummaries].sort((a, b) => b.outstandingBalance - a.outstandingBalance);

  let currentY = addReportHeader(
    doc,
    'Distributor Outstanding Dues Report',
    'Prioritized list of supplier accounts payable ranked by current outstanding balance.'
  );

  const totalOpening = sorted.reduce((sum, a) => sum + (a.openingDue || 0), 0);
  const totalPurchases = sorted.reduce((sum, a) => sum + (a.totalPurchase || 0), 0);
  const totalPaid = sorted.reduce((sum, a) => sum + (a.totalPaid || 0), 0);
  const totalOutstanding = sorted.reduce((sum, a) => sum + (a.outstandingBalance || 0), 0);

  const pageWidth = doc.internal.pageSize.getWidth();

  // Summary box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 20, 2, 2, 'FD');

  const colWidth = (pageWidth - 28) / 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL OPENING DUES', 18, currentY + 6);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(totalOpening), 18, currentY + 14);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL PURCHASES', 18 + colWidth, currentY + 6);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(totalPurchases), 18 + colWidth, currentY + 14);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL PAID', 18 + colWidth * 2, currentY + 6);
  doc.setFontSize(10);
  doc.setTextColor(16, 185, 129);
  doc.text(formatCurrency(totalPaid), 18 + colWidth * 2, currentY + 14);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('NET OUTSTANDING DUE', 18 + colWidth * 3, currentY + 6);
  doc.setFontSize(11);
  doc.setTextColor(220, 38, 38);
  doc.text(formatCurrency(totalOutstanding), 18 + colWidth * 3, currentY + 14);

  currentY += 26;

  const rows = sorted.map((ag, idx) => [
    (idx + 1).toString(),
    ag.agency.name + (ag.agency.phone ? `\nPh: ${ag.agency.phone}` : ''),
    ag.agency.gstin || 'N/A',
    formatCurrency(ag.openingDue),
    formatCurrency(ag.totalPurchase),
    formatCurrency(ag.totalPaid),
    formatCurrency(ag.outstandingBalance),
    ag.unpaidInvoicesCount > 0 ? `${ag.unpaidInvoicesCount} Pending` : 'Clear',
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Agency / Distributor', 'GSTIN', 'Opening Due', 'Purchases', 'Total Paid', 'Outstanding Due', 'Status']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 46, fontStyle: 'bold' },
      2: { cellWidth: 26 },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      7: { cellWidth: 16, halign: 'center' },
    },
  });

  addReportFooters(doc, 'OUTSTANDING-DUES-01');
  return doc.output('blob');
}

/**
 * EXPORT 5: Purchase Records PDF Report (Requirement 5)
 */
export async function generatePurchaseRecordsPdf(options?: {
  fromDate?: string;
  toDate?: string;
  agencyId?: string;
  medicineQuery?: string;
}): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const allInvoices = await getInvoices();
  const allItems = await getInvoiceItems();

  const fDate = options?.fromDate ? new Date(options.fromDate) : null;
  const tDate = options?.toDate ? new Date(options.toDate) : null;
  const medQuery = options?.medicineQuery?.trim().toLowerCase();

  // Match items
  let records: Array<{
    date: string;
    agency: string;
    billNumber: string;
    medicine: string;
    batch: string;
    qty: number;
    purchaseRate: number;
    totalAmount: number;
  }> = [];

  allItems.forEach((it) => {
    if (options?.agencyId && it.agencyId !== options.agencyId) return;
    const itD = new Date(it.invoiceDate);
    if (fDate && itD < fDate) return false;
    if (tDate && itD > tDate) return false;
    if (medQuery && !it.productName.toLowerCase().includes(medQuery)) return;

    records.push({
      date: it.invoiceDate,
      agency: it.agencyName,
      billNumber: it.invoiceNumber,
      medicine: it.productName,
      batch: it.batchNumber || 'N/A',
      qty: it.quantity || 0,
      purchaseRate: it.purchaseRate || 0,
      totalAmount: it.lineTotal || (it.quantity * it.purchaseRate),
    });
  });

  records.sort((a, b) => b.date.localeCompare(a.date));

  let currentY = addReportHeader(
    doc,
    'Purchase Records Register',
    'Itemized list of medicine purchases with supplier provenance, batch numbers, rates, and invoice numbers.'
  );

  const totalValue = records.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalQty = records.reduce((sum, r) => sum + r.qty, 0);

  const rows = records.map((r, idx) => [
    (idx + 1).toString(),
    formatDate(r.date),
    r.agency,
    r.billNumber,
    r.medicine,
    r.batch,
    r.qty.toString(),
    formatCurrency(r.purchaseRate),
    formatCurrency(r.totalAmount),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Date', 'Supplier Agency', 'Bill #', 'Medicine Name', 'Batch', 'Qty', 'Rate (PTR)', 'Total Amount']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 50 },
      3: { cellWidth: 26 },
      4: { cellWidth: 64, fontStyle: 'bold' },
      5: { cellWidth: 26 },
      6: { cellWidth: 16, halign: 'right' },
      7: { cellWidth: 26, halign: 'right' },
      8: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total Items: ${records.length}  |  Total Units: ${totalQty}  |  Total Purchase Value: ${formatCurrency(totalValue)}`, 14, finalY);

  addReportFooters(doc, 'PURCHASE-REC-01');
  return doc.output('blob');
}

/**
 * EXPORT 6: Payment Records PDF Report (Requirement 6)
 */
export async function generatePaymentRecordsPdf(options?: {
  fromDate?: string;
  toDate?: string;
  agencyId?: string;
}): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const allPayments = await getPayments();

  const fDate = options?.fromDate ? new Date(options.fromDate) : null;
  const tDate = options?.toDate ? new Date(options.toDate) : null;

  let filtered = allPayments.filter((p) => {
    if (options?.agencyId && p.agencyId !== options.agencyId) return false;
    const d = new Date(p.paymentDate);
    if (fDate && d < fDate) return false;
    if (tDate && d > tDate) return false;
    return true;
  });

  filtered.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  let currentY = addReportHeader(
    doc,
    'Payment Records & Disbursement Vouchers',
    'Detailed log of payments disbursed to pharmaceutical distributors and stockists.'
  );

  const totalPaid = filtered.reduce((sum, p) => sum + (p.amount || 0), 0);

  const rows = filtered.map((p, idx) => [
    (idx + 1).toString(),
    formatDate(p.paymentDate),
    p.agencyName,
    p.paymentMethod,
    p.referenceNumber || 'N/A',
    formatCurrency(p.amount),
    p.notes || '-',
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Payment Date', 'Supplier Agency', 'Method', 'Ref / Cheque / UTR #', 'Amount Paid', 'Notes / Remarks']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 50, fontStyle: 'bold' },
      3: { cellWidth: 20 },
      4: { cellWidth: 32 },
      5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 40 },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(16, 185, 129);
  doc.text(`Total Disbursements: ${filtered.length} Vouchers  |  Total Amount Disbursed: ${formatCurrency(totalPaid)}`, 14, finalY);

  addReportFooters(doc, 'PAYMENT-REC-01');
  return doc.output('blob');
}

/**
 * EXPORT 7: Low Stock Report PDF (Requirement 9)
 */
export async function generateLowStockReportPdf(): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const allItems = await getInvoiceItems();
  const minStockConfig = getMedicineMinStockConfig();

  // Group by normalized name
  const map = new Map<string, {
    displayName: string;
    currentQty: number;
    minQty: number;
    agencyName: string;
    latestRate: number;
  }>();

  allItems.forEach((it) => {
    const key = it.normalizedName || it.productName.toLowerCase().trim();
    if (!map.has(key)) {
      const minQty = minStockConfig[key] ?? 10;
      map.set(key, {
        displayName: it.productName,
        currentQty: 0,
        minQty,
        agencyName: it.agencyName,
        latestRate: it.purchaseRate || 0,
      });
    }
    const item = map.get(key)!;
    item.currentQty += it.quantity || 0;
  });

  const lowStockList: Array<{
    displayName: string;
    currentQty: number;
    minQty: number;
    deficit: number;
    agencyName: string;
    latestRate: number;
  }> = [];

  map.forEach((val) => {
    if (val.currentQty <= val.minQty) {
      lowStockList.push({
        ...val,
        deficit: Math.max(0, val.minQty - val.currentQty),
      });
    }
  });

  lowStockList.sort((a, b) => b.deficit - a.deficit);

  let currentY = addReportHeader(
    doc,
    'Low-Stock & Reorder List',
    'Inventory items currently at or below minimum required reorder threshold levels.'
  );

  const rows = lowStockList.map((m, idx) => [
    (idx + 1).toString(),
    m.displayName,
    m.currentQty.toString(),
    m.minQty.toString(),
    m.deficit.toString(),
    formatCurrency(m.latestRate),
    m.agencyName,
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Medicine / Product Name', 'Current Stock', 'Min Threshold', 'Deficit Units', 'Last Rate', 'Primary Distributor']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2, font: 'helvetica' },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 60, fontStyle: 'bold' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 40 },
    },
  });

  addReportFooters(doc, 'LOW-STOCK-01');
  return doc.output('blob');
}

/**
 * EXPORT 8: Single Invoice PDF for individual record sharing (Requirement 11)
 */
export async function generateSingleInvoicePdf(invoice: Invoice, items?: InvoiceItem[]): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lineItems = items || invoice.items || [];

  let currentY = addReportHeader(
    doc,
    invoice.documentType === 'RECEIPT'
      ? `Payment Receipt #${invoice.invoiceNumber}`
      : `Purchase Invoice #${invoice.invoiceNumber}`,
    `Supplier: ${invoice.agencyName}  |  Bill Date: ${formatDate(invoice.invoiceDate)}`
  );

  const pageWidth = doc.internal.pageSize.getWidth();

  // Invoice Meta Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Supplier: ${invoice.agencyName}`, 18, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Document Type: ${invoice.documentType || 'TAX INVOICE'}  |  Payment Status: ${invoice.paymentStatus}`, 18, currentY + 12);
  doc.text(`Taxable: ${formatCurrency(invoice.taxableAmount)}  |  GST: ${formatCurrency(invoice.gstAmount)}  |  Total: ${formatCurrency(invoice.invoiceTotal)}`, 18, currentY + 18);

  currentY += 30;

  if (lineItems.length > 0) {
    const rows = lineItems.map((it, idx) => [
      (idx + 1).toString(),
      it.productName,
      it.batchNumber || 'N/A',
      it.expiryDate || 'N/A',
      it.quantity.toString(),
      (it.freeQuantity || 0).toString(),
      formatCurrency(it.purchaseRate),
      formatCurrency(it.mrp),
      formatCurrency(it.lineTotal),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Medicine Name', 'Batch', 'Expiry', 'Qty', 'Free', 'Rate', 'MRP', 'Line Total']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, font: 'helvetica' },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  addReportFooters(doc, `INV-${invoice.invoiceNumber}`);
  return doc.output('blob');
}

/**
 * EXPORT 9: Single Payment PDF for individual voucher sharing (Requirement 11)
 */
export async function generateSinglePaymentPdf(payment: Payment): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let currentY = addReportHeader(
    doc,
    'Payment Disbursement Voucher',
    `Official record of payment disbursed to distributor.`
  );

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, pageWidth - 28, 55, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Supplier: ${payment.agencyName}`, 18, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Payment Date: ${formatDate(payment.paymentDate)}`, 18, currentY + 16);
  doc.text(`Payment Method: ${payment.paymentMethod}`, 18, currentY + 23);
  doc.text(`Reference / Cheque #: ${payment.referenceNumber || 'N/A'}`, 18, currentY + 30);
  doc.text(`Remarks: ${payment.notes || 'None'}`, 18, currentY + 37);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129);
  doc.text(`Amount Disbursed: ${formatCurrency(payment.amount)}`, 18, currentY + 47);

  addReportFooters(doc, `PAY-VOUCHER-${payment.id.slice(-6).toUpperCase()}`);
  return doc.output('blob');
}

/**
 * Downloads a generated PDF blob to the user's computer
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

