# Architect Review: worktree-isolation synthesis

> **Reviewed:** `C:/pg/lattice/incoming/worktree-isolation-synthesis.md`
> **Research artifact:** `C:/pg/lattice/research/worktree-audit-2026-05-09.md`
> **Reviewer role:** independent architect (gate mode, blueprint-cycle Step 2)
> **Date:** 2026-05-09

---

## Summary

The synthesis is well-grounded, empirically honest, and structurally sound. The four cited conflict hashes (1370c103, 521f1d16, a47ee865, abdb31c9) are verified real commits in the pcc repo. Decisions.log line 678 is real and says exactly what the synthesis claims. The reuse audit is thorough and the design-question resolutions are mostly good. Five targeted findings below — two require fixes before build, three are notes. The overall structure of R0 as destination and R1/R2/R3 as independent parallel advances is the right decomposition.

---

## Verdict: SIMPLIFY

Two simplifications required before build. Three advisory notes. No REJECT-class issues.

---

## Complexity Issues

### Issue 1 (BLOCKING): `LATTICE_EXEMPTION_RATIONALE` trivial-string rejection list is config-driven accidental complexity

**Location:** Synthesis Section 4 D4 — "Rejection list (trivial rationales): maintained in `scripts/lattice-rationale-rejection-list.txt`. Per-project additions allowed."

**Pattern:** Config for a behavior that would never change in any project that takes worktree isolation seriously. The list (`["fix", "test", "wip", "edit", "update"]`) is short enough to inline. The per-project-additions hook adds a file dependency and a configuration surface for something with effectively one right answer.

**Specific problem:** `scripts/lattice-rationale-rejection-list.txt` has a single consumer (`require-worktree.sh`). There is no case where a lattice project would want to REMOVE words from this rejection list, and adding to it is an edge case that does not justify a separate file. This is the "config for a fixed behavior" anti-pattern.

**Fix:** Inline the rejection list inside `require-worktree.sh` as a shell array. If per-project additions are genuinely needed, have `lattice-project.toml`'s `[project.worktree]` block carry an `additional_trivial_rationales` array that the script reads via `git config` or `toml` parse — but do NOT introduce a standalone `.txt` file. The simpler fix is: remove the per-project-additions path entirely. No project has asked for it. Per synthesis Section 1b's own 1-consumer rule: 1 consumer = no abstraction.

---

### Issue 2 (BLOCKING): `.lattice/` symlink on Windows requires Developer Mode or elevated privileges

**Location:** Synthesis Section 4 D1 — "Windows compatibility: Git Bash and WSL both support symlinks."

**Specific problem:** The synthesis claims Windows compatibility is verified, but the evidence it cites ("Git Bash and WSL both support symlinks") is incomplete. On Windows, creating symlinks via `ln -s` in Git Bash requires either (a) Developer Mode enabled, or (b) running the terminal as Administrator. Neither is the default developer setup. `fsutil behavior query SymlinkEvaluation` on this machine shows Local-to-local symlink evaluation is ENABLED at the OS level, but `ln -s` in Git Bash can still fail with `permission denied` or silently create a junction instead of a true symlink if the process lacks the `SeCreateSymbolicLinkPrivilege` privilege. The synthesis says "Verified: pcc runs on Windows 11" but does not verify that `lattice-session-start.sh` can create symlinks unprivileged on the target machine.

**Why this matters:** `lattice-session-start.sh` is the single point of failure for every worktree session. A silent fallback to a hard copy (or a crash) at session creation time would break the entire R0/R1 contract. This is not a theoretical risk — it is the documented failure mode on Windows developer machines without Developer Mode.

**Fix:** `lattice-session-start.sh` must detect symlink creation failure explicitly and fall back to the `LATTICE_PROJECT_ROOT` env-var approach (not silently, not to a hard copy). The synthesis has already designed the env-var approach as the alternative (D1 resolution cites it as "env var is more explicit"). The fix is: attempt symlink, catch failure, fall back to env-var approach with a printed warning that explains what happened. The `LATTICE_PROJECT_ROOT` fallback must be documented as the Windows-without-Developer-Mode path. This collapses a risk into a known fallback, not an outage.

The synthesis Section 1b claims symlink is "simpler for shell scripts." That is true on Unix. On Windows, the env-var approach is simpler because it requires zero special privileges. The session-start helper should auto-detect and use the right strategy.

---

## Reuse Opportunities

### Reuse 1 (advisory): `declare-commit-intent.sh` idiom for merge-back validation

