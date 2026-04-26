---
title: superpowers
authors: Jesse Vincent (obra)
year: 2025
url: https://github.com/obra/superpowers
type: framework
read: 2026-03
status: partial
---

# obra — superpowers

## Source thesis

Complete LLM-assisted dev methodology: brainstorm → spec → plan → subagent-per-task → review. Cross-platform plugin packaging the whole flow. Waterfall in shape — spec precedes implementation.

## Translation

Two strong patterns inside an overall flow that doesn't fit lattice. The patterns are reusable; the waterfall is not.

## Borrowed

- **Spike — time-boxed exploration, keep or discard.** Lives in `/lattice:spike` and pairs with `/spec-from-code` (reverse flow: build first, extract spec from working code).
- **Fresh-context subagents for review.** Independent reviewers without implementation context catch what the implementer missed. Lives in `/lattice:review` (post-impl-reviewer agent) and `/ultrareview`.

## Rejected

- **Waterfall flow (brainstorm → spec → plan → build).** Lattice inverts this: build first when the path is clear (spike), spec after when the artifact is real. Spec-first is too slow for exploration and produces specs that don't survive contact with the code.

## Cross-refs

- Lattice deck slide: "Built on the shoulders of"
- Implementations: `/lattice:spike`, `/spec-from-code`, `/lattice:review`, `/ultrareview`
