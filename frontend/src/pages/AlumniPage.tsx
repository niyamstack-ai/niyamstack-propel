import { useState } from "react";
import { createRecord } from "../ops";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, useApi } from "../ui";

export function AlumniPage({ embedded }: { embedded?: boolean } = {}) {
  const alumni = useApi<{ fullName: string; company: string; role: string }[]>("/api/alumni");
  const jobs = useApi<{ title: string; company: string }[]>("/api/alumni-jobs");
  const industry = useApi<{ name: string; mou: boolean }[]>("/api/industry");
  const events = useApi<{ title: string; eventDate: string }[]>("/api/events");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobCo, setJobCo] = useState("");
  const [acct, setAcct] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      <Card title="Add alumnus">
        <FormGrid>
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Company" value={company} onChange={setCompany} />
          <Field label="Role" value={role} onChange={setRole} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!name}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/alumni", { fullName: name, company, role, engagement: "ACTIVE" });
                  setName("");
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
              disabled={!jobTitle}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/alumni-jobs", { title: jobTitle, company: jobCo, status: "OPEN" });
                  setJobTitle("");
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Alumni directory">
          <ul className="text-sm">
            {(alumni.data ?? []).map((a, i) => (
              <li key={i}>
                {a.fullName} — {a.role}, {a.company}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Referral jobs">
          <ul className="text-sm">
            {(jobs.data ?? []).map((j, i) => (
              <li key={i}>
                {j.title} @ {j.company}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Employer engagement">
          <ul className="text-sm">
            {(industry.data ?? []).map((n, i) => (
              <li key={i}>
                {n.name} {n.mou ? "(MoU)" : ""}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Events">
          <ul className="text-sm">
            {(events.data ?? []).map((e, i) => (
              <li key={i}>
                {e.title} — {e.eventDate}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
