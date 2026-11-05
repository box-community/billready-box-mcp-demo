import { currentEmployee, requireEmployee, workspaceRoot } from "./context.ts";
import { projects } from "./store.ts";
import { projectRecord } from "./project-record.ts";
import { boxMcp } from "./box-mcp.ts";
import { get, put, type Doc } from "./store.ts";
import { traceCall } from "./tracing.ts";
export const ARCHIVE_NAME = "BillReady Rehearsal Archive";

/**
 * Map billing workflows onto the current employee's accessible Box folders and files.
 * Tool calls go through BoxMcpClient; binary transfers use URLs issued by those tools.
 */
export class RemoteBox {
  /** Read every folder page; an incomplete inventory must not imply evidence is missing. */
  async list(folderId: string) {
    const entries: any[] = [];
    let offset = 0;
    do {
      const r: any = await boxMcp.callBoxTool(
        "list_folder_content_by_folder_id",
        {
          folder_id: folderId,
          limit: 100,
          offset,
        },
      );
      const data = r.entries
        ? r
        : r.result?.entries
          ? r.result
          : r.data?.entries
            ? r.data
            : null;
      if (!data)
        throw Error(
          "Unsupported remote folder response; inspect returned schema.",
        );
      if (
        !Array.isArray(data.entries) ||
        (!data.entries.length && offset < (data.total_count ?? offset))
      )
        throw Error(
          "Incomplete folder pagination; refusing to report missing evidence.",
        );
      entries.push(...data.entries);
      offset += data.entries.length;
      if (data.total_count === undefined && data.entries.length === 100)
        throw Error(
          "Pagination metadata missing; cannot safely finish folder inventory.",
        );
      if (offset >= (data.total_count ?? offset)) break;
    } while (true);
    return entries;
  }
  async discover() {
    if (currentEmployee()) return this.discoverEmployee();
    const root = process.env.BOX_DEMO_ROOT_ID;
    if (!root || root === "0" || !/^\d+$/.test(root))
      throw Error(
        "Set BOX_DEMO_ROOT_ID to the uploaded BillReady Demo folder ID (not account root).",
      );
    const details: any = await boxMcp.callBoxTool("get_folder_details", {
      folder_id: root,
    });
    if (details?.name !== "BillReady Demo")
      throw Error("Root folder must be named BillReady Demo.");
    const out: Doc[] = [];
    const folders: Record<string, string> = {};
    const allowed: string[] = [root];
    let count = 0;
    let activeReads = 0;
    const waiters: (() => void)[] = [];
    const inventoryList = async (id: string) => {
      if (activeReads < 4) activeReads++;
      else await new Promise<void>((resolve) => waiters.push(resolve));
      try {
        return await this.list(id);
      } finally {
        const next = waiters.shift();
        if (next) next();
        else activeReads--;
      }
    };
    const walk = async (id: string, parts: string[]) => {
      if (++count > 150)
        throw Error("Demo tree exceeds 150 folders; refusing broad inventory");
      const pid = parts.join("/").match(/CW-10[1-5]/)?.[0];
      if (pid) folders[pid + "/" + (parts.at(-1) || "")] = id;
      await Promise.all(
        (await inventoryList(id)).map(async (e: any) => {
          if (
            e.type === "folder" &&
            !(parts.length === 0 && e.name === ARCHIVE_NAME)
          ) {
            allowed.push(String(e.id));
            await walk(String(e.id), [...parts, e.name]);
          } else if (e.type === "file" && !e.name.startsWith(".")) {
            out.push({
              id: "box-" + e.id,
              boxId: String(e.id),
              folderId: id,
              name: e.name,
              projectId: pid,
              category: parts.some((p) => p === "03 Acceptance")
                ? "Acceptance"
                : parts.some((p) => p === "02 Delivery evidence")
                  ? "Delivery evidence"
                  : parts.some((p) => p === "04 Billing")
                    ? "Billing"
                    : parts.some((p) => p === "05 Follow-ups")
                      ? "Follow-ups"
                      : "Project records",
            });
          }
        }),
      );
    };
    await walk(root, []);
    out.sort((a, b) =>
      `${a.projectId || ""}/${a.category}/${a.name}`.localeCompare(
        `${b.projectId || ""}/${b.category}/${b.name}`,
      ),
    );
    for (const pid of ["CW-101", "CW-102", "CW-103", "CW-104", "CW-105"])
      for (const f of [
        "01 Project records",
        "02 Delivery evidence",
        "03 Acceptance",
        "04 Billing",
        "05 Follow-ups",
      ])
        if (!folders[pid + "/" + f])
          throw Error(`Missing ${pid}/${f} in uploaded tree.`);
    put("mappedRoot", root);
    put("boxFolders", folders);
    put("allowedFolders", allowed);
    put(
      "allowedFiles",
      out.map((d) => d.boxId),
    );
    return out;
  }
  /**
   * Inventory only the selected workspace, with bounded folder reads and traversal.
   * Validate structured project records and scope project IDs to their Box folders;
   * unsupported content produces warnings rather than sample-project fallback.
   */
  async discoverEmployee() {
    const scope = requireEmployee(),
      root = scope.workspace?.id;
    if (!root) throw Error("Choose a workspace folder first.");
    await boxMcp.callBoxTool("get_folder_details", { folder_id: root });
    const files: (Doc & { ancestors: string[] })[] = [];
    const folders: { id: string; name: string; ancestors: string[] }[] = [];
    const warnings: string[] = [];
    let count = 0;
    let activeReads = 0;
    const waiters: (() => void)[] = [];
    const inventoryList = async (id: string) => {
      if (activeReads < 4) activeReads++;
      else await new Promise<void>((resolve) => waiters.push(resolve));
      try {
        return await this.list(id);
      } finally {
        const next = waiters.shift();
        if (next) next();
        else activeReads--;
      }
    };
    const walk = async (id: string, ancestors: string[], names: string[]) => {
      if (++count > 150)
        throw Error("Workspace exceeds 150 folders. Select a smaller folder.");
      let entries: any[];
      try {
        entries = await inventoryList(id);
      } catch (e) {
        if (
          id !== root &&
          /403|404|forbidden|not.found|access.denied/i.test(String(e))
        ) {
          warnings.push("A folder is no longer accessible and was skipped.");
          return;
        }
        throw e;
      }
      await Promise.all(
        entries.map(async (entry) => {
          if (
            entry.type === "folder" &&
            entry.name !== ARCHIVE_NAME &&
            !entry.name.startsWith(".")
          ) {
            folders.push({ id: String(entry.id), name: entry.name, ancestors });
            await walk(
              String(entry.id),
              [...ancestors, String(entry.id)],
              [...names, entry.name],
            );
          } else if (entry.type === "file" && !entry.name.startsWith(".")) {
            files.push({
              id: "box-" + entry.id,
              boxId: String(entry.id),
              ...(entry.etag != null ? { etag: String(entry.etag) } : {}),
              folderId: id,
              name: entry.name,
              ancestors,
              category: names.includes("03 Acceptance")
                ? "Acceptance"
                : names.includes("02 Delivery evidence")
                  ? "Delivery evidence"
                  : names.includes("04 Billing")
                    ? "Billing"
                    : names.includes("05 Follow-ups")
                      ? "Follow-ups"
                      : "Project records",
            });
          }
        }),
      );
    };
    await walk(root, [root], []);
    files.sort((a, b) => a.id.localeCompare(b.id));
    const mapped: Record<string, string> = {},
      discovered = [],
      seen = new Set<string>();
    for (const file of files.filter((f) => f.name === "project.json")) {
      const parent = folders.find((f) => f.id === file.folderId);
      const projectFolder =
        parent?.name === "01 Project records"
          ? parent.ancestors.at(-1)!
          : file.folderId!;
      let record;
      try {
        record = projectRecord(
          await boxMcp.callBoxTool("get_file_content", {
            file_id: file.boxId!,
          }),
        );
      } catch (e) {
        if (!/Unsupported project record/.test(String(e))) throw e;
        warnings.push(
          "A project.json record has an unsupported format and was skipped.",
        );
        continue;
      }
      if (seen.has(record.id))
        throw Error("Duplicate project code in this workspace: " + record.id);
      seen.add(record.id);
      const id = record.id + "~" + projectFolder;
      const projectFolders = folders.filter((f) =>
        f.ancestors.includes(projectFolder),
      );
      const required = [
        "01 Project records",
        "02 Delivery evidence",
        "03 Acceptance",
        "04 Billing",
        "05 Follow-ups",
      ];
      if (
        required.some(
          (name) =>
            !projectFolders.some(
              (f) => f.name === name && f.ancestors.at(-1) === projectFolder,
            ),
        )
      ) {
        warnings.push(record.id + ": missing a required project subfolder.");
        continue;
      }
      const old = projects().find((p) => p.id === id);
      const p = {
        ...record,
        id,
        businessId: record.id,
        folderId: projectFolder,
        milestones: record.milestones.map((m) => {
          const prior = old?.milestones.find(
            (x) =>
              x.id === m.id &&
              x.cents === m.cents &&
              x.complete === m.complete &&
              x.issued === m.issued,
          );
          return {
            ...m,
            accepted: m.issued
              ? m.accepted
              : m.acceptanceRequired
                ? !!prior?.acceptanceFileId && !!prior.accepted
                : m.accepted,
            ...(prior?.acceptanceFileId
              ? { acceptanceFileId: prior.acceptanceFileId }
              : {}),
          };
        }),
      };
      discovered.push(p);
      mapped[id + "/project"] = projectFolder;
      for (const folder of projectFolders)
        mapped[id + "/" + folder.name] = folder.id;
      for (const d of files)
        if (d.ancestors.includes(projectFolder)) d.projectId = id;
    }
    const visible = files.filter(
      (f) =>
        f.projectId ||
        f.ancestors.length === 1 ||
        folders.some((x) => x.id === f.folderId && x.name === "Company"),
    );
    const docs = visible.map(({ ancestors, ...d }) => d);
    put(
      "projects",
      discovered.sort((a, b) => a.businessId.localeCompare(b.businessId)),
    );
    put("mappedRoot", root);
    put("boxFolders", mapped);
    put("allowedFolders", [root, ...Object.values(mapped)]);
    put(
      "allowedFiles",
      docs.map((d) => d.boxId),
    );
    put("discovery", {
      status: discovered.length ? "ready" : "empty",
      warnings,
    });
    const ids = new Set(discovered.map((p) => p.id));
    put(
      "proposals",
      get<any[]>("proposals", []).filter((p) => ids.has(p.projectId)),
    );
    return docs;
  }
  /** Recheck Box access before cached content is used, clearing inaccessible workspace/project state. */
  async verifyAccess(projectId?: string) {
    const scope = requireEmployee();
    if (!scope.workspace) return;
    try {
      await boxMcp.callBoxTool("get_folder_details", {
        folder_id: scope.workspace.id,
      });
    } catch (e) {
      for (const p of projects()) put("chat:" + p.id, []);
      put("projects", []);
      put("documents", []);
      put("proposals", []);
      put("boxFolders", {});
      put("allowedFiles", []);
      put("allowedFolders", []);
      put("activity", []);
      put("chat:overview", []);
      for (const p of projects()) put("chat:" + p.id, []);
      scope.traces.length = 0;
      put("discovery", {
        status: "inaccessible",
        warnings: [
          "Workspace access is unavailable. Choose another folder or reconnect Box.",
        ],
      });
      throw Object.assign(
        Error(
          "Workspace access is unavailable. Choose another folder or reconnect Box.",
        ),
        { status: 403 },
      );
    }
    const visible = projects().filter((p) => !projectId || p.id === projectId);
    for (let i = 0; i < visible.length; i += 4)
      await Promise.all(
        visible.slice(i, i + 4).map(async (p) => {
          try {
            await boxMcp.callBoxTool("get_folder_details", {
              folder_id: p.folderId!,
            });
          } catch (e) {
            if (!/403|404|forbidden|not.found|access.denied/i.test(String(e)))
              throw e;
            put(
              "projects",
              projects().filter((x) => x.id !== p.id),
            );
            put(
              "documents",
              get<Doc[]>("documents", []).filter((d) => d.projectId !== p.id),
            );
            put(
              "proposals",
              get<any[]>("proposals", []).filter((x) => x.projectId !== p.id),
            );
            const mappings = get<Record<string, string>>("boxFolders", {});
            put(
              "boxFolders",
              Object.fromEntries(
                Object.entries(mappings).filter(
                  ([key]) => !key.startsWith(p.id + "/"),
                ),
              ),
            );
            put(
              "allowedFiles",
              get<Doc[]>("documents", []).map((d) => d.boxId),
            );
            put("chat:" + p.id, []);
            put("chat:overview", []);
            put(
              "activity",
              get<any[]>("activity", []).filter((a) => a.projectId !== p.id),
            );
            scope.traces.length = 0;
          }
        }),
      );
  }
  async archiveOwned(owned: Doc[], verifiedInventory?: Doc[]) {
    const root = workspaceRoot() || process.env.BOX_DEMO_ROOT_ID!;
    if (get("mappedRoot", "") !== root)
      throw Error("Refresh the configured root before reset");
    const active = verifiedInventory ?? (await this.discover());
    const toMove = owned.filter(
      (d) => d.boxId && active.some((x) => x.boxId === d.boxId),
    );
    if (!toMove.length) return [];
    const rootSecurity: any = await boxMcp.callBoxTool("get_folder_details", {
      folder_id: root,
      fields: ["id", "name", "shared_link", "has_collaborations"],
    });
    if (
      rootSecurity.sharedLink ||
      rootSecurity.shared_link ||
      (!currentEmployee() &&
        (rootSecurity.hasCollaborations || rootSecurity.has_collaborations))
    )
      throw Error("Reset archive requires an unshared internal demo root");
    const items = await this.list(root);
    let archive = items.find(
      (x: any) => x.type === "folder" && x.name === ARCHIVE_NAME,
    );
    if (!archive) {
      const r = await boxMcp.callBoxTool("create_folder", {
        name: ARCHIVE_NAME,
        parent_folder_id: root,
      });
      archive = { id: extractId(r) };
    }
    let batch = get<string | null>("resetBatchFolder", null);
    if (!batch) {
      const r = await boxMcp.callBoxTool("create_folder", {
        name: "Rehearsal " + new Date().toISOString().replace(/[:.]/g, "-"),
        parent_folder_id: String(archive.id),
      });
      batch = extractId(r);
      put("resetBatchFolder", batch);
    }
    const receipts = [];
    for (const d of toMove) {
      await boxMcp.callBoxTool("move_file", {
        file_id: d.boxId,
        parent_folder_id: batch,
      });
      const listed = await this.list(batch);
      if (!listed.some((x: any) => String(x.id) === d.boxId))
        throw Error("Archive read-after-write failed; retry reset safely");
      receipts.push({
        fileId: d.boxId,
        name: d.name,
        originalFolderId: d.folderId,
        archiveFolderId: batch,
      });
      put("resetArchiveReceipts", [
        ...get<any[]>("resetArchiveReceipts", []).filter(
          (r) => r.fileId !== d.boxId,
        ),
        receipts.at(-1),
      ]);
    }
    return receipts;
  }
  /**
   * Save to a mapped, permitted destination and verify the resulting file by listing it.
   * Text artifacts use upload_file; PDFs use get_upload_url followed by a separate
   * multipart byte transfer. Stable names let retries reuse an existing remote file.
   */
  async persist(bytes: Buffer, name: string, pid: string, category: string) {
    if (
      get("mappedRoot", "") !==
      (workspaceRoot() || process.env.BOX_DEMO_ROOT_ID)
    )
      throw Error("Demo root changed. Refresh mappings before saving.");
    const folders = get<Record<string, string>>("boxFolders", {});
    const folderId = folders[pid + "/" + category];
    if (!folderId || !get<string[]>("allowedFolders", []).includes(folderId))
      throw Error(
        "Destination has not been mapped within demo root. Refresh first.",
      );
    // Stable names allow recovery after a network failure without duplicate remote files.
    const security: any = await boxMcp.callBoxTool("get_folder_details", {
      folder_id: folderId,
      fields: ["id", "name", "shared_link", "has_collaborations"],
    });
    if (
      security.sharedLink ||
      security.shared_link ||
      (!currentEmployee() &&
        (security.hasCollaborations || security.has_collaborations))
    )
      throw Error(
        "Destination has a shared link. Use an internal folder without a shared link before saving.",
      );
    const existing = (await this.list(folderId)).find(
      (x: any) => x.type === "file" && x.name === name,
    );
    let id: string;
    if (existing) id = String(existing.id);
    else if (!name.endsWith(".pdf")) {
      const r: any = await boxMcp.callBoxTool("upload_file", {
        parent_folder_id: folderId,
        file_name: name,
        file_content: bytes.toString("utf8"),
      });
      id = extractId(r);
    } else {
      const r: any = await boxMcp.callBoxTool("get_upload_url", {
        parent_folder_id: folderId,
        file_name: name,
        file_size_bytes: bytes.length,
      });
      const info = transferInfo(r);
      const url = safeTransferUrl(info.url);
      const form = new FormData();
      form.set(
        "attributes",
        JSON.stringify({ name, parent: { id: folderId } }),
      );
      form.set(
        "file",
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        name,
      );
      id = await traceCall(
        "binary_upload",
        {
          file_name: name,
          folder_id: folderId,
          bytes: bytes.length,
          method: "POST",
        },
        async () => {
          const response = await fetch(url, {
            method: "POST",
            ...(info.token
              ? { headers: { Authorization: `Bearer ${info.token}` } }
              : {}),
            body: form,
            redirect: "error",
            signal: AbortSignal.timeout(60000),
          });
          if (!response.ok)
            throw Error(
              `Box binary transfer failed (${response.status}); no billing state changed.`,
            );
          return extractId(await response.json());
        },
        "transfer",
      );
    }
    const verify = (await this.list(folderId)).find(
      (x: any) => String(x.id) === id,
    );
    if (!verify)
      throw Error(
        "Box read-after-write did not find uploaded file. Retry safely.",
      );
    put("allowedFiles", [
      ...new Set([...get<string[]>("allowedFiles", []), id]),
    ]);
    return {
      id: "box-" + id,
      boxId: id,
      folderId,
      name,
      projectId: pid,
      category: category === "03 Acceptance" ? "Acceptance" : "Billing",
    } satisfies Doc;
  }
}
function extractId(r: any): string {
  const id =
    r?.entries?.[0]?.id ||
    r?.file_id ||
    r?.folder_id ||
    r?.folderId ||
    r?.id ||
    r?.file?.id ||
    r?.data?.id;
  if (!id)
    throw Error(
      "Remote response did not return a file ID; refresh before retry.",
    );
  return String(id);
}
/** Accept only HTTPS Box transfer hosts before following an MCP-issued upload/download URL. */
export function safeTransferUrl(s: string) {
  const u = new URL(s);
  if (
    u.protocol !== "https:" ||
    !(
      u.hostname === "box.com" ||
      u.hostname.endsWith(".box.com") ||
      u.hostname.endsWith(".boxcloud.com")
    ) ||
    u.username ||
    u.password
  )
    throw Error("Transfer URL is outside allowed Box domains");
  return u.href;
}
export function transferInfo(r: any): { url: string; token?: string } {
  if (typeof r === "string") {
    const match = r.match(/https:\/\/[^\s"<>]+/);
    if (match) return { url: match[0] };
  }
  if (r && typeof r === "object") {
    if (typeof r.download_url === "string") return { url: r.download_url };
    if (typeof r.upload_url === "string")
      return { url: r.upload_url, token: r.upload_token };
    if (typeof r.url === "string") return { url: r.url };
    for (const v of Object.values(r)) {
      try {
        return transferInfo(v);
      } catch {}
    }
  }
  throw Error(
    "Upload URL response not recognized. Use box:inspect to verify transfer contract.",
  );
}
export const remote = new RemoteBox();
