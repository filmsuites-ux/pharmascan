import {
  Agency,
  AgencyFinancialSummary,
  AuditLog,
  Invoice,
  InvoiceItem,
  OverallStats,
  Payment,
  PaymentStatus,
  PreviousDueInput,
} from '../types/pharmacy';
import { SAMPLE_BILLS } from '../services/sampleBills';
import { parseExpiryDate } from '../services/expiryService';
import { recordStepMetric } from '../services/performanceTracker';

const DB_NAME = 'PharmaScan_DB_v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported or is blocked in this browser environment.'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    let hasResolvedOrRejected = false;

    // Timeout guard: never hang indefinitely on mobile Chrome iframes
    const timeoutTimer = setTimeout(() => {
      if (!hasResolvedOrRejected) {
        hasResolvedOrRejected = true;
        dbPromise = null;
        reject(new Error('Database connection timed out. IndexedDB may be blocked by private browsing or iframe policies.'));
      }
    }, 6500);

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('agencies')) {
          db.createObjectStore('agencies', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('invoices')) {
          const invStore = db.createObjectStore('invoices', { keyPath: 'id' });
          invStore.createIndex('agencyId', 'agencyId', { unique: false });
          invStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: false });
        }
        if (!db.objectStoreNames.contains('invoice_items')) {
          const itemStore = db.createObjectStore('invoice_items', { keyPath: 'id' });
          itemStore.createIndex('invoiceId', 'invoiceId', { unique: false });
          itemStore.createIndex('agencyId', 'agencyId', { unique: false });
          itemStore.createIndex('productName', 'productName', { unique: false });
          itemStore.createIndex('expiryTimestamp', 'expiryTimestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains('payments')) {
          const payStore = db.createObjectStore('payments', { keyPath: 'id' });
          payStore.createIndex('agencyId', 'agencyId', { unique: false });
          payStore.createIndex('paymentDate', 'paymentDate', { unique: false });
        }
        if (!db.objectStoreNames.contains('audit_logs')) {
          db.createObjectStore('audit_logs', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        clearTimeout(timeoutTimer);
        if (!hasResolvedOrRejected) {
          hasResolvedOrRejected = true;
          resolve(request.result);
        }
      };

      request.onerror = () => {
        clearTimeout(timeoutTimer);
        if (!hasResolvedOrRejected) {
          hasResolvedOrRejected = true;
          dbPromise = null; // Reset so retry can succeed
          reject(request.error || new Error('Failed to open IndexedDB database'));
        }
      };

      request.onblocked = () => {
        console.warn('[IndexedDB] Database open blocked by another tab or session.');
      };
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (!hasResolvedOrRejected) {
        hasResolvedOrRejected = true;
        dbPromise = null;
        reject(err);
      }
    }
  });

  return dbPromise;
}

// Generic transaction helper
async function performTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await action(store);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

// ----------------------------------------------------
// INITIAL SEED DATA
// ----------------------------------------------------
export async function initializeDatabase(): Promise<void> {
  const initStart = performance.now();

  // If user explicitly performed a clean reset, NEVER automatically re-seed!
  const initState = typeof localStorage !== 'undefined' ? localStorage.getItem('pharmascan_initialized_state') : null;
  const hasBeenReset = typeof localStorage !== 'undefined' ? localStorage.getItem('pharmascan_has_been_reset') === 'true' : false;

  if (initState === 'CLEAN_EMPTY' || hasBeenReset) {
    recordStepMetric('initialize_database', performance.now() - initStart, 'SUCCESS', 'Clean empty state preserved');
    return;
  }

  const existingAgencies = await getAgencies();
  if (existingAgencies.length > 0) {
    recordStepMetric('initialize_database', performance.now() - initStart, 'SUCCESS', 'Existing DB detected');
    return;
  }

  // Initial Indian Pharmacy Distributors on brand-new initial launch
  await seedDemoPharmacyData();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('pharmascan_initialized_state', 'INITIAL_DEMO');
  }
  recordStepMetric('initialize_database', performance.now() - initStart, 'SUCCESS', 'Initial demo data seeded');
}

