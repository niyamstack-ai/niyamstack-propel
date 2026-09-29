import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, PhoneField, phoneForApi } from "../ui";

/** Institute staff/owner login identity — email & phone used at /login. */
export function AccountPage() {
  const { user, applySession } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setPhone(user?.phone || "");
  }, [user?.name, user?.email, user?.phone]);

  async function saveProfile() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ token: string; user: unknown }>("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, email, phone: phoneForApi(phone) }),
      });
      applySession(res as never);
      setNotice("Login email/phone saved. If you changed email or phone, verify them when prompted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (newPassword !== confirm) throw new Error("New passwords do not match");
      await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setNotice("Password updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">My account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Change the email and mobile you use to sign in. Institute public contact details are under Institute setup.
        </p>
      </div>
      <ErrorText error={error} />
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      <Card title="Login details">
        <FormGrid>
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Login email" value={email} onChange={setEmail} type="email" />
          <PhoneField label="Login mobile" value={phone} onChange={setPhone} placeholder="10-digit" />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={busy || !name.trim()} onClick={() => void saveProfile()}>
            {busy ? "Saving…" : "Save login details"}
          </PrimaryButton>
        </div>
      </Card>
      <Card title="Password">
        <FormGrid>
          <Field label="Current password" value={currentPassword} onChange={setCurrentPassword} type="password" />
          <Field label="New password" value={newPassword} onChange={setNewPassword} type="password" />
          <Field label="Confirm new password" value={confirm} onChange={setConfirm} type="password" />
        </FormGrid>
        <div className="mt-3">
          <PrimaryButton disabled={busy || !currentPassword || !newPassword} onClick={() => void savePassword()}>
            {busy ? "Updating…" : "Update password"}
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
