import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, formatDay, useApi } from "../ui";

type Drive = { id: string; title: string; packageLpa: number; status: string; locations: string; minAttendancePct?: number; companyId?: string; jobDescription?: string; deadline?: string };
type Application = { id: string; driveId?: string; status: string; eligibilityPassed?: boolean; currentRound?: string };
type Student = { id: string; fullName: string };
type Company = { id: string; name: string; industry: string };

export function PlacementPage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentJobs />;
  return <StaffPlacement />;
}

function StudentJobs() {
  const drives = useApi<Drive[]>("/api/drives");
  const apps = useApi<Application[]>("/api/applications");
  const me = useApi<{ id: string }[]>("/api/students");
  const [error, setError] = useState<string | null>(null);
  const studentId = me.data?.[0]?.id;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Jobs & drives</h1>
      <p className="text-sm text-slate-500">Campus drives open to you. Apply from this list.</p>
      <ErrorText error={error} />
      <Card title="Open drives">
        {(drives.data ?? []).length === 0 && <p className="mb-3 text-sm text-slate-500">No open drives right now.</p>}
        <Table
          columns={["Drive", "Package", "Locations", ""]}
          rows={(drives.data ?? []).map((d) => {
            const applied = (apps.data ?? []).some((a) => a.driveId === d.id);
            return [
            d.title,
            `${d.packageLpa} LPA`,
            `${d.locations}${d.deadline ? ` · apply by ${formatDay(d.deadline)}` : ""}`,
            <div key={d.id} className="space-y-1">
              {d.jobDescription && <p className="max-w-xs text-xs text-slate-500">{d.jobDescription}</p>}
            <PrimaryButton
              disabled={!studentId || applied}
              onClick={async () => {
                setError(null);
                try {
                  await api(`/api/actions/drives/${d.id}/apply/${studentId}`, { method: "POST", body: "{}" });
                  apps.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {applied ? "Applied" : "Apply"}
            </PrimaryButton>
            </div>,
          ];
          })}
        />
      </Card>
      <Card title="My applications">
        {(apps.data ?? []).length === 0 && <p className="text-sm text-slate-500">You have not applied yet.</p>}
        <ul className="text-sm">
          {(apps.data ?? []).map((a) => {
            const drive = (drives.data ?? []).find((d) => d.id === a.driveId);
            return (
              <li key={a.id}>
                {drive?.title || "Drive"} — {a.status}
                {a.currentRound ? ` · ${a.currentRound}` : ""} {a.eligibilityPassed === false ? "· not eligible" : ""}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function StaffPlacement() {
  const companies = useApi<Company[]>("/api/companies");
  const drives = useApi<Drive[]>("/api/drives");
  const apps = useApi<Application[]>("/api/applications");
  const rounds = useApi<{ roundName: string; roundType: string }[]>("/api/drive-rounds");
  const interviews = useApi<{ roundName: string; outcome?: string }[]>("/api/interviews");
  const offers = useApi<{ packageLpa: number; status: string }[]>("/api/offers");
  const internships = useApi<{ role: string; status: string }[]>("/api/internships");
  const students = useApi<Student[]>("/api/students");
  const benches = useApi<{ role: string; city: string; medianLpa: number }[]>("/api/actions/salary-benchmarks");
  const [error, setError] = useState<string | null>(null);
  const [coName, setCoName] = useState("");
  const [industry, setIndustry] = useState("IT Services");
  const [companyId, setCompanyId] = useState("");
  const [title, setTitle] = useState("");
  const [pkg, setPkg] = useState("4.5");
  const [loc, setLoc] = useState("Pune");
  const [minAtt, setMinAtt] = useState("75");

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
      <div>
        <h1 className="text-2xl font-bold text-navy">Placement operations</h1>
        <p className="text-sm text-slate-500">Companies, drives, eligibility, ATS rounds, and offers.</p>
      </div>
      <ErrorText error={error} />
      <Card title="Add company">
        <FormGrid>
          <Field label="Company" value={coName} onChange={setCoName} />
          <Field label="Industry" value={industry} onChange={setIndustry} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!coName}
              onClick={() =>
                run(async () => {
                  await createRecord("/api/companies", { name: coName, industry });
                  setCoName("");
                  companies.reload();
                })
              }
            >
              Save company
            </PrimaryButton>
          </div>
        </FormGrid>
        <ul className="mt-3 text-sm">
          {(companies.data ?? []).map((c) => (
            <li key={c.id}>
              {c.name} — {c.industry}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Create drive">
        <FormGrid>
          <Select label="Company" value={companyId} onChange={setCompanyId} options={(companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Field label="Drive title" value={title} onChange={setTitle} />
          <Field label="Package LPA" value={pkg} onChange={setPkg} />
          <Field label="Locations" value={loc} onChange={setLoc} />
          <Field label="Min attendance %" value={minAtt} onChange={setMinAtt} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!companyId || !title}
            onClick={() =>
              run(async () => {
                await createRecord("/api/drives", {
                  companyId,
                  title,
                  packageLpa: Number(pkg),
                  locations: loc,
                  status: "OPEN",
                  minAttendancePct: Number(minAtt),
                  deadline: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10),
                });
                setTitle("");
                drives.reload();
              })
            }
          >
            Save drive
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Drives">
        <Table
          columns={["Drive", "Package", "Min attendance", "Status", "Eligibility"]}
          rows={(drives.data ?? []).map((d) => [
            d.title,
            `${d.packageLpa} LPA`,
            d.minAttendancePct ? `${d.minAttendancePct}%` : "—",
            d.status,
            <PrimaryButton
              onClick={() =>
                run(async () => {
                  const studentId = students.data?.[0]?.id;
                  if (!studentId) throw new Error("Add a student first");
                  const result = await api<{ eligible: boolean; reason: string; attendancePct: number }>(
                    `/api/actions/eligibility/${d.id}/${studentId}`
                  );
                  alert(`${result.eligible ? "Eligible" : "Not eligible"} — ${result.reason} (attendance ${result.attendancePct}%)`);
                })
              }
            >
              Check first student
            </PrimaryButton>,
          ])}
        />
      </Card>
      <Card title="Drive round templates">
        <ul className="text-sm">
          {(rounds.data ?? []).map((r, i) => (
            <li key={i}>
              {r.roundName} ({r.roundType})
            </li>
          ))}
        </ul>
      </Card>
      <Card title="ATS">
        <Table
          columns={["Status", "Eligible", "Round", "Actions"]}
          rows={(apps.data ?? []).map((a) => [
            a.status,
            a.eligibilityPassed === false ? "No" : a.eligibilityPassed ? "Yes" : "—",
            a.currentRound || "—",
            <span className="space-x-2">
              <PrimaryButton
                onClick={() =>
                  run(async () => {
                    await api(`/api/actions/applications/${a.id}/advance`, {
                      method: "POST",
                      body: JSON.stringify({ status: "SHORTLISTED" }),
                    });
                    apps.reload();
                  })
                }
              >
                Shortlist
              </PrimaryButton>
              <PrimaryButton
                onClick={() =>
                  run(async () => {
                    await api(`/api/actions/applications/${a.id}/rounds`, {
                      method: "POST",
                      body: JSON.stringify({ roundName: "HR", outcome: "PASS", feedback: "Clear communication", panel: "Campus HR" }),
                    });
                    apps.reload();
                    interviews.reload();
                  })
                }
              >
                Record round
              </PrimaryButton>
            </span>,
          ])}
        />
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Interview outcomes">
          <ul className="text-sm">
            {(interviews.data ?? []).map((n, i) => (
              <li key={i}>
                {n.roundName} — {n.outcome || "pending"}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Offers">
          <ul className="text-sm">
            {(offers.data ?? []).map((o, i) => (
              <li key={i}>
                {o.packageLpa} LPA — {o.status}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Internships">
          <ul className="text-sm">
            {(internships.data ?? []).map((n, i) => (
              <li key={i}>
                {n.role} — {n.status}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Salary benchmarks">
        <ul className="text-sm">
          {benches.error ? <li className="text-slate-500">Requires Plus/Enterprise package.</li> : null}
          {(benches.data ?? []).map((b, i) => (
            <li key={i}>
              {b.role}, {b.city}: {b.medianLpa} LPA
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
