# Lattice Workflow

The canonical workflow for research-driven development of scientific apps.

## Quick Start

```
# Interactive (in Claude Code session)
/lattice:prioritize                        -- what should I work on?
/lattice:cycle {topic}                     -- auto-detect phase, run next sub-cycle
/lattice:research-cycle {topic}            -- research phase: produce + peer review + validate
/lattice:blueprint-cycle {topic}            -- blueprint phase: synthesize + architect gate + plan review
/lattice:build-cycle {topic}               -- build phase: design + implement + review + commit
/lattice:autopilot                         -- advance all safe topics, batch human decisions
/lattice:probe {change}                    -- cross-impact analysis (targeted, --integrity, --safety)
/lattice:architect audit {path}            -- ad-hoc architecture audit
/lattice:architect gate {spec}             -- pre-implementation architecture gate
/lattice:design {spec or feature}          -- UI/UX design step (between synthesize and implement)
/lattice:implement {spec}                  -- autonomous spec implementation, phase by phase
/lattice:spike {feature}                   -- exploratory build (no spec ceremony)
/lattice:review                            -- quality gate (includes architect review) + commit
/lattice:distill <question>                -- answer a question from accumulated research
/lattice:distill --thesis <claim>          -- construct evidence-based argument from corpus
/lattice:distill --adapt <target>          -- domain transfer analysis
/lattice:distill --audit                   -- check doc coherence against decided research

# CLI (terminal, no Claude session required)
lattice status                             -- portfolio overview + coherence + cost
lattice coherence [topic]                  -- full conflict analysis
lattice autopilot [--dry-run] [--loop]     -- advance safe topics autonomously
lattice cost [topic]                       -- per-topic cost report
lattice e2e run [--base main]              -- branch-comparison E2E testing gate
lattice e2e classify [--base main]         -- testability classification
lattice run <workflow> --topic <topic>     -- execute a specific workflow DAG
lattice validate [workflow]                -- validate workflow YAML
lattice list                               -- list available workflows
lattice inspect <workflow>                 -- show execution plan
```

## Pipeline

