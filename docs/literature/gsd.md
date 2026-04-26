---
title: "Get Shit Done (GSD)"
authors: TÂCHES (gsd-build)
year: 2025
url: https://github.com/gsd-build/get-shit-done
type: framework
read: pre-2026-04 (handoff); 2026-04-26 (full surface review); 2026-04-26 (audit-revised)
status: partial
---

# GSD

## Source thesis

A substantial Claude-Code dev framework: ~85 slash commands, ~33 specialised agents, 11 hooks, NPM-distributed. Self-described as "meta-prompting, context engineering and spec-driven development", with explicit positioning around "context rot — the quality degradation that happens as Claude fills its context window" (the framework's primary differentiator from BMAD/Speckit per its README). Workflow shape:

```
new-project → discuss-phase → plan-phase → execute-phase (parallel atomic plans)
            → verify-work (UAT) → ship → complete-milestone → new-milestone
```

State files per project: `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `CONTEXT.md`, plus per-phase `RESEARCH.md` / `PLAN.md` / `SUMMARY.md` / `VERIFICATION.md` / `UAT.md`. Side caches: `todos/`, `threads/`, `seeds/`, `.planning/`. Hooks include explicit context-rot monitoring (`gsd-context-monitor.js`).

GSD's positioning: a complete, opinionated, end-to-end methodology with one strict cadence — every topic traverses discuss → plan → execute → verify → ship in order, with parallel sub-agents executing atomic plans inside each phase wave.

## Translation

GSD and lattice solve adjacent problems with overlapping vocabularies. Both are spec-driven (see `WORKFLOW.md` "Design Stance"); the structural differences are about *flow shape* and *ceremony density*, not spec-driven vs. anti-spec-driven:

| Axis | GSD | Lattice |
|---|---|---|
| Entry routing | Single strict cadence (every topic → discuss → plan → execute) | Classified dispatch — `commands/lattice/cycle.md:12-20` routes to one of three paths (full / spike / bug-fix) |
| Concurrency | Plan-level parallelism (waves of atomic plans within a phase) | Workflow-DAG parallelism (`executor/src/dag.ts`); `commands/lattice/review.md:132-135` runs three reviewers in parallel |
| HITL trigger | Checkpoint-based UAT after every phase (`verify-work.md`, `audit-uat.md`) | Escalation-based — autopilot proceeds; surfaces decisions to `ESCALATION.md` and `review-gate.json` only at justified gates |
| Context-rot | Measured via `gsd-context-monitor.js` (token telemetry) | Implicit via fresh sub-agents (no token telemetry yet — open follow-up) |
| Distribution | NPM, multi-runtime | Repo-local, Claude Code only |
| Optimization stance | Novice-onboarding (one strict flow that always works) | Expert-routing (multiple entry points with classifier dispatch) |

Lattice borrowed the *one* mechanic where GSD's solution fit cleanly without dragging in the surrounding ceremony. Items below labeled with verifiable lattice paths.

## Borrowed

- **Pause/resume handoff procedure.** `.continue-here.md` written at pause, read at resume. Lives in `commands/lattice/pause-work.md` and `commands/lattice/resume-work.md`. Lineage explicitly documented at `commands/lattice/pause-work.md:6` ("This replaces GSD's pause-work with a standalone implementation").
- **Handoff schema** (branch / task summary / where stopped / what's done / what's next / decisions / blockers). Used verbatim in pause-work.md.

## Rejected

Each entry: what GSD does, why lattice doesn't take it. Rejections are merit-based given the user context (1 non-dev + Claude Code, autopilot-introspectable code as goal); rejections are NOT "we didn't have it" disguised as "we don't want it".

- **Single strict cadence (`discuss-phase` → `plan-phase` → `execute-phase` → `verify-work` regardless of topic shape).** Lattice's `commands/lattice/cycle.md:12-20` classifies each topic before routing: complex / new-domain work goes through the full path (research-cycle → blueprint-cycle → build-cycle, which IS spec-driven); known-territory work goes through spike (build-first then `spec-from-code`); defects go through the bug-fix loop. We borrowed the spec-first primitive (it's the default); we did not borrow the *single-cadence* mandate. The classification overhead is justified for a research-heavy project where the right entry point varies per topic.

- **Plan-level wave decomposition (`execute-phase.md` partitions tasks into parallel waves).** Lattice's parallelism lives at the workflow-DAG level (`executor/src/dag.ts`) and the agent level (`commands/lattice/review.md:132-135` runs three parallel reviewers). Same primitive (parallel sub-agents on a dependency graph), different decomposition unit. Lattice topics already decompose into workflow nodes; adding a second decomposition layer at the plan level would be redundant.

- **Checkpoint-UAT after every phase (`verify-work.md`, `audit-uat.md`).** Lattice has HITL — see `ESCALATION.md` and `.lattice/review-gate.json` (autopilot writes to both at justified gates per recent commits e.g. `39ffd2dc`, `88dff5f`). The trigger model differs: GSD runs UAT after every phase regardless of confidence; lattice's autopilot proceeds and escalates only when confidence is low or a decision is required. Same goal (catch what the agent missed); different trigger.

- **Pre-decision agent personas** (`gsd-framework-selector`, `gsd-assumptions-analyzer`, `gsd-advisor-researcher`). Lattice covers similar ground with three reviewer agents (`agents/architect-reviewer.md`, `agents/decision-auditor.md`, `agents/post-impl-reviewer.md`) plus `commands/lattice/peer-review.md`. Different distribution: GSD has more specialised personas; lattice consolidates under `/lattice:architect` and the review skill.

- **User-profiling agents** (`profile-user.md`, `set-profile.md`, `gsd-user-profiler`). Lattice has `MEMORY.md` which persists user/project facts across sessions. A dedicated profiling agent is over-engineered for one user.

- **Multi-variant HTML sketch flow** (`sketch.md` + `sketch-wrap-up.md`). Lattice `/lattice:design` produces guidance + screenshots, not interactive HTML mockups. Sendex's design-system audit checklist provides the discipline procedurally rather than via mockup variants.

- **XML prompt formatting as a house style.** Lattice prompts are markdown + YAML. Stylistic difference; not load-bearing either way.

- **NPM distribution / multi-runtime support.** Lattice is Claude-Code-only and repo-local by design — different distribution model, different target audience.

- **Per-task atomic commit policy by the executor.** Lattice batches changes per cycle phase. This is a stylistic difference rather than a load-bearing rejection — neither model is obviously better; lattice's choice is convention rather than principle.

## Convergent invention (independent design with similar shape)

Both frameworks have these patterns. Lattice did not derive any from GSD; some have other documented sources, others are independent:

- **Spike command.** Both have spike-style commands. Lattice's `commands/lattice/spike.md` was added in lattice's initial commit (`825e652`, 2026-03-28) **with no documented source**. The pattern (time-boxed exploration without spec ceremony) is widespread in software practice; we did not derive it from GSD or from any other specific framework that we can verify. *(Earlier framing claiming spike was borrowed from `obra/superpowers` was incorrect — verified against `gh api repos/obra/superpowers/git/trees/main` that superpowers has no spike skill. The lazy attribution has been retracted; see audit `_audit-2026-04-26.md`.)*

- **Phase research / synthesizer pattern.** Both have research → synthesize. Lattice arrived at this independently through `/lattice:research` → `/lattice:synthesize` → `/lattice:distill` (per `WORKFLOW.md` Pipeline section).

- **Codebase mapping.** GSD has `gsd-codebase-mapper` + `gsd-pattern-mapper`. Lattice has static `system-manifest.md` (25 subsystems) + `capabilities.yaml` + `methods-index.md`. Same goal (give the agent a map); different artifacts (static curated docs vs. dynamic agent-generated maps).

- **Hook-based write-time enforcement.** Both have it. Lattice's hook architecture came from `alexfazio/plankton` (see [`alexfazio-plankton.md`](alexfazio-plankton.md), with lattice adapting plankton's blocking semantics to warn-only for non-critical checks). GSD has `gsd-prompt-guard.js`, `gsd-workflow-guard.js`, `gsd-validate-commit.sh` — convergent invention with plankton, not the source for lattice.

## Evaluating

Items genuinely worth a follow-up read before deciding take/reject — flagged but not yet acted on:

- **`seeds/` (forward-looking ideas keyed to a future milestone).** Lattice's `TODO.md` + `incoming/` is flat; a milestone-keyed deferred-idea bucket might be a cleaner home for the "later phase" notes that rule 13 currently bans. Read `commands/gsd/plant-seed.md` if pursued.
- **`threads/` (persistent topical context across phases).** Possibly redundant with cycle-state YAML, possibly a sharper abstraction for cross-cycle topical state. Unclear without a closer read.
- **`gsd-context-monitor.js` + `docs/context-monitor.md`.** Explicit token / context-rot telemetry. Matches the deferred "token tracker / budget / alerting" item already in MEMORY.md (`project_executor_next_steps.md`). Worth a focused read when that work starts.
- **`gsd-nyquist-auditor`.** Name suggests sampling-adequacy auditing of evals — adjacent to lattice's validation oracle. Worth a follow-up to see whether it formalizes "are your tests dense enough to catch the signal".
- **`audit-milestone.md` + `audit-uat.md`.** Lattice has cycle-close + sweep but no milestone-level retrospective. May be worth lifting as a `/lattice:milestone-retrospective` skill.
- **`extract_learnings.md`.** GSD ships this as a command; lattice ships it as a doc-lifecycle convention (rule 7). If rule 7 enforcement is patchy, formalizing it as a skill could close the gap.
- **`docs/superpowers/` directory.** Unread; the name suggests reusable capability primitives. One-pass scan worthwhile.

## Cross-refs

- Implementations: `commands/lattice/pause-work.md`, `commands/lattice/resume-work.md`
- Lattice authoritative reference for routing model: `WORKFLOW.md` "Design Stance" section + `commands/lattice/cycle.md:12-20`
- Memory: `project_repo_restructure.md` (GSD removal from pcc), `project_executor_next_steps.md` (token-tracker deferral overlaps with `gsd-context-monitor`)
- Related but distinct: lattice's `decisions.log` (architectural decisions, not session state) and `MEMORY.md` (cross-session facts, not in-flight task state)
- Audit history: `_audit-2026-04-26.md` documents the factual corrections folded into this revision (spike attribution retracted, waterfall framing corrected, UAT/parallel-execution rejections re-grounded).
