# Lattice — Datagrok Development Framework

## Product Thesis

Datagrok is a data analytics platform. The goal is for users to fully **grok** their data and act on it. This thesis governs everything we build:

1. **Every insight that can be auto-generated MUST be auto-generated.** The system computes what it can. Users review conclusions, not raw data. If a human is manually deriving something the engine could compute, that's a missing feature.
2. **The primary audience is always scientists.** Toxicologists, pharmacologists, biostatisticians — the people who understand the data and need to act on it. Regulatory writers, program managers, and other consumers are secondary. Design for the scientist's daily analytical workflow first; export/reporting/compliance features serve the scientist's output needs, not the other way around.
3. **Analytical use > regulatory use.** Scientists make Go/No-Go decisions at every program meeting. Regulatory submissions happen once per milestone. Build for the high-frequency analytical use case; regulatory deliverables are a view on the same data, not a separate system.
4. **At small N, the value is honest uncertainty — not statistical power.** Non-rodent studies (dog, NHP, rabbit) typically have N=3-5 per group. At these sample sizes, LOO becomes bimodal, kappa estimates are unstable, R-squared is meaningless, and HCD comparisons have 25-35% false-alarm rates. These are not bugs to fix — they are the physics of small samples. The system's value at small N is communicating what CAN'T be concluded reliably, which no other tool does. Never design a feature that hides or papers over small-N limitations. Surface them honestly: show confidence qualifiers, flag fragile estimates, distinguish "no signal" from "insufficient power to detect." A scientist who knows their NOAEL is fragile makes better decisions than one who doesn't.

This thesis informs research (`/lattice:research`), synthesis (`/lattice:synthesize`), and all architectural decisions. When evaluating a feature proposal, ask: "Does this help a scientist grok their data faster?" If not, it's either a supporting feature or out of scope.

## Overview

Lattice is a framework for exploratory development of scientific apps on the Datagrok platform with LLM-assisted development. Provides process rules, design system enforcement, scientific knowledge scaffolding, and quality gates.

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

10. **Bug fix protocol — read before patching, stress after fixing, escalate after two failures.** Before changing code to fix a bug: (a) read the FULL module/component involved — not just the error line; (b) for CSS/layout bugs, map the complete parent→child layout chain and state what the current values ARE before changing what they SHOULD BE; (c) state root cause hypothesis before editing any code. After fixing: (d) run `/ops:bug-stress` — classify the bug pattern, search for the same pattern in downstream subsystems, verify test coverage, grow the oracle. A bug fix without a pattern search is a point repair that leaves identical bugs elsewhere. If first fix doesn't work: re-read code, form a genuinely NEW hypothesis — do not patch the patch. If second fix doesn't work: STOP, tell the user both hypotheses and what disproved them, ask for direction. Two failed patches means your mental model of the code is wrong — a third attempt from the same model will also fail.

11. **Pre-write protocol for new code.** Before writing new functionality (features, not bug fixes): (a) read CLAUDE.md design decisions; (b) read ALL files you're about to modify, not just the entry point; (c) search for existing hooks/utils/patterns that overlap with what you're building (rule 6); (d) state your approach in 3–5 bullets — what you'll build, what you'll reuse, what constraints apply — before writing code. Skipping this step is the #1 cause of inconsistent implementation quality.

12. **New spec → ROADMAP intake.** When a spec enters `docs/_internal/incoming/` (user-provided or generated via `/spec-from-code`): (a) read `docs/_internal/ROADMAP.md`; (b) classify the spec — bug fix (→ TODO.md only), feature/improvement (→ ROADMAP entry under existing area), or epic (→ new ROADMAP section or entry with stages); (c) if feature or epic, create/update the ROADMAP entry with source reference, what, why, and depends-on; (d) if the spec fits an existing ROADMAP item, link it (`Spec: incoming/name.md`). A spec without a ROADMAP entry is orphaned work — it will be implemented but never tracked strategically.

13. **Merit-driven architectural decisions.** When speccing or planning an implementation, evaluate every architectural decision on scientific correctness and product value. Effort/complexity is not a valid factor in choosing between approaches. If approach A is more scientifically sound, produces better data fidelity, or delivers more analytical value than approach B, choose A regardless of implementation cost. State the merit rationale for each non-obvious decision in the plan.

14. **No unprompted deferrals.** Never defer a feature, capability, or design element to a "later phase" or "future work" unless (a) there is a real technical dependency that blocks it now, or (b) the user has explicitly decided to defer it. "It would be simpler to do later" or "this can be added in a follow-up" are not valid reasons. If an agent believes deferral is warranted, it must state the specific blocking dependency — not effort — and get user approval before deferring.

