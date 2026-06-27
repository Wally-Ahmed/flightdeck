/**
 * @flightdeck/contracts — the FROZEN shared surface (BUILD_PLAN.md §1).
 *
 * These types are the contract between the Phase-1 fan-out units:
 *   A (coding agent)  implements ImplementFn / returns CodeResult
 *   B (orchestrator)  imports A, exposes the HTTP stage endpoints
 *   C (run board)     reads RunState[] from the orchestrator
 *   D (canvas)        the Superplane `http` nodes call the stage endpoints
 *
 * Do not change a published field without coordinating across all four units.
 */

// ─────────────────────────────────────────────────────────────────────────────
// §1 — Core domain types (verbatim from BUILD_PLAN.md)
// ─────────────────────────────────────────────────────────────────────────────

/** A factory run, one per issue. */
export interface RunInput {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  fork: string;
  branch: string;
}

/** The implementation spec produced by the Spec stage. */
export interface Spec {
  summary: string;
  files: string[];
  approach: string;
  acceptanceCriteria: string[];
  previewTarget: 'storybook' | 'image';
}

/** Pipeline stages, left to right. */
export type Stage = 'spec' | 'code' | 'verify' | 'deploy' | 'pr' | 'done';

/** A run's current state — what the run board and console render. */
export interface RunState {
  issueNumber: number;
  stage: Stage;
  status: 'running' | 'passed' | 'failed';
  prUrl?: string;
  previewUrl?: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 — Coding-agent module interface (Phase-1 unit A implements; B imports)
// ─────────────────────────────────────────────────────────────────────────────

/** What the coding agent returns after applying a spec to the fork. */
export interface CodeResult {
  branch: string;
  buildPassed: boolean;
  summary: string;
  headSha: string;
}

/** The coding-agent entry point. Unit A implements this; unit B calls it. */
export interface ImplementFn {
  (input: {
    fork: string;
    branch: string;
    spec: Spec;
    issueNumber: number;
  }): Promise<CodeResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator HTTP contract (BUILD_PLAN.md §1) — the canvas `http` nodes call
// these; the run board reads them. Request/response shapes are frozen here so
// units B, C, and D agree without sharing code.
// ─────────────────────────────────────────────────────────────────────────────

/** `POST /stages/code` — request. */
export interface CodeStageRequest {
  issueNumber: number;
  fork: string;
  branch: string;
  spec: Spec;
}

/** `POST /stages/code` — response. */
export interface CodeStageResponse {
  buildPassed: boolean;
  summary: string;
  headSha: string;
}

/** `POST /stages/verify` — request. */
export interface VerifyStageRequest {
  issueNumber: number;
  branch: string;
}

/** `POST /stages/verify` — response. */
export interface VerifyStageResponse {
  testsPassed: boolean;
  log: string;
}

/** `POST /stages/deploy` — request. */
export interface DeployStageRequest {
  issueNumber: number;
  branch: string;
}

/** `POST /stages/deploy` — response. */
export interface DeployStageResponse {
  previewUrl: string;
}

/** `POST /stages/pr` — request. */
export interface PrStageRequest {
  issueNumber: number;
  branch: string;
  previewUrl: string;
  reviewNotes: string;
}

/** `POST /stages/pr` — response. */
export interface PrStageResponse {
  prUrl: string;
}

/** `POST /api/trigger` — request. Starts a Superplane canvas run. */
export interface TriggerRequest {
  issueNumber: number;
}

/** `POST /api/trigger` — response. */
export interface TriggerResponse {
  issueNumber: number;
  started: boolean;
  runId?: string;
}

/** `GET /api/runs` — response. */
export type RunsResponse = RunState[];

/**
 * Superplane memory namespace the canvas writes and the console + board read.
 * (BUILD_PLAN.md §1: "Superplane memory namespace `runs`".)
 */
export const RUNS_NAMESPACE = 'runs' as const;
