import "dotenv/config";
import { authRoutes, hasBoxAuth } from "./auth.ts";
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
initialize(mode === "development" ? localSeedDocs() : documents());
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
authRoutes(app);
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host)
    return res
      .status(403)
      .json({ error: "Cross-origin writes are not allowed" });
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/api/state", (_req, res) => {
  const ps = projects();
  res.json({
    mode,
    demoDate: DEMO_DATE,
    projects: ps.map((p) => ({ ...p, billing: billing(p) })),
    totals: totals(ps),
    documents: documents().map(({ path, ...d }) => d),
    proposals: proposals(),
    activity: get<Activity[]>("activity", []),
    folders: mode === "live" ? get("boxFolders", {}) : {},
    connection: {
      box: hasBoxAuth(),
      root: !!process.env.BOX_DEMO_ROOT_ID,
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
  res.json(await serial(() => chat(req.params.context, text)));
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
app.post(
  "/api/projects/:pid/acceptance",
  upload.single("file"),
  async (req, res) => {
    res.json(
      await serial(async () => {
        const p = projects().find((p) => p.id === req.params.pid);
        if (!p) throw Error("Unknown project");
        if (
          !req.file ||
          !req.file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
        )
          throw Error("Upload a readable PDF (up to 10 MB).");
        const digest = hash(req.file.buffer);
        const prev = documents().find(
          (d) => d.hash === digest && d.projectId === p.id,
        );
        if (prev?.valid)
          return {
            document: prev,
            valid: true,
            message: "Acceptance already verified. No duplicate upload.",
          };
        const name = `${p.id}-acceptance-${digest.slice(0, 12)}.pdf`;
        let d = prev || {
          ...(await persistFile(req.file.buffer, name, p.id, "03 Acceptance")),
          hash: digest,
          generated: false,
        };
        addDoc(d);
        activity(
          "Acceptance uploaded. Checking client, project, milestone, and signature.",
          p.id,
        );
        if (req.query.defer === "1") return { document: d, uploaded: true };
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
      }),
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
app.post("/api/refresh", async (req, res) =>
  res.json(await serial(() => discover(req.body.projectId))),
);
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
      .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ error: message });
  },
);
const port = Number(process.env.PORT || 4310);
app.listen(port, "127.0.0.1", () =>
  console.log(`BillReady: http://127.0.0.1:${port} (${mode} adapter)`),
);
