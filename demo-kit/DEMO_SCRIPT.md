# BillReady: five-minute walkthrough

All content is fictional. Rehearse with the development label visible when live authorization is not configured. For a live talk, complete SETUP.md and the live checklist first. Never describe deterministic rehearsal activity as a remote MCP call.

## Before recording

Run the scoped reset preview and restoration in RESET.md. Launch BillReady at http://127.0.0.1:4310 at 1600 × 1000 or a similar conference desktop resolution. Keep the agent panel open. Have `presenter-only/CW-101-signed-acceptance.pdf` ready in the file picker. In live mode, preflight tree mappings with a hero-project refresh, then return to Overview. Avoid a workspace-wide refresh until the Northstar discovery scene.

Expected opening: ready $24,000; blocked $34,000; invoiced this month $242,000; outstanding issued balances $12,000; future work $36,000. Five projects total $336,000.

## 0:00–0:45 · What needs attention

Open Overview. Explain: “BillReady tells an AV business owner what can be billed, what is blocked, and what to do next.” Click **What should I focus on today?**

Show the proactive $18,000 Alder & Finch finding. Clarify that blocked billing is completed work never invoiced; Westbridge's $12,000 is an already-issued unpaid balance. These are different business questions.

## 0:45–1:45 · Investigate the hero project

Open **Alder & Finch**. Its project value is $72,000: $54,000 already invoiced/paid and an $18,000 final milestone completed but blocked.

Click **What is preventing us from billing?** Inspect the agreement and completion-report source links. The report supports installation completion; the agreement requires signed customer acceptance. No acceptance is in the initial uploaded tree.

Ask exactly: **Draft a customer follow-up.**

Open **Review customer follow-up**. Show the example recipient, subject, editable body, completion-report attachment, internal owner and due date. Choose **Approve & save** if demonstrating the internal follow-up. Explain that it saves an internal task/email draft; it does not contact the customer.

## 1:45–2:45 · Upload signed acceptance

Click **Upload acceptance** and choose **presenter-only/CW-101-signed-acceptance.pdf**.

Show the separate uploading and checking states. BillReady checks client **Alder & Finch**, project **CW-101**, milestone **M3**, affirmative acceptance, signer and date. In live mode it uploads actual bytes to the mapped `03 Acceptance` folder using remote MCP's upload URL, records the actual file ID, and asks Box AI to analyze the PDF.

Expected result: final milestone becomes Ready to bill. Hero ready rises from $0 to $18,000; hero blocked falls from $18,000 to $0. Overview becomes **$42,000 ready / $16,000 blocked**. Invoiced remains **$242,000** and outstanding remains **$12,000**.

Optional negative rehearsal: upload Marlow's acceptance first. It must say different client/project/milestone and leave $18,000 blocked. Do this off-stage if time is tight.

## 2:45–4:15 · Prepare and review billing

Click or ask exactly: **Prepare the draft invoice.** You can also use **Assemble the billing packet.** or **Draft the billing email with attachments.** All open the same idempotent billing proposal.

Open **Review billing package**. Preview the real PDF: **DRAFT-CW-101-M3**, final acceptance & handover, **$18,000**, zero tax, Net 30 from issue, prominently DRAFT. Open **Evidence & attachments** and inspect the completion report and newly verified acceptance. Open **Email & follow-up**, edit the subject or body, then choose **Approve & save**.

Expected result: Prepared for billing. The app saves the draft invoice PDF, billing packet PDF, and email JSON/text in `04 Billing`. The email manifest attaches invoice, packet, completion report, and verified acceptance. No invoice has been issued. No email has been sent. Reload and show the saved package under Review & approvals. Repeated approval returns the same saved IDs.

## 4:15–5:15 · Reveal the platform and discovery

Open **Presenter controls** at the bottom of the sidebar. In live mode, use the mapped folder links and source/saved file links to reveal the actual acceptance in `03 Acceptance` and outputs in `04 Billing`. Development mode shows local rehearsal links and explicitly says there are no live mappings.

Open **Northstar Health** and click **Find the missing acceptance document.** The acceptance is already in `01 Project records`, not `03 Acceptance`. Discovery validates the content and associates it with M3 without moving the file. Portfolio totals become **$58,000 ready / $0 blocked**. Issued and outstanding figures remain unchanged.

Close with the business outcome: evidence and prepared work are ready for the owner's decision.

## Live rehearsal checklist

- Verify the selected demo user and root, actual tools/list, pagination, Box AI scopes, and binary URL tool access.
- Run initial → upload → review/edit → approve → reload → source and saved Box links.
- Confirm returned acceptance file ID belongs to mapped CW-101 `03 Acceptance`.
- Confirm four saved outputs are in CW-101 `04 Billing` and the email lists correct IDs.
- Test wrong-project acceptance with no financial change.
- Add a descriptively named acceptance directly to a demo project in Box; Refresh evidence must discover/reassess it.
- Verify Northstar misplaced evidence and reconcile all totals.
- Preview reset and restore the initial state before the stage run.
