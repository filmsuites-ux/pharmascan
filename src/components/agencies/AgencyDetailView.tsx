import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CreditCard,
  Download,
  Eye,
  FileText,
  IndianRupee,
  Layers,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  Upload,
  AlertTriangle,
  Receipt,
  FileCheck,
  Edit2,
  ExternalLink,
  X,
  Sparkles,
  Clock,
  CheckCircle2,
  Bookmark,
  Share2,
} from 'lucide-react';
import {
  Agency,
  AgencyFinancialSummary,
  AgencySchedule,
  Invoice,
  InvoiceItem,
  Payment,
  PaymentMethod,
} from '../../types/pharmacy';
import {
  deleteInvoice,
  deletePayment,
  getAgencyById,
  getAgencySummary,
  getInvoiceItems,
  getInvoices,
  getPayments,
  savePayment,
} from '../../db/indexedDb';
import { OriginalBillViewer } from '../common/OriginalBillViewer';
import { formatDaysRemainingText, calculateDaysRemaining } from '../../services/expiryService';
import {
  calculateAgencySchedule,
  formatScheduleDate,
  getScheduleOverrides,
} from '../../services/scheduleService';
import { EditScheduleModal } from '../schedule/EditScheduleModal';
import { AddPreviousDueModal } from './AddPreviousDueModal';
import { generateAgencyStatementShareText, shareTextContent } from '../../services/shareService';

interface AgencyDetailViewProps {
  agencyId: string;
  onBack: () => void;
  onScanBillForAgency: (agencyId: string) => void;
}

