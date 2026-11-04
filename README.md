# BillReady · Clearwave AV

**A custom Box workspace built by Clearwave AV engineering for its operations team.** BillReady turns the project documents employees already keep in Box into a visual billing workflow: see completed work, resolve missing acceptance, and prepare an evidence-backed billing package for review.

This repository illustrates how a company can customize its Box experience using **Box’s hosted remote MCP server at `https://mcp.box.com` and Box AI**. Employees sign in with their own Box accounts and choose a workspace folder. Their Box permissions determine which supported projects appear, including shared folders. No OpenAI API key is required for the default agent.

The application prepares drafts. Approval saves documents to Box; employees finalize invoices in their accounting system and send emails themselves.

## What employees can do

- See ready, blocked, future, invoiced, and outstanding amounts for their workspace projects.
- Ask the billing assistant about evidence, find misplaced acceptance, or prepare a review proposal.
- Upload signed acceptance and watch the actual Box MCP activity behind verification and updated readiness.
- Review a fitted PDF invoice, edit email copy and attachments, and explicitly approve saving.
- Open the saved package in Box, download documents, copy the email, or open their email application.
- Change workspace folders, sign out, or switch Box accounts. Different access or folder selections produce different project lists.

## Technology and responsibilities

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Employee interface | React 19, TypeScript, Vite, PDF.js, Lucide | Workspace, projects, assistant, review, document preview |
| Application server | Node.js, Express, TypeScript | Employee sessions, OAuth, validated actions, streaming activity |
| Workflow state | SQLite and restricted local directories | Separate chats, proposals, mappings, files and checkpoints per employee/workspace |
| MCP client | Official MCP TypeScript SDK, Streamable HTTP, AJV | Per-account connection to Box’s hosted MCP, actual schema validation |
| Content and intelligence | Box, Box AI through hosted MCP | Project evidence, document extraction and reasoning, saved outputs |
| Financial/document rules | Application TypeScript, Zod, PDFKit, pdf-lib | Integer-cent calculations, acceptance validation, draft generation |

```mermaid
flowchart TB
    Employee[Clearwave AV employee] --> UI[Company-built React workspace]
    UI --> API[Express: authenticated employee session]
    API --> Rules[Application-owned workflow and approval rules]
    API --> Auth[Per-account Box OAuth credentials]
    Rules --> State[(State and files by Box user ID + workspace folder ID)]
    Rules --> PDF[Draft invoice and billing packet generation]
    Rules --> MCP[Per-account MCP client]
    Auth --> MCP
    MCP --> Hosted[Box hosted remote MCP: https://mcp.box.com]
    Hosted --> Content[(Accessible Box project folders)]
    Hosted --> AI[Box AI: reasoning and extraction]
    API -->|Binary bytes via MCP-issued temporary URLs| Content
    MCP --> Events[Sanitized request-scoped tool activity]
    Events --> UI
```

Clearwave’s engineer owns the interface, supported project format, financial calculations, validation, review process, and session storage. Box supplies content access and intelligence through remote MCP. BillReady is a custom application connected to Box; it does not modify the Box web application or host a replacement MCP server. The MCP SDK is a client dependency. Binary bytes travel through temporary URLs issued by MCP.

## Start locally

Requirements: Node.js 24.12 or later and npm. Development used Node.js 26.

```sh
git clone https://github.com/box-community/billready.git
cd billready
npm ci
cp .env.example .env
npm run dev
```

