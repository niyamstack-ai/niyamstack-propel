import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, getToken } from "../api";
import { createRecord, deleteRecord, updateRecord, uploadContentFile } from "../ops";
import { ErrorText, useApi } from "../ui";

export type ContentRow = {
  id: string;
  title: string;
  contentType: string;
  courseId?: string;
  parentFolderId?: string | null;
  url?: string;
  published?: boolean;
  visibility?: string;
  storageKey?: string;
  batchId?: string;
};

export type AssessmentRow = {
  id: string;
  title: string;
  kind: string;
  courseId?: string;
  parentFolderId?: string | null;
  published?: boolean;
  durationMinutes?: number;
  passingScore?: number;
  totalMarks?: number;
  maxAttempts?: number | null;
};

type QuestionRow = {
  id: string;
  assessmentId?: string;
  prompt: string;
  optionsJson?: string;
  answerKey?: string;
};

type AttemptRow = { id: string; assessmentId?: string; score?: number; status: string; studentId?: string };

type QuizResult = {
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  passingScore: number;
  breakdown: { questionId: string; prompt: string; yourAnswer: string; correctAnswer: string; correct: boolean }[];
};

const ADD_ITEMS = [
  { id: "FOLDER", label: "Folder" },
  { id: "VIDEO", label: "Video" },
  { id: "ONLINE_TEST", label: "Online Test" },
  { id: "SUBJECTIVE", label: "Subjective Test" },
  { id: "PRACTICE", label: "Practice Test" },
  { id: "DOCUMENT", label: "Document" },
  { id: "IMAGE", label: "Image" },
  { id: "ZIP", label: "Zip File" },
] as const;

type AddKind = (typeof ADD_ITEMS)[number]["id"];

function inFolder<T extends { parentFolderId?: string | null }>(rows: T[], folderId: string | null) {
  return rows.filter((row) => (row.parentFolderId || "") === (folderId || ""));
}

