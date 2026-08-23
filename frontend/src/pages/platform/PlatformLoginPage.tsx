import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { NiyamstackLogo } from "../../brand/NiyamstackLogo";
import { clearInstituteSession } from "../../api";
import { usePlatformAuth } from "../../platformAuth";

export function PlatformLoginPage() {
  const { token, login } = usePlatformAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    clearInstituteSession();
    window.dispatchEvent(new Event("propel:unauthorized"));
  }, []);

  if (token) return <Navigate to="/platform" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh">
      <aside className="relative hidden w-[48%] overflow-hidden bg-[#05070c] lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-brand/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
          <NiyamstackLogo variant="lockup" />
          <p className="mt-10 max-w-md text-3xl font-bold leading-tight text-white xl:text-4xl">
            Niyamstack operations.
          </p>
          <p className="mt-4 max-w-md text-base text-slate-300">
            Approve institutes, set each customer’s price, and run the platform. This door is not for institutes.
          </p>
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center bg-white px-6 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <NiyamstackLogo />
          </div>
          <h1 className="text-2xl font-bold text-navy">Platform login</h1>
          <p className="mt-2 text-sm text-slate-500">Niyamstack staff sign in here. There is no public signup on this door.</p>
          <form className="mt-8" onSubmit={onSubmit}>
            <label className="block text-sm font-medium text-navy">
              Id
              <input
                className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:border-brand"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-navy">
              Password
              <input
                className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:border-brand"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <button className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy}>
              {busy ? "Signing in…" : "Login"}
            </button>
          </form>
          <p className="mt-8 text-center text-xs text-slate-400">Change this password under Settings after you sign in.</p>
          {import.meta.env.DEV && (
            <p className="mt-6 text-center text-[11px] text-slate-400">Developer: id admin, password admin</p>
          )}
        </div>
      </main>
    </div>
  );
}
