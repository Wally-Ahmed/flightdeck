# Graph Report - .  (2026-06-27)

## Corpus Check
- Corpus is ~415 words - fits in a single context window. You may not need a graph.

## Summary
- 13 nodes · 13 edges · 5 communities (3 shown, 2 thin omitted)
- Extraction: 54% EXTRACTED · 46% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.78)
- Token cost: 29,419 input · 2,000 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Tooling & Lookup Workflow|Tooling & Lookup Workflow]]
- [[_COMMUNITY_Honesty & Calibration|Honesty & Calibration]]
- [[_COMMUNITY_Token Economy & Delegation|Token Economy & Delegation]]
- [[_COMMUNITY_MemPalace Maintenance|MemPalace Maintenance]]
- [[_COMMUNITY_Voice & Character|Voice & Character]]

## God Nodes (most connected - your core abstractions)
1. `Token Usage Rules` - 4 edges
2. `Graphify Usage` - 4 edges
3. `MemPalace Usage` - 4 edges
4. `Intellectual Honesty` - 2 edges
5. `Subagents & Workflows Delegation` - 2 edges
6. `Revive MemPalace After Compact` - 2 edges
7. `Working Style (Implementation & Design)` - 2 edges
8. `Project Rule (Low-Token High-Signal)` - 2 edges
9. `Epistemic Calibration` - 1 edges
10. `Even-Handedness` - 1 edges

## Surprising Connections (you probably didn't know these)
- `Token Usage Rules` --references--> `Graphify Usage`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 2 → community 0_
- `Revive MemPalace After Compact` --rationale_for--> `MemPalace Usage`  [EXTRACTED]
  CLAUDE.md → CLAUDE.md  _Bridges community 0 → community 3_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Context Minimization Pattern (Graphify + MemPalace + Targeted Reads)** — claude_md_token_usage_rules, claude_md_graphify_usage, claude_md_mempalace_usage, claude_md_project_rule [INFERRED 0.85]
- **Agent Persona & Calibration Principles** — claude_md_voice_character, claude_md_intellectual_honesty, claude_md_epistemic_calibration, claude_md_even_handedness [INFERRED 0.75]

## Communities (5 total, 2 thin omitted)

### Community 0 - "Tooling & Lookup Workflow"
Cohesion: 0.67
Nodes (4): graphify-out/GRAPH_REPORT.md, Graphify Usage, MemPalace Usage, Working Style (Implementation & Design)

### Community 1 - "Honesty & Calibration"
Cohesion: 0.67
Nodes (3): Epistemic Calibration, Even-Handedness, Intellectual Honesty

### Community 2 - "Token Economy & Delegation"
Cohesion: 1.00
Nodes (3): Project Rule (Low-Token High-Signal), Subagents & Workflows Delegation, Token Usage Rules

## Knowledge Gaps
- **2 isolated node(s):** `graphify-out/GRAPH_REPORT.md`, `mempalace.yaml Config`
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MemPalace Usage` connect `Tooling & Lookup Workflow` to `Token Economy & Delegation`, `MemPalace Maintenance`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `Token Usage Rules` connect `Token Economy & Delegation` to `Tooling & Lookup Workflow`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `Graphify Usage` connect `Tooling & Lookup Workflow` to `Token Economy & Delegation`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Token Usage Rules` (e.g. with `Project Rule (Low-Token High-Signal)` and `Subagents & Workflows Delegation`) actually correct?**
  _`Token Usage Rules` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Intellectual Honesty` (e.g. with `Epistemic Calibration` and `Even-Handedness`) actually correct?**
  _`Intellectual Honesty` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Subagents & Workflows Delegation` (e.g. with `Project Rule (Low-Token High-Signal)` and `Token Usage Rules`) actually correct?**
  _`Subagents & Workflows Delegation` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Voice & Character Guidelines`, `Epistemic Calibration`, `Even-Handedness` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._