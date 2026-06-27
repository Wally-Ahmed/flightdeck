# Flightdeck — Phased Build Plan (software factory)

Companion to `PROJECT_BRIEF.md`. Same principle as before: **freeze contracts first, then
fan out on disjoint directories**; integration is serial on the main thread.

## 1. The frozen contracts (`packages/contracts`)

```ts
// A factory run, one per issue
export interface RunInput { issueNumber: number; issueTitle: string; issueBody: string; fork: string; branch: string }
export interface Spec { summary: string; files: string[]; approach: string; acceptanceCriteria: string[]; previewTarget: 'storybook' | 'image' }
export type Stage = 'spec' | 'code' | 'verify' | 'deploy' | 'pr' | 'done';
export interface RunState { issueNumber: number; stage: Stage; status: 'running' | 'passed' | 'failed'; prUrl?: string; previewUrl?: string; updatedAt: string }

// The coding-agent module's interface (Phase-1 unit A implements this; B imports it)
export interface CodeResult { branch: string; buildPassed: boolean; summary: string; headSha: string }
export interface ImplementFn { (input: { fork: string; branch: string; spec: Spec; issueNumber: number }): Promise<CodeResult> }
```

Orchestrator HTTP contract — **the canvas's `http` nodes call these**, the run board reads them:
- `POST /stages/code`   `{ issueNumber, fork, branch, spec }` → `{ buildPassed, summary, headSha }`
- `POST /stages/verify` `{ issueNumber, branch }` → `{ testsPassed, log }`
- `POST /stages/deploy` `{ issueNumber, branch }` → `{ previewUrl }`
- `POST /stages/pr`     `{ issueNumber, branch, previewUrl, reviewNotes }` → `{ prUrl }`
- `POST /api/trigger`   `{ issueNumber }` → starts the Superplane canvas run (also a demo entry point)
- `GET  /api/runs`      → `RunState[]`   ·   `GET /health` → 200

Superplane memory namespace `runs` (canvas writes; console + board read).

## 2. Dependency graph

```
Phase 0  Foundation + frozen contracts + fork setup       (main thread — blocks all)
   │
   ├─ Phase 1  parallel fan-out ────────────────────────────────────────────────┐
   │     A  coding-agent module      C  run board (vs mock)                       │
   │     B  orchestrator core + /stages/* + Render + PR + preview build           │
   │     D  Superplane canvas + console                                           │
Phase 2  Integration — wire canvas http→orchestrator, run #5368 end-to-end ◄──────┘
   │
Phase 3  Deploy, fan out all 5 on the board, rehearse
```

## 3. Phase 0 — Foundation, contracts, fork  *(main thread)*

- Root `package.json` (npm workspaces), base `tsconfig`, `.env` (done).
- `packages/contracts` — the types above, importable as `@flightdeck/contracts`.
- Pre-create each app's `package.json` / `tsconfig` / stub so Phase-1 agents never edit a shared manifest.
- `render.yaml`: orchestrator (web) + run board (static site) + Postgres. (Demo-app removed.)
- **Fork** `superplanehq/superplane`; confirm `GITHUB_TOKEN` has `repo` scope; clone-and-build the fork's `web_src/` once to confirm `npm ci && npm run build` works (the agent's target loop).

**Done when:** `npm install` + `npm run build` (contracts) pass, every app stub compiles, and a clean `web_src/` build succeeds on the fork. Green light to fan out.

## 4. Phase 1 — Parallel fan-out  *(disjoint dirs)*

| Agent | Owns (only) | Builds against | Done when |
|-------|-------------|----------------|-----------|
| **A — coding agent** | `apps/orchestrator/src/agent/**` | `ImplementFn`, `Spec`; Claude Agent SDK / Claude Code headless | `implement()` clones the fork, applies a spec to `web_src/`, runs `npm run build`, commits + pushes a branch, returns `CodeResult`. Proven on **#5368**. |
| **B — orchestrator core** | `apps/orchestrator/**` except `src/agent/**` | `@flightdeck/contracts`; imports `implement()` | `/stages/*` endpoints, GitHub PR + comment (octokit/`gh`), Render API client (deploy preview, read URL), run-state persistence, `/api/runs`, `/api/trigger` (fires the canvas) |
| **C — run board** | `apps/dashboard/**` | orchestrator HTTP contract + mock | 5 issues × stage timeline with gate status + PR/preview links, from mock; one flag swaps mock→real |
| **D — superplane** | `superplane/**` | the canvas (this rewrite) + memory `runs` | `claude.textPrompt` keys reconciled vs a real export; `console.yaml` run-board panel; canvas pushes + a manual run fires |

A and B share `apps/orchestrator` but own disjoint subdirs, meeting only at `implement()`.
**D and A are the early risk-burndown** (see §6).

## 5. Phase 2 — Integration  *(main thread, serial)*

1. Point the canvas `http` nodes at the deployed orchestrator (`ORCH_URL`); set `CANVAS_ID`.
2. Decide the coding stage: **Superplane-native `runner`/`claude.runAgent`** if your Cloud account exposes it, else the orchestrator's `implement()`. (Verify early — it's a `[VERIFY]` in the brief.)
3. Run **#5368 end-to-end**: trigger → spec → code → build gate → verify → deploy Storybook preview → live gate → PR with link. Fix the `confirm-on-run` items against the live canvas.
4. Swap the board to the live `/api/runs`; confirm the console panel agrees.

## 6. Phase 3 — Deploy, fan out, rehearse

- Deploy orchestrator + board to Render; provision the Superplane app; push the canvas.
- Fan out all five issues onto the board (`/api/trigger` each); let the easy ones (#5368, #5366) complete, the hard ones (#5704, #5705) attempt.
- Rehearse the 3-minute demo (brief §14).

## 7. The make-or-break risk: coding-agent reliability

An agent reliably implementing a real feature is the riskiest piece. Mitigations, front-loaded:
- **Prove A on #5368 first** (the easiest issue) before anything else in Phase 1.
- **Tight specs** — the Spec stage constrains the agent to named files; #5704/#5705 get one sub-task, not all.
- **A canned fallback diff for #5368** committed to the repo, so the *pipeline* always demos end-to-end even if the live agent flakes on stage. The demo shows the real agent; the fallback is insurance.

## 8. Graceful degradation (if the clock wins)

Drop in order: Superplane-native coding → our container with the live agent → the **canned #5368 diff** (pipeline still runs every gate + ships a real preview/PR) · Docker-image previews → **Storybook-static only** · five issues → **#5368 alone**, end-to-end and reliable. The irreducible core that still demos: an issue in → gated pipeline → a clickable preview + PR out.

## 9. Task mapping

Phase 0 → #1 · A+B → #3 · D/canvas → #4 · Phase 2 trigger → #5 · C → #6 · Render previews + demo → #7 · this rewrite → #10.
