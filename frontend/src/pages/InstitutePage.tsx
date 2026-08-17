import { useState } from "react";
import { createRecord, updateRecord } from "../ops";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Org = {
  name: string;
  legalName: string;
  gstin: string;
  email: string;
  phone: string;
  website: string;
  packageTier: string;
  logoUrl?: string;
  brandPrimary?: string;
  brandSecondary?: string;
};
type Center = { id: string; name: string; code: string; city: string; address?: string };
type Course = { id: string; code: string; name: string; fees: number; durationMonths?: number };
type Batch = { id: string; name: string; status: string; capacity: number; courseId?: string; centerId?: string };

export function InstitutePage() {
  const org = useApi<Org>("/api/organization");
  const centers = useApi<Center[]>("/api/centers");
  const courses = useApi<Course[]>("/api/courses");
  const batches = useApi<Batch[]>("/api/batches");
  const rooms = useApi<{ name: string; type: string }[]>("/api/classrooms");
  const years = useApi<{ id: string; name: string }[]>("/api/academic-years");
  const integrations = useApi<{
    payments: { provider: string; live: boolean };
    whatsapp: { provider: string; live: boolean };
    meetings: { provider: string; live: boolean };
    storage: { provider: string; live: boolean };
    mail: { provider: string; live: boolean };
    note: string;
  }>("/api/actions/integrations");

  const [error, setError] = useState<string | null>(null);
  const [oName, setOName] = useState("");
  const [legal, setLegal] = useState("");
  const [gstin, setGstin] = useState("");
  const [oEmail, setOEmail] = useState("");
  const [oPhone, setOPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandPrimary, setBrandPrimary] = useState("#0078f0");
  const [brandSecondary, setBrandSecondary] = useState("#071a33");

  const [cName, setCName] = useState("");
  const [cCode, setCCode] = useState("");
  const [cCity, setCCity] = useState("");

  const [coCode, setCoCode] = useState("");
  const [coName, setCoName] = useState("");
  const [coFees, setCoFees] = useState("50000");
  const [coMonths, setCoMonths] = useState("6");

  const [bName, setBName] = useState("");
  const [bCourse, setBCourse] = useState("");
  const [bCenter, setBCenter] = useState("");
  const [bCap, setBCap] = useState("40");

  function fillOrg() {
    if (!org.data) return;
    setOName(org.data.name || "");
    setLegal(org.data.legalName || "");
    setGstin(org.data.gstin || "");
    setOEmail(org.data.email || "");
    setOPhone(org.data.phone || "");
    setLogoUrl(org.data.logoUrl || "");
    setBrandPrimary(org.data.brandPrimary || "#0078f0");
    setBrandSecondary(org.data.brandSecondary || "#071a33");
  }

  async function saveOrg() {
    setError(null);
    try {
      await updateRecord("/api/organization", {
        ...org.data,
        name: oName || org.data?.name,
        legalName: legal || org.data?.legalName,
        gstin: gstin || org.data?.gstin,
        email: oEmail || org.data?.email,
        phone: oPhone || org.data?.phone,
        logoUrl,
        brandPrimary,
        brandSecondary,
      });
      org.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addCenter() {
    setError(null);
    try {
      await createRecord("/api/centers", { name: cName, code: cCode, city: cCity, active: true });
      setCName("");
      setCCode("");
      setCCity("");
      centers.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addCourse() {
    setError(null);
    try {
      await createRecord("/api/courses", {
        code: coCode,
        name: coName,
        fees: Number(coFees),
        durationMonths: Number(coMonths),
        active: true,
      });
      setCoCode("");
      setCoName("");
      courses.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addBatch() {
    setError(null);
    try {
      await createRecord("/api/batches", {
        name: bName,
        courseId: bCourse || null,
        centerId: bCenter || null,
        academicYearId: years.data?.[0]?.id || null,
        capacity: Number(bCap),
        status: "ACTIVE",
      });
      setBName("");
      batches.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Institute setup</h1>
      <ErrorText error={error} />
      <Card title="Organization profile" action={<PrimaryButton onClick={fillOrg}>Load current</PrimaryButton>}>
        {org.data && (
          <p className="mb-3 text-sm text-slate-500">
            {org.data.name} · GSTIN {org.data.gstin || "—"} · package {org.data.packageTier}
          </p>
        )}
        <FormGrid>
          <Field label="Institute name" value={oName} onChange={setOName} />
          <Field label="Legal name" value={legal} onChange={setLegal} />
          <Field label="GSTIN" value={gstin} onChange={setGstin} />
          <Field label="Email" value={oEmail} onChange={setOEmail} />
          <Field label="Phone" value={oPhone} onChange={setOPhone} />
          <Field label="Logo URL" value={logoUrl} onChange={setLogoUrl} />
          <Field label="Brand color" value={brandPrimary} onChange={setBrandPrimary} />
          <Field label="Navy / secondary" value={brandSecondary} onChange={setBrandSecondary} />
          <div className="flex items-end">
            <PrimaryButton onClick={saveOrg}>Save profile</PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Add center">
        <FormGrid>
          <Field label="Name" value={cName} onChange={setCName} />
          <Field label="Code" value={cCode} onChange={setCCode} />
          <Field label="City" value={cCity} onChange={setCCity} />
          <div className="flex items-end">
            <PrimaryButton disabled={!cName} onClick={addCenter}>
              Save center
            </PrimaryButton>
          </div>
        </FormGrid>
        <div className="mt-4">
          <Table columns={["Name", "Code", "City"]} rows={(centers.data ?? []).map((c) => [c.name, c.code, c.city])} />
        </div>
      </Card>
      <Card title="Add course">
        <FormGrid>
          <Field label="Code" value={coCode} onChange={setCoCode} />
          <Field label="Name" value={coName} onChange={setCoName} />
          <Field label="Fees (₹)" value={coFees} onChange={setCoFees} />
          <Field label="Duration (months)" value={coMonths} onChange={setCoMonths} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!coCode || !coName} onClick={addCourse}>
            Save course
          </PrimaryButton>
        </div>
        <div className="mt-4">
          <Table
            columns={["Code", "Name", "Fees"]}
            rows={(courses.data ?? []).map((c) => [c.code, c.name, `₹${c.fees}`])}
          />
        </div>
      </Card>
      <Card title="Add batch">
        <FormGrid>
          <Field label="Batch name" value={bName} onChange={setBName} />
          <Select label="Course" value={bCourse} onChange={setBCourse} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Center" value={bCenter} onChange={setBCenter} options={(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Field label="Capacity" value={bCap} onChange={setBCap} />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!bName} onClick={addBatch}>
            Save batch
          </PrimaryButton>
        </div>
        <ul className="mt-4 text-sm">
          {(batches.data ?? []).map((b) => (
            <li key={b.id}>
              {b.name} — {b.status} ({b.capacity})
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Classrooms">
        <ul className="text-sm">
          {(rooms.data ?? []).map((r, i) => (
            <li key={i}>
              {r.name} ({r.type})
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Integrations (live only with credentials)">
        {integrations.data && (
          <ul className="text-sm">
            <li>Payments: {integrations.data.payments.provider} — {integrations.data.payments.live ? "live" : "demo adapter"}</li>
            <li>WhatsApp: {integrations.data.whatsapp.provider} — {integrations.data.whatsapp.live ? "live" : "demo adapter"}</li>
            <li>Meetings: {integrations.data.meetings.provider} — {integrations.data.meetings.live ? "live" : "demo adapter"}</li>
            <li>Storage: {integrations.data.storage.provider}</li>
            <li className="mt-2 text-slate-500">{integrations.data.note}</li>
          </ul>
        )}
      </Card>
    </div>
  );
}
