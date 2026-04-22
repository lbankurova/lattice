# Lattice Workflow

The canonical workflow for research-driven development of scientific apps.

This file covers the happy path: what to run, how phases fit together, and the skill list. For deeper material see:

- [WORKFLOW-INTERNALS.md](WORKFLOW-INTERNALS.md) — executor engine, autopilot loop, coherence detection, peer-review protocol, synthesis output contract, review gate sections, session management
- [ENFORCEMENT.md](ENFORCEMENT.md) — review gate, validation ratchet, E2E gate, token budget, decision log, Claude Code hooks, structural quality gates, concurrent session safety

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
