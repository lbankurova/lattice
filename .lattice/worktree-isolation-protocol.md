# Worktree Isolation Protocol

**Status:** R0 + R1 + R2 + R3 all active. R1 (autopilot beachhead) + R2 (review-agent isolation) + R3 (e2e branch worktrees) shipped 2026-05-09. R0 (project-wide PreToolUse enforcement) activated per project: lattice 2026-05-09 (commit `f37b8a8`), pcc 2026-05-16 (FIX-02 cycle — matcher-split + commit of `.claude/settings.json` R0 entries). **FIX-02 lesson:** the R0 matcher MUST be 3 separate `Bash(...)` entries (`Bash(git add*)`, `Bash(git commit*)`, `Bash(git stash*)`) — pipe-alternation inside parens (`Bash(git add*|git commit*|...)`) silently fails to fire on Claude Code's matcher engine. See `docs/decisions/r0-matcher-syntax-fix-2026-05-16.md` if/when written.

**Source synthesis:** [`incoming/worktree-isolation-synthesis.md`](../incoming/worktree-isolation-synthesis.md) (462 lines, blueprint-validated).

**Parent rule:** CLAUDE.md Rule 21 (when activated).

---

## What this protocol prevents

Git's index is shared per-repo. When two Claude Code sessions, an autopilot batch, a scheduled remote agent, or an MCP background task operate against the same checkout concurrently, their `git add` calls can land in the same index and a single `git commit` can sweep work from a different session into a commit with the wrong message.

Four documented incidents in pcc:

| Commit | Date | Conflated work |
|---|---|---|
| `1370c103` | 2026-04-26 | autopilot's `fix: GAP-322` swept knowledge-graph promotion files |
| `521f1d16` | 2026-04-26 | autopilot batch swept manual edits |
| `a47ee865` | 2026-04-27 | parallel-session edits in one commit |
| `abdb31c9` | 2026-04-27 | autopilot + parallel test work |

Plus 3+ same-root-cause events undercounted in the original audit (`45f29b53` empty-commit interleave; `c9f82aa` and `32944cf0` submodule-conflated AFTER commit-intent deployment, confirming detection alone is insufficient).

The detection layer (commit-intent + acquire-lock + acquire-topic-lock + state-io revision check) catches *some* of these. The prevention layer (this protocol) makes the conflation class structurally impossible by giving each session its own git index.

---

## Architecture

```
                     CANONICAL REPO (user's main checkout)
                     ┌─────────────────────────────────┐
                     │ .git/                           │
                     │ .lattice/                       │ ← shared state
                     │   decisions.log                 │
                     │   commit.lock                   │
                     │   cycle-lock/                   │
                     │   pending-attestations.json     │
                     │   require-worktree-block.log    │
                     │   exemption-audit.log           │
                     │   ...                           │
                     │ src/                            │
                     │ ...                             │
                     └─────────────────────────────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  │                 │                 │
                  ▼                 ▼                 ▼
           SESSION WORKTREE A    AUTOPILOT B      REVIEW AGENT C
           ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
           │ .git → ...     │  │ .git → ...     │  │ .git → ...     │
           │ .lattice → 🔗  │  │ .lattice → 🔗  │  │ .lattice → 🔗  │
           │ src/ ...       │  │ src/ ...       │  │ src/ ...       │
           │                │  │                │  │ tools allowlist│
           │                │  │                │  │ = read-only    │
           └────────────────┘  └────────────────┘  └────────────────┘
              own index           own index           own index
              own branch          own branch          detached HEAD
```

