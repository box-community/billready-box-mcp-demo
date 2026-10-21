import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const data = path.resolve("data/e2e");
const root = path.resolve("demo-kit/upload-to-box");
function digest(dir: string) {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      e.isDirectory() ? walk(f) : files.push(f);
    }
  };
  walk(dir);
  const h = createHash("sha256");
  for (const f of files.sort()) {
    h.update(path.relative(dir, f));
    h.update(fs.readFileSync(f));
  }
  return h.digest("hex");
}
const before = digest(root);
const env = {
  ...process.env,
  DATA_DIR: data,
  BILLREADY_ADAPTER: "development",
};
const preview = execFileSync("npx", ["tsx", "scripts/reset.ts"], {
  env,
  encoding: "utf8",
});
assert.ok(preview.includes("DRY RUN"));
assert.ok(preview.includes("DRAFT-CW-101-M3.pdf"));
const apply = execFileSync("npx", ["tsx", "scripts/reset.ts", "--apply"], {
  env,
  encoding: "utf8",
});
assert.ok(apply.includes("Restored initial"));
process.env.DATA_DIR = data;
process.env.BILLREADY_ADAPTER = "development";
const { projects, documents, get } = await import("../server/store.ts");
const { totals } = await import("../server/domain.ts");
const t = totals(projects());
assert.equal(t.ready, 2400000);
assert.equal(t.blocked, 3400000);
assert.equal(t.invoiced, 24200000);
assert.equal(t.outstanding, 1200000);
assert.deepEqual(get("proposals", []), []);
assert.deepEqual(get("chat:CW-101", []), []);
assert.ok(
  !documents().some(
    (d) => d.projectId === "CW-101" && d.category === "Acceptance",
  ),
);
assert.equal(before, digest(root));
const report = {
  result: "PASS",
  mode: "development",
  scope: "isolated data/e2e",
  sequence: [
    "initial",
    "wrong acceptance",
    "follow-up approved",
    "hero upload",
    "billing approved",
    "reload",
    "discovery",
    "dry-run reset",
    "apply reset",
    "initial restored",
  ],
  seedSourceHashPreserved: true,
  totals: t,
  proposals: 0,
  heroAcceptanceIndexed: false,
};
fs.writeFileSync(
  "verification/reset-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
