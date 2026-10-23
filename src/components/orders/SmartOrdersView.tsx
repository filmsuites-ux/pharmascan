import React, { useState, useEffect } from 'react';
import {
  Pill,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Share2,
  Send,
  Copy,
  Printer,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Check,
  Calendar,
  Phone,
  FileText,
  Clock,
  Layers,
  ShieldCheck,
  Edit3,
  ExternalLink,
  Info,
} from 'lucide-react';
import { Agency } from '../../types/pharmacy';
import { getAgencies, getInvoiceItems, getMedicineMinStockConfig } from '../../db/indexedDb';
import {
  OrderItemInput,
  HistoricalMedicineSupplierRecord,
  AgencyCoverageResult,
  FinalizedMedicineOrder,
  getHistoricalMedicineSupplierRecords,
  calculateSmartAgencyCoverage,
  createOrderForAgency,
  formatOrderForWhatsApp,
  getWhatsAppOrderUrl,
  getSavedMedicineOrders,
  saveMedicineOrder,
  deleteMedicineOrder,
  runSmartOrderTestSuite,
  OrderVerificationTestResult,
  extractStrength,
  extractPackSize,
} from '../../services/smartOrderService';
import { copyToClipboard } from '../../services/shareService';

interface SmartOrdersViewProps {
  onNavigate?: (view: string) => void;
}

