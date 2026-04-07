# Lattice

LLM-assisted development framework for exploratory development of scientific apps on the Datagrok platform.

## Product Thesis

1. **Every insight that can be auto-generated MUST be auto-generated.** Users review conclusions, not raw data.
2. **The primary audience is always scientists.** Design for daily analytical workflows first.
3. **Analytical use > regulatory use.** Go/No-Go decisions happen daily; submissions happen once per milestone.

## Three Layers

| Layer | What | Applies to |
|-------|------|------------|
| **Platform** | Datagrok design system, UX patterns, visual conventions | All Datagrok plugins |
| **Scientific** | Knowledge scaffolding, field contracts, methods registry | Data analysis / scientific plugins |
| **Process** | Dev workflow, commit gates, doc lifecycle, backlog | All projects using this framework |

## Workflow

Research-driven development pipeline split into three phase-scoped cycles:

```
/lattice:prioritize              -- what to work on next? (value/merit ranking)
       |
/lattice:cycle {topic}           -- auto-detect phase, run next sub-cycle
       |
       v
/lattice:research-cycle {topic}  -- RESEARCH: produce + peer review + validate
       |  research -> R1 -> incorporate -> R2 -> evaluate -> distill -> probe
       v
/lattice:blueprint-cycle {topic}  -- BLUEPRINT: synthesize + architect gate + plan review
       |  synthesize -> architect -> probe -> plan R1 -> incorporate -> plan R2
       v
/lattice:build-cycle {topic}     -- BUILD: design + implement + review + commit
       |  implement (with /design per UI phase) -> review -> commit
       v
done

/lattice:distill                 -- corpus-level reasoning (orthogonal, any time)
       |
       |-- --thesis <claim>      -- evidence chain -> peer-review -> publication
       |-- --adapt <target>      -- domain transfer map -> research gaps
       |-- --audit               -- doc coherence check -> regen-science
       +-- <question>            -- grounded answer from accumulated research
```

Each sub-cycle auto-detects its entry point within the phase from state — no `--from` flags needed. Phase transitions are explicit boundaries.

See [WORKFLOW.md](WORKFLOW.md) for the full pipeline with peer review protocol, escalation rules, and gap routing.

## Skills (commands/lattice/)

### Strategic
| Skill | Purpose |
|-------|---------|
| `/lattice:prioritize` | Read all project state, recommend next actions ranked by scientist value |
| `/lattice:daily-update` | Generate Slack-formatted update from recent commits |

### Knowledge
| Skill | Purpose |
|-------|---------|
| `/lattice:distill` | Corpus-level reasoning — thesis construction, domain adaptation, doc coherence audit, grounded Q&A |

### Cycles (orchestrators)
| Skill | Purpose |
|-------|---------|
| `/lattice:cycle` | **Meta-orchestrator** — auto-detects phase from state, dispatches to right sub-cycle |
| `/lattice:research-cycle` | **Research phase** — produce + peer review (2 rounds) + distill + probe |
| `/lattice:blueprint-cycle` | **Blueprint phase** — synthesize + architect gate + probe + plan review (2 rounds) |
| `/lattice:build-cycle` | **Build phase** — design + implement + review + commit |

### Research & Validation
| Skill | Purpose |
|-------|---------|
| `/lattice:research` | First-principles gap analysis — landscape (Tier 1) + deep dive (Tier 2) |
| `/lattice:peer-review` | Blind scientific challenge (separate agent) — standard + `--novel` mode |
| `/lattice:synthesize` | Ground research in codebase — Build Plan + Reuse Inventory + Simplicity Rationale + Test Strategy + Gaps |
| `/lattice:probe` | Cross-impact analysis — trace implications through system manifest (targeted, `--integrity`, `--safety`) |

### Build & Quality
| Skill | Purpose |
|-------|---------|
| `/lattice:architect` | Architecture quality gate — audit code, gate specs, enforce science preservation |
| `/lattice:design` | UI/UX design step — placement, technology, layout decisions between synthesize and implement |
| `/lattice:implement` | Autonomous spec implementation — phase-by-phase conductor with design gates and final audit |
| `/lattice:spike` | Exploratory implementation with pre-write discipline (no spec ceremony) |
| `/lattice:spec-from-code` | Reverse-engineer spec from successful spike |
| `/lattice:review` | Quality gate — architect review + decision audit + deferral litmus test + four-dimension trace |
| `/lattice:ux-designer` | Datagrok design system compliance audit |

### Session
| Skill | Purpose |
|-------|---------|
| `/lattice:pause-work` | Context handoff for next session |
| `/lattice:resume-work` | Restore context from handoff |

## Enforcement Layer

The framework enforces quality through constraints, not just instructions:

