import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { labelKey, useLocale } from "../locale";
import { Card, ErrorText, PrimaryButton, useApi } from "../ui";

type Onboarding = {
  completed: boolean;
  week1Complete?: boolean;
  steps: Record<string, boolean>;
  centers?: number;
  courses?: number;
  coursesPublished?: number;
  staff?: number;
  students?: number;
  websitePublished?: boolean;
  hasBank?: boolean;
  slug?: string;
  sitePath?: string;
  accessStatus?: string;
};

const WEEK1: { id: string; label: string; to: string; blurb: string }[] = [
  { id: "profile", label: "Institute profile", to: "/institute", blurb: "Name, logo, phone, and branding" },
  { id: "course", label: "Create a course", to: "/courses/new", blurb: "Add your first program, then publish it to sell" },
  { id: "website", label: "Publish website", to: "/website", blurb: "Students browse and buy on your public site" },
  { id: "student", label: "Add a student", to: "/people/students", blurb: "Enrol one learner (or convert a CRM lead)" },
  { id: "payment", label: "Ready for money", to: "/fees", blurb: "Add bank/UPI under Institute, or create a fee plan / collect a test fee" },
];

const LATER: { id: string; label: string; to: string; blurb: string }[] = [
  { id: "center", label: "Add a center", to: "/institute", blurb: "Branches and classrooms — optional for week one" },
  { id: "staff", label: "Invite staff", to: "/people/staff", blurb: "Teachers, counselors, accounts — optional for week one" },
];

export function OnboardingWizard() {
  const { t } = useLocale();
  const { user } = useAuth();
  const status = useApi<Onboarding>("/api/foundation/onboarding");
  const [error, setError] = useState<string | null>(null);
  if (status.loading || !status.data || status.data.completed) return null;

  const steps = status.data.steps ?? {};
  const week1Done = WEEK1.filter((s) => steps[s.id]).length;
  const week1Total = WEEK1.length;
  const next = WEEK1.find((s) => !steps[s.id]);
  const locked =
    user?.accessStatus === "DEMO" || user?.accessStatus === "PENDING_APPROVAL" || user?.accessStatus === "SUSPENDED";
  const sitePath = status.data.sitePath || (status.data.slug ? `/s/${status.data.slug}` : "");

  async function dismiss() {
    setError(null);
    try {
      await api("/api/foundation/onboarding", {
        method: "PUT",
        body: JSON.stringify({ completed: true }),
      });
      status.reload();
    } catch (e) {
      setError((e as Error).message || "Could not mark setup complete");
    }
  }

  return (
    <Card title={`${t("first_week", "Your first week")} (${week1Done}/${week1Total})`}>
      <ErrorText error={error} />
      <p className="mb-3 text-sm text-slate-500">
        Get to a live student site, one course, one student, and a money path. Everything else in the menus stays available — finish those when you need them.
      </p>
      {next && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-sky-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Next</p>
          <p className="mt-1 font-semibold text-navy">{t(labelKey(next.label), next.label)}</p>
          <p className="text-sm text-slate-600">{next.blurb}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link to={next.to} className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white">
              {t("open", "Open")}
            </Link>
            {next.id === "website" && sitePath && (
              <a className="rounded-full border border-line bg-white px-4 py-1.5 text-sm font-medium text-navy" href={sitePath} target="_blank" rel="noreferrer">
                Preview student site
              </a>
            )}
          </div>
          {locked && next.id === "website" && (
            <p className="mt-2 text-xs text-amber-800">
              Publish is locked until Niyamstack activates this institute. You can still edit pages and preview the site.
            </p>
          )}
        </div>
      )}
      <ol className="space-y-2">
        {WEEK1.map((step) => {
          const complete = !!steps[step.id];
          return (
            <li key={step.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <div>
                <p className={`text-sm font-medium ${complete ? "text-emerald-700" : "text-navy"}`}>
                  {complete ? "✓ " : ""}
                  {t(labelKey(step.label), step.label)}
                </p>
                <p className="text-xs text-slate-500">{step.blurb}</p>
                {step.id === "course" && (status.data?.coursesPublished ?? 0) === 0 && (status.data?.courses ?? 0) > 0 && (
                  <p className="text-xs text-amber-800">Course draft exists — publish it under Courses to sell on the website.</p>
                )}
                {step.id === "payment" && !status.data?.hasBank && (
                  <p className="text-xs text-slate-400">Tip: bank/UPI on Institute → Bank enables payouts later.</p>
                )}
              </div>
              {!complete && (
                <Link to={step.to} className="shrink-0 text-sm font-semibold text-brand hover:underline">
                  {t("open", "Open")}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <details className="mt-4 rounded-xl border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-navy">After week one (optional)</summary>
        <ul className="mt-2 space-y-2">
          {LATER.map((step) => {
            const complete = !!steps[step.id];
            return (
              <li key={step.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className={complete ? "text-emerald-700" : "text-navy"}>
                    {complete ? "✓ " : ""}
                    {t(labelKey(step.label), step.label)}
                  </p>
                  <p className="text-xs text-slate-500">{step.blurb}</p>
                </div>
                {!complete && (
                  <Link to={step.to} className="shrink-0 font-semibold text-brand hover:underline">
                    Open
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </details>
      {status.data.week1Complete || week1Done === week1Total ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryButton onClick={() => void dismiss()}>Mark first week complete</PrimaryButton>
          {sitePath && (
            <a className="text-sm font-semibold text-brand underline" href={sitePath} target="_blank" rel="noreferrer">
              Open student site
            </a>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="text-sm font-medium text-slate-600 underline" onClick={() => void dismiss()}>
            I&apos;ll finish later
          </button>
          <p className="text-xs text-slate-400">Menus stay open. Come back anytime — this checklist does not remove features.</p>
        </div>
      )}
    </Card>
  );
}
