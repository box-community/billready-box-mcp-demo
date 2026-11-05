/** Only explicit content access denial justifies discarding cached workspace state. */
export function isBoxAccessDenied(error: unknown) {
  const e = error as { status?: number; message?: string };
  const message = e?.message || String(error);
  if (typeof e?.status === "number" && ![403, 404].includes(e.status))
    return false;
  // MCP transport/session failures and OAuth failures do not establish folder revocation.
  if (
    /session|transport|connection|fetch failed|timeout|timed out|rate.limit|\b(?:401|429|5\d\d)\b/i.test(
      message,
    )
  )
    return false;
  return (
    e?.status === 403 ||
    e?.status === 404 ||
    /\b(?:403|404)\b|forbidden|not[_. -]?found|access[_. -]?denied/i.test(
      message,
    )
  );
}
