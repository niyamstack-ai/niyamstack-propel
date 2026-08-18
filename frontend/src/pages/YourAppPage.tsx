import { useState } from "react";
import { createRecord, updateRecord } from "../ops";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Org = { name: string; slug?: string; appShareUrl?: string; logoUrl?: string; brandPrimary?: string };
type Banner = { id: string; title: string; imageUrl?: string; linkUrl?: string; live: boolean; sortOrder?: number };
type Push = { id: string; title: string; body?: string; audience: string; status: string; scheduledAt?: string };

export function YourAppPage() {
  const org = useApi<Org>("/api/organization");
  const banners = useApi<Banner[]>("/api/app-banners");
  const pushes = useApi<Push[]>("/api/app-pushes");
  const [tab, setTab] = useState<"configure" | "banners" | "marketing">("configure");
  const [error, setError] = useState<string | null>(null);
  const [appUrl, setAppUrl] = useState("");
  const [bTitle, setBTitle] = useState("");
  const [bImage, setBImage] = useState("");
  const [bLink, setBLink] = useState("");
  const [pTitle, setPTitle] = useState("");
  const [pBody, setPBody] = useState("");
  const [pAudience, setPAudience] = useState("ALL_USERS");

  async function saveApp() {
    if (!org.data) return;
    setError(null);
    try {
      await updateRecord("/api/organization", { ...org.data, appShareUrl: appUrl || org.data.appShareUrl });
      org.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addBanner() {
    setError(null);
    try {
      await createRecord("/api/app-banners", { title: bTitle, imageUrl: bImage, linkUrl: bLink, live: true, sortOrder: 0 });
      setBTitle("");
      setBImage("");
      setBLink("");
      banners.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addPush() {
    setError(null);
    try {
      await createRecord("/api/app-pushes", {
        title: pTitle,
        body: pBody,
        audience: pAudience,
        status: "QUEUED",
        scheduledAt: new Date().toISOString(),
      });
      setPTitle("");
      setPBody("");
      pushes.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Your App</h1>
          <p className="text-sm text-slate-500">Configure branded app, banners, and push notifications.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["configure", "Configure App"],
              ["banners", "Manage Banners"],
              ["marketing", "Marketing Dashboard"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`rounded-full px-3 py-1.5 text-sm ${tab === id ? "bg-navy text-white" : "bg-mist"}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorText error={error} />

      {tab === "configure" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Configure your app">
            <p className="mb-3 text-sm text-slate-500">Add basic details to set the theme of your app.</p>
            <p className="text-lg font-semibold text-navy">{org.data?.name || "Your institute"}</p>
            <FormGrid>
              <Field
                label="App share URL"
                value={appUrl || org.data?.appShareUrl || ""}
                onChange={setAppUrl}
                placeholder="https://play.google.com/store/apps/..."
              />
            </FormGrid>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton onClick={saveApp}>Save</PrimaryButton>
              <a className="rounded-full border border-line px-4 py-2 text-sm" href={org.data?.appShareUrl || `/s/${org.data?.slug || "aarohan"}/app`}>
                Open student app
              </a>
            </div>
          </Card>
          <Card title="Preview">
            <div className="mx-auto flex h-64 w-40 flex-col rounded-3xl border-4 border-navy bg-mist p-3">
              <div className="rounded-xl bg-white p-2 text-center text-xs font-bold text-navy">{org.data?.name || "App"}</div>
              <div className="mt-3 flex-1 rounded-xl bg-white/70" />
              <p className="mt-2 text-center text-[10px] text-slate-500">Student app shell</p>
            </div>
          </Card>
        </div>
      )}

      {tab === "banners" && (
        <Card title={`Manage Banners (${banners.data?.filter((b) => b.live).length ?? 0} live)`}>
          <FormGrid>
            <Field label="Title" value={bTitle} onChange={setBTitle} />
            <Field label="Image URL" value={bImage} onChange={setBImage} />
            <Field label="Link URL" value={bLink} onChange={setBLink} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!bTitle} onClick={addBanner}>
              Add banner
            </PrimaryButton>
          </div>
          <div className="mt-4">
            <Table
              columns={["Title", "Link", "Live"]}
              rows={(banners.data ?? []).map((b) => [b.title, b.linkUrl || "—", b.live ? "Live" : "Off"])}
            />
          </div>
        </Card>
      )}

      {tab === "marketing" && (
        <Card title="Notification Panel">
          <p className="mb-3 text-sm text-slate-500">Send and schedule your daily notifications here.</p>
          <FormGrid>
            <Field label="Title" value={pTitle} onChange={setPTitle} />
            <Field label="Message" value={pBody} onChange={setPBody} />
            <Select
              label="Audience"
              value={pAudience}
              onChange={setPAudience}
              options={[
                { value: "ALL_USERS", label: "All users" },
                { value: "STUDENTS", label: "Students" },
                { value: "COURSE_BUYERS", label: "Course buyers" },
              ]}
            />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton disabled={!pTitle || !pBody} onClick={addPush}>
              Queue notification
            </PrimaryButton>
          </div>
          <div className="mt-4">
            <Table
              columns={["Title", "Audience", "Status"]}
              rows={(pushes.data ?? []).map((p) => [p.title, p.audience, p.status])}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
