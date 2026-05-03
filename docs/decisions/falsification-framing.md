# Falsification Framing for High-Stakes Subjective Skills

**Date:** 2026-05-02

**Trigger:** Cross-paper analysis (Liu & Fan 2026 J&J translational concordance; Liu/Zeng/Liu 2026 MoSciBench; Seal/Bender 2025 ML-toxicity review) prompted a question of what those literatures contribute to Lattice. Most of their content rebrands gates Lattice already has (contract triangles ≈ applicability domain, rule 16 ≈ data-leakage detection, fresh agents ≈ independence). One gap was real: **Lattice has heavy mechanical gates and ground-truth ratchets, but no structural defense against drift on subjective load-bearing judgments where there is no ground truth.**

This doc names the gap, picks a single hardening, and stages a canary-first rollout.

---

## The gap

Existing Lattice guardrails against LLM non-determinism:

| Mechanism | What it protects against |
|---|---|
| Fresh-agent review (`peer-review`, `architect-reviewer`, `decision-auditor`, `post-impl-reviewer`) | Within-conversation reinforcement; confirmation bias inside a single session |
| Cycle gates (research → blueprint → build → review → archive) | Premature implementation; missing-phase outputs |
| Validation ratchets with ground truth (test pass rates, audit baselines, signal-detection scores, contract-triangle audits) | Measurable code-quality drift |
| Typed knowledge graph (rule 22) | Atomic-fact contradictions; selective citation of un-typed prose |
| Mechanical attestations (`rule-attestations.yaml` dispatcher, `commit-intent` rule 23) | Drift in mechanical commit hygiene |

What none of the above catches: **drift on subjective load-bearing judgments** — research-cycle's "is this hypothesis well-supported?", architect-review's "is this overengineered?", peer-review's "is this method sound?", synthesize's "does the gap map to this capability?". Fresh agents don't help if the *prompt structure itself* invites confirmation: every reviewer asked "is X correct?" can lazily say "looks reasonable" and pass. Cycle gates don't help because the gate IS the subjective verdict. Ratchets don't help because there is no ground truth to ratchet against.

Empirical signature: a load-bearing claim ("approach A is sound", "the evidence supports B", "this is within scope") gets cited downstream, then later turns out wrong, and the bug-stress retro asks "which gate missed it" and the answer is "peer-review approved without the evidence to do so." This is the failure mode rules 19 and 21 try to gate against post-hoc — at *implementation* time, not at the moment the subjective judgment was made upstream.

## The hardening

**Flip the framing on the high-stakes subjective skills from "evaluate" to "falsify."** Every load-bearing claim that the artifact under review rests on must produce one of two outputs:

- **(a) a concrete counterexample with citation** — e.g., "FACT-018 contradicts this; the cited dataset has N=4 in the relevant stratum; rule 22 forbids this fact_kind in this scope"
- **(b) an explicit bounded-negative search trace** — e.g., "searched: knowledge-graph fact_kinds [clinical_threshold, hcd_baseline]; literature notes filtered to [tox in non-rodent, n>30]; codebase modules [confidence.py, classification.py]. No counterexample found within these bounds. Outside-scope: [pre-2020 literature, biologics-specific evidence]"

Output (b) is the load-bearing innovation. A model asked "is this correct?" can pass cheaply with "looks fine." A model asked "give me a counterexample OR bound your negative search" cannot pass cheaply — bounded-negative output is mechanically auditable: did the bounds actually cover the claim's scope? If the claim is "this approach works for biologics" and the bound says "searched small-molecule literature only," verdict auto-downgrades to insufficient-evidence.

This stacks with what Lattice already has:
- Fresh agents do falsification independently
- Cycles run falsification at phase boundaries
- The typed knowledge graph IS the search scope for negative bounds
- The audit script (Phase 3) becomes the mechanical post-check

## Why this specifically

Three alternative hardenings considered and rejected:

| Alternative | Why rejected |
|---|---|
| Eval suite measuring skill-output drift across paraphrases (Liu & Fan supp methodology) | Measures an assumed property. User's existing investments (fresh agents, cycles, ratchets) already encode the assumption that drift exists. Measurement without a hardening attached is busy-work. |
| Typed-schema outputs for skill outputs | User is already on this trajectory (rule 22, contract triangles, knowledge-graph fact schema). Marginal addition. |
| Cross-run agreement (run peer-review N times, require consensus) | Expensive. Consensus on a wrong answer is still wrong. |
| Applicability-domain declaration on outputs | Easy to game — "AD = scope of cited evidence" without auditing whether evidence actually covers the use site. |

Falsification framing is the one structural change that makes lazy approval *mechanically harder* rather than measuring it after the fact.

## Scope — which skills get this

**In scope (Phase 2-3 rollout):**
- `agents/peer-review.md` + `commands/lattice/peer-review.md` — load-bearing claims in the artifact under review
- `agents/architect-reviewer.md` — simplification claims (every "this is accidental complexity" needs bounded-negative on "I searched for an essential-complexity reason and found none")
- `agents/decision-auditor.md` — merit-driven decisions (every "the rationale stands up" needs bounded-negative on disqualifying conditions)
- `commands/lattice/research.md` — gap-claim sections of `--landscape` and `--deep` modes (every "no prior work on X" / "this is unaddressed" needs bounded-negative search trace)

**Out of scope (no falsification framing):**
- Routine/mechanical skills (`/sweep`, `/commit`, `/check`, `/lint-knowledge`) — outputs are already mechanically verifiable
- Implementation skills (`/implement`, `/build-cycle`) — verdicts come from tests/build, not subjective judgment
- Generation skills (`/distill`, `/synthesize`) — produce artifacts that go INTO peer-review/architect-review, where the falsification fires

## `--novel` disambiguation

There are two distinct `--novel` concepts in Lattice; an earlier draft of this doc conflated them.

**`peer-review --novel` (already exists, R2-only, source-hunting mode):** R2 reviewer deliberately hunts sources R1 missed (recent, niche, contrarian, underindexed). Already has a Verify-Before-Citing Gate (DOI / PubMed / journal verification with VERIFIED / BLOCKED / NOT-FOUND tagging). Falsification framing applies to *the gap claims R2 produces about R1's missed sources*, not to absence-claims in general. Treated as a normal R1-style falsification: each "R1 missed source X" claim must produce concrete-citation or bounded-negative.

**`research` mode flags (`--landscape`, `--deep`; no `--novel`):** Research's gap-claim outputs ("this is an open problem", "no prior work covers X") are absence-claims that need bounded-negative discipline. **No new `--novel` flag.** Falsification framing applies to existing gap-claim sections of `--landscape` and `--deep` outputs. Adding a third mode would be unprompted scope creep (rule 13).

## Phasing

**Phase 1 — design doc (this file).** No code changes.

**Phase 2 — canary on `peer-review` only.** Amend `agents/peer-review.md` and `commands/lattice/peer-review.md` to require per-claim bounded-negative output for R1 reviews. No audit script yet — manual inspection of the next 3 R1 outputs. Run merit test:

> Did at least one of the next 3 R1 reviews surface a load-bearing claim that, under bounded-negative discipline, couldn't be defended (i.e., the agent had to either narrow the claim's scope or produce a concrete counterexample that R1 would have missed under approval-mode framing)?

If yes → proceed to Phase 3. If no → kill the framing; the existing review discipline was already adequate, and adding ceremony without payoff violates rule 13.

**Phase 3 — full rollout.** Amend `agents/architect-reviewer.md`, `agents/decision-auditor.md`, `commands/lattice/research.md` (gap-claim sections of `--landscape` and `--deep`), and `commands/lattice/peer-review.md` `--novel` mode (R2 missed-source claims). Add `scripts/check-falsification-bounds.py` audit script. Wire into pre-merge gate via existing rule-attestations dispatcher.

**Phase 4 (deferred until evidence)** — extend to other subjective-judgment skills if they show the same drift signature (named candidates: `synthesize` capability-mapping, `design` UX-decision rationale, `distill` thesis claims). Each candidate needs its own merit test before adoption — falsification framing has overhead and shouldn't be applied prophylactically.

---

## Phase 1 — technical specification

### Claims-extraction slot format

Every artifact under falsification-mode review must surface a `Load-Bearing Claims` block at the top of the review output, before any verdict:

```yaml
load_bearing_claims:
  - id: LBC-1
    claim: "Approach X is appropriate for biologics in non-rodent studies"
    scope:
      modality: ["biologic"]
      species: ["dog", "monkey"]
      study_type: ["repeat-dose", "single-dose"]
    upstream_dependency: "Spec § 3.2 cites this to justify the dose-margin formula"
  - id: LBC-2
    claim: "No prior literature addresses this gap"
    scope:
      domain: "preclinical-to-clinical translational concordance"
      time_range: "any"
      databases: ["any"]
    upstream_dependency: "Research synthesis § 2.1 anchors the novelty-of-contribution argument"
```

Slot rules:
- The reviewer extracts these from the artifact, not the author. Forces the reviewer to read for *what the artifact rests on*, not *what it claims*.
- `scope` is required. A claim with no scope cannot be falsified — author or reviewer must add it before review proceeds.
- `upstream_dependency` makes the cost of a bad claim visible — what breaks downstream if this is wrong?
- Empty `load_bearing_claims` is a valid output IFF the artifact makes no load-bearing claims (rare for review-stage artifacts; common for mechanical outputs). The reviewer must justify the empty list, not return it implicitly.

### Bounded-negative output schema

For each `LBC-N`, the falsification output must be one of:

```yaml
falsification:
  - claim_id: LBC-1
    verdict: refuted          # refuted | bounded-negative | uncertain
    counterexample:
      citation: "FACT-018 in knowledge-graph.md (Hewitt 1989, n=12 dog ALT baselines)"
      argument: "FACT-018 establishes a dog-specific ALT baseline that contradicts the assumed cross-species threshold; the spec applies the small-molecule LR+ to a biologic study, but Liu & Fan SOC-level LR+ for biologic dog hepatobiliary is 1.5, not 3.5."
    downstream_action: "Spec § 3.2 must restrict to small-molecule modality OR cite a biologic-specific source"
```

```yaml
falsification:
  - claim_id: LBC-2
    verdict: bounded-negative
    search_bounds:
      databases: ["PubMed", "knowledge-graph fact_kinds: [translational_concordance, hcd_baseline]", "docs/_internal/research/literature/"]
      time_range: "2010-2026"
      languages: ["English"]
      query_terms: ["preclinical translational concordance", "animal-to-human SOC LR+", "Olson 2000 follow-up"]
      excluded: ["pre-2010 literature", "non-English sources", "regulatory-process literature (FDA review process, ICH guidelines)"]
    no_counterexample_found: true
    bound_audit:
      claim_scope_field: "time_range: any"
      bound_scope_field: "time_range: 2010-2026"
      coverage: insufficient
      gap: "Pre-2010 literature includes Olson 2000 (canonical 71% concordance), Tamaki 2013, Clark 2015 — all directly relevant to this claim. Bound does not cover claim scope."
    downstream_action: "Reviewer must extend search to pre-2010 OR claim scope must narrow to 'no post-2010 prior work'"
```

```yaml
falsification:
  - claim_id: LBC-3
    verdict: uncertain
    reason: "Claim scope includes [non-rodent biologic translational margins] but neither knowledge-graph nor literature corpus has a fact in this scope. Cannot construct counterexample (no contradicting fact); cannot construct defensible bounded-negative (no positive evidence either)."
    downstream_action: "Claim must be flagged as `confidence: insufficient` per knowledge-graph confidence-tier rules; cannot ground downstream decisions."
```

Schema rules:
- `verdict: refuted` requires a `counterexample` block with citation and argument
- `verdict: bounded-negative` requires `search_bounds` AND `bound_audit` showing coverage match between claim scope and bound scope
- `verdict: uncertain` is the honest output when neither refute nor defensible bound is constructible — auto-routes to insufficient-evidence downstream
- A reviewer that returns `bounded-negative` with `coverage: sufficient` but the audit script disagrees gets the verdict auto-downgraded to `uncertain`

### Audit-script behavior (Phase 3)

`scripts/check-falsification-bounds.py` runs at pre-merge for any artifact carrying a `falsification:` block. For each `bounded-negative` verdict:

1. Parse `claim_scope` from `load_bearing_claims[N].scope`
2. Parse `bound_scope` from `falsification[N].search_bounds`
3. For each scope axis (modality, species, time_range, databases, etc.):
   - Compare claim scope to bound scope
   - Flag axes where bound is narrower than claim
