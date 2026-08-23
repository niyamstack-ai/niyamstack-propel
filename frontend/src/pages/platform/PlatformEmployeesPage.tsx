import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Card, ErrorText, Field, FormGrid, Table, useApi } from "../../ui";

type NamedRole = { id: string; name: string };
type Catalog = { roles: NamedRole[] };
type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  roles: NamedRole[];
  active: boolean;
};

export function PlatformEmployeesPage() {
  const list = useApi<Employee[]>("/api/platform/employees");
  const catalog = useApi<Catalog>("/api/platform/roles");
  const roles = catalog.data?.roles ?? [];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(id: string) {
    setRoleIds(roleIds.includes(id) ? roleIds.filter((x) => x !== id) : [...roleIds, id]);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (roleIds.length === 0) {
      setError("Select at least one role");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api("/api/platform/employees", {
        method: "POST",
        body: JSON.stringify({ fullName: name, email, password, roleIds }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRoleIds([]);
      list.reload();
      setDone("Employee added.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(emp: Employee) {
    if (emp.role === "PLATFORM_OWNER") return;
    setError(null);
    try {
      await api(`/api/platform/employees/${emp.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !emp.active }),
      });
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveRoles(emp: Employee, nextIds: string[]) {
    if (emp.role === "PLATFORM_OWNER") return;
    setError(null);
    try {
      await api(`/api/platform/employees/${emp.id}`, {
        method: "PUT",
        body: JSON.stringify({ roleIds: nextIds }),
      });
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const rows = list.data ?? [];
  const peopleLabel = list.loading ? "People" : rows.length === 1 ? "1 person" : `${rows.length} people`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Niyamstack staff</h1>
        <p className="mt-1 text-sm text-slate-500">
          Company employees of Niyamstack (control plane). Institute teachers and customer staff are managed inside each institute under People → Staff. Role names and rights are defined in{" "}
          <Link className="font-medium text-brand" to="/platform/settings">
            Settings
          </Link>
          .
        </p>
      </div>
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
      <Card title="Add employee">
        <form className="space-y-4" onSubmit={create}>
          <FormGrid>
            <Field label="Full name" value={name} onChange={setName} />
            <Field label="Login id / email" value={email} onChange={setEmail} />
            <Field label="Temporary password" value={password} onChange={setPassword} type="password" />
          </FormGrid>
          <div>
            <p className="text-sm text-slate-600">Roles (multiple choice)</p>
            {roles.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No roles yet. Create Sales, HR, Support, etc. under{" "}
                <Link className="text-brand" to="/platform/settings">
                  Settings
                </Link>
                .
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {roles.map((role) => {
                  const on = roleIds.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      className={`rounded-full px-3 py-1 text-sm ${on ? "bg-navy text-white" : "bg-mist text-navy"}`}
                      onClick={() => toggleRole(role.id)}
                    >
                      {role.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">Password must be 10+ characters with upper, lower, digit, and special character.</p>
          <ErrorText error={error} />
          {list.error && <p className="text-sm text-red-600">{list.error}</p>}
          <button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>
            {busy ? "Saving…" : "Add employee"}
          </button>
        </form>
      </Card>
      <Card title={peopleLabel}>
        <Table
          columns={["Name", "Login id", "Roles", "Status", ""]}
          loading={list.loading}
          empty="No staff yet."
          rows={rows.map((emp) => [
            emp.name,
            emp.email,
            emp.role === "PLATFORM_OWNER" ? (
              "Owner (all rights)"
            ) : (
              <RolePicker roles={roles} selected={(emp.roles ?? []).map((r) => r.id)} onChange={(ids) => saveRoles(emp, ids)} />
            ),
            emp.active ? "Active" : "Disabled",
            emp.role === "PLATFORM_OWNER" ? (
              "Owner"
            ) : (
              <button type="button" className="text-sm font-medium text-brand" onClick={() => toggle(emp)}>
                {emp.active ? "Disable" : "Enable"}
              </button>
            ),
          ])}
        />
      </Card>
    </div>
  );
}

function RolePicker({
  roles,
  selected,
  onChange,
}: {
  roles: NamedRole[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => {
        const on = selected.includes(role.id);
        return (
          <button
            key={role.id}
            type="button"
            className={`rounded-full px-2 py-0.5 text-xs ${on ? "bg-navy text-white" : "bg-mist text-navy"}`}
            onClick={() => onChange(on ? selected.filter((id) => id !== role.id) : [...selected, role.id])}
          >
            {role.name}
          </button>
        );
      })}
    </div>
  );
}