15. **Science preservation gate.** Code cleanup, refactoring, or "simplification" that changes scientific or analytical behavior is not a cleanup — it's a functional change. Before simplifying domain logic: (a) identify what analytical output would change for any input data; (b) if any output changes, flag it as SCIENCE-FLAG — do not proceed without scientist review; (c) distinguish accidental complexity (bad code — simplify) from essential complexity (domain rules encoded in code — protect). Lint exemptions on domain-critical code (`# noqa: C901`, `// eslint-disable complexity`) must carry a comment explaining why the complexity is load-bearing. Bare exemptions are defects. The `code-quality-guardrails.md` file lists domain-critical modules — consult it before refactoring.

## Agent Disciplines

16. **Check after editing, before moving on.** After completing a batch of related edits, run `/ops:check` (build + imports + engine-change detection) before starting the next task. Don't wait for `/lattice:review`.

17. **Impact analysis before touching shared code.** Before modifying shared library files (`lib/`, `services/analysis/`, or any export consumed by 3+ files), run `/ops:impact` on the target first. Know what breaks before you edit.

18. **Verify empirical claims against actual data — mandatory at three gates.** When a spec, plan, or acceptance criterion makes an empirical claim about data behavior (counts, ranges, cardinalities, "X drops to Y", "≤ N rows", "shows the fragile subjects", "matches the chart"), that claim MUST be verified against the generated data at three gates: (a) when the spec is written — synthesis must show data evidence for any numeric assertion; (b) during `/lattice:implement` Phase D (Phase acceptance) — each empirical criterion is run against the actual generated output and the observed value recorded in the audit before the criterion is marked PASS; (c) during `/lattice:review` Step 3 — the review independently re-runs the check as a fixture-style test and flags divergence. Tools: `/ops:explore-data`, a Python one-liner against the generated JSON, or a fixture-based unit test loaded from real generated output. **Mirror-pattern tests do NOT satisfy this rule** — they test code-vs-spec, not code-vs-reality. A mirror test will pass even when the spec's empirical claim is wrong about the actual data. Fixture tests that load real generated output ARE the satisfactory form. When answering "does the engine produce X?" or "what value does Y have?", run `/ops:explore-data` against the generated output. Don't infer from code — read the output.

19. **Frontend UI gate (mandatory for all frontend work).** Read the project's `frontend-ui-gate.md` rule file before writing any UI code. Core principle: find the existing working pattern and copy it — never design from scratch when a reference exists. Every new chart, table, panel, or interaction must match an existing approved instance. Strip pass is mandatory after building.

## Workflow DAGs

Development cycles are defined as YAML DAGs in `workflows/`. The DAG defines orchestration structure (what runs when, dependencies, gates, routing); markdown skills (`commands/lattice/*.md`) define what each node does.

| File | Cycle | Nodes |
|---|---|---|
| `workflows/cycle.yaml` | Meta-orchestrator — classify, detect phase, dispatch | 16 |
| `workflows/research-cycle.yaml` | Research — produce, challenge, validate | 17 |
| `workflows/blueprint-cycle.yaml` | Blueprint — synthesize, gate, probe, review plan | 20 |
| `workflows/build-cycle.yaml` | Build — implement, review, commit | 6 |
| `workflows/spike-cycle.yaml` | Spike — explore, generate spec, full review | 8 |
| `workflows/bug-fix-cycle.yaml` | Bug fix — classify, investigate (read-only), fix, stress, review, self-fix | 19 |

**Schema reference:** `workflows/schema.md` — node types, template expressions, execution rules.

**Node types:** `bash` (shell command), `skill` (AI agent with skill prompt), `gate` (conditional routing), `approval` (human decision point), `parallel` (concurrent group with trigger rules).

**Three paths:** The meta-orchestrator (`cycle.yaml`) classifies new topics and routes to: full cycle (research → blueprint → build) for complex/new-domain work, spike cycle (spike → spec-from-code → review) for known-territory work, or bug fix cycle (classify → investigate → fix → stress → review) for defects. All end with the same review quality gate. Classification is presented to the user for confirmation, not auto-decided.

**Multi-platform:** The YAML DAG is the API contract. Executors (CLI, phone, Slack, web, CI) read the same workflow; only approval UX differs per platform.

**Relationship to markdown skills:** YAML DAGs complement, not replace. The DAG references skills by name (`skill: lattice/research`). The executor reads the DAG, resolves the topological order, and dispatches each node using the skill's prompt. Markdown skills remain the authoritative source for agent instructions.

## Concurrent Sessions

When multiple agents work in parallel terminals on the same repo:

- **Code files** — agents work on different files, no conflict. Business as usual.
- **Shared state files** (REGISTRY.md, TODO.md, ROADMAP.md, MANIFEST.md, decisions.log) — ALL agents modify these during gap persistence and commit. Concurrent writes cause overwrites.

### Commit Lock

