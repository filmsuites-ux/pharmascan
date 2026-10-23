import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Building2,
  Calendar,
  IndianRupee,
  Eye,
  Trash2,
  Edit2,
  X,
  FileCheck,
} from 'lucide-react';
import { Agency, Payment, PaymentMethod } from '../../types/pharmacy';
import {
  deletePayment,
  getAgencies,
  getPayments,
  savePayment,
} from '../../db/indexedDb';
import { OriginalBillViewer } from '../common/OriginalBillViewer';

export const PaymentsView: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [selectedAgencyId, setSelectedAgencyId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [method, setMethod] = useState<PaymentMethod>('NEFT_RTGS');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // Proof viewer
  const [viewerImage, setViewerImage] = useState<string[]>([]);
  const [viewerTitle, setViewerTitle] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [p, a] = await Promise.all([getPayments(), getAgencies()]);
    setPayments(p);
    setAgencies(a);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = (p?: Payment) => {
    if (p) {
      setEditingPaymentId(p.id);
      setSelectedAgencyId(p.agencyId);
      setAmount(p.amount);
      setPaymentDate(p.paymentDate);
      setMethod(p.paymentMethod);
      setReference(p.referenceNumber || '');
      setNotes(p.notes || '');
    } else {
      setEditingPaymentId(null);
      setSelectedAgencyId(agencies[0]?.id || '');
      setAmount(0);
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setMethod('NEFT_RTGS');
      setReference('');
      setNotes('');
    }
    setShowModal(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgencyId || amount <= 0) {
      alert('Please select an agency and provide a payment amount greater than zero.');
      return;
    }

    const agency = agencies.find((a) => a.id === selectedAgencyId);
    if (!agency) return;

    const toSave: Payment = {
      id: editingPaymentId || `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      agencyId: agency.id,
      agencyName: agency.name,
      paymentDate,
      amount: Number(amount),
      paymentMethod: method,
      referenceNumber: reference.trim(),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await savePayment(toSave);
    setShowModal(false);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this payment entry? Outstanding balances will be recalculated automatically.')) {
      await deletePayment(id);
      await loadData();
    }
  };

  const filtered = payments.filter((p) => {
    if (methodFilter !== 'ALL' && p.paymentMethod !== methodFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.agencyName.toLowerCase().includes(q) ||
        (p.referenceNumber && p.referenceNumber.toLowerCase().includes(q)) ||
        p.paymentDate.includes(q)
      );
    }
    return true;
  });

  const totalPaidSum = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Payment Tracking & Disbursement Ledger
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
              {payments.length} Payments
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            Chronological log of supplier settlements across bank transfer, UPI, and cheques.
          </p>
        </div>

        <button
          onClick={() => handleOpenAdd()}
          className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Record New Payment
        </button>
      </div>

      {/* KPI Total Paid */}
      <div className="spatial-stat-card p-5 max-w-sm flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Payments Settled
          </span>
          <div className="text-2xl font-black text-emerald-400 mt-1 font-mono tabular-nums tracking-tight">
            ₹{totalPaidSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Across {payments.length} settled vouchers</span>
        </div>
        <div className="p-3.5 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-inner">
          <CreditCard className="w-6 h-6" />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by agency, cheque #, or date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
        >
          <option value="ALL">All Payment Methods</option>
          <option value="NEFT_RTGS">NEFT / RTGS</option>
          <option value="UPI">UPI</option>
          <option value="CHEQUE">Cheque</option>
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
              <th className="py-3.5 px-6">Payment Date</th>
              <th className="py-3.5 px-6">Agency / Supplier</th>
              <th className="py-3.5 px-4 text-right">Amount (₹)</th>
              <th className="py-3.5 px-4">Method</th>
              <th className="py-3.5 px-4">Ref / Cheque #</th>
              <th className="py-3.5 px-4">Remarks</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                  No payment records found.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-850/50 transition-colors">
                  <td className="py-3 px-6 font-mono font-medium text-white">{p.paymentDate}</td>
                  <td className="py-3 px-6 font-bold text-white flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                    {p.agencyName}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                    ₹{p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                      {p.paymentMethod}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">{p.referenceNumber || '-'}</td>
                  <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{p.notes || '-'}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenAdd(p)}
                        className="p-1 text-slate-400 hover:text-white"
                        title="Edit Payment"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1 text-slate-500 hover:text-red-400"
                        title="Delete Payment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Record Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-white font-bold text-base">
                  {editingPaymentId ? 'Edit Payment' : 'Record Supplier Payment'}
                </h3>
                <p className="text-xs text-slate-400">
                  Updates agency ledger & recalculates balance automatically
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Supplier / Agency <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={selectedAgencyId}
                  onChange={(e) => setSelectedAgencyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                >
                  <option value="">-- Choose Agency --</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Payment Amount (₹) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 text-white font-bold text-sm rounded-lg px-3 py-2 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                  >
                    <option value="NEFT_RTGS">NEFT / RTGS</option>
                    <option value="UPI">UPI (GPay / PhonePe)</option>
                    <option value="CHEQUE">Bank Cheque</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
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
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white font-mono rounded-lg px-3 py-2 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Remarks / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Payment notes or invoices settled"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/20"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Viewer */}
      <OriginalBillViewer
        images={viewerImage}
        title={viewerTitle}
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
      />
    </div>
  );
};
