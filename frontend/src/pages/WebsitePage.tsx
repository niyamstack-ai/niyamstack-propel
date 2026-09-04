import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  HelpCircle,
  Image as ImageIcon,
  LayoutTemplate,
  Megaphone,
  Phone,
  Quote,
  Sparkles,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../auth";
import { createRecord, deleteRecord, updateRecord } from "../ops";
import { ErrorText, Field, PrimaryButton, formatInr, useApi } from "../ui";
import { SectionView } from "../PageSections";
import { fileSrc } from "../api";
import { cleanHost, studentPreviewPath, studentPublicUrl } from "../siteHost";
import {
  BLOCKS,
  newSection,
  parseSections,
  serializeSections,
  starterSections,
  type SectionType,
  type SiteSection,
} from "../websiteSections";

type Page = {
  id: string;
  title: string;
  slug: string;
  pageType: string;
  body?: string;
  hidden: boolean;
  sortOrder: number;
};

type Org = {
  name: string;
  slug?: string;
  websiteUrl?: string;
  customDomain?: string;
  websitePublished?: boolean;
  logoUrl?: string;
  settingsJson?: string;
};

type Course = {
  id: string;
  name: string;
  fees: number;
  published?: boolean;
  description?: string;
  thumbnailUrl?: string;
};

const HOST_TARGET = "sites.niyamstack.com";
const DEFAULT_PAGES = [
  { title: "Home", slug: "home", pageType: "HOME" },
  { title: "About Us", slug: "about-us", pageType: "ABOUT" },
  { title: "Courses", slug: "courses", pageType: "COURSES" },
  { title: "Contact Us", slug: "contact-us", pageType: "CONTACT" },
  { title: "Testimonials", slug: "testimonials", pageType: "TESTIMONIALS" },
  { title: "Policies", slug: "policies", pageType: "POLICIES" },
];

const ICONS: Record<SectionType, LucideIcon> = {
  hero: LayoutTemplate,
  text: Type,
  image: ImageIcon,
  features: Sparkles,
  courses: BookOpen,
  cta: Megaphone,
  testimonials: Quote,
  video: Video,
  faq: HelpCircle,
  contact: Phone,
};