```
+---------------------------------------------------------------------------+
|  PRIORITIZE                                                               |
|                                                                           |
|  /lattice:prioritize                                                      |
|       |  reads: TODO.md, incoming/, research/INDEX.md, git log            |
|       |  ranks by scientist value, not effort                             |
|       v                                                                   |
|  recommendation: research X / synthesize Y / fix Z                        |
|                                                                           |
+---------------------------------------------------------------------------+
                          |
           /lattice:cycle {topic}  -- auto-detects phase
                          |
                          v
+---------------------------------------------------------------------------+
|  RESEARCH CYCLE (/lattice:research-cycle)                                 |
|  Auto-detects entry point within phase from state or file existence       |
|                                                                           |
|  Step 1: /lattice:research               <-- produce                     |
|       |  corpus load (Step 0), landscape or deep dive                     |
|       v                                                                   |
|  Step 2: /lattice:peer-review            <-- separate agent, R1          |
|       v                                                                   |
|  Step 3: incorporate feedback            <-- auto-accept CONDITIONAL     |
|       v                                                                   |
|  Step 4: /lattice:peer-review            <-- fresh agent, R2             |
|       |  optional: --novel (different sources)                            |
|       v                                                                   |
|  Step 5: evaluate                                                         |
|       |-- SOUND/CONDITIONAL --> research validated                        |
|       +-- FLAWED --> STOP, escalate to user                               |
|       v                                                                   |
|  Step 6: /lattice:distill --audit        <-- corpus coherence check      |
|       v                                                                   |
|  Step 7: /lattice:probe                  <-- cross-impact analysis       |
|       v                                                                   |
|  Output: validated research doc                                           |
|                                                                           |
+---------------------------------------------------------------------------+
                          |
                          v
+---------------------------------------------------------------------------+
|  BLUEPRINT CYCLE (/lattice:blueprint-cycle)                               |
|  Prerequisite: research-complete                                          |
|                                                                           |
|  Step 1: /lattice:synthesize             <-- build plan + gaps           |
|       |  mandatory: reuse inventory, simplicity rationale,                |
|       |  test strategy (6 sections gated)                                 |
|       v                                                                   |
|  Step 2: /lattice:architect gate         <-- separate agent              |
|       |  Step 1.5: SPEC-VALUE-AUDIT first pass                            |
|       |    (PASS / SCOPE REDUCTION REQUIRED / EVIDENCE GAP)               |
|       |  Step 2: architect-reviewer                                       |
|       |    (PASS / SIMPLIFY / REJECT / SCIENCE-FLAG)                      |
|       v                                                                   |
|  Step 3: /lattice:probe                  <-- build plan impact check     |
|       v                                                                   |
|  Step 4: /lattice:peer-review            <-- separate agent, R1          |
|       v                                                                   |
|  Step 5: incorporate plan feedback                                        |
|       v                                                                   |
|  Step 6: /lattice:peer-review            <-- fresh agent, R2             |
|       v                                                                   |
|  Step 7: blueprint complete                                               |
|       |-- Build plan --> ready for build phase                            |
|       |-- Research gaps --> next /lattice:research-cycle                   |
|       +-- Data gaps --> TODO.md                                           |
|                                                                           |
+---------------------------------------------------------------------------+
                          |
                          v
+---------------------------------------------------------------------------+
|  BUILD CYCLE (/lattice:build-cycle)                                       |
|  Prerequisite: blueprint-complete (or direct spec path)                   |
|                                                                           |
|  Step 1: /lattice:implement {spec}       <-- autonomous phase-by-phase   |
|       |  Phase 0: load & plan                                             |
|       |  Phase 1-N: for each phase with new UI:                           |
|       |    /lattice:design   <-- placement, technology, layout            |
|       |    then implement, then /ops:check                                |
|       |  Phase N+1: implementation audit (deviations, decisions, gaps)     |
|       v                                                                   |
|  Step 2: E2E gate                        <-- branch-comparison testing   |
|       v                                                                   |
|  Step 3: /lattice:review                 <-- always runs (quality gate)  |
|       |  architect review (separate agent)                                |
|       |  decision audit (separate agent -- merit enforcement)             |
|       |  requirement trace (separate agent for spec work)                 |
|       v                                                                   |
|  Step 4: build complete                                                   |
|       |                                                                   |
|       v                                                                   |
|  commit                                                                   |
|                                                                           |
+---------------------------------------------------------------------------+


+---------------------------------------------------------------------------+
|  BUG FIX LOOP (parallel track -- enter from any bug report)               |
|                                                                           |
|  1. Read full module (rule 10a-c)                                         |
|  2. State root cause hypothesis                                           |
|  3. Write failing test FIRST                                              |
|  4. Fix the bug                                                           |
|  5. /ops:bug-stress           <-- mandatory post-fix QC                  |
|       |  classify pattern (10 families)                                   |
|       |  search same pattern in downstream subsystems                     |
|       |  fix all instances found (not just the one)                       |
|       |  grow oracle (add tests, expand validation)                       |
|       v                                                                   |
|  6. E2E gate + /ops:check + validation ratchet (if engine files)          |
|  7. /lattice:review --> commit                                            |
|                                                                           |
|  3+ bugs in same pattern family --> extract pattern test suite            |
|                                                                           |
+---------------------------------------------------------------------------+
                          |
                          v
+---------------------------------------------------------------------------+
|  FEEDBACK LOOP                                                            |
|                                                                           |
|  Research gaps from synthesis --> next /lattice:research-cycle             |
|  Data gaps from synthesis --> TODO.md or data acquisition                 |
|  Coverage gaps --> validation reference cards                             |
|  Bug patterns --> .lattice/bug-patterns.md (3+ = test suite)             |
|  /lattice:daily-update --> Slack                                          |
|                                                                           |
+---------------------------------------------------------------------------+


+---------------------------------------------------------------------------+
|  DISTILL (orthogonal -- enter at any time, reads full corpus)             |
|                                                                           |
|  /lattice:distill <question>                                              |
|       |  grounded answer from accumulated research                        |
|       v                                                                   |
|  standalone answer (inline or saved to distillations/)                    |
|                                                                           |
|  /lattice:distill --thesis <claim>                                        |
|       |  evidence chain from corpus                                       |
|       v                                                                   |
|  thesis doc --> /lattice:peer-review (validate argument)                  |
|             --> expand to publication draft                               |
|             --> /lattice:research (fill evidence gaps)                    |
|                                                                           |
|  /lattice:distill --adapt <target-domain>                                 |
|       |  transfer map: what applies, what doesn't, what's missing         |
|       v                                                                   |
|  adaptation plan --> /lattice:research (investigate gaps)                 |
|                  --> /lattice:synthesize (spec the adaptation)            |
|                                                                           |
|  /lattice:distill --audit                                                 |
|       |  diff: decided research vs current documentation                  |
|       v                                                                   |
|  coherence report --> regen-science (auto-generated docs)                 |
|                   --> manual edits (authored docs)                        |
|                   --> TODO.md (deferred fixes)                            |
|                                                                           |
|  Outputs: docs/_internal/research/distillations/                          |
|                                                                           |
+---------------------------------------------------------------------------+
```

