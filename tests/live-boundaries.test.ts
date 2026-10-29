import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// Isolated live-mode state with NO credentials. Never touch the real account or token file.
process.env.DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "billready-live-boundaries-"),
);
process.env.BOX_TOKEN_FILE = path.join(process.env.DATA_DIR, "no-token.json");
process.env.BILLREADY_ADAPTER = "live";
process.env.AGENT_PROVIDER = "box";
delete process.env.BOX_MCP_TOKEN;
const { BoxMcpClient, boxMcp } = await import("../server/box-mcp.ts");
const tracing = await import("../server/tracing.ts");
const store = await import("../server/store.ts");
const { chat, messages } = await import("../server/agent.ts");
const { executeAllowedPlan } = await import("../server/box-agent.ts");
const { RemoteBox } = await import("../server/box-content.ts");
const schemas = JSON.parse(
  fs.readFileSync("tests/fixtures/box-mcp-schemas.json", "utf8"),
);
store.initialize([
  {
    id: "box-fixture",
    boxId: "123",
    name: "project-agreement.pdf",
    category: "Project records",
    projectId: "CW-101",
  },
]);

test("live mode without auth fails instead of returning a rehearsal or saving a chat", async () => {
  await assert.rejects(
    () => chat("CW-101", "What blocks billing?"),
    /Authorize Box/,
  );
  assert.deepEqual(messages("CW-101"), []);
});
test("unknown live provider fails explicitly", async () => {
  process.env.AGENT_PROVIDER = "typo";
  try {
    await assert.rejects(
      () => chat("CW-101", "What blocks billing?"),
      /Unknown live agent provider/,
    );
  } finally {
    process.env.AGENT_PROVIDER = "box";
  }
});
test("SDK call uses exact hosted schema arguments and reuses a compiled validator", async () => {
  const client = new BoxMcpClient();
  client.tools = schemas;
  let calls = 0,
    compiles = 0;
  const ajv = (client as any).ajv,
    compile = ajv.compile.bind(ajv);
  ajv.compile = (...args: any[]) => {
    compiles++;
    return compile(...args);
  };
  client.client = {
    callTool: async ({ name, arguments: args }: any) => {
      calls++;
      assert.equal(name, "ai_qa_multi_file");
      assert.deepEqual(args, { file_ids: ["123"], question: "Check evidence" });
      return { structuredContent: { answer: "ok" } };
    },
  } as any;
  for (let i = 0; i < 2; i++)
    await client.callBoxTool("ai_qa_multi_file", {
      file_ids: ["123"],
      question: "Check evidence",
    });
  assert.equal(calls, 2);
  assert.equal(compiles, 1);
  await assert.rejects(
    () =>
      client.callBoxTool("ai_qa_multi_file", {
        file_ids: ["123"],
        prompt: "old alias",
      }),
    /Invalid arguments/,
  );
  assert.equal(calls, 2);
});
test("MCP tool errors and transport errors fail visibly with sanitized traces", async () => {
  for (const transportError of [false, true]) {
    const client = new BoxMcpClient();
    client.tools = schemas;
    client.client = {
      callTool: async () => {
        if (transportError) throw Error("Denied Bearer private-token");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Denied Bearer private-token at https://upload.box.com/private?token=secret",
            },
          ],
        };
      },
    } as any;
    const events: any[] = [];
    await assert.rejects(
      () =>
        tracing.withTrace(
          (e) => events.push(e),
          () => client.callBoxTool("who_am_i", {}),
        ),
      (e) =>
        !String(e).includes("private-token") &&
        !String(e).includes("upload.box.com"),
    );
    assert.deepEqual(
      events.map((e) => e.status),
      ["running", "failed"],
    );
    assert.ok(!JSON.stringify(events).includes("private-token"));
  }
});
test("application rejects cross-project and unknown-project plans before workflow execution", async () => {
  for (const projectId of ["CW-102", "not-a-project"]) {
    await assert.rejects(
      () =>
        executeAllowedPlan("CW-101", {
          plan: { action: "billing", projectId, answer: "prepare" },
          sources: [],
          docs: [],
        }),
      /different project|unknown project/,
    );
  }
  assert.deepEqual(store.get("proposals", []), []);
});
test("scoped folder inventory completes offset pagination and rejects incomplete listings", async () => {
  const original = boxMcp.callBoxTool;
  const seen: number[] = [];
  try {
    boxMcp.callBoxTool = async (_name, args) => {
      seen.push(Number(args.offset));
      return {
        entries:
          args.offset === 0
            ? Array.from({ length: 100 }, (_, i) => ({ id: String(i) }))
            : [{ id: "100" }],
        total_count: 101,
      };
    };
    assert.equal((await new RemoteBox().list("123")).length, 101);
    assert.deepEqual(seen, [0, 100]);
    boxMcp.callBoxTool = async () => ({ entries: [], total_count: 1 });
    await assert.rejects(
      () => new RemoteBox().list("123"),
      /Incomplete folder pagination/,
    );
  } finally {
    boxMcp.callBoxTool = original;
  }
});

