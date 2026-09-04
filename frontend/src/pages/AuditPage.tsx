import { useMemo, useState } from "react";
import { Card, Field, FormGrid, PrimaryButton, Select, Table, formatWhen, useApi } from "../ui";

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  detail?: string;
  actorName?: string;
  createdAt?: string;
};

export function AuditPage() {
  const feed = useApi<AuditRow[]>("/api/foundation/audit?limit=150");
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [exportNote, setExportNote] = useState<string | null>(null);

  const actions = useMemo(() => {
    const set = new Set((feed.data ?? []).map((r) => r.action).filter(Boolean));
    return [...set].sort();
  }, [feed.data]);

  const entities = useMemo(() => {
    const set = new Set((feed.data ?? []).map((r) => r.entityType).filter(Boolean));
    return [...set].sort();
  }, [feed.data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (feed.data ?? []).filter((row) => {
      if (action && row.action !== action) return false;
      if (entity && row.entityType !== entity) return false;
      if (!needle) return true;
      const hay = `${row.actorName || ""} ${row.action} ${row.entityType} ${row.detail || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [feed.data, q, action, entity]);

  function exportCsv() {
    setExportNote(null);
    if (!rows.length) {
      setExportNote("Nothing to export for this filter.");
      return;
    }
    const keys = ["createdAt", "actorName", "action", "entityType", "detail"];
    const csv = [keys.join(",")]
      .concat(rows.map((row) => keys.map((k) => JSON.stringify((row as Record<string, string | undefined>)[k] ?? "")).join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "activity-log.csv";
    a.click();
    URL.revokeObjectURL(url);
    setExportNote(`Downloaded ${rows.length} row(s).`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Activity log</h1>
        <p className="text-sm text-slate-500">Who changed fees, staff, HR, and institute settings — newest first.</p>
      </div>
      {feed.error && <p className="text-sm text-red-600">{feed.error}</p>}
      <Card title="Filter">
        <FormGrid>
          <Field label="Search" value={q} onChange={setQ} placeholder="Actor, action, detail…" />
          <Select
            label="Action"
            value={action}
            onChange={setAction}
            options={[{ value: "", label: "All actions" }, ...actions.map((a) => ({ value: a, label: a }))]}
          />
          <Select
            label="Entity"
            value={entity}
            onChange={setEntity}
            options={[{ value: "", label: "All entities" }, ...entities.map((e) => ({ value: e, label: e }))]}
          />
          <div className="flex items-end">
            <PrimaryButton onClick={exportCsv}>Export CSV</PrimaryButton>
          </div>
        </FormGrid>
        {exportNote && <p className="mt-2 text-sm text-emerald-700">{exportNote}</p>}
      </Card>
      <Card title={`Recent activity (${rows.length})`}>
        <Table
          loading={feed.loading}
          empty="No activity recorded yet."
          columns={["When", "Who", "Action", "Detail"]}
          rows={rows.map((row) => [
            row.createdAt ? formatWhen(row.createdAt) : "—",
            row.actorName || "System",
            `${row.action}${row.entityType ? ` · ${row.entityType}` : ""}`,
            row.detail || "—",
          ])}
        />
      </Card>
    </div>
  );
}
