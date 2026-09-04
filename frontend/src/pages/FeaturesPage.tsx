import { Link, useLocation } from "react-router-dom";
import { Card, Table, useApi } from "../ui";

type Feature = {
  serial: number;
  category: string;
  name: string;
  description: string;
  packageName: string;
  differentiator: boolean;
};

const CATEGORY_LINKS: Record<string, { to: string; label: string }> = {
  CRM: { to: "/crm", label: "Open CRM" },
  SIS: { to: "/students", label: "Open students" },
  LMS: { to: "/courses", label: "Open courses" },
  Fees: { to: "/fees", label: "Open fees" },
  Placement: { to: "/placement", label: "Open placement" },
  ESS: { to: "/ess", label: "Open ESS" },
  Growth: { to: "/your-app", label: "Open growth tools" },
  Comms: { to: "/comms", label: "Open communication" },
  Analytics: { to: "/analytics", label: "Open analytics" },
  Website: { to: "/website", label: "Open website" },
};

export function FeaturesPage() {
  const location = useLocation();
  const platform = location.pathname.startsWith("/platform");
  const list = useApi<Feature[]>(platform ? "/api/platform/features" : "/api/features");
  const data = list.data;
  const categories = [...new Set((data ?? []).map((f) => f.category).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">License map</h1>
        <p className="text-sm text-slate-500">
          Commercial catalog of capabilities by package. Use the shortcuts below to open the operating screens for each area.
        </p>
      </div>
      {list.error && <p className="text-sm text-red-600">{list.error}</p>}
      {!platform && categories.length > 0 && (
        <Card title="Go to module">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const key = Object.keys(CATEGORY_LINKS).find((k) => cat.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(cat.toLowerCase()));
              const link = key ? CATEGORY_LINKS[key] : undefined;
              if (!link) {
                return (
                  <span key={cat} className="rounded-full border border-line px-3 py-1.5 text-sm text-slate-500">
                    {cat}
                  </span>
                );
              }
              return (
                <Link key={cat} className="rounded-full bg-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-brand" to={link.to}>
                  {cat}: {link.label.replace(/^Open /, "")}
                </Link>
              );
            })}
            <Link className="rounded-full border border-line px-3 py-1.5 text-sm text-navy hover:bg-mist" to="/institute">
              Institute settings
            </Link>
          </div>
        </Card>
      )}
      <Card title="Starter / Growth / Enterprise">
        <Table
          columns={["#", "Category", "Feature", "Package", "Diff"]}
          loading={list.loading}
          rows={(data ?? []).map((f) => [f.serial, f.category, f.name, f.packageName, f.differentiator ? "Y" : ""])}
        />
      </Card>
    </div>
  );
}
