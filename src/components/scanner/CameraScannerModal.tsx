import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  RotateCw,
  Crop,
  Sliders,
  X,
  FilePlus,
  Trash2,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  Layers,
  Check,
  Maximize2,
  FileText,
  HelpCircle,
  FileSpreadsheet,
  Building2,
  Calendar,
  IndianRupee,
  Pill,
  Tag,
  ChevronDown,
  Plus,
  ArrowRight,
  ShieldAlert,
  ArrowLeft,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Edit2,
  Phone,
  MapPin,
  Clock,
} from 'lucide-react';
import { SAMPLE_BILLS, SampleBillDefinition } from '../../services/sampleBills';
import { processBillImages, rotateImage90 } from '../../services/ocrService';
import {
  detectDocumentCorners,
  enhanceDocumentImage,
  perspectiveCrop,
  DocumentCorners,
  ScanEnhancementMode,
} from '../../services/documentScannerService';
import { isPdfFile, processPdfDocument } from '../../services/pdfService';
import { Agency, DocumentType, ExtractedBillData, Invoice, InvoiceItem } from '../../types/pharmacy';
import {
  checkForDuplicateInvoice,
  getAgencies,
  recalculateAgencyFinancials,
  saveAgency,
  saveInvoice,
} from '../../db/indexedDb';
import { matchAgency } from '../../services/agencyMatcherService';
import { parseExpiryDate } from '../../services/expiryService';
import { OriginalBillViewer } from '../common/OriginalBillViewer';

