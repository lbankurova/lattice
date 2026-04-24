# Lattice Framework — TODO

> Backlog for the framework itself (not projects using it).

## Enhancement

### ~~ENH-01a: E2E testing gate (branch-comparison behavioral verification)~~ d0ce8b0
- Done. `executor/src/e2e.ts`, CLI `lattice e2e`, workflow nodes in build-cycle + bug-fix-cycle, scaffold template.
- Phase 2 deferred: text_diff, custom comparison, parallel suites, screenshot perceptual diff, autopilot integration.

### ~~ENH-02: Token tracker / budget / alerting~~
- Done. `executor/src/budget.ts`, JSON output parsing in `nodes.ts`, cost aggregation in `engine.ts`, `lattice cost` CLI command, scaffold template.
- Uses `claude --output-format json` to get real token counts and cost from CLI (no Phase 2 dependency).
- Phase 2 deferred: cost trend charts, per-model breakdown, Slack budget alerts, cost anomaly detection.

### ~~ENH-03: Topic lifecycle states + zombie detection~~ d57401b
- Done. `LifecycleState` type (`active`/`paused`/`archived`) in coherence.ts, `lifecycle_state` and `pause_reason` YAML fields, lock info extraction.
- Zombie detection: active phase + no lock + no checkpoint in 48h = warning conflict.
- Autopilot skips paused topics, archived topics not loaded.

### ~~ENH-04: WIP checkpoint commits~~ d57401b
- Done. Engine creates `wip:` commits when uncommitted file count exceeds 15 during workflow run.
- Uses `--no-verify` to skip hooks. Gets squashed in final review commit.

### ~~ENH-05: Autopilot-safe classification in prioritize~~ d57401b
- Done. Prioritize skill tags recommendations as `[autopilot]` or `[human]` based on safety criteria.
- Safe: research-complete needing synthesis, clean probe, bug fixes. Not safe: UI epics, SCIENCE-FLAG, paused.

### ~~ENH-07: autopilot reads TODO queue + SCIENCE-FLAG citation-memo resolution + `--skip-reconcile`~~ (2026-04-24)
- **Done.** Three linked changes:
  1. **`lattice coherence --skip-reconcile` flag** — `executor/src/cli.ts` cmdCoherence now accepts the flag; `lattice status` (Step 0 in autopilot) already reconciles, so Step 1 coherence check doesn't need to re-reconcile. Rebuilt executor dist.
  2. **Autopilot extended to TODO queue** — `commands/lattice/autopilot.md` rewritten. Reads `docs/_internal/TODO.md` (or project equivalent) for entries tagged `autopilot: ready` with `score: N`, merges with topic queue, routes by size (≤50 LOC direct edit → `/ops:check`; bug → `/ops:bug`; ETL → `/lattice:spike`; research → `/lattice:research-cycle`). Escalations go to `ESCALATION.md` at repo root.
  3. **SCIENCE-FLAG resolution semantics** — updated in `probe.md`, `architect.md`, `prioritize.md`. Gate no longer resolves via "wait for SME" (which becomes a terminal parking spot in a Claude-authored codebase with no SME in the feedback loop). Resolution contract is now: Claude authors a decision memo with ≥3 literature citations (species profiles, methods-index, peer-reviewed research/) and proceeds; the flag terminates with the memo in `decisions.log`. Escalates to user ONLY when citations cannot be found after genuine search. `prioritize.md` autopilot-safety criteria updated accordingly — SF with citable grounding is autopilot-safe; SF without is `needs-user`.
- **Motivation:** the pcc backlog audit (`docs/_internal/research/distillations/backlog-audit-2026-04-24.md`) found that SCIENCE-FLAG was behaving as indefinite defer, not as decision-forcing gate; and that mechanical TODO items (data gaps, ETL, contract-triangle cleanup) had no lattice path because they weren't research streams but also needed safety gates applied. Both were blocking unattended advancement.
- **Example consumer:** pcc `scripts/tag-todo-autopilot.py` — one-shot classifier that tags every TODO.md section with `autopilot: ready|waiting-data|deferred-dg|needs-user` using content heuristics; `ready` items also get `score: N` (0-27 via pillars × data × impl). Idempotent (won't overwrite existing tags). Lives in project, not framework — the framework just defines the contract.
- **Framework docs:** no new Lattice doc created; the per-project `autopilot-flow.md` (in scaffold candidate list) documents the flow. Consider adding a scaffold template if a second project adopts this.

### ~~ENH-06: Spec value audit (anti-featuritis gate)~~ 2c82f43
- Done. `SPEC-VALUE-AUDIT.md` checklist wired as CLAUDE.md rule 17.
- `/lattice:architect` Mode 2 Gate: new Step 1.5 runs the audit BEFORE the architect-reviewer agent. Non-PASS verdicts (SCOPE REDUCTION REQUIRED / EVIDENCE GAP) short-circuit deep review and produce a scope-challenge doc.
- `/lattice:peer-review` synthesis tier: uses audit questions 1, 2, 4 for domain-expert challenges.
- Scaffold template so new Lattice projects inherit the checklist.
- Originating precedent: pcc `study-design-override-surfaces` spec (9 of 14 features flagged featuritis).

### ENH-01: Vector search for corpus load (Zabaca/lattice integration)
- **Skill affected:** `/lattice:distill` Step 0 Layer 3, `/lattice:research` Step 0
- **What:** Replace title-scanning of INDEX.md with semantic vector search for selecting which research files to deep-read. Use [Zabaca/lattice](https://github.com/Zabaca/lattice) (DuckDB + Voyage AI embeddings) as the search backend.
- **Integration point:** Distill Step 0 Layer 3 ("Deep Read — purpose-driven selection") and research corpus load. Call `lattice search "{question}"` to rank files by semantic relevance instead of keyword/title matching.
- **Why:** Current title-based selection is fragile — misses semantically related files with different terminology (e.g., "organ weight normalization" vs "body weight mediation"). Vector search would improve recall.
- **Dependencies:** Voyage AI API key, `@zabaca/lattice` npm package, sync step after research file creation/update.
- **When:** Revisit when research corpus exceeds ~200 files, or when multiple contributors work in the corpus. Current corpus size (~100 files, single maintainer) makes the marginal value small.
- **Priority:** P3 (low — not a current bottleneck)
