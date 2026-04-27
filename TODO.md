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
>
> **Adjacency to lattice-framework-redesign-spec (2026-04-26):** the parallel framework-redesign work at `pcc/docs/_internal/incoming/lattice-framework-redesign-spec.md` (and its diagnosis at `pcc/docs/_internal/research/lattice-framework-defects-and-redesign.md`) covers 8 features (F1-F8) derived from analyzing actual project bug history. Several LIT items are subsumed or adjacent: LIT-02 → SUBSUMED by F1; LIT-06 → narrowed (F2 covers analytical code; LIT-06 retained for non-analytical scope); LIT-07 → distinct from F6 (Nyquist density vs pattern propagation). LIT items orthogonal to the redesign spec (LIT-01, 03, 04, 05, 09, 10, 11, 12, DS-GAP) remain as-is.

### LIT-01: Expand `/lattice:lint-knowledge` to content-drift checks
- **Tier:** 1 — science + autopilot
- **What:** Today's skill catches ID drift (uniqueness, citation, orphan). Extend with: stale `file:line` citations (knowledge says `hcd.py:327` but the function moved); contradiction detection across knowledge files (two facts disagree, generalizing the HCD-FACT-008 ↔ FACT-010 case); provenance-gap (claim with no `derives_from` source); future-reader test (no `as discussed above` / `we decided last week`).
- **Where:** `scripts/lint-knowledge.py` + `commands/lattice/lint-knowledge.md` (extension, not new skill)
- **Source:** karpathy-llm-wiki (lint operation), ahrens-smart-notes (future-reader, atomicity)
- **Note:** The shipped 2026-04-26 `/lattice:lint-knowledge` is the starter; this is the version the typed-knowledge-graph-spec actually anticipates.

### ~~LIT-02: Generalize typed-knowledge-graph beyond HCD~~ — SUBSUMED 2026-04-26
- **Status:** Subsumed by F1 (Domain-truth oracle) in `pcc/docs/_internal/incoming/lattice-framework-redesign-spec.md`. F1 is the broader, deeper version: extends knowledge-graph schema for regulatory expectations, gate criteria, aggregation policy, direction constraints, plus a `query-knowledge.py` interface. Implementing agent owns this work.
- **Original scope (preserved for audit):** Apply typed-knowledge-graph pattern to syndrome rules / FCT bands / regulatory thresholds. Pre-work would have been a 30-min discovery pass; the spec's F1 already settled the discovery — answer is "yes, multiple registries justify it."
- **Source:** ahrens-smart-notes, karpathy-llm-wiki

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

### LIT-06: TDD-for-non-scientific-code decision memo (narrowed 2026-04-26)
- **Tier:** 2 — code quality
- **Status:** Partially subsumed by F2 (Property-based testing) in `pcc/docs/_internal/incoming/lattice-framework-redesign-spec.md`. F2 covers **analytical functions only**. TDD scope for UI / plumbing / frontend / non-analytical code remains open. This LIT item narrows to that residual scope.
- **What (residual):** Decision memo deciding whether non-analytical code (React components, utility functions, plumbing modules) should mandate test-first. The argument for: cross-surface NOAEL display inconsistency, missing formatter exports, panel layout bugs were not analytical defects but still scientific-display defects. The argument against: dilutes effort vs. F2's deeper coverage on the analytical core. Memo lands the call.
- **Where:** `.lattice/decisions.log` + possibly new rule in `CLAUDE.md` / scaffold
- **Source:** obra-superpowers (TDD as universal practice — open question, partially answered for analytical code by F2)

### LIT-07: Nyquist-auditor analog (distinct from F6, retained 2026-04-26)
- **Tier:** 1 — science + bug-protocol cross-ref
- **Status:** Adjacent to F6 (Bug-pattern propagation) in `pcc/docs/_internal/incoming/lattice-framework-redesign-spec.md` but **distinct**. F6 enforces propagation of a known fix across same-pattern code paths. Nyquist asks the upstream question: *"are tests dense enough on this code path that we'd catch the failure structurally, not by accident?"* — i.e., is validation-suite density sufficient on this surface, regardless of whether a known pattern exists. Both questions matter. LIT-07 retained as a separate item.
- **What:** After a bug fix, run a coverage-density audit on the affected analytical surface. Report whether existing tests/properties would have caught the bug class pre-emptively, and if not, what's missing.
- **Where:** Either new `commands/lattice/audit-coverage.md` skill OR extension of `ops:bug-stress` — coordinate with the redesign-spec implementing agent on placement (F2 property catalog is the natural intersection point).
- **Source:** gsd (`gsd-nyquist-auditor` — sampling-adequacy of evals)
- **Cross-ref:** lattice-framework-redesign-spec F2 + F6 (distinct but neighborhood)

