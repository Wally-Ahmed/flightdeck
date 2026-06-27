/**
 * RunBoard — the page body: header, summary stat cards, and the five-issue table
 * where each row is one factory run (issue × pipeline-stage timeline) with its
 * overall verdict and PR / preview links.
 *
 * Data comes from useRuns() (mock or live /api/runs). The five issues always
 * render from the static catalog (ISSUES), merged with whatever run state has
 * arrived — so the board is fully populated even before the first poll lands or
 * before the orchestrator has started a given issue.
 */
import { ExternalLink, GitPullRequest, RefreshCw, Loader2 } from 'lucide-react';
import type { RunState } from '@flightdeck/contracts';
import { ISSUES, runVerdict, statusVariant, statusLabel, relativeTime } from '@/lib/pipeline';
import { useRuns } from '@/hooks/useRuns';
import { USE_MOCK } from '@/lib/api';
import { StatCards } from '@/components/StatCards';
import { StageTimeline } from '@/components/StageTimeline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const TIER_LABEL: Record<string, string> = { hero: 'Hero', mid: 'Mid', stretch: 'Stretch' };

/** A run that hasn't started yet — every issue gets one so the board is full. */
function placeholderRun(issueNumber: number): RunState {
  return { issueNumber, stage: 'spec', status: 'running', updatedAt: new Date(0).toISOString() };
}

function Links({ run }: { run: RunState }) {
  if (!run.prUrl && !run.previewUrl) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      {run.previewUrl && (
        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
          <a href={run.previewUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Preview
          </a>
        </Button>
      )}
      {run.prUrl && (
        <Button asChild size="sm" variant="secondary" className="h-7 px-2 text-xs">
          <a href={run.prUrl} target="_blank" rel="noreferrer">
            <GitPullRequest className="h-3.5 w-3.5" />
            PR
          </a>
        </Button>
      )}
    </div>
  );
}

export function RunBoard() {
  const { data: runs, isLoading, isFetching, refetch, error } = useRuns();

  const byIssue = new Map<number, RunState>();
  for (const r of runs ?? []) byIssue.set(r.issueNumber, r);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Run Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Five issues through the factory — spec → code → verify → deploy → PR, gated at every
            stage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {USE_MOCK && (
            <Badge variant="warning" className="uppercase">
              mock
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      <StatCards runs={runs ?? []} />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Issue</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[170px]">Links</TableHead>
              <TableHead className="w-[90px] text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ISSUES.map((issue) => {
              const run = byIssue.get(issue.issueNumber) ?? placeholderRun(issue.issueNumber);
              const verdict = runVerdict(run);
              const started = run.updatedAt !== new Date(0).toISOString();
              return (
                <TableRow key={issue.issueNumber} className="animate-fade-in">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://github.com/superplanehq/superplane/issues/${issue.issueNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-sm text-primary hover:underline"
                      >
                        #{issue.issueNumber}
                      </a>
                      <Badge variant="outline" className="text-[10px]">
                        {TIER_LABEL[issue.tier]}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-foreground">{issue.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      preview: {issue.previewTarget}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StageTimeline run={run} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(verdict)}>{statusLabel(verdict)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Links run={run} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {started ? relativeTime(run.updatedAt) : 'queued'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {error && (
        <p className="text-sm text-destructive">
          Failed to load runs: {(error as Error).message}. Falling back to the last known state.
        </p>
      )}
      {isLoading && !runs && (
        <p className="text-sm text-muted-foreground">Loading runs…</p>
      )}
    </div>
  );
}