Open [http://127.0.0.1:4310](http://127.0.0.1:4310). The default `BILLREADY_ADAPTER=development` uses fictional sample projects, deterministic assistant replies, and local PDF uploads. It is visibly labeled **Local development** and makes no live Box calls. It does not exercise employee authentication.

For a built frontend served locally:

```sh
npm run build
npm start
```

Both launch paths bind to loopback. Public team deployment requires a separate hosting design, HTTPS cookie settings, managed credential storage, and shared session/coordination infrastructure. Current sessions and cross-account approval locks run within one Node.js process.

## Configure employee Box sign-in

1. Enable Box MCP and create the custom integration credentials in your Box administration environment. Permit the intended employees to use the integration and enable the tools below, including binary URL tools.
2. Register the exact callback `http://127.0.0.1:4310/auth/box/callback`. Scheme, hostname, port and path must match; `localhost` and `127.0.0.1` differ.
3. Set these values in the ignored local `.env`:

```dotenv
BILLREADY_ADAPTER=live
PORT=4310
DEMO_DATE=2026-10-21
BOX_MCP_URL=https://mcp.box.com
BOX_CLIENT_ID=your_custom_integration_client_id
BOX_CLIENT_SECRET=your_custom_integration_client_secret
BOX_REDIRECT_URI=http://127.0.0.1:4310/auth/box/callback
AGENT_PROVIDER=box
```

4. Restart the server, open the application and choose **Sign in with Box**. Each employee completes OAuth using their own Box account. One integration client ID and secret serve these individual authorizations; a CCG app is not required.
5. Browse the employee’s accessible folders, open the desired folder, and select **Use this folder**. Folder selection does not grant or change Box permissions. Account root is available for navigation but cannot be selected as the workflow scope.
6. The app inventories only the selected subtree, reads supported project records, validates acceptance and displays accessible projects. Unsupported records produce warnings; an empty folder stays empty.

The selection is remembered by verified Box user ID. Changing it updates that account’s active workspace across its sessions. Two employees can select the same shared folder; each retains separate local chats and draft proposals. Cross-account approval coordination reuses saved output IDs for the same Box project and milestones.

Official references: [Box MCP setup](https://developer.box.com/guides/box-mcp/setup), [available tools](https://docs.box.com/en/box-mcp/tools), [OAuth authorization-code flow](https://developer.box.com/guides/authentication/oauth2/without-sdk).

### Supported workspace structure

Use the included [Box upload kit](demo-kit/BillReady-Box-upload.zip) or folders following this structure. The selected workspace name is unrestricted; it may contain a subset of the sample projects or other projects following the same record format.

```text
Selected workspace/
├── Company/                         # Optional supporting company documents
└── Projects/                        # Optional grouping folder
    └── Project folder/
        ├── 01 Project records/      # project.json + agreement
        ├── 02 Delivery evidence/    # Completion report
        ├── 03 Acceptance/           # Signed customer acceptance
        ├── 04 Billing/              # Saved billing package
        └── 05 Follow-ups/           # Approved follow-up records
```

`project.json` must contain a unique business `id`, client/name/shortName, contact/email, owner, hex color, progress, and milestones. Each milestone has an ID/name, integer-cent value and paid amount, complete/issued/accepted/acceptanceRequired booleans, and optional issued date. See the [sample record](demo-kit/upload-to-box/BillReady%20Demo/Projects/CW-101%20Alder%20%26%20Finch/01%20Project%20records/project.json) and [`project-record.ts`](server/project-record.ts). Milestone IDs must be unique; paid amounts cannot exceed their values.

The project folder’s Box ID scopes its internal identity, so the same business code in different workspaces is safe. Duplicate business codes within one workspace are rejected as ambiguous. The application accepts one or more supported projects; it does not require all five samples. Discovery is capped at 150 folders; choose a narrower workspace if needed. Folder listings are paginated, and incomplete scans do not replace the last completed inventory.

Keep the [Alder & Finch acceptance PDF](demo-kit/presenter-only/CW-101-signed-acceptance.pdf) outside the active workspace until the upload scene. The broader sample workspace also includes a misplaced Northstar acceptance; initial discovery can verify it immediately. Portfolio totals therefore depend on the accessible projects and actual evidence, rather than a fixed opening number.

## How Box MCP is used

| Hosted MCP tool | Application use |
| --- | --- |
| `who_am_i` | Verify the signed-in Box user after OAuth |
| `list_folder_content_by_folder_id` | Browse folders, inventory selected projects, verify saved files |
| `get_folder_details` | Check selected scope, project access and destinations |
| `get_file_content` | Read structured project records |
| `ai_qa_multi_file` | Reason over selected evidence and authoritative application facts; propose constrained actions |
| `ai_extract_freeform` | Extract acceptance fields for deterministic application validation |
| `get_upload_url`, `get_download_url` | Issue temporary URLs for binary transfer and preview |
| `upload_file` | Save text and JSON artifacts in Box |

`BoxMcpClient` discovers actual `tools/list` schemas, validates explicit arguments, and calls `client.callTool({ name, arguments: args })`. Each employee account has its own connection and token provider. Missing tools, denied access, and unsupported contracts fail visibly; live mode never substitutes simulated success.

For an upload, the server requests an upload URL, transfers actual PDF bytes, verifies the file in Box, and calls Box AI extraction. Application rules check client, business project code, milestone, affirmative acceptance, signer and date before recalculating readiness. The browser receives the result and updated state.

The assistant’s conversation history is application-owned. Box AI proposes only `answer`, `discover`, `followup`, or `billing`; code validates the project and action. Chat cannot approve outputs or invoke arbitrary tools. Approval saves draft PDFs and email artifacts without issuing an invoice, sending email, recording payment, or changing sharing.

Expand **Box MCP activity** beside a chat response or upload to inspect actual tool names, parameters, status, timing, structured results and optional raw JSON. Binary transfers and application validation are separately identified. Tokens, authorization headers, temporary URLs and binary bodies are excluded. Tool details can include business content available to the current employee.

## Sessions, storage and migration

- OAuth state is expiring and browser-bound. Successful authentication creates a fresh opaque session in an HTTP-only SameSite cookie. Sessions expire after eight hours and do not survive a server restart.
- Credentials are stored per verified Box user in `data/employee-auth/accounts.json` with `0600` permissions. Refresh-token rotation is serialized per account.
- Local workflow state/files use `data/employees/<box-user-id>/<workspace-folder-id>/`. Restricted `_receipts` store cross-account approved-output receipts keyed by Box project and milestone; access is verified before reuse.
- Live APIs, streams, previews and downloads require a session. Root/project access is rechecked, downloads go through the current account’s Box authorization, and writes verify their destination. Revoked projects are removed from refreshed local views.
- Sign-out, account switching and folder changes clear browser state and cancel pending client requests. Active server workflows stop at their next session check; a transfer already submitted to Box cannot be undone by signing out.
- The legacy `data/box-oauth.json` and shared `data/live` database are left untouched and are not migrated or used by employee sessions. `BOX_MCP_TOKEN` is disabled and `BOX_DEMO_ROOT_ID` does not select employee workspaces.
- Shared internal folders are supported. Destinations with shared links remain blocked; the app does not create links or change collaborations.

| Configuration | Purpose |
| --- | --- |
| `BILLREADY_ADAPTER` | `development` or `live` |
| `PORT`, `BOX_REDIRECT_URI` | Local listener and exactly registered callback |
| `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET` | Server-side custom integration credentials |
| `BOX_MCP_URL` | Must be `https://mcp.box.com` |
| `AGENT_PROVIDER` | `box` by default; optional `openai` needs its own key/model |
| `EMPLOYEE_AUTH_FILE` | Override the restricted per-account credential store |
| `EMPLOYEE_DATA_DIR` | Override per-employee/workspace state and receipt directory |
| `DATA_DIR` | Development/legacy command-line state only |
| `DEMO_DATE` | Reference date for sample documents and acceptance validation |

## Walkthrough and verification

See the [employee workflow walkthrough](demo-kit/DEMO_SCRIPT.md) and [setup guide](demo-kit/SETUP.md).

```sh
npm test
npm run build
```

Tests include isolated OAuth callbacks, two-account visibility, credential refresh, per-account state and traces, denied ID guesses, permission loss, empty/unsupported workspaces, upload streams, PDF review, repeated approval and shared-project output reuse. These use controlled fixtures, not two real employee accounts. See [verification and limits](docs/verification.md).

In development, `npm run reset` previews the local reset and `npm run reset -- --apply` applies it. In live mode, either command prints a link to the authenticated reset preview at `http://127.0.0.1:4310/#reset`; keep the app running. You can also open **Connection & diagnostics → Preview workspace reset**. Review the files, then choose **Archive files & reset workspace**. The command does not automatically authorize a remote write.

Live reset supports the included Clearwave sample projects. It archives non-baseline files in Acceptance, Billing and Follow-ups through Box MCP, verifies moves, preserves the canonical sample files and OAuth credentials, and rebuilds readiness from actual remaining evidence. An interrupted archive can be previewed and retried. No Box files are deleted. The selected shared Box folder is affected for all collaborators; local state for that folder refreshes on next use, while other folders are untouched. For faster repeated Alder & Finch rehearsals, manually remove the acceptance and generated billing/follow-up files, then use [Quick reset after Box cleanup](http://127.0.0.1:4310/#reset-clean). This checks relevant folders and clears local state without Box writes, full discovery or Box AI. See the [reset guide](demo-kit/RESET.md). Legacy authenticated command-line inspection scripts do not inherit browser employee sessions.

Useful entry points: [`auth.ts`](server/auth.ts), [`context.ts`](server/context.ts), [`box-mcp.ts`](server/box-mcp.ts), [`box-content.ts`](server/box-content.ts), [`workflow.ts`](server/workflow.ts), and [`store.ts`](server/store.ts).
