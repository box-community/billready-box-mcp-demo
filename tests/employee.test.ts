import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "billready-employees-"),
);
process.env.EMPLOYEE_DATA_DIR = path.join(temporary, "employees");
process.env.EMPLOYEE_AUTH_FILE = path.join(temporary, "accounts.json");
process.env.DATA_DIR = path.join(temporary, "legacy-must-not-be-opened");
process.env.BILLREADY_ADAPTER = "live";
process.env.AGENT_PROVIDER = "box";
process.env.BOX_CLIENT_ID = "fixture-client";
process.env.BOX_CLIENT_SECRET = "fixture-secret";
process.env.PORT = "4397";
process.env.NODE_ENV = "production";
process.env.BOX_REDIRECT_URI = "http://127.0.0.1:4397/auth/box/callback";
const originalFetch = globalThis.fetch;
const { seedProjects } = await import("../server/domain.ts");
const { BoxMcpClient } = await import("../server/box-mcp.ts");
const { employeeContext } = await import("../server/context.ts");
const store = await import("../server/store.ts");
const { remote } = await import("../server/box-content.ts");
const { traceCall, trace } = await import("../server/tracing.ts");
const { propose } = await import("../server/workflow.ts");
const { validateAcceptance } = await import("../server/domain.ts");
const { executeAllowedPlan } = await import("../server/box-agent.ts");
const refreshes: Record<string, number> = {};
const permissions: Record<string, Set<string>> = {
  "101": new Set(["200", "900"]),
  "102": new Set(["300", "900"]),
};
const roots: Record<string, string[]> = {
  "200": ["210"],
  "300": ["310"],
  "900": ["910"],
};
const names: Record<string, string> = {
  "200": "Operations A",
  "300": "Operations B",
  "900": "Shared operations",
};
const records: Record<string, any> = {
  "210": seedProjects()[0],
  "310": seedProjects()[0],
  "910": seedProjects()[0],
};
const kinds = [
  "01 Project records",
  "02 Delivery evidence",
  "03 Acceptance",
  "04 Billing",
  "05 Follow-ups",
];
const uploaded = new Map<
  string,
  { id: string; name: string; bytes: Buffer; folder: string }
>();
const revoked = new Set<string>();
const archiveFolders = new Map<
  string,
  { id: string; name: string; parent: string }
>();
let failMoveAfter = -1;
let failListing = false,
  aiCalls = 0;