| Mechanism | What it does | How it enforces |
|-----------|-------------|-----------------|
| **Validation ratchet** (`scripts/validation-ratchet.sh`) | Compares analytical scores before/after changes | Pre-commit hook blocks if engine changed without ratchet |
| **Decision log** (`.lattice/decisions.log`) | Persistent experiment memory across sessions | Agents read at session start — prevents re-trying failures |
| **Structural quality gates** | Checks peer review depth, synthesis sections, probe results | Orchestrator re-launches skill if output fails gate |
| **Independent decision audit** (`agents/decision-auditor.md`) | Evaluates merit rationale and catches unprompted deferrals | Separate agent — prevents self-assessment of rules 13-14 |
| **Claude Code hooks** (`hooks/claude-hooks.json`) | Test-first, engine-change tracking, co-author block | Mechanical — agent cannot skip |
| **Autonomous execution** | Research cycle runs without human until critical decisions | Stops only on: genuine disagreements, SCIENCE-FLAG, REJECT, validation degradation |

See [WORKFLOW.md](WORKFLOW.md) for full enforcement layer documentation.

## Hard Rules (CLAUDE.md)

15 process rules that apply to every task:

| # | Rule | Why |
|---|------|-----|
| 1-4 | Design system approval gates | Prevent agent drift on visual design |
| 5 | No Claude co-author in commits | Clean git history |
| 6 | Reuse before reinventing | Search existing code before writing new |
| 7 | Doc lifecycle (specs are disposable, system docs are durable) | Knowledge extraction after implementation |
| 8 | Circuit breaker (5 failures = stop) | Prevent runaway agent loops |
| 9 | No directory sprawl | Keep repo structure clean |
| 10 | Bug fix protocol (read before patching, escalate after 2 failures) | Prevent blind patching |
| 11 | Pre-write protocol (read, search, plan, then write) | Prevent inconsistent implementations |
| 12 | New spec → ROADMAP intake | No orphaned specs |
| 13 | **Merit-driven architectural decisions** | Choose scientifically correct approach, not easiest |
| 14 | **No unprompted deferrals** | Never defer without real dependency or explicit user decision |
| 15 | **Science preservation gate** | Cleanup that changes analytical behavior requires scientist review |

## Research Quality Controls

Built into `/lattice:research`:

- **Tier system** — landscape first (broad coverage scan), deep dive only on user-selected branches. Prevents boiling the ocean.
- **Phase 2b: Uniformity assumptions check** — "What varies across instances that this analysis assumes is constant?" Catches hidden heterogeneity (different control designs, vehicle effects, species biology).
- **Phase 3b: Audience bias check** — "Who are ALL the users?" Scientists doing daily analysis > milestone deliverables > non-scientist consumers.

Built into `/lattice:peer-review`:

- **2-round protocol** — Round 1 challenges, author incorporates. Round 2 checks revisions. No Round 3 (escalate to user).
- **`--novel` mode** — forces different sources than Round 1. Prioritizes last 2-3 years, preprints, conference proceedings, small repos. Low-citation is a feature.
- **Tier-aware** — auto-detects landscape vs deep dive vs implementation plan and adapts review structure.

Built into `/lattice:distill`:

- **Evidence tiering** — every claim is tagged: decided (strongest), peer-reviewed (strong), unreviewed (provisional), or cross-document inference (flagged explicitly). Prevents mixing certainty levels.
- **Contradiction detection** — when corpus documents disagree, both positions are presented with evidence. No silent resolution.
- **Freshness check** — before citing a research stream's conclusions, checks REGISTRY for current status. Dormant/superseded conclusions are flagged.

## Scaffold (scaffold/)

Templates for new projects:
- `docs/_internal/TODO.md` — tactical backlog
- `docs/_internal/ROADMAP.md` — strategic roadmap
- `docs/_internal/MANIFEST.md` — doc staleness tracker
- `docs/_internal/checklists/` — commit checklist, post-impl review
- `docs/_internal/knowledge/` — methods registry, field contracts, conventions
- `docs/_internal/research/INDEX.md` — research file inventory with status tracking
- `docs/_internal/reference/` — UI casing, interactivity rule
- `docs/_internal/design-system/` — Datagrok platform design system (5 docs)

## Setup

### New project
1. Copy `CLAUDE.md` to project root — adapt paths, add project-specific design decisions
2. Copy `commands/lattice/` to `.claude/commands/lattice/`
3. Copy `scaffold/docs/` to your project's `docs/`
4. Copy `scaffold/.lattice/` to `.lattice/` — state directory for enforcement layer
5. Copy `scripts/validation-ratchet.sh` to `scripts/` — adapt for your validation suite
6. Copy `hooks/pre-commit` to `.git/hooks/pre-commit`
7. Merge `hooks/claude-hooks.json` into `.claude/settings.json` — replace `PIPELINE_MODULES_PATTERN` and `ENGINE_FILES_PATTERN` with your project's regexes
8. Create `.claude/rules/domain-knowledge-map.md` — topic-to-file lookup for your domain

### Existing project
Cherry-pick what you need. CLAUDE.md rules are the foundation — everything else builds on them.
