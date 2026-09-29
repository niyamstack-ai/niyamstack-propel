import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api, clearPlatformSession } from "../api";
import { useAuth, type SessionUser } from "../auth";
import { OauthButtons, useOauthReturn } from "../oauth";
import { PACKS, type PackId } from "../packs";
import { NiyamstackLogo } from "../brand/NiyamstackLogo";
import { PhoneField, phoneForApi } from "../PhoneField";

type OtpSent = { status: string; phone?: string; emailMasked?: string; channel?: string; devOtp?: string };
type EmailSent = { status: string; resetToken?: string };

export function LoginPage() {
  return <AuthGate><LoginViews /></AuthGate>;
}

export function SignupPage() {
  return <AuthGate><SignupView /></AuthGate>;
}

export function ForgotPage() {
  return (
    <AuthGate>
      <ForgotView />
    </AuthGate>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { token, user, ready } = useAuth();
  useEffect(() => {
    clearPlatformSession();
    window.dispatchEvent(new Event("propel:platform-unauthorized"));
  }, []);
  if (!ready) return <p className="p-6 text-sm text-slate-500">Loading…</p>;
  if (token && user?.role === "STUDENT") {
    return <Navigate to={user.orgSlug ? `/s/${user.orgSlug}/learn` : "/m"} replace />;
  }
  if (token) return <Navigate to="/" replace />;
  return <AuthShell>{children}</AuthShell>;
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh">
      <aside className="relative hidden w-[48%] overflow-hidden bg-[#05070c] lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-brand/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12 xl:px-16">
          <NiyamstackLogo variant="lockup" />
          <h2 className="mt-10 max-w-md text-3xl font-bold leading-tight text-white xl:text-4xl">
            Run your institute from one portal.
          </h2>
          <p className="mt-4 max-w-md text-base text-slate-300">
            Owners work in this portal. Students log in on your institute website after you connect a domain.
          </p>
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center bg-white px-6 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <NiyamstackLogo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function LoginViews() {
  const [params] = useSearchParams();
  const emailMode = params.get("method") === "email";
  const { applySession } = useAuth();
  const { oauthError, oauthBusy } = useOauthReturn((session) => {
    applySession(session as { token: string; user: SessionUser });
  });
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  useEffect(() => {
    try {
      const reason = sessionStorage.getItem("propel.logoutReason");
      if (reason) {
        setLogoutReason(reason);
        sessionStorage.removeItem("propel.logoutReason");
      }
    } catch {
      /* ignore */
    }
  }, []);
  if (oauthBusy) {
    return <p className="text-sm text-slate-500">Completing sign-in…</p>;
  }
  return (
    <>
      {logoutReason === "suspended" && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          This institute is suspended, so the session was ended. Contact Niyamstack to restore access, then sign in again.
        </p>
      )}
      {oauthError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{oauthError}</p>
      )}
      {emailMode ? <EmailLoginView /> : <OtpLoginView />}
    </>
  );
}

