import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Share2,
  Download,
  Upload,
  CheckCircle2,
  Copy,
  Terminal,
  ExternalLink,
  X,
  HardDrive,
  Info,
  RefreshCw,
  QrCode as QrIcon,
  Sparkles,
  Send,
  Globe,
  Bluetooth,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import { safeFetch } from '../../services/networkClient';
import { QrCode } from './QrCode';

interface ApkStatus {
  hasApk: boolean;
  filename: string | null;
  sizeBytes: number;
  sizeMb: number;
  path: string | null;
  projectType: string;
  serverEnvironmentSupportsBuild: boolean;
  environmentNotice: string;
}

interface ShareApkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareApkModal: React.FC<ShareApkModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'DOWNLOAD_SHARE_APK' | 'SHARE_LINK_QR' | 'CONVERT_APK' | 'PWA_ALTERNATIVE' | 'GRADLE_BUILD' | 'DOWNLOAD_SOURCE_ZIP'>(
    'DOWNLOAD_SHARE_APK'
  );
  const [status, setStatus] = useState<ApkStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [showQrCode, setShowQrCode] = useState<boolean>(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);

  // Real publicly accessible deployment URL (from metadata)
  const deployedPublicUrl = 'https://ais-pre-ua4pxoz4fpxwtcdt6puo6s-514190747067.asia-southeast1.run.app';

  // Always use the real public HTTPS URL so other phones can actually connect
  const installationUrl = typeof window !== 'undefined' && window.location.origin.includes('run.app')
    ? window.location.origin
    : deployedPublicUrl;

  const pwabuilderUrl = `https://www.pwabuilder.com/?site=${encodeURIComponent(installationUrl)}`;

  // Capture PWA beforeinstallprompt
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const fetchApkStatus = async () => {
    setLoading(true);
    setShareFeedback(null);
    try {
      const res = await safeFetch<ApkStatus>('/api/apk/status', { timeoutMs: 6000 });
      if (res.data) {
        setStatus(res.data);
      }
    } catch (err: any) {
      console.warn('Could not query APK status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchApkStatus();
      setShareFeedback(null);
      setUploadFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Share the actual APK file via Android native share sheet (WhatsApp, Bluetooth, Quick Share)
  const handleShareApkFile = async (preferredChannel?: 'whatsapp' | 'bluetooth') => {
    if (!status?.hasApk) {
      setShareFeedback({
        text: 'Cannot share: No installable APK file exists on the server. Please build or upload PharmaScan.apk first.',
        type: 'error',
      });
      return;
    }

    setIsSharing(true);
    setShareFeedback(null);

    try {
      // Fetch the real binary APK blob from server
      const res = await fetch('/api/apk/download');
      if (!res.ok) throw new Error('Failed to retrieve APK file from server storage');

      const blob = await res.blob();
      const apkFile = new File([blob], status.filename || 'PharmaScan.apk', {
        type: 'application/vnd.android.package-archive',
      });

      // Invoke Android Native Share Sheet
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [apkFile] })
      ) {
        await navigator.share({
          files: [apkFile],
          title: 'PharmaScan APK',
          text: preferredChannel === 'whatsapp'
            ? 'PharmaScan Pharmacy Management Android APK (Attached)'
            : 'PharmaScan Installable Android Package',
        });
        setShareFeedback({
          text: 'Android Share Sheet opened with the actual APK file attached. Select WhatsApp, Bluetooth, or Quick Share.',
          type: 'success',
        });
      } else {
        // Fallback: Trigger direct binary download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = status.filename || 'PharmaScan.apk';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        setShareFeedback({
          text: 'Native file-sharing is not supported in this browser. The actual APK file was saved to your device downloads folder.',
          type: 'info',
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setShareFeedback({ text: 'Sharing dismissed by user.', type: 'info' });
      } else {
        setShareFeedback({ text: `Share error: ${err.message}`, type: 'error' });
      }
    } finally {
      setIsSharing(false);
    }
  };

  // Direct APK download
  const handleDirectDownloadApk = () => {
    if (!status?.hasApk) {
      setShareFeedback({
        text: 'Cannot download: No APK file is present on the server storage yet.',
        type: 'error',
      });
      return;
    }
    window.location.href = '/api/apk/download';
  };

  // 2. Share Installation Link via WhatsApp or Share Sheet
  const handleShareInstallationLink = async () => {
    const title = 'PharmaScan - Pharmacy Management App';
    const text = `💊 PharmaScan Pharmacy Management\nPurchase Bill Scanner, Distributor Ledger & Expiry Tracking.\nOpen and install directly on your phone:\n${installationUrl}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: installationUrl,
        });
        setShareFeedback({ text: 'Installation link shared successfully.', type: 'success' });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          copyLinkToClipboard(text);
        }
      }
    } else {
      copyLinkToClipboard(text);
    }
  };

  const handleShareLinkOnWhatsApp = () => {
    const message = encodeURIComponent(
      `💊 *PharmaScan - Pharmacy Purchase & Distributor Management*\nOpen and install this app directly on your phone:\n${installationUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${message}`, '_blank');
  };

  const copyLinkToClipboard = (customText?: string) => {
    const textToCopy = customText || installationUrl;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      setShareFeedback({
        text: 'Public installation link copied to clipboard! You can paste and send it to other devices.',
        type: 'success',
      });
    }
  };

  // 3. Trigger in-app PWA home-screen install
  const handleTriggerInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
    } else {
      alert(
        'To install PharmaScan on Android:\n1. Tap the browser menu (3 dots) in Chrome.\n2. Tap "Install app" or "Add to Home screen".\n3. Confirm "Install". It will install with a dedicated pharmacy app icon!'
      );
    }
  };

  // 4. Upload pre-built APK file to host on server
  const handleUploadApk = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.apk')) {
      setUploadFeedback('Error: Please select a valid .apk Android package file.');
      return;
    }

    setIsUploading(true);
    setUploadFeedback('Reading and uploading APK package to server storage...');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        try {
          const res = await safeFetch<{ success: boolean; error?: string }>('/api/apk/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Data, filename: file.name }),
            timeoutMs: 60000,
          });

          if (res.data?.success) {
            setUploadFeedback('Success! APK uploaded and verified on server storage.');
            await fetchApkStatus();
            setActiveTab('DOWNLOAD_SHARE_APK');
          } else {
            setUploadFeedback(`Upload failed: ${res.data?.error || 'Server error'}`);
          }
        } catch (postErr: any) {
          setUploadFeedback(`Upload error: ${postErr.message}`);
        } finally {
          setIsUploading(false);
        }
      };
      reader.onerror = () => {
        setUploadFeedback('Error reading local APK file.');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadFeedback(`Error: ${err.message}`);
      setIsUploading(false);
    }
  };

  const copyCommand = (text: string, index: number) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
  };

  const buildCommands = [
    { label: '1. Build production web bundle', cmd: 'npm run build' },
    { label: '2. Add Android platform via Capacitor', cmd: 'npx cap add android' },
    { label: '3. Sync web assets & plugins to Android', cmd: 'npx cap sync android' },
    { label: '4. Compile Debug APK with Gradle', cmd: 'cd android && ./gradlew assembleDebug' },
    { label: '5. Compile Release APK with Gradle', cmd: 'cd android && ./gradlew assembleRelease' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in duration-200 overflow-y-auto">
      <div className="spatial-modal border border-white/15 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 border border-sky-400/30 flex items-center justify-center text-white font-bold shadow-lg shadow-sky-500/25">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Download &amp; Share APK / App
              </h2>
              <p className="text-xs text-slate-400">
                Installable Android Package (.apk) distribution &amp; multi-user sharing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 gap-1 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setActiveTab('DOWNLOAD_SHARE_APK')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'DOWNLOAD_SHARE_APK'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>1. Download &amp; Share APK</span>
            {status?.hasApk && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-1" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('SHARE_LINK_QR')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'SHARE_LINK_QR'
                ? 'border-blue-400 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrIcon className="w-3.5 h-3.5" />
            <span>2. Link &amp; QR Code</span>
          </button>

          <button
            onClick={() => setActiveTab('CONVERT_APK')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'CONVERT_APK'
                ? 'border-teal-400 text-teal-400 bg-teal-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>3. 1-Click APK Generator</span>
          </button>

          <button
            onClick={() => setActiveTab('PWA_ALTERNATIVE')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'PWA_ALTERNATIVE'
                ? 'border-purple-400 text-purple-400 bg-purple-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>4. Install as PWA</span>
          </button>

          <button
            onClick={() => setActiveTab('GRADLE_BUILD')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'GRADLE_BUILD'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>5. Android Studio Guide</span>
          </button>

          <button
            onClick={() => setActiveTab('DOWNLOAD_SOURCE_ZIP')}
            className={`px-3 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'DOWNLOAD_SOURCE_ZIP'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span>6. Project ZIP &amp; Free GitHub Build</span>
            <span className="text-[10px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40 font-mono">
              322 KB
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Data Safety & Isolation Banner */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-2.5 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Per-User Data Isolation:</strong> Each user who installs this app receives a completely separate local IndexedDB on their phone. Your private bills, distributor dues, and records are never transferred.
            </span>
          </div>

          {/* Feedback Banner */}
          {shareFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                shareFeedback.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
                  : shareFeedback.type === 'error'
                  ? 'bg-red-950/50 border-red-700/60 text-red-300'
                  : 'bg-blue-950/50 border-blue-700/60 text-blue-300'
              }`}
            >
              {shareFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <Info className="w-4 h-4 shrink-0" />
              )}
              <span>{shareFeedback.text}</span>
            </div>
          )}

          {/* TAB 1: DOWNLOAD & SHARE APK */}
          {activeTab === 'DOWNLOAD_SHARE_APK' && (
            <div className="space-y-4">
              {loading ? (
                <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                  <span className="text-xs">Inspecting APK status and storage...</span>
                </div>
              ) : status?.hasApk ? (
                /* APK FILE IS PRESENT */
                <div className="p-4 bg-emerald-950/40 border border-emerald-600/50 rounded-2xl space-y-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                    <div>
                      <h3 className="font-bold text-white text-sm sm:text-base">
                        Installable APK File Verified on Server
                      </h3>
                      <p className="text-xs text-emerald-200/80">
                        {status.filename} ({status.sizeMb} MB) — Ready to download and share
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs space-y-1.5 text-slate-300 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">File Name:</span>
                      <span className="text-white font-bold">{status.filename}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Size:</span>
                      <span className="text-white">{status.sizeMb} MB ({status.sizeBytes.toLocaleString()} bytes)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Location:</span>
                      <span className="text-slate-400 truncate max-w-[280px]">{status.path}</span>
                    </div>
                  </div>

                  {/* Real Share Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                    <button
                      onClick={() => handleShareApkFile('whatsapp')}
                      disabled={isSharing}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Share APK attached via WhatsApp"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSharing ? 'Attaching APK...' : 'Share via WhatsApp'}</span>
                    </button>

                    <button
                      onClick={() => handleShareApkFile('bluetooth')}
                      disabled={isSharing}
                      className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Share APK via Bluetooth or Quick Share"
                    >
                      <Bluetooth className="w-3.5 h-3.5" />
                      <span>Bluetooth / Quick Share</span>
                    </button>

                    <button
                      onClick={handleDirectDownloadApk}
                      className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .apk</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* APK FILE NOT YET PRESENT */
                <div className="space-y-4">
                  <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4" />
                      <span>No APK File Currently Hosted on Server Storage</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Google AI Studio is a containerized web development environment. It runs Node.js and TypeScript, but lacks the native Android SDK, JDK, and Gradle needed to compile <code className="text-amber-200 font-mono">.apk</code> binaries directly inside this container.
                    </p>
                    <div className="text-[11px] text-amber-200/90 bg-amber-950/50 p-2.5 rounded-xl border border-amber-800/40">
                      <strong>Truthful Enforcement:</strong> We do not display fake share buttons or pretend an APK exists when none is present on disk. Follow the steps below or use the 1-Click Generator in Tab 3 to obtain your APK.
                    </div>
                  </div>

                  {/* Disabled Share Button with Explanation */}
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                      <span>APK File Actions (Requires Hosted .apk File)</span>
                      <span className="text-[10px] text-red-400 font-mono">Not Yet Built</span>
                    </div>
                    <div className="flex flex-wrap gap-2 opacity-50">
                      <button
                        disabled
                        className="px-4 py-2 bg-slate-800 text-slate-400 text-xs font-semibold rounded-xl cursor-not-allowed flex items-center gap-2"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Share APK via WhatsApp</span>
                      </button>
                      <button
                        disabled
                        className="px-4 py-2 bg-slate-800 text-slate-400 text-xs font-semibold rounded-xl cursor-not-allowed flex items-center gap-2"
                      >
                        <Bluetooth className="w-3.5 h-3.5" />
                        <span>Bluetooth / Quick Share</span>
                      </button>
                      <button
                        disabled
                        className="px-4 py-2 bg-slate-800 text-slate-400 text-xs font-semibold rounded-xl cursor-not-allowed flex items-center gap-2"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download APK</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      💡 To activate these buttons: Generate your APK in <strong>Tab 3 (1-Click Generator)</strong> or compile it in <strong>Tab 5</strong>, then upload it below.
                    </p>
                  </div>

                  {/* Upload Pre-Built APK Form */}
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                        <Upload className="w-4 h-4 text-emerald-400" />
                        <span>Host Your Compiled APK on Server</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">Storage: /data/apk/</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Have a compiled <code className="text-slate-300 font-mono">PharmaScan.apk</code>? Upload it here to store it on the server and immediately enable direct downloads and WhatsApp file sharing.
                    </p>

                    <div className="flex items-center gap-3 pt-1">
                      <label className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer flex items-center gap-2">
                        <HardDrive className="w-4 h-4" />
                        <span>Select .apk File</span>
                        <input
                          type="file"
                          accept=".apk"
                          onChange={handleUploadApk}
                          disabled={isUploading}
                          className="hidden"
                        />
                      </label>
                      {isUploading && (
                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                          Uploading to server storage...
                        </span>
                      )}
                    </div>

                    {uploadFeedback && (
                      <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300">
                        {uploadFeedback}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SHARE INSTALLATION LINK & QR CODE */}
          {activeTab === 'SHARE_LINK_QR' && (
            <div className="space-y-5">
              <div className="p-4 bg-blue-950/30 border border-blue-800/60 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-300 font-bold text-xs uppercase tracking-wider">
                    <Globe className="w-4 h-4" />
                    <span>Real Public HTTPS Installation URL</span>
                  </div>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase">
                    Deployed &amp; Live
                  </span>
                </div>

                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
                  <code className="text-xs text-emerald-400 font-mono truncate flex-1 select-all">
                    {installationUrl}
                  </code>
                  <button
                    onClick={() => copyLinkToClipboard()}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Share Link Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleShareLinkOnWhatsApp}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Share Link via WhatsApp</span>
                  </button>

                  <button
                    onClick={handleShareInstallationLink}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Sheet (All Apps)</span>
                  </button>

                  <button
                    onClick={() => setShowQrCode(!showQrCode)}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 font-semibold text-xs rounded-xl border border-slate-800 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <QrIcon className="w-3.5 h-3.5 text-teal-400" />
                    <span>{showQrCode ? 'Hide QR Code' : 'Show QR Code'}</span>
                  </button>
                </div>
              </div>

              {/* QR Code Display */}
              {showQrCode && (
                <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center gap-5 animate-in fade-in">
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <QrCode text={installationUrl} size={150} />
                    <span className="text-[10px] text-slate-500 font-mono mt-1">Live Deployed URL</span>
                  </div>

                  <div className="space-y-2 text-center sm:text-left">
                    <h4 className="text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                      <QrIcon className="w-4 h-4 text-emerald-400" />
                      <span>Instant Phone Camera Scanner</span>
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Point any smartphone camera (Android or iPhone) at this QR code. It will open the real deployed PharmaScan app and prompt the user to install it directly to their home screen.
                    </p>
                    <div className="text-[11px] text-slate-400 font-mono bg-slate-900 p-2 rounded-lg border border-slate-800">
                      Destination: {installationUrl}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: 1-CLICK CONVERT TO APK (PWABUILDER) */}
          {activeTab === 'CONVERT_APK' && (
            <div className="space-y-4">
              <div className="p-4 bg-teal-950/30 border border-teal-800/60 rounded-2xl space-y-3">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-teal-400 shrink-0" />
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      1-Click APK Generator (Microsoft PWABuilder)
                    </h3>
                    <p className="text-xs text-teal-200/80">
                      Generates a real, installable Android APK directly in the cloud
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Because Google AI Studio web containers cannot run Android SDK Gradle builds internally, the simplest and official workflow to get an installable Android APK is <strong>PWABuilder</strong> (created by Microsoft):
                </p>

                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="font-semibold text-slate-200">How to get your APK in 3 simple steps:</div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-[11px]">
                    <li>
                      Click the button below to launch PWABuilder with your live deployed URL: <code className="text-teal-300 font-mono text-[10px]">{installationUrl}</code>.
                    </li>
                    <li>
                      PWABuilder tests the live manifest (<code className="text-teal-300 font-mono">/manifest.webmanifest</code>) and icons (all pre-configured).
                    </li>
                    <li>
                      Click <strong>Package for Android</strong> &gt; download your signed <code className="text-emerald-400 font-mono font-bold">PharmaScan.apk</code> file!
                    </li>
                  </ol>
                </div>

                <div className="pt-1">
                  <a
                    href={pwabuilderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <span>Launch 1-Click APK Generator (PWABuilder)</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INSTALLABLE PWA ALTERNATIVE */}
          {activeTab === 'PWA_ALTERNATIVE' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-950/30 border border-purple-800/60 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-purple-300 font-bold text-xs uppercase tracking-wider">
                  <Globe className="w-4 h-4" />
                  <span>PWA vs. Native APK: What is the Difference?</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  A <strong>Progressive Web App (PWA)</strong> is installed directly through your mobile browser (like Google Chrome) without transferring a <code className="text-purple-200 font-mono">.apk</code> file. A <strong>Native APK</strong> is an Android installation package distributed via WhatsApp, Bluetooth, or the Google Play Store.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-teal-400" />
                      <span>Progressive Web App (PWA)</span>
                    </div>
                    <ul className="text-[11px] text-slate-300 space-y-0.5 list-disc list-inside">
                      <li>Installs in 1 tap from Chrome</li>
                      <li>Auto-updates instantly on refresh</li>
                      <li>Camera scanner &amp; IndexedDB offline</li>
                      <li>No side-loading security warnings</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Native Android APK</span>
                    </div>
                    <ul className="text-[11px] text-slate-300 space-y-0.5 list-disc list-inside">
                      <li>Stand-alone binary file (.apk)</li>
                      <li>Transferable via WhatsApp / Bluetooth</li>
                      <li>Requires manual updates on each device</li>
                      <li>May show "Unknown sources" on install</li>
                    </ul>
                  </div>
                </div>

                {/* Chrome Installation Instructions */}
                <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="font-semibold text-slate-200">How to install PharmaScan via Chrome on Android:</div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
                    <li>Open <code className="text-emerald-400 font-mono text-[10px]">{installationUrl}</code> in Google Chrome.</li>
                    <li>Tap the <strong>3 dots menu</strong> in the top-right corner of Chrome.</li>
                    <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                    <li>Confirm <strong>"Install"</strong>. PharmaScan will appear on your home screen with a dedicated icon!</li>
                  </ol>
                </div>

                <div className="pt-1">
                  <button
                    onClick={handleTriggerInstall}
                    className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>{isInstalled ? 'App Already Installed ✓' : 'Install PharmaScan on This Device'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ANDROID STUDIO BUILD GUIDE (CAPACITOR) */}
          {activeTab === 'GRADLE_BUILD' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-950/30 border border-amber-800/60 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                  <Terminal className="w-4 h-4" />
                  <span>Compile Release APK with Android Studio &amp; Capacitor</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The project root is already configured with <code className="text-amber-200 font-mono">capacitor.config.ts</code> (App ID: <code className="text-white font-mono">com.pharmascan.app</code>). Follow these commands on any computer with Node.js and Android Studio:
                </p>
              </div>

              <div className="space-y-1.5">
                {buildCommands.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5 flex-1 pr-2">
                      <div className="text-[10px] text-slate-400 font-medium">{step.label}</div>
                      <code className="text-teal-300 font-mono text-[11px] select-all block">
                        {step.cmd}
                      </code>
                    </div>
                    <button
                      onClick={() => copyCommand(step.cmd, idx)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded-md border border-slate-700 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                      title="Copy command"
                    >
                      {copiedIndex === idx ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-1 text-slate-300 font-mono text-[11px]">
                <div className="font-semibold text-slate-200 font-sans text-xs">Output APK File Locations:</div>
                <div>
                  Debug: <span className="text-emerald-400">android/app/build/outputs/apk/debug/app-debug.apk</span>
                </div>
                <div>
                  Release: <span className="text-emerald-400">android/app/build/outputs/apk/release/app-release-unsigned.apk</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Complete Source Code Project ZIP & Free GitHub Actions Build */}
          {activeTab === 'DOWNLOAD_SOURCE_ZIP' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/50 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <HardDrive className="w-4 h-4" />
                    <span>Complete Project Source ZIP (Ready for APK Building)</span>
                  </div>
                  <span className="text-[11px] font-mono bg-emerald-900/60 text-emerald-200 px-2 py-0.5 rounded border border-emerald-500/30">
                    322 KB • 70 Files
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This archive contains the complete, pristine source code of your PharmaScan project, including all React 19 UI components, TypeScript configs, Vite build scripts, Capacitor configuration (<code className="text-emerald-300">com.pharmascan.app</code>), PWA manifest, and a free <strong className="text-white">GitHub Actions automated APK build workflow</strong>. Zero private keys or passwords are included.
                </p>
              </div>

              {/* Download Action Buttons */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <a
                    href="/api/project/download-zip"
                    download="pharmascan-source.zip"
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Project ZIP (pharmascan-source.zip)</span>
                  </a>

                  <a
                    href="/downloads/pharmascan-source.zip"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Direct Static Link</span>
                  </a>
                </div>

                <div className="text-[11px] text-slate-400 space-y-1">
                  <div><strong>Included Files:</strong> package.json, capacitor.config.ts, vite.config.ts, tsconfig.json, index.html, server.ts, public/, src/, and .github/workflows/build-apk.yml</div>
                  <div><strong>Excluded:</strong> node_modules, dist, private credentials (keeps download ultra-fast and lightweight).</div>
                </div>
              </div>

              {/* Free 100% Automated APK Building via GitHub Actions */}
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-teal-400 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>Free Automated APK Building via GitHub Actions (Zero Local Setup)</span>
                </div>
                <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>
                    <strong>Download the ZIP:</strong> Tap the green download button above to save <code className="text-teal-300">pharmascan-source.zip</code> to your computer.
                  </li>
                  <li>
                    <strong>Create a Free GitHub Repo:</strong> Go to <a href="https://github.com/new" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">github.com/new</a> and create a free repository (can be Private or Public).
                  </li>
                  <li>
                    <strong>Push or Upload Files:</strong> Unzip the archive and upload the files to your repository.
                  </li>
                  <li>
                    <strong>Automatic APK Generation:</strong> The included <code className="text-teal-300 font-mono">.github/workflows/build-apk.yml</code> will automatically trigger GitHub's free Ubuntu build runner, install Android SDK 34 &amp; JDK 17, and compile <code className="text-emerald-300 font-mono">PharmaScan-debug-apk</code> in ~2 minutes!
                  </li>
                  <li>
                    <strong>Download Your APK:</strong> Go to the <strong>Actions</strong> tab on your GitHub repository &gt; click the latest workflow run &gt; download the generated <strong>PharmaScan-debug-apk</strong> artifact.
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>Multi-User Offline Isolated Storage</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareApkModal;
