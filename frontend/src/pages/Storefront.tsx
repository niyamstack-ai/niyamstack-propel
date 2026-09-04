import { FormEvent, createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { UserMenu, initialsOf } from "../UserMenu";
import { StudentLms, type StudySection } from "./LmsPage";
import { StudentCourseLibrary } from "./courseContent";
import { MyStudentRecord } from "./StudentsPage";
import { FeesPage } from "./FeesPage";
import { PlacementPage } from "./PlacementPage";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, formatDay, formatInr, formatWhen, useApi } from "../ui";
import { createRecord } from "../ops";
import { PageSections } from "../PageSections";
import { EnquireForm } from "../EnquireForm";
import { parseFormFields } from "../formFields";
import { isProductHost } from "../siteHost";
import { openRazorpay, type CheckoutOrder } from "../razorpay";

type CmsPage = { title: string; slug: string; pageType?: string; body?: string };

type Site = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  customDomain?: string;
  websitePublished?: boolean;
  live?: boolean;
  phone?: string;
  email?: string;
  facebookPixelId?: string;
  googleAnalyticsId?: string;
  googleAdsId?: string;
  pages?: CmsPage[];
};

const SiteNav = createContext({ slug: "", base: "" });

function useSlug() {
  const ctx = useContext(SiteNav);
  const { slug } = useParams();
  const { pathname } = useLocation();
  if (ctx.slug) return ctx.slug;
  if (slug) return slug;
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] === "s" ? parts[1] : undefined;
}

function sitePath(slug: string | undefined, path = "") {
  const suffix = !path ? "" : path.startsWith("/") ? path : `/${path}`;
  if (!isProductHost()) return suffix || "";
  return `/s/${slug}${suffix}`;
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input
        className="w-full rounded-lg border border-line px-3 py-2"
        type={show ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-brand" onClick={() => setShow((v) => !v)}>
        {show ? "Hide" : "Show"}
      </button>
    </span>
  );
}

type PublicCourse = {
  id: string;
  shareSlug?: string;
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
  allowTrial?: boolean;
  instituteName?: string;
  fees: number;
  discount?: number;
  price: number;
  courseType?: string;
  validityOptions?: { id: string; label: string; price: number }[];
};

type OutlineItem = {
  id: string;
  title: string;
  type: string;
  parentFolderId?: string | null;
  sortOrder?: number;
};

type MyCourse = {
  id?: string;
  status?: string;
  source?: string;
  progressPct?: number;
  progress?: {
    pct?: number;
    filesDone?: number;
    filesTotal?: number;
    homeworkDone?: number;
    homeworkTotal?: number;
    testsDone?: number;
    testsTotal?: number;
    resume?: string;
  };
  course: PublicCourse;
};

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

export function StorefrontLayout({ slug: forced }: { slug?: string } = {}) {
  const params = useParams();
  const slug = forced || params.slug || "";
  const base = isProductHost() ? `/s/${slug}` : "";
  return (
    <SiteNav.Provider value={{ slug, base }}>
      <StorefrontShell />
    </SiteNav.Provider>
  );
}

export function StorefrontCatalogPage() {
  return <CatalogPage />;
}

export function StorefrontCmsPage() {
  return <CmsPageView />;
}

export function StorefrontLandingPage() {
  return <LandingLeadPage />;
}

export function StorefrontOneToOnePage() {
  return <OneToOneBookPage />;
}

export function StorefrontCoursePage() {
  return <CoursePage />;
}

export function StorefrontLoginPage() {
  return <StudentLoginPage />;
}

