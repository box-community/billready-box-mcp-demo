import React, { useState } from "react";
import { Check, AlertCircle, LoaderCircle } from "lucide-react";
import type { Trace } from "../server/tracing.ts";
const labels: Record<string, string> = {
  "tools/list": "Discover Box MCP tools",
  get_folder_details: "Inspect Box folder",
  list_folder_content_by_folder_id: "Read folder contents",
  ai_qa_multi_file: "Ask Box AI about evidence",
  ai_extract_freeform: "Extract acceptance details with Box AI",
  get_upload_url: "Request a secure upload URL",
  get_download_url: "Request a secure download URL",
  binary_upload: "Transfer PDF to Box",
  binary_download: "Read document from Box",
  create_folder: "Create Box folder",
  move_file: "Move Box file",
  upload_file: "Save document in Box",
};
const fieldLabels: Record<string, string> = {
  file_ids: "Source files",
  file_id: "File",
  folder_id: "Folder",
  parent_folder_id: "Destination folder",
  question: "AI instructions",
  prompt: "Extraction instructions",
  file_size_bytes: "File size (bytes)",
  file_name: "File name",
  file_content: "Document content",
  signed: "Signed by customer",
  accepted: "Acceptance confirmed",
  projectId: "Project",
  milestoneId: "Milestone",
  sourceFileIds: "Supporting files",
};
function decoded(value: unknown): unknown {
  if (typeof value === "string" && /^\s*[\[{]/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {}
  }
  return value;
}
function ReadableValue({
  value,
  name = "",
  depth = 0,
}: {
  value: unknown;
  name?: string;
  depth?: number;
}) {
  const parsed = decoded(value);
  if (parsed === null || parsed === undefined)
    return <span className="trace-muted">Not provided</span>;
  if (typeof parsed === "boolean")
    return (
      <span className={"trace-value-badge " + (parsed ? "yes" : "no")}>
        {parsed ? "Yes" : "No"}
      </span>
    );
  if (
    typeof parsed === "string" &&
    /^(file_id|folder_id|parent_folder_id|file_ids|sourceFileIds)$/.test(
      name,
    ) &&
    /^\d+$/.test(parsed)
  )
    return (
      <a
        className="trace-id-chip"
        href={`https://app.box.com/${name.includes("folder") ? "folder" : "file"}/${parsed}`}
        target="_blank"
        rel="noreferrer"
      >
        {parsed} ↗
      </a>
    );
  if (typeof parsed === "string" || typeof parsed === "number") {
    const text = String(parsed);
    return text.length > 240 ? (
      <details className="trace-prose">
        <summary>
          Read{" "}
          {name === "question" || name === "prompt"
            ? "AI instructions"
            : "full text"}{" "}
          · {text.length.toLocaleString()} characters
        </summary>
        <div>{text}</div>
      </details>
    ) : (
      <span className="trace-readable-text">{text}</span>
    );
  }
  if (depth > 5) return <span>Nested detail available in raw JSON</span>;
  if (Array.isArray(parsed))
    return parsed.length ? (
      <div className="trace-array">
        {parsed.slice(0, 6).map((item, i) => (
          <div className="trace-array-item" key={i}>
            <ReadableValue value={item} name={name} depth={depth + 1} />
          </div>
        ))}
        {parsed.length > 6 && (
          <details>
            <summary>{parsed.length - 6} more items</summary>
            {parsed.slice(6, 30).map((item, i) => (
              <ReadableValue
                key={i}
                value={item}
                name={name}
                depth={depth + 1}
              />
            ))}
          </details>
        )}
      </div>
    ) : (
      <span className="trace-muted">No items returned</span>
    );
  return (
    <dl className="trace-fields">
      {Object.entries(parsed as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, item]) => (
          <div key={key}>
            <dt>
              {fieldLabels[key] || key.replace(/_/g, " ")}
              <code>{key}</code>
            </dt>
            <dd>
              <ReadableValue value={item} name={key} depth={depth + 1} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function ToolActivity({
  tools,
  live = false,
}: {
  tools: Trace[];
  live?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!tools.length) return null;
  return (
    <details className="tool-trace" open={live || undefined}>
      <summary>
        {tools.some((t) => t.mode === "live")
          ? "Box MCP activity"
          : "Development adapter activity"}{" "}
        · {tools.length} calls{live ? " · live" : ""}
      </summary>
      <div className="trace-controls">
        <span>Requests → Box responses</span>
        <button
          type="button"
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Compact" : "Details"}
        </button>
      </div>
      <div className="trace-calls">
        {tools.map((t, i) => (
          <details
            key={t.seq ?? i}
            className={"trace-call " + (t.status || "completed")}
            open={expanded || undefined}
          >
            <summary>
              <span
                className="trace-status"
                aria-label={t.status || "completed"}
              >
                {t.status === "running" ? (
                  <LoaderCircle size={14} className="spin" />
                ) : t.status === "failed" ? (
                  <AlertCircle size={14} />
                ) : (
                  <Check size={14} />
                )}
              </span>
              <span className="trace-title">
                {labels[t.tool] || t.tool}
                <code>{t.tool}</code>
                {t.resultSummary && (
                  <small className="trace-result-summary">
                    {t.resultSummary}
                  </small>
                )}
              </span>
              <span className="trace-time">
                {t.status === "running"
                  ? "Running"
                  : t.durationMs !== undefined
                    ? `${(t.durationMs / 1000).toFixed(2)} s`
                    : "Done"}
              </span>
            </summary>
            <div className="trace-payload">
              <span className="trace-kind">
                {t.kind === "transfer"
                  ? "Binary transfer · URL issued by MCP"
                  : t.kind === "mcp"
                    ? "Remote Box MCP tool"
                    : t.detail}
              </span>
              {t.parameters !== undefined && (
                <section>
                  <h4>1 · Request</h4>
                  <ReadableValue value={t.parameters} />
                </section>
              )}
              {t.status === "running" && (
                <p className="trace-waiting">Waiting for Box response…</p>
              )}
              {t.error && (
                <div className="trace-error">
                  <b>Call failed</b>
                  <p>{t.error}</p>
                </div>
              )}
              {t.result !== undefined && (
                <section>
                  <h4>2 · Box response</h4>
                  <ReadableValue value={t.result} />
                </section>
              )}
              {(t.parameters !== undefined || t.result !== undefined) && (
                <details className="trace-raw">
                  <summary>Raw JSON · developer view</summary>
                  <pre>
                    {JSON.stringify(
                      { parameters: t.parameters, result: t.result },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
            </div>
          </details>
        ))}
      </div>
      <small className="trace-redaction">
        Credentials, temporary transfer URLs and binary content are hidden.
        Large results are abbreviated.
      </small>
    </details>
  );
}
