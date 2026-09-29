import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";

type Providers = { google?: boolean; microsoft?: boolean };

type OauthSession = { token: string; user: unknown; returnTo?: string };

/** Shared Google / Microsoft buttons. Full navigation so OAuth redirects work. */
export function OauthButtons({
  surface,
  returnTo,
  slug,
}: {
  surface: "institute" | "storefront" | "platform";
  returnTo: string;
  slug?: string;
}) {
  const [providers, setProviders] = useState<Providers>({});

  useEffect(() => {
    api<Providers>("/api/auth/oauth/providers")
      .then(setProviders)
      .catch(() => setProviders({}));
  }, []);

  const google = !!providers.google;
  const microsoft = !!providers.microsoft;
  if (!google && !microsoft) {
    return null;
  }

  function start(provider: "google" | "microsoft") {
    const params = new URLSearchParams({ surface, returnTo });
    if (slug) params.set("slug", slug);
    window.location.href = `/api/auth/oauth/${provider}/start?${params.toString()}`;
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="relative my-2 text-center text-xs text-slate-400">
        <span className="absolute inset-x-0 top-1/2 border-t border-line" />
        <span className="relative bg-white px-2">Or continue with</span>
      </div>
      {google && (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-white py-2.5 text-sm font-medium text-navy hover:bg-mist"
          onClick={() => start("google")}
        >
          <GoogleIcon />
          Google
        </button>
      )}
      {microsoft && (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-white py-2.5 text-sm font-medium text-navy hover:bg-mist"
          onClick={() => start("microsoft")}
        >
          <MicrosoftIcon />
          Microsoft
        </button>
      )}
    </div>
  );
}

/** Completes ?oauth=ticket and surfaces ?oauth_error=. */
export function useOauthReturn(
  apply: (session: OauthSession) => void,
  onDone?: (returnTo?: string) => void,
): { oauthError: string | null; oauthBusy: boolean } {
  const [params, setParams] = useSearchParams();
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    const err = params.get("oauth_error");
    if (err) {
      setOauthError(err);
      const next = new URLSearchParams(params);
      next.delete("oauth_error");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    const ticket = params.get("oauth");
    if (!ticket || ran.current) return;
    ran.current = true;
    setOauthBusy(true);
    void api<OauthSession>("/api/auth/oauth/complete", {
      method: "POST",
      body: JSON.stringify({ ticket }),
    })
      .then((session) => {
        apply(session);
        const next = new URLSearchParams(params);
        next.delete("oauth");
        setParams(next, { replace: true });
        onDone?.(typeof session.returnTo === "string" ? session.returnTo : undefined);
      })
      .catch((e) => {
        setOauthError((e as Error).message || "Could not complete sign-in");
        const next = new URLSearchParams(params);
        next.delete("oauth");
        setParams(next, { replace: true });
      })
      .finally(() => setOauthBusy(false));
  }, [params, setParams, apply, onDone]);

  return { oauthError, oauthBusy };
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l.1.1 6.2 5.2C39.2 37.3 44 33 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#00a4ef" d="M12 1h10v10H12z" />
      <path fill="#7fba00" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}
