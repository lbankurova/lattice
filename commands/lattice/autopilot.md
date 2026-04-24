---
name: autopilot
description: Portfolio autopilot — advance safe topics AND mechanical TODO items through their full lifecycle. Stops only at justified gates. Escalates via ESCALATION.md.
---

You are the **portfolio autopilot**. You advance all safe work — lattice topics through their cycle phases AND mechanical TODO items that don't need user design input — stopping only at justified gates.

**Input:** Optional filter pattern and max count. Examples:
- `autopilot` — advance up to 3 items
- `autopilot cl-decomposition` — filter to matching topics
- `autopilot --max 5` — advance up to 5
- `autopilot --dry-run` — preview only
- `autopilot --source todo` — only pull from the TODO queue
- `autopilot --source topics` — only pull from topic lifecycle

## Two sources of work

Autopilot pulls from two queues and merges them into a single priority-ordered list:

1. **Topic queue** — `.lattice/cycle-state/*.yaml`. Research/blueprint/build/spike phases. Classified by `/lattice:prioritize` as `[autopilot]` safe.
2. **TODO queue** — items in `docs/_internal/TODO.md` tagged `autopilot: ready`. Mechanical work that doesn't need design decisions: data gaps, ETL, contract-triangle cleanup, no-behavior-change refactors, known-fix bugs.

Both queues apply the same safety criteria. Either produces escalations to `ESCALATION.md` at the repo root when a real user-input need surfaces.

## Protocol

### Step 0: Reconcile state against git

Run the CLI reconciliation. This is ground truth.

```bash
lattice status
```

Review output. If corrections were made, note them.

### Step 0.5: Read the TODO queue

In parallel with Step 0:

```bash
# List TODO items tagged autopilot: ready with score, sorted descending
# (If a helper script exists in the project, prefer it. Otherwise grep directly.)
```

