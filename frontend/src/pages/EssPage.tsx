import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { createRecord, deleteRecord, updateRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { hasGrowthTier } from "../packs";
import { Card, ErrorText, Field, FileUpload, FormGrid, LinkButton, PrimaryButton, Select, Table, TextArea, formatDay, formatInr, formatWhen, useApi, PhoneField, phoneForApi } from "../ui";
import type { EssOutletAccess } from "./EssShell";

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
  department?: string;
  fullName: string;
  email?: string;
  phone?: string;
  status?: string;
  interviewAt?: string;
  offerCtc?: number;
  offerJoiningDate?: string;
  letterNo?: string;
  offerLetterStatus?: string;
  offerSentAt?: string;
  offerSentChannel?: string;
  canViewLetter?: boolean;
  canSendLetter?: boolean;
  canEditLetter?: boolean;
  letterContent?: string;
  jobDescription?: string;
  hiredEmployeeId?: string;
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
type Doc = {
  id: string;
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  docType?: string;
  fileName?: string;
  storageUrl?: string;
  status?: string;
  reviewNote?: string;
  createdAt?: string;
  canReview?: boolean;
};
type KycSummary = {
  pendingDocuments?: number;
  approvedDocuments?: number;
  rejectedDocuments?: number;
  employeesMissingBankOrPan?: number;
};
type ManagerInbox = {
  pendingLeave?: number;
  pendingRegularization?: number;
  pendingResignation?: number;
  leave?: Leave[];
  regularization?: Reg[];
  resignation?: Resign[];
  teamSize?: number;
};

type EssSection =
  | "dashboard"
  | "employees"
  | "documents"
  | "hiring"
  | "offer-create"
  | "settings"
  | "payroll"
  | "payslips"
  | "attendance"
  | "leave"
  | "exit"
  | "compensation"
  | "team"
  | "devices"
  | "profile";

type EssConfig = {
  instituteName?: string;
  organization?: { signatoryName?: string; signatoryTitle?: string; logoUrl?: string };
  offerLetterTemplate?: string;
  revisionLetterTemplate?: string;
  payslipTemplate?: string;
  emailTemplate?: string;
  jobDescriptions?: { id?: string; role: string; body: string }[];
  lookups?: {
    departments?: string[];
    roles?: string[];
    documentTypes?: string[];
    statuses?: string[];
  };
  placeholders?: string[];
};

function useEssAccess(): EssOutletAccess {
  const ctx = useOutletContext<EssOutletAccess | null>();
  const { user } = useAuth();
  if (ctx) return ctx;
  const hr = user?.role === "OWNER" || (user?.capabilities ?? []).includes("ESS_MANAGE");
  const payroll = hr || user?.role === "ACCOUNTANT";
  const manager = hr || (user?.capabilities ?? []).includes("LEAVE_APPROVE");
  const growth = hasGrowthTier(user?.packageTier, user?.modules);
  return { hr, payroll, manager, growth };
}

function sectionAllowed(section: EssSection, access: EssOutletAccess) {
  switch (section) {
    case "employees":
    case "hiring":
    case "offer-create":
    case "settings":
    case "devices":
      return access.hr;
    case "payroll":
      return access.payroll;
    case "compensation":
      return access.payroll && access.growth;
    case "team":
      return access.manager;
    default:
      return true;
  }
}

function fallbackSection(access: EssOutletAccess): EssSection {
  if (access.hr) return "dashboard";
  if (access.payroll) return "payroll";
  if (access.manager) return "team";
  return "profile";
}

export function EssPage() {
  const { section: raw } = useParams<{ section?: string }>();
  const access = useEssAccess();
  const section = ((raw || "dashboard") as EssSection);

  if (!sectionAllowed(section, access)) {
    return <Navigate to={`/ess/${fallbackSection(access)}`} replace />;
  }

  return (
    <div className="space-y-6">
      {section === "dashboard" && <EssDashboard access={access} />}
      {section === "employees" && access.hr && <EmployeesSection />}
      {section === "documents" && <DocumentsSection hr={access.hr} />}
      {section === "hiring" && access.hr && <HiringSection />}
      {section === "offer-create" && access.hr && <OfferCreateSection />}
      {section === "settings" && access.hr && <EssSettingsSection />}
      {section === "payroll" && access.payroll && <PayrollSection hr={access.hr || access.payroll} />}
      {section === "payslips" && <PayslipsSection hr={access.hr || access.payroll} />}
      {section === "attendance" && <AttendanceSection hr={access.hr || access.payroll} />}
      {section === "leave" && <LeaveSection hr={access.hr} manager={access.manager} />}
      {section === "exit" && <ExitSection hr={access.hr} manager={access.manager} />}
      {section === "compensation" && access.payroll && access.growth && <CompensationSection />}
      {section === "team" && access.manager && <TeamSection hr={access.hr} />}
      {section === "devices" && access.hr && <DevicesSection />}
      {section === "profile" && <ProfileSection hr={access.hr} />}
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      <p className="text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function EssDashboard({ access }: { access: EssOutletAccess }) {
  const people = useApi<Employee[]>(access.hr || access.payroll ? "/api/employees" : "");
  const slips = useApi<Payslip[]>("/api/payslips");
  const leaves = useApi<Leave[]>("/api/leave-requests");
  const inbox = useApi<ManagerInbox>(access.manager ? "/api/actions/ess/manager/inbox" : "");
  const kyc = useApi<KycSummary>(access.hr ? "/api/actions/ess/kyc/summary" : "");

  const total = people.data?.length ?? 0;
  const active = (people.data ?? []).filter((e) => (e.status || "ACTIVE") === "ACTIVE").length;
  const pendingKyc = kyc.data?.pendingDocuments ?? (people.data ?? []).filter((e) => !e.pan || !e.bankAccount).length;
  const publishedSlips = (slips.data ?? []).filter((s) => s.status === "PUBLISHED").length;
  const pendingLeave = (leaves.data ?? []).filter((l) => l.status === "PENDING").length;

  const workflow = [
    { label: "Create employee profile and login", to: "/ess/employees", status: total > 0 ? "Ready" : "Draft", ok: total > 0 },
    { label: "Verify KYC and bank details", to: "/ess/documents", status: pendingKyc === 0 && total > 0 ? "Verified" : "Pending", ok: pendingKyc === 0 && total > 0 },
    { label: "Issue offer / hire candidate", to: "/ess/hiring", status: "Open", ok: true, hrOnly: true },
    { label: "Run monthly payroll and publish payslips", to: "/ess/payroll", status: publishedSlips > 0 ? "Published" : "Pending", ok: publishedSlips > 0 },
  ];

  return (
    <>
      <PageHeader
        title="ESS Admin Dashboard"
        subtitle="Employee master, attendance, leave, payroll, and hiring — one workspace."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total employees" value={String(total)} />
        <StatCard label="Active employees" value={String(active)} />
        <StatCard label="Pending KYC docs" value={String(pendingKyc)} />
        <StatCard label="Payslips published" value={String(publishedSlips)} />
      </div>
      {(access.manager || pendingLeave > 0) && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Pending leave" value={String(inbox.data?.pendingLeave ?? pendingLeave)} />
          <StatCard label="Pending regularizations" value={String(inbox.data?.pendingRegularization ?? 0)} />
          <StatCard label="Pending resignations" value={String(inbox.data?.pendingResignation ?? 0)} />
        </div>
      )}
      <Card title="Quick actions">
        <div className="flex flex-wrap gap-2">
          {access.hr && (
            <Link className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white" to="/ess/employees">
              + Add employee
            </Link>
          )}
          {access.payroll && (
            <Link className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-navy" to="/ess/payroll">
              Run payroll
            </Link>
          )}
          <Link className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-navy" to="/ess/payslips">
            Payslips
          </Link>
          <Link className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-navy" to="/ess/leave">
            Leave requests
          </Link>
        </div>
      </Card>
      <Card title="Operational flow">
        <ul className="space-y-3">
          {workflow
            .filter((step) => !step.hrOnly || access.hr)
            .map((step) => (
              <li key={step.label} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
                <Link className="text-sm font-medium text-navy hover:underline" to={step.to}>
                  {step.label}
                </Link>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${step.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                  {step.status}
                </span>
              </li>
            ))}
        </ul>
      </Card>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card title={label}>
      <p className="text-3xl font-bold text-navy">{value}</p>
    </Card>
  );
}

function EmployeesSection() {
  return (
    <>
      <PageHeader title="Employees" subtitle="Employee master — profiles, roles, and portal logins." />
      <EmployeesTab />
    </>
  );
}

function DocumentsSection({ hr }: { hr: boolean }) {
  return (
    <>
      <PageHeader
        title="KYC & Bank"
        subtitle={
          hr
            ? "Staff upload documents. Review and approve here before payroll."
            : "Upload identity and bank proofs. HR will verify them."
        }
      />
      {hr ? <HrKycInbox /> : <StaffKycUpload />}
    </>
  );
}

function statusBadge(status?: string) {
  const s = (status || "PENDING").toUpperCase();
  const cls =
    s === "APPROVED"
      ? "bg-emerald-50 text-emerald-800"
      : s === "REJECTED"
        ? "bg-red-50 text-red-800"
        : "bg-amber-50 text-amber-900";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{prettyLabel(s)}</span>;
}

function letterStatusBadge(status?: string) {
  const s = (status || "DRAFT").toUpperCase();
  const cls =
    s === "PUBLISHED"
      ? "bg-emerald-50 text-emerald-800"
      : s === "SENT_FOR_SIGNATURE"
        ? "bg-amber-100 text-amber-950"
        : "bg-slate-100 text-slate-700";
  const label =
    s === "SENT_FOR_SIGNATURE" ? "Sent For Signature" : s === "PUBLISHED" ? "Published" : "Draft";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function fieldBadge(ok: boolean, okLabel: string, badLabel: string) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
      {ok ? okLabel : badLabel}
    </span>
  );
}

function HrKycInbox() {
  const summary = useApi<KycSummary>("/api/actions/ess/kyc/summary");
  const people = useApi<Employee[]>("/api/employees");
  const allDocs = useApi<Doc[]>("/api/actions/ess/kyc/documents");
  const [filter, setFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const docs = useApi<Doc[]>(`/api/actions/ess/kyc/documents${filter === "ALL" ? "" : `?status=${filter}`}`);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [uploadEmployeeId, setUploadEmployeeId] = useState("");
  const [docType, setDocType] = useState("PAN_CARD");
  const [fileName, setFileName] = useState("");
  const [storageUrl, setStorageUrl] = useState("");
  const [markApproved, setMarkApproved] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState("");
  const [pan, setPan] = useState("");
  const [uan, setUan] = useState("");
  const [esiNumber, setEsiNumber] = useState("");
  const [verifySearch, setVerifySearch] = useState("");
  const [verifyFilter, setVerifyFilter] = useState<"ALL" | "MISSING" | "VERIFIED">("ALL");

  const sortedPeople = useMemo(
    () => (people.data ?? []).slice().sort((a, b) => (a.employeeCode || "").localeCompare(b.employeeCode || "")),
    [people.data],
  );

  const docsByEmployee = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of allDocs.data ?? []) {
      if (!d.employeeId) continue;
      const list = map.get(d.employeeId) ?? [];
      list.push(d);
      map.set(d.employeeId, list);
    }
    return map;
  }, [allDocs.data]);

  function approvedDoc(employeeId: string, types: string[]) {
    const want = new Set(types.map((t) => t.toUpperCase()));
    return (
      (docsByEmployee.get(employeeId) ?? []).find(
        (d) => (d.status || "").toUpperCase() === "APPROVED" && want.has((d.docType || "").toUpperCase()) && !!d.storageUrl,
      ) ||
      (docsByEmployee.get(employeeId) ?? []).find(
        (d) => (d.status || "").toUpperCase() === "APPROVED" && want.has((d.docType || "").toUpperCase()),
      ) ||
      null
    );
  }

  function hasApprovedDoc(employeeId: string, types: string[]) {
    return !!approvedDoc(employeeId, types);
  }

  function pendingDocCount(employeeId: string) {
    return (docsByEmployee.get(employeeId) ?? []).filter((d) => (d.status || "PENDING").toUpperCase() === "PENDING").length;
  }

  function panVerified(e: Employee) {
    return !!e.pan?.trim() || hasApprovedDoc(e.id, ["PAN_CARD", "PAN"]);
  }

  function bankVerified(e: Employee) {
    return !!e.bankAccount?.trim() || hasApprovedDoc(e.id, ["BANK_PROOF", "BANK"]);
  }

  function verifyCell(ok: boolean, labelWhenOk: string, doc: Doc | null, key: string) {
    if (!ok) return fieldBadge(false, "Verified", "Missing");
    return (
      <span key={key} className="inline-flex flex-wrap items-center gap-2">
        {fieldBadge(true, labelWhenOk, "Missing")}
        {doc?.storageUrl ? (
          <a href={doc.storageUrl} className="text-sm font-semibold text-brand hover:underline" target="_blank" rel="noreferrer">
            View
          </a>
        ) : null}
      </span>
    );
  }

  const filteredPeople = useMemo(() => {
    const q = verifySearch.trim().toLowerCase();
    return sortedPeople.filter((e) => {
      if (q) {
        const hay = `${e.employeeCode || ""} ${e.fullName || ""} ${e.email || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const panOk = panVerified(e);
      const bankOk = bankVerified(e);
      if (verifyFilter === "MISSING" && panOk && bankOk) return false;
      if (verifyFilter === "VERIFIED" && (!panOk || !bankOk)) return false;
      return true;
    });
  }, [sortedPeople, verifySearch, verifyFilter, docsByEmployee, people.data]);

  const missingBankPan = sortedPeople.filter((e) => !panVerified(e) || !bankVerified(e)).length;

  async function review(id: string, approve: boolean) {
    setError(null);
    try {
      await api(`/api/actions/ess/kyc/documents/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ approve, note: notes[id] || "" }),
      });
      setNotice(approve ? "Document approved." : "Document rejected.");
      docs.reload();
      allDocs.reload();
      summary.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function uploadForEmployee() {
    setError(null);
    try {
      await createRecord("/api/employee-documents", {
        employeeId: uploadEmployeeId,
        docType,
        fileName: fileName || "Document",
        storageUrl,
        status: markApproved ? "APPROVED" : "PENDING",
        reviewNote: markApproved ? "Uploaded and verified by HR" : "",
      });
      setNotice(markApproved ? "Document uploaded and approved." : "Document uploaded — waiting in review queue.");
      setFileName("");
      setStorageUrl("");
      docs.reload();
      allDocs.reload();
      summary.reload();
      setFilter(markApproved ? "APPROVED" : "PENDING");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(e: Employee) {
    setEditId(e.id);
    setBankAccount(e.bankAccount || "");
    setPan(e.pan || "");
    setUan(e.uan || "");
    setEsiNumber(e.esiNumber || "");
    setUploadEmployeeId(e.id);
  }

  async function saveBank(e: Employee) {
    setError(null);
    try {
      await api(`/api/employees/${e.id}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: e.fullName,
          email: e.email,
          phone: e.phone,
          department: e.department,
          designation: e.designation,
          joiningDate: e.joiningDate,
          centerId: e.centerId,
          managerId: e.managerId,
          employmentType: e.employmentType,
          status: e.status,
          bankAccount,
          pan,
          uan,
          esiNumber,
        }),
      });
      setNotice(`Bank / PAN saved for ${e.fullName}.`);
      setEditId(null);
      people.reload();
      summary.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || docs.error || summary.error || people.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending review" value={String(summary.data?.pendingDocuments ?? 0)} />
        <StatCard label="Approved" value={String(summary.data?.approvedDocuments ?? 0)} />
        <StatCard label="Rejected" value={String(summary.data?.rejectedDocuments ?? 0)} />
        <StatCard label="Missing bank/PAN" value={String(missingBankPan)} />
      </div>

      <Card title="Upload document for employee">
        <p className="mb-3 text-sm text-slate-500">HR can upload on behalf of staff (PAN, bank proof, photo, offer). Staff can also upload from My Profile.</p>
        <FormGrid>
          <Select
            label="Employee"
            value={uploadEmployeeId}
            onChange={setUploadEmployeeId}
            options={sortedPeople.map((e) => ({
              value: e.id,
              label: `${e.employeeCode || "—"} · ${e.fullName}`,
            }))}
          />
          <Select
            label="Document type"
            value={docType}
            onChange={setDocType}
            allowEmpty={false}
            options={[
              { value: "PAN_CARD", label: "PAN card" },
              { value: "BANK_PROOF", label: "Bank proof" },
              { value: "PHOTO", label: "Photo" },
              { value: "AADHAAR", label: "Aadhaar" },
              { value: "OFFER_LETTER", label: "Signed offer letter" },
              { value: "EDUCATION", label: "Education certificate" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          <Field label="File name" value={fileName} onChange={setFileName} />
          <FileUpload
            label="Choose file"
            value={storageUrl}
            accept="image/*,.pdf"
            onChange={(v) => {
              setStorageUrl(v);
              if (v && !fileName) setFileName(v.split("/").pop() || "");
            }}
          />
        </FormGrid>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={markApproved} onChange={(ev) => setMarkApproved(ev.target.checked)} />
          Mark as approved now (HR verified against original)
        </label>
        <div className="mt-3">
          <PrimaryButton disabled={!uploadEmployeeId || !storageUrl} onClick={() => void uploadForEmployee()}>
            Upload
          </PrimaryButton>
        </div>
      </Card>

      <Card title="Document review queue">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-sm ${filter === f ? "bg-navy text-white" : "bg-mist"}`}
            >
              {prettyLabel(f)}
            </button>
          ))}
        </div>
        <Table
          empty={
            filter === "PENDING"
              ? "No pending documents. Upload above, or ask staff to submit from My Profile."
              : "No documents in this filter."
          }
          columns={["Employee", "Type", "File", "Status", "Note", ""]}
          rows={(docs.data ?? []).map((d) => [
            <span key={`${d.id}-emp`}>
              {d.employeeName || "—"}
              <span className="block text-xs text-slate-500">{d.employeeCode || ""}</span>
            </span>,
            prettyLabel(d.docType),
            d.storageUrl ? (
              <a key={`${d.id}-link`} href={d.storageUrl} className="text-brand hover:underline" target="_blank" rel="noreferrer">
                {d.fileName || "View"}
              </a>
            ) : (
              d.fileName || "—"
            ),
            statusBadge(d.status),
            d.canReview ? (
              <input
                key={`${d.id}-note`}
                className="w-full max-w-[10rem] rounded-lg border border-line px-2 py-1 text-sm"
                placeholder="Review note"
                value={notes[d.id] || ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [d.id]: e.target.value }))}
              />
            ) : (
              d.reviewNote || "—"
            ),
            d.canReview ? (
              <span key={`${d.id}-act`} className="flex flex-wrap gap-2">
                <LinkButton onClick={() => void review(d.id, true)}>Approve</LinkButton>
                <LinkButton onClick={() => void review(d.id, false)}>Reject</LinkButton>
              </span>
            ) : (
              ""
            ),
          ])}
        />
      </Card>

      <Card title="Employee verification">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Field
              label="Search employee"
              value={verifySearch}
              onChange={setVerifySearch}
              placeholder="Name, code, or email — e.g. Meera"
            />
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            {(["ALL", "MISSING", "VERIFIED"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setVerifyFilter(f)}
                className={`rounded-full px-3 py-1.5 text-sm ${verifyFilter === f ? "bg-navy text-white" : "bg-mist"}`}
              >
                {f === "ALL" ? "All" : f === "MISSING" ? "Missing KYC" : "Fully verified"}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Showing {filteredPeople.length} of {sortedPeople.length} employees. When Verified, use <strong>View</strong> next to the badge to open that document.
        </p>
        <Table
          empty={sortedPeople.length ? "No employees match this search / filter." : "No employees yet. Add them under Employees."}
          columns={["Code", "Name", "PAN", "Bank", "Pending docs", ""]}
          rows={filteredPeople.map((e) => {
            const pending = pendingDocCount(e.id);
            const panOk = panVerified(e);
            const bankOk = bankVerified(e);
            const panDoc = approvedDoc(e.id, ["PAN_CARD", "PAN"]);
            const bankDoc = approvedDoc(e.id, ["BANK_PROOF", "BANK"]);
            if (editId === e.id) {
              return [
                e.employeeCode || "—",
                e.fullName,
                <Field key={`${e.id}-pan`} label="" value={pan} onChange={setPan} placeholder="PAN" />,
                <Field key={`${e.id}-bank`} label="" value={bankAccount} onChange={setBankAccount} placeholder="Bank account" />,
                pending ? statusBadge("PENDING") : fieldBadge(true, "Clear", "Clear"),
                <span key={`${e.id}-save`} className="flex flex-wrap gap-2">
                  <LinkButton onClick={() => void saveBank(e)}>Save</LinkButton>
                  <LinkButton onClick={() => setEditId(null)}>Cancel</LinkButton>
                </span>,
              ];
            }
            return [
              e.employeeCode || "—",
              e.fullName,
              verifyCell(panOk, e.pan?.trim() || "Verified", panDoc, `${e.id}-pan`),
              verifyCell(bankOk, e.bankAccount?.trim() ? "Verified" : "Verified", bankDoc, `${e.id}-bank`),
              pending > 0 ? (
                <span key={`${e.id}-pend`} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                  {pending} pending
                </span>
              ) : (
                fieldBadge(true, "Clear", "Clear")
              ),
              <span key={`${e.id}-act`} className="flex flex-wrap gap-2">
                <LinkButton onClick={() => startEdit(e)}>Edit bank</LinkButton>
                <LinkButton
                  onClick={() => {
                    setUploadEmployeeId(e.id);
                    setDocType(bankOk ? "PAN_CARD" : "BANK_PROOF");
                  }}
                >
                  Upload
                </LinkButton>
              </span>,
            ];
          })}
        />
        {editId && (
          <FormGrid>
            <Field label="UAN" value={uan} onChange={setUan} />
            <Field label="ESI number" value={esiNumber} onChange={setEsiNumber} />
          </FormGrid>
        )}
        <p className="mt-3 text-sm text-slate-500">
          Search by name/code, then open the file with <strong>View</strong> beside Verified — no need to dig the Approved queue for 1 lakh people.
        </p>
      </Card>
    </>
  );
}

