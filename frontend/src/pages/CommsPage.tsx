import { useState } from "react";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
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
      await createRecord("/api/notifications", { channel, audience: "STUDENTS", title, body, status: "QUEUED" });
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
              { value: "IN_APP", label: "In-app" },
              { value: "EMAIL", label: "Email (demo unless mail is live)" },
              { value: "WHATSAPP", label: "WhatsApp (demo unless Cloud API is live)" },
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
          rows={(notes.data ?? []).map((n) => [n.channel, n.title, n.status])}
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
