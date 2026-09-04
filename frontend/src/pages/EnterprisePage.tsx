import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { hasEnterpriseTier } from "../packs";
import { pendingOffline, flushOffline } from "../offline";
import { createRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, TextArea, useApi } from "../ui";

type Hub = {
  packageTier?: string;
  aiEnabled?: boolean;
  workflowsActive?: number;
  scormPackages?: number;
  scheduledReports?: number;
  pendingApprovals?: number;
  accreditation?: Accreditation;
  learningOutcomes?: Outcome[];
  tools?: { id: string; label: string; endpoint: string }[];
};

type Accreditation = {
  folders?: number;
  evidenceTotal?: number;
  draft?: number;
  submitted?: number;
  approved?: number;
  byFramework?: { framework: string; evidence: number; submitted: number }[];
};

type Outcome = { course: string; activities: number; completed: number; completionPct: number };

type Workflow = {
  id: string;
  name: string;
  triggerType: string;
  active?: boolean;
  steps?: { step: number; role: string; action: string; label: string }[];
};

type AiStatus = { enabled?: boolean; tools?: { id: string; label: string; endpoint: string }[] };

const TRIGGERS = [
  { value: "DISCOUNT", label: "Discount" },
  { value: "FEE_WAIVER", label: "Fee waiver" },
  { value: "ADMISSION", label: "Admission" },
  { value: "OFFER", label: "Offer" },
  { value: "ACCREDITATION", label: "Accreditation" },
];

const ROLES = [
  { value: "OWNER", label: "Owner" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "FACULTY", label: "Faculty" },
];

