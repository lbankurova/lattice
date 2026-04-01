# Lattice Workflow

The canonical workflow for research-driven development of scientific apps.

## Quick Start

```
/lattice:prioritize                        — what should I work on?
/lattice:research-cycle {topic}            — full research + review + architect gate loop
/lattice:research-cycle {topic} --from synthesize  — synthesis + architect gate + plan review loop
/lattice:architect audit {path}            — ad-hoc architecture audit
/lattice:architect gate {spec}             — pre-implementation architecture gate
/lattice:spike or spec-driven              — build it
/lattice:review                            — quality gate (includes architect review) + commit
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
│  Step 7: /lattice:synthesize             ◄── build plan + gaps      │
│       │  mandatory: reuse inventory, simplicity rationale,          │
│       │  test strategy                                              │
│       ▼                                                             │
│  Step 7.5: /lattice:architect gate       ◄── separate agent         │
│       │  PASS / SIMPLIFY / REJECT / SCIENCE-FLAG                    │
│       │  WAIT on SIMPLIFY/REJECT/SCIENCE-FLAG                       │
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
│  /lattice:spike {feature}    or    spec-driven from plan            │
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
- Cross-session resume: the cycle re-presents peer review findings for accept/reject when entering at `--from incorporate`

## Skills Reference

| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| `/lattice:prioritize` | Strategic advisor — what to do next | (reads all state) | Priority recommendations |
| `/lattice:research-cycle` | Orchestrated research + review loop | Topic + optional `--from` | Validated research + synthesis |
| `/lattice:research` | First-principles gap analysis | Topic | `research/{topic}.md` |
| `/lattice:peer-review` | Blind scientific challenge | Any document, optional `--novel` | `peer-reviews/{topic}-review.md` |
| `/lattice:synthesize` | Ground research in codebase | Research doc path | `incoming/{topic}-synthesis.md` |
| `/lattice:architect` | Architecture quality gate | File/dir/spec path | Audit report or gate verdict |
| `/lattice:spike` | Exploratory implementation | Feature | Code |
| `/lattice:spec-from-code` | Reverse-engineer spec from spike | Implementation | `incoming/{feature}.md` |
| `/lattice:review` | Quality gate + commit | Changed files | Commit (if passes) |
| `/lattice:ux-designer` | Design audit | View or component | Audit report |
| `/lattice:daily-update` | Slack update from commits | (reads git log) | Formatted message |
| `/lattice:pause-work` | Session handoff | Current state | `.continue-here.md` |
| `/lattice:resume-work` | Restore session | `.continue-here.md` | Restored context |
