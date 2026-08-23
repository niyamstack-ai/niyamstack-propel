const KEY = "propel.offline.queue";

export type OfflineEvent = {
  type: "ATTENDANCE" | "NOTICE";
  studentId?: string;
  batchId?: string;
  sessionDate?: string;
  status?: string;
  title?: string;
  body?: string;
};

export function enqueueOffline(event: OfflineEvent) {
  const q = pendingOffline();
  q.push(event);
  localStorage.setItem(KEY, JSON.stringify(q));
}

export function pendingOffline(): OfflineEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OfflineEvent[]) : [];
  } catch {
    return [];
  }
}

export async function flushOffline(api: <T>(path: string, init?: RequestInit) => Promise<T>) {
  const events = pendingOffline();
  if (events.length === 0) return 0;
  const res = await api<{ applied: number }>("/api/actions/offline/sync", {
    method: "POST",
    body: JSON.stringify({ events }),
  });
  localStorage.removeItem(KEY);
  return res.applied ?? events.length;
}
