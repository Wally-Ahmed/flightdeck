/**
 * useRuns — tanstack-query wrapper over fetchRuns(). Polls so the board reflects
 * the canvas advancing through gates in near-real-time. Source (mock vs live
 * /api/runs) is decided inside fetchRuns by the VITE_USE_MOCK flag; this hook
 * doesn't care which.
 */
import { useQuery } from '@tanstack/react-query';
import type { RunState } from '@flightdeck/contracts';
import { fetchRuns } from '@/lib/api';

/** How often to re-poll the run state (ms). Snappy enough to watch a live demo. */
const POLL_INTERVAL_MS = 4000;

export function useRuns() {
  return useQuery<RunState[], Error>({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    // Keep showing the last good data while a refetch is in flight (no flicker).
    placeholderData: (prev) => prev,
  });
}
