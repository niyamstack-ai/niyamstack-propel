import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { hasGrowthTier } from "../packs";
import { api } from "../api";
import { createRecord, updateRecord } from "../ops";
import { prettyLabel } from "../labels";
import { useLocale } from "../locale";
import { Card, ErrorText, Field, FormGrid, LinkButton, PrimaryButton, Select, Table, formatInr, useApi } from "../ui";

type Inquiry = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  source: string;
  stage: string;
  notes?: string;
  customJson?: string;
  counselorUserId?: string;
};
type CounselingNoteRow = { note: string; stage: string; nextAction?: string; nextActionAt?: string; inquiryId?: string };
type StaffMember = { id: string; fullName: string; role: string };
type FeePlan = { id: string; name: string; courseId?: string; batchId?: string };
type Referral = { id: string; code?: string; referrerName: string; status: string; incentiveAmount?: number };
type Scholarship = { id: string; name: string; amount?: number; percent?: number; approvalStatus: string };

const STAGES = [
  { value: "NEW", label: "New" },
  { value: "COUNSELING", label: "Counselling" },
  { value: "DEMO", label: "Demo" },
];

export function CrmPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const growth = hasGrowthTier(user?.packageTier, user?.modules);
  const org = useApi<{ slug?: string }>("/api/organization");
  const siteSlug = org.data?.slug || user?.orgSlug || "your-slug";
  const inquiries = useApi<Inquiry[]>("/api/inquiries");
  const funnel = useApi<{ bySource?: { name: string; leads: number; converted: number; conversionPct: number }[]; byCounselor?: { name: string; leads: number; converted: number; conversionPct: number }[] }>(
    growth ? "/api/actions/analytics/funnel?days=30" : "",
  );
  const myCommissions = useApi<{ totalApproved?: number; totalPaid?: number; rows?: { description?: string; amount: number; status: string }[] }>(
    user?.role === "COUNSELOR" ? "/api/actions/compensation/my-commissions" : "",
  );
  const courses = useApi<{ id: string; name: string }[]>("/api/courses");
  const batches = useApi<{ id: string; name: string }[]>("/api/batches");
  const notes = useApi<CounselingNoteRow[]>("/api/counseling-notes");
  const forms = useApi<{ id: string; applicantName: string; email?: string; phone?: string; status: string; courseId?: string }[]>("/api/admission-forms");
  const students = useApi<{ id: string; fullName: string }[]>("/api/students");
  const staff = useApi<StaffMember[]>("/api/staff");
  const feePlans = useApi<FeePlan[]>("/api/fee-plans");
  const referrals = useApi<Referral[]>("/api/referrals");
  const scholarships = useApi<Scholarship[]>("/api/scholarships");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("WALKIN");
  const [noteInq, setNoteInq] = useState("");
  const [note, setNote] = useState("");
  const [noteStage, setNoteStage] = useState("COUNSELING");
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [convertId, setConvertId] = useState("");
  const [convertCourse, setConvertCourse] = useState("");
  const [convertBatch, setConvertBatch] = useState("");
  const [convertFeePlan, setConvertFeePlan] = useState("");
  const [importCsv, setImportCsv] = useState("");
  const [refName, setRefName] = useState("");
  const [refStudent, setRefStudent] = useState("");
  const [schName, setSchName] = useState("");
  const [schStudent, setSchStudent] = useState("");
  const [schAmt, setSchAmt] = useState("2000");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function capture() {
    await run(async () => {
      await createRecord("/api/inquiries", { fullName: name, phone, email: email || undefined, source, stage: "NEW" });
      setName("");
      setPhone("");
      setEmail("");
      inquiries.reload();
    });
  }

  async function move(id: string, stage: string) {
    await run(async () => {
      await api(`/api/actions/inquiries/${id}/stage`, { method: "POST", body: JSON.stringify({ stage }) });
      inquiries.reload();
    });
  }

  async function convert() {
    if (!convertId) return;
    if (!convertCourse) {
      setError("Select a course before enrolling.");
      return;
    }
    const lead = (inquiries.data ?? []).find((i) => i.id === convertId);
    if (!lead?.phone?.trim()) {
      setError("This lead needs a phone number before enrolment.");
      return;
    }
    if (!window.confirm("Enrol this lead as a student? Fee plan will be scheduled if one matches the course.")) return;
    await run(async () => {
      const out = await api<{ feeScheduled?: boolean; installments?: number; feeError?: string; loginWarning?: string }>(
        `/api/actions/inquiries/${convertId}/convert`,
        {
          method: "POST",
          body: JSON.stringify({
            courseId: convertCourse,
            batchId: convertBatch || undefined,
            feePlanId: convertFeePlan || undefined,
            autoFees: "true",
          }),
        },
      );
      setConvertId("");
      inquiries.reload();
      students.reload();
      const bits = [
        out.feeScheduled
          ? `Fee installments scheduled (${out.installments ?? 0}).`
          : out.feeError
            ? `Fees not scheduled: ${out.feeError}`
            : user?.role === "COUNSELOR"
              ? "Ask an owner or accountant if fees still need scheduling."
              : "No matching fee plan — schedule under Fees if needed.",
        out.loginWarning,
      ].filter(Boolean);
      setNotice(`Enrolled. ${bits.join(" ")}`);
    });
  }

  async function importLeads() {
    await run(async () => {
      const out = await api<{ created: number; skipped: number }>("/api/actions/grow/import/inquiries", {
        method: "POST",
        body: JSON.stringify({ csv: importCsv }),
      });
      setImportCsv("");
      inquiries.reload();
      setNotice(`Imported ${out.created} lead(s). Skipped ${out.skipped}.`);
    });
  }

  async function assignCounselor(inquiryId: string, counselorUserId: string) {
    await run(async () => {
      await api(`/api/actions/inquiries/${inquiryId}/counselor`, {
        method: "POST",
        body: JSON.stringify({ counselorUserId }),
      });
      inquiries.reload();
    });
  }

  async function addNote() {
    await run(async () => {
      await api("/api/actions/grow/notes", {
        method: "POST",
        body: JSON.stringify({ inquiryId: noteInq, note, stage: noteStage, nextAction, nextActionAt: nextActionAt || undefined }),
      });
      setNote("");
      setNextAction("");
      setNextActionAt("");
      notes.reload();
      inquiries.reload();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">{t("admissions_title", "Admissions")}</h1>
        <p className="text-sm text-slate-500">{t("admissions_subtitle", "Move a lead New → Counselling → Demo → Enrolled. Website and referral links land here.")}</p>
      </div>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {user?.role === "COUNSELOR" && myCommissions.data && (
        <Card title="My commissions (this month)">
          <p className="mb-2 text-sm">
            Approved: {formatInr(myCommissions.data.totalApproved ?? 0)} · Paid via payroll:{" "}
            {formatInr(myCommissions.data.totalPaid ?? 0)}
          </p>
          <Table
            empty="Commissions appear when your leads convert or students pay fees."
            columns={["Note", "Amount", "Status"]}
            rows={(myCommissions.data.rows ?? []).map((r) => [r.description || "—", formatInr(r.amount), prettyLabel(r.status)])}
          />
        </Card>
      )}
      <Card title="Capture inquiry">
        <FormGrid>
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Phone" value={phone} onChange={setPhone} />
          <Field label="Email" value={email} onChange={setEmail} />
          <Select
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: "WALKIN", label: "Walk-in" },
              { value: "WEB", label: "Website" },
              { value: "REFERRAL", label: "Referral" },
              { value: "CAMPAIGN", label: "Campaign" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!name || !phone} onClick={() => void capture()}>
            Save lead
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Import leads (CSV)">
        <p className="mb-2 text-sm text-slate-500">Header row: fullName, phone, email, source</p>
        <textarea
          className="min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm font-mono"
          placeholder="fullName,phone,email,source&#10;Riya,9876543210,riya@example.com,WEB"
          value={importCsv}
          onChange={(e) => setImportCsv(e.target.value)}
        />
        <div className="mt-3">
          <PrimaryButton disabled={!importCsv.trim()} onClick={() => void importLeads()}>
            Import leads
          </PrimaryButton>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-4">
        {["NEW", "COUNSELING", "DEMO", "CONVERTED"].map((stage) => (
          <Card key={stage} title={prettyLabel(stage)}>
            <ul className="space-y-3 text-sm">
              {(inquiries.data ?? [])
                .filter((i) => (i.stage || "NEW") === stage)
                .map((i) => (
                  <li key={i.id} className="rounded-lg border border-line p-2">
                    <p className="font-medium text-navy">{i.fullName}</p>
                    <p className="text-xs text-slate-500">{i.phone} · {prettyLabel(i.source)}</p>
                    {stage !== "CONVERTED" && (
                      <Select
                        label=""
                        value={i.counselorUserId || ""}
                        onChange={(v) => void assignCounselor(i.id, v)}
                        options={[
                          { value: "", label: "Assign counselor" },
                          ...(staff.data ?? []).filter((s) => s.role === "COUNSELOR" || s.role === "OWNER").map((s) => ({
                            value: s.id,
                            label: s.fullName,
                          })),
                        ]}
                      />
                    )}
                    {i.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{i.notes}</p>}
                    {stage !== "CONVERTED" && (
                      <span className="mt-2 flex flex-wrap gap-2">
                        {STAGES.filter((s) => s.value !== stage).map((s) => (
                          <LinkButton key={s.value} onClick={() => void move(i.id, s.value)}>
                            {s.label}
                          </LinkButton>
                        ))}
                        <LinkButton onClick={() => setConvertId(i.id)}>Enrol</LinkButton>
                      </span>
                    )}
                  </li>
                ))}
              {(inquiries.data ?? []).filter((i) => (i.stage || "NEW") === stage).length === 0 && (
                <li className="text-slate-400">None</li>
              )}
            </ul>
          </Card>
        ))}
      </div>
      {convertId && (
        <Card title="Enrol as student">
          <FormGrid>
            <Select label="Course" value={convertCourse} onChange={setConvertCourse} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            <Select label="Batch" value={convertBatch} onChange={setConvertBatch} options={(batches.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            <Select
              label="Fee plan (optional)"
              value={convertFeePlan}
              onChange={setConvertFeePlan}
              options={[
                { value: "", label: "Auto-match by course/batch" },
                ...(feePlans.data ?? []).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <div className="flex items-end gap-2">
              <PrimaryButton disabled={!convertCourse} onClick={() => void convert()}>
                Enrol
              </PrimaryButton>
              <button type="button" className="text-sm text-slate-500" onClick={() => setConvertId("")}>
                Cancel
              </button>
            </div>
          </FormGrid>
        </Card>
      )}
      <Card title="Add counseling note">
        <FormGrid>
          <Select label="Inquiry" value={noteInq} onChange={setNoteInq} options={(inquiries.data ?? []).map((i) => ({ value: i.id, label: i.fullName }))} />
          <Select label="Move to" value={noteStage} onChange={setNoteStage} allowEmpty={false} options={STAGES} />
          <Field label="Note" value={note} onChange={setNote} />
          <Field label="Next action" value={nextAction} onChange={setNextAction} placeholder="Call back, send brochure…" />
          <Field label="Follow-up date" value={nextActionAt} onChange={setNextActionAt} placeholder="2026-09-15" />
          <div className="flex items-end">
            <PrimaryButton disabled={!noteInq || !note} onClick={() => void addNote()}>
              Save note
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Counseling notes">
          <ul className="space-y-2 text-sm">
            {(notes.data ?? []).map((n, i) => (
              <li key={i}>
                <span className="font-medium">{prettyLabel(n.stage)}: </span>
                {n.note}
                {n.nextAction && <span className="text-xs text-slate-500"> · Next: {n.nextAction}</span>}
                {n.nextActionAt && <span className="text-xs text-slate-400"> ({n.nextActionAt.slice(0, 10)})</span>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Online admission forms">
          <ul className="space-y-3 text-sm">
            {(forms.data ?? []).length === 0 && <li className="text-slate-500">No online forms yet.</li>}
            {(forms.data ?? []).map((f) => (
              <li key={f.id} className="rounded-lg border border-line px-3 py-2">
                <p className="font-medium text-navy">
                  {f.applicantName} — {prettyLabel(f.status)}
                </p>
                <p className="text-xs text-slate-500">
                  {[f.email, f.phone].filter(Boolean).join(" · ") || "No contact"}
                </p>
                <span className="mt-2 flex flex-wrap gap-3">
                  <LinkButton
                    onClick={() =>
                      void run(async () => {
                        if (!f.phone?.trim()) throw new Error("Applicant needs a phone number before converting to a lead.");
                        await createRecord("/api/inquiries", {
                          fullName: f.applicantName,
                          phone: f.phone,
                          email: f.email || undefined,
                          source: "ADMISSION_FORM",
                          stage: "NEW",
                          courseId: f.courseId || undefined,
                          notes: `From online form ${f.id}${f.courseId ? ` · course ${f.courseId}` : ""}`,
                        });
                        await updateRecord(`/api/admission-forms/${f.id}`, { ...f, status: "CONVERTED" });
                        setNotice(`${f.applicantName} added to leads.`);
                        forms.reload();
                        inquiries.reload();
                      })
                    }
                  >
                    Convert to lead
                  </LinkButton>
                  <LinkButton
                    onClick={() =>
                      void run(async () => {
                        await updateRecord(`/api/admission-forms/${f.id}`, { ...f, status: "REVIEWED" });
                        forms.reload();
                      })
                    }
                  >
                    Mark reviewed
                  </LinkButton>
                  <LinkButton
                    onClick={() =>
                      void run(async () => {
                        await updateRecord(`/api/admission-forms/${f.id}`, { ...f, status: "REJECTED" });
                        forms.reload();
                      })
                    }
                  >
                    Reject
                  </LinkButton>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Referral codes">
        <p className="mb-3 text-sm text-slate-500">
          Share `/s/{siteSlug}?ref=CODE` on the website. New enquiries are attributed.
        </p>
        <FormGrid>
          <Field label="Referrer name" value={refName} onChange={setRefName} />
          <Select label="Student (optional)" value={refStudent} onChange={setRefStudent} options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!refName}
            onClick={() =>
              void run(async () => {
                const rec = await api<Referral>("/api/actions/grow/referrals", {
                  method: "POST",
                  body: JSON.stringify({ referrerName: refName, studentId: refStudent || null, referrerType: "STUDENT" }),
                });
                setRefName("");
                setNotice(`Share code ${rec.code} on the website.`);
                referrals.reload();
              })
            }
          >
            Create code
          </PrimaryButton>
        </div>
        <div className="mt-4">
          <Table
            empty="No referral codes yet."
            columns={["Code", "Referrer", "Status"]}
            rows={(referrals.data ?? []).map((r) => [r.code || "—", r.referrerName, prettyLabel(r.status)])}
          />
        </div>
      </Card>
      <Card title="Scholarships / fee discount">
        <p className="mb-3 text-sm text-slate-500">Owner approves on Academics. Approved amounts credit the student’s open invoice.</p>
        <FormGrid>
          <Field label="Name" value={schName} onChange={setSchName} placeholder="Merit waiver" />
          <Select label="Student" value={schStudent} onChange={setSchStudent} options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))} />
          <Field label="Amount ₹" value={schAmt} onChange={setSchAmt} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton
            disabled={!schName || !schStudent || !(Number(schAmt) > 0)}
            onClick={() =>
              void run(async () => {
                await api("/api/actions/grow/scholarships", {
                  method: "POST",
                  body: JSON.stringify({ name: schName, studentId: schStudent, amount: schAmt }),
                });
                setSchName("");
                scholarships.reload();
                setNotice("Sent for owner approval.");
              })
            }
          >
            Submit for approval
          </PrimaryButton>
        </div>
        <div className="mt-4">
          <Table
            empty="No scholarships yet."
            columns={["Name", "Amount", "Status"]}
            rows={(scholarships.data ?? []).map((s) => [s.name, s.amount != null ? String(s.amount) : "—", prettyLabel(s.approvalStatus)])}
          />
        </div>
      </Card>

      {growth && funnel.data && (
        <Card title="Funnel analytics (30 days)">
          <p className="mb-3 text-sm text-slate-500">
            Source and counselor conversion for recent leads.{" "}
            <Link className="text-brand hover:underline" to="/analytics">
              Full analytics
            </Link>
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Table
              empty="No leads yet."
              columns={["Source", "Leads", "Converted", "Conv %"]}
              rows={(funnel.data.bySource ?? []).slice(0, 8).map((r) => [r.name, r.leads, r.converted, `${r.conversionPct}%`])}
            />
            <Table
              empty="Assign counselors to compare."
              columns={["Counselor", "Leads", "Converted", "Conv %"]}
              rows={(funnel.data.byCounselor ?? []).slice(0, 8).map((r) => [r.name, r.leads, r.converted, `${r.conversionPct}%`])}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
