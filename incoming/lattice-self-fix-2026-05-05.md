# Lattice Self-Fix — Framework Hardening Spec

**Topic:** lattice-self-fix
**Date:** 2026-05-05
**Spec type:** Framework engineering (non-algorithmic, multi-stream)
**Provenance:** Audit findings from 2026-05-05 multi-agent review of `C:/pg/lattice/` (4 deep-dive agents covering workflows, executor, hooks/scripts, skills/agents). Findings persisted at the conversation transcript that produced this spec.

---

## Problem Statement

The 2026-05-05 audit produced ~50 findings across 4 layers. Cross-cutting themes:

- **(A) Honor-system bypasses** of the framework's "constraints, not just instructions" thesis — review.md's 7 mandatory sections, rule-18 algorithm-defensibility, and attestation rationale floor are all enforceable in prose only.
- **(B) Concurrency races** in lock primitives (lock-mkdir-then-die instant force-clear, no PID liveness, read-compare-write state mutation) — already-mitigated lock issues per the 2026-05-04 safety audit, but residual races remain.
- **(C) Verdict and SCIENCE-FLAG contract drift** across orchestrator skills — 3 different framings of the same protocol, peer-review subagent loading collision between `research-cycle.md` and `review.md`, an agent-independence violation in `agents/peer-review.md:18`.
- **(D) DAG entry-path holes** — `build-cycle` path-based entry skips F5 spec lint, F3 algorithmic peer-review, and SPEC-VALUE-AUDIT; `build-cycle.yaml` has no SCIENCE-FLAG resolver; unbounded loops in peer-review re-incorporate / synthesize re-entry / bug-fix self-fix; orphan node `cycle.yaml:213-222`; spike `escalate-to-full` lock leak.
- **(E) Executor injection vectors** — `nodes.ts:78` bash-node `execSync` runs prior-skill output through the shell unescaped; `autopilot.ts:671` reintroduces shell with bash-only syntax on a Windows-targeted codebase; `!exists()` returns `false` unconditionally; coherence regex `\bS\d{2}\b` invisible to S100+.
- **(F) Test-coverage gap** — 4 of 14 executor modules covered, 3 of 4 are CRITICAL-fix regression pins. The most failure-prone modules (verdict parser, condition evaluator, fan-out detector) entirely untested.

Audit citations are inline per-stream below. Severity is empirical (race conditions and gate bypasses observed possible from source) — not speculative.

---

## Pre-emptive Scope Table (rule 17 — SPEC-VALUE-AUDIT)

50 findings → 25 KEPT for this spec. The cuts below preempt SCOPE REDUCTION.

### Cut (deferred with named trigger)

| Finding | Defer rationale | Re-trigger |
|---|---|---|
| `chmod -x` defeats hooks | No observed instance; `--no-verify` is the dominant bypass | First time it surfaces in `decisions.log` as a force-clear or after-the-fact discovery |
| Wall-clock vs monotonic stale-detection | No observed clock-skew incident across 6 months of lattice usage | First clock-skew false-stale-clear |
| Auto-resolve free-text parser → structured tool-call | Currently works; complex SDK swap | Observed parser failure (NEEDS_HUMAN regression caused by prose wrapping) |
| Topic-name case collision on Windows | Single-user single-OS today | Multi-user adoption or cross-platform CI |
| CRLF-in-shebang | `install-hooks.sh` already runs from bash in this project | Reported "bad interpreter" failure |
| `python` vs `python3` PATH ambiguity | Windows-only concern; consumer's responsibility | Documented in install README, not enforced |
| `grep -oP` Perl mode portability | git-bash on Windows ships PCRE | Observed silent-no-op |
| Telemetry log unbounded | Already TODO'd in budget.ts comment | Existing TODO carries it |
| Sub-stream auto-resolve cycles | Single-loop cap (`--max-loops 50`) is sufficient for now | Observed multi-loop oscillation |
| Submodule commit-context (pre-commit:8) | Project-side concern, not lattice-side | Submodule adoption in lattice itself |
| Per-cycle approval gate for commits | Today's prompt-to-user pattern works; adding structural gate is feature creep | Observed silent-commit incident |
| Token-cost pre-flight estimation | Post-hoc enforcement is sufficient given checkpoint-and-stop default | Observed mid-call budget overrun >2× per_node limit |

12 findings cut. Each carries a defer-trigger; rule 13 (no unprompted deferrals) honored — these have either named technical dependencies or empirical thresholds.

### Kept — 25 items across 5 streams

See per-stream sections.

---

## Stream A — Foundations (sequential, blocks B-D)

Stream A produces the shared primitives that B, C, D reference. Doing A in parallel = three merge conflicts.

### A1. Centralize SCIENCE-FLAG resolution protocol

**Problem:** Three different framings of the same contract — `autopilot.md:132,207`, `architect.md:151,217`, `review.md:151-153`, `probe.md:76,201`. Reviewers launched from different orchestrators read different acceptance criteria.

