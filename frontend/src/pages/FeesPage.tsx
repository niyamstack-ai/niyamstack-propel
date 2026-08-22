import { useState } from "react";
import { api } from "../api";
import { collectInvoice } from "../razorpay";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, formatDay, formatInr, useApi } from "../ui";

type Invoice = { id: string; invoiceNo: string; amount: number; paidAmount?: number; status: string; cgst?: number; sgst?: number; igst?: number; dueDate?: string; feePlanId?: string };
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
            inv.status === "PAID" ? (
              "Paid"
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
  const installments = useApi<{ seqNo: number; amount: number; dueDate: string; status: string }[]>("/api/installments");
  const refunds = useApi<Refund[]>("/api/refunds");
  const students = useApi<Student[]>("/api/students");
  const courses = useApi<{ id: string; name: string }[]>("/api/courses");
  const gateway = useApi<{ payments: { provider: string; live: boolean } }>("/api/actions/integrations");
  const [error, setError] = useState<string | null>(null);
  const [planName, setPlanName] = useState("");
  const [planAmt, setPlanAmt] = useState("50000");
  const [gst, setGst] = useState("18");
  const [inst, setInst] = useState("2");
  const [courseId, setCourseId] = useState("");
  const [invStudent, setInvStudent] = useState("");
  const [invAmt, setInvAmt] = useState("");
  const [invNo, setInvNo] = useState("");
  const [buyerGstin, setBuyerGstin] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [sacCode, setSacCode] = useState("999293");
  const [invGst, setInvGst] = useState("18");
  const [schedPlan, setSchedPlan] = useState("");
  const [schedStudent, setSchedStudent] = useState("");

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const live = gateway.data?.payments.live;
  const provider = gateway.data?.payments.provider ?? "demo";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Fees & finance</h1>
        <p className="text-sm text-slate-500">
          Build plans, raise invoices, collect, and approve refunds. Gateway: {prettyLabel(provider)}
          {live ? " — live Razorpay Checkout opens when you Collect or Pay." : " — collections are recorded here until you paste Razorpay keys in Integrations."}
        </p>
      </div>
      <ErrorText error={error} />
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
      </div>
      <Card title="Create fee plan">
        <FormGrid>
          <Field label="Plan name" value={planName} onChange={setPlanName} />
          <Field label="Total amount" value={planAmt} onChange={setPlanAmt} />
          <Field label="GST %" value={gst} onChange={setGst} />
          <Field label="Installments" value={inst} onChange={setInst} />
          <Select label="Course" value={courseId} onChange={setCourseId} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
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
          <Field label="Buyer GSTIN" value={buyerGstin} onChange={setBuyerGstin} placeholder="Optional" />
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
          columns={["#", "Amount", "Due", "Status"]}
          rows={(installments.data ?? []).map((i) => [String(i.seqNo), formatInr(i.amount), i.dueDate, prettyLabel(i.status)])}
        />
      </Card>
      <Card title="Invoices & collection">
        <p className="mb-3 text-xs text-slate-500">Tax invoices show GSTIN, SAC 999293, place of supply, and CGST/SGST or IGST. Same-state uses CGST+SGST; other state uses IGST when you set GST state in Integrations.</p>
        <Table
          empty="No invoices yet."
          columns={["Invoice", "Amount", "Paid", "Tax", "Status", ""]}
          rows={(invoices.data ?? []).map((inv) => [
            inv.invoiceNo,
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
              {inv.status !== "PAID" && (
                <PrimaryButton
                  onClick={() =>
                    run(async () => {
                      await collectInvoice(inv.id);
                      invoices.reload();
                      payments.reload();
                      receipts.reload();
                    })
                  }
                >
                  Collect
                </PrimaryButton>
              )}
            </span>,
          ])}
        />
      </Card>
      <Card title="Payments & receipts">
        <Table
          columns={["Ref", "Receipt", "Method", "Amount", "Action"]}
          rows={(payments.data ?? []).map((p) => [
            p.gatewayRef,
            p.receiptNo || "—",
            p.method,
            formatInr(p.amount),
            p.method === "UPI" || p.method === "CARD" ? (
              <PrimaryButton
                onClick={() =>
                  run(async () => {
                    if (!window.confirm(`Request a refund of ${formatInr(p.amount)}?`)) return;
                    await api(`/api/actions/payments/${p.id}/refunds`, { method: "POST", body: JSON.stringify({ reason: "Student request" }) });
                    refunds.reload();
                  })
                }
              >
                Request refund
              </PrimaryButton>
            ) : (
              "—"
            ),
          ])}
        />
      </Card>
      <Card title="Refunds (owner approval)">
        <ul className="space-y-2 text-sm">
          {(refunds.data ?? []).map((r) => (
            <li key={r.id}>
              {formatInr(r.amount)} — {prettyLabel(r.status)} {r.reason ? `· ${r.reason}` : ""}
              {r.creditNoteNo ? ` · Credit note ${r.creditNoteNo}` : ""}
              {r.gatewayRefundRef ? " · refunded on Razorpay" : ""}
              {r.status === "REQUESTED" && (
                <span className="ml-2 space-x-2">
                  <PrimaryButton
                    onClick={() =>
                      run(async () => {
                        await api(`/api/actions/refunds/${r.id}/decide`, { method: "POST", body: JSON.stringify({ approve: "true" }) });
                        refunds.reload();
                        invoices.reload();
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
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
