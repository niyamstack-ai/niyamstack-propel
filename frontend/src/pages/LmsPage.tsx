import { useEffect, useState } from "react";
import { api, fileSrc } from "../api";
import { createRecord, uploadSubmissionFile } from "../ops";
import { useAuth } from "../auth";
import { useLocation, useSearchParams } from "react-router-dom";
import { Card, ErrorText, Field, FileUpload, FormGrid, PrimaryButton, Select, Table, formatWhen, studentChoice, useApi } from "../ui";
import { BatchAttendanceSheet } from "./BatchAttendanceSheet";

type Content = { id: string; title: string; contentType: string; scormStandard?: string; published?: boolean; courseId?: string; url?: string; body?: string };
type Assignment = { id: string; title: string; instructions: string; courseId?: string; batchId?: string; dueAt?: string; maxScore?: number };
type Submission = { id: string; assignmentId?: string; grade?: string; status?: string; content?: string; fileUrl?: string; feedback?: string; submittedAt?: string };
type Assessment = { id: string; title: string; kind: string; proctoring: boolean; published: boolean; courseId?: string };
type Attempt = { id: string; score?: number; status: string };
type Pkg = { id: string; standard: string; status: string; versionLabel?: string; launchUrl?: string };
type Named = { id: string; name: string };
type Student = { id: string; fullName: string; courseId?: string; studentCode?: string };
type Doubt = { id?: string; subject: string; body?: string; status: string; facultyReply?: string; courseId?: string; overdue?: boolean };
type Batch = { id: string; courseId?: string };
type LiveRow = { id?: string; title: string; provider?: string; meetingUrl?: string; batchId?: string; startsAt?: string };
type RecRow = { title: string; videoUrl?: string; batchId?: string };
type SlotRow = { subject: string; dayOfWeek: number; startTime: string; endTime?: string; batchId?: string; classroomId?: string };

export type StudySection = "contents" | "practice" | "tests" | "live" | "recordings" | "timetable" | "assignments" | "doubts";

const LMS_TABS = [
  { id: "content", label: "Content" },
  { id: "attendance", label: "Attendance" },
  { id: "assignments", label: "Assignments" },
  { id: "exams", label: "Exams" },
  { id: "packages", label: "Packages" },
  { id: "outcomes", label: "Outcomes" },
  { id: "live", label: "Live classes" },
] as const;
type LmsTab = (typeof LMS_TABS)[number]["id"];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function weekdayName(n?: number) {
  if (n == null) return "—";
  if (n >= 1 && n <= 7) return WEEKDAYS[n - 1];
  if (n === 0) return "Sunday";
  return String(n);
}

function clockTime(t?: string) {
  if (!t) return "—";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function inCourse<T extends { courseId?: string }>(rows: T[] | null | undefined, courseId?: string, strict = false) {
  if (!courseId) return rows ?? [];
  return (rows ?? []).filter((row) => (strict ? row.courseId === courseId : !row.courseId || row.courseId === courseId));
}

export function LmsPage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentLms />;
  return <StaffLms />;
}

