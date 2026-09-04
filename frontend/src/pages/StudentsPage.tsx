import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { createRecord, updateRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FileUpload, FormGrid, PrimaryButton, Select, Table, formatDay, useApi } from "../ui";

type Student = {
  id: string;
  studentCode: string;
  fullName: string;
  status: string;
  email: string;
  phone: string;
  userId?: string;
  courseId?: string;
  batchId?: string;
  centerId?: string;
  enrollmentDate?: string;
};
type Named = { id: string; name: string; code?: string; courseId?: string };

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
  const certs = useApi<{ id?: string; title: string; issuedOn?: string; certificateNo?: string }[]>("/api/certificates");
  const kids = students.data ?? [];
  const isParent = user?.role === "PARENT";
  const [childId, setChildId] = useState("");
  const record = (childId ? kids.find((s) => s.id === childId) : undefined) || kids[0];
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
    if (!kids.length) return;
    if (!childId || !kids.some((s) => s.id === childId)) setChildId(kids[0].id);
  }, [kids, childId]);

  useEffect(() => {
    if (isParent) {
      setName(user?.name || "");
      setEmail(user?.email || "");
      setPhone(user?.phone || "");
      return;
    }
    setName(user?.name || record?.fullName || "");
    setEmail(user?.email || record?.email || "");
    setPhone(user?.phone || record?.phone || "");
  }, [isParent, user?.name, user?.email, user?.phone, record?.fullName, record?.email, record?.phone]);

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
      <h1 className="text-2xl font-bold text-navy">{isParent ? "My child" : "My profile"}</h1>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {isParent && (
        <Card title="My children">
          {kids.length === 0 ? (
            <p className="text-sm text-slate-500">No linked students yet.</p>
          ) : (
            <>
              <ul className="mb-3 space-y-1 text-sm">
                {kids.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`text-left ${s.id === record?.id ? "font-semibold text-navy" : "text-brand hover:underline"}`}
                      onClick={() => setChildId(s.id)}
                    >
                      {s.fullName}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {s.studentCode} · {s.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {record && (
                <p className="text-xs text-slate-400">
                  Showing {record.fullName}
                  {record.enrollmentDate ? ` · enrolled ${formatDay(record.enrollmentDate)}` : ""}
                </p>
              )}
            </>
          )}
        </Card>
      )}
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
        {!isParent && record && (
          <p className="mt-3 text-xs text-slate-400">
            {record.studentCode} · {record.status}
            {record.enrollmentDate ? ` · enrolled ${formatDay(record.enrollmentDate)}` : ""}
          </p>
        )}
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
                  {formatDay(a.sessionDate) || a.sessionDate} — {a.status}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title="Certificates">
        {(certs.data ?? []).length === 0 && (
          <p className="text-sm text-slate-500">Finish the course materials, homework, and tests to receive a certificate automatically.</p>
        )}
        <ul className="text-sm">
          {(certs.data ?? []).map((c, i) => (
            <li key={c.id || i} className="flex items-center justify-between gap-2">
              <span>
                {c.title}
                {c.issuedOn ? ` · ${formatDay(c.issuedOn)}` : ""}
              </span>
              {c.id && (
                <button
                  type="button"
                  className="text-sm font-medium text-brand"
                  onClick={() =>
                    void api<{ certificateNo?: string; title: string; studentName?: string; courseName?: string; instituteName?: string; issuedOn?: string }>(
                      `/api/actions/certificates/${c.id}`,
                    ).then((rec) => {
                      const win = window.open("", "_blank");
                      if (!win) return;
                      win.document.write(`<!doctype html><html><head><title>${rec.certificateNo || "Certificate"}</title>
                        <style>body{font-family:Georgia,serif;padding:48px;text-align:center;color:#071a33}h1{margin:24px 0 8px;font-size:28px}p{margin:8px 0}</style></head>
                        <body>
                          <p>${rec.instituteName || ""}</p>
                          <h1>Certificate of completion</h1>
                          <p>This is to certify that</p>
                          <p style="font-size:22px;font-weight:700">${rec.studentName || ""}</p>
                          <p>has completed</p>
                          <p style="font-size:18px;font-weight:600">${rec.courseName || rec.title}</p>
                          <p>${rec.issuedOn || ""} · ${rec.certificateNo || ""}</p>
                          <script>window.print()<\/script>
                        </body></html>`);
                      win.document.close();
                    })
                  }
                >
                  Download / print
                </button>
              )}
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
  const risk = useApi<{ student: Student; reason: string; taskOpen?: boolean }[]>("/api/actions/at-risk");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docStudent, setDocStudent] = useState("");
  const [docType, setDocType] = useState("Aadhaar");
  const [docFile, setDocFile] = useState("");

  const [gStudent, setGStudent] = useState("");
  const [gName, setGName] = useState("");
  const [gRel, setGRel] = useState("Parent");
  const [gPhone, setGPhone] = useState("");

  const courseBatches = useMemo(
    () => (batches.data ?? []).filter((b) => !courseId || !b.courseId || b.courseId === courseId),
    [batches.data, courseId]
  );

  useEffect(() => {
    if (!batchId) return;
    if (!courseBatches.some((b) => b.id === batchId)) setBatchId("");
  }, [batchId, courseBatches]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addStudent() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createRecord("/api/students", {
        studentCode: code || `STU-${Date.now().toString().slice(-6)}`,
        fullName: name,
        email,
        phone,
        courseId: courseId || null,
        batchId: batchId || null,
        centerId: centerId || null,
        dateOfBirth: dob || null,
        permanentAddress: address || null,
        photoUrl: photoUrl || null,
        status: "ENROLLED",
        enrollmentDate: new Date().toISOString().slice(0, 10),
      }) as Student & { tempPassword?: string };
      let parentNote = "";
      if (parentPhone) {
        const invited = await api<{ phone?: string; tempPassword?: string }>(`/api/actions/sis/parents/invite`, {
          method: "POST",
          body: JSON.stringify({ studentId: created.id, fullName: "Parent", relation: "Parent", phone: parentPhone }),
        });
        parentNote = invited.tempPassword
          ? ` Parent can log in with mobile ${invited.phone} (OTP) or temporary password ${invited.tempPassword}.`
          : ` Parent login linked for ${invited.phone}.`;
      }
      setCode("");
      setName("");
      setEmail("");
      setPhone("");
      setDob("");
      setAddress("");
      setParentPhone("");
      setPhotoUrl("");
      students.reload();
      setNotice(
        (created.tempPassword
          ? `${created.fullName} can log in on your website with mobile ${created.phone} (OTP) or email ${created.email} / password ${created.tempPassword}. Share this once.`
          : `${created.fullName} was enrolled.`) + parentNote
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function issueLogin(s: Student) {
    if (!window.confirm(`Create a website login for ${s.fullName}?`)) return;
    setError(null);
    setNotice(null);
    try {
      const created = await api<{ tempPassword?: string; phone?: string; email?: string }>(`/api/students/${s.id}/issue-login`, { method: "POST" });
      students.reload();
      setNotice(
        `${s.fullName} can log in with mobile ${created.phone || s.phone} (OTP) or email ${created.email || s.email} / password ${created.tempPassword}. Share this once.`
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setStatus(s: Student, status: string) {
    const labels: Record<string, string> = {
      DEFERRED: `Put ${s.fullName} on hold? They stay in the list but are not treated as active.`,
      DROPPED: `Drop ${s.fullName}? This does not delete fee records.`,
      ALUMNI: `Mark ${s.fullName} as alumni?`,
      ACTIVE: `Mark ${s.fullName} as active?`,
    };
    if (!window.confirm(labels[status] || `Change status for ${s.fullName}?`)) return;
    try {
      await updateRecord(`/api/students/${s.id}`, { ...s, status });
      students.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addGuardian() {
    setError(null);
    setNotice(null);
    try {
      await createRecord("/api/guardians", {
        studentId: gStudent,
        fullName: gName,
        relation: gRel,
        phone: gPhone,
      });
      if (gPhone) {
        const invited = await api<{ phone?: string; tempPassword?: string }>(`/api/actions/sis/parents/invite`, {
          method: "POST",
          body: JSON.stringify({ studentId: gStudent, fullName: gName, relation: gRel, phone: gPhone }),
        });
        setNotice(
          invited.tempPassword
            ? `Parent can log in with mobile ${invited.phone} (OTP) or the temporary password ${invited.tempPassword}.`
            : `Parent login linked for ${invited.phone}. They use OTP on the institute login.`,
        );
      }
      setGName("");
      setGPhone("");
      guardians.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function printId(s: Student) {
    setError(null);
    try {
      const rec = await api<{ instituteName?: string; fullName?: string; code?: string; photoUrl?: string }>(`/api/actions/sis/id-card/STUDENT/${s.id}`);
      const win = window.open("", "_blank");
      if (!win) {
        setError("Allow pop-ups to print the ID card.");
        return;
      }
      win.document.write(`<!doctype html><html><head><title>ID</title></head><body>
        <h1>${rec.instituteName || ""}</h1><h2>${rec.fullName || s.fullName}</h2><p>${rec.code || s.studentCode}</p>
        <script>window.print()<\/script></body></html>`);
      win.document.close();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {!embedded && (
      <div>
        <h1 className="text-2xl font-bold text-navy">Students</h1>
        <p className="text-sm text-slate-500">Enroll students with a mobile number. That creates a login for your institute website.</p>
      </div>
      )}
      {canEnroll && (
      <Card title="Enroll a student">
        <FormGrid>
          <Field key="enroll-code" name="student-code" label="Student code" value={code} onChange={setCode} placeholder="Auto if blank" />
          <Field key="enroll-name" name="student-name" label="Full name" value={name} onChange={setName} />
          <Field key="enroll-email" name="student-email" label="Email" value={email} onChange={setEmail} />
          <Field key="enroll-phone" name="student-mobile" label="Phone" value={phone} onChange={setPhone} placeholder="Student mobile" />
          <Field key="enroll-dob" name="student-dob" label="Date of birth" value={dob} onChange={setDob} type="date" />
          <Field key="enroll-address" name="student-address" label="Address" value={address} onChange={setAddress} />
          <Field key="enroll-parent-phone" name="parent-mobile" label="Parent phone" value={parentPhone} onChange={setParentPhone} />
          <FileUpload key="enroll-photo" label="Photo" value={photoUrl} accept="image/*" onChange={setPhotoUrl} />
          <Select key="enroll-center" label="Center" value={centerId} onChange={setCenterId} options={(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select key="enroll-course" label="Course" value={courseId} onChange={setCourseId} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select key="enroll-batch" label="Batch" value={batchId} onChange={setBatchId} options={courseBatches.map((c) => ({ value: c.id, label: c.name }))} />
          <div className="flex items-end">
            <PrimaryButton disabled={busy || !name || !phone} onClick={addStudent}>
              Save student
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      )}
      <ErrorText error={error} />
      {notice && <p className="text-sm text-navy">{notice}</p>}
      <Card title="Students">
        <Table
          empty="No students yet. Enrol the first student above."
          columns={["Code", "Name", "Status", "Email", ""]}
          rows={(students.data ?? []).map((s) => [
            s.studentCode,
            s.fullName,
            prettyLabel(s.status),
            s.email,
            <span className="flex flex-wrap gap-2">
              {!s.userId && (
                <Linkish onClick={() => void issueLogin(s)}>Create login</Linkish>
              )}
              <Linkish onClick={() => void printId(s)}>ID card</Linkish>
              <Linkish onClick={() => setStatus(s, "ACTIVE")}>Active</Linkish>
              <Linkish onClick={() => setStatus(s, "DEFERRED")}>On hold</Linkish>
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
          <PrimaryButton disabled={!gStudent || !gName || !gPhone} onClick={addGuardian}>
            Save guardian and invite parent
          </PrimaryButton>
        </div>
      </Card>
      <CustomFieldsCard students={students.data ?? []} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="ID documents">
          <p className="mb-3 text-xs text-slate-500">Upload Aadhaar, PAN, or a photo. The file is stored on this server.</p>
          <FormGrid>
            <Select label="Student" value={docStudent} onChange={setDocStudent} options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
            <Field label="Document" value={docType} onChange={setDocType} placeholder="Aadhaar / PAN / photo" />
            <FileUpload label="File" value={docFile} onChange={setDocFile} />
            <div className="flex items-end">
              <PrimaryButton
                disabled={!docStudent || !docFile}
                onClick={async () => {
                  await createRecord("/api/student-documents", { studentId: docStudent, docType, fileName: docType || "document", storageUrl: docFile });
                  setDocFile("");
                  docs.reload();
                }}
              >
                Save document
              </PrimaryButton>
            </div>
          </FormGrid>
          <ul className="mt-3 text-sm">
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
        <Card title="Needs follow-up">
          <ul className="space-y-2 text-sm">
            {(risk.data ?? []).length === 0 && <li className="text-slate-500">No attendance, resume, or test warnings right now.</li>}
            {(risk.data ?? []).map((r) => (
              <li key={r.student.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {r.student.fullName}: {r.reason}
                  {r.taskOpen ? " · task open" : ""}
                </span>
                <PrimaryButton
                  onClick={() =>
                    run(async () => {
                      await api(`/api/actions/at-risk/${r.student.id}/follow-up`, { method: "POST", body: "{}" });
                      setNotice(`Follow-up assigned for ${r.student.fullName}.`);
                      risk.reload();
                    })
                  }
                >
                  Assign follow-up
                </PrimaryButton>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function CustomFieldsCard({ students }: { students: Student[] }) {
  const fields = useApi<{ id: string; entityType: string; fieldKey: string; label: string }[]>("/api/custom-fields");
  const [studentId, setStudentId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const studentFields = (fields.data ?? []).filter((f) => f.entityType === "STUDENT");

  useEffect(() => {
    if (!studentId) {
      setValues({});
      return;
    }
    let cancelled = false;
    setError(null);
    api<{ values?: Record<string, unknown> }>(`/api/actions/sis/custom/STUDENT/${studentId}`)
      .then((row) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        Object.entries(row.values ?? {}).forEach(([k, v]) => {
          next[k] = v == null ? "" : String(v);
        });
        setValues(next);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return (
    <Card title="Custom fields">
      <p className="mb-3 text-sm text-slate-500">Institute fields defined under Academics, saved on this student.</p>
      <ErrorText error={error} />
      {notice && <p className="mb-2 text-sm text-emerald-700">{notice}</p>}
      {studentFields.length === 0 ? (
        <p className="text-sm text-slate-500">No student custom fields yet. Add them in Academics.</p>
      ) : (
        <>
          <FormGrid>
            <Select
              label="Student"
              value={studentId}
              onChange={setStudentId}
              options={students.map((s) => ({ value: s.id, label: s.fullName }))}
            />
            {studentFields.map((f) => (
              <Field
                key={f.id}
                label={f.label}
                value={values[f.fieldKey] || ""}
                onChange={(v) => setValues((cur) => ({ ...cur, [f.fieldKey]: v }))}
              />
            ))}
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton
              disabled={!studentId}
              onClick={async () => {
                setError(null);
                setNotice(null);
                try {
                  await api(`/api/actions/sis/custom/STUDENT/${studentId}`, { method: "POST", body: JSON.stringify(values) });
                  setNotice("Custom fields saved.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save fields
            </PrimaryButton>
          </div>
        </>
      )}
    </Card>
  );
}

function Linkish({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="text-brand hover:underline" type="button" onClick={onClick}>
      {children}
    </button>
  );
}
