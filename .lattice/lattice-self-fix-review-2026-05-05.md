# Lattice Self-Fix — Delta Report (2026-05-05)

**Spec:** `incoming/lattice-self-fix-2026-05-05.md`
**Umbrella branch:** `lattice-stream-a` HEAD `ee05bc6`
**Window:** spec `b7715c5` → integration + audit follow-up `ee05bc6` (34 commits)

---

## 1. KEPT-25 status

All 25 KEPT items implemented and merged. One item per row; commit hash + brief evidence.

### Stream A — Foundations (4/4)

| Item | Commit | Evidence |
|---|---|---|
| A1 — Centralize SCIENCE-FLAG protocol | `0f9058f` | `docs/skills-includes/science-flag-protocol.md` authored; 11 inline restatements across 4 skills replaced with citations |
| A2 — Verdict enum registry | `5340fe6` | `workflows/verdict-enums.yaml` + `loader.ts:170-216` validateVerdictReferences; `loader-verdict-enums.test.ts` exercises typo rejection |
| A3 — Topic-lock + revision-checked-writes includes | `5b171af` | `docs/skills-includes/{topic-lock,revision-checked-writes}.md`; cycle skills lose 57 lines |
| A4 — `max_iterations` + 3 validate-time DAG checks | `ffb9ad8` | `types.ts` BaseNode.max_iterations; `loader.ts` validateMaxIterations + warnOrphanNodes + approval-route required; `engine.ts:421-470` checkVisitLimit; 4 workflow YAMLs migrated |

### Stream B — Executor hardening (5/5)

| Item | Commit | Evidence |
|---|---|---|
| B1 — CAS state writes | `4b04cc4` | `state-io.ts` atomicWriteFileSyncCAS via linkSync; `state-io.test.ts` +4 race tests |
| B2 — Argv-form bash | `29293b8` | BashNode.shell?: boolean (default false); tokenizeArgv in nodes.ts; 13-test `nodes-bash-injection.test.ts` |
| B3 — `!exists()` real fs check | `a5539ed` | `nodes.ts` evaluateCondition threads cwd; `nodes.test.ts` +11 cases |
| B4 — Coherence regex broadening | `9dcc6dc` | `coherence.ts` SUBSYSTEM_RE → `\bS(\d{2,3}[a-z]?)\b` |
| B5 — SCIENCE-FLAG empty-subsystems no-fanout | `39584f6` | `coherence.ts:799-820` setCoherenceWarnSink + skip-on-empty; 10 cases in `coherence.test.ts` |

### Stream C — Hook/script hardening (7/7)

| Item | Commit | Evidence |
|---|---|---|
| C1 — PID liveness | `24b7dc6` | `pid_alive()` (kill -0 + tasklist) in both lock scripts; 6 new test cases |
| C2 — No-metadata grace + LATTICE_LOCK_PID opt-in | `554b301` | 2s grace in acquire-lock.sh; opt-in env var prevents C1 from force-clearing fresh locks |
| C3 — merge-shared-state in pre-commit | `62bbef9` | `hooks/pre-commit` Step 0a; soft-fail when script absent |
| C4 — Algorithm-defensibility rationale | `621845f` | `write-review-gate.sh:159-225` ≥40 chars + staged-file ref + substring blacklist |
| C5 — install-hooks core.hooksPath check | `d50b197` | `install-hooks.sh:1-19` aborts on overridden hooksPath |
| C6 — Validation-ratchet auditability | `1868cbd` | BASELINE-ADVANCE-PROPOSED exit 3; opt-in via LATTICE_RATCHET_CONFIRM_ADVANCE=1 |
| C7 — Bug-retro keyword tolerance | `a101f6d` | More tolerant grep pattern in pre-commit + 7 test cases |

### Stream D — Skill/gate plumbing (7/7)

