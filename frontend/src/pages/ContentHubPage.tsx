import { useState } from "react";
import { Link } from "react-router-dom";
import { createRecord, deleteRecord } from "../ops";
import { Card, ErrorText, Field, FileUpload, FormGrid, LinkButton, PrimaryButton, Select, Table, useApi } from "../ui";
import { QuizBuilder, type AssessmentRow } from "./courseContent";

type FreeMaterial = { id: string; title: string; materialType: string; url?: string; fileName?: string; published: boolean };

export function ContentHubPage() {
  const tests = useApi<AssessmentRow[]>("/api/assessments");
  const courses = useApi<{ id: string; name: string }[]>("/api/courses");
  const materials = useApi<FreeMaterial[]>("/api/free-materials");
  const [tab, setTab] = useState<"tests" | "free">("tests");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [mType, setMType] = useState("DOCUMENT");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [q, setQ] = useState("");
  const [editTest, setEditTest] = useState<AssessmentRow | null>(null);
  const [creating, setCreating] = useState(false);

  async function addMaterial() {
    setError(null);
    try {
      await createRecord("/api/free-materials", {
        title,
        materialType: mType,
        url,
        fileName: fileName || title,
        published: true,
      });
      setTitle("");
      setUrl("");
      setFileName("");
      materials.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeTest(row: AssessmentRow) {
    if (!window.confirm(`Delete test “${row.title}”?`)) return;
    setError(null);
    try {
      await deleteRecord(`/api/assessments/${row.id}`);
      tests.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function courseName(id?: string) {
    if (!id) return "Unassigned";
    return (courses.data ?? []).find((c) => c.id === id)?.name || "Course";
  }

  const filteredTests = (tests.data ?? []).filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Content</h1>
          <p className="text-sm text-slate-500">Tests and free notes students see on your website. Upload a file or paste a YouTube link.</p>
        </div>
        <div className="flex gap-2">
          <button className={`rounded-full px-3 py-1.5 text-sm ${tab === "tests" ? "bg-navy text-white" : "bg-mist"}`} onClick={() => setTab("tests")}>
            Test Portal
          </button>
          <button className={`rounded-full px-3 py-1.5 text-sm ${tab === "free" ? "bg-navy text-white" : "bg-mist"}`} onClick={() => setTab("free")}>
            Free Material
          </button>
        </div>
      </div>
      <ErrorText error={error} />

      {tab === "tests" && (
        <Card
          title={`Test Portal (${tests.data?.length ?? 0})`}
          action={
            <div className="flex flex-wrap gap-2">
              <PrimaryButton onClick={() => setCreating(true)}>Create test</PrimaryButton>
              <Link to="/courses">
                <PrimaryButton>Go to course learning</PrimaryButton>
              </Link>
            </div>
          }
        >
          <p className="mb-3 text-sm text-slate-500">Open a test to change its name, questions, and settings. Create tests here or inside a course.</p>
          <Field label="Search online tests" value={q} onChange={setQ} placeholder="Search online tests" />
          <div className="mt-4">
            <Table
              empty="No tests yet. Create a test here or from a course."
              columns={["Test", "Kind", "Course", "Published", ""]}
              rows={filteredTests.map((t) => [
                <button type="button" className="text-left font-medium text-navy hover:text-brand" onClick={() => setEditTest(t)}>
                  {t.title}
                </button>,
                t.kind,
                t.courseId ? (
                  <Link className="text-brand hover:underline" to={`/courses/${t.courseId}`}>
                    {courseName(t.courseId)}
                  </Link>
                ) : (
                  "Unassigned"
                ),
                t.published ? "Yes" : "No",
                <span className="flex flex-wrap gap-3">
                  <LinkButton onClick={() => setEditTest(t)}>Edit</LinkButton>
                  <button type="button" className="text-sm font-medium text-red-600 hover:underline" onClick={() => void removeTest(t)}>
                    Delete
                  </button>
                </span>,
              ])}
            />
          </div>
        </Card>
      )}

      {tab === "free" && (
        <Card title="Free Material — add / view free material for visitors">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line p-3 text-sm">
              <p className="font-semibold">Document</p>
              <p className="text-slate-500">.doc, .docx, .pdf, .png, .jpg, .csv</p>
            </div>
            <div className="rounded-xl border border-line p-3 text-sm">
              <p className="font-semibold">Video</p>
              <p className="text-slate-500">Supported link: YouTube URL</p>
            </div>
            <div className="rounded-xl border border-line p-3 text-sm">
              <p className="font-semibold">Tests</p>
              <p className="text-slate-500">Import free test from LMS assessments</p>
            </div>
          </div>
          <FormGrid>
            <Field label="Title" value={title} onChange={setTitle} />
            <Select
              label="Type"
              value={mType}
              onChange={(v) => {
                setMType(v);
                if (v !== "TEST") setUrl("");
              }}
              options={[
                { value: "DOCUMENT", label: "Document" },
                { value: "VIDEO", label: "Video (YouTube)" },
                { value: "TEST", label: "Test" },
              ]}
            />
            {mType === "TEST" ? (
              <Select
                label="LMS assessment"
                value={url}
                onChange={(v) => {
                  setUrl(v);
                  const picked = (tests.data ?? []).find((t) => t.id === v);
                  if (picked && !title.trim()) setTitle(picked.title);
                  setFileName(picked?.title || "");
                }}
                options={(tests.data ?? []).map((t) => ({ value: t.id, label: t.title }))}
              />
            ) : (
              <>
                <FileUpload label="Upload file" value={url} onChange={(v) => { setUrl(v); setFileName(v.split("/").pop() || fileName); }} accept="image/*,.pdf,.doc,.docx,.mp4,video/*,.zip" />
                <Field label="Or YouTube / file URL" value={url} onChange={setUrl} />
              </>
            )}
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!title || (mType === "TEST" && !url)} onClick={addMaterial}>
              Add free material
            </PrimaryButton>
          </div>
          <div className="mt-4">
            <Table
              columns={["Title", "Type", "URL / File"]}
              rows={(materials.data ?? []).map((m) => [m.title, m.materialType, m.url || m.fileName || "—"])}
            />
          </div>
        </Card>
      )}

      {creating && (
        <QuizBuilder
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            tests.reload();
          }}
        />
      )}
      {editTest && (
        <QuizBuilder
          courseId={editTest.courseId}
          folderId={editTest.parentFolderId ?? null}
          existing={editTest}
          onClose={() => setEditTest(null)}
          onSaved={() => {
            setEditTest(null);
            tests.reload();
          }}
        />
      )}
    </div>
  );
}
