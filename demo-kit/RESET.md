# Reset BillReady safely

The reset utility is scoped to this application's local demo state and recorded demo-owned outputs. It never deletes a Box root, original seed source, or arbitrary folder. Its default is a preview. Stop the running app before applying reset, then restart it afterward.

## Development adapter

```sh
npm run reset
npm run reset -- --apply
npm run dev
```

Preview lists acceptance uploads and generated outputs, plus the workflow/conversation state to be cleared. Apply removes only the selected data store's `content`, `previews` and `external-inbox` directories, restores original seed mappings, resets acceptance associations, deletes proposals and chat, and restores initial project amounts. It preserves `demo-kit/upload-to-box` and `presenter-only` in full. It also preserves OAuth credentials/tokens.

Expected reset state: five projects; ready $24,000; blocked $34,000; invoiced $242,000; outstanding $12,000; future $36,000; no hero acceptance in the index; no prepared proposals; empty conversations. Northstar's acceptance still exists in initial project records but has not been discovered/reassessed.

## Live remote Box MCP

Keep the same `BILLREADY_ADAPTER=live` and `BOX_DEMO_ROOT_ID` as the rehearsal. Run:

```sh
npm run reset
```

The preview lists **only recorded demo-owned file IDs**: app-uploaded acceptances (including rejected uploads), generated invoice/packet/email files, and approved follow-up JSON. After reviewing the preview, stop the app and apply:

```sh
npm run reset -- --apply
npm run dev
```

Apply uses remote MCP `create_folder` and `move_file` to archive just those recorded files under **BillReady Demo / BillReady Rehearsal Archive / Rehearsal <timestamp>**. It checks the configured root, refuses a shared destination, verifies each move by reading the destination, and preserves a receipt in `data/live/reset-archive-receipts.json`. No remote file is deleted. Partial failures can be retried: already archived files are absent from the active tree and are not moved again. Original seed sources stay in place with their file IDs.

The app excludes this dedicated archive from active discovery and Box AI evidence. The reset then verifies recorded active artifacts are gone, clears workflow/conversation/approval state, and restores initial readiness. OAuth tokens survive. Return to Overview without workspace-wide Refresh to keep Northstar's opening discovery state.

A directly added external file is not automatically owned by the app. For an external-refresh rehearsal, use an app-uploaded acceptance and move it through Box before refreshing, or move the specific externally added test file into the rehearsal archive yourself. Do not move original seed acceptances. Never archive documents outside the demo root.

Archive links are recoverable: use the receipt's archiveFolderId and originalFolderId to review or restore an individual rehearsal file. Keep archived acceptances out of active project folders before the next run.

If the root or identity changed, use a new isolated `DATA_DIR` and upload a clean seed tree; never reuse old ownership IDs against another root. To disconnect authorization, remove/revoke the dedicated local token cache separately; reset does not revoke it.

## Repeatable verification

`npm run test:e2e` creates and clears only its own isolated `data/e2e` store and rehearses the UI. The ordinary demo store is separate. After the browser test, preview and apply reset to the test store if inspecting it manually:

```sh
DATA_DIR=./data/e2e npm run reset
DATA_DIR=./data/e2e npm run reset -- --apply
```

The acceptance file remains separately available for the next upload, and upload ZIP remains free of presenter-only material.