function StaffKycUpload() {
  return <ProfileTab hr={false} showBank showDocs showResign={false} showOrgChart={false} />;
}

function HiringSection() {
  return (
    <>
      <PageHeader
        title="Offer Letters"
        subtitle="Create letters from templates, send by email, then hire into the employee master. Use CTC / salary wording — edit templates under Settings."
      />
      <HiringTab />
    </>
  );
}

function PayrollSection({ hr }: { hr: boolean }) {
  return (
    <>
      <PageHeader title="Payroll" subtitle="Salary structures, statutory settings, run monthly cycle, then publish payslips." />
      <PayrollTab hr={hr} />
    </>
  );
}

function PayslipsSection({ hr }: { hr: boolean }) {
  return (
    <>
      <PageHeader
        title="Payslips"
        subtitle={hr ? "Published and draft salary slips. Run new cycles under Payroll." : "Your published salary receipts."}
      />
      <PayrollTab hr={hr} focus="payslips" />
      {hr && (
        <p className="text-sm text-slate-500">
          Need to create a cycle?{" "}
          <Link className="font-semibold text-brand hover:underline" to="/ess/payroll">
            Open Payroll
          </Link>
        </p>
      )}
    </>
  );
}

function AttendanceSection({ hr }: { hr: boolean }) {
  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark attendance, regularizations, and biometric punches." />
      <AttendanceTab hr={hr} />
    </>
  );
}

