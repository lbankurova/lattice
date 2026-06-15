---
name: build-cycle
description: Build phase — design, implement, review, commit. Takes a validated blueprint and delivers code.
---

You are orchestrating the **build phase** of a topic. This cycle takes a validated blueprint and delivers reviewed, committed code by chaining existing autonomous skills.

**Input:** A topic (with validated blueprint from `/lattice:blueprint-cycle`) — or a spec path directly.

**Output:** Committed code.

---

## Execution Mode

The design and implement skills handle their own internal STOP points. This orchestrator chains them and tracks phase completion.

---

## Topic Lock

Acquire at Step 1, release at end of Step 4, heartbeat on every `current_step` update. Cycle-name passed to acquire script: `build-cycle`. For path-based entry (spec path instead of topic), derive the topic by stripping `-synthesis.md` from the filename and lock that. Full protocol (commands, STOP-on-contention, anti-patterns) at the canonical [topic-lock protocol](../../docs/skills-includes/topic-lock.md).

---

## State & Context

**Topic-based entry:** Reads `.lattice/cycle-state/{topic}.yaml`, verifies `phase: blueprint-complete` or `current_step` >= `build.0`. Extracts the spec path from the blueprint-cycle checkpoint (`blueprint.1` output → synthesis doc path).

**Path-based entry:** `build-cycle {{lattice.project.specs.incoming}}/{spec}.md` — starts directly from a spec without requiring a prior research/blueprint cycle.

**Revision-checked writes.** See the canonical [revision-checked writes protocol](../../docs/skills-includes/revision-checked-writes.md) — read → work → re-read → write-with-incremented-revision; STOP on mismatch.

**Context discipline:** Re-read the state file and the spec before starting. If resuming mid-phase, check which step was last completed.

**Surface Intent Header prerequisite (UI-surface topics).** Before starting build on a topic that touches a UI surface, verify the spec/synthesis carries a **Surface Intent Header** (the per-element binding table — Element / Q-ID / fact-id / Unit) and a **Section 1d** enumeration. If absent, **STOP** and route back: the spec is not buildable until intent is declared (this is the intent-DOWN inversion — you cannot verify an implementation against intent that was never written). Non-UI topics state "no UI surface — header N/A" and proceed.

---

## Steps

### Step 1: Implement

Run `/lattice:implement` on the spec path.

Implement handles its own phase-by-phase execution:
- Phase 0: load and plan
- Phase 1-N: for each phase, calls `/lattice:design` if the phase has new UI, then implements, then runs `/ops:check`
- Phase N+1: compiles the implementation audit (deviations, decisions, deferrals, gaps)

Implement does NOT run review — that's Step 2's job.

Update state: `current_step: build.2`.

### Step 2: Review + Commit

**Always run `/lattice:review`** — unconditionally. This is the quality gate, not implement's audit.

Review produces all 7 mandatory sections (CHANGES, ARCHITECT REVIEW, DECISION AUDIT, REQUIREMENT TRACE, MECHANICAL CHECKS, DOCS UPDATE, VERDICT). The Decision Audit runs as a separate agent to prevent confirmation bias on merit evaluation (rules 13-14).

Review offers to commit when all checks pass.

Update state: `current_step: build.3`.

### Step 3: Post-Ship Spec Refresh

After building, check whether this implementation invalidates any downstream specs:

1. **Scan `{{lattice.project.specs.incoming}}/`** for synthesis docs that depend on or reference the subsystems just shipped. Common pattern: Phase 1 synthesis written before Phase 0 implementation reveals reality (field names, data shapes, module locations differ from what synthesis assumed).

2. **For each dependent spec found:** Read the spec and compare against the actual shipped code. Check:
   - Field names and data shapes — does the spec reference fields that exist as shipped?
   - **Producing grain, not just field existence** — does the field exist *at the grain the spec assumes*? A field that exists but is emitted per-syndrome where the spec consumes it per-animal (or vice versa) is a grain mismatch, not a match. Read the producer's body (PRIMITIVE protocol), not only the artifact, to confirm the grain — this is the exact `per-animal-evidence-table` failure surfaced at the spec-refresh gate.
   - Module/function locations — did the implementation put things where the spec expects?
   - Assumptions about available data — does the spec assume data that the shipped code actually produces?

3. **If mismatches found:** Update the spec in-place. Log each correction:
   ```
   SPEC REFRESH: {spec-path}
   - {field/assumption} — spec said X, shipped code produces Y. Updated.
   ```

4. **If no downstream specs exist:** Skip. State: "No dependent specs found in incoming/."

This step catches the "spec-before-implementation" timing gap — syntheses written before a prior phase ships often contain assumptions invalidated by implementation reality.

### Step 4: Build Complete

Update state: `phase: complete, current_step: complete`.

**Release the topic lock:**
```bash
bash scripts/release-topic-lock.sh {topic}
```

```
## Built: {topic}

**Spec:** {path}
**Commits:** {list}
**Coverage:** {tags if applicable}
**Spec refresh:** {N} downstream specs checked, {N} updated
```

Log to decisions.log:
```
{timestamp}	build-cycle	COMPLETED	{topic}	{summary of what was built}
```

---

## Key Rules

1. **Prerequisite for topic-based entry: validated blueprint.** If `phase` is not `blueprint-complete`, tell the user: "Blueprint not validated. Run `/lattice:blueprint-cycle {topic}` first."
2. **Path-based entry skips prerequisite check.** The user is giving you a spec directly — trust them.
3. **Implement writes code, review gates it.** Implement runs design gates and ops:check per phase. Build-cycle always runs `/lattice:review` as the quality gate — implement never runs review.
4. **Update state after every step.**
5. **Topic lock is mandatory.** Acquire before work, release on completion, heartbeat on every checkpoint.
