import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { hasEnterpriseTier } from "../packs";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, formatInr, useApi } from "../ui";

type Hub = {
  indiaDataResidency?: boolean;
  dataMode?: string;
  defaultRoyaltyPct?: number;
  centers?: number;
  openTickets?: number;
  apiTokens?: number;
  staffGoals?: number;
  successionPlans?: number;
  openPoshCases?: number;
  studyPlans?: number;
  centerPnl?: CenterPnl;
};

type CenterPnl = {
  days?: number;
  totalRevenue?: number;
  totalRoyalty?: number;
  unassignedRevenue?: number;
  centers?: { center: string; revenue: number; royaltyPct: number; royalty: number; retained: number; centerId: string }[];
};

type Token = { id: string; name: string; prefix: string; scopes?: string; active?: boolean };
type Goal = { id: string; title: string; cycleLabel?: string; progressValue?: number; targetValue?: number; status?: string };
type Succession = { id: string; roleTitle: string; readiness?: string };
type Posh = { id: string; caseCode: string; severity?: string; status?: string; summary?: string };
type Employee = { id: string; fullName: string };
type Student = { id: string; fullName: string };

export function DepthPage() {
  const { user } = useAuth();
  const allowed = user?.role === "OWNER" || user?.role === "ACCOUNTANT";
  const enterprise = hasEnterpriseTier(user?.packageTier, user?.modules);
  const hub = useApi<Hub>(allowed ? "/api/actions/depth/hub" : "");
  const tokens = useApi<Token[]>(allowed ? "/api/actions/api-tokens" : "");
  const goals = useApi<Goal[]>(allowed ? "/api/actions/hr/goals" : "");
  const succession = useApi<Succession[]>(allowed ? "/api/actions/hr/succession" : "");
  const posh = useApi<Posh[]>(user?.role === "OWNER" ? "/api/actions/hr/posh" : "");
  const employees = useApi<Employee[]>(allowed ? "/api/employees" : "");
  const students = useApi<Student[]>(enterprise ? "/api/students" : "");
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [poshSummary, setPoshSummary] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studyOut, setStudyOut] = useState("");
  const [royalty, setRoyalty] = useState("0.05");

  if (!allowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-navy">Scale depth</h1>
        <Card title="Owner access required">
          <p className="text-sm text-slate-600">Center P&L, franchise royalty, API tokens, and HR enterprise tools are owner/accountant only.</p>
        </Card>
      </div>
    );
  }

  const pnl = hub.data?.centerPnl;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Scale depth</h1>
        <p className="text-sm text-slate-500">Multi-center P&L, franchise royalty, public API, HR enterprise, billing upgrade, and study plans.</p>
      </div>
      <ErrorText error={error} />
      {(hub.error || employees.error || students.error) && (
        <ErrorText error={[hub.error, employees.error, students.error].filter(Boolean).join(" · ")} />
      )}

      {hub.loading && !hub.data ? (
        <Card title="Loading">
          <p className="text-sm text-slate-500">Loading scale depth…</p>
        </Card>
      ) : null}

      {hub.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Centers" value={hub.data.centers ?? 0} />
          <Stat label="API tokens" value={hub.data.apiTokens ?? 0} />
          <Stat label="Open tickets" value={hub.data.openTickets ?? 0} to="/support" />
          <Stat label="Data mode" value={hub.data.dataMode ?? "SHARED"} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Residency & data mode">
          <p className="mb-3 text-sm text-slate-500">
            India residency: {hub.data?.indiaDataResidency === false ? "Off" : "On"} · Royalty default:{" "}
            {((Number(hub.data?.defaultRoyaltyPct) || 0) * 100).toFixed(1)}%
          </p>
          <FormGrid>
            <Field label="Default royalty (0–1)" value={royalty} onChange={setRoyalty} />
          </FormGrid>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hub.data?.indiaDataResidency !== false}
              onChange={async (e) => {
                setError(null);
                try {
                  await api("/api/actions/depth/org", {
                    method: "POST",
                    body: JSON.stringify({
                      indiaDataResidency: e.target.checked,
                      dataMode: hub.data?.dataMode ?? "SHARED",
                      defaultRoyaltyPct: Number(royalty) || 0,
                    }),
                  });
                  hub.reload();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
            Keep data residency in India
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton
              onClick={async () => {
                setError(null);
                try {
                  await api("/api/actions/depth/org", {
                    method: "POST",
                    body: JSON.stringify({
                      indiaDataResidency: hub.data?.indiaDataResidency !== false,
                      dataMode: hub.data?.dataMode ?? "SHARED",
                      defaultRoyaltyPct: Number(royalty) || 0,
                    }),
                  });
                  hub.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save residency & royalty
            </PrimaryButton>
            <LinkButton
              onClick={async () => {
                setError(null);
                try {
                  await api("/api/actions/depth/org", {
                    method: "POST",
                    body: JSON.stringify({
                      dataMode: hub.data?.dataMode === "CENTER_SCOPED" ? "SHARED" : "CENTER_SCOPED",
                    }),
                  });
                  hub.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Toggle center-scoped mode
            </LinkButton>
            <LinkButton
              onClick={async () => {
                setError(null);
                try {
                  await api("/api/actions/billing/upgrade-request", {
                    method: "POST",
                    body: JSON.stringify({ tier: "ENTERPRISE", note: "Please upgrade billing" }),
                  });
                  alert("Upgrade request sent to support.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Request billing upgrade
            </LinkButton>
          </div>
        </Card>

        <Card title="Center-wise P&L (90d)">
          <p className="mb-2 text-sm text-slate-500">
            Revenue {formatInr(pnl?.totalRevenue ?? 0)} · Royalty {formatInr(pnl?.totalRoyalty ?? 0)} · Unassigned{" "}
            {formatInr(pnl?.unassignedRevenue ?? 0)}
          </p>
          <Table
            empty="No center revenue yet."
            columns={["Center", "Revenue", "Royalty %", "Royalty", "Retained"]}
            rows={(pnl?.centers ?? []).map((c) => [
              c.center,
              formatInr(c.revenue),
              `${((c.royaltyPct ?? 0) * 100).toFixed(1)}%`,
              formatInr(c.royalty),
              formatInr(c.retained),
            ])}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Public API tokens">
          <Table
            empty="No tokens yet."
            columns={["Name", "Prefix", "Scopes"]}
            rows={(tokens.data ?? []).map((t) => [t.name, t.prefix, t.scopes ?? "—"])}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton
              onClick={async () => {
                setError(null);
                try {
                  const res = await api<{ token?: string }>("/api/actions/api-tokens", {
                    method: "POST",
                    body: JSON.stringify({ name: "Integration token" }),
                  });
                  setNewToken(res.token ?? null);
                  tokens.reload();
                  hub.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Create token
            </PrimaryButton>
            <LinkButton
              onClick={async () => {
                setError(null);
                try {
                  await api("/api/actions/webhooks/test", { method: "POST", body: "{}" });
                  alert("Webhook test fired.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Test webhook
            </LinkButton>
          </div>
          {newToken && <p className="mt-2 break-all text-xs text-amber-700">Copy now: {newToken}</p>}
          <p className="mt-2 text-xs text-slate-500">Use Authorization: Bearer &lt;token&gt; on /api/public/v1/students and /courses.</p>
        </Card>

        <Card title="HR enterprise">
          <FormGrid>
            <Select
              label="Employee"
              value={employeeId}
              onChange={setEmployeeId}
              options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.fullName }))}
            />
            <Field label="OKR title" value={goalTitle} onChange={setGoalTitle} />
            <Field label="Succession role" value={roleTitle} onChange={setRoleTitle} />
            <Field label="POSH summary" value={poshSummary} onChange={setPoshSummary} />
          </FormGrid>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton
              disabled={!employeeId || !goalTitle}
              onClick={async () => {
                setError(null);
                try {
                  await api("/api/actions/hr/goals", {
                    method: "POST",
                    body: JSON.stringify({ employeeId, title: goalTitle, cycleLabel: "FY" }),
                  });
                  setGoalTitle("");
                  goals.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Add goal
            </PrimaryButton>
            <PrimaryButton
              disabled={!roleTitle}
              onClick={async () => {
                setError(null);
                try {
                  await api("/api/actions/hr/succession", {
                    method: "POST",
                    body: JSON.stringify({ roleTitle, incumbentEmployeeId: employeeId || undefined }),
                  });
                  setRoleTitle("");
                  succession.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Add succession
            </PrimaryButton>
            {user?.role === "OWNER" && (
              <PrimaryButton
                disabled={!poshSummary}
                onClick={async () => {
                  setError(null);
                  try {
                    await api("/api/actions/hr/posh", {
                      method: "POST",
                      body: JSON.stringify({ summary: poshSummary, severity: "MEDIUM" }),
                    });
                    setPoshSummary("");
                    posh.reload();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Open POSH case
              </PrimaryButton>
            )}
          </div>
          <Table empty="No goals." columns={["Goal", "Progress", "Status"]} rows={(goals.data ?? []).map((g) => [g.title, `${g.progressValue ?? 0}/${g.targetValue ?? 100}`, g.status ?? "—"])} />
          <Table empty="No succession plans." columns={["Role", "Readiness"]} rows={(succession.data ?? []).map((s) => [s.roleTitle, s.readiness ?? "—"])} />
          {user?.role === "OWNER" && (
            <Table empty="No POSH cases." columns={["Code", "Severity", "Status"]} rows={(posh.data ?? []).map((p) => [p.caseCode, p.severity ?? "—", p.status ?? "—"])} />
          )}
        </Card>
      </div>

      {enterprise && (
        <Card title="AI study plan">
          <FormGrid>
            <Select
              label="Student"
              value={studentId}
              onChange={setStudentId}
              options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
            />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton
              disabled={!studentId}
              onClick={async () => {
              setError(null);
              try {
                const res = await api<{ planJson?: string }>("/api/actions/ai/study-plan", {
                  method: "POST",
                  body: JSON.stringify({ studentId, focus: "placement readiness" }),
                });
                setStudyOut(res.planJson ?? "Created.");
                hub.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Generate study plan
          </PrimaryButton>
          </div>
          {studyOut && <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-mist p-3 text-xs">{studyOut}</pre>}
        </Card>
      )}

      <p className="text-sm text-slate-500">
        Also see <Link className="text-brand hover:underline" to="/compliance">Compliance</Link>,{" "}
        <Link className="text-brand hover:underline" to="/enterprise">Enterprise</Link>,{" "}
        <Link className="text-brand hover:underline" to="/support">Support</Link>, and{" "}
        <Link className="text-brand hover:underline" to="/help">Help</Link>.
      </p>
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: string | number; to?: string }) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="rounded-2xl border border-line bg-white p-4 hover:border-brand">
        {body}
      </Link>
    );
  }
  return <div className="rounded-2xl border border-line bg-white p-4">{body}</div>;
}
