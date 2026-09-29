import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Viewport-filling study shell for PDF / video / images.
 * Uses the device screen (100dvh / 100vw), not a fixed max-width card.
 */
export function StudyMediaOverlay({
  title,
  onClose,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleFullscreen() {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* browser may block; overlay is already near-fullscreen */
    }
  }

  return createPortal(
    <div
      ref={rootRef}
      className="fixed inset-0 z-[90] flex h-[100dvh] max-h-[100dvh] w-screen flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-navy px-3 py-2 text-white sm:gap-3 sm:px-4">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base">{title}</h3>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          {actions}
          <button
            type="button"
            className="rounded-lg border border-white/25 px-2.5 py-1 text-xs font-medium hover:bg-white/10 sm:text-sm"
            onClick={() => void toggleFullscreen()}
          >
            {isFs ? "Exit full screen" : "Full screen"}
          </button>
          <button
            type="button"
            className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25 sm:text-sm"
            aria-label="Close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 bg-black">{children}</div>
    </div>,
    document.body
  );
}

export function studyMediaFillClass(kind: "video" | "iframe" | "image") {
  if (kind === "video") return "h-full w-full bg-black object-contain";
  if (kind === "image") return "mx-auto h-full w-full object-contain";
  return "h-full w-full border-0 bg-white";
}
