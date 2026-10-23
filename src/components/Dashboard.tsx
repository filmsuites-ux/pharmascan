import React, { useState, useEffect } from 'react';
import {
  Camera,
  IndianRupee,
  CreditCard,
  Layers,
  AlertTriangle,
  TrendingUp,
  Clock,
  ShieldAlert,
  Building2,
  FileText,
  Eye,
  Plus,
  ArrowRight,
  Sparkles,
  Calendar,
  Wallet,
  Edit2,
  CheckCircle2,
  Bell,
  Info,
  Bookmark,
  Pill,
  Share2,
  FileSpreadsheet,
  FolderOpen,
  Package,
  Download,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { AgencyFinancialSummary, AgencySchedule, Invoice, OverallStats, Payment } from '../types/pharmacy';
import { OriginalBillViewer } from './common/OriginalBillViewer';
import {
  formatScheduleDate,
  getAllAgencySchedules,
  getAppTodayDate,
  groupAgencySchedules,
} from '../services/scheduleService';
import { getAgencies, getInvoices, getPayments, getInvoiceItems, getMedicineMinStockConfig } from '../db/indexedDb';
import { EditScheduleModal } from './schedule/EditScheduleModal';
import { AddPreviousDueModal } from './agencies/AddPreviousDueModal';
import { DashboardShareModal, ShareReportType } from './dashboard/DashboardShareModal';
import {
  shareBlobFile,
  generateBillSummaryText,
  generateSinglePaymentText,
} from '../services/shareService';
import { generateSingleInvoicePdf, generateSinglePaymentPdf } from '../services/pdfReportService';

interface DashboardProps {
  stats: OverallStats | null;
  agencies: AgencyFinancialSummary[];
  recentInvoices: Invoice[];
  onOpenScanner: () => void;
  onNavigate: (view: string) => void;
  onSelectAgency: (agencyId: string) => void;
  onOpenShareApk?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  stats,
  agencies,
  recentInvoices,
  onOpenScanner,
  onNavigate,
  onSelectAgency,
  onOpenShareApk,
}) => {
  const [selectedBillImages, setSelectedBillImages] = useState<string[]>([]);
  const [selectedBillOriginalImages, setSelectedBillOriginalImages] = useState<string[]>([]);
  const [selectedBillProcessedImages, setSelectedBillProcessedImages] = useState<string[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | undefined>(undefined);
  const [viewerTitle, setViewerTitle] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [showPreviousDueModal, setShowPreviousDueModal] = useState(false);

  // Share & Export Center Modal State (Requirements 1, 2, 11, 12)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareModalType, setShareModalType] = useState<ShareReportType>('AGENCY_STATEMENT');
  const [shareModalAgencyId, setShareModalAgencyId] = useState<string | undefined>(undefined);
  const [sharingInvoiceId, setSharingInvoiceId] = useState<string | null>(null);
  const [sharingPaymentId, setSharingPaymentId] = useState<string | null>(null);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [activityTab, setActivityTab] = useState<'BILLS' | 'PAYMENTS'>('BILLS');

  const handleOpenShare = (type: ShareReportType, agencyId?: string) => {
    setShareModalType(type);
    setShareModalAgencyId(agencyId);
    setIsShareModalOpen(true);
  };

  const handleShareIndividualInvoice = async (inv: Invoice) => {
    setSharingInvoiceId(inv.id);
    try {
      const invItems = await getInvoiceItems();
      const itemsForBill = invItems.filter((it) => it.invoiceId === inv.id);
      const rawImage = inv.processedImages?.[0] || inv.images?.[0] || inv.originalImages?.[0];
      const isPdf = rawImage && rawImage.startsWith('data:application/pdf');

      let blob: Blob;
      let filename = `Bill_${inv.invoiceNumber}_${inv.agencyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      let mimeType = 'application/pdf';

      if (rawImage && !isPdf) {
        const res = await fetch(rawImage);
        blob = await res.blob();
        filename = `Bill_${inv.invoiceNumber}_${inv.agencyName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
        mimeType = blob.type || 'image/jpeg';
      } else {
        blob = await generateSingleInvoicePdf(inv, itemsForBill);
      }

      const textSummary = generateBillSummaryText(inv, itemsForBill);
      await shareBlobFile(
        blob,
        filename,
        `Purchase Bill #${inv.invoiceNumber} - ${inv.agencyName}`,
        mimeType,
        textSummary
      );
    } catch (err: any) {
      console.error('Failed to share individual invoice:', err);
    } finally {
      setSharingInvoiceId(null);
    }
  };

  const handleShareIndividualPayment = async (pay: Payment) => {
    setSharingPaymentId(pay.id);
    try {
      const blob = await generateSinglePaymentPdf(pay);
      const textSummary = generateSinglePaymentText(pay);
      const filename = `Payment_${pay.agencyName.replace(/[^a-zA-Z0-9]/g, '_')}_${pay.paymentDate}.pdf`;
      await shareBlobFile(
        blob,
        filename,
        `Payment Voucher - ${pay.agencyName}`,
        'application/pdf',
        textSummary
      );
    } catch (err: any) {
      console.error('Failed to share individual payment:', err);
    } finally {
      setSharingPaymentId(null);
    }
  };

  // Agency Visits & Payment Schedules (Requirements 5, 6, 8, 12)
  const [schedules, setSchedules] = useState<AgencySchedule[]>([]);
  const [visitTab, setVisitTab] = useState<'TODAY' | 'TOMORROW' | 'DAY_AFTER' | 'NEXT_7_DAYS' | 'ALL'>('TODAY');
  const [editingSchedule, setEditingSchedule] = useState<AgencySchedule | null>(null);

  const loadSchedules = async () => {
    try {
      const [allAgs, allInvs, allPays] = await Promise.all([
        getAgencies(),
        getInvoices(),
        getPayments(),
      ]);
      const data = await getAllAgencySchedules(allAgs, allInvs, allPays);
      setSchedules(data);
      setRecentPayments(allPays.slice(0, 5));
    } catch (err) {
      console.warn('Failed to load agency schedules in Dashboard:', err);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, [agencies, recentInvoices]);

  const groupedVisits = groupAgencySchedules(schedules);

  const handleOpenBill = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setSelectedBillImages(inv.images || []);
    setSelectedBillOriginalImages(inv.originalImages || []);
    setSelectedBillProcessedImages(inv.processedImages || []);
    setViewerTitle(`Invoice #${inv.invoiceNumber} • ${inv.agencyName}`);
    setIsViewerOpen(true);
  };

  const topAgenciesByBalance = agencies.slice(0, 4);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Executive Welcome & Primary Action Banner */}
      {/* Executive Welcome & Primary Action Banner (Spatial UI) */}
      <div className="p-6 spatial-panel border border-white/10 shadow-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-sky-400/40 before:to-transparent">
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300 bg-sky-500/15 px-2.5 py-0.5 rounded-md border border-sky-400/25">
              Live Pharmacy Intelligence
            </span>
            <span className="text-xs text-slate-400">
              • System Date: <strong className="text-slate-200">01-Oct-2026</strong>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Pharmacy Purchase &amp; Expiry Dashboard
          </h1>
          <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
            Spatial OCR bill extraction, automated distributor matching, date-wise payment ledgers, purchase rate hike detection, and near-expiry stock tracking.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <button
            onClick={() => onNavigate('orders')}
            className="px-4 py-3 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl border border-white/10 flex items-center gap-2 transition-all cursor-pointer shadow-md hover:border-sky-400/40"
          >
            <Pill className="w-4 h-4 text-sky-400" />
            <span>Smart Order</span>
          </button>

          <button
            onClick={() => setShowPreviousDueModal(true)}
            className="px-4 py-3 bg-slate-800/80 hover:bg-slate-700/80 text-amber-200 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl border border-amber-500/30 flex items-center gap-2 transition-all cursor-pointer shadow-md hover:border-amber-400/60"
          >
            <Bookmark className="w-4 h-4 text-amber-400" />
            <span>Add Previous Due</span>
          </button>

          <button
            onClick={onOpenScanner}
            className="px-6 py-3.5 bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-xl shadow-sky-500/30 flex items-center gap-2.5 transition-all transform active:scale-95 border border-sky-300/40 cursor-pointer group"
          >
            <Camera className="w-5 h-5 stroke-[2.5] group-hover:scale-110 transition-transform" />
            <span>SCAN BILL</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7 MAIN DASHBOARD KPIS (Spatial Floating Gauges) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Purchases */}
        <div className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Purchases
            </span>
            <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">
              ₹{(stats?.totalPurchases || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-slate-500">Across verified invoices</span>
          </div>
          <div className="p-3 bg-sky-500/15 text-sky-400 border border-sky-400/25 rounded-2xl shadow-sm">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Total Paid */}
        <div className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Paid
            </span>
            <div className="text-2xl font-black text-emerald-400 mt-1 font-mono tabular-nums tracking-tight">
              ₹{(stats?.totalPaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-slate-500">Disbursed to suppliers</span>
          </div>
          <div className="p-3 bg-emerald-500/15 text-emerald-400 border border-emerald-400/25 rounded-2xl shadow-sm">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        {/* 3. Outstanding Balance */}
        <div
          onClick={() => onNavigate('agencies')}
          className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between cursor-pointer group border-amber-500/30 hover:border-amber-400/60"
        >
          <div>
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
              Outstanding Balance
            </span>
            <div className="text-2xl font-black text-amber-300 mt-1 font-mono tabular-nums tracking-tight">
              ₹{(stats?.totalOutstanding || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </div>
            <span className="text-[11px] text-amber-400/80 font-medium group-hover:underline">Pending payments →</span>
          </div>
          <div className="p-3 bg-amber-500/15 text-amber-400 border border-amber-400/30 rounded-2xl shadow-sm">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>

        {/* 4. Near Expiry Items */}
        <div
          onClick={() => onNavigate('expiry')}
          className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between cursor-pointer group"
        >
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Near Expiry
            </span>
            <div className="text-2xl font-black text-amber-400 mt-1 font-mono tabular-nums tracking-tight">
              {stats?.nearExpiryCount || 0} <span className="text-sm font-semibold text-slate-400 font-sans">Items</span>
            </div>
            <span className="text-[11px] text-amber-400/80 font-medium group-hover:underline">Expiring ≤ 90 days →</span>
          </div>
          <div className="p-3 bg-amber-500/15 text-amber-400 border border-amber-400/25 rounded-2xl shadow-sm">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* 5. Expired Items */}
        <div
          onClick={() => onNavigate('expiry')}
          className={`spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between cursor-pointer ${
            (stats?.expiredCount || 0) > 0
              ? 'border-rose-500/40 bg-rose-950/20 hover:border-rose-400'
              : ''
          }`}
        >
          <div>
            <span className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block">
              Expired Items
            </span>
            <div className="text-2xl font-black text-rose-400 mt-1 font-mono tabular-nums tracking-tight">
              {stats?.expiredCount || 0} <span className="text-sm font-semibold text-slate-400 font-sans">Items</span>
            </div>
            <span className="text-[11px] text-rose-400 font-medium">
              {(stats?.expiredCount || 0) > 0 ? 'Immediate return required' : 'No expired stock'}
            </span>
          </div>
          <div className="p-3 bg-rose-500/15 text-rose-400 border border-rose-400/30 rounded-2xl shadow-sm">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        {/* 6. Price Changes */}
        <div
          onClick={() => onNavigate('price_changes')}
          className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between cursor-pointer group"
        >
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Price Changes
            </span>
            <div className="text-2xl font-black text-violet-200 mt-1 font-mono tabular-nums tracking-tight">
              {stats?.priceChangesCount || 0}
            </div>
            <span className="text-[11px] text-rose-400 font-medium group-hover:underline">
              {stats?.priceHikesCount || 0} Rate Hikes Detected →
            </span>
          </div>
          <div className="p-3 bg-violet-500/15 text-violet-400 border border-violet-400/25 rounded-2xl shadow-sm">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* 7. Recent Bills */}
        <div
          onClick={() => onNavigate('agencies')}
          className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between cursor-pointer group"
        >
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Recent Bills
            </span>
            <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">
              {stats?.recentBillsCount || 0} <span className="text-sm font-semibold text-slate-400 font-sans">Bills</span>
            </div>
            <span className="text-[11px] text-sky-400 font-medium group-hover:underline">View all records →</span>
          </div>
          <div className="p-3 bg-blue-500/15 text-blue-400 border border-blue-400/25 rounded-2xl shadow-sm">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* 8. Low Stock Alerts */}
        <div
          onClick={() => onNavigate('medicines')}
          className={`spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between cursor-pointer group ${
            (stats?.lowStockCount || 0) > 0
              ? 'border-amber-500/40 bg-amber-950/20 hover:border-amber-400'
              : ''
          }`}
        >
          <div>
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
              Low Stock Alerts
            </span>
            <div className="text-2xl font-black text-amber-300 mt-1 font-mono tabular-nums tracking-tight">
              {stats?.lowStockCount || 0} <span className="text-sm font-semibold text-slate-400 font-sans">Items</span>
            </div>
            <span className="text-[11px] text-amber-400 font-medium group-hover:underline">
              {(stats?.lowStockCount || 0) > 0 ? 'Under minimum threshold →' : 'Inventory well stocked'}
            </span>
          </div>
          <div className="p-3 bg-amber-500/15 text-amber-400 border border-amber-400/25 rounded-2xl shadow-sm">
            <Pill className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SHARE & EXPORT (Main Dashboard Requirements 1, 2, 11, 12) */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                <Share2 className="w-3 h-3 stroke-[2.5]" />
                Android System Share Sheet
              </span>
              <span className="text-xs text-slate-400">
                • WhatsApp • Email • Drive • Files • Nearby Share
              </span>
            </div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Share2 className="w-5 h-5 text-emerald-400" />
              SHARE &amp; EXPORT
            </h2>
            <p className="text-xs text-slate-400">
              Generate audit-ready pharmacy reports and open the native Android Share Sheet with one tap.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenShare('AGENCY_STATEMENT')}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Open Share Center</span>
            </button>
          </div>
        </div>

        {/* Large, Easy-To-Understand Share & Export Buttons / Cards (Requirements 1 & 12) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {/* 0. Download & Share Android APK / App */}
          {onOpenShareApk && (
            <div
              onClick={onOpenShareApk}
              className="p-4 bg-gradient-to-br from-emerald-950/40 via-slate-950 to-teal-950/30 hover:border-emerald-400 border border-emerald-500/40 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-lg shadow-emerald-500/10"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 bg-emerald-500/20 text-emerald-300 rounded-xl group-hover:scale-105 transition-transform">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase">
                    Android APK
                  </span>
                </div>
                <h3 className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                  <span>Download &amp; Share APK</span>
                </h3>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Download installable Android package or share with staff via WhatsApp, QR Code, or Bluetooth.
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-emerald-500/20 flex items-center justify-between">
                <span className="text-[11px] text-emerald-400 font-bold group-hover:underline">Open APK &amp; Share Center</span>
                <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>
          )}

          {/* 1. Share Agency Statement */}
          <div
            onClick={() => handleOpenShare('AGENCY_STATEMENT')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-emerald-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  PDF
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">
                Share Agency Statement
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Distributor opening due, purchase bills, payments, and running balance.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-emerald-400 font-semibold group-hover:underline">Select Agency &amp; Share</span>
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* 2. Share Outstanding Dues */}
          <div
            onClick={() => handleOpenShare('OUTSTANDING_DUES')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-amber-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl group-hover:scale-105 transition-transform">
                  <IndianRupee className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Ranked
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-amber-300 transition-colors">
                Share Outstanding Dues
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Ranked report with agency, opening due, purchases, payments &amp; current balance.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-amber-400 font-semibold group-hover:underline">Generate &amp; Share</span>
              <Share2 className="w-3.5 h-3.5 text-amber-400" />
            </div>
          </div>

          {/* 3. Share Purchase Records */}
          <div
            onClick={() => handleOpenShare('PURCHASE_RECORDS')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-blue-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl group-hover:scale-105 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  Itemized
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">
                Share Purchase Records
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Date range, agency &amp; medicine filters with bill numbers, PTR rates, and totals.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-blue-400 font-semibold group-hover:underline">Filter &amp; Share</span>
              <Share2 className="w-3.5 h-3.5 text-blue-400" />
            </div>
          </div>

          {/* 4. Share Payment Records */}
          <div
            onClick={() => handleOpenShare('PAYMENT_RECORDS')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-emerald-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:scale-105 transition-transform">
                  <CreditCard className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Vouchers
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">
                Share Payment Records
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Payment vouchers with payment date, agency, amount, reference number &amp; mode.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-emerald-400 font-semibold group-hover:underline">Filter &amp; Share</span>
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          {/* 5. Share Stock Report */}
          <div
            onClick={() => handleOpenShare('STOCK_REPORT')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-purple-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl group-hover:scale-105 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                  Inventory
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">
                Share Stock Report
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Medicine, company, batch, stock quantity, purchase price, MRP, expiry &amp; agency.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-purple-400 font-semibold group-hover:underline">PDF / CSV Share</span>
              <Share2 className="w-3.5 h-3.5 text-purple-400" />
            </div>
          </div>

          {/* 6. Share Expired Stock */}
          <div
            onClick={() => handleOpenShare('EXPIRED_STOCK')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-red-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-red-500/10 text-red-400 rounded-xl group-hover:scale-105 transition-transform">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">
                  Critical
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-red-300 transition-colors">
                Share Expired Stock
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Immediate return report with medicine, batch, quantity, expiry date &amp; agency.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-red-400 font-semibold group-hover:underline">Share with Agency</span>
              <Share2 className="w-3.5 h-3.5 text-red-400" />
            </div>
          </div>

          {/* 7. Share Near-Expiry Stock */}
          <div
            onClick={() => handleOpenShare('NEAR_EXPIRY_STOCK')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-amber-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl group-hover:scale-105 transition-transform">
                  <Clock className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  30 / 60 / 90d
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-amber-300 transition-colors">
                Share Near-Expiry Stock
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Filter by 30, 60 or 90 days with days remaining and distributor details.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-amber-400 font-semibold group-hover:underline">Select Filter &amp; Share</span>
              <Share2 className="w-3.5 h-3.5 text-amber-400" />
            </div>
          </div>

          {/* 8. Share Low-Stock List */}
          <div
            onClick={() => handleOpenShare('LOW_STOCK_LIST')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-rose-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl group-hover:scale-105 transition-transform">
                  <Pill className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  Reorder
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-rose-300 transition-colors">
                Share Low-Stock List
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Medicine, current quantity, minimum required quantity &amp; primary distributor.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-rose-400 font-semibold group-hover:underline">Share Reorder List</span>
              <Share2 className="w-3.5 h-3.5 text-rose-400" />
            </div>
          </div>

          {/* 9. Share Scanned Documents */}
          <div
            onClick={() => handleOpenShare('SCANNED_DOCUMENTS')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-teal-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-teal-500/10 text-teal-400 rounded-xl group-hover:scale-105 transition-transform">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">
                  Files
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-teal-300 transition-colors">
                Share Scanned Documents
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Find scanned purchase bills &amp; payment receipts with View, Share, and Delete.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-teal-400 font-semibold group-hover:underline">Browse &amp; Share Docs</span>
              <Share2 className="w-3.5 h-3.5 text-teal-400" />
            </div>
          </div>

          {/* 10. Export PDF */}
          <div
            onClick={() => handleOpenShare('FULL_PDF')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:scale-105 transition-transform">
                  <Download className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Ledger
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">
                Export PDF
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Comprehensive financial ledger statement with executive KPIs and balances.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-indigo-400 font-semibold group-hover:underline">Export Full PDF</span>
              <Download className="w-3.5 h-3.5 text-indigo-400" />
            </div>
          </div>

          {/* 11. Export CSV */}
          <div
            onClick={() => handleOpenShare('FULL_CSV')}
            className="p-4 bg-slate-950 hover:bg-slate-850/80 border border-slate-800 hover:border-cyan-500/50 rounded-2xl transition-all cursor-pointer flex flex-col justify-between group shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Spreadsheet
                </span>
              </div>
              <h3 className="font-bold text-white text-sm group-hover:text-cyan-300 transition-colors">
                Export CSV
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Export raw tabular data for Microsoft Excel, Google Sheets, or accountant software.
              </p>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-[11px] text-cyan-400 font-semibold group-hover:underline">Export Full CSV</span>
              <Download className="w-3.5 h-3.5 text-cyan-400" />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* AGENCY VISITS & PAYMENT SCHEDULE TRACKER (Requirements 5, 6, 8, 10, 12) */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Learned Recurrence Tracker
              </span>
              <span className="text-xs text-slate-400">
                • Today: <strong>{formatScheduleDate(getAppTodayDate())}</strong>
              </span>
            </div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-400" />
              AGENCY VISITS &amp; PAYMENT SCHEDULE
            </h2>
            <p className="text-xs text-slate-400">
              Recurring distributor visit predictions learned from historical purchase bills &amp; payment receipts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('schedule')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 font-bold text-xs rounded-xl border border-teal-500/30 flex items-center gap-1.5 transition-colors"
            >
              <span>Full Schedule Tracker</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3-COLUMN OVERVIEW: TODAY / TOMORROW / DAY AFTER TOMORROW (Requirement 5) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Column 1: TODAY */}
          <div className="p-4 bg-slate-950/70 border border-emerald-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-black tracking-wider uppercase text-emerald-400">
                  TODAY
                </span>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                {groupedVisits.today.length} Expected
              </span>
            </div>

            {groupedVisits.today.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs">
                No agencies expected today.
              </div>
            ) : (
              <div className="space-y-2.5">
                {groupedVisits.today.map((s) => (
                  <div
                    key={s.agencyId}
                    className="p-3 bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-xl space-y-1.5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs hover:text-emerald-300 cursor-pointer" onClick={() => onSelectAgency(s.agencyId)}>
                        {s.agencyName}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {s.confidence}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Expected Visit:</span>
                      <span className="font-semibold text-emerald-300">Today</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Outstanding Balance:</span>
                      <span className="font-mono font-bold text-white">
                        ₹{s.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="pt-1 flex items-center justify-between border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-500">
                        Typical: ~{s.typicalIntervalDays ?? 'N/A'} days
                      </span>
                      <button
                        onClick={() => setEditingSchedule(s)}
                        className="text-[10px] text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: TOMORROW */}
          <div className="p-4 bg-slate-950/70 border border-teal-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                <span className="text-xs font-black tracking-wider uppercase text-teal-400">
                  TOMORROW
                </span>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300">
                {groupedVisits.tomorrow.length} Expected
              </span>
            </div>

            {groupedVisits.tomorrow.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs">
                No agencies expected tomorrow.
              </div>
            ) : (
              <div className="space-y-2.5">
                {groupedVisits.tomorrow.map((s) => (
                  <div
                    key={s.agencyId}
                    className="p-3 bg-slate-900 border border-slate-800 hover:border-teal-500/40 rounded-xl space-y-1.5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs hover:text-teal-300 cursor-pointer" onClick={() => onSelectAgency(s.agencyId)}>
                        {s.agencyName}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        {s.confidence}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Expected Visit:</span>
                      <span className="font-semibold text-teal-300">Tomorrow</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Outstanding Balance:</span>
                      <span className="font-mono font-bold text-white">
                        ₹{s.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="pt-1 flex items-center justify-between border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-500">
                        Typical: ~{s.typicalIntervalDays ?? 'N/A'} days
                      </span>
                      <button
                        onClick={() => setEditingSchedule(s)}
                        className="text-[10px] text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 3: DAY AFTER TOMORROW */}
          <div className="p-4 bg-slate-950/70 border border-blue-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                <span className="text-xs font-black tracking-wider uppercase text-blue-400">
                  DAY AFTER TOMORROW
                </span>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                {groupedVisits.dayAfterTomorrow.length} Expected
              </span>
            </div>

            {groupedVisits.dayAfterTomorrow.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs">
                No agencies expected day after tomorrow.
              </div>
            ) : (
              <div className="space-y-2.5">
                {groupedVisits.dayAfterTomorrow.map((s) => (
                  <div
                    key={s.agencyId}
                    className="p-3 bg-slate-900 border border-slate-800 hover:border-blue-500/40 rounded-xl space-y-1.5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs hover:text-blue-300 cursor-pointer" onClick={() => onSelectAgency(s.agencyId)}>
                        {s.agencyName}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {s.confidence}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Expected Visit:</span>
                      <span className="font-semibold text-blue-300">Day After Tomorrow</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Outstanding Balance:</span>
                      <span className="font-mono font-bold text-white">
                        ₹{s.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="pt-1 flex items-center justify-between border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-500">
                        Typical: ~{s.typicalIntervalDays ?? 'N/A'} days
                      </span>
                      <button
                        onClick={() => setEditingSchedule(s)}
                        className="text-[10px] text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* INTERACTIVE FILTER TABS & PAYMENT PLANNING CARDS (Requirements 5 & 6) */}
        <div className="space-y-4 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setVisitTab('TODAY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  visitTab === 'TODAY'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Today ({groupedVisits.today.length})
              </button>
              <button
                onClick={() => setVisitTab('TOMORROW')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  visitTab === 'TOMORROW'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tomorrow ({groupedVisits.tomorrow.length})
              </button>
              <button
                onClick={() => setVisitTab('DAY_AFTER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  visitTab === 'DAY_AFTER'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Day After Tomorrow ({groupedVisits.dayAfterTomorrow.length})
              </button>
              <button
                onClick={() => setVisitTab('NEXT_7_DAYS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  visitTab === 'NEXT_7_DAYS'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Next 7 Days ({groupedVisits.next7Days.length})
              </button>
              <button
                onClick={() => setVisitTab('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  visitTab === 'ALL'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Upcoming ({groupedVisits.allUpcoming.length})
              </button>
            </div>

            {/* Upcoming Payments Total Indicator (Requirement 12) */}
            <div className="px-3.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-2 text-xs">
              <Wallet className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-slate-400">Expected Outstanding (Soon):</span>
              <span className="font-mono font-bold text-white">
                ₹{groupedVisits.totalOutstandingSoon.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Cards for active visitTab (Requirement 6 Payment Planning) */}
          {(() => {
            const list =
              visitTab === 'TODAY'
                ? groupedVisits.today
                : visitTab === 'TOMORROW'
                ? groupedVisits.tomorrow
                : visitTab === 'DAY_AFTER'
                ? groupedVisits.dayAfterTomorrow
                : visitTab === 'NEXT_7_DAYS'
                ? groupedVisits.next7Days
                : groupedVisits.allUpcoming;

            if (list.length === 0) {
              return (
                <div className="p-8 text-center bg-slate-950/50 rounded-2xl border border-slate-800/60 text-slate-500 text-xs">
                  No agencies in this upcoming schedule window.
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((s) => (
                  <div
                    key={s.agencyId}
                    className="p-4 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl space-y-3 transition-colors flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4
                            onClick={() => onSelectAgency(s.agencyId)}
                            className="font-bold text-white text-sm hover:text-teal-300 cursor-pointer transition-colors"
                          >
                            {s.agencyName}
                          </h4>
                          <span
                            className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              s.statusLabel === 'Expected Today'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : s.statusLabel === 'Expected Tomorrow'
                                ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                                : s.statusLabel === 'Expected in 2 Days'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : s.statusLabel === 'Schedule Irregular'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : s.statusLabel === 'Manually Set'
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {s.statusLabel}
                          </span>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                            s.confidence === 'HIGH'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : s.confidence === 'MEDIUM'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          Confidence: {s.confidence}
                        </span>
                      </div>

                      {/* Payment Planning Fields (Requirement 6) */}
                      <div className="space-y-1.5 text-xs bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Expected Visit:</span>
                          <span className="font-semibold text-white">
                            {formatScheduleDate(s.nextExpectedDate)}
                            {s.daysUntilNextVisit === 0
                              ? ' (Today)'
                              : s.daysUntilNextVisit === 1
                              ? ' (Tomorrow)'
                              : s.daysUntilNextVisit === 2
                              ? ' (In 2 days)'
                              : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Outstanding:</span>
                          <span className="font-mono font-bold text-emerald-400">
                            ₹{s.outstandingBalance.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Last Payment:</span>
                          <span className="text-slate-300 font-medium">
                            {formatScheduleDate(s.lastPaymentDate)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Last Purchase:</span>
                          <span className="text-slate-300 font-medium">
                            {formatScheduleDate(s.lastPurchaseDate)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Typical Visit:</span>
                          <span className="text-slate-300 font-medium">
                            {s.typicalIntervalDays ? `${s.typicalIntervalDays} days` : 'Not enough data'}
                          </span>
                        </div>
                      </div>

                      {/* Estimation Note (Requirement 7) */}
                      {!s.isManualOverride && s.typicalIntervalDays && (
                        <p className="text-[10px] text-slate-500 italic flex items-center gap-1">
                          <Info className="w-3 h-3 text-slate-500 shrink-0" />
                          Visit date estimated from historical activity
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        onClick={() => onSelectAgency(s.agencyId)}
                        className="text-xs text-slate-400 hover:text-white font-medium flex items-center gap-1 transition-colors"
                      >
                        Account Ledger <ArrowRight className="w-3 h-3" />
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenShare('AGENCY_STATEMENT', s.agencyId)}
                          className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-semibold text-xs rounded-lg border border-emerald-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Share Statement via Android Share Sheet"
                        >
                          <Share2 className="w-3 h-3 text-emerald-400" />
                          <span>Share</span>
                        </button>
                        <button
                          onClick={() => setEditingSchedule(s)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold text-xs rounded-lg border border-slate-700 flex items-center gap-1 transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* UPCOMING AGENCY PAYMENTS ACCORDION / SUMMARY (Requirement 12) */}
        <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-white text-xs uppercase tracking-wider">
                Upcoming Agency Payments Planning
              </h3>
            </div>
            <div className="text-xs text-slate-400">
              Expected Outstanding for Upcoming Visits:{' '}
              <strong className="text-emerald-400 font-mono text-sm">
                ₹{groupedVisits.totalOutstandingSoon.toLocaleString('en-IN')}
              </strong>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Ordered by expected arrival date so pharmacy management can plan cash, cheques, and bank transfers before suppliers arrive. (Reminder only — does not execute payment).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            {/* TODAY */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                TODAY
              </span>
              {groupedVisits.today.length === 0 ? (
                <span className="text-slate-500 text-[11px]">None expected</span>
              ) : (
                <ol className="space-y-1 list-decimal list-inside text-slate-300 font-medium">
                  {groupedVisits.today.map((s, idx) => (
                    <li key={s.agencyId} className="truncate">
                      <span>{s.agencyName}</span> —{' '}
                      <span className="font-mono text-white font-bold">
                        ₹{s.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* TOMORROW */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider block">
                TOMORROW
              </span>
              {groupedVisits.tomorrow.length === 0 ? (
                <span className="text-slate-500 text-[11px]">None expected</span>
              ) : (
                <ol className="space-y-1 list-decimal list-inside text-slate-300 font-medium">
                  {groupedVisits.tomorrow.map((s, idx) => (
                    <li key={s.agencyId} className="truncate">
                      <span>{s.agencyName}</span> —{' '}
                      <span className="font-mono text-white font-bold">
                        ₹{s.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* DAY AFTER TOMORROW */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">
                DAY AFTER TOMORROW
              </span>
              {groupedVisits.dayAfterTomorrow.length === 0 ? (
                <span className="text-slate-500 text-[11px]">None expected</span>
              ) : (
                <ol className="space-y-1 list-decimal list-inside text-slate-300 font-medium">
                  {groupedVisits.dayAfterTomorrow.map((s, idx) => (
                    <li key={s.agencyId} className="truncate">
                      <span>{s.agencyName}</span> —{' '}
                      <span className="font-mono text-white font-bold">
                        ₹{s.outstandingBalance.toLocaleString('en-IN')}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Recent Bills & Payments (Left) & Agency Balances (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Purchase Invoices & Payments */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivityTab('BILLS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activityTab === 'BILLS'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Recent Invoices ({recentInvoices.length})</span>
              </button>
              <button
                onClick={() => setActivityTab('PAYMENTS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activityTab === 'PAYMENTS'
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Recent Payments ({recentPayments.length})</span>
              </button>
            </div>

            <button
              onClick={() => onNavigate('agencies')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
            >
              View Full Ledgers <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {activityTab === 'BILLS' ? (
              recentInvoices.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No invoices recorded yet. Click "SCAN BILL" to begin.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {recentInvoices.slice(0, 5).map((inv) => (
                    <div
                      key={inv.id}
                      className="p-4 hover:bg-slate-850/60 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">
                            #{inv.invoiceNumber}
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
                        <div className="text-xs font-semibold text-emerald-400 truncate">
                          {inv.agencyName}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="font-bold text-white text-sm font-mono">
                            ₹{inv.invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Due: ₹{inv.balanceAmount.toLocaleString('en-IN')}
                          </div>
                        </div>

                        {/* Individual Record Actions: [ View ] [ Share ] (Requirement 11) */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenBill(inv)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                            title="View Document"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>View</span>
                          </button>

                          <button
                            onClick={() => handleShareIndividualInvoice(inv)}
                            disabled={sharingInvoiceId === inv.id}
                            className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 rounded-lg text-xs font-semibold border border-emerald-500/30 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                            title="Share Bill via Android Share Sheet"
                          >
                            {sharingInvoiceId === inv.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            <span>Share</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              recentPayments.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No payment vouchers recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {recentPayments.map((pay) => (
                    <div
                      key={pay.id}
                      className="p-4 hover:bg-slate-850/60 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">
                            ₹{pay.amount.toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs text-slate-400">({pay.paymentDate})</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                            {pay.paymentMethod}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-teal-400 truncate">
                          {pay.agencyName} {pay.referenceNumber ? `• Ref: #${pay.referenceNumber}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleOpenShare('PAYMENT_RECORDS', pay.agencyId)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                          title="View Payment Register"
                        >
                          <Eye className="w-3.5 h-3.5 text-teal-400" />
                          <span>View</span>
                        </button>

                        <button
                          onClick={() => handleShareIndividualPayment(pay)}
                          disabled={sharingPaymentId === pay.id}
                          className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 rounded-lg text-xs font-semibold border border-emerald-500/30 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title="Share Voucher via Android Share Sheet"
                        >
                          {sharingPaymentId === pay.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                          <span>Share</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right 1 Col: Top Agency Balances */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              Distributor Accounts
            </h2>
            <button
              onClick={() => onNavigate('agencies')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
            >
              All Agencies <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl divide-y divide-slate-800/80">
            {topAgenciesByBalance.map((item) => (
              <div
                key={item.agency.id}
                className="p-4 hover:bg-slate-850/60 transition-colors space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <h3
                    onClick={() => onSelectAgency(item.agency.id)}
                    className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    {item.agency.name}
                  </h3>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg ${
                      item.outstandingBalance > 0
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/80'
                        : 'bg-emerald-950/40 text-emerald-400'
                    }`}
                  >
                    ₹{item.outstandingBalance.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Purchases: ₹{item.totalPurchase.toLocaleString('en-IN')}</span>
                  <span className="text-emerald-400 font-medium">Paid: ₹{item.totalPaid.toLocaleString('en-IN')}</span>
                </div>

                {/* Individual Agency Actions: [ View ] [ Share ] (Requirement 11) */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800/60">
                  <button
                    onClick={() => onSelectAgency(item.agency.id)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                    title="View Distributor Ledger"
                  >
                    <Eye className="w-3 h-3 text-emerald-400" />
                    <span>View</span>
                  </button>
                  <button
                    onClick={() => handleOpenShare('AGENCY_STATEMENT', item.agency.id)}
                    className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold rounded-lg border border-emerald-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Share Agency Statement via Android Share Sheet"
                  >
                    <Share2 className="w-3 h-3 text-emerald-400" />
                    <span>Share</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bill Viewer Modal */}
      <OriginalBillViewer
        images={selectedBillImages}
        originalImages={selectedBillOriginalImages}
        processedImages={selectedBillProcessedImages}
        invoice={selectedInvoice}
        title={viewerTitle}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
      />

      {/* Edit Schedule Modal (Requirement 8) */}
      <EditScheduleModal
        isOpen={!!editingSchedule}
        schedule={editingSchedule}
        onClose={() => setEditingSchedule(null)}
        onSaved={loadSchedules}
      />

      {/* Add Previous Due Modal (Requirement 6) */}
      <AddPreviousDueModal
        isOpen={showPreviousDueModal}
        onClose={() => setShowPreviousDueModal(false)}
        onSaved={async () => {
          setShowPreviousDueModal(false);
          await loadSchedules();
        }}
      />

      {/* Dashboard Share & Export Center Modal (Requirements 1 - 10) */}
      <DashboardShareModal
        isOpen={isShareModalOpen}
        initialType={shareModalType}
        initialAgencyId={shareModalAgencyId}
        onClose={() => setIsShareModalOpen(false)}
        onRefreshData={loadSchedules}
        onViewInvoice={(inv) => handleOpenBill(inv)}
      />
    </div>
  );
};
