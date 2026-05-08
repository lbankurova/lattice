---
name: synthesize
description: Ground research findings against existing codebase — map gaps to capabilities, produce implementation spec.
---

You are synthesizing research findings into an actionable implementation plan. Your job is to bridge the gap between "what's needed" (from `/research`) and "what we have" — then produce a spec for what to build.

**Input:** Path to a research document (from `/lattice:research`), e.g., `<research-dir>/<topic>.md`. If a peer review exists for this research, also read `{{lattice.project.research.peer_reviews}}/{topic}-review.md` and incorporate accepted findings.

## Step 0: Re-read State (context discipline)

Do not rely on file contents or decisions "remembered" from earlier in the session. Context compression may have evicted them. Re-read from disk:

1. **Cycle state** (`.lattice/cycle-state/{topic}.yaml`) — what steps completed, what decisions were made, what constraints are in play
2. **Decisions log** (`.lattice/decisions.log`) — prior attempts on this topic, known failures to avoid
3. **Guardrails** (`{{lattice.project.docs.guardrails}}`) — current complexity budgets and canonical patterns

Then proceed to loading the research doc.

## Step 1: Load Research

Read the research document fully. Extract:
- The gap analysis (what's missing, what's wrong)
- The feature proposals (user outcomes)
- The source citations (for traceability)

## Step 2: Map Against Existing Codebase

**Read `{{lattice.project.docs.guardrails}}` first** (if it exists). This tells you which patterns are canonical, which modules are domain-critical, and what the current complexity budget looks like. Your synthesis must work WITH these patterns, not against them.

For each proposed capability from the research:

1. **Search the codebase** — does something like this already exist?

{{include:optional:project.skills.synthesize.codebase_dirs}}

2. **Check knowledge files** — consult the domain knowledge map (`{{lattice.project.docs.domain_knowledge_map}}`) for relevant existing documentation
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
- **Architecture decisions** — evaluated on scientific/product merit (Merit-driven decisions, CLAUDE.md), not effort
- **Dependencies** — only real technical dependencies, not "would be simpler later" (No unprompted deferrals, CLAUDE.md)
- **Verification** — how to validate correctness

Follow the Pre-write protocol (CLAUDE.md): state approach, identify reusable code, list constraints.

Routes to: `{{lattice.project.specs.incoming}}/` spec -> ROADMAP intake (Spec -> ROADMAP intake, CLAUDE.md)

### Section 1a: Reuse Inventory (mandatory)

For every NEW or PARTIAL capability in the build plan, document your search:

| Capability | Searched | Found | Reusing | Building New |
|------------|----------|-------|---------|-------------|
| [feature] | [where you looked — specific dirs/files/methods-index] | [what exists] | [what you'll call/extend] | [only what doesn't exist yet] |

This section is auditable evidence that Reuse before reinventing (CLAUDE.md) was followed. **Missing = incomplete synthesis.** The architect gate will reject a synthesis without a reuse inventory.

### Section 1b: Simplicity Rationale (mandatory)

For every new abstraction, config option, type, or utility proposed in the build plan:

