import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth";

export function initialsOf(name?: string) {
  const parts = (name || "U").trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] ?? "U"}${parts[1]?.[0] ?? ""}`;
  return letters.toUpperCase();
}

export function UserMenu({
  signOutTo = "/login",
  profileTo,
  extraLinks = [],
  showName,
}: {
  signOutTo?: string;
  profileTo?: string;
  extraLinks?: { label: string; to: string }[];
  showName?: boolean;
} = {}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative shrink-0" ref={wrap}>
      <button
        type="button"
        className="relative flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 shadow-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-400 text-[11px] font-bold text-navy">
          {initialsOf(user?.name)}
        </span>
        <span className={`${showName ? "inline" : "hidden sm:inline"} max-w-[180px] truncate text-sm font-medium text-navy`}>{user?.name}</span>
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-400" aria-hidden>
          <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-line bg-white py-1 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-slate-500">{user?.name}</p>
          {user?.email && <p className="truncate px-3 pb-2 text-xs text-slate-400">{user.email}</p>}
          {profileTo && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-mist"
              onClick={() => {
                setOpen(false);
                navigate(profileTo);
              }}
            >
              My profile
            </button>
          )}
          {extraLinks.map((link) => (
            <button
              key={link.to}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-mist"
              onClick={() => {
                setOpen(false);
                navigate(link.to);
              }}
            >
              {link.label}
            </button>
          ))}
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-mist"
            onClick={() => {
              logout();
              navigate(signOutTo);
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
