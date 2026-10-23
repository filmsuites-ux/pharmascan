import * as pdfjsLib from 'pdfjs-dist';

// Configure worker for pdfjs-dist
if (typeof window !== 'undefined' && 'Worker' in window) {
  try {
    // Use worker URL from CDN matching pdfjs-dist version or fallback
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn('PDF.js worker initialization notice:', e);
  }
}

export interface PdfRenderResult {
  pages: string[]; // High-res image data URLs per page
  selectableText: string; // Extracted text preserved in reading order
  hasSelectableText: boolean;
  pageCount: number;
  fileName?: string;
}

/**
 * Checks if a file is a PDF
 */
export function isPdfFile(file: File | { type?: string; name?: string }): boolean {
  if (file.type === 'application/pdf') return true;
  if (file.name && file.name.toLowerCase().endsWith('.pdf')) return true;
  return false;
}

/**
 * Checks if a data URL or base64 string is a PDF
 */
export function isPdfDataUrl(dataUrl: string): boolean {
  if (dataUrl.startsWith('data:application/pdf')) return true;
  if (dataUrl.startsWith('JVBERi0')) return true; // '%PDF-' in base64
  return false;
}

/**
 * Renders all pages of a PDF document at high resolution (2.0x scale for crisp 200-300 DPI text)
 * and extracts any selectable text while maintaining positional layout.
 */
export async function processPdfDocument(
  fileOrDataUrl: File | string,
  fileName?: string
): Promise<PdfRenderResult> {
  let arrayBuffer: ArrayBuffer;

  if (typeof fileOrDataUrl === 'string') {
    // Base64 or Data URL
    let base64 = fileOrDataUrl;
    if (base64.includes(';base64,')) {
      base64 = base64.split(';base64,')[1];
    }
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    arrayBuffer = bytes.buffer;
  } else {
    arrayBuffer = await fileOrDataUrl.arrayBuffer();
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const renderedPages: string[] = [];
  let combinedSelectableText = '';
  let totalTextItemsCount = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);

    // Extract selectable text with positional sorting (top to bottom, left to right)
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{
      str: string;
      transform: number[]; // [scaleX, skewY, skewX, scaleY, transX, transY]
      width: number;
      height: number;
    }>;

    if (items.length > 0) {
      totalTextItemsCount += items.length;

      // Group text items by approximate Y coordinate (line grouping)
      const linesMap = new Map<number, typeof items>();
      for (const item of items) {
        if (!item.str.trim()) continue;
        const y = Math.round(item.transform[5]); // Y coordinate
        // Find existing line bucket within 4px tolerance
        let foundLineY = Array.from(linesMap.keys()).find((k) => Math.abs(k - y) <= 4);
        if (foundLineY === undefined) {
          foundLineY = y;
          linesMap.set(foundLineY, []);
        }
        linesMap.get(foundLineY)!.push(item);
      }

      // Sort lines top to bottom (in PDF coordinates, higher Y is higher on page)
      const sortedLineY = Array.from(linesMap.keys()).sort((a, b) => b - a);

      let pageText = `--- PAGE ${pageNum} OF ${numPages} ---\n`;
      for (const lineY of sortedLineY) {
        const lineItems = linesMap.get(lineY)!;
        // Sort items left to right
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
        const lineStr = lineItems.map((it) => it.str).join('  ');
        if (lineStr.trim()) {
          pageText += lineStr + '\n';
        }
      }

      combinedSelectableText += pageText + '\n';
    }

    // High resolution page rendering (Scale 2.0 or 2.5 for crisp OCR clarity)
    const viewport = page.getViewport({ scale: 2.2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // White background for transparent PDF pages
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext: any = {
        canvasContext: ctx,
        viewport,
        canvas,
      };

      await page.render(renderContext).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      renderedPages.push(dataUrl);
    }
  }

  const hasSelectableText = totalTextItemsCount > 15 && combinedSelectableText.trim().length > 50;

  return {
    pages: renderedPages,
    selectableText: combinedSelectableText,
    hasSelectableText,
    pageCount: numPages,
    fileName,
  };
}
