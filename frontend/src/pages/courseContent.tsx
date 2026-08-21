import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { api, fileSrc, getToken } from "../api";
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
  sortOrder?: number;
  createdAt?: string;
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
  proctoring?: boolean;
  sortOrder?: number;
  createdAt?: string;
};

type QuestionRow = {
  id: string;
  assessmentId?: string;
  prompt: string;
  optionsJson?: string;
  answerKey?: string;
  explanation?: string;
};

type AttemptRow = {
  id: string;
  assessmentId?: string;
  score?: number;
  status: string;
  studentId?: string;
  startedAt?: string;
  submittedAt?: string;
  answersJson?: string;
};

type QuizResult = {
  id?: string;
  score: number | null;
  correctCount: number;
  total: number;
  passed: boolean;
  passingScore: number;
  pendingReview?: boolean;
  reason?: string | null;
  breakdown: {
    questionId: string;
    prompt: string;
    yourAnswer: string;
    correctAnswer: string;
    explanation?: string;
    correct: boolean;
  }[];
};

type PaperQuestion = { id: string; prompt: string; optionsJson?: string };

function formatClock(total: number) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function enterExamLock() {
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

function leaveExamLock() {
  if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
}

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
  return rows.filter((row) => String(row.parentFolderId || "") === String(folderId || ""));
}

function sameId(a?: string | null, b?: string | null) {
  return String(a || "") === String(b || "");
}

type LibraryItem = {
  key: string;
  kind: "CONTENT" | "ASSESSMENT";
  id: string;
  title: string;
  folder: boolean;
  sortOrder: number;
  createdAt?: string;
  content?: ContentRow;
  test?: AssessmentRow;
};

function asContentItem(row: ContentRow): LibraryItem {
  return {
    key: `c-${row.id}`,
    kind: "CONTENT",
    id: row.id,
    title: row.title,
    folder: row.contentType === "FOLDER",
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    content: row,
  };
}

function asTestItem(row: AssessmentRow): LibraryItem {
  return {
    key: `a-${row.id}`,
    kind: "ASSESSMENT",
    id: row.id,
    title: row.title,
    folder: false,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt,
    test: row,
  };
}

function compareLibrary(a: LibraryItem, b: LibraryItem) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const rank = (item: LibraryItem) => (item.folder ? 0 : item.kind === "CONTENT" ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.title.localeCompare(b.title);
}

function itemsInFolder(content: ContentRow[], exams: AssessmentRow[], folderId: string | null) {
  return [...inFolder(content, folderId).map(asContentItem), ...inFolder(exams, folderId).map(asTestItem)].sort(compareLibrary);
}

