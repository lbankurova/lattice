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

### ~~LIT-01: Expand `/lattice:lint-knowledge` to content-drift checks~~ — RESOLVED 2026-04-27 (partial; cross-registry deferred with explicit rationale)
- **Tier:** 1 — science + autopilot
- **Status:** Resolved 2026-04-27 for the four mechanically-tractable subsets. Implementation:
  - `pcc/scripts/lint-knowledge.py` extended with two content-drift checks scanning `docs/_internal/knowledge/*.md`:
    - `stale-file-line` (error + symbol-drift warning) — `path/file.ext:NN[-MM][, ...]` citations are resolved against the project tree; missing files / out-of-range lines fail; if the citation includes a backticked symbol-hint (e.g., `` `pipeline.py:865-885` (`_classify_findings_no_control_path`) ``), the symbol must appear within ±25 lines of the cited range. Filtered to project-rooted paths (`backend/`, `frontend/`, `shared/`, `docs/`, `scripts/`, `tests/`, `send/`, `.lattice/`) — shorthand row-relative citations are silently skipped.
    - `future-reader` (warning) — five regex patterns flag relative-tense markers: "as discussed above", "in the previous section", "we recently/just decided", "today/yesterday {decided,landed,...}", "in the meeting today/yesterday/this/last week".
  - `pcc/scripts/audit-knowledge-graph.py` extended with two new typed-graph checks:
    - `provenance-gap` (error) — `confidence: regulated_standard` and `confidence: internal_validated` facts must carry non-empty `derives_from`. Closes the loop the existing `cited_unverified_backlog` check left open; `heuristic` and `extrapolation` exempt by definition.
    - `within-graph-contradiction` (warning) — bucket facts by `(species, sex, endpoints, fact_kind)` and flag pairs whose `value` blocks disagree without a `contradicts` edge declared. Skips non-discriminating scopes (`species: [any]` AND `endpoints: [any]`) where the value block IS the discriminator (catches `disable_marker` false positives).
  - `lattice/commands/lattice/lint-knowledge.md` Step 1 documents the new content-drift checks + `--no-content-drift` flag; Step 2 lists `audit-knowledge-graph.py` as enforcing 8 invariants (was 6) including the two LIT-01 additions.
- **Live output (this commit):** content-drift surfaces 1 real warning (`_classify_findings_no_control_path` cited at `findings_pipeline.py:865-885` no longer exists at that location); typed-graph audit fires 0 provenance-gap (corpus is well-maintained) + 0 within-graph-contradiction defects.
- **Deferred with empirical rationale (revised 2026-04-27 after decision-audit pushback):** the original LIT-01 also called for *cross-registry* contradiction detection (numeric-claim conflict across `methods-index.md` / `species-profiles.md` / `vehicle-profiles.md`) and an *atomic-fact force-migration* rule. The first scoping framed this as "needs a prose parser / NLP" — that framing was sloppy and was correctly flagged by the decision-auditor as effort-biased. Re-investigated empirically: the un-typed registries' tables are **structured by ID + descriptive purpose**, not by numeric thresholds. `methods-index.md` columns are `| ID | Name | Purpose |` (one-line method descriptions); `species-profiles.md` is mostly an audit/inventory document with thresholds buried in numbered prose lists ("Magnitude floors (Cohen's d): Universal 0.5/1.0/1.5/2.0"); `vehicle-profiles.md` similarly. **A cross-registry numeric-conflict check would have no comparable tuples to extract from current content** — the registries don't host the kind of structured numeric data the check needs. The merit-driven path remains a CLAUDE.md rule (rule 22: atomic facts MUST live in the typed graph), shipped this commit. The check itself is unbuildable until the registries change form. Re-evaluate when one of: (a) species-profiles.md adopts a structured-thresholds table, (b) the typed-graph migration completes and any residual numeric content in un-typed registries warrants drift-checking against typed-graph entries.

### ~~LIT-01-FOLLOW-1: Atomic-fact-must-be-typed CLAUDE.md rule~~ — RESOLVED 2026-04-27 (pcc-side)
- **Tier:** 2 — knowledge integrity (force-migration of contradictable claims into the typed graph)
- **Status:** Resolved 2026-04-27 in pcc. Implementation:
  - `pcc/CLAUDE.md` rule 22 added: atomic, contradictable domain facts (numeric thresholds, species baselines, vehicle/route constraints, regulatory cutoffs, mechanistic disable-markers) MUST live in `knowledge-graph.md` as typed YAML facts. Un-typed registries cite by fact ID rather than restating values.
