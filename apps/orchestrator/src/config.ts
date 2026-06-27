/**
 * Centralised runtime configuration for the orchestrator.
 *
 * Reads from the process environment (populated by `.env` in dev via dotenv, or
 * by Render env vars in production). Nothing here throws on a missing value — the
 * service must boot credential-free so the pipeline shape can be demoed and the
 * `/health` endpoint always answers. Each consumer decides whether a missing
 * credential is fatal for *its* operation (e.g. the GitHub client errors only
 * when you actually try to open a PR without a token).
 */
import { config as loadDotenv } from 'dotenv';

loadDotenv();

/** True when a value is present and not one of the placeholder sentinels. */
function isReal(value: string | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
  if (v === '') return false;
  // The committed .env / .env.example use REPLACE_ME-style placeholders.
  return !/REPLACE_ME|your-org\/your-repo|sk-REPLACE/i.test(v);
}

/** Read a string env var, returning `undefined` for placeholders/empties. */
function str(name: string): string | undefined {
  return isReal(process.env[name]) ? process.env[name]!.trim() : undefined;
}

/** Read a numeric env var with a default. */
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  /** HTTP port. Render injects PORT; default 3000 for local dev. */
  port: num('PORT', 3000),

  /** OpenAI key for the coding agent + (if used) any LLM calls. */
  openaiApiKey: str('OPENAI_API_KEY'),

  /** GitHub PAT (repo scope) — clone fork, push branch, open PR + comment. */
  githubToken: str('GITHUB_TOKEN'),
  /** The fork we implement into / PR against, as `owner/repo`. */
  githubRepo: str('GITHUB_REPO'),

  /** Render API key — create per-issue preview services. */
  renderApiKey: str('RENDER_API_KEY'),
  /** Owner id services are created under (read from Render if absent). */
  renderOwnerId: str('RENDER_OWNER_ID'),

  /** Superplane API base + token to fire canvas runs. */
  superplaneUrl: str('SUPERPLANE_URL'),
  superplaneApiToken: str('SUPERPLANE_API_TOKEN'),
  superplaneCanvasId: str('SUPERPLANE_CANVAS_ID'),
  /** The start (trigger) node's id in the canvas. */
  superplaneTriggerNodeId: str('SUPERPLANE_TRIGGER_NODE_ID') ?? 'ingest',

  /** Postgres connection string. Absent ⇒ in-memory run store. */
  databaseUrl: str('DATABASE_URL'),

  /** Workdir the coding agent clones into. */
  workdir: str('FLIGHTDECK_WORKDIR') ?? '/tmp/flightdeck-work',

  /**
   * When true, the Code stage always uses the committed canned diff for #5368
   * instead of the live agent. Insurance for the demo (BUILD_PLAN §7). The live
   * agent is still the default; this only forces the fallback.
   */
  forceCanned: process.env.FLIGHTDECK_FORCE_CANNED === '1',
} as const;

export type Config = typeof config;
