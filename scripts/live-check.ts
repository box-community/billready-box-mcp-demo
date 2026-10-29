import "dotenv/config";
import { boxMcp } from "../server/box-mcp.ts";
import fs from "node:fs";
import { remote } from "../server/adapter.ts";
import { get, put } from "../server/store.ts";
const root = process.env.BOX_DEMO_ROOT_ID;
if (!root || root === "0") throw Error("Set the specific demo root first");
const details: any = await boxMcp.callBoxTool("get_folder_details", {
  folder_id: root,
  fields: [
    "id",
    "name",
    "shared_link",
    "has_collaborations",
    "is_collaboration_restricted_to_enterprise",
  ],
});
console.log(
  "Root details shape:",
  typeof details,
  typeof details === "object" ? Object.keys(details) : "text",
);
fs.mkdirSync("verification", { recursive: true });
fs.writeFileSync(
  "verification/live-root-details.json",
  JSON.stringify(
    Object.fromEntries(
      [
        "id",
        "name",
        "type",
        "hasCollaborations",
        "isCollaborationRestrictedToEnterprise",
      ]
        .filter((k) => details[k] !== undefined)
        .map((k) => [k, details[k]]),
    ),
    null,
    2,
  ),
);
const docs = await remote.discover();
put("documents", docs);
console.log(
  "Remote inventory:",
  docs.length,
  "files;",
  Object.keys(get("boxFolders", {})).length,
  "project folder mappings",
);
console.log(
  "Hero initial acceptance candidates:",
  docs.filter((d) => d.projectId === "CW-101" && /acceptance/i.test(d.name))
    .length,
);
fs.writeFileSync(
  "verification/live-inventory.json",
  JSON.stringify(
    {
      root,
      files: docs,
      mappings: get("boxFolders", {}),
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
await boxMcp.client?.close();
