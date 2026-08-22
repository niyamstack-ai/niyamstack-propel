const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  PLACEMENT_HEAD: "Placement head",
  FACULTY: "Faculty",
  COUNSELOR: "Counselor",
  ACCOUNTANT: "Accountant",
  STUDENT: "Student",
  PARENT: "Parent",
  RECRUITER: "Recruiter",
};

const STATUS_LABELS: Record<string, string> = {
  ENROLLED: "Enrolled",
  ACTIVE: "Active",
  DEFERRED: "On hold",
  DROPPED: "Dropped",
  ALUMNI: "Alumni",
  NEW: "New",
  COUNSELING: "Counselling",
  CONVERTED: "Enrolled",
  DUE: "Due",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  OPEN: "Open",
  LIVE: "Live",
  DRAFT: "Draft",
  QUEUED: "Queued",
  SUBMITTED: "Submitted",
  WALKIN: "Walk-in",
  WEB: "Website",
  REFERRAL: "Referral",
  CAMPAIGN: "Campaign",
  IN_APP: "In app",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  PUSH: "App notification",
  ONE_TIME: "One-time",
  ACTION: "When something happens",
  WEBINAR: "Webinar",
  COURSE: "Course",
  FORM: "Form",
  PERCENT: "% off",
  FLAT: "Flat off",
  ALL_USERS: "Everyone",
  STUDENTS: "Students",
  COURSE_BUYERS: "Course buyers",
  LIFETIME: "Lifetime",
  ENTERPRISE: "Enterprise",
  STARTER: "Starter",
  GROWTH: "Growth",
  PLUS: "Plus",
};

export function prettyLabel(value?: string | null) {
  if (!value) return "—";
  return ROLE_LABELS[value] || STATUS_LABELS[value] || value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function formatInr(amount?: number | string | null) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN")}`;
}

export function packageLabel(tier?: string | null) {
  if (!tier) return "—";
  return prettyLabel(tier);
}

export const EMPTY_TABLE = "Nothing here yet.";
export const EMPTY_TABLE_FORM = "Nothing here yet. Fill the form above to add the first one.";
