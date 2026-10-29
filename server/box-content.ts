import { boxMcp } from "./box-mcp.ts";
import { get, put, type Doc } from "./store.ts";
import { traceCall } from "./tracing.ts";
export const ARCHIVE_NAME = "BillReady Rehearsal Archive";

// Scoped Box content operations. Only the MCP client knows the transport and schemas.
export class RemoteBox {
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
  async archiveOwned(owned: Doc[]) {
    const root = process.env.BOX_DEMO_ROOT_ID!;
    if (get("mappedRoot", "") !== root)
      throw Error("Refresh the configured root before reset");
    const active = await this.discover();
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
      rootSecurity.hasCollaborations ||
      rootSecurity.has_collaborations
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
    }
    return receipts;
  }
  async persist(bytes: Buffer, name: string, pid: string, category: string) {
    if (get("mappedRoot", "") !== process.env.BOX_DEMO_ROOT_ID)
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
      security.hasCollaborations ||
      security.has_collaborations
    )
      throw Error(
        "Destination has sharing or collaborations. Use an unshared internal demo folder before saving.",
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
