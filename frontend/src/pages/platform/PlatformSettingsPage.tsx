import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { hasCap, usePlatformAuth } from "../../platformAuth";
import { Card, ErrorText, Field, useApi } from "../../ui";

type Cap = { id: string; label: string };
type Role = { id: string; name: string; capabilities: string[] };
type Catalog = { capabilities: Cap[]; roles: Role[] };

export function PlatformSettingsPage() {
  const { user } = usePlatformAuth();
  const canManageRights = hasCap(user, "MANAGE_RIGHTS");
  const catalog = useApi<Catalog>(canManageRights ? "/api/platform/roles" : "");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

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
              assign one or more of those roles to a person.
            </>
          ) : (
            "Change the password for this Niyamstack staff account."
          )}
        </p>
      </div>
      {catalog.error && <p className="text-sm text-red-600">{catalog.error}</p>}
      <ErrorText error={error} />
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
      {canManageRights && (
        <>
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