The proposed `lattice-session-end.sh` validates that the session branch is fast-forwardable before merging. The existing `pcc/scripts/declare-commit-intent.sh` has a clean pattern for "validate precondition, emit actionable error, exit 1" that `lattice-session-end.sh` should copy structurally. Not a blocking issue — but the build agent should read `declare-commit-intent.sh` before writing `lattice-session-end.sh` to avoid reinventing the error-message formatting pattern.

### Reuse 2 (advisory): `acquire-lock.sh`'s PID-liveness check for orphan detection in `lattice-worktree-prune.sh`

`acquire-lock.sh:86-102` already implements a `pid_alive()` function that handles both POSIX `kill -0` and Windows `tasklist` fallback. The proposed `lattice-worktree-prune.sh` needs to determine whether a session's owning process is still alive before classifying the worktree as orphaned. The build agent should import or copy the `pid_alive()` logic rather than writing a new process-liveness check from scratch. `acquire-lock.sh` is the only place in the codebase that handles this cross-platform edge case correctly.

---

## Science Flags

None. This is infrastructure work — no scientific algorithms, no SEND domain logic, no study data dependencies. Confirmed: the proposed changes touch `executor/src/autopilot.ts`, `executor/src/e2e.ts`, agent frontmatter files, hook scripts, and config templates. None of these files are in the algorithm-paths inventory (`frontend/src/lib/`, `backend/services/analysis/`, etc.). Science preservation gate is N/A.

---

## Evaluation of Flagged Concerns

### D2 — Merge-back semantics (fast-forward default)

**Verdict: sound, one clarification needed.** The FF-by-default + `--branch-as-pr` escape hatch is the right contract. The synthesis correctly identifies the failure mode: base has advanced while the session is in flight, making FF impossible. The synthesis's response (abort with "use `--branch-as-pr`") is correct ergonomically — it surfaces the conflict explicitly rather than silently doing a merge commit.

One clarification needed for build: the synthesis describes Step 2 of `lattice-session-end.sh` as "Validate session branch is fast-forwardable to base (i.e., base has not advanced beyond session's merge-base). If non-FF, abort with 'base has advanced; rebase or use `--branch-as-pr`'." The word "rebase" in the error message is potentially confusing — rebasing an autopilot session branch that may have multiple commits onto an advanced base is a non-trivial operation that should not be suggested casually. The message should say "rebase manually OR use `--branch-as-pr`" with the rebase path documented in `worktree-isolation-protocol.md`, not as an inline suggestion in the error message. Not blocking — this is a UX wording note for the build phase.

### D4 — Exemption envelope sizing

