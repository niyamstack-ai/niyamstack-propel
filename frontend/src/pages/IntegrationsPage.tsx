import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { createRecord, updateRecord } from "../ops";
import { Card, ErrorText, Field, PrimaryButton, useApi } from "../ui";

type Connection = { id: string; provider: string; status: string; configJson?: string };
type Channel = { provider?: string; live?: boolean; mode?: string; meaning?: string };
type Gateway = {
  payments?: Channel;
  whatsapp?: Channel;
  meetings?: Channel;
  mail?: Channel;
  storage?: Channel;
  note?: string;
};

const CATALOG = [
  { provider: "FACEBOOK_PIXEL", name: "Facebook Pixel", blurb: "Measure website visitors. Paste your Pixel ID.", field: "Pixel ID" },
  { provider: "GOOGLE_ANALYTICS", name: "Google Analytics", blurb: "Measure website visitors. Paste your Measurement ID (G-…).", field: "Measurement ID" },
  { provider: "GOOGLE_ADS", name: "Google Ads", blurb: "Conversion tracking for ads. Paste your conversion ID.", field: "Conversion ID" },
  { provider: "WEBHOOKS", name: "Webhooks", blurb: "Send lead and payment events to another app. Paste the HTTPS URL.", field: "Webhook URL" },
  { provider: "ZOOM", name: "Zoom", blurb: "Optional. Leave class URLs blank and Propel opens a Jitsi room. Paste a Zoom or Meet link only if you already have one.", field: "Account email" },
];

function ModeBadge({ channel, fallbackLive }: { channel?: Channel; fallbackLive?: boolean }) {
  const live = channel?.live ?? !!fallbackLive;
  const mode = (channel?.mode || (live ? "LIVE" : "DEMO")).toUpperCase();
  if (mode === "LIVE" || live) {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Live</span>;
  }
  if (mode === "BUILT_IN") {
    return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">Built-in</span>;
  }
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Demo</span>;
}

function ChannelTitle({ title, channel, fallbackLive }: { title: string; channel?: Channel; fallbackLive?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{title}</span>
      <ModeBadge channel={channel} fallbackLive={fallbackLive} />
    </div>
  );
}