export function EnterprisePage() {
  const { user } = useAuth();
  const enterprise = hasEnterpriseTier(user?.packageTier, user?.modules);
  const hub = useApi<Hub>(enterprise ? "/api/actions/enterprise/hub" : "");
  const workflows = useApi<Workflow[]>(enterprise ? "/api/actions/enterprise/workflows" : "");
  const ai = useApi<AiStatus>(enterprise ? "/api/actions/enterprise/ai" : "");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("FEE_WAIVER");
  const [stepRole, setStepRole] = useState("OWNER");
  const [stepLabel, setStepLabel] = useState("Owner approval");
  const [extraSteps, setExtraSteps] = useState<{ role: string; label: string }[]>([]);
  const [coachAnswer, setCoachAnswer] = useState("");
  const [coachQuestion, setCoachQuestion] = useState("How should we improve learning outcomes this term?");
  const [syncResult, setSyncResult] = useState<string | null>(null);

  if (!enterprise) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-navy">Enterprise hub</h1>
        <Card title="Enterprise tier required">
          <p className="text-sm text-slate-600">
            AI suite, workflow builder v2, SCORM/LTI packages, accreditation dashboard, learning outcomes, and offline sync
            require the Enterprise catalog tier.
          </p>
          <Link className="mt-3 inline-block text-sm text-brand hover:underline" to="/intelligence">
            Open Growth intelligence hub
          </Link>
        </Card>
      </div>
    );
  }

  const acc = hub.data?.accreditation;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Enterprise hub</h1>
        <p className="text-sm text-slate-500">
          AI tools, multi-step workflows, accreditation, SCORM/LTI, learning outcomes, and offline sync.
        </p>
      </div>

      <ErrorText error={error} />

      {hub.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active workflows" value={hub.data.workflowsActive ?? 0} />
          <StatCard label="SCORM packages" value={hub.data.scormPackages ?? 0} to="/lms" />
          <StatCard label="Pending approvals" value={hub.data.pendingApprovals ?? 0} to="/academics" />
          <StatCard label="Scheduled reports" value={hub.data.scheduledReports ?? 0} to="/analytics" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Workflow builder v2">
          <Table
            empty="No workflows yet."
            columns={["Name", "Trigger", "Steps", ""]}
            rows={(workflows.data ?? []).map((w) => [
              w.name,
              prettyLabel(w.triggerType),
              w.steps?.length ?? 1,
              <LinkButton
                key={w.id}
                onClick={async () => {
                  setError(null);
                  try {
                    const preview = await api<{ simulatedSteps?: Workflow["steps"] }>(
                      `/api/actions/enterprise/workflows/${w.id}/preview`,
                    );
                    alert(
                      (preview.simulatedSteps ?? [])
                        .map((s) => `Step ${s.step}: ${s.label || s.action} (${s.role})`)
                        .join("\n") || "No steps configured.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Preview
              </LinkButton>,
            ])}
          />
          <FormGrid>
            <Field label="Workflow name" value={name} onChange={setName} placeholder="Fee waiver chain" />
            <Select label="Trigger" value={triggerType} onChange={setTriggerType} allowEmpty={false} options={TRIGGERS} />
            <Select label="First step role" value={stepRole} onChange={setStepRole} allowEmpty={false} options={ROLES} />
            <Field label="Step label" value={stepLabel} onChange={setStepLabel} placeholder="Owner approval" />
          </FormGrid>
          {extraSteps.map((s, i) => (
            <FormGrid key={i}>
              <Select
                label={`Step ${i + 2} role`}
                value={s.role}
                onChange={(v) => setExtraSteps((rows) => rows.map((r, j) => (j === i ? { ...r, role: v } : r)))}
                allowEmpty={false}
                options={ROLES}
              />
              <Field
                label={`Step ${i + 2} label`}
                value={s.label}
                onChange={(v) => setExtraSteps((rows) => rows.map((r, j) => (j === i ? { ...r, label: v } : r)))}
              />
            </FormGrid>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkButton onClick={() => setExtraSteps((rows) => [...rows, { role: "OWNER", label: `Step ${rows.length + 2}` }])}>
              Add step
            </LinkButton>
            <PrimaryButton
              disabled={!name}
              onClick={async () => {
                setError(null);
                try {
                  const steps = [
                    { step: 1, role: stepRole, action: "APPROVE", label: stepLabel },
                    ...extraSteps.map((s, i) => ({ step: i + 2, role: s.role, action: "APPROVE", label: s.label || `Step ${i + 2}` })),
                  ];
                  await createRecord("/api/actions/enterprise/workflows", {
                    name,
                    triggerType,
                    active: true,
                    steps,
                  });
                  setName("");
                  setExtraSteps([]);
                  workflows.reload();
                  hub.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save multi-step workflow
            </PrimaryButton>
          </div>
          <Link className="mt-3 inline-block text-sm text-brand hover:underline" to="/academics">
            Manage approval requests in Academics
          </Link>
        </Card>

        <Card title="Accreditation dashboard">
          {acc ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                <span className="text-slate-500">Folders</span>
                <span className="font-medium">{acc.folders ?? 0}</span>
                <span className="text-slate-500">Evidence total</span>
                <span className="font-medium">{acc.evidenceTotal ?? 0}</span>
                <span className="text-slate-500">Draft / submitted / approved</span>
                <span className="font-medium">
                  {acc.draft ?? 0} / {acc.submitted ?? 0} / {acc.approved ?? 0}
                </span>
              </div>
              <Table
                empty="No framework data yet."
                columns={["Framework", "Evidence", "Submitted"]}
                rows={(acc.byFramework ?? []).map((r) => [r.framework, r.evidence, r.submitted])}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500">Loading accreditation…</p>
          )}
          <Link className="mt-3 inline-block text-sm text-brand hover:underline" to="/academics">
            Open accreditation evidence
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="AI suite">
          <p className="mb-3 text-sm text-slate-500">
            OpenAI {ai.data?.enabled || hub.data?.aiEnabled ? "connected" : "not configured"} — set API key in Integrations.
          </p>
          <TextArea label="Coach question" value={coachQuestion} onChange={setCoachQuestion} rows={2} />
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton
              onClick={async () => {
                setError(null);
                try {
                  const res = await api<{ answer: string }>("/api/actions/ai/coach", {
                    method: "POST",
                    body: JSON.stringify({ question: coachQuestion }),
                  });
                  setCoachAnswer(res.answer);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Ask coach
            </PrimaryButton>
            <LinkButton
              onClick={async () => {
                setError(null);
                try {
                  const res = await api<{ suggestion?: string }>("/api/actions/ai/resume", {
                    method: "POST",
                    body: JSON.stringify({ content: "Improve this resume for a Java developer role." }),
                  });
                  setCoachAnswer(res.suggestion ?? "No suggestions returned.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Resume tips
            </LinkButton>
            <LinkButton
              onClick={async () => {
                setError(null);
                try {
                  const res = await api<{ path?: string; matches?: string[] }>("/api/actions/ai/career", {
                    method: "POST",
                    body: JSON.stringify({ question: "Suggest a career path after Java full stack." }),
                  });
                  setCoachAnswer([res.path, ...(res.matches ?? [])].filter(Boolean).join("\n") || "No paths returned.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Career paths
            </LinkButton>
          </div>
          {coachAnswer && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{coachAnswer}</p>}
        </Card>

        <Card title="Learning outcomes">
          <Table
            empty="No outcome data yet."
            columns={["Course", "Activities", "Completed", "Completion %"]}
            rows={(hub.data?.learningOutcomes ?? []).map((o) => [
              o.course,
              o.activities,
              o.completed,
              `${o.completionPct}%`,
            ])}
          />
          <Link className="mt-3 inline-block text-sm text-brand hover:underline" to="/lms">
            Open LMS & SCORM packages
          </Link>
        </Card>
      </div>

      <Card title="Offline sync">
        <p className="mb-3 text-sm text-slate-500">
          Queue attendance and fee marks from mobile clients when connectivity is weak, then sync when back online.
        </p>
        <PrimaryButton
          onClick={async () => {
            setError(null);
            try {
              const queued = pendingOffline();
              if (queued.length === 0) {
                setSyncResult("No queued offline events on this browser. Mobile /m queues attendance and notices when offline.");
                return;
              }
              const applied = await flushOffline(api);
              setSyncResult(`Applied ${applied} offline event(s) from this browser queue.`);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Run sync now
        </PrimaryButton>
        {syncResult && <p className="mt-2 text-sm text-slate-600">{syncResult}</p>}
      </Card>
    </div>
  );
}

function StatCard({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const inner = (
    <>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="rounded-2xl border border-line bg-white p-4 hover:border-brand">
        {inner}
      </Link>
    );
  }
  return <div className="rounded-2xl border border-line bg-white p-4">{inner}</div>;
}
