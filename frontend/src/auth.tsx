import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
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
};

type SessionResponse = { token: string; user: SessionUser };

type AuthState = {
  token: string | null;
  user: SessionUser | null;
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

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
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
    [token, user]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
