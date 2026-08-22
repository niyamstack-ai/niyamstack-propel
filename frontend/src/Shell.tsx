import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { NiyamstackLogo } from "./brand/NiyamstackLogo";
import { isNavGroup, navForRole, portalTitle, type NavGroup } from "./portals";
import { UserMenu } from "./UserMenu";

function linkClass(isActive: boolean, nested = false) {
  return `${nested ? "block rounded-lg px-3 py-1.5 pl-7 text-[13px]" : "block rounded-lg px-3 py-2 text-sm"} ${
    isActive ? "bg-white/15 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
  }`;
}

function groupContainsPath(group: NavGroup, path: string) {
  return group.items.some((item) => path === item.to || (item.to !== "/" && path.startsWith(item.to + "/")));
}

function SidebarNav({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const nav = navForRole(user?.role);

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
      {nav.map((entry) => {
        if (!isNavGroup(entry)) {
          return (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) => linkClass(isActive)}
            >
              {entry.label}
            </NavLink>
          );
        }
        const active = groupContainsPath(entry, location.pathname);
        return (
          <div key={entry.label} className="pt-2">
            <p className={`px-3 pb-1 text-left text-xs font-semibold ${active ? "text-white" : "text-slate-400"}`}>
              {entry.label}
            </p>
            <div className="space-y-0.5">
              {entry.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    linkClass(isActive || (item.to !== "/" && location.pathname.startsWith(item.to + "/")))
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBrand() {
  const { user } = useAuth();
  const portal = portalTitle(user?.role);
  return (
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
  );
}

function isCourseChrome(path: string) {
  return path === "/courses" || path.startsWith("/courses/");
}

function isWebsiteBuilder(path: string) {
  return path === "/website" || path.startsWith("/website/");
}

export function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  const portal = portalTitle(user?.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const courseChrome = isCourseChrome(location.pathname);
  const websiteBuilder = isWebsiteBuilder(location.pathname);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (websiteBuilder) {
    return (
      <div className="h-svh overflow-hidden bg-mist">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-mist">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 flex-col bg-navy text-white ${
          menuOpen ? "flex" : "hidden"
        } sm:flex`}
      >
        <SidebarBrand />
        <SidebarNav onNavigate={() => setMenuOpen(false)} />
        <div className="px-3 pb-4">
          <a
            href="mailto:support@niyamstack.com"
            className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4 4h16v12H5.2L4 17.2V4Zm2 4.4 6 3.6 6-3.6V6H6v2.4Z" />
            </svg>
            Email support
          </a>
        </div>
      </aside>
      <div className="min-w-0 sm:pl-60">
        {(user?.accessStatus === "DEMO" || user?.accessStatus === "PENDING_APPROVAL") && (
          <div className="bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
            {user.accessStatus === "DEMO"
              ? "This is a demo workspace. Subscribe, then Niyamstack will activate live rights for your institute."
              : "Payment received. Waiting for Niyamstack to activate your institute."}
          </div>
        )}
        {courseChrome ? (
          <div className="flex items-center px-4 py-2 sm:hidden">
            <button
              type="button"
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm"
              onClick={() => setMenuOpen(true)}
            >
              Menu
            </button>
          </div>
        ) : (
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
                  <p className="text-xs text-slate-500">{portal.name}</p>
                </div>
              </div>
              <UserMenu />
            </div>
          </header>
        )}
        <main className={courseChrome ? "min-w-0 overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6" : "min-w-0 overflow-x-hidden p-4 sm:p-6"}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