export const AgencyDetailView: React.FC<AgencyDetailViewProps> = ({
  agencyId,
  onBack,
  onScanBillForAgency,
}) => {
  const [summary, setSummary] = useState<AgencyFinancialSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [agencyItems, setAgencyItems] = useState<InvoiceItem[]>([]);
  const [schedule, setSchedule] = useState<AgencySchedule | null>(null);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active tab
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'statement' | 'expiry' | 'schedule'>(
    'invoices'
  );

  // Previous Due Modal (Requirement 6)
  const [showPreviousDueModal, setShowPreviousDueModal] = useState<boolean>(false);

  // Statement Filters (Requirement 7)
  const [statementTypeFilter, setStatementTypeFilter] = useState<'ALL' | 'PURCHASE' | 'PAYMENT' | 'OPENING_DUE'>('ALL');
  const [statementDateFilter, setStatementDateFilter] = useState<'ALL' | 'THIS_MONTH' | 'LAST_30_DAYS'>('ALL');
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PARTIAL' | 'PAID'>('ALL');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc'>('date_desc');

  // Original bill viewer modal
  const [selectedBillImages, setSelectedBillImages] = useState<string[]>([]);
  const [selectedBillOriginalImages, setSelectedBillOriginalImages] = useState<string[]>([]);
  const [selectedBillProcessedImages, setSelectedBillProcessedImages] = useState<string[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | undefined>(undefined);
  const [billViewerTitle, setBillViewerTitle] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Record Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('NEFT_RTGS');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentProofImage, setPaymentProofImage] = useState<string | undefined>(undefined);

  const loadData = async () => {
    setLoading(true);
    try {
      const sum = await getAgencySummary(agencyId);
      setSummary(sum);

      const allInvs = await getInvoices();
      const agInvs = allInvs.filter((i) => i.agencyId === agencyId);
      setInvoices(agInvs);

      const allPays = await getPayments();
      const agPays = allPays.filter((p) => p.agencyId === agencyId);
      setPayments(agPays);

      const allItems = await getInvoiceItems();
      setAgencyItems(allItems.filter((it) => it.agencyId === agencyId));

      if (sum) {
        const overrides = await getScheduleOverrides();
        const sched = calculateAgencySchedule(
          sum.agency,
          agInvs,
          agPays,
          sum.agency.scheduleOverride || overrides[agencyId]
        );
        setSchedule(sched);
      }
    } catch (err) {
      console.error('Error loading agency detail data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [agencyId]);

  const handleOpenBillViewer = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setSelectedBillImages(invoice.images || []);
    setSelectedBillOriginalImages(invoice.originalImages || []);
    setSelectedBillProcessedImages(invoice.processedImages || []);
    setBillViewerTitle(`Bill #${invoice.invoiceNumber} • ${invoice.agencyName}`);
    setIsViewerOpen(true);
  };

  const handleOpenRecordPayment = (existingPayment?: Payment) => {
    if (existingPayment) {
      setEditingPaymentId(existingPayment.id);
      setPaymentAmount(existingPayment.amount);
      setPaymentDate(existingPayment.paymentDate);
      setPaymentMethod(existingPayment.paymentMethod);
      setPaymentReference(existingPayment.referenceNumber || '');
      setPaymentNotes(existingPayment.notes || '');
      setPaymentProofImage(existingPayment.receiptImage);
    } else {
      setEditingPaymentId(null);
      // Default to current outstanding balance
      setPaymentAmount(summary ? summary.outstandingBalance : 0);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('NEFT_RTGS');
      setPaymentReference('');
      setPaymentNotes('');
      setPaymentProofImage(undefined);
    }
    setShowPaymentModal(true);
  };

  const handleSavePayment = async () => {
    if (!summary || paymentAmount <= 0) {
      alert('Please enter a valid payment amount greater than zero.');
      return;
    }

    const payment: Payment = {
      id: editingPaymentId || `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      agencyId: summary.agency.id,
      agencyName: summary.agency.name,
      paymentDate,
      amount: Number(paymentAmount),
      paymentMethod,
      referenceNumber: paymentReference.trim(),
      notes: paymentNotes.trim(),
      receiptImage: paymentProofImage,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await savePayment(payment);
    setShowPaymentModal(false);
    await loadData();
  };

  const handleDeletePayment = async (id: string) => {
    if (confirm('Are you sure you want to delete this payment record? Balance will be recalculated.')) {
      await deletePayment(id);
      await loadData();
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (confirm('Are you sure you want to delete this purchase bill? All associated stock and balances will be adjusted.')) {
      await deleteInvoice(id);
      await loadData();
    }
  };

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center p-16">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  // Filtered invoices
  const filteredInvoices = invoices
    .filter((inv) => {
      if (statusFilter !== 'ALL' && inv.paymentStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.invoiceDate.includes(q) ||
          (inv.items && inv.items.some((it) => it.productName.toLowerCase().includes(q)))
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'date_desc') return b.invoiceDate.localeCompare(a.invoiceDate);
      if (sortBy === 'date_asc') return a.invoiceDate.localeCompare(b.invoiceDate);
      if (sortBy === 'amount_desc') return b.invoiceTotal - a.invoiceTotal;
      return 0;
    });

  // Chronological Statement items (Debit = Purchase / Opening Due, Credit = Payment)
  const statementEvents = [
    ...invoices.map((inv) => ({
      id: inv.id,
      date: inv.invoiceDate,
      type: (inv.documentType === 'OPENING_DUE' ? 'OPENING_DUE' : 'PURCHASE') as 'PURCHASE' | 'OPENING_DUE',
      reference: inv.documentType === 'OPENING_DUE' ? `Opening Due: ${inv.invoiceNumber}` : `#${inv.invoiceNumber}`,
      description:
        inv.documentType === 'OPENING_DUE'
          ? inv.notes || 'Previous Due balance prior to software adoption'
          : `${inv.itemsCount} medicines purchased`,
      debit: inv.invoiceTotal,
      credit: 0,
      timestamp: new Date(inv.invoiceDate).getTime(),
    })),
    ...payments.map((pay) => ({
      id: pay.id,
      date: pay.paymentDate,
      type: 'PAYMENT' as const,
      reference: pay.referenceNumber ? `Ref: ${pay.referenceNumber}` : pay.paymentMethod,
      description: pay.notes || `Paid via ${pay.paymentMethod}`,
      debit: 0,
      credit: pay.amount,
      timestamp: new Date(pay.paymentDate).getTime(),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Compute running balance
  let runningBal = 0;
  const rawChronologicalStatement = statementEvents.map((ev) => {
    runningBal += ev.debit - ev.credit;
    return {
      ...ev,
      runningBalance: runningBal,
    };
  });

  // Filter statement according to statementTypeFilter and statementDateFilter (Requirement 7)
  const chronologicalStatement = rawChronologicalStatement.filter((ev) => {
    if (statementTypeFilter !== 'ALL' && ev.type !== statementTypeFilter) {
      return false;
    }
    if (statementDateFilter === 'THIS_MONTH') {
      const now = new Date();
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (!ev.date.startsWith(currentYearMonth)) return false;
    } else if (statementDateFilter === 'LAST_30_DAYS') {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      if (ev.timestamp < thirtyDaysAgo) return false;
    }
    return true;
  });

  // Share Statement handler (Requirement 7 & 23)
  const handleShareStatement = async () => {
    if (!summary) return;
    const shareText = generateAgencyStatementShareText(
      summary.agency.name,
      summary.openingDue,
      summary.totalPurchase,
      summary.totalPaid,
      summary.outstandingBalance,
      chronologicalStatement
    );

    const shared = await shareTextContent(`Statement - ${summary.agency.name}`, shareText);
    if (shared) {
      setShareFeedback('Statement shared / copied to clipboard!');
      setTimeout(() => setShareFeedback(null), 3500);
    }
  };

  // Export Statement CSV handler (Requirement 7 & 23)
  const handleExportStatementCsv = () => {
    if (!summary) return;
    const headers = ['Date', 'Type', 'Reference', 'Debit (Purchase/Due)', 'Credit (Payment)', 'Running Balance'];
    const rows = chronologicalStatement.map((s) => [
      s.date,
      s.type,
      `"${s.reference}"`,
      s.debit > 0 ? s.debit.toFixed(2) : '0.00',
      s.credit > 0 ? s.credit.toFixed(2) : '0.00',
      s.runningBalance.toFixed(2),
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Statement_${summary.agency.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    setShareFeedback('Statement CSV downloaded!');
    setTimeout(() => setShareFeedback(null), 3500);
  };

  // Near expiry items from this agency
  const nearExpiryFromAgency = agencyItems
    .filter((it) => {
      const days = calculateDaysRemaining(it.expiryTimestamp);
      return days <= 90;
    })
    .sort((a, b) => a.expiryTimestamp - b.expiryTimestamp);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Toast alert */}
      {shareFeedback && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-emerald-500 text-emerald-300 text-xs font-semibold rounded-xl shadow-xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{shareFeedback}</span>
        </div>
      )}

      {/* Top Navigation & Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-emerald-400" />
          Back to Agencies
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowPreviousDueModal(true)}
            className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs rounded-xl border border-amber-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            Add Previous Due
          </button>

          <button
            onClick={() => onScanBillForAgency(summary.agency.id)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            Scan Bill for this Agency
          </button>

          <button
            onClick={() => handleOpenRecordPayment()}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all transform active:scale-95 cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Record Payment
          </button>
        </div>
      </div>

      {/* Main Agency Header & The 3 Core Numbers (Requirement 5) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {summary.agency.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-400">
                {summary.agency.gstin && (
                  <span>
                    GSTIN: <strong className="text-slate-200 font-mono">{summary.agency.gstin}</strong>
                  </span>
                )}
                {summary.agency.dlNumber && (
                  <span>
                    DL No: <strong className="text-slate-200 font-mono">{summary.agency.dlNumber}</strong>
                  </span>
                )}
                {summary.agency.phone && (
                  <span>
                    Phone: <strong className="text-slate-200">{summary.agency.phone}</strong>
                  </span>
                )}
              </div>
              {summary.agency.address && (
                <p className="text-xs text-slate-400 mt-1 max-w-xl">
                  {summary.agency.address}
                </p>
              )}
            </div>
          </div>

          <div className="text-right text-xs text-slate-400 space-y-0.5">
            <div>Payment Terms: <strong className="text-slate-200">{summary.agency.paymentTermsDays || 30} Days Credit</strong></div>
            <div>Total Invoices: <strong className="text-slate-200">{summary.invoicesCount} Bills</strong></div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* FINANCIAL SUMMARY CARDS: OPENING DUE + PURCHASES - PAYMENTS = OUTSTANDING (Requirement 6) */}
        {/* ============================================================== */}
        <div className={`grid grid-cols-1 ${summary.openingDue > 0 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'} gap-4 pt-4 border-t border-slate-800/80`}>
          {/* Card 0: Previous / Opening Due if present */}
          {summary.openingDue > 0 && (
            <div className="spatial-stat-card p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
                  Opening / Previous Due
                </span>
                <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">
                  ₹{summary.openingDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] text-slate-400">Balance prior to software entry</span>
              </div>
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <Bookmark className="w-5 h-5" />
              </div>
            </div>
          )}

          {/* 1. Total Purchase */}
          <div className="spatial-stat-card p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {summary.openingDue > 0 ? 'New Purchases' : 'Total Purchase'}
              </span>
              <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">
                ₹{summary.totalPurchase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Across {invoices.filter((i) => i.documentType !== 'OPENING_DUE').length} confirmed bills</span>
            </div>
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          {/* 2. Total Paid */}
          <div className="spatial-stat-card p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Total Paid
              </span>
              <div className="text-2xl font-black text-emerald-400 mt-1 font-mono tabular-nums tracking-tight">
                ₹{summary.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Across {payments.length} payment entries</span>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>

          {/* 3. Outstanding Balance */}
          <div
            className={`spatial-stat-card p-4 flex items-center justify-between border ${
              summary.outstandingBalance > 0
                ? 'border-amber-500/40 text-amber-300'
                : 'border-emerald-500/40 text-emerald-300'
            }`}
          >
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-300">
                Outstanding Balance
              </span>
              <div className="text-2xl font-black mt-1 font-mono tabular-nums tracking-tight">
                ₹{summary.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] font-medium opacity-80">
                {summary.outstandingBalance > 0
                  ? 'Payment Due to Distributor'
                  : 'Account Fully Cleared ✓'}
              </span>
            </div>
            <div
              className={`p-3 rounded-xl border ${
                summary.outstandingBalance > 0
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}
            >
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Accounting Formula Ribbon (Requirement 6 & 24) */}
        <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 text-slate-300 font-mono">
            <span className="font-semibold text-slate-400">Formula:</span>
            <span>Opening Due (₹{summary.openingDue.toLocaleString('en-IN')})</span>
            <span className="text-slate-500">+</span>
            <span>Purchases (₹{summary.totalPurchase.toLocaleString('en-IN')})</span>
            <span className="text-slate-500">-</span>
            <span>Payments (₹{summary.totalPaid.toLocaleString('en-IN')})</span>
            <span className="text-slate-500">=</span>
            <span className="font-bold text-amber-400">Outstanding (₹{summary.outstandingBalance.toLocaleString('en-IN')})</span>
          </div>

          {summary.openingDue === 0 && (
            <button
              onClick={() => setShowPreviousDueModal(true)}
              className="text-[10px] text-amber-400 hover:text-amber-300 font-medium underline cursor-pointer"
            >
              + Add Previous / Opening Due
            </button>
          )}
        </div>

        {/* Visit Schedule Strip (Requirements 2, 3, 6, 8, 11) */}
        {schedule && (
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-500/10 text-teal-400 rounded-lg">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">Next Expected Visit:</span>
                  <span className="text-teal-300 font-semibold">
                    {schedule.nextExpectedDate ? formatScheduleDate(schedule.nextExpectedDate) : 'Not enough data'}
                    {schedule.daysUntilNextVisit !== null && (
                      <span className="ml-1 text-[11px] text-slate-400 font-normal">
                        ({schedule.daysUntilNextVisit === 0 ? 'Today' : schedule.daysUntilNextVisit === 1 ? 'Tomorrow' : `in ${schedule.daysUntilNextVisit} days`})
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${
                      schedule.confidence === 'HIGH'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : schedule.confidence === 'MEDIUM'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {schedule.confidence} Confidence
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Typical Interval: <strong className="text-slate-200">{schedule.typicalIntervalDays ? `${schedule.typicalIntervalDays} days` : 'Need more bills'}</strong>
                  {schedule.lastActivityDate && (
                    <span> • Last Activity: <strong className="text-slate-200">{formatScheduleDate(schedule.lastActivityDate)}</strong></span>
                  )}
                  {schedule.isManualOverride && (
                    <span className="text-purple-400 font-medium"> • (Manually Set)</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('schedule')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-colors"
              >
                View Pattern History
              </button>
              <button
                onClick={() => setIsEditingSchedule(true)}
                className="px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit Schedule
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Agency Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-6 text-xs font-bold overflow-x-auto">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'invoices'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Purchase Invoices ({invoices.length})
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'payments'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Payment Ledger ({payments.length})
        </button>

        <button
          onClick={() => setActiveTab('schedule')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'schedule'
              ? 'border-teal-500 text-teal-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Visit &amp; Payment Schedule</span>
          {schedule && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
              {schedule.confidence}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('statement')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'statement'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Date-wise Running Statement
        </button>

        <button
          onClick={() => setActiveTab('expiry')}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-all ${
            activeTab === 'expiry'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Near-Expiry Stock ({nearExpiryFromAgency.length})
        </button>
      </div>

      {/* TAB 1: INVOICES LIST (Requirement 6) */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search invoice number, date, or medicine..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="ALL">All Status</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIAL">Partially Paid</option>
                <option value="PAID">Fully Paid</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="date_desc">Newest Date First</option>
                <option value="date_asc">Oldest Date First</option>
                <option value="amount_desc">Highest Amount</option>
              </select>
            </div>
          </div>

          {filteredInvoices.length === 0 ? (
            <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-xs">
              No bills found matching your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-sm">
                        Invoice #{inv.invoiceNumber}
                      </span>
                      <span className="text-xs text-slate-400">({inv.invoiceDate})</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          inv.paymentStatus === 'PAID'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : inv.paymentStatus === 'PARTIAL'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-red-500/20 text-red-300 border-red-500/30'
                        }`}
                      >
                        {inv.paymentStatus}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400">
                      {inv.itemsCount} Medicines Billed • Taxable: ₹{inv.taxableAmount.toFixed(2)} • GST: ₹{inv.gstAmount.toFixed(2)}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Invoice Total</div>
                      <div className="text-base font-bold text-white">
                        ₹{inv.invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-slate-400">Paid / Due</div>
                      <div className="text-xs font-semibold text-emerald-400">
                        Paid: ₹{inv.paidAmount.toLocaleString('en-IN')}
                      </div>
                      <div className="text-xs font-bold text-amber-400">
                        Due: ₹{inv.balanceAmount.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {inv.images && inv.images.length > 0 && (
                        <button
                          onClick={() => handleOpenBillViewer(inv)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
                          title="View Original Paper Bill"
                        >
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          View Original Bill
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteInvoice(inv.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                        title="Delete this invoice"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SEPARATE PAYMENT LEDGER (Requirement 7) */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Official Payment Ledger ({payments.length} Payments Recorded)
            </h3>
            <button
              onClick={() => handleOpenRecordPayment()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Payment Entry
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-xs">
              No payments recorded yet for this agency. Click "Record Payment" to log payment.
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-md">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-300 font-semibold text-[11px]">
                    <th className="py-3 px-4">Payment Date</th>
                    <th className="py-3 px-4">Amount (₹)</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Reference / Cheque No</th>
                    <th className="py-3 px-4">Remarks / Notes</th>
                    <th className="py-3 px-4 text-center">Receipt</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-medium text-white">
                        {p.paymentDate}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-emerald-400 text-sm">
                        ₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-300">
                        {p.referenceNumber || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate">
                        {p.notes || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {p.receiptImage ? (
                          <button
                            onClick={() => {
                              setSelectedBillImages([p.receiptImage!]);
                              setBillViewerTitle(`Payment Receipt • ₹${p.amount}`);
                              setIsViewerOpen(true);
                            }}
                            className="text-emerald-400 hover:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenRecordPayment(p)}
                            className="p-1 text-slate-400 hover:text-slate-200"
                            title="Edit Payment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePayment(p.id)}
                            className="p-1 text-slate-500 hover:text-red-400"
                            title="Delete Payment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DATE-WISE STATEMENT (Requirements 6, 7 & 23) */}
      {activeTab === 'statement' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Distributor Running Statement</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {chronologicalStatement.length} entries
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Opening Due &amp; Purchases increase payable balance (Debit); payments reduce payable balance (Credit).
              </p>
            </div>

            {/* Export & Share Statement (Requirement 7 & 23) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportStatementCsv}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                Export CSV
              </button>

              <button
                type="button"
                onClick={handleShareStatement}
                className="px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share Statement
              </button>
            </div>
          </div>

          {/* Statement Filters Bar (Requirement 7) */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 font-medium">Type Filter:</span>
              <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                {(['ALL', 'PURCHASE', 'PAYMENT', 'OPENING_DUE'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setStatementTypeFilter(t)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      statementTypeFilter === t
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t === 'ALL' ? 'All' : t === 'PURCHASE' ? 'Purchases' : t === 'PAYMENT' ? 'Payments' : 'Opening Due'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Period:</span>
              <select
                value={statementDateFilter}
                onChange={(e) => setStatementDateFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Time</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="LAST_30_DAYS">Last 30 Days</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-md">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-300 font-semibold text-[11px]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Transaction Type</th>
                  <th className="py-3 px-4">Reference / Details</th>
                  <th className="py-3 px-4 text-right">Debit (Purchase / Due)</th>
                  <th className="py-3 px-4 text-right">Credit (Payment)</th>
                  <th className="py-3 px-4 text-right">Running Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {chronologicalStatement.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                      No transactions match the selected filter.
                    </td>
                  </tr>
                ) : (
                  chronologicalStatement.map((st, idx) => (
                    <tr key={`${st.id}-${idx}`} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-2.5 px-4 text-slate-200">{st.date}</td>
                      <td className="py-2.5 px-4 font-sans font-semibold">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            st.type === 'OPENING_DUE'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : st.type === 'PURCHASE'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {st.type === 'OPENING_DUE' ? 'OPENING DUE' : st.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-300 font-sans">
                        <div className="font-mono text-xs">{st.reference}</div>
                        <div className="text-[11px] text-slate-500">{st.description}</div>
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-200 font-bold">
                        {st.debit > 0 ? `₹${st.debit.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-emerald-400 font-bold">
                        {st.credit > 0 ? `₹${st.credit.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-white">
                        ₹{st.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: NEAR EXPIRY FROM THIS AGENCY (Requirement 14) */}
      {activeTab === 'expiry' && (
        <div className="space-y-4">
          <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              These medicines were supplied by <strong>{summary.agency.name}</strong> and are expiring within 90 days.
              Contact this distributor's sales representative for return debit note before expiry.
            </span>
          </div>

          {nearExpiryFromAgency.length === 0 ? (
            <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-xs">
              No near-expiry medicines found from this agency. Stock is safe!
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-md">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-300 font-semibold text-[11px]">
                    <th className="py-3 px-4">Medicine Name</th>
                    <th className="py-3 px-4">Batch #</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Remaining Days</th>
                    <th className="py-3 px-4 text-right">Stock Qty</th>
                    <th className="py-3 px-4 text-right">Purchase Rate</th>
                    <th className="py-3 px-4">Invoice Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {nearExpiryFromAgency.map((it) => {
                    const days = calculateDaysRemaining(it.expiryTimestamp);
                    const isExpired = days < 0;
                    return (
                      <tr key={it.id} className="hover:bg-slate-850/50">
                        <td className="py-2.5 px-4 font-bold text-white">{it.productName}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-300">{it.batchNumber}</td>
                        <td className="py-2.5 px-4 font-mono font-bold text-amber-400">{it.expiryDate}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              isExpired
                                ? 'bg-red-950 text-red-300 border border-red-800'
                                : days <= 30
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-yellow-950 text-yellow-300 border border-yellow-800'
                            }`}
                          >
                            {formatDaysRemainingText(days)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-white">{it.quantity}</td>
                        <td className="py-2.5 px-4 text-right font-mono">₹{it.purchaseRate.toFixed(2)}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-400">
                          #{it.invoiceNumber} ({it.invoiceDate})
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: VISIT & PAYMENT SCHEDULE (Requirements 2, 3, 4, 6, 7, 8, 10, 14) */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {schedule ? (
            <>
              {/* Executive Schedule Overview Card */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Distributor Recurrence Tracker
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          schedule.confidence === 'HIGH'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : schedule.confidence === 'MEDIUM'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        Confidence: {schedule.confidence}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white">
                      Visit &amp; Payment Schedule for {schedule.agencyName}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Calculated from real historical purchase bills and payment receipts.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditingSchedule(true)}
                      className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-1.5 transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit Schedule
                    </button>
                  </div>
                </div>

                {/* 4 Key Schedule Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Next Expected Visit
                    </span>
                    <div className="text-xl font-bold text-white">
                      {schedule.nextExpectedDate ? formatScheduleDate(schedule.nextExpectedDate) : 'Not enough data'}
                    </div>
                    <span className="text-[11px] font-medium text-teal-400">
                      {schedule.statusLabel}
                      {schedule.daysUntilNextVisit !== null && schedule.daysUntilNextVisit >= 0 && (
                        <span> ({schedule.daysUntilNextVisit === 0 ? 'Today' : schedule.daysUntilNextVisit === 1 ? 'Tomorrow' : `in ${schedule.daysUntilNextVisit} days`})</span>
                      )}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Typical Visit Interval
                    </span>
                    <div className="text-xl font-bold text-teal-300">
                      {schedule.typicalIntervalDays ? `${schedule.typicalIntervalDays} days` : 'Not determined'}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {schedule.isManualOverride
                        ? 'Manually configured'
                        : schedule.medianIntervalDays
                        ? `Median of historical intervals`
                        : 'Requires multiple records'}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Outstanding Balance
                    </span>
                    <div className="text-xl font-bold text-amber-400 font-mono">
                      ₹{schedule.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      To be prepared before arrival
                    </span>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                      Last Known Activity
                    </span>
                    <div className="text-xl font-bold text-white">
                      {formatScheduleDate(schedule.lastActivityDate)}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Last Purchase: {formatScheduleDate(schedule.lastPurchaseDate)}
                    </span>
                  </div>
                </div>

                {/* Status Notice / Irregularity / Estimation (Requirements 3, 7, 10) */}
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                  <div className="font-semibold text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                    <span>Schedule Algorithm Intelligence:</span>
                  </div>
                  <p className="text-slate-400">
                    {schedule.sourceExplanation || 'Schedule learned from historical transaction dates.'}
                  </p>
                  <p className="text-[11px] text-slate-500 italic">
                    Note: This is a data-driven prediction based on distributor historical patterns, not a guaranteed appointment.
                  </p>
                </div>
              </div>

              {/* Statistical Analysis & Interval Breakdown (Requirements 2 & 14) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Historical Intervals between visits */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-teal-400" />
                    Historical Visit Activity &amp; Intervals (Requirement 2)
                  </h4>
                  <p className="text-xs text-slate-400">
                    Chronological activity dates and the actual days elapsed between visits.
                  </p>

                  {schedule.activityHistory.length <= 1 ? (
                    <div className="p-6 text-center bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-500">
                      {schedule.activityHistory.length === 1
                        ? 'Only 1 transaction date recorded. At least 2 dates are needed to calculate recurring intervals.'
                        : 'No activity records found yet.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {schedule.activityHistory.map((act, index) => {
                        const prevAct = index > 0 ? schedule.activityHistory[index - 1] : null;
                        const intervalDays = prevAct ? schedule.intervalsInDays[index - 1] : null;

                        return (
                          <div key={act.referenceId || index} className="space-y-1.5">
                            {intervalDays !== null && intervalDays !== undefined && (
                              <div className="flex items-center gap-2 px-3 py-1 text-[11px] text-teal-300 font-mono">
                                <span className="text-slate-600">↓</span>
                                <span className="bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 font-bold">
                                  {intervalDays} days interval
                                </span>
                              </div>
                            )}

                            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    act.type === 'PURCHASE'
                                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  }`}
                                >
                                  {act.type}
                                </span>
                                <span className="font-bold text-white">{formatScheduleDate(act.date)}</span>
                                {act.referenceNumber && (
                                  <span className="text-slate-500 font-mono text-[11px]">
                                    #{act.referenceNumber}
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-slate-300">
                                {act.amount ? `₹${act.amount.toLocaleString('en-IN')}` : '-'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Robust Statistical Calculations (Requirement 14) */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Robust Statistical Metrics (Requirement 14)
                  </h4>
                  <p className="text-xs text-slate-400">
                    Multi-metric analysis to prevent an isolated anomaly from distorting the distributor schedule.
                  </p>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 block text-[11px]">Recorded Activities:</span>
                      <span className="font-bold text-white text-lg font-mono">
                        {schedule.recordedVisitsCount}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 block text-[11px]">Median Interval:</span>
                      <span className="font-bold text-teal-400 text-lg font-mono">
                        {schedule.medianIntervalDays ? `${schedule.medianIntervalDays} days` : 'N/A'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 block text-[11px]">Average (Mean) Interval:</span>
                      <span className="font-bold text-white text-lg font-mono">
                        {schedule.averageIntervalDays ? `${schedule.averageIntervalDays} days` : 'N/A'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 block text-[11px]">Most Common (Mode):</span>
                      <span className="font-bold text-white text-lg font-mono">
                        {schedule.modeIntervalDays ? `${schedule.modeIntervalDays} days` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Formula visualizer */}
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs">
                    <span className="font-bold text-slate-300 block">
                      Next Expected Visit Formula (Requirement 3):
                    </span>
                    <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg font-mono text-[11px] text-teal-300 flex flex-wrap items-center gap-2">
                      <span>Last Activity ({formatScheduleDate(schedule.lastActivityDate)})</span>
                      <span className="text-slate-500">+</span>
                      <span>Typical Interval ({schedule.typicalIntervalDays || 15} days)</span>
                      <span className="text-slate-500">=</span>
                      <span className="text-white font-bold">{formatScheduleDate(schedule.nextExpectedDate)}</span>
                    </div>
                    {schedule.isManualOverride && (
                      <p className="text-[11px] text-purple-300">
                        * Override active: Manual schedule chosen by user ({schedule.manualOverride?.expectedIntervalDays} days interval).
                      </p>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => setIsEditingSchedule(true)}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-teal-400" />
                      Adjust Expected Date or Interval
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs">
              Loading agency visit schedule...
            </div>
          )}
        </div>
      )}

      {/* Record / Edit Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-white font-bold text-base">
                  {editingPaymentId ? 'Edit Payment Entry' : 'Record Agency Payment'}
                </h3>
                <p className="text-xs text-slate-400">{summary.agency.name}</p>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Payment Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-500">
                  Current Outstanding: ₹{summary.outstandingBalance.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                  >
                    <option value="NEFT_RTGS">NEFT / RTGS</option>
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="CHEQUE">Bank Cheque</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Direct Bank Transfer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Reference / Cheque Number / UTR
                </label>
                <input
                  type="text"
                  placeholder="e.g. CHQ-991024 or UPI/62699102"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white font-mono rounded-lg px-3 py-2 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Remarks / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Part payment against September bills"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none resize-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePayment}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/20"
              >
                Save Payment & Recalculate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Viewer Modal */}
      <OriginalBillViewer
        images={selectedBillImages}
        originalImages={selectedBillOriginalImages}
        processedImages={selectedBillProcessedImages}
        invoice={selectedInvoice}
        items={selectedInvoice ? agencyItems.filter((it) => it.invoiceId === selectedInvoice.id) : undefined}
        title={billViewerTitle}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
      />

      {/* Edit Schedule Modal (Requirement 8) */}
      <EditScheduleModal
        isOpen={isEditingSchedule}
        schedule={schedule}
        onClose={() => setIsEditingSchedule(false)}
        onSaved={loadData}
      />

      {/* Add Previous / Opening Due Modal (Requirement 6) */}
      <AddPreviousDueModal
        isOpen={showPreviousDueModal}
        preselectedAgencyId={summary.agency.id}
        onClose={() => setShowPreviousDueModal(false)}
        onSaved={loadData}
      />
    </div>
  );
};
