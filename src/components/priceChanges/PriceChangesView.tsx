import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  ArrowRight,
  AlertTriangle,
  Building2,
  Calendar,
  FileText,
  IndianRupee,
  Sparkles,
} from 'lucide-react';
import { InvoiceItem } from '../../types/pharmacy';
import { getInvoiceItems } from '../../db/indexedDb';

export const PriceChangesView: React.FC = () => {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'INCREASE' | 'DECREASE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPriceChanges() {
      setLoading(true);
      const allItems = await getInvoiceItems();
      // Only keep items that have a price change detected (INCREASE or DECREASE)
      const changed = allItems.filter(
        (i) => i.priceChangeType === 'INCREASE' || i.priceChangeType === 'DECREASE'
      );
      setItems(changed);
      setLoading(false);
    }
    loadPriceChanges();
  }, []);

  const filteredItems = items.filter((item) => {
    if (filterType !== 'ALL' && item.priceChangeType !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.productName.toLowerCase().includes(q) ||
        item.agencyName.toLowerCase().includes(q) ||
        item.invoiceNumber.toLowerCase().includes(q) ||
        item.batchNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalHikes = items.filter((i) => i.priceChangeType === 'INCREASE').length;
  const totalDrops = items.filter((i) => i.priceChangeType === 'DECREASE').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Price Change Detection & Alerts
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
              {items.length} Detected
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            Automatically compares current purchase rate (PTR) against previous purchase invoices to safeguard retail margins.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="spatial-stat-card p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Price Changes
            </span>
            <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">{items.length}</div>
            <span className="text-[11px] text-slate-400">Across scanned distributor invoices</span>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="spatial-stat-card p-4 border-red-800/40 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-red-300 uppercase tracking-wider block">
              Price Increases (Margin Alert)
            </span>
            <div className="text-2xl font-black text-red-400 mt-1 font-mono tabular-nums tracking-tight">{totalHikes}</div>
            <span className="text-[11px] text-red-400/80">Higher purchase rate than previous bill</span>
          </div>
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="spatial-stat-card p-4 border-emerald-800/40 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block">
              Price Decreases (Savings)
            </span>
            <div className="text-2xl font-black text-emerald-400 mt-1 font-mono tabular-nums tracking-tight">{totalDrops}</div>
            <span className="text-[11px] text-emerald-400/80">Lower purchase rate than previous bill</span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Controls & Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search medicine name, agency, invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1 rounded-lg transition-colors ${
              filterType === 'ALL'
                ? 'bg-slate-800 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Changes ({items.length})
          </button>

          <button
            onClick={() => setFilterType('INCREASE')}
            className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
              filterType === 'INCREASE'
                ? 'bg-red-950 text-red-300 border border-red-800 font-bold'
                : 'text-slate-400 hover:text-red-300'
            }`}
          >
            <TrendingUp className="w-3 h-3 text-red-400" />
            Increased ({totalHikes})
          </button>

          <button
            onClick={() => setFilterType('DECREASE')}
            className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
              filterType === 'DECREASE'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold'
                : 'text-slate-400 hover:text-emerald-300'
            }`}
          >
            <TrendingDown className="w-3 h-3 text-emerald-400" />
            Decreased ({totalDrops})
          </button>
        </div>
      </div>

      {/* Price Changes Cards */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs space-y-2">
          <Sparkles className="w-8 h-8 text-emerald-400 mx-auto opacity-40" />
          <div className="text-white font-bold text-sm">No Price Changes Found</div>
          <p>
            When subsequent purchase bills are scanned for the same medicines at altered rates, they will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((item) => {
            const isIncrease = item.priceChangeType === 'INCREASE';
            return (
              <div
                key={item.id}
                className={`p-5 rounded-2xl border transition-all shadow-md space-y-3 bg-slate-900 ${
                  isIncrease
                    ? 'border-red-900/50 hover:border-red-600/60'
                    : 'border-emerald-900/50 hover:border-emerald-600/60'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-white font-bold text-base tracking-tight">
                      {item.productName}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span>Batch: <strong className="text-slate-300 font-mono">{item.batchNumber}</strong></span>
                      <span>•</span>
                      <span>MRP: ₹{item.mrp.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Delta Badge */}
                  <div
                    className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 border ${
                      isIncrease
                        ? 'bg-red-950 text-red-300 border-red-800'
                        : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    }`}
                  >
                    {isIncrease ? (
                      <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    {isIncrease ? `+₹${item.priceDiff?.toFixed(2)}` : `-₹${Math.abs(item.priceDiff || 0).toFixed(2)}`}
                    <span>({isIncrease ? `+${item.pricePercentDiff}%` : `${item.pricePercentDiff}%`})</span>
                  </div>
                </div>

                {/* Rate Comparison Box */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Previous Rate</span>
                    <div className="text-base font-bold text-slate-300 line-through">
                      ₹{item.previousRate?.toFixed(2)}
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-600" />

                  <div className="text-right">
                    <span className="text-slate-400 block text-[11px]">New Rate</span>
                    <div
                      className={`text-lg font-black ${
                        isIncrease ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      ₹{item.purchaseRate.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Invoices comparison details */}
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
                  <div className="p-2 bg-slate-950/60 rounded-lg">
                    <span className="font-semibold text-slate-300 block mb-0.5">Previous Purchase:</span>
                    <div>Inv #{item.prevInvoiceNumber || 'N/A'}</div>
                    <div>Date: {item.prevInvoiceDate || 'N/A'}</div>
                    <div className="truncate text-slate-500">{item.prevAgencyName || '-'}</div>
                  </div>

                  <div className="p-2 bg-slate-950/60 rounded-lg">
                    <span className="font-semibold text-slate-300 block mb-0.5">Current Purchase:</span>
                    <div>Inv #{item.invoiceNumber}</div>
                    <div>Date: {item.invoiceDate}</div>
                    <div className="truncate text-emerald-400">{item.agencyName}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