## Phase Transitions

The three cycles form a pipeline with explicit boundaries. `/lattice:cycle` auto-dispatches:

| From | To | Transition |
|------|-----|-----------|
| (start) | Research | New topic with no existing artifacts |
| Research complete | Blueprint | Validated research exists, no synthesis |
| Blueprint complete | Build | Validated build plan exists |
| Build complete | Done | Code committed |

Each sub-cycle auto-detects its entry point within the phase -- no `--from` flags needed.

**Three paths:** The meta-orchestrator classifies new topics and routes to: full cycle (research -> blueprint -> build) for complex/new-domain work, spike cycle (spike -> spec-from-code -> review) for known-territory work, or bug fix cycle (classify -> investigate -> fix -> stress -> review) for defects. All end with the same review quality gate.

### State file

All three cycles share `.lattice/cycle-state/{topic}.yaml`:

```yaml
topic: {topic}
started: {ISO timestamp}
phase: research | research-complete | blueprint | blueprint-complete | build | complete
current_step: research.3  # or blueprint.2, build.1, etc.
revision: 7               # integer, incremented on every write (concurrent safety)
completed:
  research.1: {timestamp}
  research.2: {timestamp}
  ...
checkpoints:
  research.1:
    completed: {timestamp}
    key_decisions: [...]
    constraints: [...]
    output: "path/to/output"
    next_needs: "what the next step needs"
cost:                          # accumulated across all workflow runs
  total_usd: 12.50
  total_input_tokens: 85000
  total_output_tokens: 42000
  last_run: {ISO timestamp}
  nodes:
    research: { cost_usd: 3.20, input_tokens: 25000, output_tokens: 18000 }
    implement: { cost_usd: 5.40, input_tokens: 35000, output_tokens: 15000 }
subsystems: [S01, S07, S10]   # subsystem codes touched by this topic
science_flags: [...]           # analytical output changes requiring review
breaks: [...]                  # system integrity concerns
prerequisites: [...]           # other topics this depends on
```

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

## Enforcement Layer

The framework uses enforcement mechanisms at multiple levels. Prose instructions describe what should happen. Enforcement ensures it does.

### 1. Review Gate (`scripts/write-review-gate.sh` + `.git/hooks/pre-commit`)

Every commit requires a review gate file (`.lattice/review-gate.json`). Two ways to create it:

- `/lattice:review` -- full quality gate with architect review, decision audit, requirement trace
- `scripts/write-review-gate.sh` -- mechanical checks only (build, tests, syntax). Escape hatch for trivial commits.

The pre-commit hook verifies the gate file exists and is fresh (<30 min), runs build checks on staged code files, emits index freshness and complexity advisories, and consumes the gate after a successful commit (single-use).

### 2. Validation Ratchet (`scripts/validation-ratchet.sh`)

Measures analytical correctness against ground truth studies. Not binary keep/discard: degradation routes to research.

```
baseline  -- capture current validation scores
compare   -- compare current vs baseline
auto      -- baseline (if needed) + regenerate all studies + compare

Exit codes: 0 = same/improved, 2 = degradation detected
```

**Degradation handling:** Degradation doesn't mean rollback. It means analytical behavior changed. The ratchet identifies WHICH signals/assertions changed. The agent must determine: expected (documented in spec) -> update ground truth, or unexpected -> route to `/lattice:research`.

### 3. Coherence Engine (`executor/src/coherence.ts`)

