import test from "node:test";
import assert from "node:assert/strict";
import {
  seedProjects,
  billing,
  totals,
  validateAcceptance,
  assertBillable,
  dateOffset,
} from "../server/domain.ts";
test("all five project totals reconcile in exact cents", () => {
  const ps = seedProjects();
  assert.equal(ps.length, 5);
  const t = totals(ps);
  assert.deepEqual(t, {
    value: 33600000,
    invoiced: 24200000,
    outstanding: 1200000,
    thisMonth: 24200000,
    future: 3600000,
    blocked: 3400000,
    ready: 2400000,
  });
  for (const p of ps) {
    const b = billing(p);
    assert.equal(b.value, b.invoiced + b.future + b.ready + b.blocked);
  }
});
test("hero acceptance moves only completed unissued billing", () => {
  const ps = seedProjects(),
    before = totals(ps);
  ps[0].milestones[2].accepted = true;
  const after = totals(ps);
  assert.equal(after.ready - before.ready, 1800000);
  assert.equal(before.blocked - after.blocked, 1800000);
  assert.equal(after.invoiced, before.invoiced);
  assert.equal(after.outstanding, before.outstanding);
});
test("acceptance must name correct project, client, milestone and have signed affirmation", () => {
  const p = seedProjects()[0],
    m = p.milestones[2];
  const good = {
    projectId: p.id,
    client: p.client,
    milestoneId: m.id,
    signed: true,
    accepted: true,
    signer: "Morgan Ellis",
    date: dateOffset(0),
    quote: "We accept the completed work.",
  };
  assert.equal(validateAcceptance(good, p, m), null);
  for (const patch of [
    { projectId: "CW-102" },
    { client: "Other" },
    { milestoneId: "M2" },
    { signed: false },
    { accepted: false },
    { date: dateOffset(1) },
    { quote: "" },
  ])
    assert.ok(validateAcceptance({ ...good, ...patch }, p, m));
});
test("prevents issued, incomplete, blocked and duplicate invoice milestones", () => {
  const ps = seedProjects();
  for (const [p, ids] of [
    [ps[0], ["M1"]],
    [ps[0], ["M3"]],
    [ps[3], ["M2"]],
    [ps[1], ["M3", "M3"]],
  ] as const)
    assert.throws(() => assertBillable(p, [...ids]));
  assert.equal(assertBillable(ps[1], ["M3"])[0].cents, 2400000);
});

test("discovery cannot claim acceptance from unrelated or unverified evidence", async () => {
  const { discoveryReply } = await import("../server/discovery-result.ts");
  const p = seedProjects()[0];
  const missing = discoveryReply(p, []);
  assert.match(missing.text, /did not find verified signed acceptance/);
  assert.match(missing.text, /\$18,000 remains blocked/);
  assert.deepEqual(missing.sources, []);
  const doc = {
    id: "box-proof",
    projectId: p.id,
    name: "signed-acceptance.pdf",
    category: "Acceptance",
    valid: true,
  };
  p.milestones[2].accepted = true;
  p.milestones[2].acceptanceFileId = doc.id;
  for (const docs of [
    [],
    [{ ...doc, valid: false }],
    [{ ...doc, projectId: "CW-102" }],
  ]) {
    assert.match(discoveryReply(p, docs).text, /remains blocked/);
    assert.deepEqual(discoveryReply(p, docs).sources, []);
  }
  const found = discoveryReply(p, [doc]);
  assert.match(found.text, /found and verified/);
  assert.match(found.text, /\$18,000 is ready to bill/);
  assert.deepEqual(found.sources, [doc.id]);
});