function descendantFolderIds(content: ContentRow[], folderId: string) {
  const ids = new Set<string>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of content) {
      if (row.contentType === "FOLDER" && row.parentFolderId && ids.has(row.parentFolderId) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return ids;
}

export { fileSrc };

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
  const [dragItem, setDragItem] = useState<LibraryItem | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; mode: "into" | "before" | "after" } | null>(null);
  const [movePick, setMovePick] = useState<LibraryItem | null>(null);
  const dragging = useRef(false);

  const courseContent = (content.data ?? []).filter((row) => sameId(row.courseId, courseId));
  const courseExams = (exams.data ?? []).filter((row) => sameId(row.courseId, courseId));
  const items = itemsInFolder(courseContent, courseExams, folderId);
  const otherFolders = courseContent.filter((row) => row.contentType === "FOLDER" && row.id !== movePick?.id);

  function openFolder(folder: ContentRow) {
    if (dragging.current) return;
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

  async function arrange(parentId: string | null, list: LibraryItem[]) {
    setError(null);
    await api(`/api/actions/courses/${courseId}/content/arrange`, {
      method: "POST",
      body: JSON.stringify({
        parentFolderId: parentId,
        items: list.map((row) => ({ kind: row.kind, id: row.id })),
      }),
    });
    content.reload();
    exams.reload();
  }

  async function moveTo(parentId: string | null, moving: LibraryItem, mode: "into" | "before" | "after" | "end" = "end", target?: LibraryItem) {
    if (moving.folder && parentId && descendantFolderIds(courseContent, moving.id).has(parentId)) {
      setError("A folder cannot be moved into itself.");
      return;
    }
    const dest = itemsInFolder(courseContent, courseExams, parentId).filter((row) => row.id !== moving.id);
    let next = dest;
    if (mode === "before" && target) {
      const idx = dest.findIndex((row) => row.id === target.id);
      next = [...dest.slice(0, Math.max(0, idx)), moving, ...dest.slice(Math.max(0, idx))];
    } else if (mode === "after" && target) {
      const idx = dest.findIndex((row) => row.id === target.id);
      next = [...dest.slice(0, idx + 1), moving, ...dest.slice(idx + 1)];
    } else {
      next = [...dest, moving];
    }
    try {
      await arrange(parentId, next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function hintFor(row: LibraryItem, clientY: number, top: number, height: number) {
    const y = (clientY - top) / height;
    if (row.folder && y > 0.28 && y < 0.72) return "into" as const;
    return y < 0.5 ? ("before" as const) : ("after" as const);
  }

  function lineActions(item: LibraryItem) {
    const actions: { label: string; onClick: () => void }[] = [];
    if (item.folder && item.content) {
      actions.push({ label: "Open", onClick: () => openFolder(item.content!) });
      actions.push({ label: "Rename", onClick: () => rename(item.content!) });
    } else if (item.content) {
      actions.push({ label: "Preview", onClick: () => setPreview(item.content!) });
      actions.push({ label: "Rename", onClick: () => rename(item.content!) });
    } else if (item.test) {
      actions.push({ label: "Edit questions", onClick: () => setEditTest(item.test!) });
    }
    if (folderId) {
      actions.push({
        label: trail.length > 1 ? `Move to ${trail[trail.length - 2].title}` : "Move to All content",
        onClick: () => moveTo(trail.length > 1 ? trail[trail.length - 2].id : null, item),
      });
    }
    const siblingFolders = items.filter((row) => row.folder && row.id !== item.id);
    if (siblingFolders.length === 1) {
      actions.push({ label: `Move into ${siblingFolders[0].title}`, onClick: () => moveTo(siblingFolders[0].id, item, "into") });
    } else if (otherFolders.length > 0) {
      actions.push({ label: "Move into folder…", onClick: () => setMovePick(item) });
    }
    const idx = items.findIndex((row) => row.id === item.id);
    if (idx > 0) actions.push({ label: "Move up", onClick: () => moveTo(folderId, item, "before", items[idx - 1]) });
    if (idx >= 0 && idx < items.length - 1) actions.push({ label: "Move down", onClick: () => moveTo(folderId, item, "after", items[idx + 1]) });
    if (item.content) actions.push({ label: "Delete", onClick: () => removeContent(item.content!) });
    if (item.test) actions.push({ label: "Delete", onClick: () => removeTest(item.test!) });
    return actions;
  }

  return (
    <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0 p-5 sm:p-8">
        <h2 className="text-lg font-semibold text-navy">Contents</h2>
        <p className="mt-1 text-xs text-slate-500">Drag the handle to reorder. Drop onto a folder to move inside it.</p>
        <nav className="mt-2 flex flex-wrap items-center gap-1 text-sm text-slate-500">
          <button
            type="button"
            className="hover:text-brand"
            onClick={() => jumpTo(-1)}
            onDragOver={(e) => {
              if (dragItem && folderId) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragItem) void moveTo(null, dragItem);
              setDragItem(null);
            }}
          >
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
        <div
          className="mt-4 divide-y divide-line"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragItem) void moveTo(folderId, dragItem);
            setDragItem(null);
            setDropHint(null);
          }}
        >
          {items.length === 0 && (
            <p className="py-8 text-sm text-slate-500">This folder is empty. Use Add content to upload videos, PDFs, or create a test.</p>
          )}
          {items.map((item) => (
            <ContentLine
              key={item.key}
              icon={
                item.folder ? (
                  <FolderIcon className="h-8 w-8 text-brand" />
                ) : item.test ? (
                  <ChecklistIcon className="h-7 w-7 text-brand" />
                ) : (
                  fileIcon(item.content?.contentType || "FILE")
                )
              }
              title={item.title}
              subtitle={
                item.folder && item.content
                  ? counts(item.content)
                  : item.test
                    ? `${(item.test.kind || "test").toLowerCase()} · ${item.test.maxAttempts ? `${item.test.maxAttempts} attempt(s)` : "unlimited attempts"}`
                    : (item.content?.contentType || "").toLowerCase()
              }
              open={menuId === item.id}
              dropMode={dropHint?.id === item.id ? dropHint.mode : null}
              dragging={dragItem?.id === item.id}
              onOpenMenu={() => setMenuId((id) => (id === item.id ? null : item.id))}
              onDoubleClick={() => {
                if (item.folder && item.content) openFolder(item.content);
                else if (item.test) setEditTest(item.test);
                else if (item.content) setPreview(item.content);
              }}
              onEnter={() => {
                if (item.folder && item.content) openFolder(item.content);
                else if (item.test) setEditTest(item.test);
                else if (item.content) setPreview(item.content);
              }}
              onDragStart={() => {
                dragging.current = true;
                setDragItem(item);
              }}
              onDragEnd={() => {
                dragging.current = false;
                setDragItem(null);
                setDropHint(null);
              }}
              onDragOver={(clientY, top, height) => {
                if (!dragItem || dragItem.id === item.id) return;
                setDropHint({ id: item.id, mode: hintFor(item, clientY, top, height) });
              }}
              onDrop={() => {
                if (!dragItem || !dropHint || dropHint.id !== item.id) return;
                if (dropHint.mode === "into" && item.folder) void moveTo(item.id, dragItem, "into");
                else void moveTo(folderId, dragItem, dropHint.mode, item);
                setDragItem(null);
                setDropHint(null);
              }}
              actions={lineActions(item)}
            />
          ))}
        </div>
        {movePick && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setMovePick(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-navy">Move into folder</h3>
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                {otherFolders.map((folder) => (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-mist"
                      onClick={() => {
                        void moveTo(folder.id, movePick, "into");
                        setMovePick(null);
                      }}
                    >
                      {folder.title}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="mt-3 text-sm text-slate-500" onClick={() => setMovePick(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <aside className="min-w-0 border-t border-line bg-[#f7fafc] p-5 xl:border-l xl:border-t-0">
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
  dropMode,
  dragging,
  onOpenMenu,
  onDoubleClick,
  onEnter,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  open: boolean;
  dropMode?: "into" | "before" | "after" | null;
  dragging?: boolean;
  onOpenMenu: () => void;
  onDoubleClick?: () => void;
  onEnter?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (clientY: number, top: number, height: number) => void;
  onDrop?: () => void;
  actions: { label: string; onClick: () => void }[];
}) {
  return (
    <div
      className={`relative flex items-center gap-3 py-3 ${dragging ? "opacity-50" : ""} ${dropMode === "into" ? "rounded-lg bg-sky-50" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onDragOver?.(e.clientY, box.top, box.height);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop?.();
      }}
      onDoubleClick={onDoubleClick}
    >
      {dropMode === "before" && <span className="absolute inset-x-0 -top-px h-0.5 bg-brand" />}
      {dropMode === "after" && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" />}
      <span className="cursor-grab select-none px-1 text-slate-300" title="Drag to move" aria-hidden>
        ⋮⋮
      </span>
      <button type="button" className="shrink-0" onClick={onEnter || onDoubleClick}>
        {icon}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onEnter} onDoubleClick={onDoubleClick}>
        <p className="truncate font-medium text-navy">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
        {dropMode === "into" && <p className="text-xs font-medium text-brand">Drop to move inside</p>}
      </button>
      <div className="relative">
        <button type="button" className="rounded-lg px-2 py-1 text-lg text-slate-500 hover:bg-mist" aria-label="More" onClick={onOpenMenu}>
          ⋮
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-line bg-white py-1 shadow-lg">
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
  const defaultTitle = kind === "SUBJECTIVE" ? "Subjective Test" : kind === "PRACTICE" ? "Practice Test" : "Online Test";
  const [title, setTitle] = useState(existing?.title || defaultTitle);
  const [attempts, setAttempts] = useState(String(existing?.maxAttempts ?? (kind === "PRACTICE" ? 0 : 3)));
  const [passing, setPassing] = useState(String(existing?.passingScore ?? 40));
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 30));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useMemo(
    () => (questionsApi.data ?? []).filter((q) => q.assessmentId === existing?.id),
    [questionsApi.data, existing?.id],
  );
  const [questions, setQuestions] = useState<{ prompt: string; options: string[]; correct: number; textAnswer: string; explanation: string }[]>([
    { prompt: "", options: ["", "", "", ""], correct: 0, textAnswer: "", explanation: "" },
  ]);

  useEffect(() => {
    if (!existing || loaded.length === 0) return;
    setQuestions(
      loaded.map((q) => {
        const options = parseOptions(q.optionsJson);
        const idx = Math.max(0, options.findIndex((o) => o === q.answerKey));
        return { prompt: q.prompt, options: options.length ? options : ["", "", "", ""], correct: idx, textAnswer: q.answerKey || "", explanation: q.explanation || "" };
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
      setError("Type a question, then click Save test.");
      return;
    }
    if (mcq) {
      const incomplete = ready.find((q) => q.options.filter((o) => o.trim()).length < 2);
      if (incomplete) {
        setError("Each question needs at least two options and one marked Correct.");
        return;
      }
    }
    setError(null);
    setBusy(true);
    try {
      await api(`/api/actions/courses/${courseId}/quizzes`, {
        method: "POST",
        body: JSON.stringify({
          id: existing?.id,
          title: title.trim(),
          kind: existing?.kind || (kind === "SUBJECTIVE" ? "SUBJECTIVE" : kind === "PRACTICE" ? "PRACTICE" : "MCQ"),
          parentFolderId: folderId || undefined,
          durationMinutes: Number(duration) || 30,
          passingScore: Number(passing) || 40,
          maxAttempts: Number(attempts) || 0,
          questions: ready.map((q) => ({
            prompt: q.prompt.trim(),
            options: mcq ? q.options.map((o) => o.trim()).filter(Boolean) : [],
            answerKey: mcq ? q.options[q.correct] : q.textAnswer,
            explanation: q.explanation?.trim() || "",
          })),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-navy">{existing ? "Edit test" : "Create test"}</h3>
        <p className="mt-1 text-sm text-slate-500">Students see a live timer. Changing tab submits the test. Add an explanation if you want it shown after they submit.</p>
        <ErrorText error={error} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-slate-600">Test name</span>
            <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 1 quiz" />
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
                  <span className="text-slate-600">Model answer (shown after submit; teacher still reviews)</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                    value={q.textAnswer}
                    onChange={(e) => setQuestions((rows) => rows.map((row, j) => (j === i ? { ...row, textAnswer: e.target.value } : row)))}
                  />
                </label>
              )}
              <label className="mt-2 block text-sm">
                <span className="text-slate-600">Explanation (optional)</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Why this is correct"
                  value={q.explanation}
                  onChange={(e) => setQuestions((rows) => rows.map((row, j) => (j === i ? { ...row, explanation: e.target.value } : row)))}
                />
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-brand"
          onClick={() => setQuestions((rows) => [...rows, { prompt: "", options: ["", "", "", ""], correct: 0, textAnswer: "", explanation: "" }])}
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
  const type = (item.contentType || "").toUpperCase();
  const isVideo = type === "VIDEO" || type.includes("VIDEO");
  const isImage = type === "IMAGE" || type.includes("IMAGE") || type === "PNG" || type === "JPG" || type === "JPEG";
  const isZip = type === "ZIP" || type.includes("ZIP") || type.includes("PACKAGE") || type.includes("SCORM");
  const remote = /^https?:\/\//i.test(item.url || "");
  const isPdf = !remote && (type === "PDF" || /\.pdf($|\?)/i.test(item.url || ""));
  const external = remote && !isVideo && !isImage;
  const isDoc = (type === "DOCUMENT" || isPdf) && !!src && !remote && !isZip;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-navy">{item.title}</h3>
          <div className="flex items-center gap-3">
            {src && (
              <a className="text-sm font-medium text-brand" href={src} download={!external} target="_blank" rel="noreferrer">
                {external ? "Open link" : "Download"}
              </a>
            )}
            <button type="button" aria-label="Close preview" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {isVideo && src && <video src={src} controls className="w-full rounded-lg bg-black" />}
        {isImage && src && <img src={src} alt={item.title} className="max-h-[70vh] w-full object-contain" />}
        {isPdf && src && !external && <iframe title={item.title} src={src} className="h-[70vh] w-full rounded-lg border" />}
        {isDoc && !isPdf && <iframe title={item.title} src={src} className="h-[70vh] w-full rounded-lg border" />}
        {isZip && (
          <p className="text-sm text-slate-500">
            This is a downloadable package. Use Download to save it
            {src ? "." : " — no file is attached."}
          </p>
        )}
        {external && !isZip && (
          <p className="text-sm text-slate-500">
            This item is an external link. Use Open link to view it in a new tab.
          </p>
        )}
        {!src && <p className="text-sm text-slate-500">No file attached.</p>}
      </div>
    </div>
  );
}

export function StudentCourseLibrary({ courseId, allowDownload = true }: { courseId: string; allowDownload?: boolean }) {
  const [params, setParams] = useSearchParams();
  const folderId = params.get("folder");
  const content = useApi<ContentRow[]>("/api/content");
  const exams = useApi<AssessmentRow[]>("/api/assessments");
  const attempts = useApi<AttemptRow[]>("/api/exam-attempts");
  const [preview, setPreview] = useState<ContentRow | null>(null);
  const [quiz, setQuiz] = useState<AssessmentRow | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const viewed = useApi<{ contentItemId?: string }[]>("/api/content-progress");
  const seen = new Set((viewed.data ?? []).map((row) => row.contentItemId).filter(Boolean));

  function openPreview(row: ContentRow) {
    setPreview(row);
    void api(`/api/actions/content/${row.id}/view`, { method: "POST", body: "{}" }).then(() => viewed.reload()).catch(() => undefined);
  }

  const courseContent = (content.data ?? []).filter((row) => sameId(row.courseId, courseId) && row.published !== false);
  const courseExams = (exams.data ?? []).filter((row) => sameId(row.courseId, courseId) && row.published !== false);
  const items = itemsInFolder(courseContent, courseExams, folderId);
  const trail = useMemo(() => {
    if (!folderId) return [];
    const byId = new Map(courseContent.map((row) => [row.id, row]));
    const out: ContentRow[] = [];
    let cur: string | null = folderId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const row = byId.get(cur);
      if (!row) break;
      out.unshift(row);
      cur = row.parentFolderId || null;
    }
    return out;
  }, [courseContent, folderId]);

  function setFolder(id: string | null) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("folder", id);
      else next.delete("folder");
      return next;
    }, { replace: true });
  }

  function openFolder(folder: ContentRow) {
    setFolder(folder.id);
  }

  function goBack() {
    setFolder(trail.length > 1 ? trail[trail.length - 2].id : null);
  }

  function submittedFor(id: string) {
    return (attempts.data ?? [])
      .filter((a) => a.assessmentId === id && a.status === "SUBMITTED")
      .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-navy">Contents</h2>
        {trail.length > 0 && (
          <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-navy" onClick={goBack}>
            ← Back
          </button>
        )}
      </div>
      <nav className="mt-2 flex flex-wrap items-center gap-1 text-sm text-navy">
        <button type="button" className="font-medium text-brand hover:underline" onClick={() => setFolder(null)}>
          All content
        </button>
        {trail.map((folder) => (
          <span key={folder.id} className="flex items-center gap-1 text-slate-500">
            /
            <button
              type="button"
              className="text-navy hover:text-brand hover:underline"
              onClick={() => setFolder(folder.id)}
            >
              {folder.title}
            </button>
          </span>
        ))}
      </nav>
      <div className="mt-4 divide-y divide-line">
        {items.length === 0 && (
          <p className="py-8 text-sm text-slate-500">This folder is empty.{trail.length ? " Use Back to return to the previous folder." : ""}</p>
        )}
        {items.map((item) => {
          if (item.folder && item.content) {
            return (
              <button key={item.key} type="button" className="flex w-full items-center gap-3 py-3 text-left" onClick={() => openFolder(item.content!)}>
                <FolderIcon className="h-8 w-8 text-brand" />
                <span>
                  <span className="block font-medium text-navy">{item.title}</span>
                  <span className="text-xs text-slate-500">Folder</span>
                </span>
              </button>
            );
          }
          if (item.content) {
            const row = item.content;
            return (
              <div key={item.key} className="flex w-full items-center justify-between gap-3 py-3">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openPreview(row)}>
                  {fileIcon(row.contentType)}
                  <span>
                    <span className="block font-medium text-navy">{row.title}</span>
                    <span className="text-xs text-slate-500">
                      {seen.has(row.id) ? "Opened · " : ""}
                      {row.contentType === "VIDEO" ? "Play video" : row.contentType === "DOCUMENT" ? "Open PDF" : "Open / download"}
                    </span>
                  </span>
                </button>
                {allowDownload && row.url && (
                  <a className="shrink-0 text-sm font-medium text-brand" href={fileSrc(row.url)} download target="_blank" rel="noreferrer">
                    Download
                  </a>
                )}
              </div>
            );
          }
          const row = item.test!;
          const mine = submittedFor(row.id);
          const last = mine[0];
          const inProgress = (attempts.data ?? []).find((a) => a.assessmentId === row.id && a.status === "IN_PROGRESS");
          const used = mine.length;
          const remaining = row.maxAttempts && row.maxAttempts > 0 ? Math.max(0, row.maxAttempts - used) : null;
          const canStart = remaining !== 0 || !!inProgress;
          return (
            <div key={item.key} className="flex w-full items-center justify-between gap-3 py-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => {
                  if (canStart) {
                    setReviewId(null);
                    enterExamLock();
                    setQuiz(row);
                  } else if (last) {
                    setReviewId(last.id);
                    setQuiz(row);
                  }
                }}
              >
                <ChecklistIcon className="h-7 w-7 shrink-0 text-brand" />
                <span>
                  <span className="block font-medium text-navy">{row.title}</span>
                  <span className="text-xs text-slate-500">
                    {inProgress ? "In progress · timer still running" : row.maxAttempts ? `${used}/${row.maxAttempts} attempts used` : `${used} attempt(s)`}
                    {last?.score != null ? ` · last score ${last.score}%` : last && row.kind === "SUBJECTIVE" ? " · submitted for review" : ""}
                  </span>
                </span>
              </button>
              <span className="flex shrink-0 items-center gap-2">
                {last && (
                  <button
                    type="button"
                    className="text-sm font-medium text-slate-600 hover:text-navy"
                    onClick={() => {
                      setReviewId(last.id);
                      setQuiz(row);
                    }}
                  >
                    Review
                  </button>
                )}
                {canStart && (
                  <button
                    type="button"
                    className="text-sm font-medium text-brand"
                    onClick={() => {
                      setReviewId(null);
                      enterExamLock();
                      setQuiz(row);
                    }}
                  >
                    {inProgress ? "Resume" : "Start"}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}
      {quiz && (
        <TakeQuiz
          exam={quiz}
          used={submittedFor(quiz.id).length}
          reviewAttemptId={reviewId}
          onClose={() => {
            leaveExamLock();
            setQuiz(null);
            setReviewId(null);
          }}
          onDone={() => {
            attempts.reload();
          }}
        />
      )}
    </div>
  );
}

function TakeQuiz({
  exam,
  used,
  reviewAttemptId,
  onClose,
  onDone,
}: {
  exam: AssessmentRow;
  used: number;
  reviewAttemptId?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [questions, setQuestions] = useState<PaperQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const remaining = exam.maxAttempts && exam.maxAttempts > 0 ? Math.max(0, exam.maxAttempts - used) : null;
  const tabLock = exam.proctoring === true || (exam.kind || "").toUpperCase() !== "PRACTICE";
  const answersRef = useRef(answers);
  const attemptRef = useRef(attemptId);
  const resultRef = useRef(result);
  const submitting = useRef(false);
  answersRef.current = answers;
  attemptRef.current = attemptId;
  resultRef.current = result;

  async function loadResult(id: string) {
    const scored = await api<QuizResult>(`/api/actions/attempts/${id}/result`);
    setResult(scored);
    setReviewOpen(false);
    onDone();
  }

  async function submitNow(reason?: string) {
    if (submitting.current || resultRef.current) return;
    const id = attemptRef.current;
    if (!id) return;
    if (!reason) {
      const blank = questions.filter((q) => !(answersRef.current[q.id] || "").trim()).length;
      if (blank > 0 && !window.confirm(`You left ${blank} question(s) unanswered. Submit anyway?`)) {
        return;
      }
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = { ...answersRef.current };
      if (reason) body._reason = reason;
      const scored = await api<QuizResult>(`/api/actions/attempts/${id}/submit`, { method: "POST", body: JSON.stringify(body) });
      setResult(scored);
      setReviewOpen(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      submitting.current = false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (reviewAttemptId) {
          const scored = await api<QuizResult>(`/api/actions/attempts/${reviewAttemptId}/result`);
          if (!alive) return;
          setResult(scored);
          setReviewOpen(false);
          return;
        }
        const paper = await api<PaperQuestion[]>(`/api/actions/assessments/${exam.id}/paper`);
        const started = await api<AttemptRow>(`/api/actions/assessments/${exam.id}/start`, { method: "POST", body: "{}" });
        if (!alive) return;
        setQuestions(paper);
        if (started.status === "SUBMITTED") {
          await loadResult(started.id);
          return;
        }
        setAttemptId(started.id);
        if (started.answersJson) {
          try {
            const parsed = JSON.parse(started.answersJson) as Record<string, string>;
            if (parsed && typeof parsed === "object") setAnswers(parsed);
          } catch {
            /* ignore legacy drafts */
          }
        }
        if (exam.durationMinutes && exam.durationMinutes > 0 && started.startedAt) {
          setEndsAt(new Date(started.startedAt).getTime() + exam.durationMinutes * 60_000);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id, reviewAttemptId]);

  useEffect(() => {
    if (!endsAt || result) return;
    function tick() {
      const left = Math.max(0, Math.round((endsAt! - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) void submitNow("TIME");
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, result]);

  useEffect(() => {
    window.dispatchEvent(new Event("propel:exam-lock"));
    return () => window.dispatchEvent(new Event("propel:exam-unlock"));
  }, []);

  useEffect(() => {
    if (!tabLock || result || reviewAttemptId) return;
    function block(e: Event) {
      e.preventDefault();
    }
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
    };
  }, [tabLock, result, reviewAttemptId]);

  useEffect(() => {
    if (!tabLock || result || !attemptId) return;
    function onHide() {
      if (document.visibilityState === "hidden") void submitNow("TAB");
    }
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [tabLock, result, attemptId]);

  useEffect(() => {
    if (!attemptId || result) return;
    const id = window.setTimeout(() => {
      if (resultRef.current) return;
      void api(`/api/actions/attempts/${attemptId}/draft`, { method: "POST", body: JSON.stringify(answers) }).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(id);
  }, [answers, attemptId, result]);

  useEffect(() => {
    if (!attemptId || result) return;
    function flush() {
      const id = attemptRef.current;
      if (!id || resultRef.current) return;
      const token = getToken();
      void fetch(`/api/actions/attempts/${id}/draft`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(answersRef.current),
      });
    }
    function onHide() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [attemptId, result]);

  async function saveAndClose() {
    if (attemptId && !result) {
      try {
        await api(`/api/actions/attempts/${attemptId}/draft`, { method: "POST", body: JSON.stringify(answersRef.current) });
      } catch {
        /* keep closing */
      }
    }
    onClose();
  }

  const clockUrgent = secondsLeft != null && secondsLeft <= 60;
  const timed = exam.durationMinutes && exam.durationMinutes > 0;

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-navy">{exam.title}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {remaining == null ? "Unlimited attempts" : `${remaining} attempt(s) left`}
              {timed && secondsLeft == null && !result ? ` · ${exam.durationMinutes} min` : ""}
            </p>
          </div>
          {timed && secondsLeft != null && !result && (
            <p className={`rounded-lg px-3 py-1.5 font-mono text-lg font-bold ${clockUrgent ? "bg-red-50 text-red-700" : "bg-mist text-navy"}`}>
              {formatClock(secondsLeft)}
            </p>
          )}
        </div>
        {result?.reason === "TAB" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Changing tab is not allowed. Your test was submitted with the answers you had entered.</p>
        )}
        {result?.reason === "TIME" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Time is over. Your answers were submitted automatically.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {loading && !result && <p className="mt-4 text-sm text-slate-500">Starting test…</p>}
        {result && !reviewOpen && (
          <div className="mt-4 space-y-3">
            {result.pendingReview ? (
              <>
                <p className="text-2xl font-bold text-navy">Submitted · Awaiting review</p>
                <p className="text-sm text-slate-500">Your written answers were saved. A teacher will grade this subjective test.</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-navy">
                  {result.score}% {result.passed ? "· Passed" : "· Not passed"}
                </p>
                <p className="text-sm text-slate-500">
                  {result.correctCount} of {result.total} correct · passing {result.passingScore}%
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm font-medium" onClick={() => setReviewOpen(true)}>
                View answers
              </button>
              <button type="button" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
        {result && reviewOpen && (
          <div className="mt-4 space-y-3">
            {result.breakdown?.map((row) => (
              <div
                key={row.questionId}
                className={`rounded-xl border p-3 text-sm ${
                  result.pendingReview ? "border-line bg-mist" : row.correct ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                }`}
              >
                <p className="font-medium">{row.prompt}</p>
                <p className="mt-1">Your answer: {row.yourAnswer || "—"}</p>
                {row.correctAnswer ? <p>{result.pendingReview ? "Suggested answer" : "Correct answer"}: {row.correctAnswer}</p> : null}
                {row.explanation ? <p className="mt-2 text-slate-600">Explanation: {row.explanation}</p> : null}
              </div>
            ))}
            <button type="button" className="rounded-lg border border-line px-4 py-2 text-sm font-medium" onClick={() => setReviewOpen(false)}>
              Back to score
            </button>
          </div>
        )}
        {!result && !loading && (
          <>
            {tabLock && timed && (
              <p className="mt-3 text-xs text-slate-500">Do not switch tabs. Leaving this page submits the test.</p>
            )}
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
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm" onClick={() => void saveAndClose()}>
                Save & close
              </button>
              <button
                type="button"
                disabled={busy || remaining === 0}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void submitNow()}
              >
                {busy ? "Submitting…" : remaining === 0 ? "No attempts left" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
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
