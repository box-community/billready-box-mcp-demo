# Verification and current limits

This record distinguishes automated fixtures, rendered UI checks and real Box operations. This document records the maintained application checks; outdated scripts and historical screenshots have been removed.

## Current automated baseline

The latest application verification passed **48 tests** with `npm test` and passed the TypeScript/Vite production build with `npm run build` on Node.js 26. These checks include employee workspaces, reset, previews, project scoping and access recovery. Documentation-only checks are reported separately below.

| Area                   | Verified with fixtures or local checks                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee OAuth         | State/cookie validation, identity binding, isolated credentials, token refresh and sign-out                                                       |
| Workspace isolation    | Different project sets for two accounts, shared projects, scoped chats/state/files/traces, rejected cross-account IDs                             |
| Discovery              | Paginated listings, bounded concurrency, subsets, unsupported/empty workspaces, duplicate-code rejection and incomplete scans                     |
| Billing rules          | Exact integer-cent totals, missing/wrong-project/unsigned evidence remaining blocked, valid acceptance unlocking only its milestone               |
| Saving                 | Explicit approval, four output files, retry checkpoints and shared-project output reuse without issuing invoices                                  |
| Reset                  | File preview, stale-list rejection, interruption/retry, archive verification, preserved source documents and other workspaces                     |
| Quick reset            | Manual deletion simulated outside the app, remaining-file rejection, scoped folder reads, zero Box writes/AI and restored $18,000 blocker         |
| Performance boundaries | Cached state reads complete while the mutation queue is held; changed evidence is revalidated and unchanged verified file revisions may be reused |
| PDF preview            | Default/relative/absolute storage paths, authenticated HTTP PDF bytes, readable viewer errors and retry                                           |
| Trace handling         | Sanitized request-scoped activity, credentials/temporary URLs removed, streamed updates and failure handling                                      |

All five supplied sample owners and generated project records were checked as **Alex Chan**. Legacy sample-owner normalization and preservation of unrelated project owners were checked locally. Regenerating the kit does not overwrite content already in Box.

## Rendered interface checks

The employee sign-in, folder selection, overview, project detail, readable MCP parameters/results, full-page invoice preview and saved-package handoff were inspected in the browser. A 390px iframe exercised responsive layout; that is not a physical mobile-device test. The fixed PDF preview was rendered with a relative employee-storage override, reproducing the configuration that previously failed.

Browser inspections described here were manual checks, not an automated browser suite.

## Real Box checks completed

- A real employee completed OAuth and the hosted MCP `who_am_i` identity check.
- The folder browser used that account’s accessible Box content. Selecting the existing sample workspace discovered five project records and validated existing acceptance through Box MCP/Box AI.
- A real project chat completed through `ai_qa_multi_file`; its source IDs, instructions, duration and structured result were inspected in the activity UI.
- Reauthentication restored the remembered workspace selection. Account switching and selection do not remove existing Box documents.

Earlier revisions also exercised live uploads, output saves and archive restoration. Those are historical results; current reset and preview regression work used isolated fixtures rather than new live mutations.

## Remaining limits

- Real simultaneous two-account verification needs a second authorized employee account. Fixture isolation checks do not replace it.
- No current live reset-duration benchmark is published. First-time discovery still inventories the selected subtree and verifies evidence; unchanged cached views are a separate path.
- The optional OpenAI conversation provider has not been live-verified. The default Box AI provider does not need an OpenAI key.
- No webhook or accounting-system integration exists. External file additions need explicit evidence refresh. The app does not issue invoices, send emails, record payments or change sharing.
- Sessions are in memory and expire after eight hours. The app runs on loopback in one Node.js process; public or distributed deployment needs separate hardening and shared session/coordination infrastructure.
- A legacy CLI inspection command does not inherit employee browser authentication.

## Documentation validation

The November 4 documentation review checked **17 Markdown files and 60 local links/anchors**, with no missing targets. Mermaid CLI 11.17.1 reproduced the old reserved `Box` participant error and successfully rendered both replacement README diagrams. The published project JSON Schema matches the runtime validator, all five sample records validate, and all 35 upload ZIP files match their canonical sources. The generator now emits real Markdown line breaks.

The renderer was installed only in a temporary validation directory; it is not an application dependency. The application’s 43 tests and production build also passed during this review. Official Box setup/tool references were checked against the current vendor documentation and are linked from the README. See the [developer walkthrough](BOX_MCP_WALKTHROUGH.md) and [troubleshooting guide](TROUBLESHOOTING.md).

## Public-release preparation

The [public-release review](PUBLIC_RELEASE_REVIEW.md) records the history/asset scans, privacy decision, development-file-serving fix and its new regression test. The suite had 44 passing tests at public release; the latest baseline above includes subsequent regression tests.

## Project-scoped MCP operations

A two-project fixture verifies that project chat discovery, project refresh, and project-page state reads stay inside the selected Box subtree. A matching-looking acceptance in a sibling folder is not inspected. Missing, changed, or failed project inventory does not trigger workspace fallback; sibling projects and documents remain intact. Upload, invoice preview and approval also assert project-only folder calls. These are fixture checks; no live Box files were changed for this regression.

## Workspace access recovery

Fixtures cover transient timeouts, 429/503 responses, expired authentication, lost MCP sessions, missing folder-ancestry metadata, explicit access denial and recovery. Stale MCP transport sessions are discarded for the next explicit retry, without automatically replaying a tool call. Temporary check failures block the request without discarding cached projects or mappings. Confirmed permission loss invalidates the mapping; restored access triggers discovery. Persisted inaccessible state from older versions also triggers recovery even when its old mapping flag remains set.

The inaccessible screen and retry-to-projects transition were inspected in a browser using synthetic fixtures. A read-only live recovery also discovered all five sample projects and verified existing evidence, with no Box file writes, moves, deletions or sharing changes.
