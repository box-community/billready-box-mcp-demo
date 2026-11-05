# Security

## Scope and intended use

BillReady is a developer demonstration of a custom employee workspace using Box's hosted MCP and Box AI. The supported hosting model is a single Node.js process bound to loopback. This repository is not a production deployment blueprint. Do not expose the development server through a public tunnel or bind it to a public interface.

Live mode reads and writes actual Box content with the signed-in employee's permissions. Use a dedicated workspace containing synthetic sample documents for rehearsals. Approval saves draft artifacts; it does not issue invoices or send email. Archive reset moves reviewed rehearsal files within Box; it does not delete them or change sharing.

The default agent uses Box AI. Selecting the optional OpenAI provider sends the workflow context it receives to that provider; review the implementation and your organization's data policy before enabling it with company documents.

## Local credentials and content

Keep `.env`, `data/`, custom storage directories, logs, verification output and recordings private. Tokens remain server-side; the browser receives an opaque session cookie. The development file server denies runtime directories and configured credential/storage paths. Git ignores and HTTP access rules are separate protections.

Protect the host and backups. OAuth credentials are stored as restricted local files, not encrypted by this app. Sessions are in memory and expire on restart; this application has no distributed session store or cross-process approval lock. A public deployment needs a separate security design and review, including HTTPS, durable session controls, storage encryption and operational monitoring.

The activity viewer contains sanitized tool parameters and results. Even without credentials, prompts and business facts can be sensitive: inspect the viewer before screen sharing or recording. Never attach real tokens, authorization codes, signed URLs, customer documents or database copies to an issue.

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/box-community/billready-box-mcp-demo/security/advisories/new) for this repository. Do not disclose an unpatched vulnerability or sensitive content in a public issue. Include the affected revision, reproduction steps using synthetic data, and impact; omit credentials and real customer information.

This demonstration has no guaranteed response-time SLA. The maintained branch is `main`; older revisions are not supported releases.
