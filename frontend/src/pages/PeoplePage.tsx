import { NavLink, Navigate, useParams } from "react-router-dom";
import { useState } from "react";
import { createRecord } from "../ops";
import { AlumniPage } from "./AlumniPage";
import { StaffStudents } from "./StudentsPage";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Staff = { id: string; fullName: string; email: string; role: string; active: boolean };

const tabs = [
  { id: "students", label: "Students", to: "/people/students" },
  { id: "staff", label: "Staff", to: "/people/staff" },
  { id: "alumni", label: "Alumni", to: "/people/alumni" },
] as const;

export function PeoplePage() {
  const { tab } = useParams();
  const current = tab || "students";
  if (!tab) return <Navigate to="/people/students" replace />;
  if (current !== "students" && current !== "staff" && current !== "alumni") {
    return <Navigate to="/people/students" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">People</h1>
        <p className="text-sm text-slate-500">Students, teachers, and alumni of this institute.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            className={({ isActive }) => `rounded-full px-3 py-1.5 text-sm ${isActive ? "bg-navy text-white" : "bg-mist"}`}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
      {current === "students" && <StaffStudents canEnroll embedded />}
      {current === "staff" && <InstituteStaff />}
      {current === "alumni" && <AlumniPage embedded />}
    </div>
  );
}

function InstituteStaff() {
  const staff = useApi<Staff[]>("/api/staff");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberRole, setMemberRole] = useState("FACULTY");

  async function inviteMember() {
    setError(null);
    setNotice(null);
    try {
      const created = await createRecord("/api/staff", {
        fullName: memberName,
        email: memberEmail,
        phone: memberPhone,
        role: memberRole,
      }) as Staff & { tempPassword?: string };
      setMemberName("");
      setMemberEmail("");
      setMemberPhone("");
      staff.reload();
      setNotice(
        created.tempPassword
          ? `${created.fullName} can log in with ${created.email}. Temporary password: ${created.tempPassword}. Ask them to change it after first login.`
          : `${created.fullName} was added.`
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Card title="Institute staff">
        <p className="mb-3 text-sm text-slate-500">Teachers, counselors, accountants, and placement staff. They log in to this portal, not the student website.</p>
        <Table
          empty="No staff besides you yet. Add a teacher below."
          columns={["Member", "Email", "Role", "Active"]}
          rows={(staff.data ?? []).map((s) => [s.fullName, s.email, prettyLabel(s.role), s.active ? "Yes" : "No"])}
        />
      </Card>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <Card title="Add staff login">
        <FormGrid>
          <Field label="Name" value={memberName} onChange={setMemberName} placeholder="Full name" />
          <Field label="Phone" value={memberPhone} onChange={setMemberPhone} placeholder="10-digit mobile" />
          <Field label="Email" value={memberEmail} onChange={setMemberEmail} placeholder="They will log in with this" />
          <Select
            label="Role"
            value={memberRole}
            onChange={setMemberRole}
            allowEmpty={false}
            options={[
              { value: "FACULTY", label: "Faculty" },
              { value: "COUNSELOR", label: "Counselor" },
              { value: "ACCOUNTANT", label: "Accountant" },
              { value: "PLACEMENT_HEAD", label: "Placement head" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!memberName || !memberEmail} onClick={() => void inviteMember()}>
            Create staff login
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}
