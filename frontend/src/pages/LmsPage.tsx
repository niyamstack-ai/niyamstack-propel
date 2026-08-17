import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Content = { id: string; title: string; contentType: string; scormStandard?: string; published?: boolean; courseId?: string };
type Assignment = { id: string; title: string; instructions: string; courseId?: string };
type Submission = { id: string; grade?: string; status?: string; content?: string };
type Assessment = { id: string; title: string; kind: string; proctoring: boolean; published: boolean; courseId?: string };
type Attempt = { id: string; score?: number; status: string };
type Pkg = { id: string; standard: string; status: string; versionLabel?: string };
type Named = { id: string; name: string };
type Student = { id: string; fullName: string };

export function LmsPage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentLms />;
  return <StaffLms />;
}

function inCourse<T extends { courseId?: string }>(rows: T[] | null | undefined, courseId?: string) {
  if (!courseId) return rows ?? [];
  return (rows ?? []).filter((row) => !row.courseId || row.courseId === courseId);
}

export function StudentLms({ courseId, embedded }: { courseId?: string; embedded?: boolean } = {}) {
  const content = useApi<Content[]>("/api/content");
  const live = useApi<{ title: string; provider: string; meetingUrl: string }[]>("/api/live-sessions");
  const recs = useApi<{ title: string; videoUrl: string }[]>("/api/recordings");
  const asg = useApi<Assignment[]>("/api/assignments");
  const exams = useApi<Assessment[]>("/api/assessments");
  const attempts = useApi<Attempt[]>("/api/exam-attempts");
  const doubts = useApi<{ subject: string; status: string; facultyReply?: string }[]>("/api/doubts");
  const slots = useApi<{ subject: string; dayOfWeek: number; startTime: string }[]>("/api/timetable");
  const [error, setError] = useState<string | null>(null);
  const [doubtSub, setDoubtSub] = useState("");
  const [doubtBody, setDoubtBody] = useState("");

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

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-navy">My LMS</h1>
          <p className="text-sm text-slate-500">Your timetable, content, assignments, and exams.</p>
        </div>
      )}
      <ErrorText error={error} />
      <Card title="Timetable">
        <Table columns={["Subject", "Day", "Start"]} rows={(slots.data ?? []).map((s) => [s.subject, String(s.dayOfWeek), s.startTime])} />
      </Card>
      <Card title="PDFs, videos & notes">
        <ul className="text-sm">
          {materials.map((c) => (
            <li key={c.id}>{c.title} · {c.contentType}</li>
          ))}
        </ul>
      </Card>
      <Card title="Live class">
        <ul className="text-sm">
          {(live.data ?? []).map((l, i) => (
            <li key={i}>
              {l.title}{" "}
              <a className="text-brand" href={l.meetingUrl} target="_blank" rel="noreferrer">
                Join
              </a>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Recordings">
        <ul className="text-sm">
          {(recs.data ?? []).map((r, i) => (
            <li key={i}>{r.title}</li>
          ))}
        </ul>
      </Card>
      <Card title="Assignments">
        <ul className="space-y-2 text-sm">
          {homework.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{a.title}</span>
              <PrimaryButton
                onClick={() =>
                  run(async () => {
                    await api(`/api/actions/assignments/${a.id}/submit`, {
                      method: "POST",
                      body: JSON.stringify({ content: "Submitted from student portal" }),
                    });
                  })
                }
              >
                Submit
              </PrimaryButton>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Quizzes & exams">
        <ul className="space-y-2 text-sm">
          {quizzes.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{e.title}</span>
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
            </li>
          ))}
        </ul>
        <ul className="mt-3 text-xs text-slate-500">
          {(attempts.data ?? []).map((a) => (
            <li key={a.id}>
              Last attempt: {a.status} {a.score != null ? `${a.score}%` : ""}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Ask a doubt">
        <FormGrid>
          <Field label="Subject" value={doubtSub} onChange={setDoubtSub} />
          <Field label="Question" value={doubtBody} onChange={setDoubtBody} />
        </FormGrid>
        <div className="mt-3">
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
            Send
          </PrimaryButton>
        </div>
        <ul className="mt-4 text-sm">
          {(doubts.data ?? []).map((d, i) => (
            <li key={i}>
              {d.subject} — {d.status}
              {d.facultyReply ? `: ${d.facultyReply}` : ""}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function StaffLms({ courseId, embedded }: { courseId?: string; embedded?: boolean } = {}) {
  const { user } = useAuth();
  const content = useApi<Content[]>("/api/content");
  const live = useApi<{ title: string; provider: string; meetingUrl: string }[]>("/api/live-sessions");
  const recs = useApi<{ title: string; videoUrl: string }[]>("/api/recordings");
  const asg = useApi<Assignment[]>("/api/assignments");
  const subs = useApi<Submission[]>("/api/submissions");
  const exams = useApi<Assessment[]>("/api/assessments");
  const attempts = useApi<Attempt[]>("/api/exam-attempts");
  const packages = useApi<Pkg[]>("/api/lms-packages");
  const doubts = useApi<{ subject: string; status: string; facultyReply?: string }[]>("/api/doubts");
  const slots = useApi<{ subject: string; dayOfWeek: number; startTime: string }[]>("/api/timetable");
  const batches = useApi<Named[]>("/api/batches");
  const students = useApi<Student[]>("/api/students");
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [ctype, setCtype] = useState("PDF");
  const [url, setUrl] = useState("");
  const [batchId, setBatchId] = useState("");
  const [asgTitle, setAsgTitle] = useState("");
  const [asgInst, setAsgInst] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [attStudent, setAttStudent] = useState("");
  const [attStatus, setAttStatus] = useState("PRESENT");
  const [doubtSub, setDoubtSub] = useState("");
  const [doubtBody, setDoubtBody] = useState("");

  const faculty = user?.role === "OWNER" || user?.role === "FACULTY";
  const student = user?.role === "STUDENT";

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

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold text-navy">LMS</h1>
          <p className="text-sm text-slate-500">Publish content, mark attendance, assign work, run exams, and track doubts.</p>
        </div>
      )}
      {embedded && (
        <p className="text-sm text-slate-500">Quizzes, recorded videos, PDFs, live class, and assignments for this course.</p>
      )}
      <ErrorText error={error} />
      {faculty && (
        <>
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
          <Card title="Create assignment">
            <FormGrid>
              <Field label="Title" value={asgTitle} onChange={setAsgTitle} />
              <Field label="Instructions" value={asgInst} onChange={setAsgInst} />
              <Select label="Batch" value={batchId} onChange={setBatchId} options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
              <div className="flex items-end">
                <PrimaryButton
                  disabled={!asgTitle}
                  onClick={() =>
                    run(async () => {
                      await createRecord("/api/assignments", { title: asgTitle, instructions: asgInst, batchId: batchId || null, published: true });
                      setAsgTitle("");
                      setAsgInst("");
                      asg.reload();
                    })
                  }
                >
                  Save assignment
                </PrimaryButton>
              </div>
            </FormGrid>
          </Card>
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
          <Card title="Mark attendance">
            <FormGrid>
              <Select
                label="Student"
                value={attStudent}
                onChange={setAttStudent}
                options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
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
      <Card title="Timetable">
        <Table
          columns={["Subject", "Day", "Start"]}
          rows={(slots.data ?? []).map((s) => [s.subject, String(s.dayOfWeek), s.startTime])}
        />
      </Card>
      <Card title="Learning content in this course">
        <Table
          columns={["Title", "Type", "Standard", "Published"]}
          rows={materials.map((c) => [c.title, c.contentType, c.scormStandard || "—", c.published === false ? "No" : "Yes"])}
        />
      </Card>
      <Card title="LMS standards packages (SCORM / xAPI / LTI)">
        <Table
          columns={["Standard", "Version", "Status"]}
          rows={(packages.data ?? []).map((p) => [p.standard, p.versionLabel || "—", p.status])}
        />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Live classes">
          <ul className="text-sm">
            {(live.data ?? []).map((l, i) => (
              <li key={i}>
                {l.title} ({l.provider}){" "}
                <a className="text-brand" href={l.meetingUrl} target="_blank" rel="noreferrer">
                  Join
                </a>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Recorded lectures">
          <ul className="text-sm">
            {(recs.data ?? []).map((r, i) => (
              <li key={i}>{r.title}</li>
            ))}
          </ul>
        </Card>
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
      </div>
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
            <li key={i}>
              {d.subject} — {d.status}
              {d.facultyReply ? `: ${d.facultyReply}` : ""}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
