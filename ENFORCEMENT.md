# Lattice Enforcement Layer

The framework uses enforcement mechanisms at multiple levels. Prose instructions describe what should happen. Enforcement ensures it does.

Readers:
- If a hook just blocked your commit or a script stopped you, this is the file that explains why.
- If you're configuring a new project, use this as the checklist of guardrails to wire up.

See also:
- [WORKFLOW.md](WORKFLOW.md) — pipeline overview and skill list
- [WORKFLOW-INTERNALS.md](WORKFLOW-INTERNALS.md) — executor engine, autopilot, coherence, peer-review protocol

## 1. Review Gate (`scripts/write-review-gate.sh` + `.git/hooks/pre-commit`)

Every commit requires a review gate file (`.lattice/review-gate.json`). Two ways to create it:

- `/lattice:review` -- full quality gate with architect review, decision audit, requirement trace
- `scripts/write-review-gate.sh` -- mechanical checks only (build, tests, syntax). Escape hatch for trivial commits.

The pre-commit hook verifies the gate file exists and is fresh (<30 min), runs build checks on staged code files, emits index freshness and complexity advisories, and consumes the gate after a successful commit (single-use).

## 2. Validation Ratchet (`scripts/validation-ratchet.sh`)

Measures analytical correctness against ground truth studies. Not binary keep/discard: degradation routes to research.

```
baseline  -- capture current validation scores
compare   -- compare current vs baseline
auto      -- baseline (if needed) + regenerate all studies + compare

Exit codes: 0 = same/improved, 2 = degradation detected
```

**Degradation handling:** Degradation doesn't mean rollback. It means analytical behavior changed. The ratchet identifies WHICH signals/assertions changed. The agent must determine: expected (documented in spec) -> update ground truth, or unexpected -> route to `/lattice:research`.

## 3. Coherence Engine (`executor/src/coherence.ts`)

Portfolio-level conflict detection. See [WORKFLOW-INTERNALS.md](WORKFLOW-INTERNALS.md#coherence--reconciliation) for the full conflict-type taxonomy and auto-resolve flow.

## 4. E2E Testing Gate (`executor/src/e2e.ts`)

Branch-comparison behavioral verification. Three comparison modes (auto-detected from git state):

| Mode | Compares | When |
|------|----------|------|
| `branch` | Feature branch vs base branch | On a feature branch |
| `uncommitted` | Stash dirty state, run clean, compare | Uncommitted changes on trunk |
| `last-commit` | HEAD~1 vs HEAD | After committing on trunk |

**Flow:** Classify changed files -> determine testability (e2e_testable vs code_review_only) -> run configured suites on both states -> compare results -> write verdict.

**Config:** `.lattice/e2e.yaml` per project. Defines suites (name, command, pass criteria) and file patterns.

**Integration:** Build-cycle and bug-fix-cycle workflows include E2E gate nodes (`e2e-classify`, `e2e-gate`, `e2e-run`).

## 5. Token Tracker / Budget (`executor/src/budget.ts`)

Per-node token counting and cost enforcement. Skill nodes run `claude --output-format json`, which returns real `cost_usd` and token counts. Cost accumulates in `WorkflowRun` during execution and persists to the topic's cycle-state YAML across runs.

**Config:** `.lattice/budget.yaml` (optional -- no file = no limits)

```yaml
per_workflow:
  research-cycle: 15.00       # max USD per workflow run
  build-cycle: 10.00
per_topic: 40.00               # max USD accumulated across all runs for a topic
per_node:                       # max USD per individual node execution
  research: 5.00
alert_threshold: 0.8           # warn at 80% of any limit
```

**Behavior:**
- Below threshold: cost logged per node (`[implement] OK ($0.3842)`)
- At threshold: `[BUDGET WARNING]` message
- At limit: `[BUDGET EXCEEDED]` -- workflow stops, cost persisted, decision logged

## 6. Decision Log (`.lattice/decisions.log`)

Persistent experiment memory across sessions. TSV, append-only. Every skill appends after producing output.

```
TIMESTAMP	SKILL	OUTCOME	CONTEXT	METRICS	NOTES
```

**What it prevents:**
- Re-trying approaches that already failed
- Losing user accept/reject decisions across sessions
- Validation drift going unnoticed

## 7. Claude Code Hooks (`.claude/settings.json`)

Mechanical enforcement -- the agent cannot skip these:

**PreToolUse (fire before `git commit`):**

| Hook | Action |
|------|--------|
| **Commit lock** | BLOCKS if another agent holds `.lattice/commit.lock`. Auto-expires stale locks >5min. |
| **Topic trailer** | WARNS (non-blocking) when `feat:`/`fix:` commits lack a `Topic:` trailer. |
| **Review gate** | BLOCKS ALL commits without a fresh `.lattice/review-gate.json`. |

**PostToolUse (fire after Write/Edit):**

| Hook | Action |
|------|--------|
| **Co-author block** | BLOCKS writes containing `Co-Authored-By` (rule 4). |
| **Build check** | Advisory -- runs TypeScript build after edits to code files. |

## 8. Structural Quality Gates

File-based checks that cycle orchestrators run on skill outputs before proceeding:

| Gate | What it checks | Blocks proceed on failure |
|------|---------------|--------------------------|
| **Peer review quality** | >=3 findings, >=3 review dimensions, evidence per finding | Yes -- re-launches peer review |
| **Synthesis sections** | 6 mandatory sections present with content | Yes -- re-runs synthesize |
| **Architect verdict** | REJECT/SCIENCE-FLAG require user decision | Yes -- STOP at decision point |
| **Probe results** | BREAKS/SCIENCE-FLAG require user decision | Yes -- STOP at decision point |
| **Engine change marker** | `.lattice/engine-changed` exists -> validation ratchet required | Yes -- blocks commit |
| **Spec value audit** (rule 17) | Multi-feature specs answer per-feature frequency/impact | Yes -- `/lattice:architect` gate Step 1.5 routes non-PASS back for rework |

## 9. Concurrent Session Safety

When multiple agents work in parallel on the same repo:

- **Commit lock** (`scripts/acquire-lock.sh` / `release-lock.sh`) -- atomic mkdir, polls every 30s, 5min stale threshold
- **Topic WIP lock** (`scripts/acquire-topic-lock.sh` / `release-topic-lock.sh`) -- prevents two agents from working on the same topic, 30min stale threshold
- **Merge shared state** (`scripts/merge-shared-state.sh`) -- refreshes TODO.md, ROADMAP.md, etc. from HEAD before committing
- **Revision-checked writes** -- state file `revision: N` field, re-read before write, abort on mismatch

See CLAUDE.md "Concurrent Sessions" for full protocol.
