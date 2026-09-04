import { useMemo, useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, formatDay, useApi } from "../ui";

type Drive = { id: string; title: string; packageLpa: number; status: string; locations: string; minAttendancePct?: number; companyId?: string; jobDescription?: string; deadline?: string };
type Application = { id: string; driveId?: string; studentId?: string; status: string; eligibilityPassed?: boolean; currentRound?: string };
type Student = { id: string; fullName: string };
type Company = { id: string; name: string; industry: string };
type Offer = { id: string; applicationId?: string; packageLpa: number; status: string; joiningDate?: string };
type Internship = { id: string; role: string; status: string; studentId?: string; companyId?: string; stipend?: number };
type CalItem = { kind: string; date: string; title: string; detail?: string; id?: string };

export function PlacementPage() {
  const { user } = useAuth();
  if (user?.role === "STUDENT") return <StudentJobs />;
  return <StaffPlacement recruiter={user?.role === "RECRUITER"} />;
}

function StudentJobs() {
  const drives = useApi<Drive[]>("/api/drives");
  const apps = useApi<Application[]>("/api/applications");
  const offers = useApi<Offer[]>("/api/offers");
  const me = useApi<{ id: string }[]>("/api/students");
  const [error, setError] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const studentId = me.data?.[0]?.id;
  const studentMissing = !me.loading && (me.data?.length ?? 0) === 0;

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
      <h1 className="text-2xl font-bold text-navy">Jobs & drives</h1>
      <p className="text-sm text-slate-500">Campus drives open to you. Apply from this list.</p>
      <ErrorText error={error || me.error} />
      {studentMissing && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your student profile is missing, so Apply stays unavailable. Ask the institute to link your login to a student record.
        </p>
      )}
      {letter && <pre className="whitespace-pre-wrap rounded-lg border border-line bg-slate-50 p-3 text-sm">{letter}</pre>}
      <Card title="Open drives">
        {(drives.data ?? []).length === 0 && <p className="mb-3 text-sm text-slate-500">No open drives right now.</p>}
        <Table
          columns={["Drive", "Package", "Locations", ""]}
          rows={(drives.data ?? [])
            .filter((d) => !d.status || d.status === "OPEN" || d.status === "ACTIVE")
            .map((d) => {
            const applied = (apps.data ?? []).some((a) => a.driveId === d.id);
            return [
            d.title,
            `${d.packageLpa} LPA`,
            `${d.locations}${d.deadline ? ` · apply by ${formatDay(d.deadline)}` : ""}`,
            <div key={d.id} className="space-y-1">
              {d.jobDescription && <p className="max-w-xs text-xs text-slate-500">{d.jobDescription}</p>}
            <PrimaryButton
              disabled={!studentId || applied}
              onClick={() =>
                run(async () => {
                  if (!studentId) throw new Error("Student profile not linked");
                  await api(`/api/actions/drives/${d.id}/apply/${studentId}`, { method: "POST", body: "{}" });
                  apps.reload();
                })
              }
            >
              {applied ? "Applied" : me.loading ? "…" : studentMissing ? "Unavailable" : "Apply"}
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
                {drive?.title || "Drive"} — {prettyLabel(a.status)}
                {a.currentRound ? ` · ${a.currentRound}` : ""} {a.eligibilityPassed === false ? "· not eligible" : ""}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title="Offers">
        {(offers.data ?? []).length === 0 && <p className="text-sm text-slate-500">No offer yet.</p>}
        <ul className="space-y-2 text-sm">
          {(offers.data ?? []).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2">
              <span>
                {o.packageLpa} LPA — {prettyLabel(o.status)}
                {o.joiningDate ? ` · join ${formatDay(o.joiningDate)}` : ""}
              </span>
              <PrimaryButton
                onClick={() =>
                  run(async () => {
                    const doc = await api<{ body: string }>(`/api/actions/offers/${o.id}/letter`);
                    setLetter(doc.body);
                  })
                }
              >
                Letter
              </PrimaryButton>
              {o.status === "OFFERED" && (
                <PrimaryButton
                  onClick={() =>
                    run(async () => {
                      await api(`/api/actions/offers/${o.id}/accept`, { method: "POST", body: JSON.stringify({ accept: true }) });
                      offers.reload();
                      apps.reload();
                    })
                  }
                >
                  Accept
                </PrimaryButton>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StaffPlacement({ recruiter }: { recruiter: boolean }) {
  const now = useMemo(() => new Date(), []);
  const companies = useApi<Company[]>(recruiter ? "" : "/api/companies");
  const drives = useApi<Drive[]>("/api/drives");
  const apps = useApi<Application[]>("/api/applications");
  const rounds = useApi<{ roundName: string; roundType: string }[]>(recruiter ? "" : "/api/drive-rounds");
  const interviews = useApi<{ roundName: string; outcome?: string }[]>("/api/interviews");
  const offers = useApi<Offer[]>(recruiter ? "" : "/api/offers");
  const internships = useApi<Internship[]>(recruiter ? "" : "/api/internships");
  const students = useApi<Student[]>("/api/students");
  const benches = useApi<{ role: string; city: string; medianLpa: number }[]>(recruiter ? "" : "/api/actions/salary-benchmarks");
  const calendar = useApi<CalItem[]>(
    `/api/actions/placement/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [coName, setCoName] = useState("");
  const [industry, setIndustry] = useState("IT Services");
  const [companyId, setCompanyId] = useState("");
  const [title, setTitle] = useState("");
  const [pkg, setPkg] = useState("4.5");
  const [loc, setLoc] = useState("Pune");
  const [minAtt, setMinAtt] = useState("75");
  const [recName, setRecName] = useState("");
  const [recEmail, setRecEmail] = useState("");
  const [recPhone, setRecPhone] = useState("");
  const [recCompany, setRecCompany] = useState("");
  const [internStudent, setInternStudent] = useState("");
  const [internCompany, setInternCompany] = useState("");
  const [internRole, setInternRole] = useState("Java intern");
  const [internStipend, setInternStipend] = useState("15000");
  const [checkStudentId, setCheckStudentId] = useState("");
  const [roundName, setRoundName] = useState("HR");
  const [offerPkg, setOfferPkg] = useState("");

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
        <h1 className="text-2xl font-bold text-navy">{recruiter ? "Recruiter portal" : "Placement operations"}</h1>
        <p className="text-sm text-slate-500">
          {recruiter
            ? "Your company’s candidate pool. Shortlist and record interview outcomes."
            : "Companies, job drives, who can sit, interview rounds, offers, and internships."}
        </p>
      </div>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {letter && <pre className="whitespace-pre-wrap rounded-lg border border-line bg-slate-50 p-3 text-sm">{letter}</pre>}
      <Card title={`Calendar — ${now.toLocaleString("en-IN", { month: "long", year: "numeric" })}`}>
        {(calendar.data ?? []).length === 0 && <p className="text-sm text-slate-500">No drive deadlines, interviews, or joining dates this month.</p>}
        <ul className="text-sm">
          {(calendar.data ?? []).map((c, i) => (
            <li key={c.id || i}>
              {formatDay(c.date)} · {prettyLabel(c.kind)} · {c.title}
              {c.detail ? ` — ${c.detail}` : ""}
            </li>
          ))}
        </ul>
      </Card>
      {!recruiter && (
        <>
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
                      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                    });
                    setTitle("");
                    drives.reload();
                    calendar.reload();
                  })
                }
              >
                Save drive
              </PrimaryButton>
            </div>
          </Card>
          <Card title="Invite recruiter">
            <FormGrid>
              <Field label="Name" value={recName} onChange={setRecName} />
              <Field label="Email" value={recEmail} onChange={setRecEmail} />
              <Field label="Mobile" value={recPhone} onChange={setRecPhone} />
              <Select label="Company" value={recCompany} onChange={setRecCompany} options={(companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </FormGrid>
            <div className="mt-3">
              <PrimaryButton
                disabled={!recName || !recEmail || !recCompany}
                onClick={() =>
                  run(async () => {
                    if (!recCompany) throw new Error("Select a company for the recruiter invite");
                    const row = await api<{ email: string; tempPassword: string }>("/api/actions/placement/recruiters", {
                      method: "POST",
                      body: JSON.stringify({ fullName: recName, email: recEmail, phone: recPhone, companyId: recCompany }),
                    });
                    setNotice(`Recruiter ${row.email} can sign in. Temporary password: ${row.tempPassword}`);
                    setRecName("");
                    setRecEmail("");
                    setRecPhone("");
                    setRecCompany("");
                  })
                }
              >
                Send invite
              </PrimaryButton>
            </div>
          </Card>
        </>
      )}
      <Card title="Drives">
        {!recruiter && (
          <div className="mb-3 max-w-sm">
            <Select
              label="Student for eligibility check"
              value={checkStudentId}
              onChange={setCheckStudentId}
              options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
            />
          </div>
        )}
        <Table
          columns={recruiter ? ["Drive", "Package", "Deadline"] : ["Drive", "Package", "Min attendance", "Status", "Eligibility"]}
          rows={(drives.data ?? []).map((d) =>
            recruiter
              ? [d.title, `${d.packageLpa} LPA`, d.deadline ? formatDay(d.deadline) : "—"]
              : [
                  d.title,
                  `${d.packageLpa} LPA (₹ lakh per year)`,
                  d.minAttendancePct ? `${d.minAttendancePct}%` : "—",
                  prettyLabel(d.status),
                  <PrimaryButton
                    key={`${d.id}-elig`}
                    disabled={!checkStudentId}
                    onClick={() =>
                      run(async () => {
                        if (!checkStudentId) throw new Error("Select a student first");
                        const result = await api<{ eligible: boolean; reason: string; attendancePct: number }>(
                          `/api/actions/eligibility/${d.id}/${checkStudentId}`
                        );
                        setNotice(`${result.eligible ? "Eligible" : "Not eligible"} — ${result.reason} (attendance ${result.attendancePct}%).`);
                      })
                    }
                  >
                    Check eligibility
                  </PrimaryButton>,
                ],
          )}
        />
      </Card>
      {!recruiter && (
        <Card title="Drive round templates">
          <ul className="text-sm">
            {(rounds.data ?? []).map((r, i) => (
              <li key={i}>
                {r.roundName} ({r.roundType})
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={recruiter ? "Candidate pool" : "ATS"}>
        {!recruiter && (
          <div className="mb-3 grid max-w-xl gap-3 sm:grid-cols-2">
            <Field label="Round name for Record" value={roundName} onChange={setRoundName} placeholder="HR / Technical" />
            <Field label="Offer package LPA (blank = drive package)" value={offerPkg} onChange={setOfferPkg} placeholder="e.g. 6.5" />
          </div>
        )}
        <Table
          columns={["Student", "Drive", "Status", "Eligible", "Round", "Actions"]}
          rows={(apps.data ?? []).map((a) => {
            const student = (students.data ?? []).find((s) => s.id === a.studentId);
            const drive = (drives.data ?? []).find((d) => d.id === a.driveId);
            return [
            student?.fullName || "Candidate",
            drive?.title || "Drive",
            prettyLabel(a.status),
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
                      body: JSON.stringify({
                        roundName: roundName || "HR",
                        outcome: "PASS",
                        feedback: "",
                        panel: "",
                        scheduledAt: new Date().toISOString(),
                      }),
                    });
                    apps.reload();
                    interviews.reload();
                    calendar.reload();
                  })
                }
              >
                Record {roundName || "round"}
              </PrimaryButton>
              {!recruiter && (
                <PrimaryButton
                  onClick={() =>
                    run(async () => {
                      const pkgLpa = offerPkg || String(drive?.packageLpa ?? "6.5");
                      await api(`/api/actions/applications/${a.id}/offer`, {
                        method: "POST",
                        body: JSON.stringify({
                          packageLpa: pkgLpa,
                          joiningDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                          notes: "Campus offer",
                        }),
                      });
                      apps.reload();
                      offers.reload();
                      calendar.reload();
                    })
                  }
                >
                  Make offer
                </PrimaryButton>
              )}
            </span>,
          ];
          })}
        />
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Interview outcomes">
          <ul className="text-sm">
            {(interviews.data ?? []).map((n, i) => (
              <li key={i}>
                {n.roundName} — {prettyLabel(n.outcome) || "pending"}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Offers">
          <ul className="space-y-2 text-sm">
            {(offers.data ?? []).length === 0 && <li className="text-slate-500">No offers yet.</li>}
            {(offers.data ?? []).map((o) => (
              <li key={o.id} className="space-y-1">
                <div>
                  {o.packageLpa} LPA — {prettyLabel(o.status)}
                  {o.joiningDate ? ` · ${formatDay(o.joiningDate)}` : ""}
                </div>
                {!recruiter && (
                  <span className="space-x-2">
                    <PrimaryButton
                      onClick={() =>
                        run(async () => {
                          const doc = await api<{ body: string }>(`/api/actions/offers/${o.id}/letter`);
                          setLetter(doc.body);
                        })
                      }
                    >
                      Letter
                    </PrimaryButton>
                    {o.status === "OFFERED" && (
                      <span className="text-xs text-slate-500">Waiting for student accept</span>
                    )}
                    {o.status === "ACCEPTED" && (
                      <PrimaryButton
                        onClick={() =>
                          run(async () => {
                            await api(`/api/actions/offers/${o.id}/join`, { method: "POST", body: "{}" });
                            offers.reload();
                            apps.reload();
                          })
                        }
                      >
                        Joined
                      </PrimaryButton>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Internships">
          {!recruiter && (
            <FormGrid>
              <Select label="Student" value={internStudent} onChange={setInternStudent} options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
              <Select label="Company" value={internCompany} onChange={setInternCompany} options={(companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
              <Field label="Role" value={internRole} onChange={setInternRole} />
              <Field label="Stipend" value={internStipend} onChange={setInternStipend} />
              <div className="flex items-end">
                <PrimaryButton
                  disabled={!internStudent || !internCompany}
                  onClick={() =>
                    run(async () => {
                      if (!internCompany) throw new Error("Select a company");
                      await api("/api/actions/placement/internships", {
                        method: "POST",
                        body: JSON.stringify({
                          studentId: internStudent,
                          companyId: internCompany,
                          role: internRole,
                          stipend: internStipend,
                          startDate: new Date().toISOString().slice(0, 10),
                          status: "APPLIED",
                        }),
                      });
                      setNotice("Internship recorded.");
                      internships.reload();
                    })
                  }
                >
                  Add internship
                </PrimaryButton>
              </div>
            </FormGrid>
          )}
          <ul className="mt-3 space-y-2 text-sm">
            {(internships.data ?? []).length === 0 && <li className="text-slate-500">No internships yet.</li>}
            {(internships.data ?? []).map((n) => (
              <li key={n.id}>
                {n.role} — {prettyLabel(n.status)}
                {!recruiter && (
                  <span className="ml-2 space-x-1">
                    {["ONGOING", "COMPLETED", "CONVERTED"].map((st) => (
                      <PrimaryButton
                        key={st}
                        onClick={() =>
                          run(async () => {
                            await api(`/api/actions/placement/internships/${n.id}/status`, {
                              method: "POST",
                              body: JSON.stringify({ status: st }),
                            });
                            internships.reload();
                          })
                        }
                      >
                        {prettyLabel(st)}
                      </PrimaryButton>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {!recruiter && (
        <Card title="Salary benchmarks">
          <ul className="text-sm">
            {benches.error ? <li className="text-slate-500">Not in this pack.</li> : null}
            {(benches.data ?? []).map((b, i) => (
              <li key={i}>
                {b.role}, {b.city}: {b.medianLpa} LPA
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
