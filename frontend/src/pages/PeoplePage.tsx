import { NavLink, Navigate, useParams } from "react-router-dom";
import { useState } from "react";
import { createRecord } from "../ops";
import { AlumniPage } from "./AlumniPage";
import { StaffStudents } from "./StudentsPage";
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
        <p className="text-sm text-slate-500">
          Students, institute staff, and alumni. Niyamstack employees are managed separately on the platform admin.
        </p>
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
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberRole, setMemberRole] = useState("FACULTY");

  async function inviteMember() {
    setError(null);
    try {
      await createRecord("/api/tickets", {
        raisedBy: "Owner",
        category: "TEAM",
        subject: `Add team member: ${memberName}`,
        body: `${memberName} · ${memberEmail} · ${memberPhone} · role ${memberRole}`,
        status: "OPEN",
      });
      setMemberName("");
      setMemberEmail("");
      setMemberPhone("");
      alert("Institute staff request logged. This is your institute team (teachers and employees), not Niyamstack staff.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Card title="Institute staff">
        <p className="mb-3 text-sm text-slate-500">
          Teachers, counselors, accountants, and other employees of this institute. Niyamstack company staff live under Platform →
          Employee management.
        </p>
        <Table
          columns={["Member", "Email", "Role", "Active"]}
          rows={(staff.data ?? []).map((s) => [s.fullName, s.email, s.role, s.active ? "Yes" : "No"])}
        />
      </Card>
      <ErrorText error={error} />
      <Card title="Add institute staff">
        <FormGrid>
          <Field label="Name" value={memberName} onChange={setMemberName} placeholder="Enter Name" />
          <Field label="Phone" value={memberPhone} onChange={setMemberPhone} placeholder="Enter Phone Number" />
          <Field label="Email ID" value={memberEmail} onChange={setMemberEmail} />
          <Select
            label="Role"
            value={memberRole}
            onChange={setMemberRole}
            options={[
              { value: "FACULTY", label: "Faculty" },
              { value: "COUNSELOR", label: "Counselor" },
              { value: "ACCOUNTANT", label: "Accountant" },
              { value: "PLACEMENT_HEAD", label: "Placement head" },
            ]}
          />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={!memberName} onClick={inviteMember}>
            Save & Proceed
          </PrimaryButton>
        </div>
      </Card>
    </>
  );
}
