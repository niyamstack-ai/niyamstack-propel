import { useEffect, useState } from "react";
import { api } from "../api";
import { createRecord, updateRecord } from "../ops";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Student = {
  id: string;
  studentCode: string;
  fullName: string;
  status: string;
  email: string;
  phone: string;
  courseId?: string;
  batchId?: string;
  centerId?: string;
  enrollmentDate?: string;
};
type Named = { id: string; name: string; code?: string };

export function StudentsPage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT" || user?.role === "PARENT") return <MyStudentRecord />;
  return <StaffStudents canEnroll={user?.role === "OWNER" || user?.role === "COUNSELOR"} />;
}

export function MyStudentRecord() {
  const { user, applySession } = useAuth();
  const students = useApi<Student[]>("/api/students");
  const guardians = useApi<{ fullName: string; relation: string }[]>("/api/guardians");
  const attendance = useApi<{ sessionDate: string; status: string }[]>("/api/attendance");
  const certs = useApi<{ title: string; issuedOn?: string }[]>("/api/certificates");
  const record = students.data?.[0];
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || record?.phone || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.name || record?.fullName || "");
    setEmail(user?.email || record?.email || "");
    setPhone(user?.phone || record?.phone || "");
  }, [user?.name, user?.email, user?.phone, record?.fullName, record?.email, record?.phone]);

  const present = (attendance.data ?? []).filter((a) => a.status === "PRESENT").length;
  const attTotal = (attendance.data ?? []).length;

  async function saveProfile() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ token: string; user: { id: string; name: string; email: string; phone?: string; role: string; organizationId: string; packageTier: string } }>(
        "/api/auth/profile",
        { method: "PATCH", body: JSON.stringify({ name, email, phone }) }
      );
      applySession(res);
      students.reload();
      setNotice("Profile saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (newPassword !== confirm) throw new Error("New passwords do not match");
      await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setNotice("Password updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">My profile</h1>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Account">
        <FormGrid>
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <Field label="Mobile" value={phone} onChange={setPhone} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={busy || !name} onClick={() => void saveProfile()}>
            {busy ? "Saving…" : "Save profile"}
          </PrimaryButton>
        </div>
        {record && (
          <p className="mt-3 text-xs text-slate-400">
            {record.studentCode} · {record.status}
            {record.enrollmentDate ? ` · enrolled ${record.enrollmentDate}` : ""}
          </p>
        )}
      </Card>
      <Card title="Change password">
        <p className="mb-3 text-xs text-slate-500">
          At least 10 characters, with upper, lower, a digit, and a special character. If you signed in with OTP, leave current password blank.
        </p>
        <FormGrid>
          <Field label="Current password (if you have one)" value={currentPassword} onChange={setCurrentPassword} type="password" />
          <Field label="New password" value={newPassword} onChange={setNewPassword} type="password" />
          <Field label="Confirm new password" value={confirm} onChange={setConfirm} type="password" />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={busy || !newPassword} onClick={() => void savePassword()}>
            Update password
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Attendance">
        {attTotal === 0 ? (
          <p className="text-sm text-slate-500">No attendance marked yet.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-navy">
              {present}/{attTotal} present ({Math.round((present * 100) / attTotal)}%)
            </p>
            <ul className="text-sm">
              {(attendance.data ?? []).slice(0, 20).map((a, i) => (
                <li key={i}>
                  {a.sessionDate} — {a.status}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title="Certificates">
        {(certs.data ?? []).length === 0 && <p className="text-sm text-slate-500">No certificates issued yet.</p>}
        <ul className="text-sm">
          {(certs.data ?? []).map((c, i) => (
            <li key={i}>
              {c.title}
              {c.issuedOn ? ` · ${c.issuedOn}` : ""}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Guardians">
        <ul className="text-sm">
          {(guardians.data ?? []).length === 0 && <li>No guardian linked.</li>}
          {(guardians.data ?? []).map((g, i) => (
            <li key={i}>
              {g.fullName} ({g.relation})
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function StaffStudents({ canEnroll, embedded }: { canEnroll: boolean; embedded?: boolean }) {
  const students = useApi<Student[]>("/api/students");
  const courses = useApi<Named[]>("/api/courses");
  const batches = useApi<Named[]>("/api/batches");
  const centers = useApi<Named[]>("/api/centers");
  const docs = useApi<{ fileName: string; docType: string }[]>("/api/student-documents");
  const guardians = useApi<{ fullName: string; relation: string }[]>("/api/guardians");
  const risk = useApi<{ student: Student; reason: string }[]>("/api/actions/at-risk");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [gStudent, setGStudent] = useState("");
  const [gName, setGName] = useState("");
  const [gRel, setGRel] = useState("Parent");
  const [gPhone, setGPhone] = useState("");

  async function addStudent() {
    setBusy(true);
    setError(null);
    try {
      await createRecord("/api/students", {
        studentCode: code || `STU-${Date.now().toString().slice(-6)}`,
        fullName: name,
        email,
        phone,
        courseId: courseId || null,
        batchId: batchId || null,
        centerId: centerId || null,
        status: "ENROLLED",
        enrollmentDate: new Date().toISOString().slice(0, 10),
      });
      setCode("");
      setName("");
      setEmail("");
      setPhone("");
      students.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(s: Student, status: string) {
    try {
      await updateRecord(`/api/students/${s.id}`, { ...s, status });
      students.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addGuardian() {
    setError(null);
    try {
      await createRecord("/api/guardians", {
        studentId: gStudent,
        fullName: gName,
        relation: gRel,
        phone: gPhone,
      });
      setGName("");
      setGPhone("");
      guardians.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {!embedded && (
      <div>
        <h1 className="text-2xl font-bold text-navy">Students</h1>
        <p className="text-sm text-slate-500">Enroll students, keep the master record, link guardians, and track at-risk learners.</p>
      </div>
      )}
      {canEnroll && (
      <Card title="Enroll a student">
        <FormGrid>
          <Field label="Student code" value={code} onChange={setCode} placeholder="Auto if blank" />
          <Field label="Full name" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} />
          <Field label="Phone" value={phone} onChange={setPhone} />
          <Select label="Center" value={centerId} onChange={setCenterId} options={(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Course" value={courseId} onChange={setCourseId} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <div className="flex items-end">
            <PrimaryButton disabled={busy || !name} onClick={addStudent}>
              Save student
            </PrimaryButton>
          </div>
        </FormGrid>
        <ErrorText error={error} />
      </Card>
      )}
      <Card title="Student master">
        <Table
          columns={["Code", "Name", "Status", "Email", "Lifecycle"]}
          rows={(students.data ?? []).map((s) => [
            s.studentCode,
            s.fullName,
            s.status,
            s.email,
            <span className="flex flex-wrap gap-2">
              <Linkish onClick={() => setStatus(s, "ACTIVE")}>Active</Linkish>
              <Linkish onClick={() => setStatus(s, "DEFERRED")}>Defer</Linkish>
              <Linkish onClick={() => setStatus(s, "DROPPED")}>Drop</Linkish>
              <Linkish onClick={() => setStatus(s, "ALUMNI")}>Alumni</Linkish>
            </span>,
          ])}
        />
      </Card>
      <Card title="Link guardian / parent">
        <FormGrid>
          <Select
            label="Student"
            value={gStudent}
            onChange={setGStudent}
            options={(students.data ?? []).map((s) => ({ value: s.id, label: `${s.studentCode} ${s.fullName}` }))}
          />
          <Field label="Guardian name" value={gName} onChange={setGName} />
          <Field label="Relation" value={gRel} onChange={setGRel} />
          <Field label="Phone" value={gPhone} onChange={setGPhone} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!gStudent || !gName} onClick={addGuardian}>
            Save guardian
          </PrimaryButton>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Documents vault">
          <ul className="text-sm">
            {(docs.data ?? []).map((d, i) => (
              <li key={i}>
                {d.docType}: {d.fileName}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Guardians">
          <ul className="text-sm">
            {(guardians.data ?? []).map((g, i) => (
              <li key={i}>
                {g.fullName} ({g.relation})
              </li>
            ))}
          </ul>
        </Card>
        <Card title="At-risk / success CRM">
          <ul className="text-sm">
            {(risk.data ?? []).map((r, i) => (
              <li key={i}>
                {r.student.fullName}: {r.reason}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Linkish({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="text-brand hover:underline" type="button" onClick={onClick}>
      {children}
    </button>
  );
}