- **Open at framework scope:** rule additions to `lattice/scaffold/CLAUDE.md` (so future projects inherit) and `lattice/commands/lattice/architect.md` / `peer-review.md` "atomic-fact placement" question are still pending. Filed below as `LIT-01-FOLLOW-1b`.

### LIT-01-FOLLOW-1b: Propagate atomic-fact rule to lattice scaffold + reviewers
- **Tier:** 3 — framework propagation (atomic-fact rule should ship to new projects, not just pcc)
- **What:** Add an equivalent of pcc CLAUDE.md rule 22 to `lattice/scaffold/CLAUDE.md` so new projects inherit; extend `lattice/commands/lattice/architect.md` Mode 2 Gate and `lattice/commands/lattice/peer-review.md` synthesis-tier with an "atomic-fact placement" question (does this spec restate a numeric threshold that should be in the typed graph?).
- **Why deferred from FOLLOW-1:** scaffold + reviewer-skill changes are framework-wide; the pcc rule lands first as the working exemplar, then ports cleanly. Fast follow.
- **Where:** `lattice/scaffold/CLAUDE.md`, `lattice/commands/lattice/architect.md`, `lattice/commands/lattice/peer-review.md`.

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

### ~~LIT-07: Nyquist-auditor analog (distinct from F6, retained 2026-04-26)~~ — RESOLVED 2026-04-27
- **Tier:** 1 — science + bug-protocol cross-ref
- **Status:** Resolved 2026-04-27. Implementation:
  - `pcc/scripts/coverage-density-report.py` — given a changed module path, extracts public functions / classes (Python `def`/`class`, TypeScript `export function`/`export const`/`export class`), locates the conventional 1:1 test file AND the broader test root, and word-boundary-greps every test file for function-name references. Outputs density (% of functions referenced), names of unreferenced functions, and a reference-map (function -> test files exercising it). Calibrated thresholds: ≥75% adequate, 50-75% mixed (verify glue), <50% weak (add tests before closing retro).
  - `lattice/commands/ops/bug-stress.md` extended with Step 4.5 ("Coverage-density audit -- Nyquist signal") between the Step 4 test-presence check and Step 5 oracle growth. The new step explicitly distinguishes "the bug-fix test passes" from "the surrounding module has structural coverage", invokes the script per changed module, and documents the action thresholds.
- **Placement decision (extension vs new skill):** chose extension of `/ops:bug-stress` on merit grounds. Bug-stress is the gate where post-fix discipline already fires; routing through a separate `/lattice:audit-coverage` skill would add an invocation surface without a workflow trigger. The script is invocable standalone (`python scripts/coverage-density-report.py <module>`) so a future proactive trigger (e.g., new analytical function added) doesn't require duplicating logic.
- **Adjacency to redesign-spec F2 / F6:** LIT-07 is distinct from F6 (which propagates a known pattern across instances) and F2 (which builds a property catalog for analytical functions). LIT-07 asks the *upstream* question: regardless of whether the pattern is named in F6's catalog, is the module densely-enough tested that the next instance would surface? The reference map in the script's output is also where F2 properties would attach — same surface, different axes. Coordinated note left in the script docstring.

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

### ~~LIT-DS-11: Built-not-mounted inventory script (maintained, not snapshot)~~ — RESOLVED 2026-04-27
- **Status:** Resolved 2026-04-27. Implementation:
  - `pcc/scripts/find-unmounted-components.py` — walks `frontend/src/**/*.{tsx,ts}`, parses static + dynamic + re-export imports, resolves `@/` alias, runs reachability BFS from `main.tsx`, classifies unreachable files as `COMPONENT` (.tsx with capital-letter export) or `HELPER` (.ts module). Per-file `last_commit_days` from `git log` distinguishes recently-built code awaiting wiring from abandoned drafts. Flags: `--format text|markdown|json`, `--update-section4` (rewrites the AUTOGEN block in `.claude/rules/ux-audit-validate.md` Section 4 in place), `--no-git` for fast scans.
  - `pcc/.claude/rules/ux-audit-validate.md` Section 4 restructured per the TODO suggestion: human-curated prose (purpose, triage protocol, "Genuinely unbuilt" note) wraps an `<!-- AUTOGEN:built-not-mounted BEGIN/END -->` block holding the regenerated table.
  - `lattice/commands/lattice/lint-knowledge.md` Step 2 lists the script alongside other typed-schema audits. Informational exit (always 0 unless src dir missing) — output is the regenerated table, not a defect gate.
