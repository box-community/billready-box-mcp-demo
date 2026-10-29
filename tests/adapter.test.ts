import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "billready-test-"),
);
process.env.BILLREADY_ADAPTER = "development";
const store = await import("../server/store.ts");
const adapter = await import("../server/adapter.ts");
const { BoxMcpClient } = await import("../server/box-mcp.ts");
const workflow = await import("../server/workflow.ts");
const domain = await import("../server/domain.ts");
store.initialize(adapter.localSeedDocs());
test("missing discovery stays blocked and wrong-project or unsigned evidence cannot unlock billing", async () => {
  await workflow.discover("CW-101");
  assert.equal(domain.billing(store.projects()[0]).blocked, 1800000);
  const wrong = {
    ...store
      .documents()
      .find((d) => d.name === "CW-102-signed-acceptance.pdf")!,
    id: "wrong-project-fixture",
    projectId: "CW-101",
  };
  await workflow.reassess("CW-101", [wrong]);
  assert.equal(store.documents().find((d) => d.id === wrong.id)?.valid, false);
  const { makePdf } = await import("../server/pdf.ts");
  const unsignedPath = path.join(store.dataDir, "unsigned.pdf");
  await makePdf(unsignedPath, "Unsigned acceptance", "Fixture", [
    {
      title: "Acceptance",
      text:
        "Project ID: CW-101\nClient: Alder & Finch\nMilestone ID: M3\nSigned: NO\nSigner: Morgan Ellis\nDate: " +
        domain.DEMO_DATE +
        "\nStatus: ACCEPTED\nWe accept the completed work for this milestone without reservation.",
    },
  ]);
  await workflow.reassess("CW-101", [
    {
      id: "unsigned-fixture",
      projectId: "CW-101",
      name: "unsigned-acceptance.pdf",
      category: "Acceptance",
      path: unsignedPath,
    },
  ]);
  assert.equal(
    store.documents().find((d) => d.id === "unsigned-fixture")?.valid,
    false,
  );
  assert.equal(domain.billing(store.projects()[0]).ready, 0);
  assert.equal(domain.billing(store.projects()[0]).blocked, 1800000);
  assert.equal(store.projects()[0].milestones[2].acceptanceFileId, undefined);
  // Keep later workflow fixtures independent of these rejected candidates.
  store.put(
    "documents",
    store
      .documents()
      .filter((d) => ![wrong.id, "unsigned-fixture"].includes(d.id)),
  );
});
test("presenter acceptance excluded; wrong-project content rejected, hero verified, approval idempotent", async () => {
  assert.ok(!store.documents().some((d) => d.name.startsWith(".")));
  assert.ok(
    !store
      .documents()
      .some((d) => d.projectId === "CW-101" && d.category === "Acceptance"),
  );
  assert.ok(!store.documents().some((d) => d.path?.includes("presenter-only")));
  const wrong = store
    .documents()
    .find((d) => d.name === "CW-102-signed-acceptance.pdf")!;
  const bad = await adapter.analyze(wrong);
  assert.ok(
    domain.validateAcceptance(
      bad,
      store.projects()[0],
      store.projects()[0].milestones[2],
    ),
  );
  const bytes = fs.readFileSync(
    "demo-kit/presenter-only/CW-101-signed-acceptance.pdf",
  );
  const doc = {
    ...(await adapter.persistFile(
      bytes,
      "hero-test.pdf",
      "CW-101",
      "03 Acceptance",
    )),
    generated: false,
    hash: adapter.hash(bytes),
  };
  store.addDoc(doc);
  const before = domain.totals(store.projects());
  await workflow.reassess("CW-101", [doc]);
  assert.equal(domain.totals(store.projects()).ready - before.ready, 1800000);
  const proposal = workflow.propose(store.projects()[0], "billing");
  assert.equal(store.documents().filter((d) => d.generated).length, 0);
  const one = await workflow.approve(proposal.id);
  const two = await workflow.approve(proposal.id);
  assert.deepEqual(one.savedIds, two.savedIds);
  assert.equal(one.savedIds.length, 4);
  const final = domain.totals(store.projects());
  assert.equal(final.invoiced, before.invoiced);
  assert.equal(final.outstanding, before.outstanding);
  const mail = store
    .documents()
    .find((d) => d.name === proposal.reference + "-email.json")!;
  const email = JSON.parse(fs.readFileSync(mail.path!, "utf8"));
  assert.equal(email.status, "DRAFT_NOT_SENT");
  assert.ok(email.attachments.some((d: any) => d.id === doc.id));
  assert.ok(
    email.attachments.some((d: any) => d.name === proposal.reference + ".pdf"),
  );
  const invoice = store
    .documents()
    .find((d) => d.name === proposal.reference + ".pdf")!;
  const text = await adapter.documentText(invoice);
  assert.ok(text.includes("$18,000"));
  assert.ok(text.includes("DRAFT"));
  assert.ok(text.includes("Tax: $0"));
  assert.equal(
    workflow.propose(store.projects()[0], "billing").id,
    proposal.id,
  );
});
test("discovery finds Northstar acceptance in project records", async () => {
  assert.equal(store.projects()[4].milestones[2].accepted, false);
  await workflow.discover("CW-105");
  const p = store.projects()[4];
  assert.equal(p.milestones[2].accepted, true);
  assert.equal(domain.billing(p).ready, 1600000);
  assert.ok(
    store.documents().find((d) => d.id === p.milestones[2].acceptanceFileId)
      ?.category === "Project records",
  );
});
test("external inbox refresh applies the same validation", async () => {
  const dir = path.join(store.dataDir, "external-inbox", "CW-101");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(
    "demo-kit/presenter-only/CW-101-signed-acceptance.pdf",
    path.join(dir, "external-acceptance.pdf"),
  );
  await workflow.discover("CW-101");
  assert.ok(
    store.documents().some((d) => d.id.startsWith("external-") && d.valid),
  );
});
test("remote MCP client uses actual tool schemas and rejects missing required arguments", async () => {
  const r = new BoxMcpClient();
  let called: any;
  r.client = {
    callTool: async (args: any) => {
      called = args;
      return { content: [{ type: "text", text: '{"entries":[]}' }] };
    },
  } as any;
  r.tools = [
    {
      name: "list_folder_content_by_folder_id",
      inputSchema: {
        type: "object",
        properties: {
          folder_id: { type: "string" },
          limit: { type: "integer" },
        },
        required: ["folder_id"],
        additionalProperties: false,
      },
    },
  ];
  await r.callBoxTool("list_folder_content_by_folder_id", {
    folder_id: "123",
    limit: 100,
  });
  assert.deepEqual(called.arguments, { folder_id: "123", limit: 100 });
  await assert.rejects(
    () => r.callBoxTool("list_folder_content_by_folder_id", {}),
    /Invalid arguments/,
  );
  await assert.rejects(() => r.callBoxTool("not_a_tool", {}), /unavailable/);
});
test("transfer URL scope rejects non-Box destinations", () => {
  assert.ok(adapter.safeTransferUrl("https://upload.box.com/a"));
  assert.throws(() =>
    adapter.safeTransferUrl("https://box.com.evil.example/a"),
  );
  assert.throws(() => adapter.safeTransferUrl("http://upload.box.com/a"));
});

