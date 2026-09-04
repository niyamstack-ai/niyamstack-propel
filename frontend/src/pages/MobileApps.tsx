import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { enqueueOffline, flushOffline, pendingOffline } from "../offline";
import { localToday } from "../localDate";
import { Card, ErrorText, Field, PrimaryButton, Select, formatDay, formatInr, useApi } from "../ui";

type Home = {
  role?: string;
  name?: string;
  student?: { id: string; fullName: string };
  attendance?: { sessionDate?: string; status?: string }[];
  invoices?: { invoiceNo?: string; amount?: number; status?: string }[];
  notices?: { title?: string; body?: string }[];
  content?: { id: string; title: string; contentType?: string }[];
  drives?: { id: string; title: string; packageLpa?: number }[];
  batches?: { id: string; name: string }[];
  submissions?: { id: string; assignmentId?: string; status?: string; studentName?: string; assignmentTitle?: string }[];
  live?: { id: string; title: string; startsAt?: string }[];
  students?: { id: string; fullName: string; batchId?: string }[];
};

export function MobileApp() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState("home");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [previewAs, setPreviewAs] = useState<"faculty" | "student">("faculty");
  const home = useApi<Home>("/api/actions/mobile/home");
  const isOwner = user?.role === "OWNER";
  const faculty = user?.role === "FACULTY" || (isOwner && previewAs === "faculty");
  const studentPreview = isOwner && previewAs === "student";
  /** Owner student preview is layout-only — do not reuse faculty home payload as student data. */
  const studentData: Home | undefined = studentPreview ? undefined : home.data ?? undefined;

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!navigator.onLine || !token) return;
    flushOffline(api)
      .then((n) => {
        if (n) {
          setNotice(`Synced ${n} offline action(s).`);
          home.reload();
        }
      })
      .catch((e) => setError((e as Error).message || "Offline sync failed"));
  }, [token, offline]);

  if (!token) return <Navigate to="/login" replace />;

  const tabs = faculty
    ? [
        ["home", "Batches"],
        ["attend", "Attendance"],
        ["notices", "Notices"],
        ["grade", "Grade"],
      ]
    : [
        ["home", "Today"],
        ["learn", "Learn"],
        ["fees", "Fees"],
        ["jobs", "Jobs"],
      ];

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-mist pb-20">
      <header className="sticky top-0 z-10 border-b border-line bg-navy px-4 py-3 text-white">
        <p className="text-xs uppercase tracking-wide text-white/70">{faculty ? "Faculty app" : "Student app"}</p>
        <h1 className="text-lg font-semibold">{user?.orgName || home.data?.name || "Propel"}</h1>
        {offline && <p className="text-xs text-amber-200">Offline — actions queue and sync later.</p>}
        {isOwner && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs ${previewAs === "faculty" ? "bg-white text-navy" : "bg-white/15"}`}
                onClick={() => {
                  setPreviewAs("faculty");
                  setTab("home");
                }}
              >
                Faculty preview
              </button>
              <button
                type="button"
                className={`rounded-full px-2.5 py-1 text-xs ${previewAs === "student" ? "bg-white text-navy" : "bg-white/15"}`}
                onClick={() => {
                  setPreviewAs("student");
                  setTab("home");
                }}
              >
                Student layout
              </button>
            </div>
            {previewAs === "student" && (
              <p className="text-[11px] text-amber-100">Layout only — data is still from your staff login. Open the student website to see real student data.</p>
            )}
          </div>
        )}
      </header>
      <main className="space-y-4 p-4">
        <ErrorText error={error || home.error} />
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        {tab === "home" && home.loading && <p className="text-sm text-slate-500">Loading…</p>}
        {tab === "home" && !faculty && !home.loading && (
          studentPreview ? (
            <Card title="Student preview">
              <p className="text-sm text-slate-600">
                This is a layout preview only. Staff home data is hidden so it does not look like a real student. Open your public student website for real courses, fees, and attendance.
              </p>
            </Card>
          ) : (
            <StudentToday data={studentData} />
          )
        )}
        {tab === "learn" && !studentPreview && <StudentLearn data={studentData} />}
        {tab === "fees" && !studentPreview && <StudentFees data={studentData} />}
        {tab === "jobs" && !studentPreview && <StudentJobs data={studentData} />}
        {(tab === "learn" || tab === "fees" || tab === "jobs") && studentPreview && (
          <Card title="Preview">
            <p className="text-sm text-slate-600">Student tabs are empty in owner preview. Use the public site for real student flows.</p>
          </Card>
        )}
        {tab === "home" && faculty && !home.loading && <FacultyBatches data={home.data ?? undefined} />}
        {tab === "attend" && faculty && (
          <FacultyAttend
            data={home.data ?? undefined}
            onError={setError}
            onNotice={setNotice}
            reload={home.reload}
          />
        )}
        {tab === "notices" && faculty && (
          <FacultyNotice
            onError={setError}
            onNotice={setNotice}
            reload={home.reload}
          />
        )}
        {tab === "grade" && faculty && (
          <FacultyGrade data={home.data ?? undefined} onError={setError} onNotice={setNotice} reload={home.reload} />
        )}
        <p className="text-center text-xs text-slate-400">
          <Link className="text-brand" to="/">
            Open desktop portal
          </Link>
        </p>
      </main>
      <nav className="absolute bottom-0 left-0 right-0 grid grid-cols-4 border-t border-line bg-white">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`py-3 text-xs ${tab === id ? "font-semibold text-brand" : "text-slate-500"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function StudentToday({ data }: { data?: Home }) {
  return (
    <>
      <Card title="Attendance">
        <ul className="text-sm">
          {(data?.attendance ?? []).slice(0, 8).map((a, i) => (
            <li key={i}>
              {formatDay(a.sessionDate)} — {prettyLabel(a.status)}
            </li>
          ))}
          {(data?.attendance ?? []).length === 0 && <li className="text-slate-500">No attendance yet.</li>}
        </ul>
      </Card>
      <Card title="Notices">
        <ul className="text-sm">
          {(data?.notices ?? []).map((n, i) => (
            <li key={i}>{n.title || n.body}</li>
          ))}
          {(data?.notices ?? []).length === 0 && <li className="text-slate-500">No notices.</li>}
        </ul>
      </Card>
    </>
  );
}

function StudentLearn({ data }: { data?: Home }) {
  const { user } = useAuth();
  const learnTo = user?.orgSlug ? `/s/${user.orgSlug}/learn` : "/";
  return (
    <Card title="Content">
      <ul className="text-sm">
        {(data?.content ?? []).map((c) => (
          <li key={c.id}>
            {c.title} {c.contentType ? `· ${c.contentType}` : ""}
          </li>
        ))}
        {(data?.content ?? []).length === 0 && <li className="text-slate-500">No published content yet.</li>}
      </ul>
      <Link className="mt-3 inline-block text-sm text-brand" to={learnTo}>
        Open my learning
      </Link>
    </Card>
  );
}

function StudentFees({ data }: { data?: Home }) {
  const { user } = useAuth();
  const feesTo = user?.orgSlug ? `/s/${user.orgSlug}/fees` : "/fees";
  return (
    <Card title="Due fees">
      <ul className="text-sm">
        {(data?.invoices ?? []).map((i, n) => (
          <li key={n}>
            {i.invoiceNo} — {formatInr(i.amount)} ({prettyLabel(i.status)})
          </li>
        ))}
        {(data?.invoices ?? []).length === 0 && <li className="text-slate-500">No dues.</li>}
      </ul>
      <Link className="mt-3 inline-block text-sm text-brand" to={feesTo}>
        Pay fees
      </Link>
    </Card>
  );
}

function StudentJobs({ data }: { data?: Home }) {
  const { user } = useAuth();
  const jobsTo = user?.orgSlug ? `/s/${user.orgSlug}/jobs` : "/placement";
  return (
    <Card title="Open drives">
      <ul className="text-sm">
        {(data?.drives ?? []).map((d) => (
          <li key={d.id}>
            {d.title} {d.packageLpa ? `· ${d.packageLpa} LPA` : ""}
          </li>
        ))}
        {(data?.drives ?? []).length === 0 && <li className="text-slate-500">No open drives.</li>}
      </ul>
      <Link className="mt-3 inline-block text-sm text-brand" to={jobsTo}>
        Open jobs
      </Link>
    </Card>
  );
}

function FacultyBatches({ data }: { data?: Home }) {
  return (
    <>
      <Card title="My batches">
        <ul className="text-sm">
          {(data?.batches ?? []).map((b) => (
            <li key={b.id}>{b.name}</li>
          ))}
          {(data?.batches ?? []).length === 0 && <li className="text-slate-500">No batches yet.</li>}
        </ul>
      </Card>
      <Card title="Live classes">
        <ul className="text-sm">
          {(data?.live ?? []).map((l) => (
            <li key={l.id}>{l.title}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function FacultyAttend({
  data,
  onError,
  onNotice,
  reload,
}: {
  data?: Home;
  onError: (v: string | null) => void;
  onNotice: (v: string | null) => void;
  reload: () => void;
}) {
  const [batchId, setBatchId] = useState("");
  const students = (data?.students ?? []).filter((s) => !batchId || s.batchId === batchId);
  async function mark(studentId: string) {
    onError(null);
    const payload = {
      type: "ATTENDANCE" as const,
      studentId,
      batchId,
      sessionDate: localToday(),
      status: "PRESENT",
    };
    try {
      if (!navigator.onLine) {
        enqueueOffline(payload);
        onNotice(`Queued. ${pendingOffline().length} waiting to sync.`);
        return;
      }
      await api("/api/attendance", { method: "POST", body: JSON.stringify({ studentId, batchId, sessionDate: payload.sessionDate, status: "PRESENT", source: "APP" }) });
      onNotice("Marked present.");
      reload();
    } catch (e) {
      enqueueOffline(payload);
      onNotice("Saved offline. Will sync when you are back online.");
      onError((e as Error).message);
    }
  }
  return (
    <Card title="Mark attendance">
      <Select label="Batch" value={batchId} onChange={setBatchId} options={(data?.batches ?? []).map((b) => ({ value: b.id, label: b.name }))} />
      {!batchId ? (
        <p className="mt-3 text-sm text-slate-500">Pick a batch to see students.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {students.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <span>{s.fullName}</span>
              <PrimaryButton onClick={() => void mark(s.id)}>Present</PrimaryButton>
            </li>
          ))}
          {students.length === 0 && <li className="text-slate-500">No students in this batch.</li>}
        </ul>
      )}
    </Card>
  );
}

function FacultyNotice({
  onError,
  onNotice,
  reload,
}: {
  onError: (v: string | null) => void;
  onNotice: (v: string | null) => void;
  reload: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <Card title="Publish notice">
      <Field label="Title" value={title} onChange={setTitle} />
      <Field label="Body" value={body} onChange={setBody} />
      <div className="mt-3">
        <PrimaryButton
          disabled={!title}
          onClick={async () => {
            onError(null);
            const payload = { type: "NOTICE" as const, title, body };
            try {
              if (!navigator.onLine) {
                enqueueOffline(payload);
                onNotice("Notice queued offline.");
                return;
              }
              await api("/api/announcements", { method: "POST", body: JSON.stringify({ title, body }) });
              setTitle("");
              setBody("");
              onNotice("Notice published.");
              reload();
            } catch (e) {
              enqueueOffline(payload);
              onNotice("Saved offline.");
              onError((e as Error).message);
            }
          }}
        >
          Publish
        </PrimaryButton>
      </div>
    </Card>
  );
}

function FacultyGrade({
  data,
  onError,
  onNotice,
  reload,
}: {
  data?: Home;
  onError: (m: string | null) => void;
  onNotice: (m: string | null) => void;
  reload: () => void;
}) {
  const [grades, setGrades] = useState<Record<string, string>>({});
  return (
    <Card title="Pending submissions">
      <ul className="space-y-3 text-sm">
        {(data?.submissions ?? []).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
            <span>
              <span className="font-medium text-navy">{s.studentName || "Student"}</span>
              {" · "}
              {s.assignmentTitle || "Assignment"}
              {" · "}
              {prettyLabel(s.status) || "Submitted"}
            </span>
            <span className="flex items-center gap-2">
              <select
                className="rounded border border-line px-2 py-1 text-sm"
                value={grades[s.id] || "A"}
                onChange={(e) => setGrades((prev) => ({ ...prev, [s.id]: e.target.value }))}
              >
                {["A", "B", "C", "D", "F"].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <PrimaryButton
                onClick={() =>
                  void (async () => {
                    onError(null);
                    try {
                      const grade = grades[s.id] || "A";
                      await api(`/api/actions/submissions/${s.id}/grade`, {
                        method: "POST",
                        body: JSON.stringify({ grade, feedback: `Graded ${grade}.` }),
                      });
                      onNotice(`Graded ${grade}.`);
                      reload();
                    } catch (e) {
                      onError((e as Error).message);
                    }
                  })()
                }
              >
                Grade
              </PrimaryButton>
            </span>
          </li>
        ))}
        {(data?.submissions ?? []).length === 0 && <li className="text-slate-500">Nothing to grade.</li>}
      </ul>
      <Link className="mt-3 inline-block text-sm text-brand" to="/courses">
        Open courses to grade
      </Link>
    </Card>
  );
}
