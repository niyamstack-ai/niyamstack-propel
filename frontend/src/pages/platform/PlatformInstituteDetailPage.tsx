import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api";
import { formatInr } from "../../labels";
import { MODULES, PACKS, modulesForPack, type PackId } from "../../packs";
import { hasCap, usePlatformAuth } from "../../platformAuth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, useApi, PhoneField, phoneForApi } from "../../ui";

type Institute = {
  id: string;
  name: string;
  slug?: string;
  email?: string;
  phone?: string;
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
  platformFeePercent?: number;
  platformFeeMode?: string;
  payoutMode?: string;
  hasBank?: boolean;
  graceEndsAt?: string;
  inGrace?: boolean;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  ownerEmailVerified?: boolean;
  ownerPhoneVerified?: boolean;
  studentCount?: number;
  studentsRegisteredToday?: number;
  transactionCount?: number;
  transactionTotal?: number;
  transactionsTodayCount?: number;
  transactionsTodayAmount?: number;
  createdAt?: string;
};

export function PlatformInstituteDetailPage() {
  const { id } = useParams();
  const { user } = usePlatformAuth();
  const rec = useApi<Institute>(`/api/platform/institutes/${id}`);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<null | "paid" | "approve" | "failed" | "suspend" | "restore" | "trash" | "owner">(null);
  const canMarkPaid = hasCap(user, "MARK_PAID");
  const canApprove = hasCap(user, "APPROVE");
  const canSuspend = hasCap(user, "SUSPEND");
  const canEditDeal = hasCap(user, "EDIT_DEAL");
  const canView = hasCap(user, "VIEW_INSTITUTES");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState("MONTHLY");
  const [tier, setTier] = useState("STARTER");
  const [pack, setPack] = useState<PackId>("FULL_OPS");
  const [modules, setModules] = useState<string[]>(modulesForPack("FULL_OPS"));
  const [maxStudents, setMaxStudents] = useState("");
  const [maxCenters, setMaxCenters] = useState("");
  const [coupon, setCoupon] = useState("");
  const [notes, setNotes] = useState("");
  const [feePct, setFeePct] = useState("5");
  const [feeMode, setFeeMode] = useState("ABSORB");
  const [payoutMode, setPayoutMode] = useState("INHERIT");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");

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
    const pct = org.platformFeePercent != null ? Number(org.platformFeePercent) : 0.05;
    setFeePct(String(pct <= 1 ? Math.round(pct * 1000) / 10 : pct));
    setFeeMode(org.platformFeeMode || "ABSORB");
    setPayoutMode(org.payoutMode || "INHERIT");
    setOwnerName(org.ownerName || "");
    setOwnerEmail(org.ownerEmail || org.email || "");
    setOwnerPhone(org.ownerPhone || org.phone || "");
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
          platformFeePercent: feePct.trim() ? Number(feePct) : 5,
          platformFeeMode: feeMode,
          payoutMode,
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

  async function saveOwner() {
    setActing("owner");
    setError(null);
    setNotice(null);
    try {
      await api(`/api/platform/institutes/${id}/owner-contact`, {
        method: "PUT",
        body: JSON.stringify({ fullName: ownerName, email: ownerEmail, phone: phoneForApi(ownerPhone) }),
      });
      rec.reload();
      setNotice("Owner login contact updated. Ask them to verify email/phone after next login if needed.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActing(null);
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
  const trashed = org?.accessStatus === "TRASHED";

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
          {org?.email || "—"} · {org?.phone ? `+91 ${org.phone}` : "no phone"} · {org?.slug || "no slug"}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Access: <span className="font-medium text-navy">{prettyAccess(org?.accessStatus)}</span>
          {" · "}
          Payment: <span className="font-medium text-navy">{prettyPayment(org?.paymentStatus)}</span>
          {org?.hasBank != null ? (
            <>
              {" · "}
              Bank: <span className="font-medium text-navy">{org.hasBank ? "On file" : "Missing"}</span>
            </>
          ) : null}
          {org?.inGrace ? (
            <>
              {" · "}
              <span className="font-medium text-amber-800">In grace until {org.graceEndsAt ? new Date(org.graceEndsAt).toLocaleString("en-IN") : "—"}</span>
            </>
          ) : null}
        </p>
      </div>
      {rec.error && <p className="text-sm text-red-600">{rec.error}</p>}
      <ErrorText error={error} />
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={String(org?.studentCount ?? "—")} hint={`${org?.studentsRegisteredToday ?? 0} registered today`} />
        <Stat label="Captured payments" value={formatInr(org?.transactionTotal)} hint={`${org?.transactionCount ?? 0} transactions`} />
        <Stat label="Today’s GMV" value={formatInr(org?.transactionsTodayAmount)} hint={`${org?.transactionsTodayCount ?? 0} today`} />
        <Stat label="Owner" value={org?.ownerName || "—"} hint={org?.ownerPhone ? `+91 ${org.ownerPhone}` : org?.ownerEmail || "No owner linked"} />
      </div>

      {canView && (
        <Card title="Owner login (for support recovery)">
          <p className="mb-3 text-sm text-slate-500">
            Shown when an owner forgets which mobile they used. Updating here changes their login email/phone (they may need to re-verify).
          </p>
          <div className="space-y-3">
            <FormGrid>
              <Field label="Owner name" value={ownerName} onChange={setOwnerName} />
              <Field label="Login email" value={ownerEmail} onChange={setOwnerEmail} type="email" />
              <PhoneField label="Login mobile" value={ownerPhone} onChange={setOwnerPhone} placeholder="10-digit" />
            </FormGrid>
            <p className="text-xs text-slate-500">
              Verified: email {org?.ownerEmailVerified ? "yes" : "no"} · phone {org?.ownerPhoneVerified ? "yes" : "no"}
            </p>
            <PrimaryButton disabled={!!acting || saving} onClick={() => void saveOwner()}>
              {acting === "owner" ? "Saving…" : "Save owner contact"}
            </PrimaryButton>
          </div>
        </Card>
      )}

      {(canMarkPaid || canApprove || canSuspend) && (
      <Card title="Lifecycle">
        <p className="mb-3 text-sm text-slate-500">
          DEMO = browse-only until paid. PENDING_APPROVAL = paid, waiting for Approve. ACTIVE = live. SUSPENDED = locked. Trash = soft-deleted (kept for legal/support).
        </p>
        <div className="flex flex-wrap gap-2">
          {canMarkPaid && !trashed && (
            <PrimaryButton disabled={saving || !!acting} onClick={() => action("mark-paid", "paid", paid ? "Already marked paid." : "Payment marked received. You can now approve.")}>
              {acting === "paid" ? "Marking paid…" : "Mark paid"}
            </PrimaryButton>
          )}
          {canApprove && !trashed && (
            <PrimaryButton
              disabled={saving || !!acting || !paid}
              onClick={() => action("approve", "approve", active ? "Already active." : "Institute activated.")}
            >
              {acting === "approve" ? "Approving…" : "Approve / activate"}
            </PrimaryButton>
          )}
          {canMarkPaid && !trashed && (
            <button type="button" className="rounded-full border border-line px-4 py-2 text-sm" disabled={saving || !!acting} onClick={() => action("mark-failed", "failed", "Payment marked failed.")}>
              {acting === "failed" ? "Updating…" : "Mark payment failed"}
            </button>
          )}
          {canSuspend && (
            suspended || trashed ? (
              <button
                type="button"
                className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-800"
                disabled={saving || !!acting}
                onClick={() => action("restore", "restore", trashed ? "Restored from trash." : "Institute restored.")}
              >
                {acting === "restore" ? "Restoring…" : trashed ? "Restore from trash" : "Restore"}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-700"
                disabled={saving || !!acting}
                onClick={() => {
                  if (!window.confirm("Suspend this institute? Users will lose access until restored.")) return;
                  action("suspend", "suspend", "Institute suspended.");
                }}
              >
                {acting === "suspend" ? "Suspending…" : "Suspend"}
              </button>
            )
          )}
          {canSuspend && !trashed && (
            <button
              type="button"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
              disabled={saving || !!acting}
              onClick={() => {
                if (!window.confirm("Move this institute to trash? It stays in the system for legal/support and can be restored.")) return;
                action("trash", "trash", "Moved to trash.");
              }}
            >
              {acting === "trash" ? "Moving…" : "Move to trash"}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {paid ? "Payment is already marked received." : "Mark paid first, then approve."} Student fee collect uses the Razorpay keys saved under Platform → Settings.
        </p>
      </Card>
      )}
      {canEditDeal && !trashed && (
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
            <Field label="Platform fee %" value={feePct} onChange={setFeePct} placeholder="5 = 5%" />
            <Select
              label="Fee mode"
              value={feeMode}
              onChange={setFeeMode}
              options={[
                { value: "ABSORB", label: "Absorb (default)" },
                { value: "PASS_STUDENT", label: "Pass to student" },
              ]}
              allowEmpty={false}
            />
            <Select
              label="Payout mode"
              value={payoutMode}
              onChange={setPayoutMode}
              options={[
                { value: "INHERIT", label: "Inherit global" },
                { value: "MANUAL", label: "Manual" },
                { value: "AUTOMATIC", label: "Automatic" },
              ]}
              allowEmpty={false}
            />
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-navy">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function prettyAccess(status?: string) {
  switch ((status || "").toUpperCase()) {
    case "DEMO":
      return "Demo (browse-only)";
    case "PENDING_APPROVAL":
      return "Pending approval";
    case "ACTIVE":
      return "Active";
    case "SUSPENDED":
      return "Suspended";
    case "TRASHED":
      return "Trash";
    default:
      return status || "—";
  }
}

function prettyPayment(status?: string) {
  switch ((status || "").toUpperCase()) {
    case "UNPAID":
      return "Unpaid";
    case "PAID":
      return "Paid";
    case "FAILED":
      return "Failed";
    default:
      return status || "—";
  }
}
