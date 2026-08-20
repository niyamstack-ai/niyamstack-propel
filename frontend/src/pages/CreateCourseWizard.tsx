import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createRecord, updateRecord, uploadContentFile } from "../ops";
import { ErrorText, useApi } from "../ui";
import { UserMenu } from "../UserMenu";
import { CourseContentPanel } from "./courseContent";

type Draft = { id: string; name: string; code?: string; published?: boolean };
type CourseOption = { id: string; name: string };

const STEPS = ["Basic Information", "Edit Price", "Add Content", "Bundle (Optional)"] as const;

const CATEGORIES: Record<string, string[]> = {
  "Competitive Exams": ["CAT & MBA", "Banking", "SSC", "UPSC", "Railways", "Defence", "Others"],
  "IT & Software": ["Cloud", "Programming", "Data", "Cybersecurity", "Others"],
  Academic: ["Class 10", "Class 12", "Graduation", "Others"],
  Professional: ["Accounting", "Design", "Marketing", "Others"],
  "Skill Development": ["Communication", "Soft skills", "Others"],
  Language: ["English", "Hindi", "Others"],
  Others: ["Others"],
};

const FEATURES = [
  "Allow offline download",
  "Create installments",
  "Promote course with trial",
  "Conduct LIVE classes",
  "Allow course preview",
  "Limit course access",
];

