import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Template = { id: string; eventType: string; channel: string; body?: string };

export function CommsPage() {
  const { user } = useAuth();
  const notes = useApi<{ channel: string; title: string; status: string; detail?: string }[]>("/api/notifications");
  const anns = useApi<{ title: string; body: string }[]>("/api/announcements");
  const tpls = useApi<Template[]>("/api/message-templates");
  const batches = useApi<{ id: string; name: string }[]>("/api/batches");
  const inbox = useApi<{ fromName: string; subject: string; status: string }[]>("/api/inbox");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("IN_APP");
  const [batchId, setBatchId] = useState("");
  const [editTpl, setEditTpl] = useState("");
  const [editBody, setEditBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const canSend = user?.role === "OWNER" || user?.role === "FACULTY" || user?.role === "COUNSELOR" || user?.role === "PLACEMENT_HEAD";

  async function send() {
    setError(null);
    setSendStatus(null);
    try {
      await createRecord("/api/announcements", { title, body, batchId: batchId || null });
      const out = await api<{ sent?: number; status?: string; detail?: string }>("/api/actions/notices/send", {
        method: "POST",
        body: JSON.stringify({ channel, title, body, batchId: batchId || undefined }),
      });
      setSendStatus(out.detail || `${prettyLabel(out.status)} · ${out.sent ?? 0} recipient(s)`);
      setTitle("");
      setBody("");
      anns.reload();
      notes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveTemplate() {
    if (!editTpl) return;
    setError(null);
    try {
      await api(`/api/message-templates/${editTpl}`, {
        method: "PUT",
        body: JSON.stringify({ body: editBody }),
      });
      tpls.reload();
      setSendStatus("Template saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Communication</h1>
      <p className="text-sm text-slate-500">WhatsApp and email go out when those keys are saved in Integrations. In-app notices stay on the student website.</p>
      {canSend && (
      <Card title="Send announcement">
        <FormGrid>
          <Field label="Title" value={title} onChange={setTitle} />
          <Field label="Message" value={body} onChange={setBody} />
          <Select
            label="Channel"
            value={channel}
            onChange={setChannel}
            options={[
              { value: "IN_APP", label: "On the student website" },
              { value: "EMAIL", label: "Email (sends when mail is connected)" },
              { value: "WHATSAPP", label: "WhatsApp (sends when WhatsApp is connected)" },
            ]}
          />
          <Select
            label="Batch (optional)"
            value={batchId}
            onChange={setBatchId}
            options={[{ value: "", label: "All students" }, ...(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))]}
          />
          <div className="flex items-end">
            <PrimaryButton disabled={!title || !body} onClick={() => void send()}>
              Publish
            </PrimaryButton>
          </div>
        </FormGrid>
        <ErrorText error={error} />
        {sendStatus && <p className="mt-2 text-sm text-emerald-700">{sendStatus}</p>}
      </Card>
      )}
      <Card title="Notifications">
        <Table
          columns={["Channel", "Title", "Status", "Delivery"]}
          rows={(notes.data ?? []).map((n) => [prettyLabel(n.channel), n.title, prettyLabel(n.status), n.detail || "—"])}
        />
      </Card>
      <Card title="Announcements">
        <ul className="text-sm">
          {(anns.data ?? []).map((a, i) => (
            <li key={i}>
              <span className="font-medium">{a.title}: </span>
              {a.body}
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Message templates">
          <p className="mb-2 text-sm text-slate-500">Used for fee reminders and alerts. Placeholders: {"{{name}}"}, {"{{amount}}"}, {"{{invoice}}"}.</p>
          <ul className="mb-3 space-y-2 text-sm">
            {(tpls.data ?? []).map((t) => (
              <li key={t.id}>
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => { setEditTpl(t.id); setEditBody(t.body || ""); }}>
                  {prettyLabel(t.eventType)} · {prettyLabel(t.channel)}
                </button>
              </li>
            ))}
          </ul>
          {editTpl && (
            <>
              <textarea className="min-h-20 w-full rounded-lg border border-line px-3 py-2 text-sm" value={editBody} onChange={(e) => setEditBody(e.target.value)} />
              <div className="mt-2">
                <PrimaryButton onClick={() => void saveTemplate()}>Save template</PrimaryButton>
              </div>
            </>
          )}
        </Card>
        <Card title="Inbox">
          <ul className="text-sm">
            {(inbox.data ?? []).map((m, i) => (
              <li key={i}>
                {m.fromName}: {m.subject} ({m.status})
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