export function WebsitePage() {
  const { user } = useAuth();
  const demoLocked = user?.accessStatus === "DEMO";
  const pages = useApi<Page[]>("/api/website-pages");
  const org = useApi<Org>("/api/organization");
  const courses = useApi<Course[]>("/api/courses");
  const [error, setError] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [sections, setSections] = useState<SiteSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [picked, setPicked] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [customDomain, setCustomDomain] = useState("");
  const [copied, setCopied] = useState(false);
  const seeding = useRef(false);
  const saveTimer = useRef<number>(0);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const sorted = useMemo(
    () => [...(pages.data ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [pages.data]
  );
  const current = sorted.find((p) => p.id === pageId) || sorted[0] || null;
  const previewPath = studentPreviewPath(org.data?.slug);
  const siteLive = org.data?.websitePublished === true;
  const liveUrl = siteLive ? studentPublicUrl(org.data) : `${typeof window !== "undefined" ? window.location.origin : ""}${previewPath}`;
  const host = cleanHost(customDomain);
  const institute = org.data?.name || "your institute";
  const liveCourses = (courses.data ?? []).filter((c) => c.published !== false).slice(0, 4);

  useEffect(() => {
    if (org.data) setCustomDomain(org.data.customDomain || "");
  }, [org.data]);

  useEffect(() => {
    if (demoLocked || !pages.data || pages.data.length > 0 || seeding.current) return;
    seeding.current = true;
    void seedDefaults();
  }, [pages.data, demoLocked]);

  useEffect(() => {
    if (!current) return;
    if (dirty && pageId === current.id) return;
    setPageId(current.id);
    const parsed = parseSections(current.body);
    setSections(parsed.length ? parsed : starterSections(current.pageType, institute));
    setPicked(null);
    setDirty(!parsed.length);
    setStatus(parsed.length ? "saved" : "unsaved");
  }, [current?.id, current?.body, institute]);

  function patch(next: SiteSection[]) {
    setSections(next);
    setDirty(true);
    setStatus("unsaved");
  }

  async function seedDefaults() {
    try {
      for (let i = 0; i < DEFAULT_PAGES.length; i++) {
        const d = DEFAULT_PAGES[i];
        if ((pages.data ?? []).some((p) => p.slug === d.slug)) continue;
        await createRecord("/api/website-pages", {
          ...d,
          body: serializeSections(starterSections(d.pageType, institute)),
          hidden: false,
          sortOrder: i,
        });
      }
      pages.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function savePage(): Promise<boolean> {
    if (!current) return true;
    setStatus("saving");
    try {
      await updateRecord(`/api/website-pages/${current.id}`, {
        ...current,
        body: serializeSections(sectionsRef.current),
        hidden: false,
      });
      setDirty(false);
      setStatus("saved");
      return true;
    } catch (e) {
      setError((e as Error).message);
      setStatus("unsaved");
      return false;
    }
  }

  useEffect(() => {
    if (demoLocked || !dirty || !current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void savePage(), 900);
    return () => window.clearTimeout(saveTimer.current);
  }, [sections, dirty, current?.id, demoLocked]);

  async function publish() {
    if (!org.data) return;
    setError(null);
    try {
      await savePage();
      await updateRecord("/api/organization", {
        ...org.data,
        websitePublished: true,
        websiteUrl: org.data.websiteUrl || previewPath,
      });
      org.reload();
      setShareOpen(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveDomain() {
    if (!org.data) return;
    setError(null);
    try {
      const domain = cleanHost(customDomain);
      const previous = (() => {
        try {
          return JSON.parse(org.data.settingsJson || "{}") as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      await updateRecord("/api/organization", {
        ...org.data,
        customDomain: domain,
        websiteUrl: domain ? `https://${domain}` : previewPath,
        settingsJson: JSON.stringify({ ...previous, domain: { hostTarget: HOST_TARGET, status: domain ? "PENDING" : "" } }),
      });
      org.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function addBlock(type: SectionType) {
    const block = newSection(type, institute);
    patch([...sections, block]);
    setPicked(block.id);
  }

  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [row] = next.splice(index, 1);
    next.splice(to, 0, row);
    patch(next);
  }

  async function switchPage(id: string) {
    if (dirty) {
      const ok = await savePage();
      if (!ok) return;
    }
    setDirty(false);
    setPageId(id);
  }

  async function removePage(page: Page) {
    if (page.slug === "home" || page.pageType === "HOME") {
      setError("Keep the Home page. Hide other tabs by deleting them.");
      return;
    }
    if (!window.confirm(`Delete the ${page.title} page?`)) return;
    setError(null);
    try {
      if (dirty) await savePage();
      await deleteRecord(`/api/website-pages/${page.id}`);
      setPageId(null);
      setPicked(null);
      pages.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copyLiveUrl() {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy the link. Select and copy it manually.");
    }
  }

  const catalog = (
    <div className="grid gap-3 sm:grid-cols-2">
      {liveCourses.length === 0 && <p className="text-sm text-slate-500">Publish a course and it will show here.</p>}
      {liveCourses.map((c) => (
        <div key={c.id} className="overflow-hidden rounded-2xl border border-line bg-white">
          {c.thumbnailUrl && <img src={fileSrc(c.thumbnailUrl)} alt="" className="h-28 w-full object-cover" />}
          <div className="p-4">
            <p className="font-semibold text-navy">{c.name}</p>
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{c.description}</p>
            <p className="mt-2 text-sm font-bold text-navy">{formatInr(c.fees)}</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-svh flex-col bg-[#eef2f7]">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2.5">
        <Link to="/" className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-mist">
          ← Back
        </Link>
        <p className="font-semibold text-navy">{institute}</p>
        <nav className="flex min-w-0 flex-1 flex-wrap gap-1">
          {sorted.map((p) => (
            <span key={p.id} className="inline-flex items-center">
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${current?.id === p.id ? "bg-navy text-white" : "text-slate-600 hover:bg-mist"}`}
                onClick={() => void switchPage(p.id)}
              >
                {p.title}
              </button>
              {p.slug !== "home" && p.pageType !== "HOME" && (
                <button
                  type="button"
                  className="ml-0.5 rounded-full px-1.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title={`Delete ${p.title}`}
                  onClick={() => void removePage(p)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </nav>
        <p className="text-xs text-slate-400">
          {demoLocked ? "Demo — subscribe to save" : status === "saving" ? "Saving…" : status === "unsaved" ? "Editing" : "Saved"}
        </p>
        <button type="button" className="rounded-full border border-line px-3 py-1.5 text-sm" onClick={() => setShareOpen(true)}>
          {siteLive ? "Share website" : "Preview link"}
        </button>
        <PrimaryButton disabled={demoLocked} onClick={() => void publish()}>
          Publish
        </PrimaryButton>
      </header>
      {error && (
        <div className="px-4 py-2">
          <ErrorText error={error} />
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[104px_minmax(0,1fr)]">
        <aside className="overflow-x-auto overflow-y-auto border-b border-line bg-white p-2 md:border-b-0 md:border-r">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Add</p>
          <div className="grid gap-1.5">
            {BLOCKS.map((block) => {
              const Icon = ICONS[block.type];
              return (
                <button
                  key={block.type}
                  type="button"
                  title={block.hint}
                  className="flex flex-col items-center gap-1 rounded-xl border border-line px-1 py-2 text-center hover:border-brand hover:bg-mist"
                  onClick={() => addBlock(block.type)}
                >
                  <Icon className="h-5 w-5 text-navy" />
                  <span className="text-[11px] font-medium leading-tight text-navy">{block.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-h-0 overflow-auto p-6">
          <div className="mx-auto min-h-full max-w-4xl rounded-2xl bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2">
                {org.data?.logoUrl ? (
                  <img src={fileSrc(org.data.logoUrl)} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy text-xs font-bold text-white">
                    {(institute[0] || "I").toUpperCase()}
                  </span>
                )}
                <p className="font-bold text-navy">{institute}</p>
              </div>
              <div className="hidden gap-3 text-sm text-slate-500 sm:flex">
                {sorted.slice(0, 5).map((p) => (
                  <span key={p.id} className={p.id === current?.id ? "font-medium text-navy" : ""}>
                    {p.title}
                  </span>
                ))}
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-400">Login (preview)</span>
              </div>
            </header>
            <div className="space-y-6 p-6">
              {sections.length === 0 && (
                <button
                  type="button"
                  className="grid h-48 w-full place-items-center rounded-2xl border-2 border-dashed border-slate-300 text-sm text-slate-500"
                  onClick={() => addBlock("hero")}
                >
                  Click a block on the left to start this page
                </button>
              )}
              {sections.map((section, index) => (
                <div
                  key={section.id}
                  className={`group relative rounded-2xl ${picked === section.id ? "ring-2 ring-brand" : "hover:ring-1 hover:ring-slate-200"}`}
                  onClick={() => setPicked(section.id)}
                >
                  <div className="absolute -top-3 right-3 z-10 flex gap-1">
                    <button type="button" className="rounded bg-white px-2 py-0.5 text-[11px] shadow" onClick={() => move(index, -1)}>
                      Up
                    </button>
                    <button type="button" className="rounded bg-white px-2 py-0.5 text-[11px] shadow" onClick={() => move(index, 1)}>
                      Down
                    </button>
                    <button
                      type="button"
                      className="rounded bg-white px-2 py-0.5 text-[11px] text-red-600 shadow"
                      onClick={() => {
                        patch(sections.filter((s) => s.id !== section.id));
                        setPicked(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <SectionView
                    section={section}
                    catalog={catalog}
                    onChange={(change) =>
                      patch(sections.map((s) => (s.id === section.id ? { ...s, ...change } : s)))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy">{siteLive ? "Share your website" : "Preview (not live yet)"}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {siteLive
                ? "This is the student site. Send it on WhatsApp if you do not have a domain yet."
                : "This link is a draft preview. Click Publish before you send it to students. Until then they see that the site is not live."}
            </p>
            <p className="mt-3 break-all rounded-lg bg-mist px-3 py-2 font-mono text-sm">{liveUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton onClick={() => void copyLiveUrl()}>{copied ? "Copied" : "Copy link"}</PrimaryButton>
              <button
                type="button"
                className="rounded-full border border-line px-4 py-2 text-sm"
                onClick={() => window.open(liveUrl, "_blank", "noopener,noreferrer")}
              >
                {siteLive ? "Open website" : "Open draft"}
              </button>
            </div>
            <p className="mt-5 text-sm font-medium text-navy">Already have a domain?</p>
            <p className="mt-1 text-sm text-slate-600">
              On GoDaddy or Hostinger, point it here. We do not buy the domain for you.
            </p>
            <div className="mt-3">
              <Field label="Your domain" value={customDomain} onChange={setCustomDomain} placeholder="yourdomain.com" />
            </div>
            {host && (
              <p className="mt-2 text-xs text-slate-500">
                {host.startsWith("www.") ? (
                  <>CNAME {host} → {HOST_TARGET}</>
                ) : (
                  <>
                    CNAME www → {HOST_TARGET}
                    <br />
                    CNAME {host} → {HOST_TARGET} (or ALIAS/ANAME at apex)
                  </>
                )}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-full border border-line px-4 py-2 text-sm" onClick={() => setShareOpen(false)}>
                Close
              </button>
              <button type="button" className="rounded-full bg-navy px-4 py-2 text-sm text-white" onClick={() => void saveDomain()}>
                Save domain
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
