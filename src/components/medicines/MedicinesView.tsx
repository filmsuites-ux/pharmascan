import React, { useState, useEffect } from 'react';
import {
  Pill,
  Search,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Clock,
  Building2,
  Calendar,
  IndianRupee,
  Layers,
  Sparkles,
  Eye,
  FileText,
} from 'lucide-react';
import { Invoice, InvoiceItem } from '../../types/pharmacy';
import {
  getInvoiceById,
  getInvoiceItems,
  getMedicineMinStockConfig,
  setMedicineMinStock,
} from '../../db/indexedDb';
import { normalizeMedicineName } from '../../services/pricingService';
import { OriginalBillViewer } from '../common/OriginalBillViewer';
import { AlertTriangle, Sliders, Check } from 'lucide-react';

interface GroupedMedicineSummary {
  normalizedName: string;
  displayName: string;
  productCode?: string;
  totalPurchasedQty: number;
  latestRate: number;
  previousRate?: number;
  highestRate: number;
  lowestRate: number;
  latestInvoiceDate: string;
  latestAgencyName: string;
  history: InvoiceItem[];
}

interface MedicinesViewProps {
  onNavigate?: (view: string) => void;
}

export const MedicinesView: React.FC<MedicinesViewProps> = ({ onNavigate }) => {
  const [medicines, setMedicines] = useState<GroupedMedicineSummary[]>([]);
  const [minStockConfig, setMinStockConfig] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'LOW_STOCK'>('ALL');
  const [selectedMedicine, setSelectedMedicine] = useState<GroupedMedicineSummary | null>(null);
  const [editingMinStock, setEditingMinStock] = useState<{ name: string; val: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Pharmacy Inspection Use Case: Source Bill Viewer
  const [selectedInvoiceForBill, setSelectedInvoiceForBill] = useState<Invoice | null>(null);
  const [isBillViewerOpen, setIsBillViewerOpen] = useState(false);

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

  useEffect(() => {
    async function loadMedicines() {
      setLoading(true);
      const allItems = await getInvoiceItems();

      // Group by normalized medicine name
      const map = new Map<string, InvoiceItem[]>();
      allItems.forEach((it) => {
        const norm = it.normalizedName || normalizeMedicineName(it.productName);
        if (!map.has(norm)) {
          map.set(norm, []);
        }
        map.get(norm)!.push(it);
      });

      const grouped: GroupedMedicineSummary[] = [];

      map.forEach((items, norm) => {
        // Sort chronologically descending
        items.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

        const rates = items.map((i) => i.purchaseRate).filter((r) => r > 0);
        const latestRate = items[0]?.purchaseRate || 0;
        const previousRate = items.length > 1 ? items[1]?.purchaseRate : undefined;
        const highestRate = rates.length > 0 ? Math.max(...rates) : latestRate;
        const lowestRate = rates.length > 0 ? Math.min(...rates) : latestRate;
        const totalPurchasedQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);

        grouped.push({
          normalizedName: norm,
          displayName: items[0]?.productName || norm,
          productCode: items[0]?.productCode,
          totalPurchasedQty,
          latestRate,
          previousRate,
          highestRate,
          lowestRate,
          latestInvoiceDate: items[0]?.invoiceDate || '',
          latestAgencyName: items[0]?.agencyName || '',
          history: items,
        });
      });

      // Sort alphabetically
      grouped.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setMedicines(grouped);
      setMinStockConfig(getMedicineMinStockConfig());
      setLoading(false);
    }

    loadMedicines();
  }, []);

  const handleSaveMinStock = (normalizedName: string, val: number) => {
    setMedicineMinStock(normalizedName, val);
    setMinStockConfig((prev) => ({ ...prev, [normalizedName]: val }));
    setEditingMinStock(null);
  };

  const lowStockCount = medicines.filter((m) => {
    const minThreshold = minStockConfig[m.normalizedName] ?? 10;
    return m.totalPurchasedQty <= minThreshold;
  }).length;

  const filtered = medicines.filter((m) => {
    const minThreshold = minStockConfig[m.normalizedName] ?? 10;
    const isLow = m.totalPurchasedQty <= minThreshold;
    if (filterType === 'LOW_STOCK' && !isLow) {
      return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.displayName.toLowerCase().includes(q) ||
      m.normalizedName.toLowerCase().includes(q) ||
      (m.productCode && m.productCode.toLowerCase().includes(q)) ||
      m.latestAgencyName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Medicine Catalog &amp; Purchase Rate History
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
              {medicines.length} Products
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            Track purchase price evolution, highest vs lowest rates, and supplier history for every medicine.
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('orders')}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
          >
            <Pill className="w-4 h-4 stroke-[2.5]" />
            <span>+ Create Smart Order</span>
          </button>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterType === 'ALL'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-850'
            }`}
          >
            All Medicines ({medicines.length})
          </button>
          <button
            onClick={() => setFilterType('LOW_STOCK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              filterType === 'LOW_STOCK'
                ? 'bg-amber-950/40 text-amber-300 border border-amber-500/50'
                : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-950/20'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Stock ({lowStockCount})
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search medicine name, HSN code, or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* Main Grid: Medicine Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((med) => {
          const hasRateChange = med.previousRate && med.previousRate !== med.latestRate;
          const isIncreased = hasRateChange && med.latestRate > (med.previousRate || 0);
          const minThreshold = minStockConfig[med.normalizedName] ?? 10;
          const isLowStock = med.totalPurchasedQty <= minThreshold;

          return (
            <div
              key={med.normalizedName}
              onClick={() => setSelectedMedicine(med)}
              className={`p-5 bg-slate-900 hover:bg-slate-850 border rounded-2xl cursor-pointer transition-all shadow-md space-y-4 group flex flex-col justify-between ${
                isLowStock
                  ? 'border-amber-500/40 hover:border-amber-400 bg-amber-950/10'
                  : 'border-slate-800 hover:border-emerald-500/50'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-white text-base group-hover:text-emerald-300 transition-colors">
                        {med.displayName}
                      </h3>
                      {isLowStock && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Low Stock
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {med.productCode ? `HSN: ${med.productCode}` : 'General Medicine'}
                    </div>
                  </div>

                  <span className="p-2 bg-slate-800 text-slate-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 rounded-xl transition-colors">
                    <Pill className="w-4 h-4" />
                  </span>
                </div>

                {/* Stock Level & Threshold Control (Requirement 17) */}
                <div className="mt-3 p-2.5 bg-slate-950/90 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Total In Stock</span>
                    <strong className={`text-xs font-bold ${isLowStock ? 'text-amber-400' : 'text-slate-200'}`}>
                      {med.totalPurchasedQty} units
                    </strong>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {editingMinStock?.name === med.normalizedName ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={editingMinStock.val}
                          onChange={(e) =>
                            setEditingMinStock({
                              name: med.normalizedName,
                              val: Math.max(0, parseInt(e.target.value) || 0),
                            })
                          }
                          className="w-14 px-1.5 py-0.5 bg-slate-900 border border-slate-700 text-white rounded text-xs outline-none"
                        />
                        <button
                          onClick={() => handleSaveMinStock(med.normalizedName, editingMinStock.val)}
                          className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs"
                          title="Save Min Stock"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          setEditingMinStock({ name: med.normalizedName, val: minThreshold })
                        }
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 text-[10px] flex items-center gap-1 transition-colors"
                        title="Click to adjust minimum alert threshold"
                      >
                        <Sliders className="w-3 h-3 text-teal-400" />
                        <span>Min: {minThreshold}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4 Rate Metrics (Requirement 9) */}
                <div className="grid grid-cols-2 gap-2 mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Latest Rate</span>
                    <strong className="text-sm font-bold text-emerald-400">
                      ₹{med.latestRate.toFixed(2)}
                    </strong>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">Previous Rate</span>
                    <strong className="text-sm font-semibold text-slate-300">
                      {med.previousRate ? `₹${med.previousRate.toFixed(2)}` : 'First Bill'}
                    </strong>
                  </div>

                  <div className="pt-1.5 border-t border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Lowest Rate Ever</span>
                    <span className="font-mono text-emerald-300 text-xs font-semibold">
                      ₹{med.lowestRate.toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-1.5 border-t border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Highest Rate Ever</span>
                    <span className="font-mono text-amber-300 text-xs font-semibold">
                      ₹{med.highestRate.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Meta */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate max-w-[160px]">
                  Last from: <strong className="text-slate-200">{med.latestAgencyName}</strong>
                </span>
                <span className="text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 font-semibold">
                  {med.history.length} Bills →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Purchase Rate History Drawer / Modal */}
      {selectedMedicine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-white font-bold text-base">{selectedMedicine.displayName}</h3>
                <p className="text-xs text-slate-400">
                  Historical Purchase Rate Timeline & Supplier Comparison
                </p>
              </div>
              <button
                onClick={() => setSelectedMedicine(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Quick 4 Stats Summary Banner */}
            <div className="grid grid-cols-4 gap-2 text-center p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <div>
                <div className="text-[10px] text-slate-400">Latest Rate</div>
                <div className="text-sm font-bold text-emerald-400">
                  ₹{selectedMedicine.latestRate.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Previous Rate</div>
                <div className="text-sm font-semibold text-slate-300">
                  {selectedMedicine.previousRate ? `₹${selectedMedicine.previousRate.toFixed(2)}` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Lowest Rate</div>
                <div className="text-sm font-bold text-emerald-300">
                  ₹{selectedMedicine.lowestRate.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">Highest Rate</div>
                <div className="text-sm font-bold text-amber-300">
                  ₹{selectedMedicine.highestRate.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Chronological Rate Timeline */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Purchase History ({selectedMedicine.history.length} Invoices)
              </h4>
              <div className="space-y-2">
                {selectedMedicine.history.map((it, idx) => (
                  <div
                    key={it.id}
                    className="p-3 bg-slate-950 border border-slate-800/90 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>₹{it.purchaseRate.toFixed(2)} per pack</span>
                        {it.discountPercent > 0 && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded">
                            {it.discountPercent}% Disc
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        Supplier: <strong className="text-slate-200">{it.agencyName}</strong> • Inv #{it.invoiceNumber}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenSourceBill(it)}
                        className="mt-2 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        View Source Bill
                      </button>
                    </div>

                    <div className="text-right text-[11px] text-slate-400 space-y-0.5">
                      <div>Date: <strong className="text-slate-200">{it.invoiceDate}</strong></div>
                      <div>Batch: <span className="font-mono text-slate-300">{it.batchNumber}</span> (Exp: {it.expiryDate})</div>
                      <div>Qty: <strong>{it.quantity}</strong> {it.freeQuantity > 0 ? `+${it.freeQuantity}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedMedicine(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pharmacy Inspection: Original Source Bill Viewer */}
      {selectedInvoiceForBill && (
        <OriginalBillViewer
          images={selectedInvoiceForBill.images || []}
          originalImages={selectedInvoiceForBill.originalImages}
          processedImages={selectedInvoiceForBill.processedImages}
          invoice={selectedInvoiceForBill}
          title={`Source Document • Invoice #${selectedInvoiceForBill.invoiceNumber} • ${selectedInvoiceForBill.agencyName}`}
          isOpen={isBillViewerOpen}
          onClose={() => {
            setIsBillViewerOpen(false);
            setSelectedInvoiceForBill(null);
          }}
        />
      )}
    </div>
  );
};
