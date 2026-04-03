# Lattice Workflow

The canonical workflow for research-driven development of scientific apps.

## Quick Start

```
/lattice:prioritize                        — what should I work on?
/lattice:research-cycle {topic}            — full research + review + architect gate loop
/lattice:research-cycle {topic} --from synthesize  — synthesis + architect gate + plan review loop
/lattice:probe {change}                    — cross-impact analysis (targeted, --integrity, --safety)
/lattice:architect audit {path}            — ad-hoc architecture audit
/lattice:architect gate {spec}             — pre-implementation architecture gate
/lattice:design {spec or feature}          — UI/UX design step (between synthesize and implement)
/lattice:implement {spec}                  — autonomous spec implementation, phase by phase
/lattice:spike {feature}                   — exploratory build (no spec ceremony)
/lattice:review                            — quality gate (includes architect review) + commit
/lattice:distill <question>                — answer a question from accumulated research
/lattice:distill --thesis <claim>          — construct evidence-based argument from corpus
/lattice:distill --adapt <target>          — domain transfer analysis
/lattice:distill --audit                   — check doc coherence against decided research
```

## Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRIORITIZE                                                         │
│                                                                     │
│  /lattice:prioritize                                                │
│       │  reads: TODO.md, incoming/, research/INDEX.md, git log      │
│       │  ranks by scientist value, not effort                       │
│       ▼                                                             │
│  recommendation: research X / synthesize Y / fix Z                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RESEARCH CYCLE (/lattice:research-cycle)                           │
│  Enter at any step with --from {step}                               │
│  Auto-detects entry point from existing files                       │
│                                                                     │
│  Step 1: /lattice:research               ◄── produce                │
│       │  landscape (--landscape) or deep dive (--deep {branch})     │
│       ▼                                                             │
│  Step 2: /lattice:peer-review            ◄── separate agent, R1     │
│       │  WAIT — user accepts/rejects findings                       │
│       ▼                                                             │
│  Step 3: incorporate feedback            ◄── orchestrator            │
│       │                                                             │
│       ▼                                                             │
│  Step 4: /lattice:peer-review            ◄── fresh agent, R2        │
│       │  optional: --novel (different sources)                      │
│       ▼                                                             │
│  Step 5: evaluate                                                   │
│       ├── SOUND/CONDITIONAL ──► research validated                  │
│       └── FLAWED ──► escalate to user                               │
│       │                                                             │
│       ▼  WAIT — user decides: proceed to synthesis or stop          │
│                                                                     │
│  Step 6.5: /lattice:probe                ◄── cross-impact analysis  │
│       │  "does this research imply changes beyond what we'll        │
│       │   synthesize?" — checks system manifest adjacency           │
│       ▼                                                             │
│                                                                     │
│  Step 7: /lattice:synthesize             ◄── build plan + gaps      │
│       │  mandatory: reuse inventory, simplicity rationale,          │
│       │  test strategy                                              │
│       ▼                                                             │
│  Step 7.5: /lattice:architect gate       ◄── separate agent         │
│       │  PASS / SIMPLIFY / REJECT / SCIENCE-FLAG                    │
│       │  WAIT on SIMPLIFY/REJECT/SCIENCE-FLAG                       │
│       ▼                                                             │
│  Step 7.8: /lattice:probe                ◄── cross-impact analysis  │
│       │  "does the build plan have implications the architect        │
│       │   didn't catch?" — checks downstream subsystems             │
│       ▼                                                             │
│  Step 8: /lattice:peer-review            ◄── separate agent, R1     │
│       │  WAIT — user accepts/rejects                                │
│       ▼                                                             │
│  Step 9: incorporate plan feedback                                  │
│       │                                                             │
│       ▼                                                             │
│  Step 10: /lattice:peer-review           ◄── fresh agent, R2        │
│       │                                                             │
│       ▼                                                             │
│  Step 11: cycle complete                                            │
│       ├── Build plan → ready for implementation                     │
│       ├── Research gaps → next /lattice:research-cycle               │
│       └── Data gaps → TODO.md                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BUILD PHASE                                                        │
│                                                                     │
│  Route A: spec-driven                                               │
│  /lattice:implement {spec}   ◄── autonomous phase-by-phase          │
│       │  Phase 0: load & plan                                       │
│       │  Phase 1-N: for each phase with new UI:                     │
│       │    /lattice:design   ◄── placement, technology, layout      │
│       │    then implement, then /ops:check                          │
│       │  Phase N+1: full /lattice:review                            │
│       ▼                                                             │
│                                                                     │
│  Route B: exploratory                                               │
│  /lattice:spike {feature}    ◄── no spec ceremony                   │
│       │                                                             │
│       ▼                                                             │
│  /lattice:review             ◄── mandatory output sections          │
│       │                         decision audit (rules 13-14)        │
│       │                         deferral litmus test                 │
│       │                         four-dimension trace                 │
│       ▼                                                             │
│  commit                                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FEEDBACK LOOP                                                      │
│                                                                     │
│  Research gaps from synthesis ──► next /lattice:research-cycle       │
│  Data gaps from synthesis ──► TODO.md or data acquisition           │
│  Coverage gaps ──► validation reference cards                       │
│  /lattice:daily-update ──► Slack                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────┐
│  DISTILL (orthogonal — enter at any time, reads full corpus)        │
│                                                                     │
│  /lattice:distill <question>                                        │
│       │  grounded answer from accumulated research                  │
│       ▼                                                             │
│  standalone answer (inline or saved to distillations/)              │
│                                                                     │
│  /lattice:distill --thesis <claim>                                  │
│       │  evidence chain from corpus                                 │
│       ▼                                                             │
│  thesis doc ──► /lattice:peer-review (validate argument)            │
│             ──► expand to publication draft                         │
│             ──► /lattice:research (fill evidence gaps)              │
│                                                                     │
│  /lattice:distill --adapt <target-domain>                           │
│       │  transfer map: what applies, what doesn't, what's missing   │
│       ▼                                                             │
│  adaptation plan ──► /lattice:research (investigate gaps)           │
│                  ──► /lattice:synthesize (spec the adaptation)      │
│                                                                     │
│  /lattice:distill --audit                                           │
│       │  diff: decided research vs current documentation            │
│       ▼                                                             │
│  coherence report ──► regen-science (auto-generated docs)           │
│                   ──► manual edits (authored docs)                  │
│                   ──► TODO.md (deferred fixes)                      │
│                                                                     │
│  Outputs: docs/_internal/research/distillations/                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Entry Points

