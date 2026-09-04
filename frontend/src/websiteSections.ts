export type SectionType =
  | "hero"
  | "text"
  | "image"
  | "courses"
  | "contact"
  | "testimonials"
  | "cta"
  | "features"
  | "video"
  | "faq";

export type SiteSection = {
  id: string;
  type: SectionType;
  heading?: string;
  text?: string;
  imageUrl?: string;
  imageFocus?: number;
  headingSize?: string;
  textSize?: string;
  headingColor?: string;
  textColor?: string;
  formFields?: string;
  phone?: string;
  email?: string;
  address?: string;
  quotes?: string;
  buttonLabel?: string;
  buttonUrl?: string;
};

export type Testimonial = { name: string; text: string; imageUrl?: string };

export const BLOCKS: { type: SectionType; label: string; hint: string }[] = [
  { type: "hero", label: "Hero banner", hint: "Big headline and photo" },
  { type: "text", label: "Text", hint: "Heading and paragraph" },
  { type: "image", label: "Image", hint: "Photo with caption" },
  { type: "features", label: "Feature cards", hint: "Three selling points" },
  { type: "courses", label: "Courses", hint: "Published course catalog" },
  { type: "cta", label: "Call to action", hint: "Button to join or call" },
  { type: "testimonials", label: "Testimonials", hint: "Student quotes" },
  { type: "video", label: "Video", hint: "YouTube link" },
  { type: "faq", label: "FAQ", hint: "Questions and answers" },
  { type: "contact", label: "Contact", hint: "Phone, email, address" },
];

export function nid() {
  return `s-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseSections(body?: string): SiteSection[] {
  const raw = (body || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { sections?: SiteSection[] } | SiteSection[];
    const list = Array.isArray(parsed) ? parsed : parsed.sections;
    if (Array.isArray(list) && list.every((s) => s && typeof s.type === "string")) {
      return list.map((s) => ({ ...s, id: s.id || nid() }));
    }
  } catch {
    /* plain text */
  }
  return [{ id: nid(), type: "text", heading: "", text: raw }];
}

export function serializeSections(sections: SiteSection[]) {
  return JSON.stringify({ sections });
}

export function newSection(type: SectionType, institute = "our institute"): SiteSection {
  if (type === "hero") {
    return { id: nid(), type, heading: `Welcome to ${institute}`, text: "Classroom batches and online courses. Browse, pay fees, and study here after you log in.", buttonLabel: "View courses" };
  }
  if (type === "text") {
    return { id: nid(), type, heading: "About us", text: `${institute} helps students prepare for careers with classroom teaching, recorded lessons, and placement support.` };
  }
  if (type === "image") {
    return { id: nid(), type, heading: "Campus", text: "Add a photo of your centre or classroom." };
  }
  if (type === "courses") {
    return { id: nid(), type, heading: "Courses" };
  }
  if (type === "contact") {
    return { id: nid(), type, heading: "Visit us", text: "Call or WhatsApp to visit the centre.", phone: "", email: "", address: "" };
  }
  if (type === "testimonials") {
    return {
      id: nid(),
      type,
      heading: "What students say",
      quotes: serializeTestimonials([
        { name: "", text: "The live classes were clear.", imageUrl: "" },
        { name: "", text: "Placement support helped me prepare for interviews.", imageUrl: "" },
      ]),
    };
  }
  if (type === "cta") {
    return { id: nid(), type, heading: "Ready to join?", text: "Talk to a counsellor or enrol on this website.", buttonLabel: "Get started" };
  }
  if (type === "features") {
    return { id: nid(), type, heading: "Why students choose us", quotes: "Live classes|Learn with faculty in real time.\nRecordings|Revise anytime from the student app.\nPlacement|Mocks, resume help, and drives." };
  }
  if (type === "video") {
    return { id: nid(), type, heading: "Watch a sample class", text: "Paste a YouTube link in the right panel." };
  }
  return { id: nid(), type: "faq", heading: "Common questions", quotes: "How do I join?|Buy a course on this website and log in with your mobile.\nDo you have classroom batches?|Yes. Ask at the centre for batch timings." };
}

export function starterSections(pageType: string, name: string): SiteSection[] {
  if (pageType === "HOME") {
    return [newSection("hero", name), newSection("features", name), newSection("courses", name), newSection("testimonials", name), newSection("cta", name)];
  }
  if (pageType === "ABOUT") {
    return [newSection("text", name), newSection("features", name)];
  }
  if (pageType === "CONTACT") {
    return [newSection("contact", name)];
  }
  if (pageType === "COURSES") {
    return [newSection("text", name), newSection("courses", name)];
  }
  if (pageType === "TESTIMONIALS") {
    return [newSection("testimonials", name)];
  }
  if (pageType === "POLICIES") {
    return [{ id: nid(), type: "text", heading: "Policies", text: "Refunds, attendance, and classroom rules. Update this page with your institute policy." }];
  }
  if (pageType === "FREE_TESTS" || pageType === "FREE_CONTENT") {
    return [{ id: nid(), type: "text", heading: pageType === "FREE_TESTS" ? "Free tests" : "Free content", text: "Share sample tests or notes here. Students can also log in to see purchased courses." }];
  }
  return [newSection("text", name)];
}

export function pairLines(value?: string) {
  return (value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|");
      return { title: (parts[0] || "").trim(), text: parts.slice(1).join("|").trim() };
    });
}

export function youtubeId(url?: string) {
  if (!url) return "";
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return m?.[1] || "";
}

export function parseTestimonials(raw?: string): Testimonial[] {
  const value = (raw || "").trim();
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as Array<{ name?: string; text?: string; quote?: string; imageUrl?: string }>;
      if (Array.isArray(parsed)) {
        return parsed
          .map((row) => ({
            name: String(row?.name || "").trim(),
            text: String(row?.text || row?.quote || "").trim(),
            imageUrl: String(row?.imageUrl || "").trim(),
          }))
          .filter((row) => row.text || row.name || row.imageUrl);
      }
    } catch {
      /* fall through */
    }
  }
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ name: "", text, imageUrl: "" }));
}

export function serializeTestimonials(rows: Testimonial[]) {
  return JSON.stringify(rows.map((row) => ({ name: row.name || "", text: row.text || "", imageUrl: row.imageUrl || "" })));
}