Parse `docs/_internal/TODO.md` (or the project's equivalent) for entries that carry an `autopilot:` field. Valid values:

| Value | Meaning | Autopilot action |
|---|---|---|
| `ready` | Safe to advance without user input | Queue for selection |
| `waiting-data` | Blocked on external data | Skip (surface in Data Acquisition / Partnership bucket per prioritize skill) |
| `deferred-dg` | Deferred until Datagrok migration | Skip |
| `needs-user` | Requires design decision, scope call, or user taste | Skip |
| (no tag) | Unclassified | Skip, add to Step 4 escalation list for tagging |

Each `ready` item should also carry a `score:` field (integer 0-27 from the pillars × data × impl rubric — see `docs/_internal/knowledge/autopilot-flow.md` for scoring details). If not present, treat as score=0 and rank behind tagged items.

### Step 1: Coherence check

```bash
lattice coherence --skip-reconcile
```

**`--skip-reconcile` is mandatory here.** Step 0 (`lattice status`) already reconciled and wrote corrections. Running `lattice coherence` without the flag would re-scan git for no incremental benefit.

Read the output. Identify:
- **Safe topics** — can advance
- **Blocked topics** — have coherence conflicts
- **Subsystem heatmap** — contended subsystems

### Step 2: Build the unified queue

Merge the safe-topic list (Step 1) and the `autopilot: ready` TODO list (Step 0.5) into a single ranked queue.

Ranking:
1. **Topics in `research-complete` or `blueprint-complete`** — highest priority. Research/blueprint ceremony already paid; just needs the next phase. Always ahead of TODO items of the same tier, because cycle gates (R1+R2 peer review, architect review, science preservation) are load-bearing and already completed.
2. **TODO items** sorted by `score` descending.
3. **Topics in earlier phases** (research/blueprint/build in progress) — resume these.

Apply filter and max. Skip:
- Paused topics (`lifecycle_state: paused`) — surface in Step 4 for user resume/archive decision.
- Zombie topics (active phase, no lock, 48h+ stale checkpoint) — surface in Step 4.
- TODO items tagged anything except `ready` (see table above).

For each selected item, determine the action:

**Topic routing (by phase):**
- `research-complete` → `/lattice:blueprint-cycle {topic}`
- `blueprint-complete` → `/lattice:build-cycle {topic}`
- `blueprint` (in progress) → `/lattice:blueprint-cycle {topic}` (resume)
- `build` (in progress) → `/lattice:build-cycle {topic}` (resume)
- `research` (in progress) → `/lattice:research-cycle {topic}` (resume)
- `spike` (in progress) → `/lattice:spike {topic}` (resume)

**TODO item routing (by size/kind):**
- ≤50 LOC mechanical fix OR contract/doc cleanup → direct edit + `/ops:check` for regression
- Bug fix with known reproduction → `/ops:bug` then direct edit + `/ops:check`
- ETL expansion / data load → `/lattice:spike` with validation-suite regression as acceptance
- Research item (marked `kind: research` in TODO) → `/lattice:research-cycle` (R1+R2 peer review gates stay on)
- Refactor with no behavior change → direct edit + full test suite must pass

### Step 3: Execute

For each selected item:
1. Announce: `"Advancing {name} ({source}/{phase-or-kind}) via {route}"`
2. Run the appropriate skill or direct action.
3. On completion, append a line to `ESCALATION.md` IF the skill surfaced any user decision, OR remove the TODO entry / tick it strikethrough with commit hash on success.
4. Continue to the next queue item. Do NOT re-run `lattice coherence` between items — Step 4 catches new blockers.

**Phase transitions are automatic.** Do NOT ask "start blueprint?" or "ready to build?" — if the coherence check passed, proceed.

**Commit trailers are mandatory.** Every commit carries:
```
Topic: {topic-or-todo-id}
Phase: {phase-completed-or-"mechanical"}
```

**SCIENCE-FLAG resolution during autopilot.** If a cycle emits a SCIENCE-FLAG, the resolution contract is NOT "wait for SME." Autopilot authors a decision memo with ≥3 literature citations (species profiles, methods-index, or peer-reviewed sources from research/) and proceeds. The flag is logged in `decisions.log` and the memo path is cited in the commit message. This keeps the gate doing its job — forcing the decision to be documented — without converting it into an indefinite defer. If Claude cannot find ≥3 citations that support a defensible position, THAT is the escalation trigger (write to ESCALATION.md).

### Step 4: Escalation

After the batch, run:

```bash
lattice coherence --skip-reconcile
```

Wait — Step 3 commits have now changed git state. Re-reconcile:

```bash
lattice status
lattice coherence --skip-reconcile
```

Collect pending decisions:
- Blocked topics (coherence conflicts)
- Paused topics needing resume/archive
- Zombie topics
- TODO items tagged `needs-user`
- TODO items with no `autopilot:` field at all (untagged items)
- SCIENCE-FLAGs where Claude could not find ≥3 supporting citations

Append to `ESCALATION.md`:

```markdown
## Escalation — {ISO date}

**Advanced this batch:** {count} ({list})
**Escalations:**

### {item name}
- **Source:** {topic-cycle | TODO | coherence}
- **Reason:** {why this needs you}
- **What I tried:** {brief}
- **What I need:** {specific decision, scope question, or data}

### ...
```

Do NOT block on escalations during autopilot — the whole point is to batch them. The user reviews `ESCALATION.md` on their own cadence.

### Step 5: Summary

Print to stdout:

```
AUTOPILOT SUMMARY
Advanced: {count} ({list})
Failed: {count} ({list})
Escalations written: {count} → ESCALATION.md
Queue remaining: {topics: N, todo-ready: N}
```

## Justified gates (ESCALATE, do not block)

These halt the current item and get written to ESCALATION.md, but autopilot continues with the next queue item:

- **SCIENCE-FLAG with <3 supporting citations** — Claude could not find literature grounding to resolve the flag. Document the flag + what citations were sought + what failed.
- **Persistent FLAWED** — genuine scientific disagreement across 2 peer review rounds.
- **BREAKS** — system integrity at risk. Auto-revert the branch; escalate.
- **Architect REJECT** — fundamental approach wrong. Revert; escalate.
- **Coherence conflicts** — cross-topic subsystem contention.
- **Zombie topics** — active phase but no lock and stale checkpoint.

## Autonomous (proceed without asking)

- Classification (auto-decide full/spike/bugfix)
- Phase transitions (research → blueprint → build)
- CONDITIONAL peer review findings (auto-accept)
- Architect SIMPLIFY (auto-apply)
- Bikeshed detection (auto-side with R1)
- Commit (auto when review passes)
- **SCIENCE-FLAG resolution when ≥3 literature citations support a defensible position** — author the decision memo, cite, ship. The gate's job is to force the decision-with-rationale, not to pause forever.

## Anti-patterns

1. **Running `lattice coherence` without `--skip-reconcile` when `lattice status` just ran in the same session.** Redundant git scan. The CLI now supports the flag.
2. **Escalating every SCIENCE-FLAG as "needs SME".** See above. The gate terminates when the decision is made with citations, not when an SME signs off — because in a Claude-authored codebase, there is no SME in the feedback loop.
3. **Advancing a TODO item tagged `waiting-data`.** The data is the blocker; Claude can't synthesize it from first principles. These go to the Data Acquisition bucket in `/lattice:prioritize`, not to autopilot.
4. **Advancing an untagged TODO item.** If there's no `autopilot:` tag, you don't know if it's safe. Escalate for tagging.
