import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeTrace,
  traceCall,
  withTrace,
  type Trace,
} from "../server/tracing.ts";
test("trace payloads redact structured and embedded credentials and transfer URLs", () => {
  const value = sanitizeTrace({
    folder_id: "123",
    access_token: "sensitive-access",
    authorization: "Bearer private",
    nested: { download_url: "https://dl.boxcloud.com/private?token=secret" },
    text: JSON.stringify({
      refresh_token: "private-refresh",
      url: "https://upload.box.com/api?token=private-query",
    }),
    prompt: "Use Bearer abc.def.ghi at https://upload.box.com/private",
  });
  const encoded = JSON.stringify(value);
  for (const secret of [
    "sensitive-access",
    "private-refresh",
    "private-query",
    "abc.def.ghi",
    "boxcloud.com",
    "upload.box.com",
  ])
    assert.ok(!encoded.includes(secret), secret);
  assert.ok(encoded.includes("123"));
  assert.ok(JSON.stringify(sanitizeTrace("a".repeat(50000))).length < 13000);
});
test("parallel request traces remain scoped and publish running then completed or failed", async () => {
  const a: Trace[] = [],
    b: Trace[] = [];
  await Promise.all([
    withTrace(
      (e) => a.push(e),
      () =>
        traceCall("list_folder", { folder_id: "123" }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { entries: [] };
        }),
    ),
    withTrace(
      (e) => b.push(e),
      () => traceCall("other_request", {}, async () => "ok"),
    ),
  ]);
  assert.deepEqual(
    a.map((e) => e.status),
    ["running", "completed"],
  );
  assert.ok(a.every((e) => e.tool === "list_folder"));
  assert.ok(b.every((e) => e.tool === "other_request"));
  assert.equal(a[1].resultSummary, "0 items returned");
  assert.equal(typeof a[1].durationMs, "number");
  await assert.rejects(
    withTrace(
      (e) => a.push(e),
      () =>
        traceCall("failed", {}, async () => {
          throw Error("Bearer secret-token");
        }),
    ),
  );
  assert.equal(a.at(-1)?.status, "failed");
  assert.ok(!a.at(-1)?.error?.includes("secret-token"));
});
