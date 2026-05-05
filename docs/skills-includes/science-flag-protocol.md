# SCIENCE-FLAG Resolution Protocol (canonical contract)

> **Not a skill.** Sited under `docs/skills-includes/` so it is not auto-discovered as a skill. Cited from `commands/lattice/{autopilot,architect,review,probe,prioritize}.md` to consolidate what was previously triplicated prose.
>
> **Authoritative statement** of the protocol. Skill prompts cite this file by name; CLAUDE.md cites this file by name. Neither references "rule N" — rule numbering varies between framework (lattice) and consumer (e.g., pcc) projects, and pinning the protocol's name to a number creates a drift hazard.

---

## What triggers a SCIENCE-FLAG

A SCIENCE-FLAG fires when **any** of the following holds:

1. A change alters analytical output (scores, classifications, verdicts, NOAEL values, severity assignments, onset determinations, syndrome detections, dose-response patterns, statistical-test selections, adversity classifications, target-organ identifications) for **any** input dataset.
2. The diff modifies — or consumes the output of — a function in `.lattice/algorithm-paths.txt` (default paths if absent: `**/derive-summaries.ts`, `**/endpoint-confidence.ts`, `**/findings-rail-engine.ts`, `**/cross-domain-syndromes.ts`, `**/syndrome-rules.ts`, `**/services/analysis/**/*.py` when the file mentions NOAEL/LOAEL/scoring/classification keywords).
3. Code cleanup, refactoring, or "simplification" changes scientific or analytical behavior — the science-preservation gate (CLAUDE.md "Science preservation" rule). Bare lint exemptions in domain logic are defects.

Any review agent (architect, decision-auditor, peer-reviewer, post-impl-reviewer, probe) can raise a SCIENCE-FLAG. The flag is logged in `.lattice/cycle-state/{topic}.yaml` under `science_flags:` and in `decisions.log`.

## What does NOT clear a SCIENCE-FLAG

The following rebuttals are **insufficient** — they answer the wrong question:

