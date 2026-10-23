import { ExtractedBillData } from '../types/pharmacy';

export interface SampleBillDefinition {
  id: string;
  name: string;
  agencyName: string;
  invoiceNumber: string;
  invoiceDate: string;
  description: string;
  previewData: ExtractedBillData;
  renderInvoiceImage: () => string; // returns data URL
}

/**
 * Creates high-fidelity canvas-rendered Indian pharmacy distributor invoices
 */
function drawIndianInvoiceCanvas(
  agencyName: string,
  gstin: string,
  dlNo: string,
  address: string,
  phone: string,
  buyerName: string,
  invoiceNo: string,
  invoiceDate: string,
  items: Array<{
    name: string;
    hsn: string;
    batch: string;
    exp: string;
    qty: number;
    free: number;
    mrp: number;
    rate: number;
    disc: number;
    gst: number;
    total: number;
  }>,
  taxableTotal: number,
  cgst: number,
  sgst: number,
  grandTotal: number
): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background - realistic invoice paper with slight aged warmth
  ctx.fillStyle = '#fbfbfa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

  // Header Box
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(agencyName.toUpperCase(), canvas.width / 2, 85);

  ctx.font = '18px Arial, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('AUTHORISED WHOLESALE PHARMACEUTICAL DISTRIBUTORS & C&F STOCKISTS', canvas.width / 2, 115);
  ctx.fillText(address, canvas.width / 2, 140);
  ctx.fillText(`PHONE: ${phone} | EMAIL: orders@${agencyName.toLowerCase().replace(/[^a-z]/g, '')}.com`, canvas.width / 2, 165);

  // Tax Identification bar
  ctx.fillStyle = '#0f766e';
  ctx.fillRect(35, 185, canvas.width - 70, 35);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`GSTIN: ${gstin}`, 50, 208);
  ctx.textAlign = 'center';
  ctx.fillText(`DRUG LICENCE NO.: ${dlNo}`, canvas.width / 2, 208);
  ctx.textAlign = 'right';
  ctx.fillText('STATE CODE: 27 (MAHARASHTRA)', canvas.width - 50, 208);

  // Divider
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;

  // Invoice Details & Buyer Box
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(35, 230, (canvas.width - 70) / 2, 130);
  ctx.fillRect(35 + (canvas.width - 70) / 2 + 10, 230, (canvas.width - 70) / 2 - 10, 130);

  // Left Buyer
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('CONSIGNEE / BILLED TO:', 50, 260);
  ctx.font = 'bold 17px Arial, sans-serif';
  ctx.fillText(buyerName, 50, 285);
  ctx.font = '15px Arial, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('104, STATION ROAD, OPP. GOVT. HOSPITAL, PUNE - 411001', 50, 310);
  ctx.fillText('DL NO: MH-PUN-198244/198245 | GSTIN: 27AABCP8841F1ZV', 50, 335);

  // Right Invoice Meta
  const rightX = 35 + (canvas.width - 70) / 2 + 25;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillText('TAX INVOICE / PURCHASE MEMO', rightX, 260);
  ctx.font = '16px Arial, sans-serif';
  ctx.fillStyle = '#1e293b';
  ctx.fillText(`INVOICE NO:  `, rightX, 290);
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.fillStyle = '#b91c1c';
  ctx.fillText(invoiceNo, rightX + 130, 290);

  ctx.font = '16px Arial, sans-serif';
  ctx.fillStyle = '#1e293b';
  ctx.fillText(`DATE:         ${invoiceDate}`, rightX, 320);
  ctx.fillText(`PAYMENT DUE:  30 DAYS (CREDIT)`, rightX, 345);

  // Items Table Header
  const tableY = 380;
  ctx.fillStyle = '#334155';
  ctx.fillRect(35, tableY, canvas.width - 70, 40);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('S.N.', 45, tableY + 25);
  ctx.fillText('PRODUCT DESCRIPTION', 90, tableY + 25);
  ctx.fillText('HSN', 410, tableY + 25);
  ctx.fillText('BATCH', 490, tableY + 25);
  ctx.fillText('EXPIRY', 580, tableY + 25);
  ctx.textAlign = 'right';
  ctx.fillText('QTY', 680, tableY + 25);
  ctx.fillText('FREE', 740, tableY + 25);
  ctx.fillText('M.R.P.', 830, tableY + 25);
  ctx.fillText('RATE(PTR)', 920, tableY + 25);
  ctx.fillText('DIS%', 980, tableY + 25);
  ctx.fillText('GST%', 1040, tableY + 25);
  ctx.fillText('TOTAL (₹)', canvas.width - 50, tableY + 25);

  // Rows
  let curY = tableY + 40;
  items.forEach((item, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(35, curY, canvas.width - 70, 48);

    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(35, curY, canvas.width - 70, 48);

    ctx.fillStyle = '#0f172a';
    ctx.font = '14px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${idx + 1}.`, 45, curY + 30);

    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.fillText(item.name, 90, curY + 30);

    ctx.font = '13px Arial, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(item.hsn, 410, curY + 30);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillText(item.batch, 490, curY + 30);

    ctx.font = '13px Arial, sans-serif';
    ctx.fillStyle = '#b45309';
    ctx.fillText(item.exp, 580, curY + 30);

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(item.qty.toString(), 680, curY + 30);

    ctx.fillStyle = item.free > 0 ? '#047857' : '#94a3b8';
    ctx.fillText(item.free > 0 ? `+${item.free}` : '-', 740, curY + 30);

    ctx.fillStyle = '#475569';
    ctx.fillText(item.mrp.toFixed(2), 830, curY + 30);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(item.rate.toFixed(2), 920, curY + 30);

    ctx.font = '13px Arial, sans-serif';
    ctx.fillText(item.disc > 0 ? `${item.disc}%` : '-', 980, curY + 30);
    ctx.fillText(`${item.gst}%`, 1040, curY + 30);

    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.fillText(item.total.toFixed(2), canvas.width - 50, curY + 30);

    curY += 48;
  });

  // Footer & Totals Box
  const summaryY = Math.max(curY + 30, 950);

  // Terms & Stamp on left
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(40, summaryY, 600, 220);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(40, summaryY, 600, 220);

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TERMS & CONDITIONS:', 55, summaryY + 25);
  ctx.font = '12px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('1. Goods once sold will not be taken back without prior debit note.', 55, summaryY + 50);
  ctx.fillText('2. Medicines with expiry within 3 months should be returned promptly for credit.', 55, summaryY + 70);
  ctx.fillText('3. Overdue interest @ 18% p.a. charged for payments delayed beyond 30 days.', 55, summaryY + 90);
  ctx.fillText('4. Subject to Pune jurisdiction only.', 55, summaryY + 110);

  // Distributor stamp
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.strokeRect(70, summaryY + 130, 220, 65);
  ctx.fillStyle = '#0369a1';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VERIFIED & DISPATCHED', 180, summaryY + 155);
  ctx.fillText(`${agencyName.toUpperCase()}`, 180, summaryY + 175);

  // Totals column on right
  const totX = 660;
  const totW = canvas.width - 700;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(totX, summaryY, totW, 220);
  ctx.strokeRect(totX, summaryY, totW, 220);

  ctx.fillStyle = '#334155';
  ctx.font = '15px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TAXABLE AMOUNT:', totX + 20, summaryY + 35);
  ctx.fillText('CGST (6%):', totX + 20, summaryY + 70);
  ctx.fillText('SGST (6%):', totX + 20, summaryY + 105);
  ctx.fillText('ROUND OFF:', totX + 20, summaryY + 140);

  ctx.textAlign = 'right';
  ctx.fillText(`₹ ${taxableTotal.toFixed(2)}`, totX + totW - 20, summaryY + 35);
  ctx.fillText(`₹ ${cgst.toFixed(2)}`, totX + totW - 20, summaryY + 70);
  ctx.fillText(`₹ ${sgst.toFixed(2)}`, totX + totW - 20, summaryY + 105);
  ctx.fillText('₹ 0.00', totX + totW - 20, summaryY + 140);

  // Grand Total highlight bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(totX, summaryY + 160, totW, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('NET INVOICE TOTAL:', totX + 20, summaryY + 197);
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillStyle = '#facc15';
  ctx.textAlign = 'right';
  ctx.fillText(`₹ ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, totX + totW - 20, summaryY + 198);

  // Signatures
  ctx.fillStyle = '#1e293b';
  ctx.font = '14px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Receiver Signature & Seal', 250, 1530);
  ctx.fillText(`For ${agencyName.toUpperCase()} (Authorised Signatory)`, 950, 1530);

  ctx.strokeStyle = '#94a3b8';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(150, 1500);
  ctx.lineTo(350, 1500);
  ctx.moveTo(800, 1500);
  ctx.lineTo(1100, 1500);
  ctx.stroke();
  ctx.setLineDash([]);

  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Creates high-fidelity canvas-rendered Indian pharmacy payment receipt
 */
function drawIndianReceiptCanvas(
  agencyName: string,
  receiptNo: string,
  receiptDate: string,
  receivedFrom: string,
  amount: number,
  paymentMode: string,
  refNo: string,
  previousBalance: number,
  remainingBalance: number
): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border with decorative double lines
  ctx.strokeStyle = '#0f766e';
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

  // Header Box
  ctx.fillStyle = '#0f766e';
  ctx.fillRect(40, 40, canvas.width - 80, 140);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(agencyName.toUpperCase(), canvas.width / 2, 95);

  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillStyle = '#99f6e4';
  ctx.fillText('AUTHORIZED WHOLESALE DISTRIBUTOR — PAYMENT VOUCHER / MONEY RECEIPT', canvas.width / 2, 135);
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('Plot 44, Pharmaceutical Market, Rasta Peth, Pune | GSTIN: 27AAECV4120L1ZA | Phone: +91 98220 19844', canvas.width / 2, 160);

  // Receipt Number & Date Strip
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(60, 210, canvas.width - 120, 60);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(60, 210, canvas.width - 120, 60);

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`RECEIPT NO: ${receiptNo}`, 90, 246);
  ctx.textAlign = 'right';
  ctx.fillText(`PAYMENT DATE: ${receiptDate}`, canvas.width - 90, 246);

  // Body content
  const startY = 320;
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'left';

  ctx.font = '16px Arial, sans-serif';
  ctx.fillText('Received with thanks from:', 80, startY);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText(receivedFrom, 80, startY + 36);

  ctx.strokeStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(80, startY + 48);
  ctx.lineTo(canvas.width - 80, startY + 48);
  ctx.stroke();

  // Amount in numbers and words box
  ctx.fillStyle = '#f0fdfa';
  ctx.fillRect(80, startY + 80, canvas.width - 160, 100);
  ctx.strokeStyle = '#0d9488';
  ctx.lineWidth = 2;
  ctx.strokeRect(80, startY + 80, canvas.width - 160, 100);

  ctx.fillStyle = '#0f766e';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText('AMOUNT PAID (IN FIGURES):', 110, startY + 120);

  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillText(`₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 110, startY + 160);

  ctx.fillStyle = '#475569';
  ctx.font = 'italic 16px Arial, sans-serif';
  ctx.fillText(`(Rupees Ten Thousand Only)`, 520, startY + 155);

  // Payment method & reference details table
  const tableY = startY + 230;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(80, tableY, canvas.width - 160, 40);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('TRANSACTION DETAILS & ACCOUNT SETTLEMENT', 100, tableY + 26);

  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(80, tableY, canvas.width - 160, 240);

  const rowH = 45;
  const labels = [
    { label: 'Payment Mode / Method:', val: paymentMode },
    { label: 'Transaction / UTR / Cheque Ref No:', val: refNo },
    { label: 'Previous Outstanding Ledger Balance:', val: `₹ ${previousBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
    { label: 'Payment Amount Deducted:', val: `(-) ₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
    { label: 'Current Remaining Outstanding Balance:', val: `₹ ${remainingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
  ];

  labels.forEach((r, idx) => {
    const y = tableY + 40 + idx * rowH;
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(81, y, canvas.width - 162, rowH);

    ctx.fillStyle = '#334155';
    ctx.font = '15px Arial, sans-serif';
    ctx.fillText(r.label, 110, y + 28);

    ctx.fillStyle = idx === 4 ? '#b91c1c' : idx === 3 ? '#047857' : '#0f172a';
    ctx.font = idx >= 2 ? 'bold 16px Arial, sans-serif' : '15px Arial, sans-serif';
    ctx.fillText(r.val, 550, y + 28);

    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(80, y + rowH);
    ctx.lineTo(canvas.width - 80, y + rowH);
    ctx.stroke();
  });

  // Terms and sign
  ctx.fillStyle = '#64748b';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('* Subject to realization of cheque / digital bank transfer confirmation.', 80, tableY + 310);
  ctx.fillText('* This is an official computer-verified money receipt for distributor ledger accounting.', 80, tableY + 330);

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Authorized Signatory & Stamp', canvas.width - 250, 1300);
  ctx.fillText(`For ${agencyName.toUpperCase()}`, canvas.width - 250, 1325);

  ctx.strokeStyle = '#94a3b8';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(canvas.width - 400, 1270);
  ctx.lineTo(canvas.width - 100, 1270);
  ctx.stroke();
  ctx.setLineDash([]);

  return canvas.toDataURL('image/jpeg', 0.85);
}

export const SAMPLE_BILLS: SampleBillDefinition[] = [
  {
    id: 'sample-venu-medical',
    name: 'Venu Medical (Existing Registered Agency — TEST 1)',
    agencyName: 'Venu Medical',
    invoiceNumber: 'VM-9081',
    invoiceDate: '2026-10-07',
    description: 'Existing registered distributor bill. Validates Test 1: Venu Medical + GSTIN appears in preview.',
    previewData: {
      agency: {
        detectedName: 'Venu Medical',
        gstin: '27AABCV8811K1ZX',
        address: '22, Main Bazaar, M.G. Road, Pune - 411001',
        phone: '+91 98450 11223',
        matchedAgencyId: 'agency-venu',
        agencyConfidence: 'HIGH',
        reasoning: 'Exact GSTIN and name match with registered agency Venu Medical',
      },
      invoice: {
        invoiceNumber: 'VM-9081',
        invoiceDate: '2026-10-07',
        invoiceTotal: 5400.0,
        taxableAmount: 4821.43,
        gstAmount: 578.57,
        confidence: {
          invoiceNumber: 'HIGH',
          invoiceDate: 'HIGH',
          invoiceTotal: 'HIGH',
        },
      },
      items: [
        {
          productName: 'AZITHROMYCIN 500MG TAB',
          productCode: '30042000',
          batchNumber: 'AZ8810',
          expiryDate: '10/2028',
          quantity: 20,
          freeQuantity: 2,
          mrp: 145.0,
          purchaseRate: 95.0,
          discountPercent: 3.0,
          gstPercent: 12.0,
          lineTotal: 1843.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'PARACETAMOL 650MG TAB',
          productCode: '30049060',
          batchNumber: 'PC9921',
          expiryDate: '05/2028',
          quantity: 50,
          freeQuantity: 5,
          mrp: 35.0,
          purchaseRate: 24.0,
          discountPercent: 4.0,
          gstPercent: 12.0,
          lineTotal: 1152.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'AMOXICILLIN 500MG CAP',
          productCode: '30041000',
          batchNumber: 'AM7712',
          expiryDate: '12/2027',
          quantity: 30,
          freeQuantity: 0,
          mrp: 110.0,
          purchaseRate: 75.0,
          discountPercent: 2.0,
          gstPercent: 12.0,
          lineTotal: 2205.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
      ],
    },
    renderInvoiceImage: () => {
      return drawIndianInvoiceCanvas(
        'Venu Medical',
        '27AABCV8811K1ZX',
        'MH-PUN-20B/33401, 21B/33402',
        '22, Main Bazaar, M.G. Road, Pune - 411001',
        '+91 98450 11223',
        'APEX LIFECARE PHARMACY',
        'VM-9081',
        '07-Oct-2026',
        [
          { name: 'AZITHROMYCIN 500MG TAB (5 Tab)', hsn: '30042000', batch: 'AZ8810', exp: '10/28', qty: 20, free: 2, mrp: 145.0, rate: 95.0, disc: 3, gst: 12, total: 1843.0 },
          { name: 'PARACETAMOL 650MG TAB (15 Tab)', hsn: '30049060', batch: 'PC9921', exp: '05/28', qty: 50, free: 5, mrp: 35.0, rate: 24.0, disc: 4, gst: 12, total: 1152.0 },
          { name: 'AMOXICILLIN 500MG CAP (10 Cap)', hsn: '30041000', batch: 'AM7712', exp: '12/27', qty: 30, free: 0, mrp: 110.0, rate: 75.0, disc: 2, gst: 12, total: 2205.0 },
        ],
        4821.43,
        289.28,
        289.29,
        5400.0
      );
    },
  },
  {
    id: 'sample-uday-medical',
    name: 'Uday Medical (New Agency Detected — TEST 2)',
    agencyName: 'Uday Medical',
    invoiceNumber: 'UM-3042',
    invoiceDate: '2026-10-07',
    description: 'New distributor with different GSTIN. Validates Test 2: Must NEVER be assigned to Venu Medical!',
    previewData: {
      agency: {
        detectedName: 'Uday Medical',
        gstin: '27AABCU5544M1Z2', // Different GSTIN from Venu Medical!
        address: '88, Shivaji Road, Swargate, Pune - 411042',
        phone: '+91 98661 77889',
        matchedAgencyId: null, // Must NOT match Venu Medical!
        agencyConfidence: 'LOW',
        isNewSupplier: true,
        reasoning: 'New Agency Detected: Uday Medical (GSTIN: 27AABCU5544M1Z2 differs from Venu Medical)',
      },
      invoice: {
        invoiceNumber: 'UM-3042',
        invoiceDate: '2026-10-07',
        invoiceTotal: 7850.0,
        taxableAmount: 7008.93,
        gstAmount: 841.07,
        confidence: {
          invoiceNumber: 'HIGH',
          invoiceDate: 'HIGH',
          invoiceTotal: 'HIGH',
        },
      },
      items: [
        {
          productName: 'CEFIXIME 200MG TAB',
          productCode: '30041000',
          batchNumber: 'CF1022',
          expiryDate: '12/2028',
          quantity: 30,
          freeQuantity: 3,
          mrp: 180.0,
          purchaseRate: 115.0,
          discountPercent: 5.0,
          gstPercent: 12.0,
          lineTotal: 3277.5,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'PANTOPRAZOLE 40MG TAB',
          productCode: '30049099',
          batchNumber: 'PT5510',
          expiryDate: '08/2028',
          quantity: 40,
          freeQuantity: 4,
          mrp: 140.0,
          purchaseRate: 88.0,
          discountPercent: 3.0,
          gstPercent: 12.0,
          lineTotal: 3414.4,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'LEVOCETIRIZINE 5MG TAB',
          productCode: '30049060',
          batchNumber: 'LC3301',
          expiryDate: '04/2028',
          quantity: 50,
          freeQuantity: 0,
          mrp: 45.0,
          purchaseRate: 23.0,
          discountPercent: 2.0,
          gstPercent: 12.0,
          lineTotal: 1127.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
      ],
    },
    renderInvoiceImage: () => {
      return drawIndianInvoiceCanvas(
        'Uday Medical',
        '27AABCU5544M1Z2',
        'MH-PUN-20B/44501, 21B/44502',
        '88, Shivaji Road, Swargate, Pune - 411042',
        '+91 98661 77889',
        'APEX LIFECARE PHARMACY',
        'UM-3042',
        '07-Oct-2026',
        [
          { name: 'CEFIXIME 200MG TAB (10 Tab)', hsn: '30041000', batch: 'CF1022', exp: '12/28', qty: 30, free: 3, mrp: 180.0, rate: 115.0, disc: 5, gst: 12, total: 3277.5 },
          { name: 'PANTOPRAZOLE 40MG TAB (15 Tab)', hsn: '30049099', batch: 'PT5510', exp: '08/28', qty: 40, free: 4, mrp: 140.0, rate: 88.0, disc: 3, gst: 12, total: 3414.4 },
          { name: 'LEVOCETIRIZINE 5MG TAB (10 Tab)', hsn: '30049060', batch: 'LC3301', exp: '04/28', qty: 50, free: 0, mrp: 45.0, rate: 23.0, disc: 2, gst: 12, total: 1127.0 },
        ],
        7008.93,
        420.53,
        420.54,
        7850.0
      );
    },
  },
  {
    id: 'sample-unclear-agency',
    name: 'Unclear Agency Bill (Low Confidence — TEST 3)',
    agencyName: 'Unclear Agency',
    invoiceNumber: 'INV-UNCLEAR-01',
    invoiceDate: '2026-10-07',
    description: 'Smudged supplier details. Validates Test 3: "Agency could not be confidently identified", provide Select Agency.',
    previewData: {
      agency: {
        detectedName: 'NOT DETECTED',
        gstin: 'NOT DETECTED',
        address: '',
        phone: '',
        matchedAgencyId: null,
        agencyConfidence: 'LOW',
        isNewSupplier: true,
        reasoning: 'Agency could not be confidently identified.',
      },
      invoice: {
        invoiceNumber: 'INV-UNCLEAR-01',
        invoiceDate: '2026-10-07',
        invoiceTotal: 3200.0,
        taxableAmount: 2857.14,
        gstAmount: 342.86,
        confidence: {
          invoiceNumber: 'REVIEW',
          invoiceDate: 'HIGH',
          invoiceTotal: 'HIGH',
        },
      },
      items: [
        {
          productName: 'CETIRIZINE 10MG TAB',
          productCode: '30049060',
          batchNumber: 'CT4411',
          expiryDate: '06/2028',
          quantity: 50,
          freeQuantity: 5,
          mrp: 40.0,
          purchaseRate: 25.0,
          discountPercent: 0,
          gstPercent: 12.0,
          lineTotal: 1250.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'OMEPRAZOLE 20MG CAP',
          productCode: '30049099',
          batchNumber: 'OM2209',
          expiryDate: '11/2027',
          quantity: 40,
          freeQuantity: 0,
          mrp: 65.0,
          purchaseRate: 43.5,
          discountPercent: 0,
          gstPercent: 12.0,
          lineTotal: 1740.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
      ],
    },
    renderInvoiceImage: () => {
      return drawIndianInvoiceCanvas(
        '*** SMUDGED SUPPLIER ***',
        'NOT DETECTED',
        'MH-PUN-20B/XXXXX',
        'Address illegible due to paper fold',
        'Phone unreadable',
        'APEX LIFECARE PHARMACY',
        'INV-UNCLEAR-01',
        '07-Oct-2026',
        [
          { name: 'CETIRIZINE 10MG TAB (10 Tab)', hsn: '30049060', batch: 'CT4411', exp: '06/28', qty: 50, free: 5, mrp: 40.0, rate: 25.0, disc: 0, gst: 12, total: 1250.0 },
          { name: 'OMEPRAZOLE 20MG CAP (15 Cap)', hsn: '30049099', batch: 'OM2209', exp: '11/27', qty: 40, free: 0, mrp: 65.0, rate: 43.5, disc: 0, gst: 12, total: 1740.0 },
        ],
        2857.14,
        171.43,
        171.43,
        3200.0
      );
    },
  },
  {
    id: 'sample-vikas-pharma',
    name: 'Vikas Pharma Distributors (Cipla & Sun Pharma Invoice)',
    agencyName: 'Vikas Pharma Distributors',
    invoiceNumber: 'VPD-2026/8941',
    invoiceDate: '2026-10-01',
    description: '4 medicines with free quantity (10+1 scheme), standard GST & discounts.',
    previewData: {
      agency: {
        detectedName: 'Vikas Pharma Distributors',
        gstin: '27AAECV4120L1ZA',
        address: 'Plot 44, Pharmaceutical Market, Rasta Peth, Pune - 411011',
        phone: '9822019844',
        matchedAgencyId: 'agency-vikas',
        agencyConfidence: 'HIGH',
        reasoning: 'Exact GSTIN and supplier name match with registered agency Vikas Pharma Distributors',
      },
      invoice: {
        invoiceNumber: 'VPD-2026/8941',
        invoiceDate: '2026-10-01',
        invoiceTotal: 12480.0,
        taxableAmount: 11142.86,
        gstAmount: 1337.14,
        confidence: {
          invoiceNumber: 'HIGH',
          invoiceDate: 'HIGH',
          invoiceTotal: 'HIGH',
        },
      },
      items: [
        {
          productName: 'PAN 40MG TABLET',
          productCode: '30049099',
          batchNumber: 'PN4219',
          expiryDate: '08/2028',
          quantity: 50,
          freeQuantity: 5,
          mrp: 155.0,
          purchaseRate: 98.5,
          discountPercent: 5.0,
          gstPercent: 12.0,
          lineTotal: 4678.75,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'PARACETAMOL 500 MG',
          productCode: '30049060',
          batchNumber: 'PC8801',
          expiryDate: '11/2027',
          quantity: 100,
          freeQuantity: 10,
          mrp: 32.0,
          purchaseRate: 23.0, // Price Hike from 20 -> 23 (+15%)
          discountPercent: 3.0,
          gstPercent: 12.0,
          lineTotal: 2231.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'TELMA 40 TABLETS',
          productCode: '30049099',
          batchNumber: 'TL9902',
          expiryDate: '05/2028',
          quantity: 30,
          freeQuantity: 0,
          mrp: 230.0,
          purchaseRate: 155.0,
          discountPercent: 4.0,
          gstPercent: 12.0,
          lineTotal: 4464.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'CETIRIZINE 10MG TAB',
          productCode: '30049060',
          batchNumber: 'CT1142',
          expiryDate: '11/2026', // Near Expiry (approx 60 days)
          quantity: 40,
          freeQuantity: 4,
          mrp: 38.0,
          purchaseRate: 27.5,
          discountPercent: 0,
          gstPercent: 12.0,
          lineTotal: 1100.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
      ],
    },
    renderInvoiceImage: () => {
      return drawIndianInvoiceCanvas(
        'Vikas Pharma Distributors',
        '27AAECV4120L1ZA',
        'MH-PUN-20B/14299, 21B/14300',
        'Plot 44, Pharmaceutical Market, Rasta Peth, Pune - 411011',
        '+91 98220 19844',
        'APEX LIFECARE PHARMACY',
        'VPD-2026/8941',
        '01-Oct-2026',
        [
          { name: 'PAN 40MG TABLET (15 Tab)', hsn: '30049099', batch: 'PN4219', exp: '08/28', qty: 50, free: 5, mrp: 155.0, rate: 98.5, disc: 5, gst: 12, total: 4678.75 },
          { name: 'PARACETAMOL 500 MG (10 Tab)', hsn: '30049060', batch: 'PC8801', exp: '11/27', qty: 100, free: 10, mrp: 32.0, rate: 23.0, disc: 3, gst: 12, total: 2231.0 },
          { name: 'TELMA 40 TABLETS (15 Tab)', hsn: '30049099', batch: 'TL9902', exp: '05/28', qty: 30, free: 0, mrp: 230.0, rate: 155.0, disc: 4, gst: 12, total: 4464.0 },
          { name: 'CETIRIZINE 10MG TAB (10 Tab)', hsn: '30049060', batch: 'CT1142', exp: '11/26', qty: 40, free: 4, mrp: 38.0, rate: 27.5, disc: 0, gst: 12, total: 1100.0 },
        ],
        11142.86,
        668.57,
        668.57,
        12480.0
      );
    },
  },
  {
    id: 'sample-medico-healthcare',
    name: 'Medico Healthcare Agency (Augmentin & Price Change)',
    agencyName: 'Medico Healthcare Agency',
    invoiceNumber: 'MHA/OCT/1042',
    invoiceDate: '2026-10-01',
    description: 'Augmentin 625 Duo price decrease (-₹3) and critical short expiry item.',
    previewData: {
      agency: {
        detectedName: 'Medico Healthcare Agency',
        gstin: '27BBDMP9912K1Z9',
        address: 'G-12, Commerce Centre, Tilak Road, Pune - 411030',
        phone: '9422033411',
        matchedAgencyId: 'agency-medico',
        agencyConfidence: 'HIGH',
        reasoning: 'Recognized Medico Healthcare Agency from header and GSTIN match',
      },
      invoice: {
        invoiceNumber: 'MHA/OCT/1042',
        invoiceDate: '2026-10-01',
        invoiceTotal: 18650.0,
        taxableAmount: 16651.78,
        gstAmount: 1998.22,
        confidence: {
          invoiceNumber: 'HIGH',
          invoiceDate: 'HIGH',
          invoiceTotal: 'HIGH',
        },
      },
      items: [
        {
          productName: 'AUGMENTIN 625 DUO TAB',
          productCode: '30041000',
          batchNumber: 'AG7710',
          expiryDate: '09/2028',
          quantity: 40,
          freeQuantity: 2,
          mrp: 223.5,
          purchaseRate: 147.0, // Price decrease from 150 -> 147 (-2%)
          discountPercent: 2.0,
          gstPercent: 12.0,
          lineTotal: 5762.4,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'AZITHRAL 500 TABLET',
          productCode: '30042000',
          batchNumber: 'AZ5521',
          expiryDate: '10/2026', // Critical expiry (Expires in 30 days!)
          quantity: 30,
          freeQuantity: 0,
          mrp: 132.0,
          purchaseRate: 88.0,
          discountPercent: 5.0,
          gstPercent: 12.0,
          lineTotal: 2508.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'MONTEK LC TABLET',
          productCode: '30049099',
          batchNumber: 'MK3309',
          expiryDate: '01/2028',
          quantity: 60,
          freeQuantity: 6,
          mrp: 198.0,
          purchaseRate: 134.0,
          discountPercent: 3.0,
          gstPercent: 12.0,
          lineTotal: 7798.8,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
      ],
    },
    renderInvoiceImage: () => {
      return drawIndianInvoiceCanvas(
        'Medico Healthcare Agency',
        '27BBDMP9912K1Z9',
        'MH-PUN-20B/18840, 21B/18841',
        'G-12, Commerce Centre, Tilak Road, Pune - 411030',
        '+91 94220 33411',
        'APEX LIFECARE PHARMACY',
        'MHA/OCT/1042',
        '01-Oct-2026',
        [
          { name: 'AUGMENTIN 625 DUO TAB (10 Tab)', hsn: '30041000', batch: 'AG7710', exp: '09/28', qty: 40, free: 2, mrp: 223.5, rate: 147.0, disc: 2, gst: 12, total: 5762.4 },
          { name: 'AZITHRAL 500 TABLET (5 Tab)', hsn: '30042000', batch: 'AZ5521', exp: '10/26', qty: 30, free: 0, mrp: 132.0, rate: 88.0, disc: 5, gst: 12, total: 2508.0 },
          { name: 'MONTEK LC TABLET (10 Tab)', hsn: '30049099', batch: 'MK3309', exp: '01/28', qty: 60, free: 6, mrp: 198.0, rate: 134.0, disc: 3, gst: 12, total: 7798.8 },
        ],
        16651.78,
        999.11,
        999.11,
        18650.0
      );
    },
  },
  {
    id: 'sample-shree-ganesh',
    name: 'Shree Ganesh Pharma Stockist (Unregistered / Low Confidence Demo)',
    agencyName: 'Shree Ganesh Pharma Stockist',
    invoiceNumber: 'SGP-9018',
    invoiceDate: '2026-09-28',
    description: 'Invoice to demonstrate automatic agency detection & duplicate check.',
    previewData: {
      agency: {
        detectedName: 'Shree Ganesh Pharma Stockist',
        gstin: '27AALCS8819Q1ZP',
        address: '502, Wholesale Drug Bhavan, Raviwar Peth, Pune',
        phone: '9890123456',
        matchedAgencyId: 'agency-ganesh',
        agencyConfidence: 'HIGH',
        reasoning: 'Matched registered supplier Shree Ganesh Pharma Stockist',
      },
      invoice: {
        invoiceNumber: 'SGP-9018',
        invoiceDate: '2026-09-28',
        invoiceTotal: 8400.0,
        taxableAmount: 7500.0,
        gstAmount: 900.0,
        confidence: {
          invoiceNumber: 'HIGH',
          invoiceDate: 'HIGH',
          invoiceTotal: 'HIGH',
        },
      },
      items: [
        {
          productName: 'DOLO 650 TABLET',
          productCode: '30049060',
          batchNumber: 'DL4411',
          expiryDate: '04/2028',
          quantity: 100,
          freeQuantity: 10,
          mrp: 34.0,
          purchaseRate: 24.5,
          discountPercent: 4.0,
          gstPercent: 12.0,
          lineTotal: 2352.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
        {
          productName: 'RABEPRAZOLE 20MG',
          productCode: '30049099',
          batchNumber: 'RB1022',
          expiryDate: '12/2027',
          quantity: 50,
          freeQuantity: 5,
          mrp: 110.0,
          purchaseRate: 72.0,
          discountPercent: 3.0,
          gstPercent: 12.0,
          lineTotal: 3492.0,
          confidence: {
            productName: 'HIGH',
            batchNumber: 'HIGH',
            expiryDate: 'HIGH',
            purchaseRate: 'HIGH',
            quantity: 'HIGH',
          },
        },
      ],
    },
    renderInvoiceImage: () => {
      return drawIndianInvoiceCanvas(
        'Shree Ganesh Pharma Stockist',
        '27AALCS8819Q1ZP',
        'MH-PUN-20B/20110, 21B/20111',
        '502, Wholesale Drug Bhavan, Raviwar Peth, Pune',
        '+91 98901 23456',
        'APEX LIFECARE PHARMACY',
        'SGP-9018',
        '28-Sep-2026',
        [
          { name: 'DOLO 650 TABLET (15 Tab)', hsn: '30049060', batch: 'DL4411', exp: '04/28', qty: 100, free: 10, mrp: 34.0, rate: 24.5, disc: 4, gst: 12, total: 2352.0 },
          { name: 'RABEPRAZOLE 20MG (10 Tab)', hsn: '30049099', batch: 'RB1022', exp: '12/27', qty: 50, free: 5, mrp: 110.0, rate: 72.0, disc: 3, gst: 12, total: 3492.0 },
        ],
        7500.0,
        450.0,
        450.0,
        8400.0
      );
    },
  },
  {
    id: 'sample-vikas-receipt',
    name: 'Vikas Pharma Distributors (Official Payment Receipt)',
    agencyName: 'Vikas Pharma Distributors',
    invoiceNumber: 'RCP-2026/0891',
    invoiceDate: '2026-10-02',
    description: 'Official distributor money receipt for ₹10,000 paid via UPI against purchase ledger.',
    previewData: {
      documentType: 'RECEIPT',
      classificationConfidence: 'HIGH',
      classificationReason: 'Auto-detected Payment Receipt based on signals: Payment/Money Receipt header, Received with thanks, Amount Paid, UPI reference.',
      agency: {
        detectedName: 'Vikas Pharma Distributors',
        gstin: '27AAECV4120L1ZA',
        address: 'Plot 44, Pharmaceutical Market, Rasta Peth, Pune - 411011',
        phone: '9822019844',
        matchedAgencyId: 'agency-vikas',
        agencyConfidence: 'HIGH',
        reasoning: 'Exact GSTIN and name match with registered agency Vikas Pharma Distributors',
      },
      invoice: {
        invoiceNumber: 'RCP-2026/0891',
        invoiceDate: '2026-10-02',
        invoiceTotal: 10000.0,
        taxableAmount: 10000.0,
        gstAmount: 0,
        documentType: 'RECEIPT',
        confidence: {
          invoiceNumber: 'HIGH',
          invoiceDate: 'HIGH',
          invoiceTotal: 'HIGH',
        },
      },
      paymentReceipt: {
        amountPaid: 10000.0,
        paymentDate: '2026-10-02',
        referenceNumber: 'UPI/AXIS/9941028',
        paymentMethod: 'UPI',
        previousBalance: 32000.0,
        remainingBalance: 22000.0,
        notes: 'Payment on account for September medicine purchases',
        confidence: {
          amountPaid: 'HIGH',
          paymentDate: 'HIGH',
          referenceNumber: 'HIGH',
        },
      },
      items: [],
    },
    renderInvoiceImage: () => {
      return drawIndianReceiptCanvas(
        'Vikas Pharma Distributors',
        'RCP-2026/0891',
        '02-Oct-2026',
        'APEX LIFECARE PHARMACY (Prop: Jaya)',
        10000.0,
        'UPI / Digital Transfer (Ref: UPI/AXIS/9941028)',
        'UPI/AXIS/9941028',
        32000.0,
        22000.0
      );
    },
  },
];
