/**
 * Flightdeck run board — the page.
 *
 * Shows the five validation issues × pipeline-stage timeline with per-gate
 * pass/fail and PR + preview links, fed by GET /api/runs. Data source is a local
 * mock fixture by default (VITE_USE_MOCK); one flag (VITE_USE_MOCK=false) swaps
 * it to the live orchestrator. Built as a static site for Render.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout } from '@/components/AppLayout';
import { RunBoard } from '@/components/RunBoard';
import { USE_MOCK } from '@/lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 2000 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <AppLayout usingMock={USE_MOCK}>
          <RunBoard />
        </AppLayout>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
