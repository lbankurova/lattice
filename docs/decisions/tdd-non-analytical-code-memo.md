# Decision Memo: TDD for Non-Analytical Code

**TODO entry:** `lattice/TODO.md` LIT-06 (narrowed 2026-04-26)
**Author:** lattice (autopilot, opus 4.7)
**Date:** 2026-04-28
**Question:** Given that F2 (property-based testing in `lattice-framework-redesign-spec.md` §4) covers the analytical core, should test-first discipline (TDD) be **mandated** for non-analytical code (React UI, plumbing, frontend utility modules)?
**Source argument:** `lattice/docs/literature/obra-superpowers.md` (TDD as universal practice — open question logged in the literature note's "Evaluated and not borrowed" section).

---

## 1. Bug-class breakdown

Reviewed all 30 entries in `pcc/docs/_internal/BUG-SWEEP.md` (BUG-001..BUG-034, with BUG-002/006/030 still open/triaged).

### (a) Analytical defects — F2 territory (14 bugs)

Algorithm logic, statistical functions, classification thresholds, gate composition, dedup invariants:

| Bug | Headline |
|---|---|
| BUG-013 | Williams critical-value table biased upward (52 entries off) |
| BUG-016 | Adversity classifier misaligned with STP/ESTP consensus |
| BUG-019 | Sentinel BW confounding gate missing absolute-OM check |
| BUG-020 | Onset attention false-positives + species not threaded to sex concordance |
| BUG-022 | `severity_grade_counts` None crash corrupts 463 MI findings |
| BUG-024 | Protective syndrome PEX gates direction-unaware |
| BUG-025 | HCD BW non-deterministic SQL `MAX(duration_days)` |
| BUG-026 | `target_organ_summary` count inflation (missing dedup) |
| BUG-027 | C6 trend / E5 dedup invariant failures (39 latent) |
| BUG-028 | Exclusion preview no day/dose scoping (g=8.43 wrong-bucket) |
| BUG-031 | NOAEL "below tested range" — `computeNoaelForFindings` over-fires on NS sign-flips |
| BUG-032 | NOAEL terminal-day field-naming drift (`day_start` vs `day`) |
| BUG-033 | WoE C1/C3/C4 finding-level vs per-dose tightening |
| BUG-034 | C7 corroboration evaluator unwired despite registry shipped |

### (b) Display / plumbing with scientific consequence (7 bugs)

Algorithm computed correctly upstream but the user-visible value was wrong, missing, or stripped:

| Bug | Headline |
|---|---|
| BUG-002 | LOO pane (2 subjects) vs distribution chart (~10) cardinality mismatch |
| BUG-009 | Recovery effect-size bar chart shifted one dose left, top dose dropped (`compactifyEffectSize` double-`slice(1)`) |
| BUG-011 | `loo_control_fragile` field stripped by `mapFindingsToRows`; badge format wrong |
| BUG-018 | Sentinel frontend types referenced `mean_instability`; backend produced `pct_destabilising`; LOO data unrendered |
| BUG-021 | NOAEL `below_tested_range` not distinguished in UI; missing `formatNoaelDisplay()` helper across 5 surfaces |
| BUG-023 | LOO chart empty on PointCross BW: hook iterated `loo_influential_subject` (single worst per finding) instead of `loo_per_subject` keys |
| BUG-029 | User edits (study renames, annotations) reverted on refresh — global 5-min staleTime + IndexedDB persister |

### (c) Pure plumbing (12 bugs, with BUG-015 borderline)

Wiring/build/cache/UX-framing without scientific user-visible wrongness:

BUG-001 (LOO global vs pane-local framing), BUG-003 (reference label clipping), BUG-004 (Ctrl+click standardization), BUG-005 (D-R error bars on hover), BUG-007 (LOO marker swatch color), BUG-008 (parameterized ETag stale 304), BUG-010 (cohort rail click collapse vs navigate), BUG-012 (onset dose override no-op), BUG-014 (pattern override reset button hidden for null `originalKey`), BUG-015 (STD10 mortality double-count — borderline (a)/(c)), BUG-017 (CBER vaccine None-to-float64 crash), BUG-030 (field-contract-sync registry drift).

**Headline:** 14 / 7 / 12 (with BUG-015 borderline).

---

## 2. Counterfactual: would mandated TDD have caught (b)?

Per CLAUDE.md rule 19 the burden is whether **a pre-written test would have fired**, not whether tests in general are valuable.

| Bug | Plausible pre-written test | Would TDD-first have caught it? |
|---|---|---|
| BUG-002 | `LooSensitivityPane.test.tsx` asserting "pane subject set ≡ chart marker set" with a real fixture | **No.** The mismatch was a *semantic-divergence* bug across two consumers of two real backend fields. A unit test on either consumer passes. The test that would catch it is a *cross-component invariant fixture test* — exactly the kind a developer working on either component is unlikely to author first. |
| BUG-009 | `compactifyEffectSize.test.ts` with a recovery fixture (control pre-excluded) | **Yes**, *if* the test author thought to feed in already-control-excluded input. The bug was a hidden assumption (`s.data[0]` is always control). RED-GREEN-REFACTOR with a recovery fixture would have surfaced the assumption. Good fit for TDD. |
| BUG-011 | `mapFindingsToRows.test.ts` with `loo_control_fragile=true` | **Yes.** A field-presence test on the row-mapper is exactly the shape TDD produces. |
| BUG-018 | Type-equality test between `UnifiedFinding.ts` types and a generated backend fixture | **Partial.** The drift was ungate-able by component-level TDD; what would have caught it is contract-triangle hygiene (CLAUDE.md rule 18) — not TDD. |
| BUG-021 | `formatNoaelDisplay.test.ts` covering `below_tested_range` discriminator | **Yes — strong fit.** The bug *is* a missing formatter export. A TDD-first author asked to "format the NOAEL" would write a discriminator-table test with all method enum values, immediately reveal the missing branch. Canonical TDD use-case. |
| BUG-023 | `useInfluentialSubjectsMap.test.ts` against a fixture with cross-pairwise fragile subjects | **Maybe.** The bug was a wrong-field choice (`loo_influential_subject` vs `loo_per_subject`). A TDD-first author would still have to *know* which field to assert against. Hook-level test does NOT catch wrong-field-chosen-from-correct-set unless the test asserts cardinality against ground truth — which requires domain knowledge that TDD doesn't supply. |
| BUG-029 | `useStudies.test.ts` simulating mutate-then-refresh | **Yes**, but the test harness for IndexedDB-persisted React Query is non-trivial; a less-disciplined TDD author would test the hook in isolation (no persister) and miss it. Realistic TDD likely misses this. |

**Counterfactual yield:** of 7 (b)-class bugs, ~3 would have been caught by realistic TDD discipline (BUG-009, BUG-011, BUG-021). Two more (BUG-023, BUG-029) require fixture/integration discipline beyond unit-TDD. Two are cross-consumer invariant or contract-triangle bugs that TDD does not address (BUG-002, BUG-018).

---

## 3. Recommendation: **(B) — Mandate TDD for a defined narrow subset**

Rationale, merit-driven (CLAUDE.md rule 12, rule 13):

1. **Universal mandate is unjustified by the data.** Of the 12 (c) pure-plumbing bugs, the bulk are interaction/UX/cache/framing — TDD does not catch ECharts blur-state error-bar suppression (BUG-005), browser HTTP cache 304 staleness (BUG-008), Ctrl+click convention drift (BUG-004), or pandas dtype coercion at edge fixtures (BUG-017). Mandating TDD for these layers buys near-zero scientific defensibility while taxing every UI commit.

2. **The (b) bugs cluster into one identifiable subset.** 3 of 7 are pure-function transforms/formatters/mappers operating on the typed contract (`UnifiedFinding`, `noael_derivation.method`, row-mapping). That subset is exactly where TDD's canonical strengths apply: small input/output contracts, deterministic, no UI I/O, no cache layer.

3. **F2 already covers the analytical core.** Re-mandating it system-wide dilutes attention from F2's domain-grounded property catalog (per `peer-review.md` 2026-04-27 finding F2-CONDITIONAL).

4. **Effort is excluded as a factor**, but the *yield* differential is itself merit: mandating where TDD pays (formatters/mappers) preserves scientific-display defensibility; mandating where it doesn't (UI interaction, cache wiring) crowds out attention without yield.

### Subset definition

> **TDD MUST precede implementation when the change introduces or modifies a pure function that:**
> - **(i)** reads from `unified_findings.json` shape (typed contract `UnifiedFinding`, `noael_derivation`, `pairwise[*]`, `loo_per_subject`, etc.) AND transforms / re-shapes / formats values for display, OR
> - **(ii)** is a display formatter exported from `frontend/src/lib/` whose output a user reads as a scientific value (NOAEL label, dose label, p-value, effect size, severity grade, confidence text), OR
> - **(iii)** maps backend fields onto frontend row/object shapes consumed by ≥2 view components.

Scope explicitly **excludes** React component rendering, hook side-effects, ECharts/SVG chart implementation, route wiring, cache configuration, CSS/layout, and any code where the test harness would require browser/IndexedDB/Playwright simulation.

Cross-cutting bug classes outside this scope are addressed elsewhere: contract-drift via CLAUDE.md rule 18 (contract triangles); cross-consumer invariants via fixture tests called out in rule 16 (verify empirical claims against actual data); UI behavior via Playwright walks (rule 21 + ux-audit pipeline).

## 4. Proposed rule wording (lattice scaffold + CLAUDE.md candidate)

```
N. Test-first for typed-contract transforms. When introducing or modifying
a pure function in `frontend/src/lib/` that (a) reads from the typed
unified_findings contract and re-shapes/formats values for display, (b) is
a display formatter whose output a user reads as a scientific value, or
(c) maps backend fields onto row/object shapes consumed by 2+ view
components — the test file must be authored in the same diff and must
exercise the contract enum/shape exhaustively (every method discriminator,
every directional case, every field-presence permutation that the
function branches on).

Out of scope: React component rendering, hook side-effects, chart
implementation, route/cache wiring, CSS. Those are governed by Playwright
walks (rule 21), contract-triangle hygiene (rule 18), and fixture-against-
real-data audits (rule 16).

Failure mode prevented: BUG-009 (recovery effect-size off-by-one),
BUG-011 (loo_control_fragile field stripped), BUG-021 (formatNoaelDisplay
missing below_tested_range branch). Each was a pure-function transform on
the typed contract whose test could have been authored in <30 LOC ahead of
the implementation.
```

Implementation surface: pre-commit hook reading staged `frontend/src/lib/*.ts` diff; if the diff adds/modifies a function in scope and no `*.test.ts` sibling is in the same staged set, advisory warning (consistent with existing token-conformance hook posture per CLAUDE.md GAP-264). Promote to block once the scope set is empirically calibrated.

## 5. Empirical re-trigger signal (if recommendation lands as (B), revisit if)

Re-open as (A) — universal mandate — only if **either**:
- ≥3 (b)-class display-with-scientific-consequence bugs ship in the next 90 days where the responsible function is **outside** the rule's defined subset (i.e., the narrowed scope leaks), OR
- the next quarterly `/ops:sweep` retrospective surfaces a (b)-class bug whose pre-fix test would have been a non-pure React component test that a realistic TDD author would have written first.

Absent those signals, the narrow-mandate posture stays.

---

## Appendix: Excluded considerations

- **"Effort to write tests" / "velocity tax"** — excluded per CLAUDE.md rule 12.
- **"Playwright is enough for UI"** — Playwright walks catch interaction and visual regressions; they do *not* catch typed-contract transforms (BUG-009, BUG-011, BUG-021 each rendered visually plausible output until the user noticed numeric drift). Playwright and the (B) subset are complements, not substitutes.
- **"Contract triangles already cover (b)"** — partially. Rule 18 catches declaration↔enforcement↔consumption desync (BUG-018). It does not catch BUG-009-class hidden-assumption bugs in transform code that already reads valid contract input.
