# Worktree Isolation — Implementation Synthesis

> **Topic:** worktree-isolation
> **Cycle state:** `C:/pg/pcc/.lattice/cycle-state/worktree-isolation.yaml` (orchestration runs from pcc; implementation lands in lattice)
> **Research artifact:** `C:/pg/lattice/research/worktree-audit-2026-05-09.md`
> **Step 0 impl context:** `C:/pg/pcc/.lattice/cycle-state/worktree-isolation-step0-impl-context.md`
> **Phase:** blueprint (Step 1 — synthesize)

## Summary

The lattice framework runs every agent, every parallel sub-cycle, every spike, and every review fan-out in the **same working tree** as the user. Git's index is global per repo, so concurrent sessions stage into a shared index — producing four documented CONFLATED-COMMIT incidents (`1370c103`, `521f1d16`, `a47ee865`, `abdb31c9`) and ~1100 LOC of defensive infrastructure (commit-lock, scoped-stash, foreign-state guard, state-io revision check, commit-intent protocol). Decisions.log line 678 (2026-04-28) explicitly named worktree isolation as "the candidate fix" not taken.

This synthesis adds a **prevention layer** under the existing detection layer. The detection layer (commit-intent + locks) stays as a backstop for intra-worktree edge cases. The prevention layer is a **PreToolUse hook + session-spawn helper** that refuses Edit/Write/`Bash(git add|git commit|git stash)` when the session's `cwd` resolves to a canonical repo root, forcing every write-capable session into its own git worktree.

**Phased deployment** (merit-driven, not effort-driven):
- **R1 — Autopilot beachhead (first deployment).** Autopilot batches run in their own worktree. Closes the empirically-painful conflation class (autopilot-vs-manual). Surfaces ergonomics issues (`.lattice/` cross-worktree visibility, merge-back) in a controlled context.
- **R0 — Project-wide enforcement (destination).** PreToolUse hook + `lattice-session-start.sh`. Every write-capable session runs in a worktree. Closes manual-vs-manual, manual-vs-scheduled-agent, manual-vs-MCP-background, and autonomous-loop concurrency.
- **R2 — Review-agent isolation (parallel quick win).** Add `isolation: "worktree"` to the four review/audit agents' frontmatter (or, where harness support is incomplete, restrict tool allowlist to read-only). Independent of R0/R1.
- **R3 — e2e branch worktrees (parallel quick win).** Replace `executor/src/e2e.ts`'s stash+checkout dance with two detached worktrees. Independent of R0/R1.

R0 is the merit-correct destination per CLAUDE.md rule 12 (merit-driven decisions); R1 is the on-ramp because autopilot batches are scoped, short-lived, and have well-defined exit points, making them the right testbed for the cross-worktree state ergonomics. R2 and R3 ship in parallel because they are independently designed and don't depend on R0 infrastructure.

## Section 1 — Build Plan

### Phase R1 — Autopilot worktree (first deployment)

**Files to create / modify:**

| Path | Change |
|---|---|
| `C:/pg/lattice/scripts/lattice-session-start.sh` | NEW — session-spawn helper. Accepts `<topic>` arg, runs `git worktree add C:/pg/<repo>-session-<topic>-<ts> HEAD`, configures `.lattice/` symlink (with env-var fallback per D1 resolution), runs `git -C <worktree-path> submodule update --init --recursive` so submodule working trees are populated (required for pcc where `docs/_internal` is a submodule), **runs project-setup auto-detection per superpowers SKILL Step 3** (peer-review R1 F5): if `package.json` exists, run `npm install` (gitignored `node_modules/` is NOT copied by `git worktree add`; without this step, sessions cannot run `npm test`/`npm run build`); if `requirements.txt` exists, prompt user before running `pip install -r requirements.txt` (Python venvs need explicit handling — typically symlinked or recreated, configurable per project). **Failure handling (R2-NI-4):** project-setup steps are NON-FATAL — `npm install` failure logs to `.lattice/session-creation-errors.log` with full error output, prints a warning to the user, and CONTINUES with worktree creation. The worktree is usable for read-only work, doc edits, and trust-doc paths even if `npm install` failed; the user can re-run `bash scripts/lattice-session-start.sh <topic> --retry-deps` to attempt installation again, or operate the session without dependencies. Setting hard-stop on dependency failure would defeat the prevention layer (a session cannot start → user falls back to canonical root → conflation class survives). **Skip flag for read-only/repeat sessions:** `--skip-deps` opts out of `npm install`/`pip install` entirely; `--reuse-deps <existing-worktree>` symlinks `node_modules/` from a sibling worktree if available. Prints `cd` command, optionally `--launch` to relaunch `claude`. |
| `C:/pg/lattice/scripts/lattice-session-end.sh` | NEW — session teardown helper. Validates clean state, fast-forward-merges the session branch back to base (per D2), runs `git worktree remove`. |
| `C:/pg/lattice/scripts/lattice-worktree-prune.sh` | NEW — orphan worktree pruner. Runs `git worktree prune` + lists abandoned `<repo>-session-*` directories older than 7 days for confirmation-prompt removal. |
| `C:/pg/lattice/commands/lattice/autopilot.md` | MODIFY Step 3 (lines 104-122) — add Step 3.0 "Spawn worktree": invoke `bash scripts/lattice-session-start.sh autopilot-$BATCH_ID` and operate from the spawned tree for the duration of the batch. Step 3.6 ends with `bash scripts/lattice-session-end.sh autopilot-$BATCH_ID --merge-back`. |
| `C:/pg/lattice/executor/src/autopilot.ts` | MODIFY — when `LATTICE_AUTOPILOT_WORKTREE=1` (default true once R1 lands), the executor's autopilot driver sets `cwd` to the spawned worktree path for all child invocations. `stashWorkflowOutput` becomes near-trivial (only autopilot's own dirty paths are visible). |
| `C:/pg/lattice/executor/src/autopilot-worktree.test.ts` | NEW — integration test: two simulated autopilot batches in the same repo do NOT conflate (each batch's commits land on its own branch). |

**Acceptance criteria for R1:**

1. `bash scripts/lattice-session-start.sh autopilot-test` from a clean repo creates `C:/pg/<repo>-session-autopilot-test-<ts>/` on a `session/autopilot-test-<ts>` branch with: (a) `.lattice/` accessible from within (symlink succeeded OR env-var fallback activated with warning per D1 resolution), and (b) submodule working trees populated via `git submodule update --init --recursive` (verifiable: in the new worktree, `ls docs/_internal/` shows submodule contents, not an empty directory).
2. Two autopilot batches run concurrently against the same repo; each commits to its own branch; manual `git status` in the canonical tree shows no contamination from either batch.
3. The existing 4 conflation precedents (`1370c103`, `521f1d16`, `a47ee865`, `abdb31c9`) cannot recur under R1 — each conflation involved autopilot's index sweeping up another session's staged files; under R1 each autopilot batch has its own index.
4. `bash scripts/lattice-session-end.sh autopilot-test --merge-back` fast-forwards the session branch into the base branch (where applicable) and removes the worktree. Crashed sessions (no `session-end.sh` invocation) leave residue that `lattice-worktree-prune.sh` reports.
5. Existing `commit-intent` protocol still operates within the autopilot worktree as a backstop (e.g., one autopilot batch staging two unrelated TODO items in one commit).
6. autopilot-stash test (`autopilot-stash.test.ts`) updated — `stashWorkflowOutput` now operates within an isolated tree where only autopilot's own dirty paths are visible.

### Phase R0 — Project-wide enforcement (destination)

**Files to create / modify:**

| Path | Change |
|---|---|
| `C:/pg/lattice/hooks/preToolUse/require-worktree.sh` | NEW — PreToolUse hook. Reads `$CLAUDE_TOOL_NAME` and `$CLAUDE_TOOL_INPUT`. When tool ∈ {Edit, Write} OR (tool == Bash AND input matches `^\\s*git\\s+(add\|commit\|stash)\\b`), the hook performs **two-pronged detection** (peer-review R1 F3): (a) check whether `cwd` equals the canonical repo root (resolved via `git rev-parse --show-toplevel` compared against `LATTICE_PROJECT_ROOT`-aware allowlist); AND (b) for Edit/Write only — extract `file_path` from `$CLAUDE_TOOL_INPUT` JSON, resolve to absolute path **lexically (do NOT follow symlinks)**, check whether the resolved path is INSIDE the canonical repo root regardless of cwd. **Path-resolution semantics (R2-NI-1):** lexical resolution is critical because the worktree's `.lattice/` is a symlink to canonical's `.lattice/`; a `realpath`/`readlink -f` resolution would chase the symlink and false-positive on every legitimate `.lattice/` write from a worktree. Lexical resolution (`path = ${cwd}/${file_path}` then collapse `..`) plus the Tier 1 `.lattice/**` allowlist together close the surface. If EITHER check fires AND the path is not in Tier 1 allowlist → block with actionable message pointing at `lattice-session-start.sh`. If exemption envelope active → log + permit. Every block event appends a row to `.lattice/require-worktree-block.log` (observable 5 of the R0 stop-light gate). **Bash absolute-path bypass — accepted residual risk (R2-NI-2):** prong (b) does NOT cover Bash calls because `$CLAUDE_TOOL_INPUT` for Bash has no structured `file_path` field. Mitigation: git's worktree semantics natively reject `git add /path/outside/worktree` with "outside repository" error (a worktree's `core.worktree` setting bounds `git add` resolution); explicit absolute-path Bash staging that targets canonical files from a worktree is rejected by git itself before the staging takes effect. The bypass is theoretical, not practical. Documented in `worktree-isolation-protocol.md` as accepted residual risk with the git-semantics rationale. |
| `C:/pg/lattice/scripts/install-hooks.sh` | MODIFY — register the new PreToolUse hook in `.claude/settings.json` (project-side) by adding the matcher entries. Idempotent. |
| `C:/pg/lattice/scaffold/lattice-project.toml.template` | MODIFY — add `[project.worktree]` block with `enforce_worktree_isolation = true`, `canonical_root = "."`, `allow_main_tree_paths = ["CLAUDE.md", "README.md", "ROADMAP.md", ".gitignore"]`, `lattice_state_strategy = "symlink"` (per D1). |
| `C:/pg/lattice/CLAUDE.md` | MODIFY — add Rule N (next available number) "Worktree isolation enforced at session entry" with: rationale (the 4 conflations), exemption envelope, escape-hatch path, link to `worktree-isolation-protocol.md`. |
| `C:/pg/lattice/.lattice/worktree-isolation-protocol.md` | NEW — full protocol doc analogous to `commit-intent-protocol.md`. Documents the hook contract, exemption envelope, session-spawn helper, merge-back semantics, crash-recovery discipline. |
| `C:/pg/lattice/hooks/tests/test-require-worktree.sh` | NEW — unit tests for the hook: (a) blocks Edit at canonical root, (b) permits Edit in worktree, (c) permits trust-doc edit at root via allowlist, (d) blocks `git add` in canonical root via Bash matcher, (e) honors `LATTICE_ALLOW_MAIN_TREE=1` exemption with audit log. |

