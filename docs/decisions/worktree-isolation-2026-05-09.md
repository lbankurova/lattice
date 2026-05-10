# Worktree Isolation as the Prevention Layer for Commit Conflation

**Date:** 2026-05-09

**Trigger:** A 2026-05-09 audit (`research/worktree-audit-2026-05-09.md`) cataloged the framework's defenses against parallel-session commit conflation. The defenses were entirely in the *detection* layer (commit-intent declarations, acquire-lock, acquire-topic-lock, revision-checked state writes, staging-drift checks at hook exit) — and the layer had four documented failures across a two-day burst (2026-04-26 to 04-28: `1370c103`, `521f1d16`, `a47ee865`, `abdb31c9`) plus three same-root-cause events undercounted in the audit (`45f29b53`, `c9f82aa`, `32944cf0`) that occurred *after* commit-intent shipped. Detection alone does not reduce the rate to zero. Decisions.log line 678 (2026-04-28) had explicitly named worktree isolation as "the candidate fix" not taken.

This doc names the gap, picks the structural fix, and records the four-phase rollout that landed across 2026-05-09 (commits `7e3bb1d`, `9744128`, `9120374`, `f37b8a8`, `debd897`).

---

## The gap

Existing concurrency defenses (all detection-layer):

| Mechanism | What it protects against |
|---|---|
| Per-topic WIP lock (`acquire-topic-lock.sh`) | Two cycle workflows starting on the same topic |
| Outer-held commit lock (`acquire-lock.sh` + `LATTICE_LOCK_HOLDER`) | Two commits racing on the same `.lattice/decisions.log` write |
| Revision-checked atomic state writes (`atomicWriteFileSyncCAS`) | Lost-update races on cycle-state YAML |
| Staging-drift check in pre-commit | Files added during the hook run by a parallel `git add` |
| Commit-intent declaration + Step -0.5 enforcement (rule 23) | Concurrent staging where the intent file's set differs from the staged set |

What none of these catches: **two write-capable Claude sessions in the same checkout**. Git's index is shared per-repo. If session A and session B both run `git add` between session A's pre-commit-hook entry and session A's commit, B's files land in A's commit. The protection that *exists* (commit-intent's set-diff) requires both sessions to be cooperating with the protocol; nothing prevents the staging-time interleave structurally.

Empirical signature: an autopilot batch's `feat: GAP-XXX` commit ships with knowledge-graph promotion files from a parallel manual session (e.g., `1370c103`, 2026-04-26) — the message describes A's work, the commit contains A's work + B's accidental contribution.

## The hardening

**Each write-capable session runs in its own `git worktree`.** Each worktree has its own index. Two sessions cannot stage to the same staging area because they don't share one. The conflation class is structurally impossible; the user does not need to remember any protocol.

Stacks with what Lattice already has:
- Detection layer (locks, revision-check, staging-drift, commit-intent) preserved as backstop for *intra-worktree* edge cases (one autopilot batch staging two unrelated TODO items in one commit; two cycles working the same topic semantically; concurrent commits writing to shared `.lattice/` files).
- The cycle workflow structure is unchanged. Worktrees are an environment, not a process.
- `.lattice/` cross-worktree visibility via symlink (or `LATTICE_PROJECT_ROOT` env-var fallback on Windows-without-Developer-Mode) means decisions.log, locks, attestations, and cycle-state remain a single canonical surface that all worktrees read and write.

## Why this specifically

Three alternative hardenings considered and rejected:

| Alternative | Why rejected |
|---|---|
| Tighten commit-intent further (require a per-file digest, refuse on diff) | Same protocol layer the failures already bypass. The 2026-05-03 events `c9f82aa` + `32944cf0` happened after commit-intent shipped — the protocol catches a strict subset of conflations and the residual is the failure mode. |
| Single global commit lock with serialized writes | Latency. Autopilot, manual sessions, and review agents would queue serially even when their work is fully orthogonal. The merit-correct fix isolates work; serialization gates it. |
| Manual discipline (require humans to start each session in a worktree) | Empirical: humans don't remember. Three of the four 2026-04 conflations happened despite the team being aware of commit-intent. Discipline-without-enforcement is detection-layer thinking with extra steps. |

Worktree isolation is the structural change that makes the conflation class *mechanically impossible* rather than detected after the fact.

## Scope — which sessions get isolated

Four phases, all landed 2026-05-09:

| Phase | Surface | Active by default? |
|---|---|---|
| **R1** | Autopilot batches (`executor/src/autopilot.ts`) — every `runAutopilot` invocation spawns its own worktree on entry, FF-merges back on exit | YES — `LATTICE_AUTOPILOT_WORKTREE=0` opts out |
| **R2** | Review-agent invocations | DECORATIVE — `isolation: worktree` declared in 4 agent frontmatters but the Claude Code Agent harness reads `isolation` as an *invocation parameter*, not from frontmatter. Mechanism does not fire as shipped. Real fix would update the four caller skills (`/lattice:review`, `/lattice:research-cycle`, `/lattice:architect`, `/lattice:blueprint-cycle`) to pass `isolation: "worktree"` at `Agent({...})` call time. |
| **R3** | E2E branch comparison (`executor/src/e2e.ts` `case 'branch':`) — two detached worktrees instead of stash+checkout | YES — unconditional |
| **R0** | Project-wide PreToolUse hook (`hooks/preToolUse/require-worktree.sh`) — refuses Edit/Write/`Bash(git add\|commit\|stash)` at canonical root unless allowlisted | OPT-IN per project — `bash scripts/install-hooks.sh --enable-r0`. Activated in lattice + pcc on 2026-05-09. |