**Verdict: Tier 1 allowlist is appropriately tight; Tier 2 single-shot semantics are correct.** The default allowlist (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `LICENSE`, `NOTICE`, `.gitignore`, `.gitattributes`, `docs/` root) covers the natural "these files belong to everyone" category. The per-project `allow_main_tree_paths` in `lattice-project.toml` handles project-specific additions (e.g., pcc's top-level `ARCHITECTURE.md` if it exists).

One gap: the synthesis does not address `.claude/settings.json` and `.claude/rules/` at canonical root. Both are trust-doc-adjacent (framework config, loaded at every session) and would reasonably be edited from the canonical root during framework maintenance. If these are not in the allowlist, every framework config update requires a worktree — which creates friction for the person maintaining the framework itself. This is not a blocker for R0 on pcc (pcc uses lattice as a consumer, not a maintainer), but `lattice/` itself will need `.claude/` in its allowlist when R0 deploys there. Recommend adding `.claude/` to the default Tier 1 allowlist or noting this explicitly in the `worktree-isolation-protocol.md` "common additions" section.

### R1 to R0 stop-light — "2 weeks of real autopilot traffic" gate

**Verdict: the heuristic is the correct form; the signal description can be made more specific.** The synthesis's own framing ("2 weeks of real autopilot traffic without surfacing new failure modes") is the right shape — it's a stability gate, not a performance gate. The three failure modes named are concrete: orphan worktrees, merge-back conflicts, `.lattice/` symlink breakage.

A more specific formulation that the build phase should encode: the gate passes when ALL of the following are true for 14 calendar days post-R1 deployment: (a) zero orphan worktrees left in `C:/pg/*-session-*` longer than 24h, (b) zero merge-back aborts due to non-FF base advancement, (c) zero `.lattice/` symlink resolution failures in session logs, (d) zero user-reported session-creation failures. This is still a judgment call but it has named observables rather than a diffuse "no new failure modes" requirement. The synthesis author can encode this as a decisions.log entry format at R1 deployment time.

This is not a blocking issue — the synthesis correctly defers the specifics to the deployment period. The note is for the build phase to encode the gate criteria explicitly.

### Submodule handling — `git rev-parse --show-superproject-working-tree`

**Verdict: the guard is necessary but the synthesis understates one risk.** The guard borrowed from superpowers is correct: when `show-superproject-working-tree` returns a path, the session is inside a submodule, and the hook must treat that as "already in worktree-equivalent context" (or as "canonical root of the submodule" — the synthesis says "behaves as if in canonical"). The pcc case is `docs/_internal` as a submodule of pcc.

The understated risk: `git worktree add` on a repo that has submodules creates a worktree that does NOT automatically populate the submodule's working tree. The submodule in the new worktree will be an empty directory until `git submodule update --init` is run inside the worktree. `lattice-session-start.sh` must run `git submodule update --init` after creating the worktree, or the worktree will be silently broken for any session that touches submodule files. The synthesis does not mention this. It is not covered by the superpowers borrow (superpowers' SKILL.md has no submodule content — verified: the synthesis's own borrow table lists only 4 verbatim items and none mention submodules).

**This should be a build-phase requirement for `lattice-session-start.sh`:** after `git worktree add`, run `git -C <worktree-path> submodule update --init --recursive` and emit a warning if the submodule update fails (non-fatal for the worktree creation, but the user needs to know).

### Reuse fidelity — superpowers borrow check

**Verdict: honest.** The synthesis's borrow table (Section 4 D6) correctly distinguishes verbatim borrows (4 items: detection logic via `GIT_DIR != GIT_COMMON`, submodule guard, `.worktrees/` directory convention, `.gitignore` safety verification) from adaptations (branch naming, per-project override config, no consent prompt) from new-builds (enforcement, `.lattice/` visibility, merge-back, exemption, cleanup). The `obra-superpowers.md` literature note at line 50 currently reads "Same pattern, possibly independent design" — which the synthesis correctly identifies as a misclaim and proposes to fix (R6). The proposed correction is accurate. No issues with the borrow audit.

### Phased deployment ordering — R1 before R0

**Verdict: correct.** The synthesis correctly frames R1 as an on-ramp, not the destination. The audit (Section 5) explicitly names this as the merit-correct framing validated through user pushback. The R1-first sequence is justified: autopilot batches have well-defined entry and exit points, making them the right testbed for surfacing `.lattice/` symlink ergonomics and merge-back failures before the R0 enforcement hook makes those failures a blocker for all sessions. R2 and R3 shipping in parallel with R1 is correct — they have zero shared infrastructure.

One note: the synthesis says "R1 must run for ≥ 2 weeks of real autopilot traffic" (gate criterion). This is the heuristic evaluated above under the stop-light question. The note applies here: encode the gate as named observables, not elapsed time alone.

---

## Overengineering Scan

| Proposed | Consumers | Verdict |
|---|---|---|
| `lattice-session-start.sh` | autopilot.md Step 3.0; R0 hook message; human CLI; future MCP entry | NEEDED — 4 real consumers, multi-step logic not suitable for inline |
| `lattice-session-end.sh` | autopilot.md Step 3.6; human session-end | NEEDED — merge-back contract has branches; centralizing prevents drift |
| `lattice-worktree-prune.sh` | post-commit hook; human ad-hoc | NEEDED — cleanup cadence policy is non-trivial; testable unit |
| `require-worktree.sh` | settings.json (1 registration, multiple tool matchers) | NEEDED for testability — hook logic is non-trivial and has 8 unit tests |
| `worktree-isolation-protocol.md` | CLAUDE.md link; agent prompts; humans onboarding | NEEDED — follows commit-intent-protocol.md precedent for a multi-component system |
| `[project.worktree]` config block | New projects (canonical_root, allow_main_tree_paths, lattice_state_strategy) | NEEDED — allowlist varies per project; not a fixed-behavior config |
| `lattice-rationale-rejection-list.txt` | `require-worktree.sh` only | OVERKILL — see Issue 1 above |
| `autopilot-worktree.test.ts` | behavior test for concurrent-batch isolation | NEEDED — system-level guarantee; correct test type |
| `e2e-worktree.test.ts` | behavior test for foreign-WIP tolerance | NEEDED — closes the documented foreign-state-guard regression |

**Net: 8 of 9 proposed artifacts are load-bearing. One (rationale rejection list as a file) is accidental complexity and should be inlined.**

---

## Test Strategy Assessment

The test strategy is proportional and correct in type. Integration tests for `lattice-session-start.sh` / `lattice-session-end.sh` / `lattice-worktree-prune.sh` are appropriate — these scripts orchestrate multiple git commands; mocking git would provide false confidence. Unit tests for `require-worktree.sh` are appropriate — the hook has discrete decision branches (cwd check, tool dispatch, allowlist, exemption envelope, submodule guard) that are testable in isolation with harness-mocked env vars. The backwards-compat test (`LATTICE_AUTOPILOT_WORKTREE=0` regression) is correct and necessary.

One gap: no test covers the Windows symlink failure fallback path (see Issue 2). After the fix (auto-detect + fallback to env-var), a unit test should assert that `lattice-session-start.sh` succeeds and prints the right fallback message when `ln -s` exits non-zero. This is a build-phase note, not a blocking pre-build issue.

---

## Empirical Claims Verification

| Claim | Status |
|---|---|
| Commit 1370c103 is a real conflation incident | VERIFIED — `fix: GAP-322 -- explain CORRELATING EVIDENCE % column with hover tooltip` |
| Commit 521f1d16 is a real conflation incident | VERIFIED — `fix: revert noael portion of 1370c103 (BUG-031)` |
| Commit a47ee865 is a real conflation incident | VERIFIED — `fix: GAP-326 -- rationale text for Pairwise + Trend test dropdowns` |
| Commit abdb31c9 is a real conflation incident | VERIFIED — `feat(lattice): F4 Phase 1 -- approval-test gate` (the primary + incidental merge) |
| Decisions.log line 678 names worktree isolation as candidate fix | VERIFIED — exact text: "a session-scoped intent file or worktree isolation is the candidate fix" |
| `declare-commit-intent.sh` comment cites all 4 hashes | VERIFIED — `pcc/scripts/declare-commit-intent.sh:8` lists all four |
| obra-superpowers.md line 50 contains the misclaim | VERIFIED — "Same pattern, possibly independent design" |
| Zero existing `preToolUse/` scripts in `C:/pg/lattice/hooks/` | VERIFIED — `hooks/` contains only `pre-commit`, `post-commit`, and `claude-hooks.json` |
| `stashWorkflowOutput` exists because of shared-tree problem | VERIFIED — `executor/src/autopilot.ts:207-240` with explicit comment about the failure mode it defends |

All empirical claims check out.

---

## Recommended Actions (prioritized)

1. **REQUIRED before build: Fix Issue 1.** Remove `scripts/lattice-rationale-rejection-list.txt` from the plan. Inline the rejection list in `require-worktree.sh` as a shell array. Remove the per-project-additions hook entirely. If the synthesis author judges per-project additions genuinely needed, add an `additional_trivial_rationales` key to `[project.worktree]` in `lattice-project.toml` and have the script read it — but do not introduce a standalone file.

2. **REQUIRED before build: Fix Issue 2.** Add a symlink-failure detection path to `lattice-session-start.sh`. Attempt `ln -s`; on failure (non-zero exit or wrong result), fall back to the `LATTICE_PROJECT_ROOT` env-var strategy with a printed warning. Document the Windows-without-Developer-Mode path explicitly in `worktree-isolation-protocol.md`. The env-var fallback is already designed; it just needs to be wired as the auto-fallback rather than the rejected alternative.

3. **REQUIRED before build (build-phase addition): Submodule `update --init`** in `lattice-session-start.sh` after `git worktree add`. Not in the synthesis's current build plan but essential for the pcc use case. Add to R1 acceptance criterion 1: "`.lattice/` symlink resolves AND `git submodule status` shows no empty submodule checkouts."

4. **Advisory for build: Read `acquire-lock.sh:86-102`** before writing `lattice-worktree-prune.sh` to reuse the `pid_alive()` cross-platform implementation.

5. **Advisory for build: Read `declare-commit-intent.sh`** before writing `lattice-session-end.sh` to reuse the error-message formatting convention.

6. **Advisory note for build: Tighten R1 stop-light criteria** in `worktree-isolation-protocol.md` from "2 weeks without new failure modes" to the four named observables (zero orphans > 24h, zero non-FF aborts, zero symlink failures, zero session-creation failures). Elapsed time is a proxy; these are the actual signals.

7. **Advisory note for build: Reword `lattice-session-end.sh` non-FF error message.** Remove "rebase" from the inline error message; reserve it for the protocol doc. The inline message should say "use `--branch-as-pr`; see `worktree-isolation-protocol.md` for manual merge options."

8. **Advisory note for build: Add `.claude/` to Tier 1 allowlist** (or at minimum note it as a common addition in the protocol doc). Framework maintainers editing `.claude/settings.json` or `.claude/rules/` at the lattice canonical root should not need a worktree for that operation.

---

## SIMPLIFY Directive (for synthesis author to apply before build)

The following two changes are required before the build phase proceeds:

**S1.** Remove `scripts/lattice-rationale-rejection-list.txt` from the build plan. Inline the 5-word rejection list in `require-worktree.sh`. If per-project additions are needed, add `additional_trivial_rationales = []` to `[project.worktree]` in `lattice-project.toml` (already proposed in the template). Remove the standalone file.

**S2.** Add symlink-failure detection and env-var fallback to `lattice-session-start.sh`'s specification. The script must: attempt `ln -s`, detect failure, fall back to `export LATTICE_PROJECT_ROOT=<canonical>` with a warning message, and document in `worktree-isolation-protocol.md` that the env-var path is the Windows-without-Developer-Mode fallback. This is not a new design decision — the env-var approach was already evaluated (D1) and the synthesis notes it as "more explicit." It is the correct fallback for constrained environments.

No re-gate required for S1 (mechanical inlining, zero behavior change). S2 requires a note in the synthesis D1 section acknowledging the fallback path and updating acceptance criterion 1 for R1 to include a symlink/fallback verification step.

---

## R2 Re-gate (auto-applied SIMPLIFY)

> **Date:** 2026-05-09
> **Reviewer:** independent architect (re-gate pass, blueprint-cycle Step 2 second pass)
> **Prior verdict:** SIMPLIFY (2 BLOCKING: S1 rationale-list, S2 Windows symlink; 4 advisory)

### Verdict: PASS

All seven R1 findings are correctly applied. One internal inconsistency introduced by S1's fix is noted but is not blocking — it is a vestigial sentence that contradicts the inlined resolution and must be removed in the build phase.

---

### Verification of R1 Findings

**S1 (rejection-list inlining) — VERIFIED CORRECT, with one defect.**

D4 contains two references to the rejection list that now conflict with each other. The operative paragraph (lines 301-302) correctly describes the inline shell array and the `additional_trivial_rationales` key in `lattice-project.toml` — this is what was asked for. However, the final sentence of D4 (line 310) reads: "Rejection list (trivial rationales): maintained in `scripts/lattice-rationale-rejection-list.txt`. Per-project additions allowed." This sentence was not removed. It directly contradicts the inline-array resolution three paragraphs above it and still references the standalone file that R1 required eliminating.

**NEW DEFECT N1 (non-blocking, must fix at build):** The stale sentence at line 310 must be deleted before build. If the build agent reads the synthesis sequentially and hits line 310 last, it will create the standalone `.txt` file anyway, silently reversing S1. The build-phase instruction must call out this specific line as superseded.

**S2 (Windows symlink fallback) — VERIFIED CORRECT.**

D1 now contains: (a) the explicit detection logic with bash code showing the `ln -s` attempt + failure path + `.lattice-env` file creation; (b) the conditional nature of the fallback (only on symlink failure); (c) the migration cost section explicitly naming the four load-bearing scripts (`acquire-topic-lock.sh`, `declare-commit-intent.sh`, `acquire-lock.sh`, `append-attestation.sh`) that must be updated to use `${LATTICE_PROJECT_ROOT:-.}/.lattice/...` and naming build-cycle Phase 1 as the migration cadence.

**Submodule init (recommended action 3) — VERIFIED CORRECT.**

`lattice-session-start.sh` description in the build plan table (line 31) now includes `git -C <worktree-path> submodule update --init --recursive` with explicit rationale (pcc `docs/_internal` submodule). Acceptance criterion R1 AC1 (line 40) now requires both symlink/fallback AND `ls docs/_internal/` shows contents. The submodule init is also named as a session-creation failure mode in observable 4 (line 122).

**Rebase wording (recommended action 4) — VERIFIED CORRECT.**

D2 Step 2 abort message (line 233) now reads "use `--branch-as-pr` or see `worktree-isolation-protocol.md` for recovery guidance" — no inline "rebase" suggestion. The rebase path is deferred to the protocol doc as intended.

**.claude/ allowlist (recommended action 5) — VERIFIED CORRECT.**

D4 Tier 1 allowlist (line 286) now includes `.claude/` with explicit rationale: "framework maintainers editing these from the canonical root would otherwise need a worktree, which is friction for the person maintaining the framework itself."

**4-observables stop-light (recommended action 6) — VERIFIED CORRECT.**

The phased deployment section (lines 117-124) now names four specific observables instead of "2 weeks": (1) zero orphan worktrees > 24h, (2) zero non-FF aborts, (3) zero `.lattice/` symlink failures OR clean fallback, (4) zero session-creation failures. Each observable names its measurement mechanism. The elapsed-time heuristic is demoted from gate condition to context ("≥ 10 autopilot batches in a real-work week" as minimum traffic volume, not the gate itself). This is the correct form.

**acquire-lock.sh reuse (recommended action 7) — VERIFIED CORRECT.**

Section 1a Reuse Inventory now has a dedicated row for "Cross-platform process liveness check" citing `acquire-lock.sh:86-102` with `pid_alive()` and the POSIX/Windows fallback, and a dedicated row for "Error-message formatting pattern" citing `declare-commit-intent.sh`. Both are listed as explicit reuse targets for the new scripts.

---

### New Defect Analysis

**N1 (stale reference, build-blocking) — stated above under S1.** Synthesis line 310 still reads "Rejection list (trivial rationales): maintained in `scripts/lattice-rationale-rejection-list.txt`." This is an orphaned sentence that contradicts the inline-array resolution at lines 301-302. The build agent will encounter this as the last word on the subject in D4 and may act on it. The fix is deletion of that sentence. It requires no synthesis re-gate — it is a copy-edit defect that the build phase can resolve with a direct edit to the synthesis before implementing.

**N2 (observable 3 trivially satisfied, structural concern, non-blocking).** Observable 3 in the stop-light gate is "Zero `.lattice/` symlink failures in session logs OR clean fallback to env-var mode with no downstream script breakage." The OR clause means that if every session on Windows silently uses env-var mode (because symlink creation fails every time on that machine), this observable passes automatically without any actual symlink ever succeeding. On a Windows-without-Developer-Mode machine that is also the only machine running autopilot, this observable provides zero signal about symlink viability before R0 deploys. This is not a reason to reject the plan — the env-var fallback is designed to be a permanent mode, not a temporary workaround. But the migration cost section names 4 scripts that need updating under env-var mode, and observable 3's pass condition does not require those 4 scripts to be updated before R0 deploys. The build phase should add an explicit check: if `.lattice/symlink-fallback.log` has any rows at gate time, the 4 named scripts must be audited for `LATTICE_PROJECT_ROOT` awareness before R0 proceeds. This closes the gap between "fallback activated" and "all consumers of fallback are correct."

**N3 (concurrent submodule update, non-blocking).** Two concurrent autopilot batches each running `git -C <their-worktree> submodule update --init --recursive` against the same canonical repo's submodule are independent operations: each worktree gets its own submodule working tree (git worktree semantics for submodules create per-worktree submodule checkouts). There is no write contention against a shared submodule index because each worktree has its own `.git/worktrees/<id>/` metadata directory. The concern does not apply.

**N4 (.claude/ allowlist and stealth-change risk, non-blocking).** R1 recommended action 5 added `.claude/` to the Tier 1 allowlist. The concern was whether this lets `.claude/settings.json` edits land at canonical root without scrutiny. The synthesis's response is correct: the purpose of the worktree hook is index contamination prevention, not change-review enforcement. `.claude/settings.json` edits are reviewed by the existing commit-checklist and pre-commit hooks, which remain active inside and outside worktrees. The allowlist exemption does not bypass those downstream gates. No conflict introduced.

---

### Recommended Actions for Build Phase

1. **Before implementing: delete synthesis line 310** ("Rejection list (trivial rationales): maintained in `scripts/lattice-rationale-rejection-list.txt`. Per-project additions allowed."). This is the only change needed to the synthesis text before build proceeds.

2. **Add to `worktree-isolation-protocol.md`:** if observable 3 at R0 gate shows rows in `.lattice/symlink-fallback.log`, require explicit audit of `acquire-topic-lock.sh`, `declare-commit-intent.sh`, `acquire-lock.sh`, and `append-attestation.sh` for `LATTICE_PROJECT_ROOT` awareness before R0 hook deploys. The synthesis D1 migration cadence ("scripts get updated as they're touched") is too passive for a gate condition.

3. **No synthesis changes required** for N2 or N3 — N2 is a build-phase protocol note and N3 is a non-issue.