function OtpLoginView() {
  const { loginWithOtp, applySession } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  /** Normalized phone used for the OTP challenge — must match verify. */
  const [otpPhone, setOtpPhone] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestOtp(digits: string) {
    const res = await api<OtpSent>("/api/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone: digits }),
    });
    setOtpPhone(digits);
    setOtp("");
    setSent(res);
    setError(null);
    return res;
  }

  async function loginPassword(e: FormEvent) {
    e.preventDefault();
    const digits = phoneForApi(phone);
    if (digits.length < 8) {
      setError("Enter a valid mobile number");
      return;
    }
    if (!password) {
      setError("Enter your password, or tap OTP on mail");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: unknown }>("/api/auth/login/phone", {
        method: "POST",
        body: JSON.stringify({ phone: digits, password }),
      });
      applySession(res as never);
    } catch (err) {
      const msg = (err as Error).message || "";
      // Unverified email → send OTP and switch to code entry (do not leave them looping on password).
      if (/verify your email|otp on mail/i.test(msg)) {
        try {
          await requestOtp(digits);
          setError(null);
        } catch (otpErr) {
          setError((otpErr as Error).message || msg);
        }
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    const digits = phoneForApi(phone);
    if (digits.length < 8) {
      setError("Enter a valid mobile number");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestOtp(digits);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const digits = otpPhone || phoneForApi(phone);
    if (!otp.trim()) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginWithOtp(digits, otp.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">Login</h1>
      <p className="mt-2 text-sm text-slate-500">Institute owners sign in here. Students should open your institute website, not this page.</p>
      {!sent ? (
        <form className="mt-8" onSubmit={loginPassword}>
          <PhoneField label="Mobile" value={phone} onChange={setPhone} required />
          <label className="mt-4 block text-sm font-medium text-navy">Password</label>
          <PasswordField value={password} onChange={setPassword} />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy}>
            {busy ? "Signing in…" : "Login"}
          </button>
          <button type="button" className="mt-3 w-full text-sm font-medium text-brand disabled:opacity-60" disabled={busy} onClick={() => void sendOtp()}>
            OTP on mail
          </button>
        </form>
      ) : (
        <form className="mt-8" onSubmit={verify}>
          <p className="text-sm text-slate-600">
            Enter the 6-digit code we sent to <span className="font-medium text-navy">{sent.emailMasked || "your email"}</span>.
            This also verifies your email so password login works next time.
          </p>
          {sent.devOtp && <p className="mt-1 text-xs text-slate-400">Local OTP: {sent.devOtp}</p>}
          <label className="mt-4 block text-sm font-medium text-navy">OTP</label>
          <input
            className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 tracking-[0.4em] outline-none focus:border-brand"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy || otp.length < 6}>
            {busy ? "Signing in…" : "Verify & login"}
          </button>
          <button
            type="button"
            className="mt-3 w-full text-sm text-brand disabled:opacity-60"
            disabled={busy}
            onClick={() => void sendOtp()}
          >
            Resend code
          </button>
          <button
            type="button"
            className="mt-2 w-full text-sm text-slate-500"
            onClick={() => {
              setSent(null);
              setOtp("");
              setOtpPhone("");
              setError(null);
            }}
          >
            Back
          </button>
        </form>
      )}
      {!sent && <OauthButtons surface="institute" returnTo="/" />}
      <OrLine />
      <Link className="block text-center text-sm font-medium text-brand" to="/login?method=email">
        Login via Email
      </Link>
      <p className="mt-6 text-center text-sm text-slate-500">
        New institute?{" "}
        <Link className="font-medium text-brand" to="/signup">
          Create your institute
        </Link>
      </p>
      <Legal />
      <DevHint />
    </div>
  );
}

function EmailLoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">Login with email</h1>
      <p className="mt-2 text-sm text-slate-500">Use the email and password for your institute account.</p>
      <form className="mt-8" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-navy">
          Email
          <input className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:border-brand" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mt-4 block text-sm font-medium text-navy">
          Password
          <PasswordField value={password} onChange={setPassword} />
        </label>
        <div className="mt-2 text-right">
          <Link className="text-sm text-brand" to="/forgot">
            Forgot password?
          </Link>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy}>
          {busy ? "Signing in…" : "Login"}
        </button>
      </form>
      <OauthButtons surface="institute" returnTo="/" />
      <OrLine />
      <Link className="block text-center text-sm font-medium text-brand" to="/login">
        Login via Mobile
      </Link>
      <p className="mt-6 text-center text-sm text-slate-500">
        New institute?{" "}
        <Link className="font-medium text-brand" to="/signup">
          Create your institute
        </Link>
      </p>
      <Legal />
    </div>
  );
}

