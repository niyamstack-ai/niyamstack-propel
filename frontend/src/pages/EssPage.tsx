import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { useLocale } from "../locale";
import { hasGrowthTier } from "../packs";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, TextArea, formatDay, formatInr, formatWhen, useApi } from "../ui";

type Employee = {
  id: string;
  employeeCode?: string;
  fullName: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  centerId?: string;
  centerName?: string;
  managerId?: string;
  managerName?: string;
  directReports?: string[];
  status?: string;
  employmentType?: string;
  hasLogin?: boolean;
  cl?: number;
  sl?: number;
  el?: number;
  tempPassword?: string;
  loginEmail?: string;
  loginRole?: string;
  bankAccount?: string;
  pan?: string;
  uan?: string;
  esiNumber?: string;
};
type Attendance = { id: string; employeeId: string; employeeName?: string; workDate?: string; shift?: string; status?: string; source?: string; inTime?: string; outTime?: string };
type Punch = { id: string; employeeId?: string; studentId?: string; deviceId?: string; punchAt?: string; punchType?: string; employeeName?: string; studentName?: string };
type Leave = { id: string; employeeId: string; employeeName?: string; leaveType?: string; fromDate?: string; toDate?: string; days?: number; reason?: string; status?: string; canApprove?: boolean; canCancel?: boolean };
type Balance = { id: string; employeeId: string; employeeName?: string; year?: number; cl?: number; sl?: number; el?: number };
type Holiday = { id: string; name: string; holidayDate?: string; centerId?: string };
type Structure = { id: string; employeeId: string; employeeName?: string; basic?: number; hra?: number; special?: number; effectiveFrom?: string };
type Payslip = {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  year?: number;
  month?: number;
  basic?: number;
  hra?: number;
  special?: number;
  variablePay?: number;
  commissionPay?: number;
  gross?: number;
  pfEmployee?: number;
  esiEmployee?: number;
  pfEmployer?: number;
  esiEmployer?: number;
  ptEmployee?: number;
  tdsEmployee?: number;
  lopDays?: number;
  lopDeduction?: number;
  workingDays?: number;
  presentDays?: number;
  deductions?: number;
  net?: number;
  status?: string;
  instituteName?: string;
  skipped?: boolean;
  exists?: boolean;
};
type PayrollSettings = {
  pfEnabled?: boolean;
  pfRate?: number;
  pfWageCap?: number;
  esiEnabled?: boolean;
  esiEmployeeRate?: number;
  esiEmployerRate?: number;
  esiWageCap?: number;
  ptEnabled?: boolean;
  ptAmount?: number;
  tdsEnabled?: boolean;
  tdsRate?: number;
  lopEnabled?: boolean;
};
type StatutorySummary = {
  employeeCount?: number;
  publishedCount?: number;
  draftCount?: number;
  totalGross?: number;
  totalNet?: number;
  totalPfEmployee?: number;
  totalPfEmployer?: number;
  totalEsiEmployee?: number;
  totalEsiEmployer?: number;
  totalPt?: number;
  totalTds?: number;
  totalLop?: number;
};
type Vacancy = { id: string; title: string; department?: string; openings?: number; status?: string; description?: string };
type Candidate = {
  id: string;
  vacancyId: string;
  jobTitle?: string;
  fullName: string;
  email?: string;
  phone?: string;
  status?: string;
  interviewAt?: string;
  offerCtc?: number;
  offerJoiningDate?: string;
};
type Center = { id: string; name: string };
type Reg = {
  id: string;
  employeeName?: string;
  workDate?: string;
  shift?: string;
  requestedStatus?: string;
  status?: string;
  canApprove?: boolean;
  canCancel?: boolean;
  reason?: string;
};
type Resign = { id: string; employeeName?: string; lastWorkingDate?: string; status?: string; canDecide?: boolean; reason?: string };
type Doc = { id: string; docType?: string; fileName?: string; storageUrl?: string };
type ManagerInbox = {
  pendingLeave?: number;
  pendingRegularization?: number;
  pendingResignation?: number;
  leave?: Leave[];
  regularization?: Reg[];
  resignation?: Resign[];
  teamSize?: number;
};

const HR_TABS = ["profile", "team", "employees", "attendance", "leave", "payroll", "compensation", "hiring", "devices"] as const;
const PAYROLL_TABS = ["profile", "attendance", "leave", "payroll", "compensation"] as const;
const MANAGER_TABS = ["profile", "team", "attendance", "leave", "payroll"] as const;
const STAFF_TABS = ["profile", "attendance", "leave", "payroll"] as const;
type Tab = (typeof HR_TABS)[number];

