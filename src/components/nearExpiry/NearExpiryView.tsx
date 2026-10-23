import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  Search,
  Building2,
  Calendar,
  FileText,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  X,
  FileSpreadsheet,
  Share2,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { Invoice, InvoiceItem, ExpiryCategory } from '../../types/pharmacy';
import { getInvoiceById, getInvoiceItems } from '../../db/indexedDb';
import {
  calculateDaysRemaining,
  categorizeExpiryItem,
  formatDaysRemainingText,
} from '../../services/expiryService';
import { generateExpiryStockReportText, shareTextContent } from '../../services/shareService';
import { OriginalBillViewer } from '../common/OriginalBillViewer';

interface NearExpiryViewProps {
  onSelectAgency?: (agencyId: string) => void;
}

export const NearExpiryView: React.FC<NearExpiryViewProps> = ({ onSelectAgency }) => {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<ExpiryCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<InvoiceItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Source Bill Viewer
  const [selectedInvoiceForBill, setSelectedInvoiceForBill] = useState<Invoice | null>(null);
  const [isBillViewerOpen, setIsBillViewerOpen] = useState(false);

  // Share Feedback
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const handleOpenSourceBill = async (it: InvoiceItem) => {
    const invId = it.sourceInvoiceId || it.invoiceId;
    let inv: Invoice | null = null;
    if (invId) {
      inv = await getInvoiceById(invId);
    }
    if (inv && (inv.images?.length || inv.originalImages?.length)) {
      setSelectedInvoiceForBill(inv);
      setIsBillViewerOpen(true);
    } else if (it.sourceDocumentImages && it.sourceDocumentImages.length > 0) {
      setSelectedInvoiceForBill({
        id: invId || `inv-${Date.now()}`,
        agencyId: it.agencyId,
        agencyName: it.agencyName,
        invoiceNumber: it.invoiceNumber,
        invoiceDate: it.invoiceDate,
        invoiceTotal: it.lineTotal,
        taxableAmount: 0,
        gstAmount: 0,
        discountAmount: 0,
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: it.lineTotal,
        images: it.sourceDocumentImages,
        originalImages: it.sourceDocumentImages,
        itemsCount: 1,
        createdAt: '',
        updatedAt: '',
      });
      setIsBillViewerOpen(true);
    } else {
      alert(`No physical bill image is attached to Invoice #${it.invoiceNumber}.`);
    }
  };

  const handleShareExpiryReport = async (filter: 'all' | 'critical' | 'current' = 'critical') => {
    let targetItems: InvoiceItem[] = [];
    let title = 'Expiry Stock Report';

    if (filter === 'critical') {
      targetItems = categorizedItems
        .filter((c) => c.category === 'EXPIRED' || c.category === '0_30')
        .map((c) => c.item);
      title = 'URGENT: Expired & Short-Dated Stock (<= 30 Days)';
    } else if (filter === 'current') {
      targetItems = filteredItems.map((c) => c.item);
      title = `Filtered Stock Report (${activeCategory})`;
    } else {
      targetItems = categorizedItems
        .filter((c) => c.category !== 'SAFE')
        .map((c) => c.item);
      title = 'Comprehensive Near-Expiry Stock Audit';
    }

    if (targetItems.length === 0) {
      alert('No items to share under selected criteria.');
      return;
    }

    const reportText = generateExpiryStockReportText(targetItems, title);
    const shared = await shareTextContent(title, reportText);
    if (shared) {
      setShareNotice('Report shared to Android Share Sheet / Clipboard!');
      setTimeout(() => setShareNotice(null), 3000);
    }
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const allItems = await getInvoiceItems();
      setItems(allItems);
      setLoading(false);
    }
    loadData();
  }, []);

  const categorizedItems = items.map(categorizeExpiryItem);

  // Group counters
  const expiredList = categorizedItems.filter((i) => i.category === 'EXPIRED');
  const group0_30 = categorizedItems.filter((i) => i.category === '0_30');
  const group31_60 = categorizedItems.filter((i) => i.category === '31_60');
  const group61_90 = categorizedItems.filter((i) => i.category === '61_90');
  const group91_180 = categorizedItems.filter((i) => i.category === '91_180');
  const safeList = categorizedItems.filter((i) => i.category === 'SAFE');

  const filteredItems = categorizedItems
    .filter((entry) => {
      if (activeCategory !== 'ALL' && entry.category !== activeCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          entry.item.productName.toLowerCase().includes(q) ||
          entry.item.batchNumber.toLowerCase().includes(q) ||
          entry.item.agencyName.toLowerCase().includes(q) ||
          entry.item.invoiceNumber.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Near-Expiry & Expired Medicine Management
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
              {categorizedItems.length} Monitored Batches
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            Categorized by remaining shelf-life. Every batch is tied to its originating distributor for timely credit note claims.
          </p>
        </div>
      </div>

      {/* Automatic High-Priority Alert Banners (Requirement 13) */}
      {(expiredList.length > 0 || group0_30.length > 0) && (
        <div className="space-y-2">
          {expiredList.length > 0 && (
            <div className="p-3.5 bg-red-950/40 border border-red-800/80 rounded-xl flex items-center gap-3 text-red-200 text-xs">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <strong>CRITICAL: {expiredList.length} product batch(es) have EXPIRED!</strong> Remove from dispensary shelves immediately.
              </div>
            </div>
          )}

          {group0_30.length > 0 && (
            <div className="p-3.5 bg-amber-950/40 border border-amber-700/80 rounded-xl flex items-center gap-3 text-amber-200 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <strong>WARNING: {group0_30.length} product(s) expire within 30 days!</strong> Contact respective distributor reps to process return notes.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grouping Cards (Requirement 12) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Expired */}
        <button
          onClick={() => setActiveCategory('EXPIRED')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer backdrop-blur-md ${
            activeCategory === 'EXPIRED'
              ? 'bg-red-950/80 border-red-500 shadow-md ring-2 ring-red-500/20'
              : 'bg-slate-900/80 border-slate-800 hover:border-red-500/40 hover:bg-slate-850/80'
          }`}
        >
          <div className="text-[11px] font-bold text-red-400 uppercase tracking-wide">Expired</div>
          <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">{expiredList.length}</div>
          <span className="text-[10px] text-red-400/80">&lt; 0 Days Left</span>
        </button>

        {/* 0-30 Days */}
        <button
          onClick={() => setActiveCategory('0_30')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer backdrop-blur-md ${
            activeCategory === '0_30'
              ? 'bg-amber-950/80 border-amber-500 shadow-md ring-2 ring-amber-500/20'
              : 'bg-slate-900/80 border-slate-800 hover:border-amber-500/40 hover:bg-slate-850/80'
          }`}
        >
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">0–30 Days</div>
          <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">{group0_30.length}</div>
          <span className="text-[10px] text-amber-400/80">Critical Attention</span>
        </button>

        {/* 31-60 Days */}
        <button
          onClick={() => setActiveCategory('31_60')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer backdrop-blur-md ${
            activeCategory === '31_60'
              ? 'bg-yellow-950/80 border-yellow-500 shadow-md ring-2 ring-yellow-500/20'
              : 'bg-slate-900/80 border-slate-800 hover:border-yellow-500/40 hover:bg-slate-850/80'
          }`}
        >
          <div className="text-[11px] font-bold text-yellow-400 uppercase tracking-wide">31–60 Days</div>
          <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">{group31_60.length}</div>
          <span className="text-[10px] text-yellow-400/80">Prepare Return</span>
        </button>

        {/* 61-90 Days */}
        <button
          onClick={() => setActiveCategory('61_90')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer backdrop-blur-md ${
            activeCategory === '61_90'
              ? 'bg-blue-950/80 border-blue-500 shadow-md ring-2 ring-blue-500/20'
              : 'bg-slate-900/80 border-slate-800 hover:border-blue-500/40 hover:bg-slate-850/80'
          }`}
        >
          <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wide">61–90 Days</div>
          <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">{group61_90.length}</div>
          <span className="text-[10px] text-blue-400/80">Notice Window</span>
        </button>

        {/* 91-180 Days */}
        <button
          onClick={() => setActiveCategory('91_180')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer backdrop-blur-md ${
            activeCategory === '91_180'
              ? 'bg-indigo-950/80 border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
              : 'bg-slate-900/80 border-slate-800 hover:border-indigo-500/40 hover:bg-slate-850/80'
          }`}
        >
          <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide">91–180 Days</div>
          <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">{group91_180.length}</div>
          <span className="text-[10px] text-indigo-400/80">3–6 Months</span>
        </button>

        {/* Safe (> 180 Days) */}
        <button
          onClick={() => setActiveCategory('SAFE')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer backdrop-blur-md ${
            activeCategory === 'SAFE'
              ? 'bg-emerald-950/80 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-slate-900/80 border-slate-800 hover:border-emerald-500/40 hover:bg-slate-850/80'
          }`}
        >
          <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">Safe (&gt;180d)</div>
          <div className="text-2xl font-black text-emerald-400 mt-1 font-mono tabular-nums tracking-tight">{safeList.length}</div>
          <span className="text-[10px] text-emerald-500">Normal Stock</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search medicine, batch, distributor, or invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {activeCategory !== 'ALL' && (
            <button
              onClick={() => setActiveCategory('ALL')}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
            >
              Clear Filter (Show All {categorizedItems.length})
            </button>
          )}
        </div>
      </div>

      {/* Near Expiry List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
              <th className="py-3.5 px-6">Medicine Description</th>
              <th className="py-3.5 px-4">Batch #</th>
              <th className="py-3.5 px-4">Expiry Date</th>
              <th className="py-3.5 px-4">Shelf-Life Status</th>
              <th className="py-3.5 px-4 text-right">Stock Qty</th>
              <th className="py-3.5 px-6">Supplied by (Agency)</th>
              <th className="py-3.5 px-4 text-center">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                  No medicines found matching selected filter.
                </td>
              </tr>
            ) : (
              filteredItems.map(({ item, category, daysRemaining }) => {
                const isExpired = category === 'EXPIRED';
                const isUrgent = category === '0_30';
                return (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                  >
                    {/* Medicine Name */}
                    <td className="py-3 px-6">
                      <div className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">
                        {item.productName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        MRP: ₹{item.mrp.toFixed(2)} • Rate: ₹{item.purchaseRate.toFixed(2)}
                      </div>
                    </td>

                    {/* Batch */}
                    <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                      {item.batchNumber}
                    </td>

                    {/* Expiry */}
                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {item.expiryDate}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                          isExpired
                            ? 'bg-red-950 text-red-300 border-red-800'
                            : isUrgent
                            ? 'bg-amber-950 text-amber-300 border-amber-800'
                            : category === '31_60'
                            ? 'bg-yellow-950 text-yellow-300 border-yellow-800'
                            : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                        }`}
                      >
                        <Clock className="w-2.5 h-2.5" />
                        {formatDaysRemainingText(daysRemaining)}
                      </span>
                    </td>

                    {/* Stock Qty */}
                    <td className="py-3 px-4 text-right font-bold text-white">
                      {item.quantity} {item.freeQuantity > 0 ? `(+${item.freeQuantity} free)` : ''}
                    </td>

                    {/* Supplying Agency Link */}
                    <td className="py-3 px-6 text-slate-300">
                      <div className="flex items-center gap-1 font-semibold group-hover:text-emerald-300">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate max-w-[200px]">{item.agencyName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Inv #{item.invoiceNumber} ({item.invoiceDate})
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItem(item);
                        }}
                        className="text-xs text-slate-400 group-hover:text-emerald-400 font-medium"
                      >
                        Details →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Item Detail Modal (Requirement 12) */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-white font-bold text-base">{selectedItem.productName}</h3>
                <p className="text-xs text-slate-400">Batch & Expiry Traceability Record</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">Batch Number</span>
                  <strong className="text-white font-mono text-sm">{selectedItem.batchNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Expiry Date</span>
                  <strong className="text-amber-400 font-mono text-sm">{selectedItem.expiryDate}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Purchased Quantity</span>
                  <strong className="text-white text-sm">{selectedItem.quantity} Packs</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Purchase Rate</span>
                  <strong className="text-white text-sm">₹{selectedItem.purchaseRate.toFixed(2)}</strong>
                </div>
              </div>

              {/* Agency Linkage (Requirement 14) */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                  Supplied by Agency
                </div>
                <div className="text-sm font-bold text-emerald-400">{selectedItem.agencyName}</div>
                <div className="text-slate-400">
                  Invoice Number: <strong className="text-slate-200 font-mono">#{selectedItem.invoiceNumber}</strong>
                </div>
                <div className="text-slate-400">
                  Purchase Date: <strong className="text-slate-200">{selectedItem.invoiceDate}</strong>
                </div>
              </div>

              <div className="p-3 bg-blue-950/30 border border-blue-800/40 rounded-xl text-blue-300 text-xs">
                To claim credit for expired or short-dated medicines, contact the supplier representative before the final return cutoff date.
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
              {onSelectAgency && (
                <button
                  onClick={() => {
                    onSelectAgency(selectedItem.agencyId);
                    setSelectedItem(null);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold text-xs flex items-center gap-1"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  Open Supplier Account
                </button>
              )}
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
