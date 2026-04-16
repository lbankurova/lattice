# Lattice Workflow

The canonical workflow for research-driven development of scientific apps.

## Quick Start

```
/lattice:prioritize                        -- what should I work on?
/lattice:cycle {topic}                     -- auto-detect phase, run next sub-cycle
/lattice:research-cycle {topic}            -- research phase: produce + peer review + validate
/lattice:blueprint-cycle {topic}            -- blueprint phase: synthesize + architect gate + plan review
/lattice:build-cycle {topic}               -- build phase: design + implement + review + commit
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
|       |  PASS / SIMPLIFY / REJECT / SCIENCE-FLAG                          |
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
|  Step 2: /lattice:review                 <-- always runs (quality gate)  |
|       |  architect review (separate agent)                                |
|       |  decision audit (separate agent -- merit enforcement)             |
|       |  requirement trace (separate agent for spec work)                 |
|       v                                                                   |
|  Step 3: build complete                                                   |
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
|  6. /ops:check + validation ratchet (if engine files)                     |
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

Each sub-cycle auto-detects its entry point within the phase — no `--from` flags needed.

### State file

All three cycles share `.lattice/cycle-state/{topic}.yaml`:

```yaml
topic: {topic}
started: {ISO timestamp}
phase: research | research-complete | blueprint | blueprint-complete | build | complete
current_step: research.3  # or blueprint.2, build.1, etc.
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
```

## Peer Review Protocol

**Separate agent mandatory.** Peer review always runs in a launched agent with no access to the orchestrator's context. Self-review doesn't work — the research rationale is in the context window.

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
Fresh agent checks revisions. With `--novel` flag, forces different sources than Round 1 — recent, niche, underindexed work.

| Outcome | Action |
|---------|--------|
| All SOUND or CONDITIONAL | Proceed |
| New FLAWED on previously-SOUND | Likely bikeshedding — escalate to user |
| Same FLAWED both rounds | Genuine disagreement — escalate with both positions |

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
| **Build Plan** | Features with acceptance criteria, merit-driven decisions (rule 13), real dependencies only (rule 14) | `incoming/` spec, ROADMAP intake |
| **Research Gaps** | Questions needing answers, blocking status, suggested sources | Next `/lattice:research-cycle` |
| **Data Gaps** | Missing data, species, study types, impact if unaddressed | TODO.md or backlog |

## Review Quality Gate

`/lattice:review` produces 7 mandatory output sections:

1. **CHANGES** — what changed
2. **ARCHITECT REVIEW** — complexity and science preservation (separate agent)
3. **DECISION AUDIT** — merit evaluation (separate agent — rules 13-14 enforcement) + deferral litmus test
4. **REQUIREMENT TRACE** — four-dimension check (WHAT/WHEN/UNLESS/HOW)
5. **MECHANICAL CHECKS** — build, lint, tests
6. **DOCS UPDATE** — MANIFEST, specs, TODO
7. **VERDICT** — pass/fail with evidence

Missing section = incomplete review.

## Session Management

- `/lattice:pause-work` — persist state if session ends mid-pipeline
- `/lattice:resume-work` — restore and continue
- All artifacts persist to disk — terminal crashes lose nothing
- Cross-session resume: each cycle reads `.lattice/cycle-state/{topic}.yaml` and decisions log to resume from last completed step

## Enforcement Layer

The framework uses three enforcement mechanisms. Prose instructions describe what should happen. Enforcement ensures it does.

### 1. Validation Ratchet (`scripts/validation-ratchet.sh`)

The validation oracle — measures analytical correctness against ground truth studies. Not binary keep/discard: degradation routes to research.

```
baseline  -- capture current validation scores
compare   -- compare current vs baseline
auto      -- baseline (if needed) + regenerate all studies + compare

