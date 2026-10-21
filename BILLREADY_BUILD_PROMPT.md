# Goal: Build BillReady and its complete conference demo kit

Build and verify a polished, working web app named **BillReady** for **Clearwave AV**, a fictional AV installation company. Deliver the application, a custom agent connected to Box MCP, and all synthetic documents and folder structures needed to rehearse the demo. Work toward the completion criteria below; implement and test the app rather than stopping at a plan or static mockup.

Make routine design and implementation decisions autonomously. Ask only for credentials, access, or a consequential choice that genuinely blocks progress. If live Box or model credentials are unavailable, complete the application and demo kit with a clearly identified development adapter, document the exact remaining connection steps, and distinguish simulated verification from live verification. Do not claim the live integration is finished until tested.

## Product and scope

The user is the owner of a growing AV installation company. BillReady answers: **What can we bill, what is blocked, and what should we do next?** Its agent investigates evidence and prepares work that the owner verifies through the UI.

Box is the headless content platform. Normal application labels are Project documents, Evidence, Acceptance, and Billing packet. Users upload documents through BillReady without choosing a Box folder. A discreet presenter-only panel provides links to the actual underlying Box files and folders.

The main distinction is between completed work that has not been invoiced and issued invoices that have not been paid. Focus on billing readiness; show outstanding payments as context. This is a single-company conference demonstration with no accounting integration and no email sending.

## Experience and visual design

Create a cohesive, premium business application: warm white surfaces, dark sidebar, restrained accent colors, strong typography, generous spacing, and clear financial figures. Use purposeful charts, useful tables, realistic density, and subtle transitions. Prioritize an excellent desktop presentation and usable smaller screens. Implement polished loading, empty, error, upload, processing, and success states.

Sidebar: Overview, All projects, and five named projects. Keep an agent panel readily available across views, with project context explicit and conversation state preserved appropriately.

Overview:
- Ready-to-bill amount, blocked billing amount, invoiced this month, and outstanding invoice balances.
- A proactive Needs your attention area with prioritized findings, amounts, evidence, and proposed actions.
- Project portfolio with client, value, progress, next milestone, billing status, and blockers.
- A useful billing breakdown or trend and recent business activity.

Project dashboard:
- Contract/project value, invoiced amount, ready-to-bill amount, and blocked amount.
- Three or four milestones with amounts, completion, acceptance requirements, billing state, and specific blockers.
- Evidence/document list, recent activity, follow-ups with owners/due dates, and pending approvals.
- Prominent acceptance-document upload and a project-aware agent conversation.
- Review surfaces for invoices, email drafts, attachments, and billing packets, with editing and evidence inspection.

Suggested prompts are clickable, context-aware, and invoke the actual agent. Show around four relevant prompts at a time. Examples:
- Overview: What should I focus on today? Which completed work has not been invoiced? What could unblock the most billing? Show projects needing follow-up.
- Blocked project: What is preventing us from billing? Find the missing acceptance document. Draft a customer follow-up. Show the evidence for this milestone.
- Ready project: Prepare the draft invoice. Assemble the billing packet. Draft the billing email with attachments. What still needs my review?

## Main demonstration story

Use a fictional office AV installation project as the hero project. Its final milestone is **$18,000**, installation is complete, customer acceptance is required and missing, and no invoice has been issued for that milestone.

1. Open the overview and investigate the blocked revenue.
2. Open the hero project. Ask why its $18,000 milestone is blocked.
3. The agent uses source evidence to explain the missing acceptance and prepares a customer follow-up email with relevant supporting attachments, such as the completion report.
4. The presenter uploads the prepared signed acceptance PDF through the project's application UI.
5. BillReady uploads the actual file into that project's correct Box Acceptance folder, records the returned file ID, analyzes the document, and associates it with the correct project and milestone. Display uploading and checking states. Clear the blocker only when matching acceptance is supported by the document; mere file presence is insufficient.
6. Update project status, overview totals, proactive findings, and activity consistently. The $18,000 moves from blocked to ready to bill; invoiced and unpaid invoice amounts do not change.
7. The agent prepares a draft invoice, billing packet, and billing email with appropriate attachments.
8. The owner previews the invoice, checks sources, edits the email, and approves saving the package. Approval means Prepared for billing, not invoice issued or email sent.
9. Presenter links reveal the uploaded acceptance and saved outputs in their actual Box folders.

Support discovery too: the agent can find relevant evidence already in the configured project content. Include a different project with a discoverable acceptance document filed in a general project folder. For files added directly to Box, implement the simplest reliable refresh mechanism (for example explicit refresh or polling), document its behavior, and apply the same reassessment logic. A webhook is optional; the primary conference flow is the app upload above.

## Agent, integration, and data correctness

Use a real server-side custom agent with Box MCP tools for content discovery, evidence retrieval/Box AI analysis, folder operations, and artifact persistence. Verify current official tool schemas and client capabilities; do not assume tool names, binary upload behavior, or template support. Prefer Box AI tools for document understanding. Keep secrets and Box authorization on the backend. Use the configured demo identity and root; scope reads and writes to that root.

Keep the implementation small. Choose a suitable supported stack after inspecting the workspace; reuse an existing app if appropriate. If available tools or skills require a particular workflow, follow them. Choose a current supported model/provider that is actually available and configure it through environment variables.

Box holds source documents and generated artifacts. A lightweight application store may hold workflow state, conversations, approvals, and stable mappings between project IDs and Box folder/file IDs. Derive the dashboard from coherent structured records and persist changes across reloads. Explain the boundary in the setup documentation.

