import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import {
  currentEmployee,
  employeeContext,
  type Employee,
  type Workspace,
} from "./context.ts";
import type { BoxMcpClient } from "./box-mcp.ts";
import type { Trace } from "./tracing.ts";

type Token = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};
type Account = {
  employee: Employee;
  token: Token;
  workspace?: Workspace;
  revision: number;
};
type Session = { accountId: string; expires: number };
const accountPath = path.resolve(
  process.env.EMPLOYEE_AUTH_FILE || "data/employee-auth/accounts.json",
);
const accounts = new Map<string, Account>();
const sessions = new Map<string, Session>();
const states = new Map<string, { expires: number; sessionId: string }>();
const clients = new Map<string, BoxMcpClient>();
const traces = new Map<string, Trace[]>();
const refreshing = new Map<string, Promise<Token>>();
let loaded = false;
const cookieName = "billready_session";
const sessionAge = 8 * 60 * 60 * 1000;
function load() {
  if (loaded) return;
  if (fs.existsSync(accountPath))
    for (const a of JSON.parse(fs.readFileSync(accountPath, "utf8")))
      accounts.set(a.employee.id, a);
  loaded = true;
}
function persist() {
  fs.mkdirSync(path.dirname(accountPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    accountPath + ".tmp",
    JSON.stringify([...accounts.values()]),
    { mode: 0o600 },
  );
  fs.renameSync(accountPath + ".tmp", accountPath);
  fs.chmodSync(accountPath, 0o600);
}
export function cookie(req: Request, name = cookieName) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
function session(req: Request) {
  load();
  const id = cookie(req),
    s = sessions.get(id);
  if (!s || s.expires < Date.now()) {
    sessions.delete(id);
    return undefined;
  }
  const account = accounts.get(s.accountId);
  return account ? { id, session: s, account } : undefined;
}
function setCookie(res: Response, id: string) {
  res.cookie(cookieName, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: sessionAge,
  });
}
export const hasBoxAuth = () => !!currentEmployee();
export async function boxToken(): Promise<string> {
  throw Error(
    "Authorize Box using employee sign-in. Shared tokens are disabled.",
  );
}
async function exchange(values: Record<string, string>): Promise<Token> {
  if (!process.env.BOX_CLIENT_ID || !process.env.BOX_CLIENT_SECRET)
    throw Error("Configure BOX_CLIENT_ID and BOX_CLIENT_SECRET first.");
  const r = await fetch("https://api.box.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...values,
      client_id: process.env.BOX_CLIENT_ID,
      client_secret: process.env.BOX_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok)
    throw Object.assign(
      Error(
        `Box OAuth failed (${r.status}). Reconnect Box or check the registered callback.`,
      ),
      { status: 401 },
    );
  const data: any = await r.json();
  if (!data.access_token) throw Error("Box did not return an access token.");
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
}
async function accountToken(id: string) {
  const account = accounts.get(id);
  if (!account)
    throw Object.assign(Error("Sign in with Box."), { status: 401 });
  if (account.token.expires_at < Date.now() + 60000) {
    if (!account.token.refresh_token)
      throw Object.assign(Error("Reconnect Box."), { status: 401 });
    let pending = refreshing.get(id);
    if (!pending) {
      pending = exchange({
        grant_type: "refresh_token",
        refresh_token: account.token.refresh_token,
      })
        .then((token) => {
          account.token = token;
          persist();
          return token;
        })
        .finally(() => refreshing.delete(id));
      refreshing.set(id, pending);
    }
    await pending;
  }
  return account.token.access_token;
}
export function sessionInfo(req: Request) {
  const s = session(req);
  return {
    mode: process.env.BILLREADY_ADAPTER || "development",
    employee: s?.account.employee || null,
    workspace: s?.account.workspace || null,
  };
}
export async function employeeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    process.env.BILLREADY_ADAPTER !== "live" ||
    req.path === "/health" ||
    req.path === "/session"
  )
    return next();
  const s = session(req);
  if (!s) return res.status(401).json({ error: "Sign in with Box first." });
  try {
    let mcp = clients.get(s.account.employee.id);
    if (!mcp) {
      const { BoxMcpClient } = await import("./box-mcp.ts");
      mcp = new BoxMcpClient(() => accountToken(s.account.employee.id));
      clients.set(s.account.employee.id, mcp);
    }
    const revision = s.account.revision;
    const key = `${s.account.employee.id}/${s.account.workspace?.id || "none"}`;
    if (!traces.has(key)) traces.set(key, []);
    employeeContext.run(
      {
        employee: s.account.employee,
        workspace: s.account.workspace,
        mcp,
        traces: traces.get(key)!,
        assertActive: () => {
          if (
            !sessions.has(s.id) ||
            s.session.expires < Date.now() ||
            accounts.get(s.account.employee.id)?.revision !== revision
          )
            throw Object.assign(
              Error(
                "Session or workspace changed. Reload and sign in if needed.",
              ),
              { status: 401 },
            );
        },
      },
      next,
    );
  } catch (e) {
    next(e);
  }
}
export function selectWorkspace(req: Request, workspace: Workspace) {
  const s = session(req);
  if (!s) throw Object.assign(Error("Sign in first."), { status: 401 });
  s.account.workspace = workspace;
  s.account.revision++;
  persist();
}
function invalidate(req: Request) {
  sessions.delete(cookie(req));
}
export function authRoutes(app: Express) {
  const redirect =
    process.env.BOX_REDIRECT_URI ||
    `http://127.0.0.1:${process.env.PORT || 4310}/auth/box/callback`;
  app.get("/api/session", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(sessionInfo(req));
  });
  app.post("/auth/signout", (req, res) => {
    if (
      req.headers.origin &&
      new URL(req.headers.origin).host !== req.headers.host
    )
      return res
        .status(403)
        .json({ error: "Cross-origin writes are not allowed." });
    invalidate(req);
    res.clearCookie(cookieName, { path: "/" });
    res.json({ ok: true });
  });
  app.get("/auth/box/start", (req, res) => {
    if (!process.env.BOX_CLIENT_ID || !process.env.BOX_CLIENT_SECRET)
      throw Error("Configure BOX_CLIENT_ID and BOX_CLIENT_SECRET first.");
    const uri = new URL(redirect);
    if (
      !["127.0.0.1", "localhost"].includes(uri.hostname) ||
      uri.pathname !== "/auth/box/callback"
    )
      throw Error(
        "Employee sign-in currently requires a loopback OAuth callback.",
      );
    invalidate(req);
    for (const [key, s] of states)
      if (s.expires < Date.now()) states.delete(key);
    const sessionId = randomBytes(32).toString("hex"),
      state = randomBytes(32).toString("hex");
    states.set(state, { sessionId, expires: Date.now() + 600000 });
    setCookie(res, sessionId);
    res.cookie("billready_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600000,
      path: "/auth/box",
    });
    const url = new URL("https://account.box.com/api/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: process.env.BOX_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirect,
      state,
    }).toString();
    res.setHeader("Referrer-Policy", "no-referrer");
    res.redirect(url.href);
  });
  app.get("/auth/box/callback", async (req, res) => {
    const state = String(req.query.state || ""),
      stateCookie = cookie(req, "billready_oauth_state"),
      pending = states.get(state);
    if (
      !state ||
      state.length !== stateCookie.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(stateCookie)) ||
      !pending ||
      pending.expires < Date.now() ||
      pending.sessionId !== cookie(req)
    )
      throw Error("OAuth state invalid or expired. Start sign-in again.");
    states.delete(state);
    res.clearCookie("billready_oauth_state", { path: "/auth/box" });
    if (req.query.error || typeof req.query.code !== "string")
      throw Error("Box authorization was not granted.");
    const token = await exchange({
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: redirect,
    });
    const { BoxMcpClient } = await import("./box-mcp.ts");
    const identityClient = new BoxMcpClient(async () => token.access_token);
    let raw: any;
    try {
      raw = await identityClient.callBoxTool("who_am_i", {});
    } finally {
      await identityClient.client?.close().catch(() => {});
    }
    const user =
      raw?.user || raw?.result?.user || raw?.result || raw?.data || raw;
    const id = String(user?.id || user?.user_id || "");
    const email = user?.login || user?.email;
    if (
      !/^\d+$/.test(id) ||
      typeof user?.name !== "string" ||
      typeof email !== "string"
    )
      throw Error("Box identity response missing user ID, name, or email.");
    load();
    // Reauthorization must not race a rotating refresh token for this account.
    await refreshing.get(id)?.catch(() => {});
    const previous = accounts.get(id);
    accounts.set(id, {
      employee: { id, name: user.name, email },
      token,
      workspace: previous?.workspace,
      revision: (previous?.revision || 0) + 1,
    });
    persist();
    const oldClient = clients.get(id);
    clients.delete(id);
    await oldClient?.client?.close().catch(() => {});
    const sessionId = randomBytes(32).toString("hex");
    sessions.set(sessionId, {
      accountId: id,
      expires: Date.now() + sessionAge,
    });
    setCookie(res, sessionId);
    res.setHeader("Referrer-Policy", "no-referrer");
    res.redirect("/#overview");
  });
}
