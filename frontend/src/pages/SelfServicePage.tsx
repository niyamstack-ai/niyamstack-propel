import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth";

/** Self-service enroll still exists under Courses → Backend addition. Keep this route with a clear handoff. */
export function SelfServicePage() {
  const { user } = useAuth();
  const [go, setGo] = useState(false);
  const studentSite = user?.orgSlug ? `/s/${user.orgSlug}/learn` : "/";
  const isLearner = user?.role === "STUDENT" || user?.role === "PARENT";
  const dest = isLearner ? studentSite : "/courses?view=backend";

  if (go) return <Navigate to={dest} replace />;

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-line bg-white p-6">
      <h1 className="text-xl font-bold text-navy">Self-service enrol moved</h1>
      {isLearner ? (
        <p className="text-sm text-slate-600">
          Students enrol and learn on the student site. This menu entry stays so old bookmarks still work.
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          Staff add backend / self-service seats from <span className="font-medium text-navy">Courses → Backend addition</span>. This menu entry stays so old bookmarks and help links still work.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => setGo(true)}>
          {isLearner ? "Open student site" : "Continue to Courses"}
        </button>
        <Link className="rounded-full border border-line px-4 py-2 text-sm" to="/">
          Back to home
        </Link>
      </div>
    </div>
  );
}
