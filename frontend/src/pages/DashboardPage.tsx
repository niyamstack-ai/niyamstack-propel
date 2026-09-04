import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { hasGrowthTier, pathAllowed } from "../packs";
import { Card, formatInr, formatWhen, useApi } from "../ui";
import { OnboardingWizard } from "./OnboardingWizard";

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
  const progress = useApi<{ syllabusPct?: number; homeworkDone?: number; homeworkTotal?: number; testsDone?: number; testsTotal?: number }>(
    student?.id ? `/api/actions/progress/${student.id}` : "",
  );
  const due = (invoices.data ?? []).filter((i) => i.status !== "PAID");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Hi {student?.fullName || "there"}</h1>
        <p className="text-sm text-slate-500">Your classes, fees, and job drives — nothing else.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <HomeLink to="/courses" title="My courses" text={`${asg.data?.length ?? 0} assignments`} />
        <HomeLink to="/fees" title="Pay fees" text={`${due.length} due invoices`} />
        <HomeLink to="/placement" title="Apply to jobs" text={`${drives.data?.length ?? 0} open drives`} />
        <HomeLink to="/m" title="Student app" text="Attendance, fees, and notices on a phone" />
      </div>
      {progress.data && (
        <Card title="My progress">
          <p className="text-sm">
            Syllabus {progress.data.syllabusPct ?? 0}% · Homework {progress.data.homeworkDone ?? 0}/
            {progress.data.homeworkTotal ?? 0} · Tests {progress.data.testsDone ?? 0}/{progress.data.testsTotal ?? 0}
          </p>
        </Card>
      )}
      <Card title="Due fees">
        {(due.length === 0 && <p className="text-sm text-slate-500">No dues right now.</p>) || (
          <ul className="space-y-2 text-sm">
            {due.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {i.invoiceNo} — {formatInr(i.amount)}
                </span>
                <Link className="font-medium text-brand hover:underline" to="/fees">
                  Pay
                </Link>
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
  const att = useApi<{ studentId?: string; sessionDate?: string; status?: string }[]>("/api/attendance");
  const notices = useApi<{ title?: string; body?: string }[]>("/api/announcements");
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
      <Card title="Attendance">
        <ul className="text-sm">
          {(att.data ?? []).slice(0, 20).map((a, i) => (
            <li key={i}>
              {a.sessionDate || "—"} — {a.status}
            </li>
          ))}
          {(att.data ?? []).length === 0 && <li className="text-slate-500">No attendance marked yet.</li>}
        </ul>
      </Card>
      <Card title="Notices">
        <ul className="text-sm">
          {(notices.data ?? []).map((n, i) => (
            <li key={i}>{n.title || n.body}</li>
          ))}
          {(notices.data ?? []).length === 0 && <li className="text-slate-500">No notices yet.</li>}
        </ul>
      </Card>
      <HomeLink to="/fees" title="Fee dues" text={`${due.length} open`} />
    </div>
  );
}

function FacultyHome() {
  const load = useApi<{ fullName: string; weeklyHours: number; batches: number }[]>("/api/actions/sis/workload");
  const live = useApi<{ title: string; startsAt?: string; meetingUrl?: string }[]>("/api/live-sessions");
  const mine = (load.data ?? [])[0];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Faculty portal</h1>
      <p className="text-sm text-slate-500">Teach your batches. Accounts and admissions stay with other roles.</p>
      <p className="text-sm">
        {mine ? `${mine.weeklyHours} hrs this week · ${mine.batches} batches` : "Open courses to teach."}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <HomeLink to="/courses" title="Courses" text="Content, attendance, grading inside each course" />
        <HomeLink to="/m" title="Faculty app" text="Mark attendance and notices on a phone" />
        <HomeLink to="/students" title="My students" text="Batch roster" />
        <HomeLink to="/academics" title="Academics" text="Timetable, workload, progress" />
        <HomeLink to="/comms" title="Notices" text="Announce to a batch" />
      </div>
      <Card title="Upcoming live classes">
        <ul className="space-y-2 text-sm">
          {(live.data ?? []).slice(0, 5).map((l, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {l.title}
                {l.startsAt ? ` · ${formatWhen(l.startsAt)}` : ""}
              </span>
              {l.meetingUrl ? (
                <a className="text-brand hover:underline" href={l.meetingUrl} target="_blank" rel="noreferrer">
                  Join
                </a>
              ) : (
                <span className="text-xs text-slate-400">No join link</span>
              )}
            </li>
          ))}
          {(live.data ?? []).length === 0 && <li className="text-slate-500">No live classes scheduled.</li>}
        </ul>
      </Card>
    </div>
  );
}

