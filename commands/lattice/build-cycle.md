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

**Acquire the WIP lock before doing any work:**

```bash
bash scripts/acquire-topic-lock.sh {topic} "build-cycle"
```

If exit code 1 (lock held by another agent), **STOP immediately** — show the lock holder info and tell the user. Do not proceed.

For **path-based entry** (no topic), derive the topic from the spec filename (strip `-synthesis.md` suffix) and lock that.

**Release the lock** when the build phase completes (end of Step 4).

**Heartbeat:** After every state file update (`current_step` change), refresh the lock:
```bash
touch .lattice/cycle-lock/{topic}/meta 2>/dev/null
```

---

## State & Context

**Topic-based entry:** Reads `.lattice/cycle-state/{topic}.yaml`, verifies `phase: blueprint-complete` or `current_step` >= `build.0`. Extracts the spec path from the blueprint-cycle checkpoint (`blueprint.1` output → synthesis doc path).

**Path-based entry:** `build-cycle docs/_internal/incoming/{spec}.md` — starts directly from a spec without requiring a prior research/blueprint cycle.

**Revision-checked writes.** The state file has a `revision: N` field. Before every write:
1. Re-read the file, check `revision` matches what you last read
2. If match: write with `revision: N+1`
3. If mismatch: **STOP** — "State file modified by another agent (expected revision {N}, found {M})."

**Context discipline:** Re-read the state file and the spec before starting. If resuming mid-phase, check which step was last completed.

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

1. **Scan `docs/_internal/incoming/`** for synthesis docs that depend on or reference the subsystems just shipped. Common pattern: Phase 1 synthesis written before Phase 0 implementation reveals reality (field names, data shapes, module locations differ from what synthesis assumed).

2. **For each dependent spec found:** Read the spec and compare against the actual shipped code. Check:
   - Field names and data shapes — does the spec reference fields that exist as shipped?
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
