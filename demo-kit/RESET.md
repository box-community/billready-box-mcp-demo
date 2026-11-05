# Reset the rehearsal workspace

## Fast reset after manual Box cleanup

For repeated Alder & Finch rehearsals, remove or move the uploaded acceptance from `03 Acceptance`, all generated invoice/packet/email files from `04 Billing`, and generated follow-ups from `05 Follow-ups`. Keep the original records, completion report and README files.

Open [Quick reset after Box cleanup](http://127.0.0.1:4310/#reset-clean) and choose **Check Box & reset Alder & Finch**. The page does no folder inventory on opening. The quick reset is limited to the included CW-101 sample. It also checks previously tracked acceptance in other mapped project folders when necessary. It does not remove the files for you.

The action checks the project’s membership in the selected workspace and its relevant folder contents, refuses incomplete cleanup, then clears workspace chats/drafts/checkpoints and restores Alder & Finch to $18,000 blocked. Other project amounts are retained. It makes no Box writes and no Box AI calls.

You can also run `npm run reset -- --after-cleanup` to print this link. An existing synchronized workspace is required; this is not first-time project discovery. Cached dashboard reads no longer wait in the mutation queue and permission checks for visible projects run in bounded parallel batches. A newly selected workspace still needs initial discovery and evidence verification.

## Live Box mode

Keep the application running, then run:

```sh
npm run reset
```

The command prints http://127.0.0.1:4310/#reset (or your configured port). Open it in the browser where you sign in to BillReady. Your employee session and selected workspace determine the scope; the command never selects another account automatically.

Alternatively, open **Connection & diagnostics → Archive files & reset**.

1. Sign in with Box if needed, select the intended workspace, and reopen the reset link.
2. Review the workspace name, employee account and file list.
3. Choose **Archive files & reset workspace**.
4. After completion, return to the workspace. Alder & Finch should show **$0 ready / $18,000 blocked**, ready for the acceptance upload.

Reset now uses two bounded inventories across preview and apply, with up to four folder reads in parallel. It does not rescan the full tree again during archiving or rebuilding. Previously verified acceptance is reused only when Box reports the same file revision; changed or unversioned acceptance is revalidated.

The reset uses Box MCP to create a `BillReady Rehearsal Archive` batch, move listed files and verify each move. It archives non-baseline files in `03 Acceptance`, `04 Billing` and `05 Follow-ups`. Original sample documents are preserved by their project, folder and name. Project agreement/delivery source folders are not cleaned. Supported project identities and milestone amounts must match the supplied Clearwave sample records; arbitrary customer projects are refused.

Local conversations, proposals, generated previews and approval checkpoints for the selected Box workspace reset. Approved-output receipts for its projects are cleared so a new run can prepare new outputs. Other employee sessions using the same Box workspace rebuild their local state on next use. Other Box folders and OAuth credentials are preserved. No Box file is deleted and no sharing setting changes.

**Shared workspace:** archiving changes that Box content for every collaborator. Confirm the intended folder before applying.

**Interrupted run:** the app retains the archive batch and per-file move receipts. Preview again and retry. Previously moved files stay in the archive; the new preview lists the remaining files. If the listed files change between preview and apply, the app requires a fresh preview.

The original Northstar acceptance is intentionally preserved and can be verified during rebuilding. A full five-project reset can therefore show **$40,000 ready / $18,000 blocked**, rather than the older $24,000/$34,000 opening. Present the Alder & Finch project amounts for the $18,000 reveal.

`npm run reset -- --apply` in live mode also prints the browser review link. It does not bypass the account-bound confirmation.

## Local development mode

```sh
npm run reset                 # Preview local scope
npm run reset -- --apply      # Restore local development state
```

Use these with `BILLREADY_ADAPTER=development`. Stop the development app before applying the local reset, then restart it.
