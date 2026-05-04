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

## 1. Review Gate (`scripts/write-review-gate.sh` + `.git/hooks/pre-commit`)

Every commit requires a review gate file (`.lattice/review-gate.json`). Two ways to create it:

- `/lattice:review` -- full quality gate with architect review, decision audit, requirement trace
- `scripts/write-review-gate.sh` -- mechanical checks only (build, tests, syntax). Escape hatch for trivial commits.

The pre-commit hook verifies the gate file exists and is fresh (<30 min), runs build checks on staged code files, emits index freshness and complexity advisories, and consumes the gate after a successful commit (single-use).

## 2. Validation Ratchet (`scripts/validation-ratchet.sh`)

Measures analytical correctness against ground truth studies. Not binary keep/discard: degradation routes to research.

```
baseline  -- capture current validation scores
compare   -- compare current vs baseline
auto      -- baseline (if needed) + regenerate all studies + compare

Exit codes: 0 = same/improved, 2 = degradation detected
```

**Degradation handling:** Degradation doesn't mean rollback. It means analytical behavior changed. The ratchet identifies WHICH signals/assertions changed. The agent must determine: expected (documented in spec) -> update ground truth, or unexpected -> route to `/lattice:research`.

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
  warn_threshold: 0.5          # log a warning at 50% utilization
  block_threshold: 0.75        # stop workflow at 75% utilization
```

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

**PreToolUse on `Bash(git commit *)`:**

| Hook | Action |
|------|--------|
| **Commit lock** | BLOCKS if another agent holds `.lattice/commit.lock`. Auto-expires stale locks >5min. Pre-commit Step -1 acquires when no `LATTICE_LOCK_HOLDER` env is set; honors outer-held lock (autopilot, `/lattice:review`) when set, to prevent staging-drift conflation across concurrent commits. (922cf24, 20f2eb4) |
| **Topic trailer** | WARNS (non-blocking) when `feat:`/`fix:` commits lack a `Topic:` trailer. |
| **Review gate** | BLOCKS ALL commits without a fresh `.lattice/review-gate.json`. |

**PreToolUse on `Write|Edit|MultiEdit`:**

| Hook | Action |
|------|--------|
| **Design-mode preamble gate** (`scripts/design-mode-gate.sh`) | BLOCKS in-scope `.tsx`/`.html`/`.ts` edits when `.lattice/design-mode.lock` exists with `preamble=pending`. The lock is created by `design-session.sh begin <trigger>`; flipped to `complete` by `preamble-done <evidence>` after the four `/lattice:design` Step 1 blocks (workflow audits, existing surfaces, first-principles, convention check) are authored to an evidence file. Stale locks (>1h) auto-clear. Out-of-scope files always allowed. Failure mode prevented: port-mode redesign — relocating UI without engaging engine outputs. (de8c1af, 09843ee, b349c71) |
| **Block pcc-mirror edits** *(optional, user-global)* | DENIES Write/Edit/MultiEdit on `<project>/.claude/{commands/lattice/, commands/ops/, agents/}/...` with a message naming the lattice equivalent. Reinforces the "lattice is source of truth" rule physically — direct edits to consumer-project mirrors get clobbered on the next sync. See lattice/CLAUDE.md "Propagating Framework Changes to Consumer Projects". |

**PostToolUse on `Write|Edit|MultiEdit`:**

| Hook | Action |
|------|--------|
| **Co-author block** | BLOCKS writes containing `Co-Authored-By` (rule 4). |
| **Build check** | Advisory -- runs TypeScript build after edits to code files. |
| **Lattice → consumer sync** *(optional, user-global)* | When the edited file is under `C:/pg/lattice/{commands,agents,scripts,docs/skills-includes}/...`, runs `bash C:/pg/lattice/scripts/sync-skills.sh <consumer>` for each registered consumer project and emits a `systemMessage` confirmation. Consumers list lives in the hook script. Removes the human-memory dependency of "remember to sync after editing lattice." Skill partner files at `docs/skills-includes/` propagate alongside `commands/` so by-path references (e.g. `review.md → review-protocols.md`) don't drift into broken-pointer state. |

## 8. Structural Quality Gates

File-based checks that cycle orchestrators run on skill outputs before proceeding:

| Gate | What it checks | Blocks proceed on failure |
|------|---------------|--------------------------|
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

`scripts/append-attestation.sh` writes; `scripts/test-attestation-format.sh` is the regression suite. `write-review-gate.sh` validates each attestation: `rationale` must be ≥10 chars and not match a trivial value (`n/a` / `idk` / `tbd` / etc.), and `kind=peer-review` attestations on algorithmic-paths commits must reference at least one cited fact or no-fact-found stub. The pre-commit hook reads the gate and verifies required attestations exist for the staged file set. (829dc92)

**SIMPLIFY auto-apply:** Architect findings flagged `Risk: None` (mechanical cuts — dead code, unused exports, redundant imports) auto-apply without user rubber-stamp. Non-trivial risk still routes to user. (ffbbb0f)

### SCIENCE-FLAG memo path

When a SCIENCE-FLAG fires under autopilot (rule 14, rule 18), the resolution contract is NOT "wait for SME." Autopilot authors a decision memo with ≥3 literature citations (species profiles, methods-index, peer-reviewed sources from `research/`) and proceeds. The memo path is wired into `workflows/research-cycle.yaml` and `workflows/blueprint-cycle.yaml` as a memo-required gate; the path is cited in the commit message and logged in `decisions.log`. If autopilot cannot find ≥3 citations supporting a defensible position, that itself is the escalation trigger and a row gets written to `ESCALATION.md`. (fc5fd38)

## 9. Concurrent Session Safety

When multiple agents work in parallel on the same repo:

- **Commit lock** (`scripts/acquire-lock.sh` / `release-lock.sh`) -- atomic mkdir, polls every 30s, 5min stale threshold
- **Topic WIP lock** (`scripts/acquire-topic-lock.sh` / `release-topic-lock.sh`) -- prevents two agents from working on the same topic, 30min stale threshold
- **Merge shared state** (`scripts/merge-shared-state.sh`) -- refreshes TODO.md, ROADMAP.md, etc. from HEAD before committing
- **Revision-checked writes** -- state file `revision: N` field, re-read before write, abort on mismatch

See CLAUDE.md "Concurrent Sessions" for full protocol.
