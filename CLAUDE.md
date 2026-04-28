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

## Rules

1. **Design system changes require explicit user approval.** No agent may modify design system documents, design tokens, CSS custom properties, design decision tables, or the audit checklist without the user's prior explicit approval. Propose changes, then wait.

2. **Audit checklist is mandatory.** Every design audit must run the full checklist at `docs/_internal/design-system/audit-checklist.md`.

3. **View spec changes that affect UI/UX require explicit user approval.** Propose changes to `docs/_internal/views/*.md`, then wait. Exceptions: changes required for a user-requested feature, designing from scratch, blanket approval.

4. **Never add Claude as a co-author.** No `Co-Authored-By` in commit messages.

5. **Reuse before reinventing.** Before writing new logic: (a) search codebase for existing hooks/functions/generated JSON; (b) check `docs/_internal/knowledge/methods-index.md` and `field-contracts-index.md`; (c) check knowledge files for the relevant domain. Duplicating existing data is a defect.

6. **Doc lifecycle: specs are disposable, system docs are durable.** After implementing from a spec: archive it (`docs/_internal/incoming/archive/`), extract durable knowledge into `docs/_internal/knowledge/` or `docs/_internal/architecture/`, and log open gaps in `docs/_internal/TODO.md`. Architecture specs must be updated when their subsystem ships changes -- create if missing.

7. **Circuit breaker on repeated failures.** Same root cause fails 5 times -> stop, report, ask the user.

8. **No directory sprawl.** Agents must not create new top-level directories under `docs/` or anywhere in the repo root. New internal documentation goes into an existing `docs/_internal/` subfolder. If none fits, propose the location to the user first.

9. **Bug fix protocol -- read before patching, stress after fixing, escalate after two failures.** Before changing code to fix a bug: (a) read the FULL module/component involved -- not just the error line; (b) for CSS/layout bugs, map the complete parent->child layout chain and state what the current values ARE before changing what they SHOULD BE; (c) state root cause hypothesis before editing any code. After fixing: (d) run `/ops:bug-stress`. If first fix doesn't work: re-read code, form a genuinely NEW hypothesis. If second fix doesn't work: STOP, tell the user both hypotheses and what disproved them, ask for direction.

10. **Pre-write protocol for new code.** Before writing new functionality (features, not bug fixes): (a) read design decision tables in `.claude/rules/design-decisions.md`; (b) read ALL files you're about to modify, not just the entry point; (c) search for existing hooks/utils/patterns that overlap with what you're building (rule 5); (d) state your approach in 3-5 bullets before writing code.

11. **New spec -> ROADMAP intake.** When a spec enters `docs/_internal/incoming/`: read `docs/_internal/ROADMAP.md`, classify the spec (bug fix -> TODO.md, feature -> ROADMAP entry, epic -> new ROADMAP section), link to existing items. A spec without a ROADMAP entry is orphaned work.

12. **Merit-driven architectural decisions.** Evaluate every architectural decision on scientific correctness and product value. Effort/complexity is not a valid factor in choosing between approaches. If approach A is more scientifically sound or delivers more analytical value than approach B, choose A regardless of implementation cost.

13. **No unprompted deferrals.** Never defer a feature, capability, or design element to a "later phase" or "future work" unless (a) there is a real technical dependency that blocks it now, or (b) the user has explicitly decided to defer it. "It would be simpler to do later" is not a valid reason.

14. **Science preservation gate.** Code cleanup, refactoring, or "simplification" that changes scientific or analytical behavior is not a cleanup -- it's a functional change. Before simplifying domain logic: (a) identify what analytical output would change; (b) if any output changes, flag it as SCIENCE-FLAG -- do not proceed without scientist review; (c) distinguish accidental complexity (bad code -- simplify) from essential complexity (domain rules encoded in code -- protect). Bare lint exemptions are defects -- always add a comment explaining why the complexity is load-bearing.

