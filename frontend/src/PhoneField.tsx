import { useEffect, useMemo, useState } from "react";

export type PhoneCountry = {
  iso: string;
  name: string;
  dial: string;
  /** Max national significant digits (approx). */
  maxLen: number;
};

/** Common dial codes; India first as product default. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "IN", name: "India", dial: "91", maxLen: 10 },
  { iso: "AE", name: "United Arab Emirates", dial: "971", maxLen: 9 },
  { iso: "US", name: "United States", dial: "1", maxLen: 10 },
  { iso: "CA", name: "Canada", dial: "1", maxLen: 10 },
  { iso: "GB", name: "United Kingdom", dial: "44", maxLen: 10 },
  { iso: "AU", name: "Australia", dial: "61", maxLen: 9 },
  { iso: "SG", name: "Singapore", dial: "65", maxLen: 8 },
  { iso: "NP", name: "Nepal", dial: "977", maxLen: 10 },
  { iso: "BD", name: "Bangladesh", dial: "880", maxLen: 10 },
  { iso: "LK", name: "Sri Lanka", dial: "94", maxLen: 9 },
  { iso: "PK", name: "Pakistan", dial: "92", maxLen: 10 },
  { iso: "SA", name: "Saudi Arabia", dial: "966", maxLen: 9 },
  { iso: "QA", name: "Qatar", dial: "974", maxLen: 8 },
  { iso: "OM", name: "Oman", dial: "968", maxLen: 8 },
  { iso: "KW", name: "Kuwait", dial: "965", maxLen: 8 },
  { iso: "BH", name: "Bahrain", dial: "973", maxLen: 8 },
  { iso: "MY", name: "Malaysia", dial: "60", maxLen: 10 },
  { iso: "DE", name: "Germany", dial: "49", maxLen: 11 },
  { iso: "FR", name: "France", dial: "33", maxLen: 9 },
  { iso: "NZ", name: "New Zealand", dial: "64", maxLen: 10 },
];

const BY_ISO = Object.fromEntries(PHONE_COUNTRIES.map((c) => [c.iso, c]));

/** Sort dial codes longest-first so "971" wins over "91" / "9". */
const DIAL_SORTED = [...PHONE_COUNTRIES]
  .map((c) => c.dial)
  .filter((d, i, arr) => arr.indexOf(d) === i)
  .sort((a, b) => b.length - a.length);

export function flagOf(iso: string) {
  const code = (iso || "IN").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...[...code].map((ch) => 127397 + ch.charCodeAt(0)));
}

export function digitsOnly(raw: string) {
  return (raw || "").replace(/\D/g, "");
}

export function parsePhoneValue(value: string, fallbackIso = "IN"): { iso: string; dial: string; national: string } {
  const digits = digitsOnly(value);
  const fallback = BY_ISO[fallbackIso] || PHONE_COUNTRIES[0];
  if (!digits) {
    return { iso: fallback.iso, dial: fallback.dial, national: "" };
  }

  for (const dial of DIAL_SORTED) {
    if (digits.startsWith(dial) && digits.length > dial.length) {
      const national = digits.slice(dial.length);
      const match =
        PHONE_COUNTRIES.find((c) => c.dial === dial && national.length <= c.maxLen + 2) ||
        PHONE_COUNTRIES.find((c) => c.dial === dial);
      if (match) {
        return { iso: match.iso, dial: match.dial, national };
      }
    }
  }

  // Bare Indian mobile (legacy storage)
  if (digits.length <= 11 && /^[6-9]\d{0,9}$/.test(digits)) {
    return { iso: "IN", dial: "91", national: digits.slice(0, 10) };
  }

  return { iso: fallback.iso, dial: fallback.dial, national: digits.slice(0, fallback.maxLen) };
}

/** E.164-style value with leading +, e.g. +919876543210. Empty national → "". */
export function formatPhoneValue(dial: string, national: string) {
  const n = digitsOnly(national);
  if (!n) return "";
  return `+${digitsOnly(dial)}${n}`;
}

/**
 * Value for API / auth. India stays 10-digit national (matches existing DB).
 * Other countries keep country code + national digits (no +).
 */
export function phoneForApi(value: string) {
  const { dial, national } = parsePhoneValue(value);
  const n = digitsOnly(national);
  if (!n) return "";
  if (dial === "91") return n.slice(0, 10);
  return `${dial}${n}`;
}

/** Display helper for tables: 🇮🇳 +91 98765… */
export function formatPhoneDisplay(value?: string | null) {
  if (!value) return "—";
  const { iso, dial, national } = parsePhoneValue(value);
  if (!national) return "—";
  return `${flagOf(iso)} +${dial} ${national}`;
}

export function PhoneField({
  label,
  value,
  onChange,
  name,
  placeholder,
  required,
  disabled,
  fullWidth = true,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Span both columns inside FormGrid so dial + number stay readable. */
  fullWidth?: boolean;
}) {
  const parsed = useMemo(() => parsePhoneValue(value), [value]);
  const [iso, setIso] = useState(parsed.iso);
  const [national, setNational] = useState(parsed.national);

  useEffect(() => {
    const next = parsePhoneValue(value);
    setIso(next.iso);
    setNational(next.national);
  }, [value]);

  const country = BY_ISO[iso] || PHONE_COUNTRIES[0];

  function emit(nextIso: string, nextNational: string) {
    const c = BY_ISO[nextIso] || PHONE_COUNTRIES[0];
    const clipped = digitsOnly(nextNational).slice(0, c.maxLen);
    setIso(c.iso);
    setNational(clipped);
    onChange(formatPhoneValue(c.dial, clipped));
  }

  return (
    <label className={`block text-sm ${fullWidth ? "md:col-span-2" : ""}`}>
      {label ? <span className="text-slate-600">{label}</span> : null}
      <span className={`flex min-w-0 overflow-hidden rounded-lg border border-line bg-white ${label ? "mt-1" : ""}`}>
        <span className="relative inline-flex shrink-0 items-stretch border-r border-line bg-mist">
          <span className="pointer-events-none flex items-center gap-0.5 px-2 text-[13px] font-semibold tabular-nums text-navy">
            <span className="text-base leading-none" aria-hidden>
              {flagOf(country.iso)}
            </span>
            <span>+{country.dial}</span>
            <span className="pl-0.5 text-[9px] font-normal text-slate-500">▾</span>
          </span>
          <select
            aria-label="Country code"
            className="absolute inset-0 z-10 cursor-pointer opacity-0"
            value={iso}
            disabled={disabled}
            onChange={(e) => emit(e.target.value, national)}
            title={country.name}
          >
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {flagOf(c.iso)} +{c.dial} {c.name}
              </option>
            ))}
          </select>
        </span>
        <input
          name={name}
          autoComplete={name || "tel-national"}
          inputMode="numeric"
          required={required}
          disabled={disabled}
          className="w-full min-w-0 border-0 px-3 py-2.5 outline-none focus:ring-0"
          value={national}
          placeholder={placeholder || (country.iso === "IN" ? "10-digit mobile" : "Local mobile number")}
          onChange={(e) => emit(iso, e.target.value)}
        />
      </span>
    </label>
  );
}