### LIT-08: `/lattice:extract-learnings` skill
- **Tier:** 2 — knowledge integrity
- **What:** Formalize CLAUDE.md rule 7 (doc lifecycle: spec → archive + extract durable knowledge) as an enforceable skill rather than convention. Today's commits show patchy enforcement — durable-knowledge extraction got skipped in the conflated commits (1370c103, 521f1d16) because the commit message didn't trigger the discipline.
- **Where:** new `commands/lattice/extract-learnings.md`, hooked into `/lattice:review` cycle-close
- **Source:** gsd (`gsd-extract-learnings`)

### ~~LIT-09: Context-rot telemetry~~ — RESOLVED 2026-04-26
- **Tier:** 1 — autopilot + orchestrator confidence
- **Status:** RESOLVED 2026-04-26 (this commit). Implementation:
  - `ContextConfig` added to `BudgetConfig` (window_size, warn_threshold, block_threshold).
  - `checkContextUtilization()` in `executor/src/budget.ts` — per-call alerts when input-tokens / window_size crosses thresholds. `BudgetAlert` extended with `tokensSpent` / `tokenLimit` / `utilization` fields and `'context'` scope.
  - `appendContextTelemetry()` writes JSONL rows to `.lattice/context-telemetry.jsonl` after every skill-node call (always, even when no config — level=`ok`).
  - `engine.ts` wires the check into the existing alert flow; block-level rot stops the workflow with reason `CONTEXT_ROT` in `decisions.log`.
  - `lattice context [--last N]` CLI command shows recent telemetry + peak utilization summary.
  - `scaffold/.lattice/budget.yaml` adds commented `context:` block with window-size guidance for Sonnet (200K) and Opus 4.7 (1M).
- **Smoke-tested:** CLI command runs cleanly (prints "no telemetry yet" when log absent); build passes.

### ~~LIT-10: Iteration-count caps~~ — RESOLVED 2026-04-26 (autopilot scope)
- **Tier:** 3 — autopilot safety
- **Status:** RESOLVED 2026-04-26 (this commit) for the autopilot loop. Implementation:
  - `AutopilotOptions.maxLoops` added (default 50). Caps the outer `while (madeProgress)` loop in `runAutopilot`. When the cap is hit, autopilot prints an explicit force-stop message naming the failure mode (auto-resolve / phase routing oscillating without reaching steady state) and exits.
  - `lattice autopilot --max-loops N` CLI flag wired through.
- **Deferred (separate scope):** workflow-level `max_iterations` per archon — would cap node-level iteration counts inside a single workflow run (e.g., gates routing back to retry nodes). Not in current failure-mode evidence; revisit if a workflow infinite-loops.
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

### ~~LIT-DS-GAP: Design-system axis literature pass~~ — RESOLVED 2026-04-26
- **Status:** Resolved by four literature notes ([`frost-atomic-design.md`](docs/literature/frost-atomic-design.md), [`ibm-carbon-design-system.md`](docs/literature/ibm-carbon-design-system.md), [`appleton-pattern-languages.md`](docs/literature/appleton-pattern-languages.md), [`datagrok-platform-docs.md`](docs/literature/datagrok-platform-docs.md)) plus the **Design-system backlog** section below. The 4 sources cover: design-system primer (Frost), large-scale shipped instance (Carbon), opinionated tools-for-thought framing (Appleton), and the actual plugin-migration target (Datagrok). The README scope line was extended to formally include design-system reading.

#### Considered and rejected (audit trail)

- **Translate-don't-copy enforcement at `/lattice:synthesize`** — convention is followed by Claude already; no observed failure mode. Adding enforcement is solving a non-problem.
- **`/lattice:milestone-retrospective` skill** — cycle-close + `/ops:sweep` cover the same ground at finer granularity. No named milestone-level failure pattern justifies the new skill.

---

## Design-system Backlog

