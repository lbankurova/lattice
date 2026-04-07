---
name: cycle
description: Meta-orchestrator — auto-detects phase from state, dispatches to the right sub-cycle (research, blueprint, or build).
---

You are the **cycle dispatcher**. You determine which phase a topic is in and run the right sub-cycle.

**Input:** A topic. Example: `cycle organ-weight-normalization`

## Three Phases

| Phase | Cycle | What it produces |
|-------|-------|-----------------|
| Research | `/lattice:research-cycle {topic}` | Validated research — peer reviewed, corpus-coherent, probed |
| Blueprint | `/lattice:blueprint-cycle {topic}` | Validated build plan — architect gated, probed, peer reviewed |
| Build | `/lattice:build-cycle {topic}` | Committed code — designed, implemented, reviewed |

## Dispatch Logic

### 0. Deduplication + Topic Lock

**Step 0a: Check for recent completion.** Before doing anything, scan the decisions log for this topic:

```bash
grep -P "COMPLETED\t{topic}" .lattice/decisions.log | tail -5
```

If there's a COMPLETED entry for the **same phase** that would be dispatched (e.g., `build-cycle COMPLETED {topic}`), and it was logged within the last 2 hours, **STOP and warn**:

> "Topic `{topic}` was already completed by {skill} at {timestamp}. Are you sure you want to re-run? If yes, re-invoke with `--force`."

This catches the "pasted the same command twice" scenario — the most common cause of duplicate work.

**Step 0b: Acquire topic lock.** If dedup passes (or `--force` was specified):

```bash
bash scripts/acquire-topic-lock.sh {topic} "cycle"
```

If the lock is held by another agent (exit code 1), **STOP immediately**:

> "Topic `{topic}` is currently being worked on by another agent."
> [show lock holder info from output]
> "Wait for the other agent to finish, or force-release with: `bash scripts/release-topic-lock.sh {topic}`"

If the lock was acquired (exit 0), proceed. The lock will be released when the sub-cycle completes.

### 1. Check state file

Read `.lattice/cycle-state/{topic}.yaml`:

| State | Dispatch |
|-------|----------|
| No state file | `/lattice:research-cycle {topic}` |
| `phase: research` | `/lattice:research-cycle {topic}` (resumes mid-phase) |
| `phase: research-complete` | `/lattice:blueprint-cycle {topic}` |
| `phase: blueprint` | `/lattice:blueprint-cycle {topic}` (resumes mid-phase) |
| `phase: blueprint-complete` | `/lattice:build-cycle {topic}` |
| `phase: build` | `/lattice:build-cycle {topic}` (resumes mid-phase) |
| `phase: complete` | Report: "Cycle complete for {topic}." |

### 2. No state file — detect from files

| Condition | Dispatch |
|-----------|----------|
| No `docs/_internal/research/{topic}.md` | research-cycle |
| Research exists, no validated R2 review | research-cycle (mid-phase) |
| R2 exists, no `incoming/{topic}-synthesis.md` | blueprint-cycle |
| Synthesis exists, not fully reviewed | blueprint-cycle (mid-phase) |
| Build plan validated (synthesis R2 exists) | build-cycle |

### 3. Phase transitions

When a sub-cycle completes, present the next phase boundary:

- **Research complete →** "Research validated. Start blueprint? (`/lattice:blueprint-cycle {topic}`)"
- **Blueprint complete →** "Blueprint validated. Ready to build? (`/lattice:build-cycle {topic}`)"
- **Build complete →** "Done." Release topic lock: `bash scripts/release-topic-lock.sh {topic}`

Phase transitions are explicit boundaries — ask before crossing. The user may want to review, adjust scope, or pause between phases. The topic lock is held across phase transitions within the same conversation.

## Usage

```
/lattice:cycle {topic}              -- auto-detect and run next phase
/lattice:research-cycle {topic}     -- research phase specifically
/lattice:blueprint-cycle {topic}    -- blueprint phase specifically
/lattice:build-cycle {topic}        -- build phase specifically
```

Each sub-cycle auto-detects its entry point within the phase — no `--from` flags needed.
