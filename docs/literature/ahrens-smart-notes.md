---
title: "How to Take Smart Notes"
authors: Sönke Ahrens
year: 2017
url: https://takesmartnotes.com
type: book
read: 2026-04-26
status: evaluating
---

# Ahrens — How to Take Smart Notes

## Source thesis

Ahrens documents Niklas Luhmann's *Zettelkasten* (slip-box) workflow as a method that turns note-taking into a thinking and writing system rather than a storage chore. The core argument: writing quality depends on what you did *before* facing the blank page. The slip-box is the externalised structure that makes serious intellectual work tractable.

Three categories of notes, kept strictly separate:

- **Fleeting notes** — captures of in-the-moment thoughts. Reviewed within a day, then discarded.
- **Literature notes** — condensed reformulations of what an external source actually says, in the reader's own words, with bibliographic citation. Stored separately from one's own thinking.
- **Permanent notes** — atomic, self-contained ideas written for an ignorant future reader. One idea per note. Filed by linking to related notes, not by topic taxonomy. Never thrown away.

A fourth class — **project notes** — stays scoped to a single project and is discarded after.

Topology principles:

- **Atomic.** One idea per note. Enables the same idea to be linked into multiple contexts.
- **Bottom-up.** Topics emerge from clusters of densely linked notes. Don't decide what to write about in advance — *look at where the notes have built up*.
- **Index as entry-point, not taxonomy.** A small number of "starter" notes serve as entry points to threads. The bulk of structure is in the links between notes, not in folders.
- **Translate, don't copy.** Reformulating in your own words is the primary mechanism of understanding; verbatim quotes skip that step.
- **Critical mass.** Value increases super-linearly with size *if* quality is maintained — every undisciplined note dilutes the system.
- **Confirmation-bias mitigation.** Actively seek dis-confirming notes; the slip-box rewards adding contradictions because they open more discussion threads.

## Translation

Lattice already has the equivalents of permanent notes (`docs/_internal/knowledge/`) and project notes (`docs/_internal/incoming/` specs, archived after). It also has entry-point indices (`CLAUDE.md`, `domain-knowledge-map.md`, `system-manifest.md`).

What's genuinely missing is the **literature-notes layer** — there's no canonical place for "what this external source actually said, in our vocabulary". External sources get read in one-off conversations and discarded. (This very registry exists to fix that.)

The **bottom-up topic emergence** principle complements Karpathy's lint operation: Karpathy emphasizes finding *sparse* areas (gaps); Ahrens emphasizes finding *dense* areas (latent topics ready for consolidation). Together they give two discovery signals for autopilot.

The **atomicity** principle, applied indiscriminately, would explode lattice's file count and violate sendex CLAUDE.md rule 8 (no directory sprawl). But applied selectively to *graph-participating facts* — HCD thresholds, syndrome rules, severity gradings — it's exactly what makes typed multi-dimensional links tractable.

## Borrowed

- **Literature-notes layer.** This directory (`C:/pg/lattice/docs/literature/`) and its registry. Each external source produces a translated, citable record before context evaporates.
- **Translate-don't-copy as a synthesize-step rule.** When `/lattice:synthesize` extracts knowledge from a research artifact or spec, it must reformulate in lattice/sendex vocabulary, not paste source quotes. The "Source thesis" and "Translation" split in literature-note schema enforces this for external sources.
- **Bottom-up cluster emergence as autopilot signal.** Pairs with Karpathy lint: scan the knowledge graph for densely-linked clusters lacking a synthesizing entry; trigger `/lattice:synthesize` to extract a new knowledge entry. Different operation than gap research:

  | Signal | What it suggests | Autopilot action |
  |---|---|---|
  | Sparse area (Karpathy lint) | Knowledge gap | Trigger `/lattice:research` |
  | Dense cluster (Ahrens emergence) | Latent topic ready to consolidate | Trigger `/lattice:synthesize` |
  | Stale citation | Drift | Trigger `/lattice:lint-knowledge` repair |

- **Atomicity for graph-participating facts only.** Knowledge that participates in scoring (HCD thresholds, syndrome rules, contract enums, severity gradings) gets atomic node IDs and stable addresses; prose stays as prose. The rule of thumb: if changing the fact would require re-running validation, it's a graph node.
- **Future-reader test in `/lattice:lint-knowledge`.** Lint rule: knowledge entries must read standalone — no `as discussed above`, no `see prior`, no `we decided last week`. Entries that fail this fail review.
- **Confirmation-bias workflow forcing.** Already partially adopted via `/lattice:peer-review` (blind, no implementation context). Reinforced; extend the principle into research mode by instructing the agent to seek dis-confirming evidence first when scoping a topic.

## Rejected

- **Fleeting notes / inbox layer.** Conversation context already plays this role. Adding a formal inbox would be ceremony without benefit.
- **Strict numeric IDs (Luhmann's `21/3d7a7`).** Filename + heading anchors + the typed registry are sufficient addressing. Opaque IDs add no information for a system that already has paths.
- **Atomize everything.** Violates sendex CLAUDE.md rule 8. Atomize only graph nodes; leave prose as prose.
- **Daily-review ritual / habit framing.** Lattice cycles enforce this implicitly through gates (review, sweep, commit checklist). No new ritual needed.
- **Slip-box as a writing-only tool.** Ahrens frames it for academic publishing. Lattice's analog targets *building software* — the same workflow shape, but the output is code + docs, not papers.

## Evaluating

- **Which knowledge files to atomize first.** HCD knowledge and syndrome rules are the strongest candidates because both already have multi-dimensional scope (species × strain × study × endpoint × pharmacology) and downstream consumers (scoring weights, severity thresholds, certainty scores). Pick HCD as the first dogfooding target.
- **Whether to formalize the `Source thesis` / `Translation` split as a synthesize-step linter.** Today it's a rule; could be enforced by checking that knowledge entries don't quote external sources verbatim above N words.

## Cross-refs

- Pairs with: [`karpathy-llm-wiki.md`](karpathy-llm-wiki.md) — Karpathy supplies the structure (3-layer wiki, lint operation); Ahrens supplies the workflow (literature notes, atomicity discipline, bottom-up emergence).
- Existing skills: `/lattice:synthesize` (extend with translate-don't-copy enforcement), `/lattice:autopilot` (extend with `--consolidate` for cluster emergence), `/lattice:peer-review` (precedent for confirmation-bias forcing).
- Existing knowledge: `docs/_internal/knowledge/domain-knowledge-map.md` (lattice's index/entry-point analog), `system-manifest.md` (top-level entry point with subsystem links).
