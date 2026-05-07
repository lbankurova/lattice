# 04 — The Project Graph

> Where the project graph lives, schema contract between harness and project.

## 1. Already Known

The Lattice README distinguishes the framework (transferable) from the project's domain artifacts (project-side, read-only at runtime):

> "The framework owns process-level artifacts (skills, agent definitions, workflow DAGs, the executor, hooks, locks, the verdict-enum registry, the review-gate format). The project owns its domain knowledge (typed fact graph, design decision tables, component reuse maps, the script that queries the typed graph). The framework enforces requirements *about* project artifacts ... without supplying the artifacts themselves." (`C:/pg/lattice/README.md:22`)

The "Knowledge layer" section (`README.md:109-122`) names four shapes that share a topological role (project files read by skills/agents during work, never written back during a cycle): typed knowledge graph, untyped registries, design decision tables, research corpus.

The donation table in `docs/datagrok-harness-workplan.md:23-33` separates eight donatable assets from one explicitly NOT donatable (`Lattice's scientific layer`).

The harness/project boundary is the load-bearing test for the platform-agnostic claim. **This document audits what state lives where, who reads/writes it, and where today's Lattice silently assumes the SENDEX layout.**

## 2. What is the "project graph"?

The **project graph** is the union of structured project state the harness reads or writes during a cycle. It is the durable memory the harness needs to:

- resume mid-cycle after a `/clear`,
- detect concurrent agent conflicts,
- prevent re-trying failed approaches,
- audit decisions back to git, and
- route work to the right skill.

The project graph has seven components. Each has a different write cadence and consumer set.

### 2.1 Component overview

| # | Component | Storage | Writer | Reader | Cadence |
|---|---|---|---|---|---|
| 1 | **Backlog** | TODO.md, ROADMAP.md, capabilities.yaml | both | both | per-commit (autopilot, sweep, prioritize) |
| 2 | **Decision log** | `.lattice/decisions.log` | harness (every skill) | harness, reconciler | append-only, per-skill-invocation |
| 3 | **Cycle state** | `.lattice/cycle-state/{topic}.yaml` | harness (cycle nodes) | harness | per-step within a cycle |
| 4 | **Knowledge corpus** | `docs/_internal/knowledge/*.md`, `docs/_internal/research/*.md` | project (manual + extract-learnings) | harness (skills cite) | per-spec-archive, per-research-output |
| 5 | **Specs** | `docs/_internal/incoming/*.md`, `incoming/archive/` | both | both | per-cycle |
| 6 | **Manifest / registry indexes** | MANIFEST.md, REGISTRY.md, INDEX.md (research) | harness (sweep, /lattice:review) + project (manual) | harness (prioritize, distill) | per-commit on touched assets |
| 7 | **Git commit-trailer history** | git log (Topic:, Phase:, Coverage:, Layer:) | harness (skills emit trailers) | reconciler | append-only |

The harness READS the project graph almost entirely; it WRITES only the portions that are bookkeeping for its own runtime (decisions.log, cycle-state YAMLs, review-gate.json, locks, telemetry). The substantive *content* (knowledge facts, design decisions, research findings) is project-authored.

### 2.2 Write/read pattern by component

| Component | Harness writes? | Project writes? | Harness reads? | Project reads? |
|---|---|---|---|---|
| Backlog (TODO.md, ROADMAP.md) | Yes — autopilot, sweep, /lattice:review, extract-learnings | Yes — manual entries | Yes — prioritize, autopilot, sweep | Yes — humans during planning |
| Decision log | Yes — every skill | No (rare; manual debug) | Yes — reconciler, distill, autopilot | Yes — humans auditing |
| Cycle state | Yes — every cycle node | No | Yes — cycle dispatcher, autopilot | No |
| Knowledge corpus | Partial — extract-learnings appends typed facts; lint-knowledge audits | Yes — primary author | Yes — every algorithmic skill cites | Yes — humans build domain truth |
| Specs (incoming/) | Yes — synthesize creates, archive moves | Yes — manual specs | Yes — implement, review, build-cycle | Yes — humans review |
| Manifest / registry indexes | Yes — sweep, distill --audit | Yes — manual entries | Yes — prioritize, probe | Yes — humans audit coverage |
| Git commit-trailer history | Yes — every commit | Yes — manual commits | Yes — reconciler greps | Yes — humans audit |

## 3. SENDEX's project graph today — empirical inventory

### 3.1 Storage shape and size

Audited at `C:/pg/pcc` on 2026-05-07.

