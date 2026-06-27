/**
 * StatCards — the at-a-glance summary above the run table: how many of the five
 * factory runs are shipped, in flight, or failed, plus how many have a live
 * preview. Built on the harvested Card primitive.
 */
import { Rocket, Activity, XCircle, ExternalLink } from 'lucide-react';
import type { RunState } from '@flightdeck/contracts';
import { runVerdict } from '@/lib/pipeline';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Rocket;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="animate-fade-in">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold leading-none text-foreground">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCards({ runs }: { runs: RunState[] }) {
  const shipped = runs.filter((r) => r.stage === 'done').length;
  const failed = runs.filter((r) => runVerdict(r) === 'failed').length;
  const running = runs.filter((r) => runVerdict(r) === 'running').length;
  const previews = runs.filter((r) => !!r.previewUrl).length;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat icon={Rocket} label="Shipped" value={shipped} tone="bg-success/15 text-success" />
      <Stat icon={Activity} label="In flight" value={running} tone="bg-warning/15 text-warning" />
      <Stat icon={XCircle} label="Failed gate" value={failed} tone="bg-destructive/15 text-destructive" />
      <Stat
        icon={ExternalLink}
        label="Live previews"
        value={previews}
        tone="bg-primary/15 text-primary"
      />
    </div>
  );
}
