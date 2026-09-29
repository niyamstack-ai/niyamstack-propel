export type IdCardData = {
  instituteName?: string;
  logoUrl?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  kind?: string;
  fullName?: string;
  code?: string;
  title?: string;
  department?: string;
  photoUrl?: string;
  courseName?: string;
  batchName?: string;
  centerName?: string;
  phone?: string;
  validLabel?: string;
  website?: string;
  addressHint?: string;
};

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Opens a print-ready CR80-style ID card (front + back). */
export function openIdCardPrint(rec: IdCardData) {
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Allow pop-ups to print the ID card.");
  }
  const brand = rec.brandPrimary?.trim() || "#0b2744";
  const accent = rec.brandSecondary?.trim() || "#1d4ed8";
  const role = (rec.kind || "STUDENT").toUpperCase() === "STAFF" ? "Staff" : "Student";
  const line2 =
    role === "Staff"
      ? [rec.title, rec.department].filter(Boolean).join(" · ")
      : [rec.courseName, rec.batchName].filter(Boolean).join(" · ") || rec.title || "";
  const valid = rec.validLabel || "Institute identity card";
  const photo = rec.photoUrl
    ? `<img class="photo" src="${esc(rec.photoUrl)}" alt="" />`
    : `<div class="photo placeholder">${esc((rec.fullName || "?").slice(0, 1).toUpperCase())}</div>`;
  const logo = rec.logoUrl
    ? `<img class="logo" src="${esc(rec.logoUrl)}" alt="" />`
    : `<div class="logo-fallback">${esc((rec.instituteName || "I").slice(0, 1).toUpperCase())}</div>`;

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(rec.fullName)} · ID card</title>
  <style>
    @page { size: auto; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #0f172a;
      background: #e2e8f0;
      padding: 24px;
    }
    .sheet { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; justify-content: center; }
    .card {
      width: 85.6mm;
      height: 54mm;
      border-radius: 3.5mm;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
      position: relative;
      border: 0.3mm solid #cbd5e1;
    }
    .front .band {
      height: 14mm;
      background: linear-gradient(90deg, ${esc(brand)}, ${esc(accent)});
      color: #fff;
      display: flex;
      align-items: center;
      gap: 2.5mm;
      padding: 0 3.5mm;
    }
    .logo, .logo-fallback {
      width: 9mm;
      height: 9mm;
      border-radius: 2mm;
      object-fit: cover;
      background: rgba(255,255,255,0.2);
      flex-shrink: 0;
    }
    .logo-fallback {
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 4.5mm;
    }
    .inst {
      font-size: 3.2mm;
      font-weight: 700;
      line-height: 1.2;
      max-height: 8mm;
      overflow: hidden;
    }
    .body {
      display: grid;
      grid-template-columns: 22mm 1fr;
      gap: 3mm;
      padding: 3mm 3.5mm 2.5mm;
      height: calc(54mm - 14mm);
    }
    .photo, .placeholder {
      width: 22mm;
      height: 26mm;
      border-radius: 2mm;
      object-fit: cover;
      border: 0.35mm solid #cbd5e1;
      background: #f1f5f9;
    }
    .placeholder {
      display: grid;
      place-items: center;
      font-size: 8mm;
      font-weight: 700;
      color: ${esc(brand)};
    }
    .meta { min-width: 0; display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 0.5mm; }
    .role {
      display: inline-block;
      font-size: 2.4mm;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${esc(brand)};
      background: #eff6ff;
      border-radius: 999px;
      padding: 0.6mm 2mm;
      width: fit-content;
    }
    h1 {
      margin: 1.5mm 0 0;
      font-size: 4.4mm;
      line-height: 1.15;
      font-weight: 800;
      color: #0b2744;
      max-height: 10mm;
      overflow: hidden;
    }
    .code { margin-top: 1mm; font-size: 3mm; font-weight: 700; color: #334155; font-variant-numeric: tabular-nums; }
    .line { margin-top: 1mm; font-size: 2.6mm; color: #64748b; max-height: 7mm; overflow: hidden; }
    .valid { margin-top: auto; font-size: 2.2mm; color: #94a3b8; }
    .back .band {
      height: 8mm;
      background: ${esc(brand)};
      color: #fff;
      display: flex;
      align-items: center;
      padding: 0 3.5mm;
      font-size: 2.8mm;
      font-weight: 700;
    }
    .back .content { padding: 3.5mm; font-size: 2.6mm; line-height: 1.45; color: #334155; }
    .back .content p { margin: 0 0 2mm; }
    .muted { color: #64748b; }
    .actions { width: 100%; text-align: center; margin-top: 8px; }
    .actions button {
      border: 0;
      background: #0b2744;
      color: #fff;
      border-radius: 999px;
      padding: 10px 18px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .actions { display: none; }
      .card { box-shadow: none; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="card front">
      <div class="band">
        ${logo}
        <div class="inst">${esc(rec.instituteName || "Institute")}</div>
      </div>
      <div class="body">
        ${photo}
        <div class="meta">
          <div>
            <span class="role">${esc(role)}</span>
            <h1>${esc(rec.fullName || "")}</h1>
            <div class="code">${esc(rec.code || "")}</div>
            <div class="line">${esc(line2)}</div>
          </div>
          <div class="valid">${esc(valid)}</div>
        </div>
      </div>
    </div>
    <div class="card back">
      <div class="band">${esc(rec.instituteName || "Institute")}</div>
      <div class="content">
        <p><strong>Identity card</strong> — property of the institute. Return if found.</p>
        ${rec.centerName ? `<p>Center: ${esc(rec.centerName)}</p>` : ""}
        ${rec.phone ? `<p>Contact on file: ${esc(rec.phone)}</p>` : ""}
        ${rec.website ? `<p class="muted">${esc(rec.website)}</p>` : ""}
        ${rec.addressHint ? `<p class="muted">${esc(rec.addressHint)}</p>` : `<p class="muted">Show this card at the gate and in class when asked.</p>`}
        <p class="muted">Code ${esc(rec.code || "")}</p>
      </div>
    </div>
  </div>
  <div class="actions"><button type="button" onclick="window.print()">Print ID card</button></div>
  <script>window.focus();<\/script>
</body>
</html>`);
  win.document.close();
}
