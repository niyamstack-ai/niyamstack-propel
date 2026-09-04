import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { labelKey, useLocale } from "../locale";
import { Card, ErrorText, PrimaryButton, useApi } from "../ui";

type Onboarding = {
  completed: boolean;
  steps: Record<string, boolean>;
  centers?: number;
  courses?: number;
  staff?: number;
};

const STEP_META: { id: string; label: string; to: string; blurb: string }[] = [
  { id: "profile", label: "Institute profile", to: "/institute", blurb: "Name, contact, and branding" },
  { id: "center", label: "Add a center", to: "/institute", blurb: "At least one location or branch" },
  { id: "course", label: "Create a course", to: "/courses/new", blurb: "Your first program to sell or run" },
  { id: "staff", label: "Invite staff", to: "/people/staff", blurb: "Teachers, counselors, or accounts" },
  { id: "website", label: "Publish website", to: "/website", blurb: "Let students find and enroll online" },
];

export function OnboardingWizard() {
  const { t } = useLocale();
  const status = useApi<Onboarding>("/api/foundation/onboarding");
  const [error, setError] = useState<string | null>(null);
  if (status.loading || !status.data || status.data.completed) return null;

  const steps = status.data.steps ?? {};
  const done = STEP_META.filter((s) => steps[s.id]).length;
  const total = STEP_META.length;

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
    <Card title={`${t("get_started", "Get started")} (${done}/${total})`}>
      <ErrorText error={error} />
      <p className="mb-4 text-sm text-slate-500">
        Finish these steps to run your institute on Propel. You can return to any step later.
      </p>
      <ol className="space-y-3">
        {STEP_META.map((step) => {
          const complete = !!steps[step.id];
          return (
            <li key={step.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <div>
                <p className={`text-sm font-medium ${complete ? "text-emerald-700" : "text-navy"}`}>
                  {complete ? "✓ " : ""}
                  {t(labelKey(step.label), step.label)}
                </p>
                <p className="text-xs text-slate-500">{step.blurb}</p>
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
      {done === total && (
        <div className="mt-4">
          <PrimaryButton onClick={() => void dismiss()}>Mark setup complete</PrimaryButton>
        </div>
      )}
    </Card>
  );
}
