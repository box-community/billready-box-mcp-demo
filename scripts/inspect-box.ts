import "dotenv/config";
import { boxMcp } from "../server/box-mcp.ts";
import fs from "node:fs";
import path from "node:path";
await boxMcp.connect();
const out = path.resolve("verification/box-tool-schemas.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify(
    boxMcp.tools.map((t) => ({
      name: t.name,
      inputSchema: t.inputSchema,
      description: t.description,
    })),
    null,
    2,
  ),
);
console.log(
  `Saved ${boxMcp.tools.length} actual remote Box MCP schemas to ${out}. No credentials saved.`,
);
await boxMcp.client?.close();