Exit codes: 0 = same/improved, 2 = degradation detected
```

**Degradation handling:** Degradation doesn't mean rollback. It means analytical behavior changed. The ratchet identifies WHICH signals/assertions changed. The agent must then determine:
- **Expected** (documented in the current spec as intentional) -> update ground truth, proceed
- **Unexpected** -> route to `/lattice:research` on the specific regression

### 2. Decision Log (`.lattice/decisions.log`)

Persistent experiment memory across sessions. TSV, append-only. Every skill appends after producing output.

```
TIMESTAMP	SKILL	OUTCOME	CONTEXT	METRICS	NOTES
```

**What it prevents:**
- Re-trying approaches that already failed
- Losing user accept/reject decisions across sessions
- Validation drift going unnoticed

Agents read the log at session start. If the log shows a prior failed attempt at the same approach, the agent must take a different path.

### 3. Structural Quality Gates

File-based checks that cycle orchestrators run on skill outputs before proceeding:

| Gate | What it checks | Blocks proceed on failure |
|------|---------------|--------------------------|
| **Peer review quality** | >=3 findings, >=3 review dimensions, evidence per finding | Yes — re-launches peer review |
| **Synthesis sections** | 6 mandatory sections present with content | Yes — re-runs synthesize |
| **Architect verdict** | REJECT/SCIENCE-FLAG require user decision | Yes — STOP at decision point |
| **Probe results** | BREAKS/SCIENCE-FLAG require user decision | Yes — STOP at decision point |
| **Engine change marker** | `.lattice/engine-changed` exists -> validation ratchet required | Yes — blocks commit |

### 4. Claude Code Hooks (`.claude/settings.json`)

Mechanical enforcement -- the agent cannot skip these:

**PreToolUse (fire before `git commit`):**

| Hook | Action |
|------|--------|
| **Commit lock** | BLOCKS if another agent holds `.lattice/commit.lock`. Auto-expires stale locks >5min. |
| **Topic trailer** | WARNS (non-blocking) when `feat:`/`fix:` commits lack a `Topic:` trailer. |
| **Review gate** | BLOCKS ALL commits without a fresh `.lattice/review-gate.json`. No file-count threshold. |

**PostToolUse (fire after Write/Edit):**

| Hook | Action |
|------|--------|
| **Co-author block** | BLOCKS writes containing `Co-Authored-By` (rule 4). |
| **Build check** | Advisory -- runs TypeScript build after edits to code files. |

The review gate is the primary enforcement mechanism. It ensures every commit passes through `/lattice:review` (full quality gate) or `scripts/write-review-gate.sh` (mechanical checks only). The gate file is single-use -- consumed after each successful commit.

### 5. Review Gate (`scripts/write-review-gate.sh` + `.git/hooks/pre-commit`)

The escape hatch for trivial commits that skip the full `/lattice:review`. Runs mechanical checks (build, tests, syntax) before writing the gate file. If any check fails, the gate is not written and the commit stays blocked.

The pre-commit hook provides a second layer: it verifies the gate file exists and is fresh (<30 min), runs build checks on staged code files, emits index freshness and complexity advisories, and consumes the gate after a successful commit.

Template hooks for new projects live in `hooks/claude-hooks.json` (legacy reference) and `scaffold/.claude/settings.json` (current). Replace `PIPELINE_MODULES_PATTERN` and `ENGINE_FILES_PATTERN` with project-specific regexes.

### 6. Autonomous Execution Model

All three cycles run autonomously by default. They stop only at critical decision points:

| Always autonomous | Stops for human |
|---|---|
| CONDITIONAL peer review findings (auto-accept) | FLAWED findings persisting across both rounds |
| SOUND evaluations (proceed) | Architect REJECT or SCIENCE-FLAG |
| Architect PASS (proceed) | Probe BREAKS or SCIENCE-FLAG |
| Architect SIMPLIFY (auto-apply, re-gate) | Landscape branch selection |
| Probe SAFE/PROPAGATES (proceed) | Validation degradation (expected vs unexpected) |
| Distill audit (informational) | Phase transitions (ask before crossing) |

Every auto-decision is logged. The user can audit after the fact and re-enter at any step if a decision was wrong.

## Skills Reference

| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| `/lattice:prioritize` | Strategic advisor — what to do next | (reads all state) | Priority recommendations |
| `/lattice:distill` | Corpus-level reasoning | Question/claim + mode flag | `distillations/{topic}-*.md` |
| `/lattice:cycle` | **Meta-orchestrator** — auto-detect phase, dispatch | Topic | Runs next sub-cycle |
| `/lattice:research-cycle` | **Research phase** — produce + peer review + validate | Topic | Validated research doc |
| `/lattice:blueprint-cycle` | **Blueprint phase** — synthesize + architect gate + plan review | Topic | Validated build plan |
| `/lattice:build-cycle` | **Build phase** — design + implement + review + commit | Topic or spec path | Committed code |
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
| `/ops:bug-stress` | Post-fix pattern search + oracle growth | Changed files or bug description | Stress report + tests |
| `/ops:sweep` | State garbage collection | (reads all indexes) | Cleaned indexes |
| `/lattice:daily-update` | Slack update from commits | (reads git log) | Formatted message |
| `/lattice:pause-work` | Session handoff | Current state | `.continue-here.md` |
| `/lattice:resume-work` | Restore session | `.continue-here.md` | Restored context |
