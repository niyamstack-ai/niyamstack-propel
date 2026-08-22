import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createRecord, deleteRecord, updateRecord } from "../ops";
import { fileSrc } from "../api";
import { useAuth } from "../auth";
import { UserMenu } from "../UserMenu";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, useApi } from "../ui";
import { ShareLinkBar } from "../shareLink";

export type Course = {
  id: string;
  code: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  category?: string;
  subCategory?: string;
  courseType?: string;
  validityType?: string;
  validityValue?: number;
  validityUnit?: string;
  fees: number;
  discount?: number;
  durationMonths?: number;
  published?: boolean;
  featured?: boolean;
  allowOffline?: boolean;
  allowTrial?: boolean;
  allowPreview?: boolean;
  allowLive?: boolean;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type Coupon = {
  id: string;
  code: string;
  name?: string;
  discountType: string;
  discountValue: number;
  courseId?: string;
  live: boolean;
  redeemedCount?: number;
};

type Addition = {
  id: string;
  courseId?: string;
  studentId?: string;
  studentName?: string;
  studentPhone?: string;
  studentEmail?: string;
  note?: string;
  status: string;
};

type Student = { id: string; fullName: string; phone?: string; email?: string };

const COVERS = [
  "bg-gradient-to-br from-[#163a66] to-[#0b2744]",
  "bg-gradient-to-r from-[#ec4899] via-[#f97316] to-[#facc15]",
  "bg-gradient-to-br from-[#38bdf8] to-[#0284c7]",
  "bg-gradient-to-br from-[#7c3aed] to-[#4c1d95]",
  "bg-gradient-to-br from-[#0ea5e9] to-[#0369a1]",
  "bg-gradient-to-br from-[#059669] to-[#064e3b]",
  "bg-gradient-to-br from-[#dc2626] to-[#7f1d1d]",
  "bg-gradient-to-br from-[#4f46e5] to-[#1e1b4b]",
];

function coverClass(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

export function formatDuration(c: Course) {
  if (c.validityType === "LIFETIME") return "Lifetime";
  const n = c.validityValue || c.durationMonths;
  if (!n) return null;
  const unit = (c.validityUnit || "MONTH").toUpperCase();
  const word = unit.startsWith("YEAR") ? (n === 1 ? "year" : "years") : unit.startsWith("DAY") ? (n === 1 ? "day" : "days") : n === 1 ? "month" : "months";
  return `${n} ${word}`;
}

function formatFees(c: Course) {
  if (c.courseType === "FREE" || Number(c.fees) === 0) return "Free";
  return `₹${Number(c.fees).toLocaleString("en-IN")}`;
}

function createdByLine(role?: string) {
  if (role === "STUDENT") return "Purchased by you";
  if (role === "FACULTY") return "You (faculty)";
  return "";
}

function courseName(c: { name?: string }) {
  return (c.name || "").trim() || "Untitled course";
}

export function CoursesCommercePage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <PurchasedCourses />;
  if (user?.role === "FACULTY") return <TaughtCourses />;
  return <OwnerCourses />;
}

function CourseCards({ subtitle, actionLabel }: { subtitle: string; actionLabel: string }) {
  const courses = useApi<Course[]>("/api/courses");
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const list = courses.data ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((c) => courseName(c).toLowerCase().includes(s) || c.code?.toLowerCase().includes(s));
  }, [courses.data, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-navy">
            Your Courses{courses.data ? ` (${courses.data.length})` : ""}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <UserMenu />
      </div>
      <SearchBar value={q} onChange={setQ} />
      <ErrorText error={courses.error} />
      {!courses.data && !courses.error ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <CourseGrid
          courses={filtered}
          empty={courses.error ? "Could not load courses." : q.trim() ? `No courses match “${q.trim()}”.` : "No courses yet."}
          actionLabel={actionLabel}
        />
      )}
    </div>
  );
}

function PurchasedCourses() {
  return <CourseCards subtitle="Open a course you purchased to see videos, PDFs, and quizzes." actionLabel="Open course" />;
}

