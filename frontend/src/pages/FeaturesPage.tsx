import { useLocation } from "react-router-dom";
import { Card, Table, useApi } from "../ui";

type Feature = {
  serial: number;
  category: string;
  name: string;
  description: string;
  packageName: string;
  differentiator: boolean;
};

export function FeaturesPage() {
  const location = useLocation();
  const list = useApi<Feature[]>(
    location.pathname.startsWith("/platform") ? "/api/platform/features" : "/api/features"
  );
  const data = list.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">License map</h1>
        <p className="text-sm text-slate-500">
          Commercial catalog of 95 capabilities. This is the price book, not the operating screens. Use Institute, People, Courses, Fees, and
          Placement to run the institute.
        </p>
      </div>
      {list.error && <p className="text-sm text-red-600">{list.error}</p>}
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
