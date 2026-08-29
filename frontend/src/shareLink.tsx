import { useEffect, useState } from "react";
import { api } from "./api";
import { updateRecord } from "./ops";

export function courseSharePath(slug: string, courseId: string, shareSlug?: string) {
  const ending = (shareSlug || "").trim() || courseId;
  return `/s/${slug}/courses/${ending}`;
}

export function courseShareUrl(slug: string, courseId: string, shareSlug?: string) {
  return `${window.location.origin}${courseSharePath(slug, courseId, shareSlug)}`;
}

export function ShareLinkBar({
  slug,
  courseId,
  shareSlug,
  published,
  compact = false,
  onSlugSaved,
}: {
  slug?: string;
  courseId: string;
  shareSlug?: string;
  published?: boolean;
  compact?: boolean;
  onSlugSaved?: (shareSlug: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [draft, setDraft] = useState(shareSlug || "");
  const [liveSlug, setLiveSlug] = useState(shareSlug || "");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft(shareSlug || "");
    setLiveSlug(shareSlug || "");
  }, [shareSlug, courseId]);
  if (!slug || published === false) return null;
  const url = courseShareUrl(slug, courseId, liveSlug);

  async function copy() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 2500);
    }
  }

  async function saveSlug() {
    const wanted = draft.trim().toLowerCase();
    setBusy(true);
    setStatus(null);
    try {
      if (wanted) {
        const check = await api<{ slug: string; available: boolean }>(
          `/api/share-slugs/check?slug=${encodeURIComponent(wanted)}&courseId=${encodeURIComponent(courseId)}`
        );
        if (!check.slug) {
          setStatus("Use at least 3 letters or numbers, for example ipc-consultant.");
          return;
        }
        if (!check.available) {
          setStatus("This link is not available.");
          return;
        }
      }
      const current = await api<Record<string, unknown>>(`/api/courses`);
      const row = Array.isArray(current) ? current.find((c) => (c as { id?: string }).id === courseId) : null;
      if (!row) {
        setStatus("Could not load this course to save the link.");
        return;
      }
      const saved = await updateRecord<{ shareSlug?: string }>(`/api/courses/${courseId}`, { ...row, shareSlug: wanted });
      const next = saved.shareSlug || "";
      onSlugSaved?.(next);
      setDraft(next);
      setLiveSlug(next);
      setStatus(wanted ? "Link saved." : "Using the default link.");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" className="font-medium text-brand hover:underline" onClick={copy}>
          {copyError ? "Copy failed" : copied ? "Link copied" : "Copy student link"}
        </button>
        <a className="font-medium text-brand hover:underline" href={url} target="_blank" rel="noreferrer">
          Open buy page
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 font-semibold text-navy">Student buy link</span>
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1 text-xs text-slate-600">{url}</code>
        <button type="button" className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand" onClick={copy}>
          {copyError ? "Copy failed" : copied ? "Copied" : "Copy link"}
        </button>
        <a className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white" href={url} target="_blank" rel="noreferrer">
          Open page
        </a>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-medium text-navy">
          Custom ending
          <input
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal"
            value={draft}
            placeholder="ipc-consultant"
            onChange={(e) => { setDraft(e.target.value); setStatus(null); }}
          />
        </label>
        <button
          type="button"
          className="rounded-lg border border-navy px-3 py-2 text-sm font-medium text-navy disabled:opacity-50"
          disabled={busy}
          onClick={() => void saveSlug()}
        >
          {busy ? "Checking…" : "Save link"}
        </button>
      </div>
      {status && <p className={`text-xs ${status.includes("not available") || status.includes("at least") || status.includes("Could") || status.includes("subscribe") ? "text-red-600" : "text-slate-600"}`}>{status}</p>}
    </div>
  );
}
