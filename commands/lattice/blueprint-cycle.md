---
name: blueprint-cycle
description: "Blueprint phase — synthesize research into a validated build plan. Steps 0-7: implementation knowledge load → synthesize → architect gate → probe → plan review (2 rounds) → complete."
---

You are orchestrating the **blueprint phase** of a topic. This cycle takes validated research and produces a validated build plan — architecturally gated, probed for cross-system impact, and challenged by two rounds of peer review.

**Input:** A topic (must have validated research from `/lattice:research-cycle`).

**Output:** Validated synthesis at `{{lattice.project.specs.incoming}}/{topic}-synthesis.md`. Next: `/lattice:build-cycle {topic}`.

---

## Execution Mode

**Default: autonomous.** Stop ONLY at critical decision points:
- Architect REJECT or SCIENCE-FLAG (Step 2: needs human judgment)
- Probe BREAKS or SCIENCE-FLAG (Step 3: cross-system implications)
- FLAWED findings persisting across both plan review rounds (Step 6: genuine disagreement)

Everything else proceeds automatically:
- Architect PASS → proceed
- Architect SIMPLIFY → auto-apply simplifications, re-gate once, proceed if PASS
- Probe SAFE/PROPAGATES → proceed
- CONDITIONAL plan review findings → auto-accept and incorporate
- Single FLAWED in R1 that R2 marks resolved → proceed

**Log every auto-decision** to `.lattice/decisions.log`:
```
{timestamp}	blueprint-cycle	AUTO-{action}	{topic}	step:{N}	{what was decided and why}
```

---

## Topic Lock

Acquire at Step 0, release at end of Step 7, heartbeat on every `current_step` update. Cycle-name passed to acquire script: `blueprint-cycle`. Full protocol (commands, STOP-on-contention, anti-patterns) at the canonical [topic-lock protocol](../../docs/skills-includes/topic-lock.md).

---

## State & Context

Continues the state file from research-cycle: `.lattice/cycle-state/{topic}.yaml`.

**Prerequisite check:** Before starting, verify `phase` is `research-complete` (or `current_step` >= `blueprint.0`). If research hasn't been validated, tell the user: "Research phase not complete. Run `/lattice:research-cycle {topic}` first."

**Revision-checked writes.** See the canonical [revision-checked writes protocol](../../docs/skills-includes/revision-checked-writes.md) — read → work → re-read → write-with-incremented-revision; STOP on mismatch.

**Context discipline — disk is storage, context is RAM.** Before EVERY step:
1. Re-read the state file and decisions log for this topic
2. Re-read the input that step depends on (see pre-load table below)
3. After the step completes, write a checkpoint with key decisions, constraints, and output path

| Step | Re-read before acting |
|------|----------------------|
| 0 | Decisions log (FULL, not just this topic), `.lattice/bug-patterns.md`, `code-quality-guardrails.md`, prior cycle states in `.lattice/cycle-state/` |
| 1 | Research doc, review files, probe results from research-cycle, distill results, Step 0 findings |
| 2 | Synthesis doc, `{{lattice.project.docs.guardrails}}` |
| 3 | Synthesis doc, system manifest |
| 4 | Synthesis doc (the file, not memory) |
| 5 | Synthesis doc + plan review file + decisions log |
| 6 | Updated synthesis doc + R1 plan review |

**Entry detection (no flags needed):**
1. State file `current_step` starts with `blueprint` → resume from that step
2. No blueprint state → detect from files:
   - No `{{lattice.project.specs.incoming}}/{topic}-synthesis.md` → Step 0
   - Synthesis exists, no `peer-reviews/{topic}-architect-review.md` → Step 2
   - Architect passed, no build-plan probe recorded → Step 3
   - Probe done, no `peer-reviews/{topic}-synthesis-review.md` → Step 4
   - Plan review R1 done, no incorporation → Step 5
   - Incorporation done, no `{topic}-synthesis-review-r2.md` → Step 6
   - Build plan validated → **Done — run `/lattice:build-cycle`**

---

## Steps

### Step 0: Implementation Knowledge Load

Mirrors research's Step 0 (corpus load) but for implementation knowledge. Read:

1. **Decisions log** (`.lattice/decisions.log`) — FULL file, not filtered by topic. Scan for:
   - Failed implementation approaches on any topic ("tried X, broke validation")
   - Architectural decisions that constrain this build plan
   - Patterns that worked well and should be reused
2. **Bug patterns** (`.lattice/bug-patterns.md`) — known failure families. If the build plan touches modules with known bug patterns, the plan must account for them.
3. **Code quality guardrails** (`{{lattice.project.docs.guardrails}}`) — complexity budgets, canonical patterns, domain-critical modules that need extra care.
4. **Prior cycle states** (`.lattice/cycle-state/`) — scan for related completed cycles. If topic A's build plan changed module X, and this topic also touches module X, note the interaction.

