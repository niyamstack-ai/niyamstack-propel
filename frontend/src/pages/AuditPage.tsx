import { Card, Table, formatWhen, useApi } from "../ui";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Activity log</h1>
        <p className="text-sm text-slate-500">Who changed fees, staff, HR, and institute settings — newest first.</p>
      </div>
      {feed.error && <p className="text-sm text-red-600">{feed.error}</p>}
      <Card title="Recent activity">
        <Table
          loading={feed.loading}
          empty="No activity recorded yet."
          columns={["When", "Who", "Action", "Detail"]}
          rows={(feed.data ?? []).map((row) => [
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