export function fileSrc(url?: string) {
  if (!url) return "";
  let path = url.startsWith("/files/") ? `/api${url}` : url;
  const token = getToken();
  if (!token) return path;
  return `${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
}

function parseOptions(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* ignore */
  }
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function CourseContentPanel({ courseId }: { courseId: string }) {
  const content = useApi<ContentRow[]>("/api/content");
  const exams = useApi<AssessmentRow[]>("/api/assessments");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [trail, setTrail] = useState<ContentRow[]>([]);
  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContentRow | null>(null);
  const [editTest, setEditTest] = useState<AssessmentRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const courseContent = (content.data ?? []).filter((row) => row.courseId === courseId);
  const courseExams = (exams.data ?? []).filter((row) => row.courseId === courseId);
  const foldersHere = inFolder(courseContent, folderId).filter((row) => row.contentType === "FOLDER");
  const filesHere = inFolder(courseContent, folderId).filter((row) => row.contentType !== "FOLDER");
  const testsHere = inFolder(courseExams, folderId);

  function openFolder(folder: ContentRow) {
    setTrail((t) => [...t, folder]);
    setFolderId(folder.id);
    setMenuId(null);
  }

  function jumpTo(index: number) {
    if (index < 0) {
      setTrail([]);
      setFolderId(null);
      return;
    }
    const next = trail.slice(0, index + 1);
    setTrail(next);
    setFolderId(next[next.length - 1]?.id ?? null);
  }

  async function rename(row: ContentRow) {
    const title = window.prompt("Rename", row.title);
    if (!title || title === row.title) return;
    setError(null);
    try {
      await updateRecord(`/api/content/${row.id}`, { ...row, title });
      content.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeContent(row: ContentRow) {
    if (!window.confirm(`Delete “${row.title}”?`)) return;
    setError(null);
    try {
      await deleteRecord(`/api/content/${row.id}`);
      if (folderId === row.id) jumpTo(trail.length - 2);
      content.reload();
      exams.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeTest(row: AssessmentRow) {
    if (!window.confirm(`Delete test “${row.title}”?`)) return;
    setError(null);
    try {
      await deleteRecord(`/api/assessments/${row.id}`);
      exams.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function counts(folder: ContentRow) {
    const nested = courseContent.filter((row) => row.parentFolderId === folder.id);
    const nestedTests = courseExams.filter((row) => row.parentFolderId === folder.id);
    const videos = nested.filter((row) => row.contentType === "VIDEO").length;
    const files = nested.filter((row) => row.contentType !== "VIDEO" && row.contentType !== "FOLDER").length + nestedTests.length;
    return `${videos} video(s), ${files} file(s)`;
  }

  return (
    <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
      <div className="p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-navy">Contents</h2>
        <nav className="mt-2 flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <button type="button" className="hover:text-brand" onClick={() => jumpTo(-1)}>
            All content
          </button>
          {trail.map((folder, i) => (
            <span key={folder.id} className="flex items-center gap-1">
              <span>/</span>
              <button type="button" className="hover:text-brand" onClick={() => jumpTo(i)}>
                {folder.title}
              </button>
            </span>
          ))}
        </nav>
        <ErrorText error={error} />
        <div className="mt-4 divide-y divide-line">
          {foldersHere.length === 0 && filesHere.length === 0 && testsHere.length === 0 && (
            <p className="py-8 text-sm text-slate-500">This folder is empty. Use Add content to upload videos, PDFs, or create a test.</p>
          )}
          {foldersHere.map((row) => (
            <ContentLine
              key={row.id}
              icon={<FolderIcon className="h-8 w-8 text-brand" />}
              title={row.title}
              subtitle={counts(row)}
              open={menuId === row.id}
              onOpenMenu={() => setMenuId((id) => (id === row.id ? null : row.id))}
              onDoubleClick={() => openFolder(row)}
              onEnter={() => openFolder(row)}
              actions={[
                { label: "Open", onClick: () => openFolder(row) },
                { label: "Rename", onClick: () => rename(row) },
                { label: "Delete", onClick: () => removeContent(row) },
              ]}
            />
          ))}
          {filesHere.map((row) => (
            <ContentLine
              key={row.id}
              icon={fileIcon(row.contentType)}
              title={row.title}
              subtitle={row.contentType.toLowerCase()}
              open={menuId === row.id}
              onOpenMenu={() => setMenuId((id) => (id === row.id ? null : row.id))}
              onDoubleClick={() => setPreview(row)}
              onEnter={() => setPreview(row)}
              actions={[
                { label: "Preview", onClick: () => setPreview(row) },
                { label: "Rename", onClick: () => rename(row) },
                { label: "Delete", onClick: () => removeContent(row) },
              ]}
            />
          ))}
          {testsHere.map((row) => (
            <ContentLine
              key={row.id}
              icon={<ChecklistIcon className="h-7 w-7 text-brand" />}
              title={row.title}
              subtitle={`${(row.kind || "test").toLowerCase()} · ${row.maxAttempts ? `${row.maxAttempts} attempt(s)` : "unlimited attempts"}`}
              open={menuId === row.id}
              onOpenMenu={() => setMenuId((id) => (id === row.id ? null : row.id))}
              onDoubleClick={() => setEditTest(row)}
              onEnter={() => setEditTest(row)}
              actions={[
                { label: "Edit questions", onClick: () => setEditTest(row) },
                { label: "Delete", onClick: () => removeTest(row) },
              ]}
            />
          ))}
        </div>
      </div>
      <aside className="border-t border-line bg-[#f7fafc] p-5 lg:border-l lg:border-t-0">
        <h3 className="mb-3 font-semibold text-navy">Add content</h3>
        <ul className="space-y-1">
          {ADD_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-white"
                onClick={() => setAddKind(item.id)}
              >
                <span className="text-brand">{addIcon(item.id)}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {addKind && (
        <AddModal
          kind={addKind}
          courseId={courseId}
          folderId={folderId}
          onClose={() => setAddKind(null)}
          onSaved={() => {
            setAddKind(null);
            content.reload();
            exams.reload();
          }}
        />
      )}
      {editTest && (
        <QuizBuilder
          courseId={courseId}
          folderId={folderId}
          existing={editTest}
          onClose={() => setEditTest(null)}
          onSaved={() => {
            setEditTest(null);
            exams.reload();
          }}
        />
      )}
      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ContentLine({
  icon,
  title,
  subtitle,
  open,
  onOpenMenu,
  onDoubleClick,
  onEnter,
  actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  open: boolean;
  onOpenMenu: () => void;
  onDoubleClick?: () => void;
  onEnter?: () => void;
  actions: { label: string; onClick: () => void }[];
}) {
  return (
    <div className="flex items-center gap-3 py-3" onDoubleClick={onDoubleClick}>
      <button type="button" className="shrink-0" onClick={onEnter || onDoubleClick}>
        {icon}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onEnter} onDoubleClick={onDoubleClick}>
        <p className="truncate font-medium text-navy">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </button>
      <div className="relative">
        <button type="button" className="rounded-lg px-2 py-1 text-lg text-slate-500 hover:bg-mist" aria-label="More" onClick={onOpenMenu}>
          ⋮
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-line bg-white py-1 shadow-lg">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-mist"
                onClick={() => {
                  a.onClick();
                  onOpenMenu();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddModal({
  kind,
  courseId,
  folderId,
  onClose,
  onSaved,
}: {
  kind: AddKind;
  courseId: string;
  folderId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (kind === "ONLINE_TEST" || kind === "SUBJECTIVE" || kind === "PRACTICE") {
    return <QuizBuilder courseId={courseId} folderId={folderId} kind={kind} onClose={onClose} onSaved={onSaved} />;
  }
  return <UploadModal kind={kind} courseId={courseId} folderId={folderId} onClose={onClose} onSaved={onSaved} />;
}

function UploadModal({
  kind,
  courseId,
  folderId,
  onClose,
  onSaved,
}: {
  kind: AddKind;
  courseId: string;
  folderId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const needsFile = kind !== "FOLDER";
  const accept =
    kind === "VIDEO" ? "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" : kind === "DOCUMENT" ? "application/pdf,.pdf" : kind === "IMAGE" ? "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" : kind === "ZIP" ? ".zip,application/zip" : undefined;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      if (kind === "FOLDER") {
        await createRecord("/api/content", {
          title,
          contentType: "FOLDER",
          courseId,
          parentFolderId: folderId,
          published: true,
          visibility: "COURSE",
        });
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Choose a file to upload.");
        await uploadContentFile(file, {
          title: title || file.name,
          courseId,
          contentType: kind,
          ...(folderId ? { parentFolderId: folderId } : {}),
        });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-navy">{kind === "FOLDER" ? "New folder" : `Upload ${ADD_ITEMS.find((x) => x.id === kind)?.label}`}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {kind === "FOLDER" ? "Open the folder to add videos, PDFs, and tests inside it." : "Files stay in this software. Students play or open them here — no outside links."}
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-slate-600">Name</span>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "FOLDER" ? "Study material" : "Optional — defaults to file name"} />
        </label>
        {needsFile && (
          <label className="mt-3 block text-sm">
            <span className="text-slate-600">{kind === "VIDEO" ? "Video file" : kind === "DOCUMENT" ? "PDF file" : "File"}</span>
            <input ref={fileRef} type="file" accept={accept} className="mt-1 block w-full text-sm" />
          </label>
        )}
        <ErrorText error={error} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={busy || (kind === "FOLDER" && !title.trim())} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={save}>
            {busy ? "Saving…" : kind === "FOLDER" ? "Create" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuizBuilder({
  courseId,
  folderId,
  kind = "ONLINE_TEST",
  existing,
  onClose,
  onSaved,
}: {
  courseId: string;
  folderId: string | null;
  kind?: AddKind;
  existing?: AssessmentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const questionsApi = useApi<QuestionRow[]>("/api/questions");
  const mcq = (existing?.kind || kind) !== "SUBJECTIVE";
  const [title, setTitle] = useState(existing?.title || "");
  const [attempts, setAttempts] = useState(String(existing?.maxAttempts ?? (kind === "PRACTICE" ? 0 : 3)));
  const [passing, setPassing] = useState(String(existing?.passingScore ?? 40));
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 30));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useMemo(
    () => (questionsApi.data ?? []).filter((q) => q.assessmentId === existing?.id),
    [questionsApi.data, existing?.id],
  );
  const [questions, setQuestions] = useState<{ prompt: string; options: string[]; correct: number; textAnswer: string }[]>([
    { prompt: "", options: ["", "", "", ""], correct: 0, textAnswer: "" },
  ]);

  useEffect(() => {
    if (!existing || loaded.length === 0) return;
    setQuestions(
      loaded.map((q) => {
        const options = parseOptions(q.optionsJson);
        const idx = Math.max(0, options.findIndex((o) => o === q.answerKey));
        return { prompt: q.prompt, options: options.length ? options : ["", "", "", ""], correct: idx, textAnswer: q.answerKey || "" };
      }),
    );
  }, [existing, loaded]);

  async function save() {
    if (!title.trim()) {
      setError("Enter a test name.");
      return;
    }
    const ready = questions.filter((q) => q.prompt.trim());
    if (ready.length === 0) {
      setError("Add at least one question.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const body = {
        title,
        kind: existing?.kind || (kind === "SUBJECTIVE" ? "SUBJECTIVE" : kind === "PRACTICE" ? "PRACTICE" : "MCQ"),
        courseId,
        parentFolderId: folderId,
        published: true,
        durationMinutes: Number(duration) || 30,
        totalMarks: 100,
        passingScore: Number(passing) || 40,
        maxAttempts: Number(attempts) || 0,
      };
      const exam = existing
        ? await updateRecord<AssessmentRow>(`/api/assessments/${existing.id}`, { ...existing, ...body })
        : await createRecord<AssessmentRow>("/api/assessments", body);
      if (existing) {
        for (const q of loaded) {
          await deleteRecord(`/api/questions/${q.id}`);
        }
      }
      for (const q of ready) {
        await createRecord("/api/questions", {
          assessmentId: exam.id,
          prompt: q.prompt,
          optionsJson: mcq ? JSON.stringify(q.options.filter(Boolean)) : "[]",
          answerKey: mcq ? q.options[q.correct] : q.textAnswer,
          difficulty: "MEDIUM",
        });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-navy">{existing ? "Edit test" : "Create test"}</h3>
        <p className="mt-1 text-sm text-slate-500">Questions and answers stay in this course. Students submit here and see their score immediately.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Test name</span>
            <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Attempts (0 = unlimited)</span>
            <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={attempts} onChange={(e) => setAttempts(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Passing score %</span>
            <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={passing} onChange={(e) => setPassing(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Duration (minutes)</span>
            <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </label>
        </div>
        <div className="mt-5 space-y-4">
          {questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-navy">Question {i + 1}</p>
                {questions.length > 1 && (
                  <button type="button" className="text-xs text-red-600" onClick={() => setQuestions((rows) => rows.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
              <textarea
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Type the question"
                value={q.prompt}
                onChange={(e) => setQuestions((rows) => rows.map((row, j) => (j === i ? { ...row, prompt: e.target.value } : row)))}
              />
              {mcq ? (
                <div className="mt-3 space-y-2">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`correct-${i}`}
                        checked={q.correct === oi}
                        onChange={() => setQuestions((rows) => rows.map((row, j) => (j === i ? { ...row, correct: oi } : row)))}
                      />
                      <input
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5"
                        placeholder={`Option ${oi + 1}`}
                        value={opt}
                        onChange={(e) =>
                          setQuestions((rows) =>
                            rows.map((row, j) => (j === i ? { ...row, options: row.options.map((o, k) => (k === oi ? e.target.value : o)) } : row)),
                          )
                        }
                      />
                      <span className="w-16 text-xs text-slate-400">{q.correct === oi ? "Correct" : ""}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <label className="mt-2 block text-sm">
                  <span className="text-slate-600">Model answer (used to auto-score)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={q.textAnswer}
                    onChange={(e) => setQuestions((rows) => rows.map((row, j) => (j === i ? { ...row, textAnswer: e.target.value } : row)))}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-brand"
          onClick={() => setQuestions((rows) => [...rows, { prompt: "", options: ["", "", "", ""], correct: 0, textAnswer: "" }])}
        >
          + Add question
        </button>
        <ErrorText error={error} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={save}>
            {busy ? "Saving…" : "Save test"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ item, onClose }: { item: ContentRow; onClose: () => void }) {
  const src = fileSrc(item.url);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-navy">{item.title}</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {item.contentType === "VIDEO" && src && <video src={src} controls className="w-full rounded-lg bg-black" />}
        {item.contentType === "IMAGE" && src && <img src={src} alt={item.title} className="max-h-[70vh] w-full object-contain" />}
        {item.contentType === "DOCUMENT" && src && <iframe title={item.title} src={src} className="h-[70vh] w-full rounded-lg border" />}
        {item.contentType === "ZIP" && <p className="text-sm text-slate-500">Zip uploaded. Students can download it from this course.</p>}
        {!item.url && <p className="text-sm text-slate-500">No file attached.</p>}
      </div>
    </div>
  );
}

export function StudentCourseLibrary({ courseId }: { courseId: string }) {
  const content = useApi<ContentRow[]>("/api/content");
  const exams = useApi<AssessmentRow[]>("/api/assessments");
  const attempts = useApi<AttemptRow[]>("/api/exam-attempts");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [trail, setTrail] = useState<ContentRow[]>([]);
  const [preview, setPreview] = useState<ContentRow | null>(null);
  const [quiz, setQuiz] = useState<AssessmentRow | null>(null);

  const courseContent = (content.data ?? []).filter((row) => row.courseId === courseId && row.published !== false);
  const courseExams = (exams.data ?? []).filter((row) => row.courseId === courseId && row.published !== false);
  const foldersHere = inFolder(courseContent, folderId).filter((row) => row.contentType === "FOLDER");
  const filesHere = inFolder(courseContent, folderId).filter((row) => row.contentType !== "FOLDER");
  const testsHere = inFolder(courseExams, folderId);

  function openFolder(folder: ContentRow) {
    setTrail((t) => [...t, folder]);
    setFolderId(folder.id);
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-lg font-semibold text-navy">Contents</h2>
      <nav className="mt-2 flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <button type="button" className="hover:text-brand" onClick={() => { setTrail([]); setFolderId(null); }}>
          All content
        </button>
        {trail.map((folder, i) => (
          <span key={folder.id} className="flex items-center gap-1">
            /
            <button
              type="button"
              className="hover:text-brand"
              onClick={() => {
                const next = trail.slice(0, i + 1);
                setTrail(next);
                setFolderId(next[next.length - 1]?.id ?? null);
              }}
            >
              {folder.title}
            </button>
          </span>
        ))}
      </nav>
      <div className="mt-4 divide-y divide-line">
        {foldersHere.map((row) => (
          <button key={row.id} type="button" className="flex w-full items-center gap-3 py-3 text-left" onDoubleClick={() => openFolder(row)} onClick={() => openFolder(row)}>
            <FolderIcon className="h-8 w-8 text-brand" />
            <span>
              <span className="block font-medium text-navy">{row.title}</span>
              <span className="text-xs text-slate-500">Folder</span>
            </span>
          </button>
        ))}
        {filesHere.map((row) => (
          <button key={row.id} type="button" className="flex w-full items-center gap-3 py-3 text-left" onClick={() => setPreview(row)}>
            {fileIcon(row.contentType)}
            <span>
              <span className="block font-medium text-navy">{row.title}</span>
              <span className="text-xs text-slate-500">{row.contentType === "VIDEO" ? "Play video" : row.contentType === "DOCUMENT" ? "Open PDF" : "Open"}</span>
            </span>
          </button>
        ))}
        {testsHere.map((row) => {
          const mine = (attempts.data ?? []).filter((a) => a.assessmentId === row.id && a.status === "SUBMITTED");
          const last = mine[0];
          return (
            <button key={row.id} type="button" className="flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => setQuiz(row)}>
              <span className="flex items-center gap-3">
                <ChecklistIcon className="h-7 w-7 text-brand" />
                <span>
                  <span className="block font-medium text-navy">{row.title}</span>
                  <span className="text-xs text-slate-500">
                    {row.maxAttempts ? `${mine.length}/${row.maxAttempts} attempts used` : `${mine.length} attempt(s)`}
                    {last?.score != null ? ` · last score ${last.score}%` : ""}
                  </span>
                </span>
              </span>
              <span className="text-sm font-medium text-brand">Start</span>
            </button>
          );
        })}
      </div>
      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}
      {quiz && (
        <TakeQuiz
          exam={quiz}
          used={(attempts.data ?? []).filter((a) => a.assessmentId === quiz.id && a.status === "SUBMITTED").length}
          onClose={() => setQuiz(null)}
          onDone={() => {
            attempts.reload();
          }}
        />
      )}
    </div>
  );
}

function TakeQuiz({ exam, used, onClose, onDone }: { exam: AssessmentRow; used: number; onClose: () => void; onDone: () => void }) {
  const questionsApi = useApi<QuestionRow[]>("/api/questions");
  const questions = (questionsApi.data ?? []).filter((q) => q.assessmentId === exam.id);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const remaining = exam.maxAttempts && exam.maxAttempts > 0 ? Math.max(0, exam.maxAttempts - used) : null;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const attempt = await api<{ id: string }>(`/api/actions/assessments/${exam.id}/start`, { method: "POST", body: "{}" });
      const scored = await api<QuizResult>(`/api/actions/attempts/${attempt.id}/submit`, { method: "POST", body: JSON.stringify(answers) });
      setResult(scored);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-navy">{exam.title}</h3>
        <p className="mt-1 text-sm text-slate-500">
          {remaining == null ? "Unlimited attempts" : `${remaining} attempt(s) left`}
          {exam.durationMinutes ? ` · ${exam.durationMinutes} min` : ""}
        </p>
        {result ? (
          <div className="mt-4 space-y-3">
            <p className="text-2xl font-bold text-navy">
              {result.score}% {result.passed ? "· Passed" : "· Not passed"}
            </p>
            <p className="text-sm text-slate-500">
              {result.correctCount} of {result.total} correct · passing {result.passingScore}%
            </p>
            {result.breakdown?.map((row) => (
              <div key={row.questionId} className={`rounded-xl border p-3 text-sm ${row.correct ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                <p className="font-medium">{row.prompt}</p>
                <p className="mt-1">Your answer: {row.yourAnswer || "—"}</p>
                <p>Correct answer: {row.correctAnswer || "—"}</p>
              </div>
            ))}
            <button type="button" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-4">
              {questions.map((q, i) => {
                const options = parseOptions(q.optionsJson);
                return (
                  <div key={q.id} className="rounded-xl border border-line p-4">
                    <p className="font-medium text-navy">
                      {i + 1}. {q.prompt}
                    </p>
                    {options.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {options.map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-sm">
                            <input type="radio" name={q.id} checked={answers[q.id] === opt} onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={answers[q.id] || ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                    )}
                  </div>
                );
              })}
            </div>
            <ErrorText error={error} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || remaining === 0}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={submit}
              >
                {busy ? "Submitting…" : remaining === 0 ? "No attempts left" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function addIcon(id: AddKind) {
  if (id === "FOLDER") return <FolderIcon className="h-5 w-5" />;
  if (id === "VIDEO") return <PlayIcon className="h-5 w-5" />;
  if (id === "ONLINE_TEST") return <ChecklistIcon className="h-5 w-5" />;
  if (id === "SUBJECTIVE") return <ClipboardIcon className="h-5 w-5" />;
  if (id === "PRACTICE") return <FlaskIcon className="h-5 w-5" />;
  if (id === "DOCUMENT") return <DocIcon className="h-5 w-5" />;
  if (id === "IMAGE") return <ImageIcon className="h-5 w-5" />;
  return <ZipIcon className="h-5 w-5" />;
}

function fileIcon(type: string) {
  if (type === "VIDEO") return <PlayIcon className="h-7 w-7 text-brand" />;
  if (type === "IMAGE") return <ImageIcon className="h-7 w-7 text-brand" />;
  if (type === "ZIP") return <ZipIcon className="h-7 w-7 text-brand" />;
  return <DocIcon className="h-7 w-7 text-brand" />;
}

export function FolderIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z" />
    </svg>
  );
}
function PlayIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 14.5v-9l7 4.5-7 4.5Z" />
    </svg>
  );
}
function ChecklistIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M9 7h11v2H9V7Zm0 4h11v2H9v-2Zm0 4h11v2H9v-2ZM4 7h2v2H4V7Zm0 4h2v2H4v-2Zm0 4h2v2H4v-2Z" />
    </svg>
  );
}
function ClipboardIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M9 2h6l1 2h4v18H4V4h4l1-2Zm3 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    </svg>
  );
}
function FlaskIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M9 3h6v2h-1v5.6l5.7 9.1A1.5 1.5 0 0 1 18.4 22H5.6a1.5 1.5 0 0 1-1.3-2.3L10 10.6V5H9V3Z" />
    </svg>
  );
}
function DocIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5Z" />
    </svg>
  );
}
function ImageIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4 5h16v14H4V5Zm2 12 4-5 3 4 2-2 3 3H6Zm9-7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </svg>
  );
}
function ZipIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M10 2h8l4 4v16H6V6l4-4Zm2 2v2h2V4h-2Zm0 4v2h2V8h-2Zm0 4h2v6h-4v-2h2v-4Z" />
    </svg>
  );
}
