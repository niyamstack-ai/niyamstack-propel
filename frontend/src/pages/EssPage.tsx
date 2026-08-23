import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
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
  managerId?: string;
  managerName?: string;
  status?: string;
  employmentType?: string;
  hasLogin?: boolean;
  cl?: number;
  sl?: number;
  el?: number;
  tempPassword?: string;
  loginEmail?: string;
};
type Attendance = { id: string; employeeId: string; employeeName?: string; workDate?: string; shift?: string; status?: string; source?: string; inTime?: string; outTime?: string };
type Punch = { id: string; employeeId?: string; studentId?: string; deviceId?: string; punchAt?: string; punchType?: string; employeeName?: string; studentName?: string };
type Leave = { id: string; employeeId: string; employeeName?: string; leaveType?: string; fromDate?: string; toDate?: string; days?: number; reason?: string; status?: string };
type Balance = { id: string; employeeId: string; employeeName?: string; year?: number; cl?: number; sl?: number; el?: number };
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
  gross?: number;
  pfEmployee?: number;
  esiEmployee?: number;
  pfEmployer?: number;
  esiEmployer?: number;
  deductions?: number;
  net?: number;
  status?: string;
  instituteName?: string;
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

const TABS = ["employees", "attendance", "leave", "payroll", "hiring", "devices"] as const;
type Tab = (typeof TABS)[number];