**Fix:** Create `docs/skills-includes/science-flag-protocol.md` with the canonical contract (≥3 literature citations OR fix OR data-grounded counter-evidence OR named-dependency defer). Replace inline restatements in 4 skill files with `> See [SCIENCE-FLAG resolution](../docs/skills-includes/science-flag-protocol.md).`

**Validation:** `grep -r "≥3 literature citations" commands/` returns zero matches outside the include and the new pointer references.

**Risk:** None — content extraction.

### A2. Verdict enum registry

**Problem:** Architect: `PASS / SIMPLIFY / REJECT / SCIENCE-FLAG`. Peer-review: `SOUND / CONDITIONAL / FLAWED / INSUFFICIENT`. Probe: `SAFE / PROPAGATES / BREAKS / SCIENCE-FLAG`. Decision-auditor: `MERIT-SOUND / EFFORT-BIASED + UNPROMPTED-DEFERRAL / SILENT-DROP`. Mixed `==` and `.contains()` in YAML gates. No central registry.

**Fix:** Create `docs/skills-includes/verdict-enums.md` listing every gate's verdict set. Add validate-time check in `loader.ts` that any condition expression of form `{{nodes.<id>.output.verdict}} == 'X'` validates `X` against the gate-producing node's declared enum set. Skill prompts cite enum from the include, not redeclare.

**Validation:** Author a test workflow with a typo'd verdict (`'PSS'` instead of `'PASS'`); `lattice validate` exits non-zero.

**Risk:** Low — additive enum schema; existing workflows continue to work.

### A3. Extract triplicated boilerplate to skills-includes

**Problem:** Topic-lock acquire/release/heartbeat copy-pasted across `research-cycle.md:34-52`, `blueprint-cycle.md:34-50`, `build-cycle.md:20-37`. Revision-checked-writes section copy-pasted similarly. ~80 lines of triplication.

**Fix:** `docs/skills-includes/topic-lock.md` and `revision-checked-writes.md`; replace inline bodies with pointer references in 3 cycle skills. Re-run `sync-skills.sh`.

**Validation:** `wc -l` on the three cycle skills drops by ~80; behavior unchanged (skill prompts resolve include via existing skills-includes pattern).

**Risk:** None — content extraction.

### A4. Schema additions: `max_iterations`, validate-time DAG checks

**Problem:** Loops are unbounded — bikeshed `accept-r2` re-routes to `incorporate-r1` → `peer-review-r2` again with no round counter (`research-cycle.yaml:230-232`); blueprint-cycle approval routes back to `synthesize` with no re-entry counter (`:213-215, 226-228, 313-315, 328-330`); bug-fix-cycle `revise` → `fix` (`:582-584`) unbounded. Approval `options` without `route:` are silent stalls (`cycle.yaml:73-74`, `blueprint-cycle.yaml:486-490`). Orphan node `detect-from-files` (`cycle.yaml:213-222`).

**Fix:** Three schema additions in `workflows/schema.md`:
- `max_iterations: N` on any node — executor blocks re-entry past N.
- Validate-time check in `loader.ts`: every approval `option` requires a `route` field; every gate `route_to` references an existing node; orphan nodes (declared but unrouted-to) emit a validate-time warning.

**Validation:** Author test workflows exercising each new check; `lattice validate` exits non-zero on violations.

**Risk:** Low — additive schema; existing workflows pass unless they have the bugs.

---

## Stream B — Executor hardening (parallel after A)

### B1. CAS-style state writes

**Problem:** `engine.ts:606-655` `writeCheckpoint` does read → compare → write without a file lock. Two writers reading rev=N before either renames — last writer wins, lost update. Atomic rename prevents partial state but not interleaved overwrite.

**Fix:** Rename-as-CAS — encode revision in the temp filename (e.g., `state.yaml.tmp-rev-N`); destination uniqueness enforced atomically by the rename. Consistent with the existing `atomicWriteFileSync` pattern in `state-io.ts`. (SIMPLIFY 2026-05-05: dropped `O_CREAT|O_EXCL` tmp-lock alternative — introduces abandoned-lock cleanup risk that rename-as-CAS avoids natively.)

**Validation:** New test in `state-io.test.ts` exercises two concurrent writers reading rev=N; second writer must abort with `RevisionMismatch` regardless of interleave.

**Risk:** Low — internal change; revision-mismatch path already exists.

### B2. Argv-form for bash-node `execSync` and shell-string `git` calls

**Problem:** `nodes.ts:78` `execSync(command, …)` runs in shell. Topic input is allowlisted (`engine.ts:76-87`), but `extractJsonField` (`template.ts:118-139`) returns prior-skill output unescaped; downstream bash node consuming `{{nodes.X.output.field}}` is shell-injectable. `autopilot.ts:194` `git stash push -u -m "${label}" -- "${path1}"` quotes via `replace(/"/g, '\\"')` — Windows cmd.exe quoting differs.

**Fix:** Add `shell: true` opt-in field to bash-node schema. Default `shell: false` — executor forks `spawnSync('/bin/sh', ['-c', cmd])` only when explicitly enabled, otherwise tokenizes with proper argv. Convert all `git` calls in `autopilot.ts` and `e2e.ts` to `spawnSync('git', [...args])`.

