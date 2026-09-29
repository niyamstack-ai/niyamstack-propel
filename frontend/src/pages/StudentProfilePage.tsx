import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { updateRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, formatDay, formatInr, useApi, PhoneField, phoneForApi } from "../ui";

type Student = {
  id: string;
  studentCode: string;
  fullName: string;
  status: string;
  email?: string;
  phone?: string;
  userId?: string;
  courseId?: string;
  batchId?: string;
  centerId?: string;
  enrollmentDate?: string;
  dateOfBirth?: string;
  permanentAddress?: string;
  photoUrl?: string;
  trashedAt?: string | null;
  previousStatus?: string | null;
};

type Named = { id: string; name: string; courseId?: string };
type Tab = "profile" | "attendance" | "tests" | "fees" | "placement" | "documents" | "guardians";

const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "attendance", label: "Attendance" },
  { id: "tests", label: "Tests" },
  { id: "fees", label: "Fees" },
  { id: "placement", label: "Placement" },
  { id: "documents", label: "Documents" },
  { id: "guardians", label: "Guardians" },
];

export function studentOpenPath(id: string, fromPeople = true) {
  return fromPeople ? `/people/students/${id}` : `/students/${id}`;
}

export function StudentProfilePage() {
  const { studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fromPeople = location.pathname.startsWith("/people");
  const student = useApi<Student>(studentId ? `/api/students/${studentId}` : "");
  const courses = useApi<Named[]>("/api/courses");
  const batches = useApi<Named[]>("/api/batches");
  const centers = useApi<Named[]>("/api/centers");
  const attendance = useApi<{ sessionDate: string; status: string; studentId?: string }[]>("/api/attendance");
  const attempts = useApi<{ assessmentId?: string; score?: number; maxScore?: number; status?: string; submittedAt?: string; studentId?: string }[]>(
    "/api/exam-attempts",
  );
  const assessments = useApi<{ id: string; title?: string; name?: string }[]>("/api/assessments");
  const invoices = useApi<{ id: string; invoiceNo: string; amount: number; paidAmount?: number; status: string; dueDate?: string; studentId?: string }[]>(
    "/api/invoices",
  );
  const mocks = useApi<{ kind: string; score?: number; feedback?: string; scheduledAt?: string; studentId?: string }[]>("/api/mocks");
  const resumes = useApi<{ versionLabel?: string; completeness?: number; studentId?: string }[]>("/api/resumes");
  const skills = useApi<{ name: string; proficiency?: string; studentId?: string }[]>("/api/skills");
  const applications = useApi<{ status?: string; driveId?: string; studentId?: string }[]>("/api/applications");
  const docs = useApi<{ docType: string; fileName: string; studentId?: string }[]>("/api/student-documents");
  const guardians = useApi<{ fullName: string; relation?: string; phone?: string; studentId?: string }[]>("/api/guardians");

  const [tab, setTab] = useState<Tab>("profile");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const s = student.data;
  const nameOf = (id: string | undefined, rows: Named[] | null) => rows?.find((r) => r.id === id)?.name || "—";

  const mineAttendance = (attendance.data ?? []).filter((a) => a.studentId === studentId);
  const present = mineAttendance.filter((a) => a.status === "PRESENT").length;
  const attPct = mineAttendance.length ? Math.round((present * 100) / mineAttendance.length) : null;

  async function setStatus(next: string) {
    if (!s) return;
    if (!window.confirm(`Mark ${s.fullName} as ${prettyLabel(next)}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await updateRecord(`/api/students/${s.id}`, { ...s, status: next });
      student.reload();
      setNotice(`Status set to ${prettyLabel(next)}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function trash() {
    if (!s) return;
    if (!window.confirm(`Move ${s.fullName} to Trash? They leave the live roster. You can restore them from People → Trash.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/students/${s.id}/trash`, { method: "POST", body: "{}" });
      navigate(fromPeople ? "/people/trash" : "/students?trash=1");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function restore() {
    if (!s) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/students/${s.id}/restore`, { method: "POST", body: "{}" });
      student.reload();
      setNotice("Restored to the live student list.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const backTo = s?.trashedAt ? (fromPeople ? "/people/trash" : "/students?trash=1") : fromPeople ? "/people/students" : "/students";
  const nextStatuses = useMemo(() => {
    const cur = (s?.status || "").toUpperCase();
    const all = [
      { id: "ACTIVE", label: "Active" },
      { id: "ENROLLED", label: "Enrolled" },
      { id: "DEFERRED", label: "On hold" },
      { id: "DROPPED", label: "Dropped" },
      { id: "ALUMNI", label: "Alumni" },
    ];
    return all.filter((x) => x.id !== cur && x.id !== "TRASHED");
  }, [s?.status]);

  if (student.loading) return <p className="text-sm text-slate-500">Loading student…</p>;
  if (student.error || !s) {
    return (
      <div className="space-y-3">
        <Link className="text-sm text-brand" to={backTo}>
          ← Students
        </Link>
        <ErrorText error={student.error || "Student not found"} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-brand" to={backTo}>
          ← {s.trashedAt ? "Trash" : "Students"}
        </Link>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {s.photoUrl ? (
            <img src={s.photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mist text-lg font-semibold text-navy">
              {s.fullName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-navy">{s.fullName}</h1>
            <p className="mt-1 flex flex-wrap gap-2 text-sm text-slate-500">
              <span className="rounded-full bg-mist px-2 py-0.5 font-medium text-navy">{s.studentCode}</span>
              <span className="rounded-full bg-mist px-2 py-0.5">{prettyLabel(s.status)}</span>
              {s.trashedAt && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">In trash</span>}
              <span>{nameOf(s.courseId, courses.data)}</span>
              <span>{nameOf(s.batchId, batches.data)}</span>
              {s.phone && <span>{s.phone}</span>}
              <span>{s.userId ? "Login on" : "No login"}</span>
              {attPct != null && <span>Attendance {attPct}%</span>}
            </p>
          </div>
        </div>
      </div>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {!s.trashedAt && (
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((st) => (
            <button
              key={st.id}
              type="button"
              className="rounded-full border border-line px-3 py-1 text-sm"
              disabled={busy}
              onClick={() => void setStatus(st.id)}
            >
              {st.label}
            </button>
          ))}
          <button type="button" className="rounded-full border border-red-200 px-3 py-1 text-sm text-red-700" disabled={busy} onClick={() => void trash()}>
            Move to trash
          </button>
        </div>
      )}
      {s.trashedAt && (
        <button type="button" className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white" disabled={busy} onClick={() => void restore()}>
          Restore student
        </button>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm ${tab === item.id ? "bg-navy text-white" : "bg-mist"}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <Card title="Profile">
          <ProfileEditor
            s={s}
            courses={courses.data ?? []}
            batches={batches.data ?? []}
            centers={centers.data ?? []}
            busy={busy}
            onSave={async (next) => {
              setBusy(true);
              setError(null);
              setNotice(null);
              try {
                await updateRecord(`/api/students/${s.id}`, { ...s, ...next });
                student.reload();
                setNotice("Profile saved.");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </Card>
      )}

      {tab === "attendance" && (
        <Card title="Attendance">
          <p className="mb-3 text-sm text-slate-500">
            {mineAttendance.length === 0 ? "No sessions marked yet." : `${present} present of ${mineAttendance.length} marked (${attPct}%).`}
          </p>
          <Table
            empty="No attendance rows."
            columns={["Date", "Status"]}
            rows={mineAttendance.slice(0, 40).map((a) => [formatDay(a.sessionDate), prettyLabel(a.status)])}
          />
        </Card>
      )}

      {tab === "tests" && (
        <Card title="Tests">
          <Table
            empty="No test attempts yet."
            columns={["Test", "Score", "Status"]}
            rows={(attempts.data ?? [])
              .filter((a) => a.studentId === studentId)
              .map((a) => [
                assessments.data?.find((x) => x.id === a.assessmentId)?.title
                  || assessments.data?.find((x) => x.id === a.assessmentId)?.name
                  || "Test",
                a.maxScore ? `${a.score ?? "—"} / ${a.maxScore}` : String(a.score ?? "—"),
                prettyLabel(a.status || ""),
              ])}
          />
        </Card>
      )}

      {tab === "fees" && (
        <Card title="Fees">
          <Table
            empty="No invoices for this student."
            columns={["Invoice", "Amount", "Paid", "Status", "Due"]}
            rows={(invoices.data ?? [])
              .filter((i) => i.studentId === studentId)
              .map((i) => [i.invoiceNo, formatInr(i.amount), formatInr(i.paidAmount), prettyLabel(i.status), formatDay(i.dueDate)])}
          />
        </Card>
      )}

      {tab === "placement" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Resume">
            {(resumes.data ?? []).filter((r) => !r.studentId || r.studentId === studentId).length === 0 ? (
              <p className="text-sm text-slate-500">No resume on file. Add one under Placement → Readiness.</p>
            ) : (
              <ul className="text-sm">
                {(resumes.data ?? [])
                  .filter((r) => !r.studentId || r.studentId === studentId)
                  .map((r, i) => (
                    <li key={i}>
                      {r.versionLabel || "Resume"} · {r.completeness ?? 0}% complete
                    </li>
                  ))}
              </ul>
            )}
          </Card>
          <Card title="Mock interviews">
            <Table
              empty="No mocks recorded."
              columns={["Kind", "Score", "Feedback"]}
              rows={(mocks.data ?? [])
                .filter((m) => !m.studentId || m.studentId === studentId)
                .map((m) => [m.kind, String(m.score ?? "—"), m.feedback || "—"])}
            />
          </Card>
          <Card title="Skills">
            <ul className="text-sm">
              {(skills.data ?? []).filter((x) => !x.studentId || x.studentId === studentId).length === 0 && (
                <li className="text-slate-500">No skills listed.</li>
              )}
              {(skills.data ?? [])
                .filter((x) => !x.studentId || x.studentId === studentId)
                .map((x, i) => (
                  <li key={i}>
                    {x.name} ({prettyLabel(x.proficiency || "")})
                  </li>
                ))}
            </ul>
          </Card>
          <Card title="Job applications">
            <Table
              empty="No applications."
              columns={["Status"]}
              rows={(applications.data ?? [])
                .filter((a) => a.studentId === studentId)
                .map((a) => [prettyLabel(a.status || "")])}
            />
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <Card title="Documents">
          <ul className="text-sm">
            {(docs.data ?? []).filter((d) => !d.studentId || d.studentId === studentId).length === 0 && (
              <li className="text-slate-500">No documents uploaded.</li>
            )}
            {(docs.data ?? [])
              .filter((d) => !d.studentId || d.studentId === studentId)
              .map((d, i) => (
                <li key={i}>
                  {d.docType}: {d.fileName}
                </li>
              ))}
          </ul>
        </Card>
      )}

      {tab === "guardians" && (
        <Card title="Guardians">
          <ul className="text-sm">
            {(guardians.data ?? []).filter((g) => g.studentId === studentId).length === 0 && (
              <li className="text-slate-500">No guardian linked.</li>
            )}
            {(guardians.data ?? [])
              .filter((g) => g.studentId === studentId)
              .map((g, i) => (
                <li key={i}>
                  {g.fullName} ({g.relation || "Guardian"}
                  {g.phone ? ` · ${g.phone}` : ""})
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ProfileEditor({
  s,
  courses,
  batches,
  centers,
  busy,
  onSave,
}: {
  s: Student;
  courses: Named[];
  batches: Named[];
  centers: Named[];
  busy: boolean;
  onSave: (next: Record<string, string | null>) => Promise<void>;
}) {
  const [name, setName] = useState(s.fullName);
  const [email, setEmail] = useState(s.email || "");
  const [phone, setPhone] = useState(s.phone || "");
  const [dob, setDob] = useState(s.dateOfBirth?.slice(0, 10) || "");
  const [address, setAddress] = useState(s.permanentAddress || "");
  const [courseId, setCourseId] = useState(s.courseId || "");
  const [batchId, setBatchId] = useState(s.batchId || "");
  const [centerId, setCenterId] = useState(s.centerId || "");
  const [status, setStatus] = useState(s.status);

  return (
    <>
      <FormGrid>
        <Field label="Full name" name="fullName" value={name} onChange={setName} />
        <Field label="Email" name="email" value={email} onChange={setEmail} />
        <PhoneField label="Phone" name="phone" value={phone} onChange={setPhone} />
        <Field label="Date of birth" name="dateOfBirth" value={dob} onChange={setDob} type="date" />
        <Field label="Address" name="permanentAddress" value={address} onChange={setAddress} />
        <Select
          label="Course"
          value={courseId}
          onChange={setCourseId}
          options={courses.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="Batch"
          value={batchId}
          onChange={setBatchId}
          options={batches.filter((b) => !courseId || !b.courseId || b.courseId === courseId).map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="Center"
          value={centerId}
          onChange={setCenterId}
          options={centers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "ENROLLED", label: "Enrolled" },
            { value: "ACTIVE", label: "Active" },
            { value: "DEFERRED", label: "On hold" },
            { value: "DROPPED", label: "Dropped" },
            { value: "ALUMNI", label: "Alumni" },
          ]}
        />
      </FormGrid>
      <div className="pt-2">
        <PrimaryButton
          disabled={busy || !!s.trashedAt}
          onClick={() =>
            void onSave({
              fullName: name,
              email,
              phone: phoneForApi(phone),
              dateOfBirth: dob || null,
              permanentAddress: address || null,
              courseId: courseId || null,
              batchId: batchId || null,
              centerId: centerId || null,
              status,
            })
          }
        >
          {busy ? "Saving…" : "Save profile"}
        </PrimaryButton>
      </div>
    </>
  );
}
