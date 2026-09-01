import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, ErrorText, FormGrid, PrimaryButton, Select, useApi } from "../ui";

type RosterRow = { studentId: string; fullName: string; studentCode?: string; status?: string };
type Summary = { students?: number; presentToday?: number; absentToday?: number; averagePresentPct?: number; sessionDays?: number };

export function BatchAttendanceSheet() {
  const batches = useApi<{ id: string; name: string }[]>("/api/batches");
  const [batchId, setBatchId] = useState("");
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const roster = useApi<RosterRow[]>(
    batchId ? `/api/actions/sis/batch-attendance?batchId=${batchId}&date=${sessionDate}` : "",
  );
  const summary = useApi<Summary>(batchId ? `/api/actions/sis/attendance-summary?batchId=${batchId}` : "");

  useEffect(() => {
    const ids = new Set(
      (roster.data ?? []).filter((r) => r.status === "PRESENT" || r.status === "LATE").map((r) => r.studentId),
    );
    setPresent(ids);
  }, [roster.data, batchId, sessionDate]);

  async function save() {
    if (!batchId) return;
    setError(null);
    setNotice(null);
    try {
      const out = await api<{ marked?: number; present?: number }>("/api/actions/sis/batch-attendance", {
        method: "POST",
        body: JSON.stringify({ batchId, sessionDate, presentIds: [...present] }),
      });
      setNotice(`Saved ${out.marked ?? 0} rows · ${out.present ?? 0} present`);
      roster.reload();
      summary.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggle(id: string) {
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card title="Batch attendance sheet">
      <p className="mb-3 text-sm text-slate-500">Mark the whole class in one go. Use this for daily batch roll call.</p>
      <FormGrid>
        <Select
          label="Batch"
          value={batchId}
          onChange={setBatchId}
          options={(batches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
        />
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Date</span>
          <input
            type="date"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
          />
        </label>
      </FormGrid>
      {summary.data && batchId && (
        <p className="mt-2 text-xs text-slate-500">
          {summary.data.students ?? 0} students · today {summary.data.presentToday ?? 0} present · 30-day avg{" "}
          {summary.data.averagePresentPct ?? 0}%
        </p>
      )}
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {batchId && (
        <>
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto text-sm">
            {(roster.data ?? []).map((row) => (
              <li key={row.studentId} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <input type="checkbox" checked={present.has(row.studentId)} onChange={() => toggle(row.studentId)} />
                <span className="font-medium text-navy">{row.fullName}</span>
                <span className="text-xs text-slate-400">{row.studentCode}</span>
              </li>
            ))}
            {(roster.data ?? []).length === 0 && !roster.loading && (
              <li className="text-slate-400">No students in this batch yet.</li>
            )}
          </ul>
          <div className="mt-3">
            <PrimaryButton disabled={!batchId || roster.loading} onClick={() => void save()}>
              Save batch attendance
            </PrimaryButton>
          </div>
        </>
      )}
    </Card>
  );
}
