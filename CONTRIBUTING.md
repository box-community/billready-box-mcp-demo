# Contributing

BillReady demonstrates how an engineer can extend Box for colleagues using a custom application, employee OAuth and Box's hosted MCP. Keep contributions focused on that story.

## Local development

Use Node.js 26.x. Run `npm ci`, copy `.env.example` to `.env`, then start `npm run dev`. The default development adapter uses synthetic local fixtures and needs no Box or OpenAI credentials. See the [README](README.md) for live employee OAuth and workspace setup.

Before opening a pull request, run:

```sh
npm test
npm run build
npm audit
```

The default tests use fixtures, including OAuth and MCP responses. They do not prove live two-account access. Legacy Playwright harnesses are described in [verification notes](docs/verification.md) and are not part of the passing default suite.

## Changes and reports

Explain the behavior changed and the checks performed. Keep MCP tool calls explicit, respect employee/workspace boundaries, validate AI output with application rules, and preserve explicit approval before saving. Use integer cents for financial values.

Never commit credentials, local runtime state, real customer documents, verification logs or recordings. Regenerate synthetic kit content only when the underlying examples change, and keep the upload ZIP consistent with its source tree. Do not place the separate presenter acceptance PDF into the upload ZIP.

For security issues, follow [SECURITY.md](SECURITY.md). For ordinary bugs, include the revision, Node version, adapter mode, and reproduction steps using synthetic content. Redact account identifiers and tool output before sharing.

## License and branding

Source and supplied synthetic sample documents are distributed under the [MIT license](LICENSE). Third-party dependencies retain their own licenses. The license does not grant rights to Box trademarks or imply Box endorsement, certification or support.