Portfolio-level conflict detection. See [Coherence & Reconciliation](#coherence--reconciliation) above.

### 4. E2E Testing Gate (`executor/src/e2e.ts`)

Branch-comparison behavioral verification. Three comparison modes (auto-detected from git state):

| Mode | Compares | When |
|------|----------|------|
| `branch` | Feature branch vs base branch | On a feature branch |
| `uncommitted` | Stash dirty state, run clean, compare | Uncommitted changes on trunk |
| `last-commit` | HEAD~1 vs HEAD | After committing on trunk |

**Flow:** Classify changed files -> determine testability (e2e_testable vs code_review_only) -> run configured suites on both states -> compare results -> write verdict.

**Config:** `.lattice/e2e.yaml` per project. Defines suites (name, command, pass criteria) and file patterns.

**Integration:** Build-cycle and bug-fix-cycle workflows include E2E gate nodes (`e2e-classify`, `e2e-gate`, `e2e-run`).

### 5. Token Tracker / Budget (`executor/src/budget.ts`)

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

### 6. Decision Log (`.lattice/decisions.log`)

Persistent experiment memory across sessions. TSV, append-only. Every skill appends after producing output.

```
TIMESTAMP	SKILL	OUTCOME	CONTEXT	METRICS	NOTES
```

**What it prevents:**
- Re-trying approaches that already failed
- Losing user accept/reject decisions across sessions
- Validation drift going unnoticed

### 7. Claude Code Hooks (`.claude/settings.json`)

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

### 8. Structural Quality Gates

File-based checks that cycle orchestrators run on skill outputs before proceeding:

| Gate | What it checks | Blocks proceed on failure |
|------|---------------|--------------------------|
| **Peer review quality** | >=3 findings, >=3 review dimensions, evidence per finding | Yes -- re-launches peer review |
| **Synthesis sections** | 6 mandatory sections present with content | Yes -- re-runs synthesize |
| **Architect verdict** | REJECT/SCIENCE-FLAG require user decision | Yes -- STOP at decision point |
| **Probe results** | BREAKS/SCIENCE-FLAG require user decision | Yes -- STOP at decision point |
| **Engine change marker** | `.lattice/engine-changed` exists -> validation ratchet required | Yes -- blocks commit |

### 9. Concurrent Session Safety

When multiple agents work in parallel on the same repo:

- **Commit lock** (`scripts/acquire-lock.sh` / `release-lock.sh`) -- atomic mkdir, polls every 30s, 5min stale threshold
- **Topic WIP lock** (`scripts/acquire-topic-lock.sh` / `release-topic-lock.sh`) -- prevents two agents from working on the same topic, 30min stale threshold
- **Merge shared state** (`scripts/merge-shared-state.sh`) -- refreshes TODO.md, ROADMAP.md, etc. from HEAD before committing
- **Revision-checked writes** -- state file `revision: N` field, re-read before write, abort on mismatch

See CLAUDE.md "Concurrent Sessions" for full protocol.

## Skills Reference

| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| `/lattice:prioritize` | Strategic advisor -- what to do next | (reads all state) | Priority recommendations |
| `/lattice:autopilot` | Advance safe topics, batch human decisions | (reads all state) | Workflow runs + decision batch |
| `/lattice:distill` | Corpus-level reasoning | Question/claim + mode flag | `distillations/{topic}-*.md` |
| `/lattice:cycle` | **Meta-orchestrator** -- auto-detect phase, dispatch | Topic | Runs next sub-cycle |
| `/lattice:research-cycle` | **Research phase** -- produce + peer review + validate | Topic | Validated research doc |
| `/lattice:blueprint-cycle` | **Blueprint phase** -- synthesize + architect gate + plan review | Topic | Validated build plan |
| `/lattice:build-cycle` | **Build phase** -- design + implement + review + commit | Topic or spec path | Committed code |
| `/lattice:research` | First-principles gap analysis | Topic | `research/{topic}.md` |
| `/lattice:peer-review` | Blind scientific challenge | Any document, optional `--novel` | `peer-reviews/{topic}-review.md` |
| `/lattice:synthesize` | Ground research in codebase | Research doc path | `incoming/{topic}-synthesis.md` |
| `/lattice:probe` | Cross-impact analysis | Change/decision/file, or `--integrity`/`--safety` | Impact report with blast radius |
| `/lattice:architect` | Architecture quality gate | File/dir/spec path | Audit report or gate verdict |
| `/lattice:design` | UI/UX design step | Spec/feature description | Layout spec + element list |
| `/lattice:implement` | Autonomous spec implementation | Spec file path | Reviewed code + audit table |
| `/lattice:spike` | Exploratory implementation (no spec) | Feature | Code |
| `/lattice:spec-from-code` | Reverse-engineer spec from spike | Implementation | `incoming/{feature}.md` |
| `/lattice:review` | Quality gate + commit | Changed files | Commit (if passes) |
| `/lattice:ux-designer` | Design audit | View or component | Audit report |
| `/lattice:daily-update` | Slack update from commits | (reads git log) | Formatted message |
| `/lattice:pause-work` | Session handoff | Current state | `.continue-here.md` |
| `/lattice:resume-work` | Restore session | `.continue-here.md` | Restored context |
| `/ops:check` | Quick sanity check | (runs build + validation) | Pass/fail |
| `/ops:impact` | Blast radius analysis | Function/file/module path | Impact report |
| `/ops:bug` | Log a bug | Description | Entry in BUG-SWEEP.md |
| `/ops:bug-stress` | Post-fix pattern search + oracle growth | Changed files | Stress report + tests |
| `/ops:explore-data` | Query generated study data | Question about data | Data answer |
| `/ops:sweep` | State garbage collection | (reads all indexes) | Cleaned indexes |
