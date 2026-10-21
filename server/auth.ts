import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
const tokenPath = path.resolve(
  process.env.BOX_TOKEN_FILE || "data/box-oauth.json",
);
type Token = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};
let cache: Token | undefined;
let refreshing: Promise<Token> | undefined;
function read() {
  if (cache) return cache;
  if (fs.existsSync(tokenPath))
    cache = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
  return cache;
}
export const hasBoxAuth = () =>
  !!process.env.BOX_MCP_TOKEN || !!read()?.access_token;
async function exchange(values: Record<string, string>): Promise<Token> {
  if (!process.env.BOX_CLIENT_ID || !process.env.BOX_CLIENT_SECRET)
    throw Error(
      "Set BOX_CLIENT_ID and BOX_CLIENT_SECRET in .env before connecting.",
    );
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
    throw Error(
      `Box OAuth failed (${r.status}). Check the integration credentials and registered redirect URI.`,
    );
  const data: any = await r.json();
  if (!data.access_token) throw Error("Box did not return an access token");
  const token = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  const temp = tokenPath + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(token), { mode: 0o600 });
  fs.renameSync(temp, tokenPath);
  fs.chmodSync(tokenPath, 0o600);
  cache = token;
  return token;
}
export async function boxToken() {
  if (process.env.BOX_MCP_TOKEN) return process.env.BOX_MCP_TOKEN;
  let token = read();
  if (!token)
    throw Error(
      "Authorize Box at /auth/box/start first, or configure BOX_MCP_TOKEN.",
    );
  if (token.expires_at < Date.now() + 60000) {
    if (!token.refresh_token)
      throw Error("Box session expired. Reconnect Box.");
    refreshing ??= exchange({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }).finally(() => {
      refreshing = undefined;
    });
    token = await refreshing;
  }
  return token.access_token;
}
const states = new Map<string, number>();
export function authRoutes(app: Express) {
  const redirect =
    process.env.BOX_REDIRECT_URI ||
    `http://127.0.0.1:${process.env.PORT || 4310}/auth/box/callback`;
  app.get("/auth/box/start", (_req, res) => {
    if (!process.env.BOX_CLIENT_ID || !process.env.BOX_CLIENT_SECRET)
      throw Error(
        "Set BOX_CLIENT_ID and BOX_CLIENT_SECRET in the local .env file first.",
      );
    const uri = new URL(redirect);
    if (
      !["127.0.0.1", "localhost"].includes(uri.hostname) ||
      uri.pathname !== "/auth/box/callback"
    )
      throw Error("This local demo requires a loopback OAuth redirect URI.");
    for (const [state, expires] of states)
      if (expires < Date.now()) states.delete(state);
    const state = randomBytes(32).toString("hex");
    states.set(state, Date.now() + 10 * 60 * 1000);
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
    const state = String(req.query.state || "");
    const cookie =
      req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("billready_oauth_state="))
        ?.split("=")[1] || "";
    if (
      !state ||
      state.length !== cookie.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(cookie)) ||
      (states.get(state) || 0) < Date.now()
    )
      throw Error(
        "OAuth state invalid or expired. Start the Box connection again.",
      );
    states.delete(state);
    res.clearCookie("billready_oauth_state", { path: "/auth/box" });
    if (req.query.error) throw Error("Box authorization was not granted.");
    if (typeof req.query.code !== "string")
      throw Error("Box authorization code missing");
    await exchange({
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: redirect,
    });
    res.setHeader("Referrer-Policy", "no-referrer");
    res.redirect("/#overview");
  });
}
