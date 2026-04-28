# Lattice

LLM-assisted development framework for exploratory development of scientific apps on the Datagrok platform.

## Product Thesis

1. **Every insight that can be auto-generated MUST be auto-generated.** Users review conclusions, not raw data.
2. **The primary audience is always scientists.** Design for daily analytical workflows first.
3. **Analytical use > regulatory use.** Go/No-Go decisions happen daily; submissions happen once per milestone.
4. **At small N, the value is honest uncertainty.** Surface fragile estimates, not hide them.

## Three Layers

| Layer | What | Applies to |
|-------|------|------------|
| **Platform** | Datagrok design system, UX patterns, visual conventions | All Datagrok plugins |
| **Scientific** | Knowledge scaffolding, field contracts, methods registry | Data analysis / scientific plugins |
| **Process** | Dev workflow, commit gates, doc lifecycle, backlog | All projects using this framework |

## Architecture

```
lattice/
  CLAUDE.md                     # Framework rules (19) + operational docs
  WORKFLOW.md                   # Pipeline diagram, phase transitions, skill list
  WORKFLOW-INTERNALS.md         # Executor, autopilot, coherence, peer-review protocol
  ENFORCEMENT.md                # Review gate, ratchet, hooks, structural gates
  commands/lattice/             # 25 skills (AI agent prompts, .md)
  commands/ops/                 #  6 ops commands
  agents/                       #  4 independent reviewer agents
  workflows/                    #  7 YAML DAG definitions
  executor/src/                 # 14 TypeScript modules (DAG engine)
  scripts/                      # 15 shell + Python scripts (locking, sync, validation, audits, design-gate)
  scaffold/                     # Project templates (docs, hooks, rules, config)
  .claude/rules/                # Session-loaded rules (design decisions)
```

### Executor (`executor/src/`)

TypeScript DAG engine that runs workflow YAML files. Resolves topological layers, dispatches nodes in parallel, handles routing/approval, writes checkpoints.

| Module | Purpose |
|--------|---------|
| `engine.ts` | Core execution loop — layers, filtering, checkpoints, cost aggregation |
| `nodes.ts` | Node executors (bash, skill, gate, approval) + Claude CLI JSON parser |
| `cli.ts` | CLI entry point — 9 commands |
| `dag.ts` | Kahn's algorithm for topological sort |
| `loader.ts` | YAML workflow parser + validator |
| `template.ts` | `{{}}` expression resolver |
| `coherence.ts` | Portfolio-level conflict detection (4 conflict types) |
| `reconcile.ts` | Derive topic state truth from git `Topic:` trailers |
| `autopilot.ts` | Continuous portfolio advancement loop |
| `auto-resolve.ts` | Resolve coherence conflicts via targeted distill analysis |
| `budget.ts` | Cost tracking, budget limits, alerting |
| `e2e.ts` | Branch-comparison E2E testing gate |
| `types.ts` | Type definitions (workflow, nodes, cost, budget) |
| `index.ts` | Public API exports |

### Workflow DAGs (`workflows/`)

Development cycles defined as executable YAML DAGs. Node types: `bash`, `skill`, `gate`, `approval`, `parallel`.

| File | Cycle | Nodes |
|------|-------|-------|
| `cycle.yaml` | Meta-orchestrator — classify, detect phase, dispatch | 16 |
| `research-cycle.yaml` | Research — produce, peer review (2 rounds), distill, probe | 17 |
| `blueprint-cycle.yaml` | Blueprint — synthesize, architect gate, probe, plan review | 20 |
| `build-cycle.yaml` | Build — implement, E2E gate, review, commit | 6 |
| `spike-cycle.yaml` | Spike — explore, generate spec, review | 8 |
| `bug-fix-cycle.yaml` | Bug fix — classify, investigate, fix, stress, E2E gate, review | 19 |
| `autopilot.yaml` | Autopilot loop orchestration | — |

**Schema:** `workflows/schema.md` — node properties, template expressions, execution rules.

### Agents (`agents/`)

Independent reviewer agents launched by skills via the Agent tool's `subagent_type`. Separate context window prevents self-assessment; harness loads the agent definition once per launch instead of the orchestrator inlining the agent's instructions.

