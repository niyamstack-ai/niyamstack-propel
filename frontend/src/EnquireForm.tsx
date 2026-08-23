import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";

export function EnquireForm({ slug, compact, landingSlug }: { slug?: string; compact?: boolean; landingSlug?: string }) {
  const [search] = useSearchParams();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!slug) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/public/sites/${slug}/enquire`, {
        method: "POST",
        body: JSON.stringify({
          fullName: name,
          phone,
          email,
          message,
          landingSlug: landingSlug || undefined,
          referralCode: search.get("ref") || undefined,
        }),
      });
      setDone(true);
      setName("");
      setPhone("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="text-sm font-medium text-navy">Thanks. A counsellor will call you back.</p>;
  }

  return (
    <form className={`mt-4 grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`} onSubmit={submit}>
      <input className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Mobile" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      <input className="rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2" placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <textarea className="min-h-20 rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2" placeholder="What do you want to join?" value={message} onChange={(e) => setMessage(e.target.value)} />
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2" disabled={busy || !name.trim() || !phone.trim()}>
        {busy ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