Project IDs, milestone amounts, invoice arithmetic, and state transitions are validated in application code. The agent supplies evidence analysis, explanations, drafts, and proposed actions. Use exact currency arithmetic, prevent duplicate billing, and make upload/approval retries safe. Validate that an acceptance names the correct client/project and supports the relevant milestone. If evidence is missing or ambiguous, retain a review state with an explanation.

Financial definitions must be explicit: ready-to-bill and blocked billing cover completed, unissued milestones; future incomplete work is separate. Draft/prepared invoices do not count as issued. Outstanding balances include only issued unpaid amounts. Ensure aggregate and project totals reconcile without double counting. Generate relative dates from a fixed configurable demo date and keep document dates, dashboard labels, and invoice due dates consistent.

Agent actions:
- Investigate blockers with source links and supporting evidence.
- Draft customer requests with recipients, subject, body, and selected attachments.
- Create internal follow-ups with owner and due date after review.
- Prepare a draft invoice, supporting packet, and billing email.
- Save approved outputs to the correct Box project folders and surface the saved links.

Clicking a suggested prompt is not approval. Use explicit UI approval for proposed business writes. Show editable review cards and attachment previews/downloads. Drafts can be reviewed in the app before final persistence. No email sending, external sharing, or accounting-system actions are in scope.

Produce a real, readable draft invoice PDF. A simple deterministic application template is acceptable: the agent obtains evidence and uses Box MCP to save the generated output. MCP itself is not an invoice renderer. If binary transport requires an additional transfer step, implement and document it transparently. Draft invoice contents include company/customer, project, draft reference, date, milestone/line items, amounts, terms, and a prominent DRAFT label. Use synthetic amounts with zero tax for the demo and label that assumption; avoid creating a tax-calculation project.

## Upload-ready demo kit

Create all files locally, not just descriptions or placeholders. Everything must be synthetic, internally consistent, readable, and presentable. Use fictional names, reserved example email domains, and clearly fictional acceptance signatures. Follow applicable document/PDF skills and render-check the generated PDFs.

Package the following:

demo-kit/
  upload-to-box/
    BillReady Demo/
      Company/
        [company profile, billing readiness rules, demo invoice register]
      Projects/
        [five project folders, each with a stable project ID]
          01 Project records/
          02 Delivery evidence/
          03 Acceptance/
          04 Billing/
          05 Follow-ups/
  presenter-only/
    [hero acceptance PDF for live upload]
  configuration/
    [seed manifest, schemas, expected initial/final amounts]
  SETUP.md
  DEMO_SCRIPT.md
  RESET.md

Name the five clients/projects realistically, including office installation, hotel conference rooms, and university lecture hall scenarios. Give each three or four milestones and a different situation: the hero's missing acceptance, ready-to-bill work, already invoiced work with an outstanding balance, incomplete delivery, and misplaced discoverable evidence. Provide enough source documents to substantiate every visible finding without creating an unnecessarily large dataset. Include structured milestone records and an invoice register, plus realistic short PDFs for completion and acceptance evidence. Supply a compact ground-truth manifest for verification.

Critical: **Keep the hero acceptance PDF outside upload-to-box.** Initial ingestion and indexing must not include presenter-only content; otherwise the missing-document demo is spoiled. It enters Box only through the live application upload.

Also provide a ZIP containing the upload-to-box contents, with instructions to extract it and upload the BillReady Demo folder as a folder tree. The presenter acceptance should be separately easy to find.

SETUP.md must explain installing/running the app, required environment variables, Box/model authorization, manual folder upload, selecting the uploaded root folder, and mapping IDs without making me enter every file ID. Discover the uploaded tree and initialize mappings from stable project identifiers. Keep secrets out of the demo bundle and browser.

DEMO_SCRIPT.md must contain a 4–6 minute walkthrough, exact suggested prompts, the file to upload, expected visible results and financial changes, and presenter links. RESET.md must explain safe restoration of demo-owned state and artifacts, including the acceptance, drafts, follow-ups, and conversation. Provide a scoped reset utility or equivalent repeatable process with dry-run/preview; preserve the original seed sources and never touch content outside the demo root.

## Verification and completion criteria

Continue implementing and fixing issues until the following are demonstrated, or identify a specific external access blocker while completing all independent work:

1. The app runs, builds, and passes appropriate checks. Inspect the actual rendered interface at conference desktop size and a smaller viewport; fix visual and interaction problems.
2. Overview, project navigation, agent panel, suggested prompts, document preview/download, review cards, and approval flows work.
3. All five projects and dashboard totals reconcile with the supplied ground truth.
4. The hero acceptance is absent initially. App upload saves it to the correct folder and changes the milestone and totals only after analysis. A wrong-project acceptance remains a blocker.
5. Discovery retrieves the misplaced evidence in the other project. Refresh picks up externally added demo documents if live access is available.
6. The agent's claims link to actual sources. Live tool activity is genuine; any development simulation is clearly identified.
7. The draft invoice is readable and calculates exactly $18,000 for the hero milestone. The email includes the right attachments. Approved outputs persist and survive reload; retries do not duplicate invoices or follow-ups.
8. Saving a draft never increases invoiced revenue, marks an invoice paid, or sends email.
9. The upload-ready kit, ZIP, separate presenter acceptance, setup instructions, reset procedure, and demo script all exist and are consistent. Rehearse initial state → upload → review/save → reset → initial state.

At completion, provide launch instructions, paths to all deliverables, a concise account of what was tested live versus simulated, and any remaining credential/setup steps. Do not mark the goal complete based only on a polished UI or mocked integration.
