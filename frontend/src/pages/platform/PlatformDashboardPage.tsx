import { Link } from "react-router-dom";
import { hasCap, usePlatformAuth } from "../../platformAuth";
import { Card, useApi } from "../../ui";

type Dash = {
  institutes: number;
  newSignups: number;
  demo: number;
  unpaid: number;
  paidPending: number;
  active: number;
  suspended: number;
  failedPay: number;
  mrr: number;
};

export function PlatformDashboardPage() {
  const { user } = usePlatformAuth();
  const canViewInstitutes = hasCap(user, "VIEW_INSTITUTES");
  const canManageEmployees = hasCap(user, "MANAGE_EMPLOYEES");
  const dash = useApi<Dash>(canViewInstitutes ? "/api/platform/dashboard" : "");
  const d = dash.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {canViewInstitutes ? "Click a card to open the matching institutes." : "Your role does not include institute lists."}
        </p>
      </div>
      {dash.error && <p className="text-sm text-red-600">{dash.error}</p>}
      {canViewInstitutes && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat to="/platform/institutes?filter=new" label="New (7 days)" value={d?.newSignups} />
          <Stat to="/platform/institutes?filter=unpaid" label="Unpaid" value={d?.unpaid} />
          <Stat to="/platform/institutes?filter=pending" label="Paid, awaiting approval" value={d?.paidPending} />
          <Stat to="/platform/institutes?filter=active" label="Active institutes" value={d?.active} />
          <Stat to="/platform/institutes?filter=failed" label="Failed payments" value={d?.failedPay} />
          <Stat to="/platform/institutes?filter=suspended" label="Suspended" value={d?.suspended} />
          <Stat to="/platform/institutes" label="All institutes" value={d?.institutes} />
          <Stat to="/platform/institutes" label="Approx. monthly revenue" value={d?.mrr != null ? `₹${d.mrr}` : "—"} />
        </div>
      )}
      <Card title="Next">
        <p className="text-sm text-slate-600">
          {canViewInstitutes && (
            <>
              Open{" "}
              <Link className="font-medium text-brand" to="/platform/institutes">
                Institutes
              </Link>{" "}
              to set a custom price, mark payment received, and activate the workspace.
            </>
          )}
          {canViewInstitutes && canManageEmployees && " "}
          {canManageEmployees && (
            <>
              Add Niyamstack staff under{" "}
              <Link className="font-medium text-brand" to="/platform/employees">
                Employee management
              </Link>
              .
            </>
          )}
          {!canViewInstitutes && !canManageEmployees && "Open Settings to change your password."}
        </p>
      </Card>
    </div>
  );
}

function Stat({ to, label, value }: { to: string; label: string; value?: string | number }) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-line bg-white p-4 shadow-sm transition hover:border-brand hover:shadow-md"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-navy">{value ?? "—"}</p>
      <p className="mt-2 text-xs font-medium text-brand">View list →</p>
    </Link>
  );
}