| Proposed | Why not inline/direct? | Consumers | Alternatives rejected |
|----------|----------------------|-----------|----------------------|
| [new thing] | [specific reason it needs to exist as a separate unit] | [list every caller] | [simpler approaches and why they don't work] |

Rules:
- **1 consumer = inline it.** No abstractions with a single caller unless required for testability (and you specify the test).
- **Config options must justify variability.** "Might change later" is not justification. "Varies per study type, set in study_preferences.json" is.
- **New types must justify their existence.** If an existing type covers 90% of the need, extend it. Don't create a parallel hierarchy.
- **If the table is empty, say so.** "No new abstractions — all work extends existing patterns" is a valid and good answer.
- **Refactoring proposals must survive the pain-point test.** Before proposing an extraction or split: (a) read the actual code — a long file with well-extracted sub-components may need no action; (b) state the specific problem the refactor solves (duplication that drifts, untestable logic, blocks another change); (c) "the metric gets smaller" is not a problem. If the existing structure is already good enough, say so and move on. Marginal extractions waste implementation time and introduce risk for no real gain.

**Missing = incomplete synthesis.** The architect gate will reject a synthesis without simplicity rationale.

### Section 1c: Test Strategy (mandatory)

For every build plan item, specify the testing approach:

| Feature | Test Type | What It Asserts | Why This Level |
|---------|-----------|-----------------|---------------|
| [feature] | unit / integration / validation / none | [specific behavior being verified] | [why this test type is appropriate] |

Rules:
- **Domain logic (classification, statistics, scoring):** Integration tests with real data. Assert outputs, not internals. Mock nothing that's in-process.
- **Data transformations:** Unit tests with edge cases (empty data, single row, missing columns).
- **UI components:** Only if interactive behavior is non-trivial. Don't test that React renders.
- **Plumbing (API routes, type threading):** Type system covers it. No test needed. Say "type-safe, no test" explicitly.
- **"Test everything" is not a strategy.** Tests that mock everything and assert `toBeCalled()` are worse than no tests — they create false confidence and resist refactoring. Test observable behavior.

**Missing = incomplete synthesis.**

### Section 2: Research Gaps

Topics needing more investigation before building. For each:

- **Question** — what needs answering
- **Blocking?** — does this block implementation, or can we build with a known limitation?
- **Suggested sources** — from the original research's source map
- **Priority** — based on how many build plan items depend on the answer

**Persisted in Step 5** to `{{lattice.project.research.registry}}`.

### Section 3: Data & Coverage Gaps

Missing data, species, study types, methods needing validation. For each:

- **What's missing** — e.g., "no HCD data for NHP clinical chemistry"
- **Impact** — e.g., "engine will over-classify NHP findings"
- **Blocking?** — prevents implementation or is a known limitation?
- **Acquisition path** — how to get the missing data

**Persisted in Step 5** to `{{lattice.project.backlog.todo}}`.

## Step 5: Persist Gaps

The synthesis identified Research Gaps (Section 2) and Data Gaps (Section 3). These must be written to their persistent destinations NOW — not "routed to" later.

### Research gaps → Research Registry

For each research gap in Section 2, **append or update** `{{lattice.project.research.registry}}`:

```yaml
{gap-id}:
  status: researching
  conclusion: "{one-line description of what needs answering}"
  touches-subsystems: [{affected subsystems}]
  affects: [{related stream IDs}]
  depends-on: [{blocking streams}]
  open-questions: ["{the research question}"]
  source: "synthesize/{topic}"
  doc: null  # no research doc yet
```

If the gap relates to an existing stream, update that stream's `open-questions` instead of creating a new entry.

### Data gaps → TODO.md

For each data gap in Section 3, **append** to `{{lattice.project.backlog.todo}}`:

```
- [ ] **DATA-GAP: {short title}** — {what's missing}. Impact: {consequence}. Acquisition: {how to get it}. Source: `{topic}-synthesis.md`. [Area: {relevant area}]
```

**The gap is not logged until it's written to disk.** Mentioning it in the synthesis document is necessary but not sufficient — the synthesis is an incoming spec that gets archived after implementation. The registry and TODO.md are the durable homes.

## Step 6: Peer Review Readiness

Flag scientific/method decisions in the build plan that should be challenged:

```
**Peer review recommended** on: [list of decisions]
Run: /lattice:peer-review {{lattice.project.specs.incoming}}/{topic}-synthesis.md
```

## Output

Write the synthesis to `{{lattice.project.specs.incoming}}/{topic}-synthesis.md`.

The build plan section is a standard incoming spec — subject to ROADMAP intake (Spec -> ROADMAP intake, CLAUDE.md). If a peer review was incorporated, link to the review file and note which findings changed the plan.

## Constraints

- **If the research says "need X" and we don't have it, the plan says "build X."** Do not downgrade to "defer X" or "approximate with Y" unless there is a genuine technical dependency blocking it NOW.
- **Merit-driven decisions.** If two approaches exist (one simpler but less scientifically correct, one harder but right), choose the right one. State the merit rationale.
- **Trace every plan item to a research finding.** No implementation tasks without a research-backed justification.
- **Don't add scope.** If the research didn't identify it as a gap, don't invent features. The research is the scope boundary.
- **Research gaps are not deferrals.** A research gap means "we need to learn more before deciding." A deferral means "we decided not to do it." Research gaps get a next `/lattice:research` cycle. Deferrals require user approval (No unprompted deferrals, CLAUDE.md).
- **Six mandatory sections.** The synthesis output must contain: (1) Build Plan, (1a) Reuse Inventory, (1b) Simplicity Rationale, (1c) Test Strategy, (2) Research Gaps, (3) Data & Coverage Gaps. Missing any section = incomplete synthesis. The `/lattice:architect` gate will reject it.
- **Science preservation.** When proposing to simplify, refactor, or restructure existing code, state what analytical output changes. If any output changes, flag it explicitly in the build plan — the architect gate checks for this.

## Known Failure Modes

1. **Inferring capability from code structure.** When mapping research proposals to codebase reality (Step 2), read the actual generated output — not just function signatures. A function that exists but produces wrong/empty results is not "EXISTS."

2. **Threshold transplants from other domains.** Cohen's d thresholds (0.3, 0.5) from behavioral science are not validated for preclinical tox. Inbred strains have lower within-group variance, producing larger d for the same absolute effect. When proposing thresholds, state the domain they come from and flag if validation is needed.

3. **Conditional logic lost in format migration.** Converting complex domain rules to simpler data formats (e.g., string thresholds to numeric dicts) silently drops conditional logic. Check that the proposed format can express ALL current cases, not just the common ones.

4. **Anti-conservative defaults.** In toxicology, "conservative" means "more likely to flag a safety signal." A default that reduces adversity classification (e.g., D9=-1 for expected effects at unexpected doses) may be anti-conservative. Always verify direction.

## Decision Log

After completing synthesis, append to `.lattice/decisions.log`:
```
{timestamp}	synthesize	COMPLETED	{topic}	plan_items:{count} reuse:{count} new:{count} research_gaps:{count} data_gaps:{count}	{one-line summary}
```
