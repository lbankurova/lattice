---
name: entity-registry
description: Recover one analytical entity's interpretive logic from the user-question corpus into an introspectable DECLARATIVE REGISTRY (rules-as-data with provenance), not procedural if/else. One entity per run; spec output to docs/_internal/incoming/.
---

You are recovering the information architecture of **one analytical entity** in the SENDEX preclinical-tox domain and rendering its interpretive logic as an **introspectable declarative registry** — rules-as-data, not a procedural cascade.

**Input:** an analytical entity — `$ARGUMENTS` (e.g. `control-group`, `vehicle`, `syndrome`, `noael`, `target-organ`, `adequacy`).

**Output:** a registry spec at `docs/_internal/incoming/{entity}-registry.md` (the per-animal-classification-index shape, but **the registry is the artifact**) + capabilities additions + a ROADMAP feature + a TODO + candidate IA decisions.

---

## The goal (non-negotiable)

The deliverable is a **data structure**, not prose and not if/else. A declarative registry of typed, provenance-carrying rules such that:

1. **Forward-traceable** — every verdict/tag carries `{rule-id, evidence values, threshold-ref, source fact, state}`; *"why did X get Y?"* is answerable from the row.
2. **Counterfactually-traceable** — the structure represents what was *evaluated-and-rejected* and what was *out-of-scope*; *"why did X NOT get Z?"* is **also** answerable. (An if/else that returns a value tells you nothing about what it didn't return; this must.)
3. **Editable-as-data** — a domain expert edits a rule without touching code; a schema/audit validates it.
4. **No if/else wall** — evaluation = `map` over the registry; branching is *data* (the predicates), not control flow you trace.

Model: the declarative `Role(...)` registry in `docs/_internal/incoming/per-animal-classification-index.md`. That **is** the template; you are generalizing it to `$ARGUMENTS`.

---

## Read first

- `docs/_internal/redesign/01-user-questions-inventory.md` — the user-question corpus (the D1 anchor: `Q-*` IDs, §2 cross-cutting axes, §3 tensions, §1.7 branches).
- `../sendex-ia/DECISIONS.md` (sibling repo; the recovered IA — read if available) — full typing vocabulary, the honesty/scope discriminators, OPEN/NEXT. Essentials embedded below so this skill is self-sufficient without it.
- `docs/_internal/incoming/per-animal-classification-index.md` — the exemplar registry shape.
- `docs/_internal/architecture/entity-model.md` — **the three-plane model (READ FIRST for typing): DB entity (P1) · judgment registry (P2) · override surface (P3). Only a P2 *judgment* gets a registry from this skill — run the plane gate below.**
- `docs/_internal/SPINE.md` — the scope + traceability + build spine; **§6 the edition-dimension gate** (D-EDITION: editions are settings-flavors; every entity carries edition as a dimension from day one). The recovered entity's edition applicability is recorded in its SPINE row.
- `CLAUDE.md` — rules 5 (reuse), 11 (ROADMAP intake), 16 (verify on real output), 17 (spec-value audit), 18 (contract triangles), 19 (algorithm defensibility on real data), 21 (advisory over engine), 22 (typed-fact thresholds).

## Plane gate — run BEFORE typing (prevents mis-allocation)

`$ARGUMENTS` is a domain noun. **First decide which plane it lives on** (`docs/_internal/architecture/entity-model.md`). Only a Plane-2 judgment gets a registry from this skill:

- **Plane 2 — a contradictable domain judgment** (a call the engine makes that a toxicologist argues about; rules with provenance that must explain their negative space). → **PROCEED — author its registry.** e.g. adversity, adequacy (control/vehicle/hcd), syndrome-detection, NOAEL.
- **Plane 1 — a DB entity / scope** (identity; countable per study; "show me all of them" is a sensible query: study, organ, endpoint, dose-group, subject-as-record). → **STOP — not a registry.** The judgments *attach to* it; it belongs in the entity-model Plane-1 list + gets a *view*. Redirect.
- **Plane 3 — an override surface** (a per-instance correction to a verdict attribute: onset-dose, control-type). → **Not a registry** — an override-surface spec: name the triple `(verdict-attribute, DB-entity, producing-registry)` + edition-scoping.
- **Axis / dimension** (substrate/analysis_unit, severity, confidence, edition). → **Not a registry** — a declared property every judgment carries.

**The judgment is *about* a scope, not the scope** (`control-group` registry = "is the reference adequate?", not "the control group"). If you can't name a contradictable call with rules-that-could-be-wrong, this skill does not apply. Test: *"show me all of them" is a sensible query → Plane 1, stop.*

## IA typing vocabulary (embedded — the kind fixes the registry SHAPE)

Type the entity against these kinds — **but only after the plane gate above; a kind only applies to a Plane-2 judgment.** Each kind is tagged with its plane:

- **leaf-atom** *(P1 instance + P2 classification — the registry is the classification)* → a role-tag **set** per instance (`subject` is the P1 record; `subject-classification` is the P2 registry).
- **containment-level** *(P1 scope — NOT a registry)* → a node in the entity tree (endpoint→organ→organ_system→study→program→portfolio). Judgments *attach to* it; do not author a registry — redirect to the DB-entity model.
- **overlay** *(P1 instance + P2 catalog — the registry is the definition/detection)* — a many-to-many regroup cutting *across* the tree → membership **relation** + a *consume-don't-recompute* coordination contract. Two flavors: **input-side / acquisition** (e.g. clin-path panel) vs **output-side / interpretation** (e.g. syndrome / concordance / correlates). The *detected* instance is P1 (queryable); the *catalog* is the P2 registry.
- **axis** *(substrate = axis/dimension, NOT a registry; adequacy = a P2 registry **family**)* — **substrate** (unit-of-analysis: re-rooting / crossing; wrong unit is *wrong, not uncertain*) is a declared property; **adequacy** (is-the-datum-usable) is a *family* of P2 registries (control / vehicle / hcd / study-conduct / species-relevance) — pick the instance.
- **verdict-boundary** *(P2 — a registry)* → determination rules + driver-set + honesty-states (a member's **contribution** to the boundary, never *ownership* — group→member projection is a violation).
- **modifier** *(P1 attribute / P3 dial — NOT a registry)* — a disclosure-depth / persona / stratification dial on the one atom; never a new screen, never a registry.
- **NEW kind** → flag it; ratify-first.

Discriminators: **D2** route-or-not (navigable noun vs cognitive verb — verbs are lens rows / inspectors, never routes); **D3** atom / modifier-not-fork; **D11** substrate-vs-lens (different failure layers — keep separate); **D22** overlay input/output flavor.

## Honesty states (these are DATA, not narration)

Output states must include the quint-state + verdict-honesty so counterfactual introspection works:
`not_eligible(reason)` · `eligible/negative` · `eligible/positive(evidence)` · `eligible/indeterminate(reason)` — plus, for verdicts: `fragile` / `equivocal` / `undetermined` / `overridden` / `not-established`.
Cross-cutting rules carried as data: **magnitude ≠ verdict**; predicates **cite positive signatures, never infer from absence**; **no flat-partition of a many-to-many**; a member shows **contribution to** a boundary, never ownership.

---

## Phases (stop at the ratify checkpoint)

**Phase 0 — CORPUS GATHER (forward) — SYSTEMATIC SWEEP, not from recall.** Do **not** gather from memory. **Search the whole corpus** for the entity's footprint: grep `01-user-questions-inventory.md` for the entity's terms *and its near-synonyms / mechanisms / antonyms* (e.g. for `syndrome`: constellation, concordance, **on-target / off-target, expected-effect, pharmacolog, adaptive**, mechanism, XS/XC), then read every §1.x mode table, §2 axis, §3 tension, and §1.7 branch the hits land in. List every `Q-*` / `D-*` / §-id whose *question text **or** decision-served* touches the entity, with the decisions-served (chapter units). **Completeness self-check (mandatory, written):** state (a) what the sweep surfaced that you would **not** have recalled, and (b) where you may still be blind (sections not yet swept). A from-recall gather is a **defect** — it silently drops corpus the entity depends on. *(This rule exists because the pilot's from-recall Phase 0 missed §3.6 and the contract-level §3.13 for `syndrome`.)*

**Phase 1 — CORPUS COMPLETENESS (first principles).** Reasoning from the *decision the entity protects* (NOT from the engine), what does a toxicologist NEED that is MISSING from capabilities? List as candidate questions to append (the corpus is deliverable-zero).

**Phase 2 — TYPE THE ENTITY.** Pick the kind (above) → it fixes the registry shape. Name the discriminator that fixes it, and what would make it a different kind. **Parent-axis check:** if the kind is `axis` (substrate / adequacy), or the entity is the *first* instance of a kind/vocabulary not yet stood up, typing it may force **standing up its parent axis** (e.g. `control-group` → the adequacy axis) — which expands scope beyond the single entity and defines a vocabulary its siblings will share. Surface this at the checkpoint as part of what gets ratified; it is never a silent side-effect. **Engine-structure firewall (anti-bias):** type from the **question corpus alone**. The engine's structure — module boundaries, existing splits/merges, how many subsystems compute the thing — is a **Phase-5 observation to reconcile and possibly *overturn*** (the IA / implementation / data three-way; the engine has been the thing that was wrong before), **never a constraint on the typing**. Pre-merging *and* pre-splitting from the implementation are both bias. Ask "is this one entity or N?" from the decisions a toxicologist makes, not from how the code is laid out.

**Phase 3 — REDUNDANCY & COORDINATION.** Redundant with an already-typed entity? If overlapping, name the discriminator (grouping principle / lens-stack position / scope) + the consume-don't-recompute contract. If truly redundant, say so and STOP.

> **State-vocabulary reconciliation (mandatory — not optional sugar).** If this entity introduces any output-state or categorical vocabulary, declare *in the spec* whether it is **orthogonal to** or **shares** (i) the end-state **B-2 lens five-state** (`core / degenerate / suppressed / inverted / injected`) and (ii) every already-typed sibling's state vocabulary. Conflation is a defect — e.g. the per-animal quint-state (`not_eligible / negative / positive / indeterminate / background`) is *role-applicability for an animal*, **orthogonal** to the B-2 lens row's *render-state*; they are different axes and must not be merged. Where the honesty *principle* coincides (e.g. `indeterminate(reason)` here ≈ `suppressed` / "verdict-not-produced" there), **share the underlying `reason` encoding** rather than re-defining it, and register a **contract-triangle** entry (CLAUDE.md rule 18, `knowledge/contract-triangles.md`) so the two vocabularies cannot silently drift. The exemplar's line-98 note (`per-animal-classification-index.md`) is the standard to follow.

**Phase 4 — PERSONA/GOAL GATE.** Served by the IND-enabler personas (Study Director / sponsor-toxicologist)? Mark out-of-scope / upstream dimensions (work that is the CRO's, not SENDEX's) + goal-conditional hinges.

> **RATIFY CHECKPOINT — STOP.** Present Phases 0–4 (typing, redundancy, persona, edition applicability). Wait for the human to ratify before producing the registry. (Step 11: the typing is more expensive to undo than its encoding, so it is ratified before it is written.)

**Phase 5 — ENGINE MAP + GAPS (backward).** Which `CAP-*` / engine facts already supply each input? What is `[ENGINE-GAP]` (from capabilities or newly found)? Reuse before reinvent (rule 5). Where the entity carries an algorithm, run it against PointCross + ≥1 other study and answer "would a regulatory toxicologist agree?" in writing (rule 19).

**Phase 6 — STRESS-TEST the predicates as you draft them.** Hunt confident-wrong-answer generators: absence ≠ disconfirmation (cite positive signatures); threshold cliffs on noisy counts; group→member projection; layer-conflation (substrate / adequacy / finding); scope errors; flat-partition of a many-to-many; thresholds hardcoded in predicates (must be references).

**Phase 7 — PRODUCE THE REGISTRY (the deliverable).** Author the declarative data structure:
- Each rule is a **row**: `{ id; layer; eligibility (predicate over named context fields); predicate (over named FACT FIELDS); threshold (a REFERENCE to a typed-fact / thresholds block — rule 22, never a literal); source (provenance fact-paths); output-state }`.
- States encode honesty as data (above). Output is a tagged **set / relation** with provenance, never a bare enum.
- **Categorical vocabularies carry CT provenance.** Every categorical term the registry emits or predicates on — role names, class values, cause categories, finding/term IDs — must (a) cite the CDISC controlled-terminology codelist/code where one exists, and (b) tag each term `status: observed | cdisc_ct | user_defined`. This is rule 22's "reference, never literal" discipline applied to *categorical* vocabulary, not just numeric thresholds: the vocabulary is standard-anchored where CT exists **and** user-expandable (the clin-path-panels `status:` model). A bare term with neither a codelist citation (where CT exists) nor a `status` tag is a defect. Terms that have no CDISC codelist (a SENDEX-layer judgment vocabulary) carry `status: observed | user_defined` and say so explicitly — "no CT codelist for this axis" is a valid, recorded answer, not a silent omission.
- **Declare edition applicability (D-EDITION, SPINE §6).** The entity — and each capability/rule it serves — carries an `editions` field (`sponsor-IND` [primary] · `cro` · `fda`, multi). Editions are settings-flavors, so the registry shape must *represent* edition as a dimension from day one: no `sponsor-IND` assumption baked so deep that a `cro`/`fda` flavor would force a schema change. A `sponsor-IND`-only entity **with rationale** is valid; silent absence is `EDITION-DRIFT`. The substrate carries the dimension even when only the sponsor-IND flavor is populated (persona drives edition).
- Ship in the spec: (a) **the registry itself** (YAML / typed-facts, authoritative — no hardcoded logic); (b) the **thin evaluator** signature (`map` over registry, the `resolve_panel` pattern); (c) the **introspection contract** — schema + `explain(instance) → {rules fired + evidence, rejected, out-of-scope}`; (d) an **audit hook** (every threshold → typed fact; every rule → source facts).
- **Name the Plane-3 override surface(s) (entity-model P3, edition-scoped).** For every verdict attribute this registry writes onto a DB entity, name the triple `(verdict-attribute, DB-entity, producing-registry=this)` + which editions may override vs consume-read-only (entity-model "edition gates overridability" — e.g. `severity` is override-in-CRO, read-only-in-sponsor). State it even when the propagation machinery is deferred — the override *binding* is part of the registry, not downstream work.
- Wrap in a spec at `docs/_internal/incoming/{entity}-registry.md` in the per-animal-index shape: why-it-exists / taxonomy-from-first-principles / the distinctions it must preserve / architecture / **THE REGISTRY** / validation (rule 19) / out-of-scope / engine-gaps. The prose serves the registry, not the reverse.

## Close-out (every run)

- **Capabilities additions** → append Phase-1 corpus gaps + new `[ENGINE-GAP]` flags to `docs/_internal/redesign/01-user-questions-inventory.md`.
- **ROADMAP intake (rule 11)** → add a Feature for this entity under **Area 15 (Declarative Entity Registries)**, tagged `interpretation engine`, cross-linked to the spec.
- **TODO** → add an implementation item `### {ENTITY}-REGISTRY: …` tagged `autopilot: needs-user` (registry is design-bearing), `kind: spec→implement`, linking the spec.
- **IA decisions** → propose candidate `Dn` entries for the IA repo (`../sendex-ia/DECISIONS.md`) for any typing call — **ratify-first**; do NOT unilaterally encode contract-spine changes.
- **Edition conformance (SPINE §6)** → record the entity's `editions` applicability in its `SPINE.md` row (col 4 + an edition-aware scope verdict). Run the §6 gate before the ratify checkpoint; a `sponsor-IND`-only declaration needs a one-line rationale.

## Discipline (non-negotiable)

Ratify-first (spine changes proposed, never encoded) · self-falsify your own typing/recommendation before presenting (especially under repeated delegation) · name falsification targets, don't pre-specify (over-fit guard: one case ≠ a general rule) · carry the honesty rules **as data states** · cross-entity reconciliation (reuse already-typed siblings' rules/definitions; don't double-define; reconcile state/categorical vocabularies against B-2 + siblings and register the rule-18 contract-triangle — see Phase 3) · two-repo split (registry + spec + capabilities + ROADMAP/TODO → pcc; IA decisions `Dn` → sendex-ia).