15. **Impact analysis before touching shared code.** Before modifying shared library files (`lib/`, `services/analysis/`, or any export consumed by 3+ files), run `/ops:impact` on the target first. Know what breaks before you edit.

16. **Verify empirical claims against actual data.** When a spec, plan, or criterion makes a numeric claim about data ("count drops to 2", "shows N rows"), verify against the actual generated output at spec-write, implementation, and review gates. Mirror-pattern tests do NOT satisfy this -- use fixture tests against real generated output. Don't infer from code -- read the output.

17. **Spec value audit before build.** Any spec entering `docs/_internal/incoming/` that proposes more than one feature / UI surface / override / pane must pass `docs/_internal/checklists/SPEC-VALUE-AUDIT.md` before architect review signs off. The audit catches categorical "we infer N things, each needs a UI" reasoning — the spec author must document per-feature frequency, current workaround, and downstream impact rather than categorical justification. Reviewers produce PASS / SCOPE REDUCTION REQUIRED / EVIDENCE GAP; non-PASS verdicts block architect review and route the spec back for rework with a scope-challenge doc. Failure mode: spec ships featuritis that nobody catches until collision review during an unrelated spike.

18. **Algorithm defensibility on real data.** When the diff modifies, OR consumes the output of, an analytical algorithm — NOAEL/LOAEL/scoring/classification/syndrome detection/severity assignment/onset determination — the review must (a) run the algorithm against PointCross + at least one other representative study using `backend/generated/{study}/unified_findings.json`, (b) record the actual output (NOAEL value+tier, score+classification, etc.), and (c) answer in writing: *"Would a regulatory toxicologist agree this output represents the data?"* with a one-paragraph interpretation citing the actual pairwise/group values that drove the result. Spec-vs-code consistency, build/lint/test pass, and DATA-vs-spec match do NOT satisfy this rule — the question is whether the answer reflects the *data*, not whether it matches the spec. **A SCIENCE-FLAG raised by any review agent can only be cleared by (i) fix, (ii) data-grounded counter-evidence in this format, or (iii) explicit user defer with named dependency.** Plumbing-only rebuttals (e.g., "the toggle still flows through", "the cache invalidates") do NOT clear the flag — they answer the wrong question. Failure mode: shipping a UI that locks in an indefensible algorithm output more consistently across more sites. Exemplar: BUG-031 (noael-pane-display-consistency, 2026-04-26) — spec author treated the algorithm's indefensible output ("NOAEL: below tested range" on PointCross BW, driven by 3 NS sign-flipping single-timepoint hits) as the desired outcome; spec-vs-code trace passed; only an algorithm-output check would have caught it.

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

## Propagating Framework Changes to Consumer Projects

Lattice is the source of truth. Consumer projects (e.g., `pcc/`) carry independent **copies** of skills, agents, and scripts under `<project>/.claude/commands/lattice/`, `<project>/.claude/agents/`, and `<project>/scripts/` — these are mirrors, not symlinks. Editing only `C:/pg/lattice/commands/lattice/<skill>.md` does **not** reach the consumer's runtime; the project's own copy is what Claude Code loads when the slash command fires.

**Workflow whenever you edit any of these in lattice:**
- `agents/*.md`
- `commands/lattice/*.md`
- `commands/ops/*.md`
- `scripts/*.sh`, `scripts/*.py`

```bash
bash C:/pg/lattice/scripts/sync-skills.sh <project-root>
# e.g.
bash C:/pg/lattice/scripts/sync-skills.sh C:/pg/pcc
```

Run for every consumer project. The script `cp`s files (not `rsync --delete`), so project-extra files survive.

**Direction is one-way: lattice → project.** Edits made directly in `<project>/.claude/commands/lattice/` will be clobbered by the next sync. If you find yourself editing the project copy, stop — port the change back to `C:/pg/lattice/` first, then run the sync. The skill content is framework-tier; project-specific overrides belong in project-level rule files (`.claude/rules/`) or `CLAUDE.md`, not in skill copies.

