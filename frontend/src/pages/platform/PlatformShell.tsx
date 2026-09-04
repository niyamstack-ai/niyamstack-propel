import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearInstituteSession } from "../../api";
import { NiyamstackLogo } from "../../brand/NiyamstackLogo";
import { hasCap, usePlatformAuth } from "../../platformAuth";

const nav = [
  { to: "/platform", label: "Dashboard", end: true, cap: "VIEW_DASHBOARD" },
  { to: "/platform/institutes", label: "Institutes", end: false, cap: "VIEW_INSTITUTES" },
  { to: "/platform/employees", label: "Niyamstack staff", end: false, cap: "MANAGE_EMPLOYEES" },
  { to: "/platform/settings", label: "Settings", end: false, cap: "*" },
  { to: "/platform/features", label: "License map", end: false, cap: "VIEW_DASHBOARD" },
];

export function PlatformShell() {
  const { user, logout } = usePlatformAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = nav.filter((item) => item.cap === "*" || hasCap(user, item.cap));

  function signOut() {
    logout();
    clearInstituteSession();
    window.dispatchEvent(new Event("propel:unauthorized"));
    navigate("/platform/login");
  }

  const sideNav = (
    <>
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <NiyamstackLogo variant="icon" />
          <div>
            <p className="text-sm font-bold leading-tight">Niyamstack</p>
            <p className="text-[10px] tracking-[0.2em] text-sky-300">CONTROL PLANE</p>
          </div>
        </div>
        <p className="mt-5 text-xl font-bold">Platform</p>
        <p className="mt-1 text-xs text-slate-300">Institutes, staff, and approvals</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-6">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </>
  );

  return (
    <div className="min-h-svh bg-mist">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col bg-navy text-white sm:flex">{sideNav}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-navy text-white shadow-xl">{sideNav}</aside>
        </div>
      )}
      <div className="sm:pl-60">
        <header className="border-b border-line bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="rounded-lg border border-line px-2.5 py-1.5 text-sm sm:hidden"
                onClick={() => setMenuOpen(true)}
              >
                Menu
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-slate-500">Platform {user?.role === "PLATFORM_OWNER" ? "owner" : "staff"}</p>
              </div>
            </div>
            <button className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