| Item | Commit | Evidence |
|---|---|---|
| D1 — build-cycle SCIENCE-FLAG resolver | `16446f2` | review-verdict gate routes `has_science_flag` through standard memo block; sync-workflow-includes.py extended |
| D2 — build-cycle path-entry F5/F3/SVA | `948c08c` | `pre-implement-gate` skill node fires architect-gate before implement |
| D3 — Probe SCIENCE-FLAG before SIMPLIFY | `702d7a0` | `blueprint-cycle.yaml` architect-verdict gate reorder — SCIENCE-FLAG cond first |
| D4 — Spike escalate-to-full lock release | `c62054b` | `escalate-release-lock` node downstream of escalate-to-full |
| D5 — agents/peer-review.md independence | `51b4ff3` | Inlined ~80 lines; zero `commands/lattice` cross-refs in agents/ |
| D6 — Subagent loading collision | `b6a470f` | `review.md` Agent D uses `subagent_type: peer-review` |
| D7 — 7-section anchor enforcement | `2b167c5` | `write-review-gate.sh:244-287` greps `.lattice/last-review-output.md` for 7 anchors |

### Stream E — Test coverage (4/4)

| Item | Commit | Evidence |
|---|---|---|
| E1 — evaluateCondition truth table | `bd459af` | `nodes.evaluate-condition.test.ts`, 24 cases |
| E2 — parseClaudeJsonOutput error-shape | `949e8ab` | `nodes.parse-claude-output.test.ts`, 29 cases (one-line `export` annotation in nodes.ts) |
| E3 — SF empty-subsystems contract | `56d17c0` + `be09c51` | `coherence.science-flag.test.ts`, 3 cases authored skipped pre-B5; unskipped + rewired post-merge in `be09c51` |
| E4 — DAG validate-time errors | `39f5655` | `dag.validate.test.ts`, 17 cases |

**Test count:** 23 (pre-spec) → **146** (post-integration); all pass; 0 skipped.

---

## 2. Cross-stream interaction surfaces

### B + E in `executor/src/nodes.ts`
B3 threaded `cwd` through `executeNode → executeGate → evaluateCondition`; E2 added `export` to `parseClaudeJsonOutput`. Auto-merged cleanly by `ort` strategy. Verified by `npx tsc --noEmit` pass + 146-test run.

### C + D in `scripts/write-review-gate.sh`
C4 added rationale tightening (≥40 chars + staged-file ref + substring blacklist) at lines 159–225; D7 added 7-section anchor enforcement at lines 244–287. Auto-merged. Both fire correctly together — C4's failure aborts before D7 runs; if rationale passes, D7's anchor check still fires.

### A4 + D YAML changes
A4's strict approval-route + max_iterations validators fired against D's new `pre-implement-stop-{science,reject,simplify}` approvals. All options have explicit routes. Loader runs clean across all 8 workflows post-integration.

### C2's LATTICE_LOCK_PID opt-in wiring
Stream C scope-widened C2 because pre-fix scripts wrote `$$` (own ephemeral PID) — without the opt-in, C1's PID-liveness check would force-clear every fresh lock. Verified that `hooks/pre-commit` sets `LATTICE_LOCK_PID=$$` when acquiring the commit lock; absent that, the lock falls back to clock-based stale (legacy behavior).

---

## 3. Scope decision evaluations

### D1 — pre-implement SCIENCE-FLAG → user-approval (not memo)
**Verdict: DEFENSIBLE.**
Rationale: At pre-implement time no diff exists, so on-data verification (Path 2a of rule 19) is impossible. The user-approval prompt at `build-cycle.yaml:101-128` cites all three valid clearance paths from rule 19 (revise / memo / named-defer). The memo block is reserved for post-review SCIENCE-FLAGs where citations have a target.

### D7 — anchor check skip-when-absent
**Verdict: DEFENSIBLE.**
Rationale: `commands/lattice/review.md:32-44` mandates writing `.lattice/last-review-output.md` as part of the review skill's contract. Skip path documented as trivial-fix-only — same trust model as `bash scripts/write-review-gate.sh pass "..."` for typo fixes. Future tightening (require file when staged paths match algorithm/contract regex) is a defer-trigger, not a defect.

