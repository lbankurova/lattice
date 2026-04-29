# TODO Pruning — 2026-04-28

**Trigger:** Backlog audit during the framework-audit-2026-04-28 session. Three items had limited or no marginal value at the framework's current state. Two were deleted outright; one (vector search) had its trigger preserved as a README scale note.

The 10 LIT-DS items were also collapsed: the triage table (which captures the operational decision per-item) stays in `TODO.md`; the per-item bodies migrate here so the rationale isn't lost.

**Why archive vs delete:** the trigger conditions for each item could fire later (project doubling in size, design refute rate dropping, plugin migration kickoff). Preserving the body of each entry means a future agent re-encountering the same trigger doesn't re-derive the same reasoning from scratch.

---

## Pruned: LIT-11 — GSD `seeds/` pattern

**Original tier:** 4 — process clarity, conditional on felt pain.

**Original body:**
> **What:** Milestone-keyed deferred-idea bucket. Reconciles CLAUDE.md rule 13 ("no unprompted deferrals") with the reality that some ideas genuinely have to wait for a milestone. Today these go to TODO.md `needs-user`, ESCALATION.md, or get lost in conversation.
>
> **Where:** `docs/_internal/seeds/` (new directory if adopted), referenced from TODO.md
>
> **Source:** gsd (`commands/gsd/plant-seed.md`)
>
> **Skip if:** existing TODO/ROADMAP/ESCALATION mechanisms cover this without the new directory.

**Why pruned:** the entry's own "Skip if" clause names the operative reality. TODO.md's existing `autopilot: ready | waiting-data | deferred-dg | needs-user` tagging covers milestone-deferred ideas. ESCALATION.md covers user-decision-gated ones. Adding a `docs/_internal/seeds/` directory would also violate CLAUDE.md rule 8 (no directory sprawl). The item was self-cancelling.

**Re-trigger condition:** if the existing tagging genuinely fails for some new class of deferred ideas (named example, not vague "what if"), revisit. Not before.

---

## Pruned: ENH-01 — Vector search for corpus load

**Original tier:** P3 (low — not a current bottleneck).

