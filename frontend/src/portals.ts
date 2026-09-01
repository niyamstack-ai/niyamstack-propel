import { pathAllowed } from "./packs";

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
      return { name: "My institute", blurb: "Grow and run the institute" };
  }
}

export function navForRole(role?: string, modules?: string[], capabilities?: string[]): NavEntry[] {
  const caps = capabilities ?? [];
  const base = roleNav(role);
  if (role === "FACULTY" && (caps.includes("VIEW_FEES") || caps.includes("REFUND"))) {
    base.push({ to: "/fees", label: "Fees" });
  }
  if (role === "FACULTY" && caps.includes("STUDENTS") && !flattenNav(base).some((i) => i.to === "/students" || i.to.startsWith("/people"))) {
    base.push({ to: "/people/students", label: "Students" });
  }
  return filterNav(base, modules);
}

function roleNav(role?: string): NavEntry[] {
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
        { to: "/m", label: "Mobile app" },
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
        { to: "/academics", label: "Academics" },
        { to: "/comms", label: "Notices" },
        { to: "/chats", label: "Chats" },
        { to: "/m", label: "Mobile app" },
        { to: "/ess", label: "ESS" },
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
        { to: "/ess", label: "ESS" },
      ];
    default:
      return [
        { to: "/", label: "Dashboard" },
        {
          label: "Grow",
          items: [
            { to: "/website", label: "Website" },
            { to: "/your-app", label: "Your App" },
            { to: "/m", label: "Mobile apps" },
            { to: "/landing-pages", label: "Landing Pages" },
            { to: "/campaigns", label: "Campaigns" },
          ],
        },
        {
          label: "Courses",
          items: [
            { to: "/courses", label: "Courses" },
            { to: "/content-hub", label: "Tests" },
            { to: "/lms", label: "LMS" },
            { to: "/academics", label: "Academics" },
          ],
        },
        {
          label: "People",
          items: [
            { to: "/people/students", label: "Students" },
            { to: "/people/staff", label: "Staff" },
            { to: "/people/alumni", label: "Alumni" },
            { to: "/ess", label: "ESS" },
          ],
        },
        { to: "/crm", label: "Admissions" },
        {
          label: "Money",
          items: [
            { to: "/fees", label: "Fees" },
            { to: "/analytics", label: "Analytics" },
            { to: "/intelligence", label: "Intelligence" },
            { to: "/enterprise", label: "Enterprise" },
            { to: "/compliance", label: "Compliance" },
          ],
        },
        {
          label: "Placements",
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
            { to: "/audit", label: "Activity log" },
            { to: "/integrations", label: "Integrations" },
            { to: "/features", label: "License map" },
          ],
        },
      ];
  }
}

function filterNav(entries: NavEntry[], modules?: string[]): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of entries) {
    if (isNavGroup(entry)) {
      const items = entry.items.filter((item) => pathAllowed(item.to, modules));
      if (items.length) out.push({ ...entry, items });
    } else if (pathAllowed(entry.to, modules)) {
      out.push(entry);
    }
  }
  return out;
}

export function canOpen(role: string | undefined, path: string, modules?: string[], capabilities?: string[]) {
  if (path === "/" || path === "/m" || path.startsWith("/m/")) return true;
  if (!pathAllowed(path, modules)) return false;
  const nav = flattenNav(navForRole(role, modules, capabilities));
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
      "/features",
      "/students",
      "/alumni",
      "/ess",
      "/academics",
      "/audit",
      "/intelligence",
      "/enterprise",
      "/compliance",
    ];
    return prefixes.some((p) => path === p || path.startsWith(p + "/"));
  }
  if (role === "STUDENT" || role === "FACULTY") {
    if (path === "/lms" || path.startsWith("/courses/")) return pathAllowed(path, modules);
    if (role === "FACULTY" && path.startsWith("/fees") && (capabilities ?? []).some((c) => c === "VIEW_FEES" || c === "REFUND")) {
      return pathAllowed(path, modules);
    }
  }
  if ((role === "FACULTY" || role === "ACCOUNTANT") && (path === "/ess" || path.startsWith("/ess/"))) {
    return pathAllowed(path, modules);
  }
  if (role === "FACULTY" && (path === "/academics" || path.startsWith("/academics/"))) {
    return pathAllowed(path, modules);
  }
  return false;
}
