import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { createRecord, updateRecord } from "../ops";
import { Card, ErrorText, Field, PrimaryButton, useApi } from "../ui";

type Connection = { id: string; provider: string; status: string; configJson?: string };
type Gateway = {
  payments?: { provider?: string; live?: boolean };
  whatsapp?: { provider?: string; live?: boolean };
  meetings?: { provider?: string; live?: boolean };
  mail?: { provider?: string; live?: boolean };
  note?: string;
};

const CATALOG = [
  { provider: "FACEBOOK_PIXEL", name: "Facebook Pixel", blurb: "Measure website visitors. Paste your Pixel ID.", field: "Pixel ID" },
  { provider: "GOOGLE_ANALYTICS", name: "Google Analytics", blurb: "Measure website visitors. Paste your Measurement ID (G-…).", field: "Measurement ID" },
  { provider: "GOOGLE_ADS", name: "Google Ads", blurb: "Conversion tracking for ads. Paste your conversion ID.", field: "Conversion ID" },
  { provider: "WEBHOOKS", name: "Webhooks", blurb: "Send lead and payment events to another app. Paste the HTTPS URL.", field: "Webhook URL" },
  { provider: "ZOOM", name: "Zoom", blurb: "Optional. Leave class URLs blank and Propel opens a Jitsi room. Paste a Zoom or Meet link only if you already have one.", field: "Account email" },
];

export function IntegrationsPage() {
  const connections = useApi<Connection[]>("/api/integration-connections");
  const gateway = useApi<Gateway>("/api/actions/integrations");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState({
    razorpayKeyId: "",
    razorpayKeySecret: "",
    razorpayWebhookSecret: "",
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
      const existing = byProvider.get(provider);
      const configJson = JSON.stringify({ value: values[provider] || "" });
      if (existing) {
        await updateRecord(`/api/integration-connections/${existing.id}`, {
          ...existing,
          status: values[provider] ? "CONNECTED" : "NOT_CONNECTED",
          configJson,
        });
      } else {
        await createRecord("/api/integration-connections", {
          provider,
          status: values[provider] ? "CONNECTED" : "NOT_CONNECTED",
          configJson,
        });
      }
      connections.reload();
      setNotice("Integration saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const g = gateway.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Integrations</h1>
        <p className="text-sm text-slate-500">Paste your Razorpay, WhatsApp, and SMTP keys here. Until they are saved, fees and notices stay recorded in Propel only.</p>
      </div>
      <ErrorText error={error} />
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Payments (Razorpay / UPI)">
          <p className="text-sm text-slate-500">
            {g?.payments?.live || keyStatus?.razorpay
              ? `Live via ${g?.payments?.provider || "razorpay"}. Collect will create a Razorpay order.`
              : "Paste your Razorpay key ID and secret. Until then, Collect only records the fee in Propel."}
          </p>
          <div className="mt-3 space-y-3">
            <Field label="Key ID" value={keys.razorpayKeyId} onChange={(v) => setKeys((p) => ({ ...p, razorpayKeyId: v }))} placeholder={keyStatus?.razorpay ? "Saved — paste to replace" : "rzp_live_…"} />
            <Field label="Key secret" value={keys.razorpayKeySecret} onChange={(v) => setKeys((p) => ({ ...p, razorpayKeySecret: v }))} type="password" />
            <Field
              label="Webhook secret (optional)"
              value={keys.razorpayWebhookSecret}
              onChange={(v) => setKeys((p) => ({ ...p, razorpayWebhookSecret: v }))}
              type="password"
              placeholder={keyStatus?.webhook ? "Saved — paste to replace" : "From Razorpay dashboard"}
            />
            <p className="text-xs text-slate-500">Webhook URL: /api/public/payments/razorpay</p>
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
                    setNotice("Payment keys saved.");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                })()
              }
            >
              Save payment keys
            </PrimaryButton>
          </div>
        </Card>
        <Card title="WhatsApp">
          <p className="text-sm text-slate-500">
            {g?.whatsapp?.live || keyStatus?.whatsapp ? "Cloud API keys are saved. Receipts go to the student mobile." : "Paste the WhatsApp Cloud API token and phone number ID."}
          </p>
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
        <Card title="Email (SMTP)">
          <p className="text-sm text-slate-500">
            {g?.mail?.live || keyStatus?.smtp ? "SMTP is saved for institute notices." : "Paste Gmail app password or your SMTP host. Login OTP still uses Niyamstack mail if configured on the server."}
          </p>
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
          <p className="text-sm text-slate-500">Used for CGST/SGST vs IGST and invoice numbers.</p>
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
        <Card title="Meetings">
          <p className="text-sm text-slate-500">
            {g?.meetings?.live
              ? `Live via ${g.meetings.provider}.`
              : "Schedule a live class or 1:1 and Propel opens a Jitsi room. Paste a Zoom or Meet URL if you already have one."}
          </p>
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
              <p className="text-sm text-slate-500">{item.blurb}</p>
              <p className="mt-2 text-xs font-medium">{connected ? "Saved" : "Not connected"}</p>
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