export async function seedDemoPharmacyData(): Promise<void> {
  const seedAgencies: Agency[] = [
    {
      id: 'agency-venu',
      name: 'Venu Medical',
      contactPerson: 'Venu Gopal',
      phone: '+91 98450 11223',
      email: 'orders@venumedical.com',
      address: '22, Main Bazaar, M.G. Road, Pune - 411001',
      gstin: '27AABCV8811K1ZX',
      dlNumber: 'MH-PUN-20B/33401, 21B/33402',
      paymentTermsDays: 30,
      notes: 'Wholesale distributor for pediatric and antibiotic formulations.',
      createdAt: '2026-09-12T10:00:00.000Z',
      updatedAt: '2026-09-12T10:00:00.000Z',
    },
    {
      id: 'agency-vikas',
      name: 'Vikas Pharma Distributors',
      contactPerson: 'Vikas Shah',
      phone: '+91 98220 19844',
      email: 'orders@vikaspharma.com',
      address: 'Plot 44, Pharmaceutical Market, Rasta Peth, Pune - 411011',
      gstin: '27AAECV4120L1ZA',
      dlNumber: 'MH-PUN-20B/14299, 21B/14300',
      paymentTermsDays: 30,
      notes: 'Authorised distributor for Cipla, Sun Pharma, and Torrent.',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'agency-medico',
      name: 'Medico Healthcare Agency',
      contactPerson: 'Rajesh Kulkarni',
      phone: '+91 94220 33411',
      email: 'dispatch@medicoagency.in',
      address: 'G-12, Commerce Centre, Tilak Road, Pune - 411030',
      gstin: '27BBDMP9912K1Z9',
      dlNumber: 'MH-PUN-20B/18840, 21B/18841',
      paymentTermsDays: 21,
      notes: 'Supplies Abbott, Alkem, Mankind, and GlaxoSmithKline.',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'agency-ganesh',
      name: 'Shree Ganesh Pharma Stockist',
      contactPerson: 'Suresh Patel',
      phone: '+91 98901 23456',
      email: 'suresh@shreeganeshpharma.com',
      address: '502, Wholesale Drug Bhavan, Raviwar Peth, Pune',
      gstin: '27AALCS8819Q1ZP',
      dlNumber: 'MH-PUN-20B/20110, 21B/20111',
      paymentTermsDays: 15,
      notes: 'Specialist in generic products, Intas, and Zydus Cadila.',
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
    },
    {
      id: 'agency-apex',
      name: 'Apex Drug Distributors',
      contactPerson: 'Mahesh Deshmukh',
      phone: '+91 98231 44552',
      email: 'accounts@apexdistributors.com',
      address: 'Shop 18, Apollo Medical Complex, Sadashiv Peth, Pune',
      gstin: '27AADCA1090R1ZT',
      dlNumber: 'MH-PUN-20B/22901, 21B/22902',
      paymentTermsDays: 30,
      notes: 'Glenmark, Dr. Reddy’s Laboratories, and Lupin distributor.',
      createdAt: '2026-09-10T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
    },
  ];

  for (const ag of seedAgencies) {
    await saveAgency(ag);
  }

  // Seed prior baseline purchase invoices (to power prompt requirements:
  // "ABC PHARMA: Purchase ₹85,400, Paid ₹60,000, Balance ₹25,400"
  // "Paracetamol 500 mg previous rate ₹20, Augmentin previous rate ₹150")

  // Generate image for seed bill 1
  const vikasImg = SAMPLE_BILLS[0].renderInvoiceImage();
  const medicoImg = SAMPLE_BILLS[1].renderInvoiceImage();

  const seedInvoices: Invoice[] = [
    {
      id: 'inv-seed-01',
      agencyId: 'agency-vikas',
      agencyName: 'Vikas Pharma Distributors',
      invoiceNumber: 'VPD-2026/7802',
      invoiceDate: '2026-09-15',
      invoiceTotal: 85400.0,
      taxableAmount: 76250.0,
      gstAmount: 9150.0,
      discountAmount: 2500.0,
      paymentStatus: 'PARTIAL',
      paidAmount: 60000.0,
      balanceAmount: 25400.0,
      images: [vikasImg],
      notes: 'Initial September stock order for regular OTC & prescription items.',
      itemsCount: 4,
      createdAt: '2026-09-15T11:00:00.000Z',
      updatedAt: '2026-09-15T11:00:00.000Z',
    },
    {
      id: 'inv-seed-02',
      agencyId: 'agency-medico',
      agencyName: 'Medico Healthcare Agency',
      invoiceNumber: 'MHA/SEP/910',
      invoiceDate: '2026-09-20',
      invoiceTotal: 55000.0,
      taxableAmount: 49107.0,
      gstAmount: 5893.0,
      discountAmount: 1800.0,
      paymentStatus: 'PARTIAL',
      paidAmount: 40000.0,
      balanceAmount: 15000.0,
      images: [medicoImg],
      notes: 'Antibiotics and respiratory care medicine consignment.',
      itemsCount: 3,
      createdAt: '2026-09-20T14:30:00.000Z',
      updatedAt: '2026-09-20T14:30:00.000Z',
    },
    {
      id: 'inv-seed-03',
      agencyId: 'agency-ganesh',
      agencyName: 'Shree Ganesh Pharma Stockist',
      invoiceNumber: 'SGP-8411',
      invoiceDate: '2026-09-25',
      invoiceTotal: 45000.0,
      taxableAmount: 40178.0,
      gstAmount: 4822.0,
      discountAmount: 1200.0,
      paymentStatus: 'PARTIAL',
      paidAmount: 30000.0,
      balanceAmount: 15000.0,
      images: [],
      notes: 'Dolo 650, antacids, and pain management stock.',
      itemsCount: 2,
      createdAt: '2026-09-25T16:00:00.000Z',
      updatedAt: '2026-09-25T16:00:00.000Z',
    },
  ];

  // Seed items: gives historical baseline rates so price-change detection immediately works!
  const expPcm = parseExpiryDate('11/2027');
  const expAug = parseExpiryDate('09/2028');
  const expCet = parseExpiryDate('11/2026'); // Near-expiry item!
  const expAzi = parseExpiryDate('10/2026'); // Critical expiry (30 days)!
  const expOld = parseExpiryDate('09/2026'); // Expired item!

  const seedItems: InvoiceItem[] = [
    {
      id: 'item-seed-01',
      invoiceId: 'inv-seed-01',
      agencyId: 'agency-vikas',
      agencyName: 'Vikas Pharma Distributors',
      invoiceNumber: 'VPD-2026/7802',
      invoiceDate: '2026-09-15',
      productName: 'PARACETAMOL 500 MG',
      normalizedName: 'PARACETAMOL 500MG',
      productCode: '30049060',
      batchNumber: 'PC7712',
      expiryDate: expPcm.formatted,
      expiryTimestamp: expPcm.timestamp,
      quantity: 100,
      freeQuantity: 10,
      mrp: 30.0,
      purchaseRate: 20.0, // Baseline: ₹20
      discountPercent: 3.0,
      gstPercent: 12.0,
      lineTotal: 1940.0,
      priceChangeType: 'NEW',
    },
    {
      id: 'item-seed-02',
      invoiceId: 'inv-seed-01',
      agencyId: 'agency-vikas',
      agencyName: 'Vikas Pharma Distributors',
      invoiceNumber: 'VPD-2026/7802',
      invoiceDate: '2026-09-15',
      productName: 'PAN 40MG TABLET',
      normalizedName: 'PAN 40MG TAB',
      productCode: '30049099',
      batchNumber: 'PN3801',
      expiryDate: '06/2028',
      expiryTimestamp: parseExpiryDate('06/2028').timestamp,
      quantity: 100,
      freeQuantity: 10,
      mrp: 155.0,
      purchaseRate: 98.5,
      discountPercent: 5.0,
      gstPercent: 12.0,
      lineTotal: 9357.5,
      priceChangeType: 'NEW',
    },
    {
      id: 'item-seed-03',
      invoiceId: 'inv-seed-01',
      agencyId: 'agency-vikas',
      agencyName: 'Vikas Pharma Distributors',
      invoiceNumber: 'VPD-2026/7802',
      invoiceDate: '2026-09-15',
      productName: 'CETIRIZINE 10MG TAB',
      normalizedName: 'CETIRIZINE 10MG TAB',
      productCode: '30049060',
      batchNumber: 'CT0981',
      expiryDate: expCet.formatted, // Nov 2026 (Near expiry ~60 days)
      expiryTimestamp: expCet.timestamp,
      quantity: 50,
      freeQuantity: 5,
      mrp: 38.0,
      purchaseRate: 27.5,
      discountPercent: 0,
      gstPercent: 12.0,
      lineTotal: 1375.0,
      priceChangeType: 'NEW',
    },
    {
      id: 'item-seed-04',
      invoiceId: 'inv-seed-01',
      agencyId: 'agency-vikas',
      agencyName: 'Vikas Pharma Distributors',
      invoiceNumber: 'VPD-2026/7802',
      invoiceDate: '2026-09-15',
      productName: 'AMBROXOL EXPECTORANT SYP',
      normalizedName: 'AMBROXOL EXPECTORANT SYP',
      productCode: '30049099',
      batchNumber: 'AMB012',
      expiryDate: expOld.formatted, // Sep 2026 (EXPIRED)
      expiryTimestamp: expOld.timestamp,
      quantity: 15,
      freeQuantity: 0,
      mrp: 110.0,
      purchaseRate: 68.0,
      discountPercent: 2.0,
      gstPercent: 12.0,
      lineTotal: 999.6,
      priceChangeType: 'NEW',
    },
    {
      id: 'item-seed-05',
      invoiceId: 'inv-seed-02',
      agencyId: 'agency-medico',
      agencyName: 'Medico Healthcare Agency',
      invoiceNumber: 'MHA/SEP/910',
      invoiceDate: '2026-09-20',
      productName: 'AUGMENTIN 625 DUO TAB',
      normalizedName: 'AUGMENTIN 625 DUO TAB',
      productCode: '30041000',
      batchNumber: 'AG6102',
      expiryDate: expAug.formatted,
      expiryTimestamp: expAug.timestamp,
      quantity: 50,
      freeQuantity: 5,
      mrp: 223.5,
      purchaseRate: 150.0, // Baseline: ₹150
      discountPercent: 2.0,
      gstPercent: 12.0,
      lineTotal: 7350.0,
      priceChangeType: 'NEW',
    },
    {
      id: 'item-seed-06',
      invoiceId: 'inv-seed-02',
      agencyId: 'agency-medico',
      agencyName: 'Medico Healthcare Agency',
      invoiceNumber: 'MHA/SEP/910',
      invoiceDate: '2026-09-20',
      productName: 'AZITHRAL 500 TABLET',
      normalizedName: 'AZITHRAL 500 TAB',
      productCode: '30042000',
      batchNumber: 'AZ4901',
      expiryDate: expAzi.formatted, // Oct 2026 (Critical near-expiry!)
      expiryTimestamp: expAzi.timestamp,
      quantity: 25,
      freeQuantity: 0,
      mrp: 132.0,
      purchaseRate: 88.0,
      discountPercent: 5.0,
      gstPercent: 12.0,
      lineTotal: 2090.0,
      priceChangeType: 'NEW',
    },
  ];

  for (const inv of seedInvoices) {
    const items = seedItems.filter((i) => i.invoiceId === inv.id);
    await saveInvoice(inv, items);
  }

  // Seed payments:
  // Vikas: Paid ₹60,000 (01-Sep: ₹35,000, 20-Sep: ₹25,000)
  // Medico: Paid ₹40,000
  // Ganesh: Paid ₹30,000
  const seedPayments: Payment[] = [
    {
      id: 'pay-seed-01',
      agencyId: 'agency-vikas',
      agencyName: 'Vikas Pharma Distributors',
      paymentDate: '2026-09-18',
      amount: 35000.0,
      paymentMethod: 'NEFT_RTGS',
      referenceNumber: 'HDFC-N982141',
      notes: 'Part payment against Sept opening balance.',
      createdAt: '2026-09-18T10:00:00.000Z',
      updatedAt: '2026-09-18T10:00:00.000Z',
    },
    {
      id: 'pay-seed-02',
      agencyId: 'agency-vikas',
      agencyName: 'Vikas Pharma Distributors',
      paymentDate: '2026-09-28',
      amount: 25000.0,
      paymentMethod: 'CHEQUE',
      referenceNumber: 'CHQ-890211',
      notes: 'Cheque cleared for invoice VPD-2026/7802.',
      createdAt: '2026-09-28T16:00:00.000Z',
      updatedAt: '2026-09-28T16:00:00.000Z',
    },
    {
      id: 'pay-seed-03',
      agencyId: 'agency-medico',
      agencyName: 'Medico Healthcare Agency',
      paymentDate: '2026-09-26',
      amount: 40000.0,
      paymentMethod: 'UPI',
      referenceNumber: 'UPI/62699102441/HDFC',
      notes: 'UPI payment directly to Medico distributor account.',
      createdAt: '2026-09-26T11:20:00.000Z',
      updatedAt: '2026-09-26T11:20:00.000Z',
    },
    {
      id: 'pay-seed-04',
      agencyId: 'agency-ganesh',
      agencyName: 'Shree Ganesh Pharma Stockist',
      paymentDate: '2026-09-30',
      amount: 30000.0,
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: 'IMPS-9014421',
      notes: 'Advance transfer for monthly quota.',
      createdAt: '2026-09-30T17:15:00.000Z',
      updatedAt: '2026-09-30T17:15:00.000Z',
    },
  ];

  for (const pay of seedPayments) {
    await savePayment(pay);
  }

  // Recalculate invoice balances based on payments
  await recalculateAllAgencyBalances();
}

