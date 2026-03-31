---
name: synthesize
description: Ground research findings against existing codebase — map gaps to capabilities, produce implementation spec.
---

You are synthesizing research findings into an actionable implementation plan. Your job is to bridge the gap between "what's needed" (from `/research`) and "what we have" — then produce a spec for what to build.

**Input:** Path to a research document (from `/lattice:research`), e.g., `docs/_internal/research/historical-control-profiling.md`. If a peer review exists for this research, also read `docs/_internal/research/peer-reviews/{topic}-review.md` and incorporate accepted findings.

## Step 1: Load Research

Read the research document fully. Extract:
- The gap analysis (what's missing, what's wrong)
- The feature proposals (user outcomes)
- The source citations (for traceability)

## Step 2: Map Against Existing Codebase

For each proposed capability from the research:

1. **Search the codebase** — does something like this already exist? Check:
   - Backend services (`backend/services/analysis/`)
   - Generator pipeline (`backend/generator/`)
   - Frontend libraries (`frontend/src/lib/`)
   - Shared definitions (`shared/`)
   - Generated JSON (`backend/generated/PointCross/` as reference)
2. **Check knowledge files** — consult the domain knowledge map (`.claude/rules/domain-knowledge-map.md`) for relevant existing documentation
3. **Classify each capability:**
   - **EXISTS** — already implemented, research validates current approach
   - **PARTIAL** — foundation exists, needs extension to meet the research-identified need
   - **NEW** — nothing exists, build from scratch

## Step 3: Produce Capability Map

Write a table mapping research proposals to codebase reality:

| Research Proposal | Status | Existing Code | Gap | Priority |
|-------------------|--------|---------------|-----|----------|
| [user outcome] | EXISTS/PARTIAL/NEW | [file:function or "none"] | [what's missing] | [based on research-identified need severity] |

Priority comes from the research (how critical is the gap?), NOT from implementation effort.

## Step 4: Three-Section Output

The synthesis produces three sections. Each routes differently.

### Section 1: Build Plan

For capabilities classified as PARTIAL or NEW that are ready to implement:

- **What to build** — features with acceptance criteria
- **Architecture decisions** — evaluated on scientific/product merit (rule 13), not effort
- **Dependencies** — only real technical dependencies, not "would be simpler later" (rule 14)
- **Verification** — how to validate correctness

Follow the pre-write protocol (rule 11): state approach, identify reusable code, list constraints.

Routes to: `docs/_internal/incoming/` spec -> ROADMAP intake (rule 12)

### Section 2: Research Gaps

Topics needing more investigation before building. For each:

- **Question** — what needs answering
- **Blocking?** — does this block implementation, or can we build with a known limitation?
- **Suggested sources** — from the original research's source map
- **Priority** — based on how many build plan items depend on the answer

Routes to: next `/lattice:research` cycle

### Section 3: Data & Coverage Gaps

Missing data, species, study types, methods needing validation. For each:

- **What's missing** — e.g., "no HCD data for NHP clinical chemistry"
- **Impact** — e.g., "engine will over-classify NHP findings"
- **Blocking?** — prevents implementation or is a known limitation?
- **Acquisition path** — how to get the missing data

Routes to: `docs/_internal/TODO.md` or dedicated backlog

## Step 5: Peer Review Readiness

Flag scientific/method decisions in the build plan that should be challenged:

```
**Peer review recommended** on: [list of decisions]
Run: /lattice:peer-review docs/_internal/incoming/{topic}-synthesis.md
```

## Output

Write the synthesis to `docs/_internal/incoming/{topic}-synthesis.md`.

The build plan section is a standard incoming spec — subject to ROADMAP intake (rule 12). If a peer review was incorporated, link to the review file and note which findings changed the plan.

## Constraints

- **If the research says "need X" and we don't have it, the plan says "build X."** Do not downgrade to "defer X" or "approximate with Y" unless there is a genuine technical dependency blocking it NOW.
- **Merit-driven decisions.** If two approaches exist (one simpler but less scientifically correct, one harder but right), choose the right one. State the merit rationale.
- **Trace every plan item to a research finding.** No implementation tasks without a research-backed justification.
- **Don't add scope.** If the research didn't identify it as a gap, don't invent features. The research is the scope boundary.
- **Research gaps are not deferrals.** A research gap means "we need to learn more before deciding." A deferral means "we decided not to do it." Research gaps get a next `/lattice:research` cycle. Deferrals require user approval (rule 14).
