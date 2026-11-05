import { currentEmployee } from "./context.ts";
import Ajv, { type ValidateFunction } from "ajv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { boxToken, hasBoxAuth } from "./auth.ts";
import { traceCall, sanitizeTrace } from "./tracing.ts";

/**
 * MCP client for Box's hosted server at https://mcp.box.com.
 * Employee middleware supplies one instance and token provider per Box user;
 * the SDK is the client transport, not a locally hosted Box MCP server.
 */
export class BoxMcpClient {
  constructor(private tokenProvider = boxToken) {}
  client?: Client;
  tools: Tool[] = [];
  private connecting?: Promise<void>;
  private validators = new Map<string, ValidateFunction>();
  private ajv = new Ajv({ strict: false, allErrors: true });

  /** Reuse the connection and share an in-flight handshake across concurrent calls. */
  async connect() {
    if (this.client) return;
    this.connecting ??= this.open().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  /**
   * Authenticate the HTTP transport, then discover every page of remote tool schemas.
   * Fetching the token for each request lets OAuth refresh work on a reused connection.
   */
  private async open() {
    if (this.tokenProvider === boxToken && !hasBoxAuth())
      throw Error(
        "Authorize Box through /auth/box/start first, or configure BOX_MCP_TOKEN.",
      );
    const endpoint = new URL(process.env.BOX_MCP_URL || "https://mcp.box.com");
    if (
      endpoint.origin !== "https://mcp.box.com" ||
      endpoint.pathname !== "/" ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.username ||
      endpoint.password
    )
      throw Error("Box MCP endpoint must be https://mcp.box.com");
    const client = new Client({ name: "BillReady", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(endpoint, {
          fetch: async (url, init) => {
            const headers = new Headers(init?.headers);
            // Read/refresh the token for every request, not just at connection time.
            headers.set(
              "Authorization",
              `Bearer ${await this.tokenProvider()}`,
            );
            return fetch(url, { ...init, headers });
          },
        }),
      );
      const tools: Tool[] = [];
      let cursor: string | undefined;
      do {
        const page = await traceCall(
          "tools/list",
          cursor ? { cursor } : {},
          () => client.listTools({ cursor }),
        );
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      this.tools = tools;
      this.validators.clear();
      this.client = client;
    } catch (error) {
      await client.close().catch(() => {});
      throw Error(String(sanitizeTrace((error as Error).message)));
    }
  }

  /**
   * Execute a named Box tool with arguments checked against its discovered schema.
   * This single execution point records sanitized activity for the live demo UI.
   */
  async callBoxTool(name: string, args: Record<string, unknown>) {
    await this.connect();
    const tool = this.tools.find((tool) => tool.name === name);
    if (!tool)
      throw Error(
        `Remote Box MCP tool ${name} is unavailable. Check Box Admin Console.`,
      );
    // Validate exact arguments against Box's discovered schema; compile once per tool.
    let validate = this.validators.get(name);
    if (!validate) {
      validate = this.ajv.compile(tool.inputSchema);
      this.validators.set(name, validate);
    }
    if (!validate(args))
      throw Error(
        `Invalid arguments for ${name}: ${this.ajv.errorsText(validate.errors)}`,
      );
    return traceCall(name, args, async () => {
      const activeClient = this.client!;
      let toolError = false;
      try {
        // This is the single SDK execution point shown in the live activity panel.
        const result = await activeClient.callTool({ name, arguments: args });
        if (result.isError) {
          toolError = true;
          throw Error(JSON.stringify(sanitizeTrace(result)));
        }
        return unpackToolResult(result);
      } catch (error) {
        const message = (error as Error).message;
        // A stale hosted MCP session is a transport failure, not a missing Box folder.
        // Reconnect on the next explicit attempt; never silently replay a possible write.
        if (
          !toolError &&
          /\b404\b|session.*(?:expired|invalid|not.found)/i.test(message)
        ) {
          if (this.client === activeClient) {
            this.client = undefined;
            this.tools = [];
            this.validators.clear();
            await activeClient.close?.().catch(() => {});
          }
          throw Error(
            "MCP session unavailable. Retry to reconnect. " +
              String(sanitizeTrace(message)),
          );
        }
        throw Error(String(sanitizeTrace(message)));
      }
    });
  }
}

/** Normalize structured results and JSON/text blocks without assuming one tool response format. */
function unpackToolResult(result: any): any {
  if (result.structuredContent) return result.structuredContent;
  const texts =
    result.content
      ?.filter((part: any) => part.type === "text")
      .map((part: any) => part.text) || [];
  if (texts.length !== 1) return texts;
  try {
    return JSON.parse(texts[0]);
  } catch {
    return texts[0];
  }
}
const legacyClient = new BoxMcpClient();
// Resolve the client from the server-side request context, never a browser-supplied user ID.
// Employee requests use their own client; the legacy instance cannot supply live shared credentials.
export const boxMcp = new Proxy(legacyClient, {
  get(_target, key) {
    const scope = currentEmployee();
    scope?.assertActive();
    const client = scope?.mcp || legacyClient;
    const value = Reflect.get(client, key);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
