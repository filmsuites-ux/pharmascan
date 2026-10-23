/**
 * Native Bridge Service for Capacitor
 * Safely bridges Camera, Share, and Filesystem plugins when running inside
 * an Android Capacitor APK, while seamlessly falling back to browser APIs on the web.
 */

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: any;
    };
  }
}

/**
 * Checks if the application is currently running inside an installed native Android APK.
 */
export function isNativeAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform());
}

/**
 * Native File Sharing Helper (Capacitor Share Plugin)
 * Invokes native Android Share Sheet to share APKs, PDF invoices, or ledger reports.
 */
export async function shareFileWithNativeFallback(params: {
  title: string;
  text?: string;
  url?: string;
  blob?: Blob;
  filename?: string;
}): Promise<{ success: boolean; channel?: string; error?: string }> {
  const { title, text, url, blob, filename } = params;

  try {
    // 1. If running in Capacitor Native Android environment
    if (isNativeAndroidApp() && window.Capacitor?.Plugins?.Share) {
      await window.Capacitor.Plugins.Share.share({
        title,
        text,
        url,
        dialogTitle: title,
      });
      return { success: true, channel: 'CapacitorNativeShare' };
    }

    // 2. Browser Web Share API with File Attachment Support
    if (blob && filename && typeof navigator !== 'undefined' && navigator.canShare) {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text,
        });
        return { success: true, channel: 'WebShareFiles' };
      }
    }

    // 3. Browser Standard Web Share
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({
        title,
        text,
        url,
      });
      return { success: true, channel: 'WebShareUrl' };
    }

    // 4. Fallback: Direct Download for file attachments
    if (blob && filename && typeof document !== 'undefined') {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      return { success: true, channel: 'DirectDownloadFallback' };
    }

    return { success: false, error: 'Sharing not supported on this platform' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'User dismissed share dialog' };
    }
    return { success: false, error: err.message || 'Share failed' };
  }
}

/**
 * Native Filesystem Helper (Capacitor Filesystem Plugin)
 * Saves reports, invoices, or backup files directly to device storage.
 */
export async function saveFileWithNativeFallback(params: {
  filename: string;
  blob: Blob;
}): Promise<{ success: boolean; uri?: string; error?: string }> {
  const { filename, blob } = params;

  try {
    // Native Capacitor Filesystem
    if (isNativeAndroidApp() && window.Capacitor?.Plugins?.Filesystem) {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const res = reader.result as string;
          resolve(res.split(',')[1]);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      const base64Data = await base64Promise;

      const result = await window.Capacitor.Plugins.Filesystem.writeFile({
        path: `Download/${filename}`,
        data: base64Data,
        directory: 'DOCUMENTS',
        recursive: true,
      });

      return { success: true, uri: result.uri };
    }

    // Standard Browser File Download
    if (typeof document !== 'undefined') {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      return { success: true, uri: 'browser:downloads' };
    }

    return { success: false, error: 'Filesystem operation not supported' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Save failed' };
  }
}
