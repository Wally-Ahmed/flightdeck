/**
 * Run-state persistence.
 *
 * One `RunState` row per issue (the factory tracks one run per issue). Backed by
 * Postgres when `DATABASE_URL` is set (Render injects it from the managed DB),
 * and by an in-process Map otherwise so local dev and the credential-free boot
 * still work. The shape mirrors the Superplane `runs` memory namespace so the
 * run board and the console agree (BUILD_PLAN §1).
 *
 * The public surface is intentionally tiny: `upsertRun`, `patchRun`, `getRun`,
 * `listRuns`. Stages call `patchRun` as they advance; the board reads `listRuns`.
 */
import { Pool } from 'pg';
import type { RunState, Stage } from '@flightdeck/contracts';
import { config } from './config.js';

/** Fields a stage may update on a run (everything but the issue key). */
export type RunPatch = Partial<Omit<RunState, 'issueNumber' | 'updatedAt'>>;

interface Store {
  upsertRun(issueNumber: number, patch: RunPatch): Promise<RunState>;
  patchRun(issueNumber: number, patch: RunPatch): Promise<RunState>;
  getRun(issueNumber: number): Promise<RunState | undefined>;
  listRuns(): Promise<RunState[]>;
}

const nowIso = () => new Date().toISOString();

function applyPatch(base: RunState, patch: RunPatch): RunState {
  return {
    ...base,
    ...patch,
    // never let a patch clobber the key or the timestamp
    issueNumber: base.issueNumber,
    updatedAt: nowIso(),
  };
}

function freshRun(issueNumber: number, patch: RunPatch): RunState {
  return applyPatch(
    {
      issueNumber,
      stage: 'spec',
      status: 'running',
      updatedAt: nowIso(),
    },
    patch,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (no DATABASE_URL): fine for dev + the credential-free demo.
// ─────────────────────────────────────────────────────────────────────────────
class MemoryStore implements Store {
  private runs = new Map<number, RunState>();

  async upsertRun(issueNumber: number, patch: RunPatch): Promise<RunState> {
    const existing = this.runs.get(issueNumber);
    const next = existing ? applyPatch(existing, patch) : freshRun(issueNumber, patch);
    this.runs.set(issueNumber, next);
    return next;
  }

  async patchRun(issueNumber: number, patch: RunPatch): Promise<RunState> {
    return this.upsertRun(issueNumber, patch);
  }

  async getRun(issueNumber: number): Promise<RunState | undefined> {
    return this.runs.get(issueNumber);
  }

  async listRuns(): Promise<RunState[]> {
    return [...this.runs.values()].sort((a, b) => a.issueNumber - b.issueNumber);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Postgres store. Lazily creates the table on first use; tolerant of a cold DB.
// ─────────────────────────────────────────────────────────────────────────────
class PostgresStore implements Store {
  private pool: Pool;
  private ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      // Render managed Postgres requires SSL; allow self-signed in the chain.
      ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
    });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS runs (
        issue_number INTEGER PRIMARY KEY,
        stage        TEXT NOT NULL,
        status       TEXT NOT NULL,
        pr_url       TEXT,
        preview_url  TEXT,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  private rowToState(row: {
    issue_number: number;
    stage: string;
    status: string;
    pr_url: string | null;
    preview_url: string | null;
    updated_at: Date | string;
  }): RunState {
    return {
      issueNumber: row.issue_number,
      stage: row.stage as Stage,
      status: row.status as RunState['status'],
      prUrl: row.pr_url ?? undefined,
      previewUrl: row.preview_url ?? undefined,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async upsertRun(issueNumber: number, patch: RunPatch): Promise<RunState> {
    await this.ready;
    // Merge with whatever exists, then write the whole row back. Keeps the
    // partial-update semantics simple and avoids COALESCE gymnastics.
    const existing = await this.getRun(issueNumber);
    const next = existing ? applyPatch(existing, patch) : freshRun(issueNumber, patch);
    await this.pool.query(
      `INSERT INTO runs (issue_number, stage, status, pr_url, preview_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (issue_number) DO UPDATE SET
         stage = EXCLUDED.stage,
         status = EXCLUDED.status,
         pr_url = EXCLUDED.pr_url,
         preview_url = EXCLUDED.preview_url,
         updated_at = EXCLUDED.updated_at`,
      [next.issueNumber, next.stage, next.status, next.prUrl ?? null, next.previewUrl ?? null, next.updatedAt],
    );
    return next;
  }

  async patchRun(issueNumber: number, patch: RunPatch): Promise<RunState> {
    return this.upsertRun(issueNumber, patch);
  }

  async getRun(issueNumber: number): Promise<RunState | undefined> {
    await this.ready;
    const { rows } = await this.pool.query('SELECT * FROM runs WHERE issue_number = $1', [issueNumber]);
    return rows[0] ? this.rowToState(rows[0]) : undefined;
  }

  async listRuns(): Promise<RunState[]> {
    await this.ready;
    const { rows } = await this.pool.query('SELECT * FROM runs ORDER BY issue_number ASC');
    return rows.map((r) => this.rowToState(r));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton selection + a thin façade so callers don't care which backend runs.
// If Postgres init throws at runtime (bad URL, cold DB), we degrade to memory so
// the demo never hard-fails on persistence.
// ─────────────────────────────────────────────────────────────────────────────
let store: Store;

if (config.databaseUrl) {
  try {
    store = new PostgresStore(config.databaseUrl);
    // eslint-disable-next-line no-console
    console.log('[flightdeck:db] using Postgres run store');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[flightdeck:db] Postgres init failed, falling back to memory:', err);
    store = new MemoryStore();
  }
} else {
  store = new MemoryStore();
  // eslint-disable-next-line no-console
  console.log('[flightdeck:db] no DATABASE_URL — using in-memory run store');
}

export const db = store;