const transcript: { user: string; tool: string; args: any }[] = [];
function rootOf(id: string) {
  return Object.keys(roots).find(
    (root) => root === id || roots[root].some((p) => id.startsWith(p)),
  );
}
function authorized(user: string, id: string) {
  const root = rootOf(id);
  if (revoked.has(id) || (root && !permissions[user].has(root)))
    throw Error("403 access denied");
}
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input);
  if (url === "https://api.box.com/oauth2/token") {
    const params = new URLSearchParams(init.body),
      user =
        params.get("code") === "alpha" ||
        params.get("refresh_token") === "refresh-101"
          ? "101"
          : "102";
    if (params.get("grant_type") === "refresh_token")
      refreshes[user] = (refreshes[user] || 0) + 1;
    return Response.json({
      access_token: "token-" + user,
      refresh_token: "refresh-" + user,
      expires_in: params.get("grant_type") === "refresh_token" ? 3600 : 1,
    });
  }
  if (url === "https://upload.box.com/fixture") {
    const form = init.body as FormData,
      attrs = JSON.parse(String(form.get("attributes"))),
      file = form.get("file") as File;
    const id = String(700000 + uploaded.size);
    uploaded.set(id, {
      id,
      name: attrs.name,
      folder: attrs.parent.id,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return Response.json({ entries: [{ id }] });
  }
  if (url.startsWith("https://download.box.com/fixture/")) {
    const id = url.split("/").at(-1)!;
    const item = uploaded.get(id);
    if (id.endsWith("20"))
      return new Response(
        new Uint8Array(
          fs.readFileSync(
            "demo-kit/presenter-only/CW-101-signed-acceptance.pdf",
          ),
        ),
      );
    return item
      ? new Response(new Uint8Array(item.bytes))
      : new Response("no", { status: 404 });
  }
  if (!url.startsWith("http://127.0.0.1:4397/"))
    throw Error("Unexpected fixture network destination");
  return originalFetch(input, init);
};
const oldCall = BoxMcpClient.prototype.callBoxTool;
BoxMcpClient.prototype.callBoxTool = async function (tool, args) {
  const token = await (this as any).tokenProvider();
  const user = token.replace("token-", "");
  transcript.push({ user, tool, args });
  return traceCall(tool, args, async () => {
    if (tool === "who_am_i")
      return {
        id: user,
        name: user === "101" ? "Employee Alpha" : "Employee Beta",
        login: user + "@clearwave.example",
      };
    const id = String(
      args.folder_id || args.parent_folder_id || args.file_id || "",
    );
    if (id) authorized(user, id);
    if (tool === "get_folder_details")
      return {
        id,
        name: names[id] || "Project folder",
        shared_link: null,
        has_collaborations: true,
      };
    if (tool === "list_folder_content_by_folder_id") {
      if (failListing) throw Error("503 temporary listing failure");
      let entries: any[] = [];
      if (id === "0")
        entries = [...permissions[user]].map((id) => ({
          id,
          name: names[id],
          type: "folder",
        }));
      else if (roots[id])
        entries = roots[id].map((id) => ({
          id,
          name: records[id].id + " " + records[id].client,
          type: "folder",
        }));
      else if (records[id])
        entries = kinds.map((name, i) => ({
          id: id + (i + 1),
          name,
          type: "folder",
        }));
      else {
        const p = Object.keys(records).find((p) => p + "1" === id);
        if (p) entries = [{ id: p + "10", name: "project.json", type: "file" }];
        const delivery = Object.keys(records).find((p) => p + "2" === id);
        if (delivery)
          entries = [
            {
              id: delivery + "20",
              name: "completion-report.pdf",
              type: "file",
            },
          ];
        entries.push(
          ...[...uploaded.values()]
            .filter((f) => f.folder === id)
            .map((f) => ({ id: f.id, name: f.name, type: "file" })),
        );
      }
      entries.push(
        ...[...archiveFolders.values()]
          .filter((f) => f.parent === id)
          .map((f) => ({ id: f.id, name: f.name, type: "folder" })),
      );
      const offset = Number(args.offset || 0),
        limit = Number(args.limit || 100);
      return {
        entries: entries.slice(offset, offset + limit),
        total_count: entries.length,
      };
    }
    if (tool === "get_file_content") {
      const p = Object.keys(records).find((p) => p + "10" === id);
      if (!p) throw Error("404 not found");
      return JSON.stringify(records[p]);
    }
    if (tool === "create_folder") {
      const created = {
        id: String(900000 + archiveFolders.size),
        name: String(args.name),
        parent: String(args.parent_folder_id),
      };
      archiveFolders.set(created.id, created);
      return { id: created.id };
    }
    if (tool === "move_file") {
      if (failMoveAfter === 0) {
        failMoveAfter = -1;
        throw Error("503 archive interruption");
      }
      if (failMoveAfter > 0) failMoveAfter--;
      const file = uploaded.get(String(args.file_id));
      if (!file) throw Error("Unknown file move");
      file.folder = String(args.parent_folder_id);
      return { id: file.id };
    }
    if (tool === "get_upload_url")
      return { upload_url: "https://upload.box.com/fixture" };
    if (tool === "upload_file") {
      const existing = [...uploaded.values()].find(
        (f) => f.folder === id && f.name === args.file_name,
      );
      if (existing) return { id: existing.id };
      const fileId = String(700000 + uploaded.size);
      uploaded.set(fileId, {
        id: fileId,
        folder: id,
        name: String(args.file_name),
        bytes: Buffer.from(String(args.file_content)),
      });
      return { id: fileId };
    }
    if (tool === "get_download_url") {
      if (!uploaded.has(id) && !id.endsWith("20")) throw Error("404 not found");
      return { download_url: "https://download.box.com/fixture/" + id };
    }
    if (tool === "ai_qa_multi_file")
      return {
        action: "billing",
        projectId: "CW-101",
        answer: "Review the draft billing package.",
        draft: null,
      };
    if (tool === "ai_extract_freeform") {
      aiCalls++;
      return {
        projectId: "CW-101",
        client: "Alder & Finch",
        milestoneId: "M3",
        signed: true,
        accepted: true,
        signer: "Morgan Ellis",
        date: "2026-10-15",
        quote:
          "We accept the completed work for this milestone without reservation.",
      };
    }
    throw Error("Unexpected tool " + tool);
  });
};
const { server } = await import("../server/index.ts");
const base = "http://127.0.0.1:4397";
class Browser {
  jar = new Map<string, string>();
  async request(route: string, options: any = {}) {
    const response = await originalFetch(base + route, {
      ...options,
      redirect: "manual",
      headers: {
        ...options.headers,
        cookie: [...this.jar].map(([k, v]) => k + "=" + v).join(";"),
      },
    });
    for (const value of response.headers.getSetCookie()) {
      const [key, val] = value.split(";")[0].split("=");
      this.jar.set(key, val);
    }
    return response;
  }
  async login(code: string) {
    const start = await this.request("/auth/box/start");
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get("location")!).searchParams.get(
      "state",
    );
    const callback = await this.request(
      "/auth/box/callback?code=" + code + "&state=" + state,
    );
    assert.equal(callback.status, 302, await callback.text());
  }
  post(route: string, body: any) {
    return this.request(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async state() {
    const r = await this.request("/api/state");
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  }
}
test("employee OAuth and workspace workflow isolates accounts and enforces current Box access", async (t) => {
  try {
    const a = new Browser(),
      b = new Browser(),
      anon = new Browser();
    await t.test(
      "anonymous APIs, previews and streams require a session",
      async () => {
        for (const route of [
          "/api/state",
          "/api/chat/overview",
          "/api/documents/guessed/content",
          "/api/proposals/guessed/invoice",
          "/api/folders",
        ])
          assert.equal((await anon.request(route)).status, 401);
        assert.equal(
          (await anon.post("/api/chat/overview/stream", { text: "hello" }))
            .status,
          401,
        );
        assert.equal(
          (await anon.request("/auth/box/callback?state=wrong&code=alpha"))
            .status,
          400,
        );
      },
    );
    assert.equal((await anon.post("/api/reset/preview", {})).status, 401);
    assert.equal(
      (
        await anon.post("/api/reset/apply", {
          confirm: true,
          fingerprint: "0".repeat(64),
        })
      ).status,
      401,
    );
    await a.login("alpha");
    await b.login("beta");
    await t.test(
      "identities and folder browser use each employee token",
      async () => {
        assert.equal(
          (await (await a.request("/api/session")).json()).employee.id,
          "101",
        );
        assert.equal(
          (await (await b.request("/api/session")).json()).employee.id,
          "102",
        );
        assert.deepEqual(
          (await (await a.request("/api/folders")).json()).entries.map(
            (f: any) => f.id,
          ),
          ["200", "900"],
        );
        assert.deepEqual(
          (await (await b.request("/api/folders")).json()).entries.map(
            (f: any) => f.id,
          ),
          ["300", "900"],
        );
        assert.equal(
          (await a.post("/api/workspace", { folderId: "300" })).status,
          400,
        );
        assert.equal((await anon.post("/auth/signout", {})).status, 200);
      },
    );
    assert.equal(
      (await a.post("/api/workspace", { folderId: "200" })).status,
      200,
    );
    assert.equal(
      (await b.post("/api/workspace", { folderId: "300" })).status,
      200,
    );
    let sa: any, sb: any;
    await t.test(
      "same business code in separate folders has different scoped IDs, no seeded extras",
      async () => {
        [sa, sb] = await Promise.all([a.state(), b.state()]);
        assert.deepEqual(
          sa.projects.map((p: any) => p.id),
          ["CW-101~210"],
        );
        assert.deepEqual(
          sb.projects.map((p: any) => p.id),
          ["CW-101~310"],
        );
        assert.equal(sa.totals.blocked, 1800000);
        assert.equal(sa.projects.length, 1);
        assert.equal(refreshes["101"], 1);
        assert.equal(refreshes["102"], 1);
        assert.equal(fs.existsSync(process.env.DATA_DIR!), false);
      },
    );
    await t.test(
      "project/document/proposal ID guesses cannot cross accounts",
      async () => {
        assert.equal((await b.request("/api/chat/CW-101~210")).status, 404);
        assert.equal(
          (await b.request("/api/documents/box-21010/content")).status,
          400,
        );
        assert.equal(
          (await b.request("/api/proposals/billing-CW-101~210-M3/invoice"))
            .status,
          400,
        );
        const invalid = new Browser();
        invalid.jar.set("billready_session", "expired-or-guessed");
        assert.equal((await invalid.request("/api/state")).status, 401);
      },
    );
    await t.test(
      "validated upload streams MCP calls and updates only the uploader workspace",
      async () => {
        const form = new FormData();
        form.set(
          "file",
          new Blob(
            [
              fs.readFileSync(
                "demo-kit/presenter-only/CW-101-signed-acceptance.pdf",
              ),
            ],
            { type: "application/pdf" },
          ),
          "acceptance.pdf",
        );
        const response = await a.request(
          "/api/projects/CW-101~210/acceptance/stream",
          { method: "POST", body: form },
        );
        const body = await response.text();
        assert.match(body, /"tool":"get_upload_url"/);
        assert.match(body, /"tool":"binary_upload"/);
        assert.match(body, /"tool":"ai_extract_freeform"/);
        assert.match(body, /"valid":true/);
        assert.equal((await a.state()).totals.ready, 1800000);
        assert.equal((await b.state()).totals.ready, 0);
        assert.equal(aiCalls, 1);
      },
    );
    await t.test(
      "review and concurrent repeated approval save four artifacts without issuing invoices",
      async () => {
        const response = await a.post("/api/chat/CW-101~210", {
          text: "Prepare the draft invoice.",
        });
        assert.equal(response.status, 200, await response.clone().text());
        const proposalId = (await response.json()).proposalId;
        assert.ok(proposalId);
        const invoice = await a.request(
          "/api/proposals/" + proposalId + "/invoice",
        );
        assert.equal(invoice.status, 200);
        assert.equal(invoice.headers.get("content-type"), "application/pdf");
        const [first, second] = await Promise.all([
          a.post("/api/proposals/" + proposalId + "/approve", {
            confirm: true,
          }),
          a.post("/api/proposals/" + proposalId + "/approve", {
            confirm: true,
          }),
        ]);
        assert.equal(first.status, 200, await first.clone().text());
        assert.equal(second.status, 200, await second.clone().text());
        const saved = await first.json();
        assert.equal(saved.savedIds.length, 4);
        assert.deepEqual((await second.json()).savedIds, saved.savedIds);
        assert.equal(
          [...uploaded.values()].filter((f) => f.folder === "2104").length,
          4,
        );
        assert.equal((await a.state()).totals.invoiced, 5400000);
        assert.equal((await a.state()).totals.ready, 1800000);
        assert.equal(
          (await b.request("/api/documents/" + saved.savedIds[0] + "/content"))
            .status,
          400,
        );
      },
    );
    await t.test(
      "shared workspace selection is remembered while local state stays private",
      async () => {
        await a.post("/api/workspace", { folderId: "900" });
        await b.post("/api/workspace", { folderId: "900" });
        [sa, sb] = await Promise.all([a.state(), b.state()]);
        assert.equal(sa.projects[0].id, sb.projects[0].id);
        assert.equal(sa.projects[0].id, "CW-101~910");
        const again = new Browser();
        await again.login("alpha");
        assert.equal(
          (await (await again.request("/api/session")).json()).workspace.id,
          "900",
        );
        // Both sessions for Alpha use one refreshed credential; Beta's credential remains separate.
        await Promise.all([
          again.request("/api/folders"),
          a.request("/api/folders"),
        ]);
        assert.equal(refreshes["101"], 2);
        await Promise.all([again.state(), a.state(), b.state()]);
        assert.equal(refreshes["102"], 1);
      },
    );
    await t.test(
      "two employees approving the same Box project reuse one package and original approved copy",
      async () => {
        const form = new FormData();
        form.set(
          "file",
          new Blob(
            [
              fs.readFileSync(
                "demo-kit/presenter-only/CW-101-signed-acceptance.pdf",
              ),
            ],
            { type: "application/pdf" },
          ),
          "acceptance.pdf",
        );
        assert.equal(
          (
            await a.request("/api/projects/CW-101~910/acceptance", {
              method: "POST",
              body: form,
            })
          ).status,
          200,
        );
        assert.equal((await b.post("/api/refresh", {})).status, 200);
        const [pa, pb] = await Promise.all([
          a.post("/api/chat/CW-101~910", { text: "Prepare invoice" }),
          b.post("/api/chat/CW-101~910", { text: "Prepare invoice" }),
        ]);
        const aid = (await pa.json()).proposalId,
          bid = (await pb.json()).proposalId;
        const [ra, rb] = await Promise.all([
          a.post("/api/proposals/" + aid + "/approve", { confirm: true }),
          b.post("/api/proposals/" + bid + "/approve", { confirm: true }),
        ]);
        assert.equal(ra.status, 200, await ra.clone().text());
        assert.equal(rb.status, 200, await rb.clone().text());
        assert.deepEqual(
          (await ra.json()).savedIds,
          (await rb.json()).savedIds,
        );
        assert.equal(
          [...uploaded.values()].filter((f) => f.folder === "9104").length,
          4,
        );
      },
    );
    await t.test(
      "workspace reset previews scoped files, rejects stale confirmation and archives without deleting",
      async () => {
        await a.post("/api/workspace", { folderId: "200" });
        await b.post("/api/workspace", { folderId: "300" });
        const otherBefore = await b.state();
        const previewResponse = await a.post("/api/reset/preview", {});
        assert.equal(
          previewResponse.status,
          200,
          await previewResponse.clone().text(),
        );
        const plan = await previewResponse.json();
        assert.equal(plan.files.length, 5);
        assert.ok(plan.files.every((f: any) => f.projectId === "CW-101~210"));
        assert.equal(
          (
            await a.post("/api/reset/apply", {
              confirm: true,
              fingerprint: "0".repeat(64),
            })
          ).status,
          400,
        );
        failMoveAfter = 1;
        assert.equal(
          (
            await a.post("/api/reset/apply", {
              confirm: true,
              fingerprint: plan.fingerprint,
            })
          ).status,
          400,
        );
        const retry = await (await a.post("/api/reset/preview", {})).json();
        assert.equal(retry.files.length, 4);
        const result = await a.post("/api/reset/apply", {
          confirm: true,
          fingerprint: retry.fingerprint,
        });
        assert.equal(result.status, 200, await result.clone().text());
        const after = await a.state();
        assert.equal(after.totals.blocked, 1800000);
        assert.equal(after.totals.ready, 0);
        assert.equal(after.proposals.length, 0);
        assert.equal(
          (await b.state()).totals.blocked,
          otherBefore.totals.blocked,
        );
        assert.equal(
          [...uploaded.values()].filter(
            (f) => f.folder === "2103" || f.folder === "2104",
          ).length,
          0,
        );
        assert.ok(
          [...uploaded.values()].filter((f) => archiveFolders.has(f.folder))
            .length >= 5,
        );
        assert.equal(
          (await (await a.request("/api/session")).json()).employee.id,
          "101",
        );
        await a.post("/api/workspace", { folderId: "900" });
        await b.post("/api/workspace", { folderId: "900" });
        await Promise.all([a.state(), b.state()]);
        const sharedPreview = await (
          await a.post("/api/reset/preview", {})
        ).json();
        assert.equal(
          (
            await a.post("/api/reset/apply", {
              confirm: true,
              fingerprint: sharedPreview.fingerprint,
            })
          ).status,
          200,
        );
        const colleague = await b.state();
        assert.equal(colleague.totals.blocked, 1800000);
        assert.equal(colleague.proposals.length, 0);
      },
    );
    await t.test(
      "revoked folder access removes projects and blocks cached content",
      async () => {
        revoked.add("910");
        sa = await a.state();
        assert.equal(sa.projects.length, 0);
        assert.equal(sa.documents.length, 0);
        assert.equal((await a.request("/api/chat/CW-101~910")).status, 404);
        revoked.delete("910");
        revoked.add("900");
        assert.equal((await b.request("/api/state")).status, 403);
        revoked.delete("900");
      },
    );
    await t.test(
      "empty workspaces stay empty, unsupported records are skipped, incomplete scans do not commit",
      async () => {
        roots["200"] = [];
        await a.post("/api/workspace", { folderId: "200" });
        await a.post("/api/refresh", {});
        sa = await a.state();
        assert.equal(sa.projects.length, 0);
        assert.equal(sa.discovery.status, "empty");
        roots["200"] = ["210"];
        const good = records["210"];
        records["210"] = { unexpected: true };
        await a.post("/api/refresh", {});
        sa = await a.state();
        assert.equal(sa.projects.length, 0);
        assert.ok(sa.discovery.warnings.length);
        records["210"] = good;
        await a.post("/api/refresh", {});
        sa = await a.state();
        assert.equal(sa.projects.length, 1);
        failListing = true;
        assert.equal((await a.post("/api/refresh", {})).status, 400);
        failListing = false;
        assert.equal((await a.state()).projects.length, 1);
      },
    );
    await t.test(
      "duplicate business codes reject discovery without committing a partial project list",
      async () => {
        roots["200"] = ["210", "211"];
        records["211"] = { ...records["210"] };
        const duplicate = await a.post("/api/refresh", {});
        assert.equal(duplicate.status, 400);
        assert.match(await duplicate.text(), /Duplicate project code/);
        assert.equal((await a.state()).projects.length, 1);
        roots["200"] = ["210"];
        delete records["211"];
        assert.equal(
          (await a.post("/api/workspace", { folderId: "0" })).status,
          400,
        );
      },
    );
    await t.test(
      "sign-out invalidates session and cross-origin sign-out is rejected",
      async () => {
        assert.equal(
          (
            await b.request("/auth/signout", {
              method: "POST",
              headers: { origin: "https://evil.example" },
            })
          ).status,
          403,
        );
        const old = a.jar.get("billready_session");
        await a.post("/auth/signout", {});
        a.jar.set("billready_session", old!);
        assert.equal((await a.request("/api/state")).status, 401);
        assert.equal((await b.request("/api/session")).status, 200);
      },
    );
  } finally {
    BoxMcpClient.prototype.callBoxTool = oldCall;
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("concurrent context isolates state, traces and files, and stale contexts fail closed", async () => {
  const fake = (id: string, root: string) => ({
    employee: { id, name: id, email: id + "@example.com" },
    workspace: { id: root, name: root },
    mcp: {} as any,
    traces: [],
    assertActive: () => {},
  });
  const a = fake("201", "400"),
    b = fake("202", "400");
  await Promise.all(
    [a, b].map((scope, i) =>
      employeeContext.run(scope, async () => {
        store.initialize([]);
        store.put("private", "account-" + i);
        await traceCall("fixture", { i }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return { i };
        });
        assert.equal(store.get("private", ""), "account-" + i);
        assert.equal(trace.length, 1);
        assert.equal((trace[0].parameters as any).i, i);
        fs.writeFileSync(
          path.join(store.storageDir(), "private.txt"),
          String(i),
        );
      }),
    ),
  );
  assert.notEqual(
    employeeContext.run(a, store.storageDir),
    employeeContext.run(b, store.storageDir),
  );
  const revoked = {
    ...a,
    assertActive: () => {
      throw Error("session expired");
    },
  };
  assert.throws(
    () => employeeContext.run(revoked, () => store.projects()),
    /expired/,
  );
  let active = true;
  const changing = {
    ...a,
    assertActive: () => {
      if (!active) throw Error("workspace changed");
    },
  };
  await assert.rejects(
    () =>
      employeeContext.run(changing, () =>
        traceCall("slow", {}, async () => {
          active = false;
          return { private: "must not publish as completed" };
        }),
      ),
    /workspace changed/,
  );
  const p = {
    ...seedProjects()[0],
    id: "CW-101~888",
    businessId: "CW-101",
    folderId: "888",
  };
  await employeeContext.run(a, async () => {
    store.put("projects", [p]);
    const result: any = {
      plan: {
        action: "answer",
        projectId: "CW-101",
        answer: "Verified state.",
      },
      sources: [],
      docs: [],
    };
    assert.equal(
      (await executeAllowedPlan(p.id, result)).text,
      "Verified state.",
    );
    store.put("projects", [p, { ...p, id: "CW-101~999", folderId: "999" }]);
    await assert.rejects(() => executeAllowedPlan(p.id, result), /ambiguous/);
  });
  assert.equal(
    validateAcceptance(
      {
        projectId: "CW-101",
        client: p.client,
        milestoneId: "M3",
        signed: true,
        accepted: true,
        signer: "Morgan",
        date: "2026-10-15",
        quote: "Accepted",
      },
      p,
      p.milestones[2],
    ),
    null,
  );
});
