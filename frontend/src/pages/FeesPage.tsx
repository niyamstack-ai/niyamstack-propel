import { useState } from "react";
import { api } from "../api";
import { collectInvoice } from "../razorpay";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, formatDay, formatInr, useApi } from "../ui";

type Invoice = {
  id: string;
  invoiceNo: string;
  amount: number;
  paidAmount?: number;
  status: string;
  cgst?: number;
  sgst?: number;
  igst?: number;
  dueDate?: string;
  feePlanId?: string;
  studentId?: string;
  buyerName?: string;
};
type Payment = { id: string; gatewayRef: string; method: string; amount: number; receiptNo?: string };
type Refund = { id: string; amount: number; status: string; reason?: string; creditNoteNo?: string; gatewayRefundRef?: string };
type Student = { id: string; fullName: string };
type Plan = { id: string; name: string; totalAmount: number; gstRate?: number; installmentCount?: number };

export function FeesPage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT" || user?.role === "PARENT") return <MyFees />;
  return <StaffFees />;
}

function escHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function MyFees() {
  const invoices = useApi<Invoice[]>("/api/invoices");
  const payments = useApi<Payment[]>("/api/payments");
  const receipts = useApi<{ id: string; receiptNo: string; amount: number; issuedAt?: string }[]>("/api/receipts");
  const plans = useApi<Plan[]>("/api/fee-plans");
  const [error, setError] = useState<string | null>(null);
  const unpaid = (invoices.data ?? []).filter((inv) => inv.status !== "PAID" && inv.status !== "CANCELLED");
  const dueTotal = unpaid.reduce((sum, inv) => sum + Number(inv.amount || 0) - Number(inv.paidAmount || 0), 0);

  async function openReceipt(id: string) {
    setError(null);
    try {
      const rec = await api<{
        receiptNo: string;
        amount: number;
        gstin?: string;
        issuedAt?: string;
        invoiceNo?: string;
        instituteName?: string;
      }>(`/api/actions/receipts/${id}`);
      const win = window.open("", "_blank");
      if (!win) {
        setError("Allow pop-ups to print the receipt.");
        return;
      }
      win.document.write(`<!doctype html><html><head><title>${escHtml(rec.receiptNo)}</title>
        <style>body{font-family:sans-serif;padding:32px;color:#071a33}h1{margin:0 0 8px}p{margin:4px 0}</style></head>
        <body>
          <h1>${escHtml(rec.instituteName || "Receipt")}</h1>
          <p>Receipt ${escHtml(rec.receiptNo)}</p>
          <p>Invoice ${escHtml(rec.invoiceNo || "—")}</p>
          <p>Amount ₹${escHtml(rec.amount)}</p>
          ${rec.gstin ? `<p>GSTIN ${escHtml(rec.gstin)}</p>` : ""}
          <p>${escHtml(rec.issuedAt ? new Date(rec.issuedAt).toLocaleString() : "")}</p>
          <script>window.print()<\/script>
        </body></html>`);
      win.document.close();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">My fees</h1>
      <p className="text-sm text-slate-500">Pay dues and download receipts for this student account.</p>
      {dueTotal > 0 && <p className="text-sm font-medium text-navy">Total due ₹{dueTotal}</p>}
      <ErrorText error={error} />
      <Card title="Invoices">
        {(invoices.data ?? []).length === 0 && <p className="text-sm text-slate-500">No invoices yet.</p>}
        <Table
          columns={["Invoice", "For", "Amount", "Due", "Status", ""]}
          rows={(invoices.data ?? []).map((inv) => [
            inv.invoiceNo,
            (plans.data ?? []).find((p) => p.id === inv.feePlanId)?.name || "Course fees",
            `₹${inv.amount}`,
            formatDay(inv.dueDate) || "—",
            inv.status,
            inv.status === "PAID" || inv.status === "CANCELLED" || inv.status === "VOID" ? (
              inv.status === "PAID" ? "Paid" : prettyLabel(inv.status)
            ) : (
              <PrimaryButton
                onClick={async () => {
                  setError(null);
                  try {
                    await collectInvoice(inv.id);
                    invoices.reload();
                    payments.reload();
                    receipts.reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Pay now
              </PrimaryButton>
            ),
          ])}
        />
      </Card>
      <Card title="Receipts">
        {(receipts.data ?? []).length === 0 && (payments.data ?? []).length === 0 && (
          <p className="text-sm text-slate-500">No receipts yet.</p>
        )}
        <ul className="space-y-2 text-sm">
          {(receipts.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span>
                {r.receiptNo} — ₹{r.amount}
              </span>
              <button type="button" className="text-sm font-medium text-brand" onClick={() => void openReceipt(r.id)}>
                Download / print
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StaffFees() {
  const plans = useApi<Plan[]>("/api/fee-plans");
  const invoices = useApi<Invoice[]>("/api/invoices");
  const payments = useApi<Payment[]>("/api/payments");
  const receipts = useApi<{ receiptNo: string; amount: number }[]>("/api/receipts");
  const installments = useApi<{ seqNo: number; amount: number; dueDate: string; status: string; studentId?: string }[]>("/api/installments");
  const refunds = useApi<Refund[]>("/api/refunds");
  const students = useApi<Student[]>("/api/students");
  const { user } = useAuth();
  const canApproveRefunds = user?.role === "OWNER";
  const studentName = (id?: string, buyer?: string) =>
    buyer || (students.data ?? []).find((s) => s.id === id)?.fullName || "—";
  const courses = useApi<{ id: string; name: string }[]>("/api/courses");
  const terms = useApi<{ id: string; name: string }[]>("/api/terms");
  const gateway = useApi<{ payments: { provider: string; live: boolean } }>("/api/actions/integrations");
  const ledger = useApi<{ at?: string; type: string; ref?: string; amount: number; status?: string; student?: string }[]>("/api/actions/ledger");
  const recon = useApi<{ paymentId: string; invoiceNo: string; method: string; reference?: string; amount: number; status: string; receiptNo?: string }[]>("/api/actions/reconciliation");
  const finance = useApi<{ collectionPct: number; outstanding: number; collected: number; due: number }>("/api/actions/dashboard?days=0");
  const [error, setError] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [planAmt, setPlanAmt] = useState("50000");
  const [gst, setGst] = useState("18");
  const [inst, setInst] = useState("2");
  const [courseId, setCourseId] = useState("");
  const [planTerm, setPlanTerm] = useState("");
  const [invStudent, setInvStudent] = useState("");
  const [invAmt, setInvAmt] = useState("");
  const [invNo, setInvNo] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [sacCode, setSacCode] = useState("999293");
  const [invGst, setInvGst] = useState("18");
  const [schedPlan, setSchedPlan] = useState("");
  const [schedStudent, setSchedStudent] = useState("");
  const [offInvoice, setOffInvoice] = useState("");
  const [offMethod, setOffMethod] = useState("CASH");
  const [offRef, setOffRef] = useState("");
  const [offAmt, setOffAmt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function downloadBooks(format: string) {
    await run(async () => {
      const pack = await api<{ columns: string[]; rows: Record<string, string | number>[] }>(`/api/actions/accounting-export?format=${format}`);
      const csv = [pack.columns.join(","), ...pack.rows.map((r) => pack.columns.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `accounts-${format}.csv`;
      a.click();
    });
  }

  const live = gateway.data?.payments.live;
  const provider = gateway.data?.payments.provider ?? "demo";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Fees & finance</h1>
        <p className="text-sm text-slate-500">
          Build plans, raise invoices, collect, and approve refunds. Gateway: {prettyLabel(provider)}
          {live ? " — live Razorpay Checkout opens when you Collect or Pay." : " — paste Razorpay keys in Integrations to collect live. Cash, UPI, and cheque can be recorded here without the gateway."}
        </p>
      </div>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Collection %</p>
          <p className="mt-1 text-2xl font-bold text-navy">{finance.data?.collectionPct ?? 0}%</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding</p>
          <p className="mt-1 text-2xl font-bold text-navy">{formatInr(finance.data?.outstanding ?? finance.data?.due ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Collected</p>
          <p className="mt-1 text-2xl font-bold text-navy">{formatInr(finance.data?.collected ?? 0)}</p>
        </div>
      </div>
      <div>
        <button
          type="button"
          className="text-sm text-brand hover:underline"
          onClick={() =>
            run(async () => {
              const rows = await api<Record<string, string | number>[]>("/api/actions/gstr1");
              const headers = ["docType", "invoiceNo", "date", "buyerGstin", "placeOfSupply", "taxable", "cgst", "sgst", "igst", "sac", "hsn"];
              const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "gstr1.csv";
              a.click();
            })
          }
        >
          Download GSTR-1 CSV
        </button>
        <button
          type="button"
          className="ml-4 text-sm text-brand hover:underline"
          onClick={() => void downloadBooks("csv")}
        >
          Download books CSV
        </button>
        <button
          type="button"
          className="ml-4 text-sm text-brand hover:underline"
          onClick={() => void downloadBooks("tally")}
        >
          Tally CSV
        </button>
        <button
          type="button"
          className="ml-4 text-sm text-brand hover:underline"
          onClick={() => void downloadBooks("zoho")}
        >
          Zoho Books CSV
        </button>
        <button
          type="button"
          className="ml-4 text-sm text-brand hover:underline"
          onClick={() =>
            run(async () => {
              const res = await api<{ sent: number }>("/api/actions/dues/remind", { method: "POST", body: "{}" });
              setNotice(`Queued ${res.sent} overdue reminder(s). WhatsApp and email send when those keys are saved in Integrations.`);
            })
          }
        >
          Send overdue reminders
        </button>
      </div>
      <Card title="Create fee plan">
        <FormGrid>
          <Field label="Plan name" value={planName} onChange={setPlanName} />
          <Field label="Total amount" value={planAmt} onChange={setPlanAmt} />
          <Field label="GST %" value={gst} onChange={setGst} />
          <Field label="Installments" value={inst} onChange={setInst} />
          <Select label="Course" value={courseId} onChange={setCourseId} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Term" value={planTerm} onChange={setPlanTerm} options={(terms.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!planName}
            onClick={() =>
              run(async () => {
                await createRecord("/api/fee-plans", {
                  name: planName,
                  totalAmount: Number(planAmt),
                  gstRate: Number(gst),
                  installmentCount: Number(inst),
                  courseId: courseId || null,
                  termId: planTerm || terms.data?.[0]?.id || null,
                  hsn: "9992",
                  sacCode: "999293",
                });
                setPlanName("");
                plans.reload();
              })
            }
          >
            Save plan
          </PrimaryButton>
        </div>
        <ul className="mt-3 text-sm">
          {(plans.data ?? []).map((p) => (
            <li key={p.id}>
              {p.name}: {formatInr(p.totalAmount)}
              {p.gstRate ? ` · GST ${p.gstRate}%` : ""} · {p.installmentCount || 1} installments
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Schedule installments for a student">
        <FormGrid>
          <Select label="Plan" value={schedPlan} onChange={setSchedPlan} options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <Select
            label="Student"
            value={schedStudent}
            onChange={setSchedStudent}
            options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
          />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!schedPlan || !schedStudent}
              onClick={() =>
                run(async () => {
                  await api(`/api/actions/fee-plans/${schedPlan}/schedule/${schedStudent}`, { method: "POST", body: "{}" });
                  invoices.reload();
                  installments.reload();
                })
              }
            >
              Generate invoices
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Raise invoice">
        <FormGrid>
          <Select
            label="Student"
            value={invStudent}
            onChange={setInvStudent}
            options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
          />
          <Field label="Invoice no" value={invNo} onChange={setInvNo} placeholder="Auto if blank" />
          <Field label="Amount (before GST)" value={invAmt} onChange={setInvAmt} />
          <Field label="GST %" value={invGst} onChange={setInvGst} />
          <Field label="Buyer GSTIN" value={buyerGstin} onChange={setBuyerGstin} placeholder="Optional 15-character GSTIN" />
          <Field label="Place of supply (state)" value={placeOfSupply} onChange={setPlaceOfSupply} placeholder="Maharashtra" />
          <Field label="SAC" value={sacCode} onChange={setSacCode} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!invStudent || !invAmt}
              onClick={() =>
                run(async () => {
                  const st = (students.data ?? []).find((s) => s.id === invStudent);
                  await createRecord("/api/invoices", {
                    studentId: invStudent,
                    invoiceNo: invNo || undefined,
                    amount: Number(invAmt),
                    gstRate: Number(invGst),
                    buyerName: st?.fullName,
                    buyerGstin,
                    placeOfSupply,
                    sacCode,
                    paidAmount: 0,
                    status: "DUE",
                    dueDate: new Date().toISOString().slice(0, 10),
                  });
                  setInvAmt("");
                  setInvNo("");
                  invoices.reload();
                })
              }
            >
              Save invoice
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Installments">
        <Table
          empty="No instalments yet. Pick a fee plan and student above, then generate invoices."
          columns={["#", "Student", "Amount", "Due", "Status"]}
          rows={(installments.data ?? []).map((i) => [
            String(i.seqNo),
            studentName(i.studentId),
            formatInr(i.amount),
            i.dueDate,
            prettyLabel(i.status),
          ])}
        />
      </Card>
      <Card title="Invoices & collection">
        <p className="mb-3 text-xs text-slate-500">Tax invoices show GSTIN, SAC 999293, place of supply, and CGST/SGST or IGST. Same-state uses CGST+SGST; other state uses IGST when you set GST state in Integrations.</p>
        <Table
          empty="No invoices yet."
          columns={["Invoice", "Student", "Amount", "Paid", "Tax", "Status", ""]}
          rows={(invoices.data ?? []).map((inv) => [
            inv.invoiceNo,
            studentName(inv.studentId, inv.buyerName),
            formatInr(inv.amount),
            formatInr(inv.paidAmount ?? 0),
            formatInr((inv.cgst ?? 0) + (inv.sgst ?? 0) + (inv.igst ?? 0)),
            prettyLabel(inv.status),
            <span key={inv.id} className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-sm text-brand hover:underline"
                onClick={() =>
                  run(async () => {
                    const rec = await api<{
                      invoiceNo: string;
                      instituteName?: string;
                      instituteGstin?: string;
                      instituteAddress?: string;
                      buyerName?: string;
                      buyerGstin?: string;
                      placeOfSupply?: string;
                      sacCode?: string;
                      hsn?: string;
                      amount: number;
                      taxAmount?: number;
                      cgst?: number;
                      sgst?: number;
                      igst?: number;
                      gstRate?: number;
                      dueDate?: string;
                    }>(`/api/actions/invoices/${inv.id}/tax`);
                    const win = window.open("", "_blank");
                    if (!win) throw new Error("Allow pop-ups to print the tax invoice.");
                    win.document.write(`<!doctype html><html><head><title>${escHtml(rec.invoiceNo)}</title>
                      <style>body{font-family:sans-serif;padding:32px;color:#071a33}h1{margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #cbd5e1;padding:8px;text-align:left}</style></head>
                      <body>
                        <h1>Tax invoice</h1>
                        <p>${escHtml(rec.instituteName || "")}</p>
                        ${rec.instituteGstin ? `<p>GSTIN ${escHtml(rec.instituteGstin)}</p>` : ""}
                        ${rec.instituteAddress ? `<p>${escHtml(rec.instituteAddress)}</p>` : ""}
                        <p>Invoice ${escHtml(rec.invoiceNo)}</p>
                        <p>Bill to ${escHtml(rec.buyerName || "")}${rec.buyerGstin ? ` · GSTIN ${escHtml(rec.buyerGstin)}` : ""}</p>
                        <p>Place of supply ${escHtml(rec.placeOfSupply || "—")} · SAC ${escHtml(rec.sacCode || "999293")} · HSN ${escHtml(rec.hsn || "9992")}</p>
                        <table><tr><th>Taxable</th><th>GST ${escHtml(rec.gstRate ?? 0)}%</th><th>CGST</th><th>SGST</th><th>IGST</th></tr>
                        <tr><td>₹${escHtml(rec.amount)}</td><td>₹${escHtml(rec.taxAmount ?? 0)}</td><td>₹${escHtml(rec.cgst ?? 0)}</td><td>₹${escHtml(rec.sgst ?? 0)}</td><td>₹${escHtml(rec.igst ?? 0)}</td></tr></table>
                        <script>window.print()<\/script>
                      </body></html>`);
                    win.document.close();
                  })
                }
              >
                Print GST invoice
              </button>
              {inv.status !== "PAID" && inv.status !== "CANCELLED" && (
                <>
                  <PrimaryButton
                    onClick={() =>
                      run(async () => {
                        await collectInvoice(inv.id);
                        invoices.reload();
                        payments.reload();
                        receipts.reload();
                        ledger.reload();
                        recon.reload();
                      })
                    }
                  >
                    Collect (Razorpay / demo)
                  </PrimaryButton>
                  <button
                    type="button"
                    className="text-sm text-brand hover:underline"
                    onClick={() =>
                      run(async () => {
                        await api(`/api/actions/invoices/${inv.id}/remind`, { method: "POST", body: "{}" });
                        setNotice(`Reminder queued for ${inv.invoiceNo}.`);
                      })
                    }
                  >
                    Remind
                  </button>
                </>
              )}
            </span>,
          ])}
        />
      </Card>
      <Card title="Record cash / cheque / UPI (no gateway)">
        <p className="mb-3 text-xs text-slate-500">Use this when the student already paid in the office. Razorpay is not opened.</p>
        <FormGrid>
          <Select
            label="Invoice"
            value={offInvoice}
            onChange={setOffInvoice}
            options={(invoices.data ?? [])
              .filter((inv) => inv.status !== "PAID" && inv.status !== "CANCELLED")
              .map((inv) => ({ value: inv.id, label: `${inv.invoiceNo} · ₹${inv.amount}` }))}
          />
          <Select
            label="Method"
            value={offMethod}
            onChange={setOffMethod}
            options={[
              { value: "CASH", label: "Cash" },
              { value: "CHEQUE", label: "Cheque" },
              { value: "UPI_OFFLINE", label: "UPI (collected in person)" },
              { value: "BANK", label: "Bank / NEFT" },
            ]}
            allowEmpty={false}
          />
          <Field label="Cheque / UTR / note" value={offRef} onChange={setOffRef} placeholder="Optional reference" />
          <Field label="Amount (blank = balance)" value={offAmt} onChange={setOffAmt} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!offInvoice}
              onClick={() =>
                run(async () => {
                  await collectInvoice(offInvoice, { method: offMethod, amount: offAmt || undefined, reference: offRef || undefined });
                  setOffAmt("");
                  setOffRef("");
                  invoices.reload();
                  payments.reload();
                  receipts.reload();
                  ledger.reload();
                  recon.reload();
                  setNotice("Offline payment recorded.");
                })
              }
            >
              Record payment
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Reconciliation">
        <Table
          empty="No pending gateway orders or offline receipts."
          columns={["Invoice", "Method", "Reference", "Amount", "Status"]}
          rows={(recon.data ?? []).map((r) => [r.invoiceNo, prettyLabel(r.method), r.reference || r.receiptNo || "—", formatInr(r.amount), prettyLabel(r.status)])}
        />
      </Card>
      <Card title="Ledger">
        <Table
          empty="No fee movements yet."
          columns={["When", "Type", "Ref", "Student", "Amount", "Status"]}
          rows={(ledger.data ?? []).slice(0, 40).map((r) => [
            r.at ? formatDay(r.at) : "—",
            prettyLabel(r.type),
            r.ref || "—",
            r.student || "—",
            formatInr(r.amount),
            prettyLabel(r.status || ""),
          ])}
        />
      </Card>
      <Card title="Payments & receipts">
        <Table
          columns={["Ref", "Receipt", "Method", "Amount", "Action"]}
          rows={(payments.data ?? []).map((p) => [
            p.gatewayRef,
            p.receiptNo || "—",
            prettyLabel(p.method),
            formatInr(p.amount),
            p.method === "CREDIT_NOTE" || Number(p.amount) <= 0 ? (
              "—"
            ) : (
              <PrimaryButton
                onClick={() =>
                  run(async () => {
                    if (!window.confirm(`Request a refund of ${formatInr(p.amount)}?`)) return;
                    await api(`/api/actions/payments/${p.id}/refunds`, { method: "POST", body: JSON.stringify({ reason: "Student request" }) });
                    refunds.reload();
                    ledger.reload();
                  })
                }
              >
                Request refund
              </PrimaryButton>
            ),
          ])}
        />
      </Card>
      <Card title="Refunds (owner approval)">
        <p className="mb-2 text-xs text-slate-500">Approve issues a credit note and updates the invoice ledger. Razorpay refunds run when the original payment id starts with pay_.</p>
        <ul className="space-y-2 text-sm">
          {(refunds.data ?? []).map((r) => (
            <li key={r.id}>
              {formatInr(r.amount)} — {prettyLabel(r.status)} {r.reason ? `· ${r.reason}` : ""}
              {r.creditNoteNo ? ` · Credit note ${r.creditNoteNo}` : ""}
              {r.gatewayRefundRef ? " · refunded on Razorpay" : ""}
              {r.status === "REQUESTED" && canApproveRefunds && (
                <span className="ml-2 space-x-2">
                  <PrimaryButton
                    onClick={() =>
                      run(async () => {
                        await api(`/api/actions/refunds/${r.id}/decide`, { method: "POST", body: JSON.stringify({ approve: "true" }) });
                        refunds.reload();
                        invoices.reload();
                        payments.reload();
                        ledger.reload();
                      })
                    }
                  >
                    Approve
                  </PrimaryButton>
                  <button
                    type="button"
                    className="text-sm text-red-600"
                    onClick={() =>
                      run(async () => {
                        await api(`/api/actions/refunds/${r.id}/decide`, { method: "POST", body: JSON.stringify({ approve: "false" }) });
                        refunds.reload();
                      })
                    }
                  >
                    Reject
                  </button>
                </span>
              )}
              {r.status === "REQUESTED" && !canApproveRefunds && (
                <span className="ml-2 text-xs text-slate-500">Waiting for owner approval</span>
              )}
              {r.creditNoteNo && (
                <button
                  type="button"
                  className="ml-2 text-sm text-brand hover:underline"
                  onClick={() =>
                    run(async () => {
                      const rec = await api<{
                        creditNoteNo: string;
                        amount: number;
                        reason?: string;
                        invoiceNo?: string;
                        instituteName?: string;
                        instituteGstin?: string;
                        buyerName?: string;
                        buyerGstin?: string;
                        cgst?: number;
                        sgst?: number;
                        igst?: number;
                      }>(`/api/actions/refunds/${r.id}/credit-note`);
                      const win = window.open("", "_blank");
                      if (!win) throw new Error("Allow pop-ups to print the credit note.");
                      win.document.write(`<!doctype html><html><head><title>${escHtml(rec.creditNoteNo)}</title>
                        <style>body{font-family:sans-serif;padding:32px;color:#071a33}h1{margin:0 0 8px}table{border-collapse:collapse;margin-top:16px}td,th{border:1px solid #ccc;padding:6px 10px;text-align:right}</style></head>
                        <body>
                          <h1>Credit note ${escHtml(rec.creditNoteNo)}</h1>
                          <p>${escHtml(rec.instituteName || "")}${rec.instituteGstin ? ` · GSTIN ${escHtml(rec.instituteGstin)}` : ""}</p>
                          <p>Student ${escHtml(rec.buyerName || "")}${rec.buyerGstin ? ` · GSTIN ${escHtml(rec.buyerGstin)}` : ""}</p>
                          <p>Against invoice ${escHtml(rec.invoiceNo || "—")}</p>
                          <table><tr><th>Amount</th><th>CGST</th><th>SGST</th><th>IGST</th></tr>
                          <tr><td>₹${escHtml(rec.amount)}</td><td>₹${escHtml(rec.cgst ?? 0)}</td><td>₹${escHtml(rec.sgst ?? 0)}</td><td>₹${escHtml(rec.igst ?? 0)}</td></tr></table>
                          ${rec.reason ? `<p>Reason ${escHtml(rec.reason)}</p>` : ""}
                          <script>window.print()<\/script>
                        </body></html>`);
                      win.document.close();
                    })
                  }
                >
                  Print credit note
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