Before committing, agents acquire `.lattice/commit.lock` (atomic mkdir). While held, no other agent can commit. The merge-shared-state script refreshes shared files from git HEAD (picking up other agents' commits) and re-applies local additions.

```bash
# Acquire (polls every 30s if held, 5min stale threshold, 10min timeout)
bash scripts/acquire-lock.sh "my-topic" --poll

# Refresh shared files from HEAD, merge local additions
bash scripts/merge-shared-state.sh

# ... stage and commit ...

# Release
bash scripts/release-lock.sh
```

**Rules:**
- Lock is acquired at commit time only, not during normal execution. Agents write to shared files freely during their work.
- Always release the lock after commit — even if the commit fails.
- If you see `STALE LOCK` warnings, another agent crashed without releasing. The script auto-recovers after 5 minutes.
- `/lattice:review` Step 7 handles locking automatically. Other skills that commit should follow the same pattern.

### Topic WIP Lock

Prevents two agents from working on the same topic concurrently. Each sub-cycle (research, blueprint, build) acquires a per-topic lock at entry and releases it on completion. The cycle dispatcher also checks the lock before dispatching.

```bash
# Acquire (fails immediately if held by another agent, 30min stale threshold)
bash scripts/acquire-topic-lock.sh {topic} "research-cycle"

# Heartbeat — touch after every checkpoint update to prevent stale detection
touch .lattice/cycle-lock/{topic}/meta 2>/dev/null

# Release
bash scripts/release-topic-lock.sh {topic}
```

**Rules:**
- Lock is acquired at cycle entry, released at cycle completion.
- Same holder can re-acquire (re-entrant) — refreshes the timestamp.
- After every `current_step` state update, touch the lock metadata to keep the heartbeat fresh.
- Stale threshold is 30 minutes. If an agent crashes, the lock auto-recovers.
- If the lock is held (exit code 1), the agent must STOP and inform the user — never proceed.
- To manually release a stuck lock: `bash scripts/release-topic-lock.sh {topic}`

### Task Deduplication

The cycle dispatcher (`/lattice:cycle`) checks the decisions log for recent COMPLETED entries for the same topic+phase before dispatching. If a matching completion was logged within the last 2 hours, it refuses to start (unless `--force` is specified). This catches the "pasted the same command twice" scenario.

### Revision-Checked State Mutations

Every cycle-state YAML file has a `revision: N` field (integer, starts at 1). The protocol:
1. Read the state file, note the `revision` value
2. Do work for the step
3. Before writing, re-read the file and check `revision` still matches
4. If match: write with `revision: N+1`
5. If mismatch: STOP — another agent modified the file

This prevents lost updates when two agents hold valid context but one overwrites the other's checkpoint. Complementary to the topic lock (which prevents concurrent starts, while revision checks prevent concurrent writes).

### Cycle Health Audit

`/ops:sweep` Step 9 scans cycle-state files and lock dirs for anomalies:
- Stale active cycles (no checkpoint progress in >24h)
- Unlocked active cycles (phase is active but no lock held)
- Orphaned locks (lock exists but no state file, or state says complete)
- Missing revision fields (legacy files — auto-fixed)
- Timestamp inconsistencies

Orphaned and stale locks are auto-released during sweep.

## Web Source Access Protocol

Research skills (research, peer-review, distill) fetch external sources. Many academic and regulatory sites return 403/429/captcha errors for programmatic access. **Silently skipping blocked sources is a research gap — the source may contain the critical finding.**

### Step 1: Attempt WebFetch/WebSearch

Use the standard tools first. If the fetch succeeds, proceed normally.

### Step 2: On 403/429/blocked — log and retry via browser

If a URL returns 403, 429, captcha, or any access-denied response:

1. **Log the URL** to `.lattice/blocked-urls.log` (append, TSV):
   ```
   {timestamp}	{skill}	{url}	{http status or error}	{topic}	{why needed — 1 line}
   ```

2. **Retry via Playwright MCP browser** if available:
   ```
   browser_navigate → url
   browser_wait_for → networkidle or specific selector
   browser_snapshot → extract text content
   ```
   Many sites serve content to real browsers but block programmatic fetches. The Playwright browser has a real Chrome user-agent and executes JavaScript.

3. **If browser also fails** (site requires login, institutional access, or is genuinely down):
   - Log the failure in `blocked-urls.log` with status `BROWSER-FAILED`
   - Note in the research output: `SOURCE BLOCKED: {url} — {what we expected to find}. Needs manual access.`
   - Continue research with other sources — don't let one blocked URL stall the entire research

### Step 3: Periodic follow-up

`/ops:sweep` checks `blocked-urls.log` for URLs that were never successfully accessed. These represent potential research gaps.

### Rules

- **Never silently skip a 403.** Every blocked URL must appear in the log. A source that was important enough to search for is important enough to record when it can't be reached.
- **Browser retry is automatic, not optional.** If Playwright MCP is configured and the URL was blocked, retry via browser before moving on.
- **Don't retry the same URL more than twice** (once WebFetch, once browser). After two failures, log and continue.

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
