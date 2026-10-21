# BillReady setup

## Launch the local application

Use Node 24.12 or later, npm, and a browser. Node 26 was used during development. From the BillReady project directory:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4310**. The default development adapter needs no credentials. The server supports real local uploads, PDF analysis of the synthetic acceptance format, persistent conversations, review cards, and generated invoice/packet files. Its agent responses are deterministic, and its tool activity is explicitly labeled development. It is a rehearsal, not live Box verification.

For a production-mode local run:

```sh
npm run build
npm start
```

The server binds to loopback. This conference app has one demo owner and no multi-user login or accounting integration. Keep it local. Do not deploy it publicly without adding application authentication and durable secret management.

## Prepare the source tree in Box

1. Extract `BillReady-Box-upload.zip`.
2. Upload the extracted **BillReady Demo** folder to the configured demo user's Box account as a folder tree. Preserve folder names and stable project identifiers.
3. Use an internal demo folder with no external collaborators or public shared link.
4. Copy the **BillReady Demo root folder ID** from the Box folder URL. Set `BOX_DEMO_ROOT_ID` to that one ID. Do not use the account root (`0`).
5. Do **not** upload `presenter-only`, `configuration`, or the complete `demo-kit` directory. The hero acceptance belongs only in `presenter-only` until the live app upload.

The application recursively lists only the selected root, handles folder pagination, finds the five stable `CW-101` through `CW-105` identifiers in project folder names, and maps their five standard subfolders and returned file IDs. You do not need to enter each file or subfolder ID. It refuses roots that do not identify BillReady Demo or lack the required tree.

## Configure remote Box MCP with OAuth

This application uses **Box's hosted remote MCP**, not the Box Community MCP server. The official MCP TypeScript SDK is the *client* transport used by the backend.

Recommended identity: the demo user who owns or can edit the uploaded tree.

1. In **Box Admin Console → Integrations**, enable the Box MCP server.
2. Open **Box MCP server → Configure → Additional Configuration → Add Integration Credentials**. Create credentials for BillReady and retain the client ID and client secret.
3. Register this exact redirect URI: **http://127.0.0.1:4310/auth/box/callback**.
4. Grant the required read/write content and Box AI scopes (`root_readwrite`, `ai.readwrite`) and tool access. Doc Gen is not used and does not need a scope for this demo.
5. Ensure these remote tools are available: `list_folder_content_by_folder_id`, `get_folder_details`, `get_file_content`, `ai_qa_multi_file`, `ai_extract_freeform`, `upload_file`, `get_upload_url`, `get_download_url`, `create_folder`, and `move_file`. The last two may need explicit admin enablement.
6. Copy `.env.example` to `.env` locally and fill in the credentials. Do not add them to the kit or chat.

```dotenv
BILLREADY_ADAPTER=live
PORT=4310
DEMO_DATE=2026-10-21
BOX_MCP_URL=https://mcp.box.com
BOX_CLIENT_ID=your_integration_client_id
BOX_CLIENT_SECRET=your_integration_client_secret
BOX_REDIRECT_URI=http://127.0.0.1:4310/auth/box/callback
BOX_DEMO_ROOT_ID=your_uploaded_root_id
AGENT_PROVIDER=box
# Optional alternative provider only:
# AGENT_PROVIDER=openai
# OPENAI_API_KEY=your_openai_api_key
# OPENAI_MODEL=a_responses_function_calling_model_enabled_for_your_account
```

Restart the server and open **http://127.0.0.1:4310/auth/box/start**, or use **Presenter controls → Connect Box with OAuth**. Complete Box's authorization flow as the demo user. The backend exchanges the one-time code and stores tokens in ignored `data/box-oauth.json` with file permissions `0600`. Tokens and the client secret never enter browser application state. Refresh tokens are rotated server-side; concurrent refreshes are serialized. The OAuth flow checks a one-time expiring state tied to an HttpOnly SameSite cookie. For a different local port, update both `BOX_REDIRECT_URI` and the registered Box callback.

If you already have a suitable authorized bearer token, `BOX_MCP_TOKEN` is an optional environment override. It takes priority over the OAuth cache and has no automatic refresh. Remove that override when using the OAuth flow.

Use OAuth for this signed-in-user demo. A CCG/service-account app is not required by this implementation.

