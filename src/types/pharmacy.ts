/**
 * Pharmacy Bill Scanning and Purchase Management Types
 */

export interface Agency {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  dlNumber?: string; // Drug License Number (e.g., 20B/21B)
  paymentTermsDays?: number;
  notes?: string;
  scheduleOverride?: ScheduleManualOverride;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export type DocumentType =
  | 'TAX_INVOICE'
  | 'PURCHASE_BILL'
  | 'RECEIPT'
  | 'OPENING_DUE'
  | 'CREDIT_DEBIT_NOTE'
  | 'EXPIRY_RETURN'
  | 'OTHER';

export type ReviewStatus = 'VERIFIED' | 'NEEDS_REVIEW' | 'ARCHIVED';

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  agencyId: string;
  agencyName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  productName: string;
  normalizedName: string;
  productCode?: string; // HSN or product code
  manufacturer?: string;
  packSize?: string;
  batchNumber: string;
  expiryDate: string; // MM/YY or MM/YYYY
  expiryTimestamp: number; // Unix timestamp for sorting/filtering
  quantity: number;
  minStockLevel?: number; // Minimum stock threshold (Requirement 17)
  freeQuantity: number;
  mrp: number;
  purchaseRate: number; // PTR or purchase price per unit
  discountPercent: number;
  gstPercent: number;
  lineTotal: number;
  // Traceability to source invoice
  sourceInvoiceId?: string;
  sourceInvoiceNumber?: string;
  sourceInvoiceDate?: string;
  sourceAgencyName?: string;
  sourceDocumentImages?: string[];
  sourcePdfData?: string;
  // Review & Validation flags (Zero-Invention Guarantee)
  needsReview?: boolean;
  reviewFields?: string[];
  validationMatchStatus?: 'EXACT_MATCH' | 'SUGGESTED_MATCH' | 'NEW_MEDICINE' | 'NEEDS_REVIEW';
  suggestedMatches?: string[];
  userConfirmedMedicine?: boolean;
  userConfirmed?: boolean;
  // Price change detection info
  previousRate?: number;
  priceChangeType?: 'INCREASE' | 'DECREASE' | 'NO_CHANGE' | 'NEW';
  priceDiff?: number;
  pricePercentDiff?: number;
  prevInvoiceNumber?: string;
  prevInvoiceDate?: string;
  prevAgencyName?: string;
  // OCR confidence
  confidence?: {
    productName: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    batchNumber: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    expiryDate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    purchaseRate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    quantity: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
  };
}

export interface Invoice {
  id: string;
  agencyId: string;
  agencyName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  invoiceTotal: number;
  taxableAmount: number;
  gstAmount: number;
  discountAmount: number;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  balanceAmount: number;
  // Document preservation: Original Scan + Processed Readable Scan
  originalImages?: string[]; // Untouched original raw capture
  ocrImages?: string[]; // Internally optimized version for OCR
  processedImages?: string[]; // Perspective-corrected, cropped, readability-enhanced scan
  originalFileType?: string; // 'image/jpeg' | 'image/png' | 'application/pdf'
  originalFileName?: string;
  originalPdfData?: string; // Preserved raw original PDF file if uploaded as PDF
  selectablePdfText?: string; // Digital text if PDF had selectable text
  images: string[]; // Active display images (backward compatibility)
  documentType?: DocumentType;
  reviewStatus?: ReviewStatus;
  isArchived?: boolean;
  archivedAt?: string;
  doctorCustomerShopDetails?: string;
  scanDate?: string;
  needsReview?: boolean;
  reviewReasons?: string[];
  notes?: string;
  itemsCount: number;
  items?: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
  ocrConfidence?: {
    agency: 'HIGH' | 'LOW';
    invoiceNumber: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    invoiceDate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    invoiceTotal: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
  };
  possibleDuplicate?: boolean;
}