function LeaveSection({ hr, manager }: { hr: boolean; manager: boolean }) {
  return (
    <>
      <PageHeader title="Leave Requests" subtitle="Apply leave, balances, and approvals." />
      <LeaveTab hr={hr} manager={manager} />
    </>
  );
}

function ExitSection({ hr, manager }: { hr: boolean; manager: boolean }) {
  if (hr || manager) {
    return (
      <>
        <PageHeader title="Exit Requests" subtitle="Resignations, notice period, and exit decisions." />
        <TeamTab hr={hr} focus="exit" />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Exit Requests" subtitle="Submit your resignation to HR." />
      <ProfileTab hr={false} showBank={false} showDocs={false} showResign showOrgChart={false} />
    </>
  );
}

function CompensationSection() {
  return (
    <>
      <PageHeader title="Compensation" subtitle="Variable pay plans and commission ledger." />
      <CompensationTab />
    </>
  );
}

function TeamSection({ hr }: { hr: boolean }) {
  return (
    <>
      <PageHeader title="Team" subtitle="Leave and attendance approvals for your team." />
      <TeamTab hr={hr} focus="team" />
    </>
  );
}

function DevicesSection() {
  return (
    <>
      <PageHeader title="Devices" subtitle="Biometric punch import and device secrets." />
      <DevicesTab />
    </>
  );
}

function ProfileSection({ hr }: { hr: boolean }) {
  return (
    <>
      <PageHeader title="My Profile" subtitle="Contact details, bank/PAN, and document uploads for HR verification." />
      <ProfileTab hr={hr} showBank showDocs showResign={false} showOrgChart={false} />
    </>
  );
}

function ProfileTab({
  hr,
  showBank = true,
  showDocs = true,
  showResign = false,
  showOrgChart = false,
}: {
  hr: boolean;
  showBank?: boolean;
  showDocs?: boolean;
  showResign?: boolean;
  showOrgChart?: boolean;
}) {
  const profile = useApi<Employee>("/api/actions/ess/profile");
  const orgChart = useApi<Employee[]>(showOrgChart && hr ? "/api/actions/ess/org-chart" : "");
  const docs = useApi<Doc[]>(showDocs && profile.data?.id ? `/api/employees/${profile.data.id}/documents` : "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [pan, setPan] = useState("");
  const [uan, setUan] = useState("");
  const [esiNumber, setEsiNumber] = useState("");
  const [docType, setDocType] = useState("PAN_CARD");
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
        body: JSON.stringify({ phone: phoneForApi(phone), email, bankAccount, pan, uan, esiNumber }),
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
      setNotice("Document submitted for HR verification.");
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
              <PhoneField label="Phone" value={phone} onChange={setPhone} />
              {showBank && (
                <>
                  <Field label="Bank account" value={bankAccount} onChange={setBankAccount} />
                  <Field label="PAN" value={pan} onChange={setPan} />
                  <Field label="UAN" value={uan} onChange={setUan} />
                  <Field label="ESI number" value={esiNumber} onChange={setEsiNumber} />
                </>
              )}
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton onClick={() => void save()}>Save my details</PrimaryButton>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">No employee record linked to your login yet. Ask the owner to link you under People → Staff.</p>
        )}
      </Card>
      {p && showDocs && (
          <Card title="My documents">
            <p className="mb-3 text-sm text-slate-500">Upload PAN, bank proof, photo, or offer letter. Status stays Pending until HR approves.</p>
            <Table
              empty="No documents uploaded yet."
              columns={["Type", "Name", "Status", "HR note", "Link"]}
              rows={(docs.data ?? []).map((d) => [
                prettyLabel(d.docType),
                d.fileName || "—",
                statusBadge(d.status),
                d.reviewNote || "—",
                d.storageUrl ? (
                  <a key={d.id} href={d.storageUrl} className="text-brand hover:underline" target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  "—"
                ),
              ])}
            />
            <FormGrid>
              <Select
                label="Document type"
                value={docType}
                onChange={setDocType}
                allowEmpty={false}
                options={[
                  { value: "PAN_CARD", label: "PAN card" },
                  { value: "BANK_PROOF", label: "Bank proof" },
                  { value: "PHOTO", label: "Photo" },
                  { value: "AADHAAR", label: "Aadhaar" },
                  { value: "OFFER_LETTER", label: "Signed offer letter" },
                  { value: "EDUCATION", label: "Education certificate" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
              <Field label="File name" value={fileName} onChange={setFileName} />
              <FileUpload
                label="Upload file"
                value={storageUrl}
                accept="image/*,.pdf"
                onChange={(v) => {
                  setStorageUrl(v);
                  if (v && !fileName) setFileName(v.split("/").pop() || "");
                }}
              />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton disabled={!storageUrl} onClick={() => void addDoc()}>
                Submit for HR verification
              </PrimaryButton>
            </div>
          </Card>
      )}
      {p && showResign && (
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
      {showOrgChart && hr && (
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

function TeamTab({ hr, focus = "team" }: { hr: boolean; focus?: "team" | "exit" }) {
  const inbox = useApi<ManagerInbox>("/api/actions/ess/manager/inbox");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const teamAtt = useApi<Attendance[]>(`/api/actions/ess/team/attendance?year=${year}&month=${month}`);
  const teamLeave = useApi<Leave[]>(`/api/actions/ess/team/leave-calendar?year=${year}&month=${month}`);
  const policy = useApi<{ clAnnual?: number; slAnnual?: number; elAnnual?: number; excludeHolidays?: boolean }>(hr ? "/api/leave-policy" : "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<string[]>([]);
  const [clAnnual, setClAnnual] = useState("12");
  const [slAnnual, setSlAnnual] = useState("6");
  const [elAnnual, setElAnnual] = useState("15");
  const [excludeHolidays, setExcludeHolidays] = useState(false);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

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

  async function decideResign(id: string, approve: boolean, deactivateLogin = false) {
    setError(null);
    try {
      await api(`/api/actions/ess/resignation/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ approve, deactivateLogin }),
      });
      inbox.reload();
      setNotice(
        approve
          ? deactivateLogin
            ? "Resignation accepted. Login deactivated and employee marked inactive."
            : "Resignation accepted. Employee is on notice until their last working day. Use Accept and exit now if their last day is today."
          : "Resignation rejected.",
      );
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

  const showTeam = focus === "team";
  const showExit = focus === "exit";

  return (
    <>
      <ErrorText error={error || inbox.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {showTeam && (
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Pending leave">
          <p className="text-3xl font-bold text-navy">{box?.pendingLeave ?? 0}</p>
        </Card>
        <Card title="Regularization">
          <p className="text-3xl font-bold text-navy">{box?.pendingRegularization ?? 0}</p>
        </Card>
      </div>
      )}
      {showExit && (
        <Card title="Pending resignations">
          <p className="text-3xl font-bold text-navy">{box?.pendingResignation ?? 0}</p>
        </Card>
      )}
      {showTeam && (
      <>
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
            prettyLabel(r.leaveType) || "—",
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
      </>
      )}
      {showExit && (
        <Card title="Resignation requests">
          <Table
            empty="No pending resignations."
            columns={["Employee", "Last day", "Reason", ""]}
            rows={(box?.resignation ?? []).map((r) => [
              r.employeeName || "—",
              formatDay(r.lastWorkingDate) || "—",
              r.reason || "—",
              r.canDecide ? (
                <span key={r.id} className="flex flex-wrap gap-2">
                  <LinkButton onClick={() => void decideResign(r.id, true, false)}>Accept (on notice)</LinkButton>
                  <LinkButton onClick={() => void decideResign(r.id, true, true)}>Accept & exit now</LinkButton>
                  <LinkButton onClick={() => void decideResign(r.id, false)}>Reject</LinkButton>
                </span>
              ) : (
                <span key={r.id} className="text-xs text-slate-500">View only</span>
              ),
            ])}
          />
        </Card>
      )}
      {showTeam && (
      <>
      <Card title={`Team attendance — ${monthLabel}`}>
        <div className="mb-3 flex flex-wrap gap-2">
          <LinkButton onClick={() => shiftMonth(-1)}>Previous</LinkButton>
          <LinkButton onClick={() => shiftMonth(1)}>Next</LinkButton>
        </div>
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
      <Card title={`Team leave — ${monthLabel}`}>
        <Table
          empty="Nobody on approved leave this month."
          columns={["Employee", "Type", "From", "To"]}
          rows={(teamLeave.data ?? []).map((r) => [r.employeeName || "—", prettyLabel(r.leaveType) || "—", formatDay(r.fromDate) || "—", formatDay(r.toDate) || "—"])}
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
  const [tempCreds, setTempCreds] = useState<{ email?: string; password: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
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

  function clearForm() {
    setEditId(null);
    setFullName("");
    setEmployeeCode("");
    setEmail("");
    setPhone("");
    setDepartment("");
    setDesignation("");
    setJoiningDate("");
    setCenterId("");
    setManagerId("");
    setUserId("");
    setEmploymentType("SUPPORT");
    setCreateLogin(false);
  }

  function startEdit(e: Employee) {
    setEditId(e.id);
    setFullName(e.fullName || "");
    setEmployeeCode(e.employeeCode || "");
    setEmail(e.email || "");
    setPhone(e.phone || "");
    setDepartment(e.department || "");
    setDesignation(e.designation || "");
    setJoiningDate(e.joiningDate ? String(e.joiningDate).slice(0, 10) : "");
    setCenterId(e.centerId || "");
    setManagerId(e.managerId || "");
    setUserId("");
    setEmploymentType(e.employmentType || "SUPPORT");
    setCreateLogin(false);
    setNotice(null);
  }

  async function add() {
    setError(null);
    setNotice(null);
    setTempCreds(null);
    try {
      if (editId) {
        await updateRecord(`/api/employees/${editId}`, {
          fullName,
          employeeCode,
          email,
          phone: phoneForApi(phone),
          department,
          designation,
          joiningDate,
          centerId: centerId || null,
          managerId: managerId || null,
          employmentType,
        });
        setNotice(`${fullName} updated.`);
        clearForm();
        people.reload();
        return;
      }
      const created = await createRecord<Employee>("/api/employees", {
        fullName,
        employeeCode,
        email,
        phone: phoneForApi(phone),
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
      clearForm();
      people.reload();
      if (created.tempPassword) {
        setTempCreds({ email: created.loginEmail, password: created.tempPassword });
        setNotice(`${created.fullName} saved. Copy the temporary password now — it won’t be shown again.`);
      } else {
        setNotice(`${created.fullName} saved as ${created.employeeCode}.`);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function issueLogin(id: string) {
    setError(null);
    setNotice(null);
    setTempCreds(null);
    try {
      const emp = (people.data ?? []).find((e) => e.id === id);
      const roleFromType =
        emp?.employmentType === "FACULTY" ? "FACULTY" : emp?.employmentType === "ADMIN" ? "COUNSELOR" : loginRole;
      const out = await api<{ loginEmail?: string; tempPassword?: string }>(`/api/actions/ess/employees/${id}/login`, {
        method: "POST",
        body: JSON.stringify({ loginRole: roleFromType }),
      });
      people.reload();
      if (out.tempPassword) {
        setTempCreds({ email: out.loginEmail, password: out.tempPassword });
        setNotice("Temporary password created. Copy it now — it won’t be shown again.");
      } else {
        setNotice(`Already has login ${out.loginEmail}`);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setStatus(e: Employee, status: string) {
    setError(null);
    try {
      await updateRecord(`/api/employees/${e.id}`, { ...e, status });
      people.reload();
      setNotice(`${e.fullName} marked ${prettyLabel(status)}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || people.error || centers.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {tempCreds && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">One-time login credentials</p>
          <p className="mt-1">Email: {tempCreds.email || "—"}</p>
          <p className="mt-1 font-mono">Password: {tempCreds.password}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <PrimaryButton
              onClick={() => {
                void navigator.clipboard.writeText(`${tempCreds.email || ""}\n${tempCreds.password}`);
                setNotice("Copied to clipboard. Dismiss this panel when done.");
              }}
            >
              Copy
            </PrimaryButton>
            <LinkButton onClick={() => setTempCreds(null)}>Dismiss</LinkButton>
          </div>
        </div>
      )}
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
          columns={["Code", "Name", "Dept", "Status", "Type", "Login", "Leave CL/SL/EL", ""]}
          rows={(people.data ?? []).map((e) => [
            e.employeeCode || "—",
            e.fullName,
            e.department || "—",
            prettyLabel(e.status || "ACTIVE"),
            prettyLabel(e.employmentType),
            e.hasLogin ? (
              prettyLabel("ACTIVE")
            ) : (
              <LinkButton key={`${e.id}-login`} onClick={() => void issueLogin(e.id)}>
                Create login
              </LinkButton>
            ),
            `${e.cl ?? "—"} / ${e.sl ?? "—"} / ${e.el ?? "—"}`,
            <span key={`${e.id}-act`} className="flex flex-wrap gap-2">
              <LinkButton onClick={() => startEdit(e)}>Edit</LinkButton>
              {(e.status || "ACTIVE") !== "INACTIVE" ? (
                <LinkButton onClick={() => void setStatus(e, "INACTIVE")}>Deactivate</LinkButton>
              ) : (
                <LinkButton onClick={() => void setStatus(e, "ACTIVE")}>Reactivate</LinkButton>
              )}
            </span>,
          ])}
        />
      </Card>
      <Card title={editId ? "Edit employee" : "Add employee"}>
        <FormGrid>
          <Field label="Name" value={fullName} onChange={setFullName} placeholder="Full name" />
          <Field label="Employee code" value={employeeCode} onChange={setEmployeeCode} placeholder="Blank = auto EMP-0001" />
          <Field label="Email" value={email} onChange={setEmail} />
          <PhoneField label="Phone" value={phone} onChange={setPhone} placeholder="Mobile number" />
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
        {!editId && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
            Create a portal login now
          </label>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton disabled={!fullName} onClick={() => void add()}>
            {editId ? "Update employee" : "Save employee"}
          </PrimaryButton>
          {editId && <LinkButton onClick={clearForm}>Cancel edit</LinkButton>}
        </div>
      </Card>
    </>
  );
}

function AttendanceTab({ hr }: { hr: boolean }) {
  const people = useApi<Employee[]>("/api/employees");
  const me = useApi<Employee>("/api/actions/ess/profile");
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
  const [regShift, setRegShift] = useState("FULL");
  const [regStatus, setRegStatus] = useState("PRESENT");
  const [regReason, setRegReason] = useState("");
  const [selfPunchType, setSelfPunchType] = useState("IN");

  const options = people.data ?? [];

  async function selfPunch() {
    const code = me.data?.employeeCode;
    if (!code) {
      setError("No employee code on your profile yet.");
      return;
    }
    setError(null);
    try {
      await api("/api/actions/attendance/biometric", {
        method: "POST",
        body: JSON.stringify({ code, deviceId: "SELF", punchType: selfPunchType }),
      });
      setNotice(`Self-punch ${prettyLabel(selfPunchType)} recorded.`);
      rows.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

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
    if (!regReason.trim()) {
      setError("Reason is required for a correction.");
      return;
    }
    try {
      await api("/api/actions/ess/regularization", {
        method: "POST",
        body: JSON.stringify({ workDate: regDate, shift: regShift, requestedStatus: regStatus, reason: regReason }),
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
      <ErrorText error={error || rows.error || people.error || me.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Self punch">
        <p className="mb-3 text-sm text-slate-500">
          Clock in or out with your employee code{me.data?.employeeCode ? ` (${me.data.employeeCode})` : ""}. HR devices remain under Devices.
        </p>
        <FormGrid>
          <Select
            label="Punch"
            value={selfPunchType}
            onChange={setSelfPunchType}
            allowEmpty={false}
            options={[
              { value: "IN", label: "In" },
              { value: "OUT", label: "Out" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!me.data?.employeeCode} onClick={() => void selfPunch()}>
            Record my punch
          </PrimaryButton>
        </div>
      </Card>
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
            label="Shift"
            value={regShift}
            onChange={setRegShift}
            allowEmpty={false}
            options={[
              { value: "FULL", label: "Full day" },
              { value: "MORNING", label: "Morning" },
              { value: "EVENING", label: "Evening" },
            ]}
          />
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
          <PrimaryButton disabled={!regReason.trim()} onClick={() => void requestReg()}>Submit correction</PrimaryButton>
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

  async function removeHoliday(id: string) {
    setError(null);
    try {
      await deleteRecord(`/api/holidays/${id}`);
      holidays.reload();
      setNotice("Holiday removed.");
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
          columns={hr ? ["Date", "Name", ""] : ["Date", "Name"]}
          rows={(holidays.data ?? []).map((h) =>
            hr
              ? [
                  formatDay(h.holidayDate) || "—",
                  h.name,
                  <LinkButton key={h.id} onClick={() => void removeHoliday(h.id)}>
                    Delete
                  </LinkButton>,
                ]
              : [formatDay(h.holidayDate) || "—", h.name],
          )}
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
            prettyLabel(r.leaveType) || "—",
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
          rows={(calendar.data ?? []).map((r) => [r.employeeName || "—", prettyLabel(r.leaveType) || "—", formatDay(r.fromDate) || "—", formatDay(r.toDate) || "—"])}
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

function PayrollTab({ hr, focus = "full" }: { hr: boolean; focus?: "full" | "payslips" }) {
  const people = useApi<Employee[]>("/api/employees");
  const structures = useApi<Structure[]>(focus === "full" ? "/api/salary-structures" : "");
  const slips = useApi<Payslip[]>("/api/payslips");
  const settings = useApi<PayrollSettings>(hr && focus === "full" ? "/api/actions/ess/payroll/settings" : "");
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const statutory = useApi<StatutorySummary>(hr && focus === "full" ? `/api/actions/ess/payroll/statutory?year=${year}&month=${month}` : "");
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
  const full = focus === "full";

  return (
    <>
      <ErrorText error={error || slips.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {hr && full && (
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
      {hr && full && (
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
      {hr && full && stat && (
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
      <Card title={full ? "Payslips" : "Generated slips"}>
        {hr && full && (
          <>
            <FormGrid>
              <Select
                label="Year"
                value={year}
                onChange={setYear}
                allowEmpty={false}
                options={[0, 1, 2].map((i) => {
                  const y = String(new Date().getFullYear() - 1 + i);
                  return { value: y, label: y };
                })}
              />
              <Select
                label="Month"
                value={month}
                onChange={setMonth}
                allowEmpty={false}
                options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
              />
            </FormGrid>
            <div className="mb-3 mt-3 flex flex-wrap gap-2">
              <PrimaryButton onClick={() => void runPreview()}>Preview payroll</PrimaryButton>
              <PrimaryButton onClick={() => void run()}>Run payroll</PrimaryButton>
              <PrimaryButton onClick={() => void publishAll()}>Publish all drafts</PrimaryButton>
              <PrimaryButton onClick={() => void exportRegister()}>Export register</PrimaryButton>
            </div>
          </>
        )}
        {hr && !full && (
          <div className="mb-3 flex flex-wrap gap-2">
            <PrimaryButton onClick={() => void publishAll()}>Publish all drafts</PrimaryButton>
          </div>
        )}
        {preview && full && (
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
          rows={(slips.data ?? [])
            .filter((p) => hr || p.status === "PUBLISHED")
            .map((p) => [
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

function EssSettingsSection() {
  const config = useApi<EssConfig>("/api/actions/ess/config");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<"org" | "letters" | "email" | "jd" | "lookups" | null>(null);
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [offerTpl, setOfferTpl] = useState("");
  const [revisionTpl, setRevisionTpl] = useState("");
  const [payslipTpl, setPayslipTpl] = useState("");
  const [emailTpl, setEmailTpl] = useState("");
  const [jds, setJds] = useState<{ role: string; body: string }[]>([]);
  const [departments, setDepartments] = useState("");
  const [roles, setRoles] = useState("");
  const [documentTypes, setDocumentTypes] = useState("");
  const [statuses, setStatuses] = useState("");

  useEffect(() => {
    const d = config.data;
    if (!d) return;
    setSignatoryName(d.organization?.signatoryName || "");
    setSignatoryTitle(d.organization?.signatoryTitle || "HR / Administration");
    setLogoUrl(d.organization?.logoUrl || "");
    setOfferTpl(d.offerLetterTemplate || "");
    setRevisionTpl(d.revisionLetterTemplate || "");
    setPayslipTpl(d.payslipTemplate || "");
    setEmailTpl(d.emailTemplate || "");
    setJds((d.jobDescriptions ?? []).map((j) => ({ role: j.role, body: j.body })));
    setDepartments((d.lookups?.departments ?? []).join("\n"));
    setRoles((d.lookups?.roles ?? []).join("\n"));
    setDocumentTypes((d.lookups?.documentTypes ?? []).join("\n"));
    setStatuses((d.lookups?.statuses ?? []).join("\n"));
  }, [config.data]);

  function lines(value: string) {
    return value
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function save(partial: Record<string, unknown>) {
    setError(null);
    setNotice(null);
    try {
      await api("/api/actions/ess/config", { method: "POST", body: JSON.stringify(partial) });
      config.reload();
      setNotice("ESS configuration saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const rows: { key: typeof panel; title: string; hint: string }[] = [
    { key: "org", title: "Organization details, logo, and signatory", hint: "Used on offer letters and emails." },
    { key: "letters", title: "Offer letter, revision letter, and payslip template text", hint: "Placeholders like {name}, {role}, {ctc}, {joining_date}." },
    { key: "email", title: "Email templates and notification wording", hint: "Subject line can start with Subject: …" },
    { key: "jd", title: "Role-wise job description templates", hint: "Loaded automatically when you pick an employee role." },
    { key: "lookups", title: "Document types, departments, roles, and statuses", hint: "One value per line." },
  ];

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage the defaults used for letters, documents, departments, roles, and signatory details."
      />
      <ErrorText error={error || config.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="ESS Configuration">
        <p className="mb-4 text-sm text-slate-500">
          Corporate wording uses CTC / salary (not honorarium). Placeholders: {(config.data?.placeholders ?? []).join(", ")}.
        </p>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border border-line">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setPanel((p) => (p === r.key ? null : r.key))}
              >
                <span>
                  <span className="block text-sm font-semibold text-navy">{r.title}</span>
                  <span className="text-xs text-slate-500">{r.hint}</span>
                </span>
                <span className="text-sm text-brand">{panel === r.key ? "Close" : "Edit"}</span>
              </button>
              {panel === r.key && r.key === "org" && (
                <div className="border-t border-line px-4 py-4">
                  <FormGrid>
                    <Field label="Signatory name" value={signatoryName} onChange={setSignatoryName} />
                    <Field label="Signatory title" value={signatoryTitle} onChange={setSignatoryTitle} />
                    <Field label="Logo URL (optional)" value={logoUrl} onChange={setLogoUrl} />
                  </FormGrid>
                  <div className="mt-3">
                    <PrimaryButton
                      onClick={() =>
                        void save({ organization: { signatoryName, signatoryTitle, logoUrl } })
                      }
                    >
                      Save
                    </PrimaryButton>
                  </div>
                </div>
              )}
              {panel === r.key && r.key === "letters" && (
                <div className="space-y-4 border-t border-line px-4 py-4">
                  <TextArea label="Offer letter template" value={offerTpl} onChange={setOfferTpl} rows={14} />
                  <TextArea label="Revision letter template" value={revisionTpl} onChange={setRevisionTpl} rows={8} />
                  <TextArea label="Payslip template text" value={payslipTpl} onChange={setPayslipTpl} rows={6} />
                  <PrimaryButton
                    onClick={() =>
                      void save({
                        offerLetterTemplate: offerTpl,
                        revisionLetterTemplate: revisionTpl,
                        payslipTemplate: payslipTpl,
                      })
                    }
                  >
                    Save templates
                  </PrimaryButton>
                </div>
              )}
              {panel === r.key && r.key === "email" && (
                <div className="border-t border-line px-4 py-4">
                  <TextArea label="Offer email template" value={emailTpl} onChange={setEmailTpl} rows={12} />
                  <div className="mt-3">
                    <PrimaryButton onClick={() => void save({ emailTemplate: emailTpl })}>Save email template</PrimaryButton>
                  </div>
                </div>
              )}
              {panel === r.key && r.key === "jd" && (
                <div className="space-y-4 border-t border-line px-4 py-4">
                  {jds.map((j, idx) => (
                    <div key={`${j.role}-${idx}`} className="rounded-lg border border-line p-3">
                      <FormGrid>
                        <Field
                          label="Role"
                          value={j.role}
                          onChange={(v) => setJds((rows) => rows.map((x, i) => (i === idx ? { ...x, role: v } : x)))}
                        />
                      </FormGrid>
                      <div className="mt-2">
                        <TextArea
                          label="Job description / Annexure A"
                          value={j.body}
                          onChange={(v) => setJds((rows) => rows.map((x, i) => (i === idx ? { ...x, body: v } : x)))}
                          rows={8}
                        />
                      </div>
                      <div className="mt-2">
                        <LinkButton onClick={() => setJds((rows) => rows.filter((_, i) => i !== idx))}>Remove</LinkButton>
                      </div>
                    </div>
                  ))}
                  <LinkButton onClick={() => setJds((rows) => [...rows, { role: "New role", body: "" }])}>+ Add role JD</LinkButton>
                  <div>
                    <PrimaryButton onClick={() => void save({ jobDescriptions: jds })}>Save job descriptions</PrimaryButton>
                  </div>
                </div>
              )}
              {panel === r.key && r.key === "lookups" && (
                <div className="border-t border-line px-4 py-4">
                  <FormGrid>
                    <TextArea label="Departments" value={departments} onChange={setDepartments} rows={5} />
                    <TextArea label="Roles" value={roles} onChange={setRoles} rows={5} />
                    <TextArea label="Document types" value={documentTypes} onChange={setDocumentTypes} rows={5} />
                    <TextArea label="Letter statuses" value={statuses} onChange={setStatuses} rows={4} />
                  </FormGrid>
                  <div className="mt-3">
                    <PrimaryButton
                      onClick={() =>
                        void save({
                          lookups: {
                            departments: lines(departments),
                            roles: lines(roles),
                            documentTypes: lines(documentTypes),
                            statuses: lines(statuses),
                          },
                        })
                      }
                    >
                      Save lookups
                    </PrimaryButton>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function OfferCreateSection() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("id");
  const people = useApi<Employee[]>("/api/employees");
  const config = useApi<EssConfig>("/api/actions/ess/config");
  const existing = useApi<Candidate[]>(editId ? "/api/staff-candidates" : "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [offerCtc, setOfferCtc] = useState("0");
  const [offerJoining, setOfferJoining] = useState(today());
  const [letterContent, setLetterContent] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);

  const editRow = useMemo(() => (existing.data ?? []).find((c) => c.id === editId), [existing.data, editId]);
  const [editHydrated, setEditHydrated] = useState<string | null>(null);

  async function generateFromDetails(seed?: Partial<{ employeeId: string; fullName: string; roleTitle: string; department: string; offerCtc: string; offerJoiningDate: string; email: string; phone: string; letterNo?: string }>) {
    setError(null);
    try {
      const body = {
        employeeId: seed?.employeeId ?? (employeeId || undefined),
        fullName: seed?.fullName ?? fullName,
        email: seed?.email ?? email,
        phone: phoneForApi(seed?.phone ?? phone),
        roleTitle: seed?.roleTitle ?? roleTitle,
        department: seed?.department ?? department,
        offerCtc: seed?.offerCtc ?? offerCtc,
        offerJoiningDate: seed?.offerJoiningDate ?? offerJoining,
        letterNo: seed?.letterNo,
      };
      const out = await api<{ letterContent?: string; jobDescription?: string; roleTitle?: string; department?: string; fullName?: string; email?: string; phone?: string }>(
        "/api/actions/ess/offer-letters/preview",
        { method: "POST", body: JSON.stringify(body) },
      );
      setLetterContent(out.letterContent || "");
      setJobDescription(out.jobDescription || "");
      if (out.roleTitle) setRoleTitle(out.roleTitle);
      if (out.department) setDepartment(out.department);
      if (out.fullName) setFullName(out.fullName);
      if (out.email) setEmail(out.email);
      if (out.phone) setPhone(out.phone);
      setAutoFilled(true);
      setNotice("Letter content generated from ESS templates.");
      return out;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  useEffect(() => {
    if (!editId || !editRow || editHydrated === editId) return;
    setFullName(editRow.fullName || "");
    setEmail(editRow.email || "");
    setPhone(editRow.phone || "");
    setRoleTitle(editRow.jobTitle || "");
    setDepartment(editRow.department || "");
    setOfferCtc(editRow.offerCtc != null ? String(editRow.offerCtc) : "0");
    setOfferJoining(editRow.offerJoiningDate ? String(editRow.offerJoiningDate).slice(0, 10) : today());
    setEditHydrated(editId);

    const savedLetter = (editRow.letterContent || "").trim();
    const savedJd = (editRow.jobDescription || "").trim();
    if (savedLetter) {
      setLetterContent(savedLetter);
      setJobDescription(savedJd);
      setAutoFilled(true);
      return;
    }

    // Older drafts have no stored body — pull rendered template (or regenerate from ESS Settings).
    void (async () => {
      try {
        const letter = await api<{ letterContent?: string; jobDescription?: string; body?: string }>(
          `/api/actions/ess/candidates/${editId}/letter`,
        );
        if ((letter.letterContent || "").trim()) {
          setLetterContent(letter.letterContent || "");
          setJobDescription(letter.jobDescription || "");
          setAutoFilled(true);
          setNotice("Loaded offer letter from template.");
          return;
        }
      } catch {
        /* fall through to preview */
      }
      await generateFromDetails({
        fullName: editRow.fullName || "",
        email: editRow.email || "",
        phone: editRow.phone || "",
        roleTitle: editRow.jobTitle || "",
        department: editRow.department || "",
        offerCtc: editRow.offerCtc != null ? String(editRow.offerCtc) : "0",
        offerJoiningDate: editRow.offerJoiningDate ? String(editRow.offerJoiningDate).slice(0, 10) : today(),
        letterNo: editRow.letterNo,
      });
    })();
  }, [editId, editRow, editHydrated]);

  function pickEmployee(id: string) {
    setEmployeeId(id);
    const e = (people.data ?? []).find((x) => x.id === id);
    if (!e) return;
    const next = {
      employeeId: id,
      fullName: e.fullName || "",
      email: e.email || "",
      phone: e.phone || "",
      roleTitle: e.designation || "",
      department: e.department || "",
      offerCtc,
      offerJoiningDate: e.joiningDate ? String(e.joiningDate).slice(0, 10) : offerJoining,
    };
    setFullName(next.fullName);
    setEmail(next.email);
    setPhone(next.phone);
    setRoleTitle(next.roleTitle);
    setDepartment(next.department);
    if (e.joiningDate) setOfferJoining(next.offerJoiningDate);
    void generateFromDetails(next);
  }

  function preview() {
    setError(null);
    const content = `${letterContent}\n\n--- Annexure A: Job description ---\n\n${jobDescription}`;
    const html = `<!doctype html><html><head><title>Offer letter preview</title>
        <style>body{font-family:Georgia,serif;max-width:640px;margin:40px auto;padding:0 24px;line-height:1.5}pre{white-space:pre-wrap;font-family:Georgia,serif}</style>
        </head><body><pre>${escHtml(content)}</pre><div style="margin-top:24px"><button onclick="window.print()">Print / Save PDF</button></div></body></html>`;
    if (!openPrintHtml(html)) {
      setError("Pop-up blocked. Allow pop-ups to preview.");
    }
  }

  async function saveDraft() {
    setError(null);
    setNotice(null);
    try {
      const body = {
        employeeId: employeeId || undefined,
        fullName,
        email,
        phone: phoneForApi(phone),
        roleTitle,
        department,
        offerCtc,
        offerJoiningDate: offerJoining,
        letterContent,
        jobDescription,
      };
      if (editId) {
        await api(`/api/actions/ess/offer-letters/${editId}`, { method: "POST", body: JSON.stringify(body) });
        setNotice("Draft saved.");
      } else {
        const out = await api<Candidate>("/api/actions/ess/offer-letters", { method: "POST", body: JSON.stringify(body) });
        setNotice(`Draft ${out.letterNo || ""} saved.`);
        navigate(`/ess/offer-create?id=${out.id}`, { replace: true });
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const roleOptions = useMemo(() => {
    const fromConfig = config.data?.lookups?.roles ?? [];
    const fromJd = (config.data?.jobDescriptions ?? []).map((j) => j.role);
    const fromPeople = (people.data ?? []).map((e) => e.designation || "").filter(Boolean);
    return Array.from(new Set([...fromConfig, ...fromJd, ...fromPeople, roleTitle].filter(Boolean)));
  }, [config.data, people.data, roleTitle]);

  const deptOptions = useMemo(() => {
    const fromConfig = config.data?.lookups?.departments ?? [];
    const fromPeople = (people.data ?? []).map((e) => e.department || "").filter(Boolean);
    return Array.from(new Set([...fromConfig, ...fromPeople, department].filter(Boolean)));
  }, [config.data, people.data, department]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title={editId ? "Edit Offer Letter" : "Create Offer Letter"}
          subtitle="Select an employee (or enter details) — letter content and role JD fill from ESS Settings templates. Uses CTC / salary."
        />
        <Link className="text-sm font-medium text-brand hover:underline" to="/ess/hiring">
          ← Back
        </Link>
      </div>
      <ErrorText error={error || people.error || config.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Offer details">
        <FormGrid>
          <Select
            label="Employee"
            value={employeeId}
            onChange={pickEmployee}
            options={(people.data ?? []).map((e) => ({
              value: e.id,
              label: `${e.fullName}${e.employeeCode ? ` (${e.employeeCode})` : ""}`,
            }))}
          />
          <Field label="Name" value={fullName} onChange={setFullName} />
          <Field label="Email" value={email} onChange={setEmail} />
          <PhoneField label="Phone" value={phone} onChange={setPhone} />
          <Field
            label="Role"
            value={roleTitle}
            onChange={(v) => {
              setRoleTitle(v);
            }}
            placeholder={roleOptions[0] || "Faculty"}
          />
          <Field label="Department" value={department} onChange={setDepartment} placeholder={deptOptions[0] || "Academics"} />
          <Field label="Start date" type="date" value={offerJoining} onChange={setOfferJoining} />
          <Field label="Monthly CTC / Salary (₹)" value={offerCtc} onChange={setOfferCtc} placeholder="8000" />
        </FormGrid>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton
            disabled={!fullName || !roleTitle}
            onClick={() => void generateFromDetails()}
          >
            {autoFilled ? "Regenerate from templates" : "Generate letter"}
          </PrimaryButton>
          <Link className="text-sm font-medium text-brand hover:underline self-center" to="/ess/settings">
            Edit templates in Settings
          </Link>
        </div>
      </Card>
      <Card title="Letter content">
        <TextArea label="Letter content" value={letterContent} onChange={setLetterContent} rows={16} />
      </Card>
      <Card title="Role-wise job description / Annexure A">
        <TextArea label="Job description" value={jobDescription} onChange={setJobDescription} rows={10} />
        <p className="mt-2 text-xs text-slate-500">
          Loaded automatically from the active JD template matching this employee role. You can edit it for this letter.
        </p>
      </Card>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={() => void preview()} disabled={!letterContent}>
          Preview
        </PrimaryButton>
        <PrimaryButton onClick={() => void saveDraft()} disabled={!fullName || !roleTitle || !offerJoining}>
          Save Draft
        </PrimaryButton>
        <LinkButton onClick={() => navigate("/ess/hiring")}>Cancel</LinkButton>
      </div>
    </>
  );
}

function HiringTab() {
  const navigate = useNavigate();
  const jobs = useApi<Vacancy[]>("/api/staff-vacancies");
  const applicants = useApi<Candidate[]>("/api/staff-candidates");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [letterFilter, setLetterFilter] = useState<"ALL" | "DRAFT" | "SENT_FOR_SIGNATURE" | "PUBLISHED">("ALL");
  const [showSetup, setShowSetup] = useState(false);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [openings, setOpenings] = useState("1");
  const [description, setDescription] = useState("");
  const [vacancyId, setVacancyId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [offerForId, setOfferForId] = useState<string | null>(null);
  const [offerCtc, setOfferCtc] = useState("");
  const [offerJoining, setOfferJoining] = useState(today());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (applicants.data ?? []).filter((c) => {
      // Offer Letters list: only rows with a letter (offer issued or hired)
      if (c.status !== "OFFER" && c.status !== "HIRED") return false;
      const letterStatus = (c.offerLetterStatus || "DRAFT").toUpperCase();
      if (letterFilter !== "ALL" && letterStatus !== letterFilter) return false;
      if (!q) return true;
      const hay = `${c.letterNo || ""} ${c.fullName || ""} ${c.jobTitle || ""} ${c.department || ""} ${c.email || ""} ${letterStatus}`.toLowerCase();
      return hay.includes(q);
    });
  }, [applicants.data, search, letterFilter]);

  const offerCount = (applicants.data ?? []).filter((c) => c.status === "OFFER" || c.status === "HIRED").length;

  async function addJob() {
    setError(null);
    try {
      await createRecord("/api/staff-vacancies", { title, department, openings, description });
      setTitle("");
      setDepartment("");
      setDescription("");
      jobs.reload();
      setNotice("Job posted.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addApplicant() {
    setError(null);
    try {
      await createRecord("/api/staff-candidates", { vacancyId, fullName, email, phone: phoneForApi(phone) });
      setFullName("");
      setEmail("");
      setPhone("");
      applicants.reload();
      setNotice("Applicant added.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function advance(id: string, status: string, extra: Record<string, unknown> = {}) {
    setError(null);
    try {
      await api(`/api/actions/ess/candidates/${id}/advance`, { method: "POST", body: JSON.stringify({ status, ...extra }) });
      applicants.reload();
      if (status === "OFFER") {
        setOfferForId(null);
        setOfferCtc("");
        setNotice("Offer letter created as Draft. Send it from the Actions column.");
        setLetterFilter("DRAFT");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function issueOffer() {
    if (!offerForId) return;
    await advance(offerForId, "OFFER", { offerCtc, offerJoiningDate: offerJoining });
  }

  async function sendLetter(id: string) {
    setError(null);
    setNotice(null);
    setBusyId(id);
    try {
      const out = await api<{ letterNo?: string; delivery?: string; deliveryMessage?: string; fullName?: string }>(
        `/api/actions/ess/offer-letters/${id}/send`,
        { method: "POST", body: "{}" },
      );
      applicants.reload();
      setNotice(`Sent to ${out.fullName || "candidate"} (${out.delivery || "QUEUED"}). ${out.deliveryMessage || ""}`.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function publishLetter(id: string) {
    setError(null);
    try {
      await api(`/api/actions/ess/offer-letters/${id}/publish`, { method: "POST", body: "{}" });
      applicants.reload();
      setNotice("Letter marked Published.");
      setMoreId(null);
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
      setMoreId(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function viewLetter(id: string, autoPrint = false) {
    setError(null);
    // Open synchronously on click so the browser allows the tab; fill after the API returns.
    const win = window.open("about:blank", "_blank", "width=720,height=900");
    if (!win) {
      setError("Pop-up blocked. Allow pop-ups to view the offer letter.");
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Loading…</title></head>
      <body style="font-family:system-ui,sans-serif;padding:32px;color:#334155">Loading offer letter…</body></html>`);
    win.document.close();
    try {
      const letter = await api<{
        letterNo?: string;
        instituteName?: string;
        fullName?: string;
        roleTitle?: string;
        department?: string;
        offerCtc?: number;
        offerJoiningDate?: string;
        body?: string;
        status?: string;
        offerLetterStatus?: string;
      }>(`/api/actions/ess/candidates/${id}/letter`);
      const letterLabel =
        (letter.offerLetterStatus || "").toUpperCase() === "SENT_FOR_SIGNATURE"
          ? "Sent For Signature"
          : prettyLabel(letter.offerLetterStatus || letter.status);
      const html = `<!doctype html><html><head><title>${escHtml(letter.letterNo || "Offer letter")}</title>
        <style>
          body{font-family:Georgia,serif;max-width:640px;margin:40px auto;padding:0 24px;color:#111;line-height:1.5}
          h1{font-size:22px;margin:0 0 4px} .meta{color:#555;font-size:13px;margin-bottom:24px}
          pre{white-space:pre-wrap;font-family:Georgia,serif;font-size:15px}
          .actions{margin-top:28px} button{padding:8px 14px;font-size:14px}
        </style></head><body>
          <h1>${escHtml(letter.instituteName || "Offer letter")}</h1>
          <p class="meta">${escHtml(letter.letterNo || "")} · ${escHtml(letterLabel)} · ${escHtml(letter.fullName || "")}</p>
          <pre>${escHtml(letter.body || "")}</pre>
          <div class="actions"><button onclick="window.print()">Print / Save PDF</button></div>
        </body></html>`;
      win.document.open();
      win.document.write(html);
      win.document.close();
      if (autoPrint) {
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch {
            /* ignore */
          }
        }, 300);
      }
    } catch (e) {
      try {
        win.document.open();
        win.document.write(`<!doctype html><html><body style="font-family:system-ui;padding:32px;color:#b91c1c">${escHtml((e as Error).message)}</body></html>`);
        win.document.close();
      } catch {
        try {
          win.close();
        } catch {
          /* ignore */
        }
      }
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || applicants.error || jobs.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open jobs" value={String((jobs.data ?? []).filter((j) => j.status !== "CLOSED").length)} />
        <StatCard label="Applicants" value={String((applicants.data ?? []).length)} />
        <StatCard label="Offer letters" value={String(offerCount)} />
      </div>

      <Card
        title="Offer letter workflow"
        action={
          <PrimaryButton onClick={() => navigate("/ess/offer-create")}>+ Create Letter</PrimaryButton>
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Field label="Search" value={search} onChange={setSearch} placeholder="Letter no, name, role…" />
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            {([
              { id: "ALL" as const, label: "All letters" },
              { id: "DRAFT" as const, label: "Draft" },
              { id: "SENT_FOR_SIGNATURE" as const, label: "Sent" },
              { id: "PUBLISHED" as const, label: "Published" },
            ]).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setLetterFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${letterFilter === f.id ? "bg-navy text-white" : "bg-mist"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Create, send, and track offer letters. Hiring pipeline (Applied → Interview) stays under Jobs & applicants setup. Showing {filtered.length} of {offerCount}.
        </p>
        <Table
          empty="No offer letters yet. Click + Create Letter to generate one."
          columns={["Letter no.", "Employee", "Role", "Start date", "CTC / Salary", "Status", "Actions"]}
          rows={filtered.map((c) => [
            c.letterNo || "—",
            <span key={`${c.id}-name`}>
              {c.fullName}
              <span className="block text-xs text-slate-500">{c.email || c.phone || ""}</span>
            </span>,
            <span key={`${c.id}-role`}>
              {c.jobTitle || "—"}
              <span className="block text-xs text-slate-500">{c.department || ""}</span>
            </span>,
            formatDay(c.offerJoiningDate) || "—",
            c.offerCtc != null ? formatInr(c.offerCtc) : "—",
            c.canViewLetter ? (
              <span key={`${c.id}-st`} className="flex flex-col gap-1">
                {letterStatusBadge(c.offerLetterStatus)}
                {c.status === "HIRED" && <span className="text-[10px] text-slate-500">Hired</span>}
              </span>
            ) : (
              statusBadge(c.status)
            ),
            <span key={`${c.id}-act`} className="flex flex-wrap items-center gap-2">
              {c.canViewLetter && <LinkButton onClick={() => void viewLetter(c.id)}>View</LinkButton>}
              {c.canViewLetter && <LinkButton onClick={() => void viewLetter(c.id, true)}>Download PDF</LinkButton>}
              {c.canEditLetter && <LinkButton onClick={() => navigate(`/ess/offer-create?id=${c.id}`)}>Edit</LinkButton>}
              {c.canSendLetter && (
                <LinkButton disabled={busyId === c.id} onClick={() => void sendLetter(c.id)}>
                  {busyId === c.id
                    ? "Sending…"
                    : (c.offerLetterStatus || "").toUpperCase() === "SENT_FOR_SIGNATURE" ||
                        (c.offerLetterStatus || "").toUpperCase() === "PUBLISHED"
                      ? "Resend Draft"
                      : "Send"}
                </LinkButton>
              )}
              {c.status === "APPLIED" && <LinkButton onClick={() => void advance(c.id, "INTERVIEW")}>Interview</LinkButton>}
              {c.status === "INTERVIEW" && (
                <LinkButton
                  onClick={() => {
                    setOfferForId(c.id);
                    setOfferCtc(c.offerCtc != null ? String(c.offerCtc) : "");
                    setOfferJoining(c.offerJoiningDate ? String(c.offerJoiningDate).slice(0, 10) : today());
                  }}
                >
                  Issue offer
                </LinkButton>
              )}
              {c.canViewLetter && (
                <span className="relative">
                  <LinkButton onClick={() => setMoreId((id) => (id === c.id ? null : c.id))}>More actions ▾</LinkButton>
                  {moreId === c.id && (
                    <span className="absolute right-0 z-10 mt-1 min-w-[9rem] rounded-lg border border-line bg-white p-2 shadow-md">
                      {c.status === "OFFER" && (
                        <button type="button" className="block w-full px-2 py-1.5 text-left text-sm hover:bg-mist" onClick={() => void hire(c.id)}>
                          Hire
                        </button>
                      )}
                      {(c.offerLetterStatus || "").toUpperCase() !== "PUBLISHED" && (
                        <button type="button" className="block w-full px-2 py-1.5 text-left text-sm hover:bg-mist" onClick={() => void publishLetter(c.id)}>
                          Mark published
                        </button>
                      )}
                      {c.status !== "HIRED" && c.status !== "REJECTED" && (
                        <button
                          type="button"
                          className="block w-full px-2 py-1.5 text-left text-sm text-red-700 hover:bg-mist"
                          onClick={() => void advance(c.id, "REJECTED")}
                        >
                          Reject
                        </button>
                      )}
                    </span>
                  )}
                </span>
              )}
              {!c.canViewLetter && c.status !== "HIRED" && c.status !== "REJECTED" && (
                <LinkButton onClick={() => void advance(c.id, "REJECTED")}>Reject</LinkButton>
              )}
            </span>,
          ])}
        />
        {offerForId && (
          <div className="mt-4 rounded-xl border border-line bg-mist/40 p-4">
            <p className="mb-3 text-sm font-semibold text-navy">Issue offer letter</p>
            <FormGrid>
              <Field label="Monthly honorarium / CTC (₹)" value={offerCtc} onChange={setOfferCtc} placeholder="8000" />
              <Field label="Joining date" type="date" value={offerJoining} onChange={setOfferJoining} />
            </FormGrid>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton disabled={!offerCtc || !offerJoining} onClick={() => void issueOffer()}>
                Create offer letter
              </PrimaryButton>
              <LinkButton onClick={() => setOfferForId(null)}>Cancel</LinkButton>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Jobs & applicants setup"
        action={
          <LinkButton onClick={() => setShowSetup((v) => !v)}>{showSetup ? "Hide" : "Show"}</LinkButton>
        }
      >
        {!showSetup ? (
          <p className="text-sm text-slate-500">
            Post institute jobs and add applicants here when needed. Student placement ATS stays under Placement.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-semibold text-navy">Post job</p>
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
                <TextArea label="Description" value={description} onChange={setDescription} rows={2} />
              </div>
              <div className="mt-3">
                <PrimaryButton disabled={!title} onClick={() => void addJob()}>
                  Post job
                </PrimaryButton>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-navy">Add applicant</p>
              <FormGrid>
                <Select
                  label="Job"
                  value={vacancyId}
                  onChange={setVacancyId}
                  options={(jobs.data ?? []).filter((j) => j.status !== "CLOSED").map((j) => ({ value: j.id, label: j.title }))}
                />
                <Field label="Name" value={fullName} onChange={setFullName} />
                <Field label="Email" value={email} onChange={setEmail} />
                <PhoneField label="Phone" value={phone} onChange={setPhone} />
              </FormGrid>
              <div className="mt-3">
                <PrimaryButton disabled={!vacancyId || !fullName} onClick={() => void addApplicant()}>
                  Add applicant
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function DevicesTab() {
  const { user } = useAuth();
  const punches = useApi<Punch[]>("/api/biometric-punches");
  const punchSecret = useApi<{ deviceSecret?: string }>("/api/actions/ess/punch-secret");
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
      <ErrorText error={error || punches.error || punchSecret.error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Device punch">
        <p className="mb-3 text-sm text-slate-500">
          Match staff by employee code or mobile. Students match by student code, roll number, or mobile. Devices must POST JSON
          {" "}
          <code className="text-xs">{`{ "code", "deviceId", "punchType", "deviceSecret" }`}</code>
          {punchUrl ? (
            <>
              {" "}
              to <code className="text-xs">{punchUrl}</code>.
            </>
          ) : (
            <> once your institute website slug is set (Institute settings).</>
          )}
        </p>
        {punchSecret.data?.deviceSecret && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Public deviceSecret: <code className="font-mono text-xs">{punchSecret.data.deviceSecret}</code>{" "}
            <LinkButton
              onClick={() => {
                void navigator.clipboard.writeText(punchSecret.data?.deviceSecret || "");
                setNotice("Device secret copied.");
              }}
            >
              Copy
            </LinkButton>
          </p>
        )}
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
  const ledger = useApi<{ id?: string; employeeId?: string; employeeName: string; sourceType: string; amount: number; description?: string; status: string; periodMonth?: number; periodYear?: number }[]>(
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
            allowEmpty={false}
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
          columns={["Employee", "Type", "Amount", "Period", "Status", "Note", ""]}
          rows={(ledger.data ?? []).map((r) => [
            r.employeeName,
            prettyLabel(r.sourceType),
            formatInr(r.amount),
            `${r.periodMonth}/${r.periodYear}`,
            prettyLabel(r.status),
            r.description || "—",
            r.status === "APPROVED" && r.employeeId && r.periodYear && r.periodMonth ? (
              <LinkButton
                key={`${r.employeeId}-${r.periodYear}-${r.periodMonth}-pay`}
                onClick={() =>
                  void (async () => {
                    setError(null);
                    try {
                      await api("/api/actions/compensation/mark-paid", {
                        method: "POST",
                        body: JSON.stringify({ employeeId: r.employeeId, year: r.periodYear, month: r.periodMonth }),
                      });
                      ledger.reload();
                      setNotice(`Marked commissions paid for ${r.employeeName} (${r.periodMonth}/${r.periodYear}).`);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  })()
                }
              >
                Mark paid
              </LinkButton>
            ) : (
              ""
            ),
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

/** Open HTML in a new tab without noopener (so write works) and without losing the click gesture when possible. */
function openPrintHtml(html: string, autoPrint = false) {
  const win = window.open("about:blank", "_blank", "width=720,height=900");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  if (autoPrint) {
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* ignore */
      }
    }, 300);
  }
  return true;
}
