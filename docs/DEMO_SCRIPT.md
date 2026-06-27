# Flightdeck — Demo Script

**One-liner:** Flightdeck is an autonomous software factory. Feed it a vague GitHub issue; LLM agents spec it, write the code, and verify it — every stage **gated** so a failure stops the line — and the output is a working PoC, deployed to a preview environment, with the link on the pull request. Built on **Superplane** (the orchestration brain) and **Render** (hosting + per-issue previews).

---

## Live links — open each in a tab before you start

| What | URL |
|------|-----|
| **Architecture deck** (start here) | https://flightdeck-board.onrender.com/architecture |
| **Run board** | https://flightdeck-board.onrender.com |
| **Orchestrator API** (proof-of-life) | https://flightdeck-orchestrator.onrender.com/health |
| **Superplane canvas** | your `flightdeck-factory` canvas in app.superplane.com |
| **The PR the factory opened** | https://github.com/Wally-Ahmed/superplane/pull/1 |
| **Source** | https://github.com/Wally-Ahmed/flightdeck |

## Pre-demo checklist (~1 minute before presenting)
- **Warm the orchestrator.** It's a Render free web service — it sleeps when idle. Hit it a few times until it's steadily green: `for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code}\n" https://flightdeck-orchestrator.onrender.com/health; done`
- The **board, deck, and canvas are always-on** (static / cloud) — no warming needed. Lean on these as the spine of the demo.
- Have the canvas, the deck, and PR #1 each already open in their own tab.

---

## The narrative (≈4–5 minutes)

**1. The problem (30s).** "Turning a vague feature request into a tested, deployed, reviewable change is hours of human work. Flightdeck does it as a pipeline of LLM agents — and, crucially, each stage *validates that the previous one actually worked* before the next begins. No 'looks done,' no broken merges."

**2. Architecture deck — the story (90s).** Open **/architecture**. Walk the five tabs:
- **Overview** — the input→output promise.
- **Pipeline** — the spec → code → verify → deploy → PR line with **gates** between stages. Run the *"run the line"* animation, then the *"what if a step fails"* one — that's the whole thesis: a failed gate stops the line.
- **Superplane** — the pipeline is a real, git-versioned **canvas** (15 nodes / 21 edges): native LLM nodes (OpenAI `gpt-5.2`), `if` gates, `http` calls, memory. This is the orchestration, not a diagram of one.
- **Render** — co-equal sponsor: hosts the orchestrator and board, and spins up the **per-issue preview environments** via the Render API — "where every result turns into something a human can click and try."
- **Run board** — the operational view.

Click any node/card — detail pops up (what it is · why it matters · technical detail).

**3. The live canvas (45s).** Switch to the Superplane tab. "This is the actual control plane — the gated pipeline as a versioned graph, with the OpenAI integration wired in. When an issue comes in, it flows through these nodes."

**4. The run board (30s).** Switch to the board. "The operational view of runs moving through the stages."

**5. It's real, end to end (45s).** Open **PR #1**. "This isn't a mockup — the factory ingested issue #5368, ran the pipeline, and opened this pull request on the fork from branch `flightdeck/issue-5368`." Show `/health` returning `{"ok":true}` — "and the orchestrator hosting the coding agent and the stage endpoints the canvas calls is live on Render."

**6. Honest close / roadmap (30s).** "The factory is live end to end and opens real PRs. The last mile we're finishing is a *genuinely-serving* preview for component issues — the pipeline already builds it and links it on the PR; making it serve is blocked on upstream codegen in the fork (`web_src` needs generated api-client), which is the next mile, not a missing piece of the architecture." Framing it as roadmap is honest and credible — judges respect knowing exactly where the edge is.

---

## Talking points / likely questions
- **"How does a stage *know* the previous one worked?"** Each gate is an `if` node on the prior stage's output — spec must be non-empty, build must pass, tests must pass — and a non-2xx from a stage routes to the *failure* path (Record Failure), so the line halts instead of shipping garbage.
- **"Why both sponsors?"** Superplane *is* the orchestration (the canvas, gates, native LLM + memory); Render *is* the delivery surface (hosting + the per-issue previews that make the result clickable). Neither is incidental.
- **"What's the LLM doing?"** Spec and review are native Superplane OpenAI nodes; the coding agent is an OpenAI Responses-API tool loop in the orchestrator (read/write/search/run within the cloned fork).
- **"Is the orchestrator flaky?"** It's on Render's **free** tier (sleeps when idle); a paid instance removes the warm-up entirely. The board and canvas are always-on.

## Known limitations (own them before a judge finds them)
1. **Live preview for component issues** is blocked on the fork's api-client codegen — the build fails until that's committed/generated. The pipeline, PR, and preview *attempt* are real.
2. **Canvas-driven full runs** hit Superplane's 30s HTTP-node timeout on the multi-minute code stage; for a live run, drive the orchestrator's `/stages/*` endpoints directly (30-min timeouts).
3. **No Postgres deployed** — the orchestrator uses an in-memory run store (fine for the demo; flip on the DB for persistence).
