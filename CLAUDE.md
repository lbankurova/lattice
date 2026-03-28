# Datagrok Development Framework

## Overview

Framework for building Datagrok platform plugins with LLM-assisted development. Provides process rules, design system enforcement, scientific knowledge scaffolding, and quality gates.

Three layers — use what applies:
- **Layer 1 (Platform):** Datagrok design system, UX patterns, visual conventions — applies to ALL Datagrok plugins
- **Layer 2 (Scientific):** Knowledge scaffolding, field contracts, methods registry, review packets — applies to data analysis / scientific plugins
- **Layer 3 (Process):** Dev workflow, commit gates, doc lifecycle, backlog management — applies to all projects using this framework

## Development Commands

<!-- Adapt these paths per project -->
### Backend (FastAPI + Python)
```bash
# Start dev server (set OPENBLAS_NUM_THREADS=1 to avoid pandas import hang on Windows)
# PowerShell: $env:OPENBLAS_NUM_THREADS=1
cd <project>/backend && <project>/backend/venv/Scripts/uvicorn.exe main:app --reload --port 8000

# Install dependencies
<project>/backend/venv/Scripts/pip.exe install -r <project>/backend/requirements.txt
```

### Frontend (React + Vite)
```bash
cd <project>/frontend && npm run dev      # Dev server
cd <project>/frontend && npm run build    # TypeScript check + production build
cd <project>/frontend && npm run lint     # ESLint
cd <project>/frontend && npm test         # Vitest
```

### Windows Shell Notes
- Always use forward slashes in bash commands
- Run Python/pip via full venv path
- When starting backend in PowerShell, set `$env:OPENBLAS_NUM_THREADS = 1` first
- **Never `pip install` while the dev server is running.** `--reload` corrupts venv DLLs mid-install. Stop server first, install, restart.

## Hard Process Rules

1. **Design system changes require explicit user approval.** No agent may modify design system documents, design tokens, CSS custom properties, CLAUDE.md design decisions, or the audit checklist without the user's prior explicit approval. Propose changes, then wait. Agents may READ freely but NEVER write autonomously.

2. **Audit checklist is mandatory.** Every design audit must run the full checklist at `docs/_internal/design-system/audit-checklist.md`. Every rule evaluated and recorded as PASS, FAIL, or N/A.

3. **CLAUDE.md hard rules must be checked directly.** Verify each hard rule in the Design Decisions section below. View specs or design guides may have been incorrectly modified — this file is the source of truth.

4. **View spec changes that affect UI/UX require explicit user approval.** Propose changes to `docs/_internal/views/*.md`, then wait. **Exceptions:** (a) Changes directly required for a user-requested feature. (b) Designing from scratch. (c) User grants blanket approval.

5. **Never add Claude as a co-author.** No `Co-Authored-By` in commit messages.

6. **Reuse before reinventing.** Before writing new logic: (a) search codebase for existing hooks/functions/generated JSON; (b) check `docs/_internal/knowledge/methods-index.md` and `field-contracts-index.md`; (c) check `docs/_internal/knowledge/species-profiles.md` and `docs/_internal/knowledge/vehicle-profiles.md` (if applicable). Duplicating existing data is a defect.

7. **Doc lifecycle: specs are disposable, system docs are durable.** After implementing from a spec: archive it (`docs/_internal/incoming/archive/`), extract durable knowledge into `docs/_internal/knowledge/` or `docs/_internal/architecture/`, and log open gaps in `docs/_internal/TODO.md`. Architecture specs (`docs/_internal/architecture/`) must be updated when their subsystem ships changes — create if missing.

8. **Circuit breaker on repeated failures.** Same root cause fails 5 times → stop, report, ask the user.

9. **No directory sprawl.** Agents must not create new top-level directories under `docs/` or anywhere in the repo root. New internal documentation goes into an existing `docs/_internal/` subfolder (`architecture/`, `knowledge/`, `research/`, `decisions/`, `views/`, `reference/`, `design-system/`, `incoming/`). If none fits, propose the location to the user first.

10. **Bug fix protocol — read before patching, escalate after two failures.** Before changing code to fix a bug: (a) read the FULL module/component involved — not just the error line; (b) for CSS/layout bugs, map the complete parent→child layout chain and state what the current values ARE before changing what they SHOULD BE; (c) state root cause hypothesis before editing any code. If first fix doesn't work: re-read code, form a genuinely NEW hypothesis — do not patch the patch. If second fix doesn't work: STOP, tell the user both hypotheses and what disproved them, ask for direction. Two failed patches means your mental model of the code is wrong — a third attempt from the same model will also fail.

11. **Pre-write protocol for new code.** Before writing new functionality (features, not bug fixes): (a) read CLAUDE.md design decisions; (b) read ALL files you're about to modify, not just the entry point; (c) search for existing hooks/utils/patterns that overlap with what you're building (rule 6); (d) state your approach in 3–5 bullets — what you'll build, what you'll reuse, what constraints apply — before writing code. Skipping this step is the #1 cause of inconsistent implementation quality.

