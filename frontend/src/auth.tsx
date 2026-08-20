import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  organizationId: string;
  packageTier: string;
  accessStatus?: string;
  orgSlug?: string;
  orgName?: string;
};

type SessionResponse = { token: string; user: SessionUser };

type AuthState = {
  token: string | null;
  user: SessionUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithOtp: (phone: string, otp: string) => Promise<void>;
  applySession: (res: SessionResponse) => void;
  logout: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(getToken());
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = localStorage.getItem("propel.user");
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  });
  const [ready, setReady] = useState(() => !getToken());

  useEffect(() => {
    function expire() {
      setToken(null);
      localStorage.removeItem("propel.user");
      setTok(null);
      setUser(null);
    }
    window.addEventListener("propel:unauthorized", expire);
    return () => window.removeEventListener("propel:unauthorized", expire);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    api("/api/me")
      .catch(() => {
        /* api() expires a dead session */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      ready,
      applySession(res: SessionResponse) {
        setToken(res.token);
        localStorage.setItem("propel.user", JSON.stringify(res.user));
        setTok(res.token);
        setUser(res.user);
      },
      async login(email, password) {
        const res = await api<SessionResponse>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setToken(res.token);
        localStorage.setItem("propel.user", JSON.stringify(res.user));
        setTok(res.token);
        setUser(res.user);
      },
      async loginWithOtp(phone, otp) {
        const res = await api<SessionResponse>("/api/auth/otp/verify", {
          method: "POST",
          body: JSON.stringify({ phone, otp }),
        });
        setToken(res.token);
        localStorage.setItem("propel.user", JSON.stringify(res.user));
        setTok(res.token);
        setUser(res.user);
      },
      logout() {
        setToken(null);
        localStorage.removeItem("propel.user");
        setTok(null);
        setUser(null);
      },
    }),
    [token, user, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
