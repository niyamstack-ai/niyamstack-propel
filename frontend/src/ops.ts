import { api, getToken } from "./api";
import { compressImage } from "./imageUpload";

function demoWriteBlocked() {
  try {
    const raw = localStorage.getItem("propel.user");
    const user = raw ? (JSON.parse(raw) as { accessStatus?: string }) : null;
    return user?.accessStatus === "DEMO";
  } catch {
    return false;
  }
}

function rejectDemoWrite(): never {
  const message = "You are not a paid user. Please subscribe to use this facility.";
  window.dispatchEvent(new CustomEvent("propel:subscribe-required", { detail: message }));
  throw new Error(message);
}

export async function createRecord<T>(path: string, body: unknown): Promise<T> {
  if (demoWriteBlocked()) rejectDemoWrite();
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function updateRecord<T>(path: string, body: unknown): Promise<T> {
  if (demoWriteBlocked()) rejectDemoWrite();
  return api<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteRecord(path: string): Promise<void> {
  if (demoWriteBlocked()) rejectDemoWrite();
  await api(path, { method: "DELETE" });
}

export async function ensureWebsitePublished() {
  const org = await api<{ slug?: string; websitePublished?: boolean; websiteUrl?: string }>("/api/organization");
  if (org.slug && org.websitePublished === false) {
    await updateRecord("/api/organization", { ...org, websitePublished: true, websiteUrl: org.websiteUrl || `/s/${org.slug}` });
  }
}

export async function uploadContentFile<T = { id: string; url?: string; title?: string }>(
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  if (demoWriteBlocked()) rejectDemoWrite();
  const payload = file.type.startsWith("image/") ? await compressImage(file) : file;
  const form = new FormData();
  form.append("file", payload);
  for (const [key, value] of Object.entries(fields)) {
    if (value) form.append(key, value);
  }
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch("/api/actions/content/upload", { method: "POST", headers, body: form });
  } catch {
    throw new Error("Cannot reach the API. Start the backend, then try again.");
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      /* ignore */
    }
    if (/not a paid user|subscribe to use this facility/i.test(message)) {
      window.dispatchEvent(new CustomEvent("propel:subscribe-required", { detail: message }));
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function uploadSubmissionFile(file: File): Promise<{ url: string; fileName: string }> {
  return uploadTo("/api/actions/submissions/upload", file);
}

export async function uploadMedia(file: File): Promise<{ url: string; fileName: string }> {
  return uploadTo("/api/actions/media/upload", file);
}

async function uploadTo(path: string, file: File): Promise<{ url: string; fileName: string }> {
  if (demoWriteBlocked()) rejectDemoWrite();
  const payload = file.type.startsWith("image/") ? await compressImage(file) : file;
  const form = new FormData();
  form.append("file", payload);
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers, body: form });
  } catch {
    throw new Error("Cannot reach the API. Start the backend, then try again.");
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      /* ignore */
    }
    if (/not a paid user|subscribe to use this facility/i.test(message)) {
      window.dispatchEvent(new CustomEvent("propel:subscribe-required", { detail: message }));
    }
    throw new Error(message);
  }
  return res.json() as Promise<{ url: string; fileName: string }>;
}
