---
title: archon
authors: Cole Medin (coleam00)
year: 2025
url: https://github.com/coleam00/archon
type: framework
read: 2026-04
status: borrowed
---

# coleam00 — archon

## Source thesis

AI agent builder with validation-PR workflow and per-experiment cost management. Two notable mechanics: (1) E2E tests run against both the base branch and the candidate branch, surfacing regressions as a diff; (2) per-task budget caps prevent runaway cost on agent loops.

## Translation

Two operational mechanics for agent-driven changes that lattice didn't have a story for. Both are about *making agent autonomy safe*: comparison-based validation catches regressions the agent didn't predict, and budget caps prevent silent cost explosions on autopilot loops.

## Borrowed

- **E2E branch comparison.** Run the test/validation suite on base and candidate branches, diff the results. Lives in `executor/e2e.ts` (lattice executor) and is the model for cross-branch validation in autopilot loops.
- **Per-experiment budget caps.** `error_max_budget_usd` analog → `budget.yaml` in lattice. Token tracker + budget alerts prevent autopilot from looping past a cost ceiling.

## Rejected

None recorded.

## Evaluating

- **Pre-Phase-3 requirement.** Both mechanics are listed as preconditions before lattice executor reaches Phase 3 (per memory: `project_executor_next_steps.md`).

## Cross-refs

- Lattice deck slide: "Built on the shoulders of"
- Implementations: `executor/e2e.ts`, `budget.yaml`, token tracker
- Memory: `project_executor_next_steps.md` (deferred work tracking)
