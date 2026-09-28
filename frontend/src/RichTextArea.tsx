import { useEffect, useRef } from "react";

/** Lightweight rich description editor (bold / lists / headings). Stores HTML. */
export function RichTextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!ref.current || focused.current) return;
    if (ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML || "");
  }

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-200">
      <div className="flex flex-wrap gap-1 border-b border-line bg-mist px-2 py-1.5">
        <Tool label="B" title="Bold" onClick={() => exec("bold")} className="font-bold" />
        <Tool label="I" title="Italic" onClick={() => exec("italic")} className="italic" />
        <Tool label="H" title="Heading" onClick={() => exec("formatBlock", "h3")} />
        <Tool label="• List" title="Bullet list" onClick={() => exec("insertUnorderedList")} />
        <Tool label="1. List" title="Numbered list" onClick={() => exec("insertOrderedList")} />
      </div>
      <div
        ref={ref}
        className="min-h-28 w-full px-3 py-2.5 text-sm text-slate-700 outline-none"
        contentEditable
        role="textbox"
        aria-label={placeholder || "Course description"}
        suppressContentEditableWarning
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          onChange(ref.current?.innerHTML || "");
        }}
        onInput={() => onChange(ref.current?.innerHTML || "")}
      />
    </div>
  );
}

function Tool({
  label,
  title,
  onClick,
  className = "",
}: {
  label: string;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`rounded px-2 py-0.5 text-xs text-navy hover:bg-white ${className}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Safe HTML render for course descriptions (basic tags only). */
export function RichHtml({ html, className = "" }: { html?: string; className?: string }) {
  const safe = sanitizeBasicHtml(html || "");
  if (!safe) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />;
}

function sanitizeBasicHtml(raw: string) {
  if (!raw) return "";
  if (typeof DOMParser === "undefined") return raw.replace(/<[^>]+>/g, "");
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "P", "BR", "UL", "OL", "LI", "H2", "H3", "H4", "DIV", "SPAN"]);
  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!allowed.has(el.tagName)) {
          while (el.firstChild) node.insertBefore(el.firstChild, el);
          node.removeChild(el);
          continue;
        }
        Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));
        walk(el);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
