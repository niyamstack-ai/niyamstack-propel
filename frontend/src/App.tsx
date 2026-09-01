import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { hasCap, platformCapForPath, usePlatformAuth } from "./platformAuth";
import { Shell } from "./Shell";
import { canOpen } from "./portals";
import { LoginPage, SignupPage, ForgotPage } from "./pages/LoginPage";
import { PlatformLoginPage } from "./pages/platform/PlatformLoginPage";
import { PlatformShell } from "./pages/platform/PlatformShell";
import { PlatformDashboardPage } from "./pages/platform/PlatformDashboardPage";
import { PlatformInstitutesPage } from "./pages/platform/PlatformInstitutesPage";
import { PlatformInstituteDetailPage } from "./pages/platform/PlatformInstituteDetailPage";
import { PlatformSettingsPage } from "./pages/platform/PlatformSettingsPage";
import { PlatformEmployeesPage } from "./pages/platform/PlatformEmployeesPage";
import { MobileApp } from "./pages/MobileApps";
import { DashboardPage } from "./pages/DashboardPage";
import { CrmPage } from "./pages/CrmPage";
import { StudentsPage } from "./pages/StudentsPage";
import { FeesPage } from "./pages/FeesPage";
import { PlacementPage } from "./pages/PlacementPage";
import { ReadinessPage } from "./pages/ReadinessPage";
import { AlumniPage } from "./pages/AlumniPage";
import { CommsPage } from "./pages/CommsPage";
import { InstitutePage } from "./pages/InstitutePage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { WebsitePage } from "./pages/WebsitePage";
import { CourseWorkspacePage } from "./pages/CourseWorkspacePage";
import { CoursesCommercePage } from "./pages/CoursesCommercePage";
import { CreateCourseWizard } from "./pages/CreateCourseWizard";
import { ContentHubPage } from "./pages/ContentHubPage";
import { YourAppPage } from "./pages/YourAppPage";
import { LandingPagesPage } from "./pages/LandingPagesPage";
import { OneToOnePage } from "./pages/OneToOnePage";
import { ChatsPage } from "./pages/ChatsPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { SelfServicePage } from "./pages/SelfServicePage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { AuditPage } from "./pages/AuditPage";
import { LmsPage } from "./pages/LmsPage";
import { EssPage } from "./pages/EssPage";
import { AcademicsPage } from "./pages/AcademicsPage";
import { StorefrontAppPage, StorefrontCatalogPage, StorefrontChatsPage, StorefrontCmsPage, StorefrontCoursePage, StorefrontFeesPage, StorefrontForgotPage, StorefrontJobsPage, StorefrontLandingPage, StorefrontLayout, StorefrontLearnPage, StorefrontLoginPage, StorefrontNoticesPage, StorefrontOneToOnePage, StorefrontProfilePage, StorefrontRegisterPage, StorefrontStudyPage } from "./pages/Storefront";
import { LegalPage } from "./pages/LegalPage";
import { isProductHost } from "./siteHost";
import { useEffect, useState } from "react";
import { api } from "./api";

function Guard({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth();
  if (!token && !ready) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function HomePage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT" && user.orgSlug) {
    return <Navigate to={`/s/${user.orgSlug}/learn`} replace />;
  }
  return <DashboardPage />;
}

function PlatformGuard({ children }: { children: React.ReactNode }) {
  const { token, user } = usePlatformAuth();
  if (!token || !user?.role?.startsWith("PLATFORM_")) return <Navigate to="/platform/login" replace />;
  return children;
}

function PlatformCapGate() {
  const { user } = usePlatformAuth();
  const location = useLocation();
  const cap = platformCapForPath(location.pathname);
  if (cap && !hasCap(user, cap)) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-line bg-white p-8 text-center">
        <h1 className="text-xl font-bold text-navy">This role cannot open this page</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your Niyamstack staff role does not include the right needed for this screen. Use the menu on the left, or go
          back to the dashboard.
        </p>
        <Link className="mt-6 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white" to="/platform">
          Back to dashboard
        </Link>
      </div>
    );
  }
  return <Outlet />;
}

