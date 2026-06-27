/**
 * Superplane client — fire a canvas run for an issue.
 *
 * Verified trigger (HANDOFF "Verified facts"):
 *   POST {SUPERPLANE_URL}/api/v1/canvases/{canvasId}/triggers/{nodeId}/hooks/run
 *   body: { "parameters": { "template": "run", issueNumber, issueTitle, issueBody, fork, branch } }
 *   Authorization: Bearer {SUPERPLANE_API_TOKEN}
 *
 * The trigger node id defaults to `ingest` (the canvas's start node) and is
 * overridable via SUPERPLANE_TRIGGER_NODE_ID. Credential-free, this returns
 * `{ started: false }` rather than throwing, so `/api/trigger` still responds and
 * the run can be tracked locally (the orchestrator can drive its own stages even
 * without the live canvas).
 */
import { config } from './config.js';

export interface TriggerCanvasInput {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  fork: string;
  branch: string;
}

export interface TriggerCanvasResult {
  started: boolean;
  runId?: string;
  /** Why it didn't start, when started is false. */
  reason?: string;
}

/**
 * Fire one canvas run via the ingest trigger's run hook. Returns `started:false`
 * with a reason when Superplane isn't configured, so callers can decide whether to
 * fall back to driving stages directly.
 */
export async function triggerCanvasRun(input: TriggerCanvasInput): Promise<TriggerCanvasResult> {
  if (!config.superplaneUrl || !config.superplaneApiToken || !config.superplaneCanvasId) {
    return { started: false, reason: 'Superplane not configured (URL/token/canvasId missing)' };
  }

  const url =
    `${config.superplaneUrl.replace(/\/$/, '')}` +
    `/api/v1/canvases/${config.superplaneCanvasId}` +
    `/triggers/${config.superplaneTriggerNodeId}/hooks/run`;

  const body = {
    parameters: {
      template: 'run',
      issueNumber: input.issueNumber,
      issueTitle: input.issueTitle,
      issueBody: input.issueBody,
      fork: input.fork,
      branch: input.branch,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.superplaneApiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    return { started: false, reason: `Superplane trigger ${res.status}: ${text.slice(0, 500)}` };
  }

  // The run hook returns an execution/run identifier; field name varies, so probe.
  let runId: string | undefined;
  try {
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    runId =
      (json.runId as string) ??
      (json.id as string) ??
      ((json.execution as Record<string, unknown> | undefined)?.id as string) ??
      undefined;
  } catch {
    // non-JSON success body; ignore
  }

  return { started: true, runId };
}
