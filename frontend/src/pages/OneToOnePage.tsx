import { useState } from "react";
import { createRecord } from "../ops";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Table, useApi } from "../ui";

type Session = {
  id: string;
  title: string;
  mentorName?: string;
  durationMinutes: number;
  price: number;
  meetingUrl?: string;
  status: string;
};

export function OneToOnePage() {
  const sessions = useApi<Session[]>("/api/one-to-one-sessions");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [mentor, setMentor] = useState("");
  const [mins, setMins] = useState("30");
  const [price, setPrice] = useState("499");
  const [url, setUrl] = useState("");

  async function create() {
    setError(null);
    try {
      await createRecord("/api/one-to-one-sessions", {
        title,
        mentorName: mentor,
        durationMinutes: Number(mins),
        price: Number(price),
        meetingUrl: url.trim() || `https://meet.jit.si/Niyamstack${title.replace(/[^A-Za-z0-9]/g, "")}${Date.now().toString().slice(-4)}`,
        status: "OPEN",
      });
      setTitle("");
      setMentor("");
      setUrl("");
      sessions.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">1:1 Sessions</h1>
        <p className="text-sm text-slate-500">Paid 1:1 sessions. Leave the meeting URL blank to get a Jitsi room, or paste Zoom / Meet.</p>
      </div>
      <ErrorText error={error} />
      <Card title="Create a 1:1 offering">
        <FormGrid>
          <Field label="Title" value={title} onChange={setTitle} placeholder="Career counselling call" />
          <Field label="Mentor name" value={mentor} onChange={setMentor} />
          <Field label="Duration (minutes)" value={mins} onChange={setMins} />
          <Field label="Price (₹)" value={price} onChange={setPrice} />
          <Field label="Meeting URL (optional)" value={url} onChange={setUrl} placeholder="Leave blank for a Jitsi room, or paste Zoom / Meet" />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!title} onClick={create}>
            Save session
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Open sessions">
        <Table
          columns={["Title", "Mentor", "Duration", "Price", "Status"]}
          rows={(sessions.data ?? []).map((s) => [
            s.title,
            s.mentorName || "—",
            `${s.durationMinutes} min`,
            `₹${s.price}`,
            s.status,
          ])}
        />
      </Card>
    </div>
  );
}
