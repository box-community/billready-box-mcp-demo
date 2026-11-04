# Clearwave AV workspace setup

BillReady is Clearwave AV’s internal billing workspace, built by its engineering team using Box’s hosted remote MCP server and Box AI.

1. Install Node.js 24.12 or later, run `npm ci`, and copy `.env.example` to `.env`.
2. Configure the custom Box MCP integration with the exact callback `http://127.0.0.1:4310/auth/box/callback`. Enable content and Box AI access plus the upload/download URL tools. Intended employees must be permitted to authorize the integration.
3. Set `BILLREADY_ADAPTER=live`, `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, `BOX_REDIRECT_URI`, and `AGENT_PROVIDER=box`. Keep credentials out of the repository and upload kit.
4. Upload the extracted `BillReady-Box-upload.zip` tree into an internal Box folder accessible to the intended employee. Preserve the project subfolders and records. The workspace root can have any name and contain a subset of supported projects.
5. Keep `presenter-only/CW-101-signed-acceptance.pdf` outside that folder for the missing-acceptance story.
6. Start `npm run dev`, open http://127.0.0.1:4310, and choose **Sign in with Box**. Each employee authorizes their own Box account.
7. Browse accessible folders, open the desired workspace and select **Use this folder**. The selected subtree is the discovery scope; account root is only for browsing.
8. Check **Workspace projects**, the signed-in employee identity, and contextual Box links. Open **Connection & diagnostics** for connection information. Expand **Box MCP activity** beside actual workflow actions to inspect calls.

Different accounts see different projects when their selected folders or Box permissions differ. Shared folders can appear for multiple employees. Project responsibility is not filtered by a record’s owner field.

The application reads supported `project.json` records rather than inventing projects from arbitrary folders. Invalid or incomplete project structures produce warnings; no valid projects produces an empty workspace. Folder discovery is bounded at 150 folders. Permission failures block access; incomplete discovery does not establish missing evidence.

The selected workspace is remembered by Box user ID. Credentials and state are stored in separate restricted employee locations. Legacy shared credentials, static bearer overrides and the old global root do not authenticate or scope employee sessions. A server restart requires sign-in again.

Run `npm run reset` with the app running to get the authenticated reset-preview link, or choose **Connection & diagnostics → Preview workspace reset**. Review the scoped file list and confirm **Archive files & reset workspace**. The app archives extras, keeps original source files and rebuilds the selected sample workspace. No Box deletion or sharing change is required. Local development still supports `npm run reset -- --apply`.

See the [README](../README.md) for architecture, project schema, security boundaries and exact MCP usage, and the [walkthrough](DEMO_SCRIPT.md) for the acceptance-to-billing flow.