The research cycle auto-detects where to start based on existing files, or use `--from`:

| Entry | When | Existing files |
|-------|------|----------------|
| `--from research` | New topic | Nothing |
| `--from review` | Doc written, needs challenge | `research/{topic}.md` |
| `--from incorporate` | Review done, needs integration | `+ peer-reviews/{topic}-review.md` |
| `--from r2` | Feedback incorporated | `+ "Peer Review Notes" in doc` |
| `--from synthesize` | Research validated | `+ peer-reviews/{topic}-review-r2.md` |
| `--from architect` | Synthesis written, needs arch gate | `+ incoming/{topic}-synthesis.md` |
| `--from plan-review` | Architect passed | `+ peer-reviews/{topic}-architect-review.md` |

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

User decides which findings to accept. Rejected findings are noted with counter-evidence.

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

`/lattice:review` produces 6 mandatory output sections:

1. **CHANGES** — what changed
2. **DECISION AUDIT** — merit evaluation (rules 13-14) + deferral litmus test
3. **REQUIREMENT TRACE** — four-dimension check (WHAT/WHEN/UNLESS/HOW)
4. **MECHANICAL CHECKS** — build, lint, tests
5. **DOCS UPDATE** — MANIFEST, specs, TODO
6. **VERDICT** — pass/fail with evidence

Missing section = incomplete review.

## Session Management

- `/lattice:pause-work` — persist state if session ends mid-pipeline
- `/lattice:resume-work` — restore and continue
- All artifacts persist to disk — terminal crashes lose nothing
- Cross-session resume: the cycle reads `.lattice/cycle-state/{topic}.yaml` and decisions log to resume from last completed step

## Enforcement Layer

The framework uses three enforcement mechanisms. Prose instructions describe what should happen. Enforcement ensures it does.

### 1. Validation Ratchet (`scripts/validation-ratchet.sh`)

The validation oracle — measures analytical correctness against ground truth studies. Not binary keep/discard: degradation routes to research.

```
baseline  — capture current validation scores
compare   — compare current vs baseline
auto      — baseline (if needed) + regenerate all studies + compare

Exit codes: 0 = same/improved, 2 = degradation detected
```

