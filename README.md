# Lattice

> A harness for LLM-assisted software development.

Lattice is a set of skills, sub-agents, workflow definitions, hooks, durable state files, and audits that constrain LLM behavior during multi-week development work. It runs inside Claude Code today; workflow definitions are platform-neutral YAML executed by a small TypeScript engine in `executor/`.

The harness addresses a class of LLM failure modes that prose-only instructions don't catch: self-review with contaminated context, context-window degradation, cross-session memory loss, rule-drift under task pressure, scope creep, runaway loops, fabrication, concurrency conflicts, and substitution of checkable proxies for the actual question. Each section below names a failure mode, the mechanism Lattice uses, and the artifact that implements it.

This README covers:
1. what the harness contains
1. what each part does, and
1. how to map the pattern onto another platform. The worked translation example is Datagrok plugin development, using artifacts already present in the public Datagrok repo.

---

## Scope

**In scope today:** greenfield development of scientific apps. Built and exercised over four months on a single project. Lattice's process spine could be adapted for or merged into other projects.

**Out of scope today:** Lattice is not a Datagrok plugin SDK. It does not extend deployed Datagrok instances, port existing apps into Datagrok packages, or work against the Datagrok JS API as a first-class consumer.

**Framework vs project.** The framework owns process-level artifacts (skills, agent definitions, workflow DAGs, the executor, hooks, locks, the verdict-enum registry, the review-gate format). The project owns its domain knowledge (typed fact graph, design decision tables, component reuse maps, the script that queries the typed graph). The framework enforces requirements *about* project artifacts (e.g., "algorithmic peer-review must invoke a query against the typed graph and cite the result, or re-launch") without supplying the artifacts themselves.

---

## What "the harness" contains

| Piece | Purpose | Where |
|---|---|---|
| **Skills** | Markdown prompt files. One per task type (synthesize, implement, review, etc.). Define how the model performs one operation. | `commands/lattice/*.md`, `commands/ops/*.md` |
| **Sub-agents** | Independently spawned model instances with their own context window. Used wherever the orchestrator's reasoning would contaminate the answer. Four registered: peer-review, architect-reviewer, decision-auditor, post-impl-reviewer. | `agents/*.md`; spawned via `context: fresh` on a workflow skill node |
| **Workflows** | YAML DAGs defining what runs when. Reference skills by name; executor resolves topological order and dispatches. Five node types: `bash`, `skill`, `gate`, `approval`, `parallel`. | `workflows/*.yaml`, schema in `workflows/schema.md` |
| **Verdict-enum registry** | Authoritative declared verdict set per gate-producing node. Workflow loader rejects gates that test a verdict literal not in the producer's enum at validate time — typo enforcement before any node runs. | `workflows/verdict-enums.yaml`, loaded by `executor/src/loader.ts` |
| **Hooks** | Pre/post-commit and Claude Code PreToolUse / PostToolUse scripts. Block defective actions mechanically. | `hooks/pre-commit`, `hooks/post-commit`, `hooks/claude-hooks.json` |
| **Durable state** | Append-only `.lattice/decisions.log`, per-topic `.lattice/cycle-state/{topic}.yaml`, lock files (`.lattice/commit.lock/`, `.lattice/cycle-lock/{topic}/`), telemetry (`.lattice/context-telemetry.jsonl`). All state writes go through `atomicWriteFileSync` (temp+rename). | `executor/src/state-io.ts` |
| **Reconciler** | Greps git log for `Topic:` trailers, derives topic state truth, corrects state-file drift. | `executor/src/reconcile.ts`, surfaced via `lattice status` (read-only by default; `--reconcile` to mutate) |
| **Coherence engine** | Portfolio-level conflict detection across topics: subsystem overlap, stale blueprint, prerequisite violation, science-flag propagation, cascades. Some conflict types auto-resolve via targeted distill analysis. | `executor/src/coherence.ts`, `executor/src/auto-resolve.ts` |
| **Audits** | Periodic scans for silent drift not visible at commit time (citation drift, dead code, knowledge-graph contradictions, contract straggler enums). | `scripts/audit-*.py` |
| **Knowledge artifacts** | Project-authored typed facts, registries, design tables. Live in the consumer project, not the framework. | (consumer-side, e.g., `docs/_internal/knowledge/`) |

---

## The spine