export type PaymentMethod = 'CASH' | 'UPI' | 'CHEQUE' | 'NEFT_RTGS' | 'BANK_TRANSFER';

export interface Payment {
  id: string;
  agencyId: string;
  agencyName: string;
  paymentDate: string; // YYYY-MM-DD
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string; // Cheque No, UPI Ref, UTR
  notes?: string;
  receiptImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  entityType: 'INVOICE' | 'PAYMENT' | 'AGENCY' | 'ITEM';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  description: string;
  oldValue?: string;
  newValue?: string;
  timestamp: string;
}

export type ExpiryCategory = 'EXPIRED' | '0_30' | '31_60' | '61_90' | '91_180' | 'SAFE';

export interface ExpiryItemSummary {
  item: InvoiceItem;
  category: ExpiryCategory;
  daysRemaining: number;
  expiryFormatted: string;
}

export interface PriceChangeRecord {
  id: string;
  productName: string;
  normalizedName: string;
  currentRate: number;
  previousRate: number;
  diff: number;
  percentDiff: number;
  type: 'INCREASE' | 'DECREASE' | 'NO_CHANGE' | 'NEW';
  currentInvoiceNumber: string;
  currentInvoiceDate: string;
  currentAgencyName: string;
  previousInvoiceNumber?: string;
  previousInvoiceDate?: string;
  previousAgencyName?: string;
}

export interface AgencyFinancialSummary {
  agency: Agency;
  openingDue: number; // Previous dues before app installation (Requirement 6)
  totalPurchase: number;
  totalPaid: number;
  outstandingBalance: number;
  invoicesCount: number;
  unpaidInvoicesCount: number;
  nearExpiryItemsCount: number;
  lastInvoiceDate?: string;
  lastPaymentDate?: string;
}

export interface OverallStats {
  totalOpeningDues: number;
  totalPurchases: number;
  totalPaid: number;
  totalOutstanding: number;
  lowStockCount: number; // medicines with stock <= minimum stock level (Requirement 17)
  nearExpiryCount: number; // items expiring <= 90 days
  criticalExpiryCount: number; // <= 30 days
  expiredCount: number;
  priceChangesCount: number;
  priceHikesCount: number;
  recentBillsCount: number;
}

export interface PharmacyUserSession {
  email: string;
  name: string;
  shopName?: string;
  phone?: string;
  avatar?: string;
  isAuthenticated: boolean;
  lastLoginAt: string;
  provider: 'google' | 'phone';
  isMasterAdmin?: boolean;
  drugLicenses?: {
    form20?: string;
    form21?: string;
    pharmacistName?: string;
    pharmacistRegNo?: string;
    renewalDate?: string;
  };
}

export interface CloudBackupSummary {
  userEmail: string;
  savedAt: string;
  agenciesCount: number;
  invoicesCount: number;
  openingDuesCount: number;
  paymentsCount: number;
  itemsCount: number;
  medicinesCount: number;
  scannedDocumentsCount: number;
  totalBalance: number;
}

