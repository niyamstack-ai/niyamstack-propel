import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { createRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, formatInr, Table, useApi } from "../ui";

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
  testsTotal?: number;
  couponsLive?: number;
  bannersLive?: number;
  websiteSessions?: number;
  buyNowClicks?: number;
  transactions?: number;
  revenue?: number;
  outstanding?: number;
  billed?: number;
  byCourse?: { name: string; collected: number; outstanding: number }[];
  byCounselor?: { name: string; collected: number; outstanding: number }[];
};

export function AnalyticsPage() {
  const [range, setRange] = useState("30");
  const dash = useApi<Dash>(`/api/actions/dashboard?days=${range}`);
  const tickets = useApi<{ subject: string; status: string; category: string }[]>("/api/tickets");
  const payments = useApi<{ gatewayRef: string; amount: number; method: string }[]>("/api/payments");
  const reports = useApi<{ id: string; name: string; dataset: string }[]>("/api/report-definitions");
  const faculty = useApi<{ fullName: string; batches: number; contentPublished: number; presentPct: number; graded: number }[]>(
    "/api/actions/faculty-performance",
  );
  const [reportName, setReportName] = useState("Students snapshot");
  const [dataset, setDataset] = useState("students");
  const [emailTo, setEmailTo] = useState("");
  const [runRows, setRunRows] = useState<{ columns: string[]; rows: string[][] } | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const d = dash.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Analytics</h1>
          <p className="text-sm text-slate-500">Collection %, outstanding fees, and website activity for the selected period.</p>
        </div>
        <select className="rounded-lg border border-line px-3 py-2 text-sm" value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
          <option value="0">All time</option>
        </select>
      </div>
      <ErrorText error={error} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Collection %" value={`${d?.collectionPct ?? 0}%`} />
        <Metric label="Outstanding" value={formatInr(d?.outstanding ?? d?.due ?? 0)} />
        <Metric label="Collected" value={formatInr(d?.collected ?? 0)} />
        <Metric label="Revenue" value={formatInr(d?.revenue ?? d?.collected ?? 0)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Website visits" value={d?.websiteSessions ?? 0} />
        <Metric label="Buy clicks" value={d?.buyNowClicks ?? 0} />
        <Metric label="Payments" value={d?.transactions ?? 0} />
        <Metric label="Billed" value={formatInr(d?.billed ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Course-wise">
          <Table
            empty="No fee invoices to split by course yet."
            columns={["Course", "Collected", "Outstanding"]}
            rows={(d?.byCourse ?? []).map((r) => [r.name, formatInr(r.collected), formatInr(r.outstanding)])}
          />
        </Card>
        <Card title="Counselor-wise">
          <Table
            empty="Convert a lead with a counsellor to see this split."
            columns={["Counsellor", "Collected", "Outstanding"]}
            rows={(d?.byCounselor ?? []).map((r) => [r.name, formatInr(r.collected), formatInr(r.outstanding)])}
          />
        </Card>
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
                    ["Collection %", d?.collectionPct ?? 0],
                    ["Outstanding", d?.outstanding ?? d?.due ?? 0],
                    ["Collected", d?.collected ?? 0],
                    ["Billed", d?.billed ?? 0],
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
            <li>Tests published: {d?.testsCreated ?? 0}/{d?.testsTotal ?? d?.testsCreated ?? 0}</li>
            <li>Live coupons: {d?.couponsLive ?? 0}</li>
            <li>Live banners: {d?.bannersLive ?? 0}</li>
          </ul>
        </Card>
      </div>

      <Card title="Report builder">
        <p className="mb-3 text-sm text-slate-500">Pick a dataset, save it, run it, and email it on a weekly schedule.</p>
        <FormGrid>
          <Field label="Report name" value={reportName} onChange={setReportName} />
          <Select
            label="Dataset"
            value={dataset}
            onChange={setDataset}
            options={[
              { value: "students", label: "Students" },
              { value: "invoices", label: "Invoices" },
              { value: "attendance", label: "Attendance" },
              { value: "applications", label: "Applications" },
            ]}
          />
          <Field label="Email to (schedule)" value={emailTo} onChange={setEmailTo} placeholder="owner@institute.com" />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!reportName}
              onClick={async () => {
                setError(null);
                try {
                  const saved = await api<{ id: string }>("/api/actions/reports", {
                    method: "POST",
                    body: JSON.stringify({ name: reportName, dataset, columnsCsv: "fullName,status" }),
                  });
                  reports.reload();
                  if (emailTo) {
                    await api(`/api/actions/reports/${saved.id}/schedule`, {
                      method: "POST",
                      body: JSON.stringify({ cadence: "WEEKLY", emailTo }),
                    });
                  }
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save report
            </PrimaryButton>
          </div>
        </FormGrid>
        <ul className="mt-3 space-y-2 text-sm">
          {(reports.data ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span>
                {r.name} ({r.dataset})
              </span>
              <PrimaryButton
                onClick={async () => {
                  setError(null);
                  try {
                    setRunRows(await api(`/api/actions/reports/${r.id}/run`, { method: "POST", body: "{}" }));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Run
              </PrimaryButton>
              <PrimaryButton
                onClick={async () => {
                  setError(null);
                  try {
                    await api(`/api/actions/reports/${r.id}/send`, { method: "POST", body: "{}" });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Email now
              </PrimaryButton>
            </li>
          ))}
        </ul>
        {runRows && (
          <Table
            columns={runRows.columns}
            rows={runRows.rows.map((row) => row)}
            empty="No rows."
          />
        )}
      </Card>

      <Card title="Faculty performance">
        {faculty.error ? <p className="text-sm text-slate-500">Not in this pack.</p> : null}
        <Table
          empty="No faculty rows yet."
          columns={["Faculty", "Batches", "Content", "Present %", "Graded"]}
          rows={(faculty.data ?? []).map((f) => [f.fullName, f.batches, f.contentPublished, `${f.presentPct}%`, f.graded])}
        />
      </Card>

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
