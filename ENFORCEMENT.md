# Lattice Enforcement Layer

The framework uses enforcement mechanisms at multiple levels. Prose instructions describe what should happen. Enforcement ensures it does.

Readers:
- If a hook just blocked your commit or a script stopped you, this is the file that explains why.
- If you're configuring a new project, use this as the checklist of guardrails to wire up.

See also:
- [WORKFLOW.md](WORKFLOW.md) — pipeline overview and skill list
- [WORKFLOW-INTERNALS.md](WORKFLOW-INTERNALS.md) — executor engine, autopilot, coherence, peer-review protocol

## Safety audit 2026-05-04

A broad audit of destructive git operations and concurrency safety found 6 CRITICAL + 7 HIGH + 8 MEDIUM + 5 LOW findings (full report at `.lattice/safety-audit-2026-05-04.md`). The fixes shipped in commits `113ac8d` … `0989d49` (and the doc-only follow-up containing this addendum). Summary of what changed and the section to look in:

- **Lock model overhaul** (CRITICAL-1/2/3 + HIGH-1/5). Section 7 (Hooks) and a new "Lock lifecycle" section below: every cycle workflow's `release-lock` was being placed in Layer 0 and destroying the topic lock microseconds after acquire-lock took it; both `release-lock.sh` and `release-topic-lock.sh` had no ownership check; both PreToolUse hooks silently force-cleared stale locks at 300s; the heartbeat documented in CLAUDE.md was never implemented. All fixed.
- **Path-scoped destructive ops** (CRITICAL-4 + HIGH-2 + the seed bug). Sections 8 + the per-item autopilot stash: autopilot's `stashIfDirty`, the engine's `maybeWipCommit`, and e2e's `git stash push` all ran against the entire dirty tree without checking ownership. Now: stash is path-scoped to (post − pre); maybeWipCommit no longer auto-commits (advisory only); e2e refuses to run when foreign dirty paths are present.
- **State integrity** (CRITICAL-5/6). New atomic temp+rename writes via `executor/src/state-io.ts`; `revision_check: true` (declared in every cycle YAML) is now actually enforced -- writeCheckpoint reads the file's current revision and throws on mismatch.
- **UX/input safety** (HIGH-3 + HIGH-6). Approval node no longer silently defaults to options[0] on invalid input -- re-prompts up to 3 times then aborts. CLI input sanitization on string-typed workflow inputs (`^[A-Za-z0-9_./-]+$`).
- **Read-only inspection** (MEDIUM-8). `lattice status` and `lattice coherence` default to read-only; pass `--reconcile` to opt into mutation.
- **Test harness** (HIGH-4). 30 regression tests across `executor/src/*.test.ts` (Node test runner) and `scripts/tests/test-lock-ownership.sh`. Run with `npm test` from `executor/`.

Deferred items (filed for follow-up): MEDIUM-2 (autopilot snapshot timing), MEDIUM-4 (appendFileSync atomicity), MEDIUM-6 (auto-resolve writes outside topic lock), all LOWs.

## Lattice self-fix 2026-05-05

Spec at `b7715c5` (`spec(lattice-self-fix): framework hardening from 2026-05-05 audit`); 25 KEPT items shipped across 5 streams (A1-A4, B1-B5, C1-C7, D1-D7, E1-E4). Closeout report at `.lattice/lattice-self-fix-review-2026-05-05.md`. Items most relevant to enforcement:

- **Stream A — orchestration contracts.** `verdict-enums.yaml` registry + loader-time validate (A2); `_includes/science-flag-resolution.yaml` + `_includes/topic-lock.md` + `_includes/revision-checked-writes.md` extracted from triplicated cycle-skill prose, propagated by `scripts/sync-workflow-includes.py` (A1, A3); `max_iterations` field + validate-time DAG checks for approval-without-route, non-positive max_iterations, orphan nodes (A4).
- **Stream B — executor hardening.** `atomicWriteFileSyncCAS` (filesystem-atomic create-or-fail via `linkSync` on `<path>.tmp-rev-{N+1}`) closes lost-update race that the in-memory revision check left open (B1). Argv-form bash execution closes shell-injection vector (B2). `exists()`/`!exists()` in `evaluateCondition` perform real filesystem checks instead of returning unconditional false/true (B3). Subsystem regex broadened to `\bS(\d{2,3}[a-z]?)\b` to support 3-digit + sub-lettered IDs (B4). SCIENCE-FLAG without explicit `subsystems` no longer fans out to source's subsystems — empty subsystems trigger a warning and skip propagation (B5).
- **Stream C — hook + script hardening.** PID liveness in stale-lock detection: dead PID → immediate force-clear, live PID → skip clock-based stale check (C1). No-metadata 2s grace + `LATTICE_LOCK_PID` opt-in (default 0 = clock-only stale) (C2). Pre-commit Step 0a wires `merge-shared-state.sh` to refresh shared files (TODO/REGISTRY/decisions.log/ROADMAP/MANIFEST) from HEAD before commit (C3). Algorithm-defensibility rationale validation tightened to ≥40 chars, must reference a staged file by basename or path, substring (not exact-match) trivial blacklist (C4). `install-hooks.sh` now refuses if `git config core.hooksPath` overrides `.git/hooks/` (C5). Validation-ratchet baseline advancement requires `LATTICE_RATCHET_CONFIRM_ADVANCE=1`; default emits `BASELINE-ADVANCE-PROPOSED` (exit 3) instead of silent overwrite (C6). Bug-retro keyword tolerance for common markdown shapes (numbered lists, h3/h4 headers, bold-numbered) (C7).
- **Stream D — skill / gate plumbing.** `build-cycle.yaml` gains a SCIENCE-FLAG resolver via `_includes/science-flag-resolution.yaml` sync — flagging is no longer silent on the build-cycle path (D1). `build-cycle.yaml` Layer 0.5 `pre-implement-gate` runs F5 spec lint, F3 algorithmic peer-review, SPEC-VALUE-AUDIT, architect-reviewer when entered with `spec_path` directly (closes the gap where direct-spec entry bypassed blueprint-cycle gates) (D2). `blueprint-cycle.yaml` architect-verdict gate reordered so `SCIENCE-FLAG` from architect or probe matches before PASS/SIMPLIFY (D3). `spike-cycle` escalate-to-full path releases the topic lock before exiting (D4). `agents/peer-review.md` self-contained — removed cross-reference to `commands/lattice/peer-review.md` (D5); `commands/lattice/review.md` Agent D launches `subagent_type: peer-review` (harness-loaded) instead of `general-purpose` with inline prompt (D6). 7-section anchor enforcement on `/lattice:review` output via side-channel file `.lattice/last-review-output.md` greppable by `write-review-gate.sh` (D7).
- **Audit-followup.** Critical gate-bypass: `evaluateCondition` returned silent truthy on unhandled comparison expressions (`{{X}} == true` with unquoted boolean RHS fell through the truthy-string fallback). Two new handlers for `LHS == true|false` and `LHS != true|false`; truthy-string fallback now rejects expressions containing comparison operators that didn't match a specific handler — fail-loud, not silent. Pre-fix, every build / bug-fix / blueprint / research cycle silently routed post-review state through the SCIENCE-FLAG memo path regardless of whether a flag was raised (`ee05bc6`).

## 1. Review Gate (`scripts/write-review-gate.sh` + `.git/hooks/pre-commit`)

Every commit requires a review gate file (`.lattice/review-gate.json`). Two ways to create it:

- `/lattice:review` -- full quality gate with architect review, decision audit, requirement trace. Writes the 7 mandatory sections to a side-channel file (`.lattice/last-review-output.md`); `write-review-gate.sh` greps for the seven `^## NAME` anchors and refuses to write the gate if any are missing (D7).
- `scripts/write-review-gate.sh` -- mechanical checks for trivial commits. Runs the executor TypeScript build (if `executor/` files staged), the algorithm-defensibility verdict (if any staged file matches `.lattice/algorithm-paths.txt`), and attestation validation. Trivial-commit invocation (`bash scripts/write-review-gate.sh pass "..."`) skips the anchor check via the side-channel file's absence.

