---
title: archon
authors: Cole Medin (coleam00)
year: 2025
url: https://github.com/coleam00/archon
type: framework
read: 2026-04; revised 2026-04-26 (audit)
status: partial
---

# coleam00 — archon

## Source thesis

AI workflow engine for coding agents. Verified mechanics relevant to lattice (per `gh api repos/coleam00/archon/contents/`):

1. **Validation-PR workflow with paired E2E commands.** `archon-validate-pr-e2e-main.md` (run from main) + `archon-validate-pr-e2e-feature.md` (run from feature) execute the test suite on both branches and surface regressions as a diff.
2. **Per-loop iteration caps.** Workflow YAMLs (`archon-test-loop-dag.yaml`, `archon-piv-loop.yaml`) bound agent loops via `max_iterations: N`. Iteration-count caps, NOT USD-cost caps.

## Translation

The validation-PR workflow is a strong primitive for catching regressions an agent didn't predict — the test suite runs on both branches and a diff surfaces the deltas. This is the load-bearing mechanic lattice borrowed.

The iteration-cap mechanism is also a real archon feature, but lattice's actual implementation uses USD-based budgets (`scaffold/.lattice/budget.yaml` per-workflow + per-topic), which is structurally different from `max_iterations: N`. Earlier framing in this note attributed lattice's USD budgets to archon — that was wrong, and is corrected below.

## Borrowed

- **E2E branch comparison.** Run the test / validation suite on base and candidate branches, diff the results. Lives in `executor/src/e2e.ts` (lattice executor). Archon's paired commands (`archon-validate-pr-e2e-main.md`, `archon-validate-pr-e2e-feature.md`) are the documented source for this pattern.

## Rejected (or independent)

- **Iteration-count caps as the primary loop bound.** Archon uses `max_iterations: N` for loop control. Lattice instead uses USD-cost caps (`scaffold/.lattice/budget.yaml` with `per_workflow` and `per_topic` budgets). Different units, similar intent. Lattice's USD-based design is independent of archon — the closer prior art for token/cost telemetry is GSD's `gsd-context-monitor.js` (token-aware), not archon's iteration counter. *Earlier framing claiming lattice's `budget.yaml` was borrowed from archon was incorrect; retracted per `_audit-2026-04-26.md`.*

## Evaluating

- **Whether to add iteration-count caps alongside USD caps.** USD costs are useful for resource accounting; iteration caps are useful for catching infinite-loop bugs in agent code. The two are not redundant. May be worth adding `max_iterations` as a fallback bound to lattice's budget mechanics.

## Cross-refs

- Lattice deck slide: "Built on the shoulders of"
- Implementation of borrowed pattern: `executor/src/e2e.ts`
- Independent design (NOT from archon): `scaffold/.lattice/budget.yaml`, token tracker
- Memory: `project_executor_next_steps.md` (deferred work tracking — both E2E and budget were listed as Pre-Phase-3 requirements; E2E is borrowed from archon, budget is independent)
- Audit history: `_audit-2026-04-26.md` documents the budget-attribution correction folded into this revision.
