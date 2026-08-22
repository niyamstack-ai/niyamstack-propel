import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, useApi } from "../ui";

type Inquiry = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
};

export function CrmPage() {
  const inquiries = useApi<Inquiry[]>("/api/inquiries");
  const courses = useApi<{ id: string; name: string }[]>("/api/courses");
  const batches = useApi<{ id: string; name: string }[]>("/api/batches");
  const notes = useApi<{ note: string; stage: string }[]>("/api/counseling-notes");
  const forms = useApi<{ applicantName: string; status: string }[]>("/api/admission-forms");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("WALKIN");
  const [noteInq, setNoteInq] = useState("");
  const [note, setNote] = useState("");
  const [convertId, setConvertId] = useState("");
  const [convertCourse, setConvertCourse] = useState("");
  const [convertBatch, setConvertBatch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function capture() {
    setError(null);
    try {
      await createRecord("/api/inquiries", {
        fullName: name,
        phone,
        email: email || undefined,
        source,
        stage: "NEW",
      });
      setName("");
      setPhone("");
      setEmail("");
      inquiries.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function convert() {
    if (!convertId) return;
    if (!window.confirm("Enrol this lead as a student?")) return;
    setError(null);
    try {
      await api(`/api/actions/inquiries/${convertId}/convert`, {
        method: "POST",
        body: JSON.stringify({ courseId: convertCourse || undefined, batchId: convertBatch || undefined }),
      });
      setConvertId("");
      inquiries.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addNote() {
    setError(null);
    try {
      await createRecord("/api/counseling-notes", { inquiryId: noteInq, note, stage: "COUNSELING" });
      setNote("");
      notes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Admissions</h1>
        <p className="text-sm text-slate-500">Walk-ins and website leads. Enrol them as students when they join.</p>
      </div>
      <Card title="Capture inquiry">
        <FormGrid>
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Phone" value={phone} onChange={setPhone} />
          <Field label="Email" value={email} onChange={setEmail} />
          <Select
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: "WALKIN", label: "Walk-in" },
              { value: "WEB", label: "Website" },
              { value: "REFERRAL", label: "Referral" },
              { value: "CAMPAIGN", label: "Campaign" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!name || !phone} onClick={capture}>
            Save lead
          </PrimaryButton>
        </div>
        <ErrorText error={error} />
      </Card>
      <Card title="Leads">
        <Table
          empty="No leads yet. Add a walk-in above."
          columns={["Name", "Phone", "Came from", "Status", ""]}
          rows={(inquiries.data ?? []).map((i) => [
            i.fullName,
            i.phone,
            prettyLabel(i.source),
            prettyLabel(i.stage),
            i.stage === "CONVERTED" ? (
              "Enrolled"
            ) : (
              <LinkButton onClick={() => setConvertId(i.id)}>Enrol as student</LinkButton>
            ),
          ])}
        />
        {convertId && (
          <div className="mt-4 rounded-xl bg-mist p-3">
            <p className="mb-2 text-sm font-medium text-navy">Choose course and batch, then enrol</p>
            <FormGrid>
              <Select label="Course" value={convertCourse} onChange={setConvertCourse} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
              <Select label="Batch" value={convertBatch} onChange={setConvertBatch} options={(batches.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
              <div className="flex items-end gap-2">
                <PrimaryButton onClick={() => void convert()}>Enrol</PrimaryButton>
                <button type="button" className="text-sm text-slate-500" onClick={() => setConvertId("")}>
                  Cancel
                </button>
              </div>
            </FormGrid>
          </div>
        )}
      </Card>
      <Card title="Add counseling note">
        <FormGrid>
          <Select
            label="Inquiry"
            value={noteInq}
            onChange={setNoteInq}
            options={(inquiries.data ?? []).map((i) => ({ value: i.id, label: i.fullName }))}
          />
          <Field label="Note" value={note} onChange={setNote} />
          <div className="flex items-end">
            <PrimaryButton disabled={!noteInq || !note} onClick={addNote}>
              Save note
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Counseling notes">
          <ul className="space-y-2 text-sm">
            {(notes.data ?? []).map((n, i) => (
              <li key={i}>
                <span className="font-medium">{prettyLabel(n.stage)}: </span>
                {n.note}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Online admission forms">
          <ul className="space-y-2 text-sm">
            {(forms.data ?? []).map((f, i) => (
              <li key={i}>
                {f.applicantName} — {prettyLabel(f.status)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
