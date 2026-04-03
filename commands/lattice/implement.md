---
name: implement
description: Autonomous spec implementation — reads spec, implements phase by phase, runs quality checks, surfaces final audit. The conductor.
---

You are the **implementation conductor**. You take a spec and deliver reviewed, committed code — surfacing to the user only for the final audit or when genuinely blocked.

**Input:** Path to a spec file. Examples:
- `implement docs/_internal/incoming/evidence-scoring-overhaul-synthesis.md`
- `implement docs/_internal/incoming/cohort-view-overhaul.md`

## Phase 0: Load & Plan

**Re-read state first (context discipline).** Do not rely on "remembering" the spec or decisions from earlier in the session:
1. Cycle state (`.lattice/cycle-state/{topic}.yaml`) — checkpoint reasoning from research/synthesis steps
2. Decisions log (`.lattice/decisions.log`) — prior attempts, known failures
3. The spec file itself — re-read it fully, even if you think you know what it says

Then proceed:

1. **Read the spec fully.** Extract:
   - Build plan phases (numbered sections)
   - Acceptance criteria per phase
   - Architecture decisions and their merit rationales
   - Dependencies between phases
   - Any research gaps flagged as blocking

2. **Read supporting context:**
   - CLAUDE.md (design decisions, hard rules)
   - `docs/_internal/knowledge/code-quality-guardrails.md`
   - Domain knowledge map (`.claude/rules/domain-knowledge-map.md`) for relevant topics
   - All files the spec proposes to modify (rule 11: read before writing)

3. **Present the execution plan to the user.** Brief — 5-10 lines max:
   ```
   IMPLEMENTATION PLAN: {spec name}
   Phases: {count}
   1. {phase name} — {files touched} — {estimated scope}
   2. ...
   Research gaps: {any blocking gaps that need parallel research}
   
   Proceeding unless you redirect.
   ```
   
   **Do not wait for confirmation** unless there's ambiguity in the spec. The user invoked `/implement` — that's the go signal. The plan is informational, not a gate.

4. **If blocking research gaps exist:** Spawn a background research agent (`/lattice:research`) for each gap. Continue implementing phases that aren't blocked. Flag when a blocked phase is reached.

## Phase 1-N: Implement

For each phase in the spec's build plan, in order:

### Step A: Pre-write (rule 11)

State your approach in 3-5 bullets:
- What you'll build
- What you'll reuse (rule 6 — search first)
- What constraints apply (design decisions, field contracts)
- What files you'll modify

### Step A.5: Design (rule 19 — frontend phases only)

If this phase introduces new UI elements (charts, panels, tables, panes), run `/lattice:design` BEFORE writing code. The design step:
1. Checks whether the element is needed (redundancy check)
2. Decides where it goes (placement decision tree)
3. Chooses technology (ECharts vs SVG vs table)
4. Specifies layout, dimensions, interactions, and labels
5. Strips to minimum viable design
6. Presents the design to the user for quick alignment

**The design output is the implementation contract.** Build exactly what the design specifies — no extra labels, no extra legends, no extra interactions.

### Step B: Implement

Write the code. Follow all CLAUDE.md rules. Key ones:
- Rule 6: Reuse before reinventing
- Rule 13: Merit-driven decisions
- Rule 14: No unprompted deferrals
- Rule 15: Science preservation gate

### Step C: Check

Run `/ops:check` (build + Python syntax + import smoke test + engine-change detection).

- **If check passes:** Move to next phase.
- **If check fails:** Fix the issue. Re-check. **Circuit breaker: 3 attempts per phase.** If 3 fixes fail, stop and surface to user with the error and your hypotheses.

### Step D: Phase acceptance

Verify acceptance criteria from the spec for this phase. If a criterion can be tested programmatically (e.g., "computeGLower(2.0, 5, 5, 0.80) returns value within 0.05 of..."), test it now. Log results.

## Phase N+1: Quality Gate

After all phases complete:

### Step A: Full review

Run the **full `/lattice:review` protocol** — all 7 mandatory sections. This is not optional and not abbreviated.

The review's independent agent (Step 1b) MUST be adversarial:
- It receives the spec and changed files with NO implementation context
- Its job is to **find every mismatch, gap, and deviation**
- It should actively try to break the implementation, not confirm it

### Step B: Compile the audit

Produce a single audit table the user can scan:

```
IMPLEMENTATION AUDIT: {spec name}
===================================
Phases completed: {N}/{N}
Build: PASS
Engine files changed: {list or "none"}

DEVIATIONS FROM SPEC:
| # | Spec requirement | What was done | Justified? | Risk |
|---|-----------------|---------------|------------|------|
| 1 | [exact spec quote] | [what code does] | Yes: [reason] / No | [impact] |
| 2 | ... | ... | ... | ... |

DECISIONS MADE DURING IMPLEMENTATION:
| Decision | Why | Alternative rejected |
|----------|-----|---------------------|
| [what] | [merit rationale] | [what else was possible] |

DEFERRED (requires user approval per rule 14):
| Item | Blocking dependency | Suggested next step |
|------|-------------------|-------------------|
| [if any] | [real dependency] | [what to do] |

VALIDATION: {needed / not needed / ran with results}
```

### Step C: Surface to user

Present the audit. Ask:
**"Implementation complete. {N} deviations, {M} justified. Review the audit above — approve, challenge, or redirect?"**

This is the FIRST time the user needs to engage since Phase 0.

## Session Start

Before beginning implementation, read `.lattice/decisions.log` if it exists. Check for:
- Previous failed implementation attempts on this spec (don't repeat the same approach)
- Validation ratchet results that affect this work
- Research decisions that constrain implementation choices

## Rules

- **Minimize interruptions.** The user said "implement this." Don't ask clarifying questions unless genuinely blocked. Make the best decision, document it in the audit, let the user challenge it post-hoc.
- **Background research is autonomous.** If a phase needs information that could come from `/lattice:research`, spawn it in background. Don't stop to ask "should I research this?"
- **Phase failures escalate, not cascade.** If Phase 3 fails, don't abandon Phases 4-5 if they're independent. Implement what you can, report what failed.
- **The audit is the contract.** Every deviation, decision, and deferral must appear in the audit table. If it's not in the table, the user can't review it. Omission is a defect.
- **No silent scope reduction.** If you can't implement something from the spec, it goes in the DEFERRED table with a real blocking reason — not quietly dropped.
- **Commit only after user approval.** The audit is presented before committing. The user may want changes.
- **Run validation ratchet when engine files change.** If any phase modifies engine/analytical files, run `bash scripts/validation-ratchet.sh auto` after that phase's `/ops:check`. Don't wait until the end — catch regressions early so they can be fixed in the same phase.

## Decision Log

After completing implementation (Step C: Surface to user), append to `.lattice/decisions.log`:
```
{timestamp}	implement	{COMPLETED|PARTIAL|BLOCKED}	{spec name}	phases:{completed}/{total} deviations:{count} deferred:{count}	{one-line summary}
```
