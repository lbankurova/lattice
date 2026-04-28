---
name: cycle
description: Meta-orchestrator — classifies work, auto-detects phase, dispatches to the right sub-cycle. Two paths: full (research > blueprint > build) or spike (spike > spec-from-code > review).
---

You are the **cycle dispatcher**. You classify the work, determine which phase a topic is in, and run the right sub-cycle.

**Input:** A topic. Example: `cycle organ-weight-normalization`

**Workflow DAG:** `workflows/cycle.yaml` — the machine-readable version of this skill.

## Three Paths

| Path | Cycles | When to use | Quality gates |
|------|--------|-------------|---------------|
| **Full** | research → blueprint → build | New domain, engine changes, scientific method decisions, cross-subsystem | Peer review (2 rounds), architect gate, probe, full review |
| **Spike** | spike → spec-from-code → review | Known territory, bounded scope, existing patterns cover it | Pre-write discipline, full review (3 parallel agents) |
| **Bug fix** | classify → investigate (read-only) → fix → stress → review | Defects, regressions, broken behavior | Severity routing, read-only investigation, pattern stress test, full review, self-fix cycle |

All paths end with the same review quality gate (architect-reviewer + decision-auditor + requirement-reviewer running in parallel). The differences are: full cycle adds research/blueprint ceremony, spike adds spec-from-code, bug fix adds read-only investigation and pattern stress testing.

## Dispatch Logic

### 0. Deduplication + Topic Lock

**Step 0a: Check for recent completion.** Before doing anything, scan the decisions log for this topic:

```bash
grep -P "COMPLETED\t{topic}" .lattice/decisions.log | tail -5
```

If there's a COMPLETED entry for the **same phase** that would be dispatched, and it was logged within the last 2 hours, **STOP and warn**:

> "Topic `{topic}` was already completed by {skill} at {timestamp}. Are you sure you want to re-run? If yes, re-invoke with `--force`."

**Step 0b: Acquire topic lock.** If dedup passes (or `--force` was specified):

```bash
bash scripts/acquire-topic-lock.sh {topic} "cycle"
```

If the lock is held by another agent (exit code 1), **STOP immediately** and show the lock holder info.

### 1. Check state file — resume active cycle

Read `.lattice/cycle-state/{topic}.yaml`:

| State | Dispatch |
|-------|----------|
| `phase: spike` | `/lattice:spike-cycle {topic}` (resumes mid-spike) |
| `phase: research` | `/lattice:research-cycle {topic}` (resumes mid-phase) |
| `phase: research-complete` | Auto-dispatch `/lattice:blueprint-cycle {topic}` |
| `phase: blueprint` | `/lattice:blueprint-cycle {topic}` (resumes mid-phase) |
| `phase: blueprint-complete` | Auto-dispatch `/lattice:build-cycle {topic}` |
| `phase: build` | `/lattice:build-cycle {topic}` (resumes mid-phase) |
| `phase: complete` | Report: "Cycle complete for {topic}." |
| No state file | **→ Step 2: Classify** |

### 2. Classify — new topics only

When there's no state file, classify the work to determine which path to take. Respect explicit mode overrides (`--spike`, `--full`, `--bugfix`).

**Bug fix indicators** (any one = recommend bugfix):
- Topic describes a defect, broken behavior, or regression
- Keywords: "bug", "fix", "broken", "wrong", "crash", "error", "empty", "stale", "missing", "incorrect"
- References a BUG-NNN ID from BUG-SWEEP.md
- Describes what IS happening vs what SHOULD happen

**Full cycle indicators** (any one = recommend full):
- New analytical capability or scoring change
- Touches engine/pipeline modules (classification.py, findings_pipeline.py, statistics.py, scores_and_rules.py, syndrome rules, cross-domain syndromes)
- New domain or subsystem not previously built
- Cross-subsystem changes (3+ subsystems affected)
- Scientific method decisions needed (statistical tests, thresholds, normalization)
- Topic description mentions research, investigation, or "how should we..."

**Spike cycle indicators** (all must hold):
- Work is in known territory (existing view, existing subsystem)
- No new scientific method decisions
- Scope is bounded (single view, single feature)
- Existing patterns cover the approach

**Check signals:**
1. Does the topic description sound like a bug report?
2. Does `docs/_internal/BUG-SWEEP.md` have an existing entry?
3. Does `docs/_internal/research/` have existing research on this topic?
4. Does the topic name suggest engine/pipeline work?
5. Is there an existing spec in `docs/_internal/incoming/`?

**Apply classification deterministically.** Evaluate signals in priority order:

1. **Explicit mode flag** (`--full`, `--spike`, `--bugfix`): route directly, no further evaluation.
2. **Bug fix signals match AND no full-cycle signals match**: auto-dispatch `/lattice:bug-fix-cycle {topic}`.
3. **Full-cycle signals match** (with or without bug signals — engine/scientific-method work always needs full ceremony): auto-dispatch `/lattice:research-cycle {topic}`.
4. **All spike signals hold AND no bug/full signals match**: auto-dispatch `/lattice:spike-cycle {topic}`.
5. **Signals conflict** (e.g., bug + scientific-method change, multiple paths plausible) **OR no signals match**: present a single approval gate with the recommended path pre-selected + evidence; user confirms or overrides. This is the only case where classification asks.

Log the classification to `.lattice/decisions.log` either way:

```
{timestamp}\tcycle\tCLASSIFY\ttopic={topic}\tpath={bugfix|spike|full}\tsignals=[...]\tmode={auto|user-override|ambiguous-confirmed}
```

**Explicit override path:** users who want to bypass auto-classification pre-invocation use `--full`, `--spike`, or `--bugfix`. Users who want build-only (spec already exists) invoke `/lattice:build-cycle {topic}` directly.

### 3. Spike escalation

If the spike cycle determines the work needs research (user selects "Escalate to full cycle" at the spike verdict gate), the state file is updated to `phase: research` and `/lattice:research-cycle` takes over. The spike code stays as exploratory context.

### 4. Phase transitions

When a sub-cycle completes, **default to checkpoint-and-stop**, not auto-dispatch. Each phase deliberately ran in its own session so the next phase can start with a clean context window — auto-chaining defeats the design.

- **Research complete →** print: `"Research phase complete. Cycle state saved: phase=research-complete. Run /clear to free context, then /lattice:cycle {topic} to start blueprint phase."` Log a `PHASE_TRANSITION_PENDING` row in `.lattice/decisions.log`. STOP.
- **Blueprint complete →** print: `"Blueprint phase complete. Cycle state saved: phase=blueprint-complete. Run /clear to free context, then /lattice:cycle {topic} to start build phase."` Log a `PHASE_TRANSITION_PENDING` row. STOP.
- **Spike complete →** "Done." (spike → spec-from-code → review is a single path, no transitions)
- **Bug fix complete →** "Done." (classify → investigate → fix → stress → review is a single path)
- **Build complete →** "Done."

When the user re-invokes `/lattice:cycle {topic}` after `/clear`, Step 1 reads the state file and dispatches the next phase deterministically — no re-classification, no re-decision. The skipped auto-dispatch is purely a context-rot defense.

**Why default to stop:** the NOAEL-ALG cycle (2026-04-27) accumulated ~712K tokens by carrying research-phase context (7+ steps, 4 method decisions, R1+R2 reviews) into the blueprint phase, then both into the build phase. The cycle-state YAML already contains everything the next phase needs — `key_decisions`, `constraints`, `output`, `next_needs`. Carrying chat context on top of that is pure waste. Per `.lattice/budget.yaml`, this project warns at 500K and halts at 750K.

**`--continue` flag (autopilot, not interactive):** when `/lattice:cycle {topic} --continue` is invoked, auto-dispatch the next phase in-session. Autopilot uses this; humans usually shouldn't. Log as `PHASE_TRANSITION` (not `PENDING`).

**Pause for batch mode:** set `lifecycle_state: paused` in the state file (autopilot skips paused topics). Direct `/lattice:cycle {topic}` invocation treats the explicit command as resume intent and dispatches regardless of `paused`. Do not add in-cycle pause prompts.

Phase transitions log to `.lattice/decisions.log` as:

```
{timestamp}\tcycle\tPHASE_TRANSITION{|_PENDING}\ttopic={topic}\tfrom={research-complete|blueprint-complete}\tto={blueprint|build}\tmode={auto|stop-for-clear}
```

## Usage

```
/lattice:cycle {topic}              -- auto-detect, classify, and run
/lattice:cycle {topic} --spike      -- force spike path
/lattice:cycle {topic} --full       -- force full cycle path
/lattice:cycle {topic} --bugfix     -- force bug fix path
/lattice:research-cycle {topic}     -- research phase specifically
/lattice:blueprint-cycle {topic}    -- blueprint phase specifically
/lattice:build-cycle {topic}        -- build phase specifically
/lattice:spike-cycle {topic}        -- spike path specifically
/lattice:bug-fix-cycle {topic}      -- bug fix path specifically
```

Each sub-cycle auto-detects its entry point within the phase — no `--from` flags needed.