export const SmartOrdersView: React.FC<SmartOrdersViewProps> = ({ onNavigate }) => {
  // Navigation tabs: 'create' | 'coverage' | 'order_form' | 'history' | 'test_results'
  const [activeStep, setActiveStep] = useState<'create' | 'coverage' | 'order_form' | 'history' | 'test_results'>('create');

  // Loaded database state
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [historicalRecords, setHistoricalRecords] = useState<HistoricalMedicineSupplierRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Order Items in creation
  const [requestedItems, setRequestedItems] = useState<OrderItemInput[]>([
    { id: 'item-1', name: 'PARACETAMOL 500 MG', strength: '500MG', packSize: '10x10', quantity: 20 },
    { id: 'item-2', name: 'PAN 40MG TABLET', strength: '40MG', packSize: '10x10', quantity: 15 },
    { id: 'item-3', name: 'AUGMENTIN 625 DUO TAB', strength: '625MG', packSize: '10 Tab', quantity: 10 },
  ]);

  // Form input state for adding a medicine
  const [inputName, setInputName] = useState('');
  const [inputManufacturer, setInputManufacturer] = useState('');
  const [inputStrength, setInputStrength] = useState('');
  const [inputPackSize, setInputPackSize] = useState('');
  const [inputQuantity, setInputQuantity] = useState<number>(10);
  const [inputNotes, setInputNotes] = useState('');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<HistoricalMedicineSupplierRecord[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Coverage Analysis results
  const [coverageResults, setCoverageResults] = useState<AgencyCoverageResult[]>([]);

  // Selected Order for finalization & WhatsApp
  const [currentOrder, setCurrentOrder] = useState<FinalizedMedicineOrder | null>(null);
  const [savedOrders, setSavedOrders] = useState<FinalizedMedicineOrder[]>([]);

  // Automated Test Suite Results
  const [testResults, setTestResults] = useState<OrderVerificationTestResult[] | null>(null);

  // Feedback toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Load baseline data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [agList, histList] = await Promise.all([
          getAgencies(),
          getHistoricalMedicineSupplierRecords(),
        ]);
        setAgencies(agList);
        setHistoricalRecords(histList);
        setSavedOrders(getSavedMedicineOrders());
      } catch (err) {
        console.error('Failed to load data for Smart Orders:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Update Autocomplete when typing medicine name
  useEffect(() => {
    if (!inputName.trim() || inputName.length < 2) {
      setAutocompleteSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const query = inputName.toUpperCase().trim();
    const matches = historicalRecords.filter(
      (h) => h.productName.toUpperCase().includes(query) || h.baseDrugName.toUpperCase().includes(query)
    );

    // Unique by product name
    const uniqueMap = new Map<string, HistoricalMedicineSupplierRecord>();
    matches.forEach((m) => {
      if (!uniqueMap.has(m.productName.toUpperCase())) {
        uniqueMap.set(m.productName.toUpperCase(), m);
      }
    });

    setAutocompleteSuggestions(Array.from(uniqueMap.values()).slice(0, 6));
    setShowSuggestions(true);
  }, [inputName, historicalRecords]);

  // Recalculate coverage whenever requestedItems, historicalRecords, or agencies change
  useEffect(() => {
    if (agencies.length > 0) {
      const cov = calculateSmartAgencyCoverage(requestedItems, historicalRecords, agencies);
      setCoverageResults(cov);
    }
  }, [requestedItems, historicalRecords, agencies]);

  // Auto-fill from suggestion
  const handleSelectSuggestion = (item: HistoricalMedicineSupplierRecord) => {
    setInputName(item.productName);
    if (item.manufacturer) setInputManufacturer(item.manufacturer);
    if (item.strength) setInputStrength(item.strength);
    if (item.packSize) setInputPackSize(item.packSize);
    setShowSuggestions(false);
  };

  // Add Item to Order List
  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputName.trim()) {
      showToast('Please enter a medicine name.');
      return;
    }

    // Auto extract strength/pack if user typed it in name and left inputs blank
    const detectedStrength = inputStrength.trim() || extractStrength(inputName);
    const detectedPack = inputPackSize.trim() || extractPackSize(inputName);

    const newItem: OrderItemInput = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: inputName.trim(),
      manufacturer: inputManufacturer.trim() || undefined,
      strength: detectedStrength || undefined,
      packSize: detectedPack || undefined,
      quantity: inputQuantity > 0 ? inputQuantity : 1,
      notes: inputNotes.trim() || undefined,
    };

    setRequestedItems([...requestedItems, newItem]);
    setInputName('');
    setInputManufacturer('');
    setInputStrength('');
    setInputPackSize('');
    setInputQuantity(10);
    setInputNotes('');
    setShowSuggestions(false);
    showToast(`Added ${newItem.name} to order list.`);
  };

  // Remove Item
  const handleRemoveItem = (id: string) => {
    setRequestedItems(requestedItems.filter((i) => i.id !== id));
  };

  // Update Quantity
  const handleUpdateQuantity = (id: string, delta: number) => {
    setRequestedItems(
      requestedItems.map((it) => {
        if (it.id === id) {
          const newQty = Math.max(1, it.quantity + delta);
          return { ...it, quantity: newQty };
        }
        return it;
      })
    );
  };

  // Load Fast-Moving Sample Items
  const handleLoadSampleList = () => {
    setRequestedItems([
      { id: 's-1', name: 'PARACETAMOL 500 MG', strength: '500MG', packSize: '10x10', quantity: 30 },
      { id: 's-2', name: 'PAN 40MG TABLET', strength: '40MG', packSize: '10x10', quantity: 20 },
      { id: 's-3', name: 'CETIRIZINE 10MG TAB', strength: '10MG', packSize: '10 Strip', quantity: 25 },
      { id: 's-4', name: 'AUGMENTIN 625 DUO TAB', strength: '625MG', packSize: '10 Tab', quantity: 15 },
    ]);
    showToast('Loaded standard medicine order list.');
  };

  // Load Low Stock Items
  const handleLoadLowStock = async () => {
    try {
      const allItems = await getInvoiceItems();
      const minStockConfig = getMedicineMinStockConfig();

      // Aggregate stock by normalized name
      const stockMap = new Map<string, { item: any; totalQty: number }>();
      allItems.forEach((i) => {
        const norm = i.normalizedName;
        if (!stockMap.has(norm)) {
          stockMap.set(norm, { item: i, totalQty: 0 });
        }
        stockMap.get(norm)!.totalQty += i.quantity || 0;
      });

      const lowStockItems: OrderItemInput[] = [];
      stockMap.forEach(({ item, totalQty }, norm) => {
        const minLevel = minStockConfig[norm] ?? item.minStockLevel ?? 10;
        if (totalQty <= minLevel) {
          lowStockItems.push({
            id: `low-${item.id}`,
            name: item.productName,
            manufacturer: item.manufacturer,
            strength: extractStrength(item.productName),
            packSize: item.packSize,
            quantity: Math.max(10, minLevel * 2),
            notes: `Auto-added from Low Stock alert (Current: ${totalQty}, Min: ${minLevel})`,
          });
        }
      });

      if (lowStockItems.length === 0) {
        showToast('No low stock medicines found currently. Added sample inventory.');
        handleLoadSampleList();
      } else {
        setRequestedItems(lowStockItems);
        showToast(`Loaded ${lowStockItems.length} low-stock medicines for reordering.`);
      }
    } catch (err) {
      console.error(err);
      handleLoadSampleList();
    }
  };

  // Select Agency & Generate Order Form
  const handleSelectAgencyForOrder = (agencyCov: AgencyCoverageResult) => {
    const order = createOrderForAgency(agencyCov, requestedItems, historicalRecords);
    setCurrentOrder(order);
    setActiveStep('order_form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Toggle Item in Order Form
  const handleToggleOrderItem = (orderItemId: string) => {
    if (!currentOrder) return;
    setCurrentOrder({
      ...currentOrder,
      items: currentOrder.items.map((it) =>
        it.orderItemId === orderItemId ? { ...it, included: !it.included } : it
      ),
    });
  };

  // Edit Order Item Quantity
  const handleUpdateOrderItemQty = (orderItemId: string, qty: number) => {
    if (!currentOrder) return;
    setCurrentOrder({
      ...currentOrder,
      items: currentOrder.items.map((it) =>
        it.orderItemId === orderItemId ? { ...it, quantity: Math.max(1, qty) } : it
      ),
    });
  };

  // Include Unmatched Item into Order
  const handleIncludeUnmatchedItem = (unmatchedIdx: number) => {
    if (!currentOrder) return;
    const itemToInclude = currentOrder.unmatchedItems[unmatchedIdx];
    const newItems = [...currentOrder.items];
    newItems.push({
      orderItemId: `custom-${Date.now()}-${unmatchedIdx}`,
      name: itemToInclude.name,
      manufacturer: itemToInclude.manufacturer,
      strength: itemToInclude.strength,
      packSize: itemToInclude.packSize,
      quantity: itemToInclude.quantity,
      included: true,
      isHistoricallyMatched: false,
      notes: 'Special item added outside historical supplier records',
    });

    const newUnmatched = currentOrder.unmatchedItems.filter((_, idx) => idx !== unmatchedIdx);
    setCurrentOrder({
      ...currentOrder,
      items: newItems,
      unmatchedItems: newUnmatched,
    });
    showToast(`Added ${itemToInclude.name} to purchase order.`);
  };

  // Send WhatsApp Order
  const handleSendWhatsApp = () => {
    if (!currentOrder) return;
    const message = formatOrderForWhatsApp(currentOrder);
    const url = getWhatsAppOrderUrl(currentOrder.agencyPhone, message);

    // Save order status
    const updated = { ...currentOrder, status: 'SENT_WHATSAPP' as const };
    setCurrentOrder(updated);
    saveMedicineOrder(updated);
    setSavedOrders(getSavedMedicineOrders());

    // Open WhatsApp
    window.open(url, '_blank');
    showToast(`Opening WhatsApp with purchase order for ${currentOrder.agencyName}...`);
  };

  // Native Share Sheet / Copy
  const handleNativeShare = async () => {
    if (!currentOrder) return;
    const message = formatOrderForWhatsApp(currentOrder);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Purchase Order #${currentOrder.orderNumber} - ${currentOrder.agencyName}`,
          text: message,
        });
        showToast('Shared via Android Share Sheet.');
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    copyToClipboard(message);
    showToast('Purchase order text copied to clipboard.');
  };

  // Save Order Draft
  const handleSaveDraft = () => {
    if (!currentOrder) return;
    saveMedicineOrder(currentOrder);
    setSavedOrders(getSavedMedicineOrders());
    showToast(`Order #${currentOrder.orderNumber} saved to History.`);
  };

  // Run Automated Accuracy Verification Suite
  const handleRunTests = () => {
    const results = runSmartOrderTestSuite();
    setTestResults(results);
    setActiveStep('test_results');
    showToast('Completed Smart Order accuracy verification tests.');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Feedback */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-slate-900 border border-emerald-500 text-white text-xs font-semibold rounded-xl shadow-2xl animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Header & Context */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Historical Bill Intelligence
            </span>
            <span className="text-xs text-slate-400">
              • Read from verified purchase bills in IndexedDB
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Pill className="w-7 h-7 text-emerald-400" />
            Smart Medicine Order
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl mt-1">
            Build your medicine order list and automatically match against previously scanned bills to discover which distributor has the highest historical fulfillment coverage.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRunTests}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Verify Accuracy Tests</span>
          </button>

          <button
            onClick={() => setActiveStep('history')}
            className={`px-3.5 py-2.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
              activeStep === 'history'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-700'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-400" />
            <span>Saved Orders ({savedOrders.length})</span>
          </button>
        </div>
      </div>

      {/* MANDATORY ACCURACY DISCLAIMER (Requirement 4) */}
      <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-emerald-400 mr-1">Based on previous purchase records:</span>
          Historical purchase records demonstrate prior distributor supply relationships, not real-time distributor inventory. Unverified or ambiguous attributes are clearly flagged without guessing. Agencies are ranked strictly by coverage percentage, never by price.
        </div>
      </div>

      {/* Workflow Navigation Steps */}
      <div className="grid grid-cols-3 gap-2 p-1.5 spatial-panel rounded-2xl">
        <button
          onClick={() => setActiveStep('create')}
          className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeStep === 'create'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-slate-950/20 flex items-center justify-center text-[10px] font-black">
            1
          </span>
          <span>Order List ({requestedItems.length})</span>
        </button>

        <button
          onClick={() => setActiveStep('coverage')}
          className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeStep === 'coverage'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-slate-950/20 flex items-center justify-center text-[10px] font-black">
            2
          </span>
          <span>Smart Coverage</span>
        </button>

        <button
          onClick={() => {
            if (!currentOrder && coverageResults.length > 0) {
              handleSelectAgencyForOrder(coverageResults[0]);
            } else {
              setActiveStep('order_form');
            }
          }}
          className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeStep === 'order_form'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-slate-950/20 flex items-center justify-center text-[10px] font-black">
            3
          </span>
          <span>Order &amp; WhatsApp</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: MEDICINE ORDER LIST BUILDER */}
      {/* ========================================================================= */}
      {activeStep === 'create' && (
        <div className="space-y-6">
          {/* Add Medicine Form Card */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  Add Medicines to Order
                </h3>
                <span className="text-xs text-slate-400">
                  Type any medicine or select from previously scanned inventory to auto-populate details.
                </span>
              </div>

              {/* Fast Load Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadLowStock}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Load Low Stock</span>
                </button>
                <button
                  type="button"
                  onClick={handleLoadSampleList}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sample List</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleAddItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 relative">
                {/* Medicine Name with Autocomplete */}
                <div className="lg:col-span-4 relative">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Medicine Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={inputName}
                      onChange={(e) => setInputName(e.target.value)}
                      onFocus={() => {
                        if (autocompleteSuggestions.length > 0) setShowSuggestions(true);
                      }}
                      placeholder="e.g. Paracetamol 500mg, Augmentin 625"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                    <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
                  </div>

                  {/* Autocomplete Dropdown */}
                  {showSuggestions && autocompleteSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                      <div className="p-2 border-b border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Previously Scanned Medicines</span>
                        <span className="text-emerald-400">Click to autofill</span>
                      </div>
                      {autocompleteSuggestions.map((s, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectSuggestion(s)}
                          className="px-3.5 py-2.5 hover:bg-slate-800 cursor-pointer border-b border-slate-800/50 last:border-b-0 flex items-center justify-between"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">{s.productName}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2">
                              <span>Last Supplier: {s.agencyName}</span>
                              {s.strength && <span>• {s.strength}</span>}
                              {s.packSize && <span>• {s.packSize}</span>}
                            </div>
                          </div>
                          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                            Select
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Strength */}
                <div className="lg:col-span-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Strength
                  </label>
                  <input
                    type="text"
                    value={inputStrength}
                    onChange={(e) => setInputStrength(e.target.value)}
                    placeholder="e.g. 500mg, 625mg, 40mg"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Manufacturer */}
                <div className="lg:col-span-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Manufacturer
                  </label>
                  <input
                    type="text"
                    value={inputManufacturer}
                    onChange={(e) => setInputManufacturer(e.target.value)}
                    placeholder="e.g. Cipla, GSK, Alkem"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Pack Size */}
                <div className="lg:col-span-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Pack Size
                  </label>
                  <input
                    type="text"
                    value={inputPackSize}
                    onChange={(e) => setInputPackSize(e.target.value)}
                    placeholder="e.g. 10x10, 10's, 100ml"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Required Quantity */}
                <div className="lg:col-span-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Required Qty *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={inputQuantity}
                    onChange={(e) => setInputQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Notes & Submit Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <input
                  type="text"
                  value={inputNotes}
                  onChange={(e) => setInputNotes(e.target.value)}
                  placeholder="Optional item notes (e.g. patient urgent requirement, specific brand preference)..."
                  className="w-full sm:flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />

                <button
                  type="submit"
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add to Order List</span>
                </button>
              </div>
            </form>
          </div>

          {/* Current Medicine Order Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Current Order Items ({requestedItems.length})</span>
                </h3>
                <span className="text-xs text-slate-400">
                  Review and modify medicine quantities before analyzing distributor coverage.
                </span>
              </div>

              {requestedItems.length > 0 && (
                <button
                  onClick={() => setRequestedItems([])}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {requestedItems.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-3">
                <Pill className="w-10 h-10 mx-auto text-slate-600 opacity-50" />
                <p className="text-sm font-semibold">Your medicine order list is currently empty.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Add medicines using the form above, or load sample medicines from your previous bills to see distributor coverage.
                </p>
                <button
                  onClick={handleLoadSampleList}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-white text-xs font-bold rounded-xl border border-slate-700 inline-flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Load Sample Order List</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 font-bold">#</th>
                      <th className="py-3 px-4 font-bold">Medicine Name</th>
                      <th className="py-3 px-4 font-bold">Strength</th>
                      <th className="py-3 px-4 font-bold">Manufacturer</th>
                      <th className="py-3 px-4 font-bold">Pack Size</th>
                      <th className="py-3 px-4 font-bold text-center">Required Qty</th>
                      <th className="py-3 px-4 font-bold">Notes</th>
                      <th className="py-3 px-4 font-bold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {requestedItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="py-3 px-4 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-white">{item.name}</td>
                        <td className="py-3 px-4 text-slate-300">
                          {item.strength ? (
                            <span className="font-mono text-emerald-400">{item.strength}</span>
                          ) : (
                            <span className="text-slate-500 italic">Not specified</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {item.manufacturer || <span className="text-slate-500 italic">Any Mfr</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {item.packSize || <span className="text-slate-500 italic">Standard</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-700">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, -1)}
                              className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded hover:bg-slate-800 font-black cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-bold text-white font-mono">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, 1)}
                              className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white rounded hover:bg-slate-800 font-black cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-400 italic max-w-xs truncate">
                          {item.notes || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Remove from list"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Step 1 Footer Action */}
            {requestedItems.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800/80">
                <div className="text-xs text-slate-400">
                  Total Medicines: <strong className="text-white">{requestedItems.length}</strong> • Total Units:{' '}
                  <strong className="text-emerald-400">
                    {requestedItems.reduce((acc, i) => acc + i.quantity, 0)}
                  </strong>
                </div>

                <button
                  onClick={() => setActiveStep('coverage')}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <span>Analyze Smart Agency Coverage</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: SMART AGENCY COVERAGE ANALYSIS (Requirements 3 & 4) */}
      {/* ========================================================================= */}
      {activeStep === 'coverage' && (
        <div className="space-y-6">
          {/* Top Recommendation Hero Banner */}
          {coverageResults.length > 0 && coverageResults[0].coveragePercentage > 0 && (
            <div className="p-6 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 rounded-3xl shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/20 pb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-500/40 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      {coverageResults[0].isTiedTop
                        ? `Top Recommended Supplier (Tie of ${coverageResults[0].tieCount})`
                        : 'Top Recommended Supplier'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Based on verified purchase history in app
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    {coverageResults[0].agencyName}
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Historically supplied <strong>{coverageResults[0].matchedCount}</strong> out of{' '}
                    <strong>{coverageResults[0].totalRequestedCount}</strong> requested medicines (
                    <span className="text-emerald-400 font-bold">{coverageResults[0].coveragePercentage}% Coverage</span>).
                  </p>
                </div>

                <button
                  onClick={() => handleSelectAgencyForOrder(coverageResults[0])}
                  className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0"
                >
                  <span>Create Order for {coverageResults[0].agencyName}</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Matched vs Unmatched Quick Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-emerald-500/20">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                    ✓ Matched in Past Invoices ({coverageResults[0].matchedItems.length}):
                  </span>
                  <ul className="space-y-1 text-slate-300">
                    {coverageResults[0].matchedItems.map((m, idx) => (
                      <li key={idx} className="flex items-center gap-1.5 truncate">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="font-semibold text-white">{m.requestedItem.name}</span>
                        {m.matchedHistoricalItem?.lastInvoiceNumber && (
                          <span className="text-[10px] text-slate-500">
                            (Bill #{m.matchedHistoricalItem.lastInvoiceNumber})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    ✗ Unmatched ({coverageResults[0].unmatchedItems.length}):
                  </span>
                  {coverageResults[0].unmatchedItems.length === 0 ? (
                    <span className="text-xs text-emerald-400 font-semibold">
                      Complete 100% order fulfillment from this supplier!
                    </span>
                  ) : (
                    <ul className="space-y-1 text-slate-400">
                      {coverageResults[0].unmatchedItems.map((u, idx) => (
                        <li key={idx} className="flex items-center gap-1.5 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                          <span>{u.requestedItem.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Complete Ranked List of Agencies */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Distributor Coverage Rankings ({coverageResults.length})
                </h3>
                <span className="text-xs text-slate-400">
                  Ranked strictly from highest coverage percentage to lowest coverage percentage. Prices are not compared.
                </span>
              </div>

              <button
                onClick={() => setActiveStep('create')}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-semibold cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Edit Medicine List</span>
              </button>
            </div>

            {coverageResults.length === 0 ? (
              <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-3xl text-slate-400">
                No agencies available in database to calculate coverage.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {coverageResults.map((cov, idx) => {
                  return (
                    <div
                      key={cov.agencyId}
                      className={`p-5 bg-slate-900 border rounded-3xl shadow-md transition-all ${
                        cov.isTopRecommended
                          ? 'border-emerald-500/60 ring-1 ring-emerald-500/20'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Left: Agency info & ranking badge */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                              Rank #{idx + 1}
                            </span>
                            <h4 className="text-lg font-bold text-white flex items-center gap-2">
                              {cov.agencyName}
                            </h4>
                            {cov.isTopRecommended && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
                                {cov.isTiedTop ? 'Top Match (Tie)' : 'Highest Coverage'}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                            {cov.agencyGstin && <span>GSTIN: <strong className="text-slate-300 font-mono">{cov.agencyGstin}</strong></span>}
                            {cov.agencyPhone && <span>Phone: <strong className="text-slate-300">{cov.agencyPhone}</strong></span>}
                            {cov.agencyAddress && <span className="truncate max-w-xs">{cov.agencyAddress}</span>}
                          </div>
                        </div>

                        {/* Center: Coverage Metric Bar */}
                        <div className="min-w-[200px] space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-medium">Historical Coverage</span>
                            <span className="font-mono font-bold text-emerald-400">
                              {cov.matchedCount} of {cov.totalRequestedCount} items ({cov.coveragePercentage}%)
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                cov.coveragePercentage >= 75
                                  ? 'bg-emerald-500'
                                  : cov.coveragePercentage >= 50
                                  ? 'bg-teal-500'
                                  : cov.coveragePercentage > 0
                                  ? 'bg-amber-500'
                                  : 'bg-slate-700'
                              }`}
                              style={{ width: `${cov.coveragePercentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Right: Select Action */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSelectAgencyForOrder(cov)}
                            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                              cov.isTopRecommended
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                                : 'bg-slate-800 hover:bg-slate-750 text-white border border-slate-700'
                            }`}
                          >
                            <span>Generate Order Form</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Detailed Breakdown: Matched vs Unmatched for this Agency */}
                      <div className="mt-4 pt-3.5 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Matched Medicines */}
                        <div>
                          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                            Medicines Matched ({cov.matchedItems.length}):
                          </span>
                          {cov.matchedItems.length === 0 ? (
                            <span className="text-slate-500 italic">No historical purchases of requested items from this agency.</span>
                          ) : (
                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                              {cov.matchedItems.map((m, mIdx) => (
                                <div
                                  key={mIdx}
                                  className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950/40 border border-slate-800/60"
                                >
                                  <div className="truncate">
                                    <span className="font-semibold text-white">{m.requestedItem.name}</span>
                                    {m.matchedHistoricalItem && (
                                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                        <span>Bill #{m.matchedHistoricalItem.lastInvoiceNumber}</span>
                                        <span>• {m.matchedHistoricalItem.lastPurchaseDate}</span>
                                        <span>• {m.matchedHistoricalItem.totalTimesPurchased} past purchases</span>
                                      </div>
                                    )}
                                  </div>
                                  {m.status === 'UNVERIFIED_MATCH' ? (
                                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">
                                      Unverified Details
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                                      Verified
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Unmatched Medicines */}
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                            Medicines Not Matched ({cov.unmatchedItems.length}):
                          </span>
                          {cov.unmatchedItems.length === 0 ? (
                            <span className="text-emerald-400 font-semibold">All requested medicines are in this agency's catalog.</span>
                          ) : (
                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                              {cov.unmatchedItems.map((u, uIdx) => (
                                <div
                                  key={uIdx}
                                  className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950/20 border border-slate-800/40 text-slate-400"
                                >
                                  <span className="truncate">{u.requestedItem.name}</span>
                                  <span className="text-[10px] text-slate-500 shrink-0">Not found in past bills</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: ORDER FORM & WHATSAPP SHARING (Requirement 5) */}
      {/* ========================================================================= */}
      {activeStep === 'order_form' && currentOrder && (
        <div className="space-y-6">
          {/* Order Header Summary */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    Purchase Order #{currentOrder.orderNumber}
                  </span>
                  <span className="text-xs text-slate-400">• Date: {currentOrder.orderDate}</span>
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-emerald-400" />
                  {currentOrder.agencyName}
                </h2>
                <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 mt-1">
                  {currentOrder.agencyGstin && (
                    <span>GSTIN: <strong className="text-slate-300 font-mono">{currentOrder.agencyGstin}</strong></span>
                  )}
                  {currentOrder.agencyPhone && (
                    <span>Phone: <strong className="text-slate-300">{currentOrder.agencyPhone}</strong></span>
                  )}
                </div>
              </div>

              {/* Action Buttons: WhatsApp & Native Share */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-xl shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Send className="w-4 h-4 stroke-[2.5]" />
                  <span>Send via WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 cursor-pointer transition-all"
                  title="Share sheet or copy text"
                >
                  <Share2 className="w-4 h-4 text-emerald-400" />
                  <span>Share / Copy</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Check className="w-4 h-4 text-blue-400" />
                  <span>Save Order</span>
                </button>
              </div>
            </div>

            {/* Matched Medicines for this Order */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Pill className="w-4 h-4 text-emerald-400" />
                  <span>Order Items for {currentOrder.agencyName}</span>
                </h3>
                <span className="text-xs text-slate-400">
                  {currentOrder.items.filter((i) => i.included).length} items selected
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3 font-bold">Include</th>
                      <th className="py-2.5 px-3 font-bold">Medicine Name</th>
                      <th className="py-2.5 px-3 font-bold">Strength</th>
                      <th className="py-2.5 px-3 font-bold">Pack Size</th>
                      <th className="py-2.5 px-3 font-bold text-center">Required Qty</th>
                      <th className="py-2.5 px-3 font-bold">Historical Record</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {currentOrder.items.map((it) => (
                      <tr
                        key={it.orderItemId}
                        className={`transition-colors ${
                          it.included ? 'hover:bg-slate-850/50' : 'opacity-40 bg-slate-950/20'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={it.included}
                            onChange={() => handleToggleOrderItem(it.orderItemId)}
                            className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-bold text-white">
                          <div>{it.name}</div>
                          {it.manufacturer && (
                            <div className="text-[10px] text-slate-400">Mfr: {it.manufacturer}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono">
                          {it.strength || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {it.packSize || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-700">
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) =>
                                handleUpdateOrderItemQty(it.orderItemId, parseInt(e.target.value, 10) || 1)
                              }
                              className="w-14 text-center font-bold text-white font-mono bg-transparent focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-500">units</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {it.isHistoricallyMatched ? (
                            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              ✓ Bill #{it.historicalBillNumber || 'PAST'} ({it.historicalDate || 'Recorded'})
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              Manual / Outside History
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* UNMATCHED MEDICINES SHOWN SEPARATELY (Requirement 5) */}
            {currentOrder.unmatchedItems.length > 0 && (
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      Unmatched Medicines ({currentOrder.unmatchedItems.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Not found in previous bills for {currentOrder.agencyName}. Decide where to order them.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {currentOrder.unmatchedItems.map((u, uIdx) => (
                    <div
                      key={uIdx}
                      className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{u.name}</div>
                        <div className="text-[11px] text-slate-400">
                          Qty: <strong>{u.quantity}</strong>
                          {u.strength && ` • ${u.strength}`}
                        </div>
                        {u.suggestedAgencyName ? (
                          <div className="text-[10px] text-emerald-400 mt-0.5">
                            💡 Previously supplied by: <strong>{u.suggestedAgencyName}</strong>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            No prior supplier recorded in app.
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleIncludeUnmatchedItem(uIdx)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white rounded-lg border border-slate-700 text-[10px] font-bold shrink-0 cursor-pointer"
                        title="Add to this purchase order anyway"
                      >
                        + Include in Order
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Special Instructions Textarea */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Special Delivery Instructions / Remarks
              </label>
              <textarea
                rows={2}
                value={currentOrder.specialInstructions || ''}
                onChange={(e) =>
                  setCurrentOrder({ ...currentOrder, specialInstructions: e.target.value })
                }
                placeholder="e.g. Please supply freshest batch with maximum expiry. Kindly share invoice copy on dispatch."
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Live WhatsApp Preview Box */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-400 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  Live WhatsApp Message Preview
                </span>
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard(formatOrderForWhatsApp(currentOrder));
                    showToast('WhatsApp order text copied!');
                  }}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-900 rounded-xl text-[11px] text-slate-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-800">
                {formatOrderForWhatsApp(currentOrder)}
              </pre>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setActiveStep('coverage')}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Coverage Rankings</span>
              </button>

              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Send className="w-4 h-4 stroke-[2.5]" />
                <span>Confirm &amp; Open WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SAVED ORDERS HISTORY */}
      {/* ========================================================================= */}
      {activeStep === 'history' && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                Saved Purchase Orders ({savedOrders.length})
              </h3>
              <span className="text-xs text-slate-400">
                View previous purchase orders, re-send via WhatsApp, or duplicate to new order.
              </span>
            </div>

            <button
              onClick={() => setActiveStep('create')}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Order</span>
            </button>
          </div>

          {savedOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <FileText className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
              <p className="text-xs font-semibold">No purchase orders saved yet.</p>
              <p className="text-[11px] text-slate-500">
                Build an order and click &quot;Save Order&quot; or &quot;Send via WhatsApp&quot; to preserve it here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {savedOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">#{ord.orderNumber}</span>
                      <span className="text-slate-400">• {ord.agencyName}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          ord.status === 'SENT_WHATSAPP'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {ord.status === 'SENT_WHATSAPP' ? 'Sent on WhatsApp' : 'Draft'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Date: {ord.orderDate} • Items: {ord.items.filter((i) => i.included).length} • Phone: {ord.agencyPhone || 'N/A'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentOrder(ord);
                        setActiveStep('order_form');
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-white rounded-lg border border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Open &amp; Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const url = getWhatsAppOrderUrl(ord.agencyPhone, formatOrderForWhatsApp(ord));
                        window.open(url, '_blank');
                      }}
                      className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        deleteMedicineOrder(ord.id);
                        setSavedOrders(getSavedMedicineOrders());
                        showToast(`Deleted order #${ord.orderNumber}.`);
                      }}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 cursor-pointer"
                      title="Delete saved order"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: AUTOMATED ACCURACY VERIFICATION TESTS (Requirement 7) */}
      {/* ========================================================================= */}
      {activeStep === 'test_results' && testResults && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  Verification Suite (Requirement 7)
                </span>
                <span className="text-xs text-slate-400">All tests executed in-memory</span>
              </div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                Accuracy &amp; Discrimination Test Results
              </h3>
            </div>

            <button
              onClick={handleRunTests}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-run Tests</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {testResults.map((t, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-2xl border flex items-start gap-3.5 text-xs ${
                  t.passed
                    ? 'bg-emerald-950/20 border-emerald-500/30'
                    : 'bg-red-950/20 border-red-500/30'
                }`}
              >
                {t.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold text-white text-sm flex items-center gap-2">
                    <span>{t.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.2 rounded ${
                        t.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {t.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                  <p className="text-slate-300 mt-1">{t.details}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-800 text-right">
            <button
              onClick={() => setActiveStep('create')}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-white text-xs font-bold rounded-xl border border-slate-700 cursor-pointer"
            >
              ← Return to Order Builder
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