**Original body:**
> **Skill affected:** `/lattice:distill` Step 0 Layer 3, `/lattice:research` Step 0
>
> **What:** Replace title-scanning of INDEX.md with semantic vector search for selecting which research files to deep-read. Use [Zabaca/lattice](https://github.com/Zabaca/lattice) (DuckDB + Voyage AI embeddings) as the search backend.
>
> **Integration point:** Distill Step 0 Layer 3 ("Deep Read — purpose-driven selection") and research corpus load. Call `lattice search "{question}"` to rank files by semantic relevance instead of keyword/title matching.
>
> **Why:** Current title-based selection is fragile — misses semantically related files with different terminology (e.g., "organ weight normalization" vs "body weight mediation"). Vector search would improve recall.
>
> **Dependencies:** Voyage AI API key, `@zabaca/lattice` npm package, sync step after research file creation/update.
>
> **When:** Revisit when research corpus exceeds ~200 files, or when multiple contributors work in the corpus. Current corpus size (~100 files, single maintainer) makes the marginal value small.

**Why pruned:** the entry itself names the threshold (200+ files) and acknowledges current marginal value is small. Adding a Voyage AI API dependency for a non-bottleneck is exactly the kind of tooling-bloat that doesn't pay for itself.

**Re-trigger condition preserved:** `README.md` now carries the 200-file threshold as an inline note under `/lattice:distill`. When the research corpus crosses that threshold, re-author this entry with current dependency landscape (Voyage AI / Anthropic embeddings / etc. may have shifted).

---

## Collapsed: LIT-DS-01 through LIT-DS-10

The triage table in `TODO.md` remains. Per-item bodies are preserved here so the rationale + sources + defer triggers are still grep-able for future agents.

### LIT-DS-01 — Accessibility-as-gate in audit-checklist

- **Tier:** 1 — design-consistency + analytical-fitness (largest unaddressed Carbon principle in sendex)
- **What:** Add an `A11Y` section to `docs/_internal/design-system/audit-checklist.md` with WCAG 2.1 AA rules: keyboard navigation completeness, focus-visible on every interactive element, ARIA roles on charts (or text-table fallback), color-contrast ratios on charts, screen-reader label coverage on icon buttons. Today's 79 rules are entirely visual; this is a real coverage gap, not aesthetic. Start with a minimum set (~10 rules) and grow from observed failures.
- **Where:** `docs/_internal/design-system/audit-checklist.md` (new `A11Y` section), reference from `commands/lattice/ux-designer.md` audit protocol
- **Source:** ibm-carbon-design-system (accessibility-as-gate is a first-class Carbon principle)
- **Defer trigger:** if audit-checklist visual rules are still drifting (refute rate >15% at validate stage), close the visual gap first.

### LIT-DS-02 — Datagrok viewer-migration map

- **Tier:** 1 — design-consistency + knowledge (preserves the plugin-migration path per `MEMORY.md` `project_datagrok_target.md`)
- **What:** A single table in `docs/_internal/design-system/datagrok-migration-map.md` mapping each sendex chart component to its Datagrok-viewer migration target (or "custom viewer" if no platform equivalent). Includes interaction parity notes (e.g., violet-tint right-click affordance has no Datagrok analog). Produced by the `dg-developer` skill.
- **Where:** new `docs/_internal/design-system/datagrok-migration-map.md`; `dg-developer` skill produces and refreshes it
- **Source:** datagrok-platform-docs (the strategic implication of plugin-migration target)
- **Why now:** design changes that increase migration cost are cheap to revert before the migration milestone, expensive after. The map turns implicit migration debt into a visible quantity.

### LIT-DS-03 — Canonical fixture-page baselines

- **Tier:** 1 — autopilot + knowledge (lint signal for design drift on the most-walked workflows)
- **What:** A small set of "this is the NOAEL workflow page on PointCross" reference renders, captured by Playwright at known viewport sizes (1920x1080, 2560x1440), stored next to the workflow audit. Drift between the catalogue and these baselines becomes a lint signal — autopilot can flag "the canonical NOAEL page changed visually since the last baseline" for human review.
- **Where:** extend `docs/_internal/audits/workflow-audits/{persona}-{workflow}/baselines/` (or similar); regen step in cycle-close
- **Source:** frost-atomic-design (pages stress the system; pages are the canonical reference where library meets reality)
- **Cross-ref:** integrates with the existing `commands/lattice/ux-audit-walk.md` Playwright pipeline.

### LIT-DS-04 — Positive-form component catalogue

- **Tier:** 2 — knowledge (today's catalogue is in negation-form via Rule 6 "use this / not this"; positive form makes the inventory grep-able)
- **What:** A `docs/_internal/design-system/component-catalogue.md` listing every reusable component with: one-line role, dimensions / viewport budget, props summary, reference screenshot, linked audit-checklist rule IDs, "do/don't" example pair. The Carbon-style component bundle, scaled down for sendex's component count (~30).
- **Where:** new `docs/_internal/design-system/component-catalogue.md`
- **Source:** frost-atomic-design (library-is-the-deliverable in positive form), ibm-carbon-design-system (per-component bundle)
- **Note:** overlaps with Frost's "tier vocabulary" item (LIT-DS-08) and Carbon's "per-component pages" — treat as a single deliverable with two motivations.

### LIT-DS-05 — "Forces" + "Examples" columns on critical-tier audit-checklist rules

- **Tier:** 2 — knowledge (rules become pattern-language entries with full Alexander schema)
- **What:** For the Critical-severity rules in audit-checklist (C-01..C-05, the casing rules, the dose-label tier rules — not all 79), add a **Forces** column ("why does this tension exist?") and an **Examples** column ("real PR or commit where this rule was violated, and the fix"). Today's rule rows have name + test + use/don't-use; the missing pieces (forces, examples) are what let an agent know when the rule binds and when it doesn't.
- **Where:** `docs/_internal/design-system/audit-checklist.md` Critical-severity rows
- **Source:** appleton-pattern-languages (Alexander pattern schema: name + problem + forces + solution + examples + related)
- **Defer trigger:** only land for rules that have been refuted ≥2 times at the validate stage — the refute is the empirical signal that "forces" needs to be explicit.

### LIT-DS-06 — Pattern-language graph renderer

- **Tier:** 2 — knowledge (orphan-rule and cycle detection across the design-decisions / audit-checklist cross-refs)
- **What:** A small script that parses `.claude/rules/design-decisions.md` and `docs/_internal/design-system/audit-checklist.md`, extracts every "see X-NN" reference, and emits a DOT graph or markdown edge-table. Surfaces orphan rules (no inbound edges, no outbound edges) and rule cycles. Run as part of cycle-close or `/lattice:lint-knowledge`.
- **Where:** `scripts/render-design-pattern-graph.py` (or similar); regen step in cycle-close or extension of `/lattice:lint-knowledge`
- **Source:** appleton-pattern-languages (a pattern *language* is graph-shaped; rendering exposes structure)
- **Defer trigger:** wait until a real failure mode (an orphan rule that should have been linked, a contradictory pair) actually surfaces — premature otherwise.

### LIT-DS-07 — `migration-cost` column on audit-checklist

- **Tier:** 3 — autopilot + knowledge (autopilot can pre-screen design changes against migration cost)
- **What:** Each audit-checklist rule that references a sendex-specific affordance (violet column tint, `OverridePill`, custom rail split, etc.) gets a `migration-cost: low/med/high` tag. Rules with `high` migration cost get extra scrutiny when the rule is being added or strengthened — autopilot can warn "this rule increases coupling to a non-Datagrok-portable affordance." Mostly mechanical to add once LIT-DS-02 (viewer-migration map) is in place.
- **Where:** `docs/_internal/design-system/audit-checklist.md` (new column); autopilot reads it during design-rule changes
- **Source:** datagrok-platform-docs (preserve migration path per `project_datagrok_target.md`)
- **Depends on:** LIT-DS-02 — the migration-cost classifier needs the migration map as ground truth.

### LIT-DS-08 — Tier vocabulary (atom / molecule / organism / template) in design-decisions.md

- **Tier:** 4 — situational; conditional on multi-frontend reuse becoming real
- **What:** Add a one-row table at the top of `.claude/rules/design-decisions.md` mapping the four sendex tiers (token, component, view-section, view) to Frost's atom/molecule/organism/template names. Cost is a few lines of doc; benefit lands when (and only when) a second frontend project starts sharing components with sendex.
- **Where:** `.claude/rules/design-decisions.md` header
- **Source:** frost-atomic-design (shared lexicon at the molecule / organism level)
- **Skip if:** sendex remains a single-frontend project. Re-evaluate at Datagrok plugin migration kickoff.

### LIT-DS-09 — Semantic-role token aliases

- **Tier:** 4 — situational; conditional on Datagrok-migration kickoff or a second theme requirement
- **What:** Add a parallel role-based token layer (`--surface-1` / `--surface-2` / `--text-primary` / `--text-secondary`) alongside the value-based tokens (`--background`, `--muted`). Keeps backwards compat; future theme swaps re-bind the role-based layer rather than touching components.
- **Where:** `frontend/src/index.css`, `frontend/src/lib/design-tokens.ts`
- **Source:** ibm-carbon-design-system (role-based token naming is what makes Carbon's themes swap cleanly)
- **Skip if:** no theme swap is on the roadmap. Speculative addition violates the spirit of CLAUDE.md rule 13.

### LIT-DS-10 — Lineage citation in datagrok-app-design-patterns.md

- **Tier:** 4 — situational; one-paragraph cosmetic edit, low-cost
- **What:** A one-paragraph "Lineage" section in `docs/_internal/design-system/datagrok-app-design-patterns.md` naming Alexander → Tufte → Appleton, with a one-sentence statement of why this lineage matters (tools, not media; patterns, not rules; analytical value over engagement). Cost: a paragraph. Benefit: future agents have a citation when justifying rejection of consumer-app conventions.
- **Where:** `docs/_internal/design-system/datagrok-app-design-patterns.md`
- **Source:** appleton-pattern-languages (lineage citation makes rejections of consumer-app conventions defensible by reference rather than re-derivation)
- **Defer trigger:** only land when an agent has actually re-derived a rejected consumer-app convention twice and lacked a citation to point to. Cosmetic until then.

---

## What stayed in TODO.md

- **LIT-12 (Slack integration)** — promoted from "parked" to active. User signaled in the 2026-04-28 audit conversation that work-from-anywhere capability is an actual ask, not speculative future-want.
- **LIT-DS triage table** — the 10-row one-line-per-item summary continues to live in TODO.md so the operational decision per item stays grep-able. Per-item bodies live here.
- **VERIFY-DS-01** — the design-mode-hook re-verification entry. Active, single concrete check.
- **Considered-and-rejected sections** at the bottom of each tier — preserved as audit trail.
