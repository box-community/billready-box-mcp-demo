import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { remote } from "../server/adapter.ts";
await remote.connect();
const out = path.resolve("verification/box-tool-schemas.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify(
    remote.tools.map((t) => ({
      name: t.name,
      inputSchema: t.inputSchema,
      description: t.description,
    })),
    null,
    2,
  ),
);
console.log(
  `Saved ${remote.tools.length} actual remote Box MCP schemas to ${out}. No credentials saved.`,
);
await remote.client?.close();
