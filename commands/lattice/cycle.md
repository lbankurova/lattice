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

- **Research complete →** "Research validated. Start blueprinting? (`/lattice:blueprint-cycle {topic}`)"
- **Blueprint complete →** "Build plan validated. Ready to build? (`/lattice:build-cycle {topic}`)"
- **Build complete →** "Done."

Phase transitions are explicit boundaries — ask before crossing. The user may want to review, adjust scope, or pause between phases.

## Usage

```
/lattice:cycle {topic}              -- auto-detect and run next phase
/lattice:research-cycle {topic}     -- research phase specifically
/lattice:blueprint-cycle {topic}    -- blueprint phase specifically
/lattice:build-cycle {topic}        -- build phase specifically
```

Each sub-cycle auto-detects its entry point within the phase — no `--from` flags needed.