| Agent | Launched by | Purpose |
|-------|-------------|---------|
| `architect-reviewer.md` | `/lattice:architect`, `/lattice:review`, `/lattice:blueprint-cycle` | Architecture quality, overengineering, science preservation |
| `decision-auditor.md` | `/lattice:review` | Merit-driven rationale (rule 12), unprompted deferrals (rule 13) |
| `peer-review.md` | `/lattice:research-cycle`, `/lattice:blueprint-cycle`, `/lattice:architect` | Blind scientific challenge — domain expert, no project context. Includes F3 algorithmic-tightening requirements (mandatory `query-knowledge.py`, mandatory citation, blocking semantics on `CONDITIONAL`/`FLAWED`) when the input is algorithmic code or an algorithmic spec. |
| `post-impl-reviewer.md` | `/lattice:review` | Spec-vs-code evidence trace |

## Executor CLI

```
lattice run <workflow> --topic <topic> [--dry-run] [--mode <mode>]
lattice validate [workflow]           Validate workflow YAML
lattice list                          List available workflows
lattice inspect <workflow>            Show execution plan (layers, nodes, deps)
lattice status                        Portfolio overview + coherence summary + cost
lattice coherence [topic]             Full conflict analysis across all topics
lattice autopilot [--dry-run] [--loop] [--max N] [--filter PATTERN]
                                      Advance safe topics, batch human decisions
lattice e2e run [--base main]         Branch-comparison E2E testing gate
lattice e2e classify [--base main]    Testability classification
lattice cost [topic]                  Per-topic cost report
```

## Skills

### Strategic
| Skill | Purpose |
|-------|---------|
| `/lattice:prioritize` | Read all project state, recommend next actions ranked by scientist value |
| `/lattice:autopilot` | In-session equivalent of `lattice autopilot` CLI — reconcile, advance, batch |
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
| `/lattice:build-cycle` | **Build phase** — design + implement + E2E gate + review + commit |

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

### Ops
| Skill | Purpose |
|-------|---------|
| `/ops:check` | Lightweight "did I break anything?" — build + validation without full review |
| `/ops:impact` | Analyze what breaks if a function/file/module is modified |
| `/ops:bug` | Log a bug into BUG-SWEEP.md during manual QA |
| `/ops:bug-stress` | Post-fix: classify pattern, search downstream, grow oracle |
| `/ops:explore-data` | Answer questions about what the engine actually produces for a study |
| `/ops:sweep` | Garbage collection — validate TODO.md, ROADMAP.md, MANIFEST.md, decisions.log |

### Session
| Skill | Purpose |
|-------|---------|
| `/lattice:pause-work` | Context handoff for next session |
| `/lattice:resume-work` | Restore context from handoff |

## Enforcement Layer

The framework enforces quality through constraints, not just instructions:

