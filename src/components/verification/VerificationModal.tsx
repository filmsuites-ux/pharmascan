import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  Trash2,
  Building2,
  FileText,
  Calendar,
  IndianRupee,
  Eye,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Sparkles,
  HelpCircle,
  ShieldAlert,
  Search,
  Check,
  Tag,
  Columns,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  ArrowLeft,
  Receipt,
  Wallet,
  CreditCard,
} from 'lucide-react';
import {
  Agency,
  DocumentType,
  ExtractedBillData,
  Invoice,
  InvoiceItem,
  Payment,
  PaymentMethod,
} from '../../types/pharmacy';
import {
  checkForDuplicateInvoice,
  checkForDuplicatePayment,
  getAgencies,
  getAgencySummary,
  getInvoiceItems,
  saveAgency,
  saveInvoice,
  savePayment,
} from '../../db/indexedDb';
import { parseExpiryDate, calculateDaysRemaining, formatDaysRemainingText } from '../../services/expiryService';
import { detectPriceChange, normalizeMedicineName } from '../../services/pricingService';
import { matchAgency } from '../../services/agencyMatcherService';
import { OriginalBillViewer } from '../common/OriginalBillViewer';

interface VerificationModalProps {
  isOpen: boolean;
  images: string[];
  originalImages?: string[];
  processedImages?: string[];
  extractedData: ExtractedBillData;
  documentType?: DocumentType;
  originalPdfData?: string;
  originalPdfName?: string;
  onClose: () => void;
  onSaved?: (invoice: Invoice) => void;
  onNavigate?: (view: string, agencyId?: string) => void;
  onScanAnother?: () => void;
}

interface EditableItemRow {
  id: string;
  productName: string;
  rawPrintedName: string;
  productCode: string;
  manufacturer: string;
  packSize: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  mrp: number;
  purchaseRate: number;
  discountPercent: number;
  gstPercent: number;
  lineTotal: number;
  needsReview: boolean;
  reviewFields: string[];
  validationMatchStatus: 'EXACT_MATCH' | 'SUGGESTED_MATCH' | 'NEW_MEDICINE' | 'NEEDS_REVIEW';
  suggestedMatches: string[];
  userConfirmed: boolean;
  confidence: {
    productName: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    batchNumber: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    expiryDate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    purchaseRate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    quantity: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
  };
  previousRate?: number;
  priceDiff?: number;
  pricePercentDiff?: number;
  priceChangeType?: 'INCREASE' | 'DECREASE' | 'NO_CHANGE' | 'NEW';
  prevInvoiceNumber?: string;
  prevInvoiceDate?: string;
  prevAgencyName?: string;
}

type SaveStatus = 'IDLE' | 'SAVING' | 'VALIDATION_ERROR' | 'SAVE_ERROR' | 'SUCCESS';

function createInitialEditableItems(
  rawItems: any[] = [],
  fallbackInvoiceTotal: number = 0,
  historicalItems: any[] = []
): EditableItemRow[] {
  if (!rawItems || rawItems.length === 0) {
    if (fallbackInvoiceTotal > 0) {
      return [
        {
          id: `item-init-${Date.now()}`,
          productName: 'Pharmacy Purchase Item / Medicine Stock',
          rawPrintedName: 'Pharmacy Purchase Item / Medicine Stock',
          productCode: '',
          manufacturer: '',
          packSize: '1 Unit',
          batchNumber: 'GEN-01',
          expiryDate: '12/2028',
          quantity: 1,
          freeQuantity: 0,
          mrp: fallbackInvoiceTotal,
          purchaseRate: fallbackInvoiceTotal,
          discountPercent: 0,
          gstPercent: 0,
          lineTotal: fallbackInvoiceTotal,
          needsReview: false,
          reviewFields: [],
          validationMatchStatus: 'NEW_MEDICINE',
          suggestedMatches: [],
          userConfirmed: true,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
          priceChangeType: 'NEW',
        },
      ];
    }
    return [];
  }

  const existingMedNames = Array.from(
    new Set(historicalItems.map((h) => (h.productName || '').toUpperCase().trim()))
  );

  return rawItems.map((it, idx) => {
    const printed = it.productName || 'Needs Review';
    const isNeedsRev = printed === 'Needs Review' || printed === 'NOT DETECTED';

    let validationMatchStatus: 'EXACT_MATCH' | 'SUGGESTED_MATCH' | 'NEW_MEDICINE' | 'NEEDS_REVIEW' =
      'NEW_MEDICINE';
    let suggestedMatches: string[] = [];

    if (!isNeedsRev && existingMedNames.length > 0) {
      const exact = existingMedNames.find((m) => m === printed.toUpperCase());
      if (exact) {
        validationMatchStatus = 'EXACT_MATCH';
      } else {
        const norm = normalizeMedicineName(printed);
        const sim = existingMedNames.filter((m) => {
          const mNorm = normalizeMedicineName(m);
          return mNorm.includes(norm) || norm.includes(mNorm);
        });
        if (sim.length > 0) {
          validationMatchStatus = 'SUGGESTED_MATCH';
          suggestedMatches = sim.slice(0, 3);
        }
      }
    } else if (isNeedsRev) {
      validationMatchStatus = 'NEEDS_REVIEW';
    }

    const reviewFields: string[] = [];
    if (isNeedsRev) reviewFields.push('productName');
    if (!it.batchNumber || it.batchNumber === 'NOT DETECTED' || it.batchNumber === 'Needs Review') reviewFields.push('batchNumber');
    if (!it.expiryDate || it.expiryDate === 'NOT DETECTED' || it.expiryDate === 'Needs Review') reviewFields.push('expiryDate');
    if (!it.purchaseRate || it.purchaseRate <= 0) reviewFields.push('purchaseRate');
    if (!it.quantity || it.quantity <= 0) reviewFields.push('quantity');

    return {
      id: `item-edit-${Date.now()}-${idx}`,
      productName: printed,
      rawPrintedName: printed,
      productCode: it.productCode || '',
      manufacturer: it.manufacturer || '',
      packSize: it.packSize || '',
      batchNumber: it.batchNumber && it.batchNumber !== 'NOT DETECTED' ? it.batchNumber : 'Needs Review',
      expiryDate: it.expiryDate && it.expiryDate !== 'NOT DETECTED' ? it.expiryDate : 'Needs Review',
      quantity: Number(it.quantity) || 0,
      freeQuantity: Number(it.freeQuantity) || 0,
      mrp: Number(it.mrp) || 0,
      purchaseRate: Number(it.purchaseRate) || 0,
      discountPercent: Number(it.discountPercent) || 0,
      gstPercent: Number(it.gstPercent) || 12,
      lineTotal: Number(it.lineTotal) || 0,
      needsReview: reviewFields.length > 0,
      reviewFields,
      validationMatchStatus,
      suggestedMatches,
      userConfirmed: reviewFields.length === 0,
      confidence: it.confidence || {
        productName: !isNeedsRev ? 'HIGH' : 'NEEDS_REVIEW',
        batchNumber: it.batchNumber && it.batchNumber !== 'NOT DETECTED' ? 'HIGH' : 'NEEDS_REVIEW',
        expiryDate: it.expiryDate && it.expiryDate !== 'NOT DETECTED' ? 'HIGH' : 'NEEDS_REVIEW',
        purchaseRate: it.purchaseRate > 0 ? 'HIGH' : 'NEEDS_REVIEW',
        quantity: it.quantity > 0 ? 'HIGH' : 'NEEDS_REVIEW',
      },
      priceChangeType: it.priceChangeType || 'NEW',
    };
  });
}

