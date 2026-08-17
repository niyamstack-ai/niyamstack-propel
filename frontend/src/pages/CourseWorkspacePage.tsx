import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { Card, useApi } from "../ui";
import { StaffLms, StudentLms } from "./LmsPage";

type Course = { id: string; name: string; code?: string; fees?: number; description?: string };

export function CourseWorkspacePage() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const courses = useApi<Course[]>("/api/courses");
  const course = (courses.data ?? []).find((c) => c.id === courseId);

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

  const student = user?.role === "STUDENT";

  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-brand hover:underline" to="/courses">
          ← All courses
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-navy">{course.name}</h1>
        <p className="text-sm text-slate-500">
          {student
            ? "Your videos, PDFs, quizzes, and assignments for this purchased course."
            : "Learning for this course — quizzes, recorded videos, PDFs, live class, and assignments."}
        </p>
      </div>
      {!student && (
        <Card title="Course">
          <p className="text-sm">
            {course.code || "—"} {course.fees != null ? `· ₹${course.fees}` : ""}
          </p>
          {course.description && <p className="mt-2 text-sm text-slate-500">{course.description}</p>}
        </Card>
      )}
      {student ? <StudentLms courseId={courseId} embedded /> : <StaffLms courseId={courseId} embedded />}
    </div>
  );
}
