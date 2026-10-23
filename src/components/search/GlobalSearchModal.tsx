import React, { useState, useEffect } from 'react';
import {
  Search,
  X,
  Pill,
  Building2,
  FileText,
  Calendar,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { Invoice, InvoiceItem } from '../../types/pharmacy';
import { getInvoiceItems, getInvoices } from '../../db/indexedDb';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectInvoice?: (invoice: Invoice) => void;
  onSelectAgency?: (agencyId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectInvoice,
  onSelectAgency,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (isOpen) {
        setLoading(true);
        const [invs, itms] = await Promise.all([getInvoices(), getInvoiceItems()]);
        setInvoices(invs);
        setItems(itms);
        setLoading(false);
      }
    }
    loadData();
  }, [isOpen]);

  if (!isOpen) return null;

  const clean = searchTerm.trim().toLowerCase();

  const matchingItems = clean
    ? items.filter(
        (it) =>
          it.productName.toLowerCase().includes(clean) ||
          it.batchNumber.toLowerCase().includes(clean) ||
          (it.productCode && it.productCode.toLowerCase().includes(clean)) ||
          it.agencyName.toLowerCase().includes(clean) ||
          it.invoiceNumber.toLowerCase().includes(clean)
      )
    : [];

  const matchingInvoices = clean
    ? invoices.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(clean) ||
          inv.agencyName.toLowerCase().includes(clean) ||
          inv.invoiceDate.includes(clean)
      )
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 pt-16 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center gap-3">
          <Search className="w-5 h-5 text-emerald-400 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search by medicine, supplier agency, invoice #, batch, or HSN code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-slate-500 font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!clean ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Type at least 2 letters to search across all pharmacy invoices, batches, medicines, and suppliers.
            </div>
          ) : matchingItems.length === 0 && matchingInvoices.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No matching pharmacy records found for "{searchTerm}".
            </div>
          ) : (
            <div className="space-y-4">
              {/* Medicines matched */}
              {matchingItems.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Matching Purchased Medicines ({matchingItems.length})
                  </h4>
                  <div className="space-y-2">
                    {matchingItems.slice(0, 15).map((it) => (
                      <div
                        key={it.id}
                        className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="font-bold text-white flex items-center gap-2">
                            <Pill className="w-3.5 h-3.5 text-emerald-400" />
                            {it.productName}
                          </div>
                          <div className="text-slate-400 text-[11px]">
                            Batch: <span className="font-mono text-slate-300">{it.batchNumber}</span> • Exp: {it.expiryDate} • Qty: {it.quantity}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-emerald-400">₹{it.purchaseRate.toFixed(2)}</div>
                          <div className="text-[11px] text-slate-400">
                            {it.agencyName} (Inv #{it.invoiceNumber})
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invoices matched */}
              {matchingInvoices.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Matching Purchase Invoices ({matchingInvoices.length})
                  </h4>
                  <div className="space-y-2">
                    {matchingInvoices.slice(0, 8).map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => {
                          if (onSelectInvoice) onSelectInvoice(inv);
                          onClose();
                        }}
                        className="p-3 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between text-xs cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-emerald-400" />
                          <div>
                            <div className="font-bold text-white">Invoice #{inv.invoiceNumber}</div>
                            <div className="text-slate-400 text-[11px]">{inv.agencyName} • {inv.invoiceDate}</div>
                          </div>
                        </div>

                        <div className="text-right font-mono font-bold text-white">
                          ₹{inv.invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between">
          <span>Global Indian Pharmacy Index</span>
          <span>Esc to exit</span>
        </div>
      </div>
    </div>
  );
};
