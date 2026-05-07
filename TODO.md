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

### ~~FIX-01: e2e cli.js path resolution via LATTICE_ROOT~~ 60102f3
- **Bug:** `build-cycle.yaml` and `bug-fix-cycle.yaml` invoked `node executor/dist/cli.js e2e {classify,run}` as a relative path. Bash steps run with CWD = consuming project, so the command resolved to `<project>/executor/dist/cli.js` (which doesn't exist) instead of the lattice install. `e2e-run` is `on_failure: stop`, so any build-cycle that routed past the e2e gate failed with `MODULE_NOT_FOUND`.
- **Fix:** Plumbed `latticeRoot` through `buildInitialContext` into `env.LATTICE_ROOT` (the env namespace existed but only carried `TIMESTAMP`). Both workflows now reference `"{{env.LATTICE_ROOT}}/executor/dist/cli.js"`.
- **Caught by:** pcc autopilot run 2026-05-03T17:34Z — `control-side-loo-calibration-simulation` failed at `e2e-run` with "Cannot find module 'C:\pg\pcc\executor\dist\cli.js'".
- **Side effect:** new `{{env.LATTICE_ROOT}}` template variable is now available to any workflow node (documented in `workflows/schema.md`).

_(no open ENH items at this time — see `docs/decisions/todo-pruned-2026-04-28.md` for items moved out of active backlog.)_

### ENH-08: Skill-version-contract mechanism for per-project HEAVY skill re-authorings
- **Source:** peer-review/dg-agentic-harness (Finding F-3, 2026-05-07)
- **Problem:** When harness-pillar skill SHAPE evolves (new section, changed verdict enum), per-project re-authored copies of HEAVY skills (review.md, design.md, lint-knowledge.md, etc.) silently diverge. No detection mechanism exists.
- **Candidates:** (a) template-at-authoring-time — skill body is a template expanded by sync-skills.sh with project stanzas injected; (b) structural test — harness ships a pytest/bash test that validates section structure of any skill claiming to implement a harness contract; (c) version-keyed skill schema — TOML key `[skills] review_schema_version = N` that sync-skills.sh validates against the harness-shipped schema version.
- **Priority:** Medium — becomes load-bearing when n >= 2 DG plugin projects each maintain project-side HEAVY skill copies.

- [ ] **DATA-GAP: dg-agentic-harness effort estimate decomposition** — from peer review of dg-agentic-harness. The "4-6 weeks to first DG plugin port" estimate (08 §4) does not itemize project-pillar authoring cost (component map, API index, typed-fact graph, knowledge files, system manifest). This cost is uncertain (1 day if DG team's existing docs are sufficient; 2+ weeks if not) and must be resolved before committing resources to the timeline. Missing: break-even model for vendor overhead at n=2 vs n=3+ consumers.

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

### ~~LIT-01-FOLLOW-1b: Propagate atomic-fact rule to lattice + reviewers~~ — RESOLVED 2026-04-28
- **Tier:** 3 — framework propagation (atomic-fact rule should ship to new projects, not just pcc)
- **Status:** Resolved 2026-04-28. Implementation:
  - **lattice CLAUDE.md** — new rule 19 ("Atomic facts must live in the typed knowledge graph") generic-framework version of pcc rule 22; rule count 18 → 19. README.md hard-rules table extended with the rule 19 row.
  - **commands/lattice/architect.md** Step 1.4 — new spec-lint criterion 5: "Atomic-fact placement". Specs that restate a numeric threshold / species baseline / route or vehicle constraint / regulatory cutoff / mechanism disable-marker without promoting the value to `knowledge-graph.md` get a defect with resolution path (add typed YAML fact + cite the fact id in the spec body).
  - **commands/lattice/peer-review.md** Implementation Plan / Synthesis tier — new "Atomic-fact placement check" subsection. Peer-reviewer scans spec body for restated atomic facts, files CONDITIONAL when the value isn't backed by a typed graph entry. Failure mode prevented: two un-typed registries silently disagreeing on the same threshold.
- **Scope decision:** scaffold/CLAUDE.md addition deferred — the lattice scaffold doesn't ship a CLAUDE.md template (projects author their own). The rule propagates via (a) lattice/CLAUDE.md being the authoritative framework reference any consumer can grep, and (b) the architect + peer-review skill prompts firing the placement question on every algorithmic spec, regardless of whether the project's own CLAUDE.md restates the rule.

### ~~LIT-02: Generalize typed-knowledge-graph beyond HCD~~ — SUBSUMED 2026-04-26
- **Status:** Subsumed by F1 (Domain-truth oracle) in `pcc/docs/_internal/incoming/lattice-framework-redesign-spec.md`. F1 is the broader, deeper version: extends knowledge-graph schema for regulatory expectations, gate criteria, aggregation policy, direction constraints, plus a `query-knowledge.py` interface. Implementing agent owns this work.
- **Original scope (preserved for audit):** Apply typed-knowledge-graph pattern to syndrome rules / FCT bands / regulatory thresholds. Pre-work would have been a 30-min discovery pass; the spec's F1 already settled the discovery — answer is "yes, multiple registries justify it."
- **Source:** ahrens-smart-notes, karpathy-llm-wiki

### ~~LIT-03: `/lattice:autopilot --discover` mode~~ — RESOLVED 2026-04-28
- **Tier:** 3 — autopilot leverage
- **Status:** Resolved 2026-04-28. Implementation:
  - **`commands/lattice/autopilot.md`** — new `--discover` flag added to the input examples list and a full `## Modes` subsection. Pre-loop step probes for `scripts/discovery-scan.py`; if absent, emits a one-line notice and continues with the normal loop (does not fail). If present, runs the script and parses `scripts/data/discovery-report.md` (the contract: `Gap` rows with `category`, `item`, `suggestion`, `evidence`, `safe`, `severity`). Each gap is re-classified against autopilot safety criteria (size, kind, science/UI coupling) — the scanner's `safe: true` is necessary but not sufficient. Safe gaps inject as synthetic queue entries (`kind: discover`, `score` derived from severity 20/12/6) and route through Step 3 alongside topic and TODO work. Ambiguous gaps go to `ESCALATION.md` with the gap's source citation. Discovery-sourced commits carry `Topic: discover/{category-slug}-{item-slug}` + `Phase: mechanical` trailers.
  - **Anti-pattern 6** added to the existing list: trusting `safe: true` blindly without re-applying the standard gates.
- **Reference template:** `pcc/scripts/discovery-scan.py` (already adapted-template form per its own header comment); the report shape is the cross-project contract. Other projects fork the script per the template's adaptation block.
- **Source:** karpathy-llm-wiki (sparse-area / lint operation as autopilot signal).

### ~~LIT-04: `/lattice:autopilot --consolidate` mode~~ — RESOLVED 2026-04-28
- **Tier:** 3 — orchestrator signal
- **Status:** Resolved 2026-04-28. Implementation:
  - **`commands/lattice/autopilot.md`** — new `--consolidate` flag added to the input examples list and a full `## Modes` subsection (same section as `--discover`). Detection runs after Step 4 (post-batch escalation), before Step 5 summary. Heuristic: `git log --since="14 days ago" --name-only` over `docs/_internal/research/` + `docs/_internal/knowledge/`; cluster candidates by (a) shared filename keyword, (b) `derives_from` chain on typed YAML facts, or (c) mutual markdown citation. Clusters of ≥3 files surface as a `RECOMMENDATIONS (--consolidate)` block in the Step 5 summary suggesting `/lattice:synthesize "{cluster-topic}"`. Does NOT auto-invoke synthesize — recall-biased heuristic, user decides.
  - **Anti-pattern 5** added to the existing list: auto-invoking `/lattice:synthesize` from `--consolidate`. The signal is "the corpus is asking for synthesis" (Ahrens emergence), not "files were touched"; surface only.
  - **Coexistence with `--discover`:** independent flags. Running both runs `--discover` pre-loop and `--consolidate` post-Step-4; Step 5 lists discovery work in `Advanced:` and synthesis suggestions in `Recommendations`.
- **Rationale grep-anchor:** the `--consolidate` subsection cites `docs/literature/ahrens-smart-notes.md` so the bottom-up-emergence framing is locatable.
- **LIT-02 dependency note:** original LIT-04 noted dependence on LIT-02 (typed-edge metadata). LIT-02 was subsumed by F1 (Domain-truth oracle) and the typed-knowledge-graph already ships `derives_from` edges, which the consolidate heuristic consumes directly. No separate blocker remains.
- **Source:** ahrens-smart-notes (bottom-up emergence).

### ~~LIT-05: Distill query → wiki promotion~~ — RESOLVED 2026-04-28
- **Tier:** 3 — knowledge capture
- **Status:** Resolved 2026-04-28. Implementation:
  - **`commands/lattice/distill.md`** — new "Knowledge Promotion (all modes — final step before return)" section inserted at the end of every mode, immediately above the existing Persist Gaps step. Three substeps: (P1) identify candidate insights gated on the three-part novel / factual-load-bearing / cross-subsystem test; (P2) one-at-a-time operator prompt with a single suggested destination (extension of an existing knowledge file preferred over a new file), draft-then-confirm before any write; (P3) mandatory `decisions.log` row per candidate with `Distill-Insight:` trailer (verdict column distinguishes PROMOTED / DECLINED / SKIPPED), so audit trail persists even when the operator declines.
- **Failure mode prevented:** distill outputs were session-bound and evaporated; the same cross-subsystem connection had to be re-derived from scratch on the next invocation. Per karpathy-llm-wiki's query → wiki promotion pattern, novel synthesis-time insights now have a path into the durable knowledge layer with operator-in-the-loop gating (no aggressive auto-extraction).
- **Pairs with LIT-08 (`/lattice:extract-learnings`) and rule 19 (atomic-fact placement):** extract-learnings handles spec-archive-time extraction; this closes the analogous loop at distill-time. Rule 19 governs WHERE the value lands (typed graph for atomic / contradictable facts; cited from un-typed registries). Together: incoming specs (architect Step 1.4 criterion 5) + outgoing specs (extract-learnings Step 5d) + corpus reasoning (distill Step P1-P3) all route durable claims into the same knowledge layer.
- **Source:** karpathy-llm-wiki (query → wiki promotion)

### ~~LIT-06: TDD-for-non-scientific-code decision memo (narrowed 2026-04-26)~~ — RESOLVED 2026-04-28
- **Tier:** 2 — code quality
- **Status:** Resolved 2026-04-28. Decision memo at `lattice/docs/decisions/tdd-non-analytical-code-memo.md` (logged via `pcc/.lattice/decisions.log` 2026-04-28). **Recommendation: (B) narrow mandate.** TDD MUST precede implementation only for pure-function transforms in `frontend/src/lib/` that (i) read from the typed `unified_findings` contract and re-shape values for display, (ii) are display formatters whose output a user reads as a scientific value (NOAEL/dose/p-value/effect-size/severity), or (iii) map backend fields onto row/object shapes consumed by ≥2 view components. Scope explicitly **excludes** React component rendering, hook side-effects, ECharts/SVG charts, route/cache wiring, and CSS — those layers are governed by Playwright walks (rule 21 in pcc / pending lattice-side rule), contract-triangle hygiene (rule 18), and fixture-against-real-data audits (rule 16).
- **Empirical basis:** 30 BUG-SWEEP entries (BUG-001..BUG-034) split 14 analytical / 7 display-with-scientific-consequence / 12 plumbing. Of the 7 (b)-class bugs, only 3 (BUG-009 effect-size off-by-one, BUG-011 row-mapper field strip, BUG-021 missing `formatNoaelDisplay` branch) would have been caught by realistic TDD. The remainder are cross-consumer invariant (BUG-002), contract-triangle drift (BUG-018), or persistence/fixture-discipline cases that a hook-isolated unit test does not exercise (BUG-023, BUG-029).
- **Universal mandate (A) rejected:** of the 12 (c) plumbing bugs, none are addressed by TDD — ECharts blur (BUG-005), browser HTTP cache 304 (BUG-008), Ctrl+click standardization (BUG-004), pandas dtype coercion (BUG-017) are outside TDD yield. Universal-TDD taxes every UI commit while crowding out F2's domain-grounded property catalog (peer-review.md F2-CONDITIONAL 2026-04-27). Excluded considerations and counterfactuals enumerated in §2 / Appendix of the memo.
- **Re-trigger to (A):** ≥3 (b)-class bugs in the next 90 days whose responsible function is **outside** the (B) subset (scope leak), OR the next `/ops:sweep` retrospective surfaces a (b)-class bug whose pre-fix test would have been a non-pure React component test that realistic TDD would have written first.
- **Open propagation work** (separate item if pursued): rule wording is drafted in §4 of the memo for adoption as a numbered CLAUDE.md rule + pre-commit advisory hook (mirroring the GAP-264 token-conformance posture). Promotion to a hard block deferred until the (B) scope is empirically calibrated against ≥1 quarter of commits.
- **Source:** obra-superpowers (TDD as universal practice — open question now answered: NO universal mandate; YES narrow mandate on a defined contract-transform subset).

### ~~LIT-07: Nyquist-auditor analog (distinct from F6, retained 2026-04-26)~~ — RESOLVED 2026-04-27
- **Tier:** 1 — science + bug-protocol cross-ref
- **Status:** Resolved 2026-04-27. Implementation:
  - `pcc/scripts/coverage-density-report.py` — given a changed module path, extracts public functions / classes (Python `def`/`class`, TypeScript `export function`/`export const`/`export class`), locates the conventional 1:1 test file AND the broader test root, and word-boundary-greps every test file for function-name references. Outputs density (% of functions referenced), names of unreferenced functions, and a reference-map (function -> test files exercising it). Calibrated thresholds: ≥75% adequate, 50-75% mixed (verify glue), <50% weak (add tests before closing retro).
  - `lattice/commands/ops/bug-stress.md` extended with Step 4.5 ("Coverage-density audit -- Nyquist signal") between the Step 4 test-presence check and Step 5 oracle growth. The new step explicitly distinguishes "the bug-fix test passes" from "the surrounding module has structural coverage", invokes the script per changed module, and documents the action thresholds.
- **Placement decision (extension vs new skill):** chose extension of `/ops:bug-stress` on merit grounds. Bug-stress is the gate where post-fix discipline already fires; routing through a separate `/lattice:audit-coverage` skill would add an invocation surface without a workflow trigger. The script is invocable standalone (`python scripts/coverage-density-report.py <module>`) so a future proactive trigger (e.g., new analytical function added) doesn't require duplicating logic.
- **Adjacency to redesign-spec F2 / F6:** LIT-07 is distinct from F6 (which propagates a known pattern across instances) and F2 (which builds a property catalog for analytical functions). LIT-07 asks the *upstream* question: regardless of whether the pattern is named in F6's catalog, is the module densely-enough tested that the next instance would surface? The reference map in the script's output is also where F2 properties would attach — same surface, different axes. Coordinated note left in the script docstring.

### ~~LIT-08: `/lattice:extract-learnings` skill~~ — RESOLVED 2026-04-28
- **Tier:** 2 — knowledge integrity
- **Status:** Resolved 2026-04-28. Implementation:
  - **`commands/lattice/extract-learnings.md`** — new skill (7 steps): read spec, classify candidates by destination (typed graph / methods-index / field-contracts / architecture / audit-checklist / design-decisions / contract-triangles / bug-patterns), locate-or-create destination, stage extractions (review or `--apply` mode), archive spec with back-references, update relevant architecture spec's last-validated date, persist findings via `decisions.log` row + `Knowledge:` commit trailer.
  - **`commands/lattice/review.md` Step 5d** — new mandatory cycle-close substep that auto-invokes `/lattice:extract-learnings <spec-path> --apply` when the staged set or recent commits include an `incoming/*.md` removal/move (or `Topic:` trailer matches a spec being closed). Defect-blocks the gate when the skill produces zero extractions AND the spec has no explicit `Archived <date>. No durable knowledge extracted (rationale: ...)` annotation. Skipped during `/lattice:spike` close (spikes deliberately defer doc lifecycle to `/lattice:spec-from-code`).
- **Failure mode prevented:** the conflation cases (1370c103, 521f1d16) where a spec extraction was bundled into a conflated commit; the commit message didn't trigger anyone's "extract before archive" discipline so durable knowledge was lost in commit-laundry. With Step 5d auto-running, cycle-close cannot proceed without either logged extractions or a logged "no extraction needed" rationale.
- **Pairs with rule 19:** architect (Step 1.4 criterion 5) + peer-review (synthesis tier) ask the placement question on incoming specs; this skill closes the loop on outgoing specs by extracting the values to the typed graph at archive time.
- **Source:** gsd (`gsd-extract-learnings`).

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

### LIT-12: Slack integration — work-from-anywhere capability
- **Tier:** active — user-prioritized 2026-04-28 ("sooner rather than later")
- **What:** Inbound channel for user instructions while away from desktop CLI. The pain is real: user is currently bound to terminal access for any directive flow, which limits practical use to in-office hours. A Slack inbound surface (DM the user's bot, bot relays to a long-running session or queues for next session) would unblock remote / mobile / on-the-go directives.
- **Scope to settle in a follow-up session:**
  - **Channels & auth.** Slack DM only (single user)? Single channel? Workspace-level OAuth scopes needed. App-level token vs. user-token tradeoffs.
  - **Command grammar.** Free-form prose passed through verbatim, or a thin grammar (e.g. `/lattice cycle X`, `/notes "..."`, `@bot review my latest commit`)? The first is more flexible; the second is parseable.
  - **Delivery model.** Long-running daemon (a Node service holding the Anthropic SDK + Claude Code session) vs. queued-for-next-session (Slack writes to `.lattice/inbound/<timestamp>.md`, next session ingests). The daemon is real-time; the queue is operationally simpler and avoids "agent orchestrating in the background while user isn't watching."
  - **Security boundary.** Slack DM = identity-of-user-on-this-workspace = trusted? What if the workspace adds another user? Hard requirement: `LATTICE_SLACK_USER_ID` allowlist.
  - **Integration surface.** MCP server (clean) vs. `.claude/settings.json` hook (lighter weight) vs. external Node service (most flexible).
- **Where:** TBD — likely a Node service `executor/src/slack.ts` with optional `lattice slack` CLI command, or an MCP server in `executor/mcp/` consumed by Claude Code via settings.
- **Source:** user request, 2026-04-28 audit conversation. Not speculative — reflects actual operational pain.

### LIT-13: OpenTox 2.0 — tiered rigor, 4-layer QA, evidence-package framing
- **Tier:** 4 — situational. Three distinct ideas, each gated on its own trigger. Park until one fires; framework is validating, not instructive.
- **Source:** Hardy & Abdelwahab (2026), *OpenTox 2.0: A Perspective on the Principles for Predictive Toxicology and Risk Assessment*, working draft. Domain is regulatory toxicology; abstraction is identical to Lattice's (governed evidence workflows, agent orchestration with guardrails, traceability from raw input to decision). The paper's S5 manifesto + S2 deployment-readiness table (S2.1) + Table A1 QA layers map onto Lattice the way the design-system literature pass mapped onto sendex.
- **What — three candidate lifts:**
  1. **Tiered rigor as explicit gate set.** S5 §A.0.3 names Tier 1 (prototype) / Tier 2 (operational) / Tier 3 (high-stakes/regulatory) with checklists scaling per tier. Lattice's spike-vs-spec lifecycle implies tiers but doesn't gate — a spike can ship to production without ever hitting the spec-cycle gate set. Idea: specs declare target tier in YAML frontmatter; `/lattice:architect` enforces tier-appropriate gates (e.g., Tier 3 requires external validation evidence + full provenance; Tier 1 skips both). Trigger to elevate: a Tier-1-style spike accidentally promotes to a Tier-3-equivalent surface (regulator-facing or load-bearing analytical) without the rigor scaling. Watch BUG-SWEEP for "shipped without gate" retrospectives.
  2. **4-layer QA decomposition for `/lattice:review`.** S3 splits QA into Data / Model / Operational / System layers, each with explicit checkpoints. Lattice's review-gate JSON is currently flatter (build / lint / docs / MANIFEST / commit). Restructure idea: review-gate produces a 4-layer report; each layer gates independently; failures route to the right specialist agent. Trigger: a review-gate pass that misses a class of bug a layer-decomposed checklist would have caught (e.g., shipped contract-triangle drift that survived because the flat checklist conflated declaration/enforcement/consumption into one bullet).
  3. **Evidence package as first-class artifact.** §3.3 + §4.6 frame "evidence package" — structured bundle linking output → sources → datasets → model versions → ontology → run record — as the unit regulators evaluate. Lattice already produces the substrate (decisions.log + commit-intent + rule-attestations + Topic trailers + cycle-state YAML), but never collapses it into one named artifact. Idea: `/lattice:review` emits an `evidence-package.json` per cycle aggregating these. Trigger: a downstream consumer (audit tooling, multi-project rollup, external review) wants to ingest cycle outputs without crawling six different files.
- **Why park, not spec:** all three are additive to an already heavy framework. The paper validates Lattice's existing direction more than it instructs. Speccing without a forcing function violates rule 13 (no unprompted deferrals — but also no unprompted *additions*). The merit-driven path is to wait for the failure mode each idea would catch.
- **Cross-refs to existing Lattice mechanics that already implement adjacent ideas:**
  - Decision-auditor + architect-reviewer + peer-review agents = §4.8 "specialized agent decomposition" (Djidrovski O-QT).
  - Rule 19 (atomic facts in typed knowledge graph) + `audit-knowledge-graph.py` = §S2.2 ontology/KG integrity, with stronger contradiction-detection than the paper proposes.
  - Commit-intent protocol + rule-attestations dispatcher = §3.3 evidence-chain provenance, more rigorous than the paper's diagram.
  - Domain-truth oracle fallback ("no fact found... falling back to LLM with explicit caveat") = S5 §A.11 hallucination abstain/escalate pattern.
- **Source:** OpenTox 2.0 working draft (260407OpenTox2.0.pdf), reading 2026-05-01.
- **Status:** Open. Parking-lot. Re-evaluate when any of the three named triggers fires.

### ~~LIT-DS-GAP: Design-system axis literature pass~~ — RESOLVED 2026-04-26
- **Status:** Resolved by four literature notes ([`frost-atomic-design.md`](docs/literature/frost-atomic-design.md), [`ibm-carbon-design-system.md`](docs/literature/ibm-carbon-design-system.md), [`appleton-pattern-languages.md`](docs/literature/appleton-pattern-languages.md), [`datagrok-platform-docs.md`](docs/literature/datagrok-platform-docs.md)) plus the **Design-system backlog** section below. The 4 sources cover: design-system primer (Frost), large-scale shipped instance (Carbon), opinionated tools-for-thought framing (Appleton), and the actual plugin-migration target (Datagrok). The README scope line was extended to formally include design-system reading.

#### Considered and rejected (audit trail)

- **Translate-don't-copy enforcement at `/lattice:synthesize`** — convention is followed by Claude already; no observed failure mode. Adding enforcement is solving a non-problem.
- **`/lattice:milestone-retrospective` skill** — cycle-close + `/ops:sweep` cover the same ground at finer granularity. No named milestone-level failure pattern justifies the new skill.

---

## Design-system Backlog

> **Last triaged: 2026-04-28** (LIT-DS triage pass). Result: all 10 LIT-DS items are non-actionable framework-side at this time — 4 have defer triggers not yet met, 3 are project-side work (pcc), 1 is dependency-blocked, 2 are conditional skips per their own rules. Per-item status:
>
> | # | Status | One-line reason |
> |---|--------|-----------------|
> | LIT-DS-01 | DEFER | Visual-rule refute rate 21% > 15% threshold; close visual gap first per item's own trigger |
> | LIT-DS-02 | PROJECT | Migration map content is pcc-side; framework already names dg-developer responsibility |
> | LIT-DS-03 | PROJECT | Playwright baselines are pcc-side artifacts |
> | LIT-DS-04 | PROJECT | Component catalogue is pcc-side documentation |
> | LIT-DS-05 | DEFER | "Forces" columns only for rules refuted ≥2x; no per-rule refute data yet |
> | LIT-DS-06 | DEFER | Wait for real failure mode (orphan rule, contradictory pair); none surfaced |
> | LIT-DS-07 | BLOCKED | Depends on LIT-DS-02 (migration-cost classifier needs the map first) |
> | LIT-DS-08 | SKIP | Skip-if: single-frontend project; sendex still single-frontend |
> | LIT-DS-09 | SKIP | Skip-if: no theme swap on roadmap; rule 13 violation if speculative |
> | LIT-DS-10 | DEFER | Wait for agent re-deriving rejected convention twice without citation; not observed |
>
> Re-evaluation triggers (any of these flips one or more items): visual refute rate drops below 5%; Datagrok plugin migration kickoff scheduled; theme-swap appears on roadmap; an orphan rule or contradictory pair surfaces during a validate-stage sweep; a per-rule refute count reaches 2 for any Critical-severity rule.
>
> Items derived from cross-checking `docs/literature/` design-system source notes (Frost, Carbon, Appleton, Datagrok) against current sendex/lattice design-system state. Scope is design-system / UI-quality / plugin-migration axes.
>
> **Value axes** (the dev-framework axes, adapted for the design surface) each item must defend itself against:
> - **design-consistency** (analog of *science*) — UI surfaces match the documented design system; visual claims are testable; bad patterns get retracted not silently kept
> - **analytical-fitness** (analog of *code*) — UI helps the toxicologist reach correct conclusions; doesn't mislead through visual choices, accessibility gaps, or migration debt
> - **autopilot** — design-related autonomous changes (UX-audit walks, design-pass implementations) don't introduce regressions; lint signals exist for design drift
> - **knowledge** — design-system docs (audit-checklist, design-decisions tables, view specs, viewer-migration map) stay authoritative and grep-able
>
> Tier 1 = pulls 2+ axes. Tier 2 = strong single axis. Tier 3 = autopilot leverage. Tier 4 = situational. Items rejected on value grounds are listed at the bottom for audit trail.

_(LIT-DS-01 through LIT-DS-10 have their per-item bodies archived to `docs/decisions/todo-pruned-2026-04-28.md`. The triage table above carries the operational status; if any trigger condition fires, restore the relevant entry from the archive.)_

### ~~LIT-DS-11: Built-not-mounted inventory script (maintained, not snapshot)~~ — RESOLVED 2026-04-27
- **Status:** Resolved 2026-04-27. Implementation:
  - `pcc/scripts/find-unmounted-components.py` — walks `frontend/src/**/*.{tsx,ts}`, parses static + dynamic + re-export imports, resolves `@/` alias, runs reachability BFS from `main.tsx`, classifies unreachable files as `COMPONENT` (.tsx with capital-letter export) or `HELPER` (.ts module). Per-file `last_commit_days` from `git log` distinguishes recently-built code awaiting wiring from abandoned drafts. Flags: `--format text|markdown|json`, `--update-section4` (rewrites the AUTOGEN block in `.claude/rules/ux-audit-validate.md` Section 4 in place), `--no-git` for fast scans.
  - `pcc/.claude/rules/ux-audit-validate.md` Section 4 restructured per the TODO suggestion: human-curated prose (purpose, triage protocol, "Genuinely unbuilt" note) wraps an `<!-- AUTOGEN:built-not-mounted BEGIN/END -->` block holding the regenerated table.
  - `lattice/commands/lattice/lint-knowledge.md` Step 2 lists the script alongside other typed-schema audits. Informational exit (always 0 unless src dir missing) — output is the regenerated table, not a defect gate.
- **First scan output:** 27 unmounted components + 31 unmounted helpers across `frontend/src/`; the prior 3-row hand-curated snapshot was a strict subset. Recent activity (≤35 days) on most components suggests genuine "built but not yet wired" rather than stale code.

_(LIT-DS-10 body archived to `docs/decisions/todo-pruned-2026-04-28.md`. Triage status above remains DEFER pending the trigger named in the archive.)_

#### Open verification (delete when confirmed)

- **VERIFY-DS-01: pcc settings fix applied (2026-04-28, sendex `ed90e2bb`); fresh-session hook-firing test pending.** Diagnosis (2026-04-28): pcc's project-level hook command was `bash scripts/design-mode-gate.sh` (relative path). Claude Code on Windows fires PreToolUse hooks but the relative path silently fails to resolve — the hook never executes. **Fixes shipped:** lattice `scaffold/.claude/settings.json` ships the portable `bash -c 'ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; bash "$ROOT/scripts/design-mode-gate.sh"'` pattern; pcc `.claude/settings.json` updated to match (sendex `ed90e2bb`). **Verified directly (this session):** gate script BLOCKs (`exit 1`, full message) on `frontend/src/*.tsx` with lock active; passes (`exit 0`) on non-frontend paths and on no-lock state; new hook command resolves the repo root from any cwd via git-rev-parse. **Pending — requires fresh Claude Code session:** Claude Code loads `.claude/settings.json` at session start, so the actual PreToolUse hook firing under the new command needs a fresh-session re-verify protocol: (a) `bash scripts/design-session.sh begin "verify"`, (b) attempt Write/Edit on any `.tsx` file under `frontend/src/`, (c) confirm BLOCKED stderr surfaces and file is not modified, (d) `bash scripts/design-session.sh end`. Delete this entry once that protocol passes. Implementation references: lattice `de8c1af` (hook) + `09843ee` (cd-to-root), sendex `1a574964` (initial settings wiring) + `ed90e2bb` (portable command).

#### Considered and rejected (design-system audit trail)

- **Storybook / interactive component preview surface.** Carbon and Frost both implicitly recommend this. Sendex has the audit-checklist + design-decisions tables instead. Storybook is high-overhead for a single-frontend project where every component is exercised by real views every dev session. Re-evaluate only at multi-plugin reuse.
- **Multi-framework component implementations (React + Web Components + Vue + Angular per Carbon).** Sendex is React-only; even at Datagrok-plugin migration time, the platform JS API is the integration surface, not multi-framework component code. Designing for a consumer that doesn't exist.
- **Sendex-internal React component library aimed at external plugin reuse.** Datagrok plugins are not React component consumers. Same "consumer that doesn't exist" rejection.
- **Maximalist pattern-language graph (every rule references every related rule).** High edge-density renders the graph unreadable. Sendex's current sparse cross-referencing (1–2 outbound edges per rule) is the right density.
- **Pre-emptive migration of any sendex view to Datagrok viewers before the migration milestone.** Speculative platform-port slows current analytical work without delivering value. Forward-port is as bad as backward-defer per CLAUDE.md rule 13's spirit.
- **Treating Datagrok platform conventions as binding design rules today.** The active design system is sendex's own (audit-checklist + design-decisions). Datagrok conventions become binding *at* migration; importing them now would mean enforcing rules whose semantics aren't yet operational.
- **Figma-as-source-of-truth.** Sendex's authoritative design representation is markdown (audit-checklist + design-decisions tables). Adding Figma creates a synchronisation problem (two editable sources, drift inevitable). Carbon's Figma libraries solve a problem sendex doesn't have (designers who don't read code).
- **Multi-theme system (light / dark / contrast / branded) speculatively.** Sendex is single-theme by deliberate choice — analytical viewing environments are well-lit and the saturated-color budget assumes a light substrate. Reconsider only at Datagrok migration when host-platform theming becomes a real constraint.
