---
name: autopilot
description: Portfolio autopilot — reconcile state, run coherence, advance safe topics, batch human decisions. The in-session equivalent of `lattice autopilot` CLI.
---

You are the **portfolio autopilot**. You advance all safe topics through their full lifecycle, stopping only at justified gates.

**Input:** Optional filter pattern and max count. Examples:
- `autopilot` — advance up to 3 safe topics
- `autopilot cl-decomposition` — filter to matching topics
- `autopilot --max 5` — advance up to 5
- `autopilot --dry-run` — preview only

## Protocol

### Step 0: Reconcile state against git

Run the CLI reconciliation to ensure state files reflect reality:

```bash
lattice status
```

Review the output. If corrections were made, note them. This is the ground truth.

### Step 1: Coherence check

```bash
lattice coherence
```

Read the output. Identify:
- **Safe topics** — can advance
- **Blocked topics** — have coherence conflicts
- **Subsystem heatmap** — contended subsystems

### Step 2: Filter and select

If a filter was provided, apply it. Otherwise, select up to `max` topics from the safe list.

**Paused topics are skipped.** Topics with `lifecycle_state: paused` in their cycle-state YAML are listed but not advanced. They need an explicit user decision to resume (set `lifecycle_state: active`) or archive (`lifecycle_state: archived`).

**Zombie topics are flagged.** Topics in an active phase with no lock and no checkpoint in 48+ hours appear as warnings in the coherence report. Present them in the human decisions batch for resume/pause/archive.

For each selected topic, determine the action based on phase:
- `research-complete` → run `/lattice:blueprint-cycle {topic}`
- `blueprint-complete` → run `/lattice:build-cycle {topic}`
- `blueprint` → run `/lattice:blueprint-cycle {topic}` (resume)
- `build` → run `/lattice:build-cycle {topic}` (resume)
- `research` → run `/lattice:research-cycle {topic}` (resume)
- `spike` → run `/lattice:spike-cycle {topic}` (resume)

### Step 3: Execute

For each selected topic:
1. Announce: "Advancing {topic} ({phase}) via {cycle}"
2. Run the appropriate cycle skill (it handles its own internal steps)
3. After completion: re-run `lattice coherence` to check for new conflicts
4. If new blockers appeared: stop advancing further topics, report

**Phase transitions are automatic.** Do NOT ask "start blueprint?" or "ready to build?" — if the coherence check passed, proceed.

**Commit trailers are mandatory.** Every commit from this autopilot run must carry:
```
Topic: {topic}
Phase: {phase-completed}
```

### Step 4: Batch human decisions

After advancing all selected topics (or when no more can advance), present the pending decisions from blocked topics:

```
HUMAN DECISIONS NEEDED:
1. [type] {topic}: {description}
   Options: resolve / override / defer

2. [type] {topic}: {description}
   Options: accept / reject / defer
...
```

Wait for the user to decide on the batch. Apply decisions, then loop if `--loop` was specified.

### Step 5: Summary

```
AUTOPILOT SUMMARY
Advanced: {count} ({list})
Failed: {count} ({list})
Pending decisions: {count}
Blocked: {count}
```

## Justified gates (STOP for human)

- SCIENCE-FLAG — analytical output changes
- Persistent FLAWED — genuine scientific disagreement (2 peer review rounds)
- BREAKS — system integrity at risk
- Architect REJECT — fundamental approach wrong
- Coherence conflicts — cross-topic subsystem contention
- Zombie topics — active phase but no lock and stale checkpoint (resume/pause/archive?)

## Autonomous (proceed without asking)

- Classification (auto-decide full/spike/bugfix)
- Phase transitions (research → blueprint → build)
- CONDITIONAL peer review findings (auto-accept)
- Architect SIMPLIFY (auto-apply)
- Bikeshed detection (auto-side with R1)
- Commit (auto when review passes)
