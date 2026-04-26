---
title: plankton
authors: Alex Fazio
year: 2025
url: https://github.com/alexfazio/plankton
type: framework
read: 2026-04; revised 2026-04-26 (audit)
status: borrowed
---

# alexfazio — plankton

## Source thesis

Write-time quality enforcement via Claude Code hooks. Tamper-proof linter configuration: PreToolUse hooks (`protect_linter_configs.sh`, `enforce_package_managers.sh`) block tool calls; PostToolUse hooks (`multi_linter.sh`) run on every file write and **also block** via exit code 2 when issues remain after delegation. Per `multi_linter.sh` comment: "Exit Code Strategy: 0 - No issues or all issues fixed by delegation; 2 - Issues remain after delegation attempt". Honour-system rules don't work; mechanical hooks do.

## Translation

The reliability principle: enforcement that depends on the agent remembering to do something will fail. Enforcement that runs as a side effect of tool use cannot be skipped. Lattice borrowed the architecture (PreToolUse + PostToolUse hooks) but adapted the severity model — plankton blocks at both phases; lattice uses PostToolUse for non-blocking warnings (e.g., topic-trailer reminders) where blocking would interrupt flow.

## Borrowed

- **Hook enforcement architecture.** PreToolUse + PostToolUse hooks gating tool calls. Lives in `.claude/settings.json` hooks configuration across pcc and lattice. Plankton's specific reference implementation: `multi_linter.sh` (PostToolUse block-via-exit-2), `protect_linter_configs.sh` (PreToolUse block).

## Adapted (not direct copy)

- **Severity model.** Plankton blocks at both PreToolUse and PostToolUse. Lattice uses PreToolUse for blocking checks (commit without review gate, write without test) and PostToolUse for advisory checks (topic-trailer reminders, token-audit warnings). The architecture is borrowed; the severity assignment per check is lattice's choice. *Earlier framing claiming "PostToolUse warns" as plankton's behavior was wrong; corrected per `_audit-2026-04-26.md`.*

## Rejected

None recorded.

## Cross-refs

- Lattice deck slide: "Built on the shoulders of"
- Implementations: `.claude/settings.json` (pcc, lattice), `hooks/` directory in lattice
- Related: review-gate enforcement (memory: `feedback_review_gate_enforcement.md`) — same principle, applied to the review step.
- Audit history: `_audit-2026-04-26.md` documents the PostToolUse severity correction folded into this revision.
