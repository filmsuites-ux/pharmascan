import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { PurchaseErrorBoundary } from './components/verification/PurchaseErrorBoundary';
import {
  AgencyFinancialSummary,
  DocumentType,
  ExtractedBillData,
  Invoice,
  OverallStats,
  PharmacyUserSession,
} from './types/pharmacy';
import {
  getAppDataSnapshot,
  initializeDatabase,
} from './db/indexedDb';
import { getCurrentUser, logoutUser } from './services/authService';
import { checkServerHealth } from './services/networkClient';
import { markAppStart, recordStepMetric } from './services/performanceTracker';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

// ============================================================================
// CODE-SPLITTING VIA REACT.LAZY (Deferred Non-Critical Views & Heavy Modals)
// Keeps initial bundle lightweight so Dashboard shell renders instantly.
// ============================================================================

// Heavy non-critical views (loaded on navigation)
const AgenciesView = lazy(() =>
  import('./components/agencies/AgenciesView').then((m) => ({ default: m.AgenciesView }))
);
const AgencyDetailView = lazy(() =>
  import('./components/agencies/AgencyDetailView').then((m) => ({ default: m.AgencyDetailView }))
);
const PaymentsView = lazy(() =>
  import('./components/payments/PaymentsView').then((m) => ({ default: m.PaymentsView }))
);
const PriceChangesView = lazy(() =>
  import('./components/priceChanges/PriceChangesView').then((m) => ({ default: m.PriceChangesView }))
);
const NearExpiryView = lazy(() =>
  import('./components/nearExpiry/NearExpiryView').then((m) => ({ default: m.NearExpiryView }))
);
const MedicinesView = lazy(() =>
  import('./components/medicines/MedicinesView').then((m) => ({ default: m.MedicinesView }))
);
const SmartOrdersView = lazy(() =>
  import('./components/orders/SmartOrdersView').then((m) => ({ default: m.SmartOrdersView }))
);
const DocumentsView = lazy(() =>
  import('./components/documents/DocumentsView').then((m) => ({ default: m.DocumentsView }))
);
const VisitsScheduleView = lazy(() =>
  import('./components/schedule/VisitsScheduleView').then((m) => ({ default: m.VisitsScheduleView }))
);
// Heavy report view (contains jspdf, jspdf-autotable, html2canvas)
const ReportsView = lazy(() =>
  import('./components/reports/ReportsView').then((m) => ({ default: m.ReportsView }))
);

// Heavy scanner & verification modals (camera access, image processing, canvas zoom)
const CameraScannerModal = lazy(() =>
  import('./components/scanner/CameraScannerModal').then((m) => ({ default: m.CameraScannerModal }))
);
const VerificationModal = lazy(() =>
  import('./components/verification/VerificationModal').then((m) => ({ default: m.VerificationModal }))
);

// User auth & maintenance modals
const WelcomeAuthScreen = lazy(() =>
  import('./components/auth/WelcomeAuthScreen').then((m) => ({ default: m.WelcomeAuthScreen }))
);
import { CloudBackupModal } from './components/auth/CloudBackupModal';
import { DiagnosticsModal } from './components/common/DiagnosticsModal';
import { DatabaseResetModal } from './components/common/DatabaseResetModal';
import { ShareApkModal } from './components/common/ShareApkModal';

// High-performance branded fallback loaders
const ViewLoadingFallback: React.FC<{ label?: string }> = ({ label = 'Loading View...' }) => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3 p-8 animate-in fade-in duration-200">
    <div className="w-10 h-10 border-2 border-sky-500/30 border-t-sky-400 rounded-full animate-spin shadow-lg shadow-sky-500/20" />
    <div className="text-xs font-bold text-slate-200 tracking-wide">{label}</div>
    <div className="text-[11px] text-slate-400">Preparing spatial pharmacy records...</div>
  </div>
);

