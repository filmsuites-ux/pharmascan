import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  FileText,
  Download,
  Calendar,
  Building2,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Pill,
  CreditCard,
  IndianRupee,
  Layers,
  Eye,
  Trash2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';
import {
  Agency,
  AgencyFinancialSummary,
  Invoice,
  InvoiceItem,
  Payment,
} from '../../types/pharmacy';
import {
  getAgencies,
  getAllAgenciesSummary,
  getInvoices,
  getInvoiceItems,
  getPayments,
  exportCsv,
  deleteInvoice,
  deletePayment,
  getMedicineMinStockConfig,
} from '../../db/indexedDb';
import {
  generateAgencyStatementPdf,
  generateOutstandingDuesPdf,
  generatePurchaseRecordsPdf,
  generatePaymentRecordsPdf,
  generateStockReportPdf,
  generateExpiryReportPdf,
  generateLowStockReportPdf,
  generateFinancialLedgerPdf,
  generateInventoryReportPdf,
  generateSingleInvoicePdf,
  generateSinglePaymentPdf,
  downloadPdfBlob,
} from '../../services/pdfReportService';
import {
  shareBlobFile,
  downloadBlob,
  copyToClipboard,
  generateAgencyStatementShareText,
  generateOutstandingDuesText,
  generateSinglePaymentText,
  generateLowStockListText,
  generateBillSummaryText,
  generateExpiryStockReportText,
} from '../../services/shareService';
import { calculateDaysRemaining } from '../../services/expiryService';

export type ShareReportType =
  | 'AGENCY_STATEMENT'
  | 'OUTSTANDING_DUES'
  | 'PURCHASE_RECORDS'
  | 'PAYMENT_RECORDS'
  | 'STOCK_REPORT'
  | 'EXPIRED_STOCK'
  | 'NEAR_EXPIRY_STOCK'
  | 'LOW_STOCK_LIST'
  | 'SCANNED_DOCUMENTS'
  | 'FULL_PDF'
  | 'FULL_CSV'
  | 'SINGLE_INVOICE'
  | 'SINGLE_PAYMENT';