### B2 — user-config setup/teardown in shell mode
**Verdict: DEFENSIBLE.**
Rationale: SCOPE-NOTE at `executor/src/e2e.ts:362-369` documents the boundary — `suite.setup` / `suite.command` / `suite.teardown` / `config.setup` / `config.teardown` are static YAML strings, not template-substituted from prior-node output. The B2 attack surface (prior-skill output substituted into a shell command line) does not apply. Forcing argv-mode would break every consumer's existing setup script for zero security gain.

---

## 4. Regression gate (AC5)

Independent peer-review audit run on integrated branch HEAD `be09c51`. Verdict pre-followup: **FAIL** — one Critical gate-bypass surfaced. Resolved at `ee05bc6` (`fix(audit-followup)`).

### Critical finding (resolved)

**`== true` (unquoted boolean) silently routed every build to SCIENCE-FLAG memo path.** The `evaluateCondition` `==` regex at `nodes.ts:531` required single-quoted RHS. Conditions like `{{X.has_science_flag}} == true` substituted to `false == true`, which didn't match the regex and fell through to the truthy-string fallback (`trimmed.length > 0 && trimmed !== 'false' && trimmed !== '0'`) — `"false == true"` is non-empty, not literally `"false"`, not literally `"0"`, so the function returned `true`. Every build/bug-fix/blueprint/research cycle routed the SCIENCE-FLAG branch regardless of the actual flag value.

The defect itself predates the spec (`blueprint-cycle.yaml:422,424` and `research-cycle.yaml:153,155` shipped the pattern on master); D1 extended the blast radius to `build-cycle.yaml:270` and `bug-fix-cycle.yaml:479,481`. Fix at the evaluator addresses both new and pre-existing sites.

**Resolution (`ee05bc6`):**
1. Added `== true|false` and `!= true|false` handlers in `evaluateCondition` — string-compare LHS against the literal `'true'`/`'false'` (matches how `resolveTemplate → extractJsonField` stringifies parsed JSON booleans via `String(value)`).
2. Tightened the truthy-string fallback to reject expressions containing recognized comparison operators (`==`, `!=`, `<=`, `>=`, `<`, `>`) that didn't parse — fail-loud rather than silent-truthy.
3. Five new regression tests in `nodes.evaluate-condition.test.ts`; pre-existing `<=` FOLLOW-UP test updated to assert post-fix loud-fail (since real numeric support is a separate follow-up). 151 tests pass.

### High finding (resolved by Critical fix)

`review-science-memo` node having `skill: null` is a non-issue post-Critical: the path now fires only when a real science-flag is present, and the workflow's `executeSkill` code path correctly handles a null-skill + non-empty `prompt_append` as an inline-prompt invocation. Worth a **schema-cleanup follow-up** to make the type-system reflect the intended "memo with prompt-only" mode, but not blocking.

### Medium / Low findings (deferred to TODO)

| ID | Severity | Description | Disposition |
|---|---|---|---|
| M1 | Medium | `== true` pattern still in 8 YAML sites — relies on the fixed evaluator | Defer; defense-in-depth quoting is a follow-up |
| M2 | Medium | `validateVerdictReferences` doesn't audit non-`.verdict` boolean fields | Defer; broader contract-validation pass |
| M3 | Low | `atomicWriteFileSyncCAS` leaves orphaned `.tmp-rev-N` on rename failure | Defer; not reachable in single-filesystem usage |
| M4 | Low | LATTICE_LOCK_PID wiring confirmed correct | No action |

### Verdict (post-followup)

**PASS.** No remaining Critical or High findings.

---

## 5. pcc integration test (AC4)

**`bash scripts/sync-skills.sh C:/pg/pcc` outcome:**

```
lattice : 28
ops     : 6
agents  : 4
partners: 5
scripts : 13 copied, 7 skipped (clobber-safe)
```

A1–A4 includes (`docs/skills-includes/{science-flag-protocol,verdict-enums,topic-lock,revision-checked-writes}.md`) synced cleanly. Stream B/C/D/E executor and skill files synced cleanly.

