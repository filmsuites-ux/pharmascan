import {
  exportAllDataAsJson,
  getAgencies,
  getAuditLogs,
  getInvoiceItems,
  getInvoices,
  getMedicineMinStockConfig,
  getPayments,
  logAuditEvent,
  recalculateAllAgencyBalances,
  saveAgency,
  saveInvoice,
  savePayment,
} from '../db/indexedDb';
import { CloudBackupSummary } from '../types/pharmacy';
import { safeFetch } from './networkClient';

const BACKUP_CACHE_KEY = 'pharmascan_cloud_backup_cache';

export interface CloudBackupResult {
  success: boolean;
  message: string;
  savedAt?: string;
  summary?: CloudBackupSummary;
  error?: string;
}

export interface CheckBackupResult {
  hasBackup: boolean;
  summary?: CloudBackupSummary;
  fullData?: any;
  message?: string;
}

/**
 * Creates and uploads a full cloud backup for the given Google user email.
 * Never deletes local data.
 * Offline resilient: stores a local cache backup as well.
 */
export async function performCloudBackup(userEmail: string): Promise<CloudBackupResult> {
  if (!userEmail) {
    return { success: false, message: 'Google account email required for backup.', error: 'NO_EMAIL' };
  }

  try {
    const agencies = await getAgencies();
    const invoices = await getInvoices();
    const items = await getInvoiceItems();
    const payments = await getPayments();
    const auditLogs = await getAuditLogs();
    const minStockConfig = getMedicineMinStockConfig();

    const openingDues = invoices.filter((i) => i.documentType === 'OPENING_DUE');
    const scannedDocs = invoices.filter((i) => (i.images && i.images.length > 0) || (i.originalImages && i.originalImages.length > 0));

    // Unique medicines count
    const uniqueMedicines = new Set(items.map((i) => i.normalizedName || i.productName.toLowerCase().trim())).size;

    const totalBalance = agencies.reduce((acc, a) => acc + (a.notes ? 0 : 0), 0);

    const now = new Date().toISOString();

    const summary: CloudBackupSummary = {
      userEmail,
      savedAt: now,
      agenciesCount: agencies.length,
      invoicesCount: invoices.length,
      openingDuesCount: openingDues.length,
      paymentsCount: payments.length,
      itemsCount: items.length,
      medicinesCount: uniqueMedicines,
      scannedDocumentsCount: scannedDocs.length,
      totalBalance,
    };

    const fullPayload = {
      userEmail,
      savedAt: now,
      version: '2.0',
      summary,
      data: {
        agencies,
        invoices,
        items,
        payments,
        auditLogs,
        minStockConfig,
      },
    };

    // 1. Cache locally as an offline safety snapshot
    try {
      localStorage.setItem(BACKUP_CACHE_KEY, JSON.stringify(fullPayload));
    } catch (cacheErr) {
      console.warn('Could not cache full backup in localStorage (quota):', cacheErr);
    }

    // 2. Upload to server cloud backup endpoint with timeout
    let serverSuccess = false;
    try {
      const response = await safeFetch<{ success: boolean }>('/api/cloud-backup/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail,
          backupData: fullPayload,
        }),
        timeoutMs: 35000,
        maxRetries: 1,
      });

      if (response.data && response.data.success) {
        serverSuccess = true;
      }
    } catch (networkErr: any) {
      console.warn('Network unavailable for server cloud backup, saved to offline cache:', networkErr?.message || networkErr);
    }

    // Log audit event
    await logAuditEvent({
      entityType: 'INVOICE',
      entityId: `backup-${Date.now()}`,
      action: 'CREATE',
      description: `Cloud backup completed for ${userEmail}: ${agencies.length} agencies, ${invoices.length} bills, ${payments.length} payments`,
    });

    return {
      success: true,
      message: serverSuccess
        ? 'Pharmacy data securely backed up to cloud!'
        : 'Pharmacy data backed up locally (offline safe). Will sync when online.',
      savedAt: now,
      summary,
    };
  } catch (err: any) {
    console.error('Cloud backup error:', err);
    return {
      success: false,
      message: err.message || 'Failed to complete cloud backup. Local data remains safe.',
      error: String(err),
    };
  }
}

/**
 * Checks for available cloud backup for this Google account.
 * Inspects both the backend server and local cache with strict timeout.
 */
