import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { remote, safeTransferUrl } from "../server/adapter.ts";
import { get } from "../server/store.ts";
const apply = process.argv.includes("--apply");
const docs = await remote.discover();
const targets = docs.filter(
  (d) => d.name.endsWith(".pdf") && !d.name.includes("-acceptance-"),
);
console.log(
  (apply ? "APPLY" : "DRY RUN") +
    " · sync original seed PDF versions only · " +
    targets.length +
    " files",
);
const root = path.resolve("demo-kit/upload-to-box/BillReady Demo");
const local = new Map<string, string>();
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".pdf")) local.set(e.name, p);
  }
};
walk(root);
const receipts = [];
for (const d of targets) {
  const file = local.get(d.name);
  if (!file) continue;
  console.log(`${d.boxId} ${d.name}`);
  if (!apply) continue;
  const bytes = fs.readFileSync(file);
  const raw: any = await remote.semantic("get_upload_url", {
    file_name: d.name,
    file_size: bytes.length,
    folder_id: d.folderId,
    file_id: d.boxId,
  });
  const find = (x: any): any => {
    if (x && typeof x === "object") {
      if (x.upload_url) return x;
      for (const v of Object.values(x)) {
        const found = find(v);
        if (found) return found;
      }
    } else if (typeof x === "string") {
      try {
        return find(JSON.parse(x));
      } catch {}
    }
  };
  const info = find(raw);
  if (!info) throw Error("No version upload URL returned");
  const form = new FormData();
  form.set(
    "attributes",
    JSON.stringify({ name: d.name, parent: { id: d.folderId } }),
  );
  form.set(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    d.name,
  );
  const r = await fetch(safeTransferUrl(info.upload_url), {
    method: "POST",
    headers: info.upload_token
      ? { Authorization: `Bearer ${info.upload_token}` }
      : {},
    body: form,
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw Error("Version transfer failed: " + r.status);
  const result: any = await r.json();
  const id = String(result.entries?.[0]?.id || result.id || result.file_id);
  if (id !== d.boxId)
    throw Error("Version upload changed file ID unexpectedly");
  if (!(await remote.list(d.folderId!)).some((x: any) => String(x.id) === id))
    throw Error("Read-after-write failed");
  receipts.push({
    fileId: id,
    name: d.name,
    versionId: result.entries?.[0]?.file_version?.id || null,
  });
}
if (apply)
  fs.writeFileSync(
    "verification/live-seed-version-sync.json",
    JSON.stringify(
      {
        root: process.env.BOX_DEMO_ROOT_ID,
        files: receipts,
        originalFileIdsPreserved: true,
      },
      null,
      2,
    ),
  );
await remote.client?.close();
