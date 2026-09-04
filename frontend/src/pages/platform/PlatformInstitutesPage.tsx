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
  switch (filter) {
    case "new":
      return created >= weekAgo;
    case "unpaid":
      return pay === "UNPAID";
    case "pending":
      return pay === "PAID" && access === "PENDING_APPROVAL";
    case "active":
      return access === "ACTIVE";
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
  const list = useApi<InstituteRow[]>("/api/platform/institutes");
  const rows = (list.data ?? []).filter((org) => matches(org, filter));
  const title =
    {
      new: "New in the last 7 days",
      unpaid: "Unpaid (demo or awaiting payment)",
      pending: "Paid, awaiting approval",
      active: "Active institutes",
      failed: "Failed payments",
      suspended: "Suspended",
    }[filter] || "All institutes";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Institutes</h1>
        <p className="mt-1 text-sm text-slate-500">Each customer has their own price, modules, and approval status.</p>
      </div>
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
          columns={["Institute", "Access", "Payment", "Deal", ""]}
          loading={list.loading}
          empty="No institutes yet."
          rows={rows.map((org) => [
            <Link key={`${org.id}-n`} className="block hover:text-brand" to={`/platform/institutes/${org.id}`}>
              <p className="font-medium text-navy">{org.name}</p>
              <p className="text-xs text-slate-500">{org.email || org.slug || "—"}</p>
            </Link>,
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
