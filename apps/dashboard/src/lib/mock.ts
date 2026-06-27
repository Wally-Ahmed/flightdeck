/**
 * Local mock fixture for GET /api/runs, matching the RunState contract exactly.
 *
 * This is the board's demo/offline data source. When VITE_USE_MOCK is on (default
 * in dev / for the static build with no orchestrator wired), the fetch layer
 * returns this instead of calling the real endpoint. One flag swaps mock → real.
 *
 * The shape mirrors a realistic mid-demo moment across the five issues:
 *   #5368 hero — shipped end-to-end (done, PR + Storybook preview live)
 *   #5366      — verify gate green, deploying
 *   #5164      — coding in progress
 *   #5704      — failed the build gate (a real stop)
 *   #5705      — speccing
 */
import type { RunState } from '@flightdeck/contracts';

const FORK = 'wally00-dev/superplane';

/** Minutes-ago ISO helper so the fixture always looks freshly updated. */
function ago(mins: number): string {
  return new Date(Date.now() - mins * 60_000).toISOString();
}

export const MOCK_RUNS: RunState[] = [
  {
    issueNumber: 5368,
    stage: 'done',
    status: 'passed',
    prUrl: `https://github.com/${FORK}/pull/12`,
    previewUrl: 'https://flightdeck-preview-5368.onrender.com',
    updatedAt: ago(2),
  },
  {
    issueNumber: 5366,
    stage: 'deploy',
    status: 'running',
    previewUrl: undefined,
    updatedAt: ago(1),
  },
  {
    issueNumber: 5164,
    stage: 'code',
    status: 'running',
    updatedAt: ago(0),
  },
  {
    issueNumber: 5704,
    stage: 'code',
    status: 'failed',
    updatedAt: ago(4),
  },
  {
    issueNumber: 5705,
    stage: 'spec',
    status: 'running',
    updatedAt: ago(0),
  },
];
