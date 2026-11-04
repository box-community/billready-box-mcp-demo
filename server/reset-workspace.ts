import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { requireEmployee } from "./context.ts";
import { remote } from "./box-content.ts";
import {
  projects,
  get,
  put,
  initialize,
  resetStore,
} from "./store.ts";
import { seedProjects } from "./domain.ts";
import { discover } from "./workflow.ts";

// Reset only the supplied sample workflow. Arbitrary customer workspaces are excluded.
export async function previewReset() {
  const scope = requireEmployee();
  if (!scope.workspace) throw Error("Choose a workspace folder first.");
  const found = await remote.discover();
  const seedFiles = new Set<string>();
  // The shipped tree is the canonical baseline; presenter-only acceptance is outside it.
  const seedRoot = path.resolve(
    "demo-kit/upload-to-box/BillReady Demo/Projects",
  );
  const walk = (dir: string, project: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file, project);
      else
        seedFiles.add(
          project +
            "/" +
            path
              .relative(path.join(seedRoot, project), file)
              .split(path.sep)
              .join("/"),
        );
    }
  };
  for (const entry of fs.readdirSync(seedRoot, { withFileTypes: true }))
    if (entry.isDirectory()) walk(path.join(seedRoot, entry.name), entry.name);
  const selected = projects();
  if (!selected.length) throw Error("No supported sample projects to reset.");
  for (const p of selected) {
    const seed = seedProjects().find((s) => s.id === p.businessId);
    if (
      !seed ||
      seed.client !== p.client ||
      JSON.stringify(
        seed.milestones.map((m) => [m.id, m.cents, m.complete, m.issued]),
      ) !==
        JSON.stringify(
          p.milestones.map((m) => [m.id, m.cents, m.complete, m.issued]),
        )
    )
      throw Error(
        "Reset is available only for the included Clearwave sample projects.",
      );
  }
  const folders = get<Record<string, string>>("boxFolders", {});
  const files = found
    .filter((d) => {
      const p = selected.find((p) => p.id === d.projectId);
      if (!p) return false;
      const category = ["03 Acceptance", "04 Billing", "05 Follow-ups"].find(
        (c) => folders[p.id + "/" + c] === d.folderId,
      );
      if (!category) return false;
      const seed = seedProjects().find((s) => s.id === p.businessId)!;
      const seedDir = fs
        .readdirSync(seedRoot)
        .find((name) => name.startsWith(seed.id + " "));
      return (
        !seedDir || !seedFiles.has(seedDir + "/" + category + "/" + d.name)
      );
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        scope.employee.id,
        scope.workspace.id,
        files.map((d) => [d.id, d.folderId, d.name]),
      ]),
    )
    .digest("hex");
  return {
    workspace: scope.workspace,
    employee: scope.employee,
    files,
    fingerprint,
    message:
      "Archive the listed non-baseline acceptance, billing and follow-up files. Clear local chats, drafts and checkpoints for this Box workspace. Shared-folder collaborators see the same Box changes; their local workspace state refreshes on next use. Original sample documents, OAuth credentials and other Box workspaces are preserved.",
  };
}
export async function applyReset(fingerprint: string) {
  const plan = await previewReset();
  if (plan.fingerprint !== fingerprint)
    throw Error(
      "Workspace contents changed. Preview the reset again before applying.",
    );
  await remote.archiveOwned(plan.files);
  const receipts = get<any[]>("resetArchiveReceipts", []);
  const remaining = await remote.discover();
  if (plan.files.some((d) => remaining.some((f) => f.boxId === d.boxId)))
    throw Error("Archive verification incomplete. Preview and retry.");
  const auditDir = path.resolve(
    process.env.EMPLOYEE_DATA_DIR || "data/employees",
    "_reset-audit",
  );
  fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(auditDir, plan.workspace.id + "-" + Date.now() + ".json"),
    JSON.stringify({
      employee: plan.employee.id,
      workspace: plan.workspace.id,
      receipts,
    }),
    { mode: 0o600 },
  );
  // Invalidate state for this Box folder across employee sessions, preserving other folders.
  const resetProjectIds = projects().map((p) => p.id);
  const marker = path.resolve(
    process.env.EMPLOYEE_DATA_DIR || "data/employees",
    "_reset-epochs",
    plan.workspace.id,
  );
  fs.mkdirSync(path.dirname(marker), { recursive: true, mode: 0o700 });
  fs.writeFileSync(marker, randomUUID(), { mode: 0o600 });
  const receiptDir = path.resolve(
    process.env.EMPLOYEE_DATA_DIR || "data/employees",
    "_receipts",
  );
  if (fs.existsSync(receiptDir))
    for (const name of fs.readdirSync(receiptDir)) {
      if (!name.endsWith(".json")) continue;
      const f = path.join(receiptDir, name),
        saved = JSON.parse(fs.readFileSync(f, "utf8"));
      if (resetProjectIds.includes(saved.proposal?.projectId)) fs.unlinkSync(f);
    }
  resetStore();
  initialize([]);
  await discover();
  requireEmployee().traces.length = 0;
  return {
    archived: receipts.length,
    workspace: plan.workspace,
    message:
      "Workspace reset. Original sample evidence has been rechecked. No Box files were deleted.",
  };
}