export interface PreviousDueInput {
  agencyId: string;
  agencyName: string;
  amount: number;
  dueDate?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface ExtractedBillData {
  documentType?: DocumentType;
  classificationConfidence?: 'HIGH' | 'LOW';
  classificationReason?: string;
  isClassificationUncertain?: boolean;
  quotaNotice?: boolean;
  doctorCustomerShopDetails?: string;
  originalPdfData?: string;
  originalFileName?: string;
  originalFileType?: string;
  selectablePdfText?: string;
  agency: {
    detectedName: string;
    gstin?: string;
    address?: string;
    phone?: string;
    matchedAgencyId: string | null;
    agencyConfidence: 'HIGH' | 'LOW';
    isNewSupplier?: boolean;
    needsReview?: boolean;
    reasoning?: string;
  };
  invoice: {
    invoiceNumber: string;
    invoiceDate: string;
    invoiceTotal: number;
    taxableAmount: number;
    gstAmount: number;
    documentType?: DocumentType;
    needsReview?: boolean;
    confidence: {
      invoiceNumber: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
      invoiceDate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
      invoiceTotal: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    };
  };
  paymentReceipt?: {
    amountPaid: number;
    paymentDate: string;
    referenceNumber: string;
    paymentMethod: PaymentMethod;
    previousBalance?: number;
    remainingBalance?: number;
    notes?: string;
    confidence?: {
      amountPaid: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
      paymentDate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
      referenceNumber: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    };
  };
  items: Array<{
    productName: string;
    productCode: string;
    manufacturer?: string;
    packSize?: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    freeQuantity: number;
    mrp: number;
    purchaseRate: number;
    discountPercent: number;
    gstPercent: number;
    lineTotal: number;
    needsReview?: boolean;
    reviewFields?: string[];
    confidence: {
      productName: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
      batchNumber: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
      expiryDate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
      purchaseRate: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
      quantity: 'HIGH' | 'REVIEW' | 'NEEDS_REVIEW';
    };
  }>;
}

// ----------------------------------------------------
// AGENCY VISIT + PAYMENT SCHEDULE TRACKER TYPES
// ----------------------------------------------------

export interface AgencyHistoricalDate {
  date: string; // YYYY-MM-DD
  type: 'PURCHASE' | 'PAYMENT' | 'RECEIPT' | 'ACTIVITY';
  referenceId?: string;
  referenceNumber?: string;
  amount?: number;
}

export type ScheduleStatusLabel =
  | 'Expected Today'
  | 'Expected Tomorrow'
  | 'Expected in 2 Days'
  | 'Upcoming'
  | 'Overdue'
  | 'Schedule Estimated'
  | 'Schedule Irregular'
  | 'Not Enough Data'
  | 'Manually Set';

export type PredictionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ScheduleManualOverride {
  agencyId: string;
  nextExpectedDate?: string; // YYYY-MM-DD
  expectedIntervalDays?: number; // e.g. 15
  visitDayPattern?: string; // e.g. "Every other Monday"
  notes?: string;
  updatedAt: string;
}

export interface AgencySchedule {
  agencyId: string;
  agencyName: string;
  outstandingBalance: number;
  totalPurchase: number;
  totalPaid: number;

  // Historical Dates & Activities
  historicalDates: string[]; // Unique sorted YYYY-MM-DD
  activityHistory: AgencyHistoricalDate[];
  recordedVisitsCount: number;
  intervalsInDays: number[]; // e.g. [14, 17, 15, 16]

  // Statistical Metrics (Requirement 14)
  averageIntervalDays: number | null;
  medianIntervalDays: number | null;
  modeIntervalDays: number | null;
  typicalIntervalDays: number | null; // Robust chosen interval

  // Last Known Activity Dates (Requirement 3 & 6)
  lastActivityDate: string | null;
  lastPurchaseDate: string | null;
  lastPaymentDate: string | null;

  // Next Expected Visit Date (Requirement 3)
  nextExpectedDate: string | null; // YYYY-MM-DD
  daysUntilNextVisit: number | null; // 0 = today, 1 = tomorrow, 2 = day after tomorrow, etc.

  // Prediction Status & Confidence (Requirements 3, 4, 10, 18)
  confidence: PredictionConfidence;
  statusLabel: ScheduleStatusLabel;
  isManualOverride: boolean;
  manualOverride?: ScheduleManualOverride;
  isIrregular: boolean;
  sourceExplanation: string;
}

export interface UpcomingVisitsGrouped {
  today: AgencySchedule[];
  tomorrow: AgencySchedule[];
  dayAfterTomorrow: AgencySchedule[];
  next7Days: AgencySchedule[];
  allUpcoming: AgencySchedule[];
  irregularOrNeedsData: AgencySchedule[];
  totalOutstandingSoon: number;
}