> Items derived from cross-checking `docs/literature/` design-system source notes (Frost, Carbon, Appleton, Datagrok) against current sendex/lattice design-system state. Scope is design-system / UI-quality / plugin-migration axes.
>
> **Value axes** (the dev-framework axes, adapted for the design surface) each item must defend itself against:
> - **design-consistency** (analog of *science*) — UI surfaces match the documented design system; visual claims are testable; bad patterns get retracted not silently kept
> - **analytical-fitness** (analog of *code*) — UI helps the toxicologist reach correct conclusions; doesn't mislead through visual choices, accessibility gaps, or migration debt
> - **autopilot** — design-related autonomous changes (UX-audit walks, design-pass implementations) don't introduce regressions; lint signals exist for design drift
> - **knowledge** — design-system docs (audit-checklist, design-decisions tables, view specs, viewer-migration map) stay authoritative and grep-able
>
> Tier 1 = pulls 2+ axes. Tier 2 = strong single axis. Tier 3 = autopilot leverage. Tier 4 = situational. Items rejected on value grounds are listed at the bottom for audit trail.

### LIT-DS-01: Accessibility-as-gate in audit-checklist
- **Tier:** 1 — design-consistency + analytical-fitness (largest unaddressed Carbon principle in sendex)
- **What:** Add an `A11Y` section to `docs/_internal/design-system/audit-checklist.md` with WCAG 2.1 AA rules: keyboard navigation completeness, focus-visible on every interactive element, ARIA roles on charts (or text-table fallback), color-contrast ratios on charts, screen-reader label coverage on icon buttons. Today's 79 rules are entirely visual; this is a real coverage gap, not aesthetic. Start with a minimum set (~10 rules) and grow from observed failures.
- **Where:** `docs/_internal/design-system/audit-checklist.md` (new `A11Y` section), reference from `commands/lattice/ux-designer.md` audit protocol
- **Source:** ibm-carbon-design-system (accessibility-as-gate is a first-class Carbon principle)
- **Defer trigger:** if audit-checklist visual rules are still drifting (refute rate >15% at validate stage), close the visual gap first.

### LIT-DS-02: Datagrok viewer-migration map
- **Tier:** 1 — design-consistency + knowledge (preserves the plugin-migration path per `MEMORY.md` `project_datagrok_target.md`)
- **What:** A single table in `docs/_internal/design-system/datagrok-migration-map.md` mapping each sendex chart component to its Datagrok-viewer migration target (or "custom viewer" if no platform equivalent). Includes interaction parity notes (e.g., violet-tint right-click affordance has no Datagrok analog). Produced by the `dg-developer` skill.
- **Where:** new `docs/_internal/design-system/datagrok-migration-map.md`; `dg-developer` skill produces and refreshes it
- **Source:** datagrok-platform-docs (the strategic implication of plugin-migration target)
- **Why now:** design changes that increase migration cost are cheap to revert before the migration milestone, expensive after. The map turns implicit migration debt into a visible quantity.

### LIT-DS-03: Canonical fixture-page baselines
- **Tier:** 1 — autopilot + knowledge (lint signal for design drift on the most-walked workflows)
- **What:** A small set of "this is the NOAEL workflow page on PointCross" reference renders, captured by Playwright at known viewport sizes (1920x1080, 2560x1440), stored next to the workflow audit. Drift between the catalogue and these baselines becomes a lint signal — autopilot can flag "the canonical NOAEL page changed visually since the last baseline" for human review.
- **Where:** extend `docs/_internal/audits/workflow-audits/{persona}-{workflow}/baselines/` (or similar); regen step in cycle-close
- **Source:** frost-atomic-design (pages stress the system; pages are the canonical reference where library meets reality)
- **Cross-ref:** integrates with the existing `commands/lattice/ux-audit-walk.md` Playwright pipeline.

