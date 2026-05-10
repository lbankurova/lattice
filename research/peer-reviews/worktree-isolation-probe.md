# Worktree-Isolation Cross-Impact Probe

> **Topic:** worktree-isolation
> **Synthesis:** `C:/pg/lattice/incoming/worktree-isolation-synthesis.md`
> **Date:** 2026-05-09
> **Mode:** targeted (10 named cross-impact targets)

## Overall verdict: PROPAGATES (with 2 BREAKS in fallback mode + 4 build-phase corrections)

No SCIENCE-FLAG (infrastructure-only change; no scientific algorithms touched). No fundamental design breaks. Two findings are conditional BREAKS that are handled by the existing R1→R0 stop-light if the build phase incorporates the corrections below.

## Implications

| Target | Verdict | Detail |
|---|---|---|
| 1. PreToolUse hooks | PROPAGATES | New `require-worktree.sh` adds 2 matchers alongside existing 4 (design-mode-gate, commit-lock, topic-trailer, review-gate). Hooks fire in `settings.json` array order; first non-zero exit blocks. **Recommendation:** require-worktree must be FIRST in the array so users see the structural fix message before commit-lock/intent gates. Build-phase task. |
| 2. Existing post-commit hook (BREAKS w/o fix) | BREAKS in lattice; SAFE in pcc | **Lattice's existing `hooks/post-commit` does sync-skills work**, NOT commit-intent cleanup. Pcc's `.githooks/post-commit` does intent + review-gate cleanup. Synthesis says "post-commit hook in canonical tree invokes `lattice-worktree-prune.sh`" — does not specify WHICH post-commit. **Build-phase fix:** `install-hooks.sh` must patch BOTH the lattice-style `hooks/post-commit` AND the pcc-style `.githooks/post-commit` location. Single-source approach (chain the prune invocation as an additional command in each repo's existing post-commit) is the cleanest fix. |
| 3. Autopilot infrastructure (F4 + foreign-state) | SAFE | F4 approval-test gate (pre-commit Step 0e) reads `.lattice/approval-baselines/*.json`; these live in pcc (the algorithm-defensibility consumer). Worktree-isolation does not change the path structure (symlink/env-var both resolve to the canonical `.lattice/`). `stashWorkflowOutput`'s scope-narrowing (only autopilot's own paths visible under R1) aligns with synthesis claim. |
| 4. Parallel-group execution (R2) | PROPAGATES | `executeParallelGroup` (`engine.ts:576-613`) uses `Promise.allSettled` with shared `cwd` parameter. R2's `isolation: "worktree"` is a Claude Code Agent-tool harness feature; the harness creates the worktree per-subagent. **Open question:** does the executor's `executeNode` dispatch path correctly pass the agent's frontmatter `isolation` field through to the harness, or does it short-circuit by issuing the agent invocation directly with shared cwd? **Build-phase verification required:** trace the executor's subagent dispatch from `executeParallelGroup` → `executeNode` → agent invocation, confirm the `isolation` frontmatter field reaches the harness. If short-circuited, R2 silently fails to create per-agent worktrees. |
| 5. Hardcoded `.lattice/` paths (BREAKS in env-var fallback) | BREAKS in env-var mode; SAFE in symlink mode | **16 lattice scripts** contain hardcoded `.lattice/` references; **0 use `${LATTICE_PROJECT_ROOT:-.}/.lattice/`** (verified via grep). Under symlink mode (D1 primary), all 16 work. Under env-var fallback (Windows-without-Developer-Mode), all 16 break. Synthesis's Phase 1 migration list named **4 scripts**, including `declare-commit-intent.sh` which is **pcc-side, not lattice-side**. **Build-phase fix:** correct Phase 1 list to lattice's actual scripts (`acquire-lock.sh`, `acquire-topic-lock.sh`, `append-attestation.sh`, `release-lock.sh`, `release-topic-lock.sh`, `validation-ratchet.sh`, `merge-shared-state.sh`, `design-mode-gate.sh`, `design-session.sh`, `write-review-gate.sh`, `test-attestation-format.sh`, `tests/test-validation-ratchet.sh`, `tests/test-lock-concurrency.sh`, `tests/test-lock-ownership.sh`, `audit-corpus-citations.py`, `audit-peer-review-citations.py`). **Alternative:** symlink-required gate that refuses session creation if symlink fails AND the 16 scripts are not yet `LATTICE_PROJECT_ROOT`-aware. The architect R2 N2 audit requirement (added to observable 3) covers the AUDIT trigger but not the migration scope correction itself. |
| 6. Submodule pointer drift | PROPAGATES | Each worktree has its own `.git/worktrees/<id>/` metadata including submodule pointers — confirms architect R2 N3 (no concurrent-update contention). **New propagating concern:** when session A merges back with submodule@SHA-X and session B merges back with submodule@SHA-Y, the second FF-merge fails (or produces a normal merge conflict on the submodule pointer line). This is standard git semantics, not a worktree defect, but the synthesis should mention it in `worktree-isolation-protocol.md` so users understand why concurrent submodule-touching sessions can't both FF-merge. Build-phase doc task. |
| 7. `.claude/` allowlist vs design-mode-gate | SAFE | `design-mode-gate.sh` operates on `frontend/src/{src,e2e/mockups}/*.tsx\|html\|ts`. `.claude/` allowlist operates on `.claude/` paths at canonical root. Disjoint sets — verified architect R2 N4. |
| 8. obra-superpowers.md correction propagation | STALE-class downstream | Synthesis says correct `obra-superpowers.md:50`. Audit (Section 6 R6) also identified `_audit-2026-04-26.md:93,113,119,127` containing the same misclaim. **Build-phase task:** when implementing the correction, also append a corrigenda row to `_audit-2026-04-26.md` documenting the 2026-05-09 verification + correction. Otherwise the audit doc remains a downstream perpetuator of the false claim. |
| 9. Commit-lock + decisions.log append discipline | SAFE | Lock semantics retained for cross-session atomic appends to `decisions.log` (single canonical file via symlink or env-var). Audit's "commit-lock becomes superfluous for staging hygiene; retained for cross-session decisions.log append" is correct on both clauses. |
| 10. autopilot-stash.test.ts | PROPAGATES | Test lives at **`executor/src/autopilot-stash.test.ts`** (alongside source), not `executor/tests/`. Synthesis's R1 proposes `executor/tests/autopilot-worktree.test.ts` and R3 proposes `executor/tests/e2e-worktree.test.ts` — both should be `executor/src/autopilot-worktree.test.ts` and `executor/src/e2e-worktree.test.ts` to match existing convention. **Existing test contract change:** R3 downgrades the foreign-state guard to advisory; `autopilot-stash.test.ts`'s "refuses on foreign WIP" assertion must flip to "warns and proceeds". Synthesis acknowledges this; probe verifies the contract change is needed. Build-phase task. |

