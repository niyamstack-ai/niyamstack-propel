import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, TextArea, formatDay, formatWhen, studentChoice, useApi } from "../ui";

type Year = { id: string; name: string; startDate?: string; endDate?: string; active?: boolean };
type Term = { id: string; name: string; academicYearId?: string; startDate?: string; endDate?: string };
type Batch = { id: string; name: string; courseId?: string; termId?: string; academicYearId?: string };
type Course = { id: string; name: string };
type Room = { id: string; name: string };
type Staff = { id: string; fullName: string };
type Slot = { id: string; subject: string; dayOfWeek: number; startTime: string; endTime?: string; batchId?: string; classroomId?: string; facultyUserId?: string };
type FieldDef = { id: string; entityType: string; fieldKey: string; label: string; fieldType: string; required?: boolean };
type Workflow = { id: string; name: string; triggerType: string; active?: boolean };
type Approval = { id: string; kind: string; status: string; note?: string; amount?: number };
type Template = { id: string; name: string; kind: string; body?: string };
type Progress = { studentId: string; fullName: string; studentCode?: string; syllabusPct: number; filesDone: number; filesTotal: number; homeworkDone: number; homeworkTotal: number; testsDone: number; testsTotal: number };
type Load = { userId: string; fullName: string; weeklyHours: number; slots: number; batches: number };
type Student = { id: string; fullName: string; photoUrl?: string; studentCode?: string };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TABS = ["timetable", "import", "ids", "terms", "fields", "approvals", "templates", "progress", "evidence"] as const;
type Tab = (typeof TABS)[number];

export function AcademicsPage() {
  const [tab, setTab] = useState<Tab>("timetable");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Academics</h1>
        <p className="text-sm text-slate-500">Timetable, terms, imports, ID cards, approvals, and student progress.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-full px-3 py-1.5 text-sm ${tab === item ? "bg-navy text-white" : "bg-mist"}`}
          >
            {prettyLabel(item === "ids" ? "ID cards" : item === "evidence" ? "Accreditation" : item)}
          </button>
        ))}
      </div>
      {tab === "timetable" && <TimetableTab />}
      {tab === "import" && <ImportTab />}
      {tab === "ids" && <IdsTab />}
      {tab === "terms" && <TermsTab />}
      {tab === "fields" && <FieldsTab />}
      {tab === "approvals" && <ApprovalsTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "progress" && <ProgressTab />}
      {tab === "evidence" && <EvidenceTab />}
    </div>
  );
}

function TimetableTab() {
  const slots = useApi<Slot[]>("/api/timetable");
  const batches = useApi<Batch[]>("/api/batches");
  const rooms = useApi<Room[]>("/api/classrooms");
  const staff = useApi<Staff[]>("/api/staff");
  const load = useApi<Load[]>("/api/actions/sis/workload");
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [batchId, setBatchId] = useState("");
  const [classroomId, setClassroomId] = useState("");
  const [facultyUserId, setFacultyUserId] = useState("");

  async function add() {
    setError(null);
    try {
      await createRecord("/api/timetable", {
        subject,
        dayOfWeek: Number(dayOfWeek),
        startTime: startTime.length === 5 ? `${startTime}:00` : startTime,
        endTime: endTime.length === 5 ? `${endTime}:00` : endTime,
        batchId: batchId || null,
        classroomId: classroomId || null,
        facultyUserId: facultyUserId || null,
      });
      setSubject("");
      slots.reload();
      load.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || slots.error} />
      <Card title="Weekly timetable">
        <p className="mb-3 text-sm text-slate-500">Clashes are blocked when the same faculty, room, or batch overlaps.</p>
        <Table
          empty="No slots yet."
          loading={slots.loading}
          columns={["Subject", "Day", "Time", "Batch"]}
          rows={(slots.data ?? []).map((s) => [
            s.subject,
            WEEKDAYS[(s.dayOfWeek || 1) - 1] || String(s.dayOfWeek),
            `${(s.startTime || "").slice(0, 5)}–${(s.endTime || "").slice(0, 5)}`,
            (batches.data ?? []).find((b) => b.id === s.batchId)?.name || "—",
          ])}
        />
      </Card>
      <Card title="Add slot">
        <FormGrid>
          <Field label="Subject" value={subject} onChange={setSubject} placeholder="Java" />
          <Select
            label="Day"
            value={dayOfWeek}
            onChange={setDayOfWeek}
            allowEmpty={false}
            options={WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }))}
          />
          <Field label="Start" type="time" value={startTime} onChange={setStartTime} />
          <Field label="End" type="time" value={endTime} onChange={setEndTime} />
          <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
          <Select label="Room" value={classroomId} onChange={setClassroomId} options={(rooms.data ?? []).map((r) => ({ value: r.id, label: r.name }))} />
          <Select label="Faculty" value={facultyUserId} onChange={setFacultyUserId} options={(staff.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!subject} onClick={() => void add()}>
            Save slot
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Faculty workload">
        <Table
          empty="No faculty load yet."
          loading={load.loading}
          columns={["Faculty", "Weekly hours", "Slots", "Batches"]}
          rows={(load.data ?? []).map((r) => [r.fullName, String(r.weeklyHours), String(r.slots), String(r.batches)])}
        />
      </Card>
    </>
  );
}

function ImportTab() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [studentCsv, setStudentCsv] = useState("fullName,phone,email,studentCode\n");

  async function run(path: string, csv: string) {
    setError(null);
    setNotice(null);
    try {
      const out = await api<{ created: number; updated: number; skipped: number }>(path, {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setNotice(`Created ${out.created}, updated ${out.updated}, skipped ${out.skipped}. Duplicate mobile or email was merged.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Import students">
        <TextArea label="CSV" value={studentCsv} onChange={setStudentCsv} rows={6} />
        <div className="mt-3">
          <PrimaryButton onClick={() => void run("/api/actions/sis/import/students", studentCsv)}>Import students</PrimaryButton>
        </div>
      </Card>
      <p className="text-sm text-slate-500">Employee CSV import moved to People → Employees.</p>
    </>
  );
}

