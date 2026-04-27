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

---

## Literature-Sourced Backlog

> Items derived from cross-checking `docs/literature/` source notes (Ahrens, Karpathy, GSD, archon, plankton, superpowers) against current lattice state. Scope is dev-framework / methodology / agent-system axes.
>
> **Value axes** each item must defend itself against:
> - **science** — engine outputs match domain truth; catches scientific bugs faster
> - **code** — non-scientific code (UI, plumbing, frontend) doesn't regress
> - **autopilot** — long autonomous runs don't degrade silently
> - **knowledge** — wiki layer (knowledge/, architecture/) stays honest
>
> Tier 1 = pulls 2+ axes. Tier 2 = strong single axis. Tier 3 = autopilot leverage. Tier 4 = situational. Items rejected on value grounds are listed at the bottom for audit trail.
>
> **Known gap:** the design-system axis (sendex's `.claude/rules/design-decisions.md`, audit-checklist, ux-audit pipeline) has no literature-notes corpus yet. Tracked as `LIT-DS-GAP` below.

### LIT-01: Expand `/lattice:lint-knowledge` to content-drift checks
- **Tier:** 1 — science + autopilot
- **What:** Today's skill catches ID drift (uniqueness, citation, orphan). Extend with: stale `file:line` citations (knowledge says `hcd.py:327` but the function moved); contradiction detection across knowledge files (two facts disagree, generalizing the HCD-FACT-008 ↔ FACT-010 case); provenance-gap (claim with no `derives_from` source); future-reader test (no `as discussed above` / `we decided last week`).
- **Where:** `scripts/lint-knowledge.py` + `commands/lattice/lint-knowledge.md` (extension, not new skill)
- **Source:** karpathy-llm-wiki (lint operation), ahrens-smart-notes (future-reader, atomicity)
- **Note:** The shipped 2026-04-26 `/lattice:lint-knowledge` is the starter; this is the version the typed-knowledge-graph-spec actually anticipates.

### LIT-02: Generalize typed-knowledge-graph beyond HCD
- **Tier:** 2 — science + code (conditional on registry discovery)
- **What:** Apply the typed-knowledge-graph-spec pattern to other registries that have multi-dim scope + downstream consumers. Candidate registries: syndrome rules (XS01-XS10), FCT bands (BFIELD-21-style enum drift case), regulatory thresholds. Pre-work: 30-min discovery pass to confirm 2-3 registries justify the schema overhead — could end up "no, contract-triangles already covers this".
- **Where:** `docs/_internal/knowledge/<domain>-graph.md` per registry, schema authority `docs/_internal/architecture/typed-knowledge-graph-spec.md`
- **Source:** ahrens-smart-notes (atomicity for graph nodes), karpathy-llm-wiki (typed edges)

### LIT-03: `/lattice:autopilot --discover` mode
- **Tier:** 3 — autopilot leverage
- **What:** Wire `discovery-scan.py` output into autopilot. Advance safe-for-autopilot gaps automatically; escalate ambiguous to ESCALATION.md. Force-multiplier on gap detection.
- **Where:** `commands/lattice/autopilot.md` (new flag)
- **Source:** karpathy-llm-wiki (sparse-area / lint operation as autopilot signal)

### LIT-04: `/lattice:autopilot --consolidate` mode
- **Tier:** 3 — orchestrator signal
- **What:** Detect dense knowledge clusters (Ahrens emergence) → suggest `/lattice:synthesize` to extract a topic. Currently surfaced manually.
- **Where:** `commands/lattice/autopilot.md` (new flag), depends on LIT-02 typed-edge metadata
- **Source:** ahrens-smart-notes (bottom-up emergence)

### LIT-05: Distill query → wiki promotion
- **Tier:** 3 — knowledge capture
- **What:** When `/lattice:distill` surfaces a novel cross-subsystem connection, prompt to extract a knowledge entry. Currently distill outputs are session-bound and evaporate.
- **Where:** `commands/lattice/distill.md`
- **Source:** karpathy-llm-wiki (query → wiki promotion)

### LIT-06: TDD-for-non-scientific-code decision memo
- **Tier:** 2 — code quality
- **What:** Output is a **decision memo, not code**. Question: should non-scientific code (UI, plumbing, frontend) mandate TDD or test-first? Validation ratchet doesn't catch UI/plumbing regressions (cross-surface NOAEL display inconsistency, missing formatter exports, panel layout bugs are recent examples). Memo decides scope and adds a rule, or chooses not to.
- **Where:** `.lattice/decisions.log` + possibly new rule in `CLAUDE.md` / scaffold
- **Source:** obra-superpowers (TDD as universal practice — open question)
- **Cross-ref:** bug-protocol agent

### LIT-07: Nyquist-auditor analog
- **Tier:** 1 — science + bug-protocol cross-ref
- **What:** After a bug fix, ask whether the validation suite density would have caught the bug pre-emptively. "Are tests dense enough on this code path that we'd have caught the failure structurally, not by accident?" Pairs with `/ops:bug-stress` (stress-test the pattern across downstream subsystems) or extends it.
- **Where:** Either new `commands/lattice/audit-coverage.md` skill OR extension of `ops:bug-stress` — coordinate with bug-protocol agent on placement
- **Source:** gsd (`gsd-nyquist-auditor` — sampling-adequacy of evals)
- **Cross-ref:** bug-protocol agent (this item is the natural complement to "fix bugs better")

### LIT-08: `/lattice:extract-learnings` skill
- **Tier:** 2 — knowledge integrity
- **What:** Formalize CLAUDE.md rule 7 (doc lifecycle: spec → archive + extract durable knowledge) as an enforceable skill rather than convention. Today's commits show patchy enforcement — durable-knowledge extraction got skipped in the conflated commits (1370c103, 521f1d16) because the commit message didn't trigger the discipline.
- **Where:** new `commands/lattice/extract-learnings.md`, hooked into `/lattice:review` cycle-close
- **Source:** gsd (`gsd-extract-learnings`)

### LIT-09: Context-rot telemetry (ENH-02 phase 2)
- **Tier:** 1 — autopilot + orchestrator confidence
- **What:** Token-by-context-window monitor; warn when context utilization crosses thresholds mid-cycle. Today's conflated commits (3 in one session) suggest context-rot may be a contributing failure mode — autopilot decisions degrade silently when attention is dilute. Promote ENH-02 phase-2 deferred item with concrete scope: per-cycle token telemetry + threshold warnings + autopilot pause-on-rot policy.
- **Where:** `executor/src/budget.ts` extension, `commands/lattice/autopilot.md` rot-aware pause logic
- **Source:** gsd (`gsd-context-monitor.js`)
- **Note:** User flagged as nice-to-have at one point; re-elevated after value-axis broadening because the failure mode it catches (autopilot conflations) is real.

### LIT-10: Iteration-count caps in `budget.yaml`
- **Tier:** 3 — autopilot safety
- **What:** Add `max_iterations` alongside USD caps in `scaffold/.lattice/budget.yaml`. USD caps catch resource overrun eventually; iteration caps catch infinite-loop bugs faster (and at lower cost).
- **Where:** `scaffold/.lattice/budget.yaml` schema + `executor/src/budget.ts`
- **Source:** archon (`max_iterations` per-loop caps)

### LIT-11: GSD `seeds/` pattern (situational)
- **Tier:** 4 — process clarity, conditional on felt pain
- **What:** Milestone-keyed deferred-idea bucket. Reconciles CLAUDE.md rule 13 ("no unprompted deferrals") with the reality that some ideas genuinely have to wait for a milestone. Today these go to TODO.md `needs-user`, ESCALATION.md, or get lost in conversation.
- **Where:** `docs/_internal/seeds/` (new directory if adopted), referenced from TODO.md
- **Source:** gsd (`commands/gsd/plant-seed.md`)
- **Skip if:** existing TODO/ROADMAP/ESCALATION mechanisms cover this without the new directory.

### LIT-12: Slack integration (parked)
- **Tier:** parked — operational, deferred-but-tracked
- **What:** Inbound channel for user instructions while away from terminal. Voice-of-user signal that supplements in-session conversation.
- **Pre-work needed before un-defer:** scope spec (which channels, auth model, command grammar, security boundary, MCP vs custom integration); pick activation trigger (e.g., when the user hits a recurring "had to wait until I got home to direct Claude" pain).
- **Where:** TBD (likely an MCP server or `.claude/settings.json` hook integration)
- **Source:** prior conversation (deferred without scope)

### LIT-DS-GAP: Design-system axis literature pass (gap)
- **Tier:** placeholder
- **What:** Lattice has design-system tooling (`commands/lattice/ux-audit-walk/validate/file`, `ux-designer`, `design.md`, sendex's `.claude/rules/design-decisions.md`, audit-checklist) but no formal "literature notes" for design-system sources (Material guidelines, Tailwind philosophy, Datagrok plugin design, design-system books, etc.). The 11 items above came from dev-framework literature; design-system items would come from a separate corpus pass.
- **Where:** new entries in `docs/literature/` once design-system sources are picked
- **When:** TBD — when sendex's design-system specifics solidify enough to know which literature is relevant.
- **Note:** Placeholder so the gap is visible. Not a blocker on the 11 items above.

#### Considered and rejected (audit trail)

- **Translate-don't-copy enforcement at `/lattice:synthesize`** — convention is followed by Claude already; no observed failure mode. Adding enforcement is solving a non-problem.
- **`/lattice:milestone-retrospective` skill** — cycle-close + `/ops:sweep` cover the same ground at finer granularity. No named milestone-level failure pattern justifies the new skill.
