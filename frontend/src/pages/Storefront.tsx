import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { UserMenu } from "../UserMenu";
import { StudentLms } from "./LmsPage";
import { StudentCourseLibrary } from "./courseContent";
import { MyStudentRecord } from "./StudentsPage";
import { FeesPage } from "./FeesPage";
import { PlacementPage } from "./PlacementPage";
import { Card, useApi } from "../ui";

type Site = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  brandPrimary?: string;
  brandSecondary?: string;
};

type PublicCourse = {
  id: string;
  code?: string;
  name: string;
  description?: string;
  category?: string;
  subCategory?: string;
  durationMonths?: number;
  validityType?: string;
  validityValue?: number;
  validityUnit?: string;
  allowOffline?: boolean;
  allowPreview?: boolean;
  allowLive?: boolean;
  instituteName?: string;
  fees: number;
  discount?: number;
  price: number;
  courseType?: string;
};

type OutlineItem = {
  id: string;
  title: string;
  type: string;
  parentFolderId?: string | null;
  sortOrder?: number;
};

type MyCourse = { id?: string; status?: string; source?: string; progressPct?: number; course: PublicCourse };

function useSlug() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  if (slug) return slug;
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] === "s" ? parts[1] : undefined;
}

function useSite(slug?: string) {
  const [site, setSite] = useState<Site | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    api<Site>(`/api/public/sites/${slug}`)
      .then((value) => {
        if (alive) setSite(value);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  return { site, error };
}

export function StorefrontLayout() {
  return <StorefrontShell />;
}

export function StorefrontCatalogPage() {
  return <CatalogPage />;
}

export function StorefrontCoursePage() {
  return <CoursePage />;
}

export function StorefrontLoginPage() {
  return <StudentLoginPage />;
}

export function StorefrontAppPage() {
  return <AppInstallPage />;
}

export function StorefrontLearnPage() {
  return (
    <StudentGate>
      <MyLearningPage />
    </StudentGate>
  );
}

export function StorefrontStudyPage() {
  return (
    <StudentGate>
      <StudyPage />
    </StudentGate>
  );
}

export function StorefrontProfilePage() {
  return (
    <StudentGate>
      <MyStudentRecord />
    </StudentGate>
  );
}

export function StorefrontFeesPage() {
  return (
    <StudentGate>
      <FeesPage />
    </StudentGate>
  );
}

export function StorefrontJobsPage() {
  return (
    <StudentGate>
      <PlacementPage />
    </StudentGate>
  );
}

export function StorefrontNoticesPage() {
  return (
    <StudentGate>
      <StudentNotices />
    </StudentGate>
  );
}

function StudentGate({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const slug = useSlug();
  const location = useLocation();
  if (!token) {
    return <Navigate to={`/s/${slug}/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (user?.role !== "STUDENT") {
    return <Navigate to={`/s/${slug}`} replace />;
  }
  return children;
}

function StorefrontShell() {
  const slug = useSlug();
  const { site, error } = useSite(slug);
  const { user, token } = useAuth();
  const accent = site?.brandPrimary || "#0078f0";

  useEffect(() => {
    if (site?.name) document.title = `${site.name} · Courses`;
  }, [site?.name]);

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-mist p-6">
        <div className="max-w-md rounded-2xl border border-line bg-white p-6">
          <h1 className="text-xl font-bold text-navy">Website not available</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }
  if (!site) return <p className="p-6 text-sm text-slate-500">Loading…</p>;

  const student = token && user?.role === "STUDENT";

  return (
    <div className="min-h-svh bg-mist" style={{ ["--color-brand" as string]: accent }}>
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to={`/s/${slug}`} className="flex items-center gap-2">
            {site.logoUrl ? (
              <img src={site.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-sm font-bold text-white">
                {site.name.slice(0, 1)}
              </span>
            )}
            <div>
              <p className="text-sm font-bold text-navy">{site.name}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Student website</p>
            </div>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`/s/${slug}`}>
              Courses
            </Link>
            <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`/s/${slug}/app`}>
              App
            </Link>
            {student ? (
              <>
                <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`/s/${slug}/learn`}>
                  My learning
                </Link>
                <UserMenu
                  signOutTo={`/s/${slug}`}
                  profileTo={`/s/${slug}/profile`}
                  extraLinks={[
                    { label: "Fees", to: `/s/${slug}/fees` },
                    { label: "Jobs", to: `/s/${slug}/jobs` },
                    { label: "Notices", to: `/s/${slug}/notices` },
                  ]}
                />
              </>
            ) : (
              <Link className="rounded-full bg-brand px-3 py-1.5 font-semibold text-white" to={`/s/${slug}/login`}>
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet context={site} />
      </main>
    </div>
  );
}

function CatalogPage() {
  const slug = useSlug();
  const [courses, setCourses] = useState<PublicCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api<PublicCourse[]>(`/api/public/sites/${slug}/courses`)
      .then(setCourses)
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!courses) return <p className="text-sm text-slate-500">Loading courses…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Courses</h1>
        <p className="text-sm text-slate-500">Browse, purchase, then study on this website or the app.</p>
      </div>
      {courses.length === 0 && <p className="text-sm text-slate-500">No published courses yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {courses.map((c) => (
          <Link key={c.id} to={`/s/${slug}/courses/${c.id}`} className="overflow-hidden rounded-2xl border border-line bg-white hover:border-brand">
            <img src={`/api/public/sites/${slug}/courses/${c.id}/cover`} alt="" className="h-36 w-full bg-navy object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div className="p-5">
              <p className="text-xs uppercase tracking-wide text-slate-400">{c.category || "Course"}</p>
              <h2 className="mt-1 text-lg font-semibold text-navy">{c.name}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-slate-500">{c.description || "Open for details."}</p>
              <p className="mt-4 text-lg font-bold text-navy">{c.price === 0 ? "Free" : `₹${c.price}`}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CoursePage() {
  const slug = useSlug();
  const { courseId } = useParams();
  const { token, user, applySession } = useAuth();
  const navigate = useNavigate();
  const [course, setCourse] = useState<PublicCourse | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"overview" | "content">("overview");
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [coupon, setCoupon] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [couponOk, setCouponOk] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !courseId) return;
    api<PublicCourse>(`/api/public/sites/${slug}/courses/${courseId}`)
      .then((row) => {
        setCourse(row);
        setPrice(Number(row.price));
      })
      .catch((err: Error) => setError(err.message));
    api<OutlineItem[]>(`/api/public/sites/${slug}/courses/${courseId}/outline`)
      .then(setOutline)
      .catch(() => setOutline([]));
  }, [slug, courseId]);

  async function applyCoupon() {
    if (!slug || !courseId || !coupon.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ price: number; code: string }>(`/api/public/sites/${slug}/coupons/apply`, {
        method: "POST",
        body: JSON.stringify({ courseId, code: coupon.trim() }),
      });
      setPrice(Number(res.price));
      setCouponOk(res.code);
    } catch (err) {
      setCouponOk(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function buy(e?: FormEvent) {
    e?.preventDefault();
    if (!slug || !courseId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: { id: string; name: string; email: string; role: string; organizationId: string; packageTier: string } }>(
        `/api/public/sites/${slug}/purchase`,
        {
          method: "POST",
          body: JSON.stringify({ fullName: name, email, phone, courseId, couponCode: couponOk || undefined }),
        }
      );
      applySession(res);
      navigate(`/s/${slug}/learn/${courseId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!course && !error) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!course) return <p className="text-sm text-red-600">{error}</p>;

  const loggedStudent = token && user?.role === "STUDENT";
  const pay = price ?? Number(course.price);
  const validity =
    course.validityType === "LIFETIME"
      ? "Lifetime access"
      : course.validityValue
        ? `${course.validityValue} ${(course.validityUnit || "MONTH").toLowerCase()}${Number(course.validityValue) === 1 ? "" : "s"} validity`
        : course.durationMonths
          ? `${course.durationMonths} month validity`
          : null;
  const folders = outline.filter((row) => row.type === "FOLDER");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <p className="text-sm text-slate-500">
          <Link to={`/s/${slug}`} className="text-brand hover:underline">
            Courses
          </Link>
          <span className="px-1">/</span>
          {course.name}
        </p>
        <h1 className="text-2xl font-bold text-navy">{course.name}</h1>
        <div className="flex gap-6 border-b border-line text-sm font-semibold">
          <button type="button" className={`-mb-px border-b-2 pb-2 ${tab === "overview" ? "border-brand text-brand" : "border-transparent text-slate-500"}`} onClick={() => setTab("overview")}>
            OVERVIEW
          </button>
          <button type="button" className={`-mb-px border-b-2 pb-2 ${tab === "content" ? "border-brand text-brand" : "border-transparent text-slate-500"}`} onClick={() => setTab("content")}>
            CONTENT
          </button>
        </div>

        {tab === "overview" ? (
          <div className="space-y-5">
            <section>
              <h2 className="font-semibold text-navy">About this course</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{course.description || "Details will appear here after the institute adds a description."}</p>
              {validity && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-navy">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-sky-100 text-brand">▶</span>
                  {validity}
                </div>
              )}
            </section>
            <section className="rounded-2xl bg-amber-50 px-4 py-4">
              <h3 className="font-semibold text-navy">What else you will get?</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {course.allowOffline !== false && (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Download notes and videos</span>
                    <span className="block text-slate-500">Save files from My learning after you enroll.</span>
                  </p>
                )}
                <p className="text-sm text-slate-700">
                  <span className="font-medium">Available on web</span>
                  <span className="block text-slate-500">Bigger screen, better clarity.</span>
                </p>
              </div>
            </section>
            <section>
              <p className="text-sm text-slate-500">You pay</p>
              <p className="text-2xl font-bold text-navy">{pay === 0 ? "Free" : `₹ ${pay}`}</p>
              {Number(course.discount || 0) > 0 && <p className="text-xs text-slate-400">List price ₹{course.fees}</p>}
            </section>
            <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm">
              <span>Have a coupon code</span>
              <div className="flex gap-2">
                <input className="w-36 rounded-lg border border-line px-2 py-1.5" placeholder="Code" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
                <button type="button" className="font-semibold text-brand" onClick={applyCoupon}>
                  Apply here
                </button>
              </div>
            </section>
            {couponOk && <p className="text-sm text-emerald-700">Coupon {couponOk} applied.</p>}
            <p className="text-xs text-slate-400">By purchasing you agree to the institute terms and refund policy.</p>
            <section>
              <h3 className="font-semibold text-navy">About course creator</h3>
              <p className="mt-2 text-sm text-slate-600">{course.instituteName || "Institute"}</p>
            </section>
          </div>
        ) : (
          <div className="divide-y divide-line rounded-2xl border border-line bg-white">
            {outline.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Content is added after you purchase.</p>}
            {folders.map((folder) => (
              <div key={folder.id} className="px-4 py-3">
                <p className="font-medium text-navy">{folder.title}</p>
                <p className="text-xs text-slate-500">
                  {outline.filter((row) => row.parentFolderId === folder.id).length} item(s)
                </p>
              </div>
            ))}
            {outline
              .filter((row) => !row.parentFolderId && row.type !== "FOLDER")
              .map((row) => (
                <div key={row.id} className="px-4 py-3 text-sm text-navy">
                  {row.title}
                  <span className="ml-2 text-xs uppercase text-slate-400">{row.type.toLowerCase()}</span>
                </div>
              ))}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <aside className="sticky top-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="bg-navy p-5 text-white">
          <img
            src={`/api/public/sites/${slug}/courses/${course.id}/cover`}
            alt=""
            className="mb-3 h-28 w-full rounded-xl object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <h2 className="text-lg font-bold leading-snug">{course.name}</h2>
          <p className="mt-1 text-xs text-sky-200">{course.category || "Course"}</p>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-xl font-bold text-navy">{pay === 0 ? "Free" : `₹ ${pay}`}</p>
          {loggedStudent ? (
            <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => buy()}>
              {busy ? "Unlocking…" : pay === 0 ? "Enroll free" : "Get this course"}
            </button>
          ) : (
            <form className="space-y-2" onSubmit={buy}>
              <input className="w-full rounded-lg border border-line px-3 py-2 text-sm" required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="w-full rounded-lg border border-line px-3 py-2 text-sm" required placeholder="Mobile" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="w-full rounded-lg border border-line px-3 py-2 text-sm" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy}>
                {busy ? "Processing…" : pay === 0 ? "Enroll free" : "Get this course"}
              </button>
            </form>
          )}
          <p className="text-center text-xs text-slate-400">
            Already purchased?{" "}
            <Link className="text-brand" to={`/s/${slug}/login`}>
              Login
            </Link>
          </p>
        </div>
      </aside>
    </div>
  );
}

function StudentLoginPage() {
  const slug = useSlug();
  const { token, user, loginWithOtp, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useMemo(() => [new URLSearchParams(window.location.search)], []);
  const next = params.get("next") || `/s/${slug}/learn`;
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<{ phone?: string; devOtp?: string } | null>(null);
  const [mode, setMode] = useState<"otp" | "email">("otp");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token && user?.role === "STUDENT") {
    return <Navigate to={next} replace />;
  }

  async function sendOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ phone?: string; devOtp?: string }>("/api/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      setSent(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithOtp(phone, otp);
      navigate(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function emailLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-6">
      <h1 className="text-xl font-bold text-navy">Student login</h1>
      <p className="mt-1 text-sm text-slate-500">Use the mobile you purchased with.</p>
      <div className="mt-4 flex gap-2">
        <button type="button" className={`rounded-full px-3 py-1 text-sm ${mode === "otp" ? "bg-navy text-white" : "bg-mist"}`} onClick={() => setMode("otp")}>
          Mobile OTP
        </button>
        <button type="button" className={`rounded-full px-3 py-1 text-sm ${mode === "email" ? "bg-navy text-white" : "bg-mist"}`} onClick={() => setMode("email")}>
          Email
        </button>
      </div>
      {mode === "otp" && !sent && (
        <form className="mt-4 space-y-3" onSubmit={sendOtp}>
          <input className="w-full rounded-lg border border-line px-3 py-2" placeholder="Mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Sending…" : "Send OTP"}
          </button>
        </form>
      )}
      {mode === "otp" && sent && (
        <form className="mt-4 space-y-3" onSubmit={verify}>
          <input className="w-full rounded-lg border border-line px-3 py-2 tracking-[0.3em]" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Signing in…" : "Login"}
          </button>
        </form>
      )}
      {mode === "email" && (
        <form className="mt-4 space-y-3" onSubmit={emailLogin}>
          <input className="w-full rounded-lg border border-line px-3 py-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded-lg border border-line px-3 py-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Signing in…" : "Login"}
          </button>
        </form>
      )}
    </div>
  );
}

