import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { MODULES, PACKS, modulesForPack, type PackId } from "../../packs";
import { hasCap, usePlatformAuth } from "../../platformAuth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, useApi } from "../../ui";

type Institute = {
  id: string;
  name: string;
  slug?: string;
  email?: string;
  accessStatus: string;
  paymentStatus: string;
  packageTier?: string;
  productPack?: string;
  billingCycle?: string;
  dealAmount?: number;
  modulesCsv?: string;
  maxStudents?: number;
  maxCenters?: number;
  couponCode?: string;
  dealNotes?: string;
};

export function PlatformInstituteDetailPage() {
  const { id } = useParams();
  const { user } = usePlatformAuth();
  const rec = useApi<Institute>(`/api/platform/institutes/${id}`);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<null | "paid" | "approve" | "failed" | "suspend" | "restore">(null);
  const canMarkPaid = hasCap(user, "MARK_PAID");
  const canApprove = hasCap(user, "APPROVE");
  const canSuspend = hasCap(user, "SUSPEND");
  const canEditDeal = hasCap(user, "EDIT_DEAL");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState("MONTHLY");
  const [tier, setTier] = useState("STARTER");
  const [pack, setPack] = useState<PackId>("FULL_OPS");
  const [modules, setModules] = useState<string[]>(modulesForPack("FULL_OPS"));
  const [maxStudents, setMaxStudents] = useState("");
  const [maxCenters, setMaxCenters] = useState("");
  const [coupon, setCoupon] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const org = rec.data;
    if (!org) return;
    setAmount(org.dealAmount != null ? String(org.dealAmount) : "");
    setCycle(org.billingCycle || "MONTHLY");
    setTier(org.packageTier || "STARTER");
    setPack((org.productPack as PackId) || "FULL_OPS");
    const csv = org.modulesCsv || modulesForPack(org.productPack || "FULL_OPS").join(",");
    setModules(csv.split(",").map((m) => m.trim()).filter(Boolean));
    setMaxStudents(org.maxStudents != null ? String(org.maxStudents) : "");
    setMaxCenters(org.maxCenters != null ? String(org.maxCenters) : "");
    setCoupon(org.couponCode || "");
    setNotes(org.dealNotes || "");
  }, [rec.data]);

  async function saveDeal(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/platform/institutes/${id}/deal`, {
        method: "PUT",
        body: JSON.stringify({
          dealAmount: amount.trim() ? Number(amount) : null,
          billingCycle: cycle || "MONTHLY",
          packageTier: tier || "STARTER",
          productPack: pack,
          modulesCsv: modules.join(","),
          maxStudents: maxStudents.trim() ? Number(maxStudents) : null,
          maxCenters: maxCenters.trim() ? Number(maxCenters) : null,
          couponCode: coupon,
          dealNotes: notes,
        }),
      });
      rec.reload();
      setNotice("Deal saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function action(path: string, kind: NonNullable<typeof acting>, ok: string) {
    setActing(kind);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/platform/institutes/${id}/${path}`, { method: "POST" });
      rec.reload();
      setNotice(ok);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(null);
    }
  }

  const org = rec.data;
  const paid = org?.paymentStatus === "PAID";
  const active = org?.accessStatus === "ACTIVE";
  const suspended = org?.accessStatus === "SUSPENDED";

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link className="text-brand" to="/platform/institutes">
          ← Institutes
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-bold text-navy">{org?.name || "Institute"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {org?.email} · {org?.slug || "no slug"} · access {org?.accessStatus} · payment {org?.paymentStatus}
        </p>
      </div>
      {rec.error && <p className="text-sm text-red-600">{rec.error}</p>}
      <ErrorText error={error} />
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {(canMarkPaid || canApprove || canSuspend) && (
      <Card title="Lifecycle">
        <div className="flex flex-wrap gap-2">
          {canMarkPaid && (
            <PrimaryButton disabled={saving || !!acting} onClick={() => action("mark-paid", "paid", paid ? "Already marked paid." : "Payment marked received. You can now approve.")}>
              {acting === "paid" ? "Marking paid…" : "Mark paid"}
            </PrimaryButton>
          )}
          {canApprove && (
            <PrimaryButton
              disabled={saving || !!acting || !paid}
              onClick={() => action("approve", "approve", active ? "Already active." : "Institute activated.")}
            >
              {acting === "approve" ? "Approving…" : "Approve / activate"}
            </PrimaryButton>
          )}
          {canMarkPaid && (
            <button type="button" className="rounded-full border border-line px-4 py-2 text-sm" disabled={saving || !!acting} onClick={() => action("mark-failed", "failed", "Payment marked failed.")}>
              {acting === "failed" ? "Updating…" : "Mark payment failed"}
            </button>
          )}
          {canSuspend && (
            suspended ? (
              <button
                type="button"
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-800"
                disabled={saving || !!acting}
                onClick={() => action("restore", "restore", "Institute restored.")}
              >
                {acting === "restore" ? "Restoring…" : "Restore"}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-700"
                disabled={saving || !!acting}
                onClick={() => action("suspend", "suspend", "Institute suspended.")}
              >
                {acting === "suspend" ? "Suspending…" : "Suspend"}
              </button>
            )
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {paid ? "Payment is already marked received." : "Mark paid first, then approve."} Student fee collect uses Razorpay keys on the institute Integrations page.
        </p>
      </Card>
      )}
      {canEditDeal && (
      <Card title="Customer deal">
        <form className="space-y-4" onSubmit={saveDeal}>
          <FormGrid>
            <Field label="Price (₹)" value={amount} onChange={setAmount} />
            <Select
              label="Billing cycle"
              value={cycle}
              onChange={setCycle}
              options={[
                { value: "MONTHLY", label: "Monthly" },
                { value: "QUARTERLY", label: "Quarterly" },
                { value: "YEARLY", label: "Yearly" },
              ]}
            />
            <Select
              label="Product pack"
              value={pack}
              onChange={(v) => {
                const next = v as PackId;
                setPack(next);
                setModules(modulesForPack(next));
              }}
              options={PACKS.map((p) => ({ value: p.id, label: p.name }))}
              allowEmpty={false}
            />
            <Select
              label="Catalog tier"
              value={tier}
              onChange={setTier}
              options={[
                { value: "STARTER", label: "Starter" },
                { value: "GROWTH", label: "Growth" },
                { value: "ENTERPRISE", label: "Enterprise" },
              ]}
            />
            <Field label="Coupon (optional)" value={coupon} onChange={setCoupon} />
            <Field label="Max students" value={maxStudents} onChange={setMaxStudents} />
            <Field label="Max centers" value={maxCenters} onChange={setMaxCenters} />
          </FormGrid>
          <div>
            <p className="text-sm text-slate-600">Modules for this institute</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {MODULES.map((m) => {
                const on = modules.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`rounded-full px-3 py-1 text-sm ${on ? "bg-navy text-white" : "bg-mist text-navy"}`}
                    onClick={() => setModules(on ? modules.filter((x) => x !== m.id) : [...modules, m.id])}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block text-sm">
            <span className="text-slate-600">Notes</span>
            <textarea className="mt-1 w-full rounded-lg border border-line px-3 py-2" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={saving || !!acting}>
            {saving ? "Saving…" : "Save deal"}
          </button>
        </form>
      </Card>
      )}
    </div>
  );
}
