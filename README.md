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

Research-driven development pipeline with built-in scientific rigor:

```
/lattice:prioritize          — what should we work on next? (value/merit ranking)
       |
/lattice:research            — landscape scan, then deep dive on selected branches
       |
/lattice:peer-review         — blind scientific challenge (2-round protocol)
       |
/lattice:synthesize          — ground research in codebase, produce build plan + gaps
       |
/lattice:peer-review         — challenge the implementation plan
       |
/lattice:spike or spec-driven — build it
       |
/lattice:review              — quality gate with mandatory decision audit
       |
commit
```

See [WORKFLOW.md](WORKFLOW.md) for the full pipeline with peer review protocol, escalation rules, and gap routing.

## Skills (commands/lattice/)

### Strategic
| Skill | Purpose |
|-------|---------|
| `/lattice:prioritize` | Read all project state, recommend next actions ranked by scientist value |
| `/lattice:daily-update` | Generate Slack-formatted update from recent commits |

### Research & Validation
| Skill | Purpose |
|-------|---------|
| `/lattice:research` | First-principles gap analysis — landscape (Tier 1) + deep dive (Tier 2) |
| `/lattice:peer-review` | Blind scientific challenge — standard + `--novel` mode for underindexed sources |
| `/lattice:synthesize` | Ground research in codebase — produces Build Plan + Research Gaps + Data Gaps |

### Build
| Skill | Purpose |
|-------|---------|
| `/lattice:spike` | Exploratory implementation with pre-write discipline |
| `/lattice:spec-from-code` | Reverse-engineer spec from successful spike |
| `/lattice:review` | Quality gate — decision audit (rules 13-14) + four-dimension trace + mechanical checks |
| `/lattice:ux-designer` | Datagrok design system compliance audit |

### Session
| Skill | Purpose |
|-------|---------|
| `/lattice:pause-work` | Context handoff for next session |
| `/lattice:resume-work` | Restore context from handoff |

## Hard Rules (CLAUDE.md)

14 process rules that apply to every task:

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

## Research Quality Controls

Built into `/lattice:research`:

- **Tier system** — landscape first (broad coverage scan), deep dive only on user-selected branches. Prevents boiling the ocean.
- **Phase 2b: Uniformity assumptions check** — "What varies across instances that this analysis assumes is constant?" Catches hidden heterogeneity (different control designs, vehicle effects, species biology).
- **Phase 3b: Audience bias check** — "Who are ALL the users?" Scientists doing daily analysis > milestone deliverables > non-scientist consumers.

Built into `/lattice:peer-review`:

- **2-round protocol** — Round 1 challenges, author incorporates. Round 2 checks revisions. No Round 3 (escalate to user).
- **`--novel` mode** — forces different sources than Round 1. Prioritizes last 2-3 years, preprints, conference proceedings, small repos. Low-citation is a feature.
- **Tier-aware** — auto-detects landscape vs deep dive vs implementation plan and adapts review structure.

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
4. Copy `hooks/pre-commit` to `.git/hooks/pre-commit`
5. Merge `hooks/claude-hooks.json` into `.claude/settings.json`
6. Create `.claude/rules/domain-knowledge-map.md` — topic-to-file lookup for your domain

### Existing project
Cherry-pick what you need. CLAUDE.md rules are the foundation — everything else builds on them.
