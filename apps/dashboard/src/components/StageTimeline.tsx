/**
 * StageTimeline — the heart of the board. Renders the pipeline as a row of
 * connected stage nodes for one run, each node colored by its gate status
 * (passed / failed / running / pending) with a tooltip naming the gate question.
 *
 * This is the "pipeline-stage timeline with gate pass/fail" from the brief, one
 * instance per issue.
 */
import { Check, X, Loader2, Circle } from 'lucide-react';
import type { RunState, Stage } from '@flightdeck/contracts';
import {
  STAGES,
  STAGE_META,
  stageStatus,
  statusLabel,
  type GateStatus,
} from '@/lib/pipeline';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const NODE_RING: Record<GateStatus, string> = {
  passed: 'border-success bg-success/15 text-success',
  failed: 'border-destructive bg-destructive/15 text-destructive',
  running: 'border-warning bg-warning/15 text-warning',
  pending: 'border-border bg-muted/40 text-muted-foreground',
};

const CONNECTOR: Record<GateStatus, string> = {
  passed: 'bg-success/60',
  failed: 'bg-destructive/60',
  running: 'bg-warning/50',
  pending: 'bg-border',
};

function StageIcon({ status }: { status: GateStatus }) {
  switch (status) {
    case 'passed':
      return <Check className="h-3.5 w-3.5" />;
    case 'failed':
      return <X className="h-3.5 w-3.5" />;
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    default:
      return <Circle className="h-2 w-2" />;
  }
}

function StageNode({ run, stage }: { run: RunState; stage: Stage }) {
  const status = stageStatus(run, stage);
  const meta = STAGE_META[stage];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-center gap-1">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors',
              NODE_RING[status],
            )}
            aria-label={`${meta.label}: ${statusLabel(status)}`}
          >
            <StageIcon status={status} />
          </div>
          <span
            className={cn(
              'text-[10px] font-medium',
              status === 'pending' ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {meta.label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div className="font-semibold">
            {meta.label} — {statusLabel(status)}
          </div>
          <div className="text-muted-foreground">Gate: {meta.gate}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function StageTimeline({ run }: { run: RunState }) {
  return (
    <div className="flex items-start">
      {STAGES.map((stage, i) => {
        // The connector before a node reflects whether the *previous* gate passed.
        const prevStatus = i === 0 ? null : stageStatus(run, STAGES[i - 1]);
        return (
          <div key={stage} className="flex items-start">
            {i > 0 && (
              <div
                className={cn(
                  'mt-3.5 h-0.5 w-5 sm:w-8',
                  CONNECTOR[prevStatus ?? 'pending'],
                )}
              />
            )}
            <StageNode run={run} stage={stage} />
          </div>
        );
      })}
    </div>
  );
}
