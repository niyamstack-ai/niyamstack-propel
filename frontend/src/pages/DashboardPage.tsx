import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { Card, PrimaryButton, useApi } from "../ui";

type Dash = {
  inquiries: number;
  converted: number;
  students: number;
  due: number;
  collected: number;
  collectionPct: number;
  applications: number;
  offers: number;
  funnel: Record<string, number>;
  ats: Record<string, number>;
  role: string;
};
type Student = { id: string; fullName: string; studentCode: string; status: string };
type Invoice = { id: string; invoiceNo: string; amount: number; status: string };
type Assignment = { id: string; title: string };
type Drive = { id: string; title: string; packageLpa: number; status: string };

export function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;
  if (role === "STUDENT") return <StudentHome />;
  if (role === "PARENT") return <ParentHome />;
  if (role === "FACULTY") return <FacultyHome />;
  if (role === "ACCOUNTANT") return <AccountsHome />;
  if (role === "COUNSELOR") return <CounselorHome />;
  if (role === "PLACEMENT_HEAD" || role === "RECRUITER") return <PlacementHome recruiter={role === "RECRUITER"} />;
  return <OwnerHome />;
}

function StudentHome() {
  const me = useApi<Student[]>("/api/students");
  const invoices = useApi<Invoice[]>("/api/invoices");
  const asg = useApi<Assignment[]>("/api/assignments");
  const drives = useApi<Drive[]>("/api/drives");
  const student = me.data?.[0];
  const due = (invoices.data ?? []).filter((i) => i.status !== "PAID");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Hi {student?.fullName || "there"}</h1>
        <p className="text-sm text-slate-500">Your classes, fees, and job drives — nothing else.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <HomeLink to="/lms" title="Open LMS" text={`${asg.data?.length ?? 0} assignments`} />
        <HomeLink to="/fees" title="Pay fees" text={`${due.length} due invoices`} />
        <HomeLink to="/placement" title="Apply to jobs" text={`${drives.data?.length ?? 0} open drives`} />
      </div>
      <Card title="Due fees">
        {(due.length === 0 && <p className="text-sm text-slate-500">No dues right now.</p>) || (
          <ul className="text-sm">
            {due.map((i) => (
              <li key={i.id}>
                {i.invoiceNo} — ₹{i.amount}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ParentHome() {
  const kids = useApi<Student[]>("/api/students");
  const invoices = useApi<Invoice[]>("/api/invoices");
  const due = (invoices.data ?? []).filter((i) => i.status !== "PAID");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Parent portal</h1>
      <p className="text-sm text-slate-500">Attendance, fees, and notices for your child.</p>
      <Card title="Children">
        <ul className="text-sm">
          {(kids.data ?? []).map((s) => (
            <li key={s.id}>
              {s.fullName} ({s.studentCode}) — {s.status}
            </li>
          ))}
        </ul>
      </Card>
      <HomeLink to="/fees" title="Fee dues" text={`${due.length} open`} />
    </div>
  );
}

function FacultyHome() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Faculty portal</h1>
      <p className="text-sm text-slate-500">Teach your batches. Accounts and admissions stay with other roles.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <HomeLink to="/lms" title="LMS" text="Content, attendance, grading" />
        <HomeLink to="/students" title="My students" text="Batch roster" />
        <HomeLink to="/comms" title="Notices" text="Announce to a batch" />
      </div>
    </div>
  );
}

function AccountsHome() {
  const dash = useApi<Dash>("/api/actions/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Accounts portal</h1>
      <p className="text-sm text-slate-500">Collections, receipts, and refunds only.</p>
      <p className="text-lg font-semibold">Due ₹{dash.data?.due ?? "…"} · Collected ₹{dash.data?.collected ?? "…"}</p>
      <Link to="/fees">
        <PrimaryButton>Open fee ledger</PrimaryButton>
      </Link>
    </div>
  );
}

function CounselorHome() {
  const dash = useApi<Dash>("/api/actions/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Admissions portal</h1>
      <p className="text-sm text-slate-500">Leads and conversions. Not LMS or accounts.</p>
      <p className="text-sm">{dash.data?.inquiries ?? 0} inquiries · {dash.data?.converted ?? 0} converted</p>
      <Link to="/crm">
        <PrimaryButton>Open pipeline</PrimaryButton>
      </Link>
    </div>
  );
}

function PlacementHome({ recruiter }: { recruiter: boolean }) {
  const dash = useApi<Dash>("/api/actions/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">{recruiter ? "Recruiter portal" : "Placement portal"}</h1>
      <p className="text-sm text-slate-500">
        {recruiter ? "Update drive outcomes for your company." : "Drives, ATS, readiness, alumni."}
      </p>
      <p className="text-sm">{dash.data?.applications ?? 0} applications · {dash.data?.offers ?? 0} offers</p>
      <Link to="/placement">
        <PrimaryButton>Open ATS</PrimaryButton>
      </Link>
    </div>
  );
}

function OwnerHome() {
  const dash = useApi<Dash>("/api/actions/dashboard");
  if (dash.error) return <p className="text-red-600">{dash.error}</p>;
  if (!dash.data) return <p>Loading…</p>;
  const data = dash.data;
  const kpis = [
    ["Inquiries", data.inquiries, "/crm"],
    ["Students", data.students, "/students"],
    ["Fee due", `₹${data.due}`, "/fees"],
    ["Collected", `₹${data.collected}`, "/fees"],
    ["Applications", data.applications, "/placement"],
    ["Offers", data.offers, "/placement"],
  ] as const;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Institute home</h1>
        <p className="text-sm text-slate-500">Admissions, students, LMS, fees, placement — for the owner and ops team.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/students">
          <PrimaryButton>Enroll student</PrimaryButton>
        </Link>
        <Link to="/crm">
          <PrimaryButton>New lead</PrimaryButton>
        </Link>
        <Link to="/fees">
          <PrimaryButton>Collect fees</PrimaryButton>
        </Link>
        <Link to="/lms">
          <PrimaryButton>Open LMS</PrimaryButton>
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(([label, value, to]) => (
          <Link key={label} to={to} className="rounded-2xl border border-line bg-white p-4 hover:border-brand">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-navy-mid">{value}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function HomeLink({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link to={to} className="rounded-2xl border border-line bg-white p-4 hover:border-brand">
      <p className="font-semibold text-navy">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </Link>
  );
}
