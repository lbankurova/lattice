# Datagrok Development Framework

LLM-assisted development framework for building Datagrok platform plugins. Provides process rules, design system enforcement, scientific knowledge scaffolding, and quality gates.

## Three Layers

| Layer | What | Applies to |
|-------|------|------------|
| **Platform** | Datagrok design system, UX patterns, visual conventions | All Datagrok plugins |
| **Scientific** | Knowledge scaffolding, field contracts, methods registry | Data analysis / scientific plugins |
| **Process** | Dev workflow, commit gates, doc lifecycle, backlog | All projects using this framework |

## What's Included

### Always-On Rules (CLAUDE.md)
11 hard process rules that apply to every task:
- Design system approval gates (1-4)
- Commit discipline (5)
- Reuse-before-reinvent (6)
- Doc lifecycle (7)
- Circuit breaker (8)
- No directory sprawl (9)
- **Bug fix protocol** (10) — read before patching, escalate after two failures
- **Pre-write protocol** (11) — read, search, plan, then write

### Skills (commands/)
| Skill | When | What |
|-------|------|------|
| `/review` | End of implementation | Merged quality gate: spec-vs-code trace (if spec exists) + build/lint/docs/MANIFEST + commit |
| `/spike` | Starting exploratory work | Lightweight implementation with pre-write discipline, doc ceremony suspended |
| `/spec-from-code` | After successful spike | Reverse-generate spec so /review can run full protocol |
| `/ux-designer` | Design audit needed | Datagrok design system compliance audit |
| `/pause-work` | End of session | Context handoff file for next session |
| `/resume-work` | Start of session | Restore context from handoff |

### Scaffold (scaffold/)
Templates for new projects:
- `docs/_internal/TODO.md` — tactical backlog
- `docs/_internal/ROADMAP.md` — strategic roadmap
- `docs/_internal/MANIFEST.md` — doc staleness tracker
- `docs/_internal/checklists/` — commit checklist, post-impl review protocol
- `docs/_internal/knowledge/` — methods registry, field contracts, conventions
- `docs/_internal/reference/` — UI casing, interactivity rule
- `docs/_internal/scaffold/` — spec template

### Agent (agents/)
- `post-impl-reviewer.md` — independent review agent launched by `/review` for spec-vs-code evidence trace

## Usage

### Hooks (hooks/)
- `pre-commit` — git hook: blocks commit if frontend tests or build fail
- `claude-hooks.json` — Claude Code hooks: pipeline test guard (blocks pipeline module commits without tests) + co-author block (enforces rule 5). Copy to `.claude/settings.json` and replace `PIPELINE_MODULES_PATTERN` with your project's data pipeline file regex.

### New project setup
1. Copy `CLAUDE.md` to your project root — adapt paths, add project-specific design decisions
2. Copy `commands/` to `.claude/commands/`
3. Copy `agents/` to `.claude/agents/`
4. Copy `scaffold/docs/` to your project's `docs/`
5. Copy `hooks/pre-commit` to `.git/hooks/pre-commit`
6. Merge `hooks/claude-hooks.json` into `.claude/settings.json` — adapt the pipeline module pattern
7. Replace SENDEX-specific examples in design system docs with your app's domain examples

### Existing project
Cherry-pick what you need. The rules in CLAUDE.md are the foundation — everything else builds on them.

## Design System Docs

Included in `scaffold/docs/_internal/design-system/` — these are **Datagrok platform-level**, not app-specific:
- `datagrok-visual-design-guide.md` — color, typography, spacing, components
- `datagrok-app-design-patterns.md` — interaction patterns, information architecture
- `datagrok-llm-development-guide.md` — LLM dev methodology
- `audit-checklist.md` — testable rules for design audits
- `design-decisions-log.md` — decision tracking with rationale

Some examples within these docs reference SENDEX (SEND domains, organ systems, dose groups). When starting a new project, replace those domain-specific examples with your app's equivalents — the patterns themselves are universal across Datagrok plugins.

Also included: `scaffold/docs/_internal/reference/datagrok-patterns.ts` — canonical reference for 27 Datagrok UI API patterns.
