import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireEmployee } from "./context.ts";
import { boxMcp } from "./box-mcp.ts";
import { remote } from "./box-content.ts";
import {
  get,
  put,
  projects,
  documents,
  initialize,
  resetStore,
} from "./store.ts";
import { seedProjects } from "./domain.ts";

// No Box writes, account-wide discovery or AI: verify manual cleanup of the hero project.
export async function resetAfterCleanup() {
  const scope = requireEmployee(),
    root = scope.workspace?.id;
  if (!root || get("mappedRoot", "") !== root)
    throw Error("Load your selected workspace once before using quick reset.");
  const candidates = projects().filter((p) => p.businessId === "CW-101");
  if (candidates.length !== 1)
    throw Error(
      "Quick reset requires one Alder & Finch sample project in this workspace.",
    );
  const p = candidates[0],
    seed = seedProjects()[0];
  if (
    p.client !== seed.client ||
    JSON.stringify(
      p.milestones.map((m) => [m.id, m.cents, m.complete, m.issued]),
    ) !==
      JSON.stringify(
        seed.milestones.map((m) => [m.id, m.cents, m.complete, m.issued]),
      )
  )
    throw Error(
      "Quick reset is only for the original Alder & Finch sample workflow.",
    );
  await boxMcp.callBoxTool("get_folder_details", { folder_id: root });
  const details: any = await boxMcp.callBoxTool("get_folder_details", {
    folder_id: p.folderId!,
    fields: ["id", "name", "path_collection"],
  });
  const ancestors =
    details.path_collection?.entries || details.pathCollection?.entries;
  if (
    p.folderId !== root &&
    (!Array.isArray(ancestors) ||
      !ancestors.some((f: any) => String(f.id) === root))
  )
    throw Error(
      "Cannot verify that the project is inside your selected workspace. Refresh its folder mapping first.",
    );
  const folders = get<Record<string, string>>("boxFolders", {}),
    beforeDocs = documents();
  const categories = new Set(["03 Acceptance", "04 Billing", "05 Follow-ups"]);
  for (const d of beforeDocs.filter(
    (d) => d.projectId === p.id && (d.valid || /accept|handover/i.test(d.name)),
  )) {
    const mapped = Object.entries(folders).find(
      ([key, id]) => key.startsWith(p.id + "/") && id === d.folderId,
    );
    if (mapped) categories.add(mapped[0].slice(p.id.length + 1));
  }
  const children = await remote.list(p.folderId!);
  const checked = await Promise.all(
    [...categories].map(async (category) => {
      const id = folders[p.id + "/" + category];
      if (
        !id ||
        !children.some((e) => e.type === "folder" && String(e.id) === id)
      )
        throw Error(
          "Project folders changed. Refresh the workspace before resetting.",
        );
      return { category, id, entries: await remote.list(id) };
    }),
  );
  const blockers = checked.flatMap(({ category, entries }) =>
    entries
      .filter((e) => {
        if (category === "03 Acceptance")
          return e.type === "folder" || /\.(pdf|docx?)$/i.test(e.name);
        if (category === "04 Billing" || category === "05 Follow-ups")
          return !/^readme\.(md|txt)$/i.test(e.name) && !e.name.startsWith(".");
        return (
          /accept|handover/i.test(e.name) && /\.(pdf|docx?)$/i.test(e.name)
        );
      })
      .map((e) => category + "/" + e.name),
  );
  if (blockers.length)
    throw Error(
      "Box cleanup is not complete. Remove or move these rehearsal files, then retry: " +
        blockers.join(", "),
    );
  const removedFolders = new Set(
    checked
      .filter((f) =>
        ["03 Acceptance", "04 Billing", "05 Follow-ups"].includes(f.category),
      )
      .map((f) => f.id),
  );
  const currentFiles = new Set(
    checked.flatMap((f) =>
      f.entries.filter((e) => e.type === "file").map((e) => String(e.id)),
    ),
  );
  const retained = beforeDocs.filter(
    (d) =>
      d.projectId !== p.id ||
      (!removedFolders.has(d.folderId || "") &&
        (!checked.some((f) => f.id === d.folderId) ||
          currentFiles.has(d.boxId || ""))),
  );
  const restored = projects().map((project) =>
    project.id !== p.id
      ? project
      : {
          ...project,
          milestones: project.milestones.map((m) =>
            m.issued || !m.acceptanceRequired
              ? m
              : { ...m, accepted: false, acceptanceFileId: undefined },
          ),
        },
  );
  const keep = {
    mappedRoot: root,
    boxFolders: folders,
    allowedFolders: get("allowedFolders", []),
    projects: restored,
    documents: retained,
    allowedFiles: retained.map((d) => d.boxId),
    discovery: get("discovery", { status: "ready", warnings: [] }),
  };
  const base = path.resolve(process.env.EMPLOYEE_DATA_DIR || "data/employees");
  const receiptDir = path.join(base, "_receipts");
  if (fs.existsSync(receiptDir))
    for (const name of fs.readdirSync(receiptDir)) {
      if (!name.endsWith(".json")) continue;
      const file = path.join(receiptDir, name),
        receipt = JSON.parse(fs.readFileSync(file, "utf8"));
      if (receipt.proposal?.projectId === p.id) fs.unlinkSync(file);
    }
  // Other sessions sharing the same Box workspace rebuild their stale local state on next use.
  const epoch = path.join(base, "_reset-epochs", root);
  fs.mkdirSync(path.dirname(epoch), { recursive: true, mode: 0o700 });
  fs.writeFileSync(epoch, randomUUID(), { mode: 0o600 });
  resetStore();
  initialize(retained);
  for (const [key, value] of Object.entries(keep)) put(key, value);
  scope.traces.length = 0;
  return {
    message:
      "Box cleanup confirmed. Alder & Finch is back to $0 ready / $18,000 blocked. Chats and draft state are cleared; other project amounts are preserved. No files were changed in Box.",
    projectId: p.id,
  };
}