function IdsTab() {
  const students = useApi<Student[]>("/api/students");
  const employees = useApi<{ id: string; fullName: string }[]>("/api/employees");
  const [error, setError] = useState<string | null>(null);

  async function printCard(kind: string, id: string) {
    setError(null);
    try {
      const rec = await api<{ instituteName?: string; fullName?: string; code?: string; title?: string; department?: string; photoUrl?: string; kind?: string }>(
        `/api/actions/sis/id-card/${kind}/${id}`,
      );
      const win = window.open("", "_blank");
      if (!win) {
        setError("Allow pop-ups to print the ID card.");
        return;
      }
      win.document.write(`<!doctype html><html><head><title>ID</title>
        <style>body{font-family:sans-serif;padding:24px;color:#071a33}.card{border:2px solid #071a33;padding:16px;width:320px}img{width:80px;height:80px;object-fit:cover}</style></head>
        <body><div class="card">
          <p><strong>${esc(rec.instituteName)}</strong></p>
          ${rec.photoUrl ? `<img src="${esc(rec.photoUrl)}"/>` : ""}
          <h2>${esc(rec.fullName)}</h2>
          <p>${esc(rec.kind)} · ${esc(rec.code)}</p>
          <p>${esc(rec.title)} ${esc(rec.department)}</p>
        </div><script>window.print()<\/script></body></html>`);
      win.document.close();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error || students.error || employees.error} />
      <Card title="Student ID cards">
        <Table
          empty="No students yet."
          loading={students.loading}
          columns={["Student", ""]}
          rows={(students.data ?? []).map((s) => [
            s.fullName,
            <LinkButton key={s.id} onClick={() => void printCard("STUDENT", s.id)}>
              Print ID
            </LinkButton>,
          ])}
        />
      </Card>
      <Card title="Staff ID cards">
        <Table
          empty="No employees yet. Add them in ESS or import above."
          loading={employees.loading}
          columns={["Staff", ""]}
          rows={(employees.data ?? []).map((e) => [
            e.fullName,
            <LinkButton key={e.id} onClick={() => void printCard("STAFF", e.id)}>
              Print ID
            </LinkButton>,
          ])}
        />
      </Card>
    </>
  );
}

