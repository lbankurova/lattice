---
title: plankton
authors: Alex Fazio
year: 2025
url: https://github.com/alexfazio/plankton
type: framework
read: 2026-04
status: borrowed
---

# alexfazio — plankton

## Source thesis

Write-time quality enforcement via Claude Code hooks. Tamper-proof linter configuration: PostToolUse hooks run on every file write, blocking or warning before bad code lands. Honour-system rules don't work; mechanical hooks do.

## Translation

The reliability principle: enforcement that depends on the agent remembering to do something will fail. Enforcement that runs as a side effect of tool use cannot be skipped. Lattice already had ad-hoc rules; plankton showed how to make them mechanical.

## Borrowed

- **Hook enforcement architecture.** PreToolUse hooks block (e.g., commit without TODO update); PostToolUse hooks warn (e.g., write without test coverage). Lives in `.claude/settings.json` hooks configuration across pcc and lattice.

## Rejected

None recorded.

## Cross-refs

- Lattice deck slide: "Built on the shoulders of"
- Implementations: `.claude/settings.json` (pcc, lattice), `hooks/` directory in lattice
- Related: review-gate enforcement (memory: `feedback_review_gate_enforcement.md`) — same principle, applied to the review step.
