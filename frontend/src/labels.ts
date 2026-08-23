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
  DEMO: "Demo",
  CONVERTED: "Enrolled",
  DUE: "Due",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  OPEN: "Open",
  LIVE: "Live",
  DRAFT: "Draft",
  QUEUED: "Queued",
  SENT: "Sent",
  FAILED: "Failed",
  BOOKED: "Booked",
  ATTRIBUTED: "Attributed",
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
  STUDENT_PORTAL: "Student portal",
  ADMISSIONS: "Admissions",
  FULL_OPS: "Full ops",
  ESS: "ESS",
  ENTERPRISE: "Enterprise",
  HALF: "Half day",
  WEEKLY_OFF: "Weekly off",
  CL: "Casual leave",
  SL: "Sick leave",
  EL: "Earned leave",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  SUPPORT: "Support",
  ADMIN: "Admin",
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  FULL: "Full day",
  MANUAL: "Manual",
  BIOMETRIC: "Biometric",
  PRESENT: "Present",
  ABSENT: "Absent",
  STARTER: "Starter",
  GROWTH: "Growth",
  PLUS: "Plus",
  APPLIED: "Applied",
  NAAC: "NAAC",
  NBA: "NBA",
  ISO: "ISO",
  SHORTLISTED: "Shortlisted",
  INTERVIEWED: "Interviewed",
  INELIGIBLE: "Not eligible",
  OFFERED: "Offered",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  JOINED: "Joined",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  FOLLOW_UP: "Follow-up",
  ROUTED: "Routed to drive",
  DEADLINE: "Apply by",
  JOINING: "Joining",
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
