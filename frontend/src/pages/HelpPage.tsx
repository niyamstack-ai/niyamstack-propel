import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLocale } from "../locale";
import { Card, PrimaryButton, useApi } from "../ui";

type Article = { pageKey?: string; title?: string; body?: string; locale?: string };
type Tour = { pageKey?: string; steps?: { title: string; body: string }[] };

export function HelpPage() {
  const location = useLocation();
  const { locale, setLocale, t } = useLocale();
  const page = new URLSearchParams(location.search).get("page") || "dashboard";
  const articles = useApi<Article[]>(`/api/actions/help/articles?locale=${locale}`);
  const tour = useApi<Tour>(`/api/actions/help/tour?page=${page}&locale=${locale}`);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [page, locale]);

  const steps = tour.data?.steps ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">{t("help_center", "Help center")}</h1>
          <p className="text-sm text-slate-500">
            {locale === "hi" ? "मार्गदर्शित टूर और पृष्ठ सहायता।" : "Guided tours and page tips for your institute."}
          </p>
        </div>
        <select
          className="rounded-lg border border-line px-3 py-2 text-sm"
          value={locale}
          onChange={(e) => void setLocale(e.target.value)}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      </div>

      <Card title={locale === "hi" ? "मार्गदर्शित टूर" : "Guided tour"}>
        {tour.loading ? (
          <p className="text-sm text-slate-500">Loading tour…</p>
        ) : steps.length === 0 || tour.error ? (
          <div className="space-y-2 text-sm text-slate-500">
            <p>{tour.error || (locale === "hi" ? "इस पृष्ठ के लिए टूर अभी उपलब्ध नहीं है।" : "No guided tour for this page yet.")}</p>
            <p>
              {locale === "hi" ? "नीचे लेख देखें, या " : "See articles below, or open "}
              <Link className="font-medium text-brand hover:underline" to="/support">
                {locale === "hi" ? "सहायता टिकट" : "Support"}
              </Link>
              .
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-semibold text-navy">{steps[Math.min(step, steps.length - 1)].title}</p>
            <p className="mt-2 text-sm text-slate-600">{steps[Math.min(step, steps.length - 1)].body}</p>
            <div className="mt-4 flex gap-2">
              <PrimaryButton disabled={step <= 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Back
              </PrimaryButton>
              <PrimaryButton disabled={step >= steps.length - 1} onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
                Next
              </PrimaryButton>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Step {Math.min(step + 1, steps.length)} / {steps.length} · page: {page}
            </p>
          </div>
        )}
      </Card>

      <Card title={locale === "hi" ? "लेख" : "Articles"}>
        {articles.loading ? (
          <p className="text-sm text-slate-500">Loading articles…</p>
        ) : articles.error ? (
          <p className="text-sm text-red-600">{articles.error}</p>
        ) : (articles.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No articles yet.</p>
        ) : (
          <ul className="space-y-4 text-sm">
            {(articles.data ?? []).map((a, i) => (
              <li key={i} className="border-b border-line pb-3 last:border-0">
                <p className="font-medium text-navy">{a.title}</p>
                <p className="mt-1 text-slate-600">{a.body}</p>
                <p className="mt-1 text-xs text-slate-400">{a.pageKey}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