| Component | Path | Shape | Size |
|---|---|---|---|
| TODO.md | `docs/_internal/TODO.md` | Markdown with `### GAP-N` / `### BUG-N` / `### DATA-GAP-*` sections + summary table at top | 3,705 lines, 608 KB |
| ROADMAP.md | `docs/_internal/ROADMAP.md` | Markdown, areas → epics → stages | 753 lines, 80 KB |
| capabilities.yaml | `docs/_internal/capabilities.yaml` | YAML — 9 pillars, dimension tables, cascade edges | 64 KB |
| MANIFEST.md | `docs/_internal/MANIFEST.md` | Markdown table — asset, depends-on, last-validated | 105 lines |
| BUG-SWEEP.md | `docs/_internal/BUG-SWEEP.md` | Markdown — `### BUG-NNN` sections, summary table | 104 KB |
| decisions.log | `.lattice/decisions.log` | TSV (TIMESTAMP \t SKILL \t OUTCOME \t CONTEXT \t METRICS \t NOTES) | 983 lines, 446 KB |
| cycle-state/ | `.lattice/cycle-state/{topic}.yaml` | YAML per topic with `phase`, `current_step`, `revision`, `checkpoints`, `probe_outcome` | 80 files |
| review-gate.json | `.lattice/review-gate.json` | JSON, single-use, consumed by pre-commit hook | <1 KB when present |
| commit.lock/ | `.lattice/commit.lock/` | Directory with `meta` file (atomic mkdir) | <1 KB |
| cycle-lock/ | `.lattice/cycle-lock/{topic}/` | Directory with `meta` file per topic | per-topic |
| Knowledge graph | `docs/_internal/knowledge/knowledge-graph.md` | Markdown with embedded YAML facts (typed: `value`, `confidence`, `scope`, `derives_from`, `contradicts`) | (large; see CONVENTIONS.md) |
| Untyped registries | `methods-index.md`, `species-profiles.md`, `vehicle-profiles.md`, `field-contracts-index.md`, `contract-triangles.md` | Markdown with stable IDs (`@method`, `@species`, etc.) | 6 files in `knowledge/` |
| Research corpus | `docs/_internal/research/*.md` + `INDEX.md` + `REGISTRY.md` | Markdown documents, INDEX is title-scan registry, REGISTRY is YAML-shaped streams with status | 182 files |
| Peer-review corpus | `docs/_internal/research/peer-reviews/*.md` | Markdown reviews with verdicts (SOUND/CONDITIONAL/FLAWED) | per-research-doc |
| Specs in flight | `docs/_internal/incoming/*.md` | Markdown spec/synthesis files | 67 files (inc. archive subdir) |
| Specs archive | `docs/_internal/incoming/archive/` | Same shape, organized by year/month | grows monotonically |
| Design decisions | `.claude/rules/design-decisions.md`, `frontend-ui-gate.md`, `domain-knowledge-map.md`, `ux-audit-validate.md` | Markdown decision tables | 4 files |
| Algorithm-paths registry | `.lattice/algorithm-paths.txt` | Plain text, one path-glob per line | (project-side, optional) |
| Telemetry | `.lattice/context-telemetry.jsonl` | JSONL per skill-call | grows monotonically |
| Blocked URLs | `.lattice/blocked-urls.log` | TSV append log | grows monotonically |
| Validation baseline | `.lattice/validation-baseline.json` | JSON — analytical scores snapshot | <10 KB |

### 3.2 Read/write traceability per file

The skill-to-file matrix (which Lattice skill reads or writes which project-graph file) is the load-bearing trace for the harness/project schema contract. Below: skills that have a hard-coded path or filename assumption, ordered by frequency.

| File | Writers | Readers (skills) |
|---|---|---|
| `docs/_internal/TODO.md` | autopilot, sweep, prioritize, research, synthesize, peer-review, probe, implement, lint-knowledge, lit-triage, extract-learnings, ux-audit-file | autopilot, prioritize, sweep, implement-todo, daily-update, distill |
| `docs/_internal/ROADMAP.md` | spec-from-code, sweep | prioritize, daily-update, sweep, spec-from-code |
| `docs/_internal/MANIFEST.md` | review (Step 4) | review, sweep |
| `docs/_internal/BUG-SWEEP.md` | review (Step 5c), ops:bug, ops:bug-stress, bug-fix-cycle | cycle (classify), ops:bug, ops:bug-stress |
| `docs/_internal/capabilities.yaml` | review (Step 3 doc-regen Step D) | prioritize (PRIMARY), ux-audit-file |
| `docs/_internal/research/REGISTRY.md` | research, synthesize, peer-review, probe, distill, spike, spec-from-code, implement | prioritize, autopilot, distill |
| `docs/_internal/research/INDEX.md` | research | distill (corpus load), sweep |
| `docs/_internal/research/peer-reviews/*.md` | peer-review (subagent), research-cycle, blueprint-cycle | research, distill, peer-review (R2 reads R1) |
| `docs/_internal/research/literature/PDF-TRIAGE.md` | lit-triage | lit-triage (re-runs) |
| `docs/_internal/research/literature/<author>-<year>-*.md` | peer-review --novel (creates stub on VERIFIED), lit-triage (promotion) | peer-review |
| `docs/_internal/incoming/*.md` | synthesize | implement, review, build-cycle (path-based entry), architect (gate mode), peer-review (Implementation Plan tier) |
| `docs/_internal/incoming/archive/` | review (post-impl), extract-learnings | sweep, reconcile.ts (executor) |
| `docs/_internal/knowledge/knowledge-graph.md` | manual + extract-learnings | peer-review (mandatory invocation via `query-knowledge.py`), architect (Step 1.4), distill, lint-knowledge (audit) |
| `docs/_internal/knowledge/methods-index.md` | manual | synthesize, review (Step 2a), peer-review, lint-knowledge, lit-triage |
| `docs/_internal/knowledge/species-profiles.md` | manual | distill, peer-review, lit-triage, blueprint-cycle, build-cycle, research-cycle, science-flag-resolution include |
| `docs/_internal/knowledge/code-quality-guardrails.md` | architect Step 5 | synthesize Step 2, blueprint-cycle Step 0, architect, spike |
| `docs/_internal/knowledge/system-manifest.md` | manual | probe (Step 1), distill, ops:bug-stress |
| `docs/_internal/knowledge/contract-triangles.md` | manual | review (TRIANGLE protocol), lint-knowledge |
| `docs/_internal/knowledge/field-contracts.md` | manual + review (CONTRACT DRIFT detection) | review (Step 2a), lint-knowledge |
| `docs/_internal/audits/workflow-audits/*` | ux-audit-walk, ux-audit-validate, ux-audit-file | design (Step 0.2 / Block 1.1), ux-designer |
| `docs/_internal/checklists/SPEC-VALUE-AUDIT.md` | manual | architect Step 1.5, peer-review (Implementation Plan tier) |
| `docs/_internal/checklists/COMMIT-CHECKLIST.md` | manual | review |
| `docs/validation/references/*.yaml` | manual | research (Phase 4), peer-review (B. assertion walk), review (ALGORITHM protocol) |
| `docs/validation/summary.md` | regen-validation generator | prioritize |
| `backend/generated/{study}/unified_findings.json` | regen-validation, generator pipeline | implement (empirical claim verification), review (DATA protocol), peer-review (B. assertion walk), explore-data |
| `.lattice/decisions.log` | every skill | research, blueprint-cycle, build-cycle, autopilot, distill, prioritize, peer-review-cycle |
| `.lattice/cycle-state/{topic}.yaml` | research-cycle, blueprint-cycle, build-cycle, spike-cycle, bug-fix-cycle, mechanical-fix-cycle | cycle dispatcher, autopilot, sweep, ops:sweep |
| `.lattice/review-gate.json` | review (Step 6 via write-review-gate.sh) | pre-commit hook (consumed) |
| `.lattice/commit.lock/` | acquire-lock.sh, pre-commit hook | release-lock.sh, pre-commit hook |
| `.lattice/cycle-lock/{topic}/` | acquire-topic-lock.sh | release-topic-lock.sh, sweep |
| `.lattice/algorithm-paths.txt` | manual (project-side) | write-review-gate.sh, peer-review, architect, review, research |
| `.lattice/validation-baseline.json` | validation-ratchet.sh | validation-ratchet.sh (compare) |
| `.lattice/blocked-urls.log` | research, peer-review, distill, lit-triage | sweep |
| `.lattice/last-review-output.md` | review (Step D7 side-channel) | write-review-gate.sh (greps anchors) |
| `.lattice/last-sweep` | sweep | prioritize Step 0 |
| `.lattice/pending-attestations.json` | append-attestation.sh, peer-review, review | write-review-gate.sh (consumes) |
| `.lattice/commit-intent.txt` | declare-commit-intent.sh (project-side) | mechanical-fix-cycle commit-intent-check, pre-commit Step -0.5 (project-side) |
| `.lattice/context-telemetry.jsonl` | budget.ts (executor) | `lattice context` CLI |
| `.slack-update.json` | daily-update | daily-update |
| `ESCALATION.md` (repo root) | autopilot, implement-todo | humans only |

