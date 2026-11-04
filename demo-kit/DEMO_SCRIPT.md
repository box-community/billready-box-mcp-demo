# Clearwave AV employee workflow walkthrough

## The story

“An engineer at Clearwave AV built this workspace for the operations team. The team already keeps project records in Box. Using Box MCP and Box AI, the engineer made a custom interface that shows what can be billed, checks missing evidence, and prepares documents for review.”

## 1. Sign in and choose a workspace

Open http://127.0.0.1:4310. Show **Sign in with Box**, then choose an accessible workspace folder. Point out the actual employee identity and **Workspace projects** list.

Explain: “This is my Box account and the project content I can access. A colleague can sign in with their own account and choose their workspace. Shared projects can appear for both of us.”

Use a fresh sample workspace with Alder & Finch’s signed acceptance kept outside it. Initial portfolio totals depend on accessible projects and verified evidence. Do not promise a fixed five-project opening total.

## 2. Identify the billing blocker

Open **Alder & Finch**. The final M3 milestone represents $18,000 of completed work that requires customer acceptance. Ask **What is preventing us from billing?**

Show supporting document links and **Open project in Box**. Explain that the documents stay in Box while the custom UI surfaces the team’s workflow.

Expand **Box MCP activity**. Show a tool’s actual name, parameters, status and result. Collapse it before continuing.

## 3. Upload customer proof

Choose **Upload acceptance** and select `presenter-only/CW-101-signed-acceptance.pdf`.

Follow the visible upload stages. Explain: “The app requests a transfer URL through Box MCP, saves the PDF, verifies it in Box and asks Box AI to extract the acceptance details. Application rules check the client, project, milestone, signature and date.”

Show the actual tool details, then the updated project amounts: **$18,000 ready / $0 blocked**. The UI changes only after matching evidence passes validation. Issued invoices and unpaid balances do not change.

## 4. Review and prepare the package

Ask **Prepare the draft invoice.** Open **Review billing package** and show the fitted invoice preview, evidence attachments and editable email.

Choose **Approve & save**. Show the saved-package handoff: draft invoice, supporting billing packet, copyable email and **Open email app**. Explain that the employee finalizes the invoice in their billing system, attaches the downloaded documents and sends the email themselves.

Open the saved outputs in Box. Approval saves drafts; it does not issue invoices or send messages. Repeated approval reuses the saved files.

## 5. Close on customization

“Clearwave’s engineer defined this interface and the billing rules. Box MCP connects those actions to each employee’s permitted content, and Box AI helps interpret the evidence. The same approach lets companies build Box experiences around their own teams and processes.”

If two real test accounts are available, sign out and repeat folder selection with the second account to show its own project list. Never present fixture accounts or local development activity as live Box access.
