import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fileSrc } from "../api";
import { createRecord, ensureWebsitePublished, updateRecord, uploadContentFile } from "../ops";
import { ErrorText, useApi } from "../ui";
import { UserMenu } from "../UserMenu";
import { CourseContentPanel } from "./courseContent";

type Draft = {
  id: string;
  name: string;
  code?: string;
  published?: boolean;
  description?: string;
  thumbnailUrl?: string;
  category?: string;
  subCategory?: string;
  courseType?: string;
  validityType?: string;
  validityValue?: number;
  validityUnit?: string;
  fees?: number;
  feesAlt?: number;
  validityAltValue?: number;
  validityAltUnit?: string;
  discount?: number;
  allowOffline?: boolean;
  allowTrial?: boolean;
  allowPreview?: boolean;
  allowLive?: boolean;
  featured?: boolean;
  bundleCsv?: string;
};

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

export function CreateCourseWizard() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const courses = useApi<Draft[]>("/api/courses");
  const terms = useApi<{ id: string; name: string }[]>("/api/terms");
  const editing = Boolean(courseId);
  const [loaded, setLoaded] = useState(false);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const thumbnailRef = useRef("");
  const [categoryRows, setCategoryRows] = useState([{ category: "", subCategory: "" }]);

  const [courseType, setCourseType] = useState<"PAID" | "FREE">("PAID");
  const [validityType, setValidityType] = useState("SINGLE");
  const [validityValue, setValidityValue] = useState("1");
  const [validityUnit, setValidityUnit] = useState("YEAR");
  const [fees, setFees] = useState("");
  const [feesAlt, setFeesAlt] = useState("");
  const [validityAltValue, setValidityAltValue] = useState("12");
  const [validityAltUnit, setValidityAltUnit] = useState("MONTH");
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
  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [installmentCount, setInstallmentCount] = useState("3");
  const [featured, setFeatured] = useState(false);
  const [markNew, setMarkNew] = useState(false);
  const [webVideos, setWebVideos] = useState(false);
  const [restrictVideos, setRestrictVideos] = useState(false);
  const [allowTrial, setAllowTrial] = useState(false);
  const [allowPreview, setAllowPreview] = useState(true);
  const [bundleIds, setBundleIds] = useState<string[]>([]);

  const thumbInput = useRef<HTMLInputElement>(null);
  const madePlan = useRef(false);

  useEffect(() => {
    if (!courseId || loaded || !courses.data) return;
    const existing = courses.data.find((c) => c.id === courseId);
    if (!existing) {
      setError("This course was not found.");
      setLoaded(true);
      return;
    }
    setDraft(existing);
    setName(existing.name || "");
    setDescription(existing.description || "");
    setThumbnailUrl(existing.thumbnailUrl || "");
    thumbnailRef.current = existing.thumbnailUrl || "";
    setCategoryRows([{ category: existing.category || "", subCategory: existing.subCategory || "" }]);
    setCourseType(existing.courseType === "FREE" ? "FREE" : "PAID");
    setValidityType(existing.validityType || "SINGLE");
    setValidityValue(String(existing.validityValue || 1));
    setValidityUnit(existing.validityUnit || "MONTH");
    setFees(String(existing.fees ?? 0));
    setFeesAlt(existing.feesAlt != null ? String(existing.feesAlt) : "");
    setValidityAltValue(String(existing.validityAltValue || 12));
    setValidityAltUnit(existing.validityAltUnit || "MONTH");
    setDiscount(String(existing.discount ?? 0));
    setAllowOffline(Boolean(existing.allowOffline));
    setAllowTrial(Boolean(existing.allowTrial));
    setAllowPreview(existing.allowPreview !== false);
    setAllowLive(Boolean(existing.allowLive));
    setFeatured(Boolean(existing.featured));
    setBundleIds((existing.bundleCsv || "").split(",").filter(Boolean));
    setLoaded(true);
  }, [courseId, courses.data, loaded]);

  const paid = courseType === "PAID";
  const listPrice = Math.max(0, Number(fees || 0));
  const discountAmt = Math.max(0, Number(discount || 0));
  const afterDiscount = Math.max(0, listPrice - discountAmt);
  const gst = includeTax ? 0 : afterDiscount * (Number(taxPercent || 0) / 100);
  const effective = paid ? Math.round((afterDiscount + gst) * 100) / 100 : 0;

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
      thumbnailUrl: thumbnailRef.current || thumbnailUrl,
      category: primary?.category || "Others",
      subCategory: primary?.subCategory || "Others",
      courseType,
      fees: paid ? Number(fees) : 0,
      feesAlt: paid && validityType === "MULTIPLE" && feesAlt ? Number(feesAlt) : null,
      validityAltValue: validityType === "MULTIPLE" ? Number(validityAltValue) || 12 : null,
      validityAltUnit: validityType === "MULTIPLE" ? validityAltUnit : null,
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
      bundleCsv: bundleIds.join(","),
      active: true,
      termId: terms.data?.[0]?.id || null,
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

  const live = draft !== null && draft.published !== false;

  async function persist(published = false) {
    const body = payload(published);
    const createdOrUpdated = draft
      ? await updateRecord<Draft>(`/api/courses/${draft.id}`, { ...draft, ...body })
      : await createRecord<Draft>("/api/courses", body);
    setDraft(createdOrUpdated);
    if (installmentsOn && paid && createdOrUpdated.id && !madePlan.current) {
      madePlan.current = true;
      await createRecord("/api/fee-plans", {
        name: `${name} installments`,
        totalAmount: Number(fees),
        gstRate: includeTax ? Number(taxPercent) : 0,
        installmentCount: Number(installmentCount) || 3,
        courseId: createdOrUpdated.id,
        hsn: "9992",
        sacCode: "999293",
      });
    }
    return createdOrUpdated;
  }

  async function goNext() {
    if (step === 0 && !name.trim()) {
      setError("Enter a course name to continue.");
      return;
    }
    await run(async () => {
      if (step === 0) await persist(false);
      if (step === 1) {
        if (paid && !(Number(fees) > 0)) {
          throw new Error("Enter a price greater than 0, or mark the course as free.");
        }
        await persist(live);
      }
      if (step >= 2) await persist(live);
      setStep((s) => Math.min(s + 1, 3));
    });
  }

  async function publish() {
    await run(async () => {
      const saved = await persist(true);
      try {
        await ensureWebsitePublished();
      } catch {
        /* course is published even if the website flag cannot be updated */
      }
      navigate(`/courses/${saved.id}?share=1`);
    });
  }

  async function onThumb(file: File | undefined) {
    if (!file) return;
    await run(async () => {
      const stored = await uploadContentFile(file, { title: `${name || "Course"} thumbnail`, contentType: "IMAGE" });
      const url = stored.url;
      if (!url) throw new Error("Thumbnail uploaded, but no file URL was returned. Try another image.");
      thumbnailRef.current = url;
      setThumbnailUrl(url);
      if (draft) {
        const updated = await updateRecord<Draft>(`/api/courses/${draft.id}`, { ...draft, ...payload(live), thumbnailUrl: url });
        setDraft(updated);
      }
    });
  }

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight text-navy">{editing || draft ? (live ? "Edit Course" : "Finish Course") : "Create Course"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {live
              ? "Update thumbnail, price, or content. Changes apply as soon as you save."
              : "Finish setup, then publish. Students cannot see an unpublished course."}
          </p>
        </div>
        <UserMenu />
      </div>

      <Stepper step={step} onJump={(i) => i <= step && setStep(i)} />
      <ErrorText error={error} />

      <div className="min-w-0 overflow-x-hidden rounded-2xl border border-line bg-white shadow-sm">
        {step === 0 && (
          <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 space-y-5 p-5 sm:p-8">
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
                {thumbnailUrl && (
                  <div className="mt-3 max-w-xs overflow-hidden rounded-lg border border-line">
                    <img src={fileSrc(thumbnailUrl)} alt="Course thumbnail" className="h-36 w-full object-cover" />
                    <div className="flex items-center justify-between px-2 py-1">
                      <p className="text-xs text-slate-500">Thumbnail uploaded</p>
                      <button
                        type="button"
                        className="text-xs text-brand hover:underline"
                        onClick={() => thumbInput.current?.click()}
                      >
                        Replace
                      </button>
                    </div>
                  </div>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="text-amber-400">💡</span> Recommended Image Size: 800px x 600px, PNG or JPEG file.
                </p>
              </div>
              {categoryRows.map((row, i) => (
                <div key={i} className="grid min-w-0 gap-3 sm:grid-cols-2">
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
            <aside className="min-w-0 border-t border-line bg-[#f4f8fc] p-5 xl:border-l xl:border-t-0">
              <h3 className="font-semibold text-navy">Course options</h3>
              <ul className="mt-4 space-y-3">
                <li className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span>Offline download</span>
                  <Toggle on={allowOffline} onChange={setAllowOffline} />
                </li>
                <li className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span>Create installments</span>
                  <Toggle on={installmentsOn} onChange={setInstallmentsOn} />
                </li>
                {installmentsOn && (
                  <li>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={installmentCount}
                      onChange={(e) => setInstallmentCount(e.target.value)}
                      placeholder="Number of installments"
                    />
                  </li>
                )}
                <li className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span>Trial before buying</span>
                  <Toggle on={allowTrial} onChange={setAllowTrial} />
                </li>
                <li className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span>Live classes</span>
                  <Toggle on={allowLive} onChange={setAllowLive} />
                </li>
                <li className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span>Course preview</span>
                  <Toggle on={allowPreview} onChange={setAllowPreview} />
                </li>
                <li className="flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span>Limit access (validity)</span>
                  <span className="text-xs text-slate-500">{validityType === "LIFETIME" ? "Off" : "On in price step"}</span>
                </li>
              </ul>
            </aside>
          </div>
        )}

        {step === 1 && (
          <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 space-y-6 p-5 sm:p-8">
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
                {validityType === "MULTIPLE" && paid && (
                  <div className="mt-4 rounded-xl bg-[#eef5fb] p-4">
                    <p className="text-sm font-semibold text-navy">Second checkout option</p>
                    <p className="mt-1 text-xs text-slate-500">Students pick this or the first duration/price on the website.</p>
                    <div className="mt-3 grid max-w-md grid-cols-[1fr_1fr] gap-3">
                      <input className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm" value={validityAltValue} onChange={(e) => setValidityAltValue(e.target.value)} />
                      <select className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" value={validityAltUnit} onChange={(e) => setValidityAltUnit(e.target.value)}>
                        <option value="DAY">Day(s)</option>
                        <option value="MONTH">Month(s)</option>
                        <option value="YEAR">Year(s)</option>
                      </select>
                    </div>
                    <input className="mt-3 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2.5 text-sm" value={feesAlt} onChange={(e) => setFeesAlt(e.target.value)} placeholder="Price for this option (₹)" />
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
                      <input className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" value={`₹${effective.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} readOnly />
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
            <aside className="min-w-0 border-t border-line bg-[#f4f8fc] p-5 xl:border-l xl:border-t-0">
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4 sm:px-8">
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
            <div className="flex flex-wrap items-center gap-2">
              {step >= 2 && !live && (
                <button type="button" disabled={busy || !draft} className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand disabled:opacity-50" onClick={publish}>
                  Publish without bundle
                </button>
              )}
              <button
                type="button"
                disabled={busy || (step === 0 && !name.trim())}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={goNext}
              >
                Next →
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} className="text-sm text-slate-500 hover:text-navy" onClick={publish}>
                Skip bundle
              </button>
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={publish}
              >
                {live ? "Save & share" : "Publish"} →
              </button>
            </div>
          )}
        </div>
      </div>

      {step === 2 && (
        <p className="text-center text-xs text-slate-500">You can publish from this step. Bundle is optional.</p>
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
    <ol className="flex min-w-0 items-start justify-between gap-1 sm:gap-2">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 min-w-0 flex-1 ${i === 0 ? "bg-transparent" : done || active ? "bg-brand" : "bg-slate-200"}`} />
              <button
                type="button"
                onClick={() => onJump(i)}
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold sm:h-9 sm:w-9 ${
                  done ? "bg-brand text-white" : active ? "bg-sky-100 text-brand" : "border border-slate-300 bg-white text-slate-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </button>
              <div className={`h-0.5 min-w-0 flex-1 ${i === STEPS.length - 1 ? "bg-transparent" : done ? "bg-brand" : "bg-slate-200"}`} />
            </div>
            <span className={`mt-2 max-w-full px-0.5 text-center text-[11px] leading-tight sm:text-sm ${active ? "font-semibold text-navy" : "text-slate-500"}`}>
              {label}
            </span>
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
        <input className="w-full text-sm outline-none" placeholder="0" value={value} onChange={(e) => onChange(e.target.value)} />
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
          <SettingCard title="Tax Details" hint="Switch ON to include GST in the fee plan when you create installments" on={b("includeTax")} onChange={(v) => onChange("includeTax", v)}>
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
          <SettingCard title="Offline Download Of Videos" hint="Students can download videos in the student app" on={b("allowOffline")} onChange={(v) => onChange("allowOffline", v)} />
          <SettingCard title="LIVE Classes" hint="You can schedule live classes for this course" on={b("allowLive")} onChange={(v) => onChange("allowLive", v)} />
          <SettingCard title="Mark as Featured" hint="Show this course first on the student catalog" on={b("featured")} onChange={(v) => onChange("featured", v)} />
          <SettingCard title="Promote with trial" hint="Let students try this course before buying" on={b("allowTrial")} onChange={(v) => onChange("allowTrial", v)} />
          <SettingCard title="Allow course preview" hint="Let visitors preview selected lessons" on={b("allowPreview")} onChange={(v) => onChange("allowPreview", v)} />
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
