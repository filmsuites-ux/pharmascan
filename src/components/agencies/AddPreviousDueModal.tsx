import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  IndianRupee,
  Building2,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle2,
  Plus,
  Bookmark,
  ShieldCheck,
} from 'lucide-react';
import { Agency, PreviousDueInput } from '../../types/pharmacy';
import { getAgencies, getAgencySummary, saveAgency, savePreviousDue } from '../../db/indexedDb';

interface AddPreviousDueModalProps {
  isOpen: boolean;
  preselectedAgencyId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export const AddPreviousDueModal: React.FC<AddPreviousDueModalProps> = ({
  isOpen,
  preselectedAgencyId,
  onClose,
  onSaved,
}) => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('');
  const [currentAgencyBalance, setCurrentAgencyBalance] = useState<number>(0);
  const [isNewAgency, setIsNewAgency] = useState<boolean>(false);
  const [newAgencyName, setNewAgencyName] = useState<string>('');
  const [newAgencyPhone, setNewAgencyPhone] = useState<string>('');
  const [newAgencyGstin, setNewAgencyGstin] = useState<string>('');

  const [amount, setAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('Balance from old ledger before software adoption');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const isSaveLocked = useRef<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (isOpen) {
        const ags = await getAgencies();
        setAgencies(ags);
        if (preselectedAgencyId) {
          setSelectedAgencyId(preselectedAgencyId);
          setIsNewAgency(false);
        } else if (ags.length > 0 && !selectedAgencyId) {
          setSelectedAgencyId(ags[0].id);
        }
        setErrorMessage(null);
        isSaveLocked.current = false;
        setIsSaving(false);
      }
    }
    load();
  }, [isOpen, preselectedAgencyId]);

  useEffect(() => {
    async function updateBal() {
      if (selectedAgencyId && !isNewAgency) {
        try {
          const summ = await getAgencySummary(selectedAgencyId);
          setCurrentAgencyBalance(summ?.outstandingBalance || 0);
        } catch {
          setCurrentAgencyBalance(0);
        }
      } else {
        setCurrentAgencyBalance(0);
      }
    }
    updateBal();
  }, [selectedAgencyId, isNewAgency]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Double-tap save protection (Requirement 14)
    if (isSaveLocked.current || isSaving) return;

    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid previous due amount greater than ₹0.');
      return;
    }

    let targetAgencyId = selectedAgencyId;
    let targetAgencyName = '';

    if (isNewAgency) {
      if (!newAgencyName.trim()) {
        setErrorMessage('Please enter the distributor / agency name.');
        return;
      }
      isSaveLocked.current = true;
      setIsSaving(true);
      try {
        const newAg: Agency = {
          id: `agency-${Date.now()}`,
          name: newAgencyName.trim(),
          phone: newAgencyPhone.trim(),
          gstin: newAgencyGstin.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveAgency(newAg);
        targetAgencyId = newAg.id;
        targetAgencyName = newAg.name;
      } catch (err: any) {
        isSaveLocked.current = false;
        setIsSaving(false);
        setErrorMessage(`Failed to create agency: ${err.message}`);
        return;
      }
    } else {
      const existing = agencies.find((a) => a.id === targetAgencyId);
      if (!existing) {
        setErrorMessage('Please select an agency.');
        return;
      }
      targetAgencyName = existing.name;
    }

    isSaveLocked.current = true;
    setIsSaving(true);

    try {
      const input: PreviousDueInput = {
        agencyId: targetAgencyId,
        agencyName: targetAgencyName,
        amount: numAmount,
        dueDate: dueDate || new Date().toISOString().split('T')[0],
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || 'Opening balance prior to software installation',
      };

      await savePreviousDue(input);
      onSaved();
      onClose();
    } catch (err: any) {
      isSaveLocked.current = false;
      setIsSaving(false);
      setErrorMessage(`Failed to save previous due: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Add Previous / Opening Due</h2>
              <p className="text-xs text-slate-400">
                Record distributor balance prior to using this application
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-850 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Policy Explainer */}
          <div className="p-3 bg-blue-950/20 border border-blue-500/20 rounded-xl text-[11px] text-blue-300 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <span>
              <strong>Accounting Rule (Requirement 6):</strong> This creates an <code>OPENING_DUE</code> transaction.
              It does NOT mix into individual purchase bills. Outstanding balance formula:
              <br />
              <code className="text-emerald-300 font-mono">Opening Due + Purchases - Payments = Outstanding Balance</code>
            </span>
          </div>

          {/* Agency Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Distributor / Agency</label>
              <button
                type="button"
                onClick={() => setIsNewAgency(!isNewAgency)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
              >
                {isNewAgency ? '← Select Existing Agency' : '+ New Agency'}
              </button>
            </div>

            {isNewAgency ? (
              <div className="space-y-2 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Agency Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apollo Pharma Distributors"
                    value={newAgencyName}
                    onChange={(e) => setNewAgencyName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Phone (Optional)</label>
                    <input
                      type="text"
                      placeholder="+91 98..."
                      value={newAgencyPhone}
                      onChange={(e) => setNewAgencyPhone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">GSTIN (Optional)</label>
                    <input
                      type="text"
                      placeholder="27AAAA..."
                      value={newAgencyGstin}
                      onChange={(e) => setNewAgencyGstin(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <select
                value={selectedAgencyId}
                onChange={(e) => setSelectedAgencyId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">
              Previous Due Amount (₹) *
            </label>
            <div className="relative">
              <IndianRupee className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="20000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-emerald-400 font-bold text-base rounded-xl pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Live Balance Projection */}
            {!isNewAgency && selectedAgencyId && (
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] grid grid-cols-2 gap-2 mt-2">
                <div>
                  <span className="text-slate-400 block">Current Outstanding:</span>
                  <span className="font-bold text-amber-300">
                    ₹{currentAgencyBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Projected New Balance:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    ₹{(currentAgencyBalance + (parseFloat(amount) || 0)).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Date & Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Due / Opening Date</label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Reference / Ledger Code</label>
              <div className="relative">
                <FileText className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. OLD-LEDGER-PAGE-12"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Remarks / Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. Historical opening balance carried forward from previous physical ledger book"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 text-xs outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm &amp; Save Opening Due</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddPreviousDueModal;