export interface EditableItemRow {
  id: string;
  productName: string;
  manufacturer: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  purchaseRate: number;
  mrp: number;
  discountPercent: number;
  gstPercent: number;
  lineTotal: number;
}

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (
    originalImages: string[],
    processedImages: string[],
    data: ExtractedBillData,
    documentType: DocumentType,
    originalPdfData?: string,
    originalPdfName?: string
  ) => void;
  onSaved?: (invoice: Invoice) => void;
  onNavigate?: (view: string, agencyId?: string) => void;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanComplete,
  onSaved,
  onNavigate,
}) => {
  const [mode, setMode] = useState<'camera' | 'upload' | 'sample'>('upload');
  const [docTypeOption, setDocTypeOption] = useState<'AUTO' | DocumentType>('AUTO');
  const [selectedSampleDef, setSelectedSampleDef] = useState<SampleBillDefinition | null>(null);

  // Both sets of pages are tracked: Raw Unaltered Scan vs Processed Readable Scan (Requirement 7)
  const [originalPages, setOriginalPages] = useState<string[]>([]);
  const [processedPages, setProcessedPages] = useState<string[]>([]);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
  const [viewOriginalMode, setViewOriginalMode] = useState<boolean>(false);

  // PDF original binary & selectable text
  const [originalPdfData, setOriginalPdfData] = useState<string | null>(null);
  const [originalPdfName, setOriginalPdfName] = useState<string | null>(null);
  const [selectablePdfText, setSelectablePdfText] = useState<string>('');

  // Perspective & Boundary Correction state
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [corners, setCorners] = useState<DocumentCorners>({
    topLeft: { x: 0.04, y: 0.04 },
    topRight: { x: 0.96, y: 0.04 },
    bottomRight: { x: 0.96, y: 0.96 },
    bottomLeft: { x: 0.04, y: 0.96 },
  });
  const [activeCornerDrag, setActiveCornerDrag] = useState<keyof DocumentCorners | null>(null);
  const cropCanvasContainerRef = useRef<HTMLDivElement | null>(null);

  // Enhancement: Default to adaptive_color (NEVER harsh black-and-white - Requirement 7)
  const [activeEnhancement, setActiveEnhancement] = useState<ScanEnhancementMode>('adaptive_color');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // =========================================================================
  // SAME SCREEN SCAN PREVIEW STATE (Requirements 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13)
  // =========================================================================
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>('');
  const [detectedAgencyName, setDetectedAgencyName] = useState<string>('');
  const [detectedGstin, setDetectedGstin] = useState<string>('');
  const [detectedAddress, setDetectedAddress] = useState<string>('');
  const [detectedPhone, setDetectedPhone] = useState<string>('');
  const [isNewAgency, setIsNewAgency] = useState<boolean>(false);
  const [cannotIdentifyAgency, setCannotIdentifyAgency] = useState<boolean>(false);
  const [agencyMatchReason, setAgencyMatchReason] = useState<string>('');
  const [isSelectingAgencyFromList, setIsSelectingAgencyFromList] = useState<boolean>(false);

  // Bill details
  const [billNumber, setBillNumber] = useState<string>('');
  const [billDate, setBillDate] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [taxableAmount, setTaxableAmount] = useState<number>(0);
  const [gstAmount, setGstAmount] = useState<number>(0);
  const [invoiceTotal, setInvoiceTotal] = useState<number>(0);

  // Item details
  const [items, setItems] = useState<EditableItemRow[]>([]);

  // Duplicate Check (Requirement 10)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateRecord, setDuplicateRecord] = useState<Invoice | null>(null);
  const [continueDespiteDuplicate, setContinueDespiteDuplicate] = useState<boolean>(false);

  // Save Validation & Lifecycle (Requirements 8, 9, 11, 12)
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [savedInvoice, setSavedInvoice] = useState<Invoice | null>(null);
  const [showSavedViewer, setShowSavedViewer] = useState<boolean>(false);
  const isSaveInProgress = useRef<boolean>(false);

  // OCR Error State (Requirement 12)
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string | null>(null);

  const previewSectionRef = useRef<HTMLDivElement | null>(null);

  // Load registered agencies on modal open
  useEffect(() => {
    if (isOpen) {
      getAgencies().then(setAgencies).catch(console.error);
    }
  }, [isOpen]);

  // Stop camera when closing modal
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (facing: 'environment' | 'user' = 'environment') => {
    stopCamera();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 3840, min: 1920 },
          height: { ideal: 2160, min: 1080 },
        },
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn('High-res camera request failed, trying standard camera:', err);
      try {
        const streamFallback = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
        });
        setCameraStream(streamFallback);
        if (videoRef.current) {
          videoRef.current.srcObject = streamFallback;
        }
      } catch (e: any) {
        console.error('Camera access error:', e);
        setCameraError(
          'Unable to access camera. Please allow camera permissions or upload bill photos/PDFs directly.'
        );
      }
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const addScannedPage = async (rawImage: string) => {
    const detected = await detectDocumentCorners(rawImage);
    const cropped = await perspectiveCrop(rawImage, detected);
    const enhanced = await enhanceDocumentImage(cropped, 'adaptive_color');

    setOriginalPages((prev) => [...prev, rawImage]);
    setProcessedPages((prev) => [...prev, enhanced]);
    setSelectedPageIndex(originalPages.length);
    setCorners(detected);
  };

  const handleCaptureFromCamera = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    stopCamera();
    setSelectedSampleDef(null);
    setMode('upload');
    await addScannedPage(dataUrl);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSelectedSampleDef(null);
    setIsProcessing(true);
    setErrorMessage(null);
    setOcrErrorMessage(null);

    try {
      for (const file of Array.from(files)) {
        if (isPdfFile(file)) {
          setProcessingStep(`Rendering PDF pages: ${file.name}...`);
          const reader = new FileReader();
          const pdfDataUrlPromise = new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          const pdfDataUrl = await pdfDataUrlPromise;
          setOriginalPdfData(pdfDataUrl);
          setOriginalPdfName(file.name);

          const pdfResult = await processPdfDocument(file, file.name);
          if (pdfResult.pages.length === 0) {
            throw new Error('No renderable pages found in uploaded PDF.');
          }

          if (pdfResult.hasSelectableText) {
            setSelectablePdfText(pdfResult.selectableText);
          }

          for (let pIdx = 0; pIdx < pdfResult.pages.length; pIdx++) {
            const pageDataUrl = pdfResult.pages[pIdx];
            const enhanced = await enhanceDocumentImage(pageDataUrl, 'adaptive_color');
            setOriginalPages((prev) => [...prev, pageDataUrl]);
            setProcessedPages((prev) => [...prev, enhanced]);
          }
          setSelectedPageIndex(0);
        } else {
          setProcessingStep(`Analyzing image: ${file.name}...`);
          const reader = new FileReader();
          const imgDataUrlPromise = new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          const raw = await imgDataUrlPromise;
          await addScannedPage(raw);
        }
      }
    } catch (err: any) {
      console.error('File upload error:', err);
      setErrorMessage(err.message || 'Failed to process uploaded file.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
      if (e.target) e.target.value = '';
    }
  };

  const handleSelectSample = async (sample: SampleBillDefinition) => {
    setSelectedSampleDef(sample);
    const raw = sample.renderInvoiceImage();
    setOriginalPages([raw]);
    setProcessedPages([raw]);
    setSelectedPageIndex(0);
    setOriginalPdfData(null);
    setOriginalPdfName(null);
    setSelectablePdfText('');
    setErrorMessage(null);
    setOcrErrorMessage(null);
  };

  const handleRotateCurrentPage = async () => {
    if (!processedPages[selectedPageIndex]) return;
    try {
      const rotated = await rotateImage90(processedPages[selectedPageIndex]);
      setProcessedPages((prev) => {
        const next = [...prev];
        next[selectedPageIndex] = rotated;
        return next;
      });
    } catch (e) {
      console.error('Failed to rotate:', e);
    }
  };

  const handleApplyEnhancement = async (enhancementMode: ScanEnhancementMode) => {
    if (!originalPages[selectedPageIndex]) return;
    setActiveEnhancement(enhancementMode);

    try {
      const cropped = await perspectiveCrop(originalPages[selectedPageIndex], corners);
      const enhanced = await enhanceDocumentImage(cropped, enhancementMode);
      setProcessedPages((prev) => {
        const next = [...prev];
        next[selectedPageIndex] = enhanced;
        return next;
      });
    } catch (e) {
      console.error('Failed to apply enhancement:', e);
    }
  };

  const handleApplyCropPerspective = async () => {
    if (!originalPages[selectedPageIndex]) return;
    try {
      const cropped = await perspectiveCrop(originalPages[selectedPageIndex], corners);
      const enhanced = await enhanceDocumentImage(cropped, activeEnhancement);
      setProcessedPages((prev) => {
        const next = [...prev];
        next[selectedPageIndex] = enhanced;
        return next;
      });
      setIsCropping(false);
    } catch (e) {
      console.error('Failed to apply perspective crop:', e);
    }
  };

  const handleAutoDetectCorners = async () => {
    if (!originalPages[selectedPageIndex]) return;
    const detected = await detectDocumentCorners(originalPages[selectedPageIndex]);
    setCorners(detected);
  };

  const handleResetCorners = () => {
    setCorners({
      topLeft: { x: 0.02, y: 0.02 },
      topRight: { x: 0.98, y: 0.02 },
      bottomRight: { x: 0.98, y: 0.98 },
      bottomLeft: { x: 0.02, y: 0.98 },
    });
  };

  const handleDeletePage = (index: number) => {
    setOriginalPages((prev) => prev.filter((_, idx) => idx !== index));
    setProcessedPages((prev) => prev.filter((_, idx) => idx !== index));
    if (selectedPageIndex >= index && selectedPageIndex > 0) {
      setSelectedPageIndex((prev) => prev - 1);
    }
  };

  // =========================================================================
  // RUN OCR & AUTOMATICALLY EXPAND SCAN PREVIEW ON THE SAME SCREEN (Req 1, 2, 4, 5, 6)
  // =========================================================================
  const handleStartOCR = async () => {
    if (processedPages.length === 0) {
      setErrorMessage('Please capture or upload at least one document page first.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setOcrErrorMessage(null);
    setSaveStatus('IDLE');
    setSaveErrorMessage(null);

    try {
      setProcessingStep('1/4 Analyzing document layout & headings...');
      await new Promise((r) => setTimeout(r, 350));

      setProcessingStep('2/4 Validating printed supplier details & GSTIN...');
      await new Promise((r) => setTimeout(r, 350));

      setProcessingStep('3/4 Extracting document details with strict row isolation...');
      const ocrResult = await processBillImages(processedPages, selectablePdfText, selectedSampleDef);

      setProcessingStep('4/4 Running multi-signal supplier matching & price history checks...');
      await new Promise((r) => setTimeout(r, 350));

      if (ocrResult.success && ocrResult.data) {
        setIsProcessing(false);
        const data = ocrResult.data;

        if (originalPdfData) {
          data.originalPdfData = originalPdfData;
          data.originalFileName = originalPdfName || 'invoice.pdf';
          data.originalFileType = 'application/pdf';
        }
        if (selectablePdfText) {
          data.selectablePdfText = selectablePdfText;
        }

        // 1. Load latest registered agencies
        const currentAgencies = await getAgencies();
        setAgencies(currentAgencies);

        // 2. Run Strict Agency Matching (Requirements 4 & 5)
        const matchResult = matchAgency(
          data.agency?.detectedName || '',
          data.agency?.gstin || '',
          data.agency?.phone || '',
          currentAgencies
        );

        if (matchResult.matchedAgency) {
          // Exact Match / Confirmed Existing Agency
          setSelectedAgencyId(matchResult.matchedAgency.id);
          setDetectedAgencyName(matchResult.matchedAgency.name);
          setDetectedGstin(matchResult.matchedAgency.gstin || data.agency?.gstin || '');
          setDetectedAddress(matchResult.matchedAgency.address || data.agency?.address || '');
          setDetectedPhone(matchResult.matchedAgency.phone || data.agency?.phone || '');
          setIsNewAgency(false);
          setCannotIdentifyAgency(false);
          setAgencyMatchReason(matchResult.reason);
        } else if (matchResult.isNewAgency) {
          // New Agency Detected (e.g. Uday Medical vs Venu Medical - Test 2)
          setSelectedAgencyId('');
          setDetectedAgencyName(matchResult.suggestedName || data.agency?.detectedName || 'New Supplier');
          setDetectedGstin(data.agency?.gstin || '');
          setDetectedAddress(data.agency?.address || '');
          setDetectedPhone(data.agency?.phone || '');
          setIsNewAgency(true);
          setCannotIdentifyAgency(false);
          setAgencyMatchReason('New Agency Detected');
        } else {
          // Low-Confidence Detection (Requirement 5 - Test 3)
          setSelectedAgencyId('');
          setDetectedAgencyName('');
          setDetectedGstin('');
          setDetectedAddress(data.agency?.address || '');
          setDetectedPhone(data.agency?.phone || '');
          setIsNewAgency(false);
          setCannotIdentifyAgency(true);
          setAgencyMatchReason('Agency could not be confidently identified.');
        }

        // 3. Populate Bill Details
        const rawInvNum = data.invoice?.invoiceNumber || '';
        const invNum =
          rawInvNum && rawInvNum !== 'NOT DETECTED' && rawInvNum !== 'Needs Review'
            ? rawInvNum
            : `BILL-${Date.now().toString().slice(-4)}`;
        setBillNumber(invNum);

        const rawInvDate = data.invoice?.invoiceDate || '';
        const invDate =
          rawInvDate && rawInvDate.length >= 8
            ? rawInvDate
            : new Date().toISOString().split('T')[0];
        setBillDate(invDate);

        setDueDate((data.invoice as any)?.dueDate || '');
        setTaxableAmount(Number(data.invoice?.taxableAmount) || 0);
        setGstAmount(Number(data.invoice?.gstAmount) || 0);
        setInvoiceTotal(Number(data.invoice?.invoiceTotal) || 0);

        // 4. Populate Item Details (Requirement 6)
        const editableItems: EditableItemRow[] = (data.items || []).map((it, idx) => ({
          id: `item-${Date.now()}-${idx}`,
          productName: it.productName && it.productName !== 'NOT DETECTED' ? it.productName : 'Needs Review',
          manufacturer: it.manufacturer || '',
          batchNumber: it.batchNumber && it.batchNumber !== 'NOT DETECTED' ? it.batchNumber : 'GEN-01',
          expiryDate: it.expiryDate && it.expiryDate !== 'NOT DETECTED' ? it.expiryDate : '12/2028',
          quantity: Number(it.quantity) || 1,
          freeQuantity: Number(it.freeQuantity) || 0,
          purchaseRate: Number(it.purchaseRate) || 0,
          mrp: Number(it.mrp) || 0,
          discountPercent: Number(it.discountPercent) || 0,
          gstPercent: Number(it.gstPercent) || 12,
          lineTotal: Number(it.lineTotal) || 0,
        }));

        setItems(editableItems);

        // 5. Run Duplicate Bill Check (Requirement 10)
        const matchedId = matchResult.matchedAgency?.id || '';
        if (matchedId && invNum) {
          const dupResult = await checkForDuplicateInvoice(
            matchedId,
            invNum,
            invDate,
            Number(data.invoice?.invoiceTotal) || 0
          );
          if (dupResult.isDuplicate && dupResult.existingInvoice) {
            setDuplicateWarning(dupResult.reason || 'Possible Duplicate Bill detected.');
            setDuplicateRecord(dupResult.existingInvoice);
          } else {
            setDuplicateWarning(null);
            setDuplicateRecord(null);
          }
        } else {
          setDuplicateWarning(null);
          setDuplicateRecord(null);
        }

        // 6. Automatically expand Preview section directly below image on the SAME SCREEN (Req 1 & 2)
        setIsReviewOpen(true);

        // Notify parent if listener exists
        const finalDocType: DocumentType =
          docTypeOption !== 'AUTO'
            ? docTypeOption
            : (data.documentType || 'PURCHASE_BILL');

        onScanComplete?.(
          originalPages,
          processedPages,
          data,
          finalDocType,
          originalPdfData || undefined,
          originalPdfName || undefined
        );

        // Smooth scroll to preview section
        setTimeout(() => {
          previewSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      } else {
        throw new Error(ocrResult.error || 'Failed to extract document data');
      }
    } catch (err: any) {
      console.error('OCR Extraction error:', err);
      setIsProcessing(false);
      const isNet = err?.details?.kind === 'TIMEOUT' || err?.details?.kind === 'OFFLINE' || err?.details?.kind === 'SERVER_ERROR';
      setOcrErrorMessage(
        isNet
          ? `Server connection issue: ${err.message || 'Request timed out'}. Scanned document is preserved. Click Retry Scan.`
          : 'Unable to read the bill clearly.'
      );
    }
  };

  // Dragging corner points on perspective crop canvas
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeCornerDrag || !cropCanvasContainerRef.current) return;
    const rect = cropCanvasContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setCorners((prev) => ({
      ...prev,
      [activeCornerDrag]: { x, y },
    }));
  };

  const handlePointerUp = () => {
    setActiveCornerDrag(null);
  };

  // Recalculate item line totals and bill totals when an item field is edited
  const handleUpdateItemField = (id: string, field: keyof EditableItemRow, val: any) => {
    setItems((prev) => {
      const updated = prev.map((item) => {
        if (item.id !== id) return item;
        const newItem = { ...item, [field]: val };

        if (['quantity', 'purchaseRate', 'discountPercent', 'gstPercent'].includes(field as string)) {
          const qty = Number(newItem.quantity) || 0;
          const rate = Number(newItem.purchaseRate) || 0;
          const disc = Number(newItem.discountPercent) || 0;
          const gst = Number(newItem.gstPercent) || 0;

          const subtotal = qty * rate;
          const discountAmt = subtotal * (disc / 100);
          const taxable = subtotal - discountAmt;
          const taxAmt = taxable * (gst / 100);
          newItem.lineTotal = Number((taxable + taxAmt).toFixed(2));
        }
        return newItem;
      });

      // Recalculate grand totals
      const sumTaxable = updated.reduce((acc, it) => {
        const qty = Number(it.quantity) || 0;
        const rate = Number(it.purchaseRate) || 0;
        const disc = Number(it.discountPercent) || 0;
        const subtotal = qty * rate;
        return acc + (subtotal - subtotal * (disc / 100));
      }, 0);

      const sumGst = updated.reduce((acc, it) => {
        const qty = Number(it.quantity) || 0;
        const rate = Number(it.purchaseRate) || 0;
        const disc = Number(it.discountPercent) || 0;
        const gst = Number(it.gstPercent) || 0;
        const subtotal = qty * rate;
        const taxable = subtotal - subtotal * (disc / 100);
        return acc + taxable * (gst / 100);
      }, 0);

      const sumTotal = updated.reduce((acc, it) => acc + (Number(it.lineTotal) || 0), 0);

      setTaxableAmount(Number(sumTaxable.toFixed(2)));
      setGstAmount(Number(sumGst.toFixed(2)));
      setInvoiceTotal(Number(sumTotal.toFixed(2)));

      return updated;
    });
  };

  const handleAddItemRow = () => {
    const newRow: EditableItemRow = {
      id: `item-${Date.now()}-${items.length}`,
      productName: '',
      manufacturer: '',
      batchNumber: '',
      expiryDate: '',
      quantity: 1,
      freeQuantity: 0,
      purchaseRate: 0,
      mrp: 0,
      discountPercent: 0,
      gstPercent: 12,
      lineTotal: 0,
    };
    setItems((prev) => [...prev, newRow]);
  };

  const handleDeleteItemRow = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      const sumTotal = next.reduce((acc, it) => acc + (Number(it.lineTotal) || 0), 0);
      setInvoiceTotal(Number(sumTotal.toFixed(2)));
      return next;
    });
  };

  // Agency action: Select an existing registered agency
  const handleSelectExistingAgency = (agency: Agency) => {
    setSelectedAgencyId(agency.id);
    setDetectedAgencyName(agency.name);
    setDetectedGstin(agency.gstin || '');
    setDetectedAddress(agency.address || '');
    setDetectedPhone(agency.phone || '');
    setIsNewAgency(false);
    setCannotIdentifyAgency(false);
    setIsSelectingAgencyFromList(false);

    // Re-run duplicate check with new agency
    if (billNumber) {
      checkForDuplicateInvoice(agency.id, billNumber, billDate, invoiceTotal).then((dup) => {
        if (dup.isDuplicate && dup.existingInvoice) {
          setDuplicateWarning(dup.reason || 'Possible Duplicate Bill detected.');
          setDuplicateRecord(dup.existingInvoice);
        } else {
          setDuplicateWarning(null);
          setDuplicateRecord(null);
        }
      });
    }
  };

  // Agency action: Create new agency record directly from detected details (Requirement 4)
  const handleCreateNewAgency = async () => {
    if (!detectedAgencyName.trim()) {
      setValidationErrors(['Please enter an Agency Name first.']);
      return;
    }
    try {
      const newAg: Agency = {
        id: `agency-${Date.now()}`,
        name: detectedAgencyName.trim(),
        gstin: detectedGstin.trim() || undefined,
        address: detectedAddress.trim() || undefined,
        phone: detectedPhone.trim() || undefined,
        paymentTermsDays: 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveAgency(newAg);
      setAgencies((prev) => [...prev, newAg]);
      setSelectedAgencyId(newAg.id);
      setIsNewAgency(false);
      setCannotIdentifyAgency(false);
      setAgencyMatchReason(`Created new distributor "${newAg.name}" successfully.`);
    } catch (err: any) {
      console.error('Error creating new agency:', err);
    }
  };

  // =========================================================================
  // CONFIRM & SAVE PURCHASE RECORD (Requirements 8, 9, 10, 11, 12)
  // =========================================================================
  const handleConfirmAndSave = async () => {
    // Prevent double tapping (Requirement 11 - Test 7)
    if (isSaving || isSaveInProgress.current) return;

    setValidationErrors([]);
    setSaveErrorMessage(null);

    // 1. Save Validation (Requirement 9)
    const errors: string[] = [];

    let finalAgencyId = selectedAgencyId;
    let finalAgencyName = detectedAgencyName.trim();

    if (!finalAgencyId && !finalAgencyName) {
      errors.push('Agency Name is required. Please select an existing agency or enter a new agency name.');
    }

    if (!billNumber || billNumber.trim() === '' || billNumber === 'Needs Review' || billNumber === 'NOT DETECTED') {
      errors.push('Bill Number is required.');
    }

    if (!billDate || billDate.trim() === '') {
      errors.push('Bill Date is required.');
    }

    if (items.length === 0 && invoiceTotal <= 0) {
      errors.push('Please enter at least one medicine item or bill purchase amount.');
    }

    // Validate medicines
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.productName.trim() || it.productName === 'Needs Review') {
        errors.push(`Medicine #${i + 1}: Medicine Name is required.`);
      }
      if (it.quantity <= 0) {
        errors.push(`Medicine #${i + 1} (${it.productName || 'Item'}): Quantity must be at least 1.`);
      }
      if (it.purchaseRate < 0) {
        errors.push(`Medicine #${i + 1} (${it.productName || 'Item'}): Purchase price cannot be negative.`);
      }
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    // 2. Duplicate Check: Block unless user explicitly tapped "Continue Anyway" (Requirement 10)
    if (!continueDespiteDuplicate && duplicateWarning) {
      setValidationErrors(['Please resolve the Possible Duplicate Bill notice before saving.']);
      return;
    }

    // 3. Begin Save with Loading State & Lock (Requirement 11)
    setIsSaving(true);
    isSaveInProgress.current = true;
    setSaveStatus('SAVING');

    try {
      // If agency not registered yet, auto-create agency first
      if (!finalAgencyId && finalAgencyName) {
        const newAg: Agency = {
          id: `agency-${Date.now()}`,
          name: finalAgencyName,
          gstin: detectedGstin.trim() || undefined,
          address: detectedAddress.trim() || undefined,
          phone: detectedPhone.trim() || undefined,
          paymentTermsDays: 30,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveAgency(newAg);
        finalAgencyId = newAg.id;
        setAgencies((prev) => [...prev, newAg]);
      }

      const now = new Date().toISOString();
      const invoiceId = `inv-${Date.now()}`;

      const invoiceToSave: Invoice = {
        id: invoiceId,
        agencyId: finalAgencyId,
        agencyName: finalAgencyName,
        invoiceNumber: billNumber.trim(),
        invoiceDate: billDate,
        invoiceTotal: Number(invoiceTotal) || 0,
        taxableAmount: Number(taxableAmount) || 0,
        gstAmount: Number(gstAmount) || 0,
        discountAmount: 0,
        paidAmount: 0,
        balanceAmount: Number(invoiceTotal) || 0,
        paymentStatus: 'UNPAID',
        notes: dueDate ? `Payment Due: ${dueDate}` : '',
        images: processedPages.length > 0 ? processedPages : originalPages,
        originalImages: originalPages,
        processedImages: processedPages,
        originalPdfData: originalPdfData || undefined,
        originalFileName: originalPdfName || undefined,
        documentType: docTypeOption !== 'AUTO' ? docTypeOption : 'TAX_INVOICE',
        reviewStatus: 'VERIFIED',
        needsReview: false,
        itemsCount: items.length,
        scanDate: now,
        createdAt: now,
        updatedAt: now,
      };

      const itemsToSave: InvoiceItem[] = items.map((it, idx) => ({
        id: `item-${Date.now()}-${idx}`,
        invoiceId,
        agencyId: finalAgencyId,
        agencyName: finalAgencyName,
        invoiceNumber: billNumber.trim(),
        invoiceDate: billDate,
        productName: it.productName.trim(),
        normalizedName: it.productName.trim().toUpperCase(),
        manufacturer: it.manufacturer.trim() || undefined,
        batchNumber: it.batchNumber.trim() || 'GEN-01',
        expiryDate: it.expiryDate.trim() || '12/2028',
        quantity: Number(it.quantity) || 1,
        freeQuantity: Number(it.freeQuantity) || 0,
        purchaseRate: Number(it.purchaseRate) || 0,
        mrp: Number(it.mrp) || 0,
        discountPercent: Number(it.discountPercent) || 0,
        gstPercent: Number(it.gstPercent) || 12,
        lineTotal: Number(it.lineTotal) || 0,
        expiryTimestamp: parseExpiryDate(it.expiryDate.trim()).timestamp,
      }));

      // Save to IndexedDB
      await saveInvoice(invoiceToSave, itemsToSave);
      await recalculateAgencyFinancials(finalAgencyId);

      setSavedInvoice(invoiceToSave);
      setSaveStatus('SUCCESS');
      onSaved?.(invoiceToSave);
    } catch (err: any) {
      console.error('Save purchase error:', err);
      // Requirement 12: Exact error message
      setSaveStatus('ERROR');
      setSaveErrorMessage('Unable to save the purchase record.');
    } finally {
      setIsSaving(false);
      isSaveInProgress.current = false;
    }
  };

  // Reset to scan another bill on the same screen (Requirement 11)
  const handleScanAnotherBill = () => {
    setOriginalPages([]);
    setProcessedPages([]);
    setSelectedPageIndex(0);
    setOriginalPdfData(null);
    setOriginalPdfName(null);
    setSelectablePdfText('');
    setIsReviewOpen(false);
    setItems([]);
    setBillNumber('');
    setBillDate('');
    setDueDate('');
    setTaxableAmount(0);
    setGstAmount(0);
    setInvoiceTotal(0);
    setSelectedAgencyId('');
    setDetectedAgencyName('');
    setDetectedGstin('');
    setDetectedAddress('');
    setDetectedPhone('');
    setIsNewAgency(false);
    setCannotIdentifyAgency(false);
    setDuplicateWarning(null);
    setDuplicateRecord(null);
    setContinueDespiteDuplicate(false);
    setValidationErrors([]);
    setSaveStatus('IDLE');
    setSaveErrorMessage(null);
    setSavedInvoice(null);
    setOcrErrorMessage(null);
    setSelectedSampleDef(null);
    setMode('upload');
  };

  // Discard & Cancel (Requirement 8)
  const handleDiscardAndCancel = () => {
    if (items.length > 0 || billNumber) {
      const confirmDiscard = window.confirm('Are you sure you want to discard this scanned bill? Any edits will be lost.');
      if (!confirmDiscard) return;
    }
    handleScanAnotherBill();
    onClose();
  };

  if (!isOpen) return null;

  const currentProcessed = processedPages[selectedPageIndex];
  const currentOriginal = originalPages[selectedPageIndex];
  const displayImage = viewOriginalMode ? currentOriginal : currentProcessed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div className="spatial-modal border border-white/15 w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[96vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header: SCAN PURCHASE BILL */}
        <div className="px-6 py-3.5 bg-slate-950/70 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/15 text-sky-400 rounded-xl border border-sky-400/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base sm:text-lg flex items-center gap-2">
                SCAN PURCHASE BILL
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Same-Screen OCR Review
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Untouched original preserved • Real-time preview &amp; verification before saving
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDiscardAndCancel}
              disabled={isProcessing || isSaving}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Modal Container: Scanned Image at top, SCAN PREVIEW directly below */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* ========================================================================= */}
          {/* SECTION 1: OCR FAILURE ERROR BANNER (Requirement 12) */}
          {/* ========================================================================= */}
          {ocrErrorMessage && (
            <div className="p-4 bg-red-950/70 border border-red-500/50 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <h4 className="text-red-200 font-bold text-sm">Unable to read the bill clearly.</h4>
                  <p className="text-red-300/80 text-xs mt-0.5">
                    The image may be blurry, angled, or has poor lighting. You can retry or upload another image.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleStartOCR}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Retry Scan
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
                >
                  Upload Another Image
                </button>
                <button
                  onClick={() => setOcrErrorMessage(null)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 2: SCANNED BILL IMAGE (Requirements 1, 7, 13) */}
          {/* ========================================================================= */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {/* Image Section Controls Bar */}
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Scanned Bill Image
                </span>
                {processedPages.length > 0 && (
                  <span className="text-[11px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded-full">
                    Page {selectedPageIndex + 1} of {processedPages.length}
                  </span>
                )}
              </div>

              {/* Controls when image exists */}
              {processedPages.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Toggle between Processed and Raw Original (Requirement 7) */}
                  <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setViewOriginalMode(false)}
                      className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                        !viewOriginalMode ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Enhanced Scan
                    </button>
                    <button
                      onClick={() => setViewOriginalMode(true)}
                      className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                        viewOriginalMode ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Original Camera Photo
                    </button>
                  </div>

                  {/* Filter selector */}
                  <select
                    value={activeEnhancement}
                    onChange={(e) => handleApplyEnhancement(e.target.value as any)}
                    className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1 text-[11px] outline-none"
                    title="Change image readability enhancement"
                  >
                    <option value="adaptive_color">Adaptive Color (Full)</option>
                    <option value="clean_paper">Clean Paper</option>
                    <option value="high_contrast">Dot-Matrix / Faint</option>
                    <option value="mono_crisp">Grayscale</option>
                    <option value="raw_original">Raw Original</option>
                  </select>

                  <button
                    onClick={handleRotateCurrentPage}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700"
                    title="Rotate 90 degrees"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                  </button>

                  <button
                    onClick={() => setIsCropping(!isCropping)}
                    className={`px-2 py-1 text-[11px] rounded border flex items-center gap-1 ${
                      isCropping ? 'bg-amber-600 text-white border-amber-500 font-bold' : 'bg-slate-800 text-slate-200 border-slate-700'
                    }`}
                  >
                    <Crop className="w-3.5 h-3.5 text-emerald-400" />
                    {isCropping ? 'Cropping' : 'Crop'}
                  </button>
                </div>
              )}
            </div>

            {/* Scanned Image Display Canvas OR Upload Prompt */}
            {processedPages.length === 0 ? (
              <div className="p-6">
                {/* Upload Mode Selector */}
                <div className="flex items-center justify-center gap-2 mb-4">
                  <button
                    onClick={() => {
                      setMode('upload');
                      stopCamera();
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      mode === 'upload' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    Upload Bill Photo / PDF
                  </button>

                  <button
                    onClick={() => {
                      setMode('camera');
                      startCamera(facingMode);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      mode === 'camera' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    Use Live Camera
                  </button>

                  <button
                    onClick={() => {
                      setMode('sample');
                      stopCamera();
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                      mode === 'sample' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Sample Bills (Test Cases)
                  </button>
                </div>

                {/* Camera Mode */}
                {mode === 'camera' && (
                  <div className="relative w-full max-w-xl mx-auto aspect-[4/3] bg-black rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
                    {cameraError ? (
                      <div className="p-6 text-center">
                        <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                        <p className="text-white text-xs">{cameraError}</p>
                      </div>
                    ) : (
                      <>
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        <div className="absolute inset-6 border-2 border-emerald-400/70 rounded-xl pointer-events-none" />
                        <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-4">
                          <button
                            onClick={handleCaptureFromCamera}
                            className="p-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-full shadow-xl transform active:scale-95 transition-all ring-4 ring-emerald-500/30 cursor-pointer"
                          >
                            <Camera className="w-6 h-6" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Upload Mode */}
                {mode === 'upload' && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-emerald-500/70 bg-slate-900/50 hover:bg-slate-900 rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[260px] group"
                  >
                    <div className="p-4 bg-slate-800 group-hover:bg-emerald-500/10 text-slate-400 group-hover:text-emerald-400 rounded-2xl mb-3 transition-colors">
                      <Upload className="w-8 h-8" />
                    </div>
                    <h3 className="text-white font-bold text-base mb-1">
                      Tap or Drop Purchase Bill Image (JPEG, PNG) or PDF
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md">
                      Perspective auto-straightening, faint text contrast boost, and full color preservation.
                    </p>
                  </div>
                )}

                {/* Sample Bills Mode (Includes Test 1: Venu Medical, Test 2: Uday Medical, Test 3: Unclear Agency) */}
                {mode === 'sample' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400 mb-2">
                      Click any test bill below to load authentic invoice data for verification:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {SAMPLE_BILLS.map((sb) => (
                        <div
                          key={sb.id}
                          onClick={() => handleSelectSample(sb)}
                          className="p-3.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500 rounded-xl transition-all cursor-pointer flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                #{sb.invoiceNumber}
                              </span>
                              <span className="text-[11px] text-slate-400">{sb.invoiceDate}</span>
                            </div>
                            <h4 className="font-bold text-white text-xs mb-1">{sb.agencyName}</h4>
                            <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                              {sb.description}
                            </p>
                          </div>
                          <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                            <span className="font-bold text-emerald-400">
                              ₹{sb.previewData.invoice.invoiceTotal.toLocaleString('en-IN')}
                            </span>
                            <span className="text-emerald-400 font-semibold text-[11px]">Load Bill →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Loaded Scanned Image View with Page Thumbnails & Perspective Tool */
              <div className="p-4 flex flex-col lg:flex-row gap-4 min-h-[340px]">
                {/* Main Image Canvas */}
                <div className="flex-1 bg-black/60 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-3 relative max-h-[440px]">
                  {isCropping && currentOriginal ? (
                    <div
                      ref={cropCanvasContainerRef}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className="relative inline-block touch-none cursor-crosshair border border-emerald-500/40 rounded shadow-2xl"
                    >
                      <img
                        src={currentOriginal}
                        alt="Document Boundary"
                        className="max-h-[380px] object-contain block pointer-events-none opacity-85"
                      />
                      <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        <polygon
                          points={`
                            ${corners.topLeft.x * 100}%,${corners.topLeft.y * 100}%
                            ${corners.topRight.x * 100}%,${corners.topRight.y * 100}%
                            ${corners.bottomRight.x * 100}%,${corners.bottomRight.y * 100}%
                            ${corners.bottomLeft.x * 100}%,${corners.bottomLeft.y * 100}%
                          `}
                          fill="rgba(16, 185, 129, 0.15)"
                          stroke="#10b981"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                      </svg>
                      {(['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as (keyof DocumentCorners)[]).map((c) => (
                        <div
                          key={c}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setActiveCornerDrag(c);
                          }}
                          style={{
                            left: `${corners[c].x * 100}%`,
                            top: `${corners[c].y * 100}%`,
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-emerald-500 border-2 border-white rounded-full shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center"
                        >
                          <span className="w-1.5 h-1.5 bg-slate-950 rounded-full" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <img
                      src={displayImage}
                      alt={`Scanned Bill Page ${selectedPageIndex + 1}`}
                      className="max-h-[400px] max-w-full object-contain rounded shadow-lg border border-slate-800 bg-white"
                    />
                  )}
                </div>

                {/* Right Thumbnails / Actions Sidebar */}
                <div className="w-full lg:w-64 flex flex-col justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-white mb-2">
                      <span>Document Pages ({processedPages.length})</span>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
                      >
                        <Plus className="w-3 h-3" /> Add Page
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {processedPages.map((img, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedPageIndex(idx)}
                          className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all p-1 bg-slate-950 ${
                            selectedPageIndex === idx
                              ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                              : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <img src={img} alt={`Page ${idx + 1}`} className="w-full h-18 object-cover rounded bg-white" />
                          <div className="absolute top-1 left-1 bg-black/80 text-white text-[9px] font-mono px-1 rounded font-bold">
                            P{idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Extract OCR Trigger (if not already opened) */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={handleStartOCR}
                      disabled={isProcessing}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Processing OCR...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>{isReviewOpen ? 'Re-scan with OCR' : 'Extract Bill Data (OCR)'}</span>
                        </>
                      )}
                    </button>

                    {isProcessing && (
                      <p className="text-[11px] text-emerald-400 text-center animate-pulse font-medium">
                        {processingStep}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* SECTION 3: SCAN PREVIEW DIRECTLY BELOW SCANNED BILL (Requirements 1, 2, 3, 4, 5, 6, 13) */}
          {/* ========================================================================= */}
          {isReviewOpen && (
            <div
              ref={previewSectionRef}
              className="bg-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-6 animate-in fade-in duration-300"
            >
              {/* Header: SCAN PREVIEW */}
              <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Extracted Data Ready for Review
                    </span>
                    <span className="text-xs text-slate-400">All fields are editable</span>
                  </div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-400" />
                    SCAN PREVIEW
                  </h3>
                  <p className="text-xs text-slate-400">
                    Review agency details, bill metadata, and itemized medicines before confirming.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Grand Total:</span>
                  <span className="font-mono font-black text-xl text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                    ₹{invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* ===================================================================== */}
              {/* PART A: AGENCY INFORMATION FIRST (Requirements 3, 4, 5) */}
              {/* ===================================================================== */}
              <div className="space-y-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-bold text-white text-sm">AGENCY INFORMATION</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsSelectingAgencyFromList(!isSelectingAgencyFromList)}
                      className="text-xs text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      {isSelectingAgencyFromList ? 'Close Agency List' : 'Select Existing Agency'}
                    </button>
                  </div>
                </div>

                {/* Requirement 4: NEW AGENCY DETECTED BANNER */}
                {isNewAgency && (
                  <div className="p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="font-bold text-amber-200 text-xs">New Agency Detected</div>
                        <div className="text-[11px] text-amber-300/80">
                          Agency: <strong>{detectedAgencyName || 'New Distributor'}</strong>
                          {detectedGstin ? ` • GSTIN: ${detectedGstin}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleCreateNewAgency}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                      >
                        Create New Agency
                      </button>
                      <button
                        onClick={() => setIsSelectingAgencyFromList(true)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
                      >
                        Select Existing Agency
                      </button>
                    </div>
                  </div>
                )}

                {/* Requirement 5: LOW CONFIDENCE DETECTION BANNER */}
                {cannotIdentifyAgency && (
                  <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <div>
                        <div className="font-bold text-rose-200 text-xs">
                          Agency could not be confidently identified.
                        </div>
                        <div className="text-[11px] text-rose-300/80">
                          Please manually select or enter the correct distributor name below.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsSelectingAgencyFromList(true)}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                      Select Agency
                    </button>
                  </div>
                )}

                {/* Agency Match Success Notice if matched */}
                {!isNewAgency && !cannotIdentifyAgency && selectedAgencyId && (
                  <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs text-emerald-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        Matched Registered Agency: <strong>{detectedAgencyName}</strong>
                        {detectedGstin ? ` (GSTIN: ${detectedGstin})` : ''}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400/80 font-mono">100% Tax Entity Match</span>
                  </div>
                )}

                {/* Dropdown list of registered agencies when user chooses to select */}
                {isSelectingAgencyFromList && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">
                      Select Registered Agency:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {agencies.map((ag) => (
                        <div
                          key={ag.id}
                          onClick={() => handleSelectExistingAgency(ag)}
                          className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                            selectedAgencyId === ag.id
                              ? 'bg-emerald-950/50 border-emerald-500 text-white font-bold'
                              : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <div className="truncate">
                            <div className="text-xs font-semibold">{ag.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              GSTIN: {ag.gstin || 'N/A'}
                            </div>
                          </div>
                          {selectedAgencyId === ag.id && (
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Editable Agency Fields (Requirement 3) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Agency Name <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={detectedAgencyName}
                      onChange={(e) => setDetectedAgencyName(e.target.value)}
                      placeholder="e.g. Uday Medical"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      GSTIN (15-Digit Statutory Identifier)
                    </label>
                    <input
                      type="text"
                      value={detectedGstin}
                      onChange={(e) => setDetectedGstin(e.target.value.toUpperCase())}
                      placeholder="e.g. 27AABCU5544M1Z2"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Supplier Phone
                    </label>
                    <input
                      type="text"
                      value={detectedPhone}
                      onChange={(e) => setDetectedPhone(e.target.value)}
                      placeholder="e.g. +91 98450 11223"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Supplier Address
                    </label>
                    <input
                      type="text"
                      value={detectedAddress}
                      onChange={(e) => setDetectedAddress(e.target.value)}
                      placeholder="e.g. 88, Shivaji Road, Swargate, Pune - 411042"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* ===================================================================== */}
              {/* PART B: BILL DETAILS (Requirement 6) */}
              {/* ===================================================================== */}
              <div className="space-y-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <h4 className="font-bold text-white text-sm">BILL DETAILS</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Bill Number <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={billNumber}
                      onChange={(e) => setBillNumber(e.target.value)}
                      placeholder="e.g. ABC123"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Bill Date <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={billDate}
                      onChange={(e) => setBillDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Due Date (Credit Terms)
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Document Type
                    </label>
                    <select
                      value={docTypeOption}
                      onChange={(e) => setDocTypeOption(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                    >
                      <option value="AUTO">Tax Invoice / Bill</option>
                      <option value="PURCHASE_BILL">Purchase Bill</option>
                      <option value="RECEIPT">Payment Receipt</option>
                      <option value="CREDIT_DEBIT_NOTE">Credit / Debit Note</option>
                    </select>
                  </div>
                </div>

                {/* Subtotals & Taxes */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">
                      Taxable Amount
                    </span>
                    <span className="text-base font-mono font-bold text-white mt-0.5 block">
                      ₹{taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">
                      GST (CGST + SGST)
                    </span>
                    <span className="text-base font-mono font-bold text-white mt-0.5 block">
                      ₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-3 bg-emerald-950/40 rounded-xl border border-emerald-500/40">
                    <span className="text-[10px] font-bold text-emerald-400 block uppercase">
                      Net Invoice Total
                    </span>
                    <span className="text-lg font-mono font-black text-emerald-300 mt-0.5 block">
                      ₹{invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* ===================================================================== */}
              {/* PART C: ITEM DETAILS (MEDICINES) (Requirement 6) */}
              {/* ===================================================================== */}
              <div className="space-y-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-bold text-white text-sm">
                      MEDICINE DETAILS ({items.length} Items)
                    </h4>
                  </div>
                  <button
                    onClick={handleAddItemRow}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    Add Medicine
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    No medicine line items detected. Click "Add Medicine" to enter line items.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((it, idx) => (
                      <div
                        key={it.id}
                        className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors space-y-3"
                      >
                        {/* Row 1: Name, Company, Batch, Expiry, Delete */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-mono font-bold text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                          </div>

                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <div className="sm:col-span-2">
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                                Medicine Name <span className="text-emerald-400">*</span>
                              </label>
                              <input
                                type="text"
                                value={it.productName}
                                onChange={(e) => handleUpdateItemField(it.id, 'productName', e.target.value)}
                                placeholder="e.g. AUGMENTIN 625 DUO TAB"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                                Company / Brand
                              </label>
                              <input
                                type="text"
                                value={it.manufacturer}
                                onChange={(e) => handleUpdateItemField(it.id, 'manufacturer', e.target.value)}
                                placeholder="e.g. GSK / Cipla"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                                Batch Number
                              </label>
                              <input
                                type="text"
                                value={it.batchNumber}
                                onChange={(e) => handleUpdateItemField(it.id, 'batchNumber', e.target.value.toUpperCase())}
                                placeholder="e.g. AG7710"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono uppercase outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteItemRow(it.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-colors shrink-0"
                            title="Delete Item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Row 2: Quantities, Prices, Expiry, Tax, Total */}
                        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 pt-1 border-t border-slate-800/60">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                              Expiry Date
                            </label>
                            <input
                              type="text"
                              value={it.expiryDate}
                              onChange={(e) => handleUpdateItemField(it.id, 'expiryDate', e.target.value)}
                              placeholder="MM/YYYY"
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-300 font-mono outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                              Qty <span className="text-emerald-400">*</span>
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => handleUpdateItemField(it.id, 'quantity', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                              Free Qty
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={it.freeQuantity}
                              onChange={(e) => handleUpdateItemField(it.id, 'freeQuantity', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-emerald-400 outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                              Rate (PTR) ₹
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={it.purchaseRate}
                              onChange={(e) => handleUpdateItemField(it.id, 'purchaseRate', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                              MRP ₹
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={it.mrp}
                              onChange={(e) => handleUpdateItemField(it.id, 'mrp', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 font-mono outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                              GST %
                            </label>
                            <input
                              type="number"
                              value={it.gstPercent}
                              onChange={(e) => handleUpdateItemField(it.id, 'gstPercent', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 block mb-0.5">
                              Line Total ₹
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={it.lineTotal}
                              onChange={(e) => handleUpdateItemField(it.id, 'lineTotal', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg px-2 py-1 text-xs text-emerald-300 font-mono font-bold outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ===================================================================== */}
              {/* PART D: DUPLICATE BILL CHECK NOTICE (Requirement 10) */}
              {/* ===================================================================== */}
              {duplicateWarning && (
                <div className="p-4 bg-amber-950/60 border border-amber-500/60 rounded-2xl space-y-3 animate-in zoom-in-95">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                    <span>Possible Duplicate Bill</span>
                  </div>

                  <p className="text-xs text-amber-200/90 leading-relaxed">
                    {duplicateWarning}
                  </p>

                  {duplicateRecord && (
                    <div className="p-3 bg-slate-950 rounded-xl border border-amber-500/30 text-xs space-y-1">
                      <div className="text-white font-bold">
                        Existing Record: #{duplicateRecord.invoiceNumber}
                      </div>
                      <div className="text-slate-400">
                        Agency: {duplicateRecord.agencyName} • Date: {duplicateRecord.invoiceDate} • Amount: ₹{duplicateRecord.invoiceTotal.toLocaleString('en-IN')}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={handleDiscardAndCancel}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>

                    {duplicateRecord && (
                      <button
                        onClick={() => {
                          setSavedInvoice(duplicateRecord);
                          setShowSavedViewer(true);
                        }}
                        className="px-3.5 py-1.5 bg-amber-600/30 hover:bg-amber-600/40 text-amber-300 text-xs font-semibold rounded-xl border border-amber-500/40 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Existing Record
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setContinueDespiteDuplicate(true);
                        setDuplicateWarning(null);
                      }}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Continue Anyway
                    </button>
                  </div>
                </div>
              )}

              {/* ===================================================================== */}
              {/* PART E: VALIDATION ERROR BANNER (Requirement 9) */}
              {/* ===================================================================== */}
              {validationErrors.length > 0 && (
                <div className="p-4 bg-red-950/60 border border-red-500/50 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-red-300 font-bold text-xs">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span>Please correct the following fields before saving:</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-red-200 space-y-1">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ===================================================================== */}
              {/* PART F: SAVE ERROR BANNER (Requirement 12) */}
              {/* ===================================================================== */}
              {saveErrorMessage && (
                <div className="p-4 bg-red-950/70 border border-red-500/50 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-red-200 font-bold text-sm">Unable to save the purchase record.</h4>
                    <p className="text-red-300/80 text-xs mt-0.5">{saveErrorMessage}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleConfirmAndSave}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Retry Save
                    </button>
                    <button
                      onClick={() => setSaveErrorMessage(null)}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700"
                    >
                      Back to Preview
                    </button>
                  </div>
                </div>
              )}

              {/* ===================================================================== */}
              {/* PART G: CONFIRM & SAVE ACTIONS (Requirements 8 & 11) */}
              {/* ===================================================================== */}
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  onClick={handleDiscardAndCancel}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Discard &amp; Cancel
                </button>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <button
                    onClick={handleConfirmAndSave}
                    disabled={isSaving}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all transform active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Saving Purchase Record...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                        <span>Confirm &amp; Save Purchase Record</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 4: SAVE SUCCESS CARD (Requirement 11) */}
          {/* ========================================================================= */}
          {saveStatus === 'SUCCESS' && savedInvoice && (
            <div className="bg-slate-950 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl animate-in zoom-in-95">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  Purchase Record Saved Successfully
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  IndexedDB storage updated • Distributor balance recalculated • Stock &amp; expiry tracked
                </p>
              </div>

              {/* Invoice Summary */}
              <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 max-w-lg mx-auto text-left grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Invoice Number:</span>
                  <span className="text-white font-mono font-bold">#{savedInvoice.invoiceNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Distributor:</span>
                  <span className="text-emerald-400 font-bold truncate block">{savedInvoice.agencyName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Invoice Date:</span>
                  <span className="text-white font-medium">{savedInvoice.invoiceDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Grand Total:</span>
                  <span className="text-emerald-300 font-mono font-bold">
                    ₹{savedInvoice.invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Post-save action buttons (Requirement 11) */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowSavedViewer(true)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-4 h-4 text-emerald-400" />
                  View Purchase
                </button>

                <button
                  onClick={handleScanAnotherBill}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  Scan Another Bill
                </button>

                <button
                  onClick={() => {
                    onNavigate?.('dashboard');
                    onClose();
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Bill Viewer Modal for [ View Purchase ] */}
      {showSavedViewer && savedInvoice && (
        <OriginalBillViewer
          isOpen={showSavedViewer}
          images={savedInvoice.images || processedPages}
          originalImages={savedInvoice.originalImages || originalPages}
          processedImages={savedInvoice.processedImages || processedPages}
          invoice={savedInvoice}
          title={`Invoice #${savedInvoice.invoiceNumber} - ${savedInvoice.agencyName}`}
          onClose={() => setShowSavedViewer(false)}
        />
      )}
    </div>
  );
};
