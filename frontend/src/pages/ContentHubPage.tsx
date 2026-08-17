import { useState } from "react";
import { Link } from "react-router-dom";
import { createRecord } from "../ops";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Assessment = { id: string; title: string; kind: string; published: boolean };
type FreeMaterial = { id: string; title: string; materialType: string; url?: string; fileName?: string; published: boolean };

export function ContentHubPage() {
  const tests = useApi<Assessment[]>("/api/assessments");
  const materials = useApi<FreeMaterial[]>("/api/free-materials");
  const [tab, setTab] = useState<"tests" | "free">("tests");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [mType, setMType] = useState("DOCUMENT");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [q, setQ] = useState("");

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

  const filteredTests = (tests.data ?? []).filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Content</h1>
          <p className="text-sm text-slate-500">Test portal and free materials for visitors.</p>
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
            <Link to="/courses">
              <PrimaryButton>Go to course learning</PrimaryButton>
            </Link>
          }
        >
          <p className="mb-3 text-sm text-slate-500">Only published tests are shown here. Create online tests and assign them to courses.</p>
          <Field label="Search online tests" value={q} onChange={setQ} placeholder="Search online tests" />
          <div className="mt-4">
            <Table
              columns={["Test / Folder", "Kind", "Published"]}
              rows={filteredTests.map((t) => [t.title, t.kind, t.published ? "Yes" : "No"])}
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
              onChange={setMType}
              options={[
                { value: "DOCUMENT", label: "Document" },
                { value: "VIDEO", label: "Video (YouTube)" },
                { value: "TEST", label: "Test" },
              ]}
            />
            <Field label="URL" value={url} onChange={setUrl} />
            <Field label="File name" value={fileName} onChange={setFileName} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!title} onClick={addMaterial}>
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
    </div>
  );
}
