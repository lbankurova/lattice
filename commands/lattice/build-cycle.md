---
name: build-cycle
description: Build phase — design, implement, review, commit. Takes a validated build plan and delivers code.
---

You are orchestrating the **build phase** of a topic. This cycle takes a validated build plan and delivers reviewed, committed code by chaining existing autonomous skills.

**Input:** A topic (with validated build plan from `/lattice:blueprint-cycle`) — or a spec path directly.

**Output:** Committed code.

---

## Execution Mode

The design and implement skills handle their own internal STOP points. This orchestrator chains them and tracks phase completion.

---

## State & Context

**Topic-based entry:** Reads `.lattice/cycle-state/{topic}.yaml`, verifies `phase: blueprint-complete` or `current_step` >= `build.0`. Extracts the spec path from the blueprint-cycle checkpoint (`blueprint.1` output → synthesis doc path).

**Path-based entry:** `build-cycle docs/_internal/incoming/{spec}.md` — starts directly from a spec without requiring a prior research/blueprint cycle.

**Context discipline:** Re-read the state file and the spec before starting. If resuming mid-phase, check which step was last completed.

---

## Steps

### Step 1: Implement

Run `/lattice:implement` on the spec path.

The implement skill handles its own phase-by-phase execution:
- Phase 0: load and plan
- Phase 1-N: for each phase, calls `/lattice:design` if the phase has new UI, then implements, then runs `/ops:check`
- Phase N+1: runs full `/lattice:review`

If implement surfaces its final audit or hits a blocker, handle it at that level — build-cycle doesn't add gates on top of implement's own quality system.

Update state: `current_step: build.2`.

### Step 2: Review + Commit

If `/lattice:implement` didn't already run review (e.g., path-based entry with a simple spec), run `/lattice:review` now.

Review produces all mandatory sections (CHANGES, ARCHITECT REVIEW, DECISION AUDIT, REQUIREMENT TRACE, MECHANICAL CHECKS, DOCS UPDATE, VERDICT) and offers to commit.

Update state: `current_step: build.3`.

### Step 3: Build Complete

Update state: `phase: complete, current_step: complete`.

```
## Built: {topic}

**Spec:** {path}
**Commits:** {list}
**Coverage:** {tags if applicable}
```

Log to decisions.log:
```
{timestamp}	build-cycle	COMPLETED	{topic}	{summary of what was built}
```

---

## Key Rules

1. **Prerequisite for topic-based entry: validated build plan.** If `phase` is not `blueprint-complete`, tell the user: "Build plan not validated. Run `/lattice:blueprint-cycle {topic}` first."
2. **Path-based entry skips prerequisite check.** The user is giving you a spec directly — trust them.
3. **Don't duplicate implement's quality system.** Implement already runs design gates, ops:check, and review. Build-cycle adds state tracking, not extra gates.
4. **Update state after every step.**
