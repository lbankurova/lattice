---
title: "How to Take Smart Notes"
authors: Sönke Ahrens
year: 2017
url: https://takesmartnotes.com
type: book
read: 2026-04-26; revised 2026-04-26 (audit)
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

Ahrens's stated audience is "students, ambitious academics, and curious nonfiction writers" (verified at source). The book does not address software engineering knowledge work, but the workflow primitives have been widely adapted to that domain by others (e.g., Andy Matuschak's evergreen notes, Maggie Appleton's gardens).

## Translation

Lattice already has the equivalents of permanent notes (`docs/_internal/knowledge/`) and project notes (`docs/_internal/incoming/` specs, archived after). It also has entry-point indices (`CLAUDE.md`, `.claude/rules/domain-knowledge-map.md`, `docs/_internal/knowledge/system-manifest.md`).

What's genuinely missing is the **literature-notes layer** — there was no canonical place for "what this external source actually said, in our vocabulary" before this directory existed. External sources got read in one-off conversations and discarded.

The **bottom-up topic emergence** principle is the dual of Karpathy's lint operation: Karpathy emphasizes finding *sparse* areas (gaps); Ahrens emphasizes finding *dense* areas (latent topics ready for consolidation). Together they give two discovery signals — both currently aspirational in lattice.

The **atomicity** principle does NOT conflict with sendex CLAUDE.md rule 8 (verified — rule 8 governs new top-level directories, not file count or atomization within existing directories). The actual constraint is signal-to-noise: indiscriminate atomization dilutes value because most content is prose, not graph-participating fact. Selective atomization for facts that participate in scoring is the right scope.

## Borrowed (implemented)

- **Literature-notes layer.** Lives in `C:/pg/lattice/docs/literature/` (this file's parent directory) and `C:/pg/pcc/docs/_internal/research/literature/`. Each external source produces a translated, citable record. The README at each location encodes the schema and conventions.
- **Translate vs. copy discipline at the source-thesis level.** This file's "Source thesis" / "Translation" split is the convention in practice. The schema in `literature/README.md` mandates separation of source's words from sendex/lattice vocabulary.
- **Confirmation-bias workflow forcing via blind review.** Implemented in `commands/lattice/peer-review.md` (blind reviewer, no implementation context). The principle ("delegate to a fresh agent that has no priors") matches Ahrens's argument that an external reader catches what the writer convinced themselves they had said.

## Proposed (not yet implemented)

These are aspirational borrows derived from Ahrens's principles. They are NOT in lattice today; the rationale and target locations are documented here so future implementation has a path.

- **Bottom-up cluster emergence as autopilot signal.** Would require a knowledge-graph metadata layer (typed edges between knowledge entries) that does not yet exist. If implemented, the workflow:

  | Signal | What it suggests | Autopilot action (proposed) |
  |---|---|---|
  | Sparse area (Karpathy lint) | Knowledge gap | Trigger `/lattice:research` |
  | Dense cluster (Ahrens emergence) | Latent topic ready to consolidate | Trigger `/lattice:synthesize` |
  | Stale citation | Drift | Trigger `/lattice:lint-knowledge` repair |

  None of `/lattice:autopilot --discover`, `--consolidate`, or `/lattice:lint-knowledge` exist today.

- **Atomicity for graph-participating facts.** Dogfood test in `pcc/docs/_internal/research/hcd/atomic-facts-dogfood.md` (HCD-FACT-001 through 003) demonstrates the schema. Promotion to `docs/_internal/knowledge/knowledge-graph.md` as canonical is pending architect review.

- **Future-reader test in a knowledge lint.** Proposed rule: knowledge entries must read standalone — no `as discussed above`, no `see prior`, no `we decided last week`. Would live in `/lattice:lint-knowledge` (not yet implemented).

- **Translate-don't-copy enforcement at synthesize step.** Schema mandates this for literature notes (above); enforcement at `/lattice:synthesize` (refusing knowledge entries that quote sources verbatim above N words) is proposed but not implemented.

## Rejected

- **Fleeting notes / inbox layer.** Conversation context already plays this role. Adding a formal inbox would be ceremony without benefit.
- **Strict numeric IDs (Luhmann's `21/3d7a7`).** Filename + heading anchors + the typed registry are sufficient addressing. Opaque IDs add no information for a system that already has paths.
- **Atomize everything.** Indiscriminate atomization dilutes signal — most content is prose, not graph-participating fact. The constraint is signal-to-noise, not directory sprawl (rule 8 is about new top-level directories, not file count). Atomize only graph nodes; leave prose as prose.
- **Daily-review ritual / habit framing.** Lattice cycles enforce this implicitly through gates (review, sweep, commit checklist). No new ritual needed.
- **Slip-box's audience scoping (academic publishing).** Ahrens addresses students, academics, and nonfiction writers. The output target (manuscripts) does not transfer to lattice (output is code + durable knowledge entries scaffolding scientific code). The *workflow primitives* (atomicity, linking, translate-don't-copy, bottom-up emergence) DO transfer cleanly — Zettelkasten is widely adapted to engineering knowledge work by Matuschak, Appleton, and others. So we adopt the primitives but reject the audience scoping.

## Evaluating

- **Which knowledge files to atomize first.** HCD knowledge and syndrome rules are the strongest candidates because both already have multi-dimensional scope (species × strain × study × endpoint × pharmacology) and downstream consumers (scoring weights, severity thresholds, certainty scores). HCD dogfooding test underway in `pcc/docs/_internal/research/hcd/atomic-facts-dogfood.md`.
- **Whether to formalize the `Source thesis` / `Translation` split as a synthesize-step linter.** Today it's a rule applied by convention; could be enforced by checking that knowledge entries don't quote external sources verbatim above N words.

## Cross-refs

- Pairs with: [`karpathy-llm-wiki.md`](karpathy-llm-wiki.md) — Karpathy supplies the structure (3-layer wiki, lint operation); Ahrens supplies the workflow (literature notes, atomicity discipline, bottom-up emergence).
- Implemented borrows: `commands/lattice/peer-review.md`, `C:/pg/lattice/docs/literature/README.md`, `C:/pg/pcc/docs/_internal/research/literature/README.md`
- Proposed (not yet implemented): `/lattice:autopilot --discover` / `--consolidate`, `/lattice:lint-knowledge`, `docs/_internal/knowledge/knowledge-graph.md`
- HCD dogfood (typed-graph schema test): `C:/pg/pcc/docs/_internal/research/hcd/atomic-facts-dogfood.md`
- Audit history: `_audit-2026-04-26.md` documents the factual corrections folded into this revision (rule 8 misread fixed, slip-box audience-scoping reframed, aspirational items moved out of "Borrowed" into "Proposed").
