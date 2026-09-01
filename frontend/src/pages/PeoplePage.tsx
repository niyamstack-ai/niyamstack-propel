import { NavLink, Navigate, useParams, Link } from "react-router-dom";
import { useState } from "react";
import { api } from "../api";
import { createRecord, updateRecord } from "../ops";
import { AlumniPage } from "./AlumniPage";
import { StaffStudents } from "./StudentsPage";
import { useAuth } from "../auth";
import { STAFF_RIGHTS } from "../packs";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, TextArea, useApi, formatDay } from "../ui";

type Staff = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  active: boolean;
  capabilities?: string[];
  hasEmployee?: boolean;
  employeeCode?: string;
  employeeId?: string;
};
type InstituteRole = { id: string; name: string; baseRole: string; capabilities?: string[] };

const tabs = [
  { id: "students", label: "Students", to: "/people/students" },
  { id: "staff", label: "Staff", to: "/people/staff" },
  { id: "employees", label: "Employees", to: "/people/employees" },
  { id: "alumni", label: "Alumni", to: "/people/alumni" },
] as const;

export function PeoplePage() {
  const { tab } = useParams();
  const { user } = useAuth();
  const current = tab || "students";
  if (!tab) return <Navigate to="/people/students" replace />;
  if (current !== "students" && current !== "staff" && current !== "employees" && current !== "alumni") {
    return <Navigate to="/people/students" replace />;
  }
  const canEnroll = user?.role === "OWNER" || user?.role === "COUNSELOR" || (user?.capabilities ?? []).includes("STUDENTS");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">People</h1>
        <p className="text-sm text-slate-500">Students, staff HR records, and alumni of this institute.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={({ isActive }) => `rounded-full px-3 py-1.5 text-sm ${isActive ? "bg-navy text-white" : "bg-mist"}`}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      {current === "students" && <StaffStudents canEnroll={!!canEnroll} embedded />}
      {current === "staff" && <InstituteStaff />}
      {current === "employees" && <InstituteEmployees />}
      {current === "alumni" && <AlumniPage embedded />}
    </div>
  );
}

