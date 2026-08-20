import { api, getToken } from "./api";

export async function createRecord<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function updateRecord<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export async function deleteRecord(path: string): Promise<void> {
  await api(path, { method: "DELETE" });
}

export async function uploadContentFile<T = { id: string; url?: string; title?: string }>(
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
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
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function uploadSubmissionFile(file: File): Promise<{ url: string; fileName: string }> {
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch("/api/actions/submissions/upload", { method: "POST", headers, body: form });
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
    throw new Error(message);
  }
  return res.json() as Promise<{ url: string; fileName: string }>;
}
