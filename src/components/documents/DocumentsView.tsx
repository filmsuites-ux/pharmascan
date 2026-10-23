import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Building2,
  Calendar,
  IndianRupee,
  Eye,
  Share2,
  Archive,
  ArchiveRestore,
  Trash2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Layers,
  ArrowUpDown,
  Tag,
  AlertCircle,
  ExternalLink,
  Receipt,
} from 'lucide-react';

function formatDisplayDate(dateStr: string): string {
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
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {}
  return dateStr;
}
import { DocumentType, Invoice, InvoiceItem, ReviewStatus } from '../../types/pharmacy';
import {
  archiveInvoice,
  deleteInvoice,
  getInvoiceItems,
  getInvoices,
  unarchiveInvoice,
} from '../../db/indexedDb';
import { OriginalBillViewer } from '../common/OriginalBillViewer';
import { generateBillSummaryText, shareImageFile, shareTextContent } from '../../services/shareService';

interface DocumentsViewProps {
  onScanNewDocument: () => void;
  onSelectAgency?: (agencyId: string) => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  onScanNewDocument,
  onSelectAgency,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab: Active Documents vs Archived Documents (Requirement 16)
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  // Filters (Requirement 9)
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Viewer / Share state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Delete safety confirmation (Requirement 17)
  const [documentToDelete, setDocumentToDelete] = useState<Invoice | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [invs, itms] = await Promise.all([getInvoices(), getInvoiceItems()]);
    setInvoices(invs);
    setItems(itms);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenViewer = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setIsViewerOpen(true);
  };

  const handleToggleArchive = async (inv: Invoice) => {
    if (inv.isArchived) {
      await unarchiveInvoice(inv.id);
    } else {
      await archiveInvoice(inv.id);
    }
    await loadData();
  };

  const handleConfirmDelete = async () => {
    if (!documentToDelete) return;
    await deleteInvoice(documentToDelete.id);
    setDocumentToDelete(null);
    await loadData();
  };

  const handleShareSummary = async (inv: Invoice) => {
    const invItems = items.filter((it) => it.invoiceId === inv.id);
    const summaryText = generateBillSummaryText(inv, invItems);
    await shareTextContent(`Pharmacy Bill Summary - #${inv.invoiceNumber}`, summaryText);
  };

  // Filter documents
  const filtered = invoices.filter((inv) => {
    const isArchived = Boolean(inv.isArchived);
    if (activeTab === 'active' && isArchived) return false;
    if (activeTab === 'archived' && !isArchived) return false;

    if (typeFilter !== 'ALL' && inv.documentType !== typeFilter) return false;
    if (statusFilter !== 'ALL' && inv.reviewStatus !== statusFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const invItems = items.filter((it) => it.invoiceId === inv.id);
      const matchesMedicine = invItems.some(
        (it) =>
          it.productName.toLowerCase().includes(q) ||
          it.batchNumber.toLowerCase().includes(q) ||
          it.expiryDate.toLowerCase().includes(q)
      );

      const matchesMeta =
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.agencyName.toLowerCase().includes(q) ||
        inv.invoiceDate.includes(q) ||
        inv.invoiceTotal.toString().includes(q) ||
        (inv.documentType && inv.documentType.toLowerCase().includes(q));

      return matchesMedicine || matchesMeta;
    }

    return true;
  });

  const activeCount = invoices.filter((i) => !i.isArchived).length;
  const archivedCount = invoices.filter((i) => i.isArchived).length;
  const needsReviewCount = invoices.filter((i) => !i.isArchived && i.reviewStatus === 'NEEDS_REVIEW').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Documents & Purchase Bills
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
              {invoices.length} Total
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            Searchable document archive with original scan storage, source bill verification, and native sharing.
          </p>
        </div>

        <button
          onClick={onScanNewDocument}
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all transform active:scale-95"
        >
          <FileText className="w-4 h-4" />
          Scan Document
        </button>
      </div>

      {/* Needs Review Alert Banner */}
      {needsReviewCount > 0 && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-700/80 rounded-xl flex items-center justify-between gap-3 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>{needsReviewCount} Document(s) need review.</strong> One or more fields had low OCR confidence and were marked for verification.
            </span>
          </div>
          <button
            onClick={() => {
              setActiveTab('active');
              setStatusFilter('NEEDS_REVIEW');
            }}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded font-bold"
          >
            Filter Needs Review
          </button>
        </div>
      )}

      {/* Tabs: Active vs Archived (Requirement 16) */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-4 text-xs font-bold">
          <button
            onClick={() => {
              setActiveTab('active');
              setStatusFilter('ALL');
            }}
            className={`pb-1 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'active'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            Active Documents ({activeCount})
          </button>

          <button
            onClick={() => {
              setActiveTab('archived');
              setStatusFilter('ALL');
            }}
            className={`pb-1 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'archived'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Archive className="w-4 h-4" />
            Archived Documents ({archivedCount})
          </button>
        </div>

        <span className="text-[11px] text-slate-500">
          Archiving retains all links, source scans, and history.
        </span>
      </div>

      {/* Powerful Search Bar & Filters (Requirement 9) */}
      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by medicine, supplier, invoice #, batch, date, amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Document Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
          >
            <option value="ALL">All Document Types</option>
            <option value="TAX_INVOICE">Tax Invoice</option>
            <option value="PURCHASE_BILL">Purchase Bill</option>
            <option value="RECEIPT">Receipt</option>
            <option value="CREDIT_DEBIT_NOTE">Credit/Debit Note</option>
            <option value="EXPIRY_RETURN">Expiry Return</option>
            <option value="OTHER">Other</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
          >
            <option value="ALL">All Review Statuses</option>
            <option value="VERIFIED">Verified Only</option>
            <option value="NEEDS_REVIEW">Needs Review Only</option>
          </select>
        </div>
      </div>

      {/* Documents List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs">
            No documents found matching your search.
          </div>
        ) : (
          filtered.map((inv) => {
            const invItems = items.filter((it) => it.invoiceId === inv.id);
            const isNeedsReview = inv.reviewStatus === 'NEEDS_REVIEW';

              const isReceipt = inv.documentType === 'RECEIPT';
              const docTypeLabel = isReceipt ? 'PAYMENT RECEIPT' : (inv.documentType === 'TAX_INVOICE' ? 'PURCHASE BILL' : (inv.documentType?.replace(/_/g, ' ') || 'PURCHASE BILL'));

              return (
                <div
                  key={inv.id}
                  onClick={() => handleOpenViewer(inv)}
                  className={`p-4 bg-slate-900 hover:bg-slate-850 border rounded-2xl transition-all shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-emerald-500/50 group ${
                    isNeedsReview ? 'border-amber-500/50' : 'border-slate-800'
                  }`}
                  title="Click to view document and extracted details"
                >
                  {/* Left Meta (Requirement 13: Document Type, Agency Name, Date, Amount, Purchase/Payment, Status) */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Document Type Badge */}
                      <span className={`text-[10px] px-2.5 py-0.5 rounded font-bold uppercase tracking-wider border flex items-center gap-1 ${
                        isReceipt
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {isReceipt ? <Receipt className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        {docTypeLabel}
                      </span>

                      {/* Purchase vs Payment classification badge */}
                      <span className={`text-[10px] px-2 py-0.5 rounded font-black tracking-widest uppercase ${
                        isReceipt
                          ? 'bg-teal-950 text-teal-400 border border-teal-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}>
                        {isReceipt ? 'PAYMENT' : 'PURCHASE'}
                      </span>

                      {/* Invoice / Reference Number */}
                      <span className="font-mono font-bold text-white text-sm">
                        #{inv.invoiceNumber}
                      </span>

                      {/* Formatted Date (e.g. 02 Oct 2026) */}
                      <span className="text-xs text-slate-300 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {formatDisplayDate(inv.invoiceDate)}
                      </span>

                      {/* Status */}
                      {isNeedsReview ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Needs Review
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                    </div>

                    {/* Agency Name */}
                    <div className="flex items-center gap-2 text-sm text-emerald-400 font-bold">
                      <Building2 className="w-4 h-4 shrink-0" />
                      <span className="truncate group-hover:text-emerald-300 transition-colors">{inv.agencyName}</span>
                    </div>

                    {/* Medicines or Payment Notes snippet */}
                    {isReceipt ? (
                      <div className="text-[11px] text-slate-400 truncate">
                        <strong>Payment Record:</strong> {inv.notes || 'Recorded payment against supplier ledger account'}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 max-w-xl truncate">
                        <strong>Medicines ({inv.itemsCount}):</strong>{' '}
                        {invItems.map((it) => it.productName).join(', ') || 'No medicines logged'}
                      </div>
                    )}
                  </div>

                  {/* Right Amount & Actions */}
                  <div className="flex flex-wrap items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">
                        {isReceipt ? 'Payment Amount' : 'Purchase Amount'}
                      </div>
                      <div className={`text-lg font-black font-mono ${
                        isReceipt ? 'text-teal-400' : 'text-emerald-400'
                      }`}>
                        ₹{inv.invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Action Buttons (with stopPropagation) */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* View Original Bill */}
                      <button
                        onClick={() => handleOpenViewer(inv)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
                        title="View original and processed scan"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        {isReceipt ? 'View Receipt' : 'View Bill'}
                      </button>

                      {/* Share */}
                      <button
                        onClick={() => handleShareSummary(inv)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700"
                        title="Share document details"
                      >
                        <Share2 className="w-4 h-4 text-emerald-400" />
                      </button>

                      {/* Archive / Restore */}
                      <button
                        onClick={() => handleToggleArchive(inv)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700"
                        title={inv.isArchived ? 'Restore to active' : 'Archive document'}
                      >
                        {inv.isArchived ? <ArchiveRestore className="w-4 h-4 text-amber-400" /> : <Archive className="w-4 h-4" />}
                      </button>

                      {/* Delete with safety check */}
                      <button
                        onClick={() => setDocumentToDelete(inv)}
                        className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
          })
        )}
      </div>

      {/* Bill Viewer Modal with Both Scans + Extracted Details */}
      {selectedInvoice && (
        <OriginalBillViewer
          images={selectedInvoice.images}
          originalImages={selectedInvoice.originalImages}
          processedImages={selectedInvoice.processedImages}
          title={`Document #${selectedInvoice.invoiceNumber} • ${selectedInvoice.agencyName}`}
          isOpen={isViewerOpen}
          onClose={() => {
            setIsViewerOpen(false);
            setSelectedInvoice(null);
          }}
          invoice={selectedInvoice}
          items={items.filter((it) => it.invoiceId === selectedInvoice.id)}
        />
      )}

      {/* Delete Safety Confirmation Modal (Requirement 17) */}
      {documentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 bg-red-500/10 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Delete this document permanently?</h3>
                <p className="text-xs text-slate-400">
                  Document #{documentToDelete.invoiceNumber} ({documentToDelete.agencyName})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will remove the stored document and its associated document record. All linked stock records and balances for this invoice will be removed.
            </p>

            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-[11px] text-red-200">
              Warning: If you just want to clear old records from your main view, consider <strong>Archiving</strong> instead.
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                onClick={() => setDocumentToDelete(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
