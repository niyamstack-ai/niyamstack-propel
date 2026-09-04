import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

type LocaleBundle = { locale?: string; dictionary?: Record<string, string> };

type LocaleContextValue = {
  locale: string;
  setLocale: (next: string) => Promise<void>;
  t: (key: string, fallback?: string) => string;
  loading: boolean;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: async () => undefined,
  t: (_key, fallback = "") => fallback,
  loading: false,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const [locale, setLocaleState] = useState("en");
  const [dictionary, setDictionary] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !user) {
      setLocaleState("en");
      setDictionary({});
      return;
    }
    setLoading(true);
    void api<LocaleBundle>("/api/actions/locale")
      .then((r) => {
        setLocaleState(r.locale ?? "en");
        setDictionary(r.dictionary ?? {});
      })
      .catch(() => {
        setLocaleState("en");
        setDictionary({});
        window.alert("Could not load language pack — showing English.");
      })
      .finally(() => setLoading(false));
  }, [token, user?.id]);

  const setLocale = useCallback(async (next: string) => {
    const prev = locale;
    setLocaleState(next);
    try {
      const r = await api<LocaleBundle>("/api/actions/locale", {
        method: "POST",
        body: JSON.stringify({ locale: next }),
      });
      setLocaleState(r.locale ?? next);
      setDictionary(r.dictionary ?? {});
    } catch (e) {
      setLocaleState(prev);
      window.alert((e as Error).message || "Could not save language preference");
    }
  }, [locale]);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const hit = dictionary[key];
      if (hit) return hit;
      return fallback ?? key;
    },
    [dictionary],
  );

  const value = useMemo(() => ({ locale, setLocale, t, loading }), [locale, setLocale, t, loading]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Map common English UI labels to dictionary keys. */
export function labelKey(label: string) {
  const map: Record<string, string> = {
    Dashboard: "dashboard",
    Grow: "grow",
    Website: "website",
    "Your App": "your_app",
    "Mobile apps": "mobile_apps",
    "Landing Pages": "landing_pages",
    Campaigns: "campaigns",
    Courses: "courses",
    Tests: "tests",
    LMS: "lms",
    Academics: "academics",
    People: "people",
    Students: "students",
    Staff: "staff",
    Employees: "employees",
    Alumni: "alumni",
    ESS: "ess",
    Admissions: "admissions",
    Money: "money",
    Fees: "fees",
    Analytics: "analytics",
    Intelligence: "intelligence",
    Enterprise: "enterprise",
    Compliance: "compliance",
    "Scale depth": "scale",
    Placements: "placements",
    Placement: "placement",
    Readiness: "readiness",
    Communicate: "communicate",
    Notices: "notices",
    Chats: "chats",
    "1:1 Sessions": "one_to_one",
    Support: "support",
    Help: "help",
    Settings: "settings",
    Institute: "institute",
    "Activity log": "activity_log",
    Integrations: "integrations",
    "License map": "license_map",
    "Email support": "email_support",
    "Help center": "help_center",
    "Get started": "get_started",
    "Create a course": "create_course",
    "Invite staff": "invite_staff",
    "Publish website": "publish_website",
    "Institute profile": "institute_profile",
    "Add a center": "add_center",
    Open: "open",
    "My home": "my_home",
    Leads: "leads",
    "Drives & ATS": "drives",
    "My child": "my_child",
    Home: "home",
  };
  return map[label] || label.toLowerCase().replace(/\s+/g, "_");
}
