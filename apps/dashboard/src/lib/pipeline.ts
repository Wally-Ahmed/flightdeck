/**
 * Pipeline domain model for the run board.
 *
 * The canonical run state comes from `@flightdeck/contracts` (RunState / Stage /
 * status). This module adds the board-only presentation layer: the ordered list
 * of stages, the five validation issues, and helpers that turn a RunState into
 * per-stage gate status (passed / failed / running / pending) for the timeline.
 */
import type { RunState, Stage } from '@flightdeck/contracts';

/** The pipeline stages, left to right, that the timeline renders as columns. */
export const STAGES: Stage[] = ['spec', 'code', 'verify', 'deploy', 'pr', 'done'];

/** Human labels + the gate question each stage answers (from PROJECT_BRIEF §4). */
export const STAGE_META: Record<Stage, { label: string; gate: string }> = {
  spec: { label: 'Spec', gate: 'Spec concrete enough to code?' },
  code: { label: 'Code', gate: 'Builds? (npm run build)' },
  verify: { label: 'Verify', gate: 'Works? (tests + LLM judge)' },
  deploy: { label: 'Deploy', gate: 'Preview live? (http health-check)' },
  pr: { label: 'PR', gate: 'PR opened + link commented' },
  done: { label: 'Done', gate: 'Shipped' },
};

/**
 * The five real `superplanehq/superplane` validation issues (PROJECT_BRIEF §13).
 * Titles/tier are board metadata; the live state per issue is fed by /api/runs.
 */
export interface IssueMeta {
  issueNumber: number;
  title: string;
  tier: 'hero' | 'mid' | 'stretch';
  previewTarget: 'storybook' | 'image';
}

export const ISSUES: IssueMeta[] = [
  { issueNumber: 5368, title: 'Markdown view mode', tier: 'hero', previewTarget: 'storybook' },
  { issueNumber: 5366, title: 'Line-level diff highlighting', tier: 'mid', previewTarget: 'storybook' },
  { issueNumber: 5164, title: 'Send execution to agent chat', tier: 'mid', previewTarget: 'image' },
  { issueNumber: 5704, title: 'Run-inspection paper cuts', tier: 'stretch', previewTarget: 'image' },
  { issueNumber: 5705, title: 'Canvas warnings', tier: 'stretch', previewTarget: 'storybook' },
];

export function issueMeta(issueNumber: number): IssueMeta | undefined {
  return ISSUES.find((i) => i.issueNumber === issueNumber);
}

/** Per-stage status as the timeline understands it. */
export type GateStatus = 'passed' | 'failed' | 'running' | 'pending';

/**
 * Project a RunState onto one stage. Stages before the current one are `passed`
 * (the run only advances when a gate passes); the current stage carries the
 * run's live status (running/passed/failed); later stages are `pending`. A run
 * that reached `done` has every real stage passed.
 */
export function stageStatus(run: RunState, stage: Stage): GateStatus {
  const current = STAGES.indexOf(run.stage);
  const idx = STAGES.indexOf(stage);
  if (current < 0 || idx < 0) return 'pending';

  // A run that reached `done` cleared every gate — all stages read as passed.
  if (run.stage === 'done') return 'passed';

  if (idx < current) return 'passed';
  if (idx > current) return 'pending';

  // idx === current: this is where the run lives right now.
  if (run.status === 'failed') return 'failed';
  if (run.status === 'passed') return 'passed';
  return 'running';
}

/** Overall run verdict for the row badge. */
export function runVerdict(run: RunState): GateStatus {
  if (run.stage === 'done') return 'passed';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'passed') return 'passed';
  return 'running';
}

/** badge variant for a gate/verdict status (maps to the harvested theme tokens). */
export function statusVariant(
  status: GateStatus,
): 'success' | 'destructive' | 'warning' | 'secondary' {
  switch (status) {
    case 'passed':
      return 'success';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'warning';
    default:
      return 'secondary';
  }
}

export function statusLabel(status: GateStatus): string {
  switch (status) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    default:
      return 'Pending';
  }
}

/** Short, human "x minutes ago" from an ISO timestamp. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
