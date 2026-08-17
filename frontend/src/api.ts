const TOKEN_KEY = "propel.token";
const PLATFORM_TOKEN_KEY = "propel.platform.token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getPlatformToken() {
  return localStorage.getItem(PLATFORM_TOKEN_KEY);
}

export function setPlatformToken(token: string | null) {
  if (token) localStorage.setItem(PLATFORM_TOKEN_KEY, token);
  else localStorage.removeItem(PLATFORM_TOKEN_KEY);
}

function tokenFor(path: string) {
  return path.startsWith("/api/platform") ? getPlatformToken() : getToken();
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = tokenFor(path);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
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
    if (message === "Internal Server Error") {
      message = "Signup failed on the server. Make sure the API is running, then try again.";
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
