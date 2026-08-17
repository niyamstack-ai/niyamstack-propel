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
import { LmsPage } from "./pages/LmsPage";
import { FeesPage } from "./pages/FeesPage";
import { PlacementPage } from "./pages/PlacementPage";
import { ReadinessPage } from "./pages/ReadinessPage";
import { AlumniPage } from "./pages/AlumniPage";
import { CommsPage } from "./pages/CommsPage";
import { InstitutePage } from "./pages/InstitutePage";
import { AnalyticsPage } from "./pages/AnalyticsPage";

function Guard({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
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
          <Route index element={<DashboardPage />} />
          <Route path="crm" element={<CrmPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="lms" element={<LmsPage />} />
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
