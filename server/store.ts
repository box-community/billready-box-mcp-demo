import { currentEmployee } from "./context.ts";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  seedProjects,
  projectOwner,
  type Project,
  DEMO_DATE,
} from "./domain.ts";
export const dataDir = path.resolve(
  process.env.DATA_DIR ||
    "data/" + (process.env.BILLREADY_ADAPTER || "development"),
);
export function storageDir() {
  const scope = currentEmployee();
  if (!scope) return dataDir;
  scope.assertActive();
  if (!scope.workspace) throw Error("Choose a workspace folder first.");
  return path.resolve(
    process.env.EMPLOYEE_DATA_DIR || "data/employees",
    scope.employee.id,
    scope.workspace.id,
  );
}
const databases = new Map<string, DatabaseSync>();

function database() {
  const dir = storageDir();
  let db = databases.get(dir);
  if (!db) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    db = new DatabaseSync(path.join(dir, "billready.sqlite"));
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    databases.set(dir, db);
  }
  const scope = currentEmployee();
  if (scope?.workspace) {
    const marker = path.resolve(
      process.env.EMPLOYEE_DATA_DIR || "data/employees",
      "_reset-epochs",
      scope.workspace.id,
    );
    const epoch = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "";
    const recorded = db
      .prepare("SELECT value FROM kv WHERE key='resetEpoch'")
      .get() as { value: string } | undefined;
    if ((recorded ? JSON.parse(recorded.value) : "") !== epoch) {
      db.exec("DELETE FROM kv");
      scope.traces.length = 0;
      db.prepare("INSERT INTO kv(key,value) VALUES('resetEpoch',?)").run(
        JSON.stringify(epoch),
      );
      for (const folder of ["previews", "content", "external-inbox"])
        fs.rmSync(path.join(dir, folder), { recursive: true, force: true });
    }
  }
  return db;
}
export function get<T>(key: string, fallback: T): T {
  const r = database().prepare("SELECT value FROM kv WHERE key=?").get(key) as
    { value: string } | undefined;
  return r ? JSON.parse(r.value) : fallback;
}
export function put(key: string, value: unknown) {
  database()
    .prepare(
      "INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, JSON.stringify(value));
}
export function projects() {
  const stored = get<Project[]>(
    "projects",
    currentEmployee() ? [] : seedProjects(),
  );
  const updated = stored.map((p) => ({
    ...p,
    owner: projectOwner(p.businessId || p.id, p.owner),
  }));
  if (stored.some((p, i) => p.owner !== updated[i].owner))
    put("projects", updated);
  return updated;
}
export function updateProject(p: Project) {
  put(
    "projects",
    projects().map((x) => (x.id === p.id ? p : x)),
  );
}
export type Doc = {
  id: string;
  projectId?: string;
  name: string;
  category: string;
  path?: string;
  folderId?: string;
  boxId?: string;
  etag?: string;
  generated?: boolean;
  hash?: string;
  analysis?: string;
  valid?: boolean;
};
export const documents = () => get<Doc[]>("documents", []);
export const addDoc = (d: Doc) => {
  put("documents", [...documents().filter((x) => x.id !== d.id), d]);
  return d;
};
export type Activity = {
  id: string;
  text: string;
  projectId?: string;
  date: string;
};
export function activity(text: string, projectId?: string) {
  put(
    "activity",
    [
      { id: crypto.randomUUID(), text, projectId, date: DEMO_DATE },
      ...get<Activity[]>("activity", []),
    ].slice(0, 80),
  );
}
export function initialize(docs: Doc[]) {
  if (!get("initialized", false)) {
    put("projects", currentEmployee() ? [] : seedProjects());
    put("documents", docs);
    put("initialized", true);
    activity(
      currentEmployee()
        ? "Workspace connected."
        : "Five projects synced. Billing readiness checked.",
    );
  }
}
export function resetStore() {
  database().exec("DELETE FROM kv");
}
export function transaction<T>(fn: () => T): T {
  database().exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    database().exec("COMMIT");
    return r;
  } catch (e) {
    database().exec("ROLLBACK");
    throw e;
  }
}
// Serialize mutations across async integration calls; each approval/upload retry sees committed state.
let tail = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = tail.then(fn);
  tail = next.then(
    () => {},
    () => {},
  );
  return next;
}
