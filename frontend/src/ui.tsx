import { useEffect, useState } from "react";
import { api } from "./api";
import { uploadMedia } from "./ops";

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    api<T>(path)
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);

  return { data, error, loading: data === null && !error, reload: () => setTick((n) => n + 1) };
}

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-navy-mid">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Table({
  columns,
  rows,
  empty = "Nothing here yet.",
}: {
  columns: string[];
  rows: Array<Array<React.ReactNode>>;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-slate-500">
            {columns.map((c) => (
              <th key={c} className="py-2 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line/70">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const password = type === "password";
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="relative mt-1 block">
        <input
          className="w-full rounded-lg border border-line px-3 py-2"
          value={value}
          type={password && show ? "text" : type}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {password && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-brand"
            onClick={() => setShow((v) => !v)}
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </span>
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty && <option value="">Select…</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm md:col-span-2 xl:col-span-4">
      <span className="text-slate-600">{label}</span>
      <textarea
        className="mt-1 w-full rounded-lg border border-line px-3 py-2"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function ErrorText({ error }: { error?: string | null }) {
  if (!error) return null;
  return <p className="mt-2 text-sm text-red-600">{error}</p>;
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      onClick={onClick}
      type="button"
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function LinkButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button className="text-sm font-medium text-brand hover:underline" onClick={onClick} type="button">
      {children}
    </button>
  );
}

export function formatDay(value?: string | null) {
  if (!value) return "";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatWhen(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatInr(amount?: number | string | null) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN")}`;
}

export function FileUpload({
  label,
  value,
  onChange,
  accept = "image/*,.pdf",
}: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  accept?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-navy">{label}</span>
      <input
        type="file"
        accept={accept}
        disabled={busy}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-mist file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-navy"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            const out = await uploadMedia(file);
            onChange(out.url);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {value ? (
        value.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i) || value.includes("/media/") ? (
          <img src={value} alt="" className="mt-2 h-16 max-w-full rounded-lg object-contain" />
        ) : (
          <a className="mt-1 inline-block text-xs text-brand hover:underline" href={value} target="_blank" rel="noreferrer">
            Uploaded file
          </a>
        )
      ) : null}
    </label>
  );
}