function AccountsHome() {
  const dash = useApi<Dash>("/api/actions/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Accounts portal</h1>
      <p className="text-sm text-slate-500">Collections, receipts, and refunds only.</p>
      <p className="text-lg font-semibold">
        Due {formatInr(dash.data?.due)} · Collected {formatInr(dash.data?.collected)} · {dash.data?.collectionPct ?? 0}%
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <HomeLink to="/fees" title="Fee ledger" text="Collect, receipts, refunds" />
        <HomeLink to="/analytics" title="Finance" text="Course and counsellor split" />
      </div>
      <Link to="/fees" className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
        Open fee ledger
      </Link>
    </div>
  );
}

function CounselorHome() {
  const dash = useApi<Dash>("/api/actions/dashboard");
  const funnel = dash.data?.funnel || {};
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Admissions portal</h1>
      <p className="text-sm text-slate-500">Leads and conversions. Not LMS or accounts.</p>
      <p className="text-sm">{dash.data?.inquiries ?? 0} inquiries · {dash.data?.converted ?? 0} converted</p>
      <Card title="Pipeline">
        <ul className="text-sm">
          {Object.entries(funnel).map(([k, v]) => (
            <li key={k}>
              {k}: {String(v)}
            </li>
          ))}
          {Object.keys(funnel).length === 0 && <li className="text-slate-500">No leads yet.</li>}
        </ul>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <HomeLink to="/crm" title="Leads" text="Counselling stages" />
        <HomeLink to="/students" title="Students" text="Enrol after convert" />
      </div>
      <Link to="/crm" className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
        Open pipeline
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
      <Link to="/placement" className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
        Open ATS
      </Link>
    </div>
  );
}