### 3.3 Schema definition

| File | Schema definition | Where defined | Mechanically validated? |
|---|---|---|---|
| `decisions.log` | TSV `TIMESTAMP\tSKILL\tOUTCOME\tCONTEXT\tMETRICS\tNOTES` | `scaffold/.lattice/README.md:13` | No — by convention |
| `cycle-state/{topic}.yaml` | `topic`, `phase`, `current_step`, `revision`, `checkpoints`, `probe_outcome`, `prerequisites`, `score`, `lifecycle_state` | `commands/lattice/research-cycle.md:43-80`, `commands/lattice/probe.md:148-166` | Partial — `executor/src/state-io.ts` does CAS; loader doesn't validate schema |
| `review-gate.json` | `{verdict, summary, attestations: [{kind, ref, verdict, rationale, agent_id}], checks_passed: {...}}` | `scripts/write-review-gate.sh` (validation logic), `scripts/test-attestation-format.sh` (test contract) | Yes — `write-review-gate.sh` rejects malformed |
| `knowledge-graph.md` | YAML facts inside markdown — `id, kind, value, confidence, scope, derives_from, contradicts, encoding, scoring_eligible` | `docs/_internal/architecture/typed-knowledge-graph-spec.md` (project-side); `scripts/audit-knowledge-graph.py` enforces 8 invariants | Yes — `audit-knowledge-graph.py` |
| `contract-triangles.md` | Per-contract entry with `declaration`, `enforcement`, `consumption` sites | `scripts/audit-contract-triangles.py` parses | Yes |
| `methods-index.md` etc. | `@method`, `@field`, `@species` etc. ID conventions | `CONVENTIONS.md` | Yes — `scripts/lint-knowledge.py` |
| `commit-intent.txt` | Free-form list of file paths + `Topic:` / `Holder:` / `Created:` headers | project-side `scripts/declare-commit-intent.sh` | Yes — pre-commit Step -0.5 |
| `MANIFEST.md` | Markdown table | implicit | No |
| `TODO.md` | `### {ID}: {title}` sections + summary table at top | implicit; partly in `executor/src/todo-queue.ts` (parses `autopilot:`, `score:`, `kind:`) | Partial — `todo-queue.ts` and sweep parse |
| `ROADMAP.md` | Markdown areas → items with `Spec: incoming/...` references | implicit | No (regex grep in sweep) |
| `capabilities.yaml` | 9 pillars × dimensions × cascades schema | implicit (in the file itself) | No |
| `INDEX.md` (research) | Markdown title-scan registry | implicit | No |
| `REGISTRY.md` (research) | YAML-shaped streams with `status, conclusion, touches-subsystems, source, doc, open-questions` | inline in skill prompts (research.md, synthesize.md) | No |

The schema contract is **partly explicit, partly implicit, and partly enforced by audit scripts that themselves live in the project**. This is a structural problem for the platform-agnostic claim: a Datagrok plugin author cannot pick up Lattice without authoring the audit scripts that enforce the schemas.

## 4. Alternatives to markdown-on-disk

The project graph today is "markdown + YAML + JSON files in git." Below: the design space and what would change if Lattice picked a different substrate.

