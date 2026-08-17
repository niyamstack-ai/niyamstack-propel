import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
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
  const notes = useApi<{ note: string; stage: string }[]>("/api/counseling-notes");
  const forms = useApi<{ applicantName: string; status: string }[]>("/api/admission-forms");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("WALKIN");
  const [noteInq, setNoteInq] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function capture() {
    setError(null);
    try {
      await createRecord("/api/inquiries", {
        fullName: name,
        phone,
        email: email || `${name.replaceAll(" ", ".").toLowerCase()}@lead.local`,
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

  async function convert(id: string) {
    setError(null);
    try {
      await api(`/api/actions/inquiries/${id}/convert`, { method: "POST", body: JSON.stringify({}) });
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
        <h1 className="text-2xl font-bold text-navy">CRM & admissions</h1>
        <p className="text-sm text-slate-500">Capture leads, counsel, and convert to enrolled students.</p>
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
          <PrimaryButton disabled={!name} onClick={capture}>
            Save lead
          </PrimaryButton>
        </div>
        <ErrorText error={error} />
      </Card>
      <Card title="Counseling pipeline">
        <Table
          columns={["Name", "Phone", "Source", "Stage", "Action"]}
          rows={(inquiries.data ?? []).map((i) => [
            i.fullName,
            i.phone,
            i.source,
            i.stage,
            i.stage === "CONVERTED" ? (
              "Enrolled"
            ) : (
              <LinkButton onClick={() => convert(i.id)}>Convert to student</LinkButton>
            ),
          ])}
        />
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
                <span className="font-medium">{n.stage}: </span>
                {n.note}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Online admission forms">
          <ul className="space-y-2 text-sm">
            {(forms.data ?? []).map((f, i) => (
              <li key={i}>
                {f.applicantName} — {f.status}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
