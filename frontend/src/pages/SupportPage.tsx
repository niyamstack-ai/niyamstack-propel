import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, TextArea, useApi } from "../ui";

type Ticket = {
  id: string;
  raisedBy?: string;
  category?: string;
  subject?: string;
  body?: string;
  status?: string;
  createdAt?: string;
};

export function SupportPage() {
  const { user } = useAuth();
  const tickets = useApi<Ticket[]>("/api/actions/support/hub");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("GENERAL");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const owner = user?.role === "OWNER" || user?.role === "ACCOUNTANT";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Support</h1>
        <p className="text-sm text-slate-500">Raise tickets for product help, billing, or operations issues.</p>
      </div>
      <ErrorText error={error} />
      <Card title="New ticket">
        <FormGrid>
          <Field label="Subject" value={subject} onChange={setSubject} placeholder="Cannot export fees" />
          <Select
            label="Category"
            value={category}
            onChange={setCategory}
            allowEmpty={false}
            options={[
              { value: "GENERAL", label: "General" },
              { value: "BILLING", label: "Billing" },
              { value: "TECHNICAL", label: "Technical" },
              { value: "DATA", label: "Data / compliance" },
            ]}
          />
        </FormGrid>
        <TextArea label="Details" value={body} onChange={setBody} rows={3} />
        <div className="mt-3">
          <PrimaryButton
            disabled={!subject.trim() || !body.trim()}
            onClick={async () => {
              setError(null);
              try {
                await api("/api/actions/support/tickets", {
                  method: "POST",
                  body: JSON.stringify({ subject, category, body }),
                });
                setSubject("");
                setBody("");
                tickets.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Submit ticket
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Your tickets">
        <Table
          empty="No tickets yet."
          columns={["Subject", "Category", "Status", "Raised by", ""]}
          rows={(tickets.data ?? []).map((t) => [
            t.subject ?? "—",
            t.category ?? "—",
            t.status ?? "—",
            t.raisedBy ?? "—",
            owner && t.status === "OPEN" ? (
              <LinkButton
                key={t.id}
                onClick={async () => {
                  setError(null);
                  try {
                    await api(`/api/actions/support/tickets/${t.id}`, {
                      method: "POST",
                      body: JSON.stringify({ status: "RESOLVED" }),
                    });
                    tickets.reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Resolve
              </LinkButton>
            ) : (
              "—"
            ),
          ])}
        />
        <Link className="mt-3 inline-block text-sm text-brand hover:underline" to="/help">
          Open help center
        </Link>
      </Card>
    </div>
  );
}
