import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { prettyLabel } from "../labels";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Campaign = {
  id: string;
  name: string;
  campaignType: string;
  triggerEvent?: string;
  channel: string;
  audience: string;
  title?: string;
  body?: string;
  status: string;
  sentCount?: number;
};

export function CampaignsPage() {
  const campaigns = useApi<Campaign[]>("/api/campaigns");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"list" | "pick" | "form">("list");
  const [campaignType, setCampaignType] = useState("ONE_TIME");
  const [name, setName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("PAYMENT_DROP");
  const [channel, setChannel] = useState("PUSH");
  const [audience, setAudience] = useState("ALL_USERS");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function start(type: string) {
    setCampaignType(type);
    setStep("form");
    setName(type === "ACTION" ? "Action based campaign" : "One-time campaign");
  }

  async function create() {
    setError(null);
    try {
      await createRecord("/api/campaigns", {
        name,
        campaignType,
        triggerEvent: campaignType === "ACTION" ? triggerEvent : null,
        channel,
        audience,
        title,
        body,
        status: "DRAFT",
        sentCount: 0,
      });
      setStep("list");
      setName("");
      setTitle("");
      setBody("");
      campaigns.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function launch(c: Campaign) {
    try {
      await api(`/api/actions/campaigns/${c.id}/launch`, { method: "POST", body: "{}" });
      campaigns.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Campaigns ({campaigns.data?.length ?? 0})</h1>
          <p className="text-sm text-slate-500">Launch sends WhatsApp or email to students when those keys are saved in Integrations. Push uses WhatsApp if a mobile is on file, otherwise it stays in the student website.</p>
        </div>
        <PrimaryButton onClick={() => setStep("pick")}>Create New Campaign</PrimaryButton>
      </div>
      <ErrorText error={error} />

      {step === "pick" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="User Action Based Campaign">
            <p className="mb-3 text-sm text-slate-600">E.g. User drops from payment page. User drops from course overview.</p>
            <PrimaryButton onClick={() => start("ACTION")}>Create User Action Based Campaign</PrimaryButton>
          </Card>
          <Card title="One-Time Campaign">
            <p className="mb-3 text-sm text-slate-600">Promote a new course to all app users, or an online workshop to buyers.</p>
            <PrimaryButton onClick={() => start("ONE_TIME")}>Create One-Time Campaign</PrimaryButton>
          </Card>
        </div>
      )}

      {step === "form" && (
        <Card title="Campaign details" action={<button onClick={() => setStep("list")}>Back</button>}>
          <FormGrid>
            <Field label="Campaign name" value={name} onChange={setName} />
            {campaignType === "ACTION" && (
              <Select
                label="Trigger"
                value={triggerEvent}
                onChange={setTriggerEvent}
                options={[
                  { value: "PAYMENT_DROP", label: "Drops from payment page" },
                  { value: "COURSE_DROP", label: "Drops from course overview" },
                  { value: "CART_ABANDON", label: "Abandons cart" },
                ]}
              />
            )}
            <Select
              label="Channel"
              value={channel}
              onChange={setChannel}
              options={[
                { value: "PUSH", label: "Push" },
                { value: "EMAIL", label: "Email" },
                { value: "WHATSAPP", label: "WhatsApp" },
                { value: "IN_APP", label: "In-app" },
              ]}
            />
            <Select
              label="Audience"
              value={audience}
              onChange={setAudience}
              options={[
                { value: "ALL_USERS", label: "All app users" },
                { value: "COURSE_BUYERS", label: "Course buyers" },
                { value: "INACTIVE", label: "Inactive users" },
              ]}
            />
            <Field label="Message title" value={title} onChange={setTitle} />
            <Field label="Message body" value={body} onChange={setBody} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!name} onClick={create}>
              Save campaign
            </PrimaryButton>
          </div>
        </Card>
      )}

      {step === "list" && (
        <Card title="Create & manage campaigns">
          {(campaigns.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">No campaigns yet. Send a reminder when someone leaves checkout, or a one-time message about a new course.</p>
          ) : (
            <Table
              columns={["Name", "Type", "Channel", "Status", "Sent", ""]}
              rows={(campaigns.data ?? []).map((c) => [
                c.name,
                c.campaignType === "ACTION" ? "When a student acts" : "One-time",
                prettyLabel(c.channel),
                prettyLabel(c.status),
                String(c.sentCount ?? 0),
                <button className="text-brand hover:underline" type="button" onClick={() => launch(c)} key={c.id}>
                  Launch
                </button>,
              ])}
            />
          )}
        </Card>
      )}
    </div>
  );
}
