# Troubleshooting BillReady

## OAuth redirect URI mismatch

Match the registered callback exactly to `BOX_REDIRECT_URI`, including scheme, hostname, port and `/auth/box/callback`. The default is `http://127.0.0.1:4310/auth/box/callback`; `localhost` is a different hostname. The current app only accepts loopback callback hosts.

Using the same integration credentials on another computer is supported, but the browser must reach the callback server on that computer. If you change the port, update both `PORT` and the registered callback, then restart the app.

An OAuth state error usually needs a fresh **Sign in with Box** flow. Do not reuse a callback URL or authorization code. Restarting the development server during login discards pending state; complete sign-in after the server has settled.

## Sign-in is requested after a server restart

Employee sessions are currently held in server memory. OAuth credentials and selected workspace preferences remain stored, but a server restart requires a fresh browser sign-in. This is expected for the local implementation. Keep the server running during a presentation.

The signed-in identity comes from Box. **Alex Chan** is the sample project owner; that label does not rename your Box account, establish folder ownership or control access.

## No projects appear

Select the workspace folder containing the project tree, or a supported project folder itself. Account root is available for browsing but cannot be the selected workspace. Check that the employee can access the intended folders in Box.

Each supported project needs a valid `project.json` plus the five standard subfolders described in the [README](../README.md#supported-workspace-structure). The app supports a subset of the sample projects. It does not invent projects for arbitrary folders or infer invoices from unstructured documents alone.

Warnings identify unsupported records or missing folders. Duplicate business project codes in the same workspace are rejected. The same code in separate workspaces is safe because the Box project-folder ID scopes its internal identity.

## Loading or reading the workspace takes time

First-time discovery lists folders, reads project records and validates acceptance with Box AI before returning state. Keep the selected subtree small; discovery is capped at 150 folders. Cached reads avoid the global mutation queue but still check current Box access. Permission checks and folder reads use bounded concurrency.

For repeated Alder & Finch rehearsals after manual cleanup, use [Quick reset](http://127.0.0.1:4310/#reset-clean), not the archive preview. The quick page does not inventory on opening. The action checks only the relevant project folders and uses no Box AI. A previously synchronized workspace is required.

The archive reset still performs inventory, file moves and verification. Changed or unversioned baseline acceptance can require extraction again. No fixed live-service timing is promised.

## Quick reset says cleanup is incomplete

In Alder & Finch, remove or move:

- The uploaded acceptance from `03 Acceptance`.
- Generated invoice PDF, packet PDF, email JSON and email text from `04 Billing`.
- Generated follow-ups from `05 Follow-ups`.

Keep original source records, the completion report and README files. If previously verified acceptance was filed elsewhere in the project, the app can also check its mapped folder. The error lists remaining files. Quick reset does not remove them for you.

If project folders moved or ancestry cannot be verified, choose the correct workspace and refresh evidence before retrying. Do not clear credentials to solve a folder-mapping error. See [Reset options](../demo-kit/RESET.md).

## Acceptance is already found before uploading

Changing accounts or selecting a folder does not remove files from Box. Discovery checks named acceptance/handover candidates across project folders, not only `03 Acceptance`. Northstar’s original acceptance is deliberately in `01 Project records` and may be verified during first load.

For the Alder & Finch story, use a fresh kit tree with the separate presenter PDF excluded, or complete a supported reset. Confirm the project shows **$0 ready / $18,000 blocked** before starting. Original sample content, prior uploads and copied folders can legitimately change portfolio totals.

## Invoice preview is unavailable

Use **Retry preview** and read the displayed error. If the session expired, sign in and reopen the billing review. If evidence was removed or the milestone is no longer billable, refresh the project and prepare a new eligible proposal.

The relative-storage-path bug has been fixed: employee paths resolve absolutely before Express serves generated PDFs. Both default and relative directory settings are covered by regression checks. Reload the application after updating the code; a demo reset is not required for the fix.

## Missing tools, denied access or unavailable Box AI

Check these independently: employee folder permissions, custom integration scopes, enterprise tool settings and Box AI entitlement. A listed tool can still be denied; absence alone does not identify the cause. The [official tool reference](https://docs.box.com/en/box-mcp/tools) identifies tools that need admin enablement.

BillReady needs `get_upload_url` and `get_download_url` for binary transfer. Archive reset also needs `create_folder` and `move_file`. Reopen the application after an authorized tool-setting change so a fresh connection can discover tools. Live mode fails visibly rather than pretending an operation succeeded.

## Old CLI authentication or browser-test instructions fail

`BOX_MCP_TOKEN`, `BOX_TOKEN_FILE` and `BOX_DEMO_ROOT_ID` are legacy single-account configuration, not employee-session setup. Use browser OAuth and workspace selection. Use the in-app Box MCP activity viewer to inspect calls under the signed-in employee session.

The recommended automated checks are `npm test` and `npm run build`; their scope is documented in [Verification](verification.md). A fixture pass does not prove access for a second real Box account.

## Local credentials appear to be ignored

Environment variables inherited by the process take precedence over `.env` under the current dotenv setup. Launch the app from a shell with the intended integration configuration. Check variable names and configuration source without printing secret values. Never paste `.env`, OAuth codes, session cookies or token-store contents into a bug report.

## Workspace access warning with zero projects

An access failure is different from an empty workspace. Use **Retry workspace** or refresh the page. Once Box access succeeds, the app rediscovers projects automatically, including recovery from the old persisted inaccessible state. Sign in again if the local server restarted and the browser session expired.

Temporary MCP/network failures and rate limits return a connection-check error without erasing cached project data. Actual folder permission loss blocks access and clears affected local state. The diagnostics retain sanitized failure details; never share credentials or raw customer content when reporting the error.