The pieces above stack into a layered runtime. Each layer has a conventional analogue on the right — read it as "if you already know X, this layer behaves like X."

```
┌──────────────────────────────────────────────────────────────────┐
│  User invocation                                                  │
│    /lattice:cycle <topic>          ~ kicking off a job             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│  Orchestration                                                    │
│    workflows/*.yaml                ~ schema + queries (DAGs)      │
│    verdict-enums.yaml              ~ typed enum columns           │
└────────────────────────────┬─────────────────────────────────────┘
                             │ loaded + executed by
┌────────────────────────────▼─────────────────────────────────────┐
│  Executor (TypeScript)                                            │
│    topological dispatch            ~ a query planner              │
│    revision-checked writes         ~ optimistic concurrency       │
│    per-call telemetry, loop cap    ~ rate-limit + circuit-breaker │
│    cost / budget                   ~ billing meter                │
└──┬───────────────────────────────────────────┬───────────────────┘
   │ launches                                   │ dispatches
   ▼                                            ▼
┌──────────────────────────┐    ┌─────────────────────────────────┐
│  Skills (.md)            │    │  Sub-agents (.md, fresh context) │
│   ~ stored procedures    │    │   ~ isolated worker / sidecar    │
│   (run in main context)  │    │   (separate context window)      │
└────────────┬─────────────┘    └─────────────────┬───────────────┘
             │                                    │
             └────────────────┬───────────────────┘
                              │ reads / writes
┌─────────────────────────────▼────────────────────────────────────┐
│  Durable state                                                    │
│    .lattice/decisions.log          ~ append-only event log (WAL)  │
│    .lattice/cycle-state/*.yaml     ~ session / checkpoint state   │
│    .lattice/review-gate.json       ~ single-use auth token        │
│    .lattice/*.lock/                ~ advisory locks               │
│    .lattice/context-telemetry.jsonl ~ metrics stream              │
│  · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · │
│  consumer-side, read-only at runtime:                              │
│    knowledge-graph.md (typed YAML)  ~ typed registry / lookup     │
│    untyped registries + design     ~ reference data / config      │
│    research/*.md                    ~ document corpus             │
└─────────────────────────────┬────────────────────────────────────┘
                              │ consulted by
┌─────────────────────────────▼────────────────────────────────────┐
│  Hooks (mechanical gates)                                         │
│    git pre-commit                  ~ constraint check on COMMIT   │
│    git post-commit                 ~ AFTER INSERT trigger         │
│    Claude Code PreToolUse          ~ row-level security check     │
│    Claude Code PostToolUse         ~ AFTER UPDATE trigger         │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│  Git (truth)                                                      │
│    commit + Topic: trailer         ~ COMMIT TRANSACTION           │
│    reconciler greps `git log`      ~ rebuild index from log       │
└──────────────────────────────────────────────────────────────────┘
```

Two reading rules:
- **Direction matters.** The arrows are top-down at runtime (a cycle invocation flows down to git), but truth flows back up: the reconciler reads `git log` and corrects state-file drift on the way up. Anything below the executor is rebuildable from git; anything above it is configuration.
- **Hooks gate the boundary.** The hooks layer is the only place where mechanical *blocking* happens. Everything above hooks is recoverable; once a commit lands, it's part of git, and the only way to unwind is another commit.

### Knowledge layer

The "consumer-side, read-only at runtime" rows in the durable-state box cover four distinct shapes. They share a topological role (project files read by skills/agents during work, never written back during a cycle) but differ in access pattern and scaling story.

| Shape | Where | Access pattern | Scaling today |
|---|---|---|---|
| **Typed knowledge graph** | `knowledge-graph.md` — atomic YAML facts with `value`, `confidence`, `scope`, `derives_from`, `contradicts` | `query-knowledge.py --scope X --kind Y` (exact match); `audit-knowledge-graph.py` checks for contradictions across `contradicts` edges | Linear scan of YAML. Free-text and embedding queries deferred. |
| **Untyped registries** | `methods-index.md`, `species-profiles.md`, `vehicle-profiles.md`, `contract-triangles.md` | Loaded in-prompt when `domain-knowledge-map.md` routes a topic to them. Cite typed facts by ID rather than restate values (rule 19 / 22). | Title routing; no index. |
| **Design decision tables** | `.claude/rules/design-decisions.md`, `frontend-ui-gate.md`, `domain-knowledge-map.md` | Loaded automatically every Claude Code session. | Always-loaded; bounded by file size. |
| **Research corpus** | `research/*.md` + `research/INDEX.md` | Selected by title scan against `INDEX.md` during corpus loads. | Calibrated for ~150 files / single maintainer. Vector search (DuckDB + Voyage AI or equivalent) is the planned upgrade past the threshold; deferred today. |

