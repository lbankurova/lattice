# Lattice Workflow Internals

How the pipeline works under the hood: the executor, autopilot loop, coherence detection, peer-review protocol, and synthesis output contract.

Readers:
- If you're using the framework day-to-day, start at [WORKFLOW.md](WORKFLOW.md). This file is for debugging, contributing to the framework, or understanding why a topic didn't advance.
- If something just blocked a commit, [ENFORCEMENT.md](ENFORCEMENT.md) is likely what you want instead.

## Executor Engine

The executor (`executor/src/`) runs workflow YAML DAGs. It is separate from the markdown skills -- the YAML defines orchestration (what runs when), skills define behavior (what each node does).

**Execution flow:**
1. Load workflow YAML, validate nodes and edges
2. Build topological layers (Kahn's algorithm) -- nodes in the same layer run concurrently
3. For each layer: filter nodes (skip completed checkpoints, evaluate conditions, check routing)
4. Execute: `bash` -> child_process, `skill` -> Claude CLI (`--output-format json`), `gate` -> condition evaluation, `approval` -> human prompt
5. Collect results, accumulate cost, check budget limits
6. Write checkpoint to state file, log decision
7. Repeat until all layers done or a failure/budget block stops the workflow

**Resume:** When re-running a workflow for a topic, completed checkpoints are skipped. State file `revision` field prevents concurrent overwrites.

**Coherence pre-check:** Before advancing a topic, the engine loads all active cycle states, runs the coherence engine, and blocks if the topic has unresolved conflicts (subsystem overlap, stale blueprints, cascading breaks). Blockers require human approval to proceed.

## Autopilot

`lattice autopilot` (CLI) or `/lattice:autopilot` (in-session) runs the full portfolio autonomously.

**What it does:**
1. Reconcile all cycle states against git history (auto-correct drift)
2. Run coherence check across all active topics
3. Attempt auto-resolve for resolvable conflicts (subsystem-overlap, stale-blueprint, SF-propagation)
4. Identify safe topics (no blockers, no conflicts)
5. Advance each safe topic through its next sub-cycle
6. Collect all STOP conditions into a human decision batch

**Autonomous decisions (no human):**
- Classification (full/spike/bugfix)
- Phase transitions (research -> blueprint -> build)
- CONDITIONAL peer review findings (auto-accept)
- Architect SIMPLIFY (auto-apply, re-gate)
- Bikeshed detection (auto-side with R1)
- Commit (when review passes)

**Stops for human:**
- SCIENCE-FLAG (analytical output changes)
- Persistent FLAWED (genuine scientific disagreement across both rounds)
- BREAKS (system integrity)
- Architect REJECT (fundamental approach wrong)
- Coherence conflicts that can't be auto-resolved (prerequisite violations, BREAKS cascades)
- Validation degradation (expected vs unexpected)

**Flags:** `--dry-run` (report without executing), `--loop` (continuous, default is single pass), `--max N` (cap topics per loop, default 3), `--filter PATTERN` (substring match on topic names).

Every auto-decision is logged. The user can audit after the fact and re-enter at any step.

## Coherence & Reconciliation

### Coherence engine (`executor/src/coherence.ts`)

Detects portfolio-level conflicts that make it unsafe to advance a topic. Reads all `.lattice/cycle-state/*.yaml` files and builds a subsystem-to-topic graph.

**Conflict types:**

| Type | Severity | What | Example |
|------|----------|------|---------|
| `subsystem-overlap` | blocker/warning | Two active topics modify the same subsystem | Topic A and B both touch S10 (scoring engine) |
| `stale-blueprint` | warning | Blueprint validated before newer research affecting its subsystems | Research on HCD completed after blueprint for scoring |
| `unresolved-cascade` | blocker | SF or BREAKS in topic A propagates to subsystems used by topic B | Science flag in organ weights cascades to scoring |
| `prerequisite` | blocker | Topic depends on another that hasn't completed | Visualization depends on data pipeline not yet built |
| `science-flag-propagation` | warning | SF in one topic may affect another's analytical output | -- |

**Output:** `CoherenceReport` with safe topics (ready to advance), blocked topics, and topics needing human decisions. Subsystem heatmap shows which subsystems are contended.

### Auto-resolve (`executor/src/auto-resolve.ts`)

Attempts to resolve conflicts without human intervention by running a targeted Claude distill analysis against the conflicting topics' research/synthesis docs.

- **subsystem-overlap** -> checks if interactions are read-only or compatible
- **stale-blueprint** -> checks if newer research actually invalidates the blueprint
- **science-flag-propagation** -> checks if SF is misclassified (deferred/contextual)
- **prerequisite, BREAKS** -> always human (never auto-resolved)

Verdicts: `RESOLVED` (conflict removed), `NOT_RESOLVED` (conflict stands), `NEEDS_HUMAN` (ambiguous).

### Reconciliation (`executor/src/reconcile.ts`)

Derives topic state truth from git commit trailers rather than trusting state files. Every `lattice status` and `lattice coherence` command runs reconciliation first.

Greps `git log` for `Topic:` and `Phase:` trailers, compares against cycle-state YAML files, and auto-corrects drift. Also reads retroactive annotations from `.lattice/commit-topics.tsv` for legacy commits that predate the trailer convention.

## Peer Review Protocol

**Separate agent mandatory.** Peer review always runs in a launched agent with no access to the orchestrator's context. Self-review doesn't work -- the research rationale is in the context window.

**Maximum 2 rounds per artifact.** Each round is a full `/lattice:peer-review` pass.

### Round 1 (standard)
Peer reviewer challenges the artifact. Produces verdicts: SOUND, CONDITIONAL, FLAWED, INSUFFICIENT.

Author incorporates accepted feedback:
- SOUND: no action
- CONDITIONAL: address the conditions, strengthen evidence
- FLAWED: fix the material error
- INSUFFICIENT: add missing information

Autonomous mode: CONDITIONAL auto-accepted, FLAWED accepted for incorporation. User decisions logged.

### Round 2 (optionally `--novel`)
Fresh agent checks revisions. With `--novel` flag, forces different sources than Round 1 -- recent, niche, underindexed work.

| Outcome | Action |
|---------|--------|
| All SOUND or CONDITIONAL | Proceed |
| New FLAWED on previously-SOUND | Likely bikeshedding -- escalate to user |
| Same FLAWED both rounds | Genuine disagreement -- escalate with both positions |

**No Round 3.** Unresolved issues require human judgment.

### Escalation Format

```
UNRESOLVED: {topic}

Round 1 position: {what the reviewer said}
Round 1 evidence: {citations}

Author response: {what was changed and why}

Round 2 position: {what the reviewer said after revision}
Round 2 evidence: {citations}

Recommendation: {which position has stronger evidence}
Your call: {what decision is needed}
```

## Synthesis Output

`/lattice:synthesize` produces three sections:

| Section | Content | Routes to |
|---------|---------|-----------|
| **Build Plan** | Features with acceptance criteria, merit-driven decisions (rule 12), real dependencies only (rule 13) | `incoming/` spec, ROADMAP intake |
| **Research Gaps** | Questions needing answers, blocking status, suggested sources | Next `/lattice:research-cycle` |
| **Data Gaps** | Missing data, species, study types, impact if unaddressed | TODO.md or backlog |

## Review Quality Gate

`/lattice:review` produces 7 mandatory output sections:

1. **CHANGES** -- what changed
2. **ARCHITECT REVIEW** -- complexity and science preservation (separate agent)
3. **DECISION AUDIT** -- merit evaluation (separate agent -- rules 12-13 enforcement) + deferral litmus test
4. **REQUIREMENT TRACE** -- four-dimension check (WHAT/WHEN/UNLESS/HOW)
5. **MECHANICAL CHECKS** -- build, lint, tests
6. **DOCS UPDATE** -- MANIFEST, specs, TODO
7. **VERDICT** -- pass/fail with evidence

Missing section = incomplete review.

## Session Management

- `/lattice:pause-work` -- persist state if session ends mid-pipeline
- `/lattice:resume-work` -- restore and continue
- All artifacts persist to disk -- terminal crashes lose nothing
- Cross-session resume: each cycle reads `.lattice/cycle-state/{topic}.yaml` and decisions log to resume from last completed step