Out of scope: the e2e `uncommitted` mode (still requires stash dance — different working-tree-mutation shape that detached worktrees don't address); read-only operations (no benefit from isolation).

## Phasing — what landed when

This was a single build cycle, not a multi-week rollout. The phases describe deployment readiness, not chronology:

- **Phase 1 (synthesis):** 2026-05-09 morning — `incoming/worktree-isolation-synthesis.md` blueprint-validated through architect gate (PASS after 1 SIMPLIFY round) + probe (PROPAGATES with 2 conditional BREAKS resolved) + plan-review R1 (CONDITIONAL, 6 findings auto-incorporated) + plan-review R2 (CONDITIONAL, 4 findings auto-resolved). Synthesis archived to `incoming/archive/`.

- **Phase 2 (build):** 2026-05-09 afternoon — `7e3bb1d` shipped R1 helpers + R3 refactor + R0 artifacts (built dormant) + R2 frontmatter + 16-script `LATTICE_PROJECT_ROOT` migration. 248 executor tests pass; 14 hook unit tests pass.

- **Phase 3 (review-fix iteration):** 2026-05-09 — three reviewer agents (architect, decision-auditor, post-impl) ran in parallel; surfaced 2 SIMPLIFY findings, 1 EFFORT-BIASED test gap, 2 UNPROMPTED-DEFERRAL findings. All addressed in same commit before push.

- **Phase 4 (post-ship corrections):** 2026-05-09 evening — `9744128` flipped R1 default from opt-in to opt-out (synthesis was clear; original commit shipped wrong default). `f37b8a8` hardened `install-hooks.sh --enable-r0`: Windows rev-parse pattern (relative-path hook commands silently fail in the harness), copy hook script into target (project-side `.claude/settings.json` references project-relative path), source==target idempotency for lattice self-install. Activated in lattice + pcc.

- **Phase 5 (docs):** `debd897` updated README Section 8 to lead with the prevention layer; this ADR records the decision; `lattice-project-spec.md` § 4.10 documents the `[project.worktree]` schema.

## What was over-built

In retrospect:

- **R0 was speculative when shipped dormant.** The synthesis gated R0 activation on five named observables clearing through R1 traffic. Building R0 inside the same cycle as R1 (rather than a follow-up cycle once R1 had observed traffic) added ~700 LOC of artifacts that sat dormant from commit `7e3bb1d` until activation in `f37b8a8` on the same day. Justifiable in hindsight because activation happened quickly, but the merit-driven scope (rule 12) for the build cycle was R1 + R3 only.
- **R2 frontmatter is decorative.** Verified by runtime check: spawning an architect-reviewer and asking it to report `git rev-parse --show-toplevel` returned the canonical root, not a worktree. The Claude Code Agent harness honors `isolation` as a tool-call parameter, not as agent frontmatter. The four added frontmatter blocks do not break anything but also do not fire. A real R2 would update the calling skills.
- **D1 16-script migration is a no-op on most machines.** The `LATTICE_PROJECT_ROOT` env-var fallback is only consumed when symlink creation fails (Windows-without-Developer-Mode). On Mac / Linux / Windows-with-Developer-Mode, all 16 changes are inert. The migration is pre-emptive coverage, not a load-bearing default path.

These are documented for future cycles: prefer R1+R3-only scope when the merit boundary is fuzzy; verify harness-feature-name claims at frontmatter level by runtime check before declaring the implementation complete.

## What stays unchanged

- The four 2026-04 conflation incidents recorded in decisions.log retain their `CONFLATED-COMMIT` tags. Worktree isolation prevents the *next* one; the audit trail of the past four is intact.
- `commit-intent` (rule 23) and acquire-lock / acquire-topic-lock continue to fire. They are now backstops rather than the primary defense.
- Cycle workflow structure (research → blueprint → build → review → archive) is unchanged. Each phase runs in its own worktree but reads/writes the same canonical `.lattice/` state.

## Cross-references

- **Synthesis (archived):** `incoming/archive/worktree-isolation-synthesis.md` — 462-line blueprint, peer-review R1 + R2, architect re-gate, probe.
- **Audit:** `research/worktree-audit-2026-05-09.md` — failure-mode catalog, four named conflation precedents, decisions.log line 678 reference.
- **Operational reference:** `.lattice/worktree-isolation-protocol.md` — runtime contract, recovery playbook, why-detection-layer-preserved rationale.
- **Schema:** `docs/lattice-project-spec.md` § 4.10 — `[project.worktree]` block.
- **Rule:** `CLAUDE.md` rule 21.
- **README:** § 8 (Concurrency conflicts) — prevention layer leads, detection layer follows.
- **Borrowed prior art:** `obra/superpowers/skills/using-git-worktrees/SKILL.md` — fetched 2026-05-09 via `gh api`. Detection-via-`GIT_DIR != GIT_COMMON_DIR`, submodule guard, `.worktrees/` directory convention, project-setup auto-detection borrowed verbatim. Lattice extensions: enforcement at PreToolUse, cross-worktree state visibility, merge-back contract, exemption envelope, crash recovery. Literature note at `docs/literature/obra-superpowers.md` (corrigenda pending — pcc-side cross-repo follow-up).
- **Commits:** `7e3bb1d` (feature), `9120374` (audit row), `9744128` (default-on fix), `f37b8a8` (install-hooks hardening + activation), `debd897` (README), this ADR.
