# Flightdeck — Project Brief

> Working title (software-factory pivot). An autonomous software factory: a rough idea or
> a GitHub issue goes in; LLM agents **spec → code → verify** it, each stage gated on the
> previous one actually working; out comes an agent-built, working PoC **deployed to a
> preview environment with a clickable link on the pull request.** Orchestrated by
> Superplane, previewed on Render, validated against five real `superplanehq/superplane`
> issues.

**How to read this.** Sections 1–3 frame the whole; 4–12 are the buildable parts (and the
parallel work units in `BUILD_PLAN.md`); 13–15 are execution context. Tags: `[VERIFY]`
confirm against the live tool · `[ASSUMPTION]` correct me · `[STRETCH]` time-permitting ·
`[PREP]` something you set up.

---

## 1. Vision & the pitch

The requirement: take a vague feature description or a GitHub issue; LLM agents do the
heavy lifting — speccing, coding, verifying — with **each stage validating the previous
one actually worked before moving on**; the output is an agent-implemented, working PoC
**deployed to a preview environment, linked on the PR** for a human to see and test.

Pitch: **"Drop in an issue, get back a working preview and a pull request — specced,
coded, verified, and deployed by agents, with a validation gate at every step."**

Superplane is the staged-validation control plane (its exact sweet spot, and the
requirement's spine); Render hosts the per-issue previews; LLM agents — Superplane's own
components plus a coding agent — do the spec/code/verify. Both sponsors are load-bearing.

## 2. The input

Primary input is a **GitHub issue number** on the target repo (the five validation cases
are issues); we also accept a free-text "rough idea." The orchestrator ingests it — or a
human kicks it from the run board — and starts one Superplane canvas run per issue. All
five can be fired together (fan-out).

## 3. System architecture

- **The brain (Superplane).** One canvas per issue runs the pipeline: the LLM spec/verify
  steps, and a **validation gate after every stage**. Durable and restart-safe.
- **The hands (Render).** Per-issue **preview environments** a reviewer can click — a
  static Storybook site for component features, a full Docker-image web service for flows.
- **The custom logic (this repo).** A TypeScript orchestrator: ingests the issue, hosts
  the coding agent, manages the fork/branch/PR, calls the Render API, and serves the run
  board.
- **The target.** A **fork of `superplanehq/superplane`** the agent implements into and
  previews from (we can't PR the real repo). `[PREP: fork + GITHUB_TOKEN with repo scope.]`

## 4. The pipeline (the heart) — every stage gated

The canvas, left to right: **Ingest → Spec → ⟨gate⟩ → Code → ⟨gate: builds?⟩ → Verify →
⟨gate: works?⟩ → Build preview → Deploy to Render → ⟨gate: preview live?⟩ → Open PR +
comment link.** Each gate checks the prior stage actually succeeded (the explicit
requirement); a failed gate stops the run, or loops back to Code with feedback `[STRETCH]`.

## 5. Stage — Spec (LLM, in-canvas)

`claude.textPrompt` turns the issue body into a concrete implementation spec: files to
touch, approach, acceptance criteria, and the preview target (Storybook vs full app).
Gate: a judge step (LLM or `if`) confirms the spec is concrete enough to code.

## 6. Stage — Code (the coding agent) — *the key call*

The heavy lift: implement the spec in a clone of the fork, on a branch, then push.
- **Primary (reliable):** our orchestrator container runs a **Claude coding agent** (Claude
  Agent SDK / Claude Code headless) — clone fork, edit `web_src/`, build, commit, push.
- **Aspirational (Superplane-native):** a Superplane **`runner`** Docker job, or
  `claude.runAgent` / `cursor.launchAgent`, does the coding *inside* the canvas ("SuperPlane
  runners to run LLMs"). The `runner` component exists but is a client to a **managed broker
  available only on Superplane Cloud** — `[VERIFY]` whether your Cloud account exposes it;
  use it if so, else the container. The canvas node is swappable either way.

Gate: build the result (`npm run build` in `web_src/`) — `success`/`failed`.

## 7. Stage — Verify (build/test + LLM judge)

Run the build and relevant tests / Storybook, then an LLM (`claude.textPrompt`) judges the
diff against the spec's acceptance criteria. Gate: pass → deploy; fail → stop (or loop back
to Code `[STRETCH]`). This is "validate it actually worked," made concrete.

## 8. Stage — Build & deploy preview (tiered)

- **Cheap (component features: #5368, #5366, UI parts of #5705):** build **Storybook static**
  (`vite build`) → deploy as a Render **static site** (no backend, no spin-down) → instant URL.
- **Heavy (flow features: #5164, #5704):** build a **Docker image** of the modified app → push
  to `ghcr.io` → `POST /v1/services` (Render API, image) → read `serviceDetails.url`.

Gate: an `http` health-check on the preview URL confirms the deploy is live.

## 9. Stage — PR + preview link

Open a PR on the fork (the Code branch) and comment the live preview URL (`gh pr comment`).
This is the deliverable: "a link on the PR where someone can see and test it."

## 10. The orchestrator

Our TS service: ingest the issue (webhook / run board / CLI), manage the fork clone +
branch, host the coding agent (primary path), call the Render API, open the PR + comment
the link, expose the run-board API, and start/observe the Superplane canvas. Runs on Render.

## 11. Superplane usage (both sponsors load-bearing)

Canvas = the staged pipeline + a gate after every stage (the requirement's core).
`claude.textPrompt` for spec and verify. Optional `runner`/`claude.runAgent`/
`cursor.launchAgent` for coding (if Cloud supports). Memory/executions hold run state; the
**console** *is* the run board, natively. This is heavy, genuine Superplane usage.

## 12. The factory run board

(Pivot of the old DORA dashboard.) Shows the five issues × pipeline stages: which stage
each is at, gate pass/fail, the PR + preview links, and timings. Built two ways: a custom
React board (harvested shadcn scaffold) on Render **plus** a native `console.yaml` panel
reading the same run state. Degrades to console-only.

## 13. The 5 issues — selection & scoping

All five are frontend-UX features in `web_src/` (React 19 / TS / Vite 6; Storybook,
mermaid, react-markdown present).
- **Hero / thin-slice — #5368** (markdown view mode): mostly wiring existing renderers
  (mermaid, mention chips) into view mode. Storybook-previewable.
- **Mid — #5366** (line-level diff highlighting), **#5164** (send execution to agent chat).
- **Stretch / hard — #5704** (run-inspection paper cuts: five independent sub-tasks),
  **#5705** (canvas warnings: invent new warning rules — open-ended).

Plan: nail **#5368** end-to-end first; the pipeline attempts all five; spec the multi-part
ones tightly or scope to a single sub-task. "Produce a working PoC for each" is met
issue-by-issue — honest demo target is reliable on #5368 (+ #5366), architected for all five.

## 14. Demo narrative

Kick the factory on #5368 and watch the canvas: spec posts → gate passes → the coding agent
implements (live logs) → build gate green → verify gate green → the Storybook preview
deploys to Render → a PR opens with the preview link → click it, the feature works. Then
show the run board with all five in flight. Every gate is Superplane validating a stage;
every preview is Render; the agents did the speccing, coding, and verifying. `[ASSUMPTION:
time/team/judging still unknown — this assumes one reliable end-to-end issue is the bar.]`

## 15. Decisions (locked) & open items

Locked: software-factory architecture; Superplane canvas as the staged-validation spine;
coding agent = **Claude in our orchestrator** (primary) with Superplane-native coding as a
verify-on-Cloud enhancement; **tiered previews** (Storybook-static primary, Docker-image for
flows); **#5368 hero**; target = a **fork of `superplanehq/superplane`**; TS/Node + npm
workspaces; name Flightdeck (provisional).

Open / verify:
- `[VERIFY]` Does your Superplane **Cloud** account expose the managed `runner` /
  `claude.runAgent` / `cursor.launchAgent`? (Decides whether coding can be Superplane-native.)
- `[VERIFY]` `claude.textPrompt` config keys, and how a `runner` node's result feeds a gate.
- `[PREP]` The fork + `GITHUB_TOKEN` repo scope; whether to also wire a Cursor account.
- `[ASSUMPTION]` Time budget, team size, judging weights — tunes stretch, not the core.
