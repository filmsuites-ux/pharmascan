import React, { useState } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  FileText,
  Share2,
  Copy,
  CheckCircle2,
  Layers,
  Sparkles,
  Printer,
} from 'lucide-react';
import { Invoice, InvoiceItem } from '../../types/pharmacy';
import {
  generateBillSummaryText,
  shareImageFile,
  shareTextContent,
  copyToClipboard,
} from '../../services/shareService';

interface OriginalBillViewerProps {
  images: string[];
  originalImages?: string[];
  processedImages?: string[];
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  invoice?: Invoice;
  items?: InvoiceItem[];
}

export const OriginalBillViewer: React.FC<OriginalBillViewerProps> = ({
  images,
  originalImages,
  processedImages,
  title = 'Original Purchase Bill',
  isOpen,
  onClose,
  invoice,
  items,
}) => {
  const [activeTab, setActiveTab] = useState<'processed' | 'original' | 'details'>('processed');
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Determine current image list based on selected view mode
  const currentImagesList =
    activeTab === 'original' && originalImages && originalImages.length > 0
      ? originalImages
      : processedImages && processedImages.length > 0
      ? processedImages
      : images || [];

  const currentImage = currentImagesList[activePageIndex] || currentImagesList[0] || images[0] || '';

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleDownload = () => {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.href = currentImage;
    link.download = `bill-document-p${activePageIndex + 1}.jpg`;
    link.click();
  };

  const handleShareImage = async () => {
    if (!currentImage) return;
    await shareImageFile(
      currentImage,
      `pharmacy-bill-p${activePageIndex + 1}.jpg`,
      title
    );
  };

  const handleShareDetails = async () => {
    if (!invoice) return;
    const summaryText = generateBillSummaryText(invoice, items);
    await shareTextContent(`Pharmacy Bill Summary - #${invoice.invoiceNumber}`, summaryText);
  };

  const handleCopyDetails = () => {
    if (!invoice) return;
    const summaryText = generateBillSummaryText(invoice, items);
    copyToClipboard(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const summaryText = invoice ? generateBillSummaryText(invoice, items) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-5xl h-[92vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Top Header */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-b border-slate-800 bg-slate-950/90 gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm sm:text-base flex items-center gap-2">
                {title}
              </h3>
              <p className="text-xs text-slate-400">
                Preserved Source Document • Page {activePageIndex + 1} of {currentImagesList.length || 1}
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs: Clean Scan vs Raw Original vs Extracted Text */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => {
                setActiveTab('processed');
                handleReset();
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'processed'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Clean Scan
            </button>

            <button
              onClick={() => {
                setActiveTab('original');
                handleReset();
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                activeTab === 'original'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Raw Original
            </button>

            {invoice && (
              <button
                onClick={() => setActiveTab('details')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                  activeTab === 'details'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Extracted Details
              </button>
            )}
          </div>

          {/* Controls Bar & Share Button */}
          <div className="flex items-center gap-2">
            {activeTab !== 'details' && (
              <>
                {currentImagesList.length > 1 && (
                  <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 mr-2">
                    {currentImagesList.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setActivePageIndex(idx);
                          handleReset();
                        }}
                        className={`px-2 py-0.5 text-xs font-mono font-medium rounded ${
                          activePageIndex === idx
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        P{idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleZoomOut}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-slate-400 min-w-8 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRotate}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDownload}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
                  title="Download Image"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Share Menu Trigger (Requirements 13 & 14) */}
            <button
              onClick={activeTab === 'details' ? handleShareDetails : handleShareImage}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Share document via WhatsApp, SMS, or Email"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <div className="h-5 w-px bg-slate-800 mx-1" />

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Display Area */}
        <div className="flex-1 bg-slate-950 overflow-auto flex items-center justify-center p-6 select-none relative">
          {activeTab === 'details' ? (
            <div className="w-full max-w-3xl h-full overflow-y-auto bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-200 font-mono text-xs space-y-4 shadow-xl select-text">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-emerald-400 font-bold uppercase tracking-wider text-[11px]">
                  Extracted Bill Data Summary (Audited)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyDetails}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-1.5 font-sans"
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Text'}
                  </button>
                  <button
                    onClick={handleShareDetails}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs flex items-center gap-1.5 font-sans font-bold"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Share Details
                  </button>
                </div>
              </div>

              <pre className="whitespace-pre-wrap font-mono leading-relaxed text-slate-300">
                {summaryText}
              </pre>
            </div>
          ) : currentImage ? (
            <div
              className="transition-transform duration-150 ease-out origin-center"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            >
              <img
                src={currentImage}
                alt="Source Purchase Invoice Document"
                className="max-h-[75vh] max-w-full object-contain rounded-md shadow-2xl border border-slate-800 bg-white"
              />
            </div>
          ) : (
            <div className="text-slate-500 text-xs">No scan image available.</div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-2.5 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Verified Source Document</span>
            {activeTab === 'processed' && (
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                Perspective Corrected & Readability Enhanced
              </span>
            )}
            {activeTab === 'original' && (
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                Unaltered Camera Raw Capture
              </span>
            )}
          </div>
          <button
            onClick={handleReset}
            className="text-slate-400 hover:text-emerald-400 transition-colors"
          >
            Reset View
          </button>
        </div>
      </div>
    </div>
  );
};
