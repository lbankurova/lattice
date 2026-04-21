# Spec Value Audit

Mandatory checklist when reviewing a spec, synthesis, or blueprint before approval for build cycle. Run BEFORE architect review signs off, not after.

**Purpose:** catch featuritis — specs that propose N features on categorical reasoning ("because we can") rather than per-feature evidence ("because this specific thing breaks X% of the time and scientists currently work around it by Y"). A spec that passes this audit has documented, per-feature value justification. A spec that can't pass gets reworked before implementation starts.

**Triggers:** any doc entering `docs/_internal/incoming/` that proposes more than one feature, UI surface, override, or pane. Specs proposing a single targeted change are lower-risk but still benefit from questions 1-3.

---

## Per-feature questions (mandatory)

For **every** feature / row / override / pane the spec proposes, the spec author must answer these in the doc itself (not in side channels):

1. **What concrete user problem does this solve?** One sentence. Not "the user might want to…" — "today, when X happens, the user is blocked because Y."

2. **Evidence of frequency:** how often does the problem occur? Numbers from the validation corpus, bug reports, user interviews, or production data. If "unknown," the spec must state that and explain why the feature should ship before the frequency is known.

3. **Current workaround:** what do users do today when this problem occurs? "They give up" is a valid answer; "they can't do anything" is a valid answer. "We don't know" is not.

4. **Downstream impact when unfixed:** which analyses / views / decisions are affected? How much? E.g., "wrong `control_type` invalidates every pairwise stat → all downstream NOAEL reasoning is suspect." Specific, not abstract.

5. **Cheaper alternative ruled out:** is there a lower-cost fix that handles the same problem upstream? Examples:
   - Better inference heuristic instead of user override
   - Data validation gate instead of override
   - Controlled-terminology normalization instead of override
   - Improved provenance surface instead of a parallel audit view
   The spec must state which alternatives were considered and why this feature is better.

6. **What exists already:** is there a shipped surface that covers this? Don't re-propose features under new names. If partial coverage exists, explain what's missing.

7. **Cost vs. value check:** rough LOC / surface-area estimate, weighed against the frequency × downstream-impact from #2 and #4. Is the value density positive? If the LOC estimate dwarfs the frequency × impact, flag and defer.

## Aggregate questions (at the spec level)

8. **Are the features orthogonal or categorical?** A spec that says "we infer 12 attributes, each needs an override" is categorical reasoning. A spec that says "3 of our 12 inferred attributes are mis-inferred in ≥5% of real studies, here are those three" is orthogonal reasoning. Categorical-reasoning specs usually fail questions 1-4 for most of their features — push back.

9. **Does the spec preserve shipped functionality?** Reference the list of already-shipped features (from recent commits, MANIFEST, ROADMAP). New work shouldn't silently replace working surfaces.

10. **Is the "related" surface (if any) a duplicate?** If the spec proposes a view/pane/panel that covers information already surfaced elsewhere (provenance warnings, banners, validation view), the spec must justify why a new surface is better than strengthening the existing one.

## Spec-reviewer output

At the end of the review, the checklist produces one of:

- **PASS** — per-feature answers are present and credible for every proposed feature.
- **SCOPE REDUCTION REQUIRED** — some features fail 1-6; spec needs rework to drop or justify them before proceeding. Reviewer writes a scope-challenge doc in `incoming/` enumerating which features fail.
- **EVIDENCE GAP** — frequency / impact data is insufficient; spec cannot be evaluated without a data pull from validation corpus or user interviews.

---

## Anti-patterns — automatic SCOPE REDUCTION REQUIRED

Any of these on their own is grounds for rework before build:

- "Every inferred X should be overridable" (categorical)
- "The user might want to correct Y" (speculative without evidence)
- A new audit view duplicating what provenance / validation / banner already surfaces
- A new UI surface with no per-row frequency justification
- A checklist, matrix, or table where N rows are proposed but only ~2-3 have documented problems
- Tier/confidence/badge systems applied uniformly to values that don't need them
- "Ship now, defer justification later"

---

## How to use this

**Spec authors** (research / synthesis / blueprint skills):
- Run the checklist on your own spec before sending for architect review. Answer 1-10 in the spec itself, per feature.
- If a feature can't meet the bar, cut it or flag it explicitly as "speculative, pending evidence."

**Architect-review skill** (`/lattice:architect`) or any reviewer:
- Run this checklist as the first pass. A spec that can't answer 1-10 doesn't get deeper review.
- Produce the output (PASS / SCOPE REDUCTION REQUIRED / EVIDENCE GAP) and stop if not PASS.

**Peer-review skill** (`/lattice:peer-review`):
- Use questions 1, 2, 4 to challenge feature claims from a domain expert lens. "You claim X is a problem — how often does it actually happen?"

**When a spec fails:** the reviewer produces a scope-challenge doc in `incoming/` listing which features fail which questions, and routes the spec back for rework. The scope-challenge doc serves as both the audit record and the rework brief.
