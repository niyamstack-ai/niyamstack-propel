import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, formatDay, useApi } from "../ui";

type Invoice = { id: string; invoiceNo: string; amount: number; paidAmount?: number; status: string; cgst?: number; sgst?: number; dueDate?: string; feePlanId?: string };
type Payment = { id: string; gatewayRef: string; method: string; amount: number; receiptNo?: string };
type Refund = { id: string; amount: number; status: string; reason?: string };
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
                    await api(`/api/actions/invoices/${inv.id}/collect`, { method: "POST", body: JSON.stringify({ method: "UPI" }) });
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
          Build plans, raise invoices, collect, issue receipts, and approve refunds. Gateway: {provider}
          {live ? " (live credentials configured)" : " (demo adapter — not a live capture)"}.
        </p>
      </div>
      <ErrorText error={error} />
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
              {p.name}: ₹{p.totalAmount}
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
          <Field label="Amount" value={invAmt} onChange={setInvAmt} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!invStudent || !invAmt}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/invoices", {
                    studentId: invStudent,
                    invoiceNo: invNo || `INV-${Date.now().toString().slice(-8)}`,
                    amount: Number(invAmt),
                    taxAmount: 0,
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
          columns={["#", "Amount", "Due", "Status"]}
          rows={(installments.data ?? []).map((i) => [String(i.seqNo), `₹${i.amount}`, i.dueDate, i.status])}
        />
      </Card>
      <Card title="Invoices & collection">
        <Table
          columns={["Invoice", "Amount", "Paid", "CGST/SGST", "Status", "Action"]}
          rows={(invoices.data ?? []).map((inv) => [
            inv.invoiceNo,
            `₹${inv.amount}`,
            `₹${inv.paidAmount ?? 0}`,
            `₹${inv.cgst ?? 0} / ₹${inv.sgst ?? 0}`,
            inv.status,
            inv.status === "PAID" ? (
              "Settled"
            ) : (
              <PrimaryButton
                onClick={() =>
                  run(async () => {
                    await api(`/api/actions/invoices/${inv.id}/collect`, { method: "POST", body: JSON.stringify({ method: "UPI" }) });
                    invoices.reload();
                    payments.reload();
                    receipts.reload();
                  })
                }
              >
                Collect
              </PrimaryButton>
            ),
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
            `₹${p.amount}`,
            <PrimaryButton
              onClick={() =>
                run(async () => {
                  await api(`/api/actions/payments/${p.id}/refunds`, { method: "POST", body: JSON.stringify({ reason: "Student request" }) });
                  refunds.reload();
                })
              }
            >
              Request refund
            </PrimaryButton>,
          ])}
        />
      </Card>
      <Card title="Refunds (owner approval)">
        <ul className="space-y-2 text-sm">
          {(refunds.data ?? []).map((r) => (
            <li key={r.id}>
              ₹{r.amount} — {r.status} {r.reason ? `· ${r.reason}` : ""}
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
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