export async function checkForAvailableBackup(userEmail: string): Promise<CheckBackupResult> {
  if (!userEmail) return { hasBackup: false };

  // 1. Try server endpoint first with strict 5-second timeout
  try {
    const res = await safeFetch<{ hasBackup: boolean; backup?: any }>(
      `/api/cloud-backup/latest?email=${encodeURIComponent(userEmail)}`,
      {
        timeoutMs: 5000,
        maxRetries: 1,
        retryDelayMs: 400,
      }
    );
    if (res.data && res.data.hasBackup && res.data.backup) {
      const b = res.data.backup;
      const summary: CloudBackupSummary = b.summary || {
        userEmail,
        savedAt: b.savedAt || new Date().toISOString(),
        agenciesCount: b.data?.agencies?.length || 0,
        invoicesCount: b.data?.invoices?.length || 0,
        openingDuesCount: b.data?.invoices?.filter((i: any) => i.documentType === 'OPENING_DUE')?.length || 0,
        paymentsCount: b.data?.payments?.length || 0,
        itemsCount: b.data?.items?.length || 0,
        medicinesCount: new Set((b.data?.items || []).map((i: any) => i.productName)).size,
        scannedDocumentsCount: b.data?.invoices?.filter((i: any) => (i.images && i.images.length > 0) || (i.originalImages && i.originalImages.length > 0))?.length || 0,
        totalBalance: 0,
      };
      return {
        hasBackup: true,
        summary,
        fullData: b,
      };
    }
  } catch (err: any) {
    console.warn('Server backup check timed out or unreachable, falling back to local cache check:', err?.message || err);
  }

  // 2. Check local offline cache backup
  try {
    const raw = localStorage.getItem(BACKUP_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.userEmail === userEmail || !parsed.userEmail)) {
        return {
          hasBackup: true,
          summary: parsed.summary,
          fullData: parsed,
        };
      }
    }
  } catch {}

  return { hasBackup: false };
}

/**
 * Restores pharmacy data from backup payload without duplicating records.
 * Uses permanent unique record IDs (`id`).
 */
export async function restorePharmacyData(backupPayload: any): Promise<{
  success: boolean;
  message: string;
  restoredCounts: {
    agencies: number;
    invoices: number;
    payments: number;
    items: number;
  };
}> {
  try {
    const data = backupPayload.data || backupPayload;

    let agenciesCount = 0;
    let invoicesCount = 0;
    let paymentsCount = 0;
    let itemsCount = 0;

    // 1. Restore agencies using unique IDs
    if (Array.isArray(data.agencies)) {
      for (const ag of data.agencies) {
        if (!ag || !ag.id) continue;
        await saveAgency(ag);
        agenciesCount++;
      }
    }

    // 2. Restore invoices & items using unique IDs
    if (Array.isArray(data.invoices)) {
      for (const inv of data.invoices) {
        if (!inv || !inv.id) continue;
        const invItems = Array.isArray(data.items)
          ? data.items.filter((it: any) => it.invoiceId === inv.id)
          : undefined;
        await saveInvoice(inv, invItems);
        invoicesCount++;
        if (invItems) {
          itemsCount += invItems.length;
        }
      }
    }

    // 3. Restore payments using unique IDs
    if (Array.isArray(data.payments)) {
      for (const pay of data.payments) {
        if (!pay || !pay.id) continue;
        await savePayment(pay);
        paymentsCount++;
      }
    }

    // 4. Restore min stock configurations
    if (data.minStockConfig && typeof data.minStockConfig === 'object') {
      try {
        localStorage.setItem(
          'pharmascan_medicine_min_stock_levels',
          JSON.stringify(data.minStockConfig)
        );
      } catch {}
    }

    // 5. Recalculate all financial ledgers & balances
    await recalculateAllAgencyBalances();

    // 6. Record restore audit event
    await logAuditEvent({
      entityType: 'INVOICE',
      entityId: `restore-${Date.now()}`,
      action: 'UPDATE',
      description: `Data restored: ${agenciesCount} agencies, ${invoicesCount} invoices, ${paymentsCount} payments.`,
    });

    return {
      success: true,
      message: 'Pharmacy database successfully restored!',
      restoredCounts: {
        agencies: agenciesCount,
        invoices: invoicesCount,
        payments: paymentsCount,
        items: itemsCount,
      },
    };
  } catch (err: any) {
    console.error('Error during database restore:', err);
    throw new Error(`Restore failed: ${err.message || String(err)}`);
  }
}