**Failure mode (caught 2026-04-27 during the peer-review subagent fix):** edited `lattice/commands/lattice/research-cycle.md` to retire an inlined-skill pattern; the next pcc cycle would have used pcc's stale copy and the optimization would not have taken effect. Make sync-skills.sh a reflex after any framework edit.

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

### Commit trailers (mandatory for topic work)

Every commit that advances a topic MUST carry a `Topic:` trailer. This is how the executor knows what state the world is in. A commit without a `Topic:` trailer is invisible to the autopilot and coherence engine.

```
feat: continuous HCD percentile in D4 confidence dimension

Topic: hcd-informed-z-scoring
Phase: complete
Coverage: HCD/LB, interpretation engine
Layer: implementation
```

| Trailer | Required? | Purpose |
|---|---|---|
| `Topic:` | **Yes** for all topic work | Links commit to cycle state. Reconciliation greps this. |
| `Phase:` | Recommended | Explicit phase completion (`complete`, `build`, `blueprint-complete`). If absent, inferred from commit type (`feat:` after blueprint = complete). |
| `Coverage:` | Optional | Coverage axis tag for `/lattice:daily-update`. |
| `Layer:` | Optional | data, research, plumbing, implementation, bug-fix. |

**When to add `Topic:`:**
- Every `feat:` or `fix:` commit that implements part of a topic
- Every commit that completes a cycle phase (research, blueprint, build)
- NOT needed for: docs-only commits, CI changes, framework changes

**`Phase:` values:** `research-complete`, `blueprint-complete`, `complete`. Use the phase that this commit COMPLETES, not the phase it starts. If the commit is mid-phase (one of several), omit `Phase:` — the final commit in the phase carries it.

The executor's `lattice status` and `lattice coherence` commands run git-based reconciliation automatically — they grep for `Topic:` trailers and correct stale cycle state files. No manual state file maintenance needed.

## Architecture Gotchas

<!-- Project-specific — add entries as you discover agent failure patterns -->
<!-- Example: -->
<!-- **`analysis_views.py` routing:** Must use `APIRouter(prefix="/api")` with full paths in decorators (not path params in the router prefix — FastAPI/Starlette doesn't route those correctly). -->

## Design Decisions

Design decision tables (color, typography, spacing, components, casing, layout) live in `.claude/rules/design-decisions.md` (loaded automatically every session). That file is the source of truth -- view specs or design guides may have been incorrectly modified.

## TypeScript Conventions

- **`verbatimModuleSyntax: true`** — always use `import type { Foo }` for type-only imports
- Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled
- Path alias: `@/*` maps to `src/*`

## Where Rules Live

Rules not in this file are enforced by hooks, rules files, or skill prompts:

| What | Where | Enforcement |
|------|-------|-------------|
| Design decisions (22 items) | `.claude/rules/design-decisions.md` | Loaded every session |
| Frontend UI gate | `.claude/rules/frontend-ui-gate.md` | Loaded every session |
| UI casing conventions | `docs/_internal/reference/ui-casing-conventions.md` | Reference |
| Interactivity requirements | `docs/_internal/reference/interactivity-rule.md` | Reference |
| Commit checklist | `docs/_internal/checklists/COMMIT-CHECKLIST.md` | Review gate hook blocks commits |
| Post-implementation review | `docs/_internal/checklists/POST-IMPLEMENTATION-REVIEW.md` | Review gate hook blocks commits |
| Spec value audit (rule 17) | `docs/_internal/checklists/SPEC-VALUE-AUDIT.md` | `/lattice:architect` gate Step 1.5 / `/lattice:peer-review` synthesis tier |
| Topic trailers | PreToolUse hook | Hook warns on missing Topic: |
| Empirical claim detail + example | `/lattice:implement`, `/lattice:review` | Skill prompt |