function MyLearningPage() {
  const slug = useSlug();
  const [rows, setRows] = useState<MyCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<MyCourse[]>("/api/actions/my-courses")
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">My learning</h1>
        <p className="text-sm text-slate-500">Courses you purchased. Open one to study — same on the Android app.</p>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-slate-500">
          No courses yet.{" "}
          <Link className="text-brand" to={`/s/${slug}`}>
            Browse catalog
          </Link>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <Link key={row.course.id} to={`/s/${slug}/learn/${row.course.id}`} className="rounded-2xl border border-line bg-white p-5 hover:border-brand">
            <p className="font-semibold text-navy">{row.course.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {row.progressPct ? `${row.progressPct}% complete` : "Continue studying"}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, row.progressPct || 0)}%` }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StudyPage() {
  const slug = useSlug();
  const { courseId } = useParams();
  const [course, setCourse] = useState<PublicCourse | null>(null);

  useEffect(() => {
    api<MyCourse[]>("/api/actions/my-courses").then((rows) => {
      const match = rows.find((r) => r.course.id === courseId);
      setCourse(match?.course || null);
    });
  }, [courseId]);

  return (
    <div className="space-y-4">
      <Link to={`/s/${slug}/learn`} className="text-sm text-brand hover:underline">
        ← My learning
      </Link>
      <h1 className="text-2xl font-bold text-navy">{course?.name || "Course"}</h1>
      {courseId && <StudentCourseLibrary courseId={courseId} />}
      <StudentLms courseId={courseId} embedded />
    </div>
  );
}

function StudentNotices() {
  const anns = useApi<{ title: string; body: string }[]>("/api/announcements");
  const notes = useApi<{ title: string; body: string; status?: string }[]>("/api/notifications");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Notices</h1>
        <p className="text-sm text-slate-500">Announcements and messages from your institute.</p>
      </div>
      <Card title="Announcements">
        {(anns.data ?? []).length === 0 && <p className="text-sm text-slate-500">No announcements yet.</p>}
        <ul className="space-y-3 text-sm">
          {(anns.data ?? []).map((a, i) => (
            <li key={i}>
              <p className="font-medium text-navy">{a.title}</p>
              {a.body && <p className="mt-1 text-slate-600">{a.body}</p>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Messages">
        {(notes.data ?? []).length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
        <ul className="space-y-3 text-sm">
          {(notes.data ?? []).map((n, i) => (
            <li key={i}>
              <p className="font-medium text-navy">{n.title}</p>
              {n.body && <p className="mt-1 text-slate-600">{n.body}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function AppInstallPage() {
  const slug = useSlug();
  const { site } = useSite(slug);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-line bg-white p-6">
        <h1 className="text-2xl font-bold text-navy">Android app</h1>
        <p className="mt-2 text-sm text-slate-500">
          The student app is this website on your phone: see courses, purchase, then study videos and tests.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Open this page on Android Chrome.</li>
          <li>Tap the menu, then Add to Home screen / Install app.</li>
          <li>Open {site?.name || "the institute"} from your home screen.</li>
        </ol>
        <p className="mt-4 text-xs text-slate-400">Play Store listing can wrap this same student site later. Until then, install as an app from the browser.</p>
      </div>
      <div className="flex justify-center">
        <div className="h-[420px] w-[220px] rounded-[2rem] border-4 border-navy bg-white p-3">
          <p className="rounded-xl bg-mist py-2 text-center text-xs font-bold text-navy">{site?.name || "App"}</p>
          <div className="mt-3 space-y-2">
            <div className="rounded-xl bg-mist p-3 text-sm">Courses</div>
            <div className="rounded-xl bg-mist p-3 text-sm">My learning</div>
            <div className="rounded-xl bg-brand/10 p-3 text-sm text-brand">Study</div>
          </div>
        </div>
      </div>
    </div>
  );
}
