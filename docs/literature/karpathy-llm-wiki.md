---
title: "LLM Wiki: Core Concept Extraction"
authors: Andrej Karpathy
year: 2025
url: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
type: gist
read: 2026-04-26
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

## Borrowed

- **Three-layer separation.** Already in lattice (raw / knowledge / schema). Reinforced; not changed.
- **Lint as a periodic operation.** Add `/lattice:lint-knowledge` step — runs over `docs/_internal/knowledge/` + `architecture/` and surfaces:
  - Contradictions across knowledge files
  - Stale citations (`file:line` no longer resolves) — extends `audit-contract-triangles.py` pattern
  - Orphaned pages (no inbound link from CLAUDE.md, domain-knowledge-map, system-manifest)
  - Provenance gaps (assertion with no source citation)
- **Gap-driven autopilot.** New `/lattice:autopilot --discover` mode runs deterministic scans (capabilities × coverage, system-manifest × architecture, contract-triangles × code grep, methods-index × analysis exports) and emits a ranked list of knowledge gaps with `safe-for-autopilot Y/N` classification.
- **Query→Wiki promotion.** When `/lattice:distill` surfaces a novel cross-subsystem connection, prompt to extract a knowledge entry rather than letting the synthesis evaporate.
- **Bidirectional cross-reference graph.** Knowledge entries get explicit `links_to` / `links_from` / `source_evidence` metadata. Backlinks become typed (see Ahrens for atomicity discussion).

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
- Existing skills: `/lattice:sweep` (extend to semantic lint), `/lattice:autopilot` (extend with `--discover`), `/lattice:distill` (extend with promotion prompt).