export function CreateCourseWizard() {
  const navigate = useNavigate();
  const courses = useApi<CourseOption[]>("/api/courses");

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [categoryRows, setCategoryRows] = useState([{ category: "", subCategory: "" }]);

  const [courseType, setCourseType] = useState<"PAID" | "FREE">("PAID");
  const [validityType, setValidityType] = useState("SINGLE");
  const [validityValue, setValidityValue] = useState("1");
  const [validityUnit, setValidityUnit] = useState("YEAR");
  const [fees, setFees] = useState("1");
  const [discount, setDiscount] = useState("0");

  const [payInternet, setPayInternet] = useState(false);
  const [includeTax, setIncludeTax] = useState(true);
  const [taxPercent, setTaxPercent] = useState("18");
  const [courseSharing, setCourseSharing] = useState(false);
  const [offlineMaterial, setOfflineMaterial] = useState(false);
  const [allowOffline, setAllowOffline] = useState(false);
  const [pdfApp, setPdfApp] = useState(false);
  const [pdfWeb, setPdfWeb] = useState(false);
  const [allowLive, setAllowLive] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [markNew, setMarkNew] = useState(false);
  const [webVideos, setWebVideos] = useState(false);
  const [restrictVideos, setRestrictVideos] = useState(false);
  const [allowTrial, setAllowTrial] = useState(false);
  const [allowPreview, setAllowPreview] = useState(true);
  const [bundleIds, setBundleIds] = useState<string[]>([]);

  const thumbInput = useRef<HTMLInputElement>(null);
  const paid = courseType === "PAID";
  const basePrice = Math.max(0, Number(fees || 0) - Number(discount || 0));
  const internetFee = payInternet ? 0 : 0.05;
  const taxed = includeTax ? 0 : (basePrice + internetFee) * (Number(taxPercent) / 100);
  const effective = paid ? Math.round((basePrice + internetFee + taxed) * 100) / 100 : 0;

  const durationMonths = useMemo(() => {
    const n = Number(validityValue) || 1;
    if (validityType === "LIFETIME") return 1200;
    if (validityUnit === "YEAR") return n * 12;
    if (validityUnit === "DAY") return Math.max(1, Math.round(n / 30));
    return n;
  }, [validityType, validityValue, validityUnit]);

  function payload(published: boolean) {
    const primary = categoryRows[0];
    return {
      code: draft?.code || `CRS-${Date.now().toString().slice(-6)}`,
      name,
      description,
      thumbnailUrl,
      category: primary?.category || "Others",
      subCategory: primary?.subCategory || "Others",
      courseType,
      fees: paid ? Number(fees) : 0,
      discount: paid ? Number(discount) : 0,
      validityType,
      validityValue: Number(validityValue) || 1,
      validityUnit,
      durationMonths,
      published,
      featured,
      allowOffline,
      allowTrial,
      allowPreview,
      allowLive,
      active: true,
    };
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function persist(published = false) {
    const body = payload(published);
    if (draft) {
      const updated = await updateRecord<Draft>(`/api/courses/${draft.id}`, body);
      setDraft(updated);
      return updated;
    }
    const created = await createRecord<Draft>("/api/courses", body);
    setDraft(created);
    return created;
  }

  async function goNext() {
    if (step === 0 && !name.trim()) {
      setError("Enter a course name to continue.");
      return;
    }
    await run(async () => {
      if (step <= 1) await persist(false);
      setStep((s) => Math.min(s + 1, 3));
    });
  }

  async function publish() {
    await run(async () => {
      await persist(true);
      navigate("/courses");
    });
  }

  async function onThumb(file: File | undefined) {
    if (!file) return;
    await run(async () => {
      const stored = await uploadContentFile(file, { title: `${name || "Course"} thumbnail`, contentType: "IMAGE" });
      if (stored.url) setThumbnailUrl(stored.url);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-navy">Create Course</h1>
          <p className="mt-1 text-sm text-slate-500">Add / view content of your course.</p>
        </div>
        <UserMenu />
      </div>

      <Stepper step={step} onJump={(i) => i <= step && setStep(i)} />
      <ErrorText error={error} />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        {step === 0 && (
          <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
            <div className="space-y-5 p-6 sm:p-8">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Name</span>
                <input
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="Enter course name."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Description</span>
                <textarea
                  className="mt-1.5 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
                  placeholder="Enter course description here."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <div>
                <p className="text-sm font-medium text-slate-700">Add Thumbnail</p>
                <input ref={thumbInput} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onThumb(e.target.files?.[0])} />
                <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand" onClick={() => thumbInput.current?.click()}>
                  <UploadIcon /> Upload thumbnail image
                </button>
                {thumbnailUrl && <p className="mt-1 truncate text-xs text-slate-500">{thumbnailUrl}</p>}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="text-amber-400">💡</span> Recommended Image Size: 800px x 600px, PNG or JPEG file.
                </p>
              </div>
              {categoryRows.map((row, i) => (
                <div key={i} className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Category</span>
                    <select
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                      value={row.category}
                      onChange={(e) => {
                        const next = [...categoryRows];
                        next[i] = { category: e.target.value, subCategory: "" };
                        setCategoryRows(next);
                      }}
                    >
                      <option value="">Select category.</option>
                      {Object.keys(CATEGORIES).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium text-slate-700">Sub Category</span>
                    <select
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                      value={row.subCategory}
                      onChange={(e) => {
                        const next = [...categoryRows];
                        next[i] = { ...next[i], subCategory: e.target.value };
                        setCategoryRows(next);
                      }}
                    >
                      <option value="">Select Sub category.</option>
                      {(CATEGORIES[row.category] ?? ["Others"]).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="text-sm font-medium text-brand"
                onClick={() => setCategoryRows((rows) => [...rows, { category: "", subCategory: "" }])}
              >
                + Add Another Category
              </button>
            </div>
            <aside className="border-t border-line bg-[#f4f8fc] p-6 lg:border-l lg:border-t-0">
              <h3 className="font-semibold text-navy">Features</h3>
              <ul className="mt-4 space-y-3">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                      <svg viewBox="0 0 20 20" className="h-3 w-3" aria-hidden>
                        <path fill="currentColor" d="M7.7 13.3 4.4 10l-1.4 1.4 4.7 4.7L17 6.8 15.6 5.4z" />
                      </svg>
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
            <div className="space-y-6 p-6 sm:p-8">
              <div>
                <p className="text-sm font-semibold text-navy">Course Type</p>
                <div className="mt-3 flex flex-wrap gap-6 text-sm">
                  <Radio checked={paid} onChange={() => setCourseType("PAID")} label="Paid Course" />
                  <label className="inline-flex items-center gap-2">
                    <Radio checked={!paid} onChange={() => setCourseType("FREE")} label="Free Course" />
                    <span className="text-brand" title="Students can enroll without paying.">
                      ⓘ
                    </span>
                  </label>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-navy">Course Duration Type</p>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                  value={validityType}
                  onChange={(e) => setValidityType(e.target.value)}
                >
                  <option value="SINGLE">Single Validity</option>
                  <option value="MULTIPLE">Multiple Validity</option>
                  <option value="LIFETIME">Lifetime Validity</option>
                  <option value="EXPIRY_DATE">Course Expiry Date</option>
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  {validityType === "SINGLE" && "Course will expire after a fixed period of time for all students based on their purchase date."}
                  {validityType === "MULTIPLE" && "Offer more than one validity option at checkout so students can pick how long they need access."}
                  {validityType === "LIFETIME" && "Students keep access to this course with no expiry."}
                  {validityType === "EXPIRY_DATE" && "Every student loses access on the same calendar date, regardless of when they purchased."}
                </p>
                {validityType !== "LIFETIME" && (
                  <div className="mt-3 grid max-w-md grid-cols-[1fr_1fr] gap-3">
                    <input
                      className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand"
                      value={validityValue}
                      onChange={(e) => setValidityValue(e.target.value)}
                    />
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand"
                      value={validityUnit}
                      onChange={(e) => setValidityUnit(e.target.value)}
                    >
                      <option value="DAY">Day(s)</option>
                      <option value="MONTH">Month(s)</option>
                      <option value="YEAR">Year(s)</option>
                    </select>
                  </div>
                )}
              </div>
              {paid && (
                <div>
                  <p className="text-sm font-semibold text-navy">Price Details</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <PriceField label="Price" value={fees} onChange={setFees} />
                    <PriceField label="Discount" value={discount} onChange={setDiscount} />
                    <label className="block text-sm">
                      <span className="text-slate-600">Effective Price</span>
                      <input className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" value={`₹ ${effective}`} readOnly />
                    </label>
                  </div>
                </div>
              )}
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  className="rounded-full border border-brand px-5 py-2 text-sm font-medium text-brand"
                  onClick={() => setAdvancedOpen(true)}
                >
                  Advanced Settings
                </button>
              </div>
            </div>
            <aside className="border-t border-line bg-[#f4f8fc] p-6 lg:border-l lg:border-t-0">
              <h3 className="font-semibold text-navy">What is Course Validity?</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Validity is the predefined time period students can access this course after purchase. Choose{" "}
                <span className="font-medium text-sky-700">single validity</span>,{" "}
                <span className="font-medium text-sky-700">multiple validity</span>,{" "}
                <span className="font-medium text-sky-700">lifetime validity</span>, or a{" "}
                <span className="font-medium text-sky-700">set expiry date</span>.
              </p>
            </aside>
          </div>
        )}

        {step === 2 && (
          draft ? (
            <CourseContentPanel courseId={draft.id} />
          ) : (
            <p className="p-8 text-sm text-slate-500">Save the previous steps first, then add folders, videos, PDFs, and tests.</p>
          )
        )}

        {step === 3 && (
          <div className="space-y-4 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-navy">Bundle (Optional)</h2>
            <p className="text-sm text-slate-500">
              Group this course with others so students can buy them together. You can skip this and publish now.
            </p>
            <div className="divide-y divide-line rounded-xl border border-line">
              {(courses.data ?? [])
                .filter((c) => c.id !== draft?.id)
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      checked={bundleIds.includes(c.id)}
                      onChange={() => setBundleIds((ids) => (ids.includes(c.id) ? ids.filter((id) => id !== c.id) : [...ids, c.id]))}
                    />
                    {c.name}
                  </label>
                ))}
              {(courses.data ?? []).filter((c) => c.id !== draft?.id).length === 0 && (
                <p className="px-4 py-6 text-sm text-slate-500">No other courses yet. Publish this one, then bundle later.</p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line px-4 py-4 sm:px-8">
          {step > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand"
              onClick={() => setStep((s) => s - 1)}
            >
              ← Previous
            </button>
          ) : (
            <Link to="/courses" className="text-sm text-slate-500 hover:text-navy">
              Cancel
            </Link>
          )}
          {step < 3 ? (
            <button
              type="button"
              disabled={busy || (step === 0 && !name.trim())}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={step === 2 ? publish : goNext}
            >
              {step === 2 ? "Publish" : "Next"} →
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={publish}
            >
              Publish →
            </button>
          )}
        </div>
      </div>

      {step === 2 && (
        <p className="text-center text-xs text-slate-500">
          Bundle is optional.{" "}
          <button type="button" className="font-medium text-brand" onClick={() => setStep(3)}>
            Add a bundle →
          </button>
        </p>
      )}

      <button type="button" className="text-sm text-brand" onClick={() => setShowHelp((v) => !v)}>
        {showHelp ? "Hide tips" : "Learn how →"}
      </button>
      {showHelp && (
        <p className="text-sm text-slate-500">
          Fill basic details, set price and validity, add folders or videos, then publish. Unpublished courses stay on Your Courses until you publish them.
        </p>
      )}

      {advancedOpen && (
        <AdvancedSettings
          values={{
            payInternet,
            includeTax,
            taxPercent,
            courseSharing,
            offlineMaterial,
            allowOffline,
            pdfApp,
            pdfWeb,
            allowLive,
            featured,
            markNew,
            webVideos,
            restrictVideos,
            allowTrial,
            allowPreview,
          }}
          onChange={(key, value) => {
            const map: Record<string, (v: boolean | string) => void> = {
              payInternet: (v) => setPayInternet(Boolean(v)),
              includeTax: (v) => setIncludeTax(Boolean(v)),
              taxPercent: (v) => setTaxPercent(String(v)),
              courseSharing: (v) => setCourseSharing(Boolean(v)),
              offlineMaterial: (v) => setOfflineMaterial(Boolean(v)),
              allowOffline: (v) => setAllowOffline(Boolean(v)),
              pdfApp: (v) => setPdfApp(Boolean(v)),
              pdfWeb: (v) => setPdfWeb(Boolean(v)),
              allowLive: (v) => setAllowLive(Boolean(v)),
              featured: (v) => setFeatured(Boolean(v)),
              markNew: (v) => setMarkNew(Boolean(v)),
              webVideos: (v) => setWebVideos(Boolean(v)),
              restrictVideos: (v) => setRestrictVideos(Boolean(v)),
              allowTrial: (v) => setAllowTrial(Boolean(v)),
              allowPreview: (v) => setAllowPreview(Boolean(v)),
            };
            map[key]?.(value);
          }}
          onClose={() => setAdvancedOpen(false)}
        />
      )}
    </div>
  );
}

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex items-start justify-between gap-2">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : done || active ? "bg-brand" : "bg-slate-200"}`} />
              <button
                type="button"
                onClick={() => onJump(i)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  done ? "bg-brand text-white" : active ? "bg-sky-100 text-brand" : "border border-slate-300 bg-white text-slate-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </button>
              <div className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "bg-transparent" : done ? "bg-brand" : "bg-slate-200"}`} />
            </div>
            <span className={`mt-2 text-center text-xs sm:text-sm ${active ? "font-semibold text-navy" : "text-slate-500"}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" className="inline-flex items-center gap-2" onClick={onChange}>
      <span className={`grid h-4 w-4 place-items-center rounded-full border ${checked ? "border-brand" : "border-slate-400"}`}>
        {checked && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      {label}
    </button>
  );
}

function PriceField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="mt-1 flex items-center rounded-lg border border-slate-200 px-3 py-2.5">
        <span className="mr-1 text-slate-500">₹</span>
        <input className="w-full text-sm outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-slate-300"}`}
      onClick={() => onChange(!on)}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-5" : "left-0.5"}`} />
    </button>
  );
}

function SettingCard({
  title,
  hint,
  on,
  onChange,
  children,
}: {
  title: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[#eef5fb] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-navy">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{hint}</p>
        </div>
        <Toggle on={on} onChange={onChange} />
      </div>
      {children}
    </div>
  );
}

function AdvancedSettings({
  values,
  onChange,
  onClose,
}: {
  values: Record<string, boolean | string>;
  onChange: (key: string, value: boolean | string) => void;
  onClose: () => void;
}) {
  const b = (k: string) => Boolean(values[k]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-navy">Advanced Settings</h2>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-full border border-line" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <SettingCard title="Internet Handling Charges" hint="Switch ON to pay internet charges yourself (₹ 0.05)" on={b("payInternet")} onChange={(v) => onChange("payInternet", v)} />
          <SettingCard title="Tax Details" hint="Switch ON to include taxes in this course" on={b("includeTax")} onChange={(v) => onChange("includeTax", v)}>
            {b("includeTax") && (
              <select
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={String(values.taxPercent)}
                onChange={(e) => onChange("taxPercent", e.target.value)}
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
              </select>
            )}
          </SettingCard>
          <SettingCard title="Course Sharing" hint="Switch ON to make this course visible globally and earn commissions" on={b("courseSharing")} onChange={(v) => onChange("courseSharing", v)} />
          <SettingCard title="Course Has Offline Material For Shipment" hint="Switch ON to collect student addresses for physical material" on={b("offlineMaterial")} onChange={(v) => onChange("offlineMaterial", v)} />
          <SettingCard title="Offline Download Of Videos" hint="Switch ON to allow mobile app offline access" on={b("allowOffline")} onChange={(v) => onChange("allowOffline", v)} />
          <SettingCard title="PDF Download Permissions in APP" hint="Switch ON to allow PDF downloads in the app" on={b("pdfApp")} onChange={(v) => onChange("pdfApp", v)} />
          <SettingCard title="PDF permissions on Web" hint="Switch ON to allow PDF access on web" on={b("pdfWeb")} onChange={(v) => onChange("pdfWeb", v)} />
          <SettingCard title="LIVE Classes" hint="Switch ON to conduct live classes in this course" on={b("allowLive")} onChange={(v) => onChange("allowLive", v)} />
          <SettingCard title="Mark as Featured" hint="Switch ON to show this course on the student home screen" on={b("featured")} onChange={(v) => onChange("featured", v)} />
          <SettingCard title="Mark as New" hint="Switch ON to show a NEW tag on this course" on={b("markNew")} onChange={(v) => onChange("markNew", v)} />
          <SettingCard title="Promote with trial" hint="Switch ON to let students try this course before buying" on={b("allowTrial")} onChange={(v) => onChange("allowTrial", v)} />
          <SettingCard title="Allow course preview" hint="Switch ON to let visitors preview selected lessons" on={b("allowPreview")} onChange={(v) => onChange("allowPreview", v)} />
          <div className="rounded-xl bg-[#eef5fb] p-4">
            <p className="font-semibold text-navy">Add Restrictions To Videos</p>
            <div className="mt-3 flex items-start justify-between gap-4">
              <p className="text-sm text-slate-500">Switch ON, in case you want to allow the videos of this course to be viewed on web as well</p>
              <Toggle on={b("webVideos")} onChange={(v) => onChange("webVideos", v)} />
            </div>
            <div className="mt-3 flex items-start justify-between gap-4">
              <p className="text-sm text-slate-500">Switch ON, in case you want to add restrictions to the videos of this course</p>
              <Toggle on={b("restrictVideos")} onChange={(v) => onChange("restrictVideos", v)} />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" /> Update existing videos
            </label>
          </div>
        </div>
        <div className="border-t border-line px-5 py-4 text-right">
          <button type="button" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={onClose}>
            Save Advanced Settings
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M11 16V7.8L8.4 10.4 7 9l5-5 5 5-1.4 1.4L13 7.8V16h-2ZM4 18h16v2H4v-2Z" />
    </svg>
  );
}