12. **New spec → ROADMAP intake.** When a spec enters `docs/_internal/incoming/` (user-provided or generated via `/spec-from-code`): (a) read `docs/_internal/ROADMAP.md`; (b) classify the spec — bug fix (→ TODO.md only), feature/improvement (→ ROADMAP entry under existing area), or epic (→ new ROADMAP section or entry with stages); (c) if feature or epic, create/update the ROADMAP entry with source reference, what, why, and depends-on; (d) if the spec fits an existing ROADMAP item, link it (`Spec: incoming/name.md`). A spec without a ROADMAP entry is orphaned work — it will be implemented but never tracked strategically.

## Commit & Review

- **Before committing:** Run every item in `docs/_internal/checklists/COMMIT-CHECKLIST.md`.
- **After implementing from a spec:** `/review` automatically detects spec context and runs the post-implementation evidence trace before mechanical checks.

## Architecture Gotchas

<!-- Project-specific — add entries as you discover agent failure patterns -->
<!-- Example: -->
<!-- **`analysis_views.py` routing:** Must use `APIRouter(prefix="/api")` with full paths in decorators (not path params in the router prefix — FastAPI/Starlette doesn't route those correctly). -->

## Design Decisions

<!-- Layer 1: Datagrok Platform — applies to ALL Datagrok plugins -->

- **No breadcrumb navigation in context panel panes.** Use `< >` icon buttons for back/forward.
- **Domain labels — neutral text only.** Never color-coded. Render as: `text-[10px] font-semibold text-muted-foreground`.
- **No colored badges for categorical identity.** Color encodes signal strength only. Categorical identity (dose group, domain, sex, severity, fix/review/workflow state) uses neutral gray (`bg-gray-100 text-gray-600 border-gray-200`).
- **Canonical tab bar pattern.** Active: `h-0.5 bg-primary` underline, `text-foreground`. Inactive: `text-muted-foreground`. Padding: `px-4 py-1.5`. Text: `text-xs font-medium`. Container: `bg-muted/30`.
- **Evidence panel background.** All evidence panels use `bg-muted/5`.
- **Rail header font-weight.** `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.
- **Grid evidence color strategy — interaction-driven.** P-value and effect size columns: neutral at rest, colored on hover/selection. Never always-on color in grids.
- **Context panel pane ordering.** Priority: insights → stats/details → related items → annotation → navigation.
- **Evidence tab naming.** Use "Evidence" (not "Overview") for cross-view consistency.
- **Color discipline.** Position > Grouping > Typography > Color. ≤10% saturated pixels at rest. One saturated color family per column. Only conclusions "shout."
- **Information hierarchy.** Six categories (Decision, Finding, Qualifier, Caveat, Evidence, Context) — never mix in one visual unit. Emphasis tiers: 1 (colored at rest) = conclusions, 2 (visible, muted) = labels, 3 (on interaction) = evidence.
- **Heatmap matrices use neutral grayscale heat.** 5-step gray ramp, always-on.
- **The system computes what it can.** Show computed results, not raw data for users to derive.
- **Table column layout — content-hugging with absorber.** All columns except one absorber use `width: 1px; white-space: nowrap`.
- **Expandable row content aligns under the label text, not the chevron.** Indent past chevron + gap.
- **Pre-edit hierarchy analysis for typography/spacing.** Before changing font size, margin, or padding: (1) map current hierarchy (control > supporting > micro); (2) verify change preserves tier relationships; (3) check spacing is proportional.
- **Spatial anchoring in paired displays.** When two charts/tables share an axis, both must show identical categories in identical order — even if one panel has no data. Show empty bars/"NE" for missing data, never omit the row. Tab/mode switches must not cause axes to jump or collapse. Extends to scrollable lists: optional per-row indicators must use fixed-width wrapper slots so they align as scannable columns.
- **Rail auto-select on load.** Rail-based views must auto-select the first item so the center panel is never empty when data exists. Auto-select fires once per mount, URL params take priority.
- **Chart legends are interactive filters.** Every legend shown on a chart must toggle the corresponding series/category on click. Toggled-off items show visually muted state.
- **No decision red repetition per row.** Decision-level color at most once per table row.
- **Inline override fields use `bg-violet-100/50` and right-click activation.** Tint overridable cells. When overridden, add corner triangle via CSS `::before`. Right-click opens override dropdown. Use `cursor-context-menu`.

<!-- App-specific design decisions go below this line -->
<!-- Tag with <!-- app-specific --> for clarity -->

## UI Casing Conventions

See `docs/_internal/reference/ui-casing-conventions.md` for the full casing guide with examples.

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Interactivity Rule

See `docs/_internal/reference/interactivity-rule.md` for the full interactivity requirements.