**Validation:** New test fuzzes prior-skill output containing `; rm -rf $HOME`, `$(whoami)`, backticks; downstream bash node treats it as literal stdin/argv element, not interpreted.

**Risk:** Medium — touches every bash-node command. Existing workflows with shell features (pipes, redirects, `&&`) need explicit `shell: true`. Inventory pass: ~20 nodes total across workflows; manual audit at migration time.

### B3. `!exists()` actually checks the filesystem

**Problem:** `nodes.ts:387-390` returns `false` unconditionally with comment "Would need filesystem check." Gates depending on `!exists()` silently take the wrong branch.

**Fix:** Add `fs.existsSync(path)` check; resolve `path` relative to project CWD with template substitution.

**Validation:** Test in `nodes.test.ts` (newly created — see F1).

**Risk:** Low — currently always-false; fixing means previously-skipped branches now fire. Audit existing usages: per `Grep '!exists' workflows/`.

### B4. Coherence regex broadening

**Problem:** `coherence.ts:145` `\bS\d{2}\b` matches exactly 2 digits. S100+, S5, S05a all silently invisible.

**Fix:** `\bS\d{2,3}[a-z]?\b`.

**Validation:** Test in `coherence.test.ts` (newly created).

**Risk:** None.

### B5. SCIENCE-FLAG fan-out fix

**Problem:** `coherence.ts:799-801` `detectScienceFlagPropagation` falls back to `source.subsystems` when `sf.subsystems` is empty. One ill-typed flag flags every subsystem the source touches → blocks unrelated downstream work.

**Fix:** Empty `sf.subsystems` → log warning, do not propagate. Force callers to author SF with explicit subsystem scope.

**Validation:** New test fuzzes SF with empty subsystems; assert no propagation, warning logged.

**Risk:** Low — closes false-positive amplifier. Existing SFs without subsystem scope: inventory pass + remediation in same commit.

---

## Stream C — Hook/script hardening (parallel after A)

### C1. PID liveness in stale-lock detection

**Problem:** `acquire-lock.sh:80-83` and `acquire-topic-lock.sh:94-97` rely on wall-clock + mtime. Long-dead PIDs hold locks until threshold; healthy long-running processes can be force-cleared if `stat` fails (returns 0 → infinite age).

**Fix:** Parse `pid:` line from lock metadata. POSIX: `kill -0 $pid 2>/dev/null`; Windows git-bash: `tasklist /FI "PID eq $pid" /NH | grep -q $pid`. Liveness check overrides clock-based stale.

**Validation:** Extend `scripts/tests/test-lock-ownership.sh` with a stale-pid scenario (write meta with `pid: 99999999`, observe immediate force-clear) and a live-pid scenario (sleep + acquire, observe contention).

**Risk:** Medium — Windows tasklist behavior across PowerShell vs git-bash needs validation.

### C2. No-metadata grace period

**Problem:** `acquire-lock.sh:43-50`: process A wins `mkdir`, dies before `write_meta`. Process B sees lock-dir but no metadata, force-clears with **zero grace period** and reason `no-metadata` (`acquire-lock.sh:69-75`). Two concurrent legitimate acquirers race here.

**Fix:** No-metadata path waits 2 seconds, polls again. If still no metadata after 2s, then force-clear (caller likely died mid-acquire). 2s is fast enough that legitimate `mkdir → write_meta` racers complete; long enough to distinguish from death.

**Validation:** Test scenario: spawn 10 concurrent acquire-lock.sh processes; only one returns success; no force-clear logged for the losers.

**Risk:** Low — closes a known race; 2s delay is bounded.

### C3. `merge-shared-state.sh` wired into pre-commit

**Problem:** Script exists but `pre-commit` never calls it. Documented as "called AFTER acquire-lock.sh, BEFORE git add/commit" but no enforcement. Concurrent-agent shared-file overwrites still possible.