**Acceptance criteria for R0:**

1. From a fresh canonical-root checkout, `Edit`/`Write` calls are blocked with the actionable message: *"This repo requires worktree-isolated sessions. Run `bash scripts/lattice-session-start.sh <topic>` and re-launch Claude Code from the printed worktree path."*
2. From a worktree spawned via `lattice-session-start.sh`, all tool calls work normally (no false positives).
3. Bash matcher catches `git add foo.txt`, `git commit -m ...`, `git stash` from canonical root (per D5 — single hook with multi-matcher list).
4. Trust-doc edits at canonical root succeed: editing `CLAUDE.md`/`README.md`/`ROADMAP.md` does NOT require a worktree (allowlist per D4).
5. `LATTICE_ALLOW_MAIN_TREE=1 <command>` exemption permits the command and writes an audit row to `.lattice/exemption-audit.log` with timestamp, holder, command, rationale (rationale required per D4).
6. Submodule edits (e.g., editing files inside `docs/_internal` if it's a submodule) work correctly — the hook's submodule guard recognizes submodule context and treats it as canonical.
7. Existing autopilot, manual cycle invocations, MCP background tasks, scheduled remote agents, IDE-launched sessions all transparently use worktrees — no entry-point bypasses.
8. Documentation in `CLAUDE.md` + `worktree-isolation-protocol.md` + onboarding text in `lattice-session-start.sh` covers the muscle-memory shift.

### Phase R2 — Review/audit agent isolation (parallel quick win)

**Files to modify:**

| Path | Change |
|---|---|
| `C:/pg/lattice/agents/architect-reviewer.md` | Add to frontmatter: `isolation: "worktree"` AND `tools: [Read, Glob, Grep, Bash, WebFetch, Skill]` (no Edit/Write — review agents must not mutate the tree). |
| `C:/pg/lattice/agents/peer-review.md` | Same: `isolation: "worktree"` + read-only tool allowlist. |
| `C:/pg/lattice/agents/decision-auditor.md` | Same. |
| `C:/pg/lattice/agents/post-impl-reviewer.md` | Same. |
| `C:/pg/lattice/commands/lattice/review.md` | MODIFY Step 4 (lines 115-124) — attestation file writes now happen via `Bash` (which is permitted in the allowlist) rather than `Edit`/`Write` directly. Verify the existing `bash scripts/append-attestation.sh` calls work under the new allowlist. |

**Acceptance criteria for R2:**

1. **Each of the four review agents launched via `Agent({subagent_type: ...})` runs in an isolated worktree.** Verification has TWO parts (peer-review Finding 6 — single-test verification is insufficient): (a) **harness honors frontmatter:** trace `executor/src/engine.ts` `executeNode` dispatch path; confirm the agent's frontmatter `isolation: "worktree"` field is correctly forwarded to the Claude Code Agent tool's harness, NOT short-circuited with a shared `cwd` parameter (probe Target 4); (b) **runtime evidence:** within an agent invocation, `git rev-parse --show-toplevel` returns a path different from the canonical repo root (i.e., the agent IS in a worktree, not just thinks it is). Both checks must pass; (a) without (b) means the contract is correctly declared but the harness is not honoring it; (b) without (a) means the agent happens to be in a worktree for a different reason and the contract is undefined. **Gating rule:** R2 cannot merge until both verifications return positive on the same agent invocation in CI.
2. Read-only tool allowlist is enforced — an agent attempting to call `Edit` or `Write` receives a tool-permission error rather than executing the call.
3. Attestation file writes via `bash scripts/append-attestation.sh` continue to work (the script writes via `>>` to `.lattice/attestations/`; the worktree's `.lattice/` resolves via the D1 mechanism).
4. Independence-by-prompt becomes independence-by-sandbox: review agents cannot mutate the canonical tree's working files, only append to attestation logs.
5. The 3-4 parallel review agents in `/lattice:review` no longer share filesystem state for their working files; each operates in an isolated worktree, with shared `.lattice/` as the only collaborative surface.

### Phase R3 — e2e branch worktrees (parallel quick win)

**Files to modify:**

| Path | Change |
|---|---|
| `C:/pg/lattice/executor/src/e2e.ts` | MODIFY `case 'branch':` block at line ~670. Replace stash + checkout + restore with `git worktree add --detach <tmp-base> <baseSha>` + `git worktree add --detach <tmp-feature> <featureSha>`. Run validation suites in each tree's `cwd`. Remove both worktrees in `finally`. |
| `C:/pg/lattice/executor/src/e2e.ts` | Lines 645-668 (foreign-state guard) — downgrade from refusal-style block to advisory warning ("you have WIP outside the diff scope; consider committing it before running e2e — proceeding anyway because branch-mode no longer mutates your working tree"). |
| `C:/pg/lattice/executor/src/e2e-worktree.test.ts` | NEW — integration test: e2e branch-comparison with foreign WIP present succeeds (no stash, no failure). |

**Acceptance criteria for R3:**

1. `executor` branch-mode e2e runs successfully against a repo with foreign WIP in the canonical tree (precondition that previously triggered the foreign-state guard refusal).
2. Two e2e runs against different feature branches can execute concurrently — each gets its own pair of detached worktrees, no contention.
3. Crashed e2e runs (worktree teardown skipped) are cleaned up by `lattice-worktree-prune.sh` (R1 dependency, but R3 can ship independently and rely on `git worktree prune`).
4. The user's main checkout is never mutated — `git stash list` after e2e shows no e2e-related stashes, `git status` is unchanged.

### Phased deployment timeline

| Phase | Depends on | Why this order |
|---|---|---|
| R1 | None | First deployment because autopilot batches are scoped, short-lived, well-defined exit points. Surfaces D1 (`.lattice/` visibility) and D2 (merge-back) in a controlled context. |
| R2 | None | Independent — agent frontmatter changes have no shared infra with R0/R1. Can ship in parallel with R1. |
| R3 | None | Independent — e2e refactor has no shared infra with R0/R1/R2. Can ship in parallel. |
| R0 | R1 (proven) | Project-wide enforcement built on top of `lattice-session-start.sh`/`lattice-session-end.sh`/`lattice-worktree-prune.sh` from R1. The PreToolUse hook + protocol doc layer on top of the proven session-spawn machinery. |

**Stop-light gate before R0 deployment:** R1 must clear five named observables (not "elapsed time" — the elapsed window is a proxy for these signals to accumulate):

1. **Zero orphan worktrees > 24h** — `lattice-worktree-prune.sh` reports clean every run; abandoned worktrees from crashed sessions don't accumulate.
2. **Zero non-FF aborts caused by base advancement during a session** — measured via decisions.log entries from `lattice-session-end.sh` (FF-merge attempts that abort due to advanced base log a `non-ff-abort` row).
3. **Zero `.lattice/` symlink failures in session logs** OR (clean fallback to env-var mode AND explicit audit of all 16 lattice scripts confirming `LATTICE_PROJECT_ROOT` awareness). Measured via `.lattice/symlink-fallback.log`. **Build-phase requirement** (per architect re-gate N2 + probe Target 5): if `symlink-fallback.log` has rows at gate time, `worktree-isolation-protocol.md` must require explicit audit of all 16 named scripts (D1 migration list above) for `LATTICE_PROJECT_ROOT` awareness before R0 proceeds — passive "scripts updated as they're touched" is not sufficient.
4. **Zero session-creation failures** — `lattice-session-start.sh` exits 0 every invocation; failures (worktree-add error, submodule init error, branch collision) are captured in `.lattice/session-creation-errors.log`.
5. **`require-worktree.sh` block-event count > 0 during R1 traffic** — confirms the hook is actually firing on canonical-root attempts, not silently no-op'ing. Measured via `.lattice/require-worktree-block.log` (one row per blocked tool call: timestamp, tool name, sanitized input, cwd). **Critical signal** (peer-review Finding 2): without this observable, all four other observables can show clean while the prevention class survives through any hook bypass (no-op script, broken matcher, mis-deployed hook). Pre-R0, the hook's block events should appear during natural autopilot traffic that crosses the canonical/worktree boundary; if zero blocks ever fire, the hook is not detecting and R0 will deploy on a false-green signal.

These observables run continuously through R1's deployment; user confirms gate cleared via decisions.log entry; no R0 hook deploys until **all five pass** with reasonable traffic volume (≥ 10 autopilot batches in a real-work week, not just synthetic test runs).

## Section 1a — Reuse Inventory

| Capability | Searched | Found | Reusing | Building new |
|---|---|---|---|---|
| **PreToolUse hook for write-blocking** | `C:/pg/lattice/.claude/settings.json` (existing PreToolUse hooks for design-mode, commit-lock, topic-trailer, review-gate); `C:/pg/lattice/hooks/preToolUse/` (none exists) | 4 existing PreToolUse hooks; pattern of inline bash + `_comment` field | Same hook structure (inline `bash -c`, matcher list, exit-1-blocks pattern). Same matcher syntax. | NEW: `require-worktree.sh` script + matcher entry. |
| **Session-spawn helper** | `C:/pg/lattice/scripts/` (acquire-lock.sh, acquire-topic-lock.sh, declare-commit-intent.sh, sync-skills.sh) | None | Lock-acquisition idiom (`set -e`; checks for existing state; emits actionable error on contention) | NEW: `lattice-session-start.sh`, `lattice-session-end.sh`, `lattice-worktree-prune.sh` |
| **Worktree creation pattern** | `C:/pg/lattice/incoming/lattice-self-fix-2026-05-05.md:393-403` (used `git worktree add ../lattice-stream-{a..e}` for multi-stream refactor); superpowers `using-git-worktrees/SKILL.md` (fetched 2026-05-09 via `gh api repos/obra/superpowers/contents/skills/using-git-worktrees/SKILL.md`) | lattice-self-fix uses sub-branches `lattice-self-fix/stream-{a..e}` merging into umbrella → main as PR. Superpowers detects existing isolation via `GIT_DIR != GIT_COMMON`, uses `.worktrees/` directory convention with `.gitignore` safety check. | (1) Detection-first via `GIT_DIR != GIT_COMMON` + submodule guard (`git rev-parse --show-superproject-working-tree`) — borrowed verbatim from superpowers Step 0. (2) `.worktrees/` directory convention + `.gitignore` safety check — borrowed. (3) Branch-per-session naming convention `session/<topic>-<ts>` — adapted from lattice-self-fix's `lattice-self-fix/stream-<x>` pattern. | (1) Enforcement at PreToolUse (superpowers is opt-in, lattice is enforced). (2) `.lattice/` cross-worktree visibility (D1 — superpowers doesn't address shared orchestration state). (3) Merge-back contract (D2 — superpowers' skill ends at "Ready to implement"). (4) Exemption envelope (D4 — superpowers has no equivalent). (5) Crashed-session cleanup (D3 — superpowers doesn't cover). |
| **`.lattice/` cross-worktree visibility (D1)** | `C:/pg/lattice/.lattice/` (decisions.log, cycle-state, attestations); `LATTICE_PROJECT_ROOT` env var pattern (used in pcc-side scripts) | Two viable patterns: (a) symlink `.lattice/` from canonical root into each worktree, (b) absolute paths via `LATTICE_PROJECT_ROOT`. | Symlink approach is simpler for shell scripts and matches superpowers' "fall back to git's native semantics" philosophy. | NEW: `lattice-session-start.sh` creates symlink at worktree creation time. |
| **Topic lock + commit lock backstops** | `C:/pg/lattice/scripts/acquire-topic-lock.sh`, `acquire-lock.sh`; `.lattice/commit-intent-protocol.md` | Existing infrastructure | All three retained — they handle different failure modes (semantic collision, concurrent commits, intra-worktree intent-vs-staged drift) that worktree isolation alone does not address. | None. |
| **Cross-platform process liveness check** | `C:/pg/lattice/scripts/acquire-lock.sh:86-102` | `pid_alive()` function with POSIX `kill -0` + Windows `tasklist` fallback | Reuse this function in `lattice-worktree-prune.sh` for orphan classification — worktrees whose holder PID is dead are auto-removable; worktrees with live holders are not. | None. |
| **Error-message formatting pattern** | `C:/pg/lattice/scripts/declare-commit-intent.sh` (precondition validation, named-precedent error messages, exit-1 on violation) | Existing convention | Follow same pattern in `lattice-session-start.sh` and `lattice-session-end.sh` for actionable error output (e.g., "session/<topic> branch already exists; precedent: lattice-self-fix-2026-05-05"). | None. |
| **Agent frontmatter `isolation` key (R2)** | Claude Code Agent tool documentation (per system prompt: `isolation: "worktree"` is supported, "creates a temporary git worktree so the agent works on an isolated copy of the repo") | Native harness support | Native — `isolation: "worktree"` directly in agent frontmatter. | None for the worktree mechanism itself. NEW: per-agent tool allowlists (`tools: [Read, Glob, Grep, Bash, WebFetch, Skill]`). |
| **Detached worktrees for e2e (R3)** | `git worktree add --detach <path> <commit>` (native git) | Native git command | Native | NEW: refactor of `executor/src/e2e.ts` `case 'branch':` to use detached worktrees instead of stash+checkout. |
| **Crashed-session cleanup (D3)** | `git worktree prune` (native git) | Native | Native git command runs at `lattice-worktree-prune.sh` invocation | NEW: wrapper script + cron/post-commit invocation cadence (TBD per D3 resolution below — chosen: post-commit hook in canonical tree, with 24h staleness threshold). |

**Audit trail of reuse search:** Each "Searched" cell names the specific files / paths / external sources consulted. The superpowers SKILL was fetched via `gh api repos/obra/superpowers/contents/skills/using-git-worktrees/SKILL.md` on 2026-05-09 and a copy of its key patterns is summarized in this synthesis (no need to vendor the full skill into lattice).

## Section 1b — Simplicity Rationale

| Proposed | Why not inline/direct? | Consumers | Alternatives rejected |
|---|---|---|---|
| `lattice-session-start.sh` | Multi-step worktree creation (worktree add → branch creation → `.lattice/` symlink → optional `cd` printing). Inlining into autopilot.md / R0 hook would duplicate the logic. | (1) `autopilot.md` (Step 3.0); (2) R0 hook's actionable message references it; (3) human users invoke directly; (4) future MCP/scheduled-agent entry points. | (a) Inline `git worktree add` in autopilot.md → fails the muscle-memory test (humans don't read the inline). (b) Embed in `acquire-topic-lock.sh` → conflates two distinct gates. (c) Make it an executor TS function only → leaves human-CLI users without an entry point. |
| `lattice-session-end.sh` | Merge-back contract has multiple branches (fast-forward / branch-as-PR / discard-on-failure). Centralizing the contract prevents drift between autopilot's teardown and human-session teardown. | autopilot Step 3.6, human session-end. | Inline in autopilot.md → duplicates with human path. |
| `lattice-worktree-prune.sh` | Cleanup discipline needs a cadence-policy decision (D3). Centralizing makes the policy reviewable. Reuse: `acquire-lock.sh:86-102` already implements `pid_alive()` with POSIX + Windows `tasklist` fallback — `lattice-worktree-prune.sh` reuses this for orphan-classification (a worktree whose holder PID is dead is safer to remove than one with a live holder). | post-commit hook (R0 phase), human ad-hoc invocation. | (a) `git worktree prune` in post-commit inline → no staleness threshold, no audit. (b) Skip cleanup → orphan worktrees accumulate over time (the audit's R0 cost #3). |
| `require-worktree.sh` PreToolUse hook | Hook logic is non-trivial: cwd resolution + canonical-root comparison + tool/matcher dispatch + exemption envelope + submodule guard + audit log. Inlining in `settings.json` would make it unreadable and untestable. | Single consumer (settings.json). But required for testability — the hook must have unit tests (`test-require-worktree.sh`), so it cannot be inline. | (a) Inline bash in settings.json → untestable. (b) TypeScript executor function → adds bootstrap dependency on executor for what is fundamentally a shell-level gate. |
| `worktree-isolation-protocol.md` | Documentation for a multi-component system (hook + helper + cleanup + exemption + audit). Splitting into per-component docs would fragment the muscle-memory surface humans need to learn. | Onboarding (CLAUDE.md links here), agent prompts (review.md may reference), decisions.log entries cite. | Splitting into 4 docs (one per component) → see commit-intent-protocol.md precedent: single doc handles a multi-component system well. |
| `[project.worktree]` config block in `lattice-project.toml.template` | Per-project tunable knobs: `canonical_root`, `allow_main_tree_paths` (allowlist varies by project), `lattice_state_strategy` (symlink vs env var). | New projects scaffolded from the template; existing projects opt-in via `--migrate-worktree`. | Hardcoding values in `require-worktree.sh` → projects can't customize their trust-doc allowlist. |

**No new abstractions for R2.** R2 reuses the existing harness `isolation: "worktree"` agent feature; no lattice-side abstraction is added. Tool allowlist is a frontmatter field, not a new abstraction.

**No new abstractions for R3.** R3 replaces existing code (stash+checkout dance) with native `git worktree add --detach`. The function `runBranchModeE2e` shrinks; no new layer added.

## Section 1c — Test Strategy

| Feature | Test type | What it asserts | Why this level |
|---|---|---|---|
| `lattice-session-start.sh` creates correct worktree state | Integration (shell test) | After invocation, `git worktree list` shows the new worktree; `.lattice/` symlink resolves to canonical; `.gitignore` excludes `.worktrees/` | Integration — script orchestrates multiple git commands; mocking git provides false confidence. |
| `lattice-session-end.sh --merge-back` fast-forwards and removes | Integration (shell test) | Pre-state: session branch ahead of base by N commits. Post-state: base branch FF-merged to session HEAD; worktree removed; session branch deleted. | Integration. |
| `lattice-worktree-prune.sh` reports orphans | Integration (shell test) | Pre-state: worktree directory exists but `git worktree list` does not list it; OR worktree listed but >24h since last commit. Post-state: report lists the orphan; with `--remove-confirmed` flag, removes. | Integration. |
| `require-worktree.sh` blocks Edit at canonical root | Unit (shell test, harness-mocked) | `CLAUDE_TOOL_NAME=Edit CLAUDE_TOOL_INPUT='{"file_path": "/canonical/foo.ts"}' bash require-worktree.sh` exits 1 with the actionable message in stderr. | Unit. |
| `require-worktree.sh` permits Edit in worktree (relative path) | Unit | Same, but with `cwd` = worktree path AND `file_path` relative or inside worktree. Exits 0. | Unit. |
| `require-worktree.sh` blocks absolute-path bypass from worktree | Unit (peer-review Finding 3) | `cwd` = worktree path; `CLAUDE_TOOL_INPUT='{"file_path": "/canonical/repo/foo.ts"}'` (absolute path INSIDE canonical). Hook resolves the path, detects it crosses out of the worktree into canonical, exits 1. Without this test, a session in a worktree could silently mutate canonical files. | Unit. **Critical** — closes the cwd-only-detection bypass identified in peer-review Finding 3. |
| `require-worktree.sh` allowlist for trust docs | Unit | `CLAUDE_TOOL_INPUT={"file_path": "/canonical/CLAUDE.md"}` from canonical root → exits 0 with audit log row. | Unit. |
| `require-worktree.sh` Bash matcher for `git add` | Unit | `CLAUDE_TOOL_NAME=Bash CLAUDE_TOOL_INPUT='{"command": "git add foo.txt"}'` from canonical root → exits 1. | Unit. |
| `require-worktree.sh` exemption envelope | Unit | `LATTICE_ALLOW_MAIN_TREE=1 LATTICE_EXEMPTION_RATIONALE="trust-doc-batch-edit" <command>` exits 0 with audit log row containing rationale. Missing rationale → exits 1. | Unit. |
| `require-worktree.sh` submodule guard | Unit | When `git rev-parse --show-superproject-working-tree` returns a path (we're in a submodule), behaves as if in canonical (or per project setting; pcc submodule = `docs/_internal`). | Unit. |
| Concurrent autopilot batches do NOT conflate | Integration (`autopilot-worktree.test.ts`) | Setup: two autopilot batches launched in parallel against the same repo. Assert: each batch's commits are on its own branch; main branch shows zero commits during the test. | Integration — tests the system-level guarantee, not a unit. |
| e2e branch-mode succeeds with foreign WIP | Integration (`e2e-worktree.test.ts`) | Setup: canonical tree has uncommitted file `unrelated.txt`. Run e2e branch-mode. Assert: e2e completes; `unrelated.txt` is unchanged in `git status`; both detached worktrees are removed. | Integration. |
| Backwards-compat: existing autopilot pre-R1 behavior | Integration | With `LATTICE_AUTOPILOT_WORKTREE=0` (env override), autopilot reverts to in-canonical-tree behavior. Existing `commit-intent` protocol still works. | Integration — guards the rollback path. |
| R2 — review agents cannot Edit/Write | Type-safe + integration | Frontmatter `tools:` allowlist excludes Edit/Write; harness rejects tool calls. Verified by integration: spawn architect-reviewer, attempt Edit, observe permission error. | Type-safe at frontmatter level; integration verifies harness honors allowlist. |
| R2 — attestation writes still work | Integration | `bash scripts/append-attestation.sh peer-review ...` succeeds from within the isolated agent worktree (because `Bash` is in the allowlist). | Integration. |

**Plumbing-only changes (no test):**
- `lattice-project.toml.template` config block — type-safe via TOML parsing; no behavioral test.
- `CLAUDE.md` rule addition — documentation; no test.
- Hook registration in `install-hooks.sh` — idempotent; tested transitively via the hook's own unit tests.

## Section 2 — Research Gaps

**No blocking research gaps for R1, R2, R3.** D6 borrow check resolved (superpowers SKILL fetched, key patterns identified for borrow). D1-D5 resolved in this synthesis (see Design Question Resolutions below).

**Non-blocking research gap (post-R0 quality monitoring):**

| Gap ID | Question | Blocking? | Suggested sources | Priority |
|---|---|---|---|---|
| WTI-RG-1 | What is the false-positive rate of the R0 PreToolUse hook in real session traffic? Hypothesis: <5% of write attempts at canonical root are legitimate (trust-doc edits via allowlist + exemption envelope); >95% should land in worktrees. If real rate diverges, the allowlist needs adjustment. | No — R0 ships, monitoring runs. Re-evaluate after 30 days. | `.lattice/exemption-audit.log` (created by R0); decisions.log entries; user feedback. | Low — R0 ships regardless; gap is about post-deployment tuning. |

This gap is appended to `C:/pg/lattice/research/REGISTRY.md` (not pcc's REGISTRY) since the implementation lives in lattice.

## Section 3 — Data & Coverage Gaps

**None.** This is infrastructure work; no scientific data dependencies, no SEND domain coverage, no species/study fixtures.

## Section 4 — Design Question Resolutions (D1-D6)

The audit identified six design questions the architect gate must see resolved with rationale. Each is addressed below.

### D1: `.lattice/` cross-worktree visibility — symlink vs `LATTICE_PROJECT_ROOT` env var

**Resolution: symlink primary, env-var fallback on Windows-without-Developer-Mode.** `lattice-session-start.sh` attempts to create a relative symlink `.lattice -> ../<canonical-repo-path>/.lattice` inside the new worktree. On failure (typical Windows case: standard user lacks `SeCreateSymbolicLinkPrivilege`, Developer Mode not enabled), the script automatically falls back to setting `LATTICE_PROJECT_ROOT=<canonical-path>` in a `.lattice-env` file at the worktree root, prints a warning explaining the fallback, and instructs the user to `source .lattice-env` (or have their shell auto-source it) before running lattice scripts.

**Rationale (symlink primary):**
- Symlink is **transparent to all consumers** — every existing script that reads `.lattice/decisions.log`, `.lattice/cycle-state/`, `.lattice/attestations/` continues to work without modification.
- Symlinks are git-aware: `git worktree` treats symlinks correctly; the canonical repo's `.lattice/` is the single source of truth.

**Rationale (env-var fallback):**
- On Windows, `ln -s` requires either Developer Mode enabled or Administrator elevation; standard users default to neither. A silent symlink failure or junction-instead-of-symlink behavior at session creation would silently break the R0/R1 contract.
- `LATTICE_PROJECT_ROOT` requires scripts to be path-aware (resolve `${LATTICE_PROJECT_ROOT:-.}/.lattice/...` instead of `.lattice/...`). This is migration cost — but with the fallback being conditional on symlink failure, only Windows-without-Developer-Mode users pay it. **Migration scope (probe-corrected):** 16 lattice-side scripts hardcode `.lattice/` paths; build-cycle Phase 1 must update ALL of them to be `LATTICE_PROJECT_ROOT`-aware:
  - `scripts/acquire-lock.sh`
  - `scripts/acquire-topic-lock.sh`
  - `scripts/release-lock.sh`
  - `scripts/release-topic-lock.sh`
  - `scripts/append-attestation.sh`
  - `scripts/validation-ratchet.sh`
  - `scripts/merge-shared-state.sh`
  - `scripts/design-mode-gate.sh`
  - `scripts/design-session.sh`
  - `scripts/write-review-gate.sh`
  - `scripts/test-attestation-format.sh`
  - `scripts/tests/test-validation-ratchet.sh`
  - `scripts/tests/test-lock-concurrency.sh`
  - `scripts/tests/test-lock-ownership.sh`
  - `scripts/audit-corpus-citations.py`
  - `scripts/audit-peer-review-citations.py`

  (Note: `declare-commit-intent.sh` is **pcc-side**, not lattice — its `LATTICE_PROJECT_ROOT`-awareness is a separate pcc-side migration that ships alongside lattice's R0 deployment.)

**Detection logic in `lattice-session-start.sh`:**
```bash
if ln -s "$CANONICAL_LATTICE" "$WORKTREE/.lattice" 2>/dev/null && [ -L "$WORKTREE/.lattice" ]; then
  echo "Symlink mode: .lattice/ -> $CANONICAL_LATTICE"
else
  echo "WARNING: symlink creation failed (likely Windows without Developer Mode)."
  echo "Falling back to env-var mode. Source .lattice-env before running lattice scripts."
  printf 'export LATTICE_PROJECT_ROOT=%q\n' "$CANONICAL" > "$WORKTREE/.lattice-env"
fi
```

**What's NOT done:** state-io revision check (the existing protection against concurrent writes to `cycle-state/` files) stays as-is; neither mode changes file-locking semantics, so the existing protection still applies.

### D2: Merge-back semantics — push vs fast-forward vs branch-as-PR

**Resolution: fast-forward by default; explicit `--branch-as-pr` flag for multi-day refactors.**

`lattice-session-end.sh <topic>` defaults to:
1. Validate session branch is ahead of base by N commits (or equal — abort with "no work to merge").
2. Validate session branch is fast-forwardable to base (i.e., base has not advanced beyond session's merge-base). If non-FF, abort with "base has advanced; use `--branch-as-pr` or see `worktree-isolation-protocol.md` for recovery guidance" (rebasing a multi-commit autopilot branch onto an advanced base is not a casual suggestion; recovery guidance is doc-side, not inline).
3. `git push origin session/<topic>:<base-branch>` (FF push). Or, if local-only, `git checkout <base> && git merge --ff-only session/<topic>`.
4. `git worktree remove` the session worktree.
5. `git branch -d session/<topic>` (delete the now-merged branch).

`lattice-session-end.sh <topic> --branch-as-pr` defaults to:
1. Validate session branch is ahead of base by N commits.
2. `git push origin session/<topic>` (push the branch but do NOT merge).
3. Print `gh pr create --base <base> --head session/<topic>` command for the user to invoke.
4. `git worktree remove` the session worktree (leaves the branch on origin).

**Rationale:**
- Fast-forward is the simplest contract that closes the merge-back loop; matches >90% of session use cases (short-lived autopilot batches, single-feature manual sessions).
- Branch-as-PR is the lattice-self-fix-2026-05-05 precedent for multi-day refactors that need cross-stream review. Fits the same pattern.
- Per CLAUDE.md rule 13 (no unprompted deferrals): a default "push" without merge would leave session work in limbo. FF-merge by default closes the loop.
- Per CLAUDE.md rule 12 (merit over effort): more elaborate merge strategies (merge-commit, squash-merge, rebase-merge) add complexity without scientific or product merit for the worktree problem space. Reserved for explicit user choice via flag.
- Push-only (no merge) is rejected as default — leaves session branches accumulating on origin.

### D3: Crashed-session cleanup cadence + ownership

**Resolution: `lattice-worktree-prune.sh` runs from the canonical tree's post-commit hook with a 7-day staleness threshold; user-confirmation required for actual removal.**

`lattice-worktree-prune.sh`:
1. Run `git worktree prune` (native; cleans up worktrees whose directory was deleted but not recorded).
2. List worktrees in the project's worktree-parent directory (e.g., `C:/pg/<repo>-session-*`) older than 7 days.
3. For each old worktree:
   a. Check whether its branch is merged to base — if yes, report as "abandoned, branch merged" (safe to remove).
   b. If unmerged, check `git log` of the worktree's branch — report last activity timestamp + commit count.
4. Print confirmation prompt: "Remove abandoned worktrees? [y/N]". Default no.
5. With `--auto-confirm-merged-only` (post-commit hook uses this), auto-remove worktrees whose branches are merged.

**Cadence (probe-corrected — both hook locations):**
- **Lattice's `hooks/post-commit`** (currently does sync-skills work) — chain `lattice-worktree-prune.sh --auto-confirm-merged-only` invocation as an additional command, gated by N-commit counter (N=10).
- **Pcc-style `.githooks/post-commit`** (currently clears commit-intent + review-gate) — chain the same prune invocation, same gating.
- **`install-hooks.sh` MUST patch both locations** when deployed in a project. The deployment matrix for project-side hooks (lattice has its own framework-style `hooks/`; pcc and other consumer projects use `.githooks/` per `core.hooksPath`) is documented in `worktree-isolation-protocol.md`.
- Manual: `bash scripts/lattice-worktree-prune.sh --interactive` for full cleanup with prompts.
- Logged to decisions.log if any removal happens.

**Ownership:** `lattice-worktree-prune.sh` is a project-side script (lives in `C:/pg/lattice/scripts/` and is propagated via `sync-skills.sh` to other lattice projects). Per-project configuration of staleness threshold lives in `lattice-project.toml`'s `[project.worktree]` block (default 7 days).

**Rationale:**
- Post-commit timing avoids interrupting active work; ensures cleanup happens at natural breakpoints.
- 7-day staleness threshold balances "don't accidentally delete WIP" vs "don't accumulate orphans". Configurable per project.
- Auto-confirm only for merged branches — prevents data loss for in-progress work.
- Per CLAUDE.md "executing actions with care": removal is a destructive operation; default is interactive confirmation; auto-mode only for the safe class (merged branches).

### D4: Exemption envelope

**Resolution: two-tier exemption — implicit allowlist for trust-doc paths + explicit `LATTICE_ALLOW_MAIN_TREE=1` for batch operations.**

**Tier 1 — Allowlist (implicit, no env var needed):** the hook permits Edit/Write/Bash on these paths even at canonical root:
- `CLAUDE.md`
- `README.md`
- `ROADMAP.md`
- `LICENSE`, `NOTICE`
- `.gitignore`, `.gitattributes`
- `.claude/` (settings.json, rules/, agents/, commands/) — framework maintainers editing these from the canonical root would otherwise need a worktree, which is friction for the person maintaining the framework itself
- `.lattice/**` (decisions.log, cycle-state/, attestations/, exemption-audit.log, allowlist-audit.log, require-worktree-block.log, symlink-fallback.log) — legitimate cross-worktree write surface (R2-NI-1). Worktrees access canonical `.lattice/` via D1 symlink/env-var; without this allowlist row, prong (b) of require-worktree's two-pronged detection (file-path resolution against canonical root) would block every decisions.log append, every attestation write, every cycle-state update from a worktree session. Existing `acquire-lock.sh` + state-io revision check + post-commit intent cleanup remain as the authoritative concurrency gates for `.lattice/` itself.
- Files under `docs/` at canonical root (if not under `docs/_internal/` submodule)
- Files configured per-project via `[project.worktree] allow_main_tree_paths` in `lattice-project.toml`

Allowlist hits log to `.lattice/allowlist-audit.log` (separate from exemption-audit.log) for monitoring.

**Tier 2 — Explicit exemption envelope:**
```bash
LATTICE_ALLOW_MAIN_TREE=1 LATTICE_EXEMPTION_RATIONALE="<rationale>" <command>
```
- BOTH env vars required — missing rationale = block.
- Rationale must be ≥ 10 characters and not a known trivial string (rejection list: "fix", "test", "wip", "edit", "update").
- Hits log to `.lattice/exemption-audit.log` with timestamp, holder (env `USER`), rationale, command (sanitized), cwd.
- Auto-expires per-command (single-shot semantics) — does NOT carry across multiple Edit/Write calls in one session.

**Trivial-rationale rejection list:** inline shell array inside `require-worktree.sh` (`TRIVIAL_RATIONALES=("fix" "test" "wip" "edit" "update")`). Per-project additions via `[project.worktree] additional_trivial_rationales = []` in `lattice-project.toml`. No standalone config file — the list has one consumer and 5 entries; a separate file would be the "config for fixed behavior" anti-pattern.

**Rationale:**
- Tier 1 covers the 90% case (trust docs at root) without ceremony — humans editing CLAUDE.md should not need an env var.
- Tier 2 covers genuine edge cases (one-off scripts, schema migrations, repo-init operations) with audit trail.
- Single-shot semantics for tier 2 prevent the exemption from becoming the default — re-declaration per command keeps the gate honest.
- Per CLAUDE.md rule 13: no unprompted deferrals — the exemption is a known, documented path, not a "we'll figure it out later".
- Per CLAUDE.md rule 23 (commit-intent strict from day one): exemption envelope must be strict from day one too. No advisory grace period.

### D5: settings.json hook structure — single hook with cwd check, or per-tool matchers?

**Resolution: per-tool matchers, one matcher entry per tool family, all dispatching to the same `require-worktree.sh` script. Order: require-worktree FIRST in the PreToolUse array (probe Target 1 — fires before commit-lock so users see the structural fix message before the lock-contention message).**

```json
{
  "PreToolUse": [
    { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash hooks/preToolUse/require-worktree.sh" }] },
    { "matcher": "Bash(git add*|git commit*|git stash*)", "hooks": [{ "type": "command", "command": "bash hooks/preToolUse/require-worktree.sh" }] }
  ]
}
```

**Hook ordering rule (build-phase task per probe Target 1):** `install-hooks.sh` MUST insert require-worktree matchers BEFORE the existing commit-lock matcher (`Bash(git commit*)`) when patching `settings.json`. Justification: when a user runs `git commit` from canonical root, both hooks fire. If commit-lock fires first and exits 1 (locked), the user sees "another agent is committing" — useful but unhelpful for the structural problem. If require-worktree fires first and exits 1 (not in worktree), the user sees the actionable session-spawn message. Same exit, more useful diagnosis.

**Rationale:**
- Per-tool matchers are **explicit** about what's gated. A future reader of `settings.json` sees exactly which tools trigger the hook.
- Single hook script (`require-worktree.sh`) handles all cases via `$CLAUDE_TOOL_NAME` dispatch — no logic duplication.
- Bash matcher with explicit subcommand list (`git add*|git commit*|git stash*`) is more precise than a catch-all and avoids false positives on innocuous Bash calls (`git status`, `git log`, `git diff`).
- Adding new gated tools (e.g., NotebookEdit, future MCP file-write tools) requires one matcher entry, not script changes.
- Matches the existing settings.json idiom (`Write|Edit` matcher, `Bash(git commit*)` matcher already in use).

**Alternative rejected:** a single `*` matcher with all dispatch logic inside `require-worktree.sh`. Pros: single point of registration. Cons: opaque — every tool call invokes the hook even when irrelevant; `settings.json` doesn't tell readers what's gated.

### D6: Borrow check vs superpowers' `using-git-worktrees/SKILL.md`

**Resolution: borrow detection logic + directory convention + safety verification; build new for enforcement, cross-worktree state, merge-back, exemption, cleanup.**

Fetched 2026-05-09 via `gh api repos/obra/superpowers/contents/skills/using-git-worktrees/SKILL.md` (Authoritative reference).

**Borrowed verbatim:**
1. **Detection-first via `GIT_DIR != GIT_COMMON`** (superpowers Step 0). `lattice-session-start.sh` uses this check to refuse double-creation when invoked from inside an existing worktree.
2. **Submodule guard via `git rev-parse --show-superproject-working-tree`** (superpowers Step 0). Critical for pcc — `docs/_internal` is a submodule; without this guard, sessions in the submodule would be (incorrectly) detected as "already in a worktree".
3. **`.worktrees/` directory convention** — `lattice-session-start.sh` defaults to `<canonical-parent>/.worktrees/<repo>-session-<topic>-<ts>` if no project-specific path is configured. (Subdirectory naming convention `<repo>-session-<topic>-<ts>` is **adapted** from the verbatim `.worktrees/` parent — peer-review LBC-5 precision note.)
4. **`.gitignore` safety verification** — script checks `git check-ignore -q .worktrees` before creating; adds to `.gitignore` and commits if missing.
5. **Project setup auto-detection** (superpowers Step 3) — if `package.json` exists, run `npm install` after worktree creation; if `Cargo.toml`, `cargo build`; if `requirements.txt` or `pyproject.toml`, prompt the user (Python venv handling varies; not auto-installed). Borrowed because `node_modules/` is gitignored and not copied by `git worktree add`; without this, no session can run tests or build.

**Adapted (variation from superpowers):**
1. **Branch naming convention** — superpowers uses `BRANCH_NAME` from instructions; lattice uses `session/<topic>-<ts>` (matches lattice-self-fix-2026-05-05's `lattice-self-fix/stream-<x>` precedent for branch namespacing).
2. **Per-project worktree-parent override** — superpowers checks `~/.config/superpowers/worktrees/$project`; lattice uses `[project.worktree] worktree_parent` in `lattice-project.toml`. Same intent (per-project override), different config home.
3. **No "ask consent" prompt** — superpowers asks before creating; lattice's R0 enforces, doesn't ask. (`lattice-session-start.sh` invocation itself IS the consent.)

**Built new (lattice-specific, not in superpowers):**
1. **Enforcement at PreToolUse** (R0) — superpowers is opt-in skill; lattice's R0 hook makes worktrees mandatory. The skill answers "how do I create a worktree?"; the hook answers "how do I refuse non-worktree writes?". Different surface.
2. **`.lattice/` cross-worktree visibility (D1)** — superpowers does not address shared orchestration state across worktrees because its skills don't have an equivalent to `.lattice/` (it's a Claude Code skill collection, not a project framework with per-project state).
3. **Merge-back contract (D2)** — superpowers' skill ends at "Ready to implement"; the merge-back is left to the user/follow-up skill. Lattice's `lattice-session-end.sh` codifies the contract.
4. **Exemption envelope (D4)** — no equivalent in superpowers because it's opt-in.
5. **Crashed-session cleanup (D3)** — superpowers doesn't cover.

**Citation in the synthesis and in `worktree-isolation-protocol.md`:** "Detection logic borrowed from `obra/superpowers/skills/using-git-worktrees/SKILL.md` Step 0 (fetched 2026-05-09 via gh api)."

**Update to `obra-superpowers.md` literature note:** Per audit R6 — correct the misclaim that "Lattice uses worktrees too" (currently false). After R0 ships, update the note to: "Lattice borrowed detection logic + directory convention from superpowers' using-git-worktrees skill; lattice extended with PreToolUse enforcement, cross-worktree state visibility, merge-back contract, exemption envelope, and crash recovery (verified 2026-05-09)." **Probe Target 8 follow-on:** also append a corrigenda row to `docs/literature/_audit-2026-04-26.md` (lines 93, 113, 119, 127) documenting the 2026-05-09 verification + correction. The audit doc itself is a downstream perpetuator of the false claim if not corrected.

## Section 4b — Probe Findings (cross-impact verification)

Probe ran against 10 named cross-impact targets (see `C:/pg/lattice/research/peer-reviews/worktree-isolation-probe.md`). Verdict: **PROPAGATES** with 2 conditional BREAKS (handled inline below) + 4 build-phase corrections.

**Synthesis updates applied as a result of probe** (incorporated into the relevant sections above):
- D1: Phase 1 migration scope expanded from 4 to 16 lattice scripts (probe Target 5 BREAKS in env-var fallback).
- D3: Post-commit invocation specified for both lattice's `hooks/post-commit` AND pcc-style `.githooks/post-commit` deployments (probe Target 2 BREAKS).
- D5: Hook ordering rule added — require-worktree matchers FIRST in `settings.json` PreToolUse array (probe Target 1).
- D6: `_audit-2026-04-26.md` corrigenda task added to literature-note correction (probe Target 8 STALE-class).
- R1/R3 acceptance criteria: test file paths corrected to `executor/src/<feature>.test.ts` (probe Target 10).

**Build-phase verifications (NOT changes to synthesis; carry into build-cycle):**
- **Probe Target 4 (executor R2 passthrough):** trace `executeParallelGroup` → `executeNode` → agent-tool invocation, verify the agent frontmatter `isolation: "worktree"` field reaches the harness. If the executor short-circuits with shared `cwd`, R2 silently fails to create per-agent worktrees. Mandatory pre-R2-merge verification.
- **Probe Target 6 (submodule merge-back semantics):** when session A merges back with submodule@SHA-X and session B merges back with submodule@SHA-Y, the second FF-merge fails. This is normal git behavior, not a worktree defect, but `worktree-isolation-protocol.md` must document it so users understand why concurrent submodule-touching sessions can't both FF-merge.

## Section 5 — Plan Review Notes (validation surface honesty)

**Standard inputs missing from this synthesis:**

1. **Research peer-reviews R1 + R2** — the audit at `worktree-audit-2026-05-09.md` is a user-collaborative document (the user pushed back on the merit framing, forced the R0-vs-R1 reordering to put R0 as destination not R1). It was NOT produced by `/lattice:research-cycle` and has not been challenged by `/lattice:peer-review` Round 1 + Round 2. Validation came from user dialogue, not blind peer reviewers.
2. **Probe results (research-cycle Step 7)** — `/lattice:probe` was not run on the audit findings. Cross-impact analysis is partially captured in audit Section 4 (smoking guns) and the Step 0 impl context's "Failed approaches" table, but a formal probe pass against subsystems S1-S25 of `system-manifest.md` (pcc) or its lattice equivalent has not occurred.
3. **Distill audit results** — N/A; the audit is itself the distillation of decisions.log + commit history evidence.

**Why this is acceptable for the blueprint phase:**

- The audit is grounded in **empirical evidence** (4 documented commit hashes, decisions.log line 678 explicit acknowledgment, ~1100 LOC of defensive code) rather than speculative gap analysis. Peer-review's job is to challenge speculative claims; the empirical claims here are verifiable from git history.
- The merit-correct framing of R0 was **validated through user pushback** in the audit conversation — exactly the kind of independent challenge that R1/R2 peer review is designed to provide. The dialogue is in this session's history; not formally written but observable.
- The architect gate (Step 2 of blueprint-cycle) and the plan reviews R1/R2 (Steps 4 + 6) provide independent validation against this synthesis. Three separate validation surfaces remain.

**What the architect gate and plan reviews should look hardest at:**

- **D2 merge-back semantics** — fast-forward as default has a known failure mode (concurrent commits to base while session is in flight cause non-FF and force `--branch-as-pr` fallback). Is the fallback ergonomic enough?
- **D4 exemption envelope sizing** — the allowlist (CLAUDE.md, README.md, etc.) may be too narrow for some projects. Per-project `[project.worktree] allow_main_tree_paths` is the escape hatch, but is the default tight enough?
- **R1 → R0 stop-light** — the "2 weeks of real autopilot traffic" gate before R0 ships is a heuristic. What's the actual signal that R1 is stable enough to generalize?
- **Submodule handling** — pcc's `docs/_internal` submodule is the most complex case. The submodule guard borrowed from superpowers should be exercised against this concrete case before R0 deploys.

## Section 6 — Acceptance Criteria (full system)

R1, R0, R2, R3 each have phase-specific acceptance criteria above. The full-system acceptance criteria for the worktree-isolation topic:

1. **Empirical:** zero CONFLATED-COMMIT incidents (any class — file-staging, empty-commit-interleave, or submodule-conflated) across pcc + lattice + any other lattice-using project, measured over 60 days post-R0 deployment. **Pre-baseline:** 4 named incidents in a 2-day burst (2026-04-26 to 04-28: `1370c103`, `521f1d16`, `a47ee865`, `abdb31c9`), PLUS at least 3 same-root-cause events undercounted in the audit (`45f29b53` empty-commit interleave 2026-04-27; `c9f82aa` and `32944cf0` submodule-conflated 2026-05-03 — these occurred AFTER commit-intent deployment, confirming detection alone is insufficient).
2. **Coverage:** every write-capable session entry path (manual terminal, autopilot, scheduled remote agent, MCP background, IDE-launched, autonomous loop) operates from a worktree, verifiable by sampling `git status` from canonical roots across N project repos.
3. **Backstops preserved:** commit-intent protocol still BLOCKS unexpected files when invoked from within a worktree (intra-worktree conflation backstop). Topic lock still serializes same-topic cycles. Decisions.log append discipline still atomic.
4. **No regression in autopilot throughput:** autopilot batch *commit-and-merge* latency (excluding session-start overhead) is within 10% of pre-R1 baseline. Session-start overhead is reported separately: cold cache `< 60s` (first session in a fresh worktree, includes worktree-add + submodule-init + `npm install` for ~1500-package frontend); warm cache `< 10s` (subsequent sessions when `node_modules/` reuse via `--reuse-deps` is available; or `--skip-deps` for read-only work). The original `< 2-second` budget (R2-NI-3, FACTUAL_UNSUPPORTED) was incompatible with `npm install` reality; AC4 split into commit-latency-relative (10% of baseline) and session-start-absolute (cold/warm cache) so the build can verify each independently.
5. **Documented:** `worktree-isolation-protocol.md` is the canonical reference; CLAUDE.md links to it; onboarding text references it; `obra-superpowers.md` literature note is corrected.
6. **Auditable:** `.lattice/exemption-audit.log` and `.lattice/allowlist-audit.log` show appropriate (low) volume; `decisions.log` records every R0 hook block + every exemption invocation.

## Section 7 — Spec Value Audit (CLAUDE.md rule 17)

This is a multi-feature, multi-phase spec — rule 17 applies.

**Per-phase questions:**

| Q | R0 (project-wide) | R1 (autopilot) | R2 (review agents) | R3 (e2e) |
|---|---|---|---|---|
| 1. User problem | Conflation class survives in any non-autopilot session pair | Empirically painful: 4 CONFLATED-COMMIT incidents in 30 days | Independence-by-prompt is honor-system; review agents can in principle mutate the tree | Branch-mode e2e refuses to run with foreign WIP; mutates user's checkout |
| 2. Frequency | Every write-capable session at risk | **4 named incidents in a 2-day burst (2026-04-26 to 04-28), PLUS 2-3 same-root-cause events undercounted in the original audit:** 2026-04-27 commit `45f29b53` rendered empty by concurrent interleave; 2026-05-03 events `c9f82aa` + `32944cf0` recorded as "submodule-conflated" in decisions.log AFTER commit-intent deployed (2026-04-28) — confirming the detection protocol does not reduce the rate to zero (peer-review LBC-1 falsification). Burst pattern + post-protocol persistence is the rate, not "incidents per 30 days." | Rare in practice (review agents are well-behaved by prompt) but unbounded by sandbox | 1+ documented user complaint (foreign-state guard refusals) |
| 3. Workaround | Manual serialization (CLAUDE.md feedback rule); commit-intent protocol detection. **Counter-argument considered (peer-review LBC-2 + Finding 4):** is commit-intent detection alone sufficient? Verdict: NO. The protocol's own `commit-intent-protocol.md` explicitly admits "Failure modes the gate does NOT catch: Pre-staged work from a previous session; Sub-file conflation." The 2026-05-03 `c9f82aa` and `32944cf0` events occurred AFTER protocol deployment, demonstrating the detection layer's residual gap. Worktree isolation is the prevention layer the detection layer cannot become. | acquire-lock + commit-intent (post-fact detection) | Prompt discipline | "Commit your WIP first" |
| 4. Downstream impact | All downstream cycles depend on this not happening | Autopilot scope limited to keep blast radius bounded | Review attestations could be polluted | E2e becomes unreliable when WIP exists |
| 5. Why now | Audit completed 2026-05-09; merit-correct fix identified | First deployment surface (scoped, controlled) | Review.md fan-out parallelism makes this more visible | Same as R2 — concurrent invocations are increasingly common |
| 6. Cost | Medium-high (PreToolUse hook + protocol doc + muscle-memory shift) | Moderate (cross-worktree state ergonomics) | Low (~5 min agent frontmatter changes) | Low-medium (single TS function refactor) |
| 7. Without it | Conflations continue at ~4/30day rate; users hand-serialize | Each session must hand-serialize against autopilot | Review independence is partial | E2e refuses to run when WIP present |

**Aggregate questions:**

- **Q8 (Orthogonal or categorical?):** Orthogonal. Each phase addresses a distinct entry path (R0 = all sessions, R1 = autopilot only, R2 = review agents only, R3 = e2e only). The 4 phases are not 4 instances of the same featurette pattern.
- **Q9 (Preserves shipped functionality?):** Yes. Detection layer (commit-intent + locks) stays. Worktrees add prevention layer underneath. Existing autopilot batches continue to commit (just from a worktree). Existing review agents continue to write attestations (just from an isolated context).
- **Q10 (Duplicate of existing surface?):** No. Worktree isolation is the structural complement to commit-intent's detection. Distinct from acquire-lock (commits) and acquire-topic-lock (semantic collisions). Each layer addresses a specific failure class.

**Verdict (self-assessed before architect gate):** PASS. Each phase has empirical justification (R1 = 4 conflations; R0 = scoped fixes leave class alive; R2 = independence is honor-system; R3 = WIP refusal). No phase is "we should add this for completeness". Cuts (no R4 spike-quarantine in this cycle, no R5 per-child worktree in executor — both deferred to a separate cycle per non-goals) demonstrate non-categorical reasoning.

---

**End of synthesis.**

Next: `/lattice:architect gate` on this document (blueprint-cycle Step 2). Then `/lattice:probe` (Step 3). Then plan review R1 (Step 4) → incorporate (Step 5) → R2 (Step 6) → complete (Step 7).
