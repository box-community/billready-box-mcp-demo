# Explain Box MCP from the code

Use this alongside the [employee workflow](../demo-kit/DEMO_SCRIPT.md). Keep the code tour to three stops, then return to the application’s **Box MCP activity** panel.

## 1. Connect to the hosted server and discover tools

Open [`BoxMcpClient.open()`](../server/box-mcp.ts). Highlight the `https://mcp.box.com` endpoint, `StreamableHTTPClientTransport`, OAuth authorization header and `client.listTools()` pagination.

Say: “The app is an MCP client connected to Box’s hosted server. It discovers tools and input schemas from that server.”

The official MCP TypeScript SDK is a client library. It is not a locally hosted Box server. The endpoint check prevents silently changing to another MCP service.

For account isolation, show [`employeeMiddleware()`](../server/auth.ts), which obtains a client and token provider for the authenticated Box user. [`context.ts`](../server/context.ts) carries that identity and selected workspace through a request. Shared folder access does not make two employees share credentials or local chats.

## 2. Show the real execution point

In [`callBoxTool()`](../server/box-mcp.ts), highlight this actual SDK call:

```ts
const result = await activeClient.callTool({ name, arguments: args });
```

Say: “Call sites provide a tool name and structured arguments. We validate those against Box’s discovered schema, execute the remote call, then sanitize the trace for the UI.”

Open **Box MCP activity** in the app and expand a completed call. Show its actual tool name, parameter fields, elapsed time and result. Long prompts are collapsed; raw JSON is optional. Do not show `.env` or token-cache files.

## 3. Connect a business action to MCP

During acceptance upload, show [`analyze()`](../server/adapter.ts): it passes the actual Box file ID and an extraction prompt to `ai_extract_freeform`. Then show [`reassess()`](../server/workflow.ts) and [`validateAcceptance()`](../server/domain.ts).

Say: “Box AI extracts facts through MCP. Our application checks the client, business project code, milestone, signature, affirmative acceptance and date before changing billing readiness.”

The $18,000 calculation is application code using integer cents. Box AI does not approve the invoice or directly mutate the financial totals.

## Questions worth a second code stop

| Question                          | Entry point                                                                                                                | What to explain                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| How does the chat use Box AI?     | [`planWithBoxAI()`](../server/box-agent.ts)                                                                                | `ai_qa_multi_file` receives selected file IDs, authoritative application facts and recent history. Code validates the returned action. |
| Does MCP carry the PDF bytes?     | [`RemoteBox.persist()`](../server/box-content.ts)                                                                          | `get_upload_url` issues a temporary URL. The app transfers bytes separately and verifies the saved file.                               |
| How are the on-screen calls real? | [`traceCall()`](../server/tracing.ts), [`streamWorkflow()`](../server/index.ts), [`ToolActivity`](../src/ToolActivity.tsx) | SDK execution produces sanitized request-scoped events streamed to the browser. Binary transfers have distinct labels.                 |
| What happens after approval?      | [`approve()`](../server/workflow.ts)                                                                                       | The app generates PDFs and saves draft output files to Box. It does not issue an invoice or send email.                                |

## Short closing explanation

“Clearwave’s engineer owns the interface, workflow rules and approval steps. Box MCP connects those actions to each employee’s permitted Box content, and Box AI helps interpret that content.”

Runtime tool schemas and the actual connection govern availability. For service setup, use the [official Box MCP setup guide](https://developer.box.com/guides/box-mcp/setup) and [tool reference](https://docs.box.com/en/box-mcp/tools).
