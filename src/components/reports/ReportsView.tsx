import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Download,
  FileSpreadsheet,
  Calendar,
  Building2,
  AlertTriangle,
  TrendingUp,
  CreditCard,
  Layers,
  Database,
  Upload,
  CheckCircle2,
  RefreshCw,
  FileText,
  Eye,
  X,
  Printer,
  Sparkles,
  Package,
  SlidersHorizontal,
  Filter,
  Check,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import {
  exportAllDataAsJson,
  exportCsv,
  importDataFromJson,
  resetDatabaseToDefaults,
  getAgencies,
  getInvoices,
  getInvoiceItems,
  getOverallDashboardStats,
  getAllAgenciesSummary,
  getPayments,
} from '../../db/indexedDb';
import {
  generateFinancialLedgerPdf,
  generateInventoryReportPdf,
  generateAgencyStatementPdf,
  downloadPdfBlob,
} from '../../services/pdfReportService';
import {
  Agency,
  AgencyFinancialSummary,
  Invoice,
  InvoiceItem,
  OverallStats,
  Payment,
} from '../../types/pharmacy';
import { calculateDaysRemaining } from '../../services/expiryService';

interface ReportsViewProps {
  onOpenDatabaseReset?: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ onOpenDatabaseReset }) => {
  // Active Report View Tab: Ledger or Inventory
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'INVENTORY'>('LEDGER');

  // Export and Notification State
  const [exporting, setExporting] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Live Database Records for Dynamic Filter Calculations & Preview Table
  const [agenciesList, setAgenciesList] = useState<Agency[]>([]);
  const [agencySummaries, setAgencySummaries] = useState<AgencyFinancialSummary[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Financial Ledger Filter State
  const [ledgerAgency, setLedgerAgency] = useState<string>('ALL');
  const [ledgerPeriod, setLedgerPeriod] = useState<
    'ALL' | 'THIS_MONTH' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'FINANCIAL_YEAR'
  >('ALL');
  const [ledgerStatus, setLedgerStatus] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  // Inventory Report Filter State
  const [inventoryPdfFilter, setInventoryPdfFilter] = useState<'ALL' | 'NEAR_EXPIRY' | 'EXPIRED'>('ALL');
  const [inventoryAgency, setInventoryAgency] = useState<string>('ALL');
  const [inventorySortBy, setInventorySortBy] = useState<'expiry' | 'valuation' | 'name' | 'quantity'>('expiry');
  const [inventorySearch, setInventorySearch] = useState<string>('');

  // Single Agency Quick Statement State
  const [quickAgencyId, setQuickAgencyId] = useState<string>('');

  // PDF Preview Modal State
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfTitle, setPreviewPdfTitle] = useState<string>('');
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const loadReportData = async () => {
    try {
      setLoading(true);
      const [allAg, allSumm, allInv, allIt, allPay, allStat] = await Promise.all([
        getAgencies(),
        getAllAgenciesSummary(),
        getInvoices(),
        getInvoiceItems(),
        getPayments(),
        getOverallDashboardStats(),
      ]);
      setAgenciesList(allAg);
      setAgencySummaries(allSumm);
      setInvoices(allInv);
      setItems(allIt);
      setPayments(allPay);
      setStats(allStat);
      if (allAg.length > 0 && !quickAgencyId) {
        setQuickAgencyId(allAg[0].id);
      }
    } catch (e) {
      console.error('Failed to load report data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, []);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Helper date filter for live preview computations
  const now = new Date();
  const isDateInSelectedPeriod = (dateStr?: string) => {
    if (!dateStr || ledgerPeriod === 'ALL') return true;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;

    if (ledgerPeriod === 'THIS_MONTH') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (ledgerPeriod === 'LAST_30_DAYS') {
      const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 30;
    }
    if (ledgerPeriod === 'LAST_90_DAYS') {
      const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 90;
    }
    if (ledgerPeriod === 'FINANCIAL_YEAR') {
      const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const fyStartDate = new Date(fyStartYear, 3, 1);
      return d >= fyStartDate;
    }
    return true;
  };

  // Live Filtered Financial Ledger Invoices
  const filteredLedgerInvoices = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (ledgerAgency !== 'ALL' && inv.agencyId !== ledgerAgency) return false;
      if (!isDateInSelectedPeriod(inv.invoiceDate)) return false;
      if (ledgerStatus === 'UNPAID' && inv.paymentStatus === 'PAID') return false;
      if (ledgerStatus === 'PAID' && inv.paymentStatus !== 'PAID') return false;
      if (q) {
        const match =
          (inv.invoiceNumber || '').toLowerCase().includes(q) ||
          (inv.agencyName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [invoices, ledgerAgency, ledgerPeriod, ledgerStatus, ledgerSearch]);

  const filteredLedgerPayments = useMemo(() => {
    return payments.filter((p) => {
      if (ledgerAgency !== 'ALL' && p.agencyId !== ledgerAgency) return false;
      if (!isDateInSelectedPeriod(p.paymentDate)) return false;
      return true;
    });
  }, [payments, ledgerAgency, ledgerPeriod]);

  const liveLedgerPurchases = useMemo(
    () => filteredLedgerInvoices.reduce((acc, i) => acc + (i.invoiceTotal || 0), 0),
    [filteredLedgerInvoices]
  );
  const liveLedgerPaid = useMemo(
    () => filteredLedgerPayments.reduce((acc, p) => acc + (p.amount || 0), 0),
    [filteredLedgerPayments]
  );
  const liveLedgerOutstanding = useMemo(() => {
    if (ledgerAgency !== 'ALL') {
      const match = agencySummaries.find((a) => a.agency.id === ledgerAgency);
      return match ? match.outstandingBalance : Math.max(0, liveLedgerPurchases - liveLedgerPaid);
    }
    return agencySummaries.reduce((sum, a) => sum + (a.outstandingBalance || 0), 0);
  }, [agencySummaries, ledgerAgency, liveLedgerPurchases, liveLedgerPaid]);

  // Live Filtered Inventory Items
  const filteredInventoryItems = useMemo(() => {
    const nowTime = Date.now();
    const q = inventorySearch.trim().toLowerCase();
    const res = items.filter((it) => {
      if (inventoryAgency !== 'ALL' && it.agencyId !== inventoryAgency) return false;
      if (inventoryPdfFilter === 'NEAR_EXPIRY') {
        if (!(it.expiryTimestamp > 0 && it.expiryTimestamp <= nowTime + 90 * 24 * 60 * 60 * 1000)) {
          return false;
        }
      }
      if (inventoryPdfFilter === 'EXPIRED') {
        if (!(it.expiryTimestamp > 0 && it.expiryTimestamp < nowTime)) {
          return false;
        }
      }
      if (q) {
        const match =
          (it.productName || '').toLowerCase().includes(q) ||
          (it.batchNumber || '').toLowerCase().includes(q) ||
          (it.agencyName || '').toLowerCase().includes(q) ||
          (it.manufacturer || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    res.sort((a, b) => {
      if (inventorySortBy === 'valuation') {
        const valA = (a.quantity || 0) * (a.purchaseRate || 0);
        const valB = (b.quantity || 0) * (b.purchaseRate || 0);
        return valB - valA;
      }
      if (inventorySortBy === 'name') {
        return (a.productName || '').localeCompare(b.productName || '');
      }
      if (inventorySortBy === 'quantity') {
        return (b.quantity || 0) - (a.quantity || 0);
      }
      const expA = a.expiryTimestamp || Number.MAX_SAFE_INTEGER;
      const expB = b.expiryTimestamp || Number.MAX_SAFE_INTEGER;
      return expA - expB;
    });

    return res;
  }, [items, inventoryAgency, inventoryPdfFilter, inventorySortBy, inventorySearch]);

  const liveStockUnits = useMemo(
    () => filteredInventoryItems.reduce((acc, it) => acc + (it.quantity || 0) + (it.freeQuantity || 0), 0),
    [filteredInventoryItems]
  );
  const liveStockCostValuation = useMemo(
    () => filteredInventoryItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.purchaseRate || 0), 0),
    [filteredInventoryItems]
  );
  const liveStockMrpValuation = useMemo(
    () => filteredInventoryItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.mrp || 0), 0),
    [filteredInventoryItems]
  );

  // ==========================================
  // Primary 'Download PDF' Feature Handlers
  // ==========================================

  // Downloads currently filtered Financial Ledger or Inventory Report using jsPDF
  const handleDownloadCurrentlyFilteredPdf = async () => {
    if (activeTab === 'LEDGER') {
      await handleDownloadFinancialLedgerPdf();
    } else {
      await handleDownloadInventoryPdf();
    }
  };

  const handleDownloadFinancialLedgerPdf = async () => {
    setExporting('PDF');
    try {
      const blob = await generateFinancialLedgerPdf({
        agencyId: ledgerAgency,
        period: ledgerPeriod,
        status: ledgerStatus,
        searchQuery: ledgerSearch,
      });
      const agencySlug =
        ledgerAgency === 'ALL'
          ? 'all-suppliers'
          : (agenciesList.find((a) => a.id === ledgerAgency)?.name || 'supplier')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '-');
      const filename = `pharmascan-financial-ledger-${agencySlug}-${new Date().toISOString().split('T')[0]}.pdf`;
      downloadPdfBlob(blob, filename);
      showNotification(`Downloaded PDF: ${filename}`);
    } catch (e: any) {
      console.error('Failed to export Financial Ledger PDF:', e);
      showNotification('Error generating Financial Ledger PDF', 'info');
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadInventoryPdf = async () => {
    setExporting('PDF');
    try {
      const blob = await generateInventoryReportPdf({
        filterCategory: inventoryPdfFilter,
        agencyId: inventoryAgency,
        sortBy: inventorySortBy,
        searchQuery: inventorySearch,
      });
      const scopeSlug = inventoryPdfFilter.toLowerCase().replace('_', '-');
      const filename = `pharmascan-inventory-report-${scopeSlug}-${new Date().toISOString().split('T')[0]}.pdf`;
      downloadPdfBlob(blob, filename);
      showNotification(`Downloaded PDF: ${filename}`);
    } catch (e: any) {
      console.error('Failed to export Inventory PDF:', e);
      showNotification('Error generating Inventory PDF', 'info');
    } finally {
      setExporting(null);
    }
  };

  // Preview Handlers
  const handlePreviewCurrentlyFilteredPdf = async () => {
    if (activeTab === 'LEDGER') {
      setExporting('PREVIEW');
      try {
        const blob = await generateFinancialLedgerPdf({
          agencyId: ledgerAgency,
          period: ledgerPeriod,
          status: ledgerStatus,
          searchQuery: ledgerSearch,
        });
        const url = URL.createObjectURL(blob);
        setPreviewPdfBlob(blob);
        setPreviewPdfUrl(url);
        const agencyName =
          ledgerAgency === 'ALL'
            ? 'All Wholesale Suppliers'
            : agenciesList.find((a) => a.id === ledgerAgency)?.name || 'Supplier';
        setPreviewPdfTitle(`Financial Ledger & Accounts Statement • ${agencyName}`);
        setPreviewFilename(`pharmascan-financial-ledger-${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (e: any) {
        console.error('Failed to preview Financial Ledger PDF:', e);
        showNotification('Error generating PDF preview', 'info');
      } finally {
        setExporting(null);
      }
    } else {
      setExporting('PREVIEW');
      try {
        const blob = await generateInventoryReportPdf({
          filterCategory: inventoryPdfFilter,
          agencyId: inventoryAgency,
          sortBy: inventorySortBy,
          searchQuery: inventorySearch,
        });
        const url = URL.createObjectURL(blob);
        setPreviewPdfBlob(blob);
        setPreviewPdfUrl(url);
        setPreviewPdfTitle(
          inventoryPdfFilter === 'NEAR_EXPIRY'
            ? 'Near Expiry Return Claims Report'
            : inventoryPdfFilter === 'EXPIRED'
            ? 'Expired Medicine Audit & Disposal Register'
            : 'Pharmacy Inventory & Stock Valuation Report'
        );
        setPreviewFilename(
          `pharmascan-inventory-report-${inventoryPdfFilter.toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`
        );
      } catch (e: any) {
        console.error('Failed to preview Inventory PDF:', e);
        showNotification('Error generating PDF preview', 'info');
      } finally {
        setExporting(null);
      }
    }
  };

  // Single Agency Quick Statement PDF Handler
  const handleDownloadQuickAgencyPdf = async () => {
    if (!quickAgencyId) return;
    setExporting('QUICK_AGENCY_PDF');
    try {
      const blob = await generateAgencyStatementPdf(quickAgencyId);
      const ag = agenciesList.find((a) => a.id === quickAgencyId);
      const slug = (ag?.name || 'agency').toLowerCase().replace(/[^a-z0-9]/g, '-');
      const filename = `pharmascan-statement-${slug}-${new Date().toISOString().split('T')[0]}.pdf`;
      downloadPdfBlob(blob, filename);
      showNotification(`Downloaded Supplier Statement (${filename})`);
    } catch (e) {
      console.error('Failed to export distributor statement:', e);
    } finally {
      setExporting(null);
    }
  };

  const handleClosePreview = () => {
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
    }
    setPreviewPdfUrl(null);
    setPreviewPdfBlob(null);
  };

  const handlePrintPdf = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownloadCsv = async (type: 'AGENCIES' | 'PURCHASES' | 'PAYMENTS' | 'EXPIRY') => {
    setExporting(type);
    try {
      const csv = await exportCsv(type);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pharmascan-${type.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showNotification(`Exported ${type} spreadsheet CSV`);
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setExporting(null);
    }
  };

  const handleBackupJson = async () => {
    setExporting('JSON');
    try {
      const json = await exportAllDataAsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pharmascan-full-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showNotification('Downloaded full database JSON snapshot');
    } finally {
      setExporting(null);
    }
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = await importDataFromJson(content);
        if (success) {
          setImportStatus('Backup data successfully imported! All ledgers and stock updated.');
          loadReportData();
        } else {
          setImportStatus('Failed to import backup file. Ensure valid JSON format.');
        }
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleResetDefaults = async () => {
    if (
      confirm(
        'Reset all demo data back to clean initial pharmacy baseline? This will preserve demo agencies, bills, and price changes.'
      )
    ) {
      await resetDatabaseToDefaults();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Pharmacy Accounting Reports & PDF Statements
          </h1>
          <p className="text-xs text-slate-400">
            Generate and export print-ready PDF documents using jsPDF for financial audits, GST registers, supplier reconciliations, and inventory stock valuation.
          </p>
        </div>

        {notification && (
          <div className="px-3.5 py-2 bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xl animate-in slide-in-from-top-1">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{notification.message}</span>
          </div>
        )}
      </div>

      {importStatus && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-xl text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{importStatus}</span>
        </div>
      )}

      {/* Report Mode Tabs & Prominent 'Download PDF' Action Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          {/* Tab Switcher */}
          <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 self-start">
            <button
              type="button"
              onClick={() => setActiveTab('LEDGER')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'LEDGER'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Financial Ledger Report</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('INVENTORY')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'INVENTORY'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>Inventory & Stock Report</span>
            </button>
          </div>

          {/* Primary Action Buttons: 'Download PDF' and 'Preview PDF' */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePreviewCurrentlyFilteredPdf}
              disabled={exporting !== null}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>{exporting === 'PREVIEW' ? 'Generating Preview...' : 'Preview PDF'}</span>
            </button>

            {/* User Request Requirement: Prominent 'Download PDF' Feature */}
            <button
              type="button"
              aria-label="Download PDF"
              onClick={handleDownloadCurrentlyFilteredPdf}
              disabled={exporting !== null}
              className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer ${
                activeTab === 'LEDGER'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white shadow-blue-500/25'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>{exporting === 'PDF' ? 'Building Print-Ready PDF...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>

        {/* Dynamic Filters Bar */}
        {activeTab === 'LEDGER' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                <span>Filter Financial Ledger Scope:</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Print document will contain exactly these {filteredLedgerInvoices.length} purchase invoices
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Supplier Filter */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 font-medium">Distributor / Supplier:</label>
                <select
                  value={ledgerAgency}
                  onChange={(e) => setLedgerAgency(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">All Wholesale Suppliers</option>
                  {agenciesList.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Accounting Period Filter */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 font-medium">Accounting Period:</label>
                <select
                  value={ledgerPeriod}
                  onChange={(e) => setLedgerPeriod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">All Time Cumulative</option>
                  <option value="THIS_MONTH">Current Month</option>
                  <option value="LAST_30_DAYS">Last 30 Days</option>
                  <option value="LAST_90_DAYS">Last 90 Days</option>
                  <option value="FINANCIAL_YEAR">Current Financial Year (FY)</option>
                </select>
              </div>

              {/* Payment Status Filter */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 font-medium">Payment Status:</label>
                <select
                  value={ledgerStatus}
                  onChange={(e) => setLedgerStatus(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">All Invoices (Paid & Unpaid)</option>
                  <option value="UNPAID">Pending & Partial Only</option>
                  <option value="PAID">Fully Paid Only</option>
                </select>
              </div>

              {/* Text Search */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 font-medium">Search Bill or Agency:</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search bill # or supplier..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  {ledgerSearch && (
                    <button
                      type="button"
                      onClick={() => setLedgerSearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Live Filter KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="spatial-stat-card p-3.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Selection Purchases
                </span>
                <span className="text-base font-black text-white font-mono tabular-nums mt-0.5 block">
                  ₹{liveLedgerPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="spatial-stat-card p-3.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Disbursed Paid
                </span>
                <span className="text-base font-black text-emerald-400 font-mono tabular-nums mt-0.5 block">
                  ₹{liveLedgerPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="spatial-stat-card p-3.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Net Balance Due
                </span>
                <span className="text-base font-black text-red-400 font-mono tabular-nums mt-0.5 block">
                  ₹{liveLedgerOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="spatial-stat-card p-3.5">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Filtered Bills
                </span>
                <span className="text-base font-black text-teal-400 font-mono tabular-nums mt-0.5 block">
                  {filteredLedgerInvoices.length} Bills
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                <span>Filter Inventory & Stock Valuation Scope:</span>
              </div>
              <span className="text-[11px] text-slate-400">
                Print document will contain {filteredInventoryItems.length} batches ({liveStockUnits} units)
              </span>
            </div>

            {/* Scope Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setInventoryPdfFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  inventoryPdfFilter === 'ALL'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All Stock Valuation
              </button>
              <button
                type="button"
                onClick={() => setInventoryPdfFilter('NEAR_EXPIRY')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  inventoryPdfFilter === 'NEAR_EXPIRY'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Near Expiry (Return Claims)
              </button>
              <button
                type="button"
                onClick={() => setInventoryPdfFilter('EXPIRED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  inventoryPdfFilter === 'EXPIRED'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Expired Medicine Register
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Supplier Filter */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 font-medium">Filter Supplier Agency:</label>
                <select
                  value={inventoryAgency}
                  onChange={(e) => setInventoryAgency(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="ALL">All Wholesale Suppliers</option>
                  {agenciesList.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 font-medium">Sort Stock Items By:</label>
                <select
                  value={inventorySortBy}
                  onChange={(e) => setInventorySortBy(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="expiry">Expiry Date (Earliest First)</option>
                  <option value="valuation">Total Cost Value (Highest First)</option>
                  <option value="name">Product Name (A-Z)</option>
                  <option value="quantity">Stock Quantity (Highest First)</option>
                </select>
              </div>

              {/* Search Medicine */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 font-medium">Search Medicine / Batch:</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    placeholder="Search medicine, batch, Mfr..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {inventorySearch && (
                    <button
                      type="button"
                      onClick={() => setInventorySearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Live Filter KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  PTR Cost Valuation
                </span>
                <span className="text-base font-bold text-emerald-400">
                  ₹{liveStockCostValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Retail MRP Valuation
                </span>
                <span className="text-base font-bold text-blue-400">
                  ₹{liveStockMrpValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Batches / SKUs
                </span>
                <span className="text-base font-bold text-white">
                  {filteredInventoryItems.length} Batches
                </span>
              </div>
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                  Total Units
                </span>
                <span className="text-base font-bold text-amber-400">
                  {liveStockUnits} Units
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live On-Screen Report Table (Matching the generated PDF structure) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">
              {activeTab === 'LEDGER'
                ? `Currently Filtered Invoices Register (${filteredLedgerInvoices.length} Bills)`
                : `Currently Filtered Stock List (${filteredInventoryItems.length} Batches)`}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCurrentlyFilteredPdf}
              disabled={exporting !== null}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto max-h-[480px]">
          {activeTab === 'LEDGER' ? (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 sticky top-0 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Bill #</th>
                  <th className="py-3 px-4">Distributor</th>
                  <th className="py-3 px-4 text-right">Taxable (₹)</th>
                  <th className="py-3 px-4 text-right">GST (₹)</th>
                  <th className="py-3 px-4 text-right">Total (₹)</th>
                  <th className="py-3 px-4 text-right">Paid (₹)</th>
                  <th className="py-3 px-4 text-right">Balance Due (₹)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredLedgerInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      No purchase invoices match the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredLedgerInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400">{inv.invoiceDate || 'N/A'}</td>
                      <td className="py-3 px-4 font-bold text-white">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4">{inv.agencyName}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {(inv.taxableAmount || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {(inv.gstAmount || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold font-mono text-white">
                        {(inv.invoiceTotal || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-400">
                        {(inv.paidAmount || 0).toFixed(2)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          (inv.balanceAmount || 0) > 0 ? 'text-red-400' : 'text-slate-400'
                        }`}
                      >
                        {(inv.balanceAmount || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.paymentStatus === 'PAID'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : inv.paymentStatus === 'PARTIAL'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-red-500/20 text-red-300 border border-red-500/30'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 sticky top-0 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Medicine / Product</th>
                  <th className="py-3 px-4">Batch #</th>
                  <th className="py-3 px-4">Expiry</th>
                  <th className="py-3 px-4 text-right">Billed Qty</th>
                  <th className="py-3 px-4 text-right">Free</th>
                  <th className="py-3 px-4 text-right">PTR Rate (₹)</th>
                  <th className="py-3 px-4 text-right">MRP (₹)</th>
                  <th className="py-3 px-4 text-right">Cost Value (₹)</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-center">Expiry Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredInventoryItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      No medicine stock items match the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredInventoryItems.map((it, idx) => {
                    const days = calculateDaysRemaining(it.expiryTimestamp);
                    const costVal = (it.quantity || 0) * (it.purchaseRate || 0);
                    return (
                      <tr key={it.id || idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-white">
                          {it.productName}
                          {it.manufacturer && (
                            <span className="text-[10px] text-slate-400 block font-normal">
                              {it.manufacturer}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">{it.batchNumber}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">{it.expiryDate}</td>
                        <td className="py-3 px-4 text-right font-mono">{it.quantity || 0}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400">{it.freeQuantity || 0}</td>
                        <td className="py-3 px-4 text-right font-mono">{(it.purchaseRate || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-300">{(it.mrp || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          {costVal.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-slate-300">{it.agencyName}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              days < 0
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : days <= 30
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                : days <= 90
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {days < 0 ? 'EXPIRED' : days <= 30 ? `${days}d Critical` : days <= 90 ? `${days}d Near` : 'Safe'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Secondary Tool 1: Single Distributor Reconciled Statement */}
      {agenciesList.length > 0 && (
        <div className="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-white font-bold text-sm">Individual Distributor Statement PDF</h4>
              <p className="text-xs text-slate-400">
                Generate an individual supplier reconciliation ledger with invoice lines and payment vouchers for direct settlement.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <select
              value={quickAgencyId}
              onChange={(e) => setQuickAgencyId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 flex-1 sm:w-64"
            >
              {agenciesList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleDownloadQuickAgencyPdf}
              disabled={exporting !== null || !quickAgencyId}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting === 'QUICK_AGENCY_PDF' ? 'Building...' : 'Download Statement PDF'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Secondary Tool 2: Spreadsheet CSV Exports */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <h2 className="text-white font-bold text-sm">Spreadsheet CSV Exports (Excel / Tally Compatible)</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CSV 1: Purchases */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Layers className="w-4 h-4 text-blue-400" />
                <span>Purchases Register</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Scanned invoices, GST breakdown, taxable rates, and payment status.
              </p>
            </div>
            <button
              onClick={() => handleDownloadCsv('PURCHASES')}
              disabled={exporting !== null}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Purchases CSV
            </button>
          </div>

          {/* CSV 2: Agencies */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <Building2 className="w-4 h-4 text-amber-400" />
                <span>Agency Balances</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Supplier totals, payments disbursed, and net balances due.
              </p>
            </div>
            <button
              onClick={() => handleDownloadCsv('AGENCIES')}
              disabled={exporting !== null}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Agencies CSV
            </button>
          </div>

          {/* CSV 3: Payments */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Payment Vouchers</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Cheques, UPI, and bank transfers with reference codes.
              </p>
            </div>
            <button
              onClick={() => handleDownloadCsv('PAYMENTS')}
              disabled={exporting !== null}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Payments CSV
            </button>
          </div>

          {/* CSV 4: Expiry */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>Near Expiry Audit</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Traceable stock batches, expiry dates, and supplier sources.
              </p>
            </div>
            <button
              onClick={() => handleDownloadCsv('EXPIRY')}
              disabled={exporting !== null}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Expiry CSV
            </button>
          </div>
        </div>
      </div>

      {/* Full Database Backup & Restore */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/20">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Complete Database Backup & Restore</h2>
              <p className="text-xs text-slate-400 max-w-xl mt-0.5">
                Download a complete, offline JSON snapshot containing all agencies, invoices, line items, payments, and audit logs. You can import this snapshot on any computer.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer flex items-center gap-2 transition-colors">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              Restore from JSON
              <input
                type="file"
                accept=".json"
                onChange={handleImportJsonFile}
                className="hidden"
              />
            </label>

            <button
              onClick={handleBackupJson}
              disabled={exporting !== null}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Full Backup (JSON)
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Storage Engine: Browser IndexedDB • 100% Offline durability</span>
          <button
            onClick={() => {
              if (onOpenDatabaseReset) {
                onOpenDatabaseReset();
              } else {
                handleResetDefaults();
              }
            }}
            className="text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5 text-red-400" />
            <span>Database Reset &amp; Clean Start</span>
          </button>
        </div>
      </div>

      {/* PDF Interactive Preview Modal */}
      {previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[92vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-white font-bold text-sm sm:text-base">{previewPdfTitle}</h3>
                  <p className="text-[11px] text-slate-400">Print & Audit Ready Official PDF Document</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintPdf}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  Print
                </button>

                {previewPdfBlob && (
                  <button
                    onClick={() => downloadPdfBlob(previewPdfBlob, previewFilename)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </button>
                )}
                <button
                  onClick={handleClosePreview}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Embedded PDF Viewer */}
            <div className="flex-1 bg-slate-950 p-2 overflow-hidden flex items-center justify-center">
              <iframe
                ref={iframeRef}
                src={previewPdfUrl}
                title={previewPdfTitle}
                className="w-full h-full rounded-xl border border-slate-800 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
