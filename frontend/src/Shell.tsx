import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { NiyamstackLogo } from "./brand/NiyamstackLogo";
import { flattenNav, isNavGroup, navForRole, portalTitle, type NavGroup } from "./portals";

function linkClass(isActive: boolean, nested = false) {
  return `${nested ? "block rounded-lg px-3 py-1.5 pl-6 text-[13px]" : "block rounded-lg px-3 py-2 text-sm"} ${
    isActive ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/5"
  }`;
}

function groupContainsPath(group: NavGroup, path: string) {
  return group.items.some((item) => path === item.to || (item.to !== "/" && path.startsWith(item.to + "/")));
}

export function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = navForRole(user?.role);
  const portal = portalTitle(user?.role);
  const mobileItems = flattenNav(nav);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    const items = navForRole(user?.role);
    const match = items.find((entry) => isNavGroup(entry) && groupContainsPath(entry, location.pathname));
    setOpenGroup(match && isNavGroup(match) ? match.label : null);
  }, [location.pathname, user?.role]);

  function toggleGroup(label: string) {
    setOpenGroup((current) => (current === label ? null : label));
  }

  return (
    <div className="min-h-svh bg-mist">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-navy text-white lg:flex">
        <div className="px-5 py-6">
          <div className="flex items-center gap-3">
            <NiyamstackLogo variant="icon" />
            <div>
              <p className="text-sm font-bold leading-tight">Niyamstack</p>
              <p className="text-[10px] tracking-[0.2em] text-sky-300">PROPEL</p>
            </div>
          </div>
          <p className="mt-5 text-xl font-bold">{portal.name}</p>
          <p className="mt-1 text-xs text-slate-300">{portal.blurb}</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-6">
          {nav.map((entry) => {
            if (!isNavGroup(entry)) {
              return (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  end={entry.to === "/"}
                  className={({ isActive }) => linkClass(isActive)}
                >
                  {entry.label}
                </NavLink>
              );
            }
            const open = openGroup === entry.label;
            const active = groupContainsPath(entry, location.pathname);
            return (
              <div key={entry.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.label)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    active || open ? "text-white" : "text-slate-300 hover:bg-white/5"
                  } ${open ? "bg-white/10" : ""}`}
                >
                  <span>{entry.label}</span>
                  <span className={`text-[10px] text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                </button>
                {open && (
                  <div className="mt-0.5 space-y-0.5">
                    {entry.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          linkClass(isActive || (item.to !== "/" && location.pathname.startsWith(item.to)), true)
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-60">
        <header className="border-b border-line bg-white">
          {(user?.accessStatus === "DEMO" || user?.accessStatus === "PENDING_APPROVAL") && (
            <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
              {user.accessStatus === "DEMO"
                ? "This is a demo workspace. Subscribe, then Niyamstack will activate live rights for your institute."
                : "Payment received. Waiting for Niyamstack to activate your institute."}
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <div>
              <p className="text-sm font-semibold">{user?.name}</p>
              <p className="text-xs text-slate-500">{portal.name}</p>
            </div>
            <button
              className="rounded-full border border-line px-3 py-1.5 text-sm"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Sign out
            </button>
          </div>
          <nav className="flex flex-wrap gap-1 border-t border-line px-3 py-2 lg:hidden">
            {mobileItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `rounded-full px-3 py-1 text-xs ${isActive ? "bg-navy text-white" : "bg-mist text-navy"}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
