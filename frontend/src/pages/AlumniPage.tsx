import { useMemo, useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, useApi } from "../ui";

type Alumnus = { id: string; fullName: string; company: string; role: string };
type AlumniJob = { id: string; title: string; company: string; status?: string; routedDriveId?: string };
type Industry = { id: string; name: string; mou: boolean };
type EventRow = { id: string; title: string; eventDate: string; attendanceCount?: number; eventType?: string; accountId?: string };

export function AlumniPage({ embedded }: { embedded?: boolean } = {}) {
  const alumni = useApi<Alumnus[]>("/api/alumni");
  const jobs = useApi<AlumniJob[]>("/api/alumni-jobs");
  const industry = useApi<Industry[]>("/api/industry");
  const events = useApi<EventRow[]>("/api/events");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobCo, setJobCo] = useState("");
  const [acct, setAcct] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventType, setEventType] = useState("CAMPUS_VISIT");
  const [eventAccountId, setEventAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const directory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (alumni.data ?? []).filter((a) => {
      if (!q) return true;
      return `${a.fullName} ${a.company} ${a.role}`.toLowerCase().includes(q);
    });
  }, [alumni.data, search]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {!embedded && <h1 className="text-2xl font-bold text-navy">Alumni & industry</h1>}
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Add alumnus">
        <FormGrid>
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Company" value={company} onChange={setCompany} />
          <Field label="Role" value={role} onChange={setRole} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!name.trim() || !company.trim()}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/alumni", { fullName: name, company, role, engagement: "ACTIVE" });
                  setName("");
                  setCompany("");
                  setRole("");
                  alumni.reload();
                })
              }
            >
              Save
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Alumni referral job">
        <FormGrid>
          <Field label="Title" value={jobTitle} onChange={setJobTitle} />
          <Field label="Company" value={jobCo} onChange={setJobCo} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!jobTitle.trim() || !jobCo.trim()}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/alumni-jobs", { title: jobTitle, company: jobCo, status: "OPEN" });
                  setJobTitle("");
                  setJobCo("");
                  jobs.reload();
                })
              }
            >
              Save job
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Employer account">
        <FormGrid>
          <Field label="Employer / account" value={acct} onChange={setAcct} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!acct}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/industry", { name: acct, mou: false, hiringCycle: "Open" });
                  setAcct("");
                  industry.reload();
                })
              }
            >
              Save account
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Guest lecture / event">
        <FormGrid>
          <Field label="Title" value={eventTitle} onChange={setEventTitle} />
          <Field label="Date" type="date" value={eventDate} onChange={setEventDate} />
          <Select
            label="Type"
            value={eventType}
            onChange={setEventType}
            allowEmpty={false}
            options={[
              { value: "CAMPUS_VISIT", label: "Campus visit" },
              { value: "GUEST_LECTURE", label: "Guest lecture" },
              { value: "MOU_SIGNING", label: "MoU signing" },
            ]}
          />
          <Select
            label="Employer account"
            value={eventAccountId}
            onChange={setEventAccountId}
            options={(industry.data ?? []).map((n) => ({ value: n.id, label: n.name }))}
          />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!eventTitle}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/events", {
                    title: eventTitle,
                    eventDate,
                    attendanceCount: 0,
                    eventType,
                    accountId: eventAccountId || null,
                  });
                  setEventTitle("");
                  events.reload();
                })
              }
            >
              Save event
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Alumni directory">
          <Field label="Search" value={search} onChange={setSearch} placeholder="Name, company, or role" />
          <ul className="mt-3 text-sm">
            {directory.length === 0 && <li className="text-slate-500">No alumni match.</li>}
            {directory.map((a) => (
              <li key={a.id}>
                {a.fullName} — {a.role}, {a.company}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Referral jobs">
          <ul className="space-y-2 text-sm">
            {(jobs.data ?? []).map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {j.title} @ {j.company} — {prettyLabel(j.status)}
                  {j.routedDriveId ? " (drive linked)" : ""}
                </span>
                {j.status !== "ROUTED" && (
                  <PrimaryButton
                    onClick={() =>
                      run(async () => {
                        const drive = await api<{ title: string }>(`/api/actions/placement/alumni-jobs/${j.id}/route`, { method: "POST", body: "{}" });
                        setNotice(`Routed “${j.title}” to drive “${drive.title}”.`);
                        jobs.reload();
                      })
                    }
                  >
                    Route to drive
                  </PrimaryButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Employer engagement">
          <ul className="space-y-2 text-sm">
            {(industry.data ?? []).map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {n.name} {n.mou ? "(signed agreement)" : "(no MoU)"}
                </span>
                <PrimaryButton
                  onClick={() =>
                    run(async () => {
                      await api(`/api/actions/placement/industry/${n.id}/mou`, {
                        method: "POST",
                        body: JSON.stringify({ mou: !n.mou }),
                      });
                      industry.reload();
                    })
                  }
                >
                  {n.mou ? "Clear MoU" : "Mark MoU"}
                </PrimaryButton>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Events">
          <ul className="space-y-2 text-sm">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {e.title} — {prettyLabel(e.eventType || "EVENT")} · {e.eventDate} · {e.attendanceCount ?? 0} attended
                </span>
                <PrimaryButton
                  onClick={() =>
                    run(async () => {
                      await api(`/api/actions/placement/events/${e.id}/attend`, {
                        method: "POST",
                        body: JSON.stringify({ count: 1 }),
                      });
                      events.reload();
                    })
                  }
                >
                  Record attendance
                </PrimaryButton>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
