import "dotenv/config";
import { boxMcp } from "../server/box-mcp.ts";
import fs from "node:fs";
import { remote } from "../server/adapter.ts";
import { get, put } from "../server/store.ts";
// Intentionally bypasses BillReady's upload route: add a demo-owned source directly through remote Box MCP.
const bytes = fs.readFileSync(
  "demo-kit/presenter-only/CW-101-signed-acceptance.pdf",
);
const d = await remote.persist(
  bytes,
  "CW-101-external-acceptance-check.pdf",
  "CW-101",
  "01 Project records",
);
put("externalDemoOwnedIds", [
  ...new Set([...get<string[]>("externalDemoOwnedIds", []), d.id]),
]);
fs.writeFileSync(
  "verification/live-external-add.json",
  JSON.stringify(
    {
      fileId: d.boxId,
      folderId: d.folderId,
      name: d.name,
      addedOutsideAppUpload: true,
    },
    null,
    2,
  ),
);
console.log(
  "Added one explicitly tracked rehearsal acceptance directly to project records:",
  d.boxId,
);
await boxMcp.client?.close();
