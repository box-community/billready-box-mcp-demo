import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  seedProjects,
  DEMO_DATE,
  dateOffset,
  totals,
  money,
  billing,
} from "../server/domain.ts";
import { makePdf } from "../server/pdf.ts";
const base = path.resolve("demo-kit");
const root = path.join(base, "upload-to-box", "BillReady Demo");
const write = (p: string, v: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, v);
};
const ps = seedProjects();
const dirs = [
  "01 Project records",
  "02 Delivery evidence",
  "03 Acceptance",
  "04 Billing",
  "05 Follow-ups",
];
write(
  path.join(root, "Company", "company-profile.md"),
  `# Clearwave AV\nFictional AV installation company. Owner: Avery Quinn. Billing: billing@clearwave.example.\nDemo date: ${DEMO_DATE}. Currency USD. All names, amounts, and signatures are synthetic.\nProject owner: Alex Chan.\n`,
);
write(
  path.join(root, "Company", "billing-readiness-rules.md"),
  "# Billing readiness\nOnly completed, unissued milestones qualify. If customer acceptance is required, signed affirmative acceptance must match project ID, client and milestone. Draft and prepared packages are not issued invoices. Incomplete work is future billing. Outstanding is issued less paid. Zero tax is a synthetic demo assumption. Approval saves documents; it never sends email.\n",
);
const invoices = ps.flatMap((p) =>
  p.milestones
    .filter((m) => m.issued)
    .map((m) => ({
      reference: `INV-${p.id}-${m.id}`,
      projectId: p.id,
      milestoneId: m.id,
      cents: m.cents,
      paidCents: m.paidCents,
      issuedDate: m.issuedDate,
      dueDate: dateOffset(21),
    })),
);
write(
  path.join(root, "Company", "invoice-register.json"),
  JSON.stringify(invoices, null, 2),
);
write(
  path.join(root, "Company", "invoice-register.csv"),
  "reference,project_id,milestone_id,amount_usd,paid_usd,issued_date,due_date\n" +
    invoices
      .map((i) =>
        [
          i.reference,
          i.projectId,
          i.milestoneId,
          i.cents / 100,
          i.paidCents / 100,
          i.issuedDate,
          i.dueDate,
        ].join(","),
      )
      .join("\n"),
);
const manifest: any[] = [];
async function acceptance(file: string, p: (typeof ps)[number]) {
  const m = p.milestones[2];
  const acceptedDate = ["CW-102", "CW-103"].includes(p.id)
    ? dateOffset(-10)
    : DEMO_DATE;
  await makePdf(
    file,
    "Customer acceptance",
    `${p.client}  |  ${p.id}  |  ${acceptedDate}`,
    [
      {
        title: "Project and milestone",
        text: `Project ID: ${p.id}\nClient: ${p.client}\nMilestone ID: ${m.id}\nMilestone: ${m.name}\nMilestone amount: ${money(m.cents)}`,
      },
      {
        title: "Acceptance statement",
        text: "The installation, testing and handover described above are complete. We accept the completed work for this milestone without reservation. No open punch-list items remain.",
      },
      {
        title: "Customer authorization",
        text: `Status: ACCEPTED\nSigned: YES\nSigner: ${p.contact} (FICTIONAL DEMO SIGNATURE)\nDate: ${acceptedDate}\n\n/s/ ${p.contact}\nThis is a fictional signature for demonstration only.`,
      },
    ],
  );
}
for (const p of ps) {
  const dir = path.join(root, "Projects", `${p.id} ${p.shortName}`);
  dirs.forEach((d) => fs.mkdirSync(path.join(dir, d), { recursive: true }));
  write(path.join(dir, dirs[0], "project.json"), JSON.stringify(p, null, 2));
  await makePdf(
    path.join(dir, dirs[0], `${p.id}-project-agreement.pdf`),
    "Project agreement",
    `${p.client}  |  ${p.id}  |  ${dateOffset(-45)}`,
    [
      {
        title: "Scope",
        text: `${p.name}\nClearwave AV will design, install, configure and hand over the AV systems. Project value: ${money(p.milestones.reduce((s, m) => s + m.cents, 0))}.`,
      },
      {
        title: "Billing milestones",
        text: p.milestones
          .map(
            (m) =>
              `${m.id}: ${m.name} - ${money(m.cents)}. ${m.acceptanceRequired ? "Signed customer acceptance required before billing." : "Billable upon completion."}`,
          )
          .join("\n\n"),
      },
      {
        title: "Terms",
        text: "Net 30 from invoice issue. All amounts USD. Tax $0 for this synthetic demo. Approved drafts are not issued invoices.",
      },
    ],
  );
  await makePdf(
    path.join(dir, dirs[1], `${p.id}-completion-report.pdf`),
    p.progress === 100 ? "Completion report" : "Delivery progress report",
    `${p.id}  |  ${p.client}  |  ${["CW-102", "CW-103"].includes(p.id) ? dateOffset(-11) : dateOffset(-1)}`,
    [
      {
        title: "Delivery status",
        text:
          p.progress === 100
            ? "Installation and commissioning complete. Display, audio, control, and conferencing tests passed. Customer training and equipment handover complete. No open technical defects."
            : "Design approved. Equipment procurement is in progress. Installation and commissioning have not begun. Do not bill these milestones.",
      },
      {
        title: "Milestone evidence",
        text: p.milestones
          .map(
            (m) =>
              `${m.id}: ${m.name} - ${m.complete ? "COMPLETE" : "INCOMPLETE"}`,
          )
          .join("\n"),
      },
      {
        title: "Project manager",
        text: `${p.owner}\n${p.id === "CW-101" ? "Customer acceptance not yet received. Final milestone remains blocked." : p.id === "CW-105" ? "Customer handover occurred. Search project records for the acceptance note." : "See project records and invoice register for billing status."}`,
      },
    ],
  );
  if (["CW-102", "CW-103", "CW-105"].includes(p.id))
    await acceptance(
      path.join(
        dir,
        p.id === "CW-105" ? dirs[0] : dirs[2],
        `${p.id}-signed-acceptance.pdf`,
      ),
      p,
    );
  write(
    path.join(dir, dirs[4], "README.md"),
    `# ${p.id} follow-ups\n${p.id === "CW-101" ? `Alex Chan: request signed acceptance from ${p.contact}; due ${dateOffset(1)}. Owner review required before saving a new follow-up.` : p.id === "CW-104" ? `Alex Chan: confirm equipment delivery; due ${dateOffset(2)}.` : "No pending customer request at initial state."}\n`,
  );
  manifest.push({
    projectId: p.id,
    folder: path.relative(root, dir),
    records: "01 Project records/project.json",
  });
}
await acceptance(
  path.join(base, "presenter-only", "CW-101-signed-acceptance.pdf"),
  ps[0],
);
write(
  path.join(base, "configuration", "seed-manifest.json"),
  JSON.stringify(
    {
      version: 1,
      demoDate: DEMO_DATE,
      rootName: "BillReady Demo",
      projects: manifest,
      heroAcceptance: "presenter-only/CW-101-signed-acceptance.pdf",
      excludedFromIngestion: ["presenter-only", "configuration"],
    },
    null,
    2,
  ),
);
write(
  path.join(base, "configuration", "ground-truth.json"),
  JSON.stringify(
    {
      demoDate: DEMO_DATE,
      currency: "USD",
      amountsAre: "integer cents",
      initial: totals(ps),
      afterHeroUpload: { ...totals(ps), ready: 4200000, blocked: 1600000 },
      afterDiscovery: { ...totals(ps), ready: 5800000, blocked: 0 },
      projects: ps.map((p) => ({
        projectId: p.id,
        client: p.client,
        initial: billing(p),
      })),
      heroFinalMilestoneCents: 1800000,
      preparedDoesNotChangeFinancials: true,
    },
    null,
    2,
  ),
);
write(
  path.join(base, "configuration", "project.schema.json"),
  JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["id", "client", "milestones"],
      properties: {
        id: { type: "string", pattern: "^CW-10[1-5]$" },
        client: { type: "string" },
        milestones: {
          type: "array",
          minItems: 3,
          maxItems: 4,
          items: {
            type: "object",
            required: [
              "id",
              "cents",
              "complete",
              "issued",
              "acceptanceRequired",
              "accepted",
              "paidCents",
            ],
            properties: {
              id: { type: "string", pattern: "^M[1-4]$" },
              cents: { type: "integer", minimum: 1 },
              paidCents: { type: "integer", minimum: 0 },
              complete: { type: "boolean" },
              issued: { type: "boolean" },
              acceptanceRequired: { type: "boolean" },
              accepted: { type: "boolean" },
            },
          },
        },
      },
    },
    null,
    2,
  ),
);
execFileSync(
  "zip",
  ["-qr", path.join(base, "BillReady-Box-upload.zip"), "BillReady Demo"],
  { cwd: path.join(base, "upload-to-box") },
);
console.log(
  "Created upload folder, 13 source PDFs, 1 presenter acceptance, manifests and ZIP.",
);