// ----------------------------------------------------
// AGENCIES CRUD
// ----------------------------------------------------
export async function getAgencies(): Promise<Agency[]> {
  return performTx('agencies', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  });
}

export async function getAgencyById(id: string): Promise<Agency | null> {
  return performTx('agencies', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
    });
  });
}

export async function saveAgency(agency: Agency): Promise<Agency> {
  const existing = await getAgencyById(agency.id);
  const now = new Date().toISOString();
  const toSave: Agency = {
    ...agency,
    updatedAt: now,
    createdAt: agency.createdAt || now,
  };

  await performTx('agencies', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.put(toSave);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  });

  if (existing) {
    await logAuditEvent({
      entityType: 'AGENCY',
      entityId: agency.id,
      action: 'UPDATE',
      description: `Updated agency details: ${agency.name}`,
    });
  } else {
    await logAuditEvent({
      entityType: 'AGENCY',
      entityId: agency.id,
      action: 'CREATE',
      description: `Added new agency: ${agency.name}`,
    });
  }

  invalidateDataCache();
  return toSave;
}

export async function deleteAgency(id: string): Promise<void> {
  const agency = await getAgencyById(id);
  await performTx('agencies', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  });

  if (agency) {
    await logAuditEvent({
      entityType: 'AGENCY',
      entityId: id,
      action: 'DELETE',
      description: `Deleted agency: ${agency.name}`,
    });
  }
  invalidateDataCache();
}

// ----------------------------------------------------
// INVOICES CRUD
// ----------------------------------------------------
export async function getInvoices(): Promise<Invoice[]> {
  const invoices: Invoice[] = await performTx('invoices', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  });

  // Sort descending by date
  return invoices.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const inv = await performTx('invoices', 'readonly', (store) => {
    return new Promise<Invoice | null>((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
    });
  });

  if (!inv) return null;

  // Fetch items
  const items = await getInvoiceItems(id);
  return { ...inv, items };
}

