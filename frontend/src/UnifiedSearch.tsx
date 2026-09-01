import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { hasGrowthTier } from "./packs";
import { api } from "./api";

type Hit = { module: string; id: string; title: string; subtitle?: string; path: string };

export function UnifiedSearch() {
  const { user } = useAuth();
  const growth = hasGrowthTier(user?.packageTier, user?.modules);
  const canSearch = growth && ["OWNER", "ACCOUNTANT", "COUNSELOR", "PLACEMENT_HEAD", "FACULTY"].includes(user?.role ?? "");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canSearch || q.trim().length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void api<Hit[]>(`/api/actions/intelligence/search?q=${encodeURIComponent(q.trim())}&limit=8`)
        .then(setHits)
        .catch((e) => {
          setHits([]);
          setError((e as Error).message);
        });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [q, canSearch]);

  if (!canSearch) {
    return null;
  }

  return (
    <div className="relative hidden min-w-[220px] flex-1 sm:block md:max-w-md">
      <input
        className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        placeholder="Search students, leads, fees…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-line bg-white shadow-lg">
          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          {!error && hits.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No matches.</p>}
          <ul className="max-h-72 overflow-y-auto py-1">
            {hits.map((hit) => (
              <li key={`${hit.module}-${hit.id}`}>
                <Link
                  className="block px-3 py-2 hover:bg-mist"
                  to={hit.path}
                  onClick={() => {
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <p className="text-sm font-medium text-navy">{hit.title}</p>
                  <p className="text-xs text-slate-500">
                    {hit.module} · {hit.subtitle}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Link className="block border-t border-line px-3 py-2 text-xs text-brand hover:underline" to="/intelligence">
            Open intelligence hub
          </Link>
        </div>
      )}
    </div>
  );
}
