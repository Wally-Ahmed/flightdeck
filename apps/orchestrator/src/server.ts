/**
 * The Express app — wires the frozen HTTP contract (BUILD_PLAN section 1) to the
 * stage handlers and clients:
 *
 *   POST /stages/code    → run the coding agent, build gate signal
 *   POST /stages/verify  → build + tests, verify gate signal
 *   POST /stages/deploy  → Render preview, returns previewUrl
 *   POST /stages/pr      → open the PR + comment the preview link
 *   POST /api/trigger    → fire the Superplane canvas run for an issue
 *   GET  /api/runs       → RunState[] (the run board reads this)
 *   GET  /health         → 200
 *
 * The canvas's `http` nodes call the /stages/* routes with long timeouts; we set a
 * matching server timeout so a multi-minute code stage isn't cut off. Validation
 * failures return 400; handler failures return 500 (the canvas maps a non-2xx http
 * result to its `failure` channel, which routes to Record Failure).
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import type { ZodSchema } from 'zod';
import { db } from './db.js';
import { config } from './config.js';
import {
  codeStageSchema,
  verifyStageSchema,
  deployStageSchema,
  prStageSchema,
  triggerSchema,
} from './schemas.js';
import { handleCode, handleVerify, handleDeploy, handlePr, handleTrigger } from './stages.js';

/** Wrap an async handler so thrown errors hit the error middleware (→ 500). */
function asyncRoute<T>(
  schema: ZodSchema<T>,
  handler: (body: T) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request', details: parsed.error.flatten() });
      return;
    }
    handler(parsed.data)
      .then((result) => res.status(200).json(result))
      .catch(next);
  };
}

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '5mb' }));

  // Permissive CORS — the static dashboard (different origin) reads /api/runs.
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'flightdeck-orchestrator' });
  });

  // ── Stage endpoints (the canvas calls these) ────────────────────────────────
  app.post('/stages/code', asyncRoute(codeStageSchema, handleCode));
  app.post('/stages/verify', asyncRoute(verifyStageSchema, handleVerify));
  app.post('/stages/deploy', asyncRoute(deployStageSchema, handleDeploy));
  app.post('/stages/pr', asyncRoute(prStageSchema, handlePr));

  // ── Run board API ───────────────────────────────────────────────────────────
  app.post('/api/trigger', asyncRoute(triggerSchema, handleTrigger));
  app.get('/api/runs', (_req, res, next) => {
    db.listRuns()
      .then((runs) => res.status(200).json(runs))
      .catch(next);
  });

  // ── Error middleware ────────────────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('[flightdeck:orchestrator] request error:', err);
    res.status(500).json({ error: err.message ?? 'internal error' });
  });

  return app;
}

/** Start the HTTP server with timeouts tuned for long-running stage calls. */
export function startServer(): void {
  const app = createApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[flightdeck:orchestrator] listening on :${config.port}`);
  });
  // Code stage can run for many minutes; allow up to 30m before the socket times
  // out (the canvas http node uses a 1800s timeout for /stages/code).
  server.requestTimeout = 30 * 60_000;
  server.headersTimeout = 31 * 60_000;
  server.keepAliveTimeout = 31 * 60_000;
  server.setTimeout(30 * 60_000);
}
