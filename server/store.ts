import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedProjects, type Project, DEMO_DATE } from "./domain.ts";
export const dataDir = path.resolve(
  process.env.DATA_DIR ||
    "data/" + (process.env.BILLREADY_ADAPTER || "development"),
);
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "billready.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
);
export function get<T>(key: string, fallback: T): T {
  const r = db.prepare("SELECT value FROM kv WHERE key=?").get(key) as
    { value: string } | undefined;
  return r ? JSON.parse(r.value) : fallback;
}
export function put(key: string, value: unknown) {
  db.prepare(
    "INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, JSON.stringify(value));
}
export const projects = () => get<Project[]>("projects", seedProjects());
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
    put("projects", seedProjects());
    put("documents", docs);
    put("initialized", true);
    activity("Five projects synced. Billing readiness checked.");
  }
}
export function resetStore() {
  db.exec("DELETE FROM kv");
}
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
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