4. If any axis flags → emit `BOUND-INSUFFICIENT` defect with claim-id and axis names
5. `BOUND-INSUFFICIENT` blocks merge unless `verdict` is downgraded to `uncertain`

Audit logic is mechanical scope-comparison, not semantic — it checks whether bound axes are subsets of claim axes, not whether the bound is "good enough" in some semantic sense. The agent is responsible for the latter; the audit is responsible for catching the former (the more common failure mode).

### `--novel` adaptation in `peer-review` (Phase 3)

R2 with `--novel` flag produces a Novel Source Discovery table. Each row claims "R1 missed this source" — a load-bearing claim of shape "R1's literature scope was incomplete." Falsification framing on these:

- Each missed-source claim is an `LBC-N` with scope = "what kind of source R1 missed" (year, venue type, methodology, etc.)
- Falsification: either (a) cite a specific R1 search-bound that should have caught this source but didn't, OR (b) bounded-negative on R1's scope-coverage
- Existing Verify-Before-Citing Gate stays — runs *before* falsification (a NOT-FOUND source can't anchor a missed-source claim regardless of falsification framing)

### Adaptation in `research --landscape` / `--deep` gap-claim sections (Phase 3)

Research outputs typically contain claims of shape "this is an open problem" / "no prior work covers X" / "branch Y is unaddressed." Each such claim becomes an `LBC-N` with scope = "field/time/methodology where novelty is being asserted."

The Phase 0 corpus-load step already names what's known (the "Already Known" section). Falsification extends this: every gap-claim must show its bounded-negative search beyond the corpus-load scope. If the gap-claim says "no prior work" but the bound says "searched the existing research corpus only," verdict auto-downgrades — the corpus-load IS the existing-knowledge baseline, and a gap-claim must search beyond it.

This integrates with `scripts/audit-novel-source-discovery.py` as a second-axis check: that script audits the source LIST for novelty; the bound-audit audits the search SCOPE for adequacy.

### What stays unchanged

- `peer-review --novel` Verify-Before-Citing Gate (already in `commands/lattice/peer-review.md`)
- Existing 7-section review structure (falsification adds a Section 0 for claims extraction, before existing sections)
- `architect-reviewer` PASS / SIMPLIFY / REJECT / SCIENCE-FLAG verdict system (falsification adds a per-finding `falsification:` block but doesn't change the verdict vocabulary)
- Cycle structure (research-cycle, blueprint-cycle, build-cycle) — falsification fires inside the existing review steps, not as a new phase
- `--landscape` / `--deep` modes in research — no new mode added

## Merit test (gate to Phase 3)

Run Phase 2 canary on the next 3 R1 reviews. Phase 3 ships if:

> ≥1 of 3 R1 reviews produces a `falsification:` block where the original review approval-mode framing would have passed, but the bounded-negative discipline either (a) surfaced a counterexample, or (b) forced the reviewer to narrow the claim's scope, or (c) flagged the claim as `uncertain` due to insufficient evidence.

Phase 3 is killed if all 3 R1 reviews produce defensible bounded-negative output on first attempt with no scope narrowing — that means the existing review discipline was already adequate and the framing adds ceremony without payoff (rule 13).

The merit test is binary and pre-committed. It is not "did the falsification feel rigorous" — it is "did it surface something that approval-mode would have missed."

## Cross-references

- Triggering analysis: this conversation, 2026-05-02. Liu & Fan 2026 supp PDF, Liu/Zeng/Liu 2026 (MoSciBench, ICLR), Seal/Bender 2025 (Chem Res Toxicol).
- CLAUDE.md (parent project): rules 12 (merit-driven), 13 (no unprompted deferrals), 19 (algorithm defensibility), 21 (algorithm-as-advisor), 22 (atomic facts in typed graph)
- Existing falsification-adjacent infrastructure: `agents/peer-review.md`, `agents/architect-reviewer.md`, `agents/decision-auditor.md`, `commands/lattice/peer-review.md` (Verify-Before-Citing Gate), `scripts/audit-novel-source-discovery.py`, `scripts/audit-peer-review-citations.py`
