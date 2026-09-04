import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { hasGrowthTier } from "../packs";
import { Card, ErrorText, Table, formatInr, useApi } from "../ui";

type Hub = {
  days: number;
  modules: {
    crm: { inquiries: number; converted: number; conversionPct: number; topSource: string };
    fees: { collected: number; outstanding: number; collectionPct: number; overdueInstallments: number };
    academics: { students: number; batches: number; attendancePct: number; avgReadiness: number };
    placement: { placementPct: number; placed: number; avgPackageLpa: number; applications: number };
    people: { employees: number; payrollLastMonth: number; atRisk: number; openTickets: number };
  };
  alerts: { title: string; detail: string; path: string }[];
};

type Forecast = {
  avgMonthlyCollection: number;
  scheduledPipeline: number;
  series: { label: string; projectedCollection: number; scheduledDue: number; forecastTotal: number }[];
  history: { month: string; collected: number }[];
};

type Pnl = {
  days: number;
  revenue: number;
  payrollCost: number;
  commissionCost: number;
  totalCost: number;
  margin: number;
  marginPct: number;
};

export function IntelligencePage() {
  const { user } = useAuth();
  const growth = hasGrowthTier(user?.packageTier, user?.modules);
  const [range, setRange] = useState("30");
  const hub = useApi<Hub>(growth ? `/api/actions/intelligence/hub?days=${range}` : "");
  const forecast = useApi<Forecast>(growth ? "/api/actions/intelligence/forecast?months=3" : "");
  const pnl = useApi<Pnl>(growth ? `/api/actions/intelligence/pnl?days=${range}` : "");

  if (!growth) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-navy">Intelligence hub</h1>
        <Card title="Growth tier required">
          <p className="text-sm text-slate-600">
            Cross-module search, owner intelligence, revenue forecast, and institute P&L require the Growth catalog tier.
          </p>
        </Card>
      </div>
    );
  }

  const m = hub.data?.modules;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Intelligence hub</h1>
          <p className="text-sm text-slate-500">Cross-module view across admissions, fees, academics, placement, and people.</p>
        </div>
        <select className="rounded-lg border border-line px-3 py-2 text-sm" value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>
      <ErrorText error={hub.error || forecast.error || pnl.error} />

      {(hub.data?.alerts ?? []).length > 0 && (
        <Card title="Alerts">
          <ul className="space-y-2 text-sm">
            {hub.data!.alerts.map((a, i) => (
              <li key={i}>
                <Link className="font-medium text-brand hover:underline" to={a.path}>
                  {a.title}
                </Link>
                <span className="text-slate-500"> — {a.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {m && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ModuleCard
            title="Admissions"
            to="/crm"
            rows={[
              ["Leads", m.crm.inquiries],
              ["Converted", m.crm.converted],
              ["Conversion", `${m.crm.conversionPct}%`],
              ["Top source", m.crm.topSource],
            ]}
          />
          <ModuleCard
            title="Fees"
            to="/fees"
            rows={[
              ["Collected", formatInr(m.fees.collected)],
              ["Outstanding", formatInr(m.fees.outstanding)],
              ["Collection", `${m.fees.collectionPct}%`],
              ["Overdue installments", m.fees.overdueInstallments],
            ]}
          />
          <ModuleCard
            title="Academics"
            to="/academics"
            rows={[
              ["Students", m.academics.students],
              ["Batches", m.academics.batches],
              ["Attendance", `${m.academics.attendancePct}%`],
              ["Avg readiness", `${m.academics.avgReadiness}%`],
            ]}
          />
          <ModuleCard
            title="Placement"
            to="/placement"
            rows={[
              ["Placement rate", `${m.placement.placementPct}%`],
              ["Placed", m.placement.placed],
              ["Avg package", `${m.placement.avgPackageLpa} LPA`],
              ["Applications", m.placement.applications],
            ]}
          />
          <ModuleCard
            title="People / ESS"
            to="/ess"
            rows={[
              ["Employees", m.people.employees],
              ["Payroll last month", formatInr(m.people.payrollLastMonth)],
              ["At-risk students", m.people.atRisk],
              ["Open tickets", m.people.openTickets],
            ]}
          />
          {pnl.data && (
            <ModuleCard
              title="Institute P&L"
              to="/analytics"
              rows={[
                ["Revenue", formatInr(pnl.data.revenue)],
                ["Payroll + commission", formatInr(pnl.data.totalCost)],
                ["Margin", formatInr(pnl.data.margin)],
                ["Margin %", `${pnl.data.marginPct}%`],
              ]}
            />
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Revenue forecast (3 months)">
          {forecast.data ? (
            <>
              <p className="mb-3 text-sm text-slate-500">
                Avg monthly collection {formatInr(forecast.data.avgMonthlyCollection)} · Scheduled pipeline{" "}
                {formatInr(forecast.data.scheduledPipeline)}
              </p>
              <Table
                empty="No forecast data."
                columns={["Month", "Projected", "Scheduled due", "Forecast total"]}
                rows={(forecast.data.series ?? []).map((r) => [
                  r.label,
                  formatInr(r.projectedCollection),
                  formatInr(r.scheduledDue),
                  formatInr(r.forecastTotal),
                ])}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">Loading forecast…</p>
          )}
        </Card>
        <Card title="Recent collection history">
          <Table
            empty="No payment history yet."
            columns={["Month", "Collected"]}
            rows={(forecast.data?.history ?? []).map((h) => [h.month, formatInr(h.collected)])}
          />
          <Link className="mt-3 inline-block text-sm text-brand hover:underline" to="/analytics">
            Open detailed analytics
          </Link>
        </Card>
      </div>
    </div>
  );
}

function ModuleCard({ title, to, rows }: { title: string; to: string; rows: [string, string | number][] }) {
  return (
    <Link to={to} className="rounded-2xl border border-line bg-white p-4 hover:border-brand">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {rows.map(([label, value]) => (
          <li key={label} className="flex justify-between gap-2">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium text-navy">{value}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}
