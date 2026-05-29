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

- `docs/_internal/redesign/01-capabilities.md` — the user-question corpus (the D1 anchor: `Q-*` IDs, §2 cross-cutting axes, §3 tensions, §1.7 branches).
- `../sendex-ia/DECISIONS.md` (sibling repo; the recovered IA — read if available) — full typing vocabulary, the honesty/scope discriminators, OPEN/NEXT. Essentials embedded below so this skill is self-sufficient without it.
- `docs/_internal/incoming/per-animal-classification-index.md` — the exemplar registry shape.
- `CLAUDE.md` — rules 5 (reuse), 11 (ROADMAP intake), 16 (verify on real output), 17 (spec-value audit), 18 (contract triangles), 19 (algorithm defensibility on real data), 21 (advisory over engine), 22 (typed-fact thresholds).

## IA typing vocabulary (embedded — the kind fixes the registry SHAPE)

Type the entity against these kinds; the kind determines the registry's shape:

- **leaf-atom** → a role-tag **set** per instance (the per-animal model).
- **containment-level** → a node in the entity tree (endpoint→organ→organ_system→study→program→portfolio).
- **overlay** — a many-to-many regroup cutting *across* the tree → membership **relation** + a *consume-don't-recompute* coordination contract. Two flavors: **input-side / acquisition** (e.g. clin-path panel: read-together by shared sample) vs **output-side / interpretation** (e.g. syndrome / concordance / correlates: grouped by shared meaning).
- **axis** — **substrate** (unit-of-analysis: re-rooting / crossing; a lens at the wrong unit is *wrong, not uncertain*) or **adequacy** (is-the-datum-usable, orthogonal to what it shows).
- **verdict-boundary** → determination rules + driver-set + honesty-states (a member's **contribution** to the boundary, never *ownership* — group→member projection is a violation).
- **modifier** — a disclosure-depth / persona / stratification dial on the one atom; never a new screen.
- **NEW kind** → flag it; ratify-first.

Discriminators: **D2** route-or-not (navigable noun vs cognitive verb — verbs are lens rows / inspectors, never routes); **D3** atom / modifier-not-fork; **D11** substrate-vs-lens (different failure layers — keep separate); **D22** overlay input/output flavor.

## Honesty states (these are DATA, not narration)

Output states must include the quint-state + verdict-honesty so counterfactual introspection works:
`not_eligible(reason)` · `eligible/negative` · `eligible/positive(evidence)` · `eligible/indeterminate(reason)` — plus, for verdicts: `fragile` / `equivocal` / `undetermined` / `overridden` / `not-established`.
Cross-cutting rules carried as data: **magnitude ≠ verdict**; predicates **cite positive signatures, never infer from absence**; **no flat-partition of a many-to-many**; a member shows **contribution to** a boundary, never ownership.

---

## Phases (stop at the ratify checkpoint)

**Phase 0 — CORPUS GATHER (forward).** Every capabilities `Q-*` / §2 axis / §3 tension / §1.7 branch the entity serves. State the decisions-served (the chapter units).

**Phase 1 — CORPUS COMPLETENESS (first principles).** Reasoning from the *decision the entity protects* (NOT from the engine), what does a toxicologist NEED that is MISSING from capabilities? List as candidate questions to append (the corpus is deliverable-zero).

**Phase 2 — TYPE THE ENTITY.** Pick the kind (above) → it fixes the registry shape. Name the discriminator that fixes it, and what would make it a different kind.

**Phase 3 — REDUNDANCY & COORDINATION.** Redundant with an already-typed entity? If overlapping, name the discriminator (grouping principle / lens-stack position / scope) + the consume-don't-recompute contract. If truly redundant, say so and STOP.

> **State-vocabulary reconciliation (mandatory — not optional sugar).** If this entity introduces any output-state or categorical vocabulary, declare *in the spec* whether it is **orthogonal to** or **shares** (i) the end-state **B-2 lens five-state** (`core / degenerate / suppressed / inverted / injected`) and (ii) every already-typed sibling's state vocabulary. Conflation is a defect — e.g. the per-animal quint-state (`not_eligible / negative / positive / indeterminate / background`) is *role-applicability for an animal*, **orthogonal** to the B-2 lens row's *render-state*; they are different axes and must not be merged. Where the honesty *principle* coincides (e.g. `indeterminate(reason)` here ≈ `suppressed` / "verdict-not-produced" there), **share the underlying `reason` encoding** rather than re-defining it, and register a **contract-triangle** entry (CLAUDE.md rule 18, `knowledge/contract-triangles.md`) so the two vocabularies cannot silently drift. The exemplar's line-98 note (`per-animal-classification-index.md`) is the standard to follow.

**Phase 4 — PERSONA/GOAL GATE.** Served by the IND-enabler personas (Study Director / sponsor-toxicologist)? Mark out-of-scope / upstream dimensions (work that is the CRO's, not SENDEX's) + goal-conditional hinges.

> **RATIFY CHECKPOINT — STOP.** Present Phases 0–4 (typing, redundancy, persona). Wait for the human to ratify before producing the registry. (Step 11: the typing is more expensive to undo than its encoding, so it is ratified before it is written.)

**Phase 5 — ENGINE MAP + GAPS (backward).** Which `CAP-*` / engine facts already supply each input? What is `[ENGINE-GAP]` (from capabilities or newly found)? Reuse before reinvent (rule 5). Where the entity carries an algorithm, run it against PointCross + ≥1 other study and answer "would a regulatory toxicologist agree?" in writing (rule 19).

**Phase 6 — STRESS-TEST the predicates as you draft them.** Hunt confident-wrong-answer generators: absence ≠ disconfirmation (cite positive signatures); threshold cliffs on noisy counts; group→member projection; layer-conflation (substrate / adequacy / finding); scope errors; flat-partition of a many-to-many; thresholds hardcoded in predicates (must be references).

**Phase 7 — PRODUCE THE REGISTRY (the deliverable).** Author the declarative data structure:
- Each rule is a **row**: `{ id; layer; eligibility (predicate over named context fields); predicate (over named FACT FIELDS); threshold (a REFERENCE to a typed-fact / thresholds block — rule 22, never a literal); source (provenance fact-paths); output-state }`.
- States encode honesty as data (above). Output is a tagged **set / relation** with provenance, never a bare enum.
- **Categorical vocabularies carry CT provenance.** Every categorical term the registry emits or predicates on — role names, class values, cause categories, finding/term IDs — must (a) cite the CDISC controlled-terminology codelist/code where one exists, and (b) tag each term `status: observed | cdisc_ct | user_defined`. This is rule 22's "reference, never literal" discipline applied to *categorical* vocabulary, not just numeric thresholds: the vocabulary is standard-anchored where CT exists **and** user-expandable (the clin-path-panels `status:` model). A bare term with neither a codelist citation (where CT exists) nor a `status` tag is a defect. Terms that have no CDISC codelist (a SENDEX-layer judgment vocabulary) carry `status: observed | user_defined` and say so explicitly — "no CT codelist for this axis" is a valid, recorded answer, not a silent omission.
- Ship in the spec: (a) **the registry itself** (YAML / typed-facts, authoritative — no hardcoded logic); (b) the **thin evaluator** signature (`map` over registry, the `resolve_panel` pattern); (c) the **introspection contract** — schema + `explain(instance) → {rules fired + evidence, rejected, out-of-scope}`; (d) an **audit hook** (every threshold → typed fact; every rule → source facts).
- Wrap in a spec at `docs/_internal/incoming/{entity}-registry.md` in the per-animal-index shape: why-it-exists / taxonomy-from-first-principles / the distinctions it must preserve / architecture / **THE REGISTRY** / validation (rule 19) / out-of-scope / engine-gaps. The prose serves the registry, not the reverse.

## Close-out (every run)

- **Capabilities additions** → append Phase-1 corpus gaps + new `[ENGINE-GAP]` flags to `docs/_internal/redesign/01-capabilities.md`.
- **ROADMAP intake (rule 11)** → add a Feature for this entity under **Area 15 (Declarative Entity Registries)**, tagged `interpretation engine`, cross-linked to the spec.
- **TODO** → add an implementation item `### {ENTITY}-REGISTRY: …` tagged `autopilot: needs-user` (registry is design-bearing), `kind: spec→implement`, linking the spec.
- **IA decisions** → propose candidate `Dn` entries for the IA repo (`../sendex-ia/DECISIONS.md`) for any typing call — **ratify-first**; do NOT unilaterally encode contract-spine changes.

## Discipline (non-negotiable)

Ratify-first (spine changes proposed, never encoded) · self-falsify your own typing/recommendation before presenting (especially under repeated delegation) · name falsification targets, don't pre-specify (over-fit guard: one case ≠ a general rule) · carry the honesty rules **as data states** · cross-entity reconciliation (reuse already-typed siblings' rules/definitions; don't double-define; reconcile state/categorical vocabularies against B-2 + siblings and register the rule-18 contract-triangle — see Phase 3) · two-repo split (registry + spec + capabilities + ROADMAP/TODO → pcc; IA decisions `Dn` → sendex-ia).
