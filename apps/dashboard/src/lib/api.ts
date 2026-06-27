/**
 * Data-fetch layer for the run board — the one place that knows mock vs real.
 *
 * `GET /api/runs` → RunState[] (the frozen contract). The board reads this; the
 * Superplane canvas writes the underlying run state. Flip from the local mock to
 * the live orchestrator with a single env flag — no component changes needed:
 *
 *   VITE_USE_MOCK=false   → call the real endpoint (VITE_API_BASE, default same-origin)
 *   VITE_USE_MOCK unset   → mock (safe default for the static build / offline demo)
 *
 * Defaulting to mock keeps the deployed static site self-contained until Phase 2
 * points it at the deployed orchestrator.
 */
import axios from 'axios';
import type { RunState, RunsResponse } from '@flightdeck/contracts';
import { MOCK_RUNS } from './mock';

/** True unless explicitly disabled. Vite inlines import.meta.env at build time. */
export const USE_MOCK: boolean =
  (import.meta.env.VITE_USE_MOCK ?? 'true').toString().toLowerCase() !== 'false';

/**
 * Base URL for the orchestrator; empty string => same-origin relative requests.
 * Accepts VITE_API_BASE (preferred) or VITE_API_URL (the name render.yaml injects
 * for the deployed static site), so the live swap works with either. Trailing
 * slash is trimmed so `${API_BASE}/api/runs` never doubles up.
 */
export const API_BASE: string = (
  import.meta.env.VITE_API_BASE ??
  import.meta.env.VITE_API_URL ??
  ''
)
  .toString()
  .replace(/\/$/, '');

/** A short, jittered simulation latency so the mock feels live (and tests polling). */
const MOCK_LATENCY_MS = 250;

/**
 * Fetch the current run states. Returns the mock fixture or the live
 * `GET /api/runs`, decided by USE_MOCK. Throwing on a real error lets the caller
 * (tanstack-query) surface it; the mock path never throws.
 */
export async function fetchRuns(): Promise<RunState[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS));
    // Clone so callers can't mutate the module-level fixture between polls.
    return MOCK_RUNS.map((r) => ({ ...r }));
  }
  const { data } = await axios.get<RunsResponse>(`${API_BASE}/api/runs`);
  return data;
}

/**
 * Kick a run for one issue via `POST /api/trigger`. Only meaningful against the
 * real orchestrator; in mock mode it's a no-op the UI can still call.
 */
export async function triggerRun(issueNumber: number): Promise<void> {
  if (USE_MOCK) return;
  await axios.post(`${API_BASE}/api/trigger`, { issueNumber });
}
