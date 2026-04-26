---
title: autoresearch
authors: Andrej Karpathy
year: 2025
url: https://github.com/karpathy/autoresearch
type: framework
read: 2026-03
status: borrowed
---

# Karpathy — autoresearch

## Source thesis

Autonomous LLM research loop: modify code, train for ~5 minutes, measure validation bits-per-byte against a fixed evaluation harness, keep or revert based on the metric. Repeat indefinitely. The agent cannot modify the oracle — the metric is the ratchet.

## Translation

The validation ratchet is the load-bearing piece. An agent that can mutate its own success criterion drifts; an agent constrained to a fixed external oracle either improves the metric or doesn't ship. Lattice maps this onto domain validation: a fixed set of ground-truth study cards the agent cannot edit, and validation scores that gate commits.

## Borrowed

- **Oracle pattern.** Validation ratchet — agent cannot modify the metric. Lives in `docs/validation/references/*.yaml` (read-only ground truth) and `/lattice:review` validation gates.
- **Append-only experiment log.** `results.tsv` analog → `.lattice/decisions.log` (append-only, no rewrites).
- **Autonomous loop ("NEVER STOP").** The /lattice:autopilot skill — advances safe topics through their full lifecycle without prompting.
- **Read-only evaluation harness.** `prepare.py` analog → study reference cards + cross-study validation runs.

## Rejected

None recorded.

## Cross-refs

- Lattice deck slide: "Built on the shoulders of"
- Implementations: `.lattice/decisions.log`, `/lattice:autopilot`, `docs/validation/references/`
