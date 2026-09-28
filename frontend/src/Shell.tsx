import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { NiyamstackLogo } from "./brand/NiyamstackLogo";
import { labelKey, useLocale } from "./locale";
import { isNavGroup, navForRole, portalTitle, canOpen, type NavGroup } from "./portals";
import { UserMenu } from "./UserMenu";
import { UnifiedSearch } from "./UnifiedSearch";

function LocaleToggle() {
  const { locale, setLocale, error, clearError } = useLocale();
  return (
    <div className="space-y-1">
      <select
        className="w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-slate-300"
        value={locale}
        onChange={(e) => {
          void setLocale(e.target.value);
        }}
      >
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
      </select>
      {error && (
        <p className="px-1 text-[11px] text-amber-300">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}

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
  const { t } = useLocale();
  const location = useLocation();
  const nav = navForRole(user?.role, user?.modules, user?.capabilities);
  const groups = nav.filter(isNavGroup);
  const routeGroup = groups.find((group) => groupContainsPath(group, location.pathname))?.label ?? groups[0]?.label ?? "";
  const [openGroup, setOpenGroup] = useState(routeGroup);

  useEffect(() => {
    const match = groups.find((group) => groupContainsPath(group, location.pathname));
    if (match) setOpenGroup(match.label);
  }, [location.pathname]);

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
              {t(labelKey(entry.label), entry.label)}
            </NavLink>
          );
        }
        const active = groupContainsPath(entry, location.pathname);
        const open = openGroup === entry.label;
        return (
          <div key={entry.label} className="pt-2">
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs font-semibold ${
                active ? "text-white" : "text-slate-400 hover:text-white"
              }`}
              aria-expanded={open}
              onClick={() => setOpenGroup(entry.label)}
            >
              {t(labelKey(entry.label), entry.label)}
              <span className="text-[10px] opacity-70">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
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
                    {t(labelKey(item.label), item.label)}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBrand() {
  const { user } = useAuth();
  const { t } = useLocale();
  const portal = portalTitle(user?.role);
  const name = !user?.role || user.role === "OWNER" ? t("my_institute", portal.name) : portal.name;
  const blurb = !user?.role || user.role === "OWNER" ? t("grow_and_run", portal.blurb) : portal.blurb;
  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-3">
        <NiyamstackLogo variant="icon" />
        <div>
          <p className="text-sm font-bold leading-tight">Niyamstack</p>
          <p className="text-[10px] tracking-[0.2em] text-sky-300">PROPEL</p>
        </div>
      </div>
      <p className="mt-5 text-xl font-bold">{name}</p>
      <p className="mt-1 text-xs text-slate-300">{blurb}</p>
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
  const { t } = useLocale();
  const location = useLocation();
  const portal = portalTitle(user?.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [subscribeMessage, setSubscribeMessage] = useState<string | null>(null);
  const courseChrome = isCourseChrome(location.pathname);
  const websiteBuilder = isWebsiteBuilder(location.pathname);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onSubscribe(ev: Event) {
      const detail = (ev as CustomEvent<string>).detail;
      setSubscribeMessage(typeof detail === "string" && detail.trim() ? detail : null);
      setSubscribeOpen(true);
    }
    window.addEventListener("propel:subscribe-required", onSubscribe);
    return () => window.removeEventListener("propel:subscribe-required", onSubscribe);
  }, []);

  const access = user?.accessStatus;
  const lockTitle =
    access === "PENDING_APPROVAL"
      ? t("pending_title", "Waiting for activation")
      : access === "SUSPENDED"
        ? t("suspended_title", "Institute suspended")
        : t("subscribe_title", "Demo workspace");
  const lockBody =
    subscribeMessage ||
    (access === "PENDING_APPROVAL"
      ? t(
          "pending_body",
          "Payment was received. You can browse menus; saving stays locked until Niyamstack activates your institute.",
        )
      : access === "SUSPENDED"
        ? t("suspended_body", "This institute is suspended. Contact Niyamstack to restore access.")
        : t(
            "subscribe_body",
            "You can browse every menu in this demo workspace. Saving and selling stay locked until you subscribe and Niyamstack activates the institute.",
          ));

  const subscribeModal = subscribeOpen ? (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setSubscribeOpen(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-navy">{lockTitle}</h2>
        <p className="mt-2 text-sm text-slate-600">{lockBody}</p>
        <button type="button" className="mt-5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => setSubscribeOpen(false)}>
          {t("ok", "OK")}
        </button>
      </div>
    </div>
  ) : null;

  if (websiteBuilder) {
    return (
      <div className="h-svh overflow-hidden bg-mist">
        {subscribeModal}
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
        <div className="space-y-2 px-3 pb-4">
          {canOpen(user?.role, "/support", user?.modules, user?.capabilities) && (
            <NavLink
              to="/support"
              className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M4 4h16v12H5.2L4 17.2V4Zm2 4.4 6 3.6 6-3.6V6H6v2.4Z" />
              </svg>
              {t("email_support", "Support")}
            </NavLink>
          )}
          {canOpen(user?.role, "/help", user?.modules, user?.capabilities) && (
            <NavLink to="/help" className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
              {t("help_center", "Help center")}
            </NavLink>
          )}
          <LocaleToggle />
        </div>
      </aside>
      <div className="min-w-0 sm:pl-60">
        {(user?.accessStatus === "DEMO" || user?.accessStatus === "PENDING_APPROVAL" || user?.accessStatus === "SUSPENDED") && (
          <div className={`px-4 py-2 text-sm sm:px-6 ${user.accessStatus === "SUSPENDED" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
            {user.accessStatus === "DEMO"
              ? t("demo_banner", "This is a demo workspace. You can open every menu. Saving and other live actions need a paid subscription.")
              : user.accessStatus === "SUSPENDED"
                ? t("suspended_banner", "This institute is suspended. Contact Niyamstack to restore access.")
                : t("pending_banner", "Payment received. Waiting for Niyamstack to activate your institute.")}
          </div>
        )}
        {user?.role === "STUDENT" && user.orgSlug && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-50 px-4 py-2 text-sm text-sky-950 sm:px-6">
            <p>
              {t(
                "student_storefront_banner",
                "Your student site is the best place to learn, pay fees, and apply for jobs. Institute menus below still work if you need them.",
              )}
            </p>
            <a className="shrink-0 font-semibold text-brand underline" href={`/s/${user.orgSlug}/learn`}>
              {t("open_student_site", "Open student site")}
            </a>
          </div>
        )}
        {courseChrome ? (
          <div className="flex items-center justify-between gap-3 px-4 py-2 sm:hidden">
            <button
              type="button"
              className="rounded-lg border border-line px-2.5 py-1.5 text-sm"
              onClick={() => setMenuOpen(true)}
            >
              {t("menu", "Menu")}
            </button>
            <UserMenu />
          </div>
        ) : (
          <header className="border-b border-line bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-line px-2.5 py-1.5 text-sm sm:hidden"
                  onClick={() => setMenuOpen(true)}
                >
                  {t("menu", "Menu")}
                </button>
                <div className="min-w-0 sm:hidden">
                  <p className="text-xs text-slate-500">{portal.name}</p>
                </div>
                <UnifiedSearch />
              </div>
              <UserMenu />
            </div>
          </header>
        )}
        <main className={courseChrome ? "min-w-0 overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6" : "min-w-0 overflow-x-hidden p-4 sm:p-6"}>
          {!user ? <p className="text-sm text-slate-500">Loading…</p> : <Outlet />}
        </main>
      </div>
      {subscribeModal}
    </div>
  );
}