| Substrate | Pros | Cons | Harness changes required |
|---|---|---|---|
| **Markdown-on-disk (today)** | Human-readable; git-versioned; diff-friendly; no runtime dependency; easy for humans to author | Schemas are implicit; queries are linear scans; no transactions; cross-file references are by string convention; no native indexing | None |
| **SQLite (one project.db)** | Real schemas; real queries; single-file portability; transactional; no runtime daemon | Loses git diff-readability for the graph; need a migration path; harder for humans to read/edit; durable but opaque | New: `project.db` schema + migrations; CLI to dump-as-markdown for humans; replace audit scripts with SQL queries; rewrite `audit-knowledge-graph.py` etc. |
| **YAML/JSON structured files** | More machine-readable than markdown; schemas can be JSON Schema; still git-friendly | Loses prose narrative space; humans hate writing YAML; needs renderer to produce markdown for human consumption; partial today (cycle-state, capabilities.yaml, validation-baseline.json) | Moderate: pick which surfaces graduate from markdown to YAML — typed knowledge graph is the natural first candidate (already YAML-inside-markdown) |
| **GitHub Issues + Project boards** | Native human UI; threaded discussion; assignees; cross-references; cloud-managed | Cloud-coupled; rate-limited; GitHub-locked; harder to grep at scale; no native typed-fact schema; commit-trailer reconciler doesn't help | Major: rewrite reconciler against GH API; move TODO.md → issues; specs become PR-attached or wiki; can't run offline; fundamentally incompatible with `--reconcile` git-truth design |
| **Linear / Jira (cloud)** | Best-in-class human UX for backlog; SSO; integrations; native cycle/sprint primitives | Vendor lock-in; closed schemas; no typed-fact graph; expensive; bad for science domain | Major + lossy: Lattice's "git is truth" model becomes "Linear is truth," reconciler becomes cloud-API client |
| **Knowledge-graph database (Neo4j, Datomic)** | Real graph queries (cycles in `contradicts`, transitive `derives_from`); typed schema; mature query languages | Heavy infrastructure; daemon process; learning curve; slow ramp; massive overkill for current corpus size (~150 facts) | Major: typed-fact graph migrates; non-typed surfaces stay; new query layer; new daemon to deploy |
| **DuckDB + Parquet** | OLAP-grade queries; zero-daemon; embedded; works on parquet/CSV/JSON files; planned for vector-search upgrade per `README.md:122` | Newer ecosystem; learning curve; corpus must hit a scale where it pays off | Light: `query-knowledge.py` can use DuckDB on parquet exports of the typed graph; original markdown stays as authoring substrate |

**Recommendation against migrating today.** Markdown-on-disk has been calibrated for ~150 research files, ~80 cycle-state YAMLs, ~3700 TODO entries by a single maintainer (`README.md:118`). The corpus is below the threshold where markdown stops scaling. The planned upgrade — DuckDB+parquet for vector search past the threshold — is consistent with the harness staying file-substrate and gaining an analytical layer on top, not migrating the graph itself.

The real cost of markdown-on-disk is not capacity; it is **schema implicitness**. Section 5 below proposes a `lattice-project.toml` that makes the schemas explicit without changing the substrate.

## 5. The harness/project schema contract

This is the load-bearing section. The user's testable claim is *"the harness pillar contains ZERO DG-specific references."* That requires the harness to read the project graph **without knowing what's in it**. We define the contract explicitly here.

### 5.1 What the harness needs to ask

The harness's questions are stable. The answers vary per project. Below, the eight question shapes the harness asks today, with the SENDEX-specific path that today's Lattice happens to assume.