**Degradation handling:** Degradation doesn't mean rollback. It means analytical behavior changed. The ratchet identifies WHICH signals/assertions changed. The agent must then determine:
- **Expected** (documented in the current spec as intentional) → update ground truth, proceed
- **Unexpected** → route to `/lattice:research` on the specific regression

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

File-based checks that the orchestrator runs on skill outputs before proceeding:

| Gate | What it checks | Blocks proceed on failure |
|------|---------------|--------------------------|
| **Peer review quality** | ≥3 findings, ≥3 review dimensions covered, evidence per finding | Yes — re-launches peer review |
| **Synthesis sections** | 6 mandatory sections present with content | Yes — re-runs synthesize |
| **Architect verdict** | REJECT/SCIENCE-FLAG require user decision | Yes — STOP at decision point |
| **Probe results** | BREAKS/SCIENCE-FLAG require user decision | Yes — STOP at decision point |
| **Engine change marker** | `.lattice/engine-changed` exists → validation ratchet required | Yes — blocks commit |

### 4. Claude Code Hooks (`hooks/claude-hooks.json`)

Mechanical enforcement — the agent cannot skip these:

| Hook | Trigger | Action |
|------|---------|--------|
| **Test-first** | `git commit` with pipeline modules staged | Blocks if no test files staged |
| **Validation gate** | `git commit` when `.lattice/engine-changed` exists | Blocks if validation ratchet wasn't run |
| **Co-author block** | Write/Edit containing "Co-Authored-By" | Blocks the edit |
| **Engine change marker** | Write/Edit to engine files | Sets `.lattice/engine-changed`, clears comparison marker |
| **Complexity advisory** | Write/Edit any file | Non-blocking complexity warnings |

### 5. Autonomous Execution Model

The research cycle runs autonomously by default. It stops only at critical decision points:

| Always autonomous | Stops for human |
|---|---|
| CONDITIONAL peer review findings (auto-accept) | FLAWED findings persisting across both rounds |
| SOUND evaluations (proceed) | Architect REJECT or SCIENCE-FLAG |
| Architect PASS (proceed) | Probe BREAKS or SCIENCE-FLAG |
| Architect SIMPLIFY (auto-apply, re-gate) | Landscape branch selection |
| Probe SAFE/PROPAGATES (proceed) | Validation degradation (expected vs unexpected) |
| Distill audit (informational) | |

Every auto-decision is logged. The user can audit after the fact and re-enter at any step if a decision was wrong.

## Skills Reference

| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| `/lattice:prioritize` | Strategic advisor — what to do next | (reads all state) | Priority recommendations |
| `/lattice:distill` | Corpus-level reasoning | Question/claim + mode flag | `distillations/{topic}-*.md` |
| `/lattice:research-cycle` | Orchestrated research + review loop | Topic + optional `--from` | Validated research + synthesis |
| `/lattice:research` | First-principles gap analysis | Topic | `research/{topic}.md` |
| `/lattice:peer-review` | Blind scientific challenge | Any document, optional `--novel` | `peer-reviews/{topic}-review.md` |
| `/lattice:synthesize` | Ground research in codebase | Research doc path | `incoming/{topic}-synthesis.md` |
| `/lattice:probe` | Cross-impact analysis | Change/decision/file, or `--integrity`/`--safety` | Impact report with blast radius |
| `/lattice:architect` | Architecture quality gate | File/dir/spec path | Audit report or gate verdict |
| `/lattice:design` | UI/UX design step (between synthesize and implement) | Spec/feature description | Layout spec + element list |
| `/lattice:implement` | Autonomous spec implementation, phase by phase | Spec file path | Reviewed code + audit table |
| `/lattice:spike` | Exploratory implementation (no spec) | Feature | Code |
| `/lattice:spec-from-code` | Reverse-engineer spec from spike | Implementation | `incoming/{feature}.md` |
| `/lattice:review` | Quality gate + commit | Changed files | Commit (if passes) |
| `/lattice:ux-designer` | Design audit | View or component | Audit report |
| `/lattice:daily-update` | Slack update from commits | (reads git log) | Formatted message |
| `/lattice:pause-work` | Session handoff | Current state | `.continue-here.md` |
| `/lattice:resume-work` | Restore session | `.continue-here.md` | Restored context |
