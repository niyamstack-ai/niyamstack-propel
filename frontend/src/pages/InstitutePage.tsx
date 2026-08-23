import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createRecord, updateRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FileUpload, FormGrid, PrimaryButton, Select, Table, formatInr, useApi } from "../ui";

type Org = {
  name: string;
  legalName: string;
  gstin: string;
  email: string;
  phone: string;
  website: string;
  packageTier: string;
  productPack?: string;
  logoUrl?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  websitePublished?: boolean;
};
type Center = { id: string; name: string; code: string; city: string; address?: string };
type Course = { id: string; code: string; name: string; fees: number; durationMonths?: number };
type Batch = { id: string; name: string; status: string; capacity: number; courseId?: string; centerId?: string };

export function InstitutePage() {
  const org = useApi<Org>("/api/organization");
  const centers = useApi<Center[]>("/api/centers");
  const courses = useApi<Course[]>("/api/courses");
  const batches = useApi<Batch[]>("/api/batches");
  const rooms = useApi<{ id: string; name: string; type: string }[]>("/api/classrooms");
  const years = useApi<{ id: string; name: string }[]>("/api/academic-years");
  const terms = useApi<{ id: string; name: string }[]>("/api/terms");

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

  const [bName, setBName] = useState("");
  const [bCourse, setBCourse] = useState("");
  const [bCenter, setBCenter] = useState("");
  const [bCap, setBCap] = useState("40");
  const [bTerm, setBTerm] = useState("");

  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState("Classroom");
  const [roomCenter, setRoomCenter] = useState("");

  useEffect(() => {
    fillOrg();
  }, [org.data]);

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
        websitePublished: org.data?.websitePublished === true,
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

  async function addBatch() {
    setError(null);
    try {
      await createRecord("/api/batches", {
        name: bName,
        courseId: bCourse || null,
        centerId: bCenter || null,
        academicYearId: years.data?.[0]?.id || null,
        termId: bTerm || terms.data?.[0]?.id || null,
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
      <Card title="Organization profile">
        {org.data && (
          <p className="mb-3 text-sm text-slate-500">
            {org.data.name} · GSTIN {org.data.gstin || "—"} · pack {prettyLabel(org.data.productPack)} · catalog {prettyLabel(org.data.packageTier)}
          </p>
        )}
        <FormGrid>
          <Field label="Institute name" value={oName} onChange={setOName} />
          <Field label="Legal name" value={legal} onChange={setLegal} />
          <Field label="GSTIN" value={gstin} onChange={setGstin} placeholder="15-character GSTIN, e.g. 27AABCU9603R1ZX" />
          <Field label="Email" value={oEmail} onChange={setOEmail} />
          <Field label="Phone" value={oPhone} onChange={setOPhone} />
          <FileUpload label="Logo" value={logoUrl} accept="image/*" onChange={setLogoUrl} />
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
      <Card title="Courses">
        <p className="text-sm text-slate-500">Use the course wizard for price, validity, and content. This table is the current catalog.</p>
        <div className="mt-3">
          <Link to="/courses/new">
            <PrimaryButton>Create course</PrimaryButton>
          </Link>
        </div>
        <div className="mt-4">
          <Table
            columns={["Code", "Name", "Fees"]}
            rows={(courses.data ?? []).map((c) => [c.code, c.name, formatInr(c.fees)])}
          />
        </div>
      </Card>
      <Card title="Add batch">
        <FormGrid>
          <Field label="Batch name" value={bName} onChange={setBName} />
          <Select label="Course" value={bCourse} onChange={setBCourse} options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Center" value={bCenter} onChange={setBCenter} options={(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Term" value={bTerm} onChange={setBTerm} options={(terms.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
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
              {b.name} — {prettyLabel(b.status)} ({b.capacity})
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Classrooms">
        <FormGrid>
          <Field label="Room name" value={roomName} onChange={setRoomName} placeholder="Room 1" />
          <Field label="Type" value={roomType} onChange={setRoomType} placeholder="Classroom / Lab" />
          <Select label="Center" value={roomCenter} onChange={setRoomCenter} options={(centers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!roomName}
              onClick={async () => {
                setError(null);
                try {
                  await createRecord("/api/classrooms", { name: roomName, type: roomType, centerId: roomCenter || null, capacity: 40 });
                  setRoomName("");
                  rooms.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save classroom
            </PrimaryButton>
          </div>
        </FormGrid>
        <ul className="mt-4 text-sm">
          {(rooms.data ?? []).map((r) => (
            <li key={r.id}>
              {r.name} ({r.type})
            </li>
          ))}
        </ul>
      </Card>
      <Card title="How payments and WhatsApp run">
        <p className="text-sm text-slate-500">
          Live Razorpay, WhatsApp, and email are switched on by Niyamstack with keys — see Settings → Integrations. This page is for institute profile, centres, and rooms.
        </p>
      </Card>
    </div>
  );
}