export async function saveInvoice(invoice: Invoice, items?: InvoiceItem[]): Promise<Invoice> {
  const existing = await getInvoiceById(invoice.id);
  const now = new Date().toISOString();

  const originalImgs = invoice.originalImages && invoice.originalImages.length > 0
    ? invoice.originalImages
    : (existing?.originalImages || invoice.images || []);

  const processedImgs = invoice.processedImages && invoice.processedImages.length > 0
    ? invoice.processedImages
    : (existing?.processedImages || invoice.images || []);

  const toSave: Invoice = {
    ...invoice,
    originalImages: originalImgs,
    processedImages: processedImgs,
    images: processedImgs.length > 0 ? processedImgs : originalImgs,
    documentType: invoice.documentType || existing?.documentType || 'TAX_INVOICE',
    reviewStatus: invoice.reviewStatus || existing?.reviewStatus || (invoice.needsReview ? 'NEEDS_REVIEW' : 'VERIFIED'),
    isArchived: invoice.isArchived ?? existing?.isArchived ?? false,
    scanDate: invoice.scanDate || existing?.scanDate || now,
    itemsCount: items ? items.length : invoice.itemsCount || 0,
    createdAt: invoice.createdAt || existing?.createdAt || now,
    updatedAt: now,
  };

  await performTx('invoices', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.put(toSave);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  });

  // Save items if provided with explicit source bill linkages
  if (items && items.length > 0) {
    // Delete old items for this invoice
    await deleteItemsForInvoice(invoice.id);

    // Save new items with permanent source document references
    for (const item of items) {
      const itemToSave: InvoiceItem = {
        ...item,
        invoiceId: invoice.id,
        agencyId: invoice.agencyId,
        agencyName: invoice.agencyName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        sourceInvoiceId: invoice.id,
        sourceInvoiceNumber: invoice.invoiceNumber,
        sourceInvoiceDate: invoice.invoiceDate,
        sourceAgencyName: invoice.agencyName,
      };
      await saveInvoiceItem(itemToSave);
    }
  }

  // Recalculate agency balances
  await recalculateAgencyFinancials(invoice.agencyId);

  // Audit Log
  if (existing) {
    await logAuditEvent({
      entityType: 'INVOICE',
      entityId: invoice.id,
      action: 'UPDATE',
      description: `Updated invoice #${invoice.invoiceNumber} (${invoice.agencyName}) - Total: ₹${invoice.invoiceTotal}`,
      oldValue: `₹${existing.invoiceTotal}`,
      newValue: `₹${invoice.invoiceTotal}`,
    });
  } else {
    await logAuditEvent({
      entityType: 'INVOICE',
      entityId: invoice.id,
      action: 'CREATE',
      description: `Saved purchase invoice #${invoice.invoiceNumber} (${invoice.agencyName}) - Total: ₹${invoice.invoiceTotal}`,
      newValue: `₹${invoice.invoiceTotal}`,
    });
  }

  invalidateDataCache();
  return toSave;
}

export async function archiveInvoice(id: string): Promise<void> {
  const invoice = await getInvoiceById(id);
  if (!invoice) return;

  invoice.isArchived = true;
  invoice.reviewStatus = 'ARCHIVED';
  invoice.archivedAt = new Date().toISOString();
  await saveInvoice(invoice);

  await logAuditEvent({
    entityType: 'INVOICE',
    entityId: id,
    action: 'UPDATE',
    description: `Archived document #${invoice.invoiceNumber} (${invoice.agencyName})`,
  });
}

export async function unarchiveInvoice(id: string): Promise<void> {
  const invoice = await getInvoiceById(id);
  if (!invoice) return;

  invoice.isArchived = false;
  invoice.reviewStatus = invoice.needsReview ? 'NEEDS_REVIEW' : 'VERIFIED';
  delete invoice.archivedAt;
  await saveInvoice(invoice);

  await logAuditEvent({
    entityType: 'INVOICE',
    entityId: id,
    action: 'UPDATE',
    description: `Restored archived document #${invoice.invoiceNumber} (${invoice.agencyName}) to active documents`,
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  const existing = await getInvoiceById(id);
  if (!existing) return;

  await deleteItemsForInvoice(id);

  await performTx('invoices', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  });

  await recalculateAgencyFinancials(existing.agencyId);

  await logAuditEvent({
    entityType: 'INVOICE',
    entityId: id,
    action: 'DELETE',
    description: `Deleted invoice #${existing.invoiceNumber} (${existing.agencyName})`,
    oldValue: `₹${existing.invoiceTotal}`,
  });
  invalidateDataCache();
}

// ----------------------------------------------------
// INVOICE ITEMS CRUD
// ----------------------------------------------------
export async function getInvoiceItems(invoiceId?: string): Promise<InvoiceItem[]> {
  const all: InvoiceItem[] = await performTx('invoice_items', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  });

  if (invoiceId) {
    return all.filter((i) => i.invoiceId === invoiceId);
  }
  return all;
}

export async function saveInvoiceItem(item: InvoiceItem): Promise<void> {
  await performTx('invoice_items', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.put(item);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  });
}

async function deleteItemsForInvoice(invoiceId: string): Promise<void> {
  const items = await getInvoiceItems(invoiceId);
  if (items.length === 0) return;

  await performTx('invoice_items', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      let count = items.length;
      items.forEach((item) => {
        const req = store.delete(item.id);
        req.onsuccess = () => {
          count--;
          if (count === 0) resolve(undefined);
        };
        req.onerror = () => reject(req.error);
      });
    });
  });
}

// ----------------------------------------------------
// PAYMENTS CRUD
// ----------------------------------------------------
export async function getPayments(): Promise<Payment[]> {
  const payments: Payment[] = await performTx('payments', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  });

  return payments.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

export async function getPaymentById(id: string): Promise<Payment | null> {
  return performTx('payments', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
    });
  });
}

export async function savePayment(payment: Payment): Promise<Payment> {
  const existing = await getPaymentById(payment.id);
  const now = new Date().toISOString();
  const toSave: Payment = {
    ...payment,
    createdAt: payment.createdAt || now,
    updatedAt: now,
  };

  await performTx('payments', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.put(toSave);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  });

  // Recalculate agency balances
  await recalculateAgencyFinancials(payment.agencyId);

  if (existing) {
    await logAuditEvent({
      entityType: 'PAYMENT',
      entityId: payment.id,
      action: 'UPDATE',
      description: `Payment edited for ${payment.agencyName}: ₹${existing.amount} → ₹${payment.amount} (${payment.paymentMethod})`,
      oldValue: `₹${existing.amount}`,
      newValue: `₹${payment.amount}`,
    });
  } else {
    await logAuditEvent({
      entityType: 'PAYMENT',
      entityId: payment.id,
      action: 'CREATE',
      description: `Recorded payment of ₹${payment.amount} to ${payment.agencyName} via ${payment.paymentMethod}`,
      newValue: `₹${payment.amount}`,
    });
  }

  invalidateDataCache();
  return toSave;
}

