import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { fileSrc } from "./api";
import { uploadMedia } from "./ops";
import { compressImage, cropCover } from "./imageUpload";
import { pairLines, parseSections, parseTestimonials, serializeTestimonials, youtubeId, type SiteSection, type Testimonial } from "./websiteSections";
import { EnquireForm } from "./EnquireForm";
import { FormFieldsEditor, parseFormFields, serializeFormFields } from "./formFields";
import { Link } from "react-router-dom";
import { isProductHost } from "./siteHost";

function resolveSectionHref(slug: string | undefined, url: string | undefined, fallback: string) {
  const raw = (url || fallback || "/").trim() || fallback;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (slug && isProductHost() && !path.startsWith(`/s/${slug}`)) {
    return `/s/${slug}${path}`;
  }
  return path;
}

export function PageSections({ body, catalog, slug }: { body?: string; catalog?: ReactNode; slug?: string }) {
  const sections = parseSections(body);
  if (sections.length === 0) return catalog ? <>{catalog}</> : null;
  return (
    <div className="space-y-8">
      {sections.map((s) => (
        <SectionView key={s.id} section={s} catalog={catalog} slug={slug} />
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
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
      onBlur={(e) => onChange(e.currentTarget.innerText)}
      onInput={(e) => onChange(e.currentTarget.innerText)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && Tag !== "p" && Tag !== "blockquote" && Tag !== "figcaption") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
    />
  );
}

function sizeClass(size: string | undefined, kind: "heading" | "text", fallback: string) {
  if (kind === "heading") {
    if (size === "sm") return "text-lg font-bold md:text-xl";
    if (size === "lg") return "text-4xl font-bold md:text-5xl";
  } else {
    if (size === "sm") return "text-xs leading-5";
    if (size === "lg") return "text-base leading-7";
  }
  return fallback;
}

function colorClass(color: string | undefined, fallback: string) {
  if (color === "brand") return "text-brand";
  if (color === "white") return "text-white";
  if (color === "slate") return "text-slate-500";
  if (color === "navy") return "text-navy";
  return fallback;
}

function FormatBar({
  section,
  onChange,
  light,
}: {
  section: SiteSection;
  onChange: (change: Partial<SiteSection>) => void;
  light?: boolean;
}) {
  const btn = light ? "rounded px-1.5 py-0.5 text-[11px] text-sky-100 hover:bg-white/10" : "rounded px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-mist";
  const active = light ? "bg-white/20 text-white" : "bg-mist text-navy";
  return (
    <div className={`mb-2 flex flex-wrap gap-1 ${light ? "text-sky-100" : ""}`} onClick={(e) => e.stopPropagation()}>
      {(["sm", "md", "lg"] as const).map((size) => (
        <button key={size} type="button" className={`${btn} ${section.textSize === size || (!section.textSize && size === "md") ? active : ""}`} onClick={() => onChange({ textSize: size })}>
          {size === "sm" ? "S" : size === "lg" ? "L" : "M"}
        </button>
      ))}
      {(["navy", "brand", "slate", "white"] as const).map((color) => (
        <button key={color} type="button" className={`${btn} ${section.textColor === color ? active : ""}`} onClick={() => onChange({ textColor: color, headingColor: color })}>
          {color}
        </button>
      ))}
    </div>
  );
}

async function pickImage(onChange: (url: string) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const stored = await uploadMedia(await compressImage(file));
    onChange(stored.url);
  };
  input.click();
}

function FramedPhoto({
  src,
  className,
  focus,
  hint,
  aspect,
  onChange,
  onFocus,
}: {
  src: string;
  className?: string;
  focus?: number;
  hint: string;
  aspect: number;
  onChange?: (url: string) => void;
  onFocus?: (value: number) => void;
}) {
  const y = Number.isFinite(focus) ? Math.min(100, Math.max(0, Number(focus))) : 50;
  const [cropping, setCropping] = useState(false);
  async function saveCrop(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onChange) return;
    setCropping(true);
    try {
      const cropped = await cropCover(fileSrc(src), aspect, y);
      const stored = await uploadMedia(cropped);
      onChange(stored.url);
      onFocus?.(50);
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setCropping(false);
    }
  }
  return (
    <div className="relative">
      <img
        src={fileSrc(src)}
        alt=""
        className={`${className || ""} ${onChange ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ objectPosition: `center ${y}%` }}
        onClick={onChange ? (e) => { e.stopPropagation(); void pickImage(onChange); } : undefined}
        onMouseDown={
          onFocus
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                const node = e.currentTarget;
                const move = (ev: globalThis.MouseEvent) => {
                  const box = node.getBoundingClientRect();
                  const next = Math.min(100, Math.max(0, ((ev.clientY - box.top) / Math.max(1, box.height)) * 100));
                  onFocus(Math.round(next));
                };
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }
            : undefined
        }
      />
      {onChange && (
        <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span>{hint}</span>
          <button type="button" className="font-medium text-brand" disabled={cropping} onClick={(e) => void saveCrop(e)}>
            {cropping ? "Cropping…" : "Save this crop"}
          </button>
        </p>
      )}
    </div>
  );
}

export function SectionView({
  section,
  catalog,
  onChange,
  slug,
}: {
  section: SiteSection;
  catalog?: ReactNode;
  onChange?: (change: Partial<SiteSection>) => void;
  slug?: string;
}) {
  const edit = onChange
    ? (field: keyof SiteSection) => (value: string) => onChange({ [field]: value })
    : undefined;

  if (section.type === "hero") {
    return (
      <div className="overflow-hidden rounded-2xl bg-navy p-8 text-white md:p-12">
        {onChange && <FormatBar section={section} onChange={onChange} light />}
        {section.imageUrl ? (
          <FramedPhoto
            src={section.imageUrl}
            className="mb-5 h-44 w-full rounded-xl object-cover"
            focus={section.imageFocus}
            aspect={1600 / 600}
            hint="Use 1600 × 600 px. Drag up or down, then Save this crop. Large files are compressed."
            onChange={onChange ? (url) => onChange({ imageUrl: url }) : undefined}
            onFocus={onChange ? (imageFocus) => onChange({ imageFocus }) : undefined}
          />
        ) : onChange ? (
          <button
            type="button"
            className="mb-5 grid h-28 w-full place-items-center rounded-xl border border-dashed border-white/40 text-sm text-sky-100"
            onClick={(e) => { e.stopPropagation(); void pickImage((url) => onChange({ imageUrl: url })); }}
          >
            Click to add a photo
            <span className="mt-1 block text-[11px] text-sky-200/80">1600 × 600 px. Large files are compressed automatically.</span>
          </button>
        ) : null}
        <LiveText tag="h1" className={`${sizeClass(section.headingSize || section.textSize, "heading", "text-3xl font-bold md:text-4xl")} ${colorClass(section.headingColor, "text-white")}`} value={section.heading} placeholder="Your institute name" onChange={edit?.("heading")} />
        <LiveText tag="p" className={`mt-3 max-w-2xl whitespace-pre-wrap ${sizeClass(section.textSize, "text", "text-sm leading-6")} ${colorClass(section.textColor, "text-sky-100")}`} value={section.text} placeholder="A short line about your coaching" onChange={edit?.("text")} />
        {(section.buttonLabel || onChange) && (
          onChange ? (
            <div className="mt-5 space-y-2">
              <LiveText tag="span" className="inline-block rounded-full bg-brand px-5 py-2 text-sm font-semibold" value={section.buttonLabel} placeholder="View courses" onChange={edit?.("buttonLabel")} />
              <LiveText tag="p" className="text-xs text-sky-200" value={section.buttonUrl} placeholder="Optional link, e.g. /courses or https://…" onChange={edit?.("buttonUrl")} />
            </div>
          ) : section.buttonUrl?.startsWith("http") ? (
            <a className="mt-5 inline-block rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white" href={section.buttonUrl} target="_blank" rel="noreferrer">
              {section.buttonLabel || "View courses"}
            </a>
          ) : (
            <Link
              className="mt-5 inline-block rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white"
              to={resolveSectionHref(slug, section.buttonUrl, isProductHost() && slug ? `/s/${slug}` : "/")}
            >
              {section.buttonLabel || "View courses"}
            </Link>
          )
        )}
      </div>
    );
  }
  if (section.type === "image") {
    return (
      <figure>
        <LiveText tag="h2" className="mb-3 text-xl font-bold text-navy" value={section.heading} placeholder="Photo title" onChange={edit?.("heading")} />
        {section.imageUrl ? (
          <FramedPhoto
            src={section.imageUrl}
            className="max-h-80 w-full rounded-2xl object-cover"
            focus={section.imageFocus}
            aspect={1200 / 800}
            hint="Use 1200 × 800 px. Drag up or down, then Save this crop. Large files are compressed."
            onChange={onChange ? (url) => onChange({ imageUrl: url }) : undefined}
            onFocus={onChange ? (imageFocus) => onChange({ imageFocus }) : undefined}
          />
        ) : (
          <button
            type="button"
            className="grid h-40 w-full place-items-center rounded-2xl bg-mist text-sm text-slate-400"
            onClick={onChange ? (e) => { e.stopPropagation(); void pickImage((url) => onChange({ imageUrl: url })); } : undefined}
          >
            {onChange ? "Click to add a photo (1200 × 800 px)" : "Add an image"}
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
    const extra = parseFormFields(section.formFields);
    return (
      <div className="rounded-2xl border border-line bg-white p-6">
        <LiveText tag="h2" className="text-xl font-bold text-navy" value={section.heading} placeholder="Contact" onChange={edit?.("heading")} />
        <LiveText tag="p" className="mt-2 whitespace-pre-wrap text-sm text-slate-600" value={section.text} placeholder="How to reach you" onChange={edit?.("text")} />
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {(section.phone || onChange) && (
            <li>
              Phone <LiveText tag="span" value={section.phone} placeholder="mobile number" onChange={edit?.("phone")} />
            </li>
          )}
          {(section.email || onChange) && (
            <li>
              Email <LiveText tag="span" value={section.email} placeholder="email" onChange={edit?.("email")} />
            </li>
          )}
          {(section.address || onChange) && (
            <li>
              <LiveText tag="span" value={section.address} placeholder="address" onChange={edit?.("address")} />
            </li>
          )}
        </ul>
        {onChange ? (
          <>
            <p className="mt-4 text-xs text-slate-400">Students see this enquiry form on the live website. Name and mobile stay. Add your own questions below.</p>
            <FormFieldsEditor value={extra} onChange={(next) => onChange({ formFields: serializeFormFields(next) })} />
          </>
        ) : (
          <EnquireForm slug={slug} fields={extra} />
        )}
      </div>
    );
  }
  if (section.type === "testimonials") {
    const rows = parseTestimonials(section.quotes || section.text);
    const list = rows.length ? rows : onChange ? [{ name: "", text: "Write a student quote", imageUrl: "" }] : [{ name: "", text: "Student feedback appears here.", imageUrl: "" }];
    function save(next: Testimonial[]) {
      onChange?.({ quotes: serializeTestimonials(next.filter((row) => row.text || row.name || row.imageUrl)) });
    }
    return (
      <div>
        <LiveText tag="h2" className="text-xl font-bold text-navy" value={section.heading} placeholder="What students say" onChange={edit?.("heading")} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {list.map((row, i) => (
            <div key={`${section.id}-q-${i}`} className="relative rounded-2xl bg-mist p-4">
              {onChange && (
                <button
                  type="button"
                  className="absolute right-2 top-2 text-[11px] text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    save(list.filter((_, idx) => idx !== i));
                  }}
                >
                  Delete
                </button>
              )}
              {row.imageUrl ? (
                <img
                  src={fileSrc(row.imageUrl)}
                  alt=""
                  className={`mb-3 h-16 w-16 rounded-full object-cover ${onChange ? "cursor-pointer" : ""}`}
                  onClick={onChange ? (e) => { e.stopPropagation(); void pickImage((imageUrl) => { const next = [...list]; next[i] = { ...next[i], imageUrl }; save(next); }); } : undefined}
                />
              ) : onChange ? (
                <button
                  type="button"
                  className="mb-3 grid h-16 w-16 place-items-center rounded-full border border-dashed border-slate-300 text-[10px] text-slate-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    void pickImage((imageUrl) => {
                      const next = [...list];
                      next[i] = { ...next[i], imageUrl };
                      save(next);
                    });
                  }}
                >
                  Photo
                </button>
              ) : null}
              {(row.name || onChange) && (
                <LiveText
                  tag="p"
                  className="pr-12 text-sm font-semibold text-navy"
                  value={row.name}
                  placeholder="Student name"
                  onChange={onChange ? (name) => { const next = [...list]; next[i] = { ...next[i], name }; save(next); } : undefined}
                />
              )}
              <LiveText
                tag="blockquote"
                className="mt-1 text-sm text-slate-600"
                value={row.text}
                onChange={onChange ? (text) => { const next = [...list]; next[i] = { ...next[i], text }; save(next); } : undefined}
              />
            </div>
          ))}
        </div>
        {onChange && (
          <button
            type="button"
            className="mt-3 text-sm font-medium text-brand"
            onClick={(e) => {
              e.stopPropagation();
              save([...list, { name: "", text: "", imageUrl: "" }]);
            }}
          >
            Add testimonial
          </button>
        )}
      </div>
    );
  }
  if (section.type === "cta") {
    return (
      <div className="rounded-2xl bg-brand p-8 text-center text-white">
        <LiveText tag="h2" className="text-2xl font-bold" value={section.heading} placeholder="Ready to join?" onChange={edit?.("heading")} />
        <LiveText tag="p" className="mx-auto mt-2 max-w-lg text-sm text-sky-50" value={section.text} placeholder="Invite students to enrol" onChange={edit?.("text")} />
        {onChange ? (
          <div className="mt-5 space-y-2">
            <LiveText tag="span" className="inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand" value={section.buttonLabel} placeholder="Get started" onChange={edit?.("buttonLabel")} />
            <LiveText tag="p" className="text-xs text-sky-100" value={section.buttonUrl} placeholder="Optional link, e.g. /register" onChange={edit?.("buttonUrl")} />
          </div>
        ) : section.buttonUrl?.startsWith("http") ? (
          <a className="mt-5 inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand" href={section.buttonUrl} target="_blank" rel="noreferrer">
            {section.buttonLabel || "Get started"}
          </a>
        ) : (
          <Link
            className="mt-5 inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-brand"
            to={resolveSectionHref(slug, section.buttonUrl, isProductHost() && slug ? `/s/${slug}/register` : "/register")}
          >
            {section.buttonLabel || "Get started"}
          </Link>
        )}
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
      {onChange && <FormatBar section={section} onChange={onChange} />}
      <LiveText tag="h2" className={`${sizeClass(section.headingSize || section.textSize, "heading", "text-xl font-bold")} ${colorClass(section.headingColor, "text-navy")}`} value={section.heading} placeholder="Heading" onChange={edit?.("heading")} />
      <LiveText tag="p" className={`mt-2 whitespace-pre-wrap ${sizeClass(section.textSize, "text", "text-sm leading-6")} ${colorClass(section.textColor, "text-slate-600")}`} value={section.text} placeholder="Write here" onChange={edit?.("text")} />
    </div>
  );
}
