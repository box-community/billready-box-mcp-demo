import type { Trace } from "../server/tracing.ts";

// Shared SSE reader for chat and proof upload. Payloads are sanitized by the server.
export async function streamRequest<T>(
  url: string,
  init: RequestInit,
  onTool: (entry: Trace) => void,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok || !response.body)
    throw Error("Could not start the workflow. Please try again.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    reply: T | undefined;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const type = event
          .split("\n")
          .find((l) => l.startsWith("event: "))
          ?.slice(7);
        const raw = event
          .split("\n")
          .find((l) => l.startsWith("data: "))
          ?.slice(6);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (type === "failure") throw Error(data.error);
        if (type === "tool") onTool(data);
        if (type === "reply") reply = data;
      }
    }
    if (reply === undefined)
      throw Error(
        "Connection interrupted. Refresh to check the workflow's status.",
      );
    return reply;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
