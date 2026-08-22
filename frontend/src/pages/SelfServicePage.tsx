import { Link } from "react-router-dom";
import { Card, useApi } from "../ui";

type Addition = { id: string; studentName?: string; status: string };
type Payment = { id: string; amount: number };

export function SelfServicePage() {
  const additions = useApi<Addition[]>("/api/backend-additions");
  const payments = useApi<Payment[]>("/api/payments");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Add students to courses</h1>
        <p className="text-sm text-slate-500">Enrol someone who already paid offline, or open fees.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Add to a course">
          <p className="text-2xl font-bold text-navy">{additions.data?.length ?? 0} added</p>
          <p className="mt-1 text-sm text-slate-500">Put a classroom student onto an online course without a website purchase.</p>
          <Link to="/courses" className="mt-4 inline-block text-sm text-brand hover:underline">
            Open courses →
          </Link>
        </Card>
        <Card title="Payments snapshot">
          <p className="text-2xl font-bold text-navy">{payments.data?.length ?? 0} payments</p>
          <p className="mt-1 text-sm text-slate-500">Jump to fees ledger for collections and refunds.</p>
          <Link to="/fees" className="mt-4 inline-block text-sm text-brand hover:underline">
            Open Fees →
          </Link>
        </Card>
      </div>
    </div>
  );
}
