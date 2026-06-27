// Flightdeck build loop — the deterministic multi-agent build.
// Run in ultracode:  Workflow({ name: 'flightdeck-build' })
// Freeze contracts (Phase 0) → fan out 3 disjoint units, each build→verify→fix →
// integrate (Phase 2). Every unit self-verifies; a failed unit gets one fix pass.
// Source of truth: docs/PROJECT_BRIEF.md, docs/BUILD_PLAN.md, HANDOFF.md.

export const meta = {
  name: 'flightdeck-build',
  description: 'Build the Flightdeck software factory: scaffold + frozen contracts, then fan out orchestrator / run board / Superplane canvas with verify gates, then integrate and prove the #5368 path.',
  phases: [
    { title: 'Phase 0 — Foundation' },
    { title: 'Phase 1 — Build' },
    { title: 'Phase 1 — Verify' },
    { title: 'Phase 2 — Integrate' },
  ],
}

const STATUS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'true only if it actually compiles / passes' },
    summary: { type: 'string' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    followups: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary'],
}

const REF =
  'Read docs/PROJECT_BRIEF.md, docs/BUILD_PLAN.md and HANDOFF.md before starting. ' +
  'Stay STRICTLY inside your own directory — never edit a shared manifest or another unit\'s files. ' +
  'Do not run `npm install` (Phase 0 already installed workspace deps). ' +
  'When done, append one dated line to HANDOFF.md under "## Build log" describing what you did.'

// ── Phase 0 — foundation + frozen contracts (blocks everything) ───────────────
phase('Phase 0 — Foundation')
const p0 = await agent(
  `${REF}\n\nPHASE 0 (foundation, do this alone). Create:\n` +
  '- root package.json (npm workspaces over packages/*, apps/*), base tsconfig.json, .gitignore already exists.\n' +
  '- packages/contracts: implement the EXACT interfaces in BUILD_PLAN.md §1 (RunInput, Spec, Stage, RunState, CodeResult, ImplementFn), exported as @flightdeck/contracts; must build.\n' +
  '- apps/orchestrator and apps/dashboard: each a package.json (all deps it will need), tsconfig.json, and a single compiling src stub. NO app logic yet.\n' +
  '- update render.yaml: orchestrator (web) + dashboard (static site) + Postgres; remove any demo-app.\n' +
  'Then run `npm install` once at root and `npm run build` for packages/contracts to PROVE the workspace + contracts compile. ' +
  'Separately clone https://github.com/superplanehq/superplane to /tmp/sp-upstream and REPORT whether `npm ci && npm run build` succeeds in its web_src/ (this is the coding agent\'s target loop) — report only, do not block on it.',
  { phase: 'Phase 0 — Foundation', schema: STATUS, label: 'scaffold' }
)
if (!p0 || !p0.ok) {
  log('Phase 0 failed (workspace/contracts did not compile) — stopping before fan-out. See HANDOFF.md.')
  return { phase0: p0, units: [], integration: null }
}
log('Phase 0 green — contracts frozen. Fanning out.')

// ── Phase 1 — three disjoint units, each build → verify → (fix once) ───────────
const UNITS = [
  {
    key: 'orchestrator',
    dir: 'apps/orchestrator',
    task:
      'UNIT B+A — the orchestrator (incl. the coding agent in src/agent/). Implement: the /stages/{code,verify,deploy,pr} HTTP endpoints, /api/trigger (fires the Superplane canvas run via POST /api/v1/canvases/{id}/triggers/ingest/hooks/run), /api/runs, /health; GitHub PR + comment (octokit); a Render API client (create web service from a Docker image, read serviceDetails.url); run-state persistence (Postgres). In src/agent/ implement ImplementFn (clone the fork, apply a Spec to web_src/, run `npm run build`, commit+push a branch, return CodeResult) using the Claude Agent SDK / Claude Code headless. PRIORITY + highest risk: prove the agent on issue #5368, and commit a CANNED FALLBACK diff for #5368 so the pipeline ships even if the live agent flakes (BUILD_PLAN §7). Owns apps/orchestrator/** only.',
  },
  {
    key: 'board',
    dir: 'apps/dashboard',
    task:
      'UNIT C — the run board. Vite + React, harvesting the shadcn scaffold from /Users/wally/Documents/GitHub/HackWashingtonU/frontend (AppLayout shell, card grid, table, theme tokens; STRIP the auth/trading code). Render the 5 issues × pipeline-stage timeline with gate pass/fail and PR + preview links, fed by GET /api/runs (use a local mock fixture matching the RunState contract; one flag swaps mock→real). Build it as a static site. Owns apps/dashboard/** only.',
  },
  {
    key: 'canvas',
    dir: 'superplane',
    task:
      'UNIT D — Superplane canvas + console. Reconcile the `# VERIFY` items in superplane/canvas.yaml (claude.textPrompt config keys + output/channel names) against `superplane index actions` or a real `superplane apps canvas get` export if a token is available; otherwise leave them marked and note it. Author superplane/console.yaml as the run-board panel (kind: Console) reading memory namespace `runs` (number/table panels). Owns superplane/** only.',
  },
]

phase('Phase 1 — Build')
const results = await pipeline(
  UNITS,
  (u) => agent(`${REF}\n\n${u.task}`, { phase: 'Phase 1 — Build', schema: STATUS, label: `build:${u.key}` }),
  (built, u) =>
    agent(
      `${REF}\n\nVERIFY unit "${u.key}" in ${u.dir}. Run its typecheck/build (and tests if present). If it does NOT pass, FIX it (edit only ${u.dir}) and re-run. Report ok=true ONLY if it genuinely builds/passes. Prior build note: ${(built && built.summary) || 'none'}.`,
      { phase: 'Phase 1 — Verify', schema: STATUS, label: `verify:${u.key}` }
    )
)

const green = UNITS.filter((u, i) => results[i] && results[i].ok).map((u) => u.key)
const red = UNITS.filter((u, i) => !results[i] || !results[i].ok).map((u) => u.key)
log(`Phase 1: green [${green.join(', ') || 'none'}]${red.length ? ` · still red [${red.join(', ')}]` : ''}`)

// ── Phase 2 — integration + prove the #5368 path ──────────────────────────────
phase('Phase 2 — Integrate')
const integration = await agent(
  `${REF}\n\nPHASE 2 (integration, alone). Wire the canvas http nodes to the orchestrator (set ORCH_URL + CANVAS_ID), swap the board to the live GET /api/runs, and prove the #5368 path end-to-end: trigger → spec → code → build gate → verify → deploy a Storybook static preview to Render → live gate → open PR with the preview link. Use the live coding agent if reliable, else the canned #5368 fallback diff so the gated pipeline still ships a real preview + PR. Resolve the canvas confirm-on-run items where possible. Update HANDOFF.md with the true end-to-end status, remaining gaps, and the demo steps.`,
  { phase: 'Phase 2 — Integrate', schema: STATUS, label: 'integrate' }
)

return {
  phase0: p0,
  units: UNITS.map((u, i) => ({ unit: u.key, ...(results[i] || { ok: false, summary: 'no result' }) })),
  integration,
}
