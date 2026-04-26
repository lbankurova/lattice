# Literature & Borrow Registry — Lattice Framework

Authoritative record of external sources lattice has read, evaluated, and either borrowed from or explicitly rejected. **Scope: dev-framework / methodology / agent-system reading.** Sendex-domain reading (regulatory, toxicology, HCD, statistical methods) lives in `C:/pg/pcc/docs/_internal/research/literature/`.

The deck slide "Built on the shoulders of" (`lattice-deck.html`) is the public-facing summary; this directory is the maintained source of truth.

## Why this exists

When we read a paper, gist, book, or framework, the synthesis happens in conversation and evaporates when context clears. Without this layer:

- Same source gets re-read months later because nobody remembered we already evaluated it
- "What was our take on Zettelkasten?" has no grep-able answer
- Borrowed patterns lose their provenance over time
- Rejected ideas get re-proposed because the rejection rationale is unrecorded

Each entry captures: the source's actual thesis (in their words), translation into lattice/sendex vocabulary, what we borrowed (with pointer to where it lives), what we rejected (with reason), and what's still under evaluation.

## Schema

Each entry is one markdown file with frontmatter + sections:

```markdown
---
title: <full title>
authors: <authors>
year: <year>
url: <canonical url>
type: framework | book | gist | post | paper
read: YYYY-MM-DD
status: borrowed | rejected | partial | evaluating
---

# <Title>

## Source thesis
1-2 paragraphs in the source's vocabulary, condensed. The "what they actually said" record.

## Translation
Restated in lattice/sendex vocabulary. The "what it means for us" interpretation.

## Borrowed
- **<item>** — what we adopted and where it lives (file, skill, rule).

## Rejected
- **<item>** — what we considered and explicitly did not adopt, with reason.

## Evaluating
- **<item>** — under consideration, undecided.

## Cross-refs
- Knowledge entries informed: ...
- Decisions log entries: ...
- Commits: ...
```

Depth varies. Two-paragraph stubs are fine for sources we've fully extracted from already. Multi-page deep notes are warranted for sources we're actively designing against.

## Conventions

- **One file per source.** Filename: `<author>-<short-slug>.md` (e.g., `ahrens-smart-notes.md`).
- **Translate, don't copy.** "Source thesis" is in their words but reformulated, not quoted verbatim. Quotes only when the exact wording matters.
- **Pointer-based borrowing.** Every borrowed item names the lattice/sendex artifact where it lives. No floating "we use this somewhere".
- **Rejection requires a reason.** "Didn't adopt" is not enough — record what tradeoff or constraint drove the decision.
- **Status reflects current state.** Update when we adopt more, reject more, or finish evaluating. The frontmatter date is the *first read*, not the last edit.

## Registry

| Source | Type | Read | Status | Take |
|---|---|---|---|---|
| [karpathy/autoresearch](karpathy-autoresearch.md) | framework | 2026-03 | borrowed | Validation ratchet pattern (oracle, autonomous loop, append-only experiment log) |
| [obra/superpowers](obra-superpowers.md) | framework | 2026-03 | partial | Spike + fresh-context review subagents; rejected the waterfall flow |
| [alexfazio/plankton](alexfazio-plankton.md) | framework | 2026-04 | borrowed | Write-time hook enforcement architecture (PreToolUse blocks, PostToolUse warns) |
| [coleam00/archon](coleam00-archon.md) | framework | 2026-04 | borrowed | E2E branch-comparison validation + per-experiment budget caps |
| [GSD](gsd.md) | framework | 2026-04-26 (full) | partial | Pause/resume handoff borrowed; spec-first waterfall + UAT loop + parallel-plan executor explicitly rejected |
| [karpathy/llm-wiki](karpathy-llm-wiki.md) | gist | 2026-04-26 | evaluating | Three-layer wiki + lint operation; complements lattice's docs lifecycle |
| [Ahrens — How to Take Smart Notes](ahrens-smart-notes.md) | book | 2026-04-26 | evaluating | Literature-notes layer + bottom-up cluster emergence as autopilot signal |

## Adding an entry

When evaluating a new source:

1. Create `<author>-<slug>.md` with the schema above.
2. Add a row to the registry table here.
3. If borrowed items land in the deck, update `lattice-deck.html` "Built on the shoulders of" slide.
4. If a knowledge entry or decision was informed by the source, cross-ref both ways (knowledge entry cites the literature note; literature note lists the knowledge entry).
