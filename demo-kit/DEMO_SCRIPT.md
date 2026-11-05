# BillReady: five-minute live presentation

The story is a Clearwave AV engineer customizing the company’s Box experience for colleagues. All customer records, amounts and signatures are fictional.

## Before presenting

- Complete [setup](SETUP.md), sign in with the intended Box account and select the workspace. Keep the server running to preserve the browser session.
- Complete [reset](RESET.md) and confirm **Alder & Finch: $0 ready / $18,000 blocked**. For repeat runs, manual Box cleanup plus quick reset avoids archive processing.
- Keep [the signed acceptance PDF](presenter-only/CW-101-signed-acceptance.pdf) available outside the active Box workspace until upload.
- Use the live adapter when showing remote MCP calls. Identify local development honestly if using it instead.
- Check the fitted PDF preview and required tools before the session. All five sample project owners are Alex Chan; your signed-in Box identity remains your actual account.
- Do not promise a fixed portfolio opening. First-time live discovery can already verify Northstar’s acceptance. With the full clean kit verified, the overview may show $40,000 ready / $18,000 blocked; local development starts at $24,000 / $34,000 before discovery.

## 0:00–0:40 · Explain the custom Box experience

**Show:** Clearwave AV’s overview, employee identity and workspace selection.

**Say:**

> An engineer at Clearwave AV built this internal workspace for the operations team. Their project documents already live in Box. Box MCP connects the custom application to that content, and Box AI helps interpret the evidence.

> I sign in with my own Box account and choose a folder. The app shows supported projects I can access, including shared folders.

Avoid switching accounts during the timed flow unless both real test accounts have been rehearsed. Different permissions or selected folders produce different lists; shared access can produce the same list.

## 0:40–1:25 · Find the billing blocker

Open **Alder & Finch** and ask **What is preventing us from billing?** Show the agreement and completion-report source links.

**Say:**

> The work is complete, but the final $18,000 milestone requires signed customer acceptance. This view connects the billing condition to the actual project evidence.

Briefly expand **Box MCP activity**, then one call’s parameter/result fields. Collapse it to continue. An optional **Draft a customer follow-up.** step can show editable copy and Alex Chan as the follow-up owner; skip it if response latency would crowd the upload scene.

## 1:25–2:25 · Upload and verify acceptance

Select **Upload acceptance** and choose `presenter-only/CW-101-signed-acceptance.pdf`.

**Say:**

> The app requests a transfer URL through Box MCP, uploads the PDF, verifies the saved file and asks Box AI to extract acceptance facts. Our code checks the client, project, milestone, signature, affirmative acceptance and date before updating readiness.

Show the actual upload activity and project amounts changing to **$18,000 ready / $0 blocked**. Explain the difference between an MCP call, binary transfer and application validation. Issued totals and unpaid issued balances do not change.

If the full live kit started at $40,000 ready / $18,000 blocked, it becomes $58,000 / $0 after this upload. Use the project amounts if the selected workspace contains different projects or evidence.

## 2:25–4:15 · Review and save the package

Ask **Prepare the draft invoice.** Open **Review billing package**.

1. Show the complete fitted invoice page: `DRAFT-CW-101-M3`, $18,000, zero-tax sample assumption and Net 30 from issue.
2. Show **Evidence & attachments** and **Email & follow-up**. Edit the copy if useful.
3. Choose **Approve & save**.
4. Show the saved-package handoff and a link to the real outputs in Box.

**Say:**

> The employee reviews the package before anything is saved. Approval stores draft invoice and packet PDFs plus email artifacts in Box. They then finalize the invoice in their billing system, attach downloaded files and send the email from their email application.

The four stored files are two PDFs plus email JSON/text. The ordinary handoff shows useful document/email actions; employees do not need to inspect the JSON. Opening the email application fills text only and does not attach files or send the message.

## 4:15–5:00 · Connect the result to the developer story

If time allows, show the central execution point in [`callBoxTool()`](../server/box-mcp.ts) and the corresponding expanded call in the UI. Use the [code walkthrough](../docs/BOX_MCP_WALKTHROUGH.md) for details.

**Close:**

> Clearwave’s engineer defined the interface, billing rules and approval steps. Box MCP connects that workflow to each employee’s permitted documents, and Box AI helps interpret the evidence. That is how a company can build its own experience on top of Box.

Northstar discovery is optional Q&A material. Its acceptance is already in the original project records and may have been verified during initial synchronization; do not stage it as a fresh reveal unless the actual starting state supports that claim.
