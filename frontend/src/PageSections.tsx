import { useEffect, useRef, type ReactNode } from "react";
import { fileSrc } from "./api";
import { uploadMedia } from "./ops";
import { pairLines, parseSections, youtubeId, type SiteSection } from "./websiteSections";

export function PageSections({ body, catalog }: { body?: string; catalog?: ReactNode }) {
  const sections = parseSections(body);
  if (sections.length === 0) return catalog ? <>{catalog}</> : null;
  return (
    <div className="space-y-8">
      {sections.map((s) => (
        <SectionView key={s.id} section={s} catalog={catalog} />
      ))}
    </div>
  );
}

function LiveText({
  value,
  className,
  onChange,
  tag: Tag = "p",
  placeholder,
}: {
  value?: string;
  className?: string;
  onChange?: (v: string) => void;
  tag?: "h1" | "h2" | "p" | "span" | "figcaption" | "blockquote";
  placeholder?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!ref.current || document.activeElement === ref.current) return;
    const next = value || "";
    if (ref.current.innerText !== next) ref.current.innerText = next;
  }, [value]);
  if (!onChange) {
    const text = value || placeholder || "";
    if (!text && Tag !== "span") return null;
    return <Tag className={className}>{text}</Tag>;
  }
  return (
    <Tag
      ref={ref as never}
      className={`${className || ""} cursor-text rounded-sm outline-none focus:ring-2 focus:ring-brand/40`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onChange(e.currentTarget.innerText)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && Tag !== "p" && Tag !== "blockquote" && Tag !== "figcaption") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
    />
  );
}

async function pickImage(onChange: (url: string) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const stored = await uploadMedia(file);
    onChange(stored.url);
  };
  input.click();
}