**Fix:** Add Step 0a in `hooks/pre-commit` — after lock acquire (Step -1) and before staging snapshot (Step -0.5), invoke `bash scripts/merge-shared-state.sh`. Soft-fail with warning if script absent (consumer projects that haven't synced); this is the safety margin.

**Validation:** Two-agent test: A modifies TODO.md, commits; B has unstaged TODO.md mod, runs `git commit`; pre-commit refreshes B's working copy and re-applies B's diff before staging.

**Risk:** Low — soft-fail-if-absent is the deployment safety margin. Default-on from day one. (SIMPLIFY 2026-05-05: dropped "feature flag for one consumer iteration" hedge — undefined config layer with no consumer; soft-fail clause already provides the safety margin.)

### C4. Algorithm-defensibility rationale validation

**Problem:** `write-review-gate.sh:109-149` accepts `LATTICE_ALGORITHM_CHECK="pass:any 11+ char string"`. The rule-18 enforcement floor is a 10-char rationale with a small trivial-string blacklist.

**Fix:** Tighten rationale validation:
- ≥40 chars (was 10).
- Must reference at least one staged file path: regex `\b[a-zA-Z0-9_/.-]+\.(ts|tsx|py|md|yaml|sh)\b` against the rationale string and intersect with `git diff --cached --name-only`.
- Trivial blacklist becomes substring-based (currently exact-match-lowercase): "n/a really" no longer passes.

**Validation:** New test cases in `scripts/test-attestation-format.sh`: garbage 10-char string fails; garbage 40-char string fails (no path ref); valid rationale citing staged file passes.

**Risk:** Low — strictly tighter; will surface existing weak-rationale attestations on first run.

### C5. `install-hooks.sh` inspects `core.hooksPath`

**Problem:** `install-hooks.sh:39-72` writes to `.git/hooks/pre-commit`, never checks `git config core.hooksPath`. If the user has it pointed elsewhere (prior `husky` install, monorepo convention), the install silently succeeds and git executes a different hook.

**Fix:** First step in `install-hooks.sh`:
```bash
HOOKS_PATH="$(git config --get core.hooksPath || true)"
if [ -n "$HOOKS_PATH" ] && [ "$HOOKS_PATH" != ".git/hooks" ]; then
  echo "ERROR: core.hooksPath is set to $HOOKS_PATH. Either unset (git config --unset core.hooksPath) or run install-hooks.sh against that path explicitly."
  exit 1
fi
```

**Validation:** Test: set `core.hooksPath` to `/tmp/test-hooks`, run install, observe error + non-zero exit.

**Risk:** None.

### C6. Validation-ratchet baseline auditability

**Problem:** `validation-ratchet.sh:188-191` silently overwrites baseline on improvement. Stealth bypass: ship cherry-picked improvement, advance baseline, ship regression that no longer trips ratchet.

**Fix:** Baselines live in git as `.lattice/validation-baseline.json`; advancement requires user-confirmation prompt + commit. Auditable via `git log` on the baseline file.

**Validation:** Test: ratchet `compare` after improvement returns "BASELINE-ADVANCE-PROPOSED" with diff; user confirms via env var or interactive prompt; baseline file commits.

**Risk:** Low — adds one user-touch on improvements; ratchet still auto-passes degradation-free runs.

### C7. Bug-retro keyword tolerance

**Problem:** `pre-commit:259-263` greps `1\. \*\*Root cause` only. `**1.** Root cause`, `1) Root cause`, `### Root cause` all fail. Cargo-cult formatting.

**Fix:** More tolerant pattern: `(^|\n)(\*\*1\.\*\*|1\.|1\)|###?) +.*[Rr]oot cause` (matches several common markdown shapes); same for the 5 retro fields.

**Validation:** Test the pattern against 3 valid format variants and 3 truly-missing cases.

**Risk:** Low — strictly more permissive on format, still requires the substance.

---

## Stream D — Skill/gate plumbing (parallel after A)

### D1. `build-cycle.yaml` SCIENCE-FLAG resolver

**Problem:** `build-cycle.yaml:103-118` captures only `verdict` from review. No `architect-science-memo` block analogous to bug-fix-cycle (`:472-588`). Algorithm-touching build can raise SCIENCE-FLAG (rule 19); nothing routes it. Silent passthrough.

**Fix:** Wire `build-cycle.yaml` to import the SCIENCE-FLAG resolution block from `workflows/_includes/science-flag-resolution.yaml` via the existing `sync-workflow-includes.{sh,py}` mechanism (already used by `bug-fix-cycle.yaml:472-588`, `research-cycle.yaml`, `blueprint-cycle.yaml`). Add the marker-delimited include region in `build-cycle.yaml` post-review; the sync script populates it. (Architect amendment 2026-05-05: stronger reuse than manual mirroring.)

**Validation:** Workflow test that injects `verdict: SCIENCE-FLAG` from review; verify the cycle pauses at `science-memo` rather than reaching `commit`.

**Risk:** None — additive nodes; existing PASS path unchanged.

### D2. `build-cycle` path-based entry runs F5/F3/SVA

**Problem:** A spec arriving directly to `incoming/` and picked up by `build-cycle` (`build-cycle.md:44-46`) skips F5 spec-lint, F3 algorithmic peer-review, and SPEC-VALUE-AUDIT. The framework's biggest gate hole.

**Fix:** Add a Layer-0 `pre-implement-gate` skill node in `build-cycle.yaml` that invokes `/lattice:architect gate {spec_path}` before `implement`. Architect gate dispatches Step 1.25 (F3 if algorithmic), 1.4 (F5 lint), 1.5 (SVA), 2 (architect-reviewer). Block on any non-PASS verdict.

**Validation:** Workflow test: feed an algorithmic spec lacking knowledge-graph citation; build-cycle blocks at `pre-implement-gate` before reaching `implement`.

**Risk:** Low — strictly tighter; gate is a skill node with one extra invocation per build. (SIMPLIFY 2026-05-05: dropped speculative cache-layer with undefined hash/storage/invalidation. If re-run latency proves a real pain point, add cache in a follow-on spec with defer-trigger "observed re-run latency complaint.")

### D3. Probe SCIENCE-FLAG no longer masked by architect SIMPLIFY

**Problem:** `blueprint-cycle.yaml:124-143` evaluates architect verdict before probe verdict. If architect=SIMPLIFY and probe=SCIENCE-FLAG, the SIMPLIFY branch matches first; probe's flag silently dropped.

**Fix:** Reorder gate conditions so SCIENCE-FLAG (from any source) evaluates before SIMPLIFY. Compose verdicts: any SCIENCE-FLAG anywhere routes to `science-memo`.

**Validation:** Workflow test injecting both verdicts; observe `science-memo` route.

**Risk:** None — strictly tighter routing.

### D4. Spike `escalate-to-full` releases lock

**Problem:** `spike-cycle.yaml:84-93` writes `phase: research` and exits. No `release-lock` route. Topic-lock dangling 30 minutes until stale clear.

**Fix:** Add `release-lock` node depending on `escalate-to-full`; route from `escalate-to-full` checkpoint to `release-lock` before workflow exit.

**Validation:** Workflow test that triggers escalate-to-full; assert `.lattice/cycle-lock/{topic}/` is empty after exit.

**Risk:** None.

### D5. `agents/peer-review.md` independence

**Problem:** `agents/peer-review.md:18` says "Read the full peer-review skill specification at `commands/lattice/peer-review.md`." Direct violation of agent-independence invariant; reviewer agents are supposed to have NO project-context references.

**Fix:** Inline the minimal protocol the agent needs into `agents/peer-review.md`. Remove the cross-reference. Algorithmic-tightening section, verdict enum, citation requirements all carried by the agent file directly.

**Validation:** `grep -rn 'commands/lattice' agents/` returns zero matches.

**Risk:** Medium — agent file grows ~80 lines. Acceptable given independence is the framework's core invariant.

### D6. Peer-review subagent loading collision

**Problem:** `research-cycle.md:152` says harness-load via `subagent_type: peer-review`, do NOT inline. `review.md:106` Agent D launches `general-purpose` with "use the prompt at `commands/lattice/peer-review.md`" (explicit inline). Two opposite contracts; ~10K-token spend differs per invocation.

**Fix:** Standardize on harness-load. Update `review.md:106` to use `subagent_type: peer-review` like the cycle skills.

**Validation:** `grep -rn 'use the prompt at.*peer-review' commands/` returns zero matches.

**Risk:** None — aligns with documented retired-2026-04-27 pattern.

### D7. Mechanical 7-section anchor enforcement in `write-review-gate.sh`

**Problem:** `review.md:20-30` declares 7 mandatory output sections, enforced by prose only. Compare to `design-mode-gate.sh` which has a real lock script.

**Fix:** `write-review-gate.sh` greps the latest review output (or a side-channel review-output file the skill writes to) for 7 named anchors:
```
^## CHANGES
^## ARCHITECT REVIEW
^## DECISION AUDIT
^## REQUIREMENT TRACE
^## MECHANICAL CHECKS
^## DOCS UPDATE
^## VERDICT
```
Missing any → exit non-zero with the missing list.

**Validation:** Test: write a review output missing DECISION AUDIT; gate fails with the right error message.

**Risk:** Medium — depends on `/lattice:review` reliably writing structured output. May need a side-channel JSON-or-markdown file for the gate to consume. Spec D7 includes the channel definition.

---

## Stream E — Test coverage (parallel from t=0, no dependencies)

### E1. `evaluateCondition` truth table

**Coverage gap:** `nodes.ts:348-399` evaluates condition expressions. Zero tests today. The condition language has at least 7 operators (`==`, `!=`, `<=`, `>=`, `contains`, `exists`, `&&`/`||`) plus the broken `!exists()`.

**Fix:** Test file `nodes.evaluate-condition.test.ts` with truth table covering: literal equality, numeric comparison, multi-operand boolean, contains-substring, exists/!exists (including the B3 fix), un-substituted template detection.

**Risk:** None.

### E2. `parseClaudeJsonOutput` error-shape fan-in

**Coverage gap:** `nodes.ts:473-517` parses Claude CLI output. `is_error: true`, malformed JSON, empty stdout, error-shaped text in non-error JSON, partial cost telemetry — all paths untested.

**Fix:** Test file `nodes.parse-claude-output.test.ts` covering each fan-in shape with fixture JSON.

**Risk:** None.

### E3. `detectScienceFlagPropagation` empty-subsystem fan-out

**Coverage gap:** `coherence.ts:799-801` (post-B5 fix). Test that empty `sf.subsystems` does NOT propagate; warning logged.

**Fix:** Test in `coherence.science-flag.test.ts`.

**Risk:** None.

### E4. DAG validate-time error cases

**Coverage gap:** `dag.ts` cycle detection has tests; the new validate-time checks from A4 (orphan nodes, unrouted approval options, gate-routed-to-nonexistent) don't.

**Fix:** Test file `dag.validate.test.ts` with one workflow per error case; assert `loader.ts` rejects with the right error message.

**Risk:** None.

---

## Stream Dependencies

```
A.1 SCIENCE-FLAG include       ──┐
A.2 verdict enum registry       ─┤
A.3 boilerplate extraction      ─┤
A.4 schema additions            ─┤
                                 │
                                 ├──→ B.1 CAS state writes
                                 ├──→ B.2 Argv-form
                                 ├──→ B.3 !exists()
                                 ├──→ B.4 coherence regex
                                 ├──→ B.5 SF fan-out
                                 │
                                 ├──→ C.1 PID liveness
                                 ├──→ C.2 No-metadata grace
                                 ├──→ C.3 merge-shared-state wired
                                 ├──→ C.4 rationale validation
                                 ├──→ C.5 hooks-path inspection
                                 ├──→ C.6 ratchet auditability
                                 ├──→ C.7 retro keyword tolerance
                                 │
                                 ├──→ D.1 build-cycle SF resolver
                                 ├──→ D.2 build-cycle path-entry gates
                                 ├──→ D.3 SF before SIMPLIFY
                                 ├──→ D.4 spike lock release
                                 ├──→ D.5 agent independence
                                 ├──→ D.6 subagent loading
                                 └──→ D.7 7-section anchor

E.1, E.2, E.3, E.4 (parallel from t=0)
```

Stream A is sequential; B/C/D/E parallel via git worktrees.

---

## Execution Plan

1. **Branch strategy:** umbrella `lattice-self-fix`; sub-branches `lattice-self-fix/stream-{a,b,c,d,e}`. Each merges into umbrella; umbrella → main as one PR.
2. **Worktree pattern:** `git worktree add ../lattice-stream-b lattice-self-fix/stream-b` per stream. Concurrent work without `.lattice/cycle-state/` collisions or `commit.lock` contention. Critical for this work specifically because we're modifying the very lock primitives.
3. **Per-stream completion:** each item in a stream completes with: implementation + validation test + decisions.log entry. Stream completes when all items pass + integration test against pcc.
4. **Cross-stream integration:** stream-A merges into umbrella first; B/C/D rebase onto umbrella as A lands. E is independent.
5. **pcc sync:** `sync-skills.sh` after every umbrella merge — pcc must validate before next stream merges.

---

## Acceptance Criteria

This spec is COMPLETE when:

1. All 25 items above implemented + tested.
2. Re-running the same 4 deep-dive audit agents on post-fix tree produces a delta report:
   - Every KEPT finding closed (or explicit residual + rationale).
   - No NEW high-impact finding (high-impact defined as: gate-bypass, race condition, injection vector, contract drift across ≥2 skills).
3. `npm test` from `executor/` passes; `bash scripts/tests/test-lock-ownership.sh` passes.
4. Integration test against pcc: `cd C:/pg/pcc && bash C:/pg/lattice/scripts/sync-skills.sh .` then `/lattice:review` on a trivial pcc edit completes without error.
5. Regression gate: re-run `/lattice:architect gate` on the post-fix tree (the post-fix architect gate may itself have changed via D2/A4 — this is a regression check, not a circular self-review). Standard: no NEW Critical or High findings introduced by the fix.
6. Delta report persisted at `lattice/.lattice/lattice-self-fix-review-{date}.md`. (SIMPLIFY 2026-05-05: rephrased AC5 from "self-review" — clarified intent as regression check, not circular PASS.)

---

## Spec Value Audit (rule 17)

Per-stream, not per-finding (each stream is the unit of value).

### Aggregate questions (8-10)

**Q8 — Orthogonal or categorical?** Orthogonal. Each stream addresses a distinct failure class evidenced in the audit:
- A: Cross-cutting drift (3 skills disagree on SCIENCE-FLAG).
- B: Executor primitives (3 races, 1 injection vector, 1 broken predicate).
- C: Hook bypass surface (5 distinct mechanisms).
- D: DAG entry-path holes (5 distinct silent-stall routes).
- E: Test debt (4 highest-leverage modules).

The cuts (12 deferred items) demonstrate non-categorical reasoning — items without observed-incident evidence or with named technical dependencies were dropped, not kept.

**Q9 — Preserves shipped functionality?** Yes — every fix is strictly behavior-preserving for non-buggy paths. New gates (D1, D2, D7, A4) only fire on previously-silent-stall conditions. The single highest-risk item is B2 (argv-form bash) which forces explicit `shell: true` opt-in for ~20 existing nodes; mitigated by inventory pass + opt-in field default.

**Q10 — Duplicate of existing surface?** No — each fix targets a named gap, not a parallel surface. Closest case: D7 (anchor enforcement) overlaps with `design-mode-gate.sh` pattern; the answer is "use the same pattern for review-gate," not "build a new surface."

### Per-stream questions (1-7)

#### Stream A — Foundations (4 items)

| Q | Answer |
|---|---|
| 1. User problem | Reviewers launched from different orchestrators read different acceptance contracts (SCIENCE-FLAG); 80 lines of triplicated boilerplate; no validate-time check for unbounded loops or orphan routes |
| 2. Frequency | Drift observed today (3 SCIENCE-FLAG framings); triplication audit-confirmed; orphan node verified at `cycle.yaml:213-222`; unbounded loops verified across 5+ YAML routes |
| 3. Workaround | Today: hope orchestrators converge. After divergence: incident-driven retroactive sync (e.g., 2026-04-27 retired-pattern fix) |
| 4. Downstream impact | Token spend differs ~10K per launch (peer-review subagent collision); SCIENCE-FLAG lands in commit when build-cycle reaches it (rule-19 violation); orphan nodes deceive readers about routing |
| 5. Cheaper alternative | None — these are the foundations B/C/D depend on. Doing without = three merge conflicts |
| 6. Already exists | Partially: `skills-includes/` directory exists; SCIENCE-FLAG concept documented in 4 places. The fix is consolidation, not invention |
| 7. Cost vs value | ~300 LOC added (skills-includes content + schema check), ~80 LOC removed (deduplication). Stream A unblocks 21 downstream items |

#### Stream B — Executor hardening (5 items)

| Q | Answer |
|---|---|
| 1. User problem | Lost-update on concurrent state writes (B1); shell injection via prior-skill output (B2); silent wrong-branch on `!exists()` (B3); SF false-positives across 25 subsystems with `S100+` blind spot (B4, B5) |
| 2. Frequency | B1: any concurrent autopilot run; B2: any skill emitting structured field output; B3: any workflow using `!exists()`; B4: blocked at S100+; B5: observed test-fixture failure |
| 3. Workaround | B1: don't run concurrent autopilot (currently de-facto rule); B2: trust skill output (no defense); B3: don't use `!exists()`; B4: stay under 100 subsystems |
| 4. Downstream impact | B1: silent state corruption in cycle-state YAMLs; B2: arbitrary code execution in agent context; B3: wrong workflow branch executes; B4: coherence engine blind to >100 subsystem; B5: blocks unrelated topics |
| 5. Cheaper alternative | B1: rely on outer locks (current; insufficient under concurrent autopilot); B2: stronger output sanitization (intractable for free-text fields); B3: drop the operator (workflow currently doesn't need it; deferring is the cheap path but B3 fix is one line); B4: rename subsystems (perverse) |
| 6. Already exists | revision-checked-write was the previous attempt at B1; argv-form pattern exists in `nodes.ts:177-184` for skill calls (extending to bash is mechanical) |
| 7. Cost vs value | B1: ~50 LOC + test; B2: ~80 LOC + audit pass; B3: 5 LOC + test; B4: 1 LOC + test; B5: 10 LOC + test. Total ~150 LOC. Closes 5 distinct correctness/security defects |

#### Stream C — Hook/script hardening (7 items)

| Q | Answer |
|---|---|
| 1. User problem | Lock-stuck-after-process-death (C1); concurrent-acquire force-clear race (C2); shared-state lost updates between concurrent agents (C3); rule-18 enforcement passable with garbage 11-char string (C4); silent hook no-op when `core.hooksPath` set (C5); stealth-bypass of validation-ratchet via cherry-picked improvement (C6); cargo-cult retro formatting (C7) |
| 2. Frequency | C1: every PID-stuck recovery; C2: any concurrent acquire race; C3: every concurrent-agent commit; C4: every algorithm-defensibility check today (audit confirmed `pass:any 11+ char string` accepted); C5: any user with prior `husky`/monorepo hook setup; C6: per-improvement ratchet advance |
| 3. Workaround | C1: 5-30 min wait; C2: hope no race; C3: manual coordination; C4: trust agent (current); C5: discover via failed gate weeks later; C6: none (ratchet baseline silent advance is the bug) |
| 4. Downstream impact | C1-C2: lock unavailability blocks autopilot batch; C3: TODO.md / ROADMAP.md / decisions.log lost edits; C4: rule-18 fails open on every commit it's claimed to enforce; C5: every other hook gate is also no-op; C6: regressions ship undetected |
| 5. Cheaper alternative | C1: longer stale threshold (currently 1800/3600s — already raised once; doesn't fix correctness); C4: human-confirm every algorithm check (latency); C6: read-only ratchet (loses improvement signal) |
| 6. Already exists | Lock metadata + ownership check exists post-2026-05-04 audit; this extends it. Ratchet exists; this adds auditability |
| 7. Cost vs value | C1: ~30 LOC (cross-platform); C2: ~10 LOC; C3: ~20 LOC + ordering; C4: ~30 LOC + tests; C5: 10 LOC; C6: ~50 LOC + commit flow change; C7: 5 LOC. Total ~155 LOC. Closes 7 distinct enforcement bypasses |

#### Stream D — Skill/gate plumbing (7 items)

| Q | Answer |
|---|---|
| 1. User problem | SCIENCE-FLAG silent passthrough in build-cycle (D1); algorithmic specs bypassing F3/F5/SVA via path-entry (D2); probe SCIENCE-FLAG masked by architect SIMPLIFY (D3); spike escalation lock leak 30min (D4); agent independence violated (D5); subagent loading wastes 10K tokens per launch when the inline pattern is invoked (D6); review's 7 sections enforced by prose (D7) |
| 2. Frequency | D1: every algorithm-touching build (rule 19 paths); D2: every direct-`incoming/` build (currently the autopilot TODO-queue and `build-cycle.md:44-46` document this entry); D3: any concurrent SIMPLIFY+SCIENCE-FLAG (rare but possible); D4: every spike escalation; D5: agent invariant; D6: every `/lattice:review` invocation that reaches Agent D path; D7: every review |
| 3. Workaround | D1: hope nobody raises SCIENCE-FLAG mid-build (rule 19 = silent fail); D2: route through architect manually (not what the path is for); D3: hope they don't co-occur; D4: wait 30min; D5: review project context bleeds into agent — silent quality regression; D6: pay 10K tokens; D7: hope reviewers write all 7 sections |
| 4. Downstream impact | D1: indefensible algorithm output ships; D2: gate hole nullifies F3/F5/SVA design; D3: dropped flag = unaddressed scientific concern; D4: blocks autopilot batch; D5: agent reads project paths it shouldn't; D6: cumulative token cost; D7: incomplete review passes gate |
| 5. Cheaper alternative | D1: direct architect routes everything (vs adding memo path) — already the pattern; copying it is the cheap path; D2: declare path-entry deprecated (loses the autopilot TODO route); D7: human-review the review (defeats the gate) |
| 6. Already exists | bug-fix-cycle has the SF resolver template (D1 reuse); architect gate has the F5/F3/SVA stack (D2 reuse); design-mode-gate has the anchor-enforcement pattern (D7 reuse) |
| 7. Cost vs value | D1: ~50 LOC YAML + test; D2: ~30 LOC YAML + cache layer; D3: ~10 LOC YAML reorder; D4: ~10 LOC YAML; D5: ~80 LOC inline; D6: ~5 LOC change; D7: ~80 LOC + side-channel definition. Total ~265 LOC. Closes 7 distinct gate holes |

#### Stream E — Test coverage (4 items)

| Q | Answer |
|---|---|
| 1. User problem | Highest-failure-mode-density modules (verdict parser, condition evaluator, fan-out detector, DAG validator) entirely untested |
| 2. Frequency | Every executor run touches at least 2 of these |
| 3. Workaround | Manual integration testing post-deploy (current); regression-pin tests exist for the 3 CRITICAL fixes from 2026-05-04, none for the rest |
| 4. Downstream impact | Future fixes have no validation backstop; refactoring confidence near zero |
| 5. Cheaper alternative | Defer until next regression (rule 16 violates if claims about behavior aren't backed by tests) |
| 6. Already exists | Test infrastructure exists (`executor/src/*.test.ts` + Node test runner); patterns established |
| 7. Cost vs value | ~200 LOC of test code. Backstops every other stream's fix |

---

## Considered and Rejected (audit trail for the cuts)

The 12 items in the Pre-emptive Scope Table cuts above are the formal audit trail. Per CLAUDE.md rule 13, every cut carries a defer-trigger; absent the trigger, the item is reconsidered.

Three items deserve explicit rejection rationale (not just defer):

**Validation-ratchet "snapshot baseline in git" was contested vs C6's "user-confirm prompt".** Choice: user-confirm prompt + git-tracked baseline. Rationale: silent advance is the bug; both auditability paths address it. User-confirm forces deliberation; git-tracking enables retrospective review. Doing both is cheap and complementary.

**Pre-flight token estimation was contested vs post-hoc enforcement.** Choice: post-hoc + checkpoint-and-stop default. Rationale: pre-flight estimation needs token-counting heuristics that drift across model versions; checkpoint-and-stop default already prevents the dominant failure mode (research → blueprint → build context accumulation). Re-trigger if a single skill call exceeds 2× per_node limit.

**Auto-resolve free-text → structured tool-call was contested vs leaving as-is.** Choice: leave as-is. Rationale: works currently; the SDK swap touches every skill-launching codepath. Re-trigger on observed parser failure.

---

## Re-review Protocol

After umbrella merge:

1. Same 4 audit prompts re-run on post-fix tree (workflows / executor / hooks-scripts / skills-agents).
2. Findings persisted to `.lattice/lattice-self-fix-review-{date}.md`.
3. Compare against this spec's KEPT-25 list:
   - Each KEPT item: closed / partial / open?
   - Each CUT item: still cut?
   - NEW findings: classify by impact; high-impact NEW = scope creep introduced during fix.
4. Surface delta to user; gate next step.

This is the validation step — re-running the framework on itself after the fix.

---

## Out of Scope

- Multi-platform executors (phone / Slack / web). Documented intent in `WORKFLOW.md` and `workflows/schema.md`; no current consumer.
- Slack inbound (LIT-12). Separate spec.
- Pre-flight token estimation / context-rot prediction. Defer per Pre-emptive Scope Table.
- TDD-for-non-scientific-code expansion (LIT-06 already RESOLVED with narrow mandate).
- New observability (cost trend charts, anomaly detection). LIT-02 ENH-02 deferred items.

---

**End of spec.**