export function EssPage() {
  const { user } = useAuth();
  const hr = user?.role === "OWNER" || user?.role === "ACCOUNTANT";
  const [tab, setTab] = useState<Tab>(hr ? "employees" : "attendance");
  const tabs = hr ? TABS : (["attendance", "leave", "payroll"] as const);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">ESS</h1>
        <p className="text-sm text-slate-500">
          {hr
            ? "Employee master, staff attendance, leave, payroll, and institute hiring. Staff logins stay under People → Staff."
            : "Mark attendance, apply for leave, and download your payslip."}
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
      {tab === "employees" && hr && <EmployeesTab />}
      {tab === "attendance" && <AttendanceTab hr={hr} />}
      {tab === "leave" && <LeaveTab hr={hr} />}
      {tab === "payroll" && <PayrollTab hr={hr} />}
      {tab === "hiring" && hr && <HiringTab />}
      {tab === "devices" && hr && <DevicesTab />}
    </div>
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
      const out = await api<{ loginEmail?: string; tempPassword?: string }>(`/api/actions/ess/employees/${id}/login`, {
        method: "POST",
        body: JSON.stringify({ loginRole }),
      });
      people.reload();
      setNotice(out.tempPassword ? `Login ${out.loginEmail}. Temporary password: ${out.tempPassword}` : `Already has login ${out.loginEmail}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || people.error} />
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
            options={(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Manager"
            value={managerId}
            onChange={setManagerId}
            options={(people.data ?? []).map((e) => ({ value: e.id, label: e.fullName }))}
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
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState(today());
  const [shift, setShift] = useState("FULL");
  const [status, setStatus] = useState("PRESENT");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");

  const options = people.data ?? [];
  const selfId = options[0]?.id ?? "";

  async function mark() {
    setError(null);
    try {
      await api("/api/actions/ess/attendance", {
        method: "POST",
        body: JSON.stringify({
          employeeId: hr ? employeeId || selfId : selfId,
          workDate,
          shift,
          status,
          inTime: inTime || null,
          outTime: outTime || null,
        }),
      });
      rows.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || rows.error || people.error} />
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
          <PrimaryButton onClick={() => void mark()}>Save attendance</PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function LeaveTab({ hr }: { hr: boolean }) {
  const people = useApi<Employee[]>("/api/employees");
  const leaves = useApi<Leave[]>("/api/leave-requests");
  const bals = useApi<Balance[]>("/api/leave-balances");
  const now = new Date();
  const calendar = useApi<Leave[]>(`/api/actions/ess/leave/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  const [error, setError] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState("CL");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [reason, setReason] = useState("");

  async function apply() {
    setError(null);
    try {
      await api("/api/actions/ess/leave", {
        method: "POST",
        body: JSON.stringify({ employeeId: hr ? employeeId || undefined : undefined, leaveType, fromDate, toDate, reason }),
      });
      leaves.reload();
      bals.reload();
      calendar.reload();
      setReason("");
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

  return (
    <>
      <ErrorText error={error || leaves.error} />
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
            hr && r.status === "PENDING" ? (
              <span key={r.id} className="flex gap-2">
                <LinkButton onClick={() => void decide(r.id, true)}>Approve</LinkButton>
                <LinkButton onClick={() => void decide(r.id, false)}>Reject</LinkButton>
              </span>
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
          <PrimaryButton onClick={() => void apply()}>Submit leave</PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function PayrollTab({ hr }: { hr: boolean }) {
  const people = useApi<Employee[]>("/api/employees");
  const structures = useApi<Structure[]>("/api/salary-structures");
  const slips = useApi<Payslip[]>("/api/payslips");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [basic, setBasic] = useState("");
  const [hra, setHra] = useState("");
  const [special, setSpecial] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

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

  async function run() {
    setError(null);
    setNotice(null);
    try {
      const out = await api<Payslip[]>("/api/actions/ess/payroll/run", {
        method: "POST",
        body: JSON.stringify({ year, month }),
      });
      slips.reload();
      setNotice(out.length ? `Created ${out.length} payslip(s). Employees without a salary structure were skipped.` : "No new payslips. Either they already exist or no salary structures are saved.");
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
          <p>${escHtml(String(rec.month))}/${escHtml(String(rec.year))}</p>
          <table>
            <tr><td>Basic</td><td>${escHtml(formatInr(rec.basic))}</td></tr>
            <tr><td>HRA</td><td>${escHtml(formatInr(rec.hra))}</td></tr>
            <tr><td>Special</td><td>${escHtml(formatInr(rec.special))}</td></tr>
            <tr><td>Gross</td><td>${escHtml(formatInr(rec.gross))}</td></tr>
            <tr><td>PF (employee)</td><td>${escHtml(formatInr(rec.pfEmployee))}</td></tr>
            <tr><td>ESI (employee)</td><td>${escHtml(formatInr(rec.esiEmployee))}</td></tr>
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

  return (
    <>
      <ErrorText error={error || slips.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {hr && (
        <Card title="Salary structure">
          <p className="mb-3 text-sm text-slate-500">Basic + HRA + special. Payroll deducts PF (12% of basic, capped at ₹1,800) and ESI (0.75% of gross if gross is ₹21,000 or less).</p>
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
            <Select
              label="Employee"
              value={employeeId}
              onChange={setEmployeeId}
              options={(people.data ?? []).map((e) => ({ value: e.id, label: e.fullName }))}
            />
            <Field label="Basic" value={basic} onChange={setBasic} placeholder="25000" />
            <Field label="HRA" value={hra} onChange={setHra} placeholder="10000" />
            <Field label="Special" value={special} onChange={setSpecial} placeholder="5000" />
            <Field label="Effective from" type="date" value={effectiveFrom} onChange={setEffectiveFrom} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!employeeId || !basic} onClick={() => void saveStructure()}>
              Save structure
            </PrimaryButton>
          </div>
        </Card>
      )}
      <Card title="Payslips">
        {hr && (
          <FormGrid>
            <Field label="Year" value={year} onChange={setYear} />
            <Field label="Month" value={month} onChange={setMonth} placeholder="1-12" />
          </FormGrid>
        )}
        {hr && (
          <div className="mb-3 mt-3">
            <PrimaryButton onClick={() => void run()}>Run payroll</PrimaryButton>
          </div>
        )}
        <Table
          empty="No payslips yet."
          columns={["Employee", "Period", "Gross", "Deductions", "Net", ""]}
          rows={(slips.data ?? []).map((p) => [
            p.employeeName || "—",
            `${p.month}/${p.year}`,
            formatInr(p.gross),
            formatInr(p.deductions),
            formatInr(p.net),
            <LinkButton key={p.id} onClick={() => void printSlip(p.id)}>
              Print
            </LinkButton>,
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
    const slug = user?.orgSlug || "your-slug";
    return `/api/public/sites/${slug}/punch`;
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
          <code className="text-xs">{`{ "code", "deviceId", "punchType" }`}</code> to <code className="text-xs">{punchUrl}</code>.
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
            p.employeeId ? "Staff" : p.studentId ? "Student" : "—",
          ])}
        />
      </Card>
    </>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