export function StudentLms({
  courseId,
  embedded,
  section,
}: {
  courseId?: string;
  embedded?: boolean;
  section?: StudySection;
} = {}) {
  const content = useApi<Content[]>("/api/content");
  const live = useApi<LiveRow[]>("/api/live-sessions");
  const recs = useApi<RecRow[]>("/api/recordings");
  const asg = useApi<Assignment[]>("/api/assignments");
  const attempts = useApi<Attempt[]>("/api/exam-attempts");
  const subs = useApi<Submission[]>("/api/submissions");
  const doubts = useApi<Doubt[]>("/api/doubts");
  const me = useApi<Student[]>("/api/students");
  const slots = useApi<SlotRow[]>("/api/timetable");
  const batches = useApi<Batch[]>("/api/batches");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [doubtSub, setDoubtSub] = useState("");
  const [doubtBody, setDoubtBody] = useState("");
  const [openAsg, setOpenAsg] = useState<Assignment | null>(null);
  const [newDoubtId, setNewDoubtId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [shot, setShot] = useState("");

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function matchesCourse(batchId?: string) {
    if (!embedded || !courseId) return true;
    if (!batchId) return false;
    return (batches.data ?? []).some((b) => b.id === batchId && b.courseId === courseId);
  }

  const homeCourse = me.data?.[0]?.courseId;
  const materials = inCourse(content.data, courseId);
  const homework = (asg.data ?? []).filter((row) => {
    if (!courseId) return true;
    if (row.courseId) return row.courseId === courseId;
    const batchCourse = (batches.data ?? []).find((b) => b.id === row.batchId)?.courseId;
    if (batchCourse) return batchCourse === courseId;
    return !embedded || homeCourse === courseId;
  });
  const courseDoubts = (doubts.data ?? []).filter((d) => !courseId || d.courseId === courseId);
  const liveRows = (live.data ?? []).filter((row) => matchesCourse(row.batchId));
  const recRows = (recs.data ?? []).filter((row) => matchesCourse(row.batchId));
  const slotRows = (slots.data ?? []).filter((row) => matchesCourse(row.batchId));
  const show = (id: StudySection) => !embedded || !section || section === id;
  const waiting = embedded && batches.data == null && !batches.error;

  useEffect(() => {
    if (!newDoubtId) return;
    document.getElementById(`doubt-${newDoubtId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [newDoubtId, courseDoubts.length]);

  function latestSub(assignmentId: string) {
    return (subs.data ?? [])
      .filter((s) => s.assignmentId === assignmentId)
      .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))[0];
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-navy">My LMS</h1>
          <p className="text-sm text-slate-500">Your timetable, content, assignments, and exams.</p>
        </div>
      )}
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {show("timetable") && (
        <Card title="Timetable">
          {waiting ? (
            <p className="text-sm text-slate-500">Loading timetable…</p>
          ) : slotRows.length === 0 ? (
            <p className="text-sm text-slate-500">No timetable published for this course yet.</p>
          ) : (
            <Table columns={["Subject", "Day", "Time"]} rows={slotRows.map((s) => [s.subject, weekdayName(s.dayOfWeek), `${clockTime(s.startTime)}${s.endTime ? `–${clockTime(s.endTime)}` : ""}`])} />
          )}
        </Card>
      )}
      {show("live") && (
        <Card title="Live class">
          {waiting ? (
            <p className="text-sm text-slate-500">Loading live classes…</p>
          ) : (
            <>
              {liveRows.length === 0 && <p className="text-sm text-slate-500">No live class scheduled for this course.</p>}
              <ul className="space-y-2 text-sm">
                {liveRows.map((l, i) => (
                  <li key={i} className="rounded-lg border border-line px-3 py-2">
                    <p className="font-medium text-navy">{l.title}</p>
                    <p className="text-xs text-slate-500">{l.startsAt ? formatWhen(l.startsAt) : "Time not published yet"}</p>
                    {l.meetingUrl ? (
                      <a className="text-sm font-medium text-brand" href={l.meetingUrl} target="_blank" rel="noreferrer">
                        Join class
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Link not added yet</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
      {show("recordings") && (
        <Card title="Recordings">
          {waiting ? (
            <p className="text-sm text-slate-500">Loading recordings…</p>
          ) : recRows.length === 0 ? (
            <p className="text-sm text-slate-500">No recordings for this course yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {recRows.map((r, i) => (
                <li key={i}>
                  <p className="font-medium text-navy">{r.title}</p>
                  {r.videoUrl ? (
                    <video className="mt-2 w-full max-w-xl rounded-lg bg-black" src={fileSrc(r.videoUrl)} controls />
                  ) : (
                    <p className="text-xs text-slate-400">No video attached.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {embedded ? null : (
        <Card title="PDFs, videos & notes">
          <ul className="space-y-2 text-sm">
            {materials.length === 0 && <li className="text-slate-500">No materials in this course yet.</li>}
            {materials.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {c.title} · {c.contentType}
                </span>
                {c.url ? (
                  <a className="text-brand hover:underline" href={fileSrc(c.url)} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">No file</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {show("assignments") && (
        <Card title="Assignments">
          {waiting ? (
            <p className="text-sm text-slate-500">Loading assignments…</p>
          ) : homework.length === 0 ? (
            <p className="text-sm text-slate-500">No assignments in this course yet.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {homework.map((a) => {
                const last = latestSub(a.id);
                return (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2">
                    <span>
                      <span className="block font-medium text-navy">{a.title}</span>
                      {a.instructions && <span className="mt-0.5 block text-slate-500">{a.instructions}</span>}
                      {a.dueAt && <span className="mt-0.5 block text-xs text-slate-400">Due {formatWhen(a.dueAt)}</span>}
                      {a.maxScore != null && <span className="mt-0.5 block text-xs text-slate-400">Max score {a.maxScore}</span>}
                      {last && (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {last.status === "GRADED"
                            ? `Graded ${last.grade || ""}${a.maxScore != null ? ` / ${a.maxScore}` : ""}`
                            : "Submitted · waiting for marks"}
                          {last.feedback ? ` · ${last.feedback}` : ""}
                        </span>
                      )}
                    </span>
                    <PrimaryButton onClick={() => setOpenAsg(a)}>{last ? "Resubmit" : "Submit"}</PrimaryButton>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
      {!embedded && (
      <Card title="Quizzes & exams">
        <p className="text-sm text-slate-500">Open a course to take tests with the timer and question paper.</p>
        <ul className="mt-3 text-xs text-slate-500">
          {(attempts.data ?? []).map((a) => (
            <li key={a.id}>
              Last attempt: {a.status} {a.score != null ? `${a.score}%` : ""}
            </li>
          ))}
        </ul>
      </Card>
      )}
      {show("doubts") && (
        <Card title="Ask a doubt">
          <FormGrid>
            <Field label="Subject" value={doubtSub} onChange={setDoubtSub} />
            <label className="block text-sm">
              <span className="text-slate-600">Question</span>
              <textarea className="mt-1 w-full rounded-lg border border-line px-3 py-2" rows={4} value={doubtBody} onChange={(e) => setDoubtBody(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Code (optional)</span>
              <textarea className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono text-sm" rows={4} value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <Field label="Screenshot or file (optional)" value={shot} onChange={setShot} />
            <label className="block text-sm">
              <span className="text-slate-600">Upload screenshot</span>
              <input
                className="mt-1 block w-full text-sm"
                type="file"
                accept="image/*,.pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const stored = await uploadSubmissionFile(file);
                    setShot(stored.url);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
            </label>
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton
              disabled={!doubtSub || !doubtBody}
              onClick={() =>
                run(async () => {
                  const ticket = await createRecord<Doubt>("/api/doubts", {
                    subject: doubtSub,
                    body: [doubtBody, code.trim() ? `\n\nCode:\n${code.trim()}` : "", shot.trim() ? `\n\nAttachment: ${shot.trim()}` : ""].join(""),
                    status: "OPEN",
                    courseId: courseId || null,
                    studentId: me.data?.[0]?.id || null,
                  });
                  setDoubtSub("");
                  setDoubtBody("");
                  setCode("");
                  setShot("");
                  setNewDoubtId(ticket.id || null);
                  setNotice("Doubt sent to your faculty. It is highlighted in the list below.");
                  doubts.reload();
                })
              }
            >
              Send
            </PrimaryButton>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {courseDoubts.length === 0 && <li className="text-slate-500">No doubts in this course yet.</li>}
            {courseDoubts.map((d, i) => (
              <li
                id={d.id ? `doubt-${d.id}` : undefined}
                key={d.id || i}
                className={`rounded-lg border px-3 py-2 ${d.id && d.id === newDoubtId ? "border-brand bg-sky-50" : "border-line"}`}
              >
                <span className="font-medium">{d.subject}</span> — {d.status}
                {d.body ? <span className="mt-0.5 block text-slate-500">{d.body}</span> : null}
                {d.facultyReply ? <span className="mt-0.5 block text-navy">Faculty: {d.facultyReply}</span> : <span className="mt-0.5 block text-xs text-slate-400">Waiting for faculty.</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {openAsg && (
        <AssignmentSubmitModal
          assignment={openAsg}
          last={latestSub(openAsg.id)}
          onClose={() => setOpenAsg(null)}
          onSaved={() => {
            setOpenAsg(null);
            subs.reload();
          }}
        />
      )}
    </div>
  );
}

function AssignmentSubmitModal({
  assignment,
  last,
  onClose,
  onSaved,
}: {
  assignment: Assignment;
  last?: Submission;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(last?.content && !last.content.startsWith("Submitted from") ? last.content : "");
  const [fileUrl, setFileUrl] = useState(last?.fileUrl || "");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError("File must be 25 MB or smaller");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const stored = await uploadSubmissionFile(file);
      setFileUrl(stored.url);
      setFileName(stored.fileName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api(`/api/actions/assignments/${assignment.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ content: text, fileUrl }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-navy">{assignment.title}</h3>
        {assignment.instructions && <p className="mt-2 text-sm text-slate-600">{assignment.instructions}</p>}
        {assignment.dueAt && <p className="mt-1 text-xs text-slate-400">Due {new Date(assignment.dueAt).toLocaleString()}</p>}
        {assignment.maxScore != null && <p className="mt-1 text-xs text-slate-400">Max score {assignment.maxScore}</p>}
        <label className="mt-4 block text-sm">
          <span className="text-slate-600">Your work (text or link)</span>
          <textarea className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a GitHub link or write your answer" />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-slate-600">Or attach a file (PDF, Word, image, or zip · max 25 MB)</span>
          <input className="mt-1 block w-full text-sm" type="file" onChange={(e) => void onFile(e.target.files?.[0])} />
          {fileName && <span className="mt-1 block text-xs text-slate-500">Attached: {fileName}</span>}
          {fileUrl && !fileName && (
            <a className="mt-1 block text-xs text-brand" href={fileSrc(fileUrl)} target="_blank" rel="noreferrer">
              Current file
            </a>
          )}
        </label>
        <ErrorText error={error} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <PrimaryButton disabled={busy} onClick={() => void submit()}>
            {busy ? "Submitting…" : "Submit work"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function StaffLms({ courseId, embedded }: { courseId?: string; embedded?: boolean } = {}) {
  const { user } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = (LMS_TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "content") as LmsTab;
  const content = useApi<Content[]>("/api/content");
  const live = useApi<{ id: string; title: string; provider: string; meetingUrl: string; batchId?: string }[]>("/api/live-sessions");
  const recs = useApi<{ title: string; videoUrl: string }[]>("/api/recordings");
  const asg = useApi<Assignment[]>("/api/assignments");
  const subs = useApi<Submission[]>("/api/submissions");
  const exams = useApi<Assessment[]>("/api/assessments");
  const attempts = useApi<Attempt[]>("/api/exam-attempts");
  const packages = useApi<Pkg[]>("/api/lms-packages");
  const outcomes = useApi<{ course: string; activities: number; completed: number; completionPct: number }[]>("/api/actions/learning-outcomes");
  const doubts = useApi<{ id?: string; subject: string; status: string; facultyReply?: string; overdue?: boolean }[]>("/api/actions/sis/doubts");
  const slots = useApi<{ subject: string; dayOfWeek: number; startTime: string; endTime?: string }[]>("/api/timetable");
  const batches = useApi<Named[]>("/api/batches");
  const students = useApi<Student[]>("/api/students");
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [ctype, setCtype] = useState("PDF");
  const [url, setUrl] = useState("");
  const [batchId, setBatchId] = useState("");
  const [asgTitle, setAsgTitle] = useState("");
  const [asgInst, setAsgInst] = useState("");
  const [asgDue, setAsgDue] = useState("");
  const [asgMax, setAsgMax] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [attStudent, setAttStudent] = useState("");
  const [attStatus, setAttStatus] = useState("PRESENT");
  const [doubtSub, setDoubtSub] = useState("");
  const [doubtBody, setDoubtBody] = useState("");
  const [liveTitle, setLiveTitle] = useState("");
  const [liveStarts, setLiveStarts] = useState("");
  const [slotSubject, setSlotSubject] = useState("");
  const [slotDay, setSlotDay] = useState("1");
  const [slotStart, setSlotStart] = useState("09:00");
  const [slotEnd, setSlotEnd] = useState("10:00");
  const [recUrl, setRecUrl] = useState("");
  const [pkgContent, setPkgContent] = useState("");
  const [pkgStd, setPkgStd] = useState("SCORM_1.2");
  const [pkgUrl, setPkgUrl] = useState("https://example.com/lti");

  const faculty = user?.role === "OWNER" || user?.role === "FACULTY";
  const student = user?.role === "STUDENT";

  useEffect(() => {
    if (embedded) return;
    if (location.hash === "#live" && tab !== "live") {
      setParams({ tab: "live" }, { replace: true });
    }
  }, [embedded, location.hash, tab, setParams]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const materials = inCourse(content.data, courseId);
  const quizzes = inCourse(exams.data, courseId);
  const homework = inCourse(asg.data, courseId);
  const show = (id: LmsTab) => embedded || tab === id;

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-navy">LMS</h1>
          <p className="text-sm text-slate-500">Publish content, mark attendance, assign work, run exams, and track doubts.</p>
        </div>
      )}
      {embedded && (
        <p className="text-sm text-slate-500">Attendance, assignments, and live class for this course.</p>
      )}
      <ErrorText error={error} />
      {!embedded && (
        <div className="flex flex-wrap gap-2">
          {LMS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setParams({ tab: item.id })}
              className={`rounded-full px-3 py-1.5 text-sm ${tab === item.id ? "bg-navy text-white" : "bg-mist"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {faculty && (
        <>
          {show("content") && !embedded && (
          <Card title="Add PDF, video or notes">
            <FormGrid>
              <Field label="Title" value={title} onChange={setTitle} />
              <Select
                label="Type"
                value={ctype}
                onChange={setCtype}
                options={[
                  { value: "PDF", label: "PDF / notes" },
                  { value: "VIDEO", label: "Video" },
                  { value: "LINK", label: "Link" },
                ]}
              />
              <Field label="URL" value={url} onChange={setUrl} />
              <FileUpload label="Or upload a file" value={url} onChange={setUrl} accept="image/*,.pdf,.doc,.docx,.mp4,.zip,video/*" />
              <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton
                disabled={!title}
                onClick={() =>
                  run(async () => {
                    await createRecord("/api/content", {
                      title,
                      contentType: ctype,
                      url,
                      batchId: batchId || null,
                      courseId: courseId || null,
                      published: true,
                      visibility: courseId ? "COURSE" : "BATCH",
                    });
                    setTitle("");
                    setUrl("");
                    content.reload();
                  })
                }
              >
                Publish
              </PrimaryButton>
            </div>
          </Card>
          )}
          {show("assignments") && (
          <Card title="Create assignment">
            <FormGrid>
              <Field label="Title" value={asgTitle} onChange={setAsgTitle} />
              <Field label="Instructions" value={asgInst} onChange={setAsgInst} />
              <Field label="Due date" value={asgDue} onChange={setAsgDue} type="datetime-local" />
              <Field label="Max score" value={asgMax} onChange={setAsgMax} />
              <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
              <div className="flex items-end">
                <PrimaryButton
                  disabled={!asgTitle}
                  onClick={() =>
                    run(async () => {
                      await createRecord("/api/assignments", {
                        title: asgTitle,
                        instructions: asgInst,
                        batchId: batchId || null,
                        courseId: courseId || null,
                        published: true,
                        dueAt: asgDue ? new Date(asgDue).toISOString() : null,
                        maxScore: asgMax ? Number(asgMax) : null,
                      });
                      setAsgTitle("");
                      setAsgInst("");
                      setAsgDue("");
                      setAsgMax("");
                      asg.reload();
                    })
                  }
                >
                  Save assignment
                </PrimaryButton>
              </div>
            </FormGrid>
          </Card>
          )}
          {show("exams") && (
          <Card title="Create exam">
            <FormGrid>
              <Field label="Title" value={examTitle} onChange={setExamTitle} />
              <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
              <div className="flex items-end">
                <PrimaryButton
                  disabled={!examTitle}
                  onClick={() =>
                    run(async () => {
                      await createRecord("/api/assessments", {
                        title: examTitle,
                        kind: "MCQ",
                        batchId: batchId || null,
                        courseId: courseId || null,
                        published: true,
                        durationMinutes: 45,
                        totalMarks: 100,
                        passingScore: 40,
                      });
                      setExamTitle("");
                      exams.reload();
                    })
                  }
                >
                  Publish exam
                </PrimaryButton>
              </div>
            </FormGrid>
          </Card>
          )}
          {show("attendance") && (
          <>
          <BatchAttendanceSheet />
          <Card title="Mark attendance">
            <FormGrid>
              <Select
                label="Student"
                value={attStudent}
                onChange={setAttStudent}
                options={(students.data ?? []).map(studentChoice)}
              />
              <Select
                label="Status"
                value={attStatus}
                onChange={setAttStatus}
                options={[
                  { value: "PRESENT", label: "Present" },
                  { value: "ABSENT", label: "Absent" },
                  { value: "LATE", label: "Late" },
                ]}
              />
              <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
              <div className="flex items-end">
                <PrimaryButton
                  disabled={!attStudent}
                  onClick={() =>
                    run(async () => {
                      await createRecord("/api/attendance", {
                        studentId: attStudent,
                        batchId: batchId || null,
                        sessionDate: new Date().toISOString().slice(0, 10),
                        status: attStatus,
                        source: "MANUAL",
                      });
                    })
                  }
                >
                  Save attendance
                </PrimaryButton>
              </div>
            </FormGrid>
          </Card>
          </>
          )}
        </>
      )}
      {show("live") && (
      <Card title="Timetable">
        <Table
          columns={["Subject", "Day", "Start"]}
          rows={(slots.data ?? []).map((s) => [s.subject, weekdayName(s.dayOfWeek), `${clockTime(s.startTime)}${s.endTime ? `–${clockTime(s.endTime)}` : ""}`])}
        />
        {faculty && (
          <FormGrid>
            <Field label="Subject" value={slotSubject} onChange={setSlotSubject} />
            <Select
              label="Day"
              value={slotDay}
              onChange={setSlotDay}
              allowEmpty={false}
              options={WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }))}
            />
            <Field label="Start" type="time" value={slotStart} onChange={setSlotStart} />
            <Field label="End" type="time" value={slotEnd} onChange={setSlotEnd} />
            <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
            <div className="flex items-end">
              <PrimaryButton
                disabled={!slotSubject}
                onClick={() =>
                  run(async () => {
                    await createRecord("/api/timetable", {
                      subject: slotSubject,
                      dayOfWeek: Number(slotDay),
                      startTime: `${slotStart}:00`,
                      endTime: `${slotEnd}:00`,
                      batchId: batchId || null,
                      facultyUserId: user?.id || null,
                    });
                    setSlotSubject("");
                    slots.reload();
                  })
                }
              >
                Add slot
              </PrimaryButton>
            </div>
          </FormGrid>
        )}
      </Card>
      )}
      {show("content") && !embedded && (
      <Card title="Learning content in this course">
        <Table
          loading={content.loading}
          columns={["Title", "Type", "Standard", "Published"]}
          rows={materials.map((c) => [c.title, c.contentType, c.scormStandard || "—", c.published === false ? "No" : "Yes"])}
        />
      </Card>
      )}
      {show("packages") && (
      <Card title="LMS standards packages (SCORM / xAPI / LTI)">
        {faculty && (
          <FormGrid>
            <Select label="Content item" value={pkgContent} onChange={setPkgContent} options={materials.map((c) => ({ value: c.id, label: c.title }))} />
            <Select
              label="Standard"
              value={pkgStd}
              onChange={setPkgStd}
              options={[
                { value: "SCORM_1.2", label: "SCORM 1.2" },
                { value: "XAPI", label: "xAPI" },
                { value: "LTI_1.3", label: "LTI 1.3" },
              ]}
            />
            <Field label="Launch URL" value={pkgUrl} onChange={setPkgUrl} />
            <div className="flex items-end">
              <PrimaryButton
                disabled={!pkgContent}
                onClick={() =>
                  run(async () => {
                    await api("/api/actions/lms-packages", {
                      method: "POST",
                      body: JSON.stringify({ contentItemId: pkgContent, standard: pkgStd, launchUrl: pkgUrl, version: "1.0" }),
                    });
                    packages.reload();
                  })
                }
              >
                Register package
              </PrimaryButton>
            </div>
          </FormGrid>
        )}
        <Table
          columns={["Standard", "Version", "Status", ""]}
          rows={(packages.data ?? []).map((p) => [
            p.standard,
            p.versionLabel || "—",
            p.status,
            faculty ? (
              <span className="space-x-2">
                <PrimaryButton
                  onClick={() =>
                    run(async () => {
                      await api("/api/actions/xapi/statements", {
                        method: "POST",
                        body: JSON.stringify({
                          verb: "completed",
                          objectId: p.id,
                          courseId: courseId || "",
                          studentId: students.data?.[0]?.id || "",
                          resultJson: "{\"success\":true}",
                        }),
                      });
                      outcomes.reload();
                    })
                  }
                >
                  Record xAPI
                </PrimaryButton>
                {p.standard?.includes("LTI") && (
                  <PrimaryButton
                    onClick={() =>
                      run(async () => {
                        const launch = await api<{ launchUrl?: string }>(`/api/actions/lms-packages/${p.id}/lti`);
                        if (launch.launchUrl) window.open(launch.launchUrl, "_blank");
                      })
                    }
                  >
                    LTI launch
                  </PrimaryButton>
                )}
              </span>
            ) : (
              "—"
            ),
          ])}
        />
      </Card>
      )}
      {show("outcomes") && (
      <Card title="Learning outcomes">
        <Table
          empty="No xAPI or exam outcomes yet."
          loading={outcomes.loading}
          columns={["Course", "Activities", "Completed", "Completion %"]}
          rows={(outcomes.data ?? []).map((o) => [o.course, o.activities, o.completed, `${o.completionPct}%`])}
        />
      </Card>
      )}
      {show("live") && (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Live classes">
          <div id="live">
          {faculty && (
            <>
          <FormGrid>
            <Field label="Class title" value={liveTitle} onChange={setLiveTitle} placeholder="Evening doubt class" />
            <Field label="Starts at" value={liveStarts} onChange={setLiveStarts} type="datetime-local" />
            <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton
              disabled={!liveTitle}
              onClick={() =>
                run(async () => {
                  await api("/api/actions/live-sessions/schedule", {
                    method: "POST",
                    body: JSON.stringify({
                      title: liveTitle,
                      batchId: batchId || undefined,
                      startsAt: liveStarts ? new Date(liveStarts).toISOString() : undefined,
                    }),
                  });
                  setLiveTitle("");
                  setLiveStarts("");
                  live.reload();
                })
              }
            >
              Open Jitsi room
            </PrimaryButton>
          </div>
            </>
          )}
          <ul className="mt-4 text-sm">
            {(live.data ?? []).map((l) => (
              <li key={l.id} className="mb-2 rounded-lg border border-line px-3 py-2">
                {l.title} ({l.provider}){" "}
                {l.meetingUrl && (
                  <a className="text-brand" href={l.meetingUrl} target="_blank" rel="noreferrer">
                    Join
                  </a>
                )}
                {faculty && l.id && (
                  <span className="ml-2 flex flex-wrap gap-2">
                    <PrimaryButton
                      onClick={() =>
                        run(async () => {
                          const roster = await api<{ studentId: string }[]>(`/api/actions/sis/live/${l.id}/roster`);
                          await api(`/api/actions/sis/live/${l.id}/attendance`, {
                            method: "POST",
                            body: JSON.stringify({ presentIds: roster.map((r) => r.studentId) }),
                          });
                        })
                      }
                    >
                      Mark roster present
                    </PrimaryButton>
                    <Field label="Recording URL" value={recUrl} onChange={setRecUrl} />
                    <PrimaryButton
                      disabled={!recUrl}
                      onClick={() =>
                        run(async () => {
                          await api(`/api/actions/sis/live/${l.id}/recording`, {
                            method: "POST",
                            body: JSON.stringify({ videoUrl: recUrl }),
                          });
                          setRecUrl("");
                          recs.reload();
                        })
                      }
                    >
                      Attach recording
                    </PrimaryButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
          </div>
        </Card>
        <Card title="Recorded lectures">
          <ul className="text-sm">
            {(recs.data ?? []).map((r, i) => (
              <li key={i}>{r.title}</li>
            ))}
          </ul>
        </Card>
      </div>
      )}
      {show("assignments") && (
      <>
        <Card title="Assignments">
          <ul className="space-y-2 text-sm">
            {(homework).map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.title}</span> — {a.instructions}
                {student && (
                  <span className="ml-2">
                    <PrimaryButton
                      onClick={() =>
                        run(async () => {
                          await api(`/api/actions/assignments/${a.id}/submit`, {
                            method: "POST",
                            body: JSON.stringify({ content: "Submitted from Propel LMS" }),
                          });
                          subs.reload();
                        })
                      }
                    >
                      Submit
                    </PrimaryButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Submissions & grading">
          <ul className="space-y-2 text-sm">
            {(subs.data ?? []).map((s) => (
              <li key={s.id}>
                {s.status || "SUBMITTED"} {s.grade ? `· ${s.grade}` : ""} {s.content ? `· ${s.content}` : ""}
                {faculty && s.status !== "GRADED" && (
                  <span className="ml-2">
                    <PrimaryButton
                      onClick={() =>
                        run(async () => {
                          await api(`/api/actions/submissions/${s.id}/grade`, {
                            method: "POST",
                            body: JSON.stringify({ grade: "A", feedback: "Meets outcomes." }),
                          });
                          subs.reload();
                        })
                      }
                    >
                      Grade
                    </PrimaryButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </>
      )}
      {show("exams") && (
      <>
        <Card title="Exam engine">
          <ul className="space-y-2 text-sm">
            {(quizzes).map((e) => (
              <li key={e.id}>
                {e.title} · {e.kind}
                {student && (
                  <span className="ml-2">
                    <PrimaryButton
                      onClick={() =>
                        run(async () => {
                          const attempt = await api<{ id: string }>(`/api/actions/assessments/${e.id}/start`, { method: "POST", body: "{}" });
                          await api(`/api/actions/attempts/${attempt.id}/submit`, { method: "POST", body: JSON.stringify({}) });
                          attempts.reload();
                        })
                      }
                    >
                      Attempt
                    </PrimaryButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Attempts">
          <ul className="text-sm">
            {(attempts.data ?? []).map((a) => (
              <li key={a.id}>
                {a.status} {a.score != null ? `· ${a.score}%` : ""}
              </li>
            ))}
          </ul>
        </Card>
      </>
      )}
      {show("live") && (
      <Card title="Raise a doubt">
        <FormGrid>
          <Field label="Subject" value={doubtSub} onChange={setDoubtSub} />
          <Field label="Question" value={doubtBody} onChange={setDoubtBody} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!doubtSub || !doubtBody}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/doubts", { subject: doubtSub, body: doubtBody, status: "OPEN" });
                  setDoubtSub("");
                  setDoubtBody("");
                  doubts.reload();
                })
              }
            >
              Submit doubt
            </PrimaryButton>
          </div>
        </FormGrid>
        <ul className="mt-4 text-sm">
          {(doubts.data ?? []).map((d, i) => (
            <li key={d.id || i}>
              {d.subject} — {d.status}
              {d.overdue ? " · SLA overdue" : ""}
              {d.facultyReply ? `: ${d.facultyReply}` : ""}
              {faculty && d.id && !d.facultyReply && (
                <span className="ml-2">
                  <PrimaryButton
                    onClick={() =>
                      run(async () => {
                        await api(`/api/actions/sis/doubts/${d.id}/reply`, {
                          method: "POST",
                          body: JSON.stringify({ facultyReply: "Answered in class. Check the recording.", status: "ANSWERED" }),
                        });
                        doubts.reload();
                      })
                    }
                  >
                    Reply
                  </PrimaryButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      )}
    </div>
  );
}
