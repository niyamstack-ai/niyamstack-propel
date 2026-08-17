import { useState } from "react";
import { createRecord } from "../ops";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, useApi } from "../ui";

export function AnalyticsPage() {
  const dash = useApi<Record<string, unknown>>("/api/actions/dashboard");
  const tickets = useApi<{ subject: string; status: string; category: string }[]>("/api/tickets");
  const staff = useApi<{ fullName: string; role: string; email: string }[]>("/api/staff");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Analytics & admin</h1>
      <Card title="Raise support ticket">
        <FormGrid>
          <Field label="Subject" value={subject} onChange={setSubject} />
          <Field label="Details" value={body} onChange={setBody} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!subject}
              onClick={async () => {
                setError(null);
                try {
                  await createRecord("/api/tickets", {
                    raisedBy: "Staff",
                    category: "ADMIN",
                    subject,
                    body,
                    status: "OPEN",
                  });
                  setSubject("");
                  setBody("");
                  tickets.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save ticket
            </PrimaryButton>
          </div>
        </FormGrid>
        <ErrorText error={error} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Support tickets">
          <ul className="text-sm">
            {(tickets.data ?? []).map((t, i) => (
              <li key={i}>
                [{t.category}] {t.subject} — {t.status}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Staff directory">
          <ul className="text-sm">
            {(staff.data ?? []).map((s, i) => (
              <li key={i}>
                {s.fullName} · {s.role}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="KPI snapshot">
        <pre className="overflow-auto rounded-lg bg-mist p-3 text-xs">{JSON.stringify(dash.data, null, 2)}</pre>
      </Card>
    </div>
  );
}