| Mechanism | What it does | How it enforces |
|-----------|-------------|-----------------|
| **Review gate** | Every commit requires `/lattice:review` or `write-review-gate.sh` | PreToolUse hook + pre-commit hook both block; gate is single-use |
| **Unified attestations** (SIMPLIFY-1) | Peer-review, architect, spec-lint, bug-pattern verdicts all funnel through one `attestations[]` format in `review-gate.json` | `append-attestation.sh` writes; `write-review-gate.sh` validates kind, target, verdict, rationale (≥10 chars, no `n/a`/`tbd`/`idk`); pre-commit consumes |
| **Algorithmic peer-review** (F3) | Algorithmic specs and edits to algorithm-paths funnel through `peer-review` subagent with mandatory `query-knowledge.py` + citation | `CONDITIONAL`/`FLAWED` verdicts BLOCK the parent gate (architect Step 1.25, build review). Algorithm paths default list in `.lattice/algorithm-paths.txt`, project-overridable. |
| **Spec lint** (F5) | 4-criterion check on `incoming/` specs: empirical claims cite data, behavioral requirements have tests, multi-feature → SPEC-VALUE-AUDIT, algorithmic specs cite domain truth | `/lattice:architect` Step 1.4 runs `scripts/lint-spec.py --strict`; defects block until fixed or waived via attestation in `decisions.log` |
| **Bug-pattern registry** (F6) | Every `fix:` commit must register or update a `bug-patterns.md` entry naming the pattern, applies-to glob, and prevention class | `/ops:bug-stress` Step 7.5 emits the entry; pcc pre-commit Step 0d enforces a `kind=bug-pattern` attestation when staged paths match any registered glob |
| **Bug retro disposition** (F7) | The 5-question retrospective on every fix routes to a typed disposition (rule N tightened, hook added, registry update, etc.) — not free-form prose | `/ops:bug-stress` Step 8 records the disposition; pre-commit BLOCKS `fix:` commits where the BUG-SWEEP entry lacks the 5 retro fields |
| **Design-mode preamble gate** | Hook-enforced 4-block preamble (1.1 Workflow audits, 1.2 Existing surfaces, 1.3 First-principles, 1.4 Convention check) before any UI edit | `scripts/design-mode-gate.sh` (PreToolUse Write\|Edit) BLOCKS in-scope `.tsx`/`.html`/`.ts` edits when `.lattice/design-mode.lock` is `preamble=pending`; `design-session.sh preamble-done <evidence>` flips it to `complete`. Failure mode prevented: port-mode redesign. |
| **SCIENCE-FLAG memo path** | When a SCIENCE-FLAG fires, autopilot authors a decision memo with ≥3 literature citations and proceeds (per CLAUDE.md rule 14 + autopilot.md anti-pattern table); only escalates if it can't find citations | Wired into `workflows/research-cycle.yaml` and `workflows/blueprint-cycle.yaml` as a memo-required gate; memo path cited in commit message |
| **Algorithm defensibility check** (BUG-031 hardening, rule 18) | Review agents must run the algorithm on PointCross + one other study and record the data-grounded interpretation; SCIENCE-FLAG only clears via fix, data-grounded counter-evidence, or named-dependency defer | `/lattice:review` ALGORITHM CHECK section (487797e); plumbing-only rebuttals are explicitly insufficient |
| **Validation ratchet** | Compares analytical scores before/after changes | Pre-commit hook blocks if engine changed without ratchet |
| **Coherence engine** | Detects cross-topic conflicts (subsystem overlap, stale blueprints, cascades) | `lattice coherence`, `lattice status`, and engine pre-run check |
| **State reconciliation** | Derives topic state truth from git `Topic:` commit trailers | `lattice status` auto-corrects stale cycle-state files |
| **Token tracker / budget** | Per-node cost tracking, budget limits per workflow/topic/node, **per-call context-rot telemetry (LIT-09)** | Warns at threshold (default 80%); context-rot blocks workflow with reason `CONTEXT_ROT` in `decisions.log`; `lattice context [--last N]` reads `.lattice/context-telemetry.jsonl` |
| **Autopilot loop cap** (LIT-10) | `--max-loops N` (default 50) caps the outer `while (madeProgress)` loop; named force-stop on auto-resolve / phase-routing oscillation | `lattice autopilot --max-loops N` flag wired through |
| **E2E testing gate** | Branch-comparison behavioral verification (3 modes) | Build-cycle and bug-fix-cycle workflow nodes |
| **Decision log** | Persistent experiment memory across sessions | Prevents re-trying failed approaches |
| **Structural quality gates** | Checks peer review depth, synthesis sections, probe results | Orchestrator re-launches skill on gate failure |
| **Independent agents** | Peer review, architect review, decision audit, requirement trace | Separate context window via `subagent_type` — prevents self-assessment; the harness loads agent definitions, orchestrator does NOT inline skill content into prompts |
| **Claude Code hooks** | Review gate, commit lock, topic trailer, co-author block, build check, design-mode preamble, lattice→project sync, pcc-mirror edit block | Mechanical — agent cannot skip |
| **Outer-held commit lock** | Autopilot and `/lattice:review` acquire `.lattice/commit.lock` BEFORE `git add` to prevent staging-drift conflation when concurrent commits land in the same window | `LATTICE_LOCK_HOLDER` env tells pre-commit Step -1 to honor the outer hold rather than re-acquire (922cf24, 20f2eb4) |
| **Autopilot auto-resolve** | Targeted distill analysis for coherence conflicts | Resolves subsystem-overlap, stale-blueprint, SF-propagation |
| **Commit/topic locking** | Prevents concurrent commits and concurrent work on same topic | Atomic mkdir locks with stale recovery |
| **SIMPLIFY auto-apply** | Architect SIMPLIFY findings on `Risk: None` cuts auto-apply without user rubber-stamp; non-trivial risk still routes to user | Drops decision overhead on mechanical cleanups (ffbbb0f) |
| **Autonomous execution** | Cycles run without human until critical decisions | Stops on: SCIENCE-FLAG (without ≥3 citations), REJECT, BREAKS, persistent FLAWED with verifiable contradiction |

