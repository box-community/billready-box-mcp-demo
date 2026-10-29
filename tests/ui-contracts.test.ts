import test from "node:test";
import assert from "node:assert/strict";
import {
  isCustomerDocument,
  documentLabel,
} from "../shared/customer-documents.ts";
import { streamRequest } from "../src/stream-request.ts";
test("customer document lists exclude manifests and setup notes, with friendly output names", () => {
  for (const name of [
    "README.md",
    "README.txt",
    "project.json",
    "DRAFT-CW-101-M3-email.json",
  ])
    assert.equal(isCustomerDocument({ name }), false);
  for (const name of [
    "CW-101-acceptance.pdf",
    "DRAFT-CW-101-M3-packet.pdf",
    "DRAFT-CW-101-M3-email.txt",
  ])
    assert.equal(isCustomerDocument({ name }), true);
  assert.equal(documentLabel({ name: "DRAFT-CW-101-M3.pdf" }), "Draft invoice");
  assert.equal(
    documentLabel({ name: "DRAFT-CW-101-M3-packet.pdf" }),
    "Supporting billing packet",
  );
});
test("workflow stream handles split events and Unicode, retaining actual call updates", async () => {
  const original = globalThis.fetch;
  const text =
    'event: tool\ndata: {"seq":1,"tool":"get_upload_url","status":"running"}\n\nevent: tool\ndata: {"seq":1,"tool":"get_upload_url","status":"completed"}\n\nevent: reply\ndata: {"valid":true,"message":"Acceptance verified ✓"}\n\n';
  const bytes = new TextEncoder().encode(text);
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 7)
            controller.enqueue(bytes.slice(i, i + 7));
          controller.close();
        },
      }),
    );
  try {
    const events: any[] = [];
    const reply = await streamRequest<{ valid: boolean; message: string }>(
      "/fixture",
      {},
      (entry) => events.push(entry),
    );
    assert.equal(reply.valid, true);
    assert.match(reply.message, /✓/);
    assert.deepEqual(
      events.map((e) => e.status),
      ["running", "completed"],
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("workflow stream errors never return a success result", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response('event: failure\ndata: {"error":"Box unavailable"}\n\n');
    await assert.rejects(
      () => streamRequest("/fixture", {}, () => {}),
      /Box unavailable/,
    );
    globalThis.fetch = async () => new Response(": keepalive\n\n");
    await assert.rejects(
      () => streamRequest("/fixture", {}, () => {}),
      /Connection interrupted/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
