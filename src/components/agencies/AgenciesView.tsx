import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  IndianRupee,
  CreditCard,
  Layers,
  ArrowRight,
  Phone,
  FileText,
  AlertCircle,
  X,
  Calendar,
  Clock,
  Edit2,
  Sparkles,
  CheckCircle2,
  Bookmark,
} from 'lucide-react';
import { Agency, AgencyFinancialSummary, AgencySchedule } from '../../types/pharmacy';
import {
  getAgencies,
  getAllAgenciesSummary,
  getInvoices,
  getPayments,
  saveAgency,
} from '../../db/indexedDb';
import { formatScheduleDate, getAllAgencySchedules } from '../../services/scheduleService';
import { EditScheduleModal } from '../schedule/EditScheduleModal';
import { AddPreviousDueModal } from './AddPreviousDueModal';

interface AgenciesViewProps {
  onSelectAgency: (agencyId: string) => void;
  onScanBill: () => void;
}

export const AgenciesView: React.FC<AgenciesViewProps> = ({
  onSelectAgency,
  onScanBill,
}) => {
  const [agencies, setAgencies] = useState<AgencyFinancialSummary[]>([]);
  const [schedules, setSchedules] = useState<AgencySchedule[]>([]);
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'SCHEDULE'>('LEDGER');
  const [editingSchedule, setEditingSchedule] = useState<AgencySchedule | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPreviousDueModal, setShowPreviousDueModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // New Agency Form state
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [notes, setNotes] = useState('');

  const loadAgencies = async () => {
    setLoading(true);
    try {
      const [sumData, allAgs, allInvs, allPays] = await Promise.all([
        getAllAgenciesSummary(),
        getAgencies(),
        getInvoices(),
        getPayments(),
      ]);
      setAgencies(sumData);
      const schedData = await getAllAgencySchedules(allAgs, allInvs, allPays);
      setSchedules(schedData);
    } catch (err) {
      console.error('Failed to load agencies / schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgencies();
  }, []);

  const handleCreateAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newAgency: Agency = {
      id: `agency-${Date.now()}`,
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      gstin: gstin.trim().toUpperCase(),
      dlNumber: dlNumber.trim().toUpperCase(),
      paymentTermsDays: Number(paymentTermsDays) || 30,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveAgency(newAgency);
    setShowAddModal(false);
    resetForm();
    await loadAgencies();
  };

  const resetForm = () => {
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setGstin('');
    setDlNumber('');
    setPaymentTermsDays(30);
    setNotes('');
  };

  const filtered = agencies.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.agency.name.toLowerCase().includes(q) ||
      (a.agency.gstin && a.agency.gstin.toLowerCase().includes(q)) ||
      (a.agency.phone && a.agency.phone.includes(q))
    );
  });

  const totalAllPurchases = agencies.reduce((acc, a) => acc + a.totalPurchase, 0);
  const totalAllPaid = agencies.reduce((acc, a) => acc + a.totalPaid, 0);
  const totalAllOutstanding = agencies.reduce((acc, a) => acc + a.outstandingBalance, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header & Overview */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Agencies & Distributors Ledger
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
              {agencies.length} Registered
            </span>
          </h1>
          <p className="text-xs text-slate-400">
            Individual supplier accounts, payment tracking, and purchase reconciliation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowPreviousDueModal(true)}
            className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs rounded-xl border border-amber-500/30 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            Add Previous Due
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-500/25 flex items-center gap-1.5 transition-all transform active:scale-95 cursor-pointer border border-sky-300/30"
          >
            <Plus className="w-4 h-4" />
            Add Supplier / Agency
          </button>
        </div>
      </div>

      {/* Aggregate KPI Banner (Spatial Stat Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Cumulative Purchases
            </span>
            <div className="text-2xl font-black text-white mt-1 font-mono tabular-nums tracking-tight">
              ₹{totalAllPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-500">Across all registered distributors</span>
          </div>
          <div className="p-3 bg-sky-500/15 text-sky-400 border border-sky-400/25 rounded-2xl shadow-sm">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Cumulative Paid
            </span>
            <div className="text-2xl font-black text-emerald-400 mt-1 font-mono tabular-nums tracking-tight">
              ₹{totalAllPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-500">Settled through payments</span>
          </div>
          <div className="p-3 bg-emerald-500/15 text-emerald-400 border border-emerald-400/25 rounded-2xl shadow-sm">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="spatial-stat-card p-4.5 rounded-2xl flex items-center justify-between border-amber-500/30">
          <div>
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
              Net Outstanding Balance
            </span>
            <div className="text-2xl font-black text-amber-300 mt-1 font-mono tabular-nums tracking-tight">
              ₹{totalAllOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-amber-400/80 font-medium">Pending payments to distributors</span>
          </div>
          <div className="p-3 bg-amber-500/15 text-amber-400 border border-amber-400/30 rounded-2xl shadow-sm">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* View Mode Switcher: Ledger Table vs Agency Schedule (Requirement 11) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('LEDGER')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'LEDGER'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Distributor Accounts Table
          </button>
          <button
            onClick={() => setActiveTab('SCHEDULE')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'SCHEDULE'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Agency Visit Schedule</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Pattern AI
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-400">
          {activeTab === 'LEDGER'
            ? 'Full purchase, payment balance ledger'
            : 'Forecasted visit dates & typical intervals learned from historical bills'}
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center justify-between gap-4 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search agency by name, GSTIN, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg pl-9 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>
        <div className="text-xs text-slate-400">
          {activeTab === 'LEDGER'
            ? 'Click any agency row to view its bills, payments, and running ledger.'
            : 'Click [Edit Schedule] to manually set custom visit dates or intervals.'}
        </div>
      </div>

      {/* TAB 1: AGENCY SUMMARY TABLE */}
      {activeTab === 'LEDGER' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-300 font-semibold text-[11px] uppercase tracking-wider">
                <th className="py-3.5 px-6">Agency / Supplier</th>
                <th className="py-3.5 px-4">Contact Info</th>
                <th className="py-3.5 px-4 text-right">Purchase (₹)</th>
                <th className="py-3.5 px-4 text-right">Paid (₹)</th>
                <th className="py-3.5 px-6 text-right">Balance Due (₹)</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                    No agencies found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.agency.id}
                    onClick={() => onSelectAgency(item.agency.id)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                  >
                    {/* Agency Name */}
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-800 group-hover:bg-emerald-500/10 text-slate-300 group-hover:text-emerald-400 rounded-lg transition-colors">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm group-hover:text-emerald-300 transition-colors">
                            {item.agency.name}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                            {item.agency.gstin ? (
                              <span>GST: {item.agency.gstin}</span>
                            ) : (
                              <span className="text-slate-600">No GSTIN</span>
                            )}
                            {item.nearExpiryItemsCount > 0 && (
                              <span className="text-amber-400 font-sans font-semibold">
                                • {item.nearExpiryItemsCount} near expiry
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="py-3.5 px-4 text-slate-300">
                      <div>{item.agency.contactPerson || '-'}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.agency.phone || '-'}
                      </div>
                    </td>

                    {/* Purchase Total */}
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-white">
                      ₹{item.totalPurchase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Paid Total */}
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-emerald-400">
                      ₹{item.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Outstanding Balance */}
                    <td className="py-3.5 px-6 text-right font-mono font-bold text-sm">
                      <span
                        className={`px-2.5 py-1 rounded-lg ${
                          item.outstandingBalance > 0
                            ? 'bg-amber-950/60 text-amber-300 border border-amber-800/80'
                            : 'bg-emerald-950/40 text-emerald-400'
                        }`}
                      >
                        ₹{item.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* Open details arrow */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="text-slate-500 group-hover:text-emerald-400 transition-colors inline-flex items-center gap-1 font-semibold text-xs">
                        Account <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: AGENCY SCHEDULE SECTION (Exact Requirement 11 Specification) */}
      {activeTab === 'SCHEDULE' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-white">
              Agency Visit Schedules ({schedules.length} Suppliers)
            </span>
            <span>Predictions adapt automatically as you save new purchase bills &amp; receipts</span>
          </div>

          {schedules.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs">
              No agency schedules available yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {schedules
                .filter((s) => {
                  if (!searchQuery.trim()) return true;
                  return s.agencyName.toLowerCase().includes(searchQuery.toLowerCase());
                })
                .map((sched) => (
                  <div
                    key={sched.agencyId}
                    className="p-5 bg-slate-900 border border-slate-800 hover:border-teal-500/40 rounded-2xl shadow-lg transition-all space-y-4 flex flex-col justify-between"
                  >
                    {/* Header: Agency Name & Outstanding */}
                    <div className="space-y-1 border-b border-slate-800/80 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3
                          onClick={() => onSelectAgency(sched.agencyId)}
                          className="font-bold text-white text-base hover:text-teal-300 cursor-pointer transition-colors"
                        >
                          {sched.agencyName}
                        </h3>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                            sched.confidence === 'HIGH'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : sched.confidence === 'MEDIUM'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          Confidence: {sched.confidence}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-400">Current Outstanding:</span>
                        <span className="text-sm font-mono font-bold text-amber-400">
                          ₹{sched.outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>

                    {/* Exact Requirement 11 Fields */}
                    <div className="space-y-2 text-xs bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/70">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Last Activity Date:</span>
                        <span className="font-semibold text-white">
                          {formatScheduleDate(sched.lastActivityDate)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Typical Visit Interval:</span>
                        <span className="font-semibold text-teal-300">
                          {sched.typicalIntervalDays ? `${sched.typicalIntervalDays} days` : 'Not enough data'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Next Expected Visit:</span>
                        <span className="font-bold text-white">
                          {sched.nextExpectedDate ? formatScheduleDate(sched.nextExpectedDate) : 'Not enough data'}
                          {sched.daysUntilNextVisit !== null && sched.daysUntilNextVisit >= 0 && (
                            <span className="text-teal-400 font-sans font-normal text-[11px] ml-1">
                              ({sched.daysUntilNextVisit === 0 ? 'Today' : sched.daysUntilNextVisit === 1 ? 'Tomorrow' : `in ${sched.daysUntilNextVisit}d`})
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Prediction Status:</span>
                        <span className="text-[11px] font-semibold text-slate-300">
                          {sched.statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <button
                        onClick={() => onSelectAgency(sched.agencyId)}
                        className="text-xs text-slate-400 hover:text-white font-medium flex items-center gap-1 transition-colors"
                      >
                        Ledger <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setEditingSchedule(sched)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 font-bold text-xs rounded-xl border border-teal-500/30 flex items-center gap-1.5 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit Schedule
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Add Agency Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-white font-bold text-base">Add Pharmacy Distributor / Agency</h3>
                <p className="text-xs text-slate-400">
                  Register supplier details for automated OCR matching & purchase tracking
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAgency} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Distributor / Agency Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikas Pharma Distributors"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Shah"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98220 19844"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">GSTIN Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 27AAECV4120L1ZA"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono uppercase rounded-lg px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Drug License (DL) Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 20B/14299, 21B/14300"
                    value={dlNumber}
                    onChange={(e) => setDlNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white font-mono uppercase rounded-lg px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="orders@agency.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Credit Terms (Days)</label>
                  <input
                    type="number"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(parseInt(e.target.value) || 30)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Distributor Address</label>
                <textarea
                  rows={2}
                  placeholder="Market address, City, Pincode"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 outline-none resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-500/20"
                >
                  Save Agency Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Schedule Modal (Requirement 8 & 11) */}
      <EditScheduleModal
        isOpen={!!editingSchedule}
        schedule={editingSchedule}
        onClose={() => setEditingSchedule(null)}
        onSaved={loadAgencies}
      />

      {/* Add Previous / Opening Due Modal (Requirement 6) */}
      <AddPreviousDueModal
        isOpen={showPreviousDueModal}
        onClose={() => setShowPreviousDueModal(false)}
        onSaved={loadAgencies}
      />
    </div>
  );
};