The pre-commit hook (`hooks/pre-commit`) runs eight steps before a commit lands: Step -1 commit lock acquisition (BLOCKS); Step 0a `merge-shared-state.sh` to refresh TODO / REGISTRY / decisions.log / ROADMAP / MANIFEST from HEAD (ADVISORY, soft-fails if script absent; C3); Step 0 review-gate freshness check (BLOCKS, ≤30 min, single-use); Step 1 executor TypeScript build (BLOCKS); Step 2 index freshness (ADVISORY); Step 2.5 bug-retro check on `fix:` commits (BLOCKS without 5-question retro); Step 3 complexity advisories (ADVISORY); Step 4 staging-drift check (BLOCKS if files added during the hook run). The gate is consumed (deleted) after a successful commit.

## 2. Validation Ratchet (`scripts/validation-ratchet.sh`)

Measures analytical correctness against ground truth studies. Not binary keep/discard: degradation routes to research.

```
baseline  -- capture current validation scores
compare   -- compare current vs baseline
auto      -- baseline (if needed) + regenerate all studies + compare

Exit codes:
  0 = no change OR confirmed advancement
  2 = degradation detected
  3 = improvement detected, baseline-advance proposed (NEW; C6)
```

**Degradation handling:** Degradation doesn't mean rollback. It means analytical behavior changed. The ratchet identifies WHICH signals/assertions changed. The agent must determine: expected (documented in spec) -> update ground truth, or unexpected -> route to `/lattice:research`.

**Baseline advancement (C6, post-2026-05-05).** Improvement no longer auto-advances the baseline file. The default path emits `BASELINE-ADVANCE-PROPOSED` (exit 3) with the diff logged to `.lattice/decisions.log`; the baseline file is untouched. To advance, set `LATTICE_RATCHET_CONFIRM_ADVANCE=1` and re-run; the script then rewrites the baseline, logs `BASELINE-ADVANCED`, and prints the exact `git add` + `git commit` commands so the bump lands as an audit-traceable commit. Closes the stealth-bypass class where a cherry-picked improvement could silently raise the baseline so a subsequent regression rode under it (no decision-log entry, no commit, no audit trail).

## 3. Coherence Engine (`executor/src/coherence.ts`)

