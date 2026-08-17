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
  const { data } = useApi<Feature[]>("/api/features");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">License map</h1>
        <p className="text-sm text-slate-500">
          Commercial catalog of 95 capabilities. This is the price book, not the operating screens. Use Institute, Students, LMS, Fees, and
          Placement to run the institute.
        </p>
      </div>
      <Card title="Starter / Growth / Enterprise">
        <Table
          columns={["#", "Category", "Feature", "Package", "Diff"]}
          rows={(data ?? []).map((f) => [f.serial, f.category, f.name, f.packageName, f.differentiator ? "Y" : ""])}
        />
      </Card>
    </div>
  );
}
