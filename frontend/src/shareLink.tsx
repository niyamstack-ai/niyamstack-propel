import { useState } from "react";

export function courseSharePath(slug: string, courseId: string) {
  return `/s/${slug}/courses/${courseId}`;
}

export function courseShareUrl(slug: string, courseId: string) {
  return `${window.location.origin}${courseSharePath(slug, courseId)}`;
}

export function ShareLinkBar({
  slug,
  courseId,
  published,
  compact = false,
}: {
  slug?: string;
  courseId: string;
  published?: boolean;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  if (!slug || published === false) return null;
  const url = courseShareUrl(slug, courseId);
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
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
      <span className="shrink-0 font-semibold text-navy">Student buy link</span>
      <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1 text-xs text-slate-600">{url}</code>
      <button type="button" className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand" onClick={copy}>
        {copyError ? "Copy failed" : copied ? "Copied" : "Copy link"}
      </button>
      <a className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white" href={url} target="_blank" rel="noreferrer">
        Open page
      </a>
    </div>
  );
}
