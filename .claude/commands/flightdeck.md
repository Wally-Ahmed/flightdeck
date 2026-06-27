---
description: Build Flightdeck to completion in ultracode — runs the flightdeck-build workflow with full goal context and maintains HANDOFF.md.
---

# Goal: ship Flightdeck

You are completing the **Flightdeck** build — an autonomous software factory (issue → spec →
code → verify → preview → PR, **gated at every stage**), orchestrated by Superplane,
previewed on Render. Full context: `docs/PROJECT_BRIEF.md`, `docs/BUILD_PLAN.md`, `HANDOFF.md`.
Read those three first.

## How to run
Execute the build loop: **`Workflow({ name: 'flightdeck-build' })`** (this is an ultracode
build — author/run it via the Workflow tool). It runs Phase 0 (scaffold + frozen contracts)
→ Phase 1 fan-out (orchestrator, run board, Superplane canvas — each self-verified) → Phase 2
integration on #5368. Read each phase's result before the next. If it stops partway, resume
with `Workflow({ scriptPath: '.claude/workflows/flightdeck-build.js', resumeFromRunId: '<id>' })`.

## Definition of done
A reviewer can trigger the factory on issue **#5368**, watch the Superplane canvas advance
stage by stage with a gate after each, and land on a **clickable Render preview link on a real
PR** in the fork showing the implemented feature. The **run board** shows all five issues
moving through the stages. Both Superplane (the gated pipeline + native LLM spec/verify) and
Render (the preview) are visibly load-bearing.

## Non-negotiables
- **Validate every stage before the next** — the core requirement; keep a gate after each canvas stage.
- **#5368 is the hero.** Commit a **canned fallback diff** for it so the pipeline always ships a real preview + PR even if the live agent flakes (`BUILD_PLAN.md` §7).
- Stay within the **frozen contracts** (`packages/contracts`); each unit owns a **disjoint directory**.
- Keep both sponsors load-bearing — Superplane must do real orchestration + gating, not decorate.

## Degradation ladder (if the clock wins — `BUILD_PLAN.md` §8)
Superplane-native coding → our container agent → canned #5368 diff · Docker previews →
Storybook-static only · five issues → #5368 alone, reliable end-to-end.

## Maintain the handoff
Update **`HANDOFF.md`** as each phase completes (status · what works · what's left · demo
steps) so the build survives a `/compact`. After any compaction, re-read `HANDOFF.md` + the
brief + plan before continuing.
