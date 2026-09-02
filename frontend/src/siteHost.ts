export type SiteOrg = {
  slug?: string;
  customDomain?: string;
  websiteUrl?: string;
};

export function cleanHost(value?: string | null) {
  if (!value) return "";
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

export function isProductHost(hostname = window.location.hostname) {
  const host = hostname.toLowerCase();
  // Only Propel admin hosts — not institute sites like nexusitacad.niyamstack.com
  return host === "localhost" || host === "127.0.0.1" || host.includes("propel");
}

export function studentPreviewPath(slug?: string, path = "") {
  const suffix = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `/s/${slug || "preview"}${suffix}`;
}

export function studentPublicUrl(org: SiteOrg | null | undefined, path = "") {
  const suffix = path.startsWith("/") ? path : path ? `/${path}` : "";
  const domain = cleanHost(org?.customDomain || org?.websiteUrl);
  if (domain && !domain.startsWith("localhost") && !domain.includes("/s/")) {
    return `https://${domain}${suffix || "/"}`;
  }
  if (org?.websiteUrl && org.websiteUrl.startsWith("http") && !org.websiteUrl.includes("/s/")) {
    return `${org.websiteUrl.replace(/\/$/, "")}${suffix}`;
  }
  return `${window.location.origin}${studentPreviewPath(org?.slug, path)}`;
}
