import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createRecord, updateRecord } from "../ops";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Table, useApi } from "../ui";

type Page = {
  id: string;
  title: string;
  slug: string;
  pageType: string;
  body?: string;
  metaTitle?: string;
  metaDescription?: string;
  previewImageUrl?: string;
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
};

const DEFAULT_PAGES = [
  { title: "Home", slug: "home", pageType: "HOME" },
  { title: "About Us", slug: "about-us", pageType: "ABOUT" },
  { title: "Courses", slug: "courses", pageType: "COURSES" },
  { title: "Free Tests", slug: "free-tests", pageType: "FREE_TESTS" },
  { title: "Free Content", slug: "free-content", pageType: "FREE_CONTENT" },
  { title: "Testimonials", slug: "testimonials", pageType: "TESTIMONIALS" },
  { title: "Contact Us", slug: "contact-us", pageType: "CONTACT" },
  { title: "Policies", slug: "policies", pageType: "POLICIES" },
];

export function WebsitePage() {
  const pages = useApi<Page[]>("/api/website-pages");
  const org = useApi<Org>("/api/organization");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Page | null>(null);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [tab, setTab] = useState<"pages" | "domain">("pages");

  const sorted = useMemo(
    () => [...(pages.data ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [pages.data]
  );

  async function seedDefaults() {
    setError(null);
    try {
      for (let i = 0; i < DEFAULT_PAGES.length; i++) {
        const d = DEFAULT_PAGES[i];
        if ((pages.data ?? []).some((p) => p.slug === d.slug)) continue;
        await createRecord("/api/website-pages", {
          ...d,
          body: "",
          metaTitle: `${d.title} | ${org.data?.name || "Institute"}`,
          metaDescription: `${d.title} page for ${org.data?.name || "your institute"}`,
          hidden: false,
          sortOrder: i,
        });
      }
      pages.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openInfo(p: Page) {
    setSelected(p);
    setMetaTitle(p.metaTitle || "");
    setMetaDescription(p.metaDescription || "");
    setPreviewImageUrl(p.previewImageUrl || "");
  }

  async function saveInfo() {
    if (!selected) return;
    setError(null);
    try {
      await updateRecord(`/api/website-pages/${selected.id}`, {
        ...selected,
        metaTitle,
        metaDescription,
        previewImageUrl,
      });
      setSelected(null);
      pages.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleHidden(p: Page) {
    setError(null);
    try {
      await updateRecord(`/api/website-pages/${p.id}`, { ...p, hidden: !p.hidden });
      pages.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveDomain() {
    if (!org.data) return;
    setError(null);
    try {
      await updateRecord("/api/organization", {
        ...org.data,
        websiteUrl: websiteUrl || org.data.websiteUrl,
        customDomain: customDomain || org.data.customDomain,
        websitePublished: true,
      });
      org.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Website</h1>
          <p className="text-sm text-slate-500">Student website: published courses, purchase, login, and study.</p>
        </div>
        <div className="flex gap-2">
          <button
            className={`rounded-full px-3 py-1.5 text-sm ${tab === "pages" ? "bg-navy text-white" : "bg-mist"}`}
            onClick={() => setTab("pages")}
          >
            Manage Pages
          </button>
          <button
            className={`rounded-full px-3 py-1.5 text-sm ${tab === "domain" ? "bg-navy text-white" : "bg-mist"}`}
            onClick={() => setTab("domain")}
          >
            Domain Integration
          </button>
        </div>
      </div>
      <ErrorText error={error} />

      {tab === "pages" && (
        <>
          <Card
            title="Manage your website pages"
            action={
              <PrimaryButton onClick={seedDefaults}>
                {(pages.data?.length ?? 0) === 0 ? "Create default pages" : "Add missing defaults"}
              </PrimaryButton>
            }
          >
            <p className="mb-4 text-sm text-slate-500">You can add, hide, or edit SEO for all pages.</p>
            <Table
              columns={["Page", "Slug", "Status", "Actions"]}
              rows={sorted.map((p) => [
                p.title,
                p.slug,
                p.hidden ? "Hidden" : "Visible",
                <span className="flex flex-wrap gap-2" key={p.id}>
                  <button className="text-brand hover:underline" type="button" onClick={() => openInfo(p)}>
                    Page Info
                  </button>
                  <button className="text-brand hover:underline" type="button" onClick={() => toggleHidden(p)}>
                    {p.hidden ? "Unhide" : "Hide"}
                  </button>
                </span>,
              ])}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className="rounded-full border border-line px-4 py-2 text-sm"
                to={`/s/${org.data?.slug || "aarohan"}`}
                target="_blank"
                rel="noreferrer"
              >
                Open student website
              </Link>
              <PrimaryButton
                onClick={async () => {
                  if (!org.data) return;
                  await updateRecord("/api/organization", { ...org.data, websitePublished: true, websiteUrl: `/s/${org.data.slug || "aarohan"}` });
                  org.reload();
                }}
              >
                Publish website
              </PrimaryButton>
            </div>
          </Card>

          {selected && (
            <Card title={`Page Info — ${selected.title}`} action={<button onClick={() => setSelected(null)}>Close</button>}>
              <FormGrid>
                <Field label="Page title / meta title" value={metaTitle} onChange={setMetaTitle} placeholder="Add meta title tags here" />
                <Field label="Meta description" value={metaDescription} onChange={setMetaDescription} placeholder="Add meta description here" />
                <Field label="Preview image URL (social)" value={previewImageUrl} onChange={setPreviewImageUrl} />
              </FormGrid>
              <div className="mt-3">
                <PrimaryButton onClick={saveInfo}>Save Details</PrimaryButton>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === "domain" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Share your website">
            <p className="mb-3 text-sm text-slate-500">Students can download and access your courses from this link.</p>
            <p className="text-sm font-medium">
              {org.data?.slug ? `${window.location.origin}/s/${org.data.slug}` : "Publish to get a student website URL"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {org.data?.websitePublished ? "Website marked live" : "Website not published yet"}
            </p>
            <div className="mt-4">
              <Link to={`/s/${org.data?.slug || "aarohan"}`} className="text-sm text-brand hover:underline" target="_blank">
                Open student website →
              </Link>
            </div>
          </Card>
          <Card title="Domain integration">
            <FormGrid>
              <Field
                label="Website URL"
                value={websiteUrl || org.data?.websiteUrl || ""}
                onChange={setWebsiteUrl}
                placeholder="https://your-institute.propel.app"
              />
              <Field
                label="Custom domain"
                value={customDomain || org.data?.customDomain || ""}
                onChange={setCustomDomain}
                placeholder="www.yourinstitute.com"
              />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton onClick={saveDomain}>Save & request domain</PrimaryButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
