import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

export function CommsPage() {
  const { user } = useAuth();
  const notes = useApi<{ channel: string; title: string; status: string }[]>("/api/notifications");
  const anns = useApi<{ title: string; body: string }[]>("/api/announcements");
  const tpls = useApi<{ eventType: string; channel: string }[]>("/api/message-templates");
  const inbox = useApi<{ fromName: string; subject: string; status: string }[]>("/api/inbox");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("IN_APP");
  const [error, setError] = useState<string | null>(null);
  const canSend = user?.role === "OWNER" || user?.role === "FACULTY" || user?.role === "COUNSELOR" || user?.role === "PLACEMENT_HEAD";

  async function send() {
    setError(null);
    try {
      await createRecord("/api/announcements", { title, body });
      await api("/api/actions/notices/send", { method: "POST", body: JSON.stringify({ channel, title, body }) });
      setTitle("");
      setBody("");
      anns.reload();
      notes.reload();
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
          <div className="flex items-end">
            <PrimaryButton disabled={!title || !body} onClick={send}>
              Publish
            </PrimaryButton>
          </div>
        </FormGrid>
        <ErrorText error={error} />
      </Card>
      )}
      <Card title="Notifications">
        <Table
          columns={["Channel", "Title", "Status"]}
          rows={(notes.data ?? []).map((n) => [prettyLabel(n.channel), n.title, prettyLabel(n.status)])}
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
        <Card title="Templates">
          <ul className="text-sm">
            {(tpls.data ?? []).map((t, i) => (
              <li key={i}>
                {t.eventType} · {t.channel}
              </li>
            ))}
          </ul>
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
