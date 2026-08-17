import { useState } from "react";
import { api } from "../api";
import { createRecord } from "../ops";
import { Card, ErrorText, Field, FormGrid, PrimaryButton, Select, useApi } from "../ui";

type Student = { id: string; fullName: string };

export function ReadinessPage() {
  const students = useApi<Student[]>("/api/students");
  const skills = useApi<{ name: string; proficiency: string }[]>("/api/skills");
  const resumes = useApi<{ versionLabel: string; completeness: number; content: string }[]>("/api/resumes");
  const mocks = useApi<{ kind: string; score: number; feedback: string }[]>("/api/mocks");
  const [studentId, setStudentId] = useState("");
  const [score, setScore] = useState<Record<string, unknown> | null>(null);
  const [ai, setAi] = useState("");
  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState("INTERMEDIATE");
  const [error, setError] = useState<string | null>(null);

  async function loadScore() {
    const id = studentId || students.data?.[0]?.id;
    if (!id) return;
    setError(null);
    try {
      setScore(await api(`/api/actions/readiness/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function coach() {
    setError(null);
    try {
      const res = await api<{ answer: string }>("/api/actions/ai/coach", {
        method: "POST",
        body: JSON.stringify({ question: "How do I get placement ready this month?" }),
      });
      setAi(res.answer);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Placement readiness</h1>
      <ErrorText error={error} />
      <Card title="Add skill">
        <FormGrid>
          <Select
            label="Student"
            value={studentId}
            onChange={setStudentId}
            options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
          />
          <Field label="Skill" value={skill} onChange={setSkill} />
          <Field label="Proficiency" value={level} onChange={setLevel} />
          <div className="flex items-end">
            <PrimaryButton
              disabled={!studentId || !skill}
              onClick={async () => {
                setError(null);
                try {
                  await createRecord("/api/skills", { studentId, name: skill, proficiency: level });
                  setSkill("");
                  skills.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save skill
            </PrimaryButton>
          </div>
        </FormGrid>
      </Card>
      <Card title="Composite readiness score">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Student"
            value={studentId}
            onChange={setStudentId}
            options={(students.data ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
          />
          <PrimaryButton onClick={loadScore}>Compute</PrimaryButton>
        </div>
        {score && (
          <p className="mt-3 text-sm">
            Score {String(score.score)} · {String(score.band)} · attendance {String(score.attendance)}%
          </p>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Skills inventory">
          <ul className="text-sm">
            {(skills.data ?? []).map((s, i) => (
              <li key={i}>
                {s.name} — {s.proficiency}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Resumes">
          <ul className="text-sm">
            {(resumes.data ?? []).map((r, i) => (
              <li key={i}>
                {r.versionLabel} ({r.completeness}%)
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Mocks">
          <ul className="text-sm">
            {(mocks.data ?? []).map((m, i) => (
              <li key={i}>
                {m.kind}: {m.score} — {m.feedback}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="AI academic assistant / career coach">
        <p className="mb-3 text-sm text-slate-500">Enterprise package. Stub until an LLM key is configured.</p>
        <PrimaryButton onClick={coach}>Ask coach</PrimaryButton>
        {ai && <p className="mt-3 text-sm leading-6">{ai}</p>}
      </Card>
    </div>
  );
}
