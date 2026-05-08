# Lattice Workflow Internals

How the pipeline works under the hood: the executor, autopilot loop, coherence detection, peer-review protocol, and synthesis output contract.

Readers:
- If you're using the framework day-to-day, start at [WORKFLOW.md](WORKFLOW.md). This file is for debugging, contributing to the framework, or understanding why a topic didn't advance.
- If something just blocked a commit, [ENFORCEMENT.md](ENFORCEMENT.md) is likely what you want instead.

## Executor Engine

The executor (`executor/src/`) runs workflow YAML DAGs. It is separate from the markdown skills -- the YAML defines orchestration (what runs when), skills define behavior (what each node does).

**Execution flow:**
1. Load workflow YAML, validate nodes and edges. Validate-time checks reject before any node runs: gate conditions testing a verdict literal not in the producer's declared `verdict_enum` (`workflows/verdict-enums.yaml`), approval options without a `route` field, `max_iterations` not a positive integer, orphan nodes (warning to stderr).
2. Build topological layers (Kahn's algorithm) -- nodes in the same layer run concurrently
3. For each layer: filter nodes (skip completed checkpoints, evaluate conditions, check routing). The condition evaluator (`evaluateCondition` in `nodes.ts`) handles `==`/`!=` against quoted strings, unquoted booleans (`{{X}} == true`), `.contains()`, `exists()`/`!exists()` (real filesystem checks), and `&&`/`||` composition. Unhandled comparison expressions return false (fail-loud), not silent truthy — closes a gate-bypass class where unquoted boolean RHS fell through to a truthy-string fallback.
4. Execute: `bash` -> child_process, `skill` -> Claude CLI (`--output-format json`), `gate` -> condition evaluation, `approval` -> human prompt
5. Collect results, accumulate cost, check budget limits
6. Write checkpoint to state file, log decision
7. Repeat until all layers done or a failure/budget block stops the workflow

**Resume:** When re-running a workflow for a topic, completed checkpoints are skipped. Concurrent overwrites are prevented by CAS-style state writes (B1, post-2026-05-05): `atomicWriteFileSyncCAS` (`executor/src/state-io.ts`) encodes the expected new revision in the temp filename (`<path>.tmp-rev-{N+1}`) and uses `linkSync` as a filesystem-atomic create-or-fail. Two writers racing for revision N+1 collide on `EEXIST`; the loser throws `RevisionMismatchError`. Closes the lost-update race that the in-memory revision check left open (each writer's local `expectedRevision` check passed independently).

**Coherence pre-check:** Before advancing a topic, the engine loads all active cycle states, runs the coherence engine, and blocks if the topic has unresolved conflicts (subsystem overlap, stale blueprints, cascading breaks). Blockers require human approval to proceed.

**Bash-step CWD:** bash nodes run with `cwd` set to the *consuming project* (e.g., `pcc`), not the lattice install. To invoke the executor or other lattice-relative files from a workflow command, use the `{{env.LATTICE_ROOT}}` template variable rather than a relative path -- e.g., `node "{{env.LATTICE_ROOT}}/executor/dist/cli.js" e2e run --base main`. Project-side scripts in `scripts/*.sh` are an exception: those are mirrored into each consuming project, so a relative `bash scripts/foo.sh` resolves correctly. Full template-variable list: `workflows/schema.md`.

### Modules (`executor/src/`)

| Module | Purpose |
|--------|---------|
| `engine.ts` | Core execution loop — layers, filtering, full-map checkpoint resume, un-substituted state-path detection, cost aggregation, `writeCheckpoint` (revision check + CAS write via state-io). |
| `nodes.ts` | Node executors (bash, skill, gate, approval) + Claude CLI JSON parser. Surfaces `is_error: true` and error-shaped text output as failed nodes. `evaluateCondition` supports `==`/`!=` against quoted strings, unquoted booleans (`== true`/`== false`, post-`ee05bc6`), `.contains()`, `exists()`/`!exists()` (real filesystem checks, B3), and `&&`/`||` composition. Unhandled comparison expressions return false (fail-loud), not silent truthy. Skill prompts pass via `spawnSync` argv-form (no shell quoting; B2). |
| `cli.ts` | CLI entry point — 9 commands. Argument parsing via `node:util.parseArgs`. Validate / list skip non-workflow YAMLs (e.g., `verdict-enums.yaml`). |
| `dag.ts` | Kahn's algorithm for topological sort. |
| `loader.ts` | YAML workflow parser + validate-time checks: `validateVerdictReferences` (rejects gate conditions testing a verdict literal not in the producer's declared `verdict_enum`); approval options without `route`; `max_iterations` not a positive integer; orphan-node warnings (override-able via `setWarnSink`). |
| `template.ts` | `{{}}` expression resolver. Five namespaces: `inputs.X` / `nodes.X.output` / `state.X` / `env.X` (workflow runtime), `lattice.X.Y` (project-manifest scalar lookup; emits `<<UNDEFINED:X.Y>>` sentinel for missing keys), `platform.X.Y` (platform-pack manifest, same shape), and `include:project.X.Y` (file inlining; throws `TemplateIncludeError` on absence — required form) plus `include:optional:project.X.Y` (returns empty string on absence — optional form, ENH-09). Throws on output substitution against a dry-run sentinel result; planning fields (`status`, `route`) still resolve. |
| `manifest.ts` | TOML loader for `lattice-project.toml` + `lattice-platform.toml`. Documented subset of TOML 1.0 (no escape sequences, no inline tables, no floats); rejects backslash in scalars / array values upfront with `ManifestError` (post-BUG-042 fix). Public API: `loadManifest(projectRoot)` returns `{ project, platform, projectRoot, hasProject, hasPlatform }`; `lookupKey(manifest, dotted)` does dotted-path lookup; `formatValue` formats arrays as newline-joined for code-fence command lists. |
| `resync.ts` | Pre-substitutes synced skill bodies in the consumer project at sync time (rather than dispatch time). Walks `<project>/.claude/commands/{lattice,ops}/*.md`, runs `resolveTemplate` against the project's manifest, writes back. Reports rendered count, errors, and `sentinelFiles[]` (skill bodies with un-resolved `<<UNDEFINED:...>>` markers). `lattice resync <project>` is the CLI entry; the post-commit hook on the lattice repo invokes it after `sync-skills.sh`. |
| `state-io.ts` | `atomicWriteFileSync` (temp+rename) for non-checked writes; `atomicWriteFileSyncCAS` (filesystem-atomic create-or-fail via `linkSync` on `<path>.tmp-rev-{N+1}`) for revision-checked writes (B1, closes lost-update race). `captureDirtyPaths` snapshots dirty-tree paths for autopilot's per-item ownership tracking. |
| `coherence.ts` | Portfolio-level conflict detection (5 conflict types). Subsystem references matched by anchored regex `\bS(\d{2,3}[a-z]?)\b` (B4 — supports 3-digit + sub-lettered IDs). SCIENCE-FLAG without explicit `subsystems` no longer fans out; empty subsystems trigger a warning and skip propagation (B5). |
| `reconcile.ts` | Derive topic state truth from git `Topic:` trailers. Lookback configurable via `LATTICE_RECONCILE_LOOKBACK_DAYS` (default 90). |
| `autopilot.ts` | Continuous portfolio advancement loop. Loop-local portfolio cache invalidated on state-mutating calls (reconcile, auto-resolve, workflow returns). Per-item path-scoped stash discipline (post-2026-05-04 audit). `--max-loops` cap (default 50). |
| `auto-resolve.ts` | Resolve coherence conflicts via targeted distill analysis. Subsystem-overlap, stale-blueprint, science-flag-propagation auto-resolvable; prerequisite + BREAKS always human. |
| `todo-queue.ts` | TODO-queue source for autopilot. Loads `docs/_internal/TODO.md` items tagged `autopilot: ready`; sorts by score; dispatches by `kind` (mechanical → mechanical-fix-cycle, research → research-cycle, etc.). |
| `budget.ts` | Cost tracking, budget limits, alerting. Per-call context-rot telemetry to `.lattice/context-telemetry.jsonl` with warn/block thresholds against declared context window (defaults 0.6 / 0.8). |
| `e2e.ts` | Branch-comparison E2E testing gate. Three modes auto-detected (branch / uncommitted / last-commit). Refuses to run when foreign dirty paths are present (HIGH-2 fix). |
| `types.ts` | Type definitions (workflow, nodes, cost, budget, context). |
| `index.ts` | Public API exports. |

Test files are colocated under the same directory (`*.test.ts`); run via `npm test` from `executor/`.

## Autopilot

`lattice autopilot` (CLI) or `/lattice:autopilot` (in-session) runs the full portfolio autonomously.

**Two sources of work.** Autopilot pulls from two queues and merges them into a single priority-ordered list:

1. **Topic queue** — `.lattice/cycle-state/*.yaml`. Research/blueprint/build/spike phases. Classified by `/lattice:prioritize` as `[autopilot]` safe.
2. **TODO queue** — items in `docs/_internal/TODO.md` tagged `autopilot: ready` with a `score:` field (0–27). Mechanical work that doesn't need design decisions: data gaps, ETL, contract-triangle cleanup, no-behavior-change refactors, known-fix bugs. Other `autopilot:` values (`waiting-data`, `deferred-dg`, `needs-user`) skip; untagged items get added to the escalation list for tagging.

The `--source todo` and `--source topics` flags restrict to one queue; default merges both. Topics in `*-complete` phases outrank TODO items of the same tier (research/blueprint ceremony already paid). Within TODO, sort by score descending. (See `commands/lattice/autopilot.md` for full queue construction.)

**What it does:**
1. Reconcile all cycle states against git history (auto-correct drift)
2. Read the TODO queue (in parallel with Step 1)
3. Run coherence check across all active topics
4. Attempt auto-resolve for resolvable conflicts (subsystem-overlap, stale-blueprint, SF-propagation)
5. Build the unified queue (safe topics + ready TODO items, ranked)
6. Advance each item via its appropriate route — topic phase routes to the matching sub-cycle, TODO routes by `kind` (mechanical → `mechanical-fix-cycle`, research → `research-cycle`, etc.)
7. Collect all STOP conditions into a human decision batch

**Drain semantics (faf0f2b).** A failure or escalation on one item does NOT halt the queue. Per-item failures are captured (workflow stash on exit, `ESCALATION.md` row), the topic lock is released, and autopilot advances to the next item. The outer loop terminates only on `--max` cap, `--max-loops` cap, no-progress steady state, or budget exceeded. This makes autopilot idempotent over a partial-failure batch — re-invoke and it resumes draining.

**Foreign-state stash discipline (post-2026-05-04 audit, commit `113ac8d`).** Per-item cleanup snapshots dirty paths BEFORE running each workflow item and stashes only paths that became dirty DURING that item. Anything dirty at item-start is foreign state (parallel session, residue from a prior item) and is left untouched. The pre-fix unscoped `git stash push -u` was the seed bug of the 2026-05-04 incident -- it swept ~2300 LOC of a parallel session into a stash labeled with autopilot's failing topic. See `executor/src/autopilot.ts::stashWorkflowOutput` and the foreign-state regression tests in `autopilot-stash.test.ts`.

**Lock heartbeat (post-2026-05-04 audit, commit `f3225e3`).** The engine touches the topic-lock meta file's mtime after every checkpoint write (`engine.ts::refreshTopicLock`). Combined with the bumped 1-hour stale threshold in `acquire-topic-lock.sh`, normal long workflows (10-minute peer-review, 25-minute research-cycle pass) never trip the stale-clear path. Force-clears that DO fire are logged to `decisions.log` for post-hoc audit.

**Autonomous decisions (no human):**
- Classification (full/spike/bugfix)
- Phase transitions (research -> blueprint -> build)
- CONDITIONAL peer review findings (auto-accept)
- Architect SIMPLIFY (auto-apply, re-gate)
- Bikeshed detection (auto-side with R1)
- Commit (when review passes)

**Stops for human:**
- SCIENCE-FLAG (analytical output changes)
- Persistent FLAWED (genuine scientific disagreement across both rounds)
- BREAKS (system integrity)
- Architect REJECT (fundamental approach wrong)
- Coherence conflicts that can't be auto-resolved (prerequisite violations, BREAKS cascades)
- Validation degradation (expected vs unexpected)

**Flags:** `--dry-run` (report without executing), `--loop` (continuous, default is single pass), `--max N` (cap topics per loop, default 3), `--filter PATTERN` (substring match on topic names), `--max-loops N` (LIT-10; cap the outer `while (madeProgress)` loop, default 50; force-stop names auto-resolve / phase-routing oscillation).

**Optional modes (LIT-03 / LIT-04):**

- **`--discover`** — pre-loop probe. Runs the project's `scripts/discovery-scan.py` (if present), parses the resulting `scripts/data/discovery-report.md`, re-classifies each `Gap` against autopilot safety gates, and folds safe gaps into the Step 2 queue with `kind: discover` + score derived from severity. Ambiguous gaps escalate to `ESCALATION.md`. If the script is absent, emits a one-line notice and continues with the normal loop. Force-multiplier on gap detection (Karpathy llm-wiki sparse-area signal).
- **`--consolidate`** — runs after Step 4. Uses `git log --since="14 days ago"` over `docs/_internal/research/` + `docs/_internal/knowledge/`; clusters files by filename keyword / `derives_from` chain / mutual citation; ≥3-file clusters surface as a `RECOMMENDATIONS` block in the Step 5 summary. Does NOT auto-invoke `/lattice:synthesize` — surfaces the suggestion for the next cycle. Ahrens "emergence" signal cited in `commands/lattice/autopilot.md`.

`--discover` and `--consolidate` are independent; running both in one invocation runs `--discover` pre-loop and `--consolidate` post-Step-4. The Step 5 summary lists discovery work in `Advanced:` and synthesis suggestions in `Recommendations`.

Every auto-decision is logged. The user can audit after the fact and re-enter at any step.

## Mechanical-fix Cycle

`workflows/mechanical-fix-cycle.yaml` is the route autopilot takes for TODO items tagged `kind: mechanical` — enum/contract drift, doc refresh, lint cleanup, narrow rename, and similar deterministic edits that don't need research/blueprint/peer-review ceremony. Six nodes:

| Layer | Node | What |
|-------|------|------|
| 0 | `acquire-lock` | `acquire-topic-lock.sh "mechfix-{topic}"` — prevents concurrent work on the same TODO id |
| 1 | `implement-todo` | Skill: `lattice/implement-todo`. Reads `docs/_internal/TODO.md`, locates the section by id (e.g. `GAP-271`), parses the change description, executes via Edit/Bash/Read. If the spec is too vague to determine a deterministic edit, writes `ESCALATED: <reason>` to `ESCALATION.md` and exits cleanly. Declares commit intent via `scripts/declare-commit-intent.sh`. |
| 2 | `commit-intent-check` | Verifies the staged set matches the declared intent before commit (PROJECT pre-commit Step -0.5 logic, pulled forward so a mismatch fails cleanly here rather than during `git commit`). |
| 3 | `ops-check` | Skill: `ops/check`. Build + validation regression. |
| 4 | `review-gate` | Either `write-review-gate.sh` trivial path (typo / mechanical edit) or full `/lattice:review` per change scope. |
| 5 | `commit` | Standard commit + push, lock released, state file `mechfix-{topic}.yaml` archived. |

**Effort is not the gate; correctness is.** No LOC cap. The skill writes `ESCALATED:` (not a failure) when the TODO is too underspecified to act on; autopilot reads that as "skip this item, drain the rest" and surfaces the row in `ESCALATION.md` for the user to clarify. (faf0f2b drain-without-halting semantics.)

The skill `/lattice:implement-todo` can also be invoked outside autopilot — pass a TODO id and it executes the same node sequence interactively.

## Coherence & Reconciliation

### Coherence engine (`executor/src/coherence.ts`)

Detects portfolio-level conflicts that make it unsafe to advance a topic. Reads all `.lattice/cycle-state/*.yaml` files and builds a subsystem-to-topic graph.

**Conflict types:**

| Type | Severity | What | Example |
|------|----------|------|---------|
| `subsystem-overlap` | blocker/warning | Two active topics modify the same subsystem | Topic A and B both touch S10 (scoring engine) |
| `stale-blueprint` | warning | Blueprint validated before newer research affecting its subsystems | Research on HCD completed after blueprint for scoring |
| `unresolved-cascade` | blocker | SF or BREAKS in topic A propagates to subsystems used by topic B | Science flag in organ weights cascades to scoring |
| `prerequisite` | blocker | Topic depends on another that hasn't completed | Visualization depends on data pipeline not yet built |
| `science-flag-propagation` | warning | SF in one topic may affect another's analytical output | -- |

**Output:** `CoherenceReport` with safe topics (ready to advance), blocked topics, and topics needing human decisions. Subsystem heatmap shows which subsystems are contended.

### Auto-resolve (`executor/src/auto-resolve.ts`)

Attempts to resolve conflicts without human intervention by running a targeted Claude distill analysis against the conflicting topics' research/synthesis docs.

- **subsystem-overlap** -> checks if interactions are read-only or compatible
- **stale-blueprint** -> checks if newer research actually invalidates the blueprint
- **science-flag-propagation** -> checks if SF is misclassified (deferred/contextual)
- **prerequisite, BREAKS** -> always human (never auto-resolved)

Verdicts: `RESOLVED` (conflict removed), `NOT_RESOLVED` (conflict stands), `NEEDS_HUMAN` (ambiguous).

### Reconciliation (`executor/src/reconcile.ts`)

Derives topic state truth from git commit trailers rather than trusting state files. Every `lattice status` and `lattice coherence` command runs reconciliation first.

Greps `git log` for `Topic:` and `Phase:` trailers, compares against cycle-state YAML files, and auto-corrects drift. Also reads retroactive annotations from `.lattice/commit-topics.tsv` for legacy commits that predate the trailer convention.

## Peer Review Protocol

**Separate agent mandatory.** Peer review always runs in a launched agent with no access to the orchestrator's context. Self-review doesn't work -- the research rationale is in the context window.

**Registered subagent_type** (`agents/peer-review.md`). Orchestrators (research-cycle, blueprint-cycle, build-cycle review, architect) launch with `subagent_type: peer-review` and a one-sentence prompt naming the doc path. The harness loads the agent's instructions; the orchestrator does NOT inline `commands/lattice/peer-review.md` content into the prompt. (Retired 2026-04-27 after measuring ~10K wasted tokens per launch from the previous "Prompt: Full /lattice:peer-review skill instructions" pattern. Hardened 2026-05-05 (D5/D6): `agents/peer-review.md` is now self-contained — independence invariant restored — and `commands/lattice/review.md` Agent D was changed from `general-purpose` with inline prompt to `subagent_type: peer-review` so all callers go through the same harness-load path.)

**Maximum 2 rounds per artifact.** Each round is a full `/lattice:peer-review` pass.

### Algorithmic-tightening requirements (F3, BLOCKING)

When the input is **algorithmic code** (a function in `.lattice/algorithm-paths.txt`) or an **algorithmic spec** (declares an algorithm in scope, modifies a function in algorithm-paths, or proposes a new analytical method), the peer-review agent MUST:

1. **Run `python scripts/query-knowledge.py`** against the relevant scope (species, domain, fact_kind) and cite the returned facts (or the explicit no-fact-found stub) in the review. A peer-review that does not invoke `query-knowledge.py` for at least one fact in an algorithmic review is incomplete and gets re-launched.
2. **Cite for every defensibility claim.** Acceptable citations: a regulatory standard (OECD / ICH / FDA / EFSA / EPA, named document + section), a literature reference (DOI / PMID, or a knowledge-graph fact ID returned by `query-knowledge.py`), or an internal validation-reference card. "Generally accepted" / "standard practice" / "tox common sense" is NOT a citation — claims without citation are downgraded to OPINION and don't count as findings.
3. **Blocking semantics.** For algorithmic peer-review:

| Verdict | Effect on parent gate (architect / build review) |
|---------|--------------------------------------------------|
| `SOUND` | Parent gate proceeds. Verdict logged. |
| `CONDITIONAL` | **BLOCKS.** "What would fix it" must be addressed (fix code/spec, cite the missing fact via query-knowledge after populating it, or explicit user defer with named dependency). |
| `FLAWED` | **BLOCKS unconditionally.** Fix the algorithmic defect and re-launch. |
| `INSUFFICIENT` | **BLOCKS.** Provide the requested information and re-launch. |

This is the §5.1 wiring: F3 becomes a hard gate at algorithmic-paths commits and at incoming/ algorithmic specs. The verdict is persisted via the SIMPLIFY-1 unified attestation format (see ENFORCEMENT.md §8). (f9b2ca5)

### Round 1 (standard)
Peer reviewer challenges the artifact. Produces verdicts: SOUND, CONDITIONAL, FLAWED, INSUFFICIENT.

Author incorporates accepted feedback:
- SOUND: no action
- CONDITIONAL: address the conditions, strengthen evidence
- FLAWED: fix the material error
- INSUFFICIENT: add missing information

Autonomous mode: CONDITIONAL auto-accepted, FLAWED accepted for incorporation. User decisions logged.

### Round 2 (optionally `--novel`)
Fresh agent checks revisions. With `--novel` flag, forces different sources than Round 1 -- recent, niche, underindexed work.

| Outcome | Action |
|---------|--------|
| All SOUND or CONDITIONAL | Proceed |
| New FLAWED on previously-SOUND | Arbiter classifies R2's objections. Presentation-only (wording / emphasis / redundancy) or FACTUAL_UNSUPPORTED (dispute without testable evidence) auto-side with R1. Only FACTUAL_DISPUTE (reinterpretation of source, new source, OR any factual claim with testable evidence — source quote, data ref, file:line) escalates, with the specific disputed claim and R2's evidence in the prompt. |
| Same FLAWED both rounds | Arbiter diffs per-side evidence items (VERIFIABLE vs UNVERIFIABLE against repo / sources / prior decisions). Drops unverifiable items. Emits one of: `auto_resolve_r1` (R1 evidenced, R2 not), `auto_resolve_r2` (R2 evidenced, R1 not), `auto_synthesize` (both evidenced, no direct contradiction -- integrate both framings), `escalate_contradiction` (both evidenced and directly contradictory -- only this escalates). |

**No Round 3.** Unresolved issues require human judgment.

### Bikeshed arbiter rubric

Preserves substantive R2 catches (GAP-208 fabricated claim, GAP-194 internal contradiction, GAP-195 unverifiable source) — these surface as FACTUAL_DISPUTE and escalate. Eliminates rubber-stamp gates for R2 objections that are stylistic or unverifiable. The arbiter runs as a fresh-context skill (`evaluate-bikeshed-arbiter` in research-cycle.yaml, `plan-bikeshed-arbiter` in blueprint-cycle.yaml), reads R1 and R2 outputs, and emits one line: `ARBITER_VERDICT=auto_side_r1` or `ARBITER_VERDICT=escalate_factual`. Gate routes on that line.

### Persistent-FLAWED arbiter rubric

Companion arbiter for the "same FLAWED in both R1 and R2" path. Different failure mode than bikeshedding — both reviewers agree something is wrong, potentially for different reasons. The arbiter enumerates every evidence item each side cites, marks each VERIFIABLE (testable against repo / sources / logged decisions) or UNVERIFIABLE, drops unverifiable items, and compares what remains. Only direct contradiction between VERIFIABLE items on opposite sides reaches the user; evidence imbalance (one side has verifiable evidence, the other doesn't) or non-contradictory overlap (both verifiable, both could be simultaneously true) auto-resolves. The escalation prompt surfaces the specific contradicting pair and their sources, not two unstructured positions. Skills: `evaluate-persistent-arbiter` (research-cycle), `plan-persistent-arbiter` (blueprint-cycle). Verdict line: `ARBITER_VERDICT=auto_resolve_r1 | auto_resolve_r2 | auto_synthesize | escalate_contradiction`.

### Escalation Format

```
UNRESOLVED: {topic}

Round 1 position: {what the reviewer said}
Round 1 evidence: {citations}

Author response: {what was changed and why}

Round 2 position: {what the reviewer said after revision}
Round 2 evidence: {citations}

Recommendation: {which position has stronger evidence}
Your call: {what decision is needed}
```

## Synthesis Output

`/lattice:synthesize` produces three sections:

| Section | Content | Routes to |
|---------|---------|-----------|
| **Build Plan** | Features with acceptance criteria, merit-driven decisions (rule 12), real dependencies only (rule 13) | `incoming/` spec, ROADMAP intake |
| **Research Gaps** | Questions needing answers, blocking status, suggested sources | Next `/lattice:research-cycle` |
| **Data Gaps** | Missing data, species, study types, impact if unaddressed | TODO.md or backlog |

## Review Quality Gate

`/lattice:review` produces 7 mandatory output sections:

1. **CHANGES** -- what changed
2. **ARCHITECT REVIEW** -- complexity and science preservation (separate agent)
3. **DECISION AUDIT** -- merit evaluation (separate agent -- rules 12-13 enforcement) + deferral litmus test
4. **REQUIREMENT TRACE** -- four-dimension check (WHAT/WHEN/UNLESS/HOW)
5. **MECHANICAL CHECKS** -- build, lint, tests
6. **DOCS UPDATE** -- MANIFEST, specs, TODO
7. **VERDICT** -- pass/fail with evidence

Missing section = incomplete review.

**ALGORITHM CHECK (rule 18, BUG-031 hardening).** When the diff modifies (or consumes the output of) an analytical algorithm — NOAEL / LOAEL / scoring / classification / syndrome detection / severity / onset — the review must (a) run the algorithm against PointCross + at least one other representative study using `backend/generated/{study}/unified_findings.json`, (b) record the actual output, and (c) answer in writing: *"Would a regulatory toxicologist agree this output represents the data?"* with a one-paragraph interpretation citing the actual pairwise/group values that drove the result. **A SCIENCE-FLAG raised by any review agent only clears via fix, data-grounded counter-evidence in this format, or explicit user defer with named dependency.** Plumbing-only rebuttals do NOT clear the flag. Algorithm paths default list: `frontend/src/lib/derive-summaries.ts`, `endpoint-confidence.ts`, `findings-rail-engine.ts`, `cross-domain-syndromes.ts`, `syndrome-rules.ts`, `backend/services/analysis/**`. Override per-project via `.lattice/algorithm-paths.txt`. (487797e)

**Verdict persistence (SIMPLIFY-1).** Each review section that produces a verdict (architect-reviewer, decision-auditor, peer-review when algorithmic, spec-lint when run) writes a row to `attestations[]` in `.lattice/review-gate.json` via `scripts/append-attestation.sh`. `write-review-gate.sh` validates kind / target / verdict / rationale; pre-commit consumes after a successful commit (single-use gate). Rationale validation tightened 2026-05-05 (C4): rationale must be ≥40 chars (was 10), must mention at least one staged file by basename or relative path (regex intersected with `git diff --cached --name-only`), and must not contain trivial substrings (`n/a`, `idk`, `tbd`, `no real reason`, `trust me`, `obviously`) anywhere in the text — substring blacklist, not exact-match. See ENFORCEMENT.md §8 for the format. (829dc92, C4)

**Mechanical 7-section anchor enforcement (D7).** The full review skill writes its 7 mandatory output sections (CHANGES, ARCHITECT REVIEW, DECISION AUDIT, REQUIREMENT TRACE, MECHANICAL CHECKS, DOCS UPDATE, VERDICT) to a side-channel file at `.lattice/last-review-output.md`. `write-review-gate.sh` greps for the seven `^## NAME` anchors; missing any → non-zero exit listing what's absent. The trivial-commit escape hatch (`bash scripts/write-review-gate.sh pass "..."` invocations that bypass the full review skill) skips the anchor check by virtue of the side-channel file's absence. Failure mode prevented: prose-only "all 7 sections required" was honor-system; DECISION AUDIT was the most-skipped (6 occurrences in `.lattice/decisions.log`).

## Session Management

- `/lattice:pause-work` -- persist state if session ends mid-pipeline
- `/lattice:resume-work` -- restore and continue
- All artifacts persist to disk -- terminal crashes lose nothing
- Cross-session resume: each cycle reads `.lattice/cycle-state/{topic}.yaml` and decisions log to resume from last completed step