function OwnerHome() {
  const { user } = useAuth();
  const growth = hasGrowthTier(user?.packageTier, user?.modules);
  const dash = useApi<Dash & {
    coursesPublished?: number;
    coursesTotal?: number;
    landingPages?: number;
    campaigns?: number;
    testsCreated?: number;
    testsTotal?: number;
    couponsLive?: number;
    bannersLive?: number;
    websiteSessions?: number;
    buyNowClicks?: number;
    transactions?: number;
    revenue?: number;
  }>("/api/actions/dashboard?days=30");
  const scorecard = useApi<{ conversionPct: number; placementPct: number; avgReadiness: number; atRisk: number }>(
    growth && pathAllowed("/analytics", user?.modules) ? "/api/actions/analytics/scorecard?days=30" : "",
  );
  const intel = useApi<{ alerts?: { title: string; detail: string; path: string }[] }>(
    growth && pathAllowed("/intelligence", user?.modules) ? "/api/actions/intelligence/hub?days=30" : "",
  );
  if (dash.error) return <p className="text-red-600">{dash.error}</p>;
  if (!dash.data) return <p>Loading…</p>;
  const data = dash.data;
  const unpublished = Math.max(0, (data.coursesTotal ?? 0) - (data.coursesPublished ?? 0));
  const courseCopy =
    (data.coursesPublished ?? 0) === 0 && unpublished > 0
      ? `${unpublished} unpublished — publish to sell`
      : `${data.coursesPublished ?? 0} published${unpublished ? ` · ${unpublished} draft` : " — create and sell"}`;
  const testCopy = `${data.testsCreated ?? 0} published test${(data.testsCreated ?? 0) === 1 ? "" : "s"}${(data.testsTotal ?? 0) > (data.testsCreated ?? 0) ? ` · ${data.testsTotal} total` : ""}`;
  const kpis = (
    [
      ["Inquiries", data.inquiries, "/crm"],
      ["Students", data.students, "/people/students"],
      ["Fee due", formatInr(data.due), "/fees"],
      ["Collected", formatInr(data.collected), "/fees"],
      ["Collection", `${data.collectionPct ?? 0}%`, "/fees"],
      ["Applications", data.applications, "/placement"],
      ["Offers", data.offers, "/placement"],
    ] as [string, string | number, string][]
  ).filter(([, , to]) => pathAllowed(to, user?.modules));
  return (
    <div className="space-y-6">
      <OnboardingWizard />
      <div>
        <h1 className="text-2xl font-bold text-navy">Dashboard</h1>
        <p className="text-sm text-slate-500">Your institute website, courses, admissions, and fees — in one place.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {pathAllowed("/website", user?.modules) && (
          <HomeLink to="/website" title="Student website" text="Build pages, then connect your domain. Students log in there." />
        )}
        {pathAllowed("/your-app", user?.modules) && (
          <HomeLink to="/your-app" title="Mobile apps" text="Student and faculty phones: attendance, fees, notices, mark class." />
        )}
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold text-navy">Grow the institute</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {pathAllowed("/courses", user?.modules) && <HomeLink to="/courses" title="Courses" text={courseCopy} />}
          {pathAllowed("/landing-pages", user?.modules) && (
            <HomeLink to="/landing-pages" title="Landing pages" text={`${data.landingPages ?? 0} ${(data.landingPages ?? 0) === 1 ? "page" : "pages"} for ads and webinars`} />
          )}
          {pathAllowed("/content-hub", user?.modules) && <HomeLink to="/content-hub" title="Tests" text={testCopy} />}
          {pathAllowed("/campaigns", user?.modules) && <HomeLink to="/campaigns" title="Campaigns" text={`${data.campaigns ?? 0} campaigns`} />}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card title="Money this month">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Website visits" value={data.websiteSessions ?? 0} />
            <MiniStat label="Buy clicks" value={data.buyNowClicks ?? 0} />
            <MiniStat label="Payments" value={data.transactions ?? 0} />
            <MiniStat label="Revenue" value={formatInr(data.revenue ?? data.collected)} />
          </div>
          <p className="mt-2 text-xs text-slate-400">Visits count when someone opens your public site. Payments come from fees and course checkout.</p>
          <Link to="/analytics" className="mt-3 inline-block text-sm text-brand hover:underline">
            View Details
          </Link>
        </Card>
        <div className="space-y-3">
          <UpcomingClasses />
          <Card title="Offers">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <Link to="/your-app" className="hover:underline">
                  Banners
                </Link>
                <span>{data.bannersLive ?? 0} Live</span>
              </li>
              <li className="flex justify-between">
                <Link to="/coupons" className="hover:underline">
                  Coupons
                </Link>
                <span>{data.couponsLive ?? 0} Live</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to="/people/students" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          Enroll student
        </Link>
        <Link to="/crm" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          New lead
        </Link>
        <Link to="/fees" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          Collect fees
        </Link>
        <Link to="/courses" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
          Open courses
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
      {growth && intel.data && pathAllowed("/intelligence", user?.modules) && (intel.data.alerts?.length ?? 0) > 0 && (
        <Card title="Intelligence alerts">
          <ul className="space-y-2 text-sm">
            {(intel.data.alerts ?? []).slice(0, 4).map((a, i) => (
              <li key={i}>
                <Link className="text-brand hover:underline" to={a.path}>
                  {a.title}
                </Link>
                <span className="text-slate-500"> — {a.detail}</span>
              </li>
            ))}
          </ul>
          <Link to="/intelligence" className="mt-3 inline-block text-sm text-brand hover:underline">
            Open intelligence hub
          </Link>
        </Card>
      )}
      {growth && scorecard.data && pathAllowed("/analytics", user?.modules) && (
        <Card title="Growth KPI scorecard (30 days)">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Lead conversion" value={`${scorecard.data.conversionPct}%`} />
            <MiniStat label="Placement rate" value={`${scorecard.data.placementPct}%`} />
            <MiniStat label="Avg readiness" value={`${scorecard.data.avgReadiness}%`} />
            <MiniStat label="At-risk" value={scorecard.data.atRisk} />
          </div>
          <Link to="/analytics" className="mt-3 inline-block text-sm text-brand hover:underline">
            Open analytics
          </Link>
        </Card>
      )}
    </div>
  );
}

function UpcomingClasses() {
  const live = useApi<{ id: string; title: string; startsAt?: string; meetingUrl?: string; provider?: string }[]>("/api/live-sessions");
  const upcoming = (live.data ?? [])
    .filter((row) => !row.startsAt || new Date(row.startsAt).getTime() > Date.now() - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.startsAt || 0).getTime() - new Date(b.startsAt || 0).getTime())
    .slice(0, 3);
  return (
    <Card title="Classes">
      {upcoming.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">No upcoming live classes scheduled.</p>
      ) : (
        <ul className="mb-3 space-y-2 text-sm">
          {upcoming.map((row) => (
            <li key={row.id}>
              <p className="font-medium text-navy">{row.title}</p>
              <p className="text-xs text-slate-500">
                {row.startsAt ? formatWhen(row.startsAt) : "Time not set"}
                {row.provider ? ` · ${row.provider}` : ""}
              </p>
              {row.meetingUrl && (
                <a className="text-xs text-brand hover:underline" href={row.meetingUrl} target="_blank" rel="noreferrer">
                  Join room
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link to="/lms#live" className="inline-flex rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
        Open live classes
      </Link>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-navy">{value}</p>
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
