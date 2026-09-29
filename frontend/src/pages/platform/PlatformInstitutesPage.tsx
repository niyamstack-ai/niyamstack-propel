import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, Table, useApi } from "../../ui";

export type InstituteRow = {
  id: string;
  name: string;
  slug?: string;
  email?: string;
  phone?: string;
  accessStatus: string;
  paymentStatus: string;
  packageTier?: string;
  dealAmount?: number;
  billingCycle?: string;
  createdAt?: string;
};

function matches(org: InstituteRow, filter: string) {
  const access = org.accessStatus || "DEMO";
  const pay = org.paymentStatus || "UNPAID";
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const created = org.createdAt ? new Date(org.createdAt).getTime() : 0;
  if (filter === "trash" || filter === "trashed") {
    return access === "TRASHED";
  }
  // Default lists hide trash so abandoned orgs do not clutter the screen.
  if (access === "TRASHED") {
    return false;
  }
  switch (filter) {
    case "new":
      return created >= weekAgo;
    case "unpaid":
      return pay === "UNPAID";
    case "pending":
      return pay === "PAID" && access === "PENDING_APPROVAL";
    case "active":
      return access === "ACTIVE";
    case "demo":
      return access === "DEMO";
    case "failed":
      return pay === "FAILED";
    case "suspended":
      return access === "SUSPENDED";
    default:
      return true;
  }
}

export function PlatformInstitutesPage() {
  const [params] = useSearchParams();
  const filter = params.get("filter") || "";
  const [q, setQ] = useState("");
  const list = useApi<InstituteRow[]>("/api/platform/institutes");
  const rows = useMemo(() => {
    const filtered = (list.data ?? []).filter((org) => matches(org, filter));
    const needle = q.trim().toLowerCase();
    if (!needle) return filtered;
    return filtered.filter((org) => {
      const hay = [org.name, org.email, org.phone, org.slug].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [list.data, filter, q]);
  const title =
    {
      new: "New in the last 7 days",
      unpaid: "Unpaid (demo or awaiting payment)",
      pending: "Paid, awaiting approval",
      active: "Active institutes",
      demo: "Demo institutes",
      failed: "Failed payments",
      suspended: "Suspended",
      trash: "Trash (soft-deleted)",
      trashed: "Trash (soft-deleted)",
    }[filter] || "All institutes (trash hidden)";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Institutes</h1>
          <p className="mt-1 text-sm text-slate-500">Each customer has their own price, modules, and approval status.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className={`rounded-full px-3 py-1 ${!filter ? "bg-navy text-white" : "bg-mist text-navy"}`} to="/platform/institutes">
            All
          </Link>
          <Link className={`rounded-full px-3 py-1 ${filter === "active" ? "bg-navy text-white" : "bg-mist text-navy"}`} to="/platform/institutes?filter=active">
            Active
          </Link>
          <Link className={`rounded-full px-3 py-1 ${filter === "new" ? "bg-navy text-white" : "bg-mist text-navy"}`} to="/platform/institutes?filter=new">
            Recent
          </Link>
          <Link className={`rounded-full px-3 py-1 ${filter === "demo" ? "bg-navy text-white" : "bg-mist text-navy"}`} to="/platform/institutes?filter=demo">
            Demo
          </Link>
          <Link className={`rounded-full px-3 py-1 ${filter === "trash" || filter === "trashed" ? "bg-navy text-white" : "bg-mist text-navy"}`} to="/platform/institutes?filter=trash">
            Trash
          </Link>
        </div>
      </div>
      <label className="block max-w-md text-sm">
        <span className="text-slate-600">Search name, email, phone, or slug</span>
        <input
          className="mt-1 w-full rounded-lg border border-line px-3 py-2"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. aarohan or 98…"
        />
      </label>
      {filter && (
        <p className="text-sm">
          Showing {title}.{" "}
          <Link className="font-medium text-brand" to="/platform/institutes">
            Clear filter
          </Link>
        </p>
      )}
      {list.error && <p className="text-sm text-red-600">{list.error}</p>}
      <Card title={list.loading ? "Institutes" : `${rows.length} institutes`}>
        <Table
          columns={["Institute", "Owner contact", "Access", "Payment", "Deal", ""]}
          loading={list.loading}
          empty={filter === "trash" || filter === "trashed" ? "Trash is empty." : "No institutes match."}
          rows={rows.map((org) => [
            <Link key={`${org.id}-n`} className="block hover:text-brand" to={`/platform/institutes/${org.id}`}>
              <p className="font-medium text-navy">{org.name}</p>
              <p className="text-xs text-slate-500">{org.slug || "—"}</p>
            </Link>,
            <span key={`${org.id}-c`} className="text-sm">
              <span className="block">{org.email || "—"}</span>
              <span className="block text-xs text-slate-500">{org.phone ? `+91 ${org.phone}` : "no phone"}</span>
            </span>,
            org.accessStatus,
            org.paymentStatus,
            org.dealAmount != null
              ? `₹${org.dealAmount}${org.billingCycle ? ` / ${org.billingCycle.toLowerCase()}` : ""}`
              : "Not set",
            <Link
              key={`${org.id}-l`}
              className="inline-flex rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white"
              to={`/platform/institutes/${org.id}`}
            >
              Open
            </Link>,
          ])}
        />
      </Card>
    </div>
  );
}
