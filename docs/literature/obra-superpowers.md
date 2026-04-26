---
title: superpowers
authors: Jesse Vincent (obra)
year: 2025
url: https://github.com/obra/superpowers
type: framework
read: 2026-03; 2026-04-26 (audit-revised)
status: partial
---

# obra — superpowers

## Source thesis

Complete software development methodology for Claude Code, distributed as a cross-platform plugin. The 14 skills (verified via `gh api repos/obra/superpowers/git/trees/main?recursive=1`) decompose into a default flow and supporting patterns:

```
brainstorming → using-git-worktrees → writing-plans
              → subagent-driven-development OR executing-plans
              → test-driven-development → requesting-code-review
              → finishing-a-development-branch
```

Plus supporting skills: `dispatching-parallel-agents`, `receiving-code-review`, `systematic-debugging`, `using-superpowers`, `verification-before-completion`, `writing-skills`.

Three load-bearing pieces in superpowers' default flow:

1. **Brainstorming gate** (`brainstorming/SKILL.md`) — a Socratic design refinement step with an explicit `<HARD-GATE>` requiring design + user approval before any implementation. Quote: "every project goes through this process … 'simple' projects are where unexamined assumptions cause the most wasted work".
2. **Test-driven development** — RED-GREEN-REFACTOR is treated as universal practice, not an option.
3. **Subagent-per-task with two-stage review** — each task is dispatched to a subagent, then reviewed by a fresh spec-compliance subagent and a fresh code-quality subagent. The inner loop is iterative, not pure waterfall.

## Translation

Superpowers and lattice both target Claude-Code-driven development with strong gating discipline. The structural difference is **universal mandate vs. classified dispatch**: superpowers requires every task to traverse brainstorming → plan → TDD → review; lattice classifies topics first (`commands/lattice/cycle.md:12-20`) and routes to one of three paths (full / spike / bug-fix) — see `WORKFLOW.md` "Design Stance".

Lattice's full path (research-cycle → blueprint-cycle → build-cycle) is structurally similar to superpowers' default — both are spec-driven sequences. Lattice's spike path is the exception that superpowers does not have.

## Borrowed

- **Fresh-context subagents for review.** Superpowers' `subagent-driven-development/SKILL.md` explicitly uses fresh subagents for two-stage review per task (spec-reviewer subagent → code-quality-reviewer subagent). Lattice's `commands/lattice/review.md:132-135` runs three reviewer agents (`agents/architect-reviewer.md`, `agents/decision-auditor.md`, `agents/post-impl-reviewer.md`) in parallel. Same principle: delegate review to specialised agents with isolated context.

## Rejected

- **Mandatory brainstorming gate before every task.** Superpowers' `brainstorming` skill has a `<HARD-GATE>` requiring design + user approval before any implementation, applied universally. Lattice classifies topics: full-path topics get the equivalent design-gating via `/lattice:research-cycle` + `/lattice:blueprint-cycle`; spike-path topics skip the gate because scope is bounded and patterns are known. We borrowed the design-before-code DEFAULT (it's our full-path); we did not borrow the universal mandate. The classifier overhead is justified for a research-heavy project where some topics genuinely don't need the gate.

## Convergent invention or independent design

- **Spike pattern.** Lattice has `commands/lattice/spike.md` (added in initial commit `825e652`, 2026-03-28); superpowers does NOT have a spike skill (verified: 14 skills enumerated, no spike). The closest superpowers analog is `brainstorming`, which is the OPPOSITE of spike (design-first vs. build-first). Lattice's spike has no documented source; the pattern is widespread in software practice (XP-tradition spike conventions, etc.). *Earlier framing claiming spike was borrowed from superpowers was wrong; retracted per `_audit-2026-04-26.md`.*

- **Git worktrees for parallel branches.** Superpowers has `using-git-worktrees/SKILL.md`; lattice has `EnterWorktree`/`ExitWorktree` tools available in agent invocations. Same pattern, possibly independent design.

## Evaluated and not borrowed

- **Test-driven development (RED-GREEN-REFACTOR) as universal practice.** Superpowers treats TDD as load-bearing for every task. Lattice does not adopt TDD as a universal mandate. Reason: scientific analysis code (statistical methods, validation engine) doesn't decompose cleanly into RED-GREEN-REFACTOR because the oracle is the validation suite (ground-truth study cards + cross-study benchmark), not unit tests written first. Lattice's correctness ratchet is the **validation ratchet** (borrowed from `karpathy/autoresearch` — see [`karpathy-autoresearch.md`](karpathy-autoresearch.md)) which uses a fixed external oracle the agent cannot modify. For non-scientific code (UI, plumbing), lattice does write tests but doesn't enforce test-first. **Open question:** is this trade-off correct, or are we missing the discipline benefit of TDD because we conflated "no good unit-test boundary for stats" with "no test-first ever"?

## Cross-refs

- Lattice authoritative reference for routing model: `WORKFLOW.md` "Design Stance" + `commands/lattice/cycle.md:12-20`
- Implementations of borrowed pattern: `commands/lattice/review.md`, `agents/architect-reviewer.md`, `agents/decision-auditor.md`, `agents/post-impl-reviewer.md`
- Convergent / independent: `commands/lattice/spike.md` (no documented source), `EnterWorktree`/`ExitWorktree` tools
- Validation ratchet (used in lieu of universal TDD): see [`karpathy-autoresearch.md`](karpathy-autoresearch.md)
- Audit history: `_audit-2026-04-26.md` documents the factual corrections folded into this revision (spike attribution retracted, waterfall framing corrected, TDD treatment added).
