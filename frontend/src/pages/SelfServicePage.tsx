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
        <h1 className="text-2xl font-bold text-navy">Self Service</h1>
        <p className="text-sm text-slate-500">Manage your operational tasks.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Backend Addition">
          <p className="text-2xl font-bold text-navy">{additions.data?.length ?? 0} Transaction(s)</p>
          <p className="mt-1 text-sm text-slate-500">You can add students directly into courses.</p>
          <Link to="/courses" className="mt-4 inline-block text-sm text-brand hover:underline">
            Open Backend Addition →
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