The framework owns the *enforcement* — algorithmic peer-review must invoke `query-knowledge.py` and cite returned facts (or re-launch); `--novel` mode requires VERIFIED / BLOCKED / NOT-FOUND on every novel source. The framework does not own the artifacts. They live in the consumer project, scoped to the consumer's domain.

**What scales today:** typed-graph exact-match queries, in-prompt loading of always-on rule files, title-based research selection. **What does not yet scale:** semantic queries against the typed graph, embedding-based corpus search. Both are planned upgrades held until empirical pressure (corpus past ~150 files, query patterns the exact-match interface can't serve) — the title-scan and exact-match approaches were chosen as floors, not ceilings.

---

## Failure modes and mechanisms

### 1. Self-review

The decisions and rationale a model just produced sit in its own context window. Asking the same context to review the artifact produces approval near-uniformly regardless of artifact quality.

**Mechanism:**
- Four sub-agents launched with `context: fresh` on a workflow skill node receive a fresh context window with no prior session state. Agent definitions in `agents/*.md` declare "no project context" / "no implementation rationale" — the agent receives only the artifact path and a brief prompt.
- The build-cycle review step (`workflows/build-cycle.yaml:103-119`) launches three agents in parallel (architect-reviewer, decision-auditor, post-impl-reviewer) and aggregates their verdicts.
- Verdicts persist as `attestations[]` in `.lattice/review-gate.json`. Each entry must have `kind`, `ref`, `verdict`, and a `rationale` ≥10 chars. Trivial values (`n/a`, `tbd`, `idk`, etc.) and duplicate `(kind, ref)` pairs are rejected by `scripts/write-review-gate.sh` — the gate cannot be hollowed out by a perfunctory rationale.
- The full review skill writes its 7 mandatory sections (CHANGES, ARCHITECT REVIEW, DECISION AUDIT, REQUIREMENT TRACE, MECHANICAL CHECKS, DOCS UPDATE, VERDICT) to a side-channel file (`.lattice/last-review-output.md`). `scripts/write-review-gate.sh` greps for the seven `^## NAME` anchors; missing any → non-zero exit. Trivial-commit escape hatch (`bash scripts/write-review-gate.sh pass "..."`) skips the anchor check.
- The workflow loader runs validate-time checks on every YAML before any node executes: gate conditions that test a verdict literal not in the producer's `verdict_enum` are rejected (`workflows/verdict-enums.yaml`); approval options without a `route` field are rejected; nodes with `max_iterations` not a positive integer are rejected; orphan nodes are warned. Typo enforcement and structural validation before runtime, not at runtime.

### 2. Context-window degradation

Sustained sessions accumulate tokens (prior steps, peer-review rounds, intermediate outputs). Retrieval fidelity degrades and the model contradicts earlier decisions well before the model's declared context window is exhausted.

**Mechanism:**
- Every skill node in a cycle YAML writes a deterministic state file at `state_key`. State carries `phase` (e.g., `research`, `research-complete`, `blueprint`, `blueprint-complete`, `build`, `complete`), `current_step`, captured outputs, and a monotonic `revision` counter. State writes use `atomicWriteFileSync` (`executor/src/state-io.ts:36-45`) — temp+rename, so concurrent readers never see partial state.
- Within a cycle, phases run sequentially. Between cycles (`workflows/cycle.yaml:85-108`), the dispatcher routes by reading the `phase` field from the state file: `research-complete` → dispatch-blueprint, `blueprint-complete` → dispatch-build. Manual invocation requires explicit re-invocation; autopilot auto-chains. Either way, the next phase reads the prior phase's state file rather than its conversation.
- `executor/src/budget.ts:196-256` records per-skill-call telemetry to `.lattice/context-telemetry.jsonl`. `checkContextUtilization` emits `warn` (default 0.6 of declared context window) and `block` (default 0.8) alerts. CLI: `lattice context [--last N]`.

### 3. Cross-session memory loss

A new session starts cold. Without external memory, the model retries failed approaches, re-litigates settled decisions, and rediscovers known constraints.

**Mechanism, in order of authoritativeness:**
- `Topic:` trailers on every commit. `executor/src/reconcile.ts` greps git log (default lookback 90 days, `LATTICE_RECONCILE_LOOKBACK_DAYS`) and derives topic state from the trailers. Truth lives in git.
- Append-only `.lattice/decisions.log` records every skill outcome with timestamp.
- Per-topic `.lattice/cycle-state/{topic}.yaml` stores checkpoints, key decisions, costs, subsystems touched.
- Project-side typed knowledge files (e.g., `knowledge-graph.md`) hold atomic, contradictable facts.

`lattice status` and `lattice coherence` are read-only by default; `--reconcile` opts into state-file mutation.

### 4. Rule-drift under task pressure

Given many process rules, the model honors a subset reliably and forgets the rest under task pressure ("just fix the bug").

**Mechanism:** rules that have shipped a defect are wired to a hook. The pre-commit hook runs five blocking steps and three advisory steps:

| Step | Behavior | Source |
|---|---|---|
| -1: Commit lock acquisition | BLOCKS — atomic mkdir lock with poll/30s/10min timeout. Honors `LATTICE_LOCK_HOLDER` env for outer-held locks (autopilot, `/lattice:review`). Releases on EXIT trap. | `hooks/pre-commit:27-87` |
| 0a: Shared-state merge | ADVISORY — runs `scripts/merge-shared-state.sh` to refresh shared files (TODO.md, REGISTRY.md, decisions.log, ROADMAP.md, MANIFEST.md) from HEAD before this commit, preventing concurrent agents from overwriting each other's just-committed appends. Soft-fails if script absent. | `hooks/pre-commit` Step 0a |
| 0: Review gate check | BLOCKS — `.lattice/review-gate.json` must exist and be ≤30 min old. Surfaces attestations. Consumed (deleted) after success — single-use. | `hooks/pre-commit:89-146` |
| 1: Executor TypeScript build | BLOCKS if `executor/` files staged and `tsc --noEmit` fails. | `hooks/pre-commit:148-168` |
| 2: Index freshness | ADVISORY — TODO.md / README / WORKFLOW etc. not updated. | `hooks/pre-commit:170-199` |
| 2.5: Bug-retro check | BLOCKS `fix:` commits without 5-question retrospective in BUG-SWEEP.md (Root cause / Genesis / Detection gap / Prevention class / Lattice change). | `hooks/pre-commit:201-273` |
| 3: Complexity advisories | ADVISORY — file size warnings. | `hooks/pre-commit:275-305` |
| 4: Staging-drift check | BLOCKS if files were added to the index DURING the hook run — catches concurrent autopilot interleaving. | `hooks/pre-commit:307-336` |

Claude Code hooks (PreToolUse on `Bash(git commit*)`, PostToolUse on `Write|Edit`) add: commit-lock check (BLOCKS, manual recovery only post-2026-05-04 audit), pipeline test-first (BLOCKS), validation-ratchet check (BLOCKS), co-author block (BLOCKS), engine-change marker (sets `.lattice/engine-changed` consumed by pre-commit). Source: `hooks/claude-hooks.json`.

### 5. Scope creep

The model defaults toward more capable rather than more minimal. A spec for one capability expands into multiple panes, toggles, and override surfaces during implementation.

**Mechanism:**
- Architect-reviewer agent (`agents/architect-reviewer.md`) has dual mandate: kill accidental complexity AND protect essential complexity. Per-pattern tables in the agent definition name the canonical accidental patterns (1-consumer abstraction, config for fixed behavior, premature generalization, etc.) and the canonical essential patterns (multi-branch classification, threshold cascades, statistical method selection, species-specific branching).
- Architect verdicts: `[PASS, SIMPLIFY, REJECT, SCIENCE-FLAG]` (`workflows/verdict-enums.yaml:24-26`). Workflow gates route on these literals; the loader rejects typos.
- SIMPLIFY findings tagged `Risk: None` (dead code, unused exports) auto-apply without user rubber-stamp; non-trivial routes to user.
- Spec value audit (project-side checklist; framework-side enforcement at `commands/lattice/architect.md` Step 1.4 spec lint) requires multi-feature specs to answer per-feature: frequency, current workaround, downstream impact. Categorical justifications fail the audit.

### 6. Runaway loops

Two reviewers disagree on phrasing → orchestrator escalates → user resolves a stylistic question that should not have escalated. Auto-resolution oscillates between two routings indefinitely.

**Mechanism:**
- Two-round peer review maximum. `workflows/research-cycle.yaml:78-143` defines `peer-review-r1`, `incorporate-r1`, `peer-review-r2` — no R3 node exists. R2 runs in `context: fresh` and can take a `--novel` flag that biases toward sources R1 missed.
- Bikeshed arbiter (`workflows/research-cycle.yaml:171-212`, `context: fresh`) classifies R2-only findings on R1-SOUND material into PRESENTATION_ONLY / FACTUAL_DISPUTE / FACTUAL_UNSUPPORTED. Auto-sides with R1 unless FACTUAL_DISPUTE with testable evidence (source quote, file:line, data reference).
- Persistent-FLAWED arbiter (`workflows/research-cycle.yaml:252-300`, `context: fresh`) handles findings where R1 and R2 both flag the same material. Marks each evidence item VERIFIABLE / UNVERIFIABLE; resolves to one side, auto-synthesizes both, or escalates only on direct contradictions between verifiable items.
- Outer autopilot loop capped at default 50 iterations (`executor/src/autopilot.ts:269,318`) with named force-stop on cap reach.

### 7. Fabrication

Asked for a literature reference, the model produces a plausible-looking DOI that does not exist. Asked whether a regulatory threshold applies, it asserts one without consulting any source.

**Mechanism:** require the *tool call* as proof of consultation, not the claim.
- `commands/lattice/peer-review.md:73-88`: every algorithmic claim under review must invoke `python scripts/query-knowledge.py` against the typed fact graph at the relevant scope. "A peer-review that does not invoke `query-knowledge.py` for at least one fact in an algorithmic review is incomplete — re-launch."
- `commands/lattice/peer-review.md:110`: claims unsupported by a regulatory standard, peer-reviewed reference, or knowledge-graph fact are downgraded to `OPINION` and excluded from findings.
- When no fact matches, the script emits an explicit "no fact found, falling back to LLM judgment with caveat" stub. That stub is acceptable in citations; "generally accepted" is not.
- `--novel` mode (peer-review R2): every novel source must show VERIFIED / BLOCKED / NOT-FOUND in a Verification column. Rows missing the cell trigger orchestrator re-launch. NOT-FOUND sources MUST be removed.

The `query-knowledge.py` script and the typed fact graph it queries are project-side artifacts. Lattice enforces the requirement to call them.

### 8. Concurrency conflicts

Two parallel sessions stage files; one commits and sweeps the other's work into the wrong commit. Two sessions edit the same state file; the later writer overwrites the earlier writer's changes silently.

**Mechanism:**
- Per-topic WIP lock (`scripts/acquire-topic-lock.sh`): mkdir-atomic on `.lattice/cycle-lock/{topic}/`, 60-min stale threshold, re-entrant for same holder, force-clears logged to `.lattice/decisions.log` for audit. Acquired at sub-cycle entry, released at completion. Held cycles refresh metadata mtime via engine heartbeat after each checkpoint write.
- Per-repo commit lock (`scripts/acquire-lock.sh`): `.lattice/commit.lock/`. Outer-held variant — autopilot and `/lattice:review` set `LATTICE_LOCK_HOLDER` env after acquiring, and the pre-commit hook honors that and skips re-acquire / release.
- Lock liveness (`scripts/acquire-{lock,topic-lock}.sh`): when the lock metadata records a PID via `LATTICE_LOCK_PID` (workflows that bracket acquire/release with a long-lived process opt in), staleness checks the PID with `kill -0` (or `tasklist /FI` on Windows) before the wall-clock check. Dead PID → immediate force-clear; live PID → skip the clock-based stale path entirely (so a long-running peer-review pass is never reaped). Locks acquired without `LATTICE_LOCK_PID` (default 0) fall back to clock-based stale only.
- No-metadata race: the `mkdir` succeeds atomically but the metadata write happens immediately after. A second acquirer that observes the lock dir without metadata waits 2 seconds before force-clearing — covers microsecond-scale legitimate races; genuine mid-acquire death still clears after the grace window.
- CAS-style state writes: every cycle YAML declares `revision_check: true` in its `state` block. `atomicWriteFileSyncCAS` (`executor/src/state-io.ts`) encodes the expected new revision in the temp filename (`<path>.tmp-rev-{N+1}`) and uses `linkSync` as a filesystem-atomic create-or-fail primitive. Two writers racing for revision N+1 collide on `EEXIST`; the loser throws `RevisionMismatchError`. Closes the lost-update race where two writers each observed revision N and both reached the in-memory expectedRevision check independently.
- Atomic state writes for everything else: `atomicWriteFileSync` writes to `<path>.tmp`, then renames. Concurrent readers see prior or new content, never partial.
- Staging-drift check in pre-commit: re-snapshots staged file set at hook exit; BLOCKS if files were added during the hook run (typically caused by concurrent autopilot `git add` interleaving with a manual commit).
- Claude Code PreToolUse on `Bash(git commit*)` BLOCKS unconditionally if commit lock is held (no auto-clear of stale locks since 2026-05-04 audit — auto-clear destroyed legitimate long-running locks; manual recovery only).

### 9. Wrong-question substitution

When a reviewer flags incorrect output, the model frequently responds with pipeline-correctness arguments ("the toggle still flows through, the cache invalidates") instead of output-correctness evidence.

**Mechanism:**
- `scripts/write-review-gate.sh` requires `LATTICE_ALGORITHM_CHECK` env when any staged file matches an entry in `.lattice/algorithm-paths.txt` (project-overridable list). Accepted forms: `pass:<rationale>`, `fail:<reason>` (blocks the gate, escalates), `skipped:<rationale>` (recorded). Without the env set, gate write is refused.
- For `pass:` and `skipped:`, the rationale must be ≥40 chars (was 10), must mention at least one staged file by basename or relative path (regex intersected with `git diff --cached --name-only`), and must not contain trivial substrings (`n/a`, `idk`, `tbd`, `no real reason`, `trust me`, `obviously`) anywhere in the text. The 40-char floor and staged-file requirement force the rationale to be grounded in the actual diff, not free-text hand-waving.
- SCIENCE-FLAG resolution memo path is shared across all four cycle workflows (research-cycle, blueprint-cycle, build-cycle, bug-fix-cycle) via `workflows/_includes/science-flag-resolution.yaml`, synced into each consumer cycle by `scripts/sync-workflow-includes.py`. When a flag fires, a fresh-context sub-agent attempts to author a decision memo with ≥3 verifiable literature citations from permitted sources (project knowledge files, research streams, prior validated decisions). Auto-resolution before user escalation; only escalates if citations cannot be found after genuine search.

The verdict format demands evidence ("NOAEL on PointCross BW = below-lowest, defensible because all 3 driver hits in derive-summaries.ts are p<0.05 with consistent direction"), not pipeline-correctness assertions. The staged-file requirement makes the rationale auditable against the diff under review.

---

## Other capabilities

A few mechanisms outside the failure-mode framing that the harness ships:

- **Structural gate_check on skill outputs.** Skill nodes declare assertions (`min_findings`, `min_dimensions`, `has_evidence`, etc.) with `on_fail: retry`. The orchestrator re-launches the skill if its output doesn't meet the structural contract. Catches "skill produced something, but it's perfunctory."
- **`auto_decision` tables on skill nodes.** `SOUND: proceed`, `CONDITIONAL: accept`, `FLAWED: accept` map verdicts to routing without orchestrator reasoning. Reduces user escalations on boring outcomes.
- **Branch-comparison E2E gate** (`executor/src/e2e.ts`). Three modes (branch / uncommitted / last-commit) auto-detected from git state. Classifies testability from changed files, runs configured suites on both states, diffs results. Build-cycle and bug-fix-cycle wire it in.
- **Pre-implement gate on direct spec entry** (`workflows/build-cycle.yaml`). When build-cycle is entered with `spec_path` directly (skipping the topic-with-blueprint prerequisite), a Layer 0.5 `pre-implement-gate` runs `lattice/architect` in gate mode — F5 spec lint, F3 algorithmic peer-review (BLOCKING for algorithmic specs), SPEC-VALUE-AUDIT, architect-reviewer. Routes by verdict: PASS → implement, REJECT/SIMPLIFY/SCIENCE-FLAG → per-verdict stop with revise/override/abort options. Closes the gap where a spec landing in `incoming/` and built directly bypassed the gates that blueprint-cycle would have run.
- **Validation ratchet** (`scripts/validation-ratchet.sh`). Compares analytical scores against a `.lattice/validation-baseline.json` baseline. Degradation routes to research, not rollback. Improvement no longer auto-advances the baseline — emits `BASELINE-ADVANCE-PROPOSED` (exit 3) with the diff logged to decisions.log; advancement requires `LATTICE_RATCHET_CONFIRM_ADVANCE=1` opt-in, which then prints the exact `git add` + `git commit` commands so the bump is audit-traceable. Closes the stealth bypass where a cherry-picked improvement could silently raise the baseline so the next regression rode under it.
- **Coherence engine** (`executor/src/coherence.ts`). Portfolio-level conflict detection across active topics: subsystem overlap, stale blueprint, prerequisite violation, science-flag propagation, cascades. Auto-resolves three of five via targeted distill analysis (`executor/src/auto-resolve.ts`); prerequisite and BREAKS always escalate.
- **TODO queue advancement** (`executor/src/todo-queue.ts`). Autopilot advances both topics and TODO items marked `autopilot: ready`.
- **Spec-refresh post-ship** (`workflows/build-cycle.yaml:121-139`). After build commits, scan `incoming/` synthesis docs for assumptions invalidated by the new code (renamed fields, moved modules) and update them.
- **Bug-stress** (`commands/ops/bug-stress.md`). After every bug fix: classify the bug into a pattern family (10 named families), identify direct + 2-hop blast-radius consumers from the system manifest, search for the same pattern across consumers and sibling subsystems, write tests for "SAME PATTERN FOUND" instances, run a coverage-density check on changed modules (calibrated <35% / >65% bands), update `bug-patterns.md`, write the 5-question retrospective.

---

## Translating to another platform

The harness has two parts: the framework (transferable) and the substance (project-specific knowledge that must be authored).

### Transferable as-is

- The seven-piece taxonomy (skills / sub-agents / workflows / hooks / state / audits / knowledge).
- Cycle structure (research / blueprint / build, plus spike, bug-fix, mechanical-fix variants), with deterministic state-file checkpoints at every step.
- Sub-agent set (peer-review, architect-reviewer, decision-auditor, post-impl-reviewer) with the two-round peer-review protocol, bikeshed arbiter, persistent-FLAWED arbiter.
- Verdict-enum registry pattern + structural validate-time DAG checks (typed verdicts, approval-route presence, max-iteration bounds, orphan-node detection — all rejected before any node runs).
- Enforcement layer: review-gate file consumed after use, attestation-format with rationale-quality validation (length floor + staged-file reference + substring blacklist), locks with PID-liveness + stale recovery, CAS-style atomic state writes, staging-drift detection, side-channel anchor enforcement on review output.
- Decision log + commit-trailer reconciler. Truth derived from git, not stored.
- Coherence engine, auto-resolve, autopilot loop cap.
- Branch-comparison E2E gate.

### Authored per project

- Domain knowledge in typed form (facts, registries, contracts).
- The script that queries the typed graph (e.g., `query-knowledge.py`).
- Component / API maps naming the canonical class for each common pattern.
- Design decision tables (color, typography, spacing, casing, layout) with file:line citations.
- Contract triangles (declaration / enforcement / consumption sites) for every contract-level field.
- Algorithm-paths list (`.lattice/algorithm-paths.txt`) defining what counts as algorithmic code for the algorithm-defensibility gate.
- Project-shaped audit scripts; what counts as drift is domain-dependent.

### Worked translation: Datagrok plugin development

Mapping each harness piece onto artifacts already present in the Datagrok public repo (`C:/datagrok/public/`):

| Harness piece | Already in Datagrok | To author |
|---|---|---|
| **Component / API map** | Three import namespaces (`grok`, `ui`, `dg`); 76+ reference packages | Canonical "for X, use `grok.shell.Y` not raw HTML" table; named viewer/dialog/grid for each common pattern with file:line anchors |
| **Mechanical hooks** | `grok check` validates package signatures, imports, `package.json`, changelog. Webpack externals list. `grok api` regenerates wrappers from JSDoc metadata | Wire `grok check` into pre-commit instead of dev-time only; add hooks for rules `grok check` does not cover (reuse anchors into `@datagrok-libraries/*`, no edits to `.g.ts` auto-generated files) |
| **Contract triangles** | Function metadata pattern (`//name:`, `//input:`, `//output:` JSDoc) is already a contract triangle: declared in source comments, enforced by `grok check`, consumed by `grok api` for wrapper generation and by the platform runtime | Document the triangle explicitly with declaration / enforcement / consumption sites; add audits that flag drift across releases |
| **Verdict-enum registry equivalent** | None | Typed registry of viewer-property types, column-semantic types (`DG.SEMTYPE.*`), package-metadata roles. Load at workflow-validate time so gate conditions can fail before runtime |
| **Knowledge artifacts** | `help/develop/` documentation tree; `CONTRIB.md`; per-package `README.md` | Lift load-bearing constraints (semver rules, dataframe column-type semantics, viewer-event contracts) into a typed-fact graph that audits can query, separate from the prose docs that explain them |
| **Skills** | None | Minimum set: `create-package`, `add-viewer`, `add-function`, `wire-detector`, `prepare-release`. Each is a markdown prompt that drives the existing `grok` CLI verbs |
| **Workflows** | None | Three cycles (research / blueprint / build); the build cycle wraps `grok check` + `grok publish --release` as gates |
| **Sub-agents** | None | Same set: peer review (challenges domain claims), architect review (overengineering, package layout), post-implementation review (does the published package implement the spec) |
| **Cost / budget** | None | Per-workflow / per-topic budget mechanism — applies regardless of platform |

Several harness pieces ship in the Datagrok repo today without being labeled as such (function metadata is a contract triangle; `grok check` is a hook; webpack externals list is a reuse-anchor enforcement). A development harness for plugin authors is mostly (a) recognizing what exists, (b) authoring the project-side knowledge currently held in source-reading and Slack threads, and (c) wiring existing platform tools into the cycle spine the framework provides.

The same exercise applies to any sufficiently complex platform: identify what is already mechanical, what is prose-only, what is tribal knowledge.

---

## Three layers

| Layer | Content | Applies to |
|---|---|---|
| **Process** (most transferable) | Cycle structure, sub-agent protocol, locks, decision log, commit trailers, two-round peer review with arbitration, mechanical enforcement, verdict-enum registry, coherence engine | Any project using LLM-assisted development |
| **Platform** | Datagrok design system, UX conventions, component reuse map | Datagrok plugins or apps |
| **Scientific** | Typed knowledge graph for atomic facts, algorithm-defensibility gate, validation ratchet against ground truth | High-stakes analytical or regulated domains |

Minimum viable harness for a new project: skills + reviewer sub-agents + three cycles + pre-commit review gate + decision log. Other capabilities are added when a corresponding failure mode appears.

---

## Document map

| For | Read |
|---|---|
| Pipeline overview, phase transitions, skill list | [WORKFLOW.md](WORKFLOW.md) |
| Executor engine, autopilot loop, peer-review and synthesis protocols, coherence detection | [WORKFLOW-INTERNALS.md](WORKFLOW-INTERNALS.md) |
| Gates, hooks, locks, audit scripts | [ENFORCEMENT.md](ENFORCEMENT.md) |
| Hard rules and rationale | [CLAUDE.md](CLAUDE.md) |

---

## Origin

Lattice was built alongside one application — a web tool for exploring pre-clinical regulatory study data — over four months by a single developer working with Claude. Each capability traces to an observed failure mode in that work:

- Self-review without independent context produced false approvals → four sub-agents launched with `context: fresh`, attestation format with rationale-quality validation.
- Bug fixes did not prevent recurrence in the same pattern family → `/ops:bug-stress` flow with pattern-family classification, blast-radius search, oracle growth, and 5-question retrospective enforced by pre-commit.
- Prose rules failed silently under task pressure → mechanical hooks at pre-commit, pre-tool-use, post-tool-use; verdict-enum registry validated at workflow load time.
- Parallel sessions conflated commits → outer-held commit lock, per-topic WIP lock with re-entrancy and audited force-clears, revision-checked atomic state writes, staging-drift detection at hook exit.
- Build-pass and test-pass did not imply behavioral equivalence → branch-comparison E2E gate plus validation ratchet against ground truth.
