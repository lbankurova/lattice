---
title: "Get Shit Done (GSD)"
authors: TÂCHES (gsd-build)
year: 2025
url: https://github.com/gsd-build/get-shit-done
type: framework
read: pre-2026-04 (handoff); 2026-04-26 (full surface review)
status: partial
---

# GSD

## Source thesis

A substantial Claude-Code dev framework: ~85 slash commands, ~33 specialised agents, 11 hooks, NPM-distributed. Self-described as "meta-prompting, context engineering and spec-driven development". Workflow shape:

```
new-project → discuss-phase → plan-phase → execute-phase (parallel atomic plans)
            → verify-work (UAT) → ship → complete-milestone → new-milestone
```

State files per project: `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `CONTEXT.md`, plus per-phase `RESEARCH.md` / `PLAN.md` / `SUMMARY.md` / `VERIFICATION.md` / `UAT.md`. Side caches: `todos/`, `threads/`, `seeds/`, `.planning/`. Hooks include explicit context-rot monitoring (`gsd-context-monitor.js`).

GSD's positioning: a complete, opinionated, end-to-end methodology with a milestone/phase ceremony. It is the inverse of lattice's "build first, spec after" stance — GSD treats spec/plan/execute/verify as a strict cadence, with parallel sub-agents executing atomic plans inside each phase wave.

## Translation

GSD and lattice solved adjacent problems with overlapping vocabularies but opposing biases:

| Axis | GSD | Lattice |
|---|---|---|
| Spec timing | Spec-first (discuss → plan → execute) | Build-first (spike → spec-from-code) |
| Concurrency | Wave-based parallel atomic plans | Sequential cycle phases with gates |
| Verification | Scripted UAT loop with human-in-the-loop | Automated review + peer-review skill |
| Context-rot | Measured via `gsd-context-monitor` | Implicit via fresh sub-agents (no telemetry) |
| Distribution | NPM, multi-runtime | Repo-local, Claude Code only |
| Ceremony | Heavy (milestone close, audit-uat, audit-milestone) | Light (cycle close, sweep) |

Lattice borrowed the *one* mechanic where GSD's solution fit cleanly without dragging in the surrounding ceremony. The rest is documented as deliberate non-takes so the rejection rationale doesn't get re-litigated.

## Borrowed

- **Pause/resume handoff procedure.** `.continue-here.md` written at pause, read at resume. Lives in `/lattice:pause-work` and `/lattice:resume-work`. The pause-work skill explicitly documents the lineage: "replaces GSD's pause-work with a standalone implementation".
- **Handoff schema.** Branch / task summary / where stopped / what's done / what's next / decisions / blockers. Used verbatim.

## Rejected

Each entry: what GSD does, why lattice doesn't take it.

- **Spec-first waterfall (`discuss-phase` → `plan-phase` → `execute-phase` → `verify-work`).** Lattice rule 17 + spike-first inverts this. Spec-first is too slow for exploration and produces specs that don't survive contact with code. Lattice's `/lattice:spike` + `/lattice:spec-from-code` reverse the flow.
- **Wave-based parallel atomic plan execution (`execute-phase.md`).** Lattice runs sequential cycle phases with explicit gates. Concurrency at the plan level adds coordination complexity without obvious win for a one-developer-plus-Claude shop.
- **UAT / human-in-the-loop verification (`verify-work.md`, `audit-uat.md`).** Lattice review is automated + `peer-review` (blind). UAT scripting is over-ceremony for the current scale.
- **Pre-decision agent personas (`gsd-framework-selector`, `gsd-assumptions-analyzer`, `gsd-advisor-researcher`).** Lattice gates this through `/lattice:architect` and the architect-review checklist. One gate skill versus several specialised agents.
- **User-profiling agents (`profile-user.md`, `set-profile.md`, `gsd-user-profiler`).** Memory system (`MEMORY.md`) covers user-fact persistence; a dedicated profiling agent is over-engineered for one user.
- **Multi-variant HTML sketch flow (`sketch.md` + `sketch-wrap-up.md`).** Lattice `/lattice:design` produces guidance + screenshots, not interactive HTML mockups. Sendex's design-system audit checklist provides the discipline GSD's sketch flow tries to enforce procedurally.
- **XML prompt formatting as a house style.** Lattice prompts are markdown + YAML. No XML conventions enforced.
- **NPM distribution / multi-runtime support.** Lattice is Claude-Code-only and repo-local by design — different distribution model.
- **Per-task atomic commit policy by the executor.** Lattice batches changes per cycle phase; commit checklist is human-driven (rule 5, item 5 of COMMIT-CHECKLIST.md).

## Convergent invention (not borrowed from GSD)

Both frameworks have these — lattice did not take them from GSD:

- **Spike pattern.** Both ship `spike` + `spike-wrap-up`. Lattice's came from `obra/superpowers` (see [`obra-superpowers.md`](obra-superpowers.md)). Convergent invention.
- **Phase research / synthesizer pattern.** Both have research → synthesize. Lattice arrived at this independently through `/lattice:research` → `/lattice:synthesize` → `/lattice:distill`.
- **Codebase mapping.** GSD has `gsd-codebase-mapper` + `gsd-pattern-mapper`; lattice has static `system-manifest.md` (25 subsystems) + `capabilities.yaml` + `methods-index.md`. Same goal, different artifacts.
- **Hook-based write-time enforcement.** GSD has `gsd-prompt-guard.js`, `gsd-workflow-guard.js`, `gsd-validate-commit.sh`. Lattice's hook architecture came from `alexfazio/plankton` (see [`alexfazio-plankton.md`](alexfazio-plankton.md)).

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
- Memory: `project_repo_restructure.md` (GSD removal from pcc), `project_executor_next_steps.md` (token-tracker deferral overlaps with `gsd-context-monitor`)
- Related but distinct: lattice's `decisions.log` (architectural decisions, not session state) and `MEMORY.md` (cross-session facts, not in-flight task state)
- Convergent inventions documented separately: [`obra-superpowers.md`](obra-superpowers.md) (spike), [`alexfazio-plankton.md`](alexfazio-plankton.md) (write-time hooks)