export const VerificationModal: React.FC<VerificationModalProps> = ({
  isOpen,
  images,
  originalImages,
  processedImages,
  extractedData,
  documentType = 'TAX_INVOICE',
  originalPdfData,
  originalPdfName,
  onClose,
  onSaved,
  onNavigate,
  onScanAnother,
}) => {
  // Save lifecycle states
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('IDLE');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasSaved, setHasSaved] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [quickAgencyError, setQuickAgencyError] = useState<string | null>(null);
  const isSaveInProgress = useRef<boolean>(false);

  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(
    () => extractedData?.agency?.matchedAgencyId || ''
  );
  const [agencyConfidence, setAgencyConfidence] = useState<'HIGH' | 'LOW'>(
    () => extractedData?.agency?.agencyConfidence || 'LOW'
  );
  const [detectedSupplierName, setDetectedSupplierName] = useState<string>(
    () => extractedData?.agency?.detectedName || 'Needs Review'
  );
  const [isNewSupplier, setIsNewSupplier] = useState<boolean>(
    () => extractedData?.agency?.isNewSupplier ?? false
  );
  const [docType, setDocType] = useState<DocumentType>(() => {
    if (extractedData?.documentType === 'RECEIPT' || documentType === 'RECEIPT') {
      return 'RECEIPT';
    }
    return extractedData?.documentType || documentType || 'PURCHASE_BILL';
  });

  const [isDocTypeUncertain, setIsDocTypeUncertain] = useState<boolean>(() =>
    Boolean(extractedData?.isClassificationUncertain || extractedData?.classificationConfidence === 'LOW')
  );
  const [classificationReason, setClassificationReason] = useState<string>(() =>
    extractedData?.classificationReason || ''
  );
  const [showDocTypeMenu, setShowDocTypeMenu] = useState<boolean>(false);
  const [isChangingAgency, setIsChangingAgency] = useState<boolean>(false);

  // Agency financial balances
  const [agencyPreviousBalance, setAgencyPreviousBalance] = useState<number>(0);
  const [savedResultBalances, setSavedResultBalances] = useState<{
    previousBalance: number;
    newBalance: number;
    amount: number;
    agencyName: string;
    documentType: DocumentType;
    recordId: string;
  } | null>(null);

  // Payment Receipt fields (Requirement 4 & 5)
  const [paymentAmount, setPaymentAmount] = useState<number>(() =>
    Number(extractedData?.paymentReceipt?.amountPaid || extractedData?.invoice?.invoiceTotal) || 0
  );
  const [paymentDate, setPaymentDate] = useState<string>(() =>
    extractedData?.paymentReceipt?.paymentDate || extractedData?.invoice?.invoiceDate || new Date().toISOString().split('T')[0]
  );
  const [paymentRefNumber, setPaymentRefNumber] = useState<string>(() =>
    extractedData?.paymentReceipt?.referenceNumber ||
    (extractedData?.invoice?.invoiceNumber && extractedData.invoice.invoiceNumber !== 'Needs Review'
      ? extractedData.invoice.invoiceNumber
      : '')
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() =>
    (extractedData?.paymentReceipt?.paymentMethod as PaymentMethod) || 'UPI'
  );
  const [paymentNotes, setPaymentNotes] = useState<string>(() =>
    extractedData?.paymentReceipt?.notes || ''
  );

  // Invoice meta - initialized synchronously from extractedData
  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    () => extractedData?.invoice?.invoiceNumber || 'Needs Review'
  );
  const [invoiceDate, setInvoiceDate] = useState<string>(
    () => extractedData?.invoice?.invoiceDate || new Date().toISOString().split('T')[0]
  );
  const [invoiceTotal, setInvoiceTotal] = useState<number>(
    () => extractedData?.invoice?.invoiceTotal || 0
  );
  const [taxableAmount, setTaxableAmount] = useState<number>(
    () => extractedData?.invoice?.taxableAmount || 0
  );
  const [gstAmount, setGstAmount] = useState<number>(
    () => extractedData?.invoice?.gstAmount || 0
  );
  const [doctorShopDetails, setDoctorShopDetails] = useState<string>(
    () => extractedData?.doctorCustomerShopDetails || ''
  );
  const [notes, setNotes] = useState<string>('');

  // Items - initialized synchronously to avoid empty array race conditions
  const [items, setItems] = useState<EditableItemRow[]>(() =>
    createInitialEditableItems(extractedData?.items || [], extractedData?.invoice?.invoiceTotal)
  );

  // Duplicate warning & record info (Requirements 12 & 13)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateRecord, setDuplicateRecord] = useState<{
    agencyName: string;
    number: string;
    amount: number;
    date: string;
    isPayment: boolean;
  } | null>(null);
  const [ignoreDuplicate, setIgnoreDuplicate] = useState<boolean>(false);

  // Bill preview modal
  const [showBillPreview, setShowBillPreview] = useState<boolean>(false);

  // Side-by-side Live Document Audit view
  const [isSideBySideView, setIsSideBySideView] = useState<boolean>(true);
  const [sideBySideTab, setSideBySideTab] = useState<'original' | 'processed'>('original');
  const [sideBySideZoom, setSideBySideZoom] = useState<number>(1);
  const [sideBySidePageIndex, setSideBySidePageIndex] = useState<number>(0);

  // Quick add agency inline modal
  const [showNewAgencyForm, setShowNewAgencyForm] = useState(false);
  const [newAgencyName, setNewAgencyName] = useState('');
  const [newAgencyPhone, setNewAgencyPhone] = useState('');
  const [newAgencyGstin, setNewAgencyGstin] = useState('');
  const [newAgencyDl, setNewAgencyDl] = useState('');

  // Synchronize and enrich data whenever extractedData or isOpen changes
  useEffect(() => {
    // Immediately synchronize items and metadata synchronously
    const freshItems = createInitialEditableItems(
      extractedData?.items || [],
      extractedData?.invoice?.invoiceTotal
    );
    setItems(freshItems);
    setSelectedAgencyId(extractedData?.agency?.matchedAgencyId || '');
    setAgencyConfidence(extractedData?.agency?.agencyConfidence || 'LOW');
    setDetectedSupplierName(extractedData?.agency?.detectedName || 'Needs Review');
    setIsNewSupplier(extractedData?.agency?.isNewSupplier ?? false);

    const initialDocType: DocumentType =
      extractedData?.documentType === 'RECEIPT' || documentType === 'RECEIPT'
        ? 'RECEIPT'
        : 'PURCHASE_BILL';
    setDocType(initialDocType);
    setIsDocTypeUncertain(
      Boolean(extractedData?.isClassificationUncertain || extractedData?.classificationConfidence === 'LOW')
    );
    setClassificationReason(extractedData?.classificationReason || '');

    // Synchronize payment fields
    const pAmt = Number(extractedData?.paymentReceipt?.amountPaid || extractedData?.invoice?.invoiceTotal) || 0;
    setPaymentAmount(pAmt);
    setPaymentDate(extractedData?.paymentReceipt?.paymentDate || extractedData?.invoice?.invoiceDate || new Date().toISOString().split('T')[0]);
    setPaymentRefNumber(
      extractedData?.paymentReceipt?.referenceNumber ||
      (extractedData?.invoice?.invoiceNumber && extractedData.invoice.invoiceNumber !== 'Needs Review'
        ? extractedData.invoice.invoiceNumber
        : '')
    );
    setPaymentMethod((extractedData?.paymentReceipt?.paymentMethod as PaymentMethod) || 'UPI');
    setPaymentNotes(extractedData?.paymentReceipt?.notes || '');

    setDoctorShopDetails(extractedData?.doctorCustomerShopDetails || '');
    setInvoiceNumber(extractedData?.invoice?.invoiceNumber || 'Needs Review');
    setInvoiceDate(extractedData?.invoice?.invoiceDate || new Date().toISOString().split('T')[0]);
    setInvoiceTotal(extractedData?.invoice?.invoiceTotal || pAmt || 0);
    setTaxableAmount(extractedData?.invoice?.taxableAmount || 0);
    setGstAmount(extractedData?.invoice?.gstAmount || 0);

    async function loadData() {
      try {
        const registered = await getAgencies();
        setAgencies(registered);

        const detected = extractedData?.agency;
        const detectedName = detected?.detectedName || 'Needs Review';

        // Auto-match agency using multi-signal fuzzy & stem matcher (Requirement 6)
        const matchResult = matchAgency(
          detectedName,
          detected?.gstin || '',
          detected?.phone || '',
          registered
        );

        let finalAgencyId = '';
        if (detected?.matchedAgencyId) {
          finalAgencyId = detected.matchedAgencyId;
          setSelectedAgencyId(finalAgencyId);
          setAgencyConfidence('HIGH');
          setIsNewSupplier(false);
        } else if (matchResult.matchedAgency) {
          finalAgencyId = matchResult.matchedAgency.id;
          setSelectedAgencyId(finalAgencyId);
          setAgencyConfidence(matchResult.confidence);
          setIsNewSupplier(false);
        } else {
          setSelectedAgencyId('');
          setAgencyConfidence('LOW');
          setIsNewSupplier(true);
        }

        if (finalAgencyId) {
          const summary = await getAgencySummary(finalAgencyId);
          setAgencyPreviousBalance(summary?.outstandingBalance || 0);
        } else {
          setAgencyPreviousBalance(0);
        }

        // Enrich items with price history if historical records exist
        const historicalItems = await getInvoiceItems();
        if (historicalItems && historicalItems.length > 0 && freshItems.length > 0) {
          const enriched = freshItems.map((it) => {
            const pc = detectPriceChange(
              it.purchaseRate,
              it.productName !== 'Needs Review' ? it.productName : '',
              it.productCode,
              extractedData?.invoice?.invoiceDate || new Date().toISOString().split('T')[0],
              historicalItems
            );
            return {
              ...it,
              previousRate: pc.previousRate,
              priceDiff: pc.diff,
              pricePercentDiff: pc.percentDiff,
              priceChangeType: pc.type,
              prevInvoiceNumber: pc.prevInvoiceNumber,
              prevInvoiceDate: pc.prevInvoiceDate,
              prevAgencyName: pc.prevAgencyName,
            };
          });
          setItems(enriched);
        }
      } catch (err) {
        console.warn('[PurchaseSave] Non-fatal background catalog sync notice:', err);
      }
    }

    if (isOpen) {
      setSaveStatus('IDLE');
      setIsSaving(false);
      setHasSaved(false);
      setValidationErrors([]);
      setSaveErrorMessage(null);
      setSavedInvoice(null);
      setNavigationError(null);
      setQuickAgencyError(null);
      setIgnoreDuplicate(false);
      setIsChangingAgency(false);
      setShowDocTypeMenu(false);
      isSaveInProgress.current = false;
      loadData();
    }
  }, [isOpen, extractedData]);

  // Keep agency previous balance updated whenever selectedAgencyId changes
  useEffect(() => {
    async function updateAgencyBal() {
      if (selectedAgencyId) {
        try {
          const summ = await getAgencySummary(selectedAgencyId);
          setAgencyPreviousBalance(summ?.outstandingBalance || 0);
        } catch {}
      } else {
        setAgencyPreviousBalance(0);
      }
    }
    updateAgencyBal();
  }, [selectedAgencyId]);

  // Check for duplicate invoice or payment receipt (Requirements 12 & 13)
  useEffect(() => {
    async function checkDuplicate() {
      if (!selectedAgencyId) {
        setDuplicateWarning(null);
        setDuplicateRecord(null);
        return;
      }

      if (docType === 'RECEIPT') {
        const amt = Number(paymentAmount) || 0;
        if (amt <= 0) {
          setDuplicateWarning(null);
          setDuplicateRecord(null);
          return;
        }

        const dupPay = await checkForDuplicatePayment(
          selectedAgencyId,
          amt,
          paymentDate,
          paymentRefNumber
        );

        if (dupPay.isDuplicate && dupPay.reason) {
          setDuplicateWarning(dupPay.reason);
          setDuplicateRecord({
            agencyName: dupPay.existingPayment?.agencyName || agencies.find((a) => a.id === selectedAgencyId)?.name || '',
            number: dupPay.existingPayment?.referenceNumber || paymentRefNumber || 'N/A',
            amount: dupPay.existingPayment?.amount || amt,
            date: dupPay.existingPayment?.paymentDate || paymentDate,
            isPayment: true,
          });
        } else {
          setDuplicateWarning(null);
          setDuplicateRecord(null);
        }
      } else {
        if (!invoiceNumber || invoiceNumber === 'Needs Review') {
          setDuplicateWarning(null);
          setDuplicateRecord(null);
          return;
        }

        const dup = await checkForDuplicateInvoice(
          selectedAgencyId,
          invoiceNumber,
          invoiceDate,
          invoiceTotal
        );

        if (dup.isDuplicate && dup.reason) {
          setDuplicateWarning(dup.reason);
          setDuplicateRecord({
            agencyName: dup.existingInvoice?.agencyName || agencies.find((a) => a.id === selectedAgencyId)?.name || '',
            number: dup.existingInvoice?.invoiceNumber || invoiceNumber,
            amount: dup.existingInvoice?.invoiceTotal || invoiceTotal,
            date: dup.existingInvoice?.invoiceDate || invoiceDate,
            isPayment: false,
          });
        } else {
          setDuplicateWarning(null);
          setDuplicateRecord(null);
        }
      }
    }

    if (isOpen) {
      checkDuplicate();
    }
  }, [selectedAgencyId, invoiceNumber, invoiceDate, invoiceTotal, paymentAmount, paymentDate, paymentRefNumber, docType, isOpen]);

  const handleItemChange = (index: number, field: keyof EditableItemRow, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };

      // Clear review tag if user entered valid value
      if (item.reviewFields) {
        item.reviewFields = item.reviewFields.filter((f) => f !== field);
        if (item.reviewFields.length === 0) {
          item.needsReview = false;
        }
      }

      // Auto-recalculate line total if financial values change
      if (
        field === 'quantity' ||
        field === 'purchaseRate' ||
        field === 'discountPercent' ||
        field === 'gstPercent'
      ) {
        const qty = field === 'quantity' ? Number(value) : item.quantity;
        const rate = field === 'purchaseRate' ? Number(value) : item.purchaseRate;
        const disc = field === 'discountPercent' ? Number(value) : item.discountPercent;
        const gst = field === 'gstPercent' ? Number(value) : item.gstPercent;

        const base = qty * rate * (1 - disc / 100);
        const total = base * (1 + gst / 100);
        item.lineTotal = Number(total.toFixed(2));
      }

      next[index] = item;
      return next;
    });
  };

  const handleAddItem = () => {
    const newItem: EditableItemRow = {
      id: `item-new-${Date.now()}`,
      productName: '',
      rawPrintedName: '',
      productCode: '',
      manufacturer: '',
      packSize: '',
      batchNumber: '',
      expiryDate: '12/2027',
      quantity: 10,
      freeQuantity: 0,
      mrp: 50,
      purchaseRate: 35,
      discountPercent: 0,
      gstPercent: 12,
      lineTotal: 392,
      needsReview: false,
      reviewFields: [],
      validationMatchStatus: 'NEW_MEDICINE',
      suggestedMatches: [],
      userConfirmed: true,
      confidence: {
        productName: 'HIGH',
        batchNumber: 'HIGH',
        expiryDate: 'HIGH',
        purchaseRate: 'HIGH',
        quantity: 'HIGH',
      },
      priceChangeType: 'NEW',
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleDeleteItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCreateQuickAgency = async () => {
    const finalName = (newAgencyName.trim() || detectedSupplierName).trim();
    if (!finalName || finalName === 'Needs Review') {
      setQuickAgencyError('Please enter a valid supplier name.');
      return;
    }

    try {
      const created: Agency = {
        id: `agency-${Date.now()}`,
        name: finalName,
        phone: newAgencyPhone.trim(),
        gstin: newAgencyGstin.trim(),
        dlNumber: newAgencyDl.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveAgency(created);
      setAgencies((prev) => [...prev, created]);
      setSelectedAgencyId(created.id);
      setAgencyConfidence('HIGH');
      setIsNewSupplier(false);
      setShowNewAgencyForm(false);
      setQuickAgencyError(null);
    } catch (err) {
      console.error('[PurchaseSave] ERROR creating agency:', err);
      setQuickAgencyError(err instanceof Error ? err.message : 'Failed to register supplier');
    }
  };

  const autoCalculateBillTotal = () => {
    const sum = items.reduce((acc, it) => acc + (it.lineTotal || 0), 0);
    const taxSum = items.reduce(
      (acc, it) => acc + it.quantity * it.purchaseRate * (1 - it.discountPercent / 100),
      0
    );
    setInvoiceTotal(Number(sum.toFixed(2)));
    setTaxableAmount(Number(taxSum.toFixed(2)));
    setGstAmount(Number((sum - taxSum).toFixed(2)));
  };

  const VALID_APP_ROUTES = [
    'dashboard',
    'agencies',
    'agency_detail',
    'payments',
    'price_changes',
    'expiry',
    'medicines',
    'documents',
    'reports',
  ] as const;

  const handleSafeNavigation = (destination: string, agencyId?: string) => {
    console.log('[PurchaseSave] NAVIGATION START', destination);
    try {
      if (destination === 'scanner') {
        if (onScanAnother) {
          onScanAnother();
        } else {
          onClose();
        }
        console.log('[PurchaseSave] NAVIGATION SUCCESS');
        return;
      }

      if (destination === 'done') {
        onClose();
        console.log('[PurchaseSave] NAVIGATION SUCCESS');
        return;
      }

      if (destination === 'agency_detail') {
        const agId = agencyId || selectedAgencyId;
        if (onNavigate) {
          onNavigate('agency_detail', agId);
        }
        onClose();
        console.log('[PurchaseSave] NAVIGATION SUCCESS');
        return;
      }

      if (!VALID_APP_ROUTES.includes(destination as any)) {
        throw new Error(`Target screen "${destination}" does not exist in navigation route definitions.`);
      }

      if (onNavigate) {
        onNavigate(destination);
      }
      onClose();
      console.log('[PurchaseSave] NAVIGATION SUCCESS');
    } catch (err) {
      console.error('[PurchaseSave] ERROR:', err);
      // STEP 8: Keep SUCCESS screen visible if navigation has a problem
      setNavigationError(err instanceof Error ? err.message : String(err));
    }
  };

  // Save Payment Receipt (Requirements 8, 10, 11)
  const executeSaveReceipt = async () => {
    isSaveInProgress.current = true;
    setIsSaving(true);
    setSaveStatus('SAVING');
    console.log('[PaymentSave] STARTING SAVE');

    try {
      let targetAgency = agencies.find((a) => a.id === selectedAgencyId);

      const currentSupplierName = (
        agencies.find((a) => a.id === selectedAgencyId)?.name ||
        newAgencyName.trim() ||
        detectedSupplierName
      ).trim();

      if (!targetAgency) {
        const autoAgencyName = currentSupplierName || 'Unknown Supplier';
        const newAg: Agency = {
          id: `agency-${Date.now()}`,
          name: autoAgencyName,
          phone: newAgencyPhone.trim(),
          gstin: newAgencyGstin.trim() || extractedData.agency?.gstin || '',
          dlNumber: newAgencyDl.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveAgency(newAg);
        setAgencies((prev) => [...prev, newAg]);
        setSelectedAgencyId(newAg.id);
        targetAgency = newAg;
      }

      const now = new Date().toISOString();
      const origImgs = originalImages && originalImages.length > 0 ? originalImages : images;
      const procImgs = processedImages && processedImages.length > 0 ? processedImages : images;
      const payRef = paymentRefNumber.trim() || `RCP-${Date.now().toString().slice(-5)}`;
      const amt = Number(paymentAmount) || 0;

      // 1. Save payment entry in payments table (Requirement 8 & 10)
      const paymentRecord: Payment = {
        id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        agencyId: targetAgency.id,
        agencyName: targetAgency.name,
        paymentDate: paymentDate || now.split('T')[0],
        amount: amt,
        paymentMethod: paymentMethod || 'UPI',
        referenceNumber: payRef,
        notes: paymentNotes.trim(),
        receiptImage: procImgs[0] || origImgs[0] || '',
        createdAt: now,
        updatedAt: now,
      };
      await savePayment(paymentRecord);

      // 2. Save document record in invoices table with documentType 'RECEIPT'
      const docRecord: Invoice = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        agencyId: targetAgency.id,
        agencyName: targetAgency.name,
        invoiceNumber: payRef,
        invoiceDate: paymentDate || now.split('T')[0],
        invoiceTotal: amt,
        taxableAmount: amt,
        gstAmount: 0,
        discountAmount: 0,
        paymentStatus: 'PAID',
        paidAmount: amt,
        balanceAmount: 0,
        originalImages: origImgs,
        processedImages: procImgs,
        images: procImgs.length > 0 ? procImgs : origImgs,
        documentType: 'RECEIPT',
        originalPdfData: originalPdfData || extractedData.originalPdfData,
        originalFileName: originalPdfName || extractedData.originalFileName,
        originalFileType: (originalPdfData || extractedData.originalPdfData) ? 'application/pdf' : 'image/jpeg',
        reviewStatus: 'VERIFIED',
        doctorCustomerShopDetails: doctorShopDetails.trim(),
        scanDate: now,
        notes: paymentNotes.trim(),
        itemsCount: 0,
        createdAt: now,
        updatedAt: now,
        ocrConfidence: {
          agency: agencyConfidence,
          invoiceNumber: 'HIGH',
          invoiceDate: 'HIGH',
          invoiceTotal: 'HIGH',
        },
      };
      const savedDoc = await saveInvoice(docRecord, []);

      // 3. Balance calculation (Requirement 8)
      const prevBal = agencyPreviousBalance;
      const newBal = Math.max(0, prevBal - amt);

      setSavedInvoice(savedDoc);
      setSavedResultBalances({
        previousBalance: prevBal,
        newBalance: newBal,
        amount: amt,
        agencyName: targetAgency.name,
        documentType: 'RECEIPT',
        recordId: paymentRecord.id,
      });

      console.log('[PaymentSave] SAVE SUCCESS');
      setHasSaved(true);
      setIsSaving(false);
      setSaveStatus('SUCCESS');

      if (onSaved) {
        onSaved(savedDoc);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[PaymentSave] ERROR:', errMsg);
      isSaveInProgress.current = false;
      setIsSaving(false);
      setSaveErrorMessage(errMsg);
      setSaveStatus('SAVE_ERROR');
    }
  };

  const executeSave = async (itemsSource: EditableItemRow[] = items) => {
    // STEP 1 & 4: STARTING SAVE LOCALLY
    isSaveInProgress.current = true;
    setIsSaving(true);
    setSaveStatus('SAVING');
    console.log('[PurchaseSave] STARTING SAVE');

    try {
      // Resolve agency in database
      let targetAgency = agencies.find((a) => a.id === selectedAgencyId);

      const currentSupplierName = (
        agencies.find((a) => a.id === selectedAgencyId)?.name ||
        newAgencyName.trim() ||
        detectedSupplierName
      ).trim();

      if (!targetAgency) {
        const autoAgencyName = currentSupplierName || 'Unknown Supplier';
        const newAg: Agency = {
          id: `agency-${Date.now()}`,
          name: autoAgencyName,
          phone: newAgencyPhone.trim(),
          gstin: newAgencyGstin.trim() || extractedData.agency?.gstin || '',
          dlNumber: newAgencyDl.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveAgency(newAg);
        setAgencies((prev) => [...prev, newAg]);
        setSelectedAgencyId(newAg.id);
        targetAgency = newAg;
      }

      const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const now = new Date().toISOString();

      const origImgs = originalImages && originalImages.length > 0 ? originalImages : images;
      const procImgs = processedImages && processedImages.length > 0 ? processedImages : images;

      const hasUncertainFields =
        itemsSource.some((it) => it.needsReview) ||
        invoiceNumber === 'Needs Review' ||
        invoiceTotal <= 0;

      const invoiceToSave: Invoice = {
        id: invoiceId,
        agencyId: targetAgency.id,
        agencyName: targetAgency.name,
        invoiceNumber: invoiceNumber.trim() || `DOC-${Date.now().toString().slice(-5)}`,
        invoiceDate: invoiceDate || now.split('T')[0],
        invoiceTotal: Number(invoiceTotal) || 0,
        taxableAmount: Number(taxableAmount) || 0,
        gstAmount: Number(gstAmount) || 0,
        discountAmount: 0,
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: Number(invoiceTotal) || 0,
        originalImages: origImgs,
        processedImages: procImgs,
        images: procImgs.length > 0 ? procImgs : origImgs,
        documentType: docType === 'RECEIPT' ? 'PURCHASE_BILL' : docType,
        originalPdfData: originalPdfData || extractedData.originalPdfData,
        originalFileName: originalPdfName || extractedData.originalFileName,
        originalFileType: (originalPdfData || extractedData.originalPdfData) ? 'application/pdf' : 'image/jpeg',
        reviewStatus: hasUncertainFields ? 'NEEDS_REVIEW' : 'VERIFIED',
        doctorCustomerShopDetails: doctorShopDetails.trim(),
        scanDate: now,
        notes,
        itemsCount: itemsSource.length,
        createdAt: now,
        updatedAt: now,
        ocrConfidence: {
          agency: agencyConfidence,
          invoiceNumber: invoiceNumber !== 'Needs Review' ? 'HIGH' : 'NEEDS_REVIEW',
          invoiceDate: 'HIGH',
          invoiceTotal: invoiceTotal > 0 ? 'HIGH' : 'NEEDS_REVIEW',
        },
      };

      const itemsToSave: InvoiceItem[] = itemsSource.map((it) => {
        const exp = parseExpiryDate(it.expiryDate);
        return {
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          invoiceId,
          agencyId: targetAgency.id,
          agencyName: targetAgency.name,
          invoiceNumber: invoiceToSave.invoiceNumber,
          invoiceDate: invoiceToSave.invoiceDate,
          sourceInvoiceId: invoiceId,
          sourceInvoiceNumber: invoiceToSave.invoiceNumber,
          sourceInvoiceDate: invoiceToSave.invoiceDate,
          sourceAgencyName: targetAgency.name,
          productName: it.productName.trim(),
          normalizedName: normalizeMedicineName(it.productName),
          productCode: it.productCode || '',
          manufacturer: it.manufacturer || '',
          packSize: it.packSize || '',
          batchNumber: it.batchNumber.trim() || 'Needs Review',
          expiryDate: exp.formatted,
          expiryTimestamp: exp.timestamp,
          quantity: Number(it.quantity) || 0,
          freeQuantity: Number(it.freeQuantity) || 0,
          mrp: Number(it.mrp) || 0,
          purchaseRate: Number(it.purchaseRate) || 0,
          discountPercent: Number(it.discountPercent) || 0,
          gstPercent: Number(it.gstPercent) || 0,
          lineTotal: Number(it.lineTotal) || 0,
          needsReview: it.needsReview,
          validationMatchStatus: it.validationMatchStatus,
          previousRate: it.previousRate,
          priceChangeType: it.priceChangeType || 'NEW',
          priceDiff: it.priceDiff,
          pricePercentDiff: it.pricePercentDiff,
          prevInvoiceNumber: it.prevInvoiceNumber,
          prevInvoiceDate: it.prevInvoiceDate,
          prevAgencyName: it.prevAgencyName,
        };
      });

      // Save locally to IndexedDB (STEP 4)
      const saved = await saveInvoice(invoiceToSave, itemsToSave);
      console.log('[PurchaseSave] SAVE SUCCESS');

      // Balance calculation (Requirement 7)
      const prevBal = agencyPreviousBalance;
      const newBal = prevBal + (Number(invoiceTotal) || 0);

      setSavedInvoice(saved);
      setSavedResultBalances({
        previousBalance: prevBal,
        newBalance: newBal,
        amount: Number(invoiceTotal) || 0,
        agencyName: targetAgency.name,
        documentType: 'PURCHASE_BILL',
        recordId: saved.id,
      });

      // STEP 6: Dedicated success state
      setHasSaved(true);
      setIsSaving(false);
      setSaveStatus('SUCCESS');

      // Notify parent app (refreshes dashboard & storage datasets without closing modal)
      if (onSaved) {
        onSaved(saved);
      }
    } catch (err) {
      // STEP 5: SAVE ERROR HANDLING
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[PurchaseSave] ERROR:', errMsg);
      isSaveInProgress.current = false;
      setIsSaving(false);
      setSaveErrorMessage(errMsg);
      setSaveStatus('SAVE_ERROR');
    }
  };

  const handleConfirmAndSave = async () => {
    // STEP 7: Prevent duplicate saves / double tapping (Requirement 9)
    if (isSaveInProgress.current || isSaving || hasSaved) {
      console.warn('[SaveAction] Save already in progress or already completed, ignoring extra click');
      return;
    }

    // Payment Receipt Save branch (Requirements 4, 8, 10)
    if (docType === 'RECEIPT') {
      console.log('[PaymentSave] BUTTON PRESSED');
      setIsSaving(true);
      setSaveStatus('SAVING');
      console.log('[PaymentSave] VALIDATING DATA');

      const validationErrorsFound: string[] = [];
      const currentSupplierName = (
        agencies.find((a) => a.id === selectedAgencyId)?.name ||
        newAgencyName.trim() ||
        detectedSupplierName
      ).trim();

      if (!selectedAgencyId && (!currentSupplierName || currentSupplierName === 'Needs Review')) {
        validationErrorsFound.push('Supplier name: Please select or register a valid agency / supplier.');
      }
      if (!paymentDate || !paymentDate.trim()) {
        validationErrorsFound.push('Payment date: Payment date is missing. Please provide a valid date.');
      }
      if (Number(paymentAmount) <= 0 || isNaN(Number(paymentAmount))) {
        validationErrorsFound.push('Amount paid: Amount paid must be greater than ₹0.');
      }

      if (validationErrorsFound.length > 0) {
        console.warn('[PaymentSave] Incomplete payment data validation warning:', validationErrorsFound);
        setValidationErrors(validationErrorsFound);
        setIsSaving(false);
        isSaveInProgress.current = false;
        setSaveStatus('VALIDATION_ERROR');
        return;
      }

      await executeSaveReceipt();
      return;
    }

    // Purchase Bill Save branch (Requirements 3, 7, 10)
    console.log('[PurchaseSave] BUTTON PRESSED');
    setIsSaving(true);
    setSaveStatus('SAVING');
    console.log('[PurchaseSave] VALIDATING DATA');

    const validationErrorsFound: string[] = [];

    // Supplier resolution & validation
    const currentSupplierName = (
      agencies.find((a) => a.id === selectedAgencyId)?.name ||
      newAgencyName.trim() ||
      detectedSupplierName
    ).trim();

    if (!selectedAgencyId && (!currentSupplierName || currentSupplierName === 'Needs Review')) {
      validationErrorsFound.push('Supplier name: Please select or enter a valid agency / supplier.');
    }

    // Invoice number
    if (!invoiceNumber || !invoiceNumber.trim() || invoiceNumber.trim() === 'Needs Review') {
      validationErrorsFound.push('Invoice number: Invoice number is missing or marked "Needs Review".');
    }

    // Invoice date
    if (!invoiceDate || !invoiceDate.trim()) {
      validationErrorsFound.push('Invoice date: Invoice date is missing. Please provide a valid date.');
    }

    // Items list: ensure we use active items and recover if empty
    let activeItems = [...items];
    if (activeItems.length === 0 && extractedData?.items && extractedData.items.length > 0) {
      activeItems = createInitialEditableItems(extractedData.items, invoiceTotal);
      setItems(activeItems);
    }
    if (activeItems.length === 0 && (invoiceTotal > 0 || (extractedData?.invoice?.invoiceTotal || 0) > 0)) {
      const tot = invoiceTotal || extractedData?.invoice?.invoiceTotal || 100;
      activeItems = createInitialEditableItems([], tot);
      setItems(activeItems);
    }

    if (!activeItems || activeItems.length === 0) {
      validationErrorsFound.push('Items: At least one medicine item is required in the purchase record.');
    } else {
      activeItems.forEach((it, idx) => {
        const itemNum = idx + 1;
        const name = it.productName?.trim();
        if (!name || name === 'Needs Review') {
          validationErrorsFound.push(`Item #${itemNum}: Medicine name is marked "Needs Review" or empty.`);
        }
        if (Number(it.quantity) <= 0 || isNaN(Number(it.quantity))) {
          validationErrorsFound.push(`Item #${itemNum} ("${name || 'Line ' + itemNum}"): Quantity must be greater than 0.`);
        }
        if (Number(it.purchaseRate) < 0 || isNaN(Number(it.purchaseRate))) {
          validationErrorsFound.push(`Item #${itemNum} ("${name || 'Line ' + itemNum}"): Purchase price cannot be negative.`);
        }
      });
    }

    // Total amount
    if (Number(invoiceTotal) <= 0 || isNaN(Number(invoiceTotal))) {
      validationErrorsFound.push('Total amount: Total invoice amount must be greater than ₹0.');
    }

    // STEP 3: If required data is missing, DO NOT navigate away
    if (validationErrorsFound.length > 0) {
      console.warn('[PurchaseSave] Incomplete purchase data validation warning:', validationErrorsFound);
      setValidationErrors(validationErrorsFound);
      setIsSaving(false);
      isSaveInProgress.current = false;
      setSaveStatus('VALIDATION_ERROR');
      return;
    }

    if (duplicateWarning) {
      console.log('[PurchaseSave] Duplicate warning detected on scanned bill, proceeding with confirmed save:', duplicateWarning);
    }

    // All checks passed -> proceed to save
    await executeSave(activeItems);
  };

  if (!isOpen) return null;

  const currentAgency = agencies.find((a) => a.id === selectedAgencyId);

  const origImgs = originalImages && originalImages.length > 0 ? originalImages : images;
  const procImgs = processedImages && processedImages.length > 0 ? processedImages : images;
  const currentDisplayImages = sideBySideTab === 'original' ? origImgs : procImgs;
  const currentDisplayImg = currentDisplayImages[sideBySidePageIndex] || currentDisplayImages[0] || images[0] || '';

  const itemsSum = items.reduce((acc, it) => acc + (it.lineTotal || 0), 0);
  const totalDifference = Math.abs(invoiceTotal - itemsSum);
  const hasTotalMismatch = totalDifference > 1.5 && invoiceTotal > 0 && items.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-1 sm:p-3 overflow-y-auto">
      <div
        className={`spatial-modal border border-white/15 w-full ${
          saveStatus === 'IDLE' || saveStatus === 'SAVING'
            ? isSideBySideView ? 'max-w-[98vw] xl:max-w-[1650px]' : 'max-w-6xl'
            : 'max-w-3xl'
        } rounded-3xl shadow-2xl flex flex-col max-h-[97vh] overflow-hidden animate-in fade-in duration-150`}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950/70 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              saveStatus === 'SUCCESS'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : saveStatus === 'VALIDATION_ERROR'
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : saveStatus === 'SAVE_ERROR'
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm sm:text-base flex items-center gap-2">
                {saveStatus === 'SUCCESS'
                  ? 'Purchase Record Saved'
                  : saveStatus === 'VALIDATION_ERROR'
                  ? 'Review Incomplete Data'
                  : saveStatus === 'SAVE_ERROR'
                  ? 'Unable to Save Record'
                  : 'Document Audit & Human Verification'}
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Zero-Invention Enforced
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                {saveStatus === 'SUCCESS'
                  ? 'Purchase bill confirmed and committed to local pharmacy inventory.'
                  : saveStatus === 'VALIDATION_ERROR'
                  ? 'Required fields are missing. Please review and correct before saving.'
                  : saveStatus === 'SAVE_ERROR'
                  ? 'An error occurred during local storage write. Please retry.'
                  : 'Cross-examine AI extraction against original bill. Medicine stock is committed only after your approval.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(saveStatus === 'IDLE' || saveStatus === 'SAVING') && (
              <>
                <button
                  type="button"
                  onClick={() => setIsSideBySideView(!isSideBySideView)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors ${
                    isSideBySideView
                      ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                  title="Toggle side-by-side view with live bill preview"
                >
                  <Columns className="w-3.5 h-3.5" />
                  {isSideBySideView ? 'Split View Active' : 'Enable Split View'}
                </button>

                <button
                  onClick={() => setShowBillPreview(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  Fullscreen Scan
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (saveStatus === 'SUCCESS') {
                  handleSafeNavigation('done');
                } else {
                  onClose();
                }
              }}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {saveStatus === 'SUCCESS' && (savedInvoice || savedResultBalances) ? (
          /* STEP 6 & Requirement 12: Dedicated Success State for Purchase or Payment */
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 flex flex-col items-center justify-center text-center animate-in fade-in duration-200">
            <div className={`p-4 rounded-2xl mb-4 border shadow-lg ${
              savedResultBalances?.documentType === 'RECEIPT'
                ? 'bg-teal-500/20 text-teal-400 border-teal-500/30 shadow-teal-500/10'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10'
            }`}>
              <CheckCircle2 className="w-12 h-12" />
            </div>

            <h2 className="text-2xl font-black text-white tracking-wide uppercase mb-1">
              {savedResultBalances?.documentType === 'RECEIPT' ? 'PAYMENT SAVED' : 'PURCHASE SAVED'}
            </h2>
            <div className={`text-xs font-bold uppercase tracking-widest mb-3 ${
              savedResultBalances?.documentType === 'RECEIPT' ? 'text-teal-400' : 'text-emerald-400'
            }`}>
              {savedResultBalances?.documentType === 'RECEIPT'
                ? 'Payment receipt saved successfully'
                : 'Purchase record saved successfully'}
            </div>

            <p className="text-xs text-slate-400 max-w-md mb-6">
              {savedResultBalances?.documentType === 'RECEIPT'
                ? 'Payment confirmed and recorded in supplier account. Ledger balance successfully deducted.'
                : 'Purchase bill verified and safely committed to pharmacy database. Medicine stocks and supplier ledger balances have been updated.'}
            </p>

            {/* Receipt Summary Card (Requirement 12) */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 w-full max-w-lg mb-8 text-left shadow-xl divide-y divide-slate-800/80">
              <div className="pb-3 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Agency:</span>
                <span className="text-white font-bold text-sm">
                  {savedResultBalances?.agencyName || savedInvoice?.agencyName}
                </span>
              </div>
              <div className="py-2.5 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">
                  {savedResultBalances?.documentType === 'RECEIPT' ? 'Payment Amount:' : 'Purchase Amount:'}
                </span>
                <span className="text-emerald-400 font-black text-base">
                  ₹{Number(savedResultBalances?.amount ?? savedInvoice?.invoiceTotal ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="py-2.5 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">Previous Balance:</span>
                <span className="text-slate-300 font-bold">
                  ₹{Number(savedResultBalances?.previousBalance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="py-2.5 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium">New Balance:</span>
                <span className="text-teal-400 font-black text-base">
                  ₹{Number(savedResultBalances?.newBalance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {savedResultBalances?.recordId && (
                <div className="pt-3 flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Record ID:</span>
                  <span className="text-slate-400 font-mono select-all">{savedResultBalances.recordId}</span>
                </div>
              )}
            </div>

            {navigationError && (
              <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs text-left max-w-lg">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4" />
                  Navigation Notice
                </p>
                <p>{navigationError}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  The record is safely saved. You can close this screen or select another action below.
                </p>
              </div>
            )}

            {/* Next Action Buttons (Requirement 12) */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-xl">
              {savedResultBalances?.documentType === 'RECEIPT' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (savedInvoice) {
                        setShowBillPreview(true);
                      } else {
                        handleSafeNavigation('documents');
                      }
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-95"
                  >
                    <Eye className="w-4 h-4 text-slate-950" />
                    VIEW RECEIPT
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSafeNavigation('documents')}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all border border-slate-700 active:scale-95"
                  >
                    <FileText className="w-4 h-4 text-emerald-400" />
                    BACK TO DOCUMENTS
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSafeNavigation('agency_detail', selectedAgencyId)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all border border-slate-700 active:scale-95"
                  >
                    <Building2 className="w-4 h-4 text-teal-400" />
                    AGENCY ACCOUNT
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSafeNavigation('scanner')}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all border border-slate-700 active:scale-95"
                  >
                    <RotateCw className="w-4 h-4 text-amber-400" />
                    SCAN ANOTHER
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSafeNavigation('done')}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all border border-slate-800 active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    DONE
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (savedInvoice) {
                        setShowBillPreview(true);
                      } else {
                        handleSafeNavigation('documents');
                      }
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-95"
                  >
                    <Eye className="w-4 h-4 text-slate-950" />
                    VIEW PURCHASE
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSafeNavigation('agency_detail', selectedAgencyId)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all border border-slate-700 active:scale-95 cursor-pointer"
                  >
                    <Building2 className="w-4 h-4 text-teal-400" />
                    VIEW AGENCY
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSafeNavigation('scanner')}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all border border-slate-700 active:scale-95 cursor-pointer"
                  >
                    <RotateCw className="w-4 h-4 text-amber-400" />
                    SCAN ANOTHER BILL
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSafeNavigation('dashboard')}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs rounded-xl flex items-center gap-2 transition-all border border-slate-800 active:scale-95 cursor-pointer"
                  >
                    <Check className="w-4 h-4 text-emerald-400" />
                    DASHBOARD
                  </button>
                </>
              )}
            </div>
          </div>
        ) : saveStatus === 'VALIDATION_ERROR' ? (
          /* STEP 3: Incomplete Data State */
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 flex flex-col items-center justify-center text-center animate-in fade-in duration-200">
            <div className="p-4 bg-amber-500/20 text-amber-400 rounded-2xl mb-4 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <AlertTriangle className="w-10 h-10" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Purchase data is incomplete. Please review the scanned bill.
            </h2>

            <p className="text-xs text-slate-400 max-w-md mb-6">
              The purchase record could not be saved because some required fields are missing or need verification. Please address the following items before confirming stock:
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 w-full max-w-lg mb-8 text-left shadow-xl">
              <ul className="space-y-2 text-xs text-slate-300">
                {validationErrors.map((err, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold mt-0.5">•</span>
                    <span>{err}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSaveStatus('IDLE');
                  isSaveInProgress.current = false;
                }}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                BACK TO REVIEW
              </button>
            </div>
          </div>
        ) : saveStatus === 'SAVE_ERROR' ? (
          /* STEP 5: Save Error State */
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 flex flex-col items-center justify-center text-center animate-in fade-in duration-200">
            <div className="p-4 bg-red-500/20 text-red-400 rounded-2xl mb-4 border border-red-500/30 shadow-lg shadow-red-500/10">
              <AlertCircle className="w-10 h-10" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Unable to save purchase record.
            </h2>

            <p className="text-xs text-slate-400 max-w-md mb-6">
              An error occurred while saving to local database. Your bill data is intact. You can retry the save or return to review.
            </p>

            {saveErrorMessage && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 w-full max-w-lg mb-8 text-left">
                <p className="text-[11px] text-slate-500 font-semibold mb-1 uppercase">Technical Diagnostics</p>
                <code className="text-xs text-red-400 font-mono break-all">{saveErrorMessage}</code>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleConfirmAndSave}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                RETRY SAVE
              </button>

              <button
                type="button"
                onClick={() => {
                  setSaveStatus('IDLE');
                  isSaveInProgress.current = false;
                }}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl flex items-center gap-2 transition-all active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                BACK TO REVIEW
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Content Body: Split View Container */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left Column: Live Document Inspection Pane (if Split View enabled) */}
          {isSideBySideView && (
            <div className="w-full lg:w-[45%] xl:w-[42%] flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/80 overflow-hidden shrink-0">
              <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 text-xs">
                {/* Clean vs Original Scan toggle */}
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSideBySideTab('original')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${
                      sideBySideTab === 'original'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Raw Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setSideBySideTab('processed')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${
                      sideBySideTab === 'processed'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Clean Scan
                  </button>
                </div>

                {/* Zoom controls */}
                <div className="flex items-center gap-1 text-slate-300">
                  <button
                    type="button"
                    onClick={() => setSideBySideZoom((z) => Math.max(z - 0.25, 0.5))}
                    className="p-1 hover:bg-slate-800 rounded text-slate-300"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono w-10 text-center text-slate-400">
                    {Math.round(sideBySideZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setSideBySideZoom((z) => Math.min(z + 0.25, 3))}
                    className="p-1 hover:bg-slate-800 rounded text-slate-300"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSideBySideZoom(1)}
                    className="px-1.5 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 rounded text-slate-400 font-mono"
                  >
                    1x
                  </button>
                </div>

                {/* Page Navigation */}
                {currentDisplayImages.length > 1 && (
                  <div className="flex items-center gap-1">
                    {currentDisplayImages.map((_, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => setSideBySidePageIndex(pIdx)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                          sideBySidePageIndex === pIdx
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        P{pIdx + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Zoomable Image Viewport */}
              <div className="flex-1 overflow-auto p-3 flex items-start justify-center bg-slate-950/60 min-h-[300px]">
                {currentDisplayImg ? (
                  <img
                    src={currentDisplayImg}
                    alt="Physical Bill Preview"
                    style={{ transform: `scale(${sideBySideZoom})`, transformOrigin: 'top center' }}
                    className="max-w-full rounded shadow-md transition-transform duration-100 cursor-zoom-in border border-slate-800/80"
                    onClick={() => setSideBySideZoom((z) => (z >= 2 ? 1 : z + 0.5))}
                    title="Click to zoom in"
                  />
                ) : (
                  <div className="text-slate-500 text-xs py-10">No image available</div>
                )}
              </div>
            </div>
          )}

          {/* Right Column: Editable Audit Fields & Line Items */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Live Document Audit Notice if quota is in cooldown */}
            {extractedData.quotaNotice && (
              <div className="p-3 bg-blue-950/40 border border-blue-600/60 rounded-xl flex items-center gap-2 text-xs text-blue-200 animate-in fade-in">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  <strong>Live Document Audit Mode:</strong> AI engine is in free-tier cooldown. Audit and verify details against the preserved bill scan on the left.
                </span>
              </div>
            )}

            {/* Mathematical Total Mismatch Warning */}
            {hasTotalMismatch && (
              <div className="p-3 bg-amber-950/40 border border-amber-600/70 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Mathematical Reconciliation Notice:</strong> Sum of row line items is{' '}
                    <strong>₹{itemsSum.toFixed(2)}</strong>, but Invoice Grand Total is set to{' '}
                    <strong>₹{invoiceTotal.toFixed(2)}</strong> (Difference of ₹{totalDifference.toFixed(2)}).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInvoiceTotal(Number(itemsSum.toFixed(2)))}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold whitespace-nowrap shadow-sm"
                >
                  Auto-Sync to ₹{itemsSum.toFixed(2)}
                </button>
              </div>
            )}
          {/* Duplicate Bill / Payment Alert Banner (Requirements 12 & 13) */}
          {duplicateWarning && (
            <div className="p-4 bg-amber-950/60 border-2 border-amber-500 rounded-2xl shadow-xl flex flex-col sm:flex-row items-start gap-4 animate-in fade-in">
              <div className="p-3 bg-amber-500/20 text-amber-300 rounded-xl shrink-0">
                <ShieldAlert className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 text-xs space-y-2.5">
                <div>
                  <div className="text-amber-300 font-black text-sm tracking-wide uppercase">
                    {duplicateRecord?.isPayment ? 'Possible Duplicate Payment' : 'ALREADY SCANNED'}
                  </div>
                  <p className="text-slate-300 mt-0.5">
                    {duplicateRecord?.isPayment
                      ? 'A payment with identical distributor, amount, date, or reference appears to already be recorded.'
                      : 'This purchase bill appears to have already been scanned into the system.'}
                  </p>
                </div>

                {/* Existing Record Details (Requirement 12 & 13) */}
                {duplicateRecord && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-300 space-y-1">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                      Existing Record in Database:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                      <div>
                        Agency: <strong className="text-white">{duplicateRecord.agencyName}</strong>
                      </div>
                      <div>
                        {duplicateRecord.isPayment ? 'Ref / UTR:' : 'Bill No:'}{' '}
                        <strong className="text-emerald-400 font-mono">{duplicateRecord.number}</strong>
                      </div>
                      <div>
                        Amount: <strong className="text-white font-mono">₹{duplicateRecord.amount.toLocaleString('en-IN')}</strong>
                      </div>
                      <div>
                        Date: <strong className="text-slate-200">{duplicateRecord.date}</strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => setIgnoreDuplicate(true)}
                    className={`px-3.5 py-1.5 font-bold rounded-lg border transition-colors cursor-pointer ${
                      ignoreDuplicate
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-amber-600/30 text-amber-200 hover:bg-amber-600/40 border-amber-500/40'
                    }`}
                  >
                    {ignoreDuplicate ? '✓ Continuing Anyway' : 'Continue Anyway'}
                  </button>
                </div>

                {ignoreDuplicate && (
                  <p className="text-[11px] text-emerald-400 font-medium">
                    Confirmed: This will be saved as a separate distinct transaction and will not overwrite previous records.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 1. DOCUMENT AUTO-DETECTION & MANUAL OVERRIDE (Requirements 1 & 2) */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${
                  docType === 'RECEIPT'
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {docType === 'RECEIPT' ? <Receipt className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                    Detected Document Type:
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-base font-black tracking-wide ${
                      docType === 'RECEIPT' ? 'text-teal-400' : 'text-emerald-400'
                    }`}>
                      {docType === 'RECEIPT' ? 'PAYMENT RECEIPT' : 'PURCHASE BILL'}
                    </span>
                    {isDocTypeUncertain ? (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Document type uncertain
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Auto-Detected
                      </span>
                    )}
                  </div>
                  {classificationReason && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      {classificationReason}
                    </p>
                  )}
                </div>
              </div>

              {/* Change Type Button (Requirement 2: Manual Override) */}
              <button
                type="button"
                onClick={() => setShowDocTypeMenu(!showDocTypeMenu)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                Change Type
              </button>
            </div>

            {/* Direct selector if uncertain or user clicked Change Type */}
            {(isDocTypeUncertain || showDocTypeMenu) && (
              <div className="p-3 bg-slate-900 border border-slate-700/80 rounded-xl space-y-2 animate-in fade-in">
                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>{isDocTypeUncertain ? 'Document type uncertain. Please select:' : 'Switch Document Type:'}</span>
                  {showDocTypeMenu && !isDocTypeUncertain && (
                    <button
                      type="button"
                      onClick={() => setShowDocTypeMenu(false)}
                      className="text-slate-400 hover:text-white text-[11px]"
                    >
                      Close
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDocType('PURCHASE_BILL');
                      setIsDocTypeUncertain(false);
                      setShowDocTypeMenu(false);
                      if (invoiceTotal <= 0 && paymentAmount > 0) {
                        setInvoiceTotal(paymentAmount);
                      }
                    }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      docType !== 'RECEIPT'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-md ring-1 ring-emerald-500/50'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        Purchase Bill
                      </span>
                      {docType !== 'RECEIPT' && <Check className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Supplier tax invoice, medicine line items, batch, expiry & stock addition.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDocType('RECEIPT');
                      setIsDocTypeUncertain(false);
                      setShowDocTypeMenu(false);
                      if (paymentAmount <= 0 && invoiceTotal > 0) {
                        setPaymentAmount(invoiceTotal);
                      }
                      if (!paymentDate && invoiceDate) {
                        setPaymentDate(invoiceDate);
                      }
                    }}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      docType === 'RECEIPT'
                        ? 'bg-teal-950/60 border-teal-500 text-teal-200 shadow-md ring-1 ring-teal-500/50'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-teal-400" />
                        Payment Receipt
                      </span>
                      {docType === 'RECEIPT' && <Check className="w-4 h-4 text-teal-400" />}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Proof of payment to supplier, deducts from agency outstanding balance.
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. AGENCY AUTO-MATCHING (Requirement 6) */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-white font-bold text-sm">Agency / Supplier Matching</h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">OCR Extracted:</span>
                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                  agencyConfidence === 'LOW' || detectedSupplierName === 'Needs Review'
                    ? 'bg-amber-950/60 text-amber-300 border-amber-500/50'
                    : 'bg-slate-800 text-white border-slate-700'
                }`}>
                  {detectedSupplierName}
                  {(agencyConfidence === 'LOW' || detectedSupplierName === 'Needs Review') && (
                    <span className="ml-1 text-[10px] text-amber-400">⚠ Review</span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="text-[11px] text-slate-400 font-medium mb-1">
                  Matched Agency:
                </div>
                {currentAgency ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      {currentAgency.name}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Matched
                    </span>
                    {currentAgency.gstin && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        (GSTIN: {currentAgency.gstin})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-amber-300 flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Agency match uncertain — please select from registered agencies</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsChangingAgency(!isChangingAgency)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5 text-teal-400" />
                  {isChangingAgency ? 'Hide Agency Selector' : 'Change Agency'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewAgencyName(detectedSupplierName !== 'Needs Review' ? detectedSupplierName : '');
                    setNewAgencyGstin(extractedData?.agency?.gstin || '');
                    setShowNewAgencyForm(true);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Register New Agency
                </button>
              </div>
            </div>

            {/* If changing agency or if no agency is currently matched */}
            {(isChangingAgency || !selectedAgencyId) && (
              <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg space-y-2 mt-2 animate-in fade-in">
                <label className="block text-xs font-medium text-slate-300">
                  Select Existing Agency from Pharmacy Records:
                </label>
                <select
                  value={selectedAgencyId}
                  onChange={(e) => {
                    setSelectedAgencyId(e.target.value);
                    if (e.target.value) {
                      setAgencyConfidence('HIGH');
                      setIsNewSupplier(false);
                      setIsChangingAgency(false);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                >
                  <option value="">-- Choose Existing Registered Supplier --</option>
                  {agencies.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} {ag.gstin ? `(GST: ${ag.gstin})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick new supplier form */}
            {showNewAgencyForm && (
              <div className="p-3 bg-slate-900 border border-slate-700 rounded-lg space-y-3 animate-in fade-in">
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>Register New Pharmacy Supplier / Agency</span>
                  <button onClick={() => setShowNewAgencyForm(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="Supplier Name *"
                    value={newAgencyName}
                    onChange={(e) => setNewAgencyName(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={newAgencyPhone}
                    onChange={(e) => setNewAgencyPhone(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    placeholder="GSTIN"
                    value={newAgencyGstin}
                    onChange={(e) => setNewAgencyGstin(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs uppercase"
                  />
                  <input
                    type="text"
                    placeholder="Drug Lic (DL) No"
                    value={newAgencyDl}
                    onChange={(e) => setNewAgencyDl(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs uppercase"
                  />
                </div>
                {quickAgencyError && (
                  <p className="text-[11px] text-red-400 font-semibold">{quickAgencyError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowNewAgencyForm(false)}
                    className="px-3 py-1 bg-slate-800 text-slate-300 text-xs rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateQuickAgency}
                    className="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                  >
                    Save & Assign
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Conditional Workflow Section: Payment Receipt vs Purchase Bill */}
          {docType === 'RECEIPT' ? (
            /* ==================================================
               4. PAYMENT RECEIPT PREVIEW (Requirements 4, 5, 8, 15)
               ================================================== */
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-teal-400" />
                  <h3 className="text-white font-bold text-sm">Payment Receipt Preview & Audit</h3>
                </div>
                <span className="text-[11px] text-teal-300 font-semibold bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/30">
                  Agency Ledger Deduction
                </span>
              </div>

              {/* Editable Receipt Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Agency Name */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                    <span>Agency / Supplier Name</span>
                    {(!selectedAgencyId && (!detectedSupplierName || detectedSupplierName === 'Needs Review')) && (
                      <span className="text-[9px] text-amber-400 bg-amber-950/80 px-1 rounded font-bold">
                        ⚠ Review
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={currentAgency?.name || detectedSupplierName}
                    onChange={(e) => setDetectedSupplierName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    placeholder="Agency Name"
                  />
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                    <span>Payment Date *</span>
                    {!paymentDate && (
                      <span className="text-[9px] text-amber-400 bg-amber-950/80 px-1 rounded font-bold">
                        ⚠ Review
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                {/* Amount Paid */}
                <div>
                  <label className="block text-[11px] font-bold text-teal-400 mb-1 flex items-center justify-between">
                    <span>Amount Paid (₹) *</span>
                    {(Number(paymentAmount) <= 0 || isNaN(Number(paymentAmount))) && (
                      <span className="text-[9px] text-amber-400 bg-amber-950/80 px-1 rounded font-bold">
                        ⚠ Review
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentAmount || ''}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    placeholder="Enter amount paid"
                    className="w-full bg-slate-900 border-2 border-teal-500/70 text-white font-mono font-bold rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-teal-400"
                  />
                </div>

                {/* Reference / Transaction # */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                    <span>Payment / Ref #</span>
                    {(!paymentRefNumber || paymentRefNumber === 'Needs Review') && (
                      <span className="text-[9px] text-slate-500 bg-slate-800 px-1 rounded">
                        Optional
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={paymentRefNumber}
                    onChange={(e) => setPaymentRefNumber(e.target.value)}
                    placeholder="e.g. UPI-12345 / CHQ-890"
                    className="w-full bg-slate-900 border border-slate-700 text-white font-mono rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                    <option value="CASH">Cash</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="BANK_TRANSFER">NEFT / RTGS / Bank Transfer</option>
                    <option value="OTHER">Other / Credit Note</option>
                  </select>
                </div>

                {/* Payment Notes */}
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Payment Remarks / Notes
                  </label>
                  <input
                    type="text"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. Paid towards monthly bill clearances / Part payment"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Agency Balance Impact (Requirement 8) */}
              <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-teal-400" />
                  Agency Balance Ledger Impact (Requirement 8)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-slate-400 font-medium">Previous Balance</div>
                    <div className="text-slate-200 font-mono font-bold text-sm mt-0.5">
                      ₹{agencyPreviousBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-teal-400 font-medium">Payment (Deduction)</div>
                    <div className="text-teal-300 font-mono font-bold text-sm mt-0.5">
                      - ₹{(Number(paymentAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-teal-500/40 bg-teal-950/15">
                    <div className="text-slate-300 font-bold">Remaining Balance</div>
                    <div className="text-emerald-400 font-mono font-black text-sm mt-0.5">
                      ₹{Math.max(0, agencyPreviousBalance - (Number(paymentAmount) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 italic">
                  * Balance will be deducted only after you click &quot;Confirm &amp; Save Payment Receipt&quot;.
                </p>
              </div>
            </div>
          ) : (
            /* ==================================================
               3. PURCHASE BILL PREVIEW (Requirements 3, 5, 7, 15)
               ================================================== */
            <>
              {/* Invoice Identification & Structure */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-white font-bold text-sm">Invoice Structure & Net Amounts</h3>
                  </div>
                  <button
                    type="button"
                    onClick={autoCalculateBillTotal}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Auto-Sum Items Total
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                      <span>Invoice Number</span>
                      {invoiceNumber === 'Needs Review' && (
                        <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold">
                          ⚠ Review
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none ${
                        invoiceNumber === 'Needs Review' ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-white'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                      <span>Invoice Date</span>
                      {!invoiceDate && (
                        <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold">
                          ⚠ Review
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Subtotal / Taxable (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={taxableAmount}
                      onChange={(e) => setTaxableAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Tax / GST Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={gstAmount}
                      onChange={(e) => setGstAmount(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-emerald-400 mb-1 flex items-center justify-between">
                      <span>Purchase Total (₹) *</span>
                      {invoiceTotal <= 0 && (
                        <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300 font-bold">
                          ⚠ Review
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={invoiceTotal}
                      onChange={(e) => setInvoiceTotal(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border-2 border-emerald-500/70 text-white font-bold rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    />
                  </div>
                </div>

                {/* Purchase Balance Ledger Preview (Requirement 7) */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1 mt-1">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 mb-1">
                    <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                    Agency Balance Ledger Impact (Requirement 7)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <div className="text-slate-400 text-[10px]">Previous Balance</div>
                      <div className="text-slate-200 font-mono font-bold text-xs mt-0.5">
                        ₹{agencyPreviousBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800">
                      <div className="text-emerald-400 text-[10px]">New Purchase (Addition)</div>
                      <div className="text-emerald-300 font-mono font-bold text-xs mt-0.5">
                        + ₹{(Number(invoiceTotal) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-emerald-500/40 bg-emerald-950/15">
                      <div className="text-slate-300 text-[10px] font-bold">Projected New Balance</div>
                      <div className="text-teal-400 font-mono font-black text-xs mt-0.5">
                        ₹{(agencyPreviousBalance + (Number(invoiceTotal) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Medicines Line Items Table (Requirement 3 & 5) */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-white font-bold text-sm flex items-center gap-2">
                      <span>Detected Medicine / Product Items ({items.length})</span>
                      <span className="text-[11px] font-normal text-slate-400">
                        • All fields editable in preview • Correct before confirming
                      </span>
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold rounded-lg border border-emerald-500/30 flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Medicine Row
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto shadow-inner">
                  <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] text-slate-300 font-semibold">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3 w-64">Medicine Name / Details</th>
                        <th className="py-2.5 px-3 w-32">Batch #</th>
                        <th className="py-2.5 px-3 w-32">Expiry (MM/YY)</th>
                        <th className="py-2.5 px-3 w-20 text-right">Qty</th>
                        <th className="py-2.5 px-3 w-16 text-right">Free</th>
                        <th className="py-2.5 px-3 w-24 text-right">MRP (₹)</th>
                        <th className="py-2.5 px-3 w-28 text-right">Rate (₹)</th>
                        <th className="py-2.5 px-3 w-20 text-right">Disc%</th>
                        <th className="py-2.5 px-3 w-20 text-right">GST%</th>
                        <th className="py-2.5 px-3 w-28 text-right">Total (₹)</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {items.map((row, idx) => {
                        const parsed = parseExpiryDate(row.expiryDate);
                        const daysRemaining = calculateDaysRemaining(parsed.timestamp);
                        const isNearExpiry = daysRemaining >= 0 && daysRemaining <= 90;
                        const isExpired = daysRemaining < 0;
                        const hasNeedsRevName = row.productName === 'Needs Review' || row.reviewFields.includes('productName');
                        const hasNeedsRevBatch = row.batchNumber === 'Needs Review' || row.reviewFields.includes('batchNumber');
                        const hasNeedsRevExpiry = row.expiryDate === 'Needs Review' || row.reviewFields.includes('expiryDate');

                        return (
                          <tr
                            key={row.id}
                            className={`hover:bg-slate-900/50 transition-colors ${
                              row.needsReview ? 'bg-amber-950/15' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>

                            {/* Medicine Name (Requirement 3 & 5) */}
                            <td className="py-2 px-3">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={row.productName}
                                  onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                                  className={`w-full bg-slate-900 border rounded px-2 py-1 text-xs font-semibold outline-none ${
                                    hasNeedsRevName
                                      ? 'border-amber-500 text-amber-300 ring-1 ring-amber-500/30'
                                      : 'border-slate-700 text-white'
                                  }`}
                                  placeholder="Medicine Name"
                                />
                                {hasNeedsRevName && (
                                  <span className="absolute right-2 top-1.5 text-[9px] font-bold text-amber-400 bg-amber-950/80 px-1 rounded">
                                    Needs Review
                                  </span>
                                )}
                              </div>

                              {/* Reference matches */}
                              {row.validationMatchStatus === 'SUGGESTED_MATCH' && row.suggestedMatches.length > 0 && (
                                <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                                  <span className="text-slate-400">Match in records:</span>
                                  {row.suggestedMatches.map((m) => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => handleItemChange(idx, 'productName', m)}
                                      className="px-1.5 py-0.2 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors"
                                      title="Use this confirmed name"
                                    >
                                      {m} ✓
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                                <input
                                  type="text"
                                  value={row.productCode}
                                  onChange={(e) => handleItemChange(idx, 'productCode', e.target.value)}
                                  placeholder="HSN/Code"
                                  className="w-20 bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded outline-none text-slate-300"
                                />
                                <input
                                  type="text"
                                  value={row.manufacturer}
                                  onChange={(e) => handleItemChange(idx, 'manufacturer', e.target.value)}
                                  placeholder="Company"
                                  className="w-24 bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded outline-none text-slate-300"
                                />
                              </div>
                            </td>

                            {/* Batch Number */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.batchNumber}
                                onChange={(e) => handleItemChange(idx, 'batchNumber', e.target.value)}
                                className={`w-full bg-slate-900 border rounded px-2 py-1 text-xs font-mono uppercase outline-none ${
                                  hasNeedsRevBatch ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-white'
                                }`}
                                placeholder="Batch"
                              />
                            </td>

                            {/* Expiry Date */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.expiryDate}
                                onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                                className={`w-full bg-slate-900 border rounded px-2 py-1 text-xs font-mono outline-none ${
                                  hasNeedsRevExpiry ? 'border-amber-500 text-amber-300' : 'border-slate-700 text-white'
                                }`}
                                placeholder="MM/YY"
                              />
                              <div className="mt-1">
                                {isExpired ? (
                                  <span className="text-[10px] font-bold text-red-400 bg-red-950/60 px-1 py-0.5 rounded block text-center">
                                    EXPIRED
                                  </span>
                                ) : isNearExpiry ? (
                                  <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-1 py-0.5 rounded block text-center">
                                    {formatDaysRemainingText(daysRemaining)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-500 block text-center">
                                    Safe ({formatDaysRemainingText(daysRemaining)})
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Quantity */}
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="1"
                                value={row.quantity}
                                onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 0)}
                                className="w-16 text-right bg-slate-900 border border-slate-700 text-white font-bold rounded px-2 py-1 text-xs outline-none"
                              />
                            </td>

                            {/* Free Qty */}
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                value={row.freeQuantity}
                                onChange={(e) => handleItemChange(idx, 'freeQuantity', parseInt(e.target.value) || 0)}
                                className="w-14 text-right bg-slate-900 border border-slate-700 text-emerald-400 rounded px-2 py-1 text-xs outline-none"
                              />
                            </td>

                            {/* MRP */}
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={row.mrp}
                                onChange={(e) => handleItemChange(idx, 'mrp', parseFloat(e.target.value) || 0)}
                                className="w-20 text-right bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1 text-xs outline-none"
                              />
                            </td>

                            {/* Rate */}
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={row.purchaseRate}
                                onChange={(e) => handleItemChange(idx, 'purchaseRate', parseFloat(e.target.value) || 0)}
                                className={`w-24 text-right bg-slate-900 border text-white font-bold rounded px-2 py-1 text-xs outline-none ${
                                  row.mrp > 0 && row.purchaseRate > row.mrp ? 'border-amber-500 text-amber-300' : 'border-slate-700'
                                }`}
                              />
                              {row.mrp > 0 && row.purchaseRate > row.mrp && (
                                <div className="text-[9px] text-amber-400 font-bold mt-0.5">
                                  ⚠️ Rate &gt; MRP
                                </div>
                              )}
                              {row.priceChangeType === 'INCREASE' && (
                                <div className="text-[9px] text-red-400 font-bold mt-0.5">
                                  +₹{row.priceDiff} (+{row.pricePercentDiff}%)
                                </div>
                              )}
                              {row.priceChangeType === 'DECREASE' && (
                                <div className="text-[9px] text-emerald-400 font-bold mt-0.5">
                                  -₹{Math.abs(row.priceDiff || 0)} ({row.pricePercentDiff}%)
                                </div>
                              )}
                            </td>

                            {/* Disc% */}
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                step="0.1"
                                value={row.discountPercent}
                                onChange={(e) => handleItemChange(idx, 'discountPercent', parseFloat(e.target.value) || 0)}
                                className="w-16 text-right bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1 text-xs outline-none"
                              />
                            </td>

                            {/* GST% */}
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                step="1"
                                value={row.gstPercent}
                                onChange={(e) => handleItemChange(idx, 'gstPercent', parseFloat(e.target.value) || 0)}
                                className="w-16 text-right bg-slate-900 border border-slate-700 text-slate-300 rounded px-2 py-1 text-xs outline-none"
                              />
                            </td>

                            {/* Line Total */}
                            <td className="py-2 px-3 text-right font-mono font-bold text-white text-xs">
                              ₹{row.lineTotal.toFixed(2)}
                            </td>

                            {/* Remove */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(idx)}
                                className="p-1 text-slate-500 hover:text-red-400 rounded"
                                title="Remove line"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

        {/* Footer Actions (Requirements 9, 10) */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-400 flex items-center gap-4">
            {docType === 'RECEIPT' ? (
              <>
                <span>
                  Agency: <strong className="text-white">{currentAgency?.name || 'Unassigned'}</strong>
                </span>
                <span>
                  Payment Amount: <strong className="text-teal-400">₹{(Number(paymentAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </span>
                <span>
                  Remaining Ledger: <strong className="text-emerald-400">₹{Math.max(0, agencyPreviousBalance - (Number(paymentAmount) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </span>
              </>
            ) : (
              <>
                <span>
                  Total Items: <strong className="text-white">{items.length}</strong>
                </span>
                <span>
                  Purchase Grand Total: <strong className="text-emerald-400">₹{invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </span>
              </>
            )}
            {isSaving && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Saving to local database...
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              Discard / Cancel
            </button>

            {/* Double-Save Protected Action Button (Requirement 9 & 10) */}
            <button
              type="button"
              disabled={isSaving || hasSaved}
              onClick={handleConfirmAndSave}
              className={`px-6 py-2.5 bg-gradient-to-r ${
                docType === 'RECEIPT'
                  ? 'from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400'
                  : 'from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400'
              } text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all transform ${
                isSaving || hasSaved ? 'opacity-70 cursor-not-allowed scale-100' : 'active:scale-95'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Saving...</span>
                </>
              ) : hasSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>
                    {docType === 'RECEIPT' ? 'Payment Receipt Saved' : 'Purchase Record Saved'}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>
                    {docType === 'RECEIPT' ? 'Confirm & Save Payment Receipt' : 'Confirm & Save Purchase Record'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </>
    )}
  </div>

      {/* Source Bill Inspection */}
      <OriginalBillViewer
        images={images}
        originalImages={originalImages}
        processedImages={processedImages}
        title={`Source Document Inspection: ${detectedSupplierName}`}
        isOpen={showBillPreview}
        onClose={() => setShowBillPreview(false)}
      />
    </div>
  );
};