export function EssPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const hr = user?.role === "OWNER" || (user?.capabilities ?? []).includes("ESS_MANAGE");
  const payroll = hr || user?.role === "ACCOUNTANT";
  const growth = hasGrowthTier(user?.packageTier, user?.modules);
  const manager = (user?.capabilities ?? []).includes("LEAVE_APPROVE");
  const [tab, setTab] = useState<Tab>(hr ? "employees" : payroll ? "payroll" : manager ? "team" : "profile");
  const tabs = (hr ? HR_TABS : payroll ? PAYROLL_TABS : manager ? MANAGER_TABS : STAFF_TABS).filter(
    (item) => item !== "compensation" || growth,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">{t("ess_title", "ESS")}</h1>
        <p className="text-sm text-slate-500">
          {hr
            ? t("ess_subtitle", "Employee master, staff attendance, leave, payroll, and institute hiring. Staff logins stay under People → Staff.")
            : payroll
              ? "Payroll settings, payslips, attendance, and leave. Hiring and employee master stay with the owner."
              : manager
                ? "Your profile, team leave approvals, attendance, and payslips."
                : "Your profile, attendance, leave, and payslips."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-full px-3 py-1.5 text-sm ${tab === item ? "bg-navy text-white" : "bg-mist"}`}
          >
            {prettyLabel(item)}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab hr={hr} />}
      {tab === "team" && (hr || manager) && <TeamTab hr={hr} />}
      {tab === "employees" && hr && <EmployeesTab />}
      {tab === "attendance" && <AttendanceTab hr={hr || payroll} />}
      {tab === "leave" && <LeaveTab hr={hr} manager={manager} />}
      {tab === "payroll" && <PayrollTab hr={hr || payroll} />}
      {tab === "compensation" && (hr || payroll) && growth && <CompensationTab />}
      {tab === "hiring" && hr && <HiringTab />}
      {tab === "devices" && hr && <DevicesTab />}
    </div>
  );
}

function ProfileTab({ hr }: { hr: boolean }) {
  const profile = useApi<Employee>("/api/actions/ess/profile");
  const orgChart = useApi<Employee[]>(hr ? "/api/actions/ess/org-chart" : "");
  const docs = useApi<Doc[]>(profile.data?.id ? `/api/employees/${profile.data.id}/documents` : "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [pan, setPan] = useState("");
  const [uan, setUan] = useState("");
  const [esiNumber, setEsiNumber] = useState("");
  const [docType, setDocType] = useState("ID_PROOF");
  const [fileName, setFileName] = useState("");
  const [storageUrl, setStorageUrl] = useState("");
  const [resignDate, setResignDate] = useState("");
  const [resignReason, setResignReason] = useState("");

  const p = profile.data;

  useEffect(() => {
    if (!p) return;
    setPhone(p.phone || "");
    setEmail(p.email || "");
    setBankAccount(p.bankAccount || "");
    setPan(p.pan || "");
    setUan(p.uan || "");
    setEsiNumber(p.esiNumber || "");
  }, [p?.id, p?.phone, p?.email, p?.bankAccount, p?.pan, p?.uan, p?.esiNumber]);

  async function save() {
    if (!p) return;
    setError(null);
    try {
      await api(`/api/employees/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ phone, email, bankAccount, pan, uan, esiNumber }),
      });
      profile.reload();
      setNotice("Profile updated.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addDoc() {
    if (!p) return;
    setError(null);
    try {
      await createRecord("/api/employee-documents", { employeeId: p.id, docType, fileName, storageUrl });
      docs.reload();
      setFileName("");
      setStorageUrl("");
      setNotice("Document added.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submitResignation() {
    setError(null);
    try {
      await api("/api/actions/ess/resignation", {
        method: "POST",
        body: JSON.stringify({ lastWorkingDate: resignDate, reason: resignReason }),
      });
      setResignReason("");
      setNotice("Resignation submitted to HR.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || profile.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="My profile">
        {profile.loading ? (
          <p className="text-sm text-slate-500">Loading profile…</p>
        ) : p ? (
          <>
            <p className="mb-3 text-sm text-slate-600">
              {p.employeeCode} · {p.designation || "Staff"} · {p.department || "—"}
            </p>
            <p className="mb-3 text-sm text-slate-500">
              Manager: {p.managerName || "—"} · Joined {formatDay(p.joiningDate) || "—"} · Leave CL/SL/EL: {p.cl ?? 0}/{p.sl ?? 0}/{p.el ?? 0}
            </p>
            <FormGrid>
              <Field label="Email" value={email} onChange={setEmail} />
              <Field label="Phone" value={phone} onChange={setPhone} />
              <Field label="Bank account" value={bankAccount} onChange={setBankAccount} />
              <Field label="PAN" value={pan} onChange={setPan} />
              <Field label="UAN" value={uan} onChange={setUan} />
              <Field label="ESI number" value={esiNumber} onChange={setEsiNumber} />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton onClick={() => void save()}>Save my details</PrimaryButton>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">No employee record linked to your login yet. Ask the owner to link you under People → Staff.</p>
        )}
      </Card>
      {p && (
        <>
          <Card title="My documents">
            <Table
              empty="No documents uploaded yet."
              columns={["Type", "Name", "Link"]}
              rows={(docs.data ?? []).map((d) => [prettyLabel(d.docType), d.fileName || "—", d.storageUrl ? <a key={d.id} href={d.storageUrl} className="text-brand hover:underline" target="_blank" rel="noreferrer">Open</a> : "—"])}
            />
            <FormGrid>
              <Field label="Document type" value={docType} onChange={setDocType} placeholder="ID_PROOF / OFFER" />
              <Field label="File name" value={fileName} onChange={setFileName} />
              <Field label="URL or path" value={storageUrl} onChange={setStorageUrl} />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton disabled={!storageUrl} onClick={() => void addDoc()}>Add document</PrimaryButton>
            </div>
          </Card>
          {!hr && (
            <Card title="Resignation">
              <p className="mb-3 text-sm text-slate-500">Submit your notice period request to HR.</p>
              <FormGrid>
                <Field label="Last working date" type="date" value={resignDate} onChange={setResignDate} />
              </FormGrid>
              <div className="mt-3">
                <TextArea label="Reason" value={resignReason} onChange={setResignReason} rows={3} />
              </div>
              <div className="mt-3">
                <PrimaryButton disabled={!resignDate} onClick={() => void submitResignation()}>Submit resignation</PrimaryButton>
              </div>
            </Card>
          )}
        </>
      )}
      {hr && (
        <Card title="Org chart">
          <Table
            empty="No employees yet."
            columns={["Code", "Name", "Department", "Manager", "Reports"]}
            rows={(orgChart.data ?? []).map((e) => [
              e.employeeCode || "—",
              e.fullName,
              e.department || "—",
              e.managerName || "—",
              String((e as Employee & { reportCount?: number }).reportCount ?? 0),
            ])}
          />
        </Card>
      )}
    </>
  );
}

function TeamTab({ hr }: { hr: boolean }) {
  const inbox = useApi<ManagerInbox>("/api/actions/ess/manager/inbox");
  const now = new Date();
  const teamAtt = useApi<Attendance[]>(`/api/actions/ess/team/attendance?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  const teamLeave = useApi<Leave[]>(`/api/actions/ess/team/leave-calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  const policy = useApi<{ clAnnual?: number; slAnnual?: number; elAnnual?: number; excludeHolidays?: boolean }>(hr ? "/api/leave-policy" : "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<string[]>([]);
  const [clAnnual, setClAnnual] = useState("12");
  const [slAnnual, setSlAnnual] = useState("6");
  const [elAnnual, setElAnnual] = useState("15");
  const [excludeHolidays, setExcludeHolidays] = useState(false);

  useEffect(() => {
    if (!policy.data) return;
    setClAnnual(String(policy.data.clAnnual ?? 12));
    setSlAnnual(String(policy.data.slAnnual ?? 6));
    setElAnnual(String(policy.data.elAnnual ?? 15));
    setExcludeHolidays(Boolean(policy.data.excludeHolidays));
  }, [policy.data?.clAnnual, policy.data?.slAnnual, policy.data?.elAnnual, policy.data?.excludeHolidays]);

  const box = inbox.data;

  async function decideOneLeave(id: string, approve: boolean) {
    setError(null);
    try {
      await api(`/api/actions/ess/leave/${id}/decide`, { method: "POST", body: JSON.stringify({ approve }) });
      inbox.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function bulkLeave(approve: boolean) {
    if (!selectedLeave.length) return;
    setError(null);
    try {
      const out = await api<{ processed?: number }>("/api/actions/ess/leave/bulk-decide", {
        method: "POST",
        body: JSON.stringify({ ids: selectedLeave, approve }),
      });
      setSelectedLeave([]);
      inbox.reload();
      setNotice(`${approve ? "Approved" : "Rejected"} ${out.processed ?? 0} leave request(s).`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function decideReg(id: string, approve: boolean) {
    setError(null);
    try {
      await api(`/api/actions/ess/regularization/${id}/decide`, { method: "POST", body: JSON.stringify({ approve }) });
      inbox.reload();
      teamAtt.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function decideResign(id: string, approve: boolean) {
    setError(null);
    try {
      await api(`/api/actions/ess/resignation/${id}/decide`, { method: "POST", body: JSON.stringify({ approve }) });
      inbox.reload();
      setNotice(approve ? "Resignation accepted. Employee is on notice." : "Resignation rejected.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function savePolicy() {
    setError(null);
    try {
      await api("/api/leave-policy", {
        method: "PUT",
        body: JSON.stringify({ clAnnual, slAnnual, elAnnual, excludeHolidays }),
      });
      policy.reload();
      setNotice("Leave policy saved for this year.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleLeave(id: string) {
    setSelectedLeave((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <>
      <ErrorText error={error || inbox.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Pending leave">
          <p className="text-3xl font-bold text-navy">{box?.pendingLeave ?? 0}</p>
        </Card>
        <Card title="Regularization">
          <p className="text-3xl font-bold text-navy">{box?.pendingRegularization ?? 0}</p>
        </Card>
        <Card title="Resignations">
          <p className="text-3xl font-bold text-navy">{box?.pendingResignation ?? 0}</p>
        </Card>
      </div>
      <Card title="Pending leave">
        <div className="mb-3 flex flex-wrap gap-2">
          <PrimaryButton disabled={!selectedLeave.length} onClick={() => void bulkLeave(true)}>Approve selected</PrimaryButton>
          <PrimaryButton disabled={!selectedLeave.length} onClick={() => void bulkLeave(false)}>Reject selected</PrimaryButton>
        </div>
        <Table
          empty="No pending leave for your team."
          columns={["", "Employee", "Type", "From", "To", "Days", ""]}
          rows={(box?.leave ?? []).map((r) => [
            r.canApprove ? (
              <input key={`${r.id}-cb`} type="checkbox" checked={selectedLeave.includes(r.id)} onChange={() => toggleLeave(r.id)} />
            ) : (
              ""
            ),
            r.employeeName || "—",
            r.leaveType || "—",
            formatDay(r.fromDate) || "—",
            formatDay(r.toDate) || "—",
            String(r.days ?? ""),
            r.canApprove ? (
              <span key={r.id} className="flex gap-2">
                <LinkButton onClick={() => void decideOneLeave(r.id, true)}>Approve</LinkButton>
                <LinkButton onClick={() => void decideOneLeave(r.id, false)}>Reject</LinkButton>
              </span>
            ) : (
              ""
            ),
          ])}
        />
      </Card>
      <Card title="Attendance regularization">
        <Table
          empty="No pending regularization requests."
          columns={["Employee", "Date", "Requested", "Reason", ""]}
          rows={(box?.regularization ?? []).map((r) => [
            r.employeeName || "—",
            formatDay(r.workDate) || "—",
            prettyLabel(r.requestedStatus),
            r.reason || "—",
            r.canApprove ? (
              <span key={r.id} className="flex gap-2">
                <LinkButton onClick={() => void decideReg(r.id, true)}>Approve</LinkButton>
                <LinkButton onClick={() => void decideReg(r.id, false)}>Reject</LinkButton>
              </span>
            ) : (
              ""
            ),
          ])}
        />
      </Card>
      {(hr || (box?.resignation?.length ?? 0) > 0) && (
        <Card title="Resignation requests">
          <Table
            empty="No pending resignations."
            columns={["Employee", "Last day", "Reason", ""]}
            rows={(box?.resignation ?? []).map((r) => [
              r.employeeName || "—",
              formatDay(r.lastWorkingDate) || "—",
              r.reason || "—",
              r.canDecide ? (
                <span key={r.id} className="flex gap-2">
                  <LinkButton onClick={() => void decideResign(r.id, true)}>Accept</LinkButton>
                  <LinkButton onClick={() => void decideResign(r.id, false)}>Reject</LinkButton>
                </span>
              ) : (
                <span key={r.id} className="text-xs text-slate-500">View only</span>
              ),
            ])}
          />
        </Card>
      )}
      <Card title="Team attendance this month">
        <Table
          empty="No team attendance marks this month."
          columns={["Date", "Employee", "Status", "Shift", "Source"]}
          rows={(teamAtt.data ?? []).map((a) => [
            formatDay(a.workDate) || "—",
            a.employeeName || "—",
            prettyLabel(a.status),
            prettyLabel(a.shift),
            prettyLabel(a.source),
          ])}
        />
      </Card>
      <Card title="Team leave this month">
        <Table
          empty="Nobody on approved leave this month."
          columns={["Employee", "Type", "From", "To"]}
          rows={(teamLeave.data ?? []).map((r) => [r.employeeName || "—", r.leaveType || "—", formatDay(r.fromDate) || "—", formatDay(r.toDate) || "—"])}
        />
      </Card>
      {hr && (
        <Card title="Leave policy (this year)">
          <FormGrid>
            <Field label="CL days" value={clAnnual} onChange={setClAnnual} />
            <Field label="SL days" value={slAnnual} onChange={setSlAnnual} />
            <Field label="EL days" value={elAnnual} onChange={setElAnnual} />
          </FormGrid>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={excludeHolidays} onChange={(e) => setExcludeHolidays(e.target.checked)} />
            Count only working days (skip weekends and institute holidays)
          </label>
          <div className="mt-3">
            <PrimaryButton onClick={() => void savePolicy()}>Save policy</PrimaryButton>
          </div>
        </Card>
      )}
    </>
  );
}

function EmployeesTab() {
  const people = useApi<Employee[]>("/api/employees");
  const centers = useApi<Center[]>("/api/centers");
  const staff = useApi<{ id: string; fullName: string; email: string }[]>("/api/staff");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [centerId, setCenterId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [employmentType, setEmploymentType] = useState("SUPPORT");
  const [userId, setUserId] = useState("");
  const [createLogin, setCreateLogin] = useState(false);
  const [loginRole, setLoginRole] = useState("FACULTY");

  async function add() {
    setError(null);
    setNotice(null);
    try {
      const created = await createRecord<Employee>("/api/employees", {
        fullName,
        employeeCode,
        email,
        phone,
        department,
        designation,
        joiningDate,
        centerId: centerId || null,
        managerId: managerId || null,
        userId: userId || null,
        employmentType,
        createLogin,
        loginRole,
      });
      setFullName("");
      setEmployeeCode("");
      setEmail("");
      setPhone("");
      setDepartment("");
      setDesignation("");
      setJoiningDate("");
      people.reload();
      setNotice(
        created.tempPassword
          ? `${created.fullName} saved. Login ${created.loginEmail} with temporary password ${created.tempPassword}.`
          : `${created.fullName} saved as ${created.employeeCode}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function issueLogin(id: string) {
    setError(null);
    setNotice(null);
    try {
      const emp = (people.data ?? []).find((e) => e.id === id);
      const roleFromType =
        emp?.employmentType === "FACULTY" ? "FACULTY" : emp?.employmentType === "ADMIN" ? "COUNSELOR" : loginRole;
      const out = await api<{ loginEmail?: string; tempPassword?: string }>(`/api/actions/ess/employees/${id}/login`, {
        method: "POST",
        body: JSON.stringify({ loginRole: roleFromType }),
      });
      people.reload();
      setNotice(out.tempPassword ? `Login ${out.loginEmail}. Temporary password: ${out.tempPassword}` : `Already has login ${out.loginEmail}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || people.error || centers.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Employee master">
        <p className="mb-3 text-sm text-slate-500">
          Support staff who never log in, and faculty who do. Portal logins are still created under{" "}
          <Link className="text-brand hover:underline" to="/people/staff">
            People → Staff
          </Link>
          , or tick create login below.
        </p>
        <Table
          empty="No employees yet. Add the first one below."
          loading={people.loading}
          columns={["Code", "Name", "Dept", "Designation", "Joining", "Type", "Login", "Leave CL/SL/EL"]}
          rows={(people.data ?? []).map((e) => [
            e.employeeCode || "—",
            e.fullName,
            e.department || "—",
            e.designation || "—",
            formatDay(e.joiningDate) || "—",
            prettyLabel(e.employmentType),
            e.hasLogin ? (
              prettyLabel("ACTIVE")
            ) : (
              <LinkButton key={e.id} onClick={() => void issueLogin(e.id)}>
                Create login
              </LinkButton>
            ),
            `${e.cl ?? "—"} / ${e.sl ?? "—"} / ${e.el ?? "—"}`,
          ])}
        />
      </Card>
      <Card title="Add employee">
        <FormGrid>
          <Field label="Name" value={fullName} onChange={setFullName} placeholder="Full name" />
          <Field label="Employee code" value={employeeCode} onChange={setEmployeeCode} placeholder="Blank = auto EMP-0001" />
          <Field label="Email" value={email} onChange={setEmail} />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="10-digit mobile" />
          <Field label="Department" value={department} onChange={setDepartment} placeholder="Academics" />
          <Field label="Designation" value={designation} onChange={setDesignation} placeholder="Faculty / Front desk" />
          <Field label="Joining date" type="date" value={joiningDate} onChange={setJoiningDate} />
          <Select
            label="Center"
            value={centerId}
            onChange={setCenterId}
            allowEmpty={false}
            options={[
              { value: "", label: (centers.data ?? []).length ? "No center" : "No centers yet — add under Institute" },
              ...(centers.data ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="Manager"
            value={managerId}
            onChange={setManagerId}
            allowEmpty={false}
            options={[
              { value: "", label: (people.data ?? []).length ? "No manager" : "No managers yet" },
              ...(people.data ?? []).map((e) => ({ value: e.id, label: e.fullName })),
            ]}
          />
          <Select
            label="Employment type"
            value={employmentType}
            onChange={setEmploymentType}
            allowEmpty={false}
            options={[
              { value: "SUPPORT", label: "Support (no login needed)" },
              { value: "FACULTY", label: "Faculty" },
              { value: "ADMIN", label: "Admin" },
            ]}
          />
          <Select
            label="Link existing login"
            value={userId}
            onChange={setUserId}
            options={(staff.data ?? []).map((s) => ({ value: s.id, label: `${s.fullName} (${s.email})` }))}
          />
          <Select
            label="Login role if creating"
            value={loginRole}
            onChange={setLoginRole}
            allowEmpty={false}
            options={[
              { value: "FACULTY", label: "Faculty" },
              { value: "COUNSELOR", label: "Counselor" },
              { value: "ACCOUNTANT", label: "Accountant" },
              { value: "PLACEMENT_HEAD", label: "Placement head" },
            ]}
          />
        </FormGrid>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
          Create a portal login now
        </label>
        <div className="mt-3">
          <PrimaryButton disabled={!fullName} onClick={() => void add()}>
            Save employee
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function AttendanceTab({ hr }: { hr: boolean }) {
  const people = useApi<Employee[]>("/api/employees");
  const rows = useApi<Attendance[]>("/api/staff-attendance");
  const regs = useApi<Reg[]>("/api/attendance-regularizations");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState(today());
  const [shift, setShift] = useState("FULL");
  const [status, setStatus] = useState("PRESENT");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [regDate, setRegDate] = useState(today());
  const [regStatus, setRegStatus] = useState("PRESENT");
  const [regReason, setRegReason] = useState("");

  const options = people.data ?? [];

  async function mark() {
    setError(null);
    if (hr && !employeeId) {
      setError("Select an employee before saving attendance.");
      return;
    }
    try {
      await api("/api/actions/ess/attendance", {
        method: "POST",
        body: JSON.stringify({
          employeeId: hr ? employeeId : null,
          workDate,
          shift,
          status,
          inTime: inTime || null,
          outTime: outTime || null,
        }),
      });
      setNotice("Attendance saved.");
      rows.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function requestReg() {
    setError(null);
    try {
      await api("/api/actions/ess/regularization", {
        method: "POST",
        body: JSON.stringify({ workDate: regDate, shift, requestedStatus: regStatus, reason: regReason }),
      });
      regs.reload();
      setRegReason("");
      setNotice("Regularization request submitted.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cancelReg(id: string) {
    setError(null);
    try {
      await api(`/api/actions/ess/regularization/${id}/cancel`, { method: "POST" });
      regs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || rows.error || people.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Staff attendance">
        <p className="mb-3 text-sm text-slate-500">Separate from student LMS attendance. Mark a day or a shift.</p>
        <Table
          empty="No staff attendance yet."
          columns={["Date", "Employee", "Shift", "Status", "In", "Out", "Source"]}
          rows={(rows.data ?? []).map((a) => [
            formatDay(a.workDate) || "—",
            a.employeeName || "—",
            prettyLabel(a.shift),
            prettyLabel(a.status),
            a.inTime || "—",
            a.outTime || "—",
            prettyLabel(a.source),
          ])}
        />
      </Card>
      <Card title="Mark attendance">
        {hr && options.length === 0 && !people.loading && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No employees yet. Add people under ESS → Employees before marking attendance.
          </p>
        )}
        <FormGrid>
          {hr && (
            <Select
              label="Employee"
              value={employeeId}
              onChange={setEmployeeId}
              options={options.map((e) => ({ value: e.id, label: `${e.employeeCode || ""} ${e.fullName}`.trim() }))}
            />
          )}
          <Field label="Date" type="date" value={workDate} onChange={setWorkDate} />
          <Select
            label="Shift"
            value={shift}
            onChange={setShift}
            allowEmpty={false}
            options={[
              { value: "FULL", label: "Full day" },
              { value: "MORNING", label: "Morning" },
              { value: "AFTERNOON", label: "Afternoon" },
            ]}
          />
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            allowEmpty={false}
            options={[
              { value: "PRESENT", label: "Present" },
              { value: "ABSENT", label: "Absent" },
              { value: "HALF", label: "Half day" },
              { value: "WEEKLY_OFF", label: "Weekly off" },
            ]}
          />
          <Field label="In time" type="time" value={inTime} onChange={setInTime} />
          <Field label="Out time" type="time" value={outTime} onChange={setOutTime} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={hr && !employeeId} onClick={() => void mark()}>
            Save attendance
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Request attendance correction">
        <p className="mb-3 text-sm text-slate-500">Missed punch or wrong mark? Submit for manager approval.</p>
        <Table
          empty="No regularization requests yet."
          columns={["Date", "Requested", "Status", ""]}
          rows={(regs.data ?? []).map((r) => [
            formatDay(r.workDate) || "—",
            prettyLabel(r.requestedStatus),
            prettyLabel(r.status),
            r.canCancel ? <LinkButton key={r.id} onClick={() => void cancelReg(r.id)}>Cancel</LinkButton> : r.reason || "",
          ])}
        />
        <FormGrid>
          <Field label="Date to correct" type="date" value={regDate} onChange={setRegDate} />
          <Select
            label="Correct status"
            value={regStatus}
            onChange={setRegStatus}
            allowEmpty={false}
            options={[
              { value: "PRESENT", label: "Present" },
              { value: "ABSENT", label: "Absent" },
              { value: "HALF", label: "Half day" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <TextArea label="Reason" value={regReason} onChange={setRegReason} rows={2} />
        </div>
        <div className="mt-3">
          <PrimaryButton onClick={() => void requestReg()}>Submit correction</PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function LeaveTab({ hr, manager }: { hr: boolean; manager: boolean }) {
  const people = useApi<Employee[]>("/api/employees");
  const leaves = useApi<Leave[]>("/api/leave-requests");
  const bals = useApi<Balance[]>("/api/leave-balances");
  const holidays = useApi<Holiday[]>("/api/holidays");
  const now = new Date();
  const calendar = useApi<Leave[]>(`/api/actions/ess/leave/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState("CL");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [reason, setReason] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState(today());
  const canDecide = hr || manager;

  async function apply() {
    setError(null);
    setNotice(null);
    if (hr && !employeeId) {
      setError("Select an employee before applying leave.");
      return;
    }
    try {
      await api("/api/actions/ess/leave", {
        method: "POST",
        body: JSON.stringify({ employeeId: hr ? employeeId : undefined, leaveType, fromDate, toDate, reason }),
      });
      leaves.reload();
      bals.reload();
      calendar.reload();
      setReason("");
      setNotice("Leave submitted.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function decide(id: string, approve: boolean) {
    setError(null);
    try {
      await api(`/api/actions/ess/leave/${id}/decide`, { method: "POST", body: JSON.stringify({ approve }) });
      leaves.reload();
      bals.reload();
      calendar.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function cancel(id: string) {
    setError(null);
    try {
      await api(`/api/actions/ess/leave/${id}/cancel`, { method: "POST" });
      leaves.reload();
      calendar.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addHoliday() {
    setError(null);
    try {
      await createRecord("/api/holidays", { name: holidayName, holidayDate });
      holidays.reload();
      setHolidayName("");
      setNotice("Holiday added.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || leaves.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Institute holidays">
        <Table
          empty="No holidays listed yet."
          columns={["Date", "Name"]}
          rows={(holidays.data ?? []).map((h) => [formatDay(h.holidayDate) || "—", h.name])}
        />
        {hr && (
          <>
            <FormGrid>
              <Field label="Holiday name" value={holidayName} onChange={setHolidayName} placeholder="Republic Day" />
              <Field label="Date" type="date" value={holidayDate} onChange={setHolidayDate} />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton disabled={!holidayName} onClick={() => void addHoliday()}>
                Add holiday
              </PrimaryButton>
            </div>
          </>
        )}
      </Card>
      <Card title="Balances this year">
        <Table
          empty="No leave balances yet."
          columns={["Employee", "CL", "SL", "EL"]}
          rows={(bals.data ?? []).map((b) => [b.employeeName || "—", String(b.cl ?? 0), String(b.sl ?? 0), String(b.el ?? 0)])}
        />
      </Card>
      <Card title="Leave requests">
        <Table
          empty="No leave requests yet."
          columns={["Employee", "Type", "From", "To", "Days", "Status", ""]}
          rows={(leaves.data ?? []).map((r) => [
            r.employeeName || "—",
            r.leaveType || "—",
            formatDay(r.fromDate) || "—",
            formatDay(r.toDate) || "—",
            String(r.days ?? ""),
            prettyLabel(r.status),
            r.status === "PENDING" && r.canApprove && canDecide ? (
              <span key={r.id} className="flex gap-2">
                <LinkButton onClick={() => void decide(r.id, true)}>Approve</LinkButton>
                <LinkButton onClick={() => void decide(r.id, false)}>Reject</LinkButton>
              </span>
            ) : r.canCancel ? (
              <LinkButton key={r.id} onClick={() => void cancel(r.id)}>Cancel</LinkButton>
            ) : (
              r.reason || ""
            ),
          ])}
        />
      </Card>
      <Card title="This month">
        <Table
          empty="Nobody is on approved leave this month."
          columns={["Employee", "Type", "From", "To"]}
          rows={(calendar.data ?? []).map((r) => [r.employeeName || "—", r.leaveType || "—", formatDay(r.fromDate) || "—", formatDay(r.toDate) || "—"])}
        />
      </Card>
      <Card title="Apply for leave">
        <FormGrid>
          {hr && (
            <Select
              label="Employee"
              value={employeeId}
              onChange={setEmployeeId}
              options={(people.data ?? []).map((e) => ({ value: e.id, label: e.fullName }))}
            />
          )}
          <Select
            label="Type"
            value={leaveType}
            onChange={setLeaveType}
            allowEmpty={false}
            options={[
              { value: "CL", label: "Casual leave (CL)" },
              { value: "SL", label: "Sick leave (SL)" },
              { value: "EL", label: "Earned leave (EL)" },
            ]}
          />
          <Field label="From" type="date" value={fromDate} onChange={setFromDate} />
          <Field label="To" type="date" value={toDate} onChange={setToDate} />
        </FormGrid>
        <div className="mt-3">
          <TextArea label="Reason" value={reason} onChange={setReason} rows={3} />
        </div>
        <div className="mt-3">
          <PrimaryButton disabled={hr && !employeeId} onClick={() => void apply()}>
            Submit leave
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function PayrollTab({ hr }: { hr: boolean }) {
  const people = useApi<Employee[]>("/api/employees");
  const structures = useApi<Structure[]>("/api/salary-structures");
  const slips = useApi<Payslip[]>("/api/payslips");
  const settings = useApi<PayrollSettings>(hr ? "/api/actions/ess/payroll/settings" : "");
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const statutory = useApi<StatutorySummary>(hr ? `/api/actions/ess/payroll/statutory?year=${year}&month=${month}` : "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<Payslip[] | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [basic, setBasic] = useState("");
  const [hra, setHra] = useState("");
  const [special, setSpecial] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [pfEnabled, setPfEnabled] = useState(true);
  const [pfRate, setPfRate] = useState("0.12");
  const [pfWageCap, setPfWageCap] = useState("15000");
  const [esiEnabled, setEsiEnabled] = useState(true);
  const [esiEmployeeRate, setEsiEmployeeRate] = useState("0.0075");
  const [esiEmployerRate, setEsiEmployerRate] = useState("0.0325");
  const [esiWageCap, setEsiWageCap] = useState("21000");
  const [ptEnabled, setPtEnabled] = useState(false);
  const [ptAmount, setPtAmount] = useState("200");
  const [tdsEnabled, setTdsEnabled] = useState(false);
  const [tdsRate, setTdsRate] = useState("0");
  const [lopEnabled, setLopEnabled] = useState(true);

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setPfEnabled(s.pfEnabled ?? true);
    setPfRate(String(s.pfRate ?? 0.12));
    setPfWageCap(String(s.pfWageCap ?? 15000));
    setEsiEnabled(s.esiEnabled ?? true);
    setEsiEmployeeRate(String(s.esiEmployeeRate ?? 0.0075));
    setEsiEmployerRate(String(s.esiEmployerRate ?? 0.0325));
    setEsiWageCap(String(s.esiWageCap ?? 21000));
    setPtEnabled(s.ptEnabled ?? false);
    setPtAmount(String(s.ptAmount ?? 200));
    setTdsEnabled(s.tdsEnabled ?? false);
    setTdsRate(String(s.tdsRate ?? 0));
    setLopEnabled(s.lopEnabled ?? true);
  }, [settings.data]);

  async function saveStructure() {
    setError(null);
    try {
      await api("/api/actions/ess/salary", {
        method: "POST",
        body: JSON.stringify({ employeeId, basic, hra, special, effectiveFrom }),
      });
      structures.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveSettings() {
    setError(null);
    try {
      await api("/api/actions/ess/payroll/settings", {
        method: "PUT",
        body: JSON.stringify({ pfEnabled, pfRate, pfWageCap, esiEnabled, esiEmployeeRate, esiEmployerRate, esiWageCap, ptEnabled, ptAmount, tdsEnabled, tdsRate, lopEnabled }),
      });
      settings.reload();
      setNotice("Payroll settings saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runPreview() {
    setError(null);
    setPreview(null);
    try {
      const out = await api<Payslip[]>("/api/actions/ess/payroll/preview", {
        method: "POST",
        body: JSON.stringify({ year, month }),
      });
      setPreview(out);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function run() {
    setError(null);
    setNotice(null);
    try {
      const out = await api<Payslip[]>("/api/actions/ess/payroll/run", {
        method: "POST",
        body: JSON.stringify({ year, month }),
      });
      slips.reload();
      statutory.reload();
      setPreview(null);
      setNotice(out.length ? `Created ${out.length} draft payslip(s). Review and publish when ready.` : "No new payslips. Either they already exist or no salary structures are saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function publishAll() {
    setError(null);
    try {
      const out = await api<{ published?: number }>("/api/actions/ess/payroll/publish-all", {
        method: "POST",
        body: JSON.stringify({ year, month }),
      });
      slips.reload();
      statutory.reload();
      setNotice(`Published ${out.published ?? 0} payslip(s) for ${month}/${year}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function exportRegister() {
    setError(null);
    try {
      const rows = await api<Record<string, unknown>[]>(`/api/actions/ess/payroll/register?year=${year}&month=${month}`);
      if (!rows.length) {
        setNotice("No payslips to export for this period.");
        return;
      }
      const keys = Object.keys(rows[0]).filter((k) => !k.includes("password"));
      const csv = [keys.join(",")]
        .concat(rows.map((row) => keys.map((k) => JSON.stringify(row[k] ?? "")).join(",")))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-register-${year}-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`Exported ${rows.length} payslip row(s).`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function publishSlip(id: string) {
    setError(null);
    try {
      await api(`/api/actions/ess/payslips/${id}/publish`, { method: "POST" });
      slips.reload();
      statutory.reload();
      setNotice("Payslip published. Staff can now view and print it.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function printSlip(id: string) {
    setError(null);
    try {
      const rec = await api<Payslip>(`/api/actions/ess/payslips/${id}`);
      const win = window.open("", "_blank");
      if (!win) {
        setError("Allow pop-ups to print the payslip.");
        return;
      }
      win.document.write(`<!doctype html><html><head><title>Payslip</title>
        <style>body{font-family:sans-serif;padding:32px;color:#071a33}h1{margin:0 0 8px}p{margin:4px 0}table{border-collapse:collapse;margin-top:16px;width:100%}td{border:1px solid #ccc;padding:6px}</style></head>
        <body>
          <h1>${escHtml(rec.instituteName || "Payslip")}</h1>
          <p>${escHtml(rec.employeeName)} (${escHtml(rec.employeeCode)})</p>
          <p>${escHtml(rec.designation)} · ${escHtml(rec.department)}</p>
          <p>${escHtml(String(rec.month))}/${escHtml(String(rec.year))} · Present ${rec.presentDays ?? "—"}/${rec.workingDays ?? "—"} weekdays</p>
          <table>
            <tr><td>Basic</td><td>${escHtml(formatInr(rec.basic))}</td></tr>
            <tr><td>HRA</td><td>${escHtml(formatInr(rec.hra))}</td></tr>
            <tr><td>Special</td><td>${escHtml(formatInr(rec.special))}</td></tr>
            <tr><td>Variable pay</td><td>${escHtml(formatInr(rec.variablePay))}</td></tr>
            <tr><td>Commission</td><td>${escHtml(formatInr(rec.commissionPay))}</td></tr>
            <tr><td>Gross</td><td>${escHtml(formatInr(rec.gross))}</td></tr>
            <tr><td>LOP (${rec.lopDays ?? 0} days)</td><td>${escHtml(formatInr(rec.lopDeduction))}</td></tr>
            <tr><td>PF (employee)</td><td>${escHtml(formatInr(rec.pfEmployee))}</td></tr>
            <tr><td>ESI (employee)</td><td>${escHtml(formatInr(rec.esiEmployee))}</td></tr>
            <tr><td>Professional tax</td><td>${escHtml(formatInr(rec.ptEmployee))}</td></tr>
            <tr><td>TDS</td><td>${escHtml(formatInr(rec.tdsEmployee))}</td></tr>
            <tr><td>PF (employer)</td><td>${escHtml(formatInr(rec.pfEmployer))}</td></tr>
            <tr><td>ESI (employer)</td><td>${escHtml(formatInr(rec.esiEmployer))}</td></tr>
            <tr><td>Net pay</td><td>${escHtml(formatInr(rec.net))}</td></tr>
          </table>
          <script>window.print()<\/script>
        </body></html>`);
      win.document.close();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const stat = statutory.data;

  return (
    <>
      <ErrorText error={error || slips.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {hr && (
        <Card title="Statutory settings">
          <p className="mb-3 text-sm text-slate-500">Configure PF, ESI, professional tax, TDS, and loss-of-pay rules for payroll runs.</p>
          <FormGrid>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pfEnabled} onChange={(e) => setPfEnabled(e.target.checked)} /> PF enabled</label>
            <Field label="PF rate" value={pfRate} onChange={setPfRate} placeholder="0.12" />
            <Field label="PF wage cap" value={pfWageCap} onChange={setPfWageCap} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={esiEnabled} onChange={(e) => setEsiEnabled(e.target.checked)} /> ESI enabled</label>
            <Field label="ESI employee rate" value={esiEmployeeRate} onChange={setEsiEmployeeRate} />
            <Field label="ESI employer rate" value={esiEmployerRate} onChange={setEsiEmployerRate} />
            <Field label="ESI wage cap" value={esiWageCap} onChange={setEsiWageCap} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ptEnabled} onChange={(e) => setPtEnabled(e.target.checked)} /> Professional tax</label>
            <Field label="PT amount / month" value={ptAmount} onChange={setPtAmount} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tdsEnabled} onChange={(e) => setTdsEnabled(e.target.checked)} /> TDS enabled</label>
            <Field label="TDS rate on gross" value={tdsRate} onChange={setTdsRate} placeholder="0.05" />
            <label className="col-span-full flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lopEnabled} onChange={(e) => setLopEnabled(e.target.checked)} />
              Deduct LOP from absent days
            </label>
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton onClick={() => void saveSettings()}>Save settings</PrimaryButton>
          </div>
        </Card>
      )}
      {hr && (
        <Card title="Salary structure">
          <p className="mb-3 text-sm text-slate-500">Basic + HRA + special allowance per employee.</p>
          <Table
            empty="No salary structures yet."
            columns={["Employee", "Basic", "HRA", "Special", "From"]}
            rows={(structures.data ?? []).map((s) => [
              s.employeeName || "—",
              formatInr(s.basic),
              formatInr(s.hra),
              formatInr(s.special),
              formatDay(s.effectiveFrom) || "—",
            ])}
          />
          <FormGrid>
            <Select label="Employee" value={employeeId} onChange={setEmployeeId} options={(people.data ?? []).map((e) => ({ value: e.id, label: e.fullName }))} />
            <Field label="Basic" value={basic} onChange={setBasic} placeholder="25000" />
            <Field label="HRA" value={hra} onChange={setHra} placeholder="10000" />
            <Field label="Special" value={special} onChange={setSpecial} placeholder="5000" />
            <Field label="Effective from" type="date" value={effectiveFrom} onChange={setEffectiveFrom} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!employeeId || !basic} onClick={() => void saveStructure()}>Save structure</PrimaryButton>
          </div>
        </Card>
      )}
      {hr && stat && (
        <Card title={`Statutory summary — ${month}/${year}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <p><span className="text-slate-500">Employees</span><br /><strong>{stat.employeeCount ?? 0}</strong> ({stat.publishedCount ?? 0} published, {stat.draftCount ?? 0} draft)</p>
            <p><span className="text-slate-500">Gross / Net</span><br /><strong>{formatInr(stat.totalGross)}</strong> / {formatInr(stat.totalNet)}</p>
            <p><span className="text-slate-500">PF (EE + ER)</span><br /><strong>{formatInr(stat.totalPfEmployee)}</strong> + {formatInr(stat.totalPfEmployer)}</p>
            <p><span className="text-slate-500">ESI (EE + ER)</span><br /><strong>{formatInr(stat.totalEsiEmployee)}</strong> + {formatInr(stat.totalEsiEmployer)}</p>
            <p><span className="text-slate-500">PT / TDS / LOP</span><br />{formatInr(stat.totalPt)} / {formatInr(stat.totalTds)} / {formatInr(stat.totalLop)}</p>
          </div>
        </Card>
      )}
      <Card title="Payslips">
        {hr && (
          <>
            <FormGrid>
              <Field label="Year" value={year} onChange={setYear} />
              <Field label="Month" value={month} onChange={setMonth} placeholder="1-12" />
            </FormGrid>
            <div className="mb-3 mt-3 flex flex-wrap gap-2">
              <PrimaryButton onClick={() => void runPreview()}>Preview payroll</PrimaryButton>
              <PrimaryButton onClick={() => void run()}>Run payroll</PrimaryButton>
              <PrimaryButton onClick={() => void publishAll()}>Publish all drafts</PrimaryButton>
              <PrimaryButton onClick={() => void exportRegister()}>Export register</PrimaryButton>
            </div>
          </>
        )}
        {preview && (
          <Table
            empty="Nothing to preview."
            columns={["Employee", "Gross", "LOP", "PF", "ESI", "PT", "Net", "Note"]}
            rows={preview.map((p) => [
              p.employeeName || "—",
              formatInr(p.gross),
              formatInr(p.lopDeduction),
              formatInr(p.pfEmployee),
              formatInr(p.esiEmployee),
              formatInr(p.ptEmployee),
              formatInr(p.net),
              p.skipped || p.exists ? "Already exists" : "Will create",
            ])}
          />
        )}
        <Table
          empty="No payslips yet."
          columns={["Employee", "Period", "Gross", "LOP", "Deductions", "Net", "Status", ""]}
          rows={(slips.data ?? []).map((p) => [
            p.employeeName || "—",
            `${p.month}/${p.year}`,
            formatInr(p.gross),
            formatInr(p.lopDeduction),
            formatInr(p.deductions),
            formatInr(p.net),
            prettyLabel(p.status),
            <span key={p.id} className="flex gap-2">
              {(hr || p.status === "PUBLISHED") && <LinkButton onClick={() => void printSlip(p.id)}>Print</LinkButton>}
              {hr && p.status === "DRAFT" && <LinkButton onClick={() => void publishSlip(p.id)}>Publish</LinkButton>}
            </span>,
          ])}
        />
      </Card>
    </>
  );
}

function HiringTab() {
  const jobs = useApi<Vacancy[]>("/api/staff-vacancies");
  const applicants = useApi<Candidate[]>("/api/staff-candidates");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [openings, setOpenings] = useState("1");
  const [description, setDescription] = useState("");
  const [vacancyId, setVacancyId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  async function addJob() {
    setError(null);
    try {
      await createRecord("/api/staff-vacancies", { title, department, openings, description });
      setTitle("");
      setDepartment("");
      setDescription("");
      jobs.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addApplicant() {
    setError(null);
    try {
      await createRecord("/api/staff-candidates", { vacancyId, fullName, email, phone });
      setFullName("");
      setEmail("");
      setPhone("");
      applicants.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function advance(id: string, status: string) {
    setError(null);
    try {
      await api(`/api/actions/ess/candidates/${id}/advance`, { method: "POST", body: JSON.stringify({ status }) });
      applicants.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function hire(id: string) {
    setError(null);
    setNotice(null);
    try {
      const out = await api<{ employee?: Employee }>(`/api/actions/ess/candidates/${id}/hire`, {
        method: "POST",
        body: JSON.stringify({ employmentType: "FACULTY", createLogin: false }),
      });
      applicants.reload();
      jobs.reload();
      setNotice(`${out.employee?.fullName || "Candidate"} is now on the employee master.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Institute jobs">
        <p className="mb-3 text-sm text-slate-500">Hire faculty and counselors here. Student placement ATS stays under Placement.</p>
        <Table
          empty="No openings yet."
          columns={["Title", "Department", "Openings", "Status"]}
          rows={(jobs.data ?? []).map((j) => [j.title, j.department || "—", String(j.openings ?? 1), prettyLabel(j.status)])}
        />
        <FormGrid>
          <Field label="Title" value={title} onChange={setTitle} placeholder="Java faculty" />
          <Field label="Department" value={department} onChange={setDepartment} />
          <Field label="Openings" value={openings} onChange={setOpenings} />
        </FormGrid>
        <div className="mt-3">
          <TextArea label="Description" value={description} onChange={setDescription} rows={3} />
        </div>
        <div className="mt-3">
          <PrimaryButton disabled={!title} onClick={() => void addJob()}>
            Post job
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Applicants">
        <Table
          empty="No applicants yet."
          columns={["Name", "Job", "Status", ""]}
          rows={(applicants.data ?? []).map((c) => [
            c.fullName,
            c.jobTitle || "—",
            prettyLabel(c.status),
            c.status === "HIRED" ? (
              "Hired"
            ) : (
              <span key={c.id} className="flex flex-wrap gap-2">
                {c.status === "APPLIED" && <LinkButton onClick={() => void advance(c.id, "INTERVIEW")}>Interview</LinkButton>}
                {c.status === "INTERVIEW" && <LinkButton onClick={() => void advance(c.id, "OFFER")}>Offer</LinkButton>}
                {c.status === "OFFER" && <LinkButton onClick={() => void hire(c.id)}>Hire</LinkButton>}
                <LinkButton onClick={() => void advance(c.id, "REJECTED")}>Reject</LinkButton>
              </span>
            ),
          ])}
        />
        <FormGrid>
          <Select
            label="Job"
            value={vacancyId}
            onChange={setVacancyId}
            options={(jobs.data ?? []).filter((j) => j.status !== "CLOSED").map((j) => ({ value: j.id, label: j.title }))}
          />
          <Field label="Name" value={fullName} onChange={setFullName} />
          <Field label="Email" value={email} onChange={setEmail} />
          <Field label="Phone" value={phone} onChange={setPhone} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!vacancyId || !fullName} onClick={() => void addApplicant()}>
            Add applicant
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function DevicesTab() {
  const { user } = useAuth();
  const punches = useApi<Punch[]>("/api/biometric-punches");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [deviceId, setDeviceId] = useState("GATE-1");
  const [punchType, setPunchType] = useState("IN");
  const [codes, setCodes] = useState("");
  const punchUrl = useMemo(() => {
    if (!user?.orgSlug) return null;
    return `/api/public/sites/${user.orgSlug}/punch`;
  }, [user?.orgSlug]);

  async function punch() {
    setError(null);
    setNotice(null);
    try {
      const out = await api<Punch & { employeeName?: string; studentName?: string }>("/api/actions/attendance/biometric", {
        method: "POST",
        body: JSON.stringify({ code, deviceId, punchType }),
      });
      punches.reload();
      setNotice(`Punched ${out.employeeName || out.studentName || code} (${prettyLabel(out.punchType)}).`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function importCodes() {
    setError(null);
    setNotice(null);
    try {
      const out = await api<unknown[]>("/api/actions/ess/punches/import", {
        method: "POST",
        body: JSON.stringify({ codes, deviceId, punchType }),
      });
      punches.reload();
      setCodes("");
      setNotice(`Imported ${out.length} punch(es).`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || punches.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Device punch">
        <p className="mb-3 text-sm text-slate-500">
          Match staff by employee code or mobile. Students match by student code, roll number, or mobile. Devices can POST JSON
          {" "}
          <code className="text-xs">{`{ "code", "deviceId", "punchType" }`}</code>
          {punchUrl ? (
            <>
              {" "}
              to <code className="text-xs">{punchUrl}</code>.
            </>
          ) : (
            <> once your institute website slug is set (Institute settings).</>
          )}
        </p>
        <FormGrid>
          <Field label="Code or mobile" value={code} onChange={setCode} placeholder="EMP-0001 or 10-digit mobile" />
          <Field label="Device" value={deviceId} onChange={setDeviceId} />
          <Select
            label="Punch"
            value={punchType}
            onChange={setPunchType}
            allowEmpty={false}
            options={[
              { value: "IN", label: "In" },
              { value: "OUT", label: "Out" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!code} onClick={() => void punch()}>
            Record punch
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Import codes">
        <TextArea label="One employee or student code per line" value={codes} onChange={setCodes} rows={5} />
        <div className="mt-3">
          <PrimaryButton disabled={!codes.trim()} onClick={() => void importCodes()}>
            Import
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Recent punches">
        <Table
          empty="No device punches yet."
          columns={["When", "Type", "Device", "Staff / student"]}
          rows={(punches.data ?? []).map((p) => [
            formatWhen(p.punchAt) || "—",
            prettyLabel(p.punchType),
            p.deviceId || "—",
            p.employeeName || p.studentName || (p.employeeId ? "Staff" : p.studentId ? "Student" : "—"),
          ])}
        />
      </Card>
    </>
  );
}

function CompensationTab() {
  const employees = useApi<Employee[]>("/api/employees");
  const plans = useApi<{ id: string; employeeId: string; employeeName: string; planType: string; rateAmount?: number; effectiveFrom?: string }[]>(
    "/api/compensation-plans",
  );
  const ledger = useApi<{ employeeName: string; sourceType: string; amount: number; description?: string; status: string; periodMonth?: number; periodYear?: number }[]>(
    "/api/commission-ledger",
  );
  const settings = useApi<{ conversionFlat?: number; feePercent?: number; enabled?: boolean }>("/api/actions/compensation/settings");
  const facultyPreview = useApi<{ employeeName: string; planType: string; variablePay: number }[]>("/api/actions/compensation/faculty/preview");
  const [employeeId, setEmployeeId] = useState("");
  const [planType, setPlanType] = useState("HOURLY");
  const [rateAmount, setRateAmount] = useState("500");
  const [conversionFlat, setConversionFlat] = useState("500");
  const [feePercent, setFeePercent] = useState("0.02");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data?.conversionFlat != null) setConversionFlat(String(settings.data.conversionFlat));
    if (settings.data?.feePercent != null) setFeePercent(String(settings.data.feePercent));
  }, [settings.data]);

  async function saveSettings() {
    setError(null);
    setNotice(null);
    try {
      await api("/api/actions/compensation/settings", {
        method: "PUT",
        body: JSON.stringify({ conversionFlat, feePercent, enabled: true }),
      });
      settings.reload();
      setNotice("Commission rules saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function savePlan() {
    setError(null);
    setNotice(null);
    try {
      await api("/api/actions/compensation/plans", {
        method: "POST",
        body: JSON.stringify({ employeeId, planType, rateAmount }),
      });
      plans.reload();
      facultyPreview.reload();
      setNotice("Compensation plan saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Counselor commission rules">
        <p className="mb-3 text-sm text-slate-500">Flat payout on lead conversion plus a percentage of captured fee payments.</p>
        <FormGrid>
          <Field label="Conversion flat ₹" value={conversionFlat} onChange={setConversionFlat} />
          <Field label="Fee collection %" value={feePercent} onChange={setFeePercent} placeholder="0.02 = 2%" />
          <div className="flex items-end">
            <PrimaryButton onClick={() => void saveSettings()}>Save rules</PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Faculty compensation plan">
        <p className="mb-3 text-sm text-slate-500">Set hourly or per-batch variable pay for faculty employees linked to staff logins.</p>
        <FormGrid>
          <Select
            label="Employee"
            value={employeeId}
            onChange={setEmployeeId}
            options={(employees.data ?? []).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employmentType || "staff"})` }))}
          />
          <Select
            label="Plan type"
            value={planType}
            onChange={setPlanType}
            options={[
              { value: "HOURLY", label: "Hourly (from attendance punches)" },
              { value: "PER_BATCH", label: "Per batch" },
              { value: "FIXED", label: "Fixed only (salary structure)" },
            ]}
          />
          <Field label="Rate ₹" value={rateAmount} onChange={setRateAmount} />
          <div className="flex items-end">
            <PrimaryButton disabled={!employeeId} onClick={() => void savePlan()}>
              Save plan
            </PrimaryButton>
          </div>
        </FormGrid>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Table
            empty="No plans yet."
            columns={["Employee", "Type", "Rate", "From"]}
            rows={(plans.data ?? []).map((p) => [p.employeeName, p.planType, p.rateAmount ?? 0, p.effectiveFrom || "—"])}
          />
          <Table
            empty="No faculty variable pay this month."
            columns={["Faculty", "Plan", "Variable pay"]}
            rows={(facultyPreview.data ?? []).map((p) => [p.employeeName, p.planType, formatInr(p.variablePay)])}
          />
        </div>
      </Card>
      <Card title="Commission ledger">
        <Table
          empty="Commissions accrue when leads convert or fees are collected."
          columns={["Employee", "Type", "Amount", "Period", "Status", "Note"]}
          rows={(ledger.data ?? []).map((r) => [
            r.employeeName,
            prettyLabel(r.sourceType),
            formatInr(r.amount),
            `${r.periodMonth}/${r.periodYear}`,
            prettyLabel(r.status),
            r.description || "—",
          ])}
        />
      </Card>
    </>
  );
}

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
