# Lattice Framework — TODO

> Backlog for the framework itself (not projects using it).

## Enhancement

### ~~ENH-01a: E2E testing gate (branch-comparison behavioral verification)~~ d0ce8b0
- Done. `executor/src/e2e.ts`, CLI `lattice e2e`, workflow nodes in build-cycle + bug-fix-cycle, scaffold template.
- Phase 2 deferred: text_diff, custom comparison, parallel suites, screenshot perceptual diff, autopilot integration.

### ~~ENH-02: Token tracker / budget / alerting~~
- Done. `executor/src/budget.ts`, JSON output parsing in `nodes.ts`, cost aggregation in `engine.ts`, `lattice cost` CLI command, scaffold template.
- Uses `claude --output-format json` to get real token counts and cost from CLI (no Phase 2 dependency).
- Phase 2 deferred: cost trend charts, per-model breakdown, Slack budget alerts, cost anomaly detection.

### ENH-01: Vector search for corpus load (Zabaca/lattice integration)
- **Skill affected:** `/lattice:distill` Step 0 Layer 3, `/lattice:research` Step 0
- **What:** Replace title-scanning of INDEX.md with semantic vector search for selecting which research files to deep-read. Use [Zabaca/lattice](https://github.com/Zabaca/lattice) (DuckDB + Voyage AI embeddings) as the search backend.
- **Integration point:** Distill Step 0 Layer 3 ("Deep Read — purpose-driven selection") and research corpus load. Call `lattice search "{question}"` to rank files by semantic relevance instead of keyword/title matching.
- **Why:** Current title-based selection is fragile — misses semantically related files with different terminology (e.g., "organ weight normalization" vs "body weight mediation"). Vector search would improve recall.
- **Dependencies:** Voyage AI API key, `@zabaca/lattice` npm package, sync step after research file creation/update.
- **When:** Revisit when research corpus exceeds ~200 files, or when multiple contributors work in the corpus. Current corpus size (~100 files, single maintainer) makes the marginal value small.
- **Priority:** P3 (low — not a current bottleneck)