export async function deletePayment(id: string): Promise<void> {
  const existing = await getPaymentById(id);
  if (!existing) return;

  await performTx('payments', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  });

  await recalculateAgencyFinancials(existing.agencyId);

  await logAuditEvent({
    entityType: 'PAYMENT',
    entityId: id,
    action: 'DELETE',
    description: `Deleted payment of ₹${existing.amount} for ${existing.agencyName}`,
    oldValue: `₹${existing.amount}`,
  });
  invalidateDataCache();
}

// ----------------------------------------------------
// AUDIT LOGS
// ----------------------------------------------------
export async function getAuditLogs(): Promise<AuditLog[]> {
  const logs: AuditLog[] = await performTx('audit_logs', 'readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  });

  return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function logAuditEvent(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
  const log: AuditLog = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
  };

  await performTx('audit_logs', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.put(log);
      req.onsuccess = () => resolve(undefined);
      req.onerror = () => reject(req.error);
    });
  });
}

// ----------------------------------------------------
// FINANCIAL & RECALCULATION CALCULATIONS
// ----------------------------------------------------

/**
 * Accurately updates invoice paidAmount, balanceAmount, and paymentStatus
 * by allocating payments in FIFO order across an agency's chronological invoices
 */
export async function recalculateAgencyFinancials(agencyId: string): Promise<void> {
  const allInvoices = await getInvoices();
  const agencyInvoices = allInvoices
    .filter((inv) => inv.agencyId === agencyId && inv.documentType !== 'RECEIPT')
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate)); // FIFO

  const allPayments = await getPayments();
  const agencyPayments = allPayments.filter((p) => p.agencyId === agencyId);

  let totalPaidAvailable = agencyPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

  // Distribute payments chronologically across invoices
  for (const inv of agencyInvoices) {
    const invTotal = inv.invoiceTotal || 0;
    let paidForThis = 0;

    if (totalPaidAvailable >= invTotal) {
      paidForThis = invTotal;
      totalPaidAvailable -= invTotal;
    } else {
      paidForThis = totalPaidAvailable;
      totalPaidAvailable = 0;
    }

    const balanceForThis = Math.max(0, invTotal - paidForThis);
    let status: PaymentStatus = 'UNPAID';
    if (paidForThis >= invTotal && invTotal > 0) {
      status = 'PAID';
    } else if (paidForThis > 0) {
      status = 'PARTIAL';
    }

    // Only update if changed
    if (
      inv.paidAmount !== paidForThis ||
      inv.balanceAmount !== balanceForThis ||
      inv.paymentStatus !== status
    ) {
      inv.paidAmount = paidForThis;
      inv.balanceAmount = balanceForThis;
      inv.paymentStatus = status;

      await performTx('invoices', 'readwrite', (store) => {
        return new Promise((resolve, reject) => {
          const req = store.put(inv);
          req.onsuccess = () => resolve(undefined);
          req.onerror = () => reject(req.error);
        });
      });
    }
  }
}

export async function recalculateAllAgencyBalances(): Promise<void> {
  const agencies = await getAgencies();
  for (const ag of agencies) {
    await recalculateAgencyFinancials(ag.id);
  }
}

/**
 * Calculates real financial totals for an agency:
 * Opening Due = sum of OPENING_DUE transactions
 * Total Purchases = sum of invoice totals (excluding RECEIPT and OPENING_DUE)
 * Total Paid = sum of payments made
 * Outstanding Balance = Opening Due + Total Purchases - Total Paid (Requirement 6)
 */
export async function getAgencySummary(agencyId: string): Promise<AgencyFinancialSummary | null> {
  const agency = await getAgencyById(agencyId);
  if (!agency) return null;

  const invoices = (await getInvoices()).filter((i) => i.agencyId === agencyId);
  const payments = (await getPayments()).filter((p) => p.agencyId === agencyId);
  const items = (await getInvoiceItems()).filter((it) => it.agencyId === agencyId);

  // Requirement 6: OPENING DUE + PURCHASES - PAYMENTS = CURRENT OUTSTANDING
  const openingDue = invoices
    .filter((inv) => inv.documentType === 'OPENING_DUE')
    .reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);

  const totalPurchase = invoices
    .filter((inv) => inv.documentType !== 'RECEIPT' && inv.documentType !== 'OPENING_DUE')
    .reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const outstandingBalance = Math.max(0, openingDue + totalPurchase - totalPaid);

  const now = new Date();
  const nearExpiryThreshold = now.getTime() + 90 * 24 * 60 * 60 * 1000;
  const nearExpiryItemsCount = items.filter(
    (i) => i.expiryTimestamp > 0 && i.expiryTimestamp <= nearExpiryThreshold
  ).length;

  const lastInvoiceDate = invoices[0]?.invoiceDate;
  const lastPaymentDate = payments[0]?.paymentDate;

  return {
    agency,
    openingDue,
    totalPurchase,
    totalPaid,
    outstandingBalance,
    invoicesCount: invoices.filter((i) => i.documentType !== 'RECEIPT').length,
    unpaidInvoicesCount: invoices.filter((i) => i.paymentStatus !== 'PAID').length,
    nearExpiryItemsCount,
    lastInvoiceDate,
    lastPaymentDate,
  };
}

export interface AppDataSnapshot {
  stats: OverallStats;
  agencies: AgencyFinancialSummary[];
  recentInvoices: Invoice[];
  loadDurationMs: number;
}

let cachedSnapshot: AppDataSnapshot | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 15000; // 15 seconds safe in-memory cache

export function invalidateDataCache(): void {
  cachedSnapshot = null;
  cacheTimestamp = 0;
}

/**
 * Batched snapshot query: reads all 4 IndexedDB tables in PARALLEL ONCE
 * and computes overall stats, agency summaries, and recent invoices in memory.
 * Reduces 30+ sequential IDB transactions to 1 fast parallel batch.
 */
