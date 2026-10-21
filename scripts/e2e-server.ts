import fs from "node:fs";
import path from "node:path";
process.env.PORT = "4311";
process.env.DATA_DIR = path.resolve("data/e2e");
process.env.BILLREADY_ADAPTER = "development";
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
await import("../server/index.ts");
