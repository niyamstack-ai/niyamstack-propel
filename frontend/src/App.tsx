import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { usePlatformAuth } from "./platformAuth";
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
import { StorefrontAppPage, StorefrontCatalogPage, StorefrontChatsPage, StorefrontCoursePage, StorefrontFeesPage, StorefrontForgotPage, StorefrontJobsPage, StorefrontLayout, StorefrontLearnPage, StorefrontLoginPage, StorefrontNoticesPage, StorefrontProfilePage, StorefrontStudyPage } from "./pages/Storefront";

function Guard({ children }: { children: React.ReactNode }) {
  const { token, ready } = useAuth();
  if (!ready) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
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

function RoleGate() {
  const { user } = useAuth();
  const location = useLocation();
  if (!canOpen(user?.role, location.pathname)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot" element={<ForgotPage />} />
      <Route path="/s/:slug" element={<StorefrontLayout />}>
        <Route index element={<StorefrontCatalogPage />} />
        <Route path="courses/:courseId" element={<StorefrontCoursePage />} />
        <Route path="login" element={<StorefrontLoginPage />} />
        <Route path="forgot" element={<StorefrontForgotPage />} />
        <Route path="app" element={<StorefrontAppPage />} />
        <Route path="learn" element={<StorefrontLearnPage />} />
        <Route path="learn/:courseId" element={<StorefrontStudyPage />} />
        <Route path="profile" element={<StorefrontProfilePage />} />
        <Route path="fees" element={<StorefrontFeesPage />} />
        <Route path="jobs" element={<StorefrontJobsPage />} />
        <Route path="notices" element={<StorefrontNoticesPage />} />
        <Route path="chats" element={<StorefrontChatsPage />} />
      </Route>
      <Route path="/platform/login" element={<PlatformLoginPage />} />
      <Route
        path="/platform"
        element={
          <PlatformGuard>
            <PlatformShell />
          </PlatformGuard>
        }
      >
        <Route index element={<PlatformDashboardPage />} />
        <Route path="institutes" element={<PlatformInstitutesPage />} />
        <Route path="institutes/:id" element={<PlatformInstituteDetailPage />} />
        <Route path="employees" element={<PlatformEmployeesPage />} />
        <Route path="settings" element={<PlatformSettingsPage />} />
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
          <Route path="crm" element={<CrmPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="lms" element={<Navigate to="/courses" replace />} />
          <Route path="fees" element={<FeesPage />} />
          <Route path="placement" element={<PlacementPage />} />
          <Route path="readiness" element={<ReadinessPage />} />
          <Route path="alumni" element={<AlumniPage />} />
          <Route path="comms" element={<CommsPage />} />
          <Route path="institute" element={<InstitutePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
