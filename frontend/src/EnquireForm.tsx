import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";
import { selectOptions, type FormField } from "./formFields";

export function EnquireForm({
  slug,
  compact,
  landingSlug,
  fields = [],
}: {
  slug?: string;
  compact?: boolean;
  landingSlug?: string;
  fields?: FormField[];
}) {
  const [search] = useSearchParams();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!slug) return null;

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    for (const field of fields) {
      if (field.required && !(answers[field.id] || "").trim()) {
        setError(`Please fill ${field.label}`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const extra: Record<string, string> = {};
      for (const field of fields) {
        const value = (answers[field.id] || "").trim();
        if (value) extra[field.label] = value;
      }
      await api(`/api/public/sites/${slug}/enquire`, {
        method: "POST",
        body: JSON.stringify({
          fullName: name,
          phone,
          email,
          message,
          landingSlug: landingSlug || undefined,
          referralCode: search.get("ref") || undefined,
          answers: extra,
        }),
      });
      setDone(true);
      setName("");
      setPhone("");
      setEmail("");
      setMessage("");
      setAnswers({});
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
      {fields.map((field) => (
        <div key={field.id} className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {field.label}
            {field.required ? " *" : ""}
          </label>
          {field.type === "textarea" ? (
            <textarea className="min-h-20 w-full rounded-lg border border-line px-3 py-2 text-sm" value={answers[field.id] || ""} onChange={(e) => setAnswer(field.id, e.target.value)} required={field.required} />
          ) : field.type === "select" ? (
            <select className="w-full rounded-lg border border-line px-3 py-2 text-sm" value={answers[field.id] || ""} onChange={(e) => setAnswer(field.id, e.target.value)} required={field.required}>
              <option value="">Choose</option>
              {selectOptions(field).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : field.type === "yesno" ? (
            <select className="w-full rounded-lg border border-line px-3 py-2 text-sm" value={answers[field.id] || ""} onChange={(e) => setAnswer(field.id, e.target.value)} required={field.required}>
              <option value="">Choose</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          ) : (
            <input className="w-full rounded-lg border border-line px-3 py-2 text-sm" value={answers[field.id] || ""} onChange={(e) => setAnswer(field.id, e.target.value)} required={field.required} />
          )}
        </div>
      ))}
      <textarea className="min-h-20 rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2" placeholder="What do you want to join?" value={message} onChange={(e) => setMessage(e.target.value)} />
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2" disabled={busy || !name.trim() || !phone.trim()}>
        {busy ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
