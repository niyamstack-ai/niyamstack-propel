import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { api, getPlatformToken, setPlatformToken } from "./api";

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  capabilities?: string[];
};

type SessionResponse = { token: string; user: PlatformUser };

type PlatformAuthState = {
  token: string | null;
  user: PlatformUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const Ctx = createContext<PlatformAuthState | null>(null);
const USER_KEY = "propel.platform.user";

export function hasCap(user: PlatformUser | null | undefined, cap: string) {
  if (!user) return false;
  if (user.role === "PLATFORM_OWNER") return true;
  return (user.capabilities ?? []).includes(cap);
}

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(getPlatformToken());
  const [user, setUser] = useState<PlatformUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PlatformUser) : null;
  });

  const value = useMemo<PlatformAuthState>(
    () => ({
      token,
      user,
      async login(username, password) {
        const res = await api<SessionResponse>("/api/platform/login", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        setPlatformToken(res.token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        setTok(res.token);
        setUser(res.user);
      },
      logout() {
        setPlatformToken(null);
        localStorage.removeItem(USER_KEY);
        setTok(null);
        setUser(null);
      },
    }),
    [token, user]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlatformAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("PlatformAuthProvider missing");
  return ctx;
}
