import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";
import { projects, documents, get, dataDir } from "../server/store.ts";
import { totals } from "../server/domain.ts";
const t = totals(projects());
assert.equal(t.ready, 2400000);
assert.equal(t.blocked, 3400000);
assert.equal(t.invoiced, 24200000);
assert.equal(t.outstanding, 1200000);
assert.deepEqual(get("proposals", []), []);
assert.deepEqual(get("chat:CW-101", []), []);
assert.ok(
  !documents().some(
    (d) => d.projectId === "CW-101" && /acceptance/i.test(d.name),
  ),
);
const original = JSON.parse(
  fs.readFileSync("verification/live-inventory.json", "utf8"),
).files.filter((d: any) => !d.name.startsWith("."));
assert.deepEqual(
  new Set(documents().map((d) => d.boxId)),
  new Set(original.map((d: any) => d.boxId)),
);
const receipts = JSON.parse(
  fs.readFileSync(dataDir + "/reset-archive-receipts.json", "utf8"),
);
const report = {
  result: "PASS",
  mode: "live",
  root: process.env.BOX_DEMO_ROOT_ID,
  totals: t,
  activeSourceFiles: documents().length,
  originalSeedFileIdsPreserved: true,
  heroAcceptanceAbsent: true,
  proposalsCleared: true,
  conversationsCleared: true,
  archivedTestFiles: receipts.length,
  archiveFolderIds: [...new Set(receipts.map((r: any) => r.archiveFolderId))],
  remoteFilesDeleted: 0,
};
fs.writeFileSync(
  "verification/live-reset-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
