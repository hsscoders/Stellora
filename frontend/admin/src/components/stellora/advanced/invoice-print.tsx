"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { escapeHtml as esc, printDocument } from "@/lib/print-doc";

/* ============================ invoice data shape ============================ */

export interface InvoiceItem {
  name: string;
  variant: string;
  sku: string;
  qty: number;
  unitPrice: number | string;
  lineTotal: number | string;
}

export interface InvoiceData {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  addressLines: string[];
  items: InvoiceItem[];
  subtotal: number | string;
  discountTotal: number | string;
  couponCode?: string | null;
  shippingFee: number | string;
  grandTotal: number | string;
  paymentStatus?: string;
  paymentMethod?: string;
}

/* ====================== rupees-in-words (Indian system) ===================== */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

/** ₹12,45,678.50 → "Twelve Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees And Fifty Paise" */
function rupeesInWords(amount: number | string): string {
  const n = Math.round(Number(amount) * 100) / 100;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = Math.floor((rupees % 1000) / 100);
  const rest = rupees % 100;
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  let out = `${parts.join(" ")} Rupees`;
  if (paise) out += ` And ${twoDigits(paise)} Paise`;
  return `${out} Only`;
}

/* ============================= invoice document ============================= */

const inr = (n: number | string) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Builds a clean A4 tax invoice as a standalone HTML document. */
function buildInvoiceHtml(inv: InvoiceData): string {
  const rows = inv.items
    .map(
      (it, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td><b>${esc(it.name)}</b><span class="sub">${esc(it.variant)} · ${esc(it.sku)}</span></td>
      <td class="c">${it.qty}</td>
      <td class="r">${inr(it.unitPrice)}</td>
      <td class="r"><b>${inr(it.lineTotal)}</b></td>
    </tr>`
    )
    .join("");

  const hasDiscount = Number(inv.discountTotal) > 0;
  const discountLabel = inv.couponCode ? `Discount (${esc(inv.couponCode)})` : "Discount";
  const payLine = [inv.paymentMethod, inv.paymentStatus].filter(Boolean).join(" · ");

  return `<style>
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body { font: 12.5px/1.5 Georgia, "Times New Roman", serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { padding: 0 2mm; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #111; padding-bottom: 12px; }
.brand h1 { font-size: 30px; letter-spacing: .06em; font-weight: 800; }
.brand p { font-size: 10px; letter-spacing: .34em; text-transform: uppercase; color: #555; margin-top: 2px; }
.doc { text-align: right; }
.doc h2 { font-size: 16px; letter-spacing: .22em; text-transform: uppercase; }
.doc p { font-size: 11px; color: #444; margin-top: 2px; }
.party { display: flex; justify-content: space-between; gap: 16mm; margin: 14px 0; }
.party h3 { font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: #666; margin-bottom: 4px; }
.party .bill-to { font-size: 12.5px; }
.party .bill-to b { font-size: 13.5px; }
.party .meta { text-align: right; font-size: 12px; min-width: 58mm; }
.party .meta div { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px dotted #ccc; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
thead th { background: #111; color: #fff; text-align: left; padding: 7px 9px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
thead th.c, td.c { text-align: center; width: 34px; }
thead th.r, td.r { text-align: right; }
tbody td { padding: 8px 9px; border-bottom: 1px solid #e4e4e4; vertical-align: top; }
tbody .sub { display: block; font-size: 10.5px; color: #666; margin-top: 1px; }
.totals { margin-top: 12px; margin-left: auto; width: 68mm; font-size: 12.5px; }
.totals div { display: flex; justify-content: space-between; padding: 3px 0; }
.totals .grand { border-top: 2px solid #111; margin-top: 5px; padding-top: 7px; font-size: 15px; font-weight: 800; }
.words { margin-top: 10px; font-size: 11px; color: #333; }
.words b { text-transform: uppercase; letter-spacing: .1em; font-size: 9.5px; color: #666; }
footer { margin-top: 18mm; border-top: 1px solid #ccc; padding-top: 8px; text-align: center; font-size: 10.5px; color: #555; }
footer .thanks { font-size: 12px; color: #111; font-weight: 700; letter-spacing: .06em; }
</style>
<div class="sheet">
  <header>
    <div class="brand">
      <h1>STELLORA</h1>
      <p>Fine Jewellery &amp; Lifestyle</p>
    </div>
    <div class="doc">
      <h2>Tax Invoice</h2>
      <p>Original for Recipient</p>
    </div>
  </header>
  <div class="party">
    <div class="bill-to">
      <h3>Bill To</h3>
      <b>${esc(inv.customerName)}</b><br/>
      ${inv.customerPhone ? `${esc(inv.customerPhone)}<br/>` : ""}
      ${inv.customerEmail ? `${esc(inv.customerEmail)}<br/>` : ""}
      ${inv.addressLines.filter(Boolean).map((l) => `${esc(l)}<br/>`).join("")}
    </div>
    <div class="meta">
      <div><span>Invoice No.</span><b>${esc(inv.orderNumber)}</b></div>
      <div><span>Date</span><span>${esc(new Date(inv.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }))}</span></div>
      ${payLine ? `<div><span>Payment</span><span>${esc(payLine)}</span></div>` : ""}
    </div>
  </div>
  <table>
    <thead><tr><th class="c">#</th><th>Item Description</th><th class="c">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${inr(inv.subtotal)}</span></div>
    ${hasDiscount ? `<div><span>${discountLabel}</span><span>−${inr(inv.discountTotal)}</span></div>` : ""}
    <div><span>Shipping</span><span>${inr(inv.shippingFee)}</span></div>
    <div class="grand"><span>TOTAL</span><span>${inr(inv.grandTotal)}</span></div>
  </div>
  <p class="words"><b>Amount in words —</b> ${esc(rupeesInWords(inv.grandTotal))}</p>
  <footer>
    <p class="thanks">Thank you for shopping with Stellora</p>
    <p>This is a computer-generated invoice and does not require a signature.</p>
  </footer>
</div>`;
}

/**
 * InvoicePrintButton — prints a clean A4 tax invoice through the standalone
 * document printer. The admin page itself is a dashboard and has no print
 * stylesheet, so the old `window.print()` here printed the whole admin shell.
 */
export function InvoicePrintButton({
  invoice,
  label = "Print invoice",
  className,
}: {
  invoice: InvoiceData;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      className={className ?? "rounded-full"}
      onClick={() => printDocument(`Invoice ${invoice.orderNumber}`, buildInvoiceHtml(invoice))}
      aria-label={label}
      title="Print a clean A4 tax invoice"
    >
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
