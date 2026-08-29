import { nid } from "./websiteSections";

export type FormField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "yesno";
  options?: string;
  required?: boolean;
};

export const SCHOLARSHIP_FIELDS: FormField[] = [
  { id: nid(), label: "Course you are applying for", type: "text", required: true },
  { id: nid(), label: "Last exam score or percentage", type: "text", required: true },
  { id: nid(), label: "Family monthly income", type: "text", required: true },
  { id: nid(), label: "Why do you need this scholarship?", type: "textarea", required: true },
];

export function parseFormFields(raw?: string): FormField[] {
  const value = (raw || "").trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as FormField[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const type: FormField["type"] =
          row?.type === "textarea" || row?.type === "select" || row?.type === "yesno" ? row.type : "text";
        return {
          id: row?.id || nid(),
          label: String(row?.label || "").trim(),
          type,
          options: String(row?.options || ""),
          required: Boolean(row?.required),
        };
      })
      .filter((row) => row.label);
  } catch {
    return [];
  }
}

export function serializeFormFields(rows: FormField[]) {
  return JSON.stringify(rows.filter((row) => row.label.trim()));
}

export function selectOptions(field: FormField) {
  return (field.options || "")
    .split(/[\n,]/)
    .map((row) => row.trim())
    .filter(Boolean);
}

export function FormFieldsEditor({
  value,
  onChange,
}: {
  value: FormField[];
  onChange: (next: FormField[]) => void;
}) {
  function patch(index: number, change: Partial<FormField>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...change } : row)));
  }
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-dashed border-slate-300 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-navy">Your extra questions</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-xs font-medium text-brand"
            onClick={(e) => {
              e.stopPropagation();
              onChange([...value, ...SCHOLARSHIP_FIELDS]);
            }}
          >
            Add scholarship questions
          </button>
          <button
            type="button"
            className="text-xs font-medium text-brand"
            onClick={(e) => {
              e.stopPropagation();
              onChange([...value, { id: nid(), label: "", type: "text", required: false }]);
            }}
          >
            Add question
          </button>
        </div>
      </div>
      {value.length === 0 && (
        <p className="text-xs text-slate-500">Name, mobile, email, and message stay on every form. Add extra questions for a scholarship form, survey, or feedback.</p>
      )}
      {value.map((field, i) => (
        <div key={field.id} className="grid gap-2 rounded-lg bg-mist p-2 sm:grid-cols-[1fr_8rem_auto]">
          <input
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
            placeholder="Question, e.g. Last exam marks"
            value={field.label}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => patch(i, { label: e.target.value })}
          />
          <select
            className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
            value={field.type}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => patch(i, { type: e.target.value as FormField["type"] })}
          >
            <option value="text">Short answer</option>
            <option value="textarea">Long answer</option>
            <option value="select">Choice list</option>
            <option value="yesno">Yes / No</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={field.required} onChange={(e) => patch(i, { required: e.target.checked })} onClick={(e) => e.stopPropagation()} />
            Required
          </label>
          {field.type === "select" && (
            <input
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm sm:col-span-2"
              placeholder="Choices, comma separated"
              value={field.options || ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => patch(i, { options: e.target.value })}
            />
          )}
          <button
            type="button"
            className="text-xs text-red-600 sm:col-span-1"
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((_, idx) => idx !== i));
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
