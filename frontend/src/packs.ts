export type PackId = "STUDENT_PORTAL" | "ADMISSIONS" | "FULL_OPS" | "ESS";

export const PACKS: { id: PackId; name: string; blurb: string; modules: string[] }[] = [
  { id: "STUDENT_PORTAL", name: "Student portal", blurb: "Website, classes, tests, and fee pay for students.", modules: ["STUDENTS", "LMS", "FEES", "WEBSITE", "TESTS"] },
  { id: "ADMISSIONS", name: "Admissions", blurb: "Leads, landing pages, and converting inquiries to students.", modules: ["STUDENTS", "CRM", "WEBSITE", "GROW", "STAFF"] },
  { id: "FULL_OPS", name: "Full ops", blurb: "Run the institute: people, classes, fees, placements, and growth.", modules: ["STUDENTS", "CRM", "LMS", "FEES", "PLACEMENT", "COMMS", "ANALYTICS", "WEBSITE", "TESTS", "STAFF", "GROW"] },
  { id: "ESS", name: "ESS", blurb: "Employee self-service for institute staff HR.", modules: ["ESS", "STAFF"] },
];

export const MODULES = [
  { id: "STUDENTS", label: "Student management" },
  { id: "CRM", label: "Admissions / CRM" },
  { id: "LMS", label: "LMS / live classes" },
  { id: "FEES", label: "Fees" },
  { id: "PLACEMENT", label: "Placement" },
  { id: "COMMS", label: "Communication" },
  { id: "ANALYTICS", label: "Analytics" },
  { id: "WEBSITE", label: "Website" },
  { id: "TESTS", label: "Tests" },
  { id: "STAFF", label: "Staff" },
  { id: "GROW", label: "Grow (landing pages, campaigns, app)" },
  { id: "ESS", label: "ESS" },
];

export const STAFF_RIGHTS = [
  { id: "STUDENTS", label: "See students" },
  { id: "VIEW_FEES", label: "See fees" },
  { id: "REFUND", label: "Refund" },
  { id: "EXAMS", label: "Exams" },
  { id: "ESS_VIEW", label: "ESS self-service" },
  { id: "ESS_MANAGE", label: "Manage HR records" },
  { id: "LEAVE_APPROVE", label: "Approve leave" },
  { id: "STAFF_MANAGE", label: "Manage staff logins" },
  { id: "ANALYTICS", label: "View analytics" },
  { id: "CRM", label: "Admissions / CRM" },
  { id: "PLACEMENT", label: "Placement" },
  { id: "LMS", label: "LMS / academics" },
];

export function modulesForPack(id?: string | null) {
  return PACKS.find((p) => p.id === id)?.modules ?? PACKS.find((p) => p.id === "FULL_OPS")!.modules;
}

export function hasModule(modules: string[] | undefined, ...need: string[]) {
  if (!modules || modules.length === 0) return true;
  if (need.length === 0) return true;
  return need.some((m) => modules.includes(m));
}

export function pathAllowed(path: string, modules?: string[]) {
  if (!modules || modules.length === 0 || path === "/") return true;
  if (path.startsWith("/website")) return hasModule(modules, "WEBSITE");
  if (path.startsWith("/your-app") || path.startsWith("/landing-pages") || path.startsWith("/campaigns") || path.startsWith("/coupons")) {
    return hasModule(modules, "GROW");
  }
  if (path.startsWith("/content-hub")) return hasModule(modules, "TESTS", "LMS");
  if (path.startsWith("/lms") || path.startsWith("/courses") || path.startsWith("/academics")) return hasModule(modules, "LMS", "STUDENTS");
  if (path.startsWith("/people/staff")) return hasModule(modules, "STAFF");
  if (path.startsWith("/people/employees")) return hasModule(modules, "ESS", "STAFF");
  if (path.startsWith("/people/alumni") || path.startsWith("/alumni")) return hasModule(modules, "PLACEMENT", "STUDENTS");
  if (path.startsWith("/people") || path.startsWith("/students")) return hasModule(modules, "STUDENTS");
  if (path.startsWith("/crm")) return hasModule(modules, "CRM");
  if (path.startsWith("/fees")) return hasModule(modules, "FEES");
  if (path.startsWith("/analytics")) return hasModule(modules, "ANALYTICS");
  if (path.startsWith("/placement") || path.startsWith("/readiness")) return hasModule(modules, "PLACEMENT");
  if (path.startsWith("/comms") || path.startsWith("/chats") || path.startsWith("/one-to-one")) return hasModule(modules, "COMMS");
  if (path.startsWith("/ess")) return hasModule(modules, "ESS");
  return true;
}

export function packageRank(tier?: string | null) {
  const t = (tier || "STARTER").toUpperCase();
  if (t === "GROWTH" || t === "PRO") return 2;
  if (t === "ENTERPRISE" || t === "PLUS" || t === "SCALE") return 3;
  return 1;
}

export function hasGrowthTier(tier?: string | null, modules?: string[]) {
  let rank = packageRank(tier);
  if (modules?.some((m) => ["PLACEMENT", "ANALYTICS", "LMS", "GROW"].includes(m))) {
    rank = Math.max(rank, 2);
  }
  return rank >= 2;
}
