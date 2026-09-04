import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";

/** Self-service enroll lives on Courses → Backend addition for staff. */
export function SelfServicePage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT" || user?.role === "PARENT") {
    return <Navigate to="/courses" replace />;
  }
  return <Navigate to="/courses?view=backend" replace />;
}
