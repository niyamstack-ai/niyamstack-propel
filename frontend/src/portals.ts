export type NavItem = { to: string; label: string };

export function portalTitle(role?: string) {
  switch (role) {
    case "STUDENT":
      return { name: "Student portal", blurb: "Classes, fees, and placements" };
    case "PARENT":
      return { name: "Parent portal", blurb: "Attendance, fees, and notices" };
    case "FACULTY":
      return { name: "Faculty portal", blurb: "Teach, attend, grade" };
    case "PLACEMENT_HEAD":
      return { name: "Placement portal", blurb: "Drives, ATS, and offers" };
    case "RECRUITER":
      return { name: "Recruiter portal", blurb: "Drives and candidates" };
    case "COUNSELOR":
      return { name: "Admissions portal", blurb: "Leads and counseling" };
    case "ACCOUNTANT":
      return { name: "Accounts portal", blurb: "Fees, receipts, refunds" };
    default:
      return { name: "Institute OS", blurb: "Run the institute" };
  }
}

export function navForRole(role?: string): NavItem[] {
  switch (role) {
    case "STUDENT":
      return [
        { to: "/", label: "My home" },
        { to: "/lms", label: "My LMS" },
        { to: "/fees", label: "My fees" },
        { to: "/placement", label: "Jobs" },
        { to: "/readiness", label: "Readiness" },
        { to: "/comms", label: "Notices" },
      ];
    case "PARENT":
      return [
        { to: "/", label: "Home" },
        { to: "/students", label: "My child" },
        { to: "/fees", label: "Fees" },
        { to: "/comms", label: "Notices" },
      ];
    case "FACULTY":
      return [
        { to: "/", label: "Home" },
        { to: "/lms", label: "LMS" },
        { to: "/students", label: "My students" },
        { to: "/comms", label: "Notices" },
      ];
    case "PLACEMENT_HEAD":
      return [
        { to: "/", label: "Home" },
        { to: "/placement", label: "Drives & ATS" },
        { to: "/readiness", label: "Readiness" },
        { to: "/students", label: "Students" },
        { to: "/alumni", label: "Alumni" },
      ];
    case "RECRUITER":
      return [
        { to: "/", label: "Home" },
        { to: "/placement", label: "Drives" },
      ];
    case "COUNSELOR":
      return [
        { to: "/", label: "Home" },
        { to: "/crm", label: "Leads" },
        { to: "/students", label: "Students" },
        { to: "/comms", label: "Notices" },
      ];
    case "ACCOUNTANT":
      return [
        { to: "/", label: "Home" },
        { to: "/fees", label: "Fees" },
        { to: "/students", label: "Students" },
      ];
    default:
      return [
        { to: "/", label: "Home" },
        { to: "/institute", label: "Institute" },
        { to: "/crm", label: "Admissions" },
        { to: "/students", label: "Students" },
        { to: "/lms", label: "LMS" },
        { to: "/fees", label: "Fees" },
        { to: "/placement", label: "Placement" },
        { to: "/comms", label: "Communication" },
        { to: "/analytics", label: "Analytics" },
      ];
  }
}

export function canOpen(role: string | undefined, path: string) {
  if (path === "/") return true;
  return navForRole(role).some((item) => item.to === path);
}