- **First scan output:** 27 unmounted components + 31 unmounted helpers across `frontend/src/`; the prior 3-row hand-curated snapshot was a strict subset. Recent activity (≤35 days) on most components suggests genuine "built but not yet wired" rather than stale code.

### LIT-DS-10: Lineage citation in datagrok-app-design-patterns.md
- **Tier:** 4 — situational; one-paragraph cosmetic edit, low-cost
- **What:** A one-paragraph "Lineage" section in `docs/_internal/design-system/datagrok-app-design-patterns.md` naming Alexander → Tufte → Appleton, with a one-sentence statement of why this lineage matters (tools, not media; patterns, not rules; analytical value over engagement). Cost: a paragraph. Benefit: future agents have a citation when justifying rejection of consumer-app conventions.
- **Where:** `docs/_internal/design-system/datagrok-app-design-patterns.md`
- **Source:** appleton-pattern-languages (lineage citation makes rejections of consumer-app conventions defensible by reference rather than re-derivation)
- **Defer trigger:** only land when an agent has actually re-derived a rejected consumer-app convention twice and lacked a citation to point to. Cosmetic until then.

#### Open verification (delete when confirmed)

- **VERIFY-DS-01: Confirm design-mode PreToolUse hook fires end-to-end on next Claude Code session.** The hook (`scripts/design-mode-gate.sh` invoked from `.claude/settings.json` PreToolUse Write|Edit) is implemented and unit-verified across all decision branches via direct script invocation, but `.claude/settings.json` hooks load at session start, so the change cannot be tested in the session that authored it. Next session in either lattice or pcc: (a) `bash scripts/design-session.sh begin "verify"`, (b) attempt any Write/Edit on a `frontend/src/**/*.tsx` file, (c) confirm the tool call returns an error containing "BLOCKED: design session active" and the file is not modified. (d) `bash scripts/design-session.sh end` to clean up. If the hook does not fire, debug in this order: settings.json parses and contains the PreToolUse Write|Edit block; cwd at hook-fire time is the project root (verify with `pwd` inside the hook command); `$CLAUDE_TOOL_INPUT` is populated. Implementation references: lattice `de8c1af` (hook) + `09843ee` (cd-to-root), sendex `1a574964` (settings wiring). Delete this entry once confirmed.

#### Considered and rejected (design-system audit trail)

- **Storybook / interactive component preview surface.** Carbon and Frost both implicitly recommend this. Sendex has the audit-checklist + design-decisions tables instead. Storybook is high-overhead for a single-frontend project where every component is exercised by real views every dev session. Re-evaluate only at multi-plugin reuse.
- **Multi-framework component implementations (React + Web Components + Vue + Angular per Carbon).** Sendex is React-only; even at Datagrok-plugin migration time, the platform JS API is the integration surface, not multi-framework component code. Designing for a consumer that doesn't exist.
- **Sendex-internal React component library aimed at external plugin reuse.** Datagrok plugins are not React component consumers. Same "consumer that doesn't exist" rejection.
- **Maximalist pattern-language graph (every rule references every related rule).** High edge-density renders the graph unreadable. Sendex's current sparse cross-referencing (1–2 outbound edges per rule) is the right density.
- **Pre-emptive migration of any sendex view to Datagrok viewers before the migration milestone.** Speculative platform-port slows current analytical work without delivering value. Forward-port is as bad as backward-defer per CLAUDE.md rule 13's spirit.
- **Treating Datagrok platform conventions as binding design rules today.** The active design system is sendex's own (audit-checklist + design-decisions). Datagrok conventions become binding *at* migration; importing them now would mean enforcing rules whose semantics aren't yet operational.
- **Figma-as-source-of-truth.** Sendex's authoritative design representation is markdown (audit-checklist + design-decisions tables). Adding Figma creates a synchronisation problem (two editable sources, drift inevitable). Carbon's Figma libraries solve a problem sendex doesn't have (designers who don't read code).
- **Multi-theme system (light / dark / contrast / branded) speculatively.** Sendex is single-theme by deliberate choice — analytical viewing environments are well-lit and the saturated-color budget assumes a light substrate. Reconsider only at Datagrok migration when host-platform theming becomes a real constraint.