See [WORKFLOW.md](WORKFLOW.md) for the pipeline and skill list, [WORKFLOW-INTERNALS.md](WORKFLOW-INTERNALS.md) for protocol depth (peer-review rounds, autopilot stops, coherence conflict types), and [ENFORCEMENT.md](ENFORCEMENT.md) for the guardrail mechanisms.

## Hard Rules (CLAUDE.md)

19 process rules that apply to every task:

| # | Rule | Why |
|---|------|-----|
| 1-3 | Design system approval gates | Prevent agent drift on visual design |
| 4 | No Claude co-author in commits | Clean git history |
| 5 | Reuse before reinventing | Search existing code before writing new |
| 6 | Doc lifecycle (specs are disposable, system docs are durable) | Knowledge extraction after implementation |
| 7 | Circuit breaker (5 failures = stop) | Prevent runaway agent loops |
| 8 | No directory sprawl | Keep repo structure clean |
| 9 | Bug fix protocol (read before patching, stress after fixing, escalate after 2) | Prevent blind patching |
| 10 | Pre-write protocol (read, search, plan, then write) | Prevent inconsistent implementations |
| 11 | New spec -> ROADMAP intake | No orphaned specs |
| 12 | **Merit-driven architectural decisions** | Choose scientifically correct approach, not easiest |
| 13 | **No unprompted deferrals** | Never defer without real dependency or explicit user decision |
| 14 | **Science preservation gate** | Cleanup that changes analytical behavior requires scientist review |
| 15 | Impact analysis before touching shared code | Know what breaks before you edit |
| 16 | Verify empirical claims against actual data | Don't infer from code -- read the output |
| 17 | **Spec value audit before build** | Catch featuritis: per-feature frequency, workaround, and impact required before architect review signs off |
| 18 | **Algorithm defensibility on real data** | When the diff modifies (or consumes the output of) NOAEL / scoring / classification / syndrome detection / severity / onset code, review must run the algorithm on PointCross + one other study, record the actual output, and answer "would a regulatory toxicologist agree this represents the data?" with citation to the driving values. Spec-vs-code consistency is not enough. SCIENCE-FLAG raised by any review agent only clears via fix, data-grounded counter-evidence in this format, or explicit user defer with named dependency — plumbing-only rebuttals do NOT clear it. Exemplar: BUG-031 (2026-04-26). |
| 19 | **Atomic facts must live in the typed knowledge graph** | Numeric thresholds, species-specific baselines, route/vehicle constraints, regulatory cutoffs, mechanistic disable-markers MUST live in `docs/_internal/knowledge/knowledge-graph.md` as typed YAML facts (with `value`, `confidence`, `scope`, `derives_from`, `contradicts`). Un-typed registries cite the fact ID rather than restating the value. Why: only the typed graph audits contradictions mechanically; the same claim authored as prose in two un-typed files can silently disagree. Architect Step 1.4 (spec lint) and peer-review (synthesis tier) ask the placement question on algorithmic specs. |

## Research Quality Controls

Built into `/lattice:research`:

- **Tier system** — landscape first (broad coverage scan), deep dive only on user-selected branches. Prevents boiling the ocean.
- **Phase 2b: Uniformity assumptions check** — "What varies across instances that this analysis assumes is constant?" Catches hidden heterogeneity.
- **Phase 3b: Audience bias check** — "Who are ALL the users?" Scientists doing daily analysis > milestone deliverables > non-scientist consumers.

Built into `/lattice:peer-review`:

- **2-round protocol** — Round 1 challenges, author incorporates. Round 2 checks revisions. No Round 3 (escalate to user).
- **`--novel` mode** — forces different sources than Round 1. Recent, niche, underindexed work. Low-citation is a feature.
- **Tier-aware** — auto-detects landscape vs deep dive vs implementation plan and adapts review structure.

Built into `/lattice:distill`:

- **Evidence tiering** — every claim tagged: decided (strongest), peer-reviewed (strong), unreviewed (provisional), or cross-document inference (flagged).
- **Contradiction detection** — when corpus documents disagree, both positions presented with evidence. No silent resolution.
- **Freshness check** — checks REGISTRY for research stream status before citing conclusions.

## Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `install-hooks.sh` | Install git hooks from `hooks/` to `.git/hooks/` (copy + marker, cross-platform) |
| `sync-skills.sh` | Sync `commands/lattice/`, `commands/ops/`, `agents/`, and `scripts/` (`*.sh` + `*.py`) from lattice to a consumer project. **Runs automatically on lattice edits via the optional PostToolUse hook described below.** |
| `write-review-gate.sh` | Mechanical checks before writing review gate file |
| `validation-ratchet.sh` | Capture/compare analytical validation scores |
| `acquire-lock.sh` / `release-lock.sh` | Atomic commit lock (polls, stale recovery). Autopilot acquires before staging (outer-held lock pattern, 922cf24); pre-commit Step -1 also acquires (20f2eb4) when no outer holder is set. |
| `acquire-topic-lock.sh` / `release-topic-lock.sh` | Per-topic WIP lock — prevents concurrent work on the same topic, 30-min stale threshold |
| `append-attestation.sh` / `test-attestation-format.sh` | SIMPLIFY-1 unified `attestations[]` format for `review-gate.json` — peer-review verdicts, architect verdicts, spec-lint waivers all funnel through one format that `write-review-gate.sh` validates |
| `design-session.sh` / `design-mode-gate.sh` | Design-mode preamble gate. `design-session.sh begin <trigger>` writes `.lattice/design-mode.lock`; `preamble-done <evidence>` validates the four `/lattice:design` Step 1 blocks were authored; `design-mode-gate.sh` is a PreToolUse Write\|Edit hook that BLOCKS in-scope UI edits when the lock is `pending`. Mechanical enforcement of the prompt-level gate (port-mode redesign was the failure mode). |
| `discovery-scan.py` | Discovery-scan template — runs corpus-wide pattern checks |
| `merge-shared-state.sh` | Refresh shared files (TODO.md, ROADMAP.md, etc.) from HEAD during concurrent sessions |
| `context-meter.sh` | Measure conversation context usage |

## Scaffold (`scaffold/`)

Templates for new projects:

- `.claude/settings.json` — commit hooks (review gate, commit lock, topic trailer, co-author block)
- `.claude/rules/design-decisions.md` — project-specific design decisions (Layer 2)
- `.lattice/budget.yaml` — per-workflow and per-topic cost limits
- `.lattice/e2e.yaml` — E2E testing gate suite configuration
- `scripts/write-review-gate.sh` — mechanical checks before writing review gate
- `hooks/pre-commit` — pre-commit hook template (review gate + project-specific checks)
- `complexity-check.sh` + `eslint-complexity-rules.js` + `ruff.toml` — code complexity guardrails
- `docs/_internal/` — full directory structure with:
  - `TODO.md`, `ROADMAP.md`, `MANIFEST.md` — backlog and tracking
  - `checklists/` — commit checklist, post-impl review
  - `knowledge/` — methods registry, field contracts, conventions, code quality guardrails
  - `research/` — research file inventory
  - `reference/` — UI casing, interactivity rule, Datagrok patterns
  - `design-system/` — Datagrok platform design system (5 docs)
  - `scaffold/spec-template.md` — feature spec template

## Setup

### New project
1. Copy `CLAUDE.md` to project root -- adapt paths, add project-specific rules
2. Copy `commands/lattice/` and `commands/ops/` to `.claude/commands/`
3. Copy `agents/` to `.claude/agents/`
4. Copy `scaffold/docs/` to your project's `docs/`
5. Copy `scaffold/.claude/` to `.claude/` -- settings.json (hooks) + rules/design-decisions.md
6. Copy `scaffold/scripts/write-review-gate.sh` to `scripts/` -- adapt checks for your stack
7. Copy `scripts/validation-ratchet.sh` to `scripts/` -- adapt for your validation suite
8. Copy `scaffold/.lattice/budget.yaml` to `.lattice/budget.yaml` -- set cost limits per workflow and topic
9. Copy `scaffold/.lattice/e2e.yaml` to `.lattice/e2e.yaml` -- configure test suites
10. Install pre-commit hook: `bash scripts/install-hooks.sh` (copies from `hooks/` to `.git/hooks/`, re-run after pulling updates)
11. Run `bash scripts/sync-skills.sh` to sync skills to the project (re-run after lattice updates)
12. In `.claude/settings.json`: replace placeholder patterns (PIPELINE_MODULES, ENGINE_FILES) with your project's regexes
13. Create `.claude/rules/domain-knowledge-map.md` -- topic-to-file lookup for your domain

### Existing project
Cherry-pick what you need. CLAUDE.md rules are the foundation -- everything else builds on them.