function TaughtCourses() {
  return <CourseCards subtitle="Open a course to add content, quizzes, and grade work." actionLabel="Teach this course" />;
}

function OwnerCourses() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view");
  const courses = useApi<Course[]>("/api/courses");
  const coupons = useApi<Coupon[]>("/api/coupons");
  const additions = useApi<Addition[]>("/api/backend-additions");
  const students = useApi<Student[]>("/api/students");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterWrap = useRef<HTMLDivElement>(null);

  const [couponCode, setCouponCode] = useState("");
  const [couponName, setCouponName] = useState("");
  const [couponType, setCouponType] = useState("PERCENT");
  const [couponValue, setCouponValue] = useState("10");
  const [couponCourse, setCouponCourse] = useState("");
  const [couponStart, setCouponStart] = useState("");
  const [couponEnd, setCouponEnd] = useState("");
  const [couponMax, setCouponMax] = useState("");

  const [addCourse, setAddCourse] = useState("");
  const [addStudent, setAddStudent] = useState("");
  const [addNote, setAddNote] = useState("");

  const listTab = params.get("tab") === "unpublished" ? "unpublished" : "published";
  const publishedCount = (courses.data ?? []).filter((c) => c.published !== false).length;
  const unpublishedCount = (courses.data ?? []).filter((c) => c.published === false).length;
  const helpOpen = params.get("view") === "help";
  const loadingList = !courses.data && !courses.error;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!filterWrap.current?.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    let list = [...(courses.data ?? [])];
    if (listTab === "unpublished") list = list.filter((c) => c.published === false);
    else list = list.filter((c) => c.published !== false);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((c) => courseName(c).toLowerCase().includes(s) || c.code?.toLowerCase().includes(s));
    if (filter === "featured") list = list.filter((c) => c.featured);
    if (filter === "paid") list = list.filter((c) => (c.courseType || "PAID") !== "FREE");
    if (filter === "free") list = list.filter((c) => c.courseType === "FREE");
    if (sort === "name") list.sort((a, b) => courseName(a).localeCompare(courseName(b)));
    if (sort === "price-asc") list.sort((a, b) => Number(a.fees) - Number(b.fees));
    if (sort === "price-desc") list.sort((a, b) => Number(b.fees) - Number(a.fees));
    if (sort === "recent") {
      list.sort((a, b) => (b.createdAt || b.updatedAt || "").localeCompare(a.createdAt || a.updatedAt || ""));
    }
    return list;
  }, [courses.data, q, sort, filter, listTab]);

  function patchParams(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next);
  }

  function setListTab(tab: "published" | "unpublished") {
    patchParams((next) => {
      next.delete("view");
      if (tab === "unpublished") next.set("tab", "unpublished");
      else next.delete("tab");
    });
  }

  function emptyCopy() {
    if (q.trim()) return `No courses match “${q.trim()}”.`;
    if (filter === "free") return "No free courses in this tab.";
    if (filter === "paid") return "No paid courses in this tab.";
    if (filter === "featured") return "No featured courses in this tab.";
    if (listTab === "unpublished") return "No unpublished courses. Unpublish a live course and it will move here.";
    return "No published courses yet. Create a course and publish it.";
  }

  function courseLabel(id?: string) {
    if (!id) return "All courses";
    return courseName((courses.data ?? []).find((c) => c.id === id) || { name: "—" });
  }

  async function togglePublish(c: Course) {
    try {
      const willUnpublish = c.published !== false;
      if (willUnpublish && !window.confirm(`Unpublish “${courseName(c)}”? Students will not see or buy it until you publish again.`)) {
        return;
      }
      await updateRecord(`/api/courses/${c.id}`, { ...c, published: c.published === false });
      courses.reload();
      setListTab(willUnpublish ? "unpublished" : "published");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleFeatured(c: Course) {
    try {
      await updateRecord(`/api/courses/${c.id}`, { ...c, featured: !c.featured });
      courses.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveCoupon() {
    setError(null);
    const code = couponCode.trim();
    if (!code) {
      setError("Coupon code is required");
      return;
    }
    if (!couponType) {
      setError("Choose a discount type");
      return;
    }
    const value = Number(couponValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Discount value must be greater than 0");
      return;
    }
    if (couponType === "PERCENT" && value > 100) {
      setError("Percent discount must be between 1 and 100");
      return;
    }
    if ((coupons.data ?? []).some((c) => c.code.toLowerCase() === code.toLowerCase())) {
      setError("A coupon with this code already exists");
      return;
    }
    try {
      await createRecord("/api/coupons", {
        code,
        name: couponName.trim() || code,
        discountType: couponType,
        discountValue: value,
        courseId: couponCourse || null,
        live: true,
        redeemedCount: 0,
        startsAt: couponStart ? new Date(couponStart).toISOString() : null,
        endsAt: couponEnd ? new Date(couponEnd).toISOString() : null,
        maxRedemptions: couponMax ? Number(couponMax) : null,
      });
      setCouponCode("");
      setCouponName("");
      setCouponValue("10");
      setCouponType("PERCENT");
      setCouponCourse("");
      setCouponStart("");
      setCouponEnd("");
      setCouponMax("");
      coupons.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeCoupon(id: string) {
    if (!window.confirm("Delete this coupon?")) return;
    setError(null);
    try {
      await deleteRecord(`/api/coupons/${id}`);
      coupons.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addStudentToCourse() {
    setError(null);
    if (!addCourse || !addStudent) {
      setError("Choose a course and a student");
      return;
    }
    if ((additions.data ?? []).some((a) => a.courseId === addCourse && a.studentId === addStudent)) {
      setError("This student is already added to that course");
      return;
    }
    try {
      const st = (students.data ?? []).find((s) => s.id === addStudent);
      await createRecord("/api/backend-additions", {
        courseId: addCourse,
        studentId: addStudent,
        studentName: st?.fullName,
        studentPhone: st?.phone,
        studentEmail: st?.email,
        note: addNote,
        status: "ADDED",
      });
      if (st) {
        await updateRecord(`/api/students/${st.id}`, { ...st, courseId: addCourse, status: "ENROLLED" });
      }
      setAddNote("");
      additions.reload();
      students.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeAddition(id: string) {
    if (!window.confirm("Remove this student from the course list?")) return;
    setError(null);
    try {
      await deleteRecord(`/api/backend-additions/${id}`);
      additions.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (view === "coupons" || view === "backend") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/courses" className="text-sm text-brand hover:underline">
              ← Your Courses
            </Link>
            <h1 className="mt-1 text-[28px] font-bold text-navy">{view === "coupons" ? "Manage coupons" : "Backend addition"}</h1>
          </div>
          <UserMenu />
        </div>
        <ErrorText error={error || (view === "coupons" ? coupons.error : additions.error || students.error)} />
        {view === "coupons" && (
          <Card title="Manage coupons">
            <FormGrid>
              <Field label="Coupon code" value={couponCode} onChange={setCouponCode} />
              <Field label="Name" value={couponName} onChange={setCouponName} />
              <Select
                label="Discount type"
                value={couponType}
                onChange={setCouponType}
                options={[
                  { value: "PERCENT", label: "Percent" },
                  { value: "FLAT", label: "Flat ₹" },
                ]}
              />
              <Field label="Value" value={couponValue} onChange={setCouponValue} />
              <Select
                label="Course (optional)"
                value={couponCourse}
                onChange={setCouponCourse}
                options={(courses.data ?? []).map((c) => ({ value: c.id, label: courseName(c) }))}
              />
              <Field label="Starts" value={couponStart} onChange={setCouponStart} type="date" />
              <Field label="Ends" value={couponEnd} onChange={setCouponEnd} type="date" />
              <Field label="Max uses" value={couponMax} onChange={setCouponMax} placeholder="No limit" />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton disabled={!couponCode.trim()} onClick={saveCoupon}>
                Create coupon
              </PrimaryButton>
            </div>
            <div className="mt-4">
              <Table
                columns={["Code", "Course", "Type", "Value", "Live", "Redeemed", ""]}
                rows={(coupons.data ?? []).map((c) => [
                  c.code,
                  courseLabel(c.courseId),
                  c.discountType,
                  String(c.discountValue),
                  c.live ? "Live" : "Off",
                  String(c.redeemedCount ?? 0),
                  <LinkButton key={c.id} onClick={() => removeCoupon(c.id)}>
                    Delete
                  </LinkButton>,
                ])}
              />
            </div>
          </Card>
        )}
        {view === "backend" && (
          <Card title="Add students directly into courses">
            <FormGrid>
              <Select
                label="Course"
                value={addCourse}
                onChange={setAddCourse}
                options={(courses.data ?? []).map((c) => ({ value: c.id, label: courseName(c) }))}
              />
              <Select
                label="Student"
                value={addStudent}
                onChange={setAddStudent}
                options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
              />
              <Field label="Note" value={addNote} onChange={setAddNote} />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton disabled={!addCourse || !addStudent} onClick={addStudentToCourse}>
                Add student
              </PrimaryButton>
            </div>
            <div className="mt-4">
              <Table
                columns={["Student", "Course", "Phone", "Status", "Note", ""]}
                rows={(additions.data ?? []).map((a) => [
                  a.studentName || "—",
                  courseLabel(a.courseId),
                  a.studentPhone || "—",
                  a.status,
                  a.note || "—",
                  <LinkButton key={a.id} onClick={() => removeAddition(a.id)}>
                    Remove
                  </LinkButton>,
                ])}
              />
            </div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-navy">
            {loadingList
              ? "Your Courses"
              : listTab === "unpublished"
                ? `Unpublished Courses (${unpublishedCount})`
                : `Your Courses (${publishedCount})`}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Add/View courses of your brand{" "}
            <button
              type="button"
              className="font-medium text-brand"
              onClick={() =>
                patchParams((next) => {
                  next.set("view", "help");
                })
              }
            >
              Learn how →
            </button>
          </p>
          {helpOpen && (
            <p className="mt-2 max-w-xl text-sm text-slate-500">
              Create a course, set price and validity, add videos or files, then publish. Students buy it on your website and study inside the course.
              {" "}
              <button
                type="button"
                className="text-brand"
                onClick={() =>
                  patchParams((next) => {
                    next.delete("view");
                  })
                }
              >
                Dismiss
              </button>
            </p>
          )}
        </div>
        <UserMenu />
      </div>

      <div className="flex gap-1 border-b border-line">
        <button
          type="button"
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            listTab === "published" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-navy"
          }`}
          onClick={() => setListTab("published")}
        >
          Published ({loadingList ? "…" : publishedCount})
        </button>
        <button
          type="button"
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            listTab === "unpublished" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-navy"
          }`}
          onClick={() => setListTab("unpublished")}
        >
          Unpublished ({loadingList ? "…" : unpublishedCount})
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar value={q} onChange={setQ} className="min-w-[220px] flex-1" />
        <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-600">
          Sort by
          <select className="bg-transparent font-medium text-navy outline-none" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
        <div className="relative" ref={filterWrap}>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              filter !== "all" && filter !== "featured" ? "border-brand bg-sky-50 text-brand" : "border-line bg-white"
            }`}
            onClick={() => setFilterOpen((v) => !v)}
          >
            <FunnelIcon /> Filter{filter !== "all" && filter !== "featured" ? `: ${filter}` : ""}
          </button>
          {filterOpen && (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-line bg-white py-1 shadow-lg">
              {[
                ["all", "All in this tab"],
                ["paid", "Paid"],
                ["free", "Free"],
                ["featured", "Featured"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm ${filter === id ? "bg-sky-50 text-brand" : "hover:bg-mist"}`}
                  onClick={() => {
                    setFilter(id);
                    setFilterOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
            filter === "featured" ? "border-brand bg-sky-50 text-brand" : "border-brand bg-white text-brand"
          }`}
          onClick={() => setFilter((v) => (v === "featured" ? "all" : "featured"))}
        >
          <StarIcon /> Featured
        </button>
        <button
          type="button"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm"
          onClick={() => navigate("/courses/new")}
        >
          Create Course
        </button>
      </div>

      <ErrorText error={error || courses.error} />

      {loadingList ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <CourseGrid courses={filtered} empty={courses.error ? "Could not load courses." : emptyCopy()} onPublish={togglePublish} onFeature={toggleFeatured} />
      )}

      <p className="text-xs text-slate-400">
        <Link className="hover:text-brand" to="/courses?view=coupons">
          Manage coupons
        </Link>
        {" · "}
        <Link className="hover:text-brand" to="/courses?view=backend">
          Add students to a course
        </Link>
      </p>
    </div>
  );
}

function SearchBar({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`relative block ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        <SearchIcon />
      </span>
      <input
        className="w-full rounded-lg border border-line bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand"
        placeholder="Search by name or code"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function CourseGrid({
  courses,
  empty,
  actionLabel,
  onPublish,
  onFeature,
}: {
  courses: Course[];
  empty: string;
  actionLabel?: string;
  onPublish?: (c: Course) => void;
  onFeature?: (c: Course) => void;
}) {
  if (courses.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {courses.map((c) => (
        <CourseCard key={c.id} course={c} actionLabel={actionLabel} onPublish={onPublish} onFeature={onFeature} />
      ))}
    </div>
  );
}

function CourseCard({
  course: c,
  actionLabel,
  onPublish,
  onFeature,
}: {
  course: Course;
  actionLabel?: string;
  onPublish?: (c: Course) => void;
  onFeature?: (c: Course) => void;
}) {
  const { user } = useAuth();
  const duration = formatDuration(c);
  const price = formatFees(c);
  const title = courseName(c);
  const href = c.published === false ? `/courses/${c.id}/edit` : `/courses/${c.id}`;
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <Link to={href} className="block">
        <div className={`relative h-36 p-4 text-white ${coverClass(c.id + title)}`}>
          {c.thumbnailUrl && (
            <>
              <img src={fileSrc(c.thumbnailUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-black/25" />
            </>
          )}
          {c.published === false && (
            <span className="relative z-10 rounded bg-white/85 px-2 py-0.5 text-[10px] font-medium text-slate-700">Unpublished Course</span>
          )}
          {c.featured && c.published !== false && (
            <span className="relative z-10 rounded bg-amber-300/90 px-2 py-0.5 text-[10px] font-medium text-navy">Featured</span>
          )}
        </div>
      </Link>
      <div className="p-4">
        <Link to={href} className="font-semibold text-navy hover:underline">
          {title}
        </Link>
        <p className="mt-1 text-xs text-slate-500">{createdByLine(user?.role)}</p>
        {duration && <span className="mt-3 inline-block rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">{duration}</span>}
        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="text-lg font-bold text-navy">{price}</p>
          {actionLabel && (
            <Link to={href} className="text-sm font-medium text-brand">
              {actionLabel} →
            </Link>
          )}
        </div>
        {onPublish && onFeature && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={
                c.published === false
                  ? "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy hover:border-brand hover:text-brand"
              }
              onClick={() => onPublish(c)}
            >
              {c.published === false ? "Publish" : "Unpublish"}
            </button>
            <button type="button" className="text-xs text-brand hover:underline" onClick={() => onFeature(c)}>
              {c.featured ? "Remove from featured" : "Show as featured"}
            </button>
            <Link className="text-xs text-brand hover:underline" to={`/courses/${c.id}/edit`}>
              Edit
            </Link>
            <Link className="text-xs text-brand hover:underline" to={href}>
              {c.published === false ? "Continue setup" : "Open course"}
            </Link>
          </div>
        )}
        {c.published !== false && user?.orgSlug && (
          <div className="mt-3">
            <ShareLinkBar slug={user.orgSlug} courseId={c.id} published compact />
          </div>
        )}
      </div>
    </article>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  );
}
function FunnelIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="m12 2 2.9 6.6L22 9.3l-5 4.7 1.4 7-6.4-3.8L5.6 21 7 14 2 9.3l7.1-.7L12 2Z" />
    </svg>
  );
}
