# Lattice Workflow

The canonical workflow for research-driven development of scientific apps.

## Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  RESEARCH PHASE                                             │
│                                                             │
│  /lattice:research {topic}                                  │
│       │                                                     │
│       ▼                                                     │
│  /lattice:peer-review {research doc}     ◄── Round 1        │
│       │                                                     │
│       ▼                                                     │
│  /lattice:research {topic}               ◄── incorporate    │
│       │                                                     │
│       ▼                                                     │
│  /lattice:peer-review {updated research} ◄── Round 2        │
│       │                                                     │
│       ├── SOUND/CONDITIONAL ──► proceed to synthesis        │
│       └── FLAWED ──► escalate to user                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  SYNTHESIS PHASE                                            │
│                                                             │
│  /lattice:synthesize {research doc}                         │
│       │                                                     │
│       ▼  produces:                                          │
│       ├── Build plan (implementation spec)                  │
│       ├── Research gaps (next research cycle)               │
│       └── Data/coverage gaps (backlog)                      │
│       │                                                     │
│       ▼                                                     │
│  /lattice:peer-review {build plan}       ◄── Round 1        │
│       │                                                     │
│       ▼                                                     │
│  /lattice:synthesize {research doc}      ◄── incorporate    │
│       │                                                     │
│       ▼                                                     │
│  /lattice:peer-review {updated plan}     ◄── Round 2        │
│       │                                                     │
│       ├── SOUND/CONDITIONAL ──► proceed to build            │
│       └── FLAWED ──► escalate to user                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  BUILD PHASE                                                │
│                                                             │
│  /lattice:spike {feature}    or    spec-driven from plan    │
│       │                                                     │
│       ▼                                                     │
│  /lattice:review                                            │
│       │                                                     │
│       ▼                                                     │
│  commit                                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  FEEDBACK LOOP                                              │
│                                                             │
│  Research gaps from synthesis ──► next /lattice:research     │
│  Data gaps from synthesis ──► TODO.md or data acquisition   │
│  Coverage gaps ──► validation reference cards                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Peer Review Protocol

**Maximum 2 rounds per artifact.** Each round is a full `/lattice:peer-review` pass.

### Round 1
Peer reviewer challenges the artifact (research doc or build plan). Produces verdicts: SOUND, CONDITIONAL, FLAWED, INSUFFICIENT per element.

Author incorporates feedback:
- SOUND items: no action
- CONDITIONAL items: address the conditions, strengthen the evidence
- FLAWED items: fix the material error or provide counter-evidence
- INSUFFICIENT items: add the missing information

### Round 2
Peer reviewer checks the revisions. Three outcomes:

| Outcome | Action |
|---------|--------|
| All material items SOUND or CONDITIONAL | Proceed to next phase |
| New FLAWED ratings on previously-SOUND items | Likely bikeshedding — escalate to user |
| Same item FLAWED in both rounds (disagreement) | Genuine scientific question — escalate to user with both positions |

**No Round 3.** If two rounds can't resolve it, the issue requires human judgment. Present both positions with evidence and let the user decide.

### Escalation Format

When escalating, present:

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

## Synthesis Output Sections

`/lattice:synthesize` produces three sections:

### 1. Build Plan
Features ready to implement, with:
- Acceptance criteria
- Architecture decisions with merit rationale (rule 13)
- Dependencies (real ones only — rule 14)

Routes to: `docs/_internal/incoming/` spec → ROADMAP intake (rule 12)

### 2. Research Gaps
Topics needing more investigation before building. Each gap includes:
- What question needs answering
- Why it blocks (or doesn't block) implementation
- Suggested search sources from the original research's source map

Routes to: next `/lattice:research` cycle

### 3. Data & Coverage Gaps
Missing data, species, study types, methods needing validation. Each gap includes:
- What's missing (e.g., "no HCD data for NHP clinical chemistry")
- Impact if not addressed (e.g., "engine will over-classify NHP findings")
- Whether it blocks implementation or is a known limitation

Routes to: `docs/_internal/TODO.md` or dedicated tracking

## Session Management

- `/lattice:pause-work` — persist state if session ends mid-pipeline
- `/lattice:resume-work` — restore and continue

All artifacts (research docs, peer reviews, synthesis specs) are written to disk. Terminal crashes lose nothing.

## Skills Reference

| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| `/lattice:research` | First-principles gap analysis | Topic | `docs/_internal/research/{topic}.md` |
| `/lattice:peer-review` | Blind scientific challenge | Any document | `docs/_internal/research/peer-reviews/{topic}-review.md` |
| `/lattice:synthesize` | Ground research in codebase | Research doc path | `docs/_internal/incoming/{topic}-synthesis.md` |
| `/lattice:spike` | Exploratory implementation | Feature | Code + `/lattice:spec-from-code` |
| `/lattice:spec-from-code` | Reverse-engineer spec from spike | Implementation | `docs/_internal/incoming/{feature}.md` |
| `/lattice:review` | Quality gate + commit | Changed files | Commit (if passes) |
| `/lattice:ux-designer` | Design audit | View or component | Inline + design system updates |
| `/lattice:pause-work` | Session handoff | Current state | `.continue-here.md` |
| `/lattice:resume-work` | Restore session | `.continue-here.md` | Restored context |
