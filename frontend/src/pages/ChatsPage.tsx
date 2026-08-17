import { useMemo, useState } from "react";
import { createRecord } from "../ops";
import { useAuth } from "../auth";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, Table, useApi } from "../ui";

type Thread = { id: string; studentName?: string; subject?: string; status: string; lastMessageAt?: string };
type Message = { id: string; threadId: string; senderRole: string; senderName?: string; body: string };
type Student = { id: string; fullName: string };

export function ChatsPage() {
  const { user } = useAuth();
  const threads = useApi<Thread[]>("/api/chat-threads");
  const messages = useApi<Message[]>("/api/chat-messages");
  const students = useApi<Student[]>("/api/students");
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [studentId, setStudentId] = useState("");
  const [body, setBody] = useState("");

  const threadMessages = useMemo(
    () => (messages.data ?? []).filter((m) => m.threadId === active),
    [messages.data, active]
  );

  async function startThread() {
    setError(null);
    try {
      const st = (students.data ?? []).find((s) => s.id === studentId);
      const thread = await createRecord<Thread>("/api/chat-threads", {
        studentId: studentId || null,
        studentName: st?.fullName || "Student",
        subject: subject || "Conversation",
        status: "OPEN",
        lastMessageAt: new Date().toISOString(),
      });
      setActive(thread.id);
      setSubject("");
      threads.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function send() {
    if (!active || !body) return;
    setError(null);
    try {
      await createRecord("/api/chat-messages", {
        threadId: active,
        senderRole: user?.role || "OWNER",
        senderName: user?.name || "Staff",
        body,
      });
      setBody("");
      messages.reload();
      threads.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Chats</h1>
        <p className="text-sm text-slate-500">Send messages to your students on a daily basis.</p>
      </div>
      <ErrorText error={error} />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card title="Threads">
          <FormGrid>
            <Select
              label="Student"
              value={studentId}
              onChange={setStudentId}
              options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
            />
            <Field label="Subject" value={subject} onChange={setSubject} />
          </FormGrid>
          <div className="mt-3">
            <PrimaryButton onClick={startThread}>New chat</PrimaryButton>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {(threads.data ?? []).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left ${active === t.id ? "bg-navy text-white" : "bg-mist"}`}
                  onClick={() => setActive(t.id)}
                >
                  <span className="font-medium">{t.studentName || "User"}</span>
                  <span className="block text-xs opacity-80">{t.subject}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Conversation">
          {!active && <p className="text-sm text-slate-500">Select or start a chat.</p>}
          {active && (
            <>
              <div className="mb-4 max-h-80 space-y-2 overflow-y-auto">
                {threadMessages.map((m) => (
                  <div key={m.id} className="rounded-lg bg-mist px-3 py-2 text-sm">
                    <p className="text-xs text-slate-500">
                      {m.senderName} · {m.senderRole}
                    </p>
                    <p>{m.body}</p>
                  </div>
                ))}
                {threadMessages.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
              </div>
              <FormGrid>
                <Field label="Message" value={body} onChange={setBody} />
              </FormGrid>
              <div className="mt-3">
                <PrimaryButton disabled={!body} onClick={send}>
                  Send
                </PrimaryButton>
              </div>
            </>
          )}
        </Card>
      </div>
      <Card title="All threads">
        <Table
          columns={["Student", "Subject", "Status"]}
          rows={(threads.data ?? []).map((t) => [t.studentName || "—", t.subject || "—", t.status])}
        />
      </Card>
    </div>
  );
}