function RoleGate() {
  const { user } = useAuth();
  const location = useLocation();
  if (!canOpen(user?.role, location.pathname, user?.modules, user?.capabilities)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function storefrontChildRoutes() {
  return (
    <>
      <Route index element={<StorefrontCatalogPage />} />
      <Route path="courses/:courseId" element={<StorefrontCoursePage />} />
      <Route path="login" element={<StorefrontLoginPage />} />
      <Route path="register" element={<StorefrontRegisterPage />} />
      <Route path="forgot" element={<StorefrontForgotPage />} />
      <Route path="app" element={<StorefrontAppPage />} />
      <Route path="learn" element={<StorefrontLearnPage />} />
      <Route path="learn/:courseId" element={<StorefrontStudyPage />} />
      <Route path="profile" element={<StorefrontProfilePage />} />
      <Route path="fees" element={<StorefrontFeesPage />} />
      <Route path="jobs" element={<StorefrontJobsPage />} />
      <Route path="notices" element={<StorefrontNoticesPage />} />
      <Route path="chats" element={<StorefrontChatsPage />} />
      <Route path="p/:pageSlug" element={<StorefrontCmsPage />} />
      <Route path="l/:pageSlug" element={<StorefrontLandingPage />} />
      <Route path="one-to-one" element={<StorefrontOneToOnePage />} />
    </>
  );
}

function CustomDomainApp() {
  const [slug, setSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ slug: string }>(`/api/public/sites/by-host?host=${encodeURIComponent(window.location.hostname)}`)
      .then((site) => setSlug(site.slug))
      .catch((err: Error) => setError(err.message));
  }, []);
  if (error) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-bold">Website not connected yet</h1>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
      </div>
    );
  }
  if (!slug) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  return (
    <Routes>
      <Route element={<StorefrontLayout slug={slug} />}>{storefrontChildRoutes()}</Route>
    </Routes>
  );
}

export default function App() {
  if (!isProductHost()) {
    return <CustomDomainApp />;
  }
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/legal/terms" element={<LegalPage kind="terms" />} />
      <Route path="/legal/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/s/:slug" element={<StorefrontLayout />}>
        {storefrontChildRoutes()}
      </Route>
      <Route path="/platform/login" element={<PlatformLoginPage />} />
      <Route path="/m" element={<Guard><MobileApp /></Guard>} />
      <Route
        path="/platform"
        element={
          <PlatformGuard>
            <PlatformShell />
          </PlatformGuard>
        }
      >
        <Route element={<PlatformCapGate />}>
          <Route index element={<PlatformDashboardPage />} />
          <Route path="institutes" element={<PlatformInstitutesPage />} />
          <Route path="institutes/:id" element={<PlatformInstituteDetailPage />} />
          <Route path="employees" element={<PlatformEmployeesPage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="settings" element={<PlatformSettingsPage />} />
        </Route>
      </Route>
      <Route
        path="/"
        element={
          <Guard>
            <Shell />
          </Guard>
        }
      >
        <Route element={<RoleGate />}>
          <Route index element={<HomePage />} />
          <Route path="website" element={<WebsitePage />} />
          <Route path="courses" element={<CoursesCommercePage />} />
          <Route path="courses/new" element={<CreateCourseWizard />} />
          <Route path="courses/:courseId/edit" element={<CreateCourseWizard />} />
          <Route path="courses/:courseId" element={<CourseWorkspacePage />} />
          <Route path="content-hub" element={<ContentHubPage />} />
          <Route path="your-app" element={<YourAppPage />} />
          <Route path="landing-pages" element={<LandingPagesPage />} />
          <Route path="one-to-one" element={<OneToOnePage />} />
          <Route path="chats" element={<ChatsPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="people/:tab" element={<PeoplePage />} />
          <Route path="self-service" element={<SelfServicePage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="crm" element={<CrmPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="lms" element={<LmsPage />} />
          <Route path="ess" element={<EssPage />} />
          <Route path="academics" element={<AcademicsPage />} />
          <Route path="coupons" element={<Navigate to="/courses?view=coupons" replace />} />
          <Route path="fees" element={<FeesPage />} />
          <Route path="placement" element={<PlacementPage />} />
          <Route path="readiness" element={<ReadinessPage />} />
          <Route path="alumni" element={<AlumniPage />} />
          <Route path="comms" element={<CommsPage />} />
          <Route path="institute" element={<InstitutePage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
