---
name: implement
description: Autonomous spec implementation — reads spec, implements phase by phase, runs quality checks, surfaces final audit. The conductor.
---

You are the **implementation conductor**. You take a spec and deliver reviewed, committed code — surfacing to the user only for the final audit or when genuinely blocked.

**Input:** Path to a spec file (typically under `{{lattice.project.specs.incoming}}/`).

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
   - `{{lattice.project.docs.guardrails}}`
   - Domain knowledge map (`{{lattice.project.docs.domain_knowledge_map}}`) for relevant topics
   - All files the spec proposes to modify (Pre-write protocol, CLAUDE.md: read before writing)
   - **All files cited as reuse anchors in the spec, even if you're not modifying them.** A `file.ext:LINE` citation is a contract -- the implementation must consume the cited file's symbols, not just copy its structure. Open each cited file and read the surrounding code at the cited line; do not read the line description alone. This is the structural fix for the colgroup-percentages-instead-of-col-w-classes failure mode (CLAUDE.md rule 5 strengthening, 2026-04-29).

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

### Step A: Pre-write (Pre-write protocol, CLAUDE.md)

State your approach in 3-5 bullets:
- What you'll build
- What you'll reuse (Reuse before reinventing, CLAUDE.md — search first)
- What constraints apply (design decisions, field contracts)
- What files you'll modify

### Step A.5: Design (Frontend UI gate — frontend phases only)

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
- Reuse before reinventing (CLAUDE.md)
- Merit-driven decisions (CLAUDE.md)
- No unprompted deferrals (CLAUDE.md)
- Science preservation gate (CLAUDE.md)

### Step C: Check

Run `/ops:check` (build + Python syntax + import smoke test + engine-change detection + visual smoke test).

`/ops:check` includes a visual smoke test when frontend files changed and Playwright MCP is available. If you see `Visual: FAIL`, fix the rendering issue before moving on — don't accumulate visual regressions across phases.

- **If check passes:** Move to next phase.
- **If check fails:** Fix the issue. Re-check. **Circuit breaker: 3 attempts per phase.** If 3 fixes fail, stop and surface to user with the error and your hypotheses.

### Step D: Phase acceptance

Verify acceptance criteria from the spec for this phase. If a criterion can be tested programmatically (e.g., "computeGLower(2.0, 5, 5, 0.80) returns value within 0.05 of..."), test it now. Log results.

**Empirical claim verification (Verify empirical claims, CLAUDE.md).** For every acceptance criterion that makes a numeric or cardinality claim about data behavior — examples: "count drops to ≤ 2", "shows N rows", "matches the chart", "subject appears on days 8, 15", "ratio < 0.8 on the driving pairwise" — you MUST run that claim against the project's actual generated output before marking the criterion PASS.

{{include:optional:project.skills.implement.empirical_verification_forms}}

**Mirror-pattern tests do NOT satisfy this.** A mirror test passes when implementation matches spec text; it cannot catch a spec that is wrong about the data. If you are writing a mirror test for a criterion that makes an empirical claim, you must ALSO add a fixture test that loads real generated output.

**If the criterion cannot be verified (e.g., data not generated yet, fixture missing)** — flag it as `UNVERIFIED-EMPIRICAL` in the deviations table. Do NOT silently pass. Unverified empirical claims are blockers, not footnotes.

This rule exists because empirical claims can pass code review while failing on real data: the build passes, the tests pass, all three review agents validate code-vs-spec, and the bug is only caught visually by the user post-commit. Empirical claims die in contact with data; catch the disconnect here, at the last moment you can fix it cheaply.

### Step E: Log discovered gaps

During implementation you often discover gaps that weren't in the spec — missing data for edge cases, research questions about domain behavior, untested assumptions. **Log them immediately, not at the end.**

- **Research gap** (needs investigation before deciding): append to `{{lattice.project.research.registry}}` as a new stream or `open-questions` entry on an existing stream. Set `source: "implement/{spec-name}/phase-{N}"`.
- **Data gap** (missing data, species coverage, validation): append to `{{lattice.project.backlog.todo}}` with `[Area: {relevant}]` tag.
- **Implementation gap** (code TODO, known limitation, deferred wiring): append to `{{lattice.project.backlog.todo}}` and add to the DEFERRED table in the final audit.

**`done-when:` probe (REQUIRED for artifact-asserting gaps; pre-commit-enforced).** A data/implementation gap that asserts a concrete buildable artifact (code symbol / generated-data field / file) MUST carry a `- **done-when:** \`<cmd>\`` line — a read-only shell command exiting 0 **iff the gap is already satisfied** — and you MUST run it and confirm it **FAILS** before filing. A probe that already passes means the work is done; record/close it, don't file it open. The pre-commit done-when filing-block (Step 0p) blocks otherwise. Parked (`waiting-data`/`blocked`/`needs-user`) and design/research gaps are exempt.

**A gap mentioned in conversation or in the audit table but not written to the registry or TODO is a gap that will be forgotten next session.** The audit is ephemeral — the registry and TODO survive.

## Phase N+1: Implementation Audit

After all phases complete, compile the audit. **Do NOT run `/lattice:review` here** — the build-cycle runs review as a separate step with full 7-section output. Implement's job ends at the audit table.

### Step A: Compile the audit

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

DEFERRED (requires user approval per No unprompted deferrals, CLAUDE.md):
| Item | Blocking dependency | Suggested next step |
|------|-------------------|-------------------|
| [if any] | [real dependency] | [what to do] |

VALIDATION: {needed / not needed / ran with results}

GAPS DISCOVERED DURING IMPLEMENTATION:
| Gap | Type | Persisted to | Phase |
|-----|------|-------------|-------|
| [description] | research / data / implementation | REGISTRY.md / TODO.md | {N} |
```

If the GAPS table is empty, write "None discovered." If it has entries, verify each one was actually written to its destination — read REGISTRY.md and TODO.md to confirm.

### Step B: Surface to user

Present the audit. State:
**"Implementation complete. {N} deviations, {M} justified. Proceeding to `/lattice:review` for the full quality gate."**

This is the FIRST time the user needs to engage since Phase 0. The audit is informational — review is the actual gate.

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
- **Do not commit.** Implement produces the audit; build-cycle runs `/lattice:review` which handles the commit gate.
- **Run validation ratchet when engine files change.** If any phase modifies engine/analytical files, run `{{lattice.project.scripts.validation_ratchet}}` after that phase's `/ops:check`. Don't wait until the end — catch regressions early so they can be fixed in the same phase.

## Decision Log

After completing implementation (Step C: Surface to user), append to `.lattice/decisions.log`:
```
{timestamp}	implement	{COMPLETED|PARTIAL|BLOCKED}	{spec name}	phases:{completed}/{total} deviations:{count} deferred:{count}	{one-line summary}
```
