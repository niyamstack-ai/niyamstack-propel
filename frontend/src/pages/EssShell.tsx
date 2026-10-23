import { useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { NiyamstackLogo } from "../brand/NiyamstackLogo";
import { hasGrowthTier } from "../packs";
import { UserMenu } from "../UserMenu";

type EssNavItem = {
  to: string;
  label: string;
  end?: boolean;
  /** When set, item is shown only if this flag is true */
  when?: "hr" | "payroll" | "manager" | "growth" | "always";
};

function essAccess(user: ReturnType<typeof useAuth>["user"]) {
  const hr = user?.role === "OWNER" || (user?.capabilities ?? []).includes("ESS_MANAGE");
  const payroll = hr || user?.role === "ACCOUNTANT";
  const manager = hr || (user?.capabilities ?? []).includes("LEAVE_APPROVE");
  const growth = hasGrowthTier(user?.packageTier, user?.modules);
  return { hr, payroll, manager, growth };
}

const ALL_NAV: EssNavItem[] = [
  { to: "/ess", label: "Dashboard", end: true, when: "always" },
  { to: "/ess/employees", label: "Employees", when: "hr" },
  { to: "/ess/documents", label: "KYC & Bank", when: "always" },
  { to: "/ess/hiring", label: "Offer Letters", when: "hr" },
  { to: "/ess/settings", label: "Settings", when: "hr" },
  { to: "/ess/payslips", label: "Payslips", when: "always" },
  { to: "/ess/payroll", label: "Payroll setup", when: "payroll" },
  { to: "/ess/attendance", label: "Attendance", when: "always" },
  { to: "/ess/leave", label: "Leave Requests", when: "always" },
  { to: "/ess/exit", label: "Exit Requests", when: "always" },
  { to: "/ess/compensation", label: "Compensation", when: "growth" },
  { to: "/ess/team", label: "Team", when: "manager" },
  { to: "/ess/devices", label: "Devices", when: "hr" },
  { to: "/ess/profile", label: "My Profile", when: "always" },
];

function navVisible(item: EssNavItem, access: ReturnType<typeof essAccess>) {
  switch (item.when) {
    case "hr":
      return access.hr;
    case "payroll":
      return access.payroll;
    case "manager":
      return access.manager;
    case "growth":
      return access.payroll && access.growth;
    default:
      return true;
  }
}

function essNavActive(to: string, end: boolean | undefined, pathname: string) {
  if (end) return pathname === "/ess" || pathname === "/ess/";
  return pathname === to || pathname.startsWith(to + "/");
}

export function EssShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const access = useMemo(() => essAccess(user), [user]);
  const items = ALL_NAV.filter((item) => navVisible(item, access));

  const roleLabel = access.hr
    ? "ESS Administrator"
    : access.payroll
      ? "Payroll"
      : access.manager
        ? "Manager"
        : "Self-service";

  const sideNav = (
    <>
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <NiyamstackLogo variant="icon" />
          <div>
            <p className="text-sm font-bold leading-tight">Niyamstack</p>
            <p className="text-[10px] tracking-[0.2em] text-emerald-300">ESS</p>
          </div>
        </div>
        <p className="mt-5 text-xl font-bold">ESS Admin</p>
        <p className="mt-1 text-xs text-slate-300">Employee self-service workspace</p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item) => {
          const active = essNavActive(item.to, item.end, location.pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={() =>
                `block rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"}`
              }
            >
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-3 py-4">
        <Link
          to="/"
          onClick={() => setMenuOpen(false)}
          className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
        >
          ← Back to institute
        </Link>
      </div>
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
                <p className="truncate text-sm font-semibold text-navy">Admin Workspace</p>
                <p className="text-xs text-slate-500">
                  {user?.name || "User"} · {roleLabel}
                  {access.hr ? " (Super Admin)" : ""}
                </p>
              </div>
            </div>
            <UserMenu profileTo="/account" />
          </div>
        </header>
        <main className="min-w-0 overflow-x-hidden p-4 sm:p-6">
          <Outlet context={access} />
        </main>
      </div>
    </div>
  );
}

export type EssOutletAccess = ReturnType<typeof essAccess>;