## BLOCKING ISSUES

None for the primary symlink path. Two conditional BREAKS in the env-var fallback path:

1. **Target 5: Phase 1 migration scope underspecified.** Synthesis names 4 scripts; reality is 16 lattice-side scripts (5 of them named correctly, 11 missing). The architect's gate-time audit requirement (R2 N2) catches this at the gate but does not correct the synthesis. **Fix in synthesis or build phase:** expand the Phase 1 list to the verified 16 scripts, OR gate session creation on symlink success when the migration is incomplete (refuse env-var fallback until all 16 are `LATTICE_PROJECT_ROOT`-aware).

2. **Target 2: post-commit invocation location.** Synthesis says "post-commit hook in canonical tree" without naming whether the lattice-style `hooks/post-commit` or the pcc-style `.githooks/post-commit` location is meant. Lattice's existing post-commit does sync-skills work; pcc's does intent + review-gate cleanup. Both need the prune chained. **Fix in build phase:** `install-hooks.sh` patches both locations; protocol doc explains the deployment matrix.

## RESEARCH CONFLICTS

None. WTI-RG-1 (the only research stream from this synthesis) is aligned with the probe findings (post-deployment monitoring of the false-positive rate).

## PROPAGATIONS (informational, no fix needed beyond noting)

- **Target 1 hook ordering:** require-worktree should fire first in the array. settings.json declaration order determines firing order.
- **Target 4 executor isolation passthrough:** verify the executor's `executeNode` correctly forwards agent frontmatter `isolation` field to the harness for R2 agents. This is a build-phase verification, not a synthesis change.
- **Target 6 submodule merge-back:** concurrent submodule-touching sessions produce normal merge conflicts on second FF-merge. Document in `worktree-isolation-protocol.md`.

## Manifest updates needed

None — lattice does not maintain a `system-manifest.md` (this is a pcc-side artifact). The probe ran in synthesis-driven mode (10 named targets from the prompt) rather than manifest-driven mode.

## Summary for cycle-state `probe_outcome`

```yaml
probe_outcome:
  source: blueprint.3
  timestamp: 2026-05-09T22:42:00Z
  verdict: PROPAGATES
  breaks:
    - subsystem: hardcoded-lattice-paths
      description: "16 lattice scripts hardcode .lattice/ relative paths; under env-var fallback all break. Synthesis Phase 1 list named 4 (1 wrong); reality is 16. Conditional break — symlink path is unaffected."
      status: active
      raised_in: blueprint.3
    - subsystem: post-commit-deployment
      description: "Synthesis post-commit invocation underspecified — lattice's hooks/post-commit (sync-skills) and pcc's .githooks/post-commit (intent cleanup) both need the prune chained; install-hooks.sh must patch both."
      status: active
      raised_in: blueprint.3
  science_flags: []
```
