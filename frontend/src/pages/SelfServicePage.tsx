import { Navigate } from "react-router-dom";

/** Self-service enroll lives on Courses → Backend addition. */
export function SelfServicePage() {
  return <Navigate to="/courses?view=backend" replace />;
}
