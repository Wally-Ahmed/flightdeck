// Stub for `@/components/AgentSidebar/widgets/RunChip`.
// The real chip fetches the run from the api-client to resolve status/label.
// This standalone preview does ZERO fetching — it renders an inline chip from
// the link label / id / inline status only. The #5368 path (a `run:<id>~status`
// link becoming a chip when canvas/org context is present) is exercised exactly.
export function RunChipFromLink({
  runId,
  rawLabel,
  rawStatus,
}: {
  runId: string;
  rawLabel?: string;
  rawStatus?: string;
  canvasId: string;
  organizationId: string;
}) {
  const status = rawStatus?.toLowerCase();
  return (
    <span className={`chip chip--run${status ? ` chip--run-${status}` : ""}`} title={`run:${runId}`}>
      <span className="chip__kind">run</span>
      <span className="chip__label">{rawLabel ?? runId.slice(0, 8)}</span>
      {status ? <span className="chip__status">{status}</span> : null}
    </span>
  );
}
