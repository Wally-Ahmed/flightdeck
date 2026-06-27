// Stub for `@/components/AgentSidebar/widgets/NodeChip`.
// The real chip fetches the node from the api-client to resolve a display name.
// This standalone preview does ZERO fetching — it renders an inline chip from
// the link label / id only. The #5368 path (a `node:<id>` link becoming a chip
// when canvas/org context is present) is exercised exactly.
export function NodeChipFromLink({
  nodeId,
  rawLabel,
}: {
  nodeId: string;
  rawLabel?: string;
  canvasId: string;
  organizationId: string;
}) {
  return (
    <span className="chip chip--node" title={`node:${nodeId}`}>
      <span className="chip__kind">node</span>
      <span className="chip__label">{rawLabel ?? nodeId}</span>
    </span>
  );
}
