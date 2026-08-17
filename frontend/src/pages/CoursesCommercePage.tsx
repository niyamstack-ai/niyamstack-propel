import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createRecord, updateRecord } from "../ops";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Course = {
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
  studentName?: string;
  studentPhone?: string;
  studentEmail?: string;
  note?: string;
  status: string;
};

type Student = { id: string; fullName: string; phone?: string; email?: string };

export function CoursesCommercePage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <PurchasedCourses />;
  if (user?.role === "FACULTY") return <TaughtCourses />;
  return <OwnerCourses />;
}

function CourseCards({
  subtitle,
  actionLabel,
}: {
  subtitle: string;
  actionLabel: string;
}) {
  const courses = useApi<Course[]>("/api/courses");
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const list = courses.data ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((c) => c.name.toLowerCase().includes(s) || c.code?.toLowerCase().includes(s));
  }, [courses.data, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Courses</h1>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <Card title="Your courses">
        <Field label="Search" value={q} onChange={setQ} placeholder="Search by name" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Link key={c.id} to={`/courses/${c.id}`} className="rounded-2xl border border-line bg-white p-4 hover:border-brand">
              <p className="font-semibold text-navy">{c.name}</p>
              <p className="text-xs text-slate-500">{c.category || "General"}</p>
              <p className="mt-3 text-sm text-brand">{actionLabel} →</p>
            </Link>
          ))}
        </div>
        {filtered.length === 0 && <p className="mt-3 text-sm text-slate-500">No courses yet.</p>}
      </Card>
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
  const courses = useApi<Course[]>("/api/courses");
  const coupons = useApi<Coupon[]>("/api/coupons");
  const additions = useApi<Addition[]>("/api/backend-additions");
  const students = useApi<Student[]>("/api/students");
  const [tab, setTab] = useState<"list" | "create" | "coupons" | "backend">("list");
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("IT");
  const [subCategory, setSubCategory] = useState("OTHERS");
  const [courseType, setCourseType] = useState("PAID");
  const [fees, setFees] = useState("1980");
  const [discount, setDiscount] = useState("0");
  const [validityType, setValidityType] = useState("SINGLE");
  const [validityValue, setValidityValue] = useState("6");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  const [couponCode, setCouponCode] = useState("");
  const [couponName, setCouponName] = useState("");
  const [couponType, setCouponType] = useState("PERCENT");
  const [couponValue, setCouponValue] = useState("10");
  const [couponCourse, setCouponCourse] = useState("");

  const [addCourse, setAddCourse] = useState("");
  const [addStudent, setAddStudent] = useState("");
  const [addNote, setAddNote] = useState("");

  const filtered = useMemo(() => {
    const list = courses.data ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((c) => c.name.toLowerCase().includes(s) || c.code?.toLowerCase().includes(s));
  }, [courses.data, q]);

  async function createCourse() {
    setError(null);
    try {
      await createRecord("/api/courses", {
        code: code || `CRS-${Date.now().toString().slice(-6)}`,
        name,
        description,
        thumbnailUrl,
        category,
        subCategory,
        courseType,
        fees: Number(fees),
        discount: Number(discount),
        validityType,
        validityValue: Number(validityValue),
        validityUnit: "MONTH",
        durationMonths: Number(validityValue) || 6,
        published: true,
        featured: false,
        allowOffline: false,
        allowTrial: false,
        allowPreview: true,
        allowLive: true,
        active: true,
      });
      setName("");
      setCode("");
      setDescription("");
      courses.reload();
      setTab("list");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function togglePublish(c: Course) {
    try {
      await updateRecord(`/api/courses/${c.id}`, { ...c, published: !c.published });
      courses.reload();
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
    try {
      await createRecord("/api/coupons", {
        code: couponCode,
        name: couponName || couponCode,
        discountType: couponType,
        discountValue: Number(couponValue),
        courseId: couponCourse || null,
        live: true,
        redeemedCount: 0,
      });
      setCouponCode("");
      setCouponName("");
      coupons.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addStudentToCourse() {
    setError(null);
    try {
      const st = (students.data ?? []).find((s) => s.id === addStudent);
      await createRecord("/api/backend-additions", {
        courseId: addCourse || null,
        studentId: addStudent || null,
        studentName: st?.fullName,
        studentPhone: st?.phone,
        studentEmail: st?.email,
        note: addNote,
        status: "ADDED",
      });
      if (st && addCourse) {
        await updateRecord(`/api/students/${st.id}`, { ...st, courseId: addCourse, status: "ENROLLED" });
      }
      setAddNote("");
      additions.reload();
      students.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Courses</h1>
          <p className="text-sm text-slate-500">
            Create and sell courses. After a student purchases, learning (videos, PDFs, quizzes) lives inside that course. Your Courses (
            {courses.data?.length ?? 0})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["list", "My Courses"],
              ["create", "Create Course"],
              ["coupons", "Manage Coupons"],
              ["backend", "Backend Addition"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`rounded-full px-3 py-1.5 text-sm ${tab === id ? "bg-navy text-white" : "bg-mist"}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorText error={error} />

      {tab === "list" && (
        <Card title="Add / view courses of your brand">
          <div className="mb-4">
            <Field label="Search by name" value={q} onChange={setQ} placeholder="Search by name" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <div key={c.id} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/courses/${c.id}`} className="font-semibold text-navy hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {c.category || "General"} · {c.durationMonths || c.validityValue || "—"} months
                    </p>
                  </div>
                  {!c.published && <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px]">Unpublished</span>}
                  {c.featured && <span className="rounded bg-brand/10 px-2 py-0.5 text-[10px] text-brand">Featured</span>}
                </div>
                <p className="mt-3 text-lg font-bold">₹{c.fees}</p>
                {Number(c.discount || 0) > 0 && <p className="text-xs text-slate-500">Discount ₹{c.discount}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button className="text-brand hover:underline" type="button" onClick={() => togglePublish(c)}>
                    {c.published ? "Unpublish" : "Publish"}
                  </button>
                  <button className="text-brand hover:underline" type="button" onClick={() => toggleFeatured(c)}>
                    {c.featured ? "Unfeature" : "Mark featured"}
                  </button>
                  <Link className="text-brand hover:underline" to={`/courses/${c.id}`}>
                    Open course (LMS)
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {(filtered.length === 0) && <p className="text-sm text-slate-500">No courses yet. Create your first course.</p>}
        </Card>
      )}

      {tab === "create" && (
        <Card title="Create course — basic information & price">
          <FormGrid>
            <Field label="Course name" value={name} onChange={setName} placeholder="Enter course name" />
            <Field label="Code" value={code} onChange={setCode} placeholder="Auto if blank" />
            <Field label="Description" value={description} onChange={setDescription} placeholder="Enter course description here" />
            <Field label="Thumbnail URL" value={thumbnailUrl} onChange={setThumbnailUrl} />
            <Field label="Category" value={category} onChange={setCategory} />
            <Field label="Sub category" value={subCategory} onChange={setSubCategory} />
            <Select
              label="Course type"
              value={courseType}
              onChange={setCourseType}
              options={[
                { value: "PAID", label: "Paid Course" },
                { value: "FREE", label: "Free Course" },
              ]}
            />
            <Select
              label="Validity type"
              value={validityType}
              onChange={setValidityType}
              options={[
                { value: "SINGLE", label: "Single Validity" },
                { value: "MULTIPLE", label: "Multiple Validity" },
                { value: "LIFETIME", label: "Lifetime Validity" },
                { value: "EXPIRY_DATE", label: "Course Expiry Date" },
              ]}
            />
            <Field label="Validity (months)" value={validityValue} onChange={setValidityValue} />
            <Field label="Price (₹)" value={fees} onChange={setFees} />
            <Field label="Discount (₹)" value={discount} onChange={setDiscount} />
            <Field label="Effective price" value={String(Math.max(0, Number(fees) - Number(discount || 0)))} onChange={() => {}} />
          </FormGrid>
          <p className="mt-3 text-xs text-slate-500">
            Features supported: offline download, installments (via Fees), trial, LIVE classes, course preview, limit access.
          </p>
          <div className="mt-4">
            <PrimaryButton disabled={!name} onClick={createCourse}>
              Create course
            </PrimaryButton>
          </div>
        </Card>
      )}

      {tab === "coupons" && (
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
              options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!couponCode} onClick={saveCoupon}>
              Create coupon
            </PrimaryButton>
          </div>
          <div className="mt-4">
            <Table
              columns={["Code", "Type", "Value", "Live", "Redeemed"]}
              rows={(coupons.data ?? []).map((c) => [
                c.code,
                c.discountType,
                String(c.discountValue),
                c.live ? "Live" : "Off",
                String(c.redeemedCount ?? 0),
              ])}
            />
          </div>
        </Card>
      )}

      {tab === "backend" && (
        <Card title="Backend addition — add students directly into courses">
          <FormGrid>
            <Select
              label="Course"
              value={addCourse}
              onChange={setAddCourse}
              options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
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
              columns={["Student", "Phone", "Status", "Note"]}
              rows={(additions.data ?? []).map((a) => [a.studentName || "—", a.studentPhone || "—", a.status, a.note || "—"])}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