const ModalLoadingFallback: React.FC<{ label?: string }> = ({ label = 'Opening...' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
    <div className="spatial-panel p-5 rounded-2xl flex items-center gap-3 text-white text-xs font-bold shadow-2xl border border-sky-500/20">
      <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
      <span>{label}</span>
    </div>
  </div>
);

export default function App() {
  const [currentUser, setCurrentUser] = useState<PharmacyUserSession | null>(() => {
    try {
      return getCurrentUser();
    } catch (err) {
      console.warn('Could not read auth session from storage:', err);
      return null;
    }
  });
  const [isCloudBackupOpen, setIsCloudBackupOpen] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [isDatabaseResetOpen, setIsDatabaseResetOpen] = useState<boolean>(false);
  const [isShareApkOpen, setIsShareApkOpen] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);

  // Core Data
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [agencies, setAgencies] = useState<AgencyFinancialSummary[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Scanner & Verification Modals (Raw Original + Processed Readable Scans preserved)
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isVerificationOpen, setIsVerificationOpen] = useState(false);
  const [scannedImages, setScannedImages] = useState<string[]>([]);
  const [scannedOriginalImages, setScannedOriginalImages] = useState<string[]>([]);
  const [scannedProcessedImages, setScannedProcessedImages] = useState<string[]>([]);
  const [scannedPdfData, setScannedPdfData] = useState<string | null>(null);
  const [scannedPdfName, setScannedPdfName] = useState<string | null>(null);
  const [scannedDocType, setScannedDocType] = useState<DocumentType>('TAX_INVOICE');
  const [scannedData, setScannedData] = useState<ExtractedBillData | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Load / refresh data from IndexedDB using fast single-pass batched snapshot
  const refreshAppData = async (force = false) => {
    try {
      const start = performance.now();
      const snapshot = await getAppDataSnapshot(force);
      setStats(snapshot.stats);
      setAgencies(snapshot.agencies);
      setRecentInvoices(snapshot.recentInvoices);
      recordStepMetric('refresh_app_data', performance.now() - start, 'SUCCESS');
    } catch (err: any) {
      console.error('Error refreshing app data:', err);
      showToast('Database error: ' + (err.message || 'Failed to read data'), 'error');
    }
  };

  const initApp = async () => {
    setIsInitializing(true);
    setInitError(null);
    markAppStart();
    const start = performance.now();

    const loadTask = (async () => {
      await initializeDatabase();
      const snapshot = await getAppDataSnapshot();
      setStats(snapshot.stats);
      setAgencies(snapshot.agencies);
      setRecentInvoices(snapshot.recentInvoices);
      recordStepMetric('total_startup_init', performance.now() - start, 'SUCCESS');
    })();

    const timeoutTask = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Storage initialization timed out. Tap retry below to reconnect.'));
      }, 7000);
    });

    try {
      await Promise.race([loadTask, timeoutTask]);
    } catch (err: any) {
      console.error('Startup initialization error:', err);
      setInitError(err.message || 'Database initialization error.');
      recordStepMetric('total_startup_init', performance.now() - start, 'ERROR', err.message);
    } finally {
      setIsInitializing(false);
    }

    // Proactive background server health check without blocking user
    checkServerHealth(3500)
      .then((h) => {
        recordStepMetric('server_health_probe', h.latencyMs, h.isServerAvailable ? 'SUCCESS' : 'WARNING');
      })
      .catch(() => {});
  };

  useEffect(() => {
    initApp();
  }, []);

  // Handle OCR scan complete -> opens Human Verification Modal with raw & processed scans
  const handleScanComplete = (
    originalImages: string[],
    processedImages: string[],
    data: ExtractedBillData,
    documentType: DocumentType,
    originalPdfData?: string,
    originalPdfName?: string
  ) => {
    setIsScannerOpen(false);
    setScannedOriginalImages(originalImages);
    setScannedProcessedImages(processedImages);
    setScannedImages(processedImages.length > 0 ? processedImages : originalImages);
    setScannedData(data);
    setScannedDocType(documentType);
    setScannedPdfData(originalPdfData || null);
    setScannedPdfName(originalPdfName || null);
    setIsVerificationOpen(true);
  };

  const handleInvoiceSaved = async () => {
    await refreshAppData(true);
    setIsVerificationOpen(false);
    setScannedData(null);
    setScannedImages([]);
    setScannedOriginalImages([]);
    setScannedProcessedImages([]);
    setScannedPdfData(null);
    setScannedPdfName(null);
    showToast('Bill successfully audited and recorded in ledger!');
  };

  const handleCloseVerification = () => {
    setIsVerificationOpen(false);
    setScannedData(null);
    setScannedImages([]);
    setScannedOriginalImages([]);
    setScannedProcessedImages([]);
    setScannedPdfData(null);
    setScannedPdfName(null);
  };

  const handleNavigate = (view: string) => {
    setCurrentView(view);
    if (view !== 'agency_detail') {
      setSelectedAgencyId(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectAgency = (agencyId: string) => {
    setSelectedAgencyId(agencyId);
    setCurrentView('agency_detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScanBillForAgency = (_agencyId: string) => {
    setIsScannerOpen(true);
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    showToast('Logged out successfully', 'success');
  };

  // First-launch / fresh install Google Sign-in flow (Requirement 1 & 2)
  if (!currentUser) {
    return (
      <Suspense fallback={<ViewLoadingFallback label="Loading Authentication..." />}>
        <WelcomeAuthScreen
          onAuthenticated={(session) => {
            setCurrentUser(session);
            refreshAppData();
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white relative">
      {/* Ambient Spatial Background Illumination */}
      <div className="spatial-mesh-background" aria-hidden="true" />
      <div className="spatial-grid-overlay" aria-hidden="true" />

      {/* Spatial Floating Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900/90 backdrop-blur-xl border border-sky-400/40 text-white text-xs font-semibold rounded-2xl shadow-2xl shadow-sky-500/20 animate-in slide-in-from-top-2">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Navbar - Immediate critical path render */}
      <div className="relative z-30">
        <Navbar
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenScanner={() => setIsScannerOpen(true)}
          stats={stats}
          currentUser={currentUser}
          onOpenCloudBackup={() => setIsCloudBackupOpen(true)}
          onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
          onOpenShareApk={() => setIsShareApkOpen(true)}
          onOpenDatabaseReset={() => setIsDatabaseResetOpen(true)}
          onLogout={handleLogout}
        />
      </div>

      {/* Main App Container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {initError ? (
          <div className="p-8 bg-slate-900 border border-red-500/40 rounded-2xl max-w-md mx-auto text-center space-y-4 my-12">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white">Database Startup Notice</h2>
              <p className="text-xs text-slate-400">{initError}</p>
            </div>
            <button
              onClick={() => initApp()}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-colors cursor-pointer"
            >
              Retry Loading Database
            </button>
          </div>
        ) : isInitializing ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Initializing Pharmacy Management DB...</p>
          </div>
        ) : (
          <Suspense fallback={<ViewLoadingFallback label={`Opening ${currentView.replace('_', ' ')}...`} />}>
            {/* Immediate Main Dashboard (Synchronously loaded) */}
            {currentView === 'dashboard' && (
              <Dashboard
                stats={stats}
                agencies={agencies}
                recentInvoices={recentInvoices}
                onOpenScanner={() => setIsScannerOpen(true)}
                onNavigate={handleNavigate}
                onSelectAgency={handleSelectAgency}
                onOpenShareApk={() => setIsShareApkOpen(true)}
              />
            )}

            {/* Lazy-Loaded Secondary Views */}
            {currentView === 'orders' && (
              <SmartOrdersView onNavigate={handleNavigate} />
            )}

            {currentView === 'schedule' && (
              <VisitsScheduleView
                onSelectAgency={handleSelectAgency}
                onScanBill={() => setIsScannerOpen(true)}
              />
            )}

            {currentView === 'agencies' && (
              <AgenciesView
                onSelectAgency={handleSelectAgency}
                onScanBill={() => setIsScannerOpen(true)}
              />
            )}

            {currentView === 'agency_detail' && selectedAgencyId && (
              <AgencyDetailView
                agencyId={selectedAgencyId}
                onBack={() => handleNavigate('agencies')}
                onScanBillForAgency={handleScanBillForAgency}
              />
            )}

            {currentView === 'payments' && <PaymentsView />}

            {currentView === 'price_changes' && <PriceChangesView />}

            {currentView === 'expiry' && (
              <NearExpiryView onSelectAgency={handleSelectAgency} />
            )}

            {currentView === 'medicines' && (
              <MedicinesView onNavigate={handleNavigate} />
            )}

            {currentView === 'documents' && (
              <DocumentsView
                onScanNewDocument={() => setIsScannerOpen(true)}
                onSelectAgency={handleSelectAgency}
              />
            )}

            {currentView === 'reports' && (
              <ReportsView onOpenDatabaseReset={() => setIsDatabaseResetOpen(true)} />
            )}
          </Suspense>
        )}
      </main>

      {/* Camera Bill Scanner Modal (Lazy Loaded only when opened) */}
      {isScannerOpen && (
        <Suspense fallback={<ModalLoadingFallback label="Starting Camera Bill Scanner..." />}>
          <CameraScannerModal
            isOpen={isScannerOpen}
            onClose={() => setIsScannerOpen(false)}
            onScanComplete={handleScanComplete}
            onSaved={handleInvoiceSaved}
            onNavigate={handleNavigate}
          />
        </Suspense>
      )}

      {/* Human Verification Modal (Lazy Loaded only when OCR completes) */}
      {isVerificationOpen && scannedData && (
        <Suspense fallback={<ModalLoadingFallback label="Loading Bill Verification..." />}>
          <PurchaseErrorBoundary
            onNavigate={(view) => {
              handleNavigate(view);
              handleCloseVerification();
            }}
            onReset={() => {
              // Allows user to stay on or retry review flow
            }}
          >
            <VerificationModal
              isOpen={isVerificationOpen}
              images={scannedImages}
              originalImages={scannedOriginalImages}
              processedImages={scannedProcessedImages}
              documentType={scannedDocType}
              originalPdfData={scannedPdfData || undefined}
              originalPdfName={scannedPdfName || undefined}
              extractedData={scannedData}
              onClose={handleCloseVerification}
              onSaved={handleInvoiceSaved}
              onNavigate={(view, agencyId) => {
                if (agencyId) {
                  handleSelectAgency(agencyId);
                } else {
                  handleNavigate(view);
                }
                handleCloseVerification();
              }}
              onScanAnother={() => {
                handleCloseVerification();
                setIsScannerOpen(true);
              }}
            />
          </PurchaseErrorBoundary>
        </Suspense>
      )}

      {/* Google Cloud Backup & Account Modal (Lazy Loaded only when opened) */}
      {/* Google Cloud Backup & Account Modal */}
      {isCloudBackupOpen && currentUser && (
        <CloudBackupModal
          isOpen={isCloudBackupOpen}
          currentUser={currentUser}
          onClose={() => setIsCloudBackupOpen(false)}
          onDataRestored={async () => {
            await refreshAppData(true);
            showToast('Pharmacy database successfully restored from Cloud backup!');
          }}
          onDeveloperReset={async () => {
            setIsCloudBackupOpen(false);
            setCurrentUser(null);
            await refreshAppData(true);
            showToast('Developer Reset: local data cleared and returned to Google Sign-In.');
          }}
          onOpenDatabaseReset={() => setIsDatabaseResetOpen(true)}
        />
      )}

      {/* System Diagnostics & Server Reliability Modal */}
      {isDiagnosticsOpen && (
        <DiagnosticsModal
          isOpen={isDiagnosticsOpen}
          onClose={() => setIsDiagnosticsOpen(false)}
          onRefreshData={() => refreshAppData(true)}
        />
      )}

      {/* Verified Database Reset Modal */}
      {isDatabaseResetOpen && (
        <DatabaseResetModal
          isOpen={isDatabaseResetOpen}
          onClose={() => setIsDatabaseResetOpen(false)}
          currentUser={currentUser}
          onResetCompleted={async (result) => {
            await refreshAppData(true);
            showToast(result.message);
          }}
          onDemoDataLoaded={async () => {
            await refreshAppData(true);
            showToast('Sample Indian pharmacy bills and distributors re-seeded.');
          }}
          onSignOut={() => {
            setIsDatabaseResetOpen(false);
            setCurrentUser(null);
          }}
        />
      )}

      {/* Android APK Distribution & Sharing Modal */}
      {isShareApkOpen && (
        <ShareApkModal
          isOpen={isShareApkOpen}
          onClose={() => setIsShareApkOpen(false)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>PharmaScan • Pharmacy Bill Scanner & Purchase Management System</span>
          <span>IndexedDB Persistent Storage • Pre-Save Audit Protection • Real Indian GST & Expiry Logic</span>
        </div>
      </footer>
    </div>
  );
}