interface DashboardShareModalProps {
  isOpen: boolean;
  initialType?: ShareReportType;
  initialAgencyId?: string;
  initialInvoice?: Invoice;
  initialPayment?: Payment;
  onClose: () => void;
  onRefreshData?: () => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

export const DashboardShareModal: React.FC<DashboardShareModalProps> = ({
  isOpen,
  initialType = 'AGENCY_STATEMENT',
  initialAgencyId,
  initialInvoice,
  initialPayment,
  onClose,
  onRefreshData,
  onViewInvoice,
}) => {
  const [activeType, setActiveType] = useState<ShareReportType>(initialType);

  // Core Data
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [summaries, setSummaries] = useState<AgencyFinancialSummary[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filter States
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(initialAgencyId || '');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [medicineQuery, setMedicineQuery] = useState<string>('');
  const [nearExpiryDays, setNearExpiryDays] = useState<number>(60);
  const [scannedDocFilter, setScannedDocFilter] = useState<'ALL' | 'BILLS' | 'RECEIPTS'>('ALL');

  // Sharing & feedback state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<{
    text: string;
    type: 'success' | 'info' | 'error';
    retryAction?: () => void;
  } | null>(null);

  // Delete Confirmation State (Requirement 10)
  const [deleteCandidate, setDeleteCandidate] = useState<{
    id: string;
    title: string;
    isPayment: boolean;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
      if (initialAgencyId) setSelectedAgencyId(initialAgencyId);
      loadAllData();
      setShareFeedback(null);
    }
  }, [isOpen, initialType, initialAgencyId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [allAg, allSumm, allInv, allPay, allIt] = await Promise.all([
        getAgencies(),
        getAllAgenciesSummary(),
        getInvoices(),
        getPayments(),
        getInvoiceItems(),
      ]);
      setAgencies(allAg);
      setSummaries(allSumm);
      setInvoices(allInv);
      setPayments(allPay);
      setItems(allIt);

      if (!selectedAgencyId && allAg.length > 0) {
        setSelectedAgencyId(allAg[0].id);
      }
    } catch (err) {
      console.error('Failed to load sharing data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const showFeedback = (
    text: string,
    type: 'success' | 'info' | 'error' = 'success',
    retryAction?: () => void
  ) => {
    setShareFeedback({ text, type, retryAction });
    if (type !== 'error') {
      setTimeout(() => setShareFeedback(null), 6000);
    }
  };

  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // =========================================================================
  // REPORT HANDLERS
  // =========================================================================

  // 1. Share Agency Statement (Requirement 3)
  const handleShareAgencyStatement = async (mode: 'SHARE' | 'DOWNLOAD') => {
    if (!selectedAgencyId) {
      showFeedback('Please select an agency.', 'error');
      return;
    }
    const agency = agencies.find((a) => a.id === selectedAgencyId);
    const agencyName = agency ? agency.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Agency';
    const filename = `Agency_Statement_${agencyName}_${getTodayStr()}.pdf`;

    setIsGenerating(true);
    try {
      const pdfBlob = await generateAgencyStatementPdf(
        selectedAgencyId,
        fromDate || undefined,
        toDate || undefined
      );

      if (mode === 'DOWNLOAD') {
        downloadPdfBlob(pdfBlob, filename);
        showFeedback(`Statement downloaded: ${filename}`, 'success');
      } else {
        const agencyObj = agencies.find((a) => a.id === selectedAgencyId);
        const summ = summaries.find((s) => s.agency.id === selectedAgencyId);
        const textSummary = agencyObj && summ
          ? `Agency Statement for ${agencyObj.name}. Net Outstanding: Rs. ${summ.outstandingBalance.toLocaleString('en-IN')}`
          : 'Agency Statement';

        const res = await shareBlobFile(
          pdfBlob,
          filename,
          `Agency Statement - ${agency?.name || ''}`,
          'application/pdf',
          textSummary
        );
        showFeedback(res.message, res.success ? 'success' : 'info');
      }
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleShareAgencyStatement(mode));
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Share Outstanding Dues (Requirement 4)
  const handleShareOutstandingDues = async (mode: 'SHARE' | 'DOWNLOAD' | 'CSV') => {
    const filenamePdf = `Outstanding_Dues_${getTodayStr()}.pdf`;
    const filenameCsv = `Outstanding_Dues_${getTodayStr()}.csv`;

    setIsGenerating(true);
    try {
      if (mode === 'CSV') {
        const csvText = await exportCsv('OUTSTANDING_DUES');
        const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(csvBlob, filenameCsv);
        showFeedback(`Exported CSV: ${filenameCsv}`, 'success');
      } else {
        const pdfBlob = await generateOutstandingDuesPdf();
        if (mode === 'DOWNLOAD') {
          downloadPdfBlob(pdfBlob, filenamePdf);
          showFeedback(`Downloaded: ${filenamePdf}`, 'success');
        } else {
          const textSummary = generateOutstandingDuesText(summaries);
          const res = await shareBlobFile(
            pdfBlob,
            filenamePdf,
            'Pharmacy Distributor Outstanding Dues',
            'application/pdf',
            textSummary
          );
          showFeedback(res.message, res.success ? 'success' : 'info');
        }
      }
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleShareOutstandingDues(mode));
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Share Purchase Records (Requirement 5)
  const handleSharePurchases = async (mode: 'SHARE' | 'DOWNLOAD' | 'CSV') => {
    const filenamePdf = `Purchase_Report_${getTodayStr()}.pdf`;
    const filenameCsv = `Purchase_Report_${getTodayStr()}.csv`;

    setIsGenerating(true);
    try {
      if (mode === 'CSV') {
        const csvText = await exportCsv('PURCHASES');
        const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(csvBlob, filenameCsv);
        showFeedback(`Exported CSV: ${filenameCsv}`, 'success');
      } else {
        const pdfBlob = await generatePurchaseRecordsPdf({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          agencyId: selectedAgencyId || undefined,
          medicineQuery: medicineQuery || undefined,
        });

        if (mode === 'DOWNLOAD') {
          downloadPdfBlob(pdfBlob, filenamePdf);
          showFeedback(`Downloaded: ${filenamePdf}`, 'success');
        } else {
          const res = await shareBlobFile(
            pdfBlob,
            filenamePdf,
            'Pharmacy Purchase Records Report',
            'application/pdf',
            `Purchase Report: ${invoices.length} invoices recorded in PharmaScan.`
          );
          showFeedback(res.message, res.success ? 'success' : 'info');
        }
      }
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleSharePurchases(mode));
    } finally {
      setIsGenerating(false);
    }
  };

  // 4. Share Payment Records (Requirement 6)
  const handleSharePayments = async (mode: 'SHARE' | 'DOWNLOAD' | 'CSV') => {
    const filenamePdf = `Payment_Report_${getTodayStr()}.pdf`;
    const filenameCsv = `Payment_Report_${getTodayStr()}.csv`;

    setIsGenerating(true);
    try {
      if (mode === 'CSV') {
        const csvText = await exportCsv('PAYMENTS');
        const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(csvBlob, filenameCsv);
        showFeedback(`Exported CSV: ${filenameCsv}`, 'success');
      } else {
        const pdfBlob = await generatePaymentRecordsPdf({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          agencyId: selectedAgencyId || undefined,
        });

        if (mode === 'DOWNLOAD') {
          downloadPdfBlob(pdfBlob, filenamePdf);
          showFeedback(`Downloaded: ${filenamePdf}`, 'success');
        } else {
          const res = await shareBlobFile(
            pdfBlob,
            filenamePdf,
            'Pharmacy Payment Disbursement Records',
            'application/pdf',
            `Payment Records: ${payments.length} disbursements in PharmaScan.`
          );
          showFeedback(res.message, res.success ? 'success' : 'info');
        }
      }
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleSharePayments(mode));
    } finally {
      setIsGenerating(false);
    }
  };

  // 5. Share Stock Report (Requirement 7)
  const handleShareStock = async (mode: 'SHARE' | 'DOWNLOAD' | 'CSV') => {
    const filenamePdf = `Stock_Report_${getTodayStr()}.pdf`;
    const filenameCsv = `Stock_Report_${getTodayStr()}.csv`;

    setIsGenerating(true);
    try {
      if (mode === 'CSV') {
        const csvText = await exportCsv('STOCK');
        const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(csvBlob, filenameCsv);
        showFeedback(`Exported Stock CSV: ${filenameCsv}`, 'success');
      } else {
        const pdfBlob = await generateInventoryReportPdf({
          filterCategory: 'ALL',
          agencyId: selectedAgencyId || undefined,
          searchQuery: medicineQuery || undefined,
        });

        if (mode === 'DOWNLOAD') {
          downloadPdfBlob(pdfBlob, filenamePdf);
          showFeedback(`Downloaded: ${filenamePdf}`, 'success');
        } else {
          const res = await shareBlobFile(
            pdfBlob,
            filenamePdf,
            'Pharmacy Complete Stock Report',
            'application/pdf',
            `Stock Report: ${items.length} batches and medicines in PharmaScan Rx.`
          );
          showFeedback(res.message, res.success ? 'success' : 'info');
        }
      }
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleShareStock(mode));
    } finally {
      setIsGenerating(false);
    }
  };