export async function getAppDataSnapshot(forceRefresh = false): Promise<AppDataSnapshot> {
  const now = Date.now();
  if (!forceRefresh && cachedSnapshot && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  const start = performance.now();
  const [agencies, invoices, payments, items] = await Promise.all([
    getAgencies(),
    getInvoices(),
    getPayments(),
    getInvoiceItems(),
  ]);

  // 1. Calculate overall stats in memory in a single pass
  const totalOpeningDues = invoices
    .filter((inv) => inv.documentType === 'OPENING_DUE')
    .reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);

  const totalPurchases = invoices
    .filter((inv) => inv.documentType !== 'RECEIPT' && inv.documentType !== 'OPENING_DUE')
    .reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalOutstanding = Math.max(0, totalOpeningDues + totalPurchases - totalPaid);

  const nowMs = Date.now();
  const in30Days = nowMs + 30 * 24 * 60 * 60 * 1000;
  const in90Days = nowMs + 90 * 24 * 60 * 60 * 1000;

  let criticalExpiryCount = 0;
  let nearExpiryCount = 0;
  let expiredCount = 0;

  items.forEach((item) => {
    if (item.expiryTimestamp <= 0) return;
    if (item.expiryTimestamp < nowMs) {
      expiredCount++;
    } else if (item.expiryTimestamp <= in30Days) {
      criticalExpiryCount++;
      nearExpiryCount++;
    } else if (item.expiryTimestamp <= in90Days) {
      nearExpiryCount++;
    }
  });

  const priceChangesCount = items.filter(
    (i) => i.priceChangeType === 'INCREASE' || i.priceChangeType === 'DECREASE'
  ).length;

  const priceHikesCount = items.filter((i) => i.priceChangeType === 'INCREASE').length;

  const medicineStockMap = new Map<string, number>();
  items.forEach((it) => {
    const norm = it.normalizedName || it.productName.toLowerCase().trim();
    medicineStockMap.set(norm, (medicineStockMap.get(norm) || 0) + (it.quantity || 0));
  });

  const minStockConfig = getMedicineMinStockConfig();
  let lowStockCount = 0;
  medicineStockMap.forEach((qty, norm) => {
    const threshold = minStockConfig[norm] ?? 10;
    if (qty <= threshold) {
      lowStockCount++;
    }
  });

  const stats: OverallStats = {
    totalOpeningDues,
    totalPurchases,
    totalPaid,
    totalOutstanding,
    lowStockCount,
    nearExpiryCount,
    criticalExpiryCount,
    expiredCount,
    priceChangesCount,
    priceHikesCount,
    recentBillsCount: invoices.length,
  };

  // 2. Group invoices, payments, items by agencyId in memory O(N)
  const invoicesByAgency = new Map<string, Invoice[]>();
  const paymentsByAgency = new Map<string, Payment[]>();
  const itemsByAgency = new Map<string, InvoiceItem[]>();

  for (const inv of invoices) {
    const list = invoicesByAgency.get(inv.agencyId) || [];
    list.push(inv);
    invoicesByAgency.set(inv.agencyId, list);
  }

  for (const pay of payments) {
    const list = paymentsByAgency.get(pay.agencyId) || [];
    list.push(pay);
    paymentsByAgency.set(pay.agencyId, list);
  }

  for (const it of items) {
    const list = itemsByAgency.get(it.agencyId) || [];
    list.push(it);
    itemsByAgency.set(it.agencyId, list);
  }

  // 3. Compute each agency financial summary synchronously without additional DB calls
  const summaries: AgencyFinancialSummary[] = agencies.map((agency) => {
    const agInvoices = invoicesByAgency.get(agency.id) || [];
    const agPayments = paymentsByAgency.get(agency.id) || [];
    const agItems = itemsByAgency.get(agency.id) || [];

    const openingDue = agInvoices
      .filter((inv) => inv.documentType === 'OPENING_DUE')
      .reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);

    const totalPurchase = agInvoices
      .filter((inv) => inv.documentType !== 'RECEIPT' && inv.documentType !== 'OPENING_DUE')
      .reduce((sum, inv) => sum + (inv.invoiceTotal || 0), 0);

    const agPaid = agPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const outstandingBalance = Math.max(0, openingDue + totalPurchase - agPaid);

    const nearExpiryItemsCount = agItems.filter(
      (i) => i.expiryTimestamp > 0 && i.expiryTimestamp <= in90Days
    ).length;

    const sortedInvs = [...agInvoices].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
    const sortedPays = [...agPayments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

    return {
      agency,
      openingDue,
      totalPurchase,
      totalPaid: agPaid,
      outstandingBalance,
      invoicesCount: agInvoices.filter((i) => i.documentType !== 'RECEIPT').length,
      unpaidInvoicesCount: agInvoices.filter((i) => i.paymentStatus !== 'PAID').length,
      nearExpiryItemsCount,
      lastInvoiceDate: sortedInvs[0]?.invoiceDate,
      lastPaymentDate: sortedPays[0]?.paymentDate,
    };
  });

  summaries.sort((a, b) => b.outstandingBalance - a.outstandingBalance);

  const loadDurationMs = Math.round(performance.now() - start);
  const snapshot: AppDataSnapshot = {
    stats,
    agencies: summaries,
    recentInvoices: invoices,
    loadDurationMs,
  };

  cachedSnapshot = snapshot;
  cacheTimestamp = Date.now();

  recordStepMetric('load_app_data_snapshot', loadDurationMs, 'SUCCESS');
  return snapshot;
}

export async function getAllAgenciesSummary(): Promise<AgencyFinancialSummary[]> {
  const snapshot = await getAppDataSnapshot();
  return snapshot.agencies;
}

/**
 * Calculates global pharmacy dashboard statistics from ACTUAL STORED RECORDS (Requirement 21)
 */
export async function getOverallDashboardStats(): Promise<OverallStats> {
  const snapshot = await getAppDataSnapshot();
  return snapshot.stats;
}

/**
 * Saves a Previous / Opening Due entry (Requirement 6)
 * Opening/Previous dues are separate transactions that reflect historical balances
 * before the pharmacy started scanning bills in this app.
 */