export function IntegrationsPage() {
  const connections = useApi<Connection[]>("/api/integration-connections");
  const gateway = useApi<Gateway>("/api/actions/integrations");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState({
    whatsappToken: "",
    whatsappPhoneId: "",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    gstState: "",
    invoiceSeries: "INV",
  });
  const [keyStatus, setKeyStatus] = useState<{ razorpay?: boolean; whatsapp?: boolean; smtp?: boolean; webhook?: boolean } | null>(null);

  useEffect(() => {
    api<typeof keyStatus & { gstState?: string; invoiceSeries?: string; smtpHost?: string; smtpPort?: string; smtpUser?: string; smtpFrom?: string }>(
      "/api/actions/live-keys"
    )
      .then((row) => {
        setKeyStatus(row);
        setKeys((prev) => ({
          ...prev,
          gstState: row.gstState || "",
          invoiceSeries: row.invoiceSeries || "INV",
          smtpHost: row.smtpHost || "",
          smtpPort: row.smtpPort || "587",
          smtpUser: row.smtpUser || "",
          smtpFrom: row.smtpFrom || "",
        }));
      })
      .catch((e) => setError((e as Error).message || "Could not load live keys"));
  }, []);

  const byProvider = useMemo(() => {
    const map = new Map<string, Connection>();
    (connections.data ?? []).forEach((c) => map.set(c.provider, c));
    return map;
  }, [connections.data]);

  async function save(provider: string) {
    setError(null);
    setNotice(null);
    try {
      const raw = (values[provider] || "").trim();
      if (raw) {
        if (provider === "WEBHOOKS" && !/^https:\/\//i.test(raw)) {
          throw new Error("Webhook URL must start with https://");
        }
        if (provider === "GOOGLE_ANALYTICS" && !/^G-[A-Z0-9]+$/i.test(raw)) {
          throw new Error("Google Analytics ID should look like G-XXXXXXXX");
        }
        if (provider === "FACEBOOK_PIXEL" && !/^\d{5,}$/.test(raw)) {
          throw new Error("Facebook Pixel ID should be a numeric ID");
        }
      }
      const existing = byProvider.get(provider);
      const configJson = JSON.stringify({ value: raw });
      if (existing) {
        await updateRecord(`/api/integration-connections/${existing.id}`, {
          ...existing,
          status: raw ? "CONNECTED" : "NOT_CONNECTED",
          configJson,
        });
      } else {
        await createRecord("/api/integration-connections", {
          provider,
          status: raw ? "CONNECTED" : "NOT_CONNECTED",
          configJson,
        });
      }
      connections.reload();
      setNotice(raw ? "Integration saved." : "Integration cleared (not connected).");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const g = gateway.data;
  const paymentsLive = !!(g?.payments?.live || keyStatus?.razorpay);
  const whatsappLive = !!(g?.whatsapp?.live || keyStatus?.whatsapp);
  const mailLive = !!(g?.mail?.live || keyStatus?.smtp);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Integrations</h1>
        <p className="text-sm text-slate-500">Paste WhatsApp and SMTP keys here. Payments use Niyamstack Razorpay configured in Platform Settings.</p>
      </div>
      <div className="rounded-2xl border border-line bg-white px-4 py-3 text-sm text-slate-600">
        <p className="font-medium text-navy">How to read the badges</p>
        <p className="mt-1">
          <span className="font-semibold text-emerald-800">Live</span> = real provider connected.{" "}
          <span className="font-semibold text-amber-900">Demo</span> = works for testing without external keys.{" "}
          <span className="font-semibold text-sky-800">Built-in</span> = Propel’s own room/storage (still usable). Features stay available in every mode.
        </p>
        {g?.note && <p className="mt-2 text-xs text-slate-500">{g.note}</p>}
      </div>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<ChannelTitle title="Payments (Razorpay / UPI)" channel={g?.payments} fallbackLive={paymentsLive} />}>
          <p className="text-sm text-slate-500">
            {paymentsLive
              ? `Live via ${g?.payments?.provider || "razorpay"}. Collect and checkout create a Razorpay order through Niyamstack.`
              : "Demo mode: payments are managed by Niyamstack. Until platform Razorpay keys are saved, Collect only records the fee in Propel."}
          </p>
          {g?.payments?.meaning && <p className="mt-2 text-xs text-slate-400">{g.payments.meaning}</p>}
          <p className="mt-2 text-xs text-slate-500">
            Institute owners cannot set gateway keys. Niyamstack configures Razorpay once for this portal under Platform → Settings.
          </p>
        </Card>
        <Card title={<ChannelTitle title="WhatsApp" channel={g?.whatsapp} fallbackLive={whatsappLive} />}>
          <p className="text-sm text-slate-500">
            {whatsappLive
              ? "Live: Cloud API keys are saved. Receipts go to the student mobile."
              : "Demo: paste the WhatsApp Cloud API token and phone number ID to go live. Until then, messages are queued in Propel only."}
          </p>
          {g?.whatsapp?.meaning && <p className="mt-2 text-xs text-slate-400">{g.whatsapp.meaning}</p>}
          <div className="mt-3 space-y-3">
            <Field label="Token" value={keys.whatsappToken} onChange={(v) => setKeys((p) => ({ ...p, whatsappToken: v }))} type="password" />
            <Field label="Phone number ID" value={keys.whatsappPhoneId} onChange={(v) => setKeys((p) => ({ ...p, whatsappPhoneId: v }))} />
          </div>
          <div className="mt-3">
            <PrimaryButton
              onClick={() =>
                void (async () => {
                  setError(null);
                  setNotice(null);
                  try {
                    const saved = await api<typeof keyStatus>("/api/actions/live-keys", {
                      method: "PUT",
                      body: JSON.stringify(keys),
                    });
                    setKeyStatus(saved);
                    gateway.reload();
                    setNotice("WhatsApp keys saved.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                })()
              }
            >
              Save WhatsApp keys
            </PrimaryButton>
          </div>
        </Card>
        <Card title={<ChannelTitle title="Email (SMTP)" channel={g?.mail} fallbackLive={mailLive} />}>
          <p className="text-sm text-slate-500">
            {mailLive
              ? "Live: SMTP is saved for institute notices."
              : "Demo: paste Gmail app password or your SMTP host. Login OTP still uses Niyamstack mail if configured on the server."}
          </p>
          {g?.mail?.meaning && <p className="mt-2 text-xs text-slate-400">{g.mail.meaning}</p>}
          <div className="mt-3 space-y-3">
            <Field label="SMTP host" value={keys.smtpHost} onChange={(v) => setKeys((p) => ({ ...p, smtpHost: v }))} placeholder="smtp.gmail.com" />
            <Field label="Port" value={keys.smtpPort} onChange={(v) => setKeys((p) => ({ ...p, smtpPort: v }))} />
            <Field label="Username" value={keys.smtpUser} onChange={(v) => setKeys((p) => ({ ...p, smtpUser: v }))} />
            <Field label="Password" value={keys.smtpPass} onChange={(v) => setKeys((p) => ({ ...p, smtpPass: v }))} type="password" />
            <Field label="From address" value={keys.smtpFrom} onChange={(v) => setKeys((p) => ({ ...p, smtpFrom: v }))} />
          </div>
          <div className="mt-3">
            <PrimaryButton
              onClick={() =>
                void (async () => {
                  setError(null);
                  setNotice(null);
                  try {
                    const saved = await api<typeof keyStatus>("/api/actions/live-keys", {
                      method: "PUT",
                      body: JSON.stringify(keys),
                    });
                    setKeyStatus(saved);
                    gateway.reload();
                    setNotice("Email (SMTP) settings saved.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                })()
              }
            >
              Save email (SMTP)
            </PrimaryButton>
          </div>
        </Card>
        <Card title="GST on invoices">
          <p className="text-sm text-slate-500">Used for CGST/SGST vs IGST and invoice numbers. Always available — not a third-party connection.</p>
          <div className="mt-3 space-y-3">
            <Field label="Your GST state" value={keys.gstState} onChange={(v) => setKeys((p) => ({ ...p, gstState: v }))} placeholder="Maharashtra" />
            <Field label="Invoice series" value={keys.invoiceSeries} onChange={(v) => setKeys((p) => ({ ...p, invoiceSeries: v }))} placeholder="INV" />
          </div>
          <div className="mt-3">
            <PrimaryButton
              onClick={() =>
                void (async () => {
                  setError(null);
                  setNotice(null);
                  try {
                    const saved = await api<typeof keyStatus>("/api/actions/live-keys", {
                      method: "PUT",
                      body: JSON.stringify(keys),
                    });
                    setKeyStatus(saved);
                    gateway.reload();
                    setNotice("GST invoice settings saved.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                })()
              }
            >
              Save GST settings
            </PrimaryButton>
          </div>
        </Card>
        <Card title={<ChannelTitle title="Meetings" channel={g?.meetings} />}>
          <p className="text-sm text-slate-500">
            {g?.meetings?.live
              ? `Live via ${g.meetings.provider}.`
              : "Built-in: schedule a live class or 1:1 and Propel opens a Jitsi room. Paste a Zoom or Meet URL if you already have one."}
          </p>
          {g?.meetings?.meaning && <p className="mt-2 text-xs text-slate-400">{g.meetings.meaning}</p>}
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {CATALOG.map((item) => {
          const conn = byProvider.get(item.provider);
          let saved = "";
          try {
            saved = JSON.parse(conn?.configJson || "{}").value || "";
          } catch {
            saved = "";
          }
          const connected = conn?.status === "CONNECTED" && !!saved;
          return (
            <Card key={item.provider} title={item.name}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm text-slate-500">{item.blurb}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                  {connected ? "Saved" : "Not connected"}
                </span>
              </div>
              <div className="mt-3">
                <Field
                  label={item.field}
                  value={values[item.provider] ?? saved}
                  onChange={(v) => setValues((prev) => ({ ...prev, [item.provider]: v }))}
                />
              </div>
              <div className="mt-3">
                <PrimaryButton onClick={() => void save(item.provider)}>Save</PrimaryButton>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
