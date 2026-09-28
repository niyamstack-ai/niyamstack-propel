import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { hasCap, usePlatformAuth } from "../../platformAuth";
import { Card, ErrorText, Field, useApi } from "../../ui";

type Cap = { id: string; label: string };
type Role = { id: string; name: string; capabilities: string[] };
type Catalog = { capabilities: Cap[]; roles: Role[] };
type PaymentGateway = {
  razorpay?: boolean;
  webhook?: boolean;
  keyIdMasked?: string;
  mode?: string;
  webhookPath?: string;
};

export function PlatformSettingsPage() {
  const { user } = usePlatformAuth();
  const canManageRights = hasCap(user, "MANAGE_RIGHTS");
  const catalog = useApi<Catalog>(canManageRights ? "/api/platform/roles" : "");
  const paymentGateway = useApi<PaymentGateway>(canManageRights ? "/api/platform/payment-gateway" : "");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [payKeys, setPayKeys] = useState({
    razorpayKeyId: "",
    razorpayKeySecret: "",
    razorpayWebhookSecret: "",
  });
  const payoutMode = useApi<{ payoutMode: string }>(canManageRights ? "/api/platform/settlement/payout-mode" : "");
  const settlement = useApi<
    { organizationId: string; name: string; grossAmount: number; platformFeeAmount: number; netToInstitute: number; pendingPayout: number; hasBank: boolean }[]
  >(canManageRights ? "/api/platform/settlement/report" : "");
  const [payoutBusy, setPayoutBusy] = useState(false);

  async function createRole(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api("/api/platform/roles", {
        method: "POST",
        body: JSON.stringify({ name: newName, capabilities: ["VIEW_DASHBOARD"] }),
      });
      setNewName("");
      catalog.reload();
      setDone(`Role “${newName}” created. Tick the rights below, then save that role.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRole(role: Role, capabilities: string[], name = role.name) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api(`/api/platform/roles/${role.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, capabilities }),
      });
      catalog.reload();
      setDone(`Rights saved for ${name}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeRole(role: Role) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api(`/api/platform/roles/${role.id}`, { method: "DELETE" });
      catalog.reload();
      setDone(`Removed role ${role.name}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api("/api/platform/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword: next }),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone("Password updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const caps = catalog.data?.capabilities ?? [];
  const roles = catalog.data?.roles ?? [];
  const pay = paymentGateway.data;
  const modeLabel =
    pay?.mode === "test" ? "Test mode" : pay?.mode === "live" ? "Live mode" : pay?.razorpay ? "Configured" : "Not configured";

  async function savePaymentGateway(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api("/api/platform/payment-gateway", {
        method: "PUT",
        body: JSON.stringify(payKeys),
      });
      setPayKeys({ razorpayKeyId: "", razorpayKeySecret: "", razorpayWebhookSecret: "" });
      paymentGateway.reload();
      setDone("Razorpay keys saved. All institutes on this portal will use these keys.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          {canManageRights ? (
            <>
              Create role names here (Sales, HR, Support, or any name you want) and tick what that role can do. Then on{" "}
              {hasCap(user, "MANAGE_EMPLOYEES") ? (
                <Link className="font-medium text-brand" to="/platform/employees">
                  Employee management
                </Link>
              ) : (
                "Employee management"
              )}{" "}
              assign one or more of those roles to a person. Payment gateway keys below apply to every institute on this portal.
            </>
          ) : (
            "Change the password for this Niyamstack staff account."
          )}
        </p>
      </div>
      {catalog.error && <p className="text-sm text-red-600">{catalog.error}</p>}
      {paymentGateway.error && <p className="text-sm text-red-600">{paymentGateway.error}</p>}
      <ErrorText error={error} />
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
      {canManageRights && (
        <>
          <Card title="Payments (Razorpay)">
            <p className="text-sm text-slate-500">
              {pay?.razorpay
                ? `${modeLabel} via Niyamstack Razorpay${pay.keyIdMasked ? ` (${pay.keyIdMasked})` : ""}. Fee collect and storefront checkout use these keys for every institute.`
                : "Paste the Razorpay keys for this portal. Use test keys on testing.propel and live keys on production."}
            </p>
            <form className="mt-3 max-w-lg space-y-3" onSubmit={savePaymentGateway}>
              <Field
                label="Key ID"
                value={payKeys.razorpayKeyId}
                onChange={(v) => setPayKeys((p) => ({ ...p, razorpayKeyId: v }))}
                placeholder={pay?.razorpay ? "Saved — paste to replace" : "rzp_test_… or rzp_live_…"}
              />
              <Field
                label="Key secret"
                value={payKeys.razorpayKeySecret}
                onChange={(v) => setPayKeys((p) => ({ ...p, razorpayKeySecret: v }))}
                type="password"
                placeholder={pay?.razorpay ? "Saved — paste to replace" : "Key secret"}
              />
              <Field
                label="Webhook secret (optional)"
                value={payKeys.razorpayWebhookSecret}
                onChange={(v) => setPayKeys((p) => ({ ...p, razorpayWebhookSecret: v }))}
                type="password"
                placeholder={pay?.webhook ? "Saved — paste to replace" : "From Razorpay dashboard"}
              />
              <p className="text-xs text-slate-500">
                Webhook URL: {typeof window !== "undefined" ? `${window.location.origin}${pay?.webhookPath || "/api/public/payments/razorpay"}` : pay?.webhookPath || "/api/public/payments/razorpay"}
              </p>
              <button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>
                {busy ? "Saving…" : "Save payment keys"}
              </button>
            </form>
          </Card>
          <Card title="Institute settlements">
            <p className="text-sm text-slate-500">
              Default platform fee is 5% (editable per institute on the institute deal). Weekly batches pay institutes after deduction. Automatic queues READY_AUTO batches for RazorpayX later.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-navy">
                Global payout mode: <span className="font-semibold">{payoutMode.data?.payoutMode || "MANUAL"}</span>
              </p>
              <button
                type="button"
                className="rounded-full border border-line px-3 py-1.5 text-sm"
                disabled={payoutBusy}
                onClick={() =>
                  void (async () => {
                    setPayoutBusy(true);
                    try {
                      const next = payoutMode.data?.payoutMode === "AUTOMATIC" ? "MANUAL" : "AUTOMATIC";
                      await api("/api/platform/settlement/payout-mode", { method: "PUT", body: JSON.stringify({ payoutMode: next }) });
                      payoutMode.reload();
                      setDone(`Payout mode set to ${next}.`);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setPayoutBusy(false);
                    }
                  })()
                }
              >
                Switch to {payoutMode.data?.payoutMode === "AUTOMATIC" ? "MANUAL" : "AUTOMATIC"}
              </button>
              <button
                type="button"
                className="rounded-full bg-navy px-3 py-1.5 text-sm text-white"
                disabled={payoutBusy}
                onClick={() =>
                  void (async () => {
                    setPayoutBusy(true);
                    try {
                      const rows = await api<unknown[]>("/api/platform/settlement/weekly", { method: "POST", body: "{}" });
                      settlement.reload();
                      setDone(`Weekly settlement created ${rows.length} batch(es).`);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setPayoutBusy(false);
                    }
                  })()
                }
              >
                Run weekly settlement now
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-slate-500">
                    <th className="py-2 pr-3">Institute</th>
                    <th className="py-2 pr-3">Gross</th>
                    <th className="py-2 pr-3">Platform fee</th>
                    <th className="py-2 pr-3">Net</th>
                    <th className="py-2 pr-3">Pending payout</th>
                    <th className="py-2">Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {(settlement.data ?? []).map((row) => (
                    <tr key={row.organizationId} className="border-b border-line/70">
                      <td className="py-2 pr-3 font-medium text-navy">{row.name}</td>
                      <td className="py-2 pr-3">₹{Number(row.grossAmount || 0).toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-3">₹{Number(row.platformFeeAmount || 0).toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-3">₹{Number(row.netToInstitute || 0).toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-3">₹{Number(row.pendingPayout || 0).toLocaleString("en-IN")}</td>
                      <td className="py-2">{row.hasBank ? "Yes" : "Missing"}</td>
                    </tr>
                  ))}
                  {(settlement.data?.length ?? 0) === 0 && (
                    <tr>
                      <td className="py-3 text-slate-500" colSpan={6}>
                        No student settlements yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Create a role">
            <form className="flex flex-wrap items-end gap-3" onSubmit={createRole}>
              <div className="w-64">
                <Field label="Role name" value={newName} onChange={setNewName} placeholder="e.g. Sales" />
              </div>
              <button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !newName.trim()}>
                Add role
              </button>
            </form>
          </Card>
          {roles.map((role) => (
            <RoleCard key={role.id} role={role} caps={caps} busy={busy} onSave={saveRole} onDelete={removeRole} />
          ))}
        </>
      )}
      <Card title="Your password">
        <form className="max-w-md space-y-3" onSubmit={savePassword}>
          <Field label="Current password" value={currentPassword} onChange={setCurrent} type="password" />
          <Field label="New password" value={next} onChange={setNext} type="password" />
          <Field label="Confirm new password" value={confirm} onChange={setConfirm} type="password" />
          <p className="text-xs text-slate-400">New password must be 10+ characters with upper, lower, digit, and special character.</p>
          <button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </Card>
    </div>
  );
}

function RoleCard({
  role,
  caps,
  busy,
  onSave,
  onDelete,
}: {
  role: Role;
  caps: Cap[];
  busy: boolean;
  onSave: (role: Role, capabilities: string[], name?: string) => void;
  onDelete: (role: Role) => void;
}) {
  const [name, setName] = useState(role.name);
  const [selected, setSelected] = useState<string[]>(role.capabilities);

  useEffect(() => {
    setName(role.name);
    setSelected(role.capabilities);
  }, [role.id, role.name, role.capabilities]);

  function toggle(cap: string) {
    setSelected(selected.includes(cap) ? selected.filter((c) => c !== cap) : [...selected, cap]);
  }

  return (
    <Card
      title={role.name}
      action={
        <button type="button" className="text-sm text-red-700" disabled={busy} onClick={() => onDelete(role)}>
          Delete role
        </button>
      }
    >
      <div className="mb-4 max-w-xs">
        <Field label="Role name" value={name} onChange={setName} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {caps.map((cap) => (
          <label key={cap.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="cursor-pointer" checked={selected.includes(cap.id)} onChange={() => toggle(cap.id)} />
            {cap.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy}
        onClick={() => onSave(role, selected, name)}
      >
        Save rights for {name || role.name}
      </button>
    </Card>
  );
}
