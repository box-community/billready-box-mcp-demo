import { AsyncLocalStorage } from "node:async_hooks";
export type Trace = {
  seq: number;
  tool: string;
  detail: string;
  mode: string;
  kind?: "mcp" | "transfer" | "info";
  status?: "running" | "completed" | "failed";
  startedAt?: string;
  durationMs?: number;
  parameters?: unknown;
  result?: unknown;
  resultSummary?: string;
  error?: string;
};
const listeners = new AsyncLocalStorage<{
  notify: (entry: Trace) => void;
  entries: Map<number, Trace>;
}>();
export const withTrace = <T>(
  listener: (entry: Trace) => void,
  fn: () => T,
): T => listeners.run({ notify: listener, entries: new Map() }, fn);
export const currentTrace = () => {
  const scope = listeners.getStore();
  return scope ? [...scope.entries.values()] : undefined;
};
export const trace: Trace[] = [];
let sequence = 0;
export function sanitizeTrace(value: unknown): unknown {
  const secrets = ["BOX_CLIENT_SECRET", "BOX_MCP_TOKEN", "OPENAI_API_KEY"]
    .map((k) => process.env[k])
    .filter((s): s is string => !!s);
  let budget = 24000;
  const clean = (v: any, depth: number): any => {
    if (budget <= 0 || depth > 7) return "[truncated]";
    if (ArrayBuffer.isView(v))
      return { bytes: v.byteLength, content: "[binary omitted]" };
    if (typeof v === "string") {
      if (/^\s*[\[{]/.test(v)) {
        try {
          return JSON.stringify(clean(JSON.parse(v), depth + 1), null, 2);
        } catch {}
      }
      let s = v;
      for (const secret of secrets) s = s.split(secret).join("[redacted]");
      s = s
        .replace(/Bearer\s+[\w.\-]+/gi, "Bearer [redacted]")
        .replace(/https?:\/\/[^\s"<>\\]+/gi, "[URL redacted]")
        .replace(
          /((?:access_token|refresh_token|client_secret|authorization|upload_token)["'\s]*[:=]["'\s]*)[^\s,"'}]+/gi,
          "$1[redacted]",
        );
      const limit = Math.min(12000, budget);
      budget -= Math.min(s.length, limit);
      return s.length > limit ? s.slice(0, limit) + "… [truncated]" : s;
    }
    if (Array.isArray(v))
      return [
        ...v.slice(0, 30).map((x) => clean(x, depth + 1)),
        ...(v.length > 30 ? [`[${v.length - 30} more items]`] : []),
      ];
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .slice(0, 40)
          .map(([k, x]) => [
            k,
            /secret|token|authorization|cookie|password|signed.?url|upload.?url|download.?url/i.test(
              k,
            )
              ? "[redacted]"
              : clean(x, depth + 1),
          ]),
      );
    return v;
  };
  return clean(value, 0);
}
function publish(entry: Trace) {
  const scope = listeners.getStore();
  if (scope) {
    const safe = structuredClone(entry);
    scope.entries.set(entry.seq, safe);
    scope.notify(safe);
  }
}
export function log(tool: string, detail: string) {
  const entry: Trace = {
    seq: ++sequence,
    tool,
    detail,
    mode: process.env.BILLREADY_ADAPTER || "development",
    kind: "info",
    status: "completed",
  };
  trace.push(entry);
  if (trace.length > 150) trace.shift();
  publish(entry);
}
export async function traceCall<T>(
  tool: string,
  parameters: unknown,
  fn: () => Promise<T>,
  kind: "mcp" | "transfer" = "mcp",
): Promise<T> {
  const start = performance.now();
  const entry: Trace = {
    seq: ++sequence,
    tool,
    detail:
      kind === "mcp" ? "Remote Box MCP" : "Binary transfer · MCP-issued URL",
    mode: process.env.BILLREADY_ADAPTER || "development",
    kind,
    status: "running",
    startedAt: new Date().toISOString(),
    parameters: sanitizeTrace(parameters),
  };
  trace.push(entry);
  if (trace.length > 150) trace.shift();
  publish(entry);
  try {
    const result = await fn();
    entry.result = sanitizeTrace(result);
    const data = result as any;
    entry.resultSummary = ArrayBuffer.isView(data)
      ? `${data.byteLength.toLocaleString()} bytes transferred`
      : Array.isArray(data?.entries)
        ? `${data.entries.length} items returned${typeof data.total_count === "number" ? ` · ${data.total_count} total` : ""}`
        : Array.isArray(data?.tools)
          ? `${data.tools.length} tool schemas returned`
          : Array.isArray(data)
            ? `${data.length} results returned`
            : "Response received";
    entry.status = "completed";
    return result;
  } catch (e) {
    entry.status = "failed";
    entry.error = String(sanitizeTrace((e as Error).message));
    throw e;
  } finally {
    entry.durationMs = Math.round(performance.now() - start);
    publish(entry);
  }
}