function SignupView() {
  const { applySession } = useAuth();
  const [instituteName, setInstituteName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [productPack, setProductPack] = useState<PackId>("FULL_OPS");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createInstitute(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<OtpSent>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ instituteName, fullName, email, phone: phoneForApi(phone), password, productPack }),
      });
      setSent(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: SessionUser }>("/api/auth/signup/verify", {
        method: "POST",
        body: JSON.stringify({ phone: phoneForApi(phone), otp }),
      });
      applySession(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">Create your institute</h1>
      <p className="mt-2 text-sm text-slate-500">We verify your email before creating the institute. Students later log in on your website.</p>
      {!sent ? (
        <form className="mt-6 space-y-3" onSubmit={createInstitute}>
          <Field label="Institute name" value={instituteName} onChange={setInstituteName} />
          <Field label="Your name" value={fullName} onChange={setFullName} />
          <PhoneField label="Mobile" value={phone} onChange={setPhone} required />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <Field label="Password" value={password} onChange={setPassword} type="password" />
          <Field label="Confirm password" value={confirm} onChange={setConfirm} type="password" />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-navy">Pack</legend>
            {PACKS.map((pack) => (
              <label key={pack.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="productPack"
                  checked={productPack === pack.id}
                  onChange={() => setProductPack(pack.id)}
                />
                <span>
                  <span className="block text-sm font-medium text-navy">{pack.name}</span>
                  <span className="block text-xs text-slate-500">{pack.blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-slate-400">Password must be 10+ characters with upper, lower, digit, and special character.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-60" disabled={busy}>
            {busy ? "Sending code…" : "Send email verification"}
          </button>
        </form>
      ) : (
        <form className="mt-6" onSubmit={verify}>
          <p className="text-sm text-slate-500">
            Enter the code sent to {sent.emailMasked || "your email"}. Your institute is created only after this step.
          </p>
          {sent.devOtp && <p className="mt-1 text-xs text-slate-400">Local OTP: {sent.devOtp}</p>}
          <label className="mt-4 block text-sm font-medium text-navy">OTP</label>
          <input className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 tracking-[0.4em]" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Creating…" : "Verify email & create institute"}
          </button>
          <button type="button" className="mt-3 w-full text-sm text-brand" disabled={busy} onClick={() => { setSent(null); setOtp(""); }}>
            Change details
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link className="font-medium text-brand" to="/login">
          Login
        </Link>
      </p>
      <Legal />
    </div>
  );
}

function ForgotView() {
  const [params] = useSearchParams();
  const linkToken = params.get("token") || "";
  const [method, setMethod] = useState<"otp" | "email">("email");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState<OtpSent | EmailSent | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (method === "otp") {
        const res = await api<OtpSent>("/api/auth/forgot/otp", { method: "POST", body: JSON.stringify({ phone: phoneForApi(phone) }) });
        setSent(res);
      } else {
        const res = await api<EmailSent>("/api/auth/forgot/email", { method: "POST", body: JSON.stringify({ email }) });
        setSent(res);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (linkToken) {
        await api("/api/auth/reset/email", { method: "POST", body: JSON.stringify({ token: linkToken, newPassword: password }) });
      } else {
        await api("/api/auth/reset/otp", { method: "POST", body: JSON.stringify({ phone: phoneForApi(phone), otp, newPassword: password }) });
      }
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-navy">Password updated</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in with your new password.</p>
        <Link className="mt-6 inline-block font-medium text-brand" to="/login?method=email">
          Back to login
        </Link>
      </div>
    );
  }

  if (linkToken) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-navy">Choose a new password</h1>
        <p className="mt-2 text-sm text-slate-500">This link expires in 30 minutes and can be used once.</p>
        <form className="mt-6 space-y-3" onSubmit={savePassword}>
          <Field label="New password" value={password} onChange={setPassword} type="password" />
          <Field label="Confirm password" value={confirm} onChange={setConfirm} type="password" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm">
          <Link className="text-brand" to="/login?method=email">
            Back to login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">Forgot password</h1>
      <p className="mt-2 text-sm text-slate-500">Reset with email or an OTP sent to the email on your account (mobile identifies your account).</p>
      <div className="mt-4 flex gap-2">
        <button type="button" className={`rounded-full px-3 py-1 text-sm ${method === "email" ? "bg-navy text-white" : "bg-mist"}`} onClick={() => { setMethod("email"); setSent(null); }}>
          Email
        </button>
        <button type="button" className={`rounded-full px-3 py-1 text-sm ${method === "otp" ? "bg-navy text-white" : "bg-mist"}`} onClick={() => { setMethod("otp"); setSent(null); }}>
          Mobile OTP
        </button>
      </div>
      {method === "email" && sent ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5">
          <h2 className="text-lg font-bold text-navy">Email sent</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Check your inbox for a message from Niyamstack. Click <span className="font-semibold">Reset password</span> in that email. The button expires in 30 minutes.
          </p>
          <button type="button" className="mt-4 text-sm font-medium text-brand" onClick={() => setSent(null)}>
            Use a different email
          </button>
        </div>
      ) : !sent ? (
        <form className="mt-6" onSubmit={requestReset}>
          {method === "otp" ? (
            <PhoneField label="Mobile" value={phone} onChange={setPhone} required />
          ) : (
            <Field label="Email" value={email} onChange={setEmail} type="email" />
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="mt-6 w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Sending…" : method === "otp" ? "Send OTP" : "Send reset link"}
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-3" onSubmit={savePassword}>
          {"devOtp" in sent && sent.devOtp && <p className="text-xs text-slate-400">Local OTP: {sent.devOtp}</p>}
          <Field label="OTP" value={otp} onChange={setOtp} />
          <Field label="New password" value={password} onChange={setPassword} type="password" />
          <Field label="Confirm password" value={confirm} onChange={setConfirm} type="password" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link className="text-brand" to="/login?method=email">
          Back to login
        </Link>
      </p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  const [show, setShow] = useState(false);
  const password = type === "password";
  return (
    <label className="block text-sm font-medium text-navy">
      {label}
      <span className="relative mt-1 block">
        <input
          className="w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-brand"
          type={password && show ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {password && (
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-brand" onClick={() => setShow((v) => !v)}>
            {show ? "Hide" : "Show"}
          </button>
        )}
      </span>
    </label>
  );
}

function OrLine() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
      <span className="h-px flex-1 bg-line" />
      Or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function Legal() {
  return (
    <p className="mt-8 text-center text-xs text-slate-400">
      By continuing you agree to our{" "}
      <Link className="text-brand" to="/legal/terms">
        Terms
      </Link>{" "}
      and{" "}
      <Link className="text-brand" to="/legal/privacy">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

function DevHint() {
  return null;
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative mt-1 block">
      <input
        className="w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:border-brand"
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-brand" onClick={() => setShow((v) => !v)}>
        {show ? "Hide" : "Show"}
      </button>
    </span>
  );
}
