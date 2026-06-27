/**
 * Flightdeck orchestrator — entry point.
 *
 * Boots the Express server that hosts the factory's HTTP contract: the /stages/*
 * endpoints the Superplane canvas calls, /api/trigger to fire a canvas run,
 * /api/runs for the run board, and /health. The coding agent (unit A) lives in
 * src/agent/ and is invoked by the Code stage.
 *
 * The service boots credential-free: missing creds only fail the specific
 * operation that needs them (e.g. opening a PR), so the pipeline shape, the run
 * board, and /health all work for a local demo.
 */
import { startServer } from './server.js';

startServer();