- "The plumbing still works / the toggle still flows through / the cache invalidates."
- "Spec-vs-code consistency check passes."
- "Build / lint / tests pass."
- "Architect verdict is SIMPLIFY or PASS on the same diff."
- "Mirror-pattern tests pass" (mirror tests don't exercise real generated output).
- Architect SIMPLIFY/PASS on the same diff (architectural merit is orthogonal to scientific defensibility).

A SCIENCE-FLAG asks: *"Does the analytical output reflect the data?"* — not *"is the code well-structured?"*

## How a SCIENCE-FLAG clears (three paths only)

A SCIENCE-FLAG clears in **exactly one** of three ways:

### Path 1 — Fix

Modify the algorithm or spec so the SCIENCE-FLAG no longer fires. The fix changes analytical behavior to match the data. Re-run the review; verify the flag is gone.

**When to use:** the flagged behavior is genuinely indefensible against the data.

### Path 2 — Data-grounded counter-evidence

Demonstrate, with citations, that the flagged behavior IS the correct output for the data. Two acceptable forms:

- **(2a) On-data verification.** Run the algorithm against PointCross + at least one other representative study using `backend/generated/{study}/unified_findings.json`; record the actual output (NOAEL value+tier, scores, classifications, etc.); answer in writing: *"Would a regulatory toxicologist agree this output represents the data?"* with a one-paragraph interpretation citing the actual pairwise/group values that drove the result.
- **(2b) Literature memo (autopilot-authored).** Author a decision memo with **≥3 citations** drawn from species profiles (`docs/_internal/knowledge/species-profiles.md`), methods-index (`methods-index.md`), or peer-reviewed sources in `research/` that justify either accepting the behavior or keeping the current complexity. The memo lands in `decisions.log` (kind: `science-flag-memo`) and is cited in the commit message.

**When to use:** the flagged behavior is correct; the science is on its side. (2a) is the strongest evidence and is required for review.md ALGORITHM CHECK. (2b) is the autopilot-autonomous path when no human is in the loop.

### Path 3 — Named-dependency defer

Defer addressing the flag to a named, future work item with an **explicit technical dependency** (not "we'll get to it later"). The defer must:

- Identify the dependency by name (e.g., "blocked on HCD percentile data not yet ingested for {species}").
- Log the defer in `decisions.log` (kind: `science-flag-defer`) and cite the dependency.
- Be re-evaluated when the dependency lands.

**When to use:** the flag is real but cannot be addressed in the current cycle without resolving an unrelated prerequisite.

## Autopilot vs human-driven mode

The protocol is the same in both modes; the *path of least resistance* differs:

| Mode | Default path | Escalation trigger |
|---|---|---|
| **Autopilot autonomous** | (2a) on-data verification preferred; (2b) literature memo acceptable when on-data verification is not feasible (data not yet ingested, etc.) | Cannot find ≥3 citations for (2b) AND cannot run on-data verification → row to `ESCALATION.md` |
| **Human-driven** | (1) fix or (2a) on-data verification | User decision; (2b) literature memo and (3) named-defer also valid with logged rationale |

Under autopilot, the gate's job is to *force the decision-with-rationale*, not to pause for an absent SME. Treating SCIENCE-FLAG as "wait for SME indefinitely" is itself a violation — it converts the gate into a parking lot.

## What gets logged

Every SCIENCE-FLAG resolution writes to `decisions.log`:

```
{ISO-timestamp}  science-flag-{cleared|deferred}  {topic}  {clearing-path}  {rationale-summary, ≥40 chars}
```

Where `{clearing-path}` is one of: `fix`, `data-grounded-counter-evidence-2a`, `literature-memo-2b`, `named-dependency-defer`.

The commit that clears the flag carries `Science-Flag: cleared` (or `Science-Flag: deferred`) as a trailer; the rationale lives in `decisions.log` for audit.

## Verdict-table boilerplate (cited from skill files)

Skill files invoke this protocol with a one-liner verdict cell. Canonical wording:

> **SCIENCE-FLAG** — Clears via the [SCIENCE-FLAG resolution protocol](../docs/skills-includes/science-flag-protocol.md) only: (1) fix, (2) data-grounded counter-evidence (on-data verification or literature memo with ≥3 citations), or (3) named-dependency defer. Plumbing-only rebuttals do NOT clear the flag.

## Anti-patterns

1. **"Wait for SME indefinitely."** The gate forces decision-with-rationale; it does not park work. If no SME is in the feedback loop (Claude-authored codebase), Path 2 or 3 still applies.
2. **Citing "generally accepted practice" or "standard tox knowledge" without source.** These are not citations — they are opinions. Path 2b requires explicit fact references (file paths, fact IDs, DOIs, or named regulatory documents).
3. **Plumbing-only rebuttal.** "The toggle works" / "the cache invalidates" / "build passes" → does not address whether the analytical output reflects the data. The flag remains.
4. **Architect SIMPLIFY clearing a peer-review SCIENCE-FLAG.** Different agents, different concerns. Architectural merit cannot clear scientific defensibility.
5. **Logging the resolution without a `Science-Flag:` trailer in the commit.** The trailer is how `decisions.log` correlates back to git history. Missing trailer = audit-trail break.

## Cross-references

- `commands/lattice/architect.md` (Step 3 verdict table; Mode 1 Risk classification; Anti-pattern 4)
- `commands/lattice/autopilot.md` (Step 3 SCIENCE-FLAG handling; Step 4 escalation criteria)
- `commands/lattice/probe.md` (verdict table; Anti-pattern about non-negotiable trigger)
- `commands/lattice/review.md` (SCIENCE-FLAG rebuttal protocol; ALGORITHM CHECK)
- `commands/lattice/prioritize.md` (autopilot-safe classification: SF with citable grounding is autopilot-safe)
- `docs/skills-includes/review-protocols.md` § ALGORITHM (on-data verification protocol — Path 2a expansion)
- CLAUDE.md "Algorithm defensibility on real data" rule (lattice rule 18, pcc rule 19) and "Science preservation gate" rule (lattice rule 14)