**Output:** An "Implementation Context" section in the checkpoint. This feeds into Step 1 — synthesize must know what's been tried and what constraints exist from accumulated experience.

**Gate:** If the decisions log contains FAILED entries that are relevant to this topic's research findings, they MUST appear in the synthesize input. A build plan that re-proposes a known-failed approach is a defect.

Update state: `phase: blueprint, current_step: blueprint.1`.

### Step 1: Synthesize

Run `/lattice:synthesize` on the validated research. Provide:
- Research doc: `{{lattice.project.research.root}}/{topic}.md`
- Peer reviews R1 and R2 (if they exist)
- Distill audit results from research-cycle Step 6 (if contradictions found)
- Probe results from research-cycle Step 7 (if PROPAGATES or BREAKS)
- Implementation context from Step 0 (failed approaches, relevant bug patterns, cross-topic constraints)

Write to `{{lattice.project.specs.incoming}}/{topic}-synthesis.md`.

**Mandatory section gate.** Verify these sections exist with substantive content (not just headers):
1. **Build Plan** — at least one feature with acceptance criteria
2. **Reuse Inventory** — at least one row in the search table, **with the Grain/contract column filled per reuse anchor** (body-read, not artifact)
3. **Simplicity Rationale** — has content (even if "no new abstractions")
4. **Test Strategy** — at least one row in the test table
5. **Design-Intent Conformance (Section 1d)** — for any plan that touches a UI surface: the per-element binding table (at element grain) + the Leg-A algorithmic-primitive enumeration. (Skip only for a plan with no UI surface; state that explicitly.)
6. **Research Gaps** — has content (even if "none identified")
7. **Data Gaps** — has content (even if "none identified")

If any section missing or empty: re-run synthesize with explicit instruction: "Your synthesis is missing section {X}. This is mandatory — the architect gate will reject without it."

Update state: `phase: blueprint, current_step: blueprint.2`.

### Step 2: Architect Gate

**Launch a separate agent** with the architect-reviewer instructions (`agents/architect-reviewer.md`).

Launch with:
- **Prompt:** Full architect-reviewer agent instructions
- **Input:** Synthesis doc path, guardrails doc path, list of files the synthesis proposes to modify
- **Mode:** "gate"
- **No session context.**

| Verdict | Action |
|---------|--------|
| **PASS** | Proceed autonomously |
| **SIMPLIFY** | Auto-apply simplifications, re-gate once. If second gate is PASS, proceed. If still SIMPLIFY or worse, **STOP**. |
| **REJECT** | **STOP** — present to user with alternative approach |
| **SCIENCE-FLAG** | **STOP** — present flagged items, each needs explicit accept/reject |

