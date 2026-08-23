import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth";
import { fileSrc } from "../api";
import { deleteRecord, ensureWebsitePublished, updateRecord } from "../ops";
import { ShareLinkBar } from "../shareLink";
import { ErrorText, useApi } from "../ui";
import { UserMenu } from "../UserMenu";
import { CourseContentPanel, StudentCourseLibrary } from "./courseContent";

type Course = {
  id: string;
  name: string;
  code?: string;
  fees?: number;
  description?: string;
  thumbnailUrl?: string;
  published?: boolean;
  courseType?: string;
  validityValue?: number;
  validityUnit?: string;
  durationMonths?: number;
};

export function CourseWorkspacePage() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const courses = useApi<Course[]>("/api/courses");
  const course = (courses.data ?? []).find((c) => c.id === courseId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!courseId) {
    return <p className="text-sm text-slate-500">Choose a course from the catalog.</p>;
  }
  if (!courses.data) return <p>Loading…</p>;
  if (!course) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This course was not found.</p>
        <Link className="text-sm text-brand hover:underline" to="/courses">
          Back to courses
        </Link>
      </div>
    );
  }

  const selected = course;
  const student = user?.role === "STUDENT";
  const draft = selected.published === false;

  async function publish() {
    setError(null);
    setBusy(true);
    try {
      await updateRecord(`/api/courses/${selected.id}`, { ...selected, published: true });
      await ensureWebsitePublished().catch(() => undefined);
      courses.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!window.confirm("Delete this unpublished course? Folders and files in it will be removed.")) return;
    setError(null);
    setBusy(true);
    try {
      await deleteRecord(`/api/courses/${selected.id}`);
      navigate("/courses");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (student) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link className="text-sm text-brand hover:underline" to="/courses">
              ← All courses
            </Link>
            <h1 className="mt-2 text-[28px] font-bold text-navy">{course.name}</h1>
            <p className="text-sm text-slate-500">Videos, PDFs, and tests for this course.</p>
          </div>
          <UserMenu />
        </div>
        <StudentCourseLibrary courseId={courseId} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-sm text-brand hover:underline" to="/courses">
            ← Your Courses
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-bold leading-tight text-navy">{course.name}</h1>
            {draft && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Unpublished</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">Add / view content of your course.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/courses/${course.id}/edit`} className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand">
            Edit course
          </Link>
          <UserMenu />
        </div>
      </div>

      {draft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>This course is a draft. Students cannot see or buy it until you publish.</p>
          <div className="flex flex-wrap gap-2">
            <Link to={`/courses/${course.id}/edit`} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium">
              Continue setup
            </Link>
            <button type="button" disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50" onClick={publish}>
              Publish
            </button>
            <button type="button" disabled={busy} className="rounded-lg px-3 py-1.5 text-red-700 hover:underline" onClick={removeDraft}>
              Delete draft
            </button>
          </div>
        </div>
      )}

      {params.get("share") === "1" && !draft && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Course published. Copy the student link and send it. They can open the page, pay, and start learning.
        </p>
      )}

      <ShareLinkBar slug={user?.orgSlug} courseId={course.id} published={!draft} />

      <ErrorText error={error} />

      {course.thumbnailUrl && (
        <img src={fileSrc(course.thumbnailUrl)} alt="" className="h-40 w-full max-w-xl rounded-2xl object-cover" />
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <CourseContentPanel courseId={courseId} />
      </div>
    </div>
  );
}
