import { useMemo, useState } from "react";
import { createRecord, updateRecord } from "../ops";
import { Card, ErrorText, PrimaryButton, useApi } from "../ui";

type Connection = { id: string; provider: string; status: string; configJson?: string };

const CATALOG = [
  { provider: "FACEBOOK_PIXEL", name: "Facebook Pixel", blurb: "Track visitors of your website and app" },
  { provider: "GOOGLE_ANALYTICS", name: "Google Analytics", blurb: "Track visitors of your website and app" },
  { provider: "GOOGLE_ADS", name: "Google Ads", blurb: "Track visitors and advertise to them later" },
  { provider: "WEBHOOKS", name: "Webhooks", blurb: "Transfer information from one app to another" },
  { provider: "ZOOM", name: "Zoom", blurb: "Conduct live sessions on Zoom and interact with students" },
];

export function IntegrationsPage() {
  const connections = useApi<Connection[]>("/api/integration-connections");
  const gateway = useApi<Record<string, unknown>>("/api/actions/integrations");
  const [error, setError] = useState<string | null>(null);

  const byProvider = useMemo(() => {
    const map = new Map<string, Connection>();
    (connections.data ?? []).forEach((c) => map.set(c.provider, c));
    return map;
  }, [connections.data]);

  async function connect(provider: string) {
    setError(null);
    try {
      const existing = byProvider.get(provider);
      if (existing) {
        await updateRecord(`/api/integration-connections/${existing.id}`, {
          ...existing,
          status: existing.status === "CONNECTED" ? "NOT_CONNECTED" : "CONNECTED",
        });
      } else {
        await createRecord("/api/integration-connections", {
          provider,
          status: "CONNECTED",
          configJson: "{}",
        });
      }
      connections.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Integrations</h1>
        <p className="text-sm text-slate-500">Integrate these tools to grow your business.</p>
      </div>
      <ErrorText error={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {CATALOG.map((item) => {
          const conn = byProvider.get(item.provider);
          const connected = conn?.status === "CONNECTED";
          return (
            <Card key={item.provider} title={item.name}>
              <p className="text-sm text-slate-500">{item.blurb}</p>
              <p className="mt-2 text-xs font-medium">{connected ? "Connected" : "Not Connected"}</p>
              <div className="mt-3">
                <PrimaryButton onClick={() => connect(item.provider)}>
                  {connected ? "Disconnect" : item.provider === "WEBHOOKS" ? "Manage" : "Connect"}
                </PrimaryButton>
              </div>
            </Card>
          );
        })}
      </div>
      <Card title="Platform payment / messaging adapters">
        <pre className="overflow-auto rounded-lg bg-mist p-3 text-xs">{JSON.stringify(gateway.data, null, 2)}</pre>
      </Card>
    </div>
  );
}