test("proof upload traces actual MCP request, binary transfer, read-back and extraction before readiness changes (fixture)", async () => {
  const { persistFile } = await import("../server/adapter.ts");
  const { reassess } = await import("../server/workflow.ts");
  const { billing, DEMO_DATE } = await import("../server/domain.ts");
  const oldClient = boxMcp.client,
    oldTools = boxMcp.tools,
    oldFetch = globalThis.fetch,
    oldRoot = process.env.BOX_DEMO_ROOT_ID;
  let uploaded = false;
  const name = "CW-101-fixture-acceptance.pdf";
  const events: any[] = [];
  process.env.BOX_DEMO_ROOT_ID = "999";
  store.put("mappedRoot", "999");
  store.put("boxFolders", { "CW-101/03 Acceptance": "11" });
  store.put("allowedFolders", ["11"]);
  boxMcp.tools = schemas;
  boxMcp.client = {
    callTool: async ({ name: tool, arguments: args }: any) => {
      let data: any;
      if (tool === "get_folder_details")
        data = { id: "11", name: "03 Acceptance", has_collaborations: false };
      else if (tool === "list_folder_content_by_folder_id")
        data = {
          entries: uploaded ? [{ id: "321", name, type: "file" }] : [],
          total_count: uploaded ? 1 : 0,
        };
      else if (tool === "get_upload_url") {
        assert.deepEqual(Object.keys(args).sort(), [
          "file_name",
          "file_size_bytes",
          "parent_folder_id",
        ]);
        data = {
          upload_url: "https://upload.box.com/fixture?signature=private",
          upload_token: "private-upload-token",
        };
      } else if (tool === "ai_extract_freeform")
        data = {
          projectId: "CW-101",
          client: "Alder & Finch",
          milestoneId: "M3",
          signed: true,
          accepted: true,
          signer: "Morgan Ellis",
          date: DEMO_DATE,
          quote:
            "We accept the completed work for this milestone without reservation.",
        };
      else throw Error("Unexpected fixture tool " + tool);
      return { structuredContent: data };
    },
  } as any;
  globalThis.fetch = async (input) => {
    assert.equal(
      String(input),
      "https://upload.box.com/fixture?signature=private",
    );
    uploaded = true;
    return new Response(JSON.stringify({ entries: [{ id: "321" }] }), {
      status: 201,
    });
  };
  try {
    assert.equal(billing(store.projects()[0]).ready, 0);
    await tracing.withTrace(
      (entry) => events.push(entry),
      async () => {
        const doc = await persistFile(
          Buffer.from("%PDF-fixture"),
          name,
          "CW-101",
          "03 Acceptance",
        );
        store.addDoc({ ...doc, generated: false });
        assert.equal(billing(store.projects()[0]).ready, 0);
        await reassess("CW-101", [doc]);
      },
    );
    assert.equal(billing(store.projects()[0]).ready, 1800000);
    const completed = events.filter((e) => e.status === "completed");
    const names = completed.map((e) => e.tool);
    const transfer = names.indexOf("binary_upload");
    assert.ok(names.indexOf("get_upload_url") < transfer);
    assert.equal(names[transfer + 1], "list_folder_content_by_folder_id");
    assert.equal(names.at(-1), "ai_extract_freeform");
    assert.equal(completed[transfer].kind, "transfer");
    assert.ok(!JSON.stringify(events).includes("private-upload-token"));
    assert.ok(!JSON.stringify(events).includes("signature=private"));
  } finally {
    boxMcp.client = oldClient;
    boxMcp.tools = oldTools;
    globalThis.fetch = oldFetch;
    if (oldRoot === undefined) delete process.env.BOX_DEMO_ROOT_ID;
    else process.env.BOX_DEMO_ROOT_ID = oldRoot;
  }
});
