import { useState } from "react";
import { Link } from "react-router-dom";
import { createRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, formatInr, useApi } from "../ui";

type Dash = {
  inquiries: number;
  converted: number;
  students: number;
  due: number;
  collected: number;
  collectionPct: number;
  applications: number;
  offers: number;
  coursesPublished?: number;
  coursesTotal?: number;
  landingPages?: number;
  campaigns?: number;
  testsCreated?: number;
  couponsLive?: number;
  bannersLive?: number;
  websiteSessions?: number;
  buyNowClicks?: number;
  transactions?: number;
  revenue?: number;
};

export function AnalyticsPage() {
  const [range, setRange] = useState("30");
  const dash = useApi<Dash>(`/api/actions/dashboard?days=${range}`);
  const tickets = useApi<{ subject: string; status: string; category: string }[]>("/api/tickets");
  const payments = useApi<{ gatewayRef: string; amount: number; method: string }[]>("/api/payments");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const d = dash.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Analytics</h1>
          <p className="text-sm text-slate-500">Fees collected and website activity for the selected period. Student counts stay all-time.</p>
        </div>
        <select className="rounded-lg border border-line px-3 py-2 text-sm" value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
          <option value="0">All time</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Website visits" value={d?.websiteSessions ?? 0} />
        <Metric label="Buy clicks" value={d?.buyNowClicks ?? 0} />
        <Metric label="Payments" value={d?.transactions ?? 0} />
        <Metric label="Revenue" value={formatInr(d?.revenue ?? d?.collected ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Revenue in this period">
          <p className="text-3xl font-bold text-navy">{formatInr(d?.collected ?? 0)}</p>
          <p className="mt-1 text-sm text-slate-500">{range === "0" ? "All captured payments" : `Captured payments in the last ${range} days`}</p>
        </Card>
        <Card title="Quick Actions">
          <ul className="space-y-2 text-sm">
            <li>
              <Link className="text-brand hover:underline" to="/fees">
                View Transactions
              </Link>
            </li>
            <li>
              <Link className="text-brand hover:underline" to="/courses">
                Add student to a course
              </Link>
            </li>
            <li>
              <button
                className="text-brand hover:underline"
                type="button"
                onClick={() => {
                  const rows = [
                    ["Visits", d?.websiteSessions ?? 0],
                    ["Buy clicks", d?.buyNowClicks ?? 0],
                    ["Payments", d?.transactions ?? 0],
                    ["Revenue", d?.revenue ?? d?.collected ?? 0],
                    ["Students", d?.students ?? 0],
                  ];
                  const csv = rows.map((r) => r.join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `institute-report-${range}d.csv`;
                  a.click();
                }}
              >
                Download CSV
              </button>
            </li>
          </ul>
        </Card>
        <Card title="Growth inventory">
          <ul className="space-y-1 text-sm">
            <li>
              Courses published: {d?.coursesPublished ?? 0}/{d?.coursesTotal ?? 0}
            </li>
            <li>Landing pages: {d?.landingPages ?? 0}</li>
            <li>Campaigns: {d?.campaigns ?? 0}</li>
            <li>Tests: {d?.testsCreated ?? 0}</li>
            <li>Live coupons: {d?.couponsLive ?? 0}</li>
            <li>Live banners: {d?.bannersLive ?? 0}</li>
          </ul>
        </Card>
      </div>

      <Card title="Recent transactions">
        <ul className="text-sm">
          {(payments.data ?? []).slice(0, 10).map((p) => (
            <li key={p.gatewayRef}>
              {p.gatewayRef} · {p.method} · {formatInr(p.amount)}
            </li>
          ))}
          {(payments.data?.length ?? 0) === 0 && <li className="text-slate-500">No transactions yet.</li>}
        </ul>
      </Card>

      <Card title="Ask Niyamstack for help">
        <p className="mb-3 text-sm text-slate-500">Tickets here go to your institute support queue. For product help email support@niyamstack.com.</p>
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

      <Card title="Your tickets">
        <ul className="text-sm">
          {(tickets.data ?? []).length === 0 && <li className="text-slate-500">No tickets yet.</li>}
          {(tickets.data ?? []).map((t, i) => (
            <li key={i}>
              {t.subject} — {prettyLabel(t.status)}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}
