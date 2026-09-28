import { api } from "./api";

function escHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ReceiptDetail = {
  receiptNo: string;
  amount: number;
  gstin?: string;
  issuedAt?: string;
  invoiceNo?: string;
  instituteName?: string;
  instituteGstin?: string;
  buyerName?: string;
  buyerGstin?: string;
  placeOfSupply?: string;
  sacCode?: string;
  hsn?: string;
  cgst?: number;
  sgst?: number;
  igst?: number;
  taxAmount?: number;
  course?: string;
};

export function printReceiptDocument(rec: ReceiptDetail) {
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Allow pop-ups to print the receipt.");
  }
  const taxLines = [
    rec.taxAmount != null && Number(rec.taxAmount) !== 0 ? `<p>Tax ₹${escHtml(rec.taxAmount)}</p>` : "",
    rec.cgst != null && Number(rec.cgst) !== 0 ? `<p>CGST ₹${escHtml(rec.cgst)}</p>` : "",
    rec.sgst != null && Number(rec.sgst) !== 0 ? `<p>SGST ₹${escHtml(rec.sgst)}</p>` : "",
    rec.igst != null && Number(rec.igst) !== 0 ? `<p>IGST ₹${escHtml(rec.igst)}</p>` : "",
  ].join("");
  win.document.write(`<!doctype html><html><head><title>${escHtml(rec.receiptNo)}</title>
    <style>body{font-family:sans-serif;padding:32px;color:#071a33}h1{margin:0 0 8px}p{margin:4px 0}</style></head>
    <body>
      <h1>${escHtml(rec.instituteName || "Receipt")}</h1>
      <p>Receipt ${escHtml(rec.receiptNo)}</p>
      <p>Invoice ${escHtml(rec.invoiceNo || "—")}</p>
      ${rec.buyerName ? `<p>Bill to ${escHtml(rec.buyerName)}</p>` : ""}
      ${rec.course ? `<p>Course ${escHtml(rec.course)}</p>` : ""}
      <p>Amount ₹${escHtml(rec.amount)}</p>
      ${taxLines}
      ${rec.hsn ? `<p>HSN ${escHtml(rec.hsn)}</p>` : ""}
      ${rec.sacCode ? `<p>SAC ${escHtml(rec.sacCode)}</p>` : ""}
      ${rec.gstin ? `<p>GSTIN ${escHtml(rec.gstin)}</p>` : ""}
      ${rec.instituteGstin ? `<p>Institute GSTIN ${escHtml(rec.instituteGstin)}</p>` : ""}
      ${rec.buyerGstin ? `<p>Buyer GSTIN ${escHtml(rec.buyerGstin)}</p>` : ""}
      ${rec.placeOfSupply ? `<p>Place of supply ${escHtml(rec.placeOfSupply)}</p>` : ""}
      <p>${escHtml(rec.issuedAt ? new Date(rec.issuedAt).toLocaleString() : "")}</p>
      <script>window.print()<\/script>
    </body></html>`);
  win.document.close();
}

export async function printReceiptById(id: string) {
  const rec = await api<ReceiptDetail>(`/api/actions/receipts/${id}`);
  printReceiptDocument(rec);
}
