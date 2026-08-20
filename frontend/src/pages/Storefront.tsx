import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { StudentLms } from "./LmsPage";
import { StudentCourseLibrary } from "./courseContent";

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
  durationMonths?: number;
  fees: number;
  discount?: number;
  price: number;
  courseType?: string;
};

type MyCourse = { id?: string; status?: string; source?: string; course: PublicCourse };

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
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
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
                <button
                  className="rounded-full border border-line px-3 py-1.5"
                  type="button"
                  onClick={() => {
                    logout();
                    navigate(`/s/${slug}`);
                  }}
                >
                  Sign out
                </button>
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
          <Link key={c.id} to={`/s/${slug}/courses/${c.id}`} className="rounded-2xl border border-line bg-white p-5 hover:border-brand">
            <p className="text-xs uppercase tracking-wide text-slate-400">{c.category || "Course"}</p>
            <h2 className="mt-1 text-lg font-semibold text-navy">{c.name}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-slate-500">{c.description || "Open for details."}</p>
            <p className="mt-4 text-lg font-bold text-navy">{c.price === 0 ? "Free" : `₹${c.price}`}</p>
            {c.durationMonths ? <p className="text-xs text-slate-400">{c.durationMonths} months</p> : null}
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");

  useEffect(() => {
    if (!slug || !courseId) return;
    api<PublicCourse>(`/api/public/sites/${slug}/courses/${courseId}`)
      .then(setCourse)
      .catch((err: Error) => setError(err.message));
  }, [slug, courseId]);

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
          body: JSON.stringify({ fullName: name, email, phone, courseId }),
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-line bg-white p-6">
        <Link to={`/s/${slug}`} className="text-sm text-brand hover:underline">
          ← All courses
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-navy">{course.name}</h1>
        <p className="mt-2 text-sm text-slate-500">{course.description}</p>
        <p className="mt-4 text-2xl font-bold text-navy">{course.price === 0 ? "Free" : `₹${course.price}`}</p>
        {Number(course.discount || 0) > 0 && <p className="text-sm text-slate-400">List price ₹{course.fees}</p>}
      </div>
      <div className="rounded-2xl border border-line bg-white p-6">
        {loggedStudent ? (
          <div className="space-y-3">
            <h2 className="font-semibold text-navy">Buy and start learning</h2>
            <p className="text-sm text-slate-500">You are logged in as {user?.name}. Purchase unlocks this course in My learning and the app.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => buy()}>
              {busy ? "Unlocking…" : course.price === 0 ? "Enroll free" : `Pay ₹${course.price}`}
            </button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={buy}>
            <h2 className="font-semibold text-navy">Purchase</h2>
            <p className="text-sm text-slate-500">Pay (demo UPI) and you are logged in to study immediately.</p>
            <label className="block text-sm font-medium">
              Name
              <input className="mt-1 w-full rounded-lg border border-line px-3 py-2" required value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Mobile
              <input className="mt-1 w-full rounded-lg border border-line px-3 py-2" required inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Email
              <input className="mt-1 w-full rounded-lg border border-line px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy}>
              {busy ? "Processing…" : course.price === 0 ? "Enroll free" : `Pay ₹${course.price} and start`}
            </button>
            <p className="text-center text-xs text-slate-400">
              Already purchased?{" "}
              <Link className="text-brand" to={`/s/${slug}/login`}>
                Login
              </Link>
            </p>
          </form>
        )}
      </div>
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
      <p className="mt-1 text-sm text-slate-500">Use the mobile you purchased with. Demo student: 9876500002, OTP 123456.</p>
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
          {sent.devOtp && <p className="text-xs text-slate-400">Dev OTP: {sent.devOtp}</p>}
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
            <p className="mt-1 text-sm text-slate-500">Continue studying</p>
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