  // 6. Share Expired Stock (Requirement 8)
  const handleShareExpiredStock = async (mode: 'SHARE' | 'DOWNLOAD' | 'CSV') => {
    const filenamePdf = `Expired_Stock_${getTodayStr()}.pdf`;
    const filenameCsv = `Expired_Stock_${getTodayStr()}.csv`;

    setIsGenerating(true);
    try {
      if (mode === 'CSV') {
        const csvText = await exportCsv('EXPIRY');
        const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(csvBlob, filenameCsv);
        showFeedback(`Exported CSV: ${filenameCsv}`, 'success');
      } else {
        const pdfBlob = await generateInventoryReportPdf({
          filterCategory: 'EXPIRED',
        });

        if (mode === 'DOWNLOAD') {
          downloadPdfBlob(pdfBlob, filenamePdf);
          showFeedback(`Downloaded: ${filenamePdf}`, 'success');
        } else {
          const expiredItems = items.filter((i) => calculateDaysRemaining(i.expiryTimestamp) < 0);
          const textSummary = generateExpiryStockReportText(expiredItems, 'EXPIRED STOCK – RETURN PICKUP REQUIRED');
          const res = await shareBlobFile(
            pdfBlob,
            filenamePdf,
            'Expired Medicine Stock Report',
            'application/pdf',
            textSummary
          );
          showFeedback(res.message, res.success ? 'success' : 'info');
        }
      }
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleShareExpiredStock(mode));
    } finally {
      setIsGenerating(false);
    }
  };

  // 7. Share Near-Expiry Stock (Requirement 8)
  const handleShareNearExpiry = async (mode: 'SHARE' | 'DOWNLOAD' | 'CSV') => {
    const filenamePdf = `Near_Expiry_Stock_${nearExpiryDays}d_${getTodayStr()}.pdf`;
    const filenameCsv = `Near_Expiry_Stock_${getTodayStr()}.csv`;

    setIsGenerating(true);
    try {
      if (mode === 'CSV') {
        const csvText = await exportCsv('EXPIRY');
        const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(csvBlob, filenameCsv);
        showFeedback(`Exported CSV: ${filenameCsv}`, 'success');
      } else {
        const pdfBlob = await generateInventoryReportPdf({
          filterCategory: 'NEAR_EXPIRY',
        });

        if (mode === 'DOWNLOAD') {
          downloadPdfBlob(pdfBlob, filenamePdf);
          showFeedback(`Downloaded: ${filenamePdf}`, 'success');
        } else {
          const nearExpiryItems = items.filter((i) => {
            const d = calculateDaysRemaining(i.expiryTimestamp);
            return d >= 0 && d <= nearExpiryDays;
          });
          const textSummary = generateExpiryStockReportText(
            nearExpiryItems,
            `NEAR EXPIRY STOCK (≤ ${nearExpiryDays} DAYS)`
          );

          const res = await shareBlobFile(
            pdfBlob,
            filenamePdf,
            `Near-Expiry Stock (≤ ${nearExpiryDays} Days)`,
            'application/pdf',
            textSummary
          );
          showFeedback(res.message, res.success ? 'success' : 'info');
        }
      }
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleShareNearExpiry(mode));
    } finally {
      setIsGenerating(false);
    }
  };

  // 8. Share Low-Stock List (Requirement 9)
  const handleShareLowStock = async (mode: 'SHARE' | 'DOWNLOAD' | 'CSV') => {
    const filenamePdf = `Low_Stock_${getTodayStr()}.pdf`;
    const filenameCsv = `Low_Stock_${getTodayStr()}.csv`;

    setIsGenerating(true);
    try {
      if (mode === 'CSV') {
        const csvText = await exportCsv('LOW_STOCK');
        const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(csvBlob, filenameCsv);
        showFeedback(`Exported Low Stock CSV: ${filenameCsv}`, 'success');
      } else {
        const pdfBlob = await generateLowStockReportPdf();

        if (mode === 'DOWNLOAD') {
          downloadPdfBlob(pdfBlob, filenamePdf);
          showFeedback(`Downloaded: ${filenamePdf}`, 'success');
        } else {
          const minStockConfig = getMedicineMinStockConfig();
          const map = new Map<string, { displayName: string; currentQty: number; minQty: number; agencyName: string }>();
          items.forEach((it) => {
            const k = it.normalizedName || it.productName.toLowerCase().trim();
            if (!map.has(k)) {
              map.set(k, {
                displayName: it.productName,
                currentQty: 0,
                minQty: minStockConfig[k] ?? 10,
                agencyName: it.agencyName,
              });
            }
            map.get(k)!.currentQty += it.quantity || 0;
          });

          const lowStockArray = Array.from(map.values()).filter((m) => m.currentQty <= m.minQty);
          const textSummary = generateLowStockListText(lowStockArray);

          const res = await shareBlobFile(
            pdfBlob,
            filenamePdf,
            'Pharmacy Low-Stock Reorder List',
            'application/pdf',
            textSummary
          );
          showFeedback(res.message, res.success ? 'success' : 'info');
        }
      }
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleShareLowStock(mode));
    } finally {
      setIsGenerating(false);
    }
  };

  // 9. Share Scanned Document (Requirement 10)
  const handleShareScannedDoc = async (inv: Invoice) => {
    const rawImage = inv.processedImages?.[0] || inv.images?.[0] || inv.originalImages?.[0];
    const isPdf = rawImage && rawImage.startsWith('data:application/pdf');
    const filename = `Scanned_Doc_${inv.invoiceNumber}_${inv.agencyName.replace(/[^a-zA-Z0-9]/g, '_')}.${isPdf ? 'pdf' : 'jpg'}`;

    setIsGenerating(true);
    try {
      let blob: Blob;
      let mimeType = 'image/jpeg';

      if (rawImage) {
        const res = await fetch(rawImage);
        blob = await res.blob();
        mimeType = blob.type || (isPdf ? 'application/pdf' : 'image/jpeg');
      } else {
        // Generate single invoice PDF
        const invItems = items.filter((it) => it.invoiceId === inv.id);
        blob = await generateSingleInvoicePdf(inv, invItems);
        mimeType = 'application/pdf';
      }

      const textSummary = generateBillSummaryText(inv);
      const res = await shareBlobFile(
        blob,
        filename,
        `Scanned Document - Bill #${inv.invoiceNumber} (${inv.agencyName})`,
        mimeType,
        textSummary
      );
      showFeedback(res.message, res.success ? 'success' : 'info');
    } catch (err: any) {
      showFeedback('Unable to generate the report.', 'error', () => handleShareScannedDoc(inv));
    } finally {
      setIsGenerating(false);
    }
  };

  // 10. Delete Document with Confirmation (Requirement 10)
  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      if (deleteCandidate.isPayment) {
        await deletePayment(deleteCandidate.id);
      } else {
        await deleteInvoice(deleteCandidate.id);
      }
      showFeedback(`Record "${deleteCandidate.title}" deleted.`, 'success');
      setDeleteCandidate(null);
      await loadAllData();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      showFeedback(`Delete failed: ${err.message}`, 'error');
    }
  };

  // Scanned documents filter list
  const scannedInvoices = invoices.filter((i) => {
    const hasScan =
      (i.images && i.images.length > 0) ||
      (i.processedImages && i.processedImages.length > 0) ||
      (i.originalImages && i.originalImages.length > 0);

    if (scannedDocFilter === 'BILLS') return hasScan && i.documentType !== 'RECEIPT';
    if (scannedDocFilter === 'RECEIPTS') return i.documentType === 'RECEIPT';
    return hasScan || i.documentType === 'RECEIPT';
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-5 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 shadow-md">
              <Share2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Share &amp; Export Center
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                  Android Share Sheet
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Direct native sharing to WhatsApp, Email, Drive, and Files with clean PDF &amp; CSV formats.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Feedback Toast */}
        {shareFeedback && (
          <div
            className={`px-5 py-3 text-xs font-semibold flex items-center justify-between gap-2 shrink-0 animate-in slide-in-from-top-1 ${
              shareFeedback.type === 'success'
                ? 'bg-emerald-950/80 border-b border-emerald-500/40 text-emerald-300'
                : shareFeedback.type === 'error'
                ? 'bg-red-950/80 border-b border-red-500/40 text-red-300'
                : 'bg-teal-950/80 border-b border-teal-500/40 text-teal-300'
            }`}
          >
            <div className="flex items-center gap-2 flex-1">
              {shareFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : shareFeedback.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <Share2 className="w-4 h-4 text-teal-400 shrink-0" />
              )}
              <span>{shareFeedback.text}</span>
            </div>

            {shareFeedback.retryAction && (
              <button
                onClick={() => {
                  const act = shareFeedback.retryAction;
                  setShareFeedback(null);
                  act?.();
                }}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-colors shrink-0 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto px-6 py-2.5 bg-slate-950/60 border-b border-slate-800 gap-1.5 scrollbar-none shrink-0">
          {[
            { id: 'AGENCY_STATEMENT', label: '📄 Agency Statement' },
            { id: 'OUTSTANDING_DUES', label: '💰 Outstanding Dues' },
            { id: 'PURCHASE_RECORDS', label: '🧾 Purchases' },
            { id: 'PAYMENT_RECORDS', label: '💳 Payments' },
            { id: 'STOCK_REPORT', label: '📦 Stock Report' },
            { id: 'EXPIRED_STOCK', label: '⚠️ Expired Stock' },
            { id: 'NEAR_EXPIRY_STOCK', label: '⏳ Near Expiry' },
            { id: 'LOW_STOCK_LIST', label: '🔻 Low Stock' },
            { id: 'SCANNED_DOCUMENTS', label: '📁 Scanned Docs' },
          ].map((tab) => {
            const isActive = activeType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveType(tab.id as ShareReportType);
                  setShareFeedback(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Main Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span className="text-xs">Preparing pharmacy ledger &amp; documents...</span>
            </div>
          ) : (
            <>
              {/* ========================================================= */}
              {/* TAB 1: AGENCY STATEMENT (Requirement 3) */}
              {/* ========================================================= */}
              {activeType === 'AGENCY_STATEMENT' && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-4">
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                      <Building2 className="w-4 h-4 text-emerald-400" />
                      Select Distributor Agency &amp; Statement Period
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1 sm:col-span-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          Select Agency *
                        </label>
                        <select
                          value={selectedAgencyId}
                          onChange={(e) => setSelectedAgencyId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          From Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          To Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Summary preview for selected agency */}
                  {selectedAgencyId && (
                    <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
                      {(() => {
                        const s = summaries.find((sum) => sum.agency.id === selectedAgencyId);
                        if (!s) return null;
                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Opening Due</span>
                              <strong className="text-amber-400 text-sm">
                                ₹{s.openingDue.toLocaleString('en-IN')}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">Total Purchases</span>
                              <strong className="text-white text-sm">
                                ₹{s.totalPurchase.toLocaleString('en-IN')}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">Total Paid</span>
                              <strong className="text-emerald-400 text-sm">
                                ₹{s.totalPaid.toLocaleString('en-IN')}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">Current Outstanding</span>
                              <strong className="text-red-400 text-sm">
                                ₹{s.outstandingBalance.toLocaleString('en-IN')}
                              </strong>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Action Buttons (Requirement 3: [ Share ] and [ Save/Export PDF ]) */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleShareAgencyStatement('SHARE')}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      {isGenerating ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Share2 className="w-4 h-4 stroke-[2.5]" />
                      )}
                      <span>Share (Android Share Sheet)</span>
                    </button>

                    <button
                      onClick={() => handleShareAgencyStatement('DOWNLOAD')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Save / Export PDF</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 2: OUTSTANDING DUES (Requirement 4) */}
              {/* ========================================================= */}
              {activeType === 'OUTSTANDING_DUES' && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-white font-bold text-sm flex items-center gap-2">
                        <IndianRupee className="w-4 h-4 text-amber-400" />
                        Distributor Accounts Ranked by Outstanding Due
                      </div>
                      <span className="text-xs text-slate-400">
                        {summaries.length} Distributors Registered
                      </span>
                    </div>

                    <div className="divide-y divide-slate-800/80 max-h-56 overflow-y-auto">
                      {[...summaries]
                        .sort((a, b) => b.outstandingBalance - a.outstandingBalance)
                        .map((ag) => (
                          <div
                            key={ag.agency.id}
                            className="py-2.5 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-bold text-white">{ag.agency.name}</div>
                              <div className="text-[10px] text-slate-400">
                                Op: ₹{ag.openingDue.toLocaleString('en-IN')} | Billed: ₹{ag.totalPurchase.toLocaleString('en-IN')} | Paid: ₹{ag.totalPaid.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-amber-300 text-sm">
                                ₹{ag.outstandingBalance.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleShareOutstandingDues('SHARE')}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      <Share2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Share Outstanding Dues</span>
                    </button>

                    <button
                      onClick={() => handleShareOutstandingDues('DOWNLOAD')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Export PDF</span>
                    </button>

                    <button
                      onClick={() => handleShareOutstandingDues('CSV')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 3: PURCHASE RECORDS (Requirement 5) */}
              {/* ========================================================= */}
              {activeType === 'PURCHASE_RECORDS' && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <span className="text-white font-bold text-sm block">Filters</span>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">From Date</label>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">To Date</label>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">Agency</label>
                        <select
                          value={selectedAgencyId}
                          onChange={(e) => setSelectedAgencyId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        >
                          <option value="">All Agencies</option>
                          {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">Medicine</label>
                        <input
                          type="text"
                          placeholder="Search medicine..."
                          value={medicineQuery}
                          onChange={(e) => setMedicineQuery(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleSharePurchases('SHARE')}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      <Share2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Share Purchase Records</span>
                    </button>

                    <button
                      onClick={() => handleSharePurchases('DOWNLOAD')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Export PDF</span>
                    </button>

                    <button
                      onClick={() => handleSharePurchases('CSV')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 4: PAYMENT RECORDS (Requirement 6) */}
              {/* ========================================================= */}
              {activeType === 'PAYMENT_RECORDS' && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <span className="text-white font-bold text-sm block">Filters</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">From Date</label>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">To Date</label>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">Agency</label>
                        <select
                          value={selectedAgencyId}
                          onChange={(e) => setSelectedAgencyId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        >
                          <option value="">All Agencies</option>
                          {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleSharePayments('SHARE')}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      <Share2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Share Payment Records</span>
                    </button>

                    <button
                      onClick={() => handleSharePayments('DOWNLOAD')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Export PDF</span>
                    </button>

                    <button
                      onClick={() => handleSharePayments('CSV')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 5: STOCK REPORT (Requirement 7) */}
              {/* ========================================================= */}
              {activeType === 'STOCK_REPORT' && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold text-sm">
                        Total Inventory ({items.length} Batch Records)
                      </span>
                      <span className="text-xs text-slate-400">
                        Includes Medicine, Batch, MRP, Rate &amp; Expiry
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">Agency Filter</label>
                        <select
                          value={selectedAgencyId}
                          onChange={(e) => setSelectedAgencyId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        >
                          <option value="">All Agencies</option>
                          {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-400">Search Product</label>
                        <input
                          type="text"
                          placeholder="Search product name..."
                          value={medicineQuery}
                          onChange={(e) => setMedicineQuery(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleShareStock('SHARE')}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      <Share2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Share Stock Report</span>
                    </button>

                    <button
                      onClick={() => handleShareStock('DOWNLOAD')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Export PDF</span>
                    </button>

                    <button
                      onClick={() => handleShareStock('CSV')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 6: EXPIRED STOCK (Requirement 8) */}
              {/* ========================================================= */}
              {activeType === 'EXPIRED_STOCK' && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-red-900/40 space-y-3">
                    <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                      <AlertCircle className="w-4 h-4" />
                      Expired Stock – Action Required for Distributor Return
                    </div>
                    <p className="text-xs text-slate-400">
                      Share with agency sales representatives to claim credit notes or schedule stock returns.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleShareExpiredStock('SHARE')}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-red-600/25 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      <Share2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Share Expired Stock</span>
                    </button>

                    <button
                      onClick={() => handleShareExpiredStock('DOWNLOAD')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-red-400" />
                      <span>Export PDF</span>
                    </button>

                    <button
                      onClick={() => handleShareExpiredStock('CSV')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 7: NEAR-EXPIRY STOCK (Requirement 8) */}
              {/* ========================================================= */}
              {activeType === 'NEAR_EXPIRY_STOCK' && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-amber-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-amber-400 font-bold text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Near-Expiry Stock Time Threshold
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[30, 60, 90].map((days) => (
                          <button
                            key={days}
                            onClick={() => setNearExpiryDays(days)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              nearExpiryDays === days
                                ? 'bg-amber-500 text-slate-950 shadow-sm'
                                : 'bg-slate-900 text-slate-400 hover:text-white'
                            }`}
                          >
                            {days} Days
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">
                      Export items approaching cutoff to initiate clearance or stock rotation.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleShareNearExpiry('SHARE')}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/25 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      <Share2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Share Near-Expiry Stock ({nearExpiryDays}d)</span>
                    </button>

                    <button
                      onClick={() => handleShareNearExpiry('DOWNLOAD')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-amber-400" />
                      <span>Export PDF</span>
                    </button>

                    <button
                      onClick={() => handleShareNearExpiry('CSV')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 8: LOW-STOCK LIST (Requirement 9) */}
              {/* ========================================================= */}
              {activeType === 'LOW_STOCK_LIST' && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-white font-bold text-sm block">
                      Pharmacy Low-Stock Reorder List
                    </span>
                    <p className="text-xs text-slate-400">
                      Calculated from real purchase quantities compared against custom minimum stock alert thresholds.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={() => handleShareLowStock('SHARE')}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      <Share2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Share Low-Stock List</span>
                    </button>

                    <button
                      onClick={() => handleShareLowStock('DOWNLOAD')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>Export PDF</span>
                    </button>

                    <button
                      onClick={() => handleShareLowStock('CSV')}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 9: SCANNED DOCUMENTS (Requirement 10) */}
              {/* ========================================================= */}
              {activeType === 'SCANNED_DOCUMENTS' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-1.5">
                      {(['ALL', 'BILLS', 'RECEIPTS'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setScannedDocFilter(f)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            scannedDocFilter === f
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-400 hover:text-white hover:bg-slate-900'
                          }`}
                        >
                          {f === 'ALL' ? 'All Scans' : f === 'BILLS' ? 'Purchase Bills' : 'Payment Receipts'}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {scannedInvoices.length} Documents
                    </span>
                  </div>

                  {scannedInvoices.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-xs bg-slate-950/40 rounded-2xl border border-slate-800">
                      No scanned documents match filter.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                      {scannedInvoices.map((inv) => {
                        const hasImage = inv.images && inv.images.length > 0;
                        const isReceipt = inv.documentType === 'RECEIPT';

                        return (
                          <div
                            key={inv.id}
                            className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white text-xs truncate">
                                  #{inv.invoiceNumber}
                                </span>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                                    isReceipt
                                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  }`}
                                >
                                  {isReceipt ? 'Receipt' : 'Bill'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-300 truncate">
                                {inv.agencyName}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Date: {inv.invoiceDate} • Amount: ₹{inv.invoiceTotal.toLocaleString('en-IN')}
                              </div>
                            </div>

                            {/* View, Share, Delete Actions (Requirement 10) */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {onViewInvoice && hasImage && (
                                <button
                                  onClick={() => onViewInvoice(inv)}
                                  className="p-2 bg-slate-850 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-750 transition-colors"
                                  title="View Document"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() => handleShareScannedDoc(inv)}
                                disabled={isGenerating}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                                title="Share via Android Share Sheet"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>Share</span>
                              </button>

                              <button
                                onClick={() =>
                                  setDeleteCandidate({
                                    id: inv.id,
                                    title: `#${inv.invoiceNumber} (${inv.agencyName})`,
                                    isPayment: isReceipt,
                                  })
                                }
                                className="p-2 bg-slate-900 hover:bg-red-950/40 text-slate-500 hover:text-red-400 rounded-xl border border-slate-800 transition-colors"
                                title="Delete Document (Requires Confirmation)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================= */}
              {/* TAB 10 & 11: FULL PDF & CSV EXPORTS */}
              {/* ========================================================= */}
              {(activeType === 'FULL_PDF' || activeType === 'FULL_CSV') && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <span className="text-white font-bold text-sm block">
                      Universal Pharmacy Backup &amp; Ledger Export
                    </span>
                    <p className="text-xs text-slate-400">
                      Download complete audited financial statements containing every transaction, line item, and distributor balance.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      onClick={async () => {
                        setIsGenerating(true);
                        try {
                          const blob = await generateFinancialLedgerPdf();
                          downloadPdfBlob(blob, `PharmaScan_Ledger_${getTodayStr()}.pdf`);
                          showFeedback('Downloaded Full Financial Ledger PDF.', 'success');
                        } catch (e: any) {
                          showFeedback(`Failed: ${e.message}`, 'error');
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      disabled={isGenerating}
                      className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Financial Ledger PDF</span>
                    </button>

                    <button
                      onClick={async () => {
                        setIsGenerating(true);
                        try {
                          const csvText = await exportCsv('PURCHASES');
                          const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
                          downloadBlob(blob, `PharmaScan_Purchases_${getTodayStr()}.csv`);
                          showFeedback('Exported Purchases CSV.', 'success');
                        } catch (e: any) {
                          showFeedback(`Failed: ${e.message}`, 'error');
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      disabled={isGenerating}
                      className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                      <span>Download Purchases CSV</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Delete Confirmation Modal (Requirement 10) */}
        {deleteCandidate && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-red-800/80 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-950 text-red-400 rounded-xl border border-red-800">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Confirm Document Deletion</h3>
                  <p className="text-xs text-slate-400">{deleteCandidate.title}</p>
                </div>
              </div>

              <p className="text-xs text-slate-300">
                Are you sure you want to permanently delete this document and its associated records from IndexedDB?
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setDeleteCandidate(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-600/20"
                >
                  Yes, Delete Record
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Authenticated Pharmacy User Data Isolation Enforced.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-750 text-white font-semibold text-xs rounded-xl border border-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