export function StorefrontRegisterPage() {
  return <StudentRegisterPage />;
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

export function StorefrontChatsPage() {
  return (
    <StudentGate>
      <StudentChats />
    </StudentGate>
  );
}

export function StorefrontForgotPage() {
  return <StudentForgotPage />;
}

function StudentGate({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const slug = useSlug();
  const location = useLocation();
  if (!token) {
    return <Navigate to={`${sitePath(slug)}/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (user?.role !== "STUDENT") {
    return <Navigate to={`${sitePath(slug)}`} replace />;
  }
  return children;
}

function StorefrontShell() {
  const slug = useSlug();
  const location = useLocation();
  const { site, error } = useSite(slug);
  const { user, token } = useAuth();
  const accent = site?.brandPrimary || "#0078f0";
  const [examLock, setExamLock] = useState(false);
  const [pages, setPages] = useState<CmsPage[]>([]);

  useEffect(() => {
    if (site?.pages?.length) setPages(site.pages);
  }, [site]);

  useEffect(() => {
    if (!slug) return;
    const load = (path: string) => api<CmsPage[]>(path).then(setPages);
    load(`/api/public/sites/${slug}/pages`).catch(() =>
      load(`/api/public/cms/${slug}/pages`).catch(() => setPages(site?.pages ?? []))
    );
  }, [slug, site?.pages]);

  useEffect(() => {
    const on = () => setExamLock(true);
    const off = () => setExamLock(false);
    window.addEventListener("propel:exam-lock", on);
    window.addEventListener("propel:exam-unlock", off);
    return () => {
      window.removeEventListener("propel:exam-lock", on);
      window.removeEventListener("propel:exam-unlock", off);
    };
  }, []);

  useEffect(() => {
    if (!site?.name) return;
    const path = location.pathname;
    const page = path.includes("/profile")
      ? "Profile"
      : path.includes("/fees")
        ? "Fees"
        : path.includes("/jobs")
          ? "Jobs"
          : path.includes("/notices")
            ? "Notices"
            : path.includes("/chats")
              ? "Chat"
              : path.includes("/forgot")
                ? "Forgot password"
                : path.includes("/learn")
                  ? "My learning"
                  : path.includes("/login")
                    ? "Login"
                    : path.includes("/register")
                      ? "Register"
                      : path.includes("/app")
                        ? "Install app"
                        : path.includes("/one-to-one") || path.includes("/1-1")
                          ? "1:1 booking"
                          : path.includes("/l/")
                            ? "Landing"
                            : path.includes("/p/")
                              ? "Page"
                              : path.match(/\/courses\/[^/]+/)
                                ? "Course"
                                : "Courses";
    document.title = `${site.name} · ${page}`;
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (link && slug) link.href = `/api/public/sites/${slug}/manifest`;
  }, [site?.name, location.pathname, slug]);

  useEffect(() => {
    if (!site) return;
    if (site.facebookPixelId && !document.getElementById("fb-pixel")) {
      const s = document.createElement("script");
      s.id = "fb-pixel";
      s.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${site.facebookPixelId}');fbq('track','PageView');`;
      document.head.appendChild(s);
    }
    if ((site.googleAnalyticsId || site.googleAdsId) && !document.getElementById("ga-tag")) {
      const g = document.createElement("script");
      g.id = "ga-tag";
      g.async = true;
      const tagId = site.googleAnalyticsId || site.googleAdsId || "";
      g.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
      document.head.appendChild(g);
      const i = document.createElement("script");
      i.id = "ga-inline";
      i.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${site.googleAnalyticsId ? `gtag('config','${site.googleAnalyticsId}');` : ""}${site.googleAdsId ? `gtag('config','${site.googleAdsId}');` : ""}`;
      document.head.appendChild(i);
    }
  }, [site]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/sites/${slug}/hit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "SESSION", path: location.pathname }),
    }).catch(() => undefined);
  }, [slug]);

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
  const siteLive = site.live === true;

  return (
    <div className="min-h-svh bg-mist" style={{ ["--color-brand" as string]: accent }}>
      <header className={`sticky top-0 border-b border-line bg-white ${examLock ? "z-0 pointer-events-none" : "z-10"}`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to={sitePath(slug) || "/"} className={`flex items-center gap-2 ${examLock ? "pointer-events-none opacity-40" : ""}`} tabIndex={examLock ? -1 : 0} aria-hidden={examLock}>
            {site.logoUrl ? (
              <img src={site.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-sm font-bold text-white">
                {initialsOf(site.name)}
              </span>
            )}
            <div>
              <p className="text-sm font-bold text-navy">{site.name}</p>
            </div>
          </Link>
          <nav className={`flex flex-wrap items-center gap-2 text-sm ${examLock ? "pointer-events-none opacity-40" : ""}`} aria-hidden={examLock}>
            <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={sitePath(slug) || "/"} tabIndex={examLock ? -1 : 0}>
              Courses
            </Link>
            {pages
              .filter((p) => p.slug !== "home" && p.slug !== "courses" && p.pageType !== "COURSES")
              .slice(0, 5)
              .map((p) => (
                <Link key={p.slug} className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/p/${p.slug}`} tabIndex={examLock ? -1 : 0}>
                  {p.title}
                </Link>
              ))}
            <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/one-to-one`} tabIndex={examLock ? -1 : 0}>
              1:1
            </Link>
            <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/app`} tabIndex={examLock ? -1 : 0}>
              Get the app
            </Link>
            {student ? (
              <>
                <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/learn`} tabIndex={examLock ? -1 : 0}>
                  My learning
                </Link>
                <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/fees`} tabIndex={examLock ? -1 : 0}>
                  Fees
                </Link>
                <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/jobs`} tabIndex={examLock ? -1 : 0}>
                  Jobs
                </Link>
                <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/notices`} tabIndex={examLock ? -1 : 0}>
                  Notices
                </Link>
                <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/chats`} tabIndex={examLock ? -1 : 0}>
                  Chat
                </Link>
                <span className={examLock ? "pointer-events-none opacity-40" : ""}>
                  <UserMenu
                    signOutTo={sitePath(slug) || "/"}
                    profileTo={`${sitePath(slug)}/profile`}
                    showName
                    extraLinks={[
                      { label: "Fees", to: `${sitePath(slug)}/fees` },
                      { label: "Jobs", to: `${sitePath(slug)}/jobs` },
                      { label: "Notices", to: `${sitePath(slug)}/notices` },
                      { label: "Chat", to: `${sitePath(slug)}/chats` },
                      { label: "1:1 sessions", to: `${sitePath(slug)}/one-to-one` },
                    ]}
                  />
                </span>
              </>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <Link className="rounded-full px-3 py-1.5 hover:bg-mist" to={`${sitePath(slug)}/register`}>
                  Register
                </Link>
                <Link className="rounded-full bg-brand px-3 py-1.5 font-semibold text-white" to={`${sitePath(slug)}/login`}>
                  Login
                </Link>
              </span>
            )}
          </nav>
        </div>
      </header>
      {!siteLive && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          This website is a draft. Students cannot register or buy until the institute clicks Publish.
        </div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet context={site} />
      </main>
    </div>
  );
}

function CmsPageView() {
  const slug = useSlug();
  const { pageSlug } = useParams();
  const { site } = useSite(slug);
  const [page, setPage] = useState<CmsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!slug || !pageSlug) return;
    const fromSite = (site?.pages ?? []).find((p) => p.slug === pageSlug);
    if (fromSite) setPage(fromSite);
    api<CmsPage>(`/api/public/sites/${slug}/pages/${pageSlug}`)
      .then(setPage)
      .catch(() =>
        api<CmsPage>(`/api/public/cms/${slug}/pages/${pageSlug}`)
          .then(setPage)
          .catch((err: Error) => {
            if (fromSite) setPage(fromSite);
            else setError(err.message);
          })
      );
  }, [slug, pageSlug, site]);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!page) return <p className="text-sm text-slate-500">Loading…</p>;
  return <PageSections body={page.body} slug={slug} />;
}

function CatalogPage() {
  const slug = useSlug();
  const { token, user } = useAuth();
  const [courses, setCourses] = useState<PublicCourse[] | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [home, setHome] = useState<CmsPage | null>(null);
  const [banners, setBanners] = useState<{ id: string; title: string; imageUrl?: string; linkUrl?: string }[]>([]);
  const { site } = useSite(slug);

  useEffect(() => {
    if (!slug) return;
    api<PublicCourse[]>(`/api/public/sites/${slug}/courses`)
      .then(setCourses)
      .catch((err: Error) => setError(err.message));
    api<{ id: string; title: string; imageUrl?: string; linkUrl?: string }[]>(`/api/public/sites/${slug}/banners`)
      .then(setBanners)
      .catch(() => setBanners([]));
    const pickHome = (rows: CmsPage[]) => rows.find((p) => p.slug === "home" || p.pageType === "HOME") || null;
    if (site?.pages) setHome(pickHome(site.pages));
    api<CmsPage[]>(`/api/public/sites/${slug}/pages`)
      .then((rows) => setHome(pickHome(rows)))
      .catch(() =>
        api<CmsPage[]>(`/api/public/cms/${slug}/pages`)
          .then((rows) => setHome(pickHome(rows)))
          .catch(() => setHome(site?.pages ? pickHome(site.pages) : null))
      );
  }, [slug, site]);

  useEffect(() => {
    if (!token || user?.role !== "STUDENT") return;
    api<MyCourse[]>("/api/actions/my-courses")
      .then((rows) => setOwned(new Set(rows.map((r) => r.course.id))))
      .catch(() => undefined);
  }, [token, user?.role]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!courses) return <p className="text-sm text-slate-500">Loading courses…</p>;

  const grid = (
    <div className="grid gap-4 sm:grid-cols-2">
      {courses.length === 0 && <p className="text-sm text-slate-500">No published courses yet.</p>}
      {courses.map((c) => (
        <Link key={c.id} to={`${sitePath(slug)}/courses/${c.shareSlug || c.id}`} className="overflow-hidden rounded-2xl border border-line bg-white hover:border-brand">
          <img src={`/api/public/sites/${slug}/courses/${c.id}/cover`} alt="" className="h-36 w-full bg-navy object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <div className="p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">{c.category && c.category !== "Others" ? c.category : "Course"}</p>
            <h2 className="mt-1 text-lg font-semibold text-navy">{c.name}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-slate-500">{c.description || "Open this course to see lessons, fees, and how to enrol."}</p>
            <p className="mt-4 text-lg font-bold text-navy">
              {owned.has(c.id) ? "Continue learning" : c.price === 0 ? "Free" : formatInr(c.price)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {banners.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {banners.map((b) =>
            b.linkUrl ? (
              <a key={b.id} href={b.linkUrl} className="overflow-hidden rounded-2xl border border-line bg-white">
                {b.imageUrl && <img src={b.imageUrl} alt="" className="h-28 w-full object-cover" />}
                <p className="p-3 text-sm font-medium text-navy">{b.title}</p>
              </a>
            ) : (
              <div key={b.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                {b.imageUrl && <img src={b.imageUrl} alt="" className="h-28 w-full object-cover" />}
                <p className="p-3 text-sm font-medium text-navy">{b.title}</p>
              </div>
            ),
          )}
        </div>
      )}
      {home?.body ? <PageSections body={home.body} catalog={grid} slug={slug} /> : (
        <>
          <h1 className="text-2xl font-bold text-navy">Courses</h1>
          {grid}
        </>
      )}
    </div>
  );
}

function CoursePage() {
  const slug = useSlug();
  const { courseId } = useParams();
  const { token, user, applySession } = useAuth();
  const { site } = useSite(slug);
  const navigate = useNavigate();
  const siteLive = site?.live !== false;
  const [course, setCourse] = useState<PublicCourse | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"overview" | "content">("overview");
  const studentBuyer = user?.role === "STUDENT";
  const [name, setName] = useState(studentBuyer ? user?.name || "" : "");
  const [email, setEmail] = useState(studentBuyer ? user?.email || "" : "");
  const [phone, setPhone] = useState(studentBuyer ? user?.phone || "" : "");
  const [coupon, setCoupon] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [couponOk, setCouponOk] = useState<string | null>(null);
  const [owned, setOwned] = useState(false);
  const [ownedError, setOwnedError] = useState<string | null>(null);
  const [validityOption, setValidityOption] = useState("a");

  useEffect(() => {
    if (!slug || !courseId) return;
    let cancelled = false;
    api<PublicCourse>(`/api/public/sites/${slug}/courses/${courseId}`)
      .then(async (row) => {
        if (cancelled) return;
        setCourse(row);
        setPrice(Number(row.price));
        if (row.validityOptions?.[0]?.id) setValidityOption(row.validityOptions[0].id);
        if (token && user?.role === "STUDENT") {
          setOwnedError(null);
          try {
            const rows = await api<MyCourse[]>("/api/actions/my-courses");
            if (cancelled) return;
            setOwned(rows.some((r) => r.course.id === row.id || r.course.id === courseId));
          } catch (err) {
            if (cancelled) return;
            setOwned(false);
            setOwnedError((err as Error).message || "Could not check enrolment");
          }
        } else {
          setOwned(false);
          setOwnedError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    api<OutlineItem[]>(`/api/public/sites/${slug}/courses/${courseId}/outline`)
      .then((rows) => {
        if (!cancelled) setOutline(rows);
      })
      .catch(() => {
        if (!cancelled) setOutline([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, courseId, token, user?.role]);

  async function applyCoupon() {
    if (!slug || !course?.id || !coupon.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ price: number; code: string }>(`/api/public/sites/${slug}/coupons/apply`, {
        method: "POST",
        body: JSON.stringify({ courseId: course.id, code: coupon.trim() }),
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
    if (!slug || !course?.id) return;
    setBusy(true);
    setError(null);
    try {
      fetch(`/api/public/sites/${slug}/hit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "BUY_CLICK", path: `/courses/${course.id}` }),
      }).catch(() => undefined);
      const res = await api<CheckoutOrder & { token?: string; user?: { id: string; name: string; email: string; role: string; organizationId: string; packageTier: string }; receiptNo?: string; loginHint?: string; phone?: string; invoiceId?: string }>(
        `/api/public/sites/${slug}/purchase`,
        {
          method: "POST",
          body: JSON.stringify({ fullName: name, email, phone, courseId: course.id, couponCode: couponOk || undefined, validityOption }),
        }
      );
      let receiptNo = res.receiptNo;
      let loginHint = res.loginHint;
      if (res.checkout) {
        const paid = await openRazorpay(res);
        const done = await api<{ token: string; user: { id: string; name: string; email: string; role: string; organizationId: string; packageTier: string }; receiptNo?: string; loginHint?: string }>(
          `/api/public/sites/${slug}/purchase/confirm`,
          {
            method: "POST",
            body: JSON.stringify({ invoiceId: res.invoiceId, ...paid }),
          }
        );
        applySession(done);
        receiptNo = done.receiptNo || receiptNo;
        loginHint = done.loginHint || loginHint;
      } else if (res.token && res.user) {
        applySession({ token: res.token, user: res.user });
      }
      try {
        const w = window as unknown as { fbq?: (...args: unknown[]) => void; gtag?: (...args: unknown[]) => void };
        w.fbq?.("track", "Purchase", { value: pay, currency: "INR" });
        w.gtag?.("event", "purchase", { value: pay, currency: "INR", transaction_id: res.invoiceId });
      } catch {
        /* tracking is best-effort */
      }
      navigate(`${sitePath(slug)}/learn/${course.id}`, {
        state: {
          purchaseNotice: [receiptNo ? `Receipt ${receiptNo}.` : null, loginHint || `Log in later with ${phone} on this website (OTP).`].filter(Boolean).join(" "),
        },
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!course && !error) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!course) return <p className="text-sm text-red-600">{error}</p>;

  const loggedStudent = token && user?.role === "STUDENT";
  const selected = (course.validityOptions ?? []).find((o) => o.id === validityOption);
  const pay = selected ? Number(selected.price) : price ?? Number(course.price);
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
          <Link to={`${sitePath(slug)}`} className="text-brand hover:underline">
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
                {course.allowLive && (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Live classes</span>
                    <span className="block text-slate-500">Join scheduled sessions from your learning area.</span>
                  </p>
                )}
                {course.allowTrial && (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Trial access</span>
                    <span className="block text-slate-500">Explore before you commit — enrol to start.</span>
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
              <p className="text-2xl font-bold text-navy">{pay === 0 ? "Free" : formatInr(pay)}</p>
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
          {ownedError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Could not verify if you already own this course. You can still enrol; refresh if you already paid.
            </p>
          )}
          {owned ? (
            <>
              <p className="text-sm text-slate-600">This course is already in your library.</p>
              <Link className="block w-full rounded-lg bg-brand py-2.5 text-center font-semibold text-white" to={`${sitePath(slug)}/learn/${course.id}`}>
                Continue learning
              </Link>
            </>
          ) : !siteLive ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This website is not published yet, so enrolment is closed. Ask the institute to publish.
            </p>
          ) : (
            <>
          {(course.validityOptions?.length ?? 0) > 1 && (
            <div className="space-y-2">
              {course.validityOptions!.map((opt) => (
                <label key={opt.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <span>
                    <input
                      type="radio"
                      className="mr-2"
                      checked={validityOption === opt.id}
                      onChange={() => {
                        setValidityOption(opt.id);
                        setPrice(opt.price);
                      }}
                    />
                    {opt.label}
                  </span>
                  <span className="font-semibold">{formatInr(opt.price)}</span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xl font-bold text-navy">{pay === 0 ? "Free" : formatInr(pay)}</p>
          {course.allowLive && <p className="text-xs font-medium text-brand">Includes live classes</p>}
          {course.allowTrial && pay > 0 && (
            <p className="text-xs text-slate-500">Trial available after enrol — open lessons from My learning.</p>
          )}
          {token && user && user.role !== "STUDENT" && (
            <p className="text-xs text-amber-800">
              You&apos;re signed in as institute staff. Open this page in a private window, or log out, to buy as a student.
            </p>
          )}
          {loggedStudent ? (
            <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => buy()}>
              {busy ? "Unlocking…" : pay === 0 ? (course.allowTrial ? "Start trial" : "Enroll free") : "Get this course"}
            </button>
          ) : (
            <form className="space-y-2" onSubmit={buy}>
              <input className="w-full rounded-lg border border-line px-3 py-2 text-sm" required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="w-full rounded-lg border border-line px-3 py-2 text-sm" required placeholder="Mobile" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="w-full rounded-lg border border-line px-3 py-2 text-sm" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy}>
                {busy ? "Processing…" : pay === 0 ? (course.allowTrial ? "Start trial" : "Enroll free") : "Get this course"}
              </button>
            </form>
          )}
          {!loggedStudent && (
            <p className="text-center text-xs text-slate-400">
              Already purchased?{" "}
              <Link className="text-brand" to={`${sitePath(slug)}/login`}>
                Login
              </Link>
            </p>
          )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function StudentLoginPage() {
  const slug = useSlug();
  const { token, user, loginWithOtp, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || `${sitePath(slug)}/learn`;
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
      <p className="mt-1 text-sm text-slate-500">Use the mobile you registered, enrolled with, or purchased with.</p>
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
          {sent.devOtp && <p className="text-xs text-slate-400">Local OTP: {sent.devOtp}</p>}
          <input className="w-full rounded-lg border border-line px-3 py-2 tracking-[0.3em]" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Signing in…" : "Login"}
          </button>
          <div className="flex justify-between text-xs">
            <button type="button" className="text-brand" onClick={() => { setSent(null); setOtp(""); }}>
              Change number
            </button>
            <button type="button" className="text-brand" disabled={busy} onClick={() => void sendOtp({ preventDefault() {} } as FormEvent)}>
              Resend OTP
            </button>
          </div>
        </form>
      )}
      {mode === "email" && (
        <form className="mt-4 space-y-3" onSubmit={emailLogin}>
          <input className="w-full rounded-lg border border-line px-3 py-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordInput placeholder="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Signing in…" : "Login"}
          </button>
          <p className="text-center text-xs">
            <Link className="text-brand" to={`${sitePath(slug)}/forgot`}>
              Forgot password
            </Link>
          </p>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">
        New student?{" "}
        <Link className="font-medium text-brand" to={`${sitePath(slug)}/register`}>
          Register
        </Link>
      </p>
    </div>
  );
}

function StudentRegisterPage() {
  const slug = useSlug();
  const { token, user, applySession } = useAuth();
  const { site } = useSite(slug);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const courseParam = params.get("course") || undefined;
  const [resolvedCourseId, setResolvedCourseId] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState<{ phone?: string; devOtp?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!courseParam || !slug) {
      setResolvedCourseId(undefined);
      return;
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(courseParam)) {
      setResolvedCourseId(courseParam);
      return;
    }
    void api<{ id: string; shareSlug?: string }[]>(`/api/public/sites/${slug}/courses`)
      .then((list) => {
        const hit = (list ?? []).find((c) => c.id === courseParam || c.shareSlug === courseParam);
        setResolvedCourseId(hit?.id);
      })
      .catch(() => setResolvedCourseId(undefined));
  }, [courseParam, slug]);

  if (token && user?.role === "STUDENT") {
    return <Navigate to={`${sitePath(slug)}/learn`} replace />;
  }

  if (site && site.live === false) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-6">
        <h1 className="text-xl font-bold text-navy">Registration is not open yet</h1>
        <p className="mt-2 text-sm text-slate-500">This institute still needs to publish the website. Ask them to click Publish, then register here.</p>
      </div>
    );
  }

  async function sendOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ phone?: string; devOtp?: string }>(`/api/public/sites/${slug}/register/otp`, {
        method: "POST",
        body: JSON.stringify({ fullName: name, phone, email, courseId: resolvedCourseId }),
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
      const res = await api<{ token: string; user: { id: string; name: string; email: string; phone?: string; role: string; organizationId: string; packageTier: string } }>(
        `/api/public/sites/${slug}/register/verify`,
        { method: "POST", body: JSON.stringify({ phone, otp }) }
      );
      applySession(res);
      navigate(`${sitePath(slug)}/learn`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-6">
      <h1 className="text-xl font-bold text-navy">Create your student account</h1>
      <p className="mt-1 text-sm text-slate-500">Register with your mobile. You can buy a course after you log in.</p>
      {!sent ? (
        <form className="mt-4 space-y-3" onSubmit={sendOtp}>
          <input className="w-full rounded-lg border border-line px-3 py-2" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="w-full rounded-lg border border-line px-3 py-2" placeholder="Mobile" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          <input className="w-full rounded-lg border border-line px-3 py-2" type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy || !name.trim() || !phone.trim()}>
            {busy ? "Sending…" : "Send OTP"}
          </button>
        </form>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={verify}>
          {sent.devOtp && <p className="text-xs text-slate-400">Local OTP: {sent.devOtp}</p>}
          <input className="w-full rounded-lg border border-line px-3 py-2 tracking-[0.3em]" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
          <div className="flex justify-between text-xs">
            <button type="button" className="text-brand" onClick={() => { setSent(null); setOtp(""); }}>
              Change number
            </button>
            <button type="button" className="text-brand" disabled={busy} onClick={() => void sendOtp({ preventDefault() {} } as FormEvent)}>
              Resend OTP
            </button>
          </div>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link className="font-medium text-brand" to={`${sitePath(slug)}/login`}>
          Login
        </Link>
      </p>
    </div>
  );
}

function MyLearningPage() {
  const slug = useSlug();
  const [home, setHome] = useState<{
    courses: MyCourse[];
    today?: {
      live?: { title: string; startsAt?: string; meetingUrl?: string; courseName?: string }[];
      classes?: { subject: string; startTime?: string; endTime?: string; room?: string; faculty?: string; courseName?: string }[];
      due?: { title: string; dueAt?: string; courseId?: string; courseName?: string }[];
      tests?: { title: string; courseId?: string; lastScore?: number; attemptsLeft?: number | null; done?: boolean }[];
      fees?: { count: number; total: number; invoiceNo?: string };
      notice?: { title: string; body: string };
      certificates?: { id: string; title: string; issuedOn?: string; certificateNo?: string }[];
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<NonNullable<typeof home>>("/api/actions/student-home")
      .then(setHome)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!home) return <p className="text-sm text-slate-500">Loading…</p>;
  const rows = home.courses ?? [];
  const today = home.today || {};
  const resume = rows.find((r) => (r.progressPct || 0) < 100) || rows[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">My learning</h1>
        <p className="text-sm text-slate-500">Pick up where you left off. Today’s class, homework, and dues are here.</p>
      </div>
      {resume && (
        <Link to={`${sitePath(slug)}/learn/${resume.course.id}`} className="block rounded-2xl border border-brand bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-brand">Continue</p>
          <p className="mt-1 text-lg font-semibold text-navy">{resume.course.name}</p>
          <p className="mt-1 text-sm text-slate-500">{resume.progress?.resume || "Open to study"}</p>
        </Link>
      )}
      {(today.classes?.length || today.live?.length || today.due?.length || today.tests?.length || (today.fees?.count ?? 0) > 0 || today.notice) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {today.notice && (
            <div className="rounded-2xl border border-line bg-white p-4 sm:col-span-2">
              <p className="text-xs uppercase text-slate-400">Notice</p>
              <p className="mt-1 font-medium text-navy">{today.notice.title}</p>
              {today.notice.body && <p className="mt-1 text-sm text-slate-600">{today.notice.body}</p>}
            </div>
          )}
          {(today.classes ?? []).map((c, i) => (
            <div key={`c-${i}`} className="rounded-2xl border border-line bg-white p-4">
              <p className="text-xs uppercase text-slate-400">Today’s class</p>
              <p className="mt-1 font-medium text-navy">{c.subject}</p>
              <p className="text-sm text-slate-500">
                {(c.startTime || "").slice(0, 5)}
                {c.endTime ? `–${String(c.endTime).slice(0, 5)}` : ""}
                {c.room ? ` · ${c.room}` : ""}
                {c.faculty ? ` · ${c.faculty}` : ""}
              </p>
            </div>
          ))}
          {(today.live ?? []).slice(0, 2).map((l, i) => (
            <div key={`l-${i}`} className="rounded-2xl border border-line bg-white p-4">
              <p className="text-xs uppercase text-slate-400">Live</p>
              <p className="mt-1 font-medium text-navy">{l.title}</p>
              <p className="text-sm text-slate-500">{l.startsAt ? formatWhen(l.startsAt) : "Join when your faculty starts"}</p>
              {l.meetingUrl && (
                <a className="mt-2 inline-block text-sm font-medium text-brand" href={l.meetingUrl} target="_blank" rel="noreferrer">
                  Join class
                </a>
              )}
            </div>
          ))}
          {(today.due ?? []).slice(0, 2).map((d, i) => (
            <Link key={`d-${i}`} to={`${sitePath(slug)}/learn/${d.courseId}`} className="rounded-2xl border border-line bg-white p-4">
              <p className="text-xs uppercase text-slate-400">Homework due</p>
              <p className="mt-1 font-medium text-navy">{d.title}</p>
              <p className="text-sm text-slate-500">{d.dueAt ? formatWhen(d.dueAt) : d.courseName}</p>
            </Link>
          ))}
          {(today.tests ?? []).filter((t) => !t.done).slice(0, 2).map((t, i) => (
            <Link key={`t-${i}`} to={`${sitePath(slug)}/learn/${t.courseId}`} className="rounded-2xl border border-line bg-white p-4">
              <p className="text-xs uppercase text-slate-400">Test</p>
              <p className="mt-1 font-medium text-navy">{t.title}</p>
              <p className="text-sm text-slate-500">{t.attemptsLeft == null ? "Open" : `${t.attemptsLeft} attempt(s) left`}</p>
            </Link>
          ))}
          {(today.fees?.count ?? 0) > 0 && (
            <Link to={`${sitePath(slug)}/fees`} className="rounded-2xl border border-line bg-white p-4">
              <p className="text-xs uppercase text-slate-400">Fees</p>
              <p className="mt-1 font-medium text-navy">₹{today.fees?.total} due</p>
              <p className="text-sm text-slate-500">{today.fees?.invoiceNo} · Pay now</p>
            </Link>
          )}
        </div>
      )}
      {rows.length === 0 && (
        <p className="text-sm text-slate-500">
          No courses yet.{" "}
          <Link className="text-brand" to={`${sitePath(slug)}`}>
            Browse catalog
          </Link>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => {
          const p = row.progress;
          const pct = Number(row.progressPct || p?.pct || 0);
          return (
            <Link key={row.course.id} to={`${sitePath(slug)}/learn/${row.course.id}`} className="rounded-2xl border border-line bg-white p-5 hover:border-brand">
              <p className="font-semibold text-navy">{row.course.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {pct >= 100 ? "Completed" : p?.resume ? `Next: ${p.resume}` : `${pct}% complete`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {p ? `${p.filesDone}/${p.filesTotal} lessons · ${p.homeworkDone}/${p.homeworkTotal} homework · ${p.testsDone}/${p.testsTotal} tests` : ""}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
      {(today.certificates ?? []).length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-brand">Certificates</p>
          <ul className="mt-2 space-y-1 text-sm">
            {(today.certificates ?? []).map((c) => (
              <li key={c.id}>
                {c.title}
                {c.issuedOn ? ` · ${formatDay(c.issuedOn)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StudyPage() {
  const slug = useSlug();
  const { courseId } = useParams();
  const location = useLocation();
  const purchaseNotice = (location.state as { purchaseNotice?: string } | null)?.purchaseNotice;
  const [course, setCourse] = useState<PublicCourse | null>(null);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<StudySection>("contents");

  useEffect(() => {
    setLoadError(null);
    api<MyCourse[]>("/api/actions/my-courses")
      .then((rows) => {
        const match = rows.find(
          (r) => r.course.id === courseId || (r.course as { shareSlug?: string }).shareSlug === courseId,
        );
        setCourse(match?.course || null);
        setEnrolled(!!match);
      })
      .catch((e) => {
        setEnrolled(false);
        setLoadError((e as Error).message || "Could not load your courses");
      });
  }, [courseId]);

  useEffect(() => {
    if (!course?.name) return;
    const site = document.title.split(" · ")[0];
    document.title = `${site} · ${course.name}`;
  }, [course?.name]);

  const nav: { id: StudySection; label: string }[] = [
    { id: "contents", label: "Contents" },
    { id: "practice", label: "Practice" },
    { id: "tests", label: "Tests" },
    { id: "live", label: "Live class" },
    { id: "recordings", label: "Recordings" },
    { id: "timetable", label: "Timetable" },
    { id: "assignments", label: "Assignments" },
    { id: "doubts", label: "Doubts" },
  ];

  if (loadError) {
    return (
      <div className="space-y-3">
        <Link to={`${sitePath(slug)}/learn`} className="text-sm text-brand hover:underline">
          ← My learning
        </Link>
        <h1 className="text-2xl font-bold text-navy">Could not open course</h1>
        <p className="text-sm text-red-600">{loadError}</p>
        <p className="text-sm text-slate-500">Try again, or go back to My learning.</p>
      </div>
    );
  }

  if (enrolled === null) {
    return <p className="text-sm text-slate-500">Checking enrolment…</p>;
  }

  if (enrolled === false) {
    return (
      <div className="space-y-3">
        <Link to={`${sitePath(slug)}/learn`} className="text-sm text-brand hover:underline">
          ← My learning
        </Link>
        <h1 className="text-2xl font-bold text-navy">Course not in your library</h1>
        <p className="text-sm text-slate-500">
          You are not enrolled in this course.{" "}
          <Link className="text-brand" to={`${sitePath(slug)}`}>
            Browse catalog
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to={`${sitePath(slug)}/learn`} className="text-sm text-brand hover:underline">
        ← My learning
      </Link>
      <h1 className="text-2xl font-bold text-navy">{course?.name || "Course"}</h1>
      {purchaseNotice && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{purchaseNotice}</p>}
      <div className="grid items-start gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col lg:overflow-visible">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium ${
                tab === item.id ? "bg-navy text-white" : "text-navy hover:bg-mist"
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {courseId && tab === "contents" && (
            <StudentCourseLibrary courseId={courseId} allowDownload={course?.allowOffline !== false} />
          )}
          {courseId && tab === "tests" && (
            <StudentCourseLibrary courseId={courseId} allowDownload={course?.allowOffline !== false} examsOnly />
          )}
          {courseId && tab === "practice" && <PracticeLab courseId={courseId} />}
          {courseId && tab !== "contents" && tab !== "tests" && tab !== "practice" && <StudentLms courseId={courseId} embedded section={tab} />}
        </div>
      </div>
    </div>
  );
}

function PracticeLab({ courseId }: { courseId: string }) {
  const [lab, setLab] = useState<{
    language: string;
    starter: string;
    prompt: string;
    questionId?: string;
    languages?: { id: string; label: string; available?: boolean }[];
  } | null>(null);
  const [source, setSource] = useState("");
  const [stdin, setStdin] = useState("");
  const [language, setLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<NonNullable<typeof lab>>(`/api/actions/courses/${courseId}/practice`)
      .then((row) => {
        setLab(row);
        setLanguage(row.language);
        setSource(row.starter || "");
      })
      .catch((e: Error) => setError(e.message));
  }, [courseId]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ ok?: boolean; stdout?: string; stderr?: string; label?: string }>(
        lab?.questionId ? "/api/actions/code/run" : "/api/actions/code/practice",
        {
          method: "POST",
          body: JSON.stringify(
            lab?.questionId ? { questionId: lab.questionId, source, stdin } : { courseId, language, source, stdin },
          ),
        },
      );
      setOk(res.ok ?? true);
      setOutput([res.stdout, res.stderr].filter(Boolean).join("\n") || "Ran with no output.");
    } catch (e) {
      setOk(false);
      setOutput((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !lab) return <p className="text-sm text-red-600">{error}</p>;
  if (!lab) return <p className="text-sm text-slate-500">Opening your runner…</p>;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-base font-semibold text-navy">{(language || lab.language).toUpperCase()} runner</h2>
      <p className="mt-1 text-sm text-slate-500">{lab.prompt}</p>
      {(lab.languages ?? []).length > 0 && (
        <select
          className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={language}
          onChange={(e) => {
            const next = e.target.value;
            setLanguage(next);
            const starter = lab.languages?.find((l) => l.id === next);
            if (starter) setSource(lab.starter && next === lab.language ? lab.starter : source);
          }}
        >
          {(lab.languages ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
              {l.available === false ? " (runner not configured)" : ""}
            </option>
          ))}
        </select>
      )}
      <textarea
        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100"
        rows={14}
        spellCheck={false}
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />
      <label className="mt-2 block text-sm">
        <span className="text-slate-600">Program input (stdin)</span>
        <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm" value={stdin} onChange={(e) => setStdin(e.target.value)} />
      </label>
      <button type="button" disabled={busy} className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void run()}>
        {busy ? "Running…" : "Run"}
      </button>
      {output && (
        <pre className={`mt-3 overflow-x-auto rounded-lg p-3 text-xs ${ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{output}</pre>
      )}
    </div>
  );
}

function StudentNotices() {
  const anns = useApi<{ title: string; body: string; createdAt?: string }[]>("/api/announcements");
  const notes = useApi<{ title: string; body: string; status?: string; createdAt?: string }[]>("/api/notifications");
  const unread = (notes.data ?? []).filter((n) => n.status && n.status !== "READ").length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Notices {unread > 0 ? <span className="text-sm font-medium text-brand">({unread} new)</span> : null}</h1>
        <p className="text-sm text-slate-500">Announcements and messages from your institute.</p>
      </div>
      <Card title="Announcements">
        {(anns.data ?? []).length === 0 && <p className="text-sm text-slate-500">No announcements yet.</p>}
        <ul className="space-y-3 text-sm">
          {(anns.data ?? []).map((a, i) => (
            <li key={i}>
              <p className="font-medium text-navy">{a.title}</p>
              {a.createdAt && <p className="text-xs text-slate-400">{formatDay(a.createdAt)}</p>}
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
              {n.createdAt && <p className="text-xs text-slate-400">{formatDay(n.createdAt)}</p>}
              {n.body && <p className="mt-1 text-slate-600">{n.body}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StudentChats() {
  const { user } = useAuth();
  const threads = useApi<{ id: string; subject?: string; status: string }[]>("/api/chat-threads");
  const messages = useApi<{ id: string; threadId: string; senderName?: string; senderRole?: string; body: string; createdAt?: string }[]>("/api/chat-messages");
  const [active, setActive] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mine = (messages.data ?? []).filter((m) => m.threadId === active);

  async function startThread() {
    setError(null);
    try {
      const thread = await createRecord<{ id: string }>("/api/chat-threads", {
        subject: subject || "Help",
        status: "OPEN",
      });
      setActive(thread.id);
      setSubject("");
      threads.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function send() {
    if (!active || !body) return;
    setError(null);
    try {
      await createRecord("/api/chat-messages", {
        threadId: active,
        senderRole: user?.role || "STUDENT",
        senderName: user?.name || "Student",
        body,
      });
      setBody("");
      messages.reload();
      threads.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Chat</h1>
        <p className="text-sm text-slate-500">Message your institute. Faculty reply in the same thread.</p>
      </div>
      <ErrorText error={error} />
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card title="Conversations">
          <FormGrid>
            <Field label="New topic" value={subject} onChange={setSubject} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton onClick={() => void startThread()}>Start chat</PrimaryButton>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {(threads.data ?? []).length === 0 && <li className="text-slate-500">No chats yet.</li>}
            {(threads.data ?? []).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left ${active === t.id ? "bg-navy text-white" : "bg-mist"}`}
                  onClick={() => setActive(t.id)}
                >
                  {t.subject || "Conversation"}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Messages">
          {!active && <p className="text-sm text-slate-500">Start a chat or pick one on the left.</p>}
          {active && (
            <>
              <div className="mb-4 max-h-80 space-y-2 overflow-y-auto">
                {mine.map((m) => (
                  <div key={m.id} className="rounded-lg bg-mist px-3 py-2 text-sm">
                    <p className="text-xs text-slate-500">
                      {m.senderName || m.senderRole}
                      {m.createdAt ? ` · ${formatWhen(m.createdAt)}` : ""}
                    </p>
                    <p>{m.body}</p>
                  </div>
                ))}
                {mine.length === 0 && <p className="text-sm text-slate-500">No messages yet. Write the first one.</p>}
              </div>
              <FormGrid>
                <Field label="Message" value={body} onChange={setBody} />
              </FormGrid>
              <div className="mt-3">
                <PrimaryButton disabled={!body} onClick={() => void send()}>
                  Send
                </PrimaryButton>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function StudentForgotPage() {
  const slug = useSlug();
  const [method, setMethod] = useState<"otp" | "email">("otp");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState<{ phone?: string; devOtp?: string; resetToken?: string } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (method === "otp") {
        const res = await api<{ phone?: string; devOtp?: string }>("/api/auth/forgot/otp", { method: "POST", body: JSON.stringify({ phone }) });
        setSent(res);
      } else {
        const res = await api<{ resetToken?: string }>("/api/auth/forgot/email", { method: "POST", body: JSON.stringify({ email }) });
        setSent(res);
        if (res.resetToken) setToken(res.resetToken);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (method === "otp") {
        await api("/api/auth/reset/otp", { method: "POST", body: JSON.stringify({ phone, otp, newPassword: password }) });
      } else {
        await api("/api/auth/reset/email", { method: "POST", body: JSON.stringify({ token, newPassword: password }) });
      }
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-6">
      <h1 className="text-xl font-bold text-navy">{done ? "Password updated" : "Forgot password"}</h1>
      {done ? (
        <>
          <p className="mt-2 text-sm text-slate-500">Sign in with your new password or mobile OTP.</p>
          <Link className="mt-4 inline-block text-sm font-medium text-brand" to={`${sitePath(slug)}/login`}>
            Back to login
          </Link>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">Reset with the mobile or email on your purchase.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" className={`rounded-full px-3 py-1 text-sm ${method === "otp" ? "bg-navy text-white" : "bg-mist"}`} onClick={() => { setMethod("otp"); setSent(null); }}>
              Mobile OTP
            </button>
            <button type="button" className={`rounded-full px-3 py-1 text-sm ${method === "email" ? "bg-navy text-white" : "bg-mist"}`} onClick={() => { setMethod("email"); setSent(null); }}>
              Email
            </button>
          </div>
          {!sent ? (
            <form className="mt-4 space-y-3" onSubmit={requestReset}>
              {method === "otp" ? (
                <input className="w-full rounded-lg border border-line px-3 py-2" placeholder="Mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
              ) : (
                <input className="w-full rounded-lg border border-line px-3 py-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
                {busy ? "Sending…" : "Send reset"}
              </button>
            </form>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={savePassword}>
              {method === "otp" && (
                <input className="w-full rounded-lg border border-line px-3 py-2 tracking-[0.3em]" maxLength={6} placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
              )}
              {method === "email" && !token && (
                <input className="w-full rounded-lg border border-line px-3 py-2" placeholder="Reset token from email" value={token} onChange={(e) => setToken(e.target.value)} />
              )}
              <PasswordInput placeholder="New password" value={password} onChange={setPassword} autoComplete="new-password" />
              <PasswordInput placeholder="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
                {busy ? "Saving…" : "Set password"}
              </button>
            </form>
          )}
          <p className="mt-4 text-center text-xs">
            <Link className="text-brand" to={`${sitePath(slug)}/login`}>
              Back to login
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function LandingLeadPage() {
  const slug = useSlug();
  const { pageSlug } = useParams();
  const [page, setPage] = useState<{ headline?: string; body?: string; ctaLabel?: string; name?: string; slug?: string; formJson?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!slug || !pageSlug) return;
    api<typeof page>(`/api/public/sites/${slug}/landing/${pageSlug}`)
      .then(setPage)
      .catch((e: Error) => setError(e.message));
  }, [slug, pageSlug]);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!page) return <p className="text-sm text-slate-500">Loading…</p>;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy">{page.headline || page.name}</h1>
        {page.body && <p className="mt-3 whitespace-pre-wrap text-slate-600">{page.body}</p>}
      </div>
      <Card title={page.ctaLabel || "Register now"}>
        <EnquireForm slug={slug} landingSlug={page.slug || pageSlug} fields={parseFormFields(page.formJson)} />
      </Card>
    </div>
  );
}

function OneToOneBookPage() {
  const slug = useSlug();
  const { token, user } = useAuth();
  const [rows, setRows] = useState<{ id: string; title: string; mentorName?: string; durationMinutes: number; price: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    api<typeof rows>(`/api/public/sites/${slug}/one-to-one`)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [slug]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Book a 1:1 session</h1>
      <p className="text-sm text-slate-500">Pick a mentor slot. If it is paid, a fee invoice appears under Fees.</p>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((s) => (
          <Card key={s.id} title={s.title}>
            <p className="text-sm text-slate-500">{s.mentorName || "Mentor"} · {s.durationMinutes} min</p>
            <p className="mt-2 font-semibold text-navy">{s.price ? formatInr(s.price) : "Free"}</p>
            <div className="mt-3">
              <PrimaryButton
                onClick={async () => {
                  setError(null);
                  setNotice(null);
                  if (!token || user?.role !== "STUDENT") {
                    window.location.href = `${sitePath(slug)}/login?next=${encodeURIComponent(sitePath(slug, "/one-to-one"))}`;
                    return;
                  }
                  try {
                    const out = await api<{ meetingUrl?: string; invoiceNo?: string }>("/api/actions/one-to-one/" + s.id + "/book", {
                      method: "POST",
                      body: "{}",
                    });
                    setNotice(out.invoiceNo ? `Booked. Pay invoice ${out.invoiceNo} on Fees.` : `Booked. Join: ${out.meetingUrl || "link in notices"}`);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Book
              </PrimaryButton>
            </div>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">No 1:1 offerings yet.</p>}
      </div>
    </div>
  );
}

function AppInstallPage() {
  const slug = useSlug();
  const { site } = useSite(slug);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pushOn, setPushOn] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-line bg-white p-6">
        <h1 className="text-2xl font-bold text-navy">Install the student app</h1>
        <p className="mt-2 text-sm text-slate-500">
          This is an installable website app (PWA) for {site?.name || "this institute"}. It is not a Play Store listing.
        </p>
        {prompt && !installed && (
          <button
            className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white"
            type="button"
            onClick={async () => {
              await prompt.prompt();
              setPrompt(null);
            }}
          >
            Install on this phone
          </button>
        )}
        {installed && <p className="mt-4 text-sm text-emerald-700">Installed. Open it from your home screen.</p>}
        <button
          className="mt-4 rounded-full border border-line px-5 py-2 text-sm"
          type="button"
          onClick={async () => {
            if (typeof Notification === "undefined") return;
            const perm = await Notification.requestPermission();
            setPushOn(perm === "granted");
            if (perm === "granted") {
              new Notification(site?.name || "Student app", { body: "Notices will also appear under Notices after you log in." });
            }
          }}
        >
          {pushOn ? "Browser notices are on" : "Allow browser notices"}
        </button>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>On Android Chrome, tap Install if you see it, or Menu → Add to Home screen.</li>
          <li>On iPhone Safari, tap Share → Add to Home Screen.</li>
          <li>Open {site?.name || "the institute"} from the home screen to study and pay fees.</li>
        </ol>
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

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };
