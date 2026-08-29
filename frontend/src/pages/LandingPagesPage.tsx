import { useState } from "react";
import { createRecord, updateRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, TextArea, useApi } from "../ui";
import { FormFieldsEditor, parseFormFields, serializeFormFields, type FormField } from "../formFields";

type Landing = {
  id: string;
  name: string;
  pageKind: string;
  slug?: string;
  headline?: string;
  body?: string;
  ctaLabel?: string;
  courseId?: string;
  formJson?: string;
  published: boolean;
  viewsCount?: number;
  leadsCount?: number;
};

type Course = { id: string; name: string };

export function LandingPagesPage() {
  const pages = useApi<Landing[]>("/api/landing-pages");
  const courses = useApi<Course[]>("/api/courses");
  const org = useApi<{ slug?: string }>("/api/organization");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [editing, setEditing] = useState<Landing | null>(null);
  const [kind, setKind] = useState("WEBINAR");
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("Register now");
  const [courseId, setCourseId] = useState("");
  const [slug, setSlug] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);

  function start(k: string) {
    setKind(k);
    setEditing(null);
    setStep("form");
    setName(k === "WEBINAR" ? "New webinar signup" : k === "COURSE" ? "New course offer" : "New enquiry form");
    setHeadline("");
    setBody("");
    setCta(k === "FORM" ? "Submit" : "Register now");
    setCourseId("");
    setSlug("");
    setFields([]);
  }

  function edit(p: Landing) {
    setEditing(p);
    setKind(p.pageKind || "FORM");
    setName(p.name);
    setHeadline(p.headline || "");
    setBody(p.body || "");
    setCta(p.ctaLabel || "Register now");
    setCourseId(p.courseId || "");
    setSlug(p.slug || "");
    setFields(parseFormFields(p.formJson));
    setStep("form");
  }

  async function save() {
    setError(null);
    try {
      const payload = {
        name,
        pageKind: kind,
        slug: slug || name.toLowerCase().replace(/\s+/g, "-"),
        headline,
        body,
        ctaLabel: cta,
        courseId: courseId || null,
        formJson: serializeFormFields(fields),
        published: editing?.published ?? false,
        viewsCount: editing?.viewsCount ?? 0,
        leadsCount: editing?.leadsCount ?? 0,
      };
      if (editing) {
        await updateRecord(`/api/landing-pages/${editing.id}`, { ...editing, ...payload });
      } else {
        await createRecord("/api/landing-pages", payload);
      }
      setStep("pick");
      setEditing(null);
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
        <p className="text-sm text-slate-500">Create landing pages for webinars, courses, and custom enquiry forms.</p>
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
              <li>Build your own enquiry questions</li>
              <li>Scholarship application or survey</li>
            </ul>
            <PrimaryButton onClick={() => start("FORM")}>Create Form Page</PrimaryButton>
          </Card>
        </div>
      )}

      {step === "form" && (
        <Card title={`${editing ? "Edit" : "Create"} ${kind.toLowerCase()} landing page`} action={<button onClick={() => setStep("pick")}>Back</button>}>
          <FormGrid>
            <Field label="Page name" value={name} onChange={setName} />
            <Field label="Link ending (optional)" value={slug} onChange={setSlug} placeholder="auto from name, e.g. scholarship-form" />
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
          <FormFieldsEditor value={fields} onChange={setFields} />
          <div className="mt-3">
            <PrimaryButton disabled={!name} onClick={() => void save()}>
              {editing ? "Save changes" : "Save landing page"}
            </PrimaryButton>
          </div>
        </Card>
      )}

      <Card title={`Your landing pages (${pages.data?.length ?? 0})`}>
        <Table
          empty="No landing pages yet."
          columns={["Name", "Type", "Link", "Views", "Leads", "Status", ""]}
          rows={(pages.data ?? []).map((p) => [
            p.name,
            prettyLabel(p.pageKind),
            p.published && org.data?.slug && p.slug ? (
              <a key={p.id} className="text-brand hover:underline" href={`/s/${org.data.slug}/l/${p.slug}`} target="_blank" rel="noreferrer">
                /s/{org.data.slug}/l/{p.slug}
              </a>
            ) : (
              "Publish to share"
            ),
            String(p.viewsCount ?? 0),
            String(p.leadsCount ?? 0),
            p.published ? "Published" : "Draft",
            <span key={`${p.id}-actions`} className="flex flex-wrap gap-3">
              <button className="text-brand hover:underline" type="button" onClick={() => edit(p)}>
                Edit
              </button>
              <button className="text-brand hover:underline" type="button" onClick={() => void publish(p)}>
                {p.published ? "Unpublish" : "Publish"}
              </button>
            </span>,
          ])}
        />
      </Card>
    </div>
  );
}