Official references:
- [Box remote MCP setup](https://developer.box.com/guides/box-mcp/setup)
- [Box available tools and binary transfers](https://docs.box.com/en/box-mcp/tools)
- [Box OAuth authorization-code flow](https://developer.box.com/guides/authentication/oauth2/without-sdk)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)

## Inspect the real remote schemas before rehearsal

```sh
npm run box:inspect
```

This connects to remote Box MCP and writes the actual `tools/list` schemas to `verification/box-tool-schemas.json`. It never writes tokens. Tool access and schemas are discovered at runtime; the backend validates arguments against the actual schema before each call. A missing tool or required argument is an actionable error, never a silent simulation.

The shipped mappings support documented tool names and common schema names. If the tenant exposes a different argument name, set `BOX_MCP_SCHEMA_MAP` to a local JSON file mapping semantic names to actual names, for example:

```json
{"get_upload_url":{"folder_id":"parent_folder_id","file_name":"name"}}
```

This is a schema compatibility override, not permission to change the demo root. If the server has a different response/transfer contract, inspect the saved schemas and update the adapter before calling the live setup complete.

## First live refresh and checks

Click **Refresh evidence** once in the hero project to discover the tree and reassess that project. Using Overview refresh reassesses all five projects and will discover Northstar's misplaced acceptance immediately; use the hero view first if saving that discovery for a later scene.

The first tree inventory establishes mappings. On a clean seed, hero acceptance is absent; Northstar acceptance is in `01 Project records`. For the exact initial $34,000 blocked headline, do not run a workspace-wide reassessment before the opening scene. Project-level refresh checks the selected project only after inventory.

The default live agent uses Box AI Q&A through remote MCP for conversation, planning, evidence reasoning, and drafting. The custom server persists per-context conversation history, supplies relevant recent history and authoritative records on each turn, validates a constrained action plan, and executes evidence discovery or creates review proposals. Box AI is not a native chat-session API; BillReady owns the session and action loop. There is no separate OpenAI credential requirement with `AGENT_PROVIDER=box`. The optional `openai` provider uses the Responses API and the same constrained application tools. Neither provider can approve writes or invoke arbitrary Box operations. The application validates financial arithmetic, readiness, acceptance matches, attachments, and retry behavior. Selected prompts create proposals; only **Approve & save** persists business outputs.

For PDF acceptance and outputs, the backend requests `get_upload_url` through MCP, sends the actual PDF bytes as a standard Box multipart upload to the returned temporary Box URL with the returned single-use upload token when present, records the returned file ID, and lists the destination to verify the write. Text/email manifests use `upload_file`. PDF preview/download uses the MCP download URL. Transfer requests use HTTPS Box domains only. This is the explicit binary transfer step; the token is not exposed to the browser. The live tool schema requires `file_size_bytes`; the adapter provides it and uses the returned `upload_token` only in the transfer Authorization header. Missing tools or an unsupported response stops the operation with an error.

Box extraction can be temporarily unavailable while a new PDF is being indexed. The upload stays recorded, the blocker remains, and you can click Refresh evidence or retry the same upload after indexing; its content hash and stable name prevent duplicate files. Ambiguous or wrong-project acceptance stays in review.

## Storage boundary

Box holds source documents and approved outputs. SQLite holds workflow state, milestone acceptance associations, financial seed records, conversations, proposals, approval checkpoints, and stable Box mappings. Hidden files such as .DS_Store are ignored. Development content is local under `data/development/content`; live workflow state uses `data/live`. The default stores are separate so development IDs cannot become live mappings. OAuth tokens are separate from both stores and survive reset.

The structured seed and invoice register in the kit mirror `server/domain.ts`. Arithmetic uses integer USD cents. Ready and blocked count only completed unissued work. Future work is separate. Issued revenue comes solely from the synthetic register; drafts never update it. Outstanding includes issued amounts less payments. No UI operation issues invoices, records payments, sends emails, or shares files.

`DEMO_DATE` defaults to `2026-10-21`. Generate a fresh kit with the same value when changing it (`npm run kit`) and reset the workflow. Document dates, issue dates, relative follow-up dates and invoice due dates derive from that date. Zero tax is an explicit synthetic assumption.

## External-document refresh

There are no webhooks. The root-level `BillReady Rehearsal Archive` is excluded from active ingestion and analysis so archived acceptance does not spoil a reset. **Refresh evidence** recursively inventories the configured demo tree and reanalyzes acceptance candidates whose names include `accept` or `handover`. Use descriptive names, for example `CW-101-signed-acceptance.pdf`. It checks the document content, not just the filename or folder. Discovery also searches general project records, so misplaced Northstar acceptance is supported without moving it.

Development equivalent: copy a PDF into `data/development/external-inbox/CW-101/` (or the corresponding project ID), then click Refresh evidence. This uses the same validation as app upload. It does not read `presenter-only` automatically.

## Verification limits at delivery

The implementation was verified with an authorized demo user and a dedicated Box root. Actual remote tool schemas and the tree were retrieved, and Box AI Q&A/extraction succeeded. See [the verification record](../docs/verification.md) for the live workflow results. Each installation needs its own credentials and root ID. The optional OpenAI provider is untested because no OpenAI key was supplied; the default Box AI provider does not need one.