Portfolio-level conflict detection. See [WORKFLOW-INTERNALS.md](WORKFLOW-INTERNALS.md#coherence--reconciliation) for the full conflict-type taxonomy and auto-resolve flow.

## 4. E2E Testing Gate (`executor/src/e2e.ts`)

Branch-comparison behavioral verification. Three comparison modes (auto-detected from git state):

| Mode | Compares | When |
|------|----------|------|
| `branch` | Feature branch vs base branch | On a feature branch |
| `uncommitted` | Stash dirty state, run clean, compare | Uncommitted changes on trunk |
| `last-commit` | HEAD~1 vs HEAD | After committing on trunk |

**Flow:** Classify changed files -> determine testability (e2e_testable vs code_review_only) -> run configured suites on both states -> compare results -> write verdict.

**Config:** `.lattice/e2e.yaml` per project. Defines suites (name, command, pass criteria) and file patterns.

**Integration:** Build-cycle and bug-fix-cycle workflows include E2E gate nodes (`e2e-classify`, `e2e-gate`, `e2e-run`).

## 5. Token Tracker / Budget (`executor/src/budget.ts`)

Per-node token counting and cost enforcement. Skill nodes run `claude --output-format json`, which returns real `cost_usd` and token counts. Cost accumulates in `WorkflowRun` during execution and persists to the topic's cycle-state YAML across runs.

**Config:** `.lattice/budget.yaml` (optional -- no file = no limits)

```yaml
per_workflow:
  research-cycle: 15.00       # max USD per workflow run
  build-cycle: 10.00
per_topic: 40.00               # max USD accumulated across all runs for a topic
per_node:                       # max USD per individual node execution
  research: 5.00
alert_threshold: 0.8           # warn at 80% of any limit

# Context-rot monitoring (LIT-09, b2680f8). Per-call utilization signal,
# distinct from cumulative USD spend: a workflow can stay under USD budget
# and still rot when individual calls saturate the context window. Cache
# reads are not counted against utilization.
context:
  window_size: 1000000         # Opus 4.7 (1M); 200000 for Sonnet 4.6
  warn_threshold: 0.5          # EXAMPLE OVERRIDE -- code default 0.6
  block_threshold: 0.75        # EXAMPLE OVERRIDE -- code default 0.8
```

The `warn_threshold` and `block_threshold` values shown above are project-overrides typical for projects with stricter rot tolerance; the code defaults in `executor/src/budget.ts` are `DEFAULT_CONTEXT_WARN = 0.6` and `DEFAULT_CONTEXT_BLOCK = 0.8`. A project with no `context:` block in its `budget.yaml` (or no `budget.yaml` at all) gets the code defaults.

**Behavior:**
- Below threshold: cost logged per node (`[implement] OK ($0.3842)`)
- At threshold: `[BUDGET WARNING]` message
- At limit: `[BUDGET EXCEEDED]` -- workflow stops, cost persisted, decision logged

**Context-rot telemetry (LIT-09):** `appendContextTelemetry()` writes a JSONL row to `.lattice/context-telemetry.jsonl` after every skill-node call (always, even when no `context:` config — level=`ok`). Block-level rot stops the workflow with reason `CONTEXT_ROT` in `decisions.log`. `lattice context [--last N]` shows recent telemetry + peak utilization summary. Suggested response when warned: `/clear` and re-invoke the orchestrator at the next phase boundary (cycle.md is wired to checkpoint-and-stop at research→blueprint and blueprint→build transitions for exactly this reason).

**Autopilot loop cap (LIT-10):** `AutopilotOptions.maxLoops` (default 50, `lattice autopilot --max-loops N`) caps the outer `while (madeProgress)` loop. When the cap is hit, autopilot prints an explicit force-stop message naming the failure mode (auto-resolve or phase routing oscillating without reaching steady state) and exits.

## 6. Decision Log (`.lattice/decisions.log`)

Persistent experiment memory across sessions. TSV, append-only. Every skill appends after producing output.

```
TIMESTAMP	SKILL	OUTCOME	CONTEXT	METRICS	NOTES
```

**What it prevents:**
- Re-trying approaches that already failed
- Losing user accept/reject decisions across sessions
- Validation drift going unnoticed

## 7. Claude Code Hooks (`.claude/settings.json`)

Mechanical enforcement -- the agent cannot skip these:

**PreToolUse on `Bash(git commit *)`** (`hooks/claude-hooks.json`):

| Hook | Action |
|------|--------|
| **Commit lock check** | BLOCKS unconditionally if `.lattice/commit.lock` is held. Reports holder + age + recovery instructions. NO auto-clear of stale locks since 2026-05-04 audit (CRITICAL-3 / HIGH-1: auto-clear at 300s destroyed legitimate long-running locks — e.g. a 6-minute peer-review pass — and was a contributing factor to the data-loss incident). Manual recovery only via `bash scripts/release-lock.sh --force`. |
| **Gap-persistence reminder** | WARNS (non-blocking) when research / synthesis / peer-review files are staged but neither `REGISTRY.md` nor `TODO.md` is staged. Prompts the author to confirm whether discovered gaps were persisted. |
| **Pipeline test-first** | BLOCKS if pipeline modules (project-configurable regex `PIPELINE_MODULES_PATTERN`) are staged without an accompanying `*.test.*` or `*.spec.*` file. |
| **Validation ratchet check** | BLOCKS if `.lattice/engine-changed` marker exists without a corresponding `.lattice/validation-compared` marker (the ratchet was not run). The PostToolUse engine-change hook below sets the first marker; `validation-ratchet.sh` clears it via the second. |

The git pre-commit hook (`hooks/pre-commit`) — distinct from Claude Code PreToolUse — is what acquires the commit lock for the commit's duration and verifies the review-gate file (Section 1). Pre-commit Step -1 honors `LATTICE_LOCK_HOLDER` env and skips re-acquire when outer-held by autopilot / `/lattice:review` (922cf24, 20f2eb4).

**PreToolUse on `Write|Edit|MultiEdit`:**

| Hook | Action |
|------|--------|
| **Design-mode preamble gate** (`scripts/design-mode-gate.sh`) | BLOCKS in-scope `.tsx`/`.html`/`.ts` edits when `.lattice/design-mode.lock` exists with `preamble=pending`. The lock is created by `design-session.sh begin <trigger>`; flipped to `complete` by `preamble-done <evidence>` after the four `/lattice:design` Step 1 blocks (workflow audits, existing surfaces, first-principles, convention check) are authored to an evidence file. Stale locks (>1h) auto-clear. Out-of-scope files always allowed. Failure mode prevented: port-mode redesign — relocating UI without engaging engine outputs. (de8c1af, 09843ee, b349c71) |
| **Block pcc-mirror edits** *(optional, user-global)* | DENIES Write/Edit/MultiEdit on `<project>/.claude/{commands/lattice/, commands/ops/, agents/}/...` with a message naming the lattice equivalent. Reinforces the "lattice is source of truth" rule physically — direct edits to consumer-project mirrors get clobbered on the next sync. See lattice/CLAUDE.md "Propagating Framework Changes to Consumer Projects". |

**PostToolUse on `Write|Edit|MultiEdit`** (`hooks/claude-hooks.json`):

| Hook | Action |
|------|--------|
| **Co-author block** | BLOCKS writes containing `Co-Authored-By` (rule 4). |
| **Complexity spot-check** | ADVISORY — runs `scripts/complexity-check.sh` against the edited file. |
| **Engine-change marker** | When the edited path matches `ENGINE_FILES_PATTERN` (project-configurable regex), sets `.lattice/engine-changed` and removes any `.lattice/validation-compared`. Consumed by the PreToolUse validation-ratchet check above — the next `git commit` is blocked until `validation-ratchet.sh` runs and writes the compared marker. |
| **Lattice → consumer sync** *(optional, user-global)* | When the edited file is under `C:/pg/lattice/{commands,agents,scripts,docs/skills-includes}/...`, runs `bash C:/pg/lattice/scripts/sync-skills.sh <consumer>` for each registered consumer project and emits a `systemMessage` confirmation. Consumers list lives in the hook script. Removes the human-memory dependency of "remember to sync after editing lattice." Skill partner files at `docs/skills-includes/` propagate alongside `commands/` so by-path references (e.g. `review.md → review-protocols.md`) don't drift into broken-pointer state. |

## 8. Structural Quality Gates

File-based checks that cycle orchestrators run on skill outputs before proceeding:

| Gate | What it checks | Blocks proceed on failure |
|------|---------------|--------------------------|
| **Workflow validate-time DAG checks** (A2 + A4) | Loader (`executor/src/loader.ts`) walks every cycle YAML before any node runs and rejects: gate conditions testing a verdict literal not in the producer's declared `verdict_enum` (`workflows/verdict-enums.yaml`); approval options without a `route` field; `max_iterations` not a positive integer. Orphan nodes (depend_on chains never reachable from a route) emit a warning to stderr (override-able via `setWarnSink`) | Yes -- workflow refuses to load |
| **7-section anchor enforcement** (D7) | `/lattice:review` writes its 7 mandatory sections (CHANGES, ARCHITECT REVIEW, DECISION AUDIT, REQUIREMENT TRACE, MECHANICAL CHECKS, DOCS UPDATE, VERDICT) to `.lattice/last-review-output.md`. `write-review-gate.sh` greps for `^## NAME` anchors and refuses to write the gate if any are missing | Yes -- mechanical, replaces honor-system "all 7 sections required" prose |
| **Peer review quality** | >=3 findings, >=3 review dimensions, evidence per finding | Yes -- re-launches peer review |
| **Algorithmic peer-review (F3)** | Every algorithmic spec or change to a function in `.lattice/algorithm-paths.txt` must produce a peer-review attestation citing at least one `query-knowledge.py` fact (or the explicit no-fact-found stub) before architect/build review proceeds | Yes -- `CONDITIONAL` / `FLAWED` / `INSUFFICIENT` BLOCKS the parent gate. Resolved by fix, citation of newly-populated fact, or explicit user defer with named dependency. (f9b2ca5) |
| **Synthesis sections** | 6 mandatory sections present with content | Yes -- re-runs synthesize |
| **Architect verdict** | REJECT/SCIENCE-FLAG require user decision (or SCIENCE-FLAG memo with ≥3 citations under autopilot) | Yes -- STOP at decision point |
| **Probe results** | BREAKS/SCIENCE-FLAG require user decision | Yes -- STOP at decision point |
| **Engine change marker** | `.lattice/engine-changed` exists -> validation ratchet required | Yes -- blocks commit |
| **Spec value audit** (rule 17) | Multi-feature specs answer per-feature frequency/impact | Yes -- `/lattice:architect` gate Step 1.5 routes non-PASS back for rework |
| **Spec lint (F5)** | 4-criterion check on `incoming/` specs: empirical claims cite data, behavioral requirements have tests, multi-feature → SPEC-VALUE-AUDIT, algorithmic specs cite domain truth | Yes -- `/lattice:architect` Step 1.4 (`scripts/lint-spec.py --strict`); defects block until fixed or waived via `kind=spec-lint-waiver` attestation in `decisions.log`. (06c614b) |
| **Bug-pattern registry (F6)** | Every `fix:` commit registers/updates a `docs/_internal/knowledge/bug-patterns.md` entry naming the pattern, applies-to glob, and prevention class | Yes -- pcc pre-commit Step 0d enforces a `kind=bug-pattern` attestation when staged paths match any registered glob; `/ops:bug-stress` Step 7.5 emits the entry. (388427e) |
| **Bug retro (F7)** | The 5-question retro is structured: root cause / genesis / detection gap / prevention class / lattice change | Yes -- pre-commit BLOCKS `fix:` commits whose BUG-SWEEP entry lacks the 5 retro fields. (5a9bc9b) |
| **Algorithm defensibility (rule 18, BUG-031 hardening)** | Review must run the algorithm on PointCross + one other study and answer "would a regulatory toxicologist agree?" with citation to driving values | Yes -- SCIENCE-FLAG only clears via fix, data-grounded counter-evidence in this format, or named-dependency defer. Plumbing-only rebuttals do NOT clear it. (487797e) |

### SIMPLIFY-1 unified attestations format

All structural gate verdicts above (peer-review, architect-review, spec-lint, bug-pattern, persistent-arbiter, etc.) write to a single `attestations[]` array in `.lattice/review-gate.json`:

```json
{
  "attestations": [
    {
      "kind": "peer-review",
      "target": "<topic-or-spec-or-skill-ref>",
      "verdict": "SOUND|CONDITIONAL|FLAWED|INSUFFICIENT",
      "rationale": "one-line summary citing key fact(s) and why this verdict",
      "id": "peer-review-{topic}-{ISO-timestamp}"
    }
  ]
}
```

`scripts/append-attestation.sh` writes; `scripts/test-attestation-format.sh` is the regression suite. `write-review-gate.sh` validates each attestation: `rationale` must be ≥10 chars (general attestations); `kind=peer-review` attestations on algorithmic-paths commits must reference at least one cited fact or no-fact-found stub; duplicate `(kind, ref)` pairs are rejected. The pre-commit hook reads the gate and verifies required attestations exist for the staged file set. (829dc92)

For the algorithm-defensibility rationale specifically (`LATTICE_ALGORITHM_CHECK="pass:..."` or `skipped:...`), the validation is tighter post-2026-05-05 (C4): rationale must be ≥40 chars (was 10), must mention at least one staged file by basename or relative path (regex intersected with `git diff --cached --name-only` — forces grounding in the actual diff), and must not contain trivial substrings (`n/a`, `idk`, `tbd`, `no real reason`, `trust me`, `obviously`) anywhere in the text — substring blacklist, not exact-match. The framework's strongest algorithmic gate now has real teeth; pre-fix, an 11-char "n/a really" passed.

**SIMPLIFY auto-apply:** Architect findings flagged `Risk: None` (mechanical cuts — dead code, unused exports, redundant imports) auto-apply without user rubber-stamp. Non-trivial risk still routes to user. (ffbbb0f)

### SCIENCE-FLAG memo path

When a SCIENCE-FLAG fires under autopilot (rule 14, rule 18), the resolution contract is NOT "wait for SME." Autopilot authors a decision memo with ≥3 literature citations (species profiles, methods-index, peer-reviewed sources from `research/`) and proceeds. The memo path is wired into `workflows/research-cycle.yaml` and `workflows/blueprint-cycle.yaml` as a memo-required gate; the path is cited in the commit message and logged in `decisions.log`. If autopilot cannot find ≥3 citations supporting a defensible position, that itself is the escalation trigger and a row gets written to `ESCALATION.md`. (fc5fd38)

## 9. Concurrent Session Safety

When multiple agents work in parallel on the same repo:

- **Commit lock** (`scripts/acquire-lock.sh` / `release-lock.sh`) — atomic mkdir on `.lattice/commit.lock/`. Polls every 30s, 30min wall-clock stale threshold; `kill -0` (or `tasklist /FI` on Windows) PID-liveness override when metadata records a PID via `LATTICE_LOCK_PID` (dead → immediate force-clear; live → skip the wall-clock path). 2-second grace window before clearing a lock dir whose metadata file is absent (covers microsecond-scale legitimate races between `mkdir` and `write_meta`). Force-clears logged to `.lattice/decisions.log` for post-hoc audit. (C1, C2, post-2026-05-04 audit)
- **Topic WIP lock** (`scripts/acquire-topic-lock.sh` / `release-topic-lock.sh`) — per-topic `.lattice/cycle-lock/{topic}/`, mkdir-atomic, 60min wall-clock stale threshold (bumped from 30 in audit CRITICAL-3 + HIGH-5; long workflows like research-cycle through two peer-review rounds can exceed 30 min). Re-entrant for same holder. The engine `refreshTopicLock` heartbeat touches metadata mtime after every checkpoint write so normal long-running workflows never trip the stale path.
- **CAS-style state writes** (B1, post-2026-05-05) — `atomicWriteFileSyncCAS` (`executor/src/state-io.ts`) encodes the expected new revision in the temp filename (`<path>.tmp-rev-{N+1}`) and uses `linkSync` as a filesystem-atomic create-or-fail. Two writers racing for revision N+1 collide on `EEXIST`; the loser throws `RevisionMismatchError`. Closes the lost-update race that the prior in-memory revision check left open (each writer's local `expectedRevision` check passed independently, last writer won, first writer's bump silently lost). `revision_check: true` declared in every cycle YAML triggers the CAS path; legacy atomic temp+rename stays for non-checked writes.
- **Merge shared state** (`scripts/merge-shared-state.sh`) — wired into pre-commit Step 0a (C3). Refreshes TODO.md / REGISTRY.md / decisions.log / ROADMAP.md / MANIFEST.md from HEAD before this commit, preventing the case where agent B's commit overwrites agent A's just-committed appends to the same files. Soft-fails if script absent (deployment safety margin for consumers that haven't synced this update).
- **Staging-drift check** (pre-commit Step 4) — re-snapshots `git diff --cached` at hook exit; BLOCKS if files were added during the hook run. Catches concurrent autopilot `git add` interleaving with a manual commit (precedent: commits `1370c103`, `521f1d16`).

See CLAUDE.md "Concurrent Sessions" for full protocol.

## 10. Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `install-hooks.sh` | Install git hooks from `hooks/` to `.git/hooks/`. Refuses if `git config core.hooksPath` overrides the default — message names the override path and the unset instruction (C5). |
| `sync-skills.sh` | Sync `commands/lattice/`, `commands/ops/`, `agents/`, `docs/skills-includes/`, and `scripts/` (`*.sh` + `*.py`) from lattice to a consumer project. Runs automatically on lattice edits via the optional PostToolUse hook (Section 7). Partner files at `docs/skills-includes/` propagate so skills referencing them (e.g. `review.md → review-protocols.md`) don't hit broken pointers in the consumer. **Followed by `lattice resync <project>`** (post-2026-05-07, Phase 4): substitutes Pattern A template tokens (`{{lattice.X.Y}}`, `{{include:[optional:]project.X.Y}}`) in the synced skill bodies against the consumer's `lattice-project.toml`. Reports `0 errors, 0 with UNDEFINED sentinels` when complete; any sentinel flags a missing manifest key. The post-commit hook on the lattice repo invokes both in sequence (sync-skills then resync) so the consumer's `.claude/commands/*.md` bodies are concrete project-rendered prose by the time the harness loads them. |
| `sync-workflow-includes.{sh,py}` | Synthesize each consumer workflow's marker-delimited region from `workflows/_includes/*.yaml` (e.g. `science-flag-resolution.yaml`, `topic-lock.md`, `revision-checked-writes.md`). Replaces triplicated protocol bodies that previously lived inline across cycle workflows. `--check` mode for CI; non-zero exit when consumers drift from the include. |
| `write-review-gate.sh` | Mechanical checks before writing the review-gate file: executor TypeScript build (if `executor/` staged), algorithm-defensibility verdict (rule 18; if any staged file matches `.lattice/algorithm-paths.txt`, requires `LATTICE_ALGORITHM_CHECK=pass:<≥40-char rationale citing a staged file>` per C4), attestation validation (rationale, no trivial substrings, no duplicate kind+ref pairs), 7-section anchor enforcement against `.lattice/last-review-output.md` (D7). |
| `validation-ratchet.sh` | Capture / compare analytical validation scores. Improvement no longer auto-advances the baseline; emits `BASELINE-ADVANCE-PROPOSED` (exit 3) or advances on `LATTICE_RATCHET_CONFIRM_ADVANCE=1` (C6). |
| `acquire-lock.sh` / `release-lock.sh` | Atomic commit lock on `.lattice/commit.lock/` (polls every 30s, 30min wall-clock stale, PID-liveness override, 2s no-metadata grace). Autopilot acquires before staging (outer-held lock pattern, `922cf24`); pre-commit Step -1 also acquires when no outer holder is set (`20f2eb4`). |
| `acquire-topic-lock.sh` / `release-topic-lock.sh` | Per-topic WIP lock on `.lattice/cycle-lock/{topic}/` — prevents concurrent work on the same topic. 60-min wall-clock stale threshold, PID-liveness override (C1), 2s no-metadata grace (C2), engine heartbeat refreshes mtime after every checkpoint write. |
| `merge-shared-state.sh` | Refresh shared files (TODO.md, REGISTRY.md, decisions.log, ROADMAP.md, MANIFEST.md) from HEAD before commit. Wired into pre-commit Step 0a (C3). |
| `append-attestation.sh` / `test-attestation-format.sh` | SIMPLIFY-1 unified `attestations[]` format for `review-gate.json` — peer-review, architect, spec-lint, bug-pattern, retro-action verdicts all funnel through one format that `write-review-gate.sh` validates. |
| `design-session.sh` / `design-mode-gate.sh` | Design-mode preamble gate. `design-session.sh begin <trigger>` writes `.lattice/design-mode.lock`; `preamble-done <evidence>` validates the four `/lattice:design` Step 1 blocks; `design-mode-gate.sh` is a PreToolUse Write\|Edit hook that BLOCKS in-scope UI edits when the lock is `pending`. Stale locks (>1h) auto-clear. Failure mode prevented: port-mode redesign — relocating UI without engaging engine outputs. |
| `discovery-scan.py` | Discovery-scan template — runs corpus-wide pattern checks. Consumed by `/lattice:autopilot --discover` (LIT-03). |
| `audit-corpus-citations.py` / `audit-peer-review-citations.py` / `audit-novel-source-discovery.py` | LIT-DS literature trail audits — corpus-wide cite extractor + load-bearing classifier, retroactive peer-review citation extractor, novel-source discovery audit. Wired into `/lattice:peer-review` verify-before-citing gate. |
| `extract-pdf-text.py` | PyMuPDF text-extract wrapper used by `/lattice:lit-triage`. |
| `context-meter.sh` | Measure conversation context usage. Invoked by the optional PostToolUse Read hook (Section 7). |
| `tests/` | Shell-script regression tests for lock ownership, lock concurrency, install-hooks, validation-ratchet, shared-state merge, attestation format. |