| Question (harness asks) | Today's SENDEX path | Where Lattice hard-codes it |
|---|---|---|
| List active topics | `.lattice/cycle-state/*.yaml` | executor/src/coherence.ts (clean — uses cwd-relative path) |
| Get current phase for topic X | `.lattice/cycle-state/{topic}.yaml` `phase` field | executor + skills (clean — schema is harness-pillar) |
| List TODO items eligible for autopilot | `docs/_internal/TODO.md` (then `TODO.md`, then `docs/TODO.md` fallback) `autopilot: ready` annotation | `executor/src/todo-queue.ts:33-37` (fallback chain, harness-pillar) |
| List archived specs | `docs/_internal/incoming/archive/*.md` | `executor/src/reconcile.ts:177` (HARDCODED — see §5.3 #1) |
| List typed facts at scope Y | `python scripts/query-knowledge.py --scope X --kind Y` | skills cite `query-knowledge.py` by name; the script itself is project-side per `README.md:120`. Lattice's CLAUDE.md rule 19 names `docs/_internal/knowledge/knowledge-graph.md` as the default home (harness-pillar names path; project must comply) |
| List research files matching topic Z | `docs/_internal/research/{topic}.md` + `docs/_internal/research/INDEX.md` | skills hard-code path (HARDCODED — see §5.3 #2) |
| List load-bearing knowledge files | `docs/_internal/knowledge/*.md` (methods-index, species-profiles, vehicle-profiles, etc.) | skills hard-code by filename (HARDCODED — see §5.3 #3) |
| Get algorithmic-paths regex | `.lattice/algorithm-paths.txt` (with default fallback) | `scripts/write-review-gate.sh:39-42` (project-overridable, harness-pillar with SENDEX defaults — see §5.3 #4) |

### 5.2 Schema obligations the project pillar takes on

For the harness to be project-agnostic, the project must satisfy these obligations:

| Obligation | What it means | Checked by |
|---|---|---|
| Provide TODO.md with sections of shape `### {ID}: {title}` | Skills can grep for IDs and parse status | sweep, autopilot |
| Provide TODO entries with `autopilot: <ready\|waiting-data\|deferred-dg\|needs-user>` annotation | Autopilot can route mechanical work | `executor/src/todo-queue.ts` |
| Provide `cycle-state/{topic}.yaml` with `phase`, `current_step`, `revision`, `checkpoints` keys | Executor can resume cycles | `executor/src/state-io.ts`, schema spec in `commands/lattice/research-cycle.md:43-80` |
| Provide commit trailers `Topic:`, `Phase:`, optionally `Coverage:`, `Layer:` on every topic-advancing commit | Reconciler can derive truth | `executor/src/reconcile.ts` |
| Provide a `query-knowledge.py` (or equivalent) that accepts `--scope`, `--kind`, `--domain` and returns typed facts or a no-fact-found stub | Algorithmic peer-review can satisfy mandatory citation | peer-review.md, architect.md, write-review-gate.sh |
| Provide an `algorithm-paths.txt` listing project-specific algorithmic source paths | Algorithm-defensibility gate fires on the right files | write-review-gate.sh |
| Provide a `validation-ratchet.sh` (or equivalent) that compares analytical scores against `.lattice/validation-baseline.json` | Validation ratchet works | `scripts/validation-ratchet.sh` (template in lattice; project carves) |
| Provide a system manifest at a known path (today: `docs/_internal/knowledge/system-manifest.md`) | Probe can build the adjacency graph | probe.md |
| Provide a `decisions.log` at `.lattice/decisions.log` (TSV format) | Reconciler, autopilot, distill can read prior outcomes | implicit |

The list mixes **harness-pillar obligations** (cycle-state schema, decisions.log shape, commit trailers, locks) with **project-side obligations** (knowledge file paths, query script availability, system manifest authoring). The harness-pillar obligations are uncontroversial; the project-side obligations are where today's coupling lives.

### 5.3 Where Lattice violates the contract today

Audited against the SENDEX layout, Lattice has **explicit hardcoded path assumptions** in skill files, scripts, and (less so) the executor. Each is a coupling defect against the platform-agnostic claim.

#### Defect 1: `executor/src/reconcile.ts:177` — `docs/_internal/incoming/archive` is hardcoded

```ts
const archiveDir = `${cwd}/docs/_internal/incoming/archive`;
```

This is the **only** structural path hardcode in the executor. A project that archives specs elsewhere (e.g., `archive/specs/` or `_archive/incoming/`) will silently get an empty archived-spec set from the reconciler.

#### Defect 2: research/knowledge paths in skill markdown

Across all 35 skill files (`commands/lattice/*.md` + `commands/ops/*.md`), the literal path `docs/_internal/` appears 32 files (per Grep audit). The most load-bearing references:

- `commands/lattice/research.md:32` — research output goes to `docs/_internal/research/{topic}.md`
- `commands/lattice/synthesize.md:181` — synthesis output goes to `docs/_internal/incoming/{topic}-synthesis.md`
- `commands/lattice/peer-review.md:407-409` — peer-review output goes to `docs/_internal/research/peer-reviews/{topic}-review.md`
- `commands/lattice/distill.md:33-49` — corpus load reads `docs/_internal/research/REGISTRY.md`, `docs/_internal/knowledge/system-manifest.md`, `docs/_internal/knowledge/scoring-engine-model.md`, `docs/_internal/incoming/*-synthesis.md`, etc.
- `commands/lattice/architect.md:26` — `docs/_internal/knowledge/code-quality-guardrails.md`

These paths are **not a domain coupling** — `docs/_internal/` is a defensible default — but they are a SENDEX-coupling because no project pillar declaration tells the harness *where* to look in a project that has reorganized.

#### Defect 3: SENDEX-specific filenames in skill citations

Beyond `docs/_internal/`, skills name specific knowledge files that are SENDEX-domain:

- `methods-index.md`, `species-profiles.md`, `vehicle-profiles.md` — cited in synthesize, peer-review, distill, architect, review, blueprint-cycle, build-cycle, research-cycle, science-flag-resolution include
- `system-manifest.md` — cited in probe, distill, ops:bug-stress
- `code-quality-guardrails.md` — cited in synthesize Step 2, architect Step 2, blueprint-cycle Step 0, spike

A Datagrok plugin domain has no `species-profiles.md`. A finance-tech plugin has no `vehicle-profiles.md`. The skill prompt is asking a question the project may not have set up to answer.

#### Defect 4: SENDEX-specific algorithm-paths defaults

`scripts/write-review-gate.sh:121` hardcodes the default trigger paths when `.lattice/algorithm-paths.txt` is absent:

```sh
ALGO_REGEX='derive-summaries\.ts|endpoint-confidence\.ts|findings-rail-engine\.ts|cross-domain-syndromes\.ts|syndrome-rules\.ts|backend/services/analysis/.*\.py'
```

These are SENDEX file names. A Datagrok plugin's algorithmic code is not in `derive-summaries.ts`. The fallback should be **fail-empty** (no default; if `algorithm-paths.txt` absent, the gate is informational only), not **fail-SENDEX**.

The same defect exists at `scripts/write-review-gate.sh:135-137`:

```sh
echo "    1. Run the algorithm against PointCross + 1 other study using generated JSON."
echo "    2. Record the actual output (NOAEL/LOAEL/score/classification)."
echo "    3. Answer: would a regulatory toxicologist agree?"
```

The error-message text references SENDEX studies (PointCross), SENDEX domain terms (NOAEL/LOAEL), and SENDEX professional context (regulatory toxicologist). Even if a project replaces the regex, the user-facing error is still SENDEX-shaped.

#### Defect 5: SENDEX-specific module names in cycle classification

`workflows/cycle.yaml:148-149` (and the mirror prompt in `commands/lattice/cycle.md:71`) names SENDEX-specific module names as the trigger for full-cycle ceremony:

```yaml
- Touches engine/pipeline modules (classification.py, findings_pipeline.py,
  statistics.py, scores_and_rules.py, syndrome rules, cross-domain syndromes)
```

A Datagrok plugin's "engine" is not in `classification.py`. The classification heuristic — "does this work touch the analytical engine" — is reasonable, but the *names* of the engine modules are project-specific.

#### Defect 6: SENDEX-specific paths in audit scripts

`scripts/audit-corpus-citations.py:97` hardcodes a list of "name-like" tokens that includes "PointCross", "Nimble", "Sendex", "SENDEX". `scripts/audit-peer-review-citations.py:66` likewise. `scripts/discovery-scan.py:62-72` is **explicitly self-declared a template** with project-specific paths and instructions to fork.

#### Defect 7: SENDEX-specific empirical-claim wording

`commands/lattice/implement.md:97-104` shows the expected format for empirical claim verification:

```
Criterion: "brown dot count ≤ 2 on PointCross BW D15 main mode"
Observed: 0 dots (python script run 2026-04-07; verified against
  backend/generated/PointCross/unified_findings.json — 27/29 BW findings ...
```

The shape (cite the data, quote the actual value) is harness-pillar. The example uses SENDEX studies and JSON paths. A naive port of this skill to Datagrok would carry forward the SENDEX exemplar.

#### Defect 8: hardcoded venv path

`commands/lattice/lint-knowledge.md:21,57-60` hardcodes `C:/pg/pcc/backend/venv/Scripts/python.exe`. This is the most concrete SENDEX-coupling defect — it is not a path *convention*, it is a hardcoded *absolute path* on Larisa's machine. Any project running this skill outside `C:/pg/pcc/` will fail.

#### Summary of coupling defects

| Defect | Severity | Fix difficulty |
|---|---|---|
| 1. `reconcile.ts:177` archive path | Low (single-line, good fallback semantics needed) | Low |
| 2. `docs/_internal/` paths in skills | Medium (32 skills) | Medium — needs a project-config indirection |
| 3. SENDEX-specific knowledge filenames in skills | Medium (paths assume `species-profiles.md` etc. exist) | Medium — needs domain-knowledge-map.md per project, plus skill prompts to read it |
| 4. SENDEX-specific algorithm-paths defaults | Medium (fail-SENDEX rather than fail-empty) | Low |
| 5. SENDEX-specific module names in cycle classification | Low (heuristic prompt; a Datagrok project would re-author) | Low |
| 6. SENDEX-specific names in audit scripts | Low (already template-flagged) | Low |
| 7. SENDEX-specific empirical-claim exemplar | Low (illustrative; doesn't break correctness) | Low |
| 8. Hardcoded `C:/pg/pcc/backend/venv/...` venv path | High (hard breakage) | Trivial |

## 6. Recommendation

The minimum viable schema-contract proposal is a **`lattice-project.toml`** at the project root that declares where each project-graph component lives. Today these are scattered across hardcoded paths in skills, scripts, and the executor. A single declaration file collapses the coupling defects from §5.3 to a single audit surface.

### 6.1 Sketch

```toml
# lattice-project.toml — project-side declaration of where each project-graph
# component lives. Read by the executor at session start; surfaced to skills
# via env vars (LATTICE_KNOWLEDGE_DIR, LATTICE_RESEARCH_DIR, etc.) so skill
# prompts can use {{lattice.knowledge_dir}} instead of hardcoded paths.

[project]
name = "sendex"
domain = "preclinical-toxicology"  # informational; used by daily-update theme grouping
internal_docs = "docs/_internal"   # root for all _internal artifacts

[backlog]
todo = "docs/_internal/TODO.md"
roadmap = "docs/_internal/ROADMAP.md"
manifest = "docs/_internal/MANIFEST.md"
capabilities = "docs/_internal/capabilities.yaml"
bug_sweep = "docs/_internal/BUG-SWEEP.md"

[research]
root = "docs/_internal/research"
index = "docs/_internal/research/INDEX.md"
registry = "docs/_internal/research/REGISTRY.md"
peer_reviews = "docs/_internal/research/peer-reviews"
distillations = "docs/_internal/research/distillations"
literature = "docs/_internal/research/literature"
literature_pdf_triage = "docs/_internal/research/literature/PDF-TRIAGE.md"

[specs]
incoming = "docs/_internal/incoming"
archive = "docs/_internal/incoming/archive"

[knowledge]
typed_graph = "docs/_internal/knowledge/knowledge-graph.md"
system_manifest = "docs/_internal/knowledge/system-manifest.md"
contract_triangles = "docs/_internal/knowledge/contract-triangles.md"
field_contracts = "docs/_internal/knowledge/field-contracts.md"
field_contracts_index = "docs/_internal/knowledge/field-contracts-index.md"
methods_index = "docs/_internal/knowledge/methods-index.md"
guardrails = "docs/_internal/knowledge/code-quality-guardrails.md"
conventions = "docs/_internal/knowledge/CONVENTIONS.md"

# Per-domain registries — optional, project-defined. Lattice does not
# require any specific registry here; `domain_knowledge_map` resolves the
# rest. SENDEX has species-profiles, vehicle-profiles; a Datagrok plugin
# project might instead have api-namespaces, viewer-types, semtype-registry.
[knowledge.registries]
species = "docs/_internal/knowledge/species-profiles.md"
vehicle = "docs/_internal/knowledge/vehicle-profiles.md"

[knowledge.domain_map]
# Where domain_knowledge_map.md lives — read at every skill invocation per
# the always-loaded rule files convention.
file = ".claude/rules/domain-knowledge-map.md"

[knowledge.query]
# The script the harness invokes to query the typed knowledge graph.
# Per CLAUDE.md rule 19, peer-review/architect MUST invoke this for
# every algorithmic claim. Project-side script.
command = "python scripts/query-knowledge.py"
no_fact_stub = "NO FACT FOUND in domain-truth oracle"  # the literal stub the script emits when no fact matches scope

[validation]
# Reference cards for assertion-walks (per CLAUDE.md rule 19 algorithm-defensibility).
references_dir = "docs/validation/references"
# Generated study output the assertion-walks load. {study} is templated.
generated_studies = "backend/generated/{study}/unified_findings.json"
# Project's representative validation studies for the algorithm-defensibility gate.
canonical_studies = ["PointCross", "Nimble"]
# Project-side ratchet script (lattice ships a template; project carves)
ratchet_script = "scripts/validation-ratchet.sh"
baseline = ".lattice/validation-baseline.json"

[algorithm]
# Per CLAUDE.md rule 19. Files matching this list trigger the
# algorithm-defensibility gate.
paths_file = ".lattice/algorithm-paths.txt"
# If absent, Lattice today falls back to SENDEX defaults
# (derive-summaries.ts, endpoint-confidence.ts, ...). Set defaults_mode =
# "empty" to make the fallback fail-empty (advisory only) — recommended for
# new projects until they author algorithm-paths.txt.
defaults_mode = "empty"   # or "sendex" for back-compat

[design]
# Always-loaded rule files. Skills re-read these at every invocation.
decisions = ".claude/rules/design-decisions.md"
ui_gate = ".claude/rules/frontend-ui-gate.md"
audit_validate = ".claude/rules/ux-audit-validate.md"
audit_checklist = "docs/_internal/design-system/audit-checklist.md"
patterns_dir = "docs/_internal/design-system"

[checklists]
spec_value_audit = "docs/_internal/checklists/SPEC-VALUE-AUDIT.md"
commit_checklist = "docs/_internal/checklists/COMMIT-CHECKLIST.md"
post_impl_review = "docs/_internal/checklists/POST-IMPLEMENTATION-REVIEW.md"

[cycle]
# Where cycle state and locks live. Default values shown.
state_dir = ".lattice/cycle-state"
lock_dir = ".lattice/cycle-lock"
decisions_log = ".lattice/decisions.log"
review_gate = ".lattice/review-gate.json"
review_output_side_channel = ".lattice/last-review-output.md"
context_telemetry = ".lattice/context-telemetry.jsonl"

[runtime]
# Project's Python interpreter. Replaces the hardcoded
# C:/pg/pcc/backend/venv/Scripts/python.exe in lint-knowledge.md.
python = "backend/venv/Scripts/python.exe"
# Project's frontend build command. Used by ops:check.
frontend_build = "cd frontend && npm run build"
frontend_test = "cd frontend && npm test"
# Visual smoke test target.
dev_server_url = "http://localhost:5173"

[indices]
# Optional: indices Lattice should compute and cache. Phase-2 vector
# search lives here. Today: empty.
typed_graph_cache = ".lattice/cache/typed-graph.duckdb"
research_index_cache = ".lattice/cache/research-titles.json"

[hooks]
# Project-side hook scripts the framework invokes.
declare_commit_intent = "scripts/declare-commit-intent.sh"
extract_learnings_trigger_regex = '(^|\/)docs\/_internal\/incoming\/[^/]+\.md$'

[trailers]
# Commit trailer keys the reconciler greps. Set to empty array to disable.
required = ["Topic:"]
recommended = ["Phase:", "Coverage:", "Layer:"]
```

### 6.2 What changes in the harness with this contract

**The TOML closes 4 of the 8 coupling defects from §5.3** (per F-2 in the R1 peer review — the original framing implied the TOML closed all 8, which is incorrect). The split:

#### TOML-addressable defects (closed by path indirection alone)

| Defect | What changes |
|---|---|
| **Defect 1** (`reconcile.ts:177` archive path) | `executor/src/reconcile.ts` reads `lattice-project.toml` `[specs] archive` rather than hardcoding `docs/_internal/incoming/archive`. |
| **Defect 2** (`docs/_internal/` paths in skills) | Skill prompts replace literal `docs/_internal/research/` etc. with `{{lattice.research.root}}/` template references; the executor substitutes from the TOML at skill invocation time. |
| **Defect 4** (SENDEX-specific algorithm-paths defaults) | `scripts/write-review-gate.sh` reads `[algorithm] defaults_mode` and refuses to fall back to SENDEX defaults when set to `empty`. |
| **Defect 8** (hardcoded `C:/pg/pcc/backend/venv/...` venv path) | `scripts/lint-knowledge.py` invocation uses `[runtime] python` instead of the hardcoded path. |

#### Defects requiring per-skill re-authoring (TOML cannot close)

| Defect | Why TOML is insufficient | What's actually required |
|---|---|---|
| **Defect 3** (SENDEX-specific knowledge filenames in skill prose — `species-profiles.md`, `vehicle-profiles.md`, etc.) | Skill prompts say *"read `species-profiles.md`"* by name in their prose. Path substitution operates on `{{lattice.knowledge.registries.species_profiles}}` but the skill body would need to be rewritten to either (a) iterate `{{lattice.knowledge.registries.*}}`, or (b) consult `domain-knowledge-map.md` dynamically and read whatever the project declares. | Re-author each affected skill (synthesize, peer-review, distill, architect, review, blueprint-cycle, build-cycle, research-cycle, science-flag-resolution include, lit-triage) so that the registries are referenced via the `[knowledge.registries]` namespace and the skill consults `domain-knowledge-map.md` at runtime. |
| **Defect 5** (SENDEX-specific module names in `cycle.yaml` classification prompt) | The prompt names `classification.py`, `findings_pipeline.py`, etc. as the trigger for full-cycle ceremony. TOML cannot rewrite a prose prompt. | Re-author the classification prompt to consume `[platform.engine_modules]` from `lattice-platform.toml` (or `[project.engine_modules]` from `lattice-project.toml`) instead of literal SENDEX names. |
| **Defect 6** (SENDEX-specific names in `audit-corpus-citations.py`, `audit-peer-review-citations.py`, `discovery-scan.py`) | These scripts are project-side per the framework's design (per `05-lattice-extraction.md` §5). They live in the consumer project's `scripts/` and ship from `scaffold/scripts/` as templates. | No TOML migration; ensure the templates in `scaffold/scripts/` are SENDEX-token-free (the discovery-scan template already self-declares this; the audit-citation scripts need the same treatment). |
| **Defect 7** (SENDEX-specific empirical-claim exemplar in `implement.md` Phase 1.D) | The exemplar wording quotes `unified_findings.json` paths and "PointCross BW" prose. Substitution can replace the JSON path but not the prose. | Re-author the exemplar to use `{{lattice.examples.empirical_claim}}` (project-side example block) or a generic placeholder. |

The non-TOML defects (3, 5, 6, 7) all require **per-skill prompt re-authoring**, not configuration. They are concentrated in the 17 path+domain-term skills already classified in `05-lattice-extraction.md` §2.3 — the re-authoring work is bounded by that count.

#### The "domain-knowledge-map.md" indirection

The `[knowledge.domain_map]` field names a project-side markdown file that enumerates all domain-specific knowledge artifacts. Skills consult this map dynamically rather than naming files directly. SENDEX has `species-profiles.md`, `vehicle-profiles.md`; a Datagrok plugin might list `api-namespaces.md`, `viewer-types.md`. The map is the indirection layer that lets a skill say "for the load-bearing knowledge file relevant to this work, consult domain-knowledge-map.md and follow the link" without hardcoding any specific filename. **This is the structural fix for Defect 3.** The TOML names *where* the map lives; the map itself is project-authored.

The remaining harness changes (independent of the defect split):

7. `executor/src/todo-queue.ts` reads `[backlog] todo` rather than its current 3-path fallback list.

### 6.3 What does NOT change

- The skills remain markdown prompts. Substitution happens at invocation time, not authoring time.
- The executor doesn't need a new state machine; the TOML is read once at session start and surfaced via env vars.
- Existing SENDEX paths can be back-compat defaults for one release cycle. Migration is a single TOML file.
- The typed knowledge graph schema, cycle-state YAML schema, decisions.log shape, lock format, review-gate format — all stay as-is. They are harness-pillar already.

### 6.4 Why TOML, not YAML/JSON

Three of the existing project-graph components are TOML-adjacent (no comments, simple key-value, less syntax weight than YAML). The harness already has YAML for cycle-state and JSON for review-gate; adding a third format for a config file is a tradeoff against using TOML's better config-file ergonomics (commentable, no significant whitespace pitfalls, native to Python's `tomllib`, easy to diff). YAML is an acceptable alternative. JSON is the worst choice — no comments, surprising parse errors. The choice does not affect the harness/project boundary discussion.

## 7. Open questions for thread discussion

1. **Should the contract be opt-in or required?** Today's Lattice "works" because SENDEX happens to match the assumptions. Making `lattice-project.toml` *required* breaks SENDEX until it ships the file. Making it *optional with SENDEX defaults* preserves back-compat but doesn't move the platform-agnostic claim forward. Strawman: required-with-shipped-template (project copies `scaffold/lattice-project.toml` during `sync-skills.sh`); SENDEX's own template is the back-compat default for SENDEX.

2. **How does the harness behave when the contract names a path that doesn't exist?** Today's behavior (e.g., `executor/src/todo-queue.ts:findTodoFile` returns `null` when no candidate path matches) is mostly fail-soft. Should the harness fail-loud when `[backlog] todo` is named but missing? Strawman: fail-loud at startup (`lattice status` prints "Configured TODO at X but file is absent"); skills that READ from the missing path treat absence as empty rather than crashing.

3. **What's the right granularity for `[knowledge.registries]`?** SENDEX has 6 registries (methods, fields, species, vehicle, contract-triangles, dependencies). A Datagrok plugin might have a different 6 (api-namespaces, semtypes, viewer-types, package-roles, ...). Should the contract enumerate them as named keys, or accept a free-form dict? The named-keys approach forces the platform-agnostic question upfront; the free-form dict defers it.

4. **Where does the `query-knowledge.py` interface contract live?** `[knowledge.query.command]` names the script, but the harness needs to know the script accepts `--scope`, `--kind`, `--domain` and emits a specific stub on no-match. That contract lives implicitly in skill prompts today. Should it be a TOML schema with a JSON Schema reference (`[knowledge.query] schema = ".lattice/query-knowledge-schema.json"`) or a versioned interface declaration?

5. **Migration order**: `executor/src/reconcile.ts` archive path is the lowest-risk first migration. Skill prompts (32 files) are the highest-volume migration. Audit scripts (`audit-corpus-citations.py`, `audit-peer-review-citations.py`) are project-side per the framework's own design and arguably should not migrate at all (they belong in the consumer project, with template versions in `scaffold/scripts/`). The path is: TOML loader → executor migrations → script-template migrations → skill-prompt migrations. Where should the work begin?

## Sources

- `C:/pg/lattice/README.md` — taxonomy, knowledge-layer table, three-layer model
- `C:/pg/lattice/CLAUDE.md` — rule 19 (typed knowledge graph), rule 18 (contract triangles), Where Rules Live table
- `C:/pg/lattice/docs/datagrok-harness-workplan.md` — Path B workplan, donation table
- `C:/pg/lattice/docs/harness-for-datagrok.md` — three-layer separation
- `C:/pg/lattice/scaffold/.lattice/README.md` — decisions.log schema, cycle-state schema
- `C:/pg/lattice/executor/src/reconcile.ts` — archive path hardcode (line 177)
- `C:/pg/lattice/executor/src/todo-queue.ts` — TODO.md candidate-path fallback
- `C:/pg/lattice/executor/src/coherence.ts` — pcc reference comment (line 583)
- `C:/pg/lattice/scripts/write-review-gate.sh` — algorithm-paths defaults, attestation schema
- `C:/pg/pcc/.lattice/` — empirical inventory (cycle-state files, decisions.log, lock dirs)
- `C:/pg/pcc/docs/_internal/` — empirical inventory (TODO, ROADMAP, MANIFEST, knowledge, research, incoming)
- `C:/pg/pcc/CLAUDE.md` — Where Rules Live table (live SENDEX state of project graph)
