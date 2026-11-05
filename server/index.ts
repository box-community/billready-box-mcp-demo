import { withTrace, sanitizeTrace } from "./tracing.ts";
import "dotenv/config";
import { currentEmployee, requireEmployee } from "./context.ts";
import {
  authRoutes,
  hasBoxAuth,
  employeeMiddleware,
  selectWorkspace,
} from "./auth.ts";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  projects,
  documents,
  get,
  put,
  initialize,
  addDoc,
  activity,
  serial,
  type Activity,
} from "./store.ts";
import {
  totals,
  billing,
  DEMO_DATE,
  seedProjects,
  validateAcceptance,
  money,
} from "./domain.ts";
import {
  mode,
  localSeedDocs,
  hash,
  persistFile,
  previewBytes,
  trace,
  analyze,
  remote,
} from "./adapter.ts";
import {
  proposals,
  reassess,
  approve,
  editProposal,
  previewInvoice,
  discover,
} from "./workflow.ts";
import { chat, messages } from "./agent.ts";
if (!["live", "development"].includes(mode))
  throw Error("BILLREADY_ADAPTER must be development or live");
if (!fs.existsSync("demo-kit/configuration/seed-manifest.json"))
  throw Error("Run npm run kit before starting.");
if (mode === "development") initialize(localSeedDocs());
export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
authRoutes(app);
app.use("/api", employeeMiddleware);
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host)
    return res
      .status(403)
      .json({ error: "Cross-origin writes are not allowed" });
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/folders", async (req, res) => {
  requireEmployee();
  const folder = z
    .string()
    .regex(/^\d+$/)
    .parse(req.query.folderId || "0");
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .parse(req.query.offset || 0);
  const r: any = await (
    await import("./box-mcp.ts")
  ).boxMcp.callBoxTool("list_folder_content_by_folder_id", {
    folder_id: folder,
    limit: 100,
    offset,
  });
  const data = r.entries ? r : r.result?.entries ? r.result : r.data;
  if (!Array.isArray(data?.entries))
    throw Error("Unsupported Box folder response.");
  if (!data.entries.length && offset < (data.total_count ?? offset))
    throw Error("Incomplete folder listing.");
  res.json({
    entries: data.entries
      .filter((e: any) => e.type === "folder")
      .map((e: any) => ({ id: String(e.id), name: e.name })),
    nextOffset:
      offset + data.entries.length < (data.total_count ?? Infinity) &&
      data.entries.length
        ? offset + data.entries.length
        : null,
  });
});
app.post("/api/workspace", async (req, res) => {
  requireEmployee();
  const id = z
    .string()
    .regex(/^[1-9]\d*$/)
    .parse(req.body.folderId);
  const info: any = await (
    await import("./box-mcp.ts")
  ).boxMcp.callBoxTool("get_folder_details", { folder_id: id });
  if (String(info.id) !== id || typeof info.name !== "string")
    throw Error("Unsupported Box folder details.");
  selectWorkspace(req, { id, name: info.name });
  res.json({ ok: true });
});
app.post("/api/reset/after-cleanup", async (req, res) => {
  requireEmployee();
  if (req.body.confirm !== true)
    throw Error("Confirm that you cleaned up the rehearsal files in Box.");
  const { resetAfterCleanup } = await import("./reset-after-cleanup.ts");
  res.json(await serial(resetAfterCleanup));
});
app.use("/api", async (req, res, next) => {
  if (mode !== "live" || req.path === "/health") return next();
  const scope = requireEmployee();
  if (!scope.workspace)
    return res.status(409).json({
      error: "Choose a workspace folder first.",
      code: "workspace_required",
    });
  try {
    if (!get("initialized", false)) initialize([]);
    // A fresh workspace needs one full discovery before a deep-linked project
    // can be resolved. Subsequent project requests never broaden their refresh.
    if (
      !get("mappedRoot", "") ||
      get<{ status: string }>("discovery", { status: "ready" }).status ===
        "inaccessible"
    ) {
      await remote.verifyAccess();
      await serial(async () => {
        if (
          !get("mappedRoot", "") ||
          get<{ status: string }>("discovery", { status: "ready" }).status ===
            "inaccessible"
        )
          await discover();
      });
    }
    const routeProject = req.path.match(/^\/(?:projects|chat)\/([^/]+)/)?.[1];
    const proposal = req.path.match(/^\/proposals\/([^/]+)/)?.[1];
    const document = req.path.match(/^\/documents\/([^/]+)/)?.[1];
    // Resolve action targets from server-owned records. The state query narrows
    // access checks for a project page without changing workspace navigation data.
    const requestedProject = routeProject
      ? decodeURIComponent(routeProject)
      : proposal
        ? proposals().find((p) => p.id === decodeURIComponent(proposal))
            ?.projectId
        : document
          ? documents().find((d) => d.id === decodeURIComponent(document))
              ?.projectId
          : req.path === "/refresh"
            ? req.body.projectId
            : req.path === "/state"
              ? req.query.projectId
              : undefined;
    if (
      requestedProject &&
      requestedProject !== "overview" &&
      (typeof requestedProject !== "string" ||
        !projects().some((p) => p.id === requestedProject))
    )
      return res
        .status(404)
        .json({ error: "Project not found in your workspace." });
    await remote.verifyAccess(
      requestedProject && requestedProject !== "overview"
        ? requestedProject
        : undefined,
    );
    const project = req.path.match(/^\/projects\/([^/]+)/)?.[1];
    const chatContext = req.path.match(/^\/chat\/([^/]+)/)?.[1];
    const context = decodeURIComponent(project || chatContext || "overview");
    if (context !== "overview" && !projects().some((p) => p.id === context))
      return res
        .status(404)
        .json({ error: "Project not found in your workspace." });
    scope.assertActive();
    next();
  } catch (e) {
    next(e);
  }
});
app.post("/api/reset/preview", async (_req, res) => {
  const { previewReset } = await import("./reset-workspace.ts");
  res.json(await serial(previewReset));
});
app.post("/api/reset/apply", async (req, res) => {
  const fingerprint = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(req.body.fingerprint);
  if (req.body.confirm !== true)
    throw Error("Confirm the reviewed reset before applying.");
  const { applyReset } = await import("./reset-workspace.ts");
  res.json(await serial(() => applyReset(fingerprint)));
});
app.get("/api/state", (_req, res) => {
  const ps = projects();
  res.json({
    mode,
    employee: currentEmployee()?.employee || null,
    workspace: currentEmployee()?.workspace || null,
    discovery: get("discovery", { status: "ready", warnings: [] }),
    demoDate: DEMO_DATE,
    projects: ps.map((p) => ({ ...p, billing: billing(p) })),
    totals: totals(ps),
    documents: documents().map(({ path, ...d }) => d),
    proposals: proposals(),
    activity: get<Activity[]>("activity", []),
    folders: mode === "live" ? get("boxFolders", {}) : {},
    connection: {
      box: hasBoxAuth(),
      root: !!currentEmployee()?.workspace,
      model:
        (process.env.AGENT_PROVIDER || "box") === "box"
          ? hasBoxAuth()
          : !!process.env.OPENAI_API_KEY && !!process.env.OPENAI_MODEL,
      provider: process.env.AGENT_PROVIDER || "box",
    },
    trace: trace.slice(-20),
  });
});
app.get("/api/chat/:context", (req, res) =>
  res.json(messages(req.params.context)),
);
app.post("/api/chat/:context", async (req, res) => {
  const text = z.string().min(1).max(4000).parse(req.body.text);
  res.json(
    await serial(() =>
      withTrace(
        () => {},
        () => chat(req.params.context, text),
      ),
    ),
  );
});
// Chat and upload share one request-scoped stream of actual tool calls.
async function streamWorkflow(
  res: express.Response,
  run: () => Promise<unknown>,
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const send = (event: string, data: unknown) => {
    currentEmployee()?.assertActive();
    if (!res.destroyed && !res.writableEnded)
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const heartbeat = setInterval(() => {
    try {
      currentEmployee()?.assertActive();
      if (!res.destroyed) res.write(": keepalive\n\n");
    } catch {
      res.end();
    }
  }, 1000);
  try {
    send(
      "reply",
      await serial(() => withTrace((entry) => send("tool", entry), run)),
    );
  } catch (error) {
    if (!res.writableEnded)
      res.write(
        `event: failure\ndata: ${JSON.stringify({ error: String(sanitizeTrace((error as Error).message)) })}\n\n`,
      );
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
app.post("/api/chat/:context/stream", async (req, res) => {
  const text = z.string().min(1).max(4000).parse(req.body.text);
  await streamWorkflow(res, () => chat(req.params.context, text));
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
async function uploadAcceptance(
  pid: string,
  file: Express.Multer.File | undefined,
  defer = false,
) {
  const p = projects().find((p) => p.id === pid);
  if (!p) throw Error("Unknown project");
  if (!file || !file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw Error("Upload a readable PDF (up to 10 MB).");
  const digest = hash(file.buffer);
  const prev = documents().find(
    (d) => d.hash === digest && d.projectId === p.id,
  );
  if (prev?.valid)
    return {
      document: prev,
      valid: true,
      message: "Acceptance already verified. No duplicate upload.",
    };
  const name = `${p.businessId || p.id}-acceptance-${digest.slice(0, 12)}.pdf`;
  let d = prev || {
    ...(await persistFile(file.buffer, name, p.id, "03 Acceptance")),
    hash: digest,
    generated: false,
  };
  addDoc(d);
  activity(
    "Acceptance uploaded. Checking client, project, milestone, and signature.",
    p.id,
  );
  if (defer) return { document: d, uploaded: true };
  const result = await reassess(p.id, [d]);
  d = documents().find((x) => x.id === d.id)!;
  return {
    document: d,
    valid: !!d.valid,
    message: d.valid
      ? "Acceptance verified. Final milestone is ready to bill."
      : d.analysis ||
        "No matching signed acceptance was found. Review required.",
    results: result,
  };
}
app.post(
  "/api/projects/:pid/acceptance",
  upload.single("file"),
  async (req, res) => {
    res.json(
      await serial(() =>
        uploadAcceptance(
          String(req.params.pid),
          req.file,
          req.query.defer === "1",
        ),
      ),
    );
  },
);
app.post(
  "/api/projects/:pid/acceptance/stream",
  upload.single("file"),
  async (req, res) => {
    await streamWorkflow(res, () =>
      uploadAcceptance(String(req.params.pid), req.file),
    );
  },
);

app.post("/api/projects/:pid/acceptance/:docId/check", async (req, res) =>
  res.json(
    await serial(async () => {
      const d = documents().find(
        (d) => d.id === req.params.docId && d.projectId === req.params.pid,
      );
      if (!d || !d.hash)
        throw Error("Uploaded acceptance not found in this project");
      const results = await reassess(req.params.pid, [d]);
      const checked = documents().find((x) => x.id === d.id)!;
      return {
        document: checked,
        valid: !!checked.valid,
        message: checked.valid
          ? "Acceptance verified. Final milestone is ready to bill."
          : checked.analysis ||
            "No matching signed acceptance was found. Review required.",
        results,
      };
    }),
  ),
);
app.post("/api/refresh", async (req, res) => {
  const pid = req.body.projectId;
  if (
    pid !== undefined &&
    (typeof pid !== "string" || !projects().some((p) => p.id === pid))
  )
    return res
      .status(404)
      .json({ error: "Project not found in your workspace." });
  res.json(await serial(() => discover(pid)));
});
app.get("/api/documents/:id/content", async (req, res) => {
  const d = documents().find((x) => x.id === req.params.id);
  if (!d) throw Error("Document not found");
  res.setHeader(
    "Content-Type",
    d.name.endsWith(".pdf")
      ? "application/pdf"
      : d.name.endsWith(".json")
        ? "application/json"
        : "text/plain; charset=utf-8",
  );
  res.setHeader(
    "Content-Disposition",
    `${req.query.download ? "attachment" : "inline"}; filename="${d.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
  );
  res.send(await previewBytes(d));
});
app.get("/api/proposals/:id/invoice", async (req, res) => {
  const p = proposals().find((x) => x.id === req.params.id);
  if (!p || p.type !== "billing") throw Error("Draft invoice not found");
  res.type("pdf").sendFile(await previewInvoice(p));
});
app.patch("/api/proposals/:id", (req, res) =>
  res.json(editProposal(req.params.id, req.body)),
);
app.post("/api/proposals/:id/approve", async (req, res) => {
  if (req.body.confirm !== true)
    throw Error("Explicit owner approval is required.");
  res.json(await serial(() => approve(req.params.id)));
});
app.get("/api/health", (_req, res) => res.json({ ok: true, mode }));
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API route not found" }),
);
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: { port: Number(process.env.PORT || 4310) + 2000 },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((x) => x.message).join("; ")
        : err.message || "Unexpected error";
    res
      .status(err.code === "LIMIT_FILE_SIZE" ? 413 : err.status || 400)
      .json({ error: message });
  },
);
const port = Number(process.env.PORT || 4310);
export const server = app.listen(port, "127.0.0.1", () =>
  console.log(`BillReady: http://127.0.0.1:${port} (${mode} adapter)`),
);
