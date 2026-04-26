---
title: "LLM Wiki: Core Concept Extraction"
authors: Andrej Karpathy
year: 2025
url: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
type: gist
read: 2026-04-26; revised 2026-04-26 (audit)
status: evaluating
---

# Karpathy — LLM Wiki

## Source thesis

Karpathy proposes a three-layer knowledge architecture for LLM-assisted work: **raw sources** (papers, transcripts, code), an **LLM-generated wiki layer** (markdown pages with cross-links), and a **schema** that governs how the system mutates. The wiki is *persistent and compounding* — synthesis happens once at ingest, not repeatedly per query.

Three core operations:

- **Ingest.** A new source triggers updates across many wiki pages — entity definitions, summaries, cross-references. One document may touch 10-15 pages.
- **Query.** User asks a question against the wiki. The LLM synthesizes with citations. Valuable answers are themselves persisted as new wiki pages, so knowledge compounds.
- **Lint.** Periodic health checks identify contradictions, stale claims, orphaned pages, and knowledge gaps.

The pitch versus traditional RAG: rather than rediscovering knowledge afresh per query, the wiki *accumulates*. Cross-references and contradictions remain visible across sessions.

Commenters raised three concerns: (1) **hallucination drift** — when the LLM reads its own prose, summaries diverge from originals; (2) **silent corruption** — read-write loops compound errors invisibly; (3) **terminology** — "wiki" misrepresents an unmaintained LLM-generated collection versus human-curated systems.

## Translation

Lattice already implements most of this architecture, just not under that name:

- **Raw layer** = `send/`, generated JSON, code, validation studies
- **Wiki layer** = `docs/_internal/knowledge/` + `docs/_internal/architecture/`
- **Schema** = `CLAUDE.md`, `MANIFEST.md`, `contract-triangles.md`, `system-manifest.md`, `domain-knowledge-map.md`

What's missing is mostly the **lint operation** in its semantic form (lattice's `/lattice:sweep` does state hygiene only) and the **query→wiki promotion** (distill outputs are ephemeral; only specs and research-cycle promote to durable knowledge).

The hallucination-drift concern matches lattice rule 14 (science preservation gate) for code, but is not enforced for knowledge writes.

## Borrowed (implemented)

- **Three-layer separation.** Already in lattice. Raw layer at `send/` + generated JSON; knowledge layer at `docs/_internal/knowledge/` + `docs/_internal/architecture/`; schema at `CLAUDE.md`, `MANIFEST.md`, `contract-triangles.md`, `system-manifest.md`. Reinforced; not changed.
- **Discovery scan as a partial implementation of the lint operation.** `scripts/discovery-scan.py` (in pcc; template at `lattice/scripts/discovery-scan.py`) runs five deterministic gap scans and emits a ranked report. First run produced 70 gaps, ~85% real-rate. This is the gap-detection part of Karpathy's lint operation; contradiction / stale-citation / orphan checks are not yet implemented.

## Proposed (not yet implemented)

These items are aspirational borrows. They were previously listed under "Borrowed" but they don't exist in lattice today; moving them here so the registry doesn't overstate what lattice has.

- **Full lint operation over the knowledge layer.** Would extend `discovery-scan.py` with: contradiction detection across knowledge files, stale citation checks (`file:line` no longer resolves — extending `audit-contract-triangles.py` pattern), orphaned-page detection, provenance gaps (assertion with no source citation). Target: `/lattice:lint-knowledge` skill — does not exist today.
- **Gap-driven autopilot mode.** Would wire `discovery-scan.py` output into `/lattice:autopilot --discover` to advance deterministic / safe-for-autopilot gaps automatically and escalate the rest to ESCALATION.md. The autopilot infrastructure exists; the `--discover` mode does not.
- **Query→Wiki promotion.** When `/lattice:distill` surfaces a novel cross-subsystem connection, prompt to extract a knowledge entry rather than letting the synthesis evaporate. `commands/lattice/distill.md` exists; the promotion prompt does not.
- **Bidirectional cross-reference graph (typed-edge registry).** Knowledge entries gain `links_to` / `links_from` / `consumed_by` / `influences` / `derives_from` metadata. Dogfood test in `pcc/docs/_internal/research/hcd/atomic-facts-dogfood.md`; promotion to `docs/_internal/knowledge/knowledge-graph.md` as canonical is pending architect review.

## Rejected

- **"Wiki" terminology.** Commenters' critique is valid. Lattice uses "knowledge entries" / "architecture docs" — keeps the human-curation expectation in the name.
- **Unrestricted LLM writes to the knowledge layer.** Drift compounds silently if autopilot writes that later autopilot reads. Mitigation: every autopilot-authored knowledge change carries `provenance: autopilot/<run-id>` and lands in a review queue, not directly in `knowledge/`. Same gate model rule 14 enforces for code.
- **Wiki as the only synthesis substrate.** Specs (`incoming/`) and research artifacts (`research/`) remain disposable / session-bound respectively. Not everything compounds — some context is project-bound and should not bleed into durable knowledge.

## Evaluating

- **Bidirectional graph as a registry pattern** (vs. per-file frontmatter). Likely lands as `docs/_internal/knowledge/knowledge-graph.md` with an audit script (`scripts/audit-knowledge-graph.py`), mirroring `contract-triangles.md`. Schema design pending HCD dogfooding.
- **Schema for graph edges**: `derives_from`, `qualifies`, `consumed_by`, `influences`, `contradicts`. See `ahrens-smart-notes.md` for atomicity scope (only graph-participating facts get atomized).

## Cross-refs

- Pairs with: [`ahrens-smart-notes.md`](ahrens-smart-notes.md) — Ahrens supplies the workflow (literature notes, bottom-up cluster emergence) that complements Karpathy's structure (lint, gaps).
- Existing knowledge: `docs/_internal/knowledge/contract-triangles.md` (precedent for registry-as-source-of-truth pattern).
- Implemented partial: `pcc/scripts/discovery-scan.py`, `lattice/scripts/discovery-scan.py` (template). Output: `scripts/data/discovery-report.md` (gitignored).
- Proposed extensions: `/lattice:lint-knowledge`, `/lattice:autopilot --discover`, `/lattice:distill` query-promotion, knowledge-graph metadata layer.
- Audit history: `_audit-2026-04-26.md` documents the factual corrections folded into this revision (aspirational items moved out of "Borrowed" into "Proposed (not yet implemented)").
