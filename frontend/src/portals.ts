export type NavItem = { to: string; label: string };
export type NavGroup = { label: string; items: NavItem[] };
export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

export function flattenNav(entries: NavEntry[]): NavItem[] {
  return entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));
}

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
      return { name: "Institute OS", blurb: "Grow and run the institute" };
  }
}

export function navForRole(role?: string): NavEntry[] {
  switch (role) {
    case "STUDENT":
      return [
        { to: "/", label: "My home" },
        { to: "/courses", label: "My courses" },
        { to: "/fees", label: "My fees" },
        { to: "/placement", label: "Jobs" },
        { to: "/readiness", label: "Readiness" },
        { to: "/comms", label: "Notices" },
        { to: "/chats", label: "Chats" },
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
        { to: "/courses", label: "Courses" },
        { to: "/students", label: "My students" },
        { to: "/comms", label: "Notices" },
        { to: "/chats", label: "Chats" },
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
        { to: "/landing-pages", label: "Landing pages" },
        { to: "/students", label: "Students" },
        { to: "/comms", label: "Notices" },
        { to: "/campaigns", label: "Campaigns" },
      ];
    case "ACCOUNTANT":
      return [
        { to: "/", label: "Home" },
        { to: "/fees", label: "Fees" },
        { to: "/students", label: "Students" },
      ];
    default:
      return [
        { to: "/", label: "Dashboard" },
        {
          label: "Grow",
          items: [
            { to: "/website", label: "Website" },
            { to: "/your-app", label: "Your App" },
            { to: "/landing-pages", label: "Landing Pages" },
            { to: "/campaigns", label: "Campaigns" },
          ],
        },
        {
          label: "Courses",
          items: [
            { to: "/courses", label: "Catalog" },
            { to: "/content-hub", label: "Tests & free content" },
          ],
        },
        {
          label: "People",
          items: [
            { to: "/people/students", label: "Students" },
            { to: "/people/staff", label: "Staff" },
            { to: "/people/alumni", label: "Alumni" },
          ],
        },
        { to: "/crm", label: "Admissions" },
        {
          label: "Money",
          items: [
            { to: "/fees", label: "Fees" },
            { to: "/analytics", label: "Analytics" },
          ],
        },
        {
          label: "Careers",
          items: [
            { to: "/placement", label: "Placement" },
            { to: "/readiness", label: "Readiness" },
          ],
        },
        {
          label: "Communicate",
          items: [
            { to: "/comms", label: "Notices" },
            { to: "/chats", label: "Chats" },
            { to: "/one-to-one", label: "1:1 Sessions" },
          ],
        },
        {
          label: "Settings",
          items: [
            { to: "/institute", label: "Institute" },
            { to: "/integrations", label: "Integrations" },
          ],
        },
      ];
  }
}

export function canOpen(role: string | undefined, path: string) {
  if (path === "/") return true;
  const nav = flattenNav(navForRole(role));
  if (nav.some((item) => path === item.to || (item.to !== "/" && path.startsWith(item.to + "/")))) return true;
  if (!role || role === "OWNER") {
    const prefixes = [
      "/website",
      "/courses",
      "/content-hub",
      "/your-app",
      "/landing-pages",
      "/one-to-one",
      "/chats",
      "/campaigns",
      "/people",
      "/self-service",
      "/integrations",
      "/coupons",
      "/backend-addition",
      "/lms",
      "/students",
      "/alumni",
    ];
    return prefixes.some((p) => path === p || path.startsWith(p + "/"));
  }
  if (role === "STUDENT" || role === "FACULTY") {
    return path === "/lms" || path.startsWith("/courses/");
  }
  return false;
}
