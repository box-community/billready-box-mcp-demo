import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const base = "http://127.0.0.1:4310";
const s = await (await fetch(base + "/api/state")).json();
assert.equal(s.mode, "live");
assert.equal(s.connection.provider, "box");
assert.equal(s.totals.ready, 5800000);
assert.equal(s.totals.blocked, 0);
assert.equal(s.totals.invoiced, 24200000);
assert.equal(s.totals.outstanding, 1200000);
const p = s.proposals.find((p: any) => p.id === "billing-CW-101-M3");
assert.equal(p.status, "prepared");
assert.equal(p.savedIds.length, 4);
const saved = s.documents.filter((d: any) => p.savedIds.includes(d.id));
for (const d of saved) assert.equal(d.folderId, s.folders["CW-101/04 Billing"]);
fs.mkdirSync("verification/live-examples", { recursive: true });
let invoiceText = "";
let email: any;
for (const d of saved) {
  const r = await fetch(base + "/api/documents/" + d.id + "/content");
  assert.ok(r.ok, `Remote download ${d.name}: ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync("verification/live-examples/" + d.name, bytes);
  if (d.name === "DRAFT-CW-101-M3.pdf") {
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: true,
    });
    const pdf = await task.promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const c = await (await pdf.getPage(i)).getTextContent();
      invoiceText += c.items.map((x: any) => x.str).join(" ");
    }
    await task.destroy();
  }
  if (d.name.endsWith("-email.json"))
    email = JSON.parse(bytes.toString("utf8"));
}
assert.ok(invoiceText.includes("$18,000"));
assert.ok(invoiceText.includes("DRAFT"));
assert.equal(email.status, "DRAFT_NOT_SENT");
const hero = s.projects.find((p: any) => p.id === "CW-101");
const acceptanceId = hero.milestones[2].acceptanceFileId;
assert.ok(email.attachments.some((d: any) => d.id === acceptanceId));
assert.ok(
  email.attachments.some((d: any) => d.name === "CW-101-completion-report.pdf"),
);
assert.ok(email.attachments.some((d: any) => d.name === "DRAFT-CW-101-M3.pdf"));
const retry = await fetch(base + "/api/proposals/" + p.id + "/approve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ confirm: true }),
});
assert.ok(retry.ok);
const after = await (await fetch(base + "/api/state")).json();
assert.equal(after.documents.length, s.documents.length);
const report = {
  result: "PASS",
  mode: "live",
  provider: "Box AI via remote MCP",
  root: process.env.BOX_DEMO_ROOT_ID,
  totals: s.totals,
  preparedFiles: saved.map((d: any) => ({
    id: d.boxId,
    name: d.name,
    folderId: d.folderId,
  })),
  heroAcceptance: s.documents.find((d: any) => d.id === acceptanceId),
  rejectedAcceptance: s.documents.find(
    (d: any) => d.projectId === "CW-101" && d.valid === false,
  ),
  northstar: s.projects.find((p: any) => p.id === "CW-105").milestones[2],
  invoiceAmountCents: 1800000,
  emailIncludesRequiredAttachments: true,
  approvalRetryNoDuplicate: true,
  invoiceIssued: false,
  emailSent: false,
};
fs.writeFileSync(
  "verification/live-workflow-results.json",
  JSON.stringify(report, null, 2),
);
console.log(
  "PASS: downloaded actual saved Box artifacts; invoice $18,000; required attachments; exact totals; no duplicates on approval retry.",
);