function InstituteStaff() {
  const staff = useApi<Staff[]>("/api/staff");
  const roles = useApi<InstituteRole[]>("/api/foundation/institute-roles");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberRole, setMemberRole] = useState("FACULTY");
  const [rights, setRights] = useState<string[]>(presetRights("FACULTY"));

  function presetRights(role: string) {
    if (role === "COUNSELOR" || role === "PLACEMENT_HEAD") return ["STUDENTS", "CRM"];
    if (role === "ACCOUNTANT") return ["VIEW_FEES", "REFUND", "ESS_VIEW", "ESS_MANAGE"];
    return ["EXAMS", "ESS_VIEW", "LMS"];
  }

  function applyRoleTemplate(roleId: string) {
    const picked = (roles.data ?? []).find((r) => r.id === roleId);
    if (!picked) return;
    setMemberRole(picked.baseRole);
    setRights(picked.capabilities ?? presetRights(picked.baseRole));
  }

  async function linkEmployee(s: Staff) {
    setError(null);
    try {
      await api(`/api/foundation/staff/${s.id}/link-employee`, { method: "POST" });
      staff.reload();
      setNotice(`${s.fullName} is now linked to an ESS employee record.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function inviteMember() {
    setError(null);
    setNotice(null);
    try {
      const created = await createRecord("/api/staff", {
        fullName: memberName,
        email: memberEmail,
        phone: memberPhone,
        role: memberRole,
        capabilities: rights,
      }) as Staff & { tempPassword?: string };
      setMemberName("");
      setMemberEmail("");
      setMemberPhone("");
      setRights(presetRights(memberRole));
      staff.reload();
      setNotice(
        created.tempPassword
          ? `${created.fullName} can log in with ${created.email}. Temporary password: ${created.tempPassword}. Ask them to change it after first login.`
          : `${created.fullName} was added.`
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveRights(s: Staff, next: string[]) {
    setError(null);
    try {
      await api(`/api/staff/${s.id}`, { method: "PUT", body: JSON.stringify({ capabilities: next }) });
      staff.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function RightsChips({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
    return (
      <div className="flex flex-wrap gap-3">
        {STAFF_RIGHTS.map((r) => {
          const on = value.includes(r.id);
          return (
            <label key={r.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
              />
              {r.label}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <Card title="Institute staff">
        <p className="mb-3 text-sm text-slate-500">Teachers, counselors, accountants, and placement staff. They log in to this portal, not the student website. Tick what they may see. HR records (code, department, leave, salary) live under ESS.</p>
        <Table
          empty="No staff besides you yet. Add a teacher below."
          columns={["Member", "Email", "Role", "ESS", "Rights", "Active"]}
          rows={(staff.data ?? []).filter((s) => s.role !== "OWNER").map((s) => [
            s.fullName,
            s.email,
            prettyLabel(s.role),
            s.hasEmployee ? (
              <span key={`${s.id}-ess`} className="text-xs text-emerald-700">
                {s.employeeCode || "Linked"}
              </span>
            ) : (
              <button key={`${s.id}-link`} type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => void linkEmployee(s)}>
                Link ESS
              </button>
            ),
            <RightsChips key={s.id} value={s.capabilities ?? []} onChange={(next) => void saveRights(s, next)} />,
            s.active ? "Yes" : "No",
          ])}
        />
      </Card>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Add staff login">
        <FormGrid>
          <Field label="Name" value={memberName} onChange={setMemberName} placeholder="Full name" />
          <Field label="Phone" value={memberPhone} onChange={setMemberPhone} placeholder="10-digit mobile" />
          <Field label="Email" value={memberEmail} onChange={setMemberEmail} placeholder="They will log in with this" />
          <Select
            label="Role"
            value={memberRole}
            onChange={(v) => {
              setMemberRole(v);
              setRights(presetRights(v));
            }}
            allowEmpty={false}
            options={[
              { value: "FACULTY", label: "Faculty" },
              { value: "COUNSELOR", label: "Counselor" },
              { value: "ACCOUNTANT", label: "Accountant" },
              { value: "PLACEMENT_HEAD", label: "Placement head" },
            ]}
          />
          {(roles.data ?? []).length > 0 && (
            <Select
              label="Apply saved role template"
              value=""
              onChange={(v) => applyRoleTemplate(v)}
              options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
            />
          )}
        </FormGrid>
        <div className="mt-3">
          <p className="mb-2 text-sm text-slate-600">Rights</p>
          <RightsChips value={rights} onChange={setRights} />
        </div>
        <div className="mt-3">
          <PrimaryButton disabled={!memberName || !memberEmail} onClick={() => void inviteMember()}>
            Create staff login
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}

type EmployeeRow = {
  id: string;
  employeeCode?: string;
  fullName: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  managerName?: string;
  managerId?: string;
  centerId?: string;
  status?: string;
  employmentType?: string;
  hasLogin?: boolean;
  loginEmail?: string;
  bankAccount?: string;
  pan?: string;
  uan?: string;
  esiNumber?: string;
};

function InstituteEmployees() {
  const employees = useApi<EmployeeRow[]>("/api/employees");
  const centers = useApi<{ id: string; name: string }[]>("/api/centers");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [csv, setCsv] = useState("fullName,email,phone,department,designation\n");
  const selected = (employees.data ?? []).find((e) => e.id === selectedId);

  const [fullName, setFullName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [centerId, setCenterId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [pan, setPan] = useState("");
  const [uan, setUan] = useState("");
  const [esiNumber, setEsiNumber] = useState("");

  function loadEdit(e: EmployeeRow) {
    setSelectedId(e.id);
    setFullName(e.fullName);
    setEmployeeCode(e.employeeCode || "");
    setEmail(e.email || "");
    setPhone(e.phone || "");
    setDepartment(e.department || "");
    setDesignation(e.designation || "");
    setJoiningDate(e.joiningDate?.slice(0, 10) || "");
    setCenterId(e.centerId || "");
    setManagerId(e.managerId || "");
    setBankAccount(e.bankAccount || "");
    setPan(e.pan || "");
    setUan(e.uan || "");
    setEsiNumber(e.esiNumber || "");
  }

  async function saveEmployee() {
    if (!selectedId) return;
    setError(null);
    try {
      await updateRecord(`/api/employees/${selectedId}`, {
        fullName,
        employeeCode,
        email,
        phone,
        department,
        designation,
        joiningDate: joiningDate || null,
        centerId: centerId || null,
        managerId: managerId || null,
        bankAccount,
        pan,
        uan,
        esiNumber,
      });
      employees.reload();
      setNotice("Employee profile saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function importCsv() {
    setError(null);
    setNotice(null);
    try {
      const out = await api<{ created?: number; skipped?: number }>("/api/actions/sis/import/employees", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      employees.reload();
      setNotice(`Imported ${out.created ?? 0} employee(s). Skipped ${out.skipped ?? 0}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Card title="Employee directory">
        <p className="mb-3 text-sm text-slate-500">
          HR records for everyone on payroll. Portal logins live under Staff; use{" "}
          <Link className="font-semibold text-brand hover:underline" to="/ess">
            ESS
          </Link>{" "}
          for attendance, leave, and payroll.
        </p>
        <Table
          empty="No employees yet. Add them in ESS or import CSV below."
          columns={["Code", "Name", "Department", "Designation", "Manager", "Login", ""]}
          rows={(employees.data ?? []).map((e) => [
            e.employeeCode || "—",
            e.fullName,
            e.department || "—",
            e.designation || "—",
            e.managerName || "—",
            e.hasLogin ? (e.loginEmail || "Yes") : "—",
            <button key={e.id} type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => loadEdit(e)}>
              Edit
            </button>,
          ])}
        />
      </Card>
      {selected && (
        <Card title={`Edit ${selected.fullName}`}>
          <FormGrid>
            <Field label="Name" value={fullName} onChange={setFullName} />
            <Field label="Code" value={employeeCode} onChange={setEmployeeCode} />
            <Field label="Email" value={email} onChange={setEmail} />
            <Field label="Phone" value={phone} onChange={setPhone} />
            <Field label="Department" value={department} onChange={setDepartment} />
            <Field label="Designation" value={designation} onChange={setDesignation} />
            <Field label="Joining date" type="date" value={joiningDate} onChange={setJoiningDate} />
            <Select
              label="Center"
              value={centerId}
              onChange={setCenterId}
              options={(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Manager"
              value={managerId}
              onChange={setManagerId}
              options={(employees.data ?? []).filter((e) => e.id !== selectedId).map((e) => ({ value: e.id, label: e.fullName }))}
            />
            <Field label="Bank account" value={bankAccount} onChange={setBankAccount} />
            <Field label="PAN" value={pan} onChange={setPan} />
            <Field label="UAN" value={uan} onChange={setUan} />
            <Field label="ESI number" value={esiNumber} onChange={setEsiNumber} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton onClick={() => void saveEmployee()}>Save profile</PrimaryButton>
          </div>
        </Card>
      )}
      <Card title="Bulk import">
        <p className="mb-2 text-sm text-slate-500">CSV columns: fullName, email, phone, department, designation, employeeCode (optional).</p>
        <TextArea label="CSV" value={csv} onChange={setCsv} rows={6} />
        <div className="mt-3">
          <PrimaryButton onClick={() => void importCsv()}>Import employees</PrimaryButton>
        </div>
      </Card>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
    </>
  );
}