**Adoption gap:** 7+ pcc-side scripts have pre-existing uncommitted local edits, which the sync's clobber-safe check correctly refused to overwrite. The skip log at `C:/pg/pcc/.lattice/sync-skip.log` shows 12 distinct script paths blocked across multiple sync attempts: `acquire-lock.sh`, `acquire-topic-lock.sh`, `release-lock.sh`, `release-topic-lock.sh`, `merge-shared-state.sh`, `design-mode-gate.sh`, `install-hooks.sh`, `validation-ratchet.sh`, `write-review-gate.sh`, `test-attestation-format.sh`, `test-lock-ownership.sh`, `sync-workflow-includes.py`. Stream C's hardened versions (C1 PID liveness, C2 grace + opt-in, C4 tighter rationale, C5 hooksPath check, C6 ratchet auditability, C7 retro tolerance) have NOT propagated.

**To complete pcc adoption:** the user needs to either commit pcc-side current script state (clearing the clobber-safe blocker so the next sync overwrites) OR diff each pcc-side script vs lattice and merge manually. **Out of scope for this initiative** — the lattice work itself is complete; deployment to pcc is a user-driven step.

**`/lattice:review on a trivial pcc edit`:** Not run autonomously; this is an interactive skill the user invokes. Recommend running it post-pcc-adoption to validate the integrated framework end-to-end against a real consumer.

---

## 6. Open follow-ups (out of scope, file as TODO entries)

Surfaced during the work; left as `// FOLLOW-UP` comments in test files or `# SCOPE-NOTE` in source. Not blockers for shipping the spec.

1. **`evaluateCondition` `<=` / `>=` operators advertised in schema but unimplemented.** Falls through to truthy-string branch and silently evaluates true. (E1 finding; `nodes.evaluate-condition.test.ts`.)
2. **Un-substituted templates / state values containing `&&` or `||` re-introduce top-level operators** after `splitTopLevel` already ran. Gate routes to first option regardless. Fix candidates: single-quote substituted text, or parse-then-substitute. (E1 finding.)
3. **`merge-shared-state.sh` 3-way merge uses HEAD as both `.base` and `.head`.** Concurrent-append-on-the-same-file produces a delta that drops one side. C3 wired the script in correctly; the script's own merge-correctness limitation is pre-existing tech debt. (C3 finding.)
4. **`validation-ratchet.sh` requires `jq`.** Pre-existing dependency. C6's new test suite skips when jq is absent. (C6 finding.)
5. **D7 anchor check could be tightened to require the side-channel file when staged paths match algorithmic/contract regex.** Currently skip-when-absent preserves the trivial-fix escape hatch. Defer-trigger: observed bypass of full review on a non-trivial change. (D7 scope decision.)

---

## 7. Bottom line

**Ship-ready.** All 25 KEPT items implemented and merged; 4 cross-stream merges resolved cleanly; 3 explicit scope decisions evaluated DEFENSIBLE; the one Critical regression surfaced by the independent audit is resolved. 151 executor tests pass; all 8 workflow YAMLs load clean under the A4 strict validator. pcc adoption of Stream B/C/D scripts is partial pending user-driven resolution of pre-existing pcc working-tree edits — sync's clobber-safe protection working as designed.

The post-merge fix at `ee05bc6` is itself a useful artifact: it closes a Critical that predated the spec (in two workflow files) plus the two D1 sites that extended the blast radius, AND it tightens the evaluator's silent-truthy fallback in a way that prevents the same class of bug for `<=`/`>=`/un-substituted templates without locking in the broken behavior.

Recommended next steps:
1. (User-driven) Resolve pcc-side uncommitted script edits, re-run sync to pick up Stream C hardenings.
2. (User-driven) Run `/lattice:review` on a trivial pcc edit to validate the integrated framework end-to-end against a real consumer.
3. (Follow-up TODO) File the 5 deferred items from §6 into TODO.md.
4. (Optional) Implement real numeric `<=` / `>=` / `<` / `>` support in `evaluateCondition` to retire the FOLLOW-UP guard.

---

**Report authored:** 2026-05-05.
**Persisted at:** `.lattice/lattice-self-fix-review-2026-05-05.md` (per AC6).