function TermsTab() {
  const years = useApi<Year[]>("/api/academic-years");
  const terms = useApi<Term[]>("/api/terms");
  const batches = useApi<Batch[]>("/api/batches");
  const courses = useApi<Course[]>("/api/courses");
  const [error, setError] = useState<string | null>(null);
  const [yearName, setYearName] = useState("");
  const [termName, setTermName] = useState("");
  const [yearId, setYearId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [batchCourse, setBatchCourse] = useState("");
  const [termId, setTermId] = useState("");

  return (
    <>
      <ErrorText error={error || years.error || terms.error || batches.error} />
      <Card title="Academic years">
        <Table empty="No years yet." loading={years.loading} columns={["Name", "From", "To"]} rows={(years.data ?? []).map((y) => [y.name, formatDay(y.startDate) || "—", formatDay(y.endDate) || "—"])} />
        <FormGrid>
          <Field label="Year name" value={yearName} onChange={setYearName} placeholder="2026-27" />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!yearName}
            onClick={async () => {
              setError(null);
              try {
                await createRecord("/api/academic-years", { name: yearName, startDate: new Date().toISOString().slice(0, 10), active: true });
                setYearName("");
                years.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Add year
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Terms">
        <Table
          empty="No terms yet. Batches must sit on a term once one exists."
          loading={terms.loading}
          columns={["Term", "Year"]}
          rows={(terms.data ?? []).map((t) => [t.name, (years.data ?? []).find((y) => y.id === t.academicYearId)?.name || "—"])}
        />
        <FormGrid>
          <Field label="Term name" value={termName} onChange={setTermName} placeholder="Term 1" />
          <Select label="Year" value={yearId} onChange={setYearId} options={(years.data ?? []).map((y) => ({ value: y.id, label: y.name }))} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!termName}
            onClick={async () => {
              setError(null);
              try {
                await createRecord("/api/terms", { name: termName, academicYearId: yearId || years.data?.[0]?.id || null });
                setTermName("");
                terms.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Add term
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Batch on a term">
        <Table
          empty="No batches yet."
          loading={batches.loading}
          columns={["Batch", "Term"]}
          rows={(batches.data ?? []).map((b) => [b.name, (terms.data ?? []).find((t) => t.id === b.termId)?.name || "—"])}
        />
        <FormGrid>
          <Field label="Batch name" value={batchName} onChange={setBatchName} />
          <Select label="Course" value={batchCourse} onChange={setBatchCourse} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Term" value={termId} onChange={setTermId} options={(terms.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!batchName}
            onClick={async () => {
              setError(null);
              try {
                await createRecord("/api/batches", { name: batchName, courseId: batchCourse || null, termId: termId || null, status: "ACTIVE", capacity: 40 });
                setBatchName("");
                batches.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save batch
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function FieldsTab() {
  const fields = useApi<FieldDef[]>("/api/custom-fields");
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [entityType, setEntityType] = useState("STUDENT");
  const [fieldType, setFieldType] = useState("TEXT");
  const [options, setOptions] = useState("");

  return (
    <>
      <ErrorText error={error} />
      <Card title="Custom fields">
        <p className="mb-3 text-sm text-slate-500">Institute-specific fields on students, leads, and employees. Use Select with comma-separated options.</p>
        <Table
          empty="No custom fields yet."
          columns={["Applies to", "Label", "Key", "Type"]}
          rows={(fields.data ?? []).map((f) => [prettyLabel(f.entityType), f.label, f.fieldKey, prettyLabel(f.fieldType)])}
        />
        <FormGrid>
          <Field label="Label" value={label} onChange={setLabel} placeholder="Blood group" />
          <Field label="Key" value={fieldKey} onChange={setFieldKey} placeholder="bloodGroup" />
          <Select
            label="Applies to"
            value={entityType}
            onChange={setEntityType}
            allowEmpty={false}
            options={[
              { value: "STUDENT", label: "Student" },
              { value: "INQUIRY", label: "Lead" },
              { value: "EMPLOYEE", label: "Employee" },
            ]}
          />
          <Select
            label="Type"
            value={fieldType}
            onChange={setFieldType}
            allowEmpty={false}
            options={[
              { value: "TEXT", label: "Text" },
              { value: "NUMBER", label: "Number" },
              { value: "DATE", label: "Date" },
              { value: "SELECT", label: "Select" },
            ]}
          />
          {fieldType === "SELECT" && (
            <Field label="Options (comma separated)" value={options} onChange={setOptions} placeholder="A+, B+, O+, AB+" />
          )}
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!label || !fieldKey || (fieldType === "SELECT" && !options.trim())}
            onClick={async () => {
              setError(null);
              try {
                const optionsJson =
                  fieldType === "SELECT"
                    ? JSON.stringify(options.split(",").map((s) => s.trim()).filter(Boolean))
                    : undefined;
                await createRecord("/api/custom-fields", { label, fieldKey, entityType, fieldType, optionsJson });
                setLabel("");
                setFieldKey("");
                setOptions("");
                fields.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Add field
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Form preview">
        <p className="mb-3 text-sm text-slate-500">Live preview of fields for {prettyLabel(entityType)}. This is how counselors/staff will fill them.</p>
        {(fields.data ?? []).filter((f) => f.entityType === entityType).length === 0 ? (
          <p className="text-sm text-slate-500">No fields for this entity yet.</p>
        ) : (
          <FormGrid>
            {(fields.data ?? [])
              .filter((f) => f.entityType === entityType)
              .map((f) => (
                <Field
                  key={f.id}
                  label={`${f.label}${f.required ? " *" : ""}`}
                  value=""
                  onChange={() => undefined}
                  placeholder={prettyLabel(f.fieldType)}
                />
              ))}
          </FormGrid>
        )}
      </Card>
      <FillCustomCard />
    </>
  );
}

function FillCustomCard() {
  const fields = useApi<FieldDef[]>("/api/custom-fields");
  const students = useApi<Student[]>("/api/students");
  const [studentId, setStudentId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const studentFields = (fields.data ?? []).filter((f) => f.entityType === "STUDENT");
  return (
    <Card title="Fill student fields">
      <ErrorText error={error} />
      {notice && <p className="mb-2 text-sm text-emerald-700">{notice}</p>}
      {studentFields.length === 0 ? (
        <p className="text-sm text-slate-500">Add a student field above, then fill it here.</p>
      ) : (
        <>
          <FormGrid>
            <Select label="Student" value={studentId} onChange={setStudentId} options={(students.data ?? []).map(studentChoice)} />
            {studentFields.map((f) => (
              <Field key={f.id} label={f.label} value={values[f.fieldKey] || ""} onChange={(v) => setValues((cur) => ({ ...cur, [f.fieldKey]: v }))} />
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
                  setNotice("Saved on the student record.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save values
            </PrimaryButton>
          </div>
        </>
      )}
    </Card>
  );
}

function ApprovalsTab() {
  const flows = useApi<Workflow[]>("/api/workflows");
  const rows = useApi<Approval[]>("/api/approvals");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("FEE_WAIVER");
  const [kind, setKind] = useState("FEE_WAIVER");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <>
      <ErrorText error={error} />
      <Card title="Approval workflows">
        <Table empty="No workflows yet." columns={["Name", "Trigger"]} rows={(flows.data ?? []).map((w) => [w.name, prettyLabel(w.triggerType)])} />
        <FormGrid>
          <Field label="Name" value={name} onChange={setName} placeholder="Fee waiver needs owner" />
          <Select
            label="Trigger"
            value={triggerType}
            onChange={setTriggerType}
            allowEmpty={false}
            options={[
              { value: "DISCOUNT", label: "Discount" },
              { value: "FEE_WAIVER", label: "Fee waiver" },
              { value: "ADMISSION", label: "Admission" },
              { value: "OFFER", label: "Offer" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!name}
            onClick={async () => {
              setError(null);
              try {
                await createRecord("/api/workflows", { name, triggerType, active: true });
                setName("");
                flows.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save workflow
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Requests">
        <Table
          empty="No approval requests yet."
          columns={["Kind", "Note", "Amount", "Status", ""]}
          rows={(rows.data ?? []).map((r) => [
            prettyLabel(r.kind),
            r.note || "—",
            r.amount != null ? String(r.amount) : "—",
            prettyLabel(r.status),
            r.status === "PENDING" ? (
              <span key={r.id} className="flex gap-2">
                <LinkButton
                  onClick={async () => {
                    await api(`/api/actions/sis/approvals/${r.id}/decide`, { method: "POST", body: JSON.stringify({ approve: true }) });
                    rows.reload();
                  }}
                >
                  Approve
                </LinkButton>
                <LinkButton
                  onClick={async () => {
                    await api(`/api/actions/sis/approvals/${r.id}/decide`, { method: "POST", body: JSON.stringify({ approve: false }) });
                    rows.reload();
                  }}
                >
                  Reject
                </LinkButton>
              </span>
            ) : (
              ""
            ),
          ])}
        />
        <FormGrid>
          <Select
            label="Kind"
            value={kind}
            onChange={setKind}
            allowEmpty={false}
            options={[
              { value: "DISCOUNT", label: "Discount" },
              { value: "FEE_WAIVER", label: "Fee waiver" },
              { value: "ADMISSION", label: "Admission" },
              { value: "OFFER", label: "Offer" },
            ]}
          />
          <Field label="Amount" value={amount} onChange={setAmount} />
        </FormGrid>
        <div className="mt-3">
          <TextArea label="Note" value={note} onChange={setNote} rows={3} />
        </div>
        <div className="mt-3">
          <PrimaryButton
            onClick={async () => {
              setError(null);
              try {
                await api("/api/actions/sis/approvals", { method: "POST", body: JSON.stringify({ kind, note, amount }) });
                setNote("");
                rows.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Submit for approval
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}

function TemplatesTab() {
  const tpls = useApi<Template[]>("/api/templates");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("ID_CARD");
  const [body, setBody] = useState("{{institute}}\n{{name}} ({{code}})\n{{date}}");

  async function preview(k: string) {
    setError(null);
    try {
      const rec = await api<{ body: string; instituteName?: string }>(`/api/actions/sis/templates/${k}`);
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!doctype html><html><body><pre>${esc(rec.body)}</pre><script>window.print()<\/script></body></html>`);
      win.document.close();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <ErrorText error={error} />
      <Card title="Document templates">
        <p className="mb-3 text-sm text-slate-500">Placeholders: {"{{institute}} {{name}} {{code}} {{date}}"}</p>
        <Table
          empty="Using built-in wording until you save a template."
          columns={["Name", "Kind", ""]}
          rows={(tpls.data ?? []).map((t) => [
            t.name,
            prettyLabel(t.kind),
            <LinkButton key={t.id} onClick={() => void preview(t.kind)}>
              Print
            </LinkButton>,
          ])}
        />
        <FormGrid>
          <Field label="Name" value={name} onChange={setName} />
          <Select
            label="Kind"
            value={kind}
            onChange={setKind}
            allowEmpty={false}
            options={[
              { value: "RECEIPT", label: "Receipt" },
              { value: "OFFER", label: "Offer letter" },
              { value: "ID_CARD", label: "ID card" },
              { value: "CERTIFICATE", label: "Certificate" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <TextArea label="Body" value={body} onChange={setBody} rows={5} />
        </div>
        <div className="mt-3 flex gap-2">
          <PrimaryButton
            disabled={!name}
            onClick={async () => {
              setError(null);
              try {
                await createRecord("/api/templates", { name, kind, body });
                setName("");
                tpls.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Save template
          </PrimaryButton>
          <LinkButton onClick={() => void preview(kind)}>Preview</LinkButton>
        </div>
      </Card>
    </>
  );
}

function ProgressTab() {
  const board = useApi<Progress[]>("/api/actions/sis/progress");
  return (
    <Card title="Student progress">
      <p className="mb-3 text-sm text-slate-500">Syllabus % from published content, homework, and tests.</p>
      {board.error && <p className="mb-3 text-sm text-red-600">{board.error}</p>}
      <Table
        empty="No students yet."
        loading={board.loading}
        columns={["Student", "Syllabus", "Content", "Homework", "Tests"]}
        rows={(board.data ?? []).map((r) => [
          `${r.fullName} (${r.studentCode || "—"})`,
          `${r.syllabusPct}%`,
          `${r.filesDone}/${r.filesTotal}`,
          `${r.homeworkDone}/${r.homeworkTotal}`,
          `${r.testsDone}/${r.testsTotal}`,
        ])}
      />
    </Card>
  );
}

function EvidenceTab() {
  const folders = useApi<{ id: string; framework: string; title: string; status: string }[]>("/api/accreditation-folders");
  const evidence = useApi<{ id: string; folderId?: string; title: string; status: string }[]>("/api/accreditation-evidence");
  const [framework, setFramework] = useState("NAAC");
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState("");
  const [evTitle, setEvTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ErrorText error={error || folders.error || evidence.error} />
      <Card title="Accreditation locker">
        <p className="mb-3 text-sm text-slate-500">NAAC / NBA / ISO folders. Submit evidence into the approval workflow.</p>
        <FormGrid>
          <Select
            label="Framework"
            value={framework}
            onChange={setFramework}
            options={[
              { value: "NAAC", label: "NAAC" },
              { value: "NBA", label: "NBA" },
              { value: "ISO", label: "ISO" },
            ]}
          />
          <Field label="Folder title" value={title} onChange={setTitle} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!title}
              onClick={async () => {
                setError(null);
                try {
                  await api("/api/actions/accreditation/folders", {
                    method: "POST",
                    body: JSON.stringify({ framework, title }),
                  });
                  setTitle("");
                  folders.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Add folder
            </PrimaryButton>
          </div>
        </FormGrid>
        <ul className="mt-3 text-sm">
          {folders.loading && <li className="text-slate-500">Loading folders…</li>}
          {!folders.loading && (folders.data ?? []).length === 0 && (
            <li className="text-slate-500">No accreditation folders yet.</li>
          )}
          {(folders.data ?? []).map((f) => (
            <li key={f.id}>
              {f.framework} — {f.title} ({prettyLabel(f.status)})
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Evidence">
        <FormGrid>
          <Select
            label="Folder"
            value={folderId}
            onChange={setFolderId}
            options={(folders.data ?? []).map((f) => ({
              value: f.id,
              label: `${f.framework} — ${f.title}`,
            }))}
          />
          <Field label="Title" value={evTitle} onChange={setEvTitle} />
          <Field label="File URL" value={fileUrl} onChange={setFileUrl} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!folderId || !evTitle}
              onClick={async () => {
                setError(null);
                try {
                  await api("/api/actions/accreditation/evidence", {
                    method: "POST",
                    body: JSON.stringify({ folderId, title: evTitle, fileUrl }),
                  });
                  setEvTitle("");
                  evidence.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Add evidence
            </PrimaryButton>
          </div>
        </FormGrid>
        <ul className="mt-3 space-y-2 text-sm">
          {(evidence.data ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2">
              <span>
                {e.title} — {prettyLabel(e.status)}
              </span>
              {e.status !== "SUBMITTED" && (
                <PrimaryButton
                  onClick={async () => {
                    setError(null);
                    try {
                      await api(`/api/actions/accreditation/evidence/${e.id}/submit`, { method: "POST", body: "{}" });
                      evidence.reload();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  Submit for review
                </PrimaryButton>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function esc(value?: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