Each worktree has its own `.git` reference (a linked-worktree pointer back to the canonical's `.git/`), its own working tree, its own index, and its own current branch (`session/<topic>-<ts>`).

`.lattice/` is shared via symlink (default) or `LATTICE_PROJECT_ROOT` env var (Windows-without-Developer-Mode fallback). All decisions.log appends, lock acquisitions, and attestation writes from any worktree go through to canonical's single `.lattice/`.

---

## R1 -- Autopilot beachhead (active, default ON)

`runAutopilot` (`executor/src/autopilot.ts`) calls `lattice-session-start.sh` at startup, runs the entire batch from the spawned worktree, and tears down via `lattice-session-end.sh --merge-back` on completion. **Default behavior** -- the conflation prevention is on for every autopilot run unless explicitly opted out with `LATTICE_AUTOPILOT_WORKTREE=0` (rollback path: existing commit-intent + acquire-lock discipline becomes the only safety net).

Manual invocation:

```bash
BATCH_ID="autopilot-$(date -u +%Y%m%dT%H%M%SZ)"
bash scripts/lattice-session-start.sh "$BATCH_ID" --skip-deps
cd <printed worktree path>
# ... run autopilot ...
bash scripts/lattice-session-end.sh "$BATCH_ID" --merge-back
```

**Empirical verification:** `executor/src/autopilot-worktree.test.ts` -- 3/3 tests pass:
- Two batches do NOT conflate (each gets own branch; master stays at initial commit)
- `lattice-session-start.sh` creates a usable isolated worktree
- `lattice-session-end.sh --merge-back` fast-forwards into base

---

## R2 -- Review-agent isolation (active)

Four review/audit agents declare `isolation: "worktree"` + read-only `tools` allowlist in their frontmatter:

- `agents/architect-reviewer.md`
- `agents/peer-review.md`
- `agents/decision-auditor.md`
- `agents/post-impl-reviewer.md`

The Claude Code Agent tool natively supports `isolation: "worktree"` -- it spawns the agent into a temporary git worktree, automatically cleaned up when the agent makes no changes. The `tools` allowlist (`[Read, Glob, Grep, Bash, WebFetch, Skill]`) excludes Edit/Write so review agents structurally cannot mutate the canonical tree's working files.

Attestation writes via `bash scripts/append-attestation.sh` work from inside the agent's isolated worktree because the pending-attestations file is per-worktree (post-2026-05-10): it lives at `$(git rev-parse --git-path pending-attestations.json)`, which resolves to `.git/worktrees/<wt>/pending-attestations.json` for a linked worktree. Concurrent review agents in different worktrees never trample each other's staging file. Pre-2026-05-10 the file lived at `LATTICE_PROJECT_ROOT/.lattice/pending-attestations.json` (shared via symlink); the per-worktree migration closed an inter-worktree race the symlink design introduced.

**Build-phase verification deferred:** Probe Target 4 -- trace `executor/src/engine.ts` `executeNode` dispatch path to confirm the `isolation` frontmatter field is forwarded to the harness, not short-circuited with a shared `cwd` parameter. Runtime evidence (`git rev-parse --show-toplevel` returns a path different from the canonical) needs to be captured in real review-agent invocations.

---

## R3 -- E2E branch worktrees (active)

`executor/src/e2e.ts` `case 'branch':` no longer stashes + checks out the user's tree. It creates two detached worktrees (one at the base SHA, one at the feature SHA), runs validation suites in each, and removes both in `finally`.

Foreign-state guard for `branch` mode is downgraded from refusal to advisory -- branch-mode no longer mutates the user's tree, so foreign WIP is left untouched. The advisory surfaces in `result.advisory`.

`uncommitted` mode still requires the foreign-state guard refusal because the stash dance is unavoidable for that comparison shape.

**Empirical verification:** `executor/src/e2e-worktree.test.ts` -- 4/4 tests pass:
- Branch-mode succeeds with foreign WIP in canonical tree (pre-R3 errored)
- No leftover detached worktrees after the run
- `git stash list` unchanged
- Original branch preserved (no checkout side-effects)

---

## R0 -- Project-wide enforcement (ACTIVATED — lattice 2026-05-09, pcc 2026-05-16)

R0 adds PreToolUse hooks (`hooks/preToolUse/require-worktree.sh`) that refuse Edit/Write/`Bash(git add|commit|stash)` when the session's cwd resolves to a canonical repo root.

**Activation history:**

- **Lattice activated 2026-05-09** (commit `f37b8a8`) after R1 deployment cleared the five-observable stop-light gate (see "Original activation gate" below). Initial activation used a single matcher `Bash(git add*|git commit*|git stash*)` form.
- **Pcc activated 2026-05-16** (FIX-02 bug-fix cycle). Pcc's `.claude/settings.json` had R0 entries added on 2026-05-09 but never committed; the in-flight working-tree state was loaded by some sessions but the activation was not durable. FIX-02 committed the entries AND fixed the matcher-syntax bug below.
- **Matcher syntax fix (FIX-02, applied to both projects 2026-05-16):** the original `Bash(git add*|git commit*|git stash*)` form (pipe-alternation inside parens) silently fails to fire on Claude Code's matcher engine. Empirically confirmed via `.lattice/require-worktree-block.log`: only 2 entries from 2026-05-10T02:12 (initial activation test) plus 0 events between 2026-05-10 and 2026-05-16 despite many canonical-root commits including a confirmed concurrent-staging conflation occurrence (#5) during pcc GAP-357 build cycle. The hook script itself works correctly when invoked directly — root cause was Claude Code's matcher not dispatching to it. Fix: split into 3 separate `Bash(...)` entries (`Bash(git add*)`, `Bash(git commit*)`, `Bash(git stash*)`) plus `Edit|Write`.

**Original activation gate (stop-light, five observables) — cleared 2026-05-09 for lattice:**

1. **Zero orphan worktrees > 24h** -- `lattice-worktree-prune.sh` reports clean every run.
2. **Zero non-FF aborts** caused by base advancement during a session.
3. **Zero `.lattice/` symlink failures** OR clean fallback to env-var mode AND explicit audit of all 16 lattice scripts confirming `LATTICE_PROJECT_ROOT` awareness. Measured via `.lattice/symlink-fallback.log`.
4. **Zero session-creation failures** -- `lattice-session-start.sh` exits 0 every invocation; failures land in `.lattice/session-creation-errors.log`.
5. **`require-worktree.sh` block-event count > 0 during R1 traffic** -- confirms the hook is actually firing on canonical-root attempts. Without this observable, all four others can show clean while a hook bypass survives. Measured via `.lattice/require-worktree-block.log`. **Critical signal -- without it, all-green can be a false-green** (FIX-02 retrospect: this critical signal was the one that surfaced the matcher-syntax defect, 6+ days after activation. The gate-clearance verification on 2026-05-09 only confirmed the artifact-build observables (1-4); observable 5 was assumed-passing based on the 2 initial test entries without a post-activation traffic check).

**Current matcher form (FIX-02 corrected, both projects):** `.claude/settings.json` PreToolUse entries are 4 separate matchers — `Bash(git add*)`, `Bash(git commit*)`, `Bash(git stash*)`, and `Edit|Write` — each dispatching to `bash hooks/preToolUse/require-worktree.sh`. The R0 hooks MUST be ordered BEFORE the existing commit-lock matcher so users see the structural fix message before the lock-contention message.

**Hook behavior summary:**

- **Two-pronged detection:** (a) cwd == canonical-root, (b) Edit/Write `file_path` resolves into canonical even when cwd is in a worktree (lexical resolution, not symlink-following).
- **Tier 1 allowlist (no ceremony):** trust docs at root (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `LICENSE`, `NOTICE`, `.gitignore`, `.gitattributes`, `.gitmodules`), `.claude/**`, `.lattice/**`, `docs/**`, plus per-project additions via `[project.worktree] allow_main_tree_paths` in `lattice-project.toml`.
- **Tier 2 exemption envelope (audited):** `LATTICE_ALLOW_MAIN_TREE=1 LATTICE_EXEMPTION_RATIONALE="<reason>" <cmd>`. Both env vars required; rationale must be ≥ 10 characters and not in the trivial-rejection list (`fix`, `test`, `wip`, `edit`, `update`). Logged to `.lattice/exemption-audit.log`. Single-shot semantics.
- **Bash absolute-path bypass -- accepted residual risk:** `$CLAUDE_TOOL_INPUT` for Bash has no structured `file_path` field. Mitigation: git's worktree semantics natively reject staging files outside the worktree (`git add /path/outside` returns "outside repository"); explicit absolute-path Bash staging from a worktree is rejected by git itself.

**Submodule note (probe Target 6):** when session A merges back with submodule@SHA-X and session B merges back with submodule@SHA-Y, the second FF-merge fails. This is normal git behavior, not a worktree defect. Use `--branch-as-pr` for the second session, or rebase manually.

---

## D1 -- `.lattice/` cross-worktree visibility

`lattice-session-start.sh` attempts to create a relative symlink `.lattice -> <canonical>/.lattice` inside each new worktree. On Windows without Developer Mode (standard user lacks `SeCreateSymbolicLinkPrivilege`), symlink creation fails. The script automatically falls back to:

- Writing `.lattice-env` at the worktree root with `export LATTICE_PROJECT_ROOT=<canonical>`.
- Adding `.lattice-env` to the worktree's `.git/info/exclude` so it doesn't surface in `git status` or block `--merge-back`.
- Logging the fallback to `.lattice/symlink-fallback.log` (R0 stop-light observable #3).

All 16 lattice-side scripts that read/write `.lattice/...` honor `LATTICE_PROJECT_ROOT`:

```
scripts/acquire-lock.sh           scripts/release-lock.sh
scripts/acquire-topic-lock.sh     scripts/release-topic-lock.sh
scripts/append-attestation.sh     scripts/write-review-gate.sh
scripts/validation-ratchet.sh     scripts/merge-shared-state.sh
scripts/design-mode-gate.sh       scripts/design-session.sh
scripts/audit-corpus-citations.py scripts/audit-peer-review-citations.py
scripts/test-attestation-format.sh
scripts/tests/test-validation-ratchet.sh
scripts/tests/test-lock-concurrency.sh
scripts/tests/test-lock-ownership.sh
```

The migration pattern: prepend `LATTICE_ROOT="${LATTICE_PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"` to scripts that operate on `.lattice/`, and replace bare `.lattice/...` references with `$LATTICE_ROOT/.lattice/...`. Test scripts unset `LATTICE_PROJECT_ROOT` to keep their temp-repo SUTs from leaking writes back to a parent session's canonical.

### D1.1 -- Per-review-cycle state lives in git's per-worktree dir

The D1 LATTICE_PROJECT_ROOT pattern correctly handles **shared inter-session state** (locks, decisions.log, cycle-state YAMLs, config files like `algorithm-paths.txt` / `rule-attestations.yaml` / `budget.yaml`). It is the **wrong** pattern for **per-cycle transient state** that one worktree owns for the duration of a stage→commit cycle: in symlink mode, every worktree's `.lattice/` resolves to the same canonical path, so two concurrent worktree sessions doing concurrent reviews would race on a single shared file.

Four files are per-cycle and migrated to `git rev-parse --git-path <name>` (post-2026-05-10):

| File | Purpose | Lifetime |
|---|---|---|
| `commit-intent.txt` | declared file set for one stage→commit cycle | `declare-commit-intent.sh` writes; pre-commit Step -0.5 reads; post-commit clears |
| `review-gate.json` | review verdict + attestations for one commit | `write-review-gate.sh` writes; pre-commit Step 0 / commit-msg read; post-commit clears |
| `pending-attestations.json` | staging buffer feeding review-gate.json | `append-attestation.sh` writes; `write-review-gate.sh` consumes (deletes) |
| `last-review-output.md` | side-channel structured review output for D7 anchor check | `/lattice:review` writes; `write-review-gate.sh` reads |

These now live at `.git/<name>` in canonical and `.git/worktrees/<wt>/<name>` in linked worktrees. Concurrent worktrees never trample each other's per-cycle state, and because `.git/` is outside the tracked tree the files can never be staged accidentally — incidentally fixing the "pending-attestations.json leaks into commit-intent" class documented in pcc's `feedback_pending_attestations_not_in_commit.md`.

The migration pattern for these files: replace `$LATTICE_ROOT/.lattice/<name>` (the D1 pattern) with `$(git rev-parse --git-path <name>)`.

---

## D2 -- Merge-back semantics

`lattice-session-end.sh <topic> [--merge-back|--branch-as-pr|--discard]`:

- **`--merge-back` (default):** validates session branch is fast-forwardable to base; aborts if base has advanced. FF-merges into base, removes the worktree, deletes the session branch. Closes the merge-back loop in >90% of cases (short-lived autopilot batches, single-feature manual sessions).
- **`--branch-as-pr`:** pushes the session branch but does NOT merge. Prints the `gh pr create` command. Use for multi-day refactors that need cross-stream review (lattice-self-fix-2026-05-05 precedent).
- **`--discard`:** abandons the session entirely (removes worktree + deletes branch without merging). Force-removes dirty work.

Non-FF abort message points users to `--branch-as-pr` for recovery. Rebasing a multi-commit autopilot branch onto an advanced base is documented as recovery guidance (this doc), not an inline suggestion -- it's not a casual operation.

---

## D3 -- Crashed-session cleanup

`lattice-worktree-prune.sh`:

- `git worktree prune` (native) cleans up worktrees whose directory was deleted but not recorded.
- Lists `<canonical-parent>/.worktrees/<repo>-session-*` directories older than 7 days (configurable via `[project.worktree] staleness_days`).
- Classifies: "abandoned, branch merged" (safe to remove) vs unmerged (reports last activity).
- Reuses `pid_alive()` from `acquire-lock.sh:86-102` for orphan classification (CLAUDE.md rule 5).

**Cadence:** post-commit hook in canonical tree's `.git/hooks/post-commit` (or `.githooks/post-commit` for `core.hooksPath` projects) chains `lattice-worktree-prune.sh --auto-confirm-merged-only` gated by N-commit counter (N=10). The deployment matrix is documented in `install-hooks.sh`'s patch list (R0 phase). Manual: `bash scripts/lattice-worktree-prune.sh --interactive` for full cleanup with prompts.

---

## Recovery playbook

**"My session-end hit `non-FF; base advanced`":** the base branch has new commits since you started. Options:
1. `bash scripts/lattice-session-end.sh <topic> --branch-as-pr` -- push the branch and open a PR.
2. Rebase manually (advanced; pull the worktree's branch onto the new base via `git rebase` from inside the worktree, then re-run `--merge-back`).

**"My session is in env-var fallback mode but a script complained `.lattice/...` not found":** confirm the script honors `LATTICE_PROJECT_ROOT` (all 16 framework scripts do). If it's a project-side script, audit it for hardcoded `.lattice/` paths and apply the same migration pattern. Source `.lattice-env` first: `source .lattice-env && bash <script>`.

**"`require-worktree.sh` blocked an edit I expected to work":** check whether the file is in the Tier 1 allowlist (trust docs, `.claude/`, `.lattice/`, `docs/`). If it's a legitimate batch operation, use the exemption envelope: `LATTICE_ALLOW_MAIN_TREE=1 LATTICE_EXEMPTION_RATIONALE="<>=10-char reason>" <cmd>`.

**"I have an orphan worktree from a crashed session":** `bash scripts/lattice-worktree-prune.sh --interactive` reports candidates and prompts before removal.

---

## Why detection layer is preserved

The commit-intent protocol (`scripts/declare-commit-intent.sh` + pcc-side pre-commit Step -0.5) and acquire-lock / acquire-topic-lock STAY as backstops. They handle failure modes worktree isolation alone does not address:

- **Intra-worktree conflation:** one autopilot batch staging two unrelated TODO items in one commit (commit-intent catches via the declared file set vs staged set diff).
- **Semantic collision:** two cycles working the same topic (acquire-topic-lock serializes; without it, two sessions could both work `worktree-isolation` simultaneously even with separate worktrees).
- **Concurrent commits to same shared file:** acquire-lock prevents two commits from racing on `.lattice/decisions.log` writes.
- **Pre-staged work from a prior session:** commit-intent catches when files were staged outside the current intent declaration.

Counter-argument considered: is detection alone sufficient? **No.** The protocol's own `commit-intent-protocol.md` explicitly admits "Failure modes the gate does NOT catch: Pre-staged work from a previous session; Sub-file conflation." Events `c9f82aa` and `32944cf0` (2026-05-03) occurred AFTER commit-intent deployment, demonstrating the residual gap. Worktree isolation is the prevention layer that detection cannot become.

---

## Cross-references

- Synthesis: `incoming/worktree-isolation-synthesis.md`
- Audit: `research/worktree-audit-2026-05-09.md`
- Tests: `executor/src/autopilot-worktree.test.ts`, `executor/src/e2e-worktree.test.ts`
- Helper scripts: `scripts/lattice-session-start.sh`, `scripts/lattice-session-end.sh`, `scripts/lattice-worktree-prune.sh`
- Hook script (R0, not yet activated): `hooks/preToolUse/require-worktree.sh`
- Hook tests (R0): `hooks/tests/test-require-worktree.sh`
- Borrowed prior art: `obra/superpowers/skills/using-git-worktrees/SKILL.md` (fetched 2026-05-09; see `docs/literature/obra-superpowers.md`)
- Commit-intent protocol (companion detection layer): `pcc/.lattice/commit-intent-protocol.md`
