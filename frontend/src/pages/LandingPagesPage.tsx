import { useState } from "react";
import { createRecord, updateRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, TextArea, useApi } from "../ui";

type Landing = {
  id: string;
  name: string;
  pageKind: string;
  slug?: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  courseId?: string;
  published: boolean;
  viewsCount?: number;
  leadsCount?: number;
};

type Course = { id: string; name: string };

export function LandingPagesPage() {
  const pages = useApi<Landing[]>("/api/landing-pages");
  const courses = useApi<Course[]>("/api/courses");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [kind, setKind] = useState("WEBINAR");
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("Register now");
  const [courseId, setCourseId] = useState("");
  const [slug, setSlug] = useState("");

  function start(k: string) {
    setKind(k);
    setStep("form");
    setName(k === "WEBINAR" ? "New webinar signup" : k === "COURSE" ? "New course offer" : "New enquiry form");
  }

  async function create() {
    setError(null);
    try {
      await createRecord("/api/landing-pages", {
        name,
        pageKind: kind,
        slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
        headline,
        body,
        ctaLabel: cta,
        courseId: courseId || null,
        published: false,
        viewsCount: 0,
        leadsCount: 0,
      });
      setStep("pick");
      setName("");
      setHeadline("");
      setBody("");
      pages.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function publish(p: Landing) {
    try {
      await updateRecord(`/api/landing-pages/${p.id}`, { ...p, published: !p.published });
      pages.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Landing Pages</h1>
        <p className="text-sm text-slate-500">Create landing pages for webinars, courses, and forms.</p>
      </div>
      <ErrorText error={error} />

      {step === "pick" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Webinar Page">
            <ul className="mb-3 list-disc space-y-1 pl-4 text-sm text-slate-600">
              <li>Promote a paid webinar with discount</li>
              <li>Promote a free workshop</li>
            </ul>
            <PrimaryButton onClick={() => start("WEBINAR")}>Create Webinar Page</PrimaryButton>
          </Card>
          <Card title="Course Page">
            <ul className="mb-3 list-disc space-y-1 pl-4 text-sm text-slate-600">
              <li>Promote a beginners course</li>
              <li>Announce offers on course purchase</li>
            </ul>
            <PrimaryButton onClick={() => start("COURSE")}>Create Course Page</PrimaryButton>
          </Card>
          <Card title="Form Page">
            <ul className="mb-3 list-disc space-y-1 pl-4 text-sm text-slate-600">
              <li>Create a survey</li>
              <li>Collect coaching feedback</li>
            </ul>
            <PrimaryButton onClick={() => start("FORM")}>Create Form Page</PrimaryButton>
          </Card>
        </div>
      )}

      {step === "form" && (
        <Card title={`Create ${kind.toLowerCase()} landing page`} action={<button onClick={() => setStep("pick")}>Back</button>}>
          <FormGrid>
            <Field label="Page name" value={name} onChange={setName} />
            <Field label="Link ending (optional)" value={slug} onChange={setSlug} placeholder="auto from name, e.g. jee-webinar" />
            <Field label="Headline students see" value={headline} onChange={setHeadline} />
            <TextArea label="Page text" value={body} onChange={setBody} placeholder="Date, speaker, fee, what they get" />
            <Field label="Button text" value={cta} onChange={setCta} />
            <Select
              label="Linked course (optional)"
              value={courseId}
              onChange={setCourseId}
              options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!name} onClick={create}>
              Save landing page
            </PrimaryButton>
          </div>
        </Card>
      )}

      <Card title={`Your landing pages (${pages.data?.length ?? 0})`}>
        <Table
          empty="No landing pages yet."
          columns={["Name", "Type", "Views", "Leads", "Status", ""]}
          rows={(pages.data ?? []).map((p) => [
            p.name,
            prettyLabel(p.pageKind),
            String(p.viewsCount ?? 0),
            String(p.leadsCount ?? 0),
            p.published ? "Published" : "Draft",
            <button className="text-brand hover:underline" type="button" onClick={() => publish(p)} key={p.id}>
              {p.published ? "Unpublish" : "Publish"}
            </button>,
          ])}
        />
      </Card>
    </div>
  );
}
