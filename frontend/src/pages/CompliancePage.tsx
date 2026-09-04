import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, formatInr, useApi } from "../ui";

type Hub = {
  packageTier?: string;
  accessStatus?: string;
  paymentStatus?: string;
  billingCycle?: string;
  dealAmount?: number;
  exportsLast30Days?: number;
  pendingDeleteRequests?: number;
  openSupportTickets?: number;
  usageByModule?: { module: string; events: number }[];
  releaseNotes?: { version: string; title: string; body?: string; publishedAt?: string }[];
  maskedFields?: string[];
  indiaDataResidency?: boolean;
  dataMode?: string;
};

type Student = { id: string; fullName: string; studentCode?: string };

type DeleteReq = {
  id: string;
  subjectType: string;
  subjectId: string;
  status: string;
  reason?: string;
  requestedAt?: string;
};

export function CompliancePage() {
  const { user } = useAuth();
  const allowed = user?.role === "OWNER" || user?.role === "ACCOUNTANT";
  const hub = useApi<Hub>(allowed ? "/api/actions/compliance/hub" : "");
  const students = useApi<Student[]>(allowed ? "/api/students" : "");
  const deletes = useApi<DeleteReq[]>(allowed ? "/api/actions/compliance/delete-requests" : "");
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [maskedExport, setMaskedExport] = useState<string | null>(null);

  if (!allowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-navy">Compliance & trust</h1>
        <Card title="Owner or accountant access">
          <p className="text-sm text-slate-600">Data export, deletion requests, and billing status are limited to institute owners and accountants.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Compliance & trust</h1>
        <p className="text-sm text-slate-500">GDPR-style export, deletion requests, masked exports, usage metering, and release notes.</p>
      </div>

      <ErrorText error={error} />

      {hub.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Exports (30d)" value={hub.data.exportsLast30Days ?? 0} />
          <Stat label="Pending deletes" value={hub.data.pendingDeleteRequests ?? 0} />
          <Stat label="Open tickets" value={hub.data.openSupportTickets ?? 0} to="/support" />
          <Stat label="Billing" value={hub.data.paymentStatus ?? "—"} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Subscription & access">
          {hub.error ? (
            <p className="text-sm text-red-600">{hub.error}</p>
          ) : hub.data ? (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between gap-2">
                <span className="text-slate-500">Package tier</span>
                <span className="font-medium">{hub.data.packageTier ?? "STARTER"}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-500">Access</span>
                <span className="font-medium">{hub.data.accessStatus ?? "—"}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-500">Billing cycle</span>
                <span className="font-medium">{hub.data.billingCycle ?? "—"}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-500">Deal amount</span>
                <span className="font-medium">{hub.data.dealAmount != null ? formatInr(hub.data.dealAmount) : "—"}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-500">India data residency</span>
                <span className="font-medium">{hub.data.indiaDataResidency ? "On" : "Off"}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-slate-500">Data mode</span>
                <span className="font-medium">{hub.data.dataMode ?? "SHARED"}</span>
              </li>
            </ul>
          ) : hub.loading ? (
            <p className="text-sm text-slate-500">Loading billing snapshot…</p>
          ) : (
            <p className="text-sm text-slate-500">Billing snapshot unavailable.</p>
          )}
          <Link className="mt-3 mr-3 inline-block text-sm text-brand hover:underline" to="/audit">
            View activity log
          </Link>
          <Link className="mt-3 mr-3 inline-block text-sm text-brand hover:underline" to="/scale">
            Open scale depth
          </Link>
          <Link className="mt-3 mr-3 inline-block text-sm text-brand hover:underline" to="/support">
            Support tickets
          </Link>
          <button
            type="button"
            className="mt-3 inline-block text-sm font-medium text-brand hover:underline"
            onClick={async () => {
              setError(null);
              try {
                await api("/api/actions/billing/upgrade-request", {
                  method: "POST",
                  body: JSON.stringify({ tier: "GROWTH", note: "Upgrade from compliance billing card" }),
                });
                alert("Upgrade request sent. Track it under Support.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Request upgrade
          </button>
        </Card>

        <Card title="Module usage (30 days)">
          <Table
            empty="No usage recorded yet."
            columns={["Module", "Events"]}
            rows={(hub.data?.usageByModule ?? []).map((r) => [r.module, r.events])}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Subject data export">
          <p className="mb-3 text-sm text-slate-500">Download a JSON bundle for one student (invoices, applications, attendance, documents). PII is masked by default.</p>
          <FormGrid>
            <Select
              label="Student"
              value={studentId}
              onChange={setStudentId}
              options={(students.data ?? []).map((s) => ({
                value: s.id,
                label: `${s.fullName}${s.studentCode ? ` (${s.studentCode})` : ""}`,
              }))}
            />
          </FormGrid>
          <div className="mt-3 flex flex-wrap gap-2">
            <PrimaryButton
              disabled={!studentId}
              onClick={async () => {
                setError(null);
                try {
                  const bundle = await api<Record<string, unknown>>(`/api/actions/compliance/export/subject/${studentId}`);
                  setExportJson(JSON.stringify(bundle, null, 2));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Export subject bundle
            </PrimaryButton>
            {exportJson && (
              <LinkButton
                onClick={() => {
                  const blob = new Blob([exportJson], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `student-export-${studentId.slice(0, 8)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download JSON
              </LinkButton>
            )}
          </div>
          {exportJson && <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-mist p-3 text-xs">{exportJson.slice(0, 2000)}{exportJson.length > 2000 ? "…" : ""}</pre>}
        </Card>

        <Card title="Deletion request">
          <p className="mb-3 text-sm text-slate-500">Log a GDPR-style erasure request. Processing is tracked in audit and pending queue.</p>
          <FormGrid>
            <Select
              label="Student"
              value={studentId}
              onChange={setStudentId}
              options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
            />
            <Field label="Reason" value={reason} onChange={setReason} placeholder="Parent requested erasure" />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton
              disabled={!studentId || !reason.trim()}
              onClick={async () => {
              setError(null);
              try {
                await api(`/api/actions/compliance/delete-request/${studentId}`, {
                  method: "POST",
                  body: JSON.stringify({ reason }),
                });
                setReason("");
                deletes.reload();
                hub.reload();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Submit deletion request
          </PrimaryButton>
          </div>
          <Table
            empty="No deletion requests."
            columns={["Subject", "Status", "Reason"]}
            rows={(deletes.data ?? []).map((r) => [r.subjectId.slice(0, 8), r.status, r.reason ?? "—"])}
          />
        </Card>
      </div>

      <Card title="Masked bulk export">
        <p className="mb-3 text-sm text-slate-500">
          Server-side masking for email, phone, and custom fields. Fields masked:{" "}
          {(hub.data?.maskedFields ?? ["email", "phone", "customJson"]).join(", ")}.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["students", "invoices", "applications", "inquiries"] as const).map((resource) => (
            <LinkButton
              key={resource}
              onClick={async () => {
                setError(null);
                try {
                  const rows = await api<unknown[]>(`/api/actions/export/${resource}?mask=email,phone,customJson`);
                  setMaskedExport(`${resource}: ${rows.length} rows exported with masking`);
                  hub.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Export {resource}
            </LinkButton>
          ))}
        </div>
        {maskedExport && <p className="mt-2 text-sm text-green-700">{maskedExport}</p>}
        <Link className="mt-3 inline-block text-sm text-brand hover:underline" to="/analytics">
          Open analytics export center
        </Link>
      </Card>

      <Card title="Release notes">
        <ul className="space-y-4 text-sm">
          {(hub.data?.releaseNotes ?? []).map((note, i) => (
            <li key={i} className="border-b border-line pb-3 last:border-0">
              <p className="font-medium text-navy">
                v{note.version} — {note.title}
              </p>
              {note.body && <p className="mt-1 text-slate-600">{note.body}</p>}
            </li>
          ))}
        </ul>
      </Card>
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