### LIT-DS-04: Positive-form component catalogue
- **Tier:** 2 — knowledge (today's catalogue is in negation-form via Rule 6 "use this / not this"; positive form makes the inventory grep-able)
- **What:** A `docs/_internal/design-system/component-catalogue.md` listing every reusable component with: one-line role, dimensions / viewport budget, props summary, reference screenshot, linked audit-checklist rule IDs, "do/don't" example pair. The Carbon-style component bundle, scaled down for sendex's component count (~30).
- **Where:** new `docs/_internal/design-system/component-catalogue.md`
- **Source:** frost-atomic-design (library-is-the-deliverable in positive form), ibm-carbon-design-system (per-component bundle)
- **Note:** overlaps with Frost's "tier vocabulary" item (LIT-DS-08) and Carbon's "per-component pages" — treat as a single deliverable with two motivations.

### LIT-DS-05: "Forces" + "Examples" columns on critical-tier audit-checklist rules
- **Tier:** 2 — knowledge (rules become pattern-language entries with full Alexander schema)
- **What:** For the Critical-severity rules in audit-checklist (C-01..C-05, the casing rules, the dose-label tier rules — not all 79), add a **Forces** column ("why does this tension exist?") and an **Examples** column ("real PR or commit where this rule was violated, and the fix"). Today's rule rows have name + test + use/don't-use; the missing pieces (forces, examples) are what let an agent know when the rule binds and when it doesn't.
- **Where:** `docs/_internal/design-system/audit-checklist.md` Critical-severity rows
- **Source:** appleton-pattern-languages (Alexander pattern schema: name + problem + forces + solution + examples + related)
- **Defer trigger:** only land for rules that have been refuted ≥2 times at the validate stage — the refute is the empirical signal that "forces" needs to be explicit.

### LIT-DS-06: Pattern-language graph renderer
- **Tier:** 2 — knowledge (orphan-rule and cycle detection across the design-decisions / audit-checklist cross-refs)
- **What:** A small script that parses `.claude/rules/design-decisions.md` and `docs/_internal/design-system/audit-checklist.md`, extracts every "see X-NN" reference, and emits a DOT graph or markdown edge-table. Surfaces orphan rules (no inbound edges, no outbound edges) and rule cycles. Run as part of cycle-close or `/lattice:lint-knowledge`.
- **Where:** `scripts/render-design-pattern-graph.py` (or similar); regen step in cycle-close or extension of `/lattice:lint-knowledge`
- **Source:** appleton-pattern-languages (a pattern *language* is graph-shaped; rendering exposes structure)
- **Defer trigger:** wait until a real failure mode (an orphan rule that should have been linked, a contradictory pair) actually surfaces — premature otherwise.

### LIT-DS-07: `migration-cost` column on audit-checklist
- **Tier:** 3 — autopilot + knowledge (autopilot can pre-screen design changes against migration cost)
- **What:** Each audit-checklist rule that references a sendex-specific affordance (violet column tint, `OverridePill`, custom rail split, etc.) gets a `migration-cost: low/med/high` tag. Rules with `high` migration cost get extra scrutiny when the rule is being added or strengthened — autopilot can warn "this rule increases coupling to a non-Datagrok-portable affordance." Mostly mechanical to add once LIT-DS-02 (viewer-migration map) is in place.
- **Where:** `docs/_internal/design-system/audit-checklist.md` (new column); autopilot reads it during design-rule changes
- **Source:** datagrok-platform-docs (preserve migration path per `project_datagrok_target.md`)
- **Depends on:** LIT-DS-02 — the migration-cost classifier needs the migration map as ground truth.

### LIT-DS-08: Tier vocabulary (atom / molecule / organism / template) in design-decisions.md
- **Tier:** 4 — situational; conditional on multi-frontend reuse becoming real
- **What:** Add a one-row table at the top of `.claude/rules/design-decisions.md` mapping the four sendex tiers (token, component, view-section, view) to Frost's atom/molecule/organism/template names. Cost is a few lines of doc; benefit lands when (and only when) a second frontend project starts sharing components with sendex.
- **Where:** `.claude/rules/design-decisions.md` header
- **Source:** frost-atomic-design (shared lexicon at the molecule / organism level)
- **Skip if:** sendex remains a single-frontend project. Re-evaluate at Datagrok plugin migration kickoff.

### LIT-DS-09: Semantic-role token aliases
- **Tier:** 4 — situational; conditional on Datagrok-migration kickoff or a second theme requirement
- **What:** Add a parallel role-based token layer (`--surface-1` / `--surface-2` / `--text-primary` / `--text-secondary`) alongside the value-based tokens (`--background`, `--muted`). Keeps backwards compat; future theme swaps re-bind the role-based layer rather than touching components.
- **Where:** `frontend/src/index.css`, `frontend/src/lib/design-tokens.ts`
- **Source:** ibm-carbon-design-system (role-based token naming is what makes Carbon's themes swap cleanly)
- **Skip if:** no theme swap is on the roadmap. Speculative addition violates the spirit of CLAUDE.md rule 13.

### LIT-DS-11: Built-not-mounted inventory script (maintained, not snapshot)
- **Tier:** 3 — autopilot leverage; closes a documented snapshot-drift problem on a load-bearing inventory
- **What:** A `scripts/find-unmounted-components.py` that greps `frontend/src/` for `*.tsx` component definitions, counts inbound imports per component, and emits two outputs: (a) the list of components with zero non-self imports (the "built-not-mounted" inventory), (b) a refresh of `.claude/rules/ux-audit-validate.md` Section 4 with current evidence. Run as part of cycle-close or `/lattice:lint-knowledge`. Rationale: today's Section 4 inventory is a 2026-04-26 snapshot that has already drifted (RecoveryPane was retracted by user, but the inventory still cites it). Block 1.3 of the design preamble (built-not-mounted check, in `commands/lattice/design.md`) cites Section 4 — its honesty depends on the inventory being maintained. A script that regenerates it makes the citation reliable.
- **Where:** new `scripts/find-unmounted-components.py`; integration into cycle-close or `/lattice:lint-knowledge`; auto-update `.claude/rules/ux-audit-validate.md` Section 4 (or split Section 4 into two parts: a "human-curated rationale" prose section + a "machine-maintained component list" table that gets regenerated).
- **Source:** datagrok-platform-docs (the wiring vs building cost asymmetry), ahrens-smart-notes (atomicity for graph-participating facts), CORRIGENDA.md "Built-not-mounted as a new finding class" observation.
- **Dependency note:** the script can't distinguish "built-but-never-mounted" from "deleted-but-import-stub-remains" without git history check. Output should flag both classes separately so the human can decide whether to wire vs delete.

### LIT-DS-10: Lineage citation in datagrok-app-design-patterns.md
- **Tier:** 4 — situational; one-paragraph cosmetic edit, low-cost
- **What:** A one-paragraph "Lineage" section in `docs/_internal/design-system/datagrok-app-design-patterns.md` naming Alexander → Tufte → Appleton, with a one-sentence statement of why this lineage matters (tools, not media; patterns, not rules; analytical value over engagement). Cost: a paragraph. Benefit: future agents have a citation when justifying rejection of consumer-app conventions.
- **Where:** `docs/_internal/design-system/datagrok-app-design-patterns.md`
- **Source:** appleton-pattern-languages (lineage citation makes rejections of consumer-app conventions defensible by reference rather than re-derivation)
- **Defer trigger:** only land when an agent has actually re-derived a rejected consumer-app convention twice and lacked a citation to point to. Cosmetic until then.

#### Considered and rejected (design-system audit trail)

- **Storybook / interactive component preview surface.** Carbon and Frost both implicitly recommend this. Sendex has the audit-checklist + design-decisions tables instead. Storybook is high-overhead for a single-frontend project where every component is exercised by real views every dev session. Re-evaluate only at multi-plugin reuse.
- **Multi-framework component implementations (React + Web Components + Vue + Angular per Carbon).** Sendex is React-only; even at Datagrok-plugin migration time, the platform JS API is the integration surface, not multi-framework component code. Designing for a consumer that doesn't exist.
- **Sendex-internal React component library aimed at external plugin reuse.** Datagrok plugins are not React component consumers. Same "consumer that doesn't exist" rejection.
- **Maximalist pattern-language graph (every rule references every related rule).** High edge-density renders the graph unreadable. Sendex's current sparse cross-referencing (1–2 outbound edges per rule) is the right density.
- **Pre-emptive migration of any sendex view to Datagrok viewers before the migration milestone.** Speculative platform-port slows current analytical work without delivering value. Forward-port is as bad as backward-defer per CLAUDE.md rule 13's spirit.
- **Treating Datagrok platform conventions as binding design rules today.** The active design system is sendex's own (audit-checklist + design-decisions). Datagrok conventions become binding *at* migration; importing them now would mean enforcing rules whose semantics aren't yet operational.
- **Figma-as-source-of-truth.** Sendex's authoritative design representation is markdown (audit-checklist + design-decisions tables). Adding Figma creates a synchronisation problem (two editable sources, drift inevitable). Carbon's Figma libraries solve a problem sendex doesn't have (designers who don't read code).
- **Multi-theme system (light / dark / contrast / branded) speculatively.** Sendex is single-theme by deliberate choice — analytical viewing environments are well-lit and the saturated-color budget assumes a light substrate. Reconsider only at Datagrok migration when host-platform theming becomes a real constraint.