**Conformance enumeration check (Section 1d).** For any UI-surface plan, the architect verifies the Section-1d element + primitive enumeration is **complete** — anchored to the two concrete inputs the gate already receives (the synthesis's proposed-modifications file list + `.lattice/algorithm-paths.txt`), NOT open-ended prose reading. The check: every surface element implied by a proposed-modifications UI file, and every algorithmic primitive on an algorithm-path the plan reuses / consumes / emits / feeds, must appear in the Section-1d enumeration. A primitive or element reachable from those two inputs but **absent from 1d is a gate failure**. Because a file path does not by itself enumerate elements, Section 1d MUST describe each proposed UI surface's elements *at element grain*; if it does not, the gate fails **for under-specification** (the spec is not yet buildable) and directs the author to enumerate before proceeding.

Write review to `{{lattice.project.research.peer_reviews}}/{topic}-architect-review.md`.

Update state: `current_step: blueprint.3`.

### Step 3: Probe

Run `/lattice:probe` on the approved build plan. Input: synthesis doc path. Probe reads proposed file changes and traces downstream impact.

| Probe result | Action |
|---|---|
| All SAFE/PROPAGATES | Proceed autonomously |
| Any BREAKS | Add broken subsystems to synthesis scope or flag as blocking. **STOP** if scope change is significant. |
| Any SCIENCE-FLAG | **STOP** — present to user |

Update state: `current_step: blueprint.4`.

### Step 4: Plan Review — Round 1

**Launch a separate agent.** Same rules and gate checks as research-cycle peer review. Use `subagent_type: peer-review` (registered at `.claude/agents/peer-review.md`) — do NOT inline the skill content into the prompt.

Launch with:
- **subagent_type:** `peer-review`
- **prompt:** the synthesis doc path ONLY; one sentence: "Review the synthesis at `{synthesis-path}` per the peer-review protocol (Implementation Plan / Synthesis tier)."
- **Output:** `{{lattice.project.research.peer_reviews}}/{topic}-synthesis-review.md` (agent writes this directly)

**Gate check:** Same structural quality check as research-cycle — at least one CONDITIONAL/FLAWED, evidence per finding, at least 3 dimensions.

**Auto-handle:** SOUND → note. CONDITIONAL → auto-accept. FLAWED → accept for incorporation.

Update state: `current_step: blueprint.5`.

### Step 5: Incorporate Plan Feedback

For each accepted finding:
- **FLAWED:** Rewrite the affected section of the synthesis
- **CONDITIONAL:** Strengthen evidence, narrow scope, or add caveats
- **Rejected:** Note counter-evidence in a "Plan Review Notes" section

Update `{{lattice.project.specs.incoming}}/{topic}-synthesis.md`.

Update state: `current_step: blueprint.6`.

### Step 6: Plan Review — Round 2

**Fresh separate agent** (not the R1 agent). `subagent_type: peer-review` again — the harness gives a clean context per launch.

Launch with:
- **subagent_type:** `peer-review`
- **prompt:** updated synthesis doc path AND R1 plan review path; one sentence: "Review the synthesis at `{synthesis-path}`. Read R1 review at `{r1-path}` first; check revisions addressed R1 findings, check for new issues from revisions, do NOT re-raise addressed findings."
- **Output:** `{{lattice.project.research.peer_reviews}}/{topic}-synthesis-review-r2.md` (agent writes this directly)

Same gate check and evaluation as research-cycle:
| R2 outcome | Action |
|------------|--------|
| All SOUND or CONDITIONAL | Build plan validated — proceed |
| New FLAWED on previously-SOUND | Arbiter classifies each finding (PRESENTATION_ONLY / FACTUAL_DISPUTE / FACTUAL_UNSUPPORTED). Presentation-only or unsupported objections auto-side with R1. Only testable factual disputes **STOP** and surface the specific disputed claim + R2 evidence. |
| Same FLAWED both rounds | Arbiter diffs claimed evidence items per side (VERIFIABLE vs UNVERIFIABLE). auto_resolve_r1 / auto_resolve_r2 / auto_synthesize outcomes proceed with logged rationale; only escalate_contradiction (both sides have verifiable evidence that directly contradicts) **STOPS** and surfaces the specific contradiction. |

Update state: `current_step: blueprint.7`.

### Step 7: Build Plan Complete

**Verify gap persistence.** Before declaring the build plan complete:

1. **Read `{{lattice.project.research.registry}}`** — confirm every research gap from the synthesis Section 2 has an entry or is covered by an existing stream's `open-questions`. If any are missing, write them now.
2. **Read `{{lattice.project.backlog.todo}}`** — confirm every data gap from the synthesis Section 3 has an entry. If any are missing, write them now.

Gaps that exist only in the synthesis document are not persisted — the synthesis gets archived after implementation. The registry and TODO.md survive.

Then produce the summary:

```
## Build Plan Validated: {topic}

**Research:** {{lattice.project.research.root}}/{topic}.md (validated)
**Synthesis:** {{lattice.project.specs.incoming}}/{topic}-synthesis.md (validated)
**Reviews:** [list all review files]
**Auto-decisions:** [count] (review in .lattice/decisions.log)

### Ready for implementation
[summary of build plan]

### Research Gaps (persisted to REGISTRY.md)
[list with stream IDs]

### Data Gaps (persisted to TODO.md)
[list with item IDs]

Next: /lattice:build-cycle {topic}
```

Update state: `phase: blueprint-complete, current_step: build.0`.

**Release the topic lock:**
```bash
bash scripts/release-topic-lock.sh {topic}
```

Log to decisions.log:
```
{timestamp}	blueprint-cycle	COMPLETED	{topic}	steps:1-7	{summary of key decisions}
```

---

## Key Rules

1. **Prerequisite: validated research.** Don't synthesize from unvalidated research.
2. **Synthesis section gate is non-negotiable.** All 7 sections (1, 1a, 1b, 1c, 1d, 2, 3) must exist with content — 1d (Design-Intent Conformance) for any plan that touches a UI surface.
3. **Architect gate is non-negotiable.** Every build plan passes through the architect.
4. **Peer review runs in a separate agent. No exceptions.**
5. **2 rounds max.** Unresolved → escalate to user. No Round 3.
6. **Probe is wired, not optional.** Catches cross-system implications the architect might miss.
7. **All outputs persist to disk.**
8. **Update state after every step.**
9. **Log every auto-decision.**
10. **Topic lock is mandatory.** Acquire before work, release on completion, heartbeat on every checkpoint.