export async function savePreviousDue(input: PreviousDueInput): Promise<Invoice> {
  const now = new Date().toISOString();
  const agency = await getAgencyById(input.agencyId);
  const agencyName = agency ? agency.name : input.agencyName;

  const uniqueSuffix = Date.now().toString().slice(-6);
  const refNum = input.referenceNumber?.trim() || `OP-DUE-${uniqueSuffix}`;

  const openingDueRecord: Invoice = {
    id: `opening-due-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    agencyId: input.agencyId,
    agencyName,
    invoiceNumber: refNum,
    invoiceDate: input.dueDate || now.split('T')[0],
    invoiceTotal: Number(input.amount),
    taxableAmount: Number(input.amount),
    gstAmount: 0,
    discountAmount: 0,
    paymentStatus: 'UNPAID',
    paidAmount: 0,
    balanceAmount: Number(input.amount),
    images: [],
    originalImages: [],
    processedImages: [],
    documentType: 'OPENING_DUE',
    reviewStatus: 'VERIFIED',
    notes: input.notes?.trim() || 'Opening balance prior to software installation',
    itemsCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await saveInvoice(openingDueRecord, []);
  await recalculateAgencyFinancials(input.agencyId);

  await logAuditEvent({
    entityType: 'INVOICE',
    entityId: saved.id,
    action: 'CREATE',
    description: `Recorded Previous/Opening Due: ₹${input.amount.toLocaleString('en-IN')} for ${agencyName}`,
  });

  return saved;
}

/**
 * Duplicate Bill Detection (Requirement 12):
 * Prevents scanning the same invoice twice by checking:
 * Agency + Invoice Number + Invoice Date + Invoice Amount
 */
export async function checkForDuplicateInvoice(
  agencyId: string,
  invoiceNumber: string,
  invoiceDate: string,
  invoiceTotal: number
): Promise<{ isDuplicate: boolean; existingInvoice?: Invoice; reason?: string }> {
  if (!invoiceNumber || invoiceNumber.trim() === '' || invoiceNumber === 'NOT DETECTED') {
    return { isDuplicate: false };
  }

  const invoices = await getInvoices();
  const cleanInvNum = invoiceNumber.trim().toUpperCase();

  for (const inv of invoices) {
    if (inv.documentType === 'RECEIPT') continue; // Don't match receipts against bills
    const existingNum = (inv.invoiceNumber || '').trim().toUpperCase();

    // 1. Same Agency + Same Invoice Number
    if (inv.agencyId === agencyId && existingNum === cleanInvNum) {
      return {
        isDuplicate: true,
        existingInvoice: inv,
        reason: `An invoice with number "${invoiceNumber}" from this agency is already saved (Date: ${inv.invoiceDate}, Amount: ₹${inv.invoiceTotal}).`,
      };
    }

    // 2. Same Invoice Number + Same Date + Same Amount (even if agency detection differed)
    if (
      existingNum === cleanInvNum &&
      inv.invoiceDate === invoiceDate &&
      Math.abs((inv.invoiceTotal || 0) - invoiceTotal) < 1.0
    ) {
      return {
        isDuplicate: true,
        existingInvoice: inv,
        reason: `Matching invoice #${invoiceNumber} dated ${invoiceDate} for ₹${invoiceTotal} found under "${inv.agencyName}".`,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Duplicate Payment Protection (Requirement 13):
 * Prevents adding the same payment receipt or voucher twice by checking:
 * Agency + Amount + Payment Date + Transaction/Reference Number
 */
export async function checkForDuplicatePayment(
  agencyId: string,
  amount: number,
  paymentDate: string,
  referenceNumber?: string
): Promise<{ isDuplicate: boolean; existingPayment?: Payment; reason?: string }> {
  if (!amount || amount <= 0) {
    return { isDuplicate: false };
  }

  const payments = await getPayments();
  const cleanRef = referenceNumber?.trim().toUpperCase();

  for (const pay of payments) {
    if (pay.agencyId !== agencyId) continue;

    const existingRef = (pay.referenceNumber || '').trim().toUpperCase();

    // 1. Same Reference/Cheque/UTR Number for same agency
    if (cleanRef && cleanRef.length > 2 && existingRef === cleanRef) {
      return {
        isDuplicate: true,
        existingPayment: pay,
        reason: `A payment with reference "${referenceNumber}" for ₹${pay.amount} is already recorded on ${pay.paymentDate}.`,
      };
    }

    // 2. Same Agency + Same Exact Amount + Same Payment Date
    if (Math.abs(pay.amount - amount) < 0.01 && pay.paymentDate === paymentDate) {
      return {
        isDuplicate: true,
        existingPayment: pay,
        reason: `A payment of ₹${amount.toLocaleString('en-IN')} dated ${paymentDate} is already recorded for this agency.`,
      };
    }
  }

  return { isDuplicate: false };
}

// ----------------------------------------------------
// MEDICINE MINIMUM STOCK MANAGEMENT (Requirement 17)
// ----------------------------------------------------
const MIN_STOCK_STORAGE_KEY = 'pharmascan_medicine_min_stock_levels';

export function getMedicineMinStockConfig(): Record<string, number> {
  try {
    const raw = localStorage.getItem(MIN_STOCK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setMedicineMinStock(normalizedName: string, minStock: number): void {
  try {
    const current = getMedicineMinStockConfig();
    current[normalizedName] = Math.max(0, minStock);
    localStorage.setItem(MIN_STOCK_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Failed to store medicine min stock level:', e);
  }
}

export function getMedicineMinStock(normalizedName: string, defaultVal: number = 10): number {
  const config = getMedicineMinStockConfig();
  return config[normalizedName] ?? defaultVal;
}

// ----------------------------------------------------
// EXPORT & BACKUP
// ----------------------------------------------------
export async function exportAllDataAsJson(): Promise<string> {
  const agencies = await getAgencies();
  const invoices = await getInvoices();
  const items = await getInvoiceItems();
  const payments = await getPayments();
  const auditLogs = await getAuditLogs();

  const exportPayload = {
    exportDate: new Date().toISOString(),
    system: 'PharmaScan Pharmacy Management',
    version: '1.0',
    data: {
      agencies,
      invoices,
      items,
      payments,
      auditLogs,
    },
  };

  return JSON.stringify(exportPayload, null, 2);
}

export async function importDataFromJson(jsonStr: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(jsonStr);
    const data = parsed.data || parsed;

    if (data.agencies && Array.isArray(data.agencies)) {
      for (const ag of data.agencies) await saveAgency(ag);
    }
    if (data.invoices && Array.isArray(data.invoices)) {
      for (const inv of data.invoices) {
        const invItems = data.items?.filter((i: any) => i.invoiceId === inv.id);
        await saveInvoice(inv, invItems);
      }
    }
    if (data.payments && Array.isArray(data.payments)) {
      for (const pay of data.payments) await savePayment(pay);
    }

    await recalculateAllAgencyBalances();
    return true;
  } catch (e) {
    console.error('Failed to import JSON data:', e);
    return false;
  }
}

export async function exportCsv(
  type: 'AGENCIES' | 'PURCHASES' | 'PAYMENTS' | 'ITEMS' | 'EXPIRY' | 'PRICE_CHANGES' | 'STOCK' | 'LOW_STOCK' | 'OUTSTANDING_DUES'
): Promise<string> {
  switch (type) {
    case 'AGENCIES':
    case 'OUTSTANDING_DUES': {
      const agencies = await getAllAgenciesSummary();
      const sorted = [...agencies].sort((a, b) => b.outstandingBalance - a.outstandingBalance);
      const headers = ['Agency Name', 'Contact Person', 'Phone', 'GSTIN', 'Opening Due', 'Total Purchase', 'Total Paid', 'Outstanding Balance'];
      const rows = sorted.map((a) => [
        `"${a.agency.name}"`,
        `"${a.agency.contactPerson || ''}"`,
        `"${a.agency.phone || ''}"`,
        `"${a.agency.gstin || ''}"`,
        (a.openingDue || 0).toFixed(2),
        a.totalPurchase.toFixed(2),
        a.totalPaid.toFixed(2),
        a.outstandingBalance.toFixed(2),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    case 'STOCK':
    case 'ITEMS': {
      const items = await getInvoiceItems();
      const headers = ['Medicine Name', 'Batch', 'Expiry Date', 'Quantity', 'Free Qty', 'Purchase Rate', 'MRP', 'Line Total', 'Supplier Agency', 'Bill No', 'Bill Date'];
      const rows = items.map((i) => [
        `"${i.productName}"`,
        `"${i.batchNumber || ''}"`,
        `"${i.expiryDate || ''}"`,
        i.quantity,
        i.freeQuantity || 0,
        (i.purchaseRate || 0).toFixed(2),
        (i.mrp || 0).toFixed(2),
        (i.lineTotal || (i.quantity * i.purchaseRate)).toFixed(2),
        `"${i.agencyName}"`,
        `"${i.invoiceNumber}"`,
        i.invoiceDate,
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    case 'LOW_STOCK': {
      const items = await getInvoiceItems();
      const minStockConfig = getMedicineMinStockConfig();
      const map = new Map<string, { displayName: string; qty: number; minQty: number; agencyName: string }>();
      items.forEach((it) => {
        const key = it.normalizedName || it.productName.toLowerCase().trim();
        if (!map.has(key)) {
          map.set(key, {
            displayName: it.productName,
            qty: 0,
            minQty: minStockConfig[key] ?? 10,
            agencyName: it.agencyName,
          });
        }
        map.get(key)!.qty += it.quantity || 0;
      });

      const headers = ['Medicine Name', 'Current Stock', 'Minimum Required Threshold', 'Deficit Units', 'Primary Supplier'];
      const rows: string[][] = [];
      map.forEach((m) => {
        if (m.qty <= m.minQty) {
          rows.push([
            `"${m.displayName}"`,
            m.qty.toString(),
            m.minQty.toString(),
            Math.max(0, m.minQty - m.qty).toString(),
            `"${m.agencyName}"`,
          ]);
        }
      });
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    case 'PURCHASES': {
      const invoices = await getInvoices();
      const headers = ['Invoice No', 'Date', 'Agency', 'Items Count', 'Taxable Amount', 'GST Amount', 'Total Amount', 'Paid Amount', 'Balance', 'Status'];
      const rows = invoices.map((i) => [
        `"${i.invoiceNumber}"`,
        i.invoiceDate,
        `"${i.agencyName}"`,
        i.itemsCount,
        i.taxableAmount.toFixed(2),
        i.gstAmount.toFixed(2),
        i.invoiceTotal.toFixed(2),
        i.paidAmount.toFixed(2),
        i.balanceAmount.toFixed(2),
        i.paymentStatus,
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    case 'PAYMENTS': {
      const payments = await getPayments();
      const headers = ['Payment Date', 'Agency', 'Amount', 'Method', 'Reference / Cheque No', 'Notes'];
      const rows = payments.map((p) => [
        p.paymentDate,
        `"${p.agencyName}"`,
        p.amount.toFixed(2),
        p.paymentMethod,
        `"${p.referenceNumber || ''}"`,
        `"${(p.notes || '').replace(/"/g, '""')}"`,
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    case 'EXPIRY': {
      const items = await getInvoiceItems();
      const headers = ['Medicine Name', 'Batch', 'Expiry Date', 'Quantity', 'Agency', 'Invoice No', 'Invoice Date', 'Purchase Rate'];
      const rows = items.map((i) => [
        `"${i.productName}"`,
        `"${i.batchNumber}"`,
        `"${i.expiryDate}"`,
        i.quantity,
        `"${i.agencyName}"`,
        `"${i.invoiceNumber}"`,
        i.invoiceDate,
        i.purchaseRate.toFixed(2),
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }

    default:
      return '';
  }
}

export async function clearAllDatabaseStores(): Promise<void> {
  const db = await openDB();
  const stores = ['agencies', 'invoices', 'invoice_items', 'payments', 'audit_logs'];

  for (const s of stores) {
    if (db.objectStoreNames.contains(s)) {
      await performTx(s, 'readwrite', (store) => {
        return new Promise((resolve) => {
          const req = store.clear();
          req.onsuccess = () => resolve(undefined);
          req.onerror = () => resolve(undefined);
        });
      });
    }
  }

  invalidateDataCache();
  dbPromise = null;
}

export async function resetDatabaseToDefaults(): Promise<void> {
  await clearAllDatabaseStores();
  localStorage.setItem('pharmascan_initialized_state', 'CLEAN_EMPTY');
  localStorage.setItem('pharmascan_has_been_reset', 'true');
}

export async function reseedDemoDatabase(): Promise<void> {
  await clearAllDatabaseStores();
  localStorage.removeItem('pharmascan_has_been_reset');
  localStorage.setItem('pharmascan_initialized_state', 'INITIAL_DEMO');
  await seedDemoPharmacyData();
  invalidateDataCache();
}

/**
 * Developer-only Clean Start & Reset (Requirement 2):
 * Allows developer/tester to clear test data and return to First-Launch Google Sign-In.
 * NEVER called automatically on startup, update, error, or refresh!
 */
export async function developerResetAllData(): Promise<void> {
  await clearAllDatabaseStores();

  // Clear local storage auth session & caches and mark CLEAN_EMPTY
  try {
    localStorage.setItem('pharmascan_initialized_state', 'CLEAN_EMPTY');
    localStorage.setItem('pharmascan_has_been_reset', 'true');
    localStorage.removeItem('pharmascan_auth_session');
    localStorage.removeItem('pharmascan_medicine_min_stock_levels');
    localStorage.removeItem('pharmascan_cloud_backup_cache');
    localStorage.removeItem('pharmascan_medicine_orders');
    localStorage.removeItem('pharmascan_medicine_order_draft');
    sessionStorage.clear();
  } catch {}

  invalidateDataCache();
  dbPromise = null;
}
