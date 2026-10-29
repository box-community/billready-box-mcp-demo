import "dotenv/config";
import { boxMcp } from "../server/box-mcp.ts";
import fs from "node:fs";
import path from "node:path";
import {
  documents,
  get,
  put,
  resetStore,
  initialize,
  dataDir,
} from "../server/store.ts";
import { mode, localSeedDocs, remote } from "../server/adapter.ts";
const owned = documents().filter(
  (d) =>
    d.generated ||
    d.hash ||
    get<string[]>("externalDemoOwnedIds", []).includes(d.id),
);
const apply = process.argv.includes("--apply");
console.log(
  `${apply ? "APPLY" : "DRY RUN"} · ${mode} adapter · root ${process.env.BOX_DEMO_ROOT_ID || "local demo only"}`,
);
console.log("Demo-owned artifacts and acceptance uploads:");
for (const d of owned)
  console.log(`${d.boxId ? "Box file " + d.boxId : d.id}  ${d.name}`);
console.log(
  "Reset also clears workflow state, proposals, conversation, analysis results, local previews, and external-inbox test documents. Original seed sources are preserved.",
);
if (!apply) {
  console.log(
    "No changes made. Stop the app, then run npm run reset -- --apply. In live mode apply moves only these recorded files to a rehearsal archive under the demo root; original seed sources remain in place.",
  );
  process.exit(0);
}
let liveDocs = documents();
let mappings: any = {};
if (mode === "live") {
  if (!process.env.BOX_DEMO_ROOT_ID) throw Error("Missing demo root ID");
  const receipts = await remote.archiveOwned(owned);
  if (receipts.length) {
    const receiptPath = path.join(dataDir, "reset-archive-receipts.json");
    const prior = fs.existsSync(receiptPath)
      ? JSON.parse(fs.readFileSync(receiptPath, "utf8"))
      : [];
    fs.writeFileSync(
      receiptPath,
      JSON.stringify([...prior, ...receipts], null, 2),
    );
    console.log(
      "Archived " +
        receipts.length +
        " demo-owned files under the configured demo root. No files deleted.",
    );
  }
  liveDocs = await remote.discover();
  const remains = owned.filter(
    (d) => d.boxId && liveDocs.some((x) => x.boxId === d.boxId),
  );
  if (remains.length)
    throw Error(
      "Reset incomplete: active owned artifacts remain. Retry safely.",
    );
  mappings = {
    mappedRoot: get("mappedRoot", ""),
    boxFolders: get("boxFolders", {}),
    allowedFolders: get("allowedFolders", []),
    allowedFiles: get("allowedFiles", []),
  };
}
for (const dir of ["content", "previews", "external-inbox"]) {
  const target = path.join(dataDir, dir);
  if (path.dirname(target) !== dataDir) throw Error("Unsafe reset path");
  fs.rmSync(target, { recursive: true, force: true });
}
resetStore();
initialize(mode === "live" ? liveDocs : localSeedDocs());
for (const [k, v] of Object.entries(mappings)) put(k, v);
console.log(
  "Restored initial demo workflow. Restart the app. Original source tree preserved.",
);
if (mode === "live") await boxMcp.client?.close();