test("ready seed milestones link verified acceptance before preparing billing", async () => {
  const before = domain.totals(store.projects());
  const draft = await workflow.prepareBilling("CW-102");
  const p = store.projects().find((p) => p.id === "CW-102")!;
  const acceptance = p.milestones[2].acceptanceFileId;
  assert.ok(acceptance);
  assert.ok(store.documents().find((d) => d.id === acceptance)?.valid);
  assert.ok(draft.attachments.includes(acceptance!));
  assert.ok(
    draft.attachments.some(
      (id) =>
        store.documents().find((d) => d.id === id)?.name ===
        "CW-102-project-agreement.pdf",
    ),
  );
  await workflow.approve(draft.id);
  assert.equal(domain.totals(store.projects()).invoiced, before.invoiced);
});

test("technical manifests cannot become customer email attachments", () => {
  store.resetStore();
  store.initialize(adapter.localSeedDocs());
  const proposal = workflow.propose(store.projects()[0], "followup");
  const manifest = store
    .documents()
    .find((d) => d.projectId === "CW-101" && d.name === "project.json")!;
  assert.ok(manifest);
  assert.throws(
    () =>
      workflow.editProposal(proposal.id, {
        ...proposal,
        attachments: [manifest.id],
      }),
    /customer-facing documents/,
  );
});