export function SectionView({
  section,
  catalog,
  onChange,
}: {
  section: SiteSection;
  catalog?: ReactNode;
  onChange?: (change: Partial<SiteSection>) => void;
}) {
  const edit = onChange
    ? (field: keyof SiteSection) => (value: string) => onChange({ [field]: value })
    : undefined;

  if (section.type === "hero") {
    return (
      <div className="overflow-hidden rounded-2xl bg-navy p-8 text-white md:p-12">
        {section.imageUrl ? (
          <img
            src={fileSrc(section.imageUrl)}
            alt=""
            className={`mb-5 h-44 w-full rounded-xl object-cover ${onChange ? "cursor-pointer" : ""}`}
            onClick={onChange ? (e) => { e.stopPropagation(); void pickImage((url) => onChange({ imageUrl: url })); } : undefined}
          />
        ) : onChange ? (
          <button
            type="button"
            className="mb-5 grid h-28 w-full place-items-center rounded-xl border border-dashed border-white/40 text-sm text-sky-100"
            onClick={(e) => { e.stopPropagation(); void pickImage((url) => onChange({ imageUrl: url })); }}
          >
            Click to add a photo
          </button>
        ) : null}
        <LiveText tag="h1" className="text-3xl font-bold md:text-4xl" value={section.heading} placeholder="Your institute name" onChange={edit?.("heading")} />
        <LiveText tag="p" className="mt-3 max-w-2xl text-sm leading-6 text-sky-100 whitespace-pre-wrap" value={section.text} placeholder="A short line about your coaching" onChange={edit?.("text")} />
        {(section.buttonLabel || onChange) && (
          <LiveText tag="span" className="mt-5 inline-block rounded-full bg-brand px-5 py-2 text-sm font-semibold" value={section.buttonLabel} placeholder="View courses" onChange={edit?.("buttonLabel")} />
        )}
      </div>
    );
  }
  if (section.type === "image") {
    return (
      <figure>
        <LiveText tag="h2" className="mb-3 text-xl font-bold text-navy" value={section.heading} placeholder="Photo title" onChange={edit?.("heading")} />
        {section.imageUrl ? (
          <img
            src={fileSrc(section.imageUrl)}
            alt=""
            className={`max-h-80 w-full rounded-2xl object-cover ${onChange ? "cursor-pointer" : ""}`}
            onClick={onChange ? (e) => { e.stopPropagation(); void pickImage((url) => onChange({ imageUrl: url })); } : undefined}
          />
        ) : (
          <button
            type="button"
            className="grid h-40 w-full place-items-center rounded-2xl bg-mist text-sm text-slate-400"
            onClick={onChange ? (e) => { e.stopPropagation(); void pickImage((url) => onChange({ imageUrl: url })); } : undefined}
          >
            {onChange ? "Click to add a photo" : "Add an image"}
          </button>
        )}
        <LiveText tag="figcaption" className="mt-2 text-sm text-slate-500" value={section.text} placeholder="Caption" onChange={edit?.("text")} />
      </figure>
    );
  }
  if (section.type === "courses") {
    return (
      <div>
        <LiveText tag="h2" className="mb-3 text-xl font-bold text-navy" value={section.heading} placeholder="Courses" onChange={edit?.("heading")} />
        {catalog || <p className="text-sm text-slate-500">Published courses appear here.</p>}
      </div>
    );
  }
  if (section.type === "contact") {
    return (
      <div className="rounded-2xl border border-line bg-white p-6">
        <LiveText tag="h2" className="text-xl font-bold text-navy" value={section.heading} placeholder="Contact" onChange={edit?.("heading")} />
        <LiveText tag="p" className="mt-2 whitespace-pre-wrap text-sm text-slate-600" value={section.text} placeholder="How to reach you" onChange={edit?.("text")} />
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          <li>
            Phone <LiveText tag="span" value={section.phone} placeholder="mobile number" onChange={edit?.("phone")} />
          </li>
          <li>
            Email <LiveText tag="span" value={section.email} placeholder="email" onChange={edit?.("email")} />
          </li>
          <li>
            <LiveText tag="span" value={section.address} placeholder="address" onChange={edit?.("address")} />
          </li>
        </ul>
      </div>
    );
  }
  if (section.type === "testimonials") {
    const quotes = (section.quotes || section.text || "").split("\n").map((q) => q.trim()).filter(Boolean);
    const rows = quotes.length ? quotes : onChange ? ["Write a student quote"] : ["Student feedback appears here."];
    return (
      <div>
        <LiveText tag="h2" className="text-xl font-bold text-navy" value={section.heading} placeholder="What students say" onChange={edit?.("heading")} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {rows.map((q, i) => (
            <LiveText
              key={`${section.id}-q-${i}`}
              tag="blockquote"
              className="rounded-2xl bg-mist p-4 text-sm text-slate-600"
              value={q}
              onChange={
                onChange
                  ? (v) => {
                      const next = [...rows];
                      next[i] = v;
                      onChange({ quotes: next.filter(Boolean).join("\n") });
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    );
  }
  if (section.type === "cta") {
    return (
      <div className="rounded-2xl bg-brand p-8 text-center text-white">
        <LiveText tag="h2" className="text-2xl font-bold" value={section.heading} placeholder="Ready to join?" onChange={edit?.("heading")} />
        <LiveText tag="p" className="mx-auto mt-2 max-w-lg text-sm text-sky-50" value={section.text} placeholder="Invite students to enrol" onChange={edit?.("text")} />
        <LiveText tag="span" className="mt-5 inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand" value={section.buttonLabel} placeholder="Get started" onChange={edit?.("buttonLabel")} />
      </div>
    );
  }
  if (section.type === "features") {
    const items = pairLines(section.quotes);
    const rows = items.length ? items : [{ title: "Feature", text: "Click to write" }];
    return (
      <div>
        <LiveText tag="h2" className="mb-4 text-xl font-bold text-navy" value={section.heading} placeholder="Why students choose us" onChange={edit?.("heading")} />
        <div className="grid gap-3 sm:grid-cols-3">
          {rows.map((item, i) => (
            <div key={`${section.id}-f-${i}`} className="rounded-2xl border border-line bg-white p-4">
              <LiveText
                tag="p"
                className="font-semibold text-navy"
                value={item.title}
                onChange={
                  onChange
                    ? (v) => {
                        const next = [...rows];
                        next[i] = { ...next[i], title: v };
                        onChange({ quotes: next.map((r) => `${r.title}|${r.text}`).join("\n") });
                      }
                    : undefined
                }
              />
              <LiveText
                tag="p"
                className="mt-1 text-sm text-slate-500"
                value={item.text}
                onChange={
                  onChange
                    ? (v) => {
                        const next = [...rows];
                        next[i] = { ...next[i], text: v };
                        onChange({ quotes: next.map((r) => `${r.title}|${r.text}`).join("\n") });
                      }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (section.type === "video") {
    const id = youtubeId(section.imageUrl);
    return (
      <div>
        <LiveText tag="h2" className="mb-3 text-xl font-bold text-navy" value={section.heading} placeholder="Watch a sample class" onChange={edit?.("heading")} />
        {id ? (
          <div className="aspect-video overflow-hidden rounded-2xl bg-black">
            <iframe title={section.heading || "Video"} className="h-full w-full" src={`https://www.youtube.com/embed/${id}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          </div>
        ) : (
          <div className="grid aspect-video place-items-center rounded-2xl bg-navy p-4 text-sm text-sky-100">
            {onChange ? (
              <input
                className="w-full max-w-md rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white placeholder:text-sky-200"
                placeholder="Paste a YouTube link"
                defaultValue={section.imageUrl || ""}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => onChange({ imageUrl: e.target.value })}
              />
            ) : (
              section.text || "Video"
            )}
          </div>
        )}
      </div>
    );
  }
  if (section.type === "faq") {
    const items = pairLines(section.quotes);
    const rows = items.length ? items : [{ title: "Question", text: "Answer" }];
    return (
      <div>
        <LiveText tag="h2" className="mb-3 text-xl font-bold text-navy" value={section.heading} placeholder="Common questions" onChange={edit?.("heading")} />
        <div className="space-y-2">
          {rows.map((item, i) => (
            <div key={`${section.id}-faq-${i}`} className="rounded-xl border border-line bg-white px-4 py-3">
              <LiveText
                tag="p"
                className="font-medium text-navy"
                value={item.title}
                onChange={
                  onChange
                    ? (v) => {
                        const next = [...rows];
                        next[i] = { ...next[i], title: v };
                        onChange({ quotes: next.map((r) => `${r.title}|${r.text}`).join("\n") });
                      }
                    : undefined
                }
              />
              <LiveText
                tag="p"
                className="mt-2 text-sm text-slate-600"
                value={item.text}
                onChange={
                  onChange
                    ? (v) => {
                        const next = [...rows];
                        next[i] = { ...next[i], text: v };
                        onChange({ quotes: next.map((r) => `${r.title}|${r.text}`).join("\n") });
                      }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <LiveText tag="h2" className="text-xl font-bold text-navy" value={section.heading} placeholder="Heading" onChange={edit?.("heading")} />
      <LiveText tag="p" className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600" value={section.text} placeholder="Write here" onChange={edit?.("text")} />
    </div>
  );
}
