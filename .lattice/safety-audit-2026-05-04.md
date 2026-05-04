# Lattice Safety Audit — 2026-05-04

Read-only audit of the Lattice framework (`C:/pg/lattice/`) and its consuming project (`C:/pg/pcc/`) for safety risks. Triggered by the 2026-05-04 data-loss incident in which `stashIfDirty` (autopilot.ts) swept ~2300 LOC of a parallel session into stash refs that were subsequently dropped.

That seed bug has been fixed (autopilot.ts now uses `captureDirtyPaths` + path-scoped stash). The audit below catalogs **other** instances of the same defect class and adjacent risks.

## Summary

- CRITICAL: 6
- HIGH: 7
- MEDIUM: 8
- LOW: 5
- Audit gaps: 4

## Severity rubric

- **CRITICAL** — can cause silent data loss or undetected corruption.
- **HIGH** — can cause stuck state, workflow halt, or detectable corruption that requires manual recovery.
- **MEDIUM** — minor races, advisory issues, recoverable failures.
- **LOW** — nits, documentation gaps, dead code.

---

## CRITICAL findings

### CRITICAL-1: Every cycle workflow has `release-lock` in Layer 0, running in parallel with `acquire-lock`

- **File:line** — `C:/pg/lattice/workflows/build-cycle.yaml:150-152`, `blueprint-cycle.yaml:609-611`, `bug-fix-cycle.yaml` (similar), `mechanical-fix-cycle.yaml:193-195`, `research-cycle.yaml`, `spike-cycle.yaml` — every cycle workflow has a parentless `release-lock` node.
- **Description** — `release-lock` is intended as a route target reachable from `abort` approval options. It has no `depends_on`, so the engine's topological sort places it in Layer 0 alongside `acquire-lock`. `engine.ts:397-411` (`isAlwaysReachable`) returns `true` for any node with no deps, so the route-target gate in `shouldExecute` (line 348) does not suppress it. Confirmed via `node executor/dist/cli.js inspect build-cycle`:
  ```
  Layer 0 (parallel):
    acquire-lock [bash]
    release-lock [bash]
  ```
  In `blueprint-cycle` Layer 0 also runs `architect-gate` and `probe` skills before `acquire-lock` finishes — **acquired lock is released within milliseconds, and skills run unlocked.**
- **Reproduction** — `node executor/dist/cli.js inspect <any-cycle>` shows Layer 0 contains both `acquire-lock` and `release-lock`. Run `lattice run build-cycle --topic foo` and observe via `.lattice/cycle-lock/foo/` — the directory is created and immediately removed.
- **Recommended fix** — Make `release-lock` a route target with `depends_on` linking it through gate paths only, or add an explicit guard in the engine that suppresses unreached route-target nodes. Equivalently, make every workflow's terminal `complete` node be the *only* place locks are released, and remove the parentless `release-lock` nodes (the engine already routes through them via gate `route:` references when needed; but Kahn places them in Layer 0 because the routes are not part of the topological order — see engine.ts dag.ts line 31, "Gate/approval routing edges are NOT part of topological sort"). Alternative: give `release-lock` a `depends_on: [acquire-lock]` and rely on routing to skip it when not reached, AND have `acquire-lock` use `release-topic-lock.sh` only when invoked through a route.
- **Affected callers** — `lattice run <cycle>`, `lattice autopilot` (every workflow it dispatches).

### CRITICAL-2: `release-lock.sh` and `release-topic-lock.sh` perform no ownership check

- **File:line** — `C:/pg/lattice/scripts/release-lock.sh:10-13`, `release-topic-lock.sh:11-14`.
- **Description** — Both scripts unconditionally `rm -rf "$LOCK_DIR"`. They never read the `meta` file to verify the caller is the holder. Combined with CRITICAL-1, any cycle workflow's spurious Layer-0 `release-lock` blows away the lock taken by `acquire-lock` micro-seconds earlier, regardless of whether it was the same agent or a parallel session.
- **Reproduction** — Session A: `bash scripts/acquire-topic-lock.sh foo agent-A`. Session B: `bash scripts/release-topic-lock.sh foo` — succeeds, A's lock gone with no warning. Session A's heartbeat-touch on the now-deleted `meta` is silent.
- **Recommended fix** — Both scripts should read `meta`, compare the recorded `holder:` against an explicit `--holder` argument or `LATTICE_LOCK_HOLDER` env, and refuse the release on mismatch. Provide a `--force` flag for the legitimate stale-lock recovery case, and log all forced releases to `decisions.log`.
- **Affected callers** — Every workflow's `release-lock` node, `commands/lattice/autopilot.md` Step 3 (line 117), pre-commit `EXIT` trap, manual user invocation.

### CRITICAL-3: `acquire-lock.sh` `check_stale` force-deletes any lock older than 300s — no holder check

- **File:line** — `C:/pg/lattice/scripts/acquire-lock.sh:47-70` (and `acquire-topic-lock.sh:61-82` for the 1800s version).
- **Description** — When the lock is held but the metadata file's mtime exceeds the threshold, `check_stale` runs `rm -rf "$LOCK_DIR"`. There is no holder verification, no decisions.log entry, no decisions.log notice. Identical PreToolUse-hook code at `pcc/.claude/settings.json:19` and `lattice/hooks/claude-hooks.json:9` does the same: `if [ "$LOCK_AGE" -gt 300 ]; then ... rm -rf "$LOCK_DIR"`. A long-running but legitimate skill (a 6-minute peer-review run is normal) crosses 300s and another agent's commit silently removes its lock.
- **Reproduction** — Session A holds lock from a long-running skill (peer-review can take 5-10 min). Session A's `meta` mtime is set at acquire time and is not refreshed during the skill run. Session B fires PreToolUse on `git commit *`, sees age > 300s, runs `rm -rf .lattice/commit.lock`. Session A's commit silently succeeds without serialization; concurrent staging from B can be conflated.
- **Recommended fix** — (a) Don't force-clear in PreToolUse hooks — block and report instead, with a manual recovery instruction. (b) `acquire-lock.sh` should refresh its own `meta` mtime via a heartbeat file written by the lock holder during long operations (`acquire-topic-lock.sh` claims this in CLAUDE.md:174 but no caller actually does it). (c) Log every force-acquire to `decisions.log` with both the original `meta` contents and the new holder, so post-hoc audit is possible.
- **Affected callers** — Every commit attempt under a hook-enabled session; every cycle dispatch.

### CRITICAL-4: `engine.ts:maybeWipCommit` runs `git add -A` + `git commit` with no ownership check

- **File:line** — `C:/pg/lattice/executor/src/engine.ts:616-642`.
- **Description** — Every workflow checkpoint write fires `maybeWipCommit`. When the dirty count exceeds 15 files, it runs `execSync('git add -A')` followed by `execSync('git commit -m "wip: ${topicName} checkpoint ${stateKey}"')`. **Identical defect class to the seed bug**: the 15+ dirty files may include a parallel session's work. The autopilot's path-scoped stash fix (autopilot.ts:192-225) prevents the stash variant of this bug, but `maybeWipCommit` still does the unscoped `git add -A`. The commit lands in HEAD with the wrong topic message — and because it commits, the parallel session's work is now part of *autopilot's* commit history. Recovery requires `git reset --soft HEAD^` and re-staging, which is hard if subsequent commits land on top.
- **Reproduction** — Session A: `lattice run build-cycle --topic foo` completes a 15+ file checkpoint. Session B has 5 dirty files staged manually. `maybeWipCommit` runs `git add -A` (which sweeps B's changes into the index), then commits with message `wip: foo checkpoint build.1`. B's files are now committed under A's topic.
- **Recommended fix** — `maybeWipCommit` should use the same `captureDirtyPaths` / path-scoped approach as `stashWorkflowOutput`, and should also acquire the commit lock before staging, set `LATTICE_LOCK_HOLDER`, and verify the staged set matches the workflow's expected paths via a commit-intent file — or it should not auto-commit at all and instead surface to the agent that a checkpoint commit is needed.
- **Affected callers** — Every workflow node with a `checkpoint:` block, fired through the engine.

### CRITICAL-5: State-file writes are not atomic — torn reads under concurrent execution

- **File:line** — `C:/pg/lattice/executor/src/engine.ts:555` (writeCheckpoint), `engine.ts:605` (writeCostToState), `auto-resolve.ts:418` (applyResolution), `reconcile.ts:269` (updateStateFile).
- **Description** — Every state-file write uses `writeFileSync(path, data)` directly. Node's `writeFileSync` truncates and writes; a concurrent reader on the same file can observe an empty or partial file. The autopilot's `loadPortfolioState` (called repeatedly across the per-iteration loop and in `lattice status`/`lattice coherence`) reads the same files. Probability is low for small YAML, but not zero on Windows where `writeFileSync` can split into multiple WriteFile calls.
- **Reproduction** — Hard to repro deterministically; would need a torn-write fault injector. But the YAML files routinely grow to 5-10 KB and the engine writes multi-KB diffs (cost data with per-node breakdowns at engine.ts:586-606).
- **Recommended fix** — Use temp-file + rename pattern: `writeFileSync(path + '.tmp', data); renameSync(path + '.tmp', path)`. `rename` is atomic on POSIX and on Windows for files on the same volume.
- **Affected callers** — Every checkpoint write, every reconcile run, every auto-resolve apply.

### CRITICAL-6: `revision_check: true` is a documented safety claim that the engine never enforces

- **File:line** — Schema declared in `workflows/schema.md:30`, `executor/src/types.ts:28`. Set to `true` in every cycle workflow. Documented in `CLAUDE.md:192-201`, `ENFORCEMENT.md:181`, `WORKFLOW-INTERNALS.md:22` ("State file `revision` field prevents concurrent overwrites").
- **Description** — `engine.ts:writeCheckpoint` (lines 543-545) increments `revision` but never compares against the value read at workflow start. There is no abort on mismatch. A grep for `revision_check` in `executor/src/` finds only the type declaration, never a consumer. The CLAUDE.md protocol — "If mismatch: STOP — another agent modified the file" — is documented for users to follow manually but is not mechanical anywhere in the executor. Two parallel agents writing checkpoints to the same state file silently lose the earlier writer's update (last-write-wins).
- **Reproduction** — Both agents read state at revision=5. Agent A writes revision=6 (its checkpoint). Agent B (which still holds revision=5 in its read snapshot) writes revision=6 (its checkpoint, overwriting A's). Both writes succeed; A's checkpoint is lost.
- **Recommended fix** — Either (a) implement the documented contract: re-read before write, compare revisions, throw on mismatch — or (b) remove the doc-only safety claim and replace it with what's actually implemented (mkdir-based topic locks). Option (a) is safer; option (b) at minimum stops the framework from making false promises.
- **Affected callers** — Every checkpoint write across every cycle.

---

## HIGH findings

### HIGH-1: PreToolUse `git commit *` hook auto-clears stale commit locks with no notification

- **File:line** — `C:/pg/pcc/.claude/settings.json:19`, `C:/pg/lattice/hooks/claude-hooks.json:9`.
- **Description** — Identical to CRITICAL-3 but specifically for the Claude Code harness's PreToolUse hook. `if [ "$LOCK_AGE" -gt 300 ]; then ... rm -rf "$LOCK_DIR"`. This fires before *every* `git commit *` Bash invocation — so any time a commit is attempted, any "stale" lock is silently removed. The fix differs from CRITICAL-3 because this is in JSON-encoded inline bash; tighter constraints on what can be done.
- **Reproduction** — Same as CRITICAL-3.
- **Recommended fix** — The hook should *block* (exit 1 with a "lock is N seconds old, holder X — investigate manually" message) instead of force-clearing, OR it should write a `decisions.log` row before clearing so post-hoc audit is possible.
- **Affected callers** — Any Claude Code session that runs `git commit *`.

### HIGH-2: `e2e.ts` branch mode does unscoped `git stash push` — same defect class as the seed bug

- **File:line** — `C:/pg/lattice/executor/src/e2e.ts:592-608`, `e2e.ts:611-622`.
- **Description** — Both `branch` and `uncommitted` modes run `git stash push -m "lattice-e2e-gate"` over the entire dirty tree. There is no `captureDirtyPaths`-style filter. If e2e fires while a parallel session has uncommitted edits in the same repo, those edits are stashed and the e2e gate switches branches (`git checkout base`, then `git checkout origin`). The cleanup path at lines 604, 619, 661-663 attempts `git stash pop` and on conflict only emits a warning string — the parallel session's work sits in stash and the user must manually recover.
- **Reproduction** — User session has dirty edits. Build-cycle workflow advances to layer 4 (`e2e-run`) which calls `lattice e2e run`. The e2e flow stashes the user's edits, runs base + feature suites (10+ minutes), and on stash-pop conflict the user must `git stash list` and manually recover.
- **Recommended fix** — e2e should refuse to run when the working tree contains paths NOT owned by the workflow that triggered it; require a clean tree as precondition, OR use the same `captureDirtyPaths` discipline as the autopilot fix to scope the stash.
- **Affected callers** — `lattice e2e run` (called from `build-cycle.yaml:88-92` `e2e-run` node and `bug-fix-cycle.yaml`).

### HIGH-3: Approval node default-to-first-option is a destructive UX trap

- **File:line** — `C:/pg/lattice/executor/src/nodes.ts:561-564`.
- **Description** — When `promptApproval` cannot parse the user's input (typo, blank input, etc.), it does:
  ```js
  console.log(`Invalid selection "${trimmed}", defaulting to: ${options[0].id}`);
  resolve(options[0].id);
  ```
  Approval options often include destructive actions (`abort`, `override`, `revise`) ordered for narrative clarity, not safety priority. `blueprint-cycle.yaml:218-220` `simplify-stop-twice` has `route: synthesize` (revise = first option) — relatively safe. But `architect-stop-reject` (line 222-236) has `revise` first, `override` second, `abort` third — a user who hits enter without thinking gets `revise`, which RE-RUNS synthesize and burns budget. Worse, `plan-stop-disagreement` (line 563-583) has `r1` first, `r2` second, `abort` third — defaults to "side with R1" silently.
- **Reproduction** — In any approval node, hit Enter at the prompt without typing.
- **Recommended fix** — Either fail closed (re-prompt or abort the workflow), OR require the workflow author to mark a `default:` option explicitly, OR default to the first abort/cancel option.
- **Affected callers** — Every interactive approval node in every cycle.

### HIGH-4: No tests anywhere in the framework

- **File:line** — `C:/pg/lattice/` — no `*.test.ts`, no `*.test.js`, no `tests/` directory, no `vitest`/`jest` config in `executor/package.json`.
- **Description** — Confirmed via `find C:/pg/lattice -name "*.test.*" -o -name "test_*.py"` returning empty. Concurrent-session scenarios are entirely untested. No test exercises "two sessions write the same state file", "two sessions hold and release the same lock", "stash-pop conflict during e2e branch switch", or "release-lock fires before acquire-lock completes". The CRITICAL-1 bug — release-lock in Layer 0 — would be caught by any unit test of `buildExecutionLayers` for cycle workflows.
- **Reproduction** — N/A; structural finding.
- **Recommended fix** — Add a minimal `vitest` setup. Cover: (a) layer-construction for every shipped workflow with assertions on which nodes appear in Layer 0; (b) `acquire-lock` / `release-lock` semantics (ownership check, stale handling) with shell-script test harness; (c) `captureDirtyPaths` + `stashWorkflowOutput` ownership boundaries with a simulated parallel session; (d) `revision_check` round-trip when implemented.
- **Affected callers** — All future regressions.

### HIGH-5: Lock heartbeat documented but never implemented

- **File:line** — `C:/pg/lattice/CLAUDE.md:172-184` ("After every `current_step` state update, touch the lock metadata to keep the heartbeat fresh"), `acquire-topic-lock.sh:18` (comment promises heartbeat-touch).
- **Description** — `acquire-topic-lock.sh` writes meta on acquire and on re-entrant acquire. No code path in the executor (`engine.ts`, `autopilot.ts`, `nodes.ts`) ever runs `touch .lattice/cycle-lock/{topic}/meta` or re-runs `acquire-topic-lock.sh` mid-workflow. Long workflows (peer-review, research) take 10-30 minutes; the 30-minute STALE_THRESHOLD will fire mid-execution. Combined with `release-topic-lock.sh`'s lack of ownership check, a parallel session's `acquire-topic-lock.sh` will see the stale meta, run `rm -rf` (line 78 of acquire-topic-lock.sh), and force-acquire while the original holder is mid-skill.
- **Reproduction** — `lattice run blueprint-cycle --topic foo` (long peer-review skill takes 25+ min). At the 30-minute mark, parallel session B runs `lattice run build-cycle --topic foo` — acquires the lock, both sessions now write to `.lattice/cycle-state/foo.yaml`.
- **Recommended fix** — Engine should refresh the topic-lock meta at every checkpoint write (or every N minutes via a background timer). Add a `LATTICE_LOCK_HOLDER`-aware wrapper in `engine.ts` that ties lock lifecycle to workflow lifecycle.
- **Affected callers** — Every long-running cycle (peer-review nodes routinely exceed 10 min).

### HIGH-6: Bash node template substitution feeds user-controlled data through shell

- **File:line** — `C:/pg/lattice/executor/src/nodes.ts:67-78` (`executeBash`), `template.ts:22-27`.
- **Description** — `executeBash` does `const command = resolveTemplate(node.command, ctx); const stdout = execSync(command, opts);`. `execSync` without `shell: false` runs through the shell. Templates can include `{{inputs.topic}}`, `{{nodes.X.output}}`, `{{state.phase}}`. Workflow `cycle.yaml:41-48` includes a bash node `dedup-check` whose command embeds `{{inputs.topic}}` directly into a `grep -P` pattern. If an agent or user sets `topic` to e.g. `"foo$(rm -rf ~)"` or with newlines + arbitrary commands, the substitution lands in the shell unescaped. Workflows are typically authored locally so the surface is internal, but autopilot reads topic IDs from TODO.md and cycle-state YAML names — both writable by any skill.
- **Reproduction** — Manually edit a cycle-state filename or TODO.md `id:` to embed a shell metacharacter; run autopilot.
- **Recommended fix** — Sanitize inputs at the workflow-input boundary (regex `^[A-Za-z0-9_./-]+$` on topic IDs); prefer `spawnSync` with `shell: false` and an argv-form command; or shell-escape every template substitution before interpolation.
- **Affected callers** — Every bash node in every workflow; autopilot's auto-routing.

### HIGH-7: pcc design-mode-gate hook references a script that doesn't exist in pcc

- **File:line** — `C:/pg/pcc/.claude/settings.json:9` references `$ROOT/scripts/design-mode-gate.sh`. The script exists at `C:/pg/lattice/scripts/design-mode-gate.sh` but `ls C:/pg/pcc/scripts/design-mode-gate.sh` returns "No such file or directory."
- **Description** — Hook command `bash "$ROOT/scripts/design-mode-gate.sh"` will return exit 127 (command not found). Depending on Claude Code's PreToolUse semantics, exit 127 either silently passes (hook treated as no-op) or blocks every Write/Edit. Either way, the hook's documented intent (block .tsx edits during design-mode preamble) is not enforced. `sync-skills.sh` (CRITICAL-7 fix candidate) doesn't propagate this script — it's not in any synced path. The hook's design-mode protection is broken for pcc.
- **Reproduction** — Open pcc in Claude Code, attempt a `.tsx` edit. Either it goes through silently (hook is no-op) or every edit is blocked.
- **Recommended fix** — Either (a) propagate `design-mode-gate.sh` through sync-skills.sh's mapping, or (b) remove the hook entry from pcc settings.json until the script lands in pcc.
- **Affected callers** — Every Write/Edit in pcc.

---

## MEDIUM findings

### MEDIUM-1: `sync-workflow-includes.py` overwrites consumer workflows without clobber check

- **File:line** — `C:/pg/lattice/scripts/sync-workflow-includes.py:148`.
- **Description** — `path.write_text(new_content, encoding="utf-8")` rewrites consumer workflow YAMLs (blueprint-cycle, research-cycle, bug-fix-cycle) without checking whether the target has uncommitted edits. Compare to `sync-skills.sh:78-87` which has a `git diff --quiet HEAD --` clobber check. A user editing `workflows/blueprint-cycle.yaml` in the framework repo at the moment another agent runs `sync-workflow-includes.py` loses their edit.
- **Recommended fix** — Mirror sync-skills.sh's clobber check: skip when `git diff --quiet HEAD -- <path>` returns non-zero, log to a sync-skip file.

### MEDIUM-2: Autopilot's per-item "preWorkflowDirty" snapshot is post-candidate-selection, not start-of-loop

- **File:line** — `C:/pg/lattice/executor/src/autopilot.ts:570`.
- **Description** — The fix for the seed bug snapshots dirty paths *just before* each item's workflow runs. New writes between coherence checks and the snapshot are foreign-marked, but new writes *during* the workflow run (which can be 10-30 minutes) are classified as workflow-owned and stashed. The race window has narrowed but is not zero. A parallel session that writes a file during autopilot's running workflow will see that file stashed under autopilot's label.
- **Recommended fix** — Capture the snapshot continuously (refresh during workflow execution at known checkpoint moments), or use git's `index` instead of working-tree as the boundary signal.

### MEDIUM-3: `merge-shared-state.sh` deletes intermediate files before writing — partial-failure can lose state

- **File:line** — `C:/pg/lattice/scripts/merge-shared-state.sh:84-95`.
- **Description** — On clean merge: `cp "$file.merged" "$file"`. If the script is interrupted (Ctrl-C) between the `cp` and `rm -f $file.local $file.head $file.base $file.merged`, the temp files leak. Worse, on conflict (line 91-93) the conflict-marked file is copied into place, possibly overwriting valid content. There's no `set -e` so an early failure in `cp` doesn't propagate.
- **Recommended fix** — Use `mv` not `cp` (atomic), `set -euo pipefail` properly, and add a final cleanup trap.

### MEDIUM-4: `appendContextTelemetry` and `decisions.log` use `appendFileSync` — torn writes possible for entries >PIPE_BUF

- **File:line** — `C:/pg/lattice/executor/src/budget.ts:249`, `engine.ts:659`.
- **Description** — `appendFileSync` is atomic only for writes <= PIPE_BUF (4KB on most Linux, 512B on Windows). Long telemetry entries with large model names or stack-trace summaries could exceed this. Two appenders running concurrently can interleave bytes within a single line, producing corrupt JSONL or TSV.
- **Recommended fix** — Acquire a file lock (`proper-lockfile` package) around appends; or use `O_APPEND` directly via `fs.openSync` with `'a'` flag and ensure each write fits in one syscall.

### MEDIUM-5: `e2e.ts` runs base-branch suites with the consumer's working tree at HEAD~1 — auto-detect can mis-classify

- **File:line** — `C:/pg/lattice/executor/src/e2e.ts:205-228`.
- **Description** — `detectComparisonMode` decides between `branch`, `uncommitted`, and `last-commit` based on a `try`/`catch` ladder. The first failure at `git rev-list --count <baseBranch>..HEAD` (e.g., transient git lock from a parallel `git status` running in another tool) silently falls through to `uncommitted` mode. That mode stashes dirty work and runs `runWithSetupTeardown` against HEAD — substantively different behavior triggered by a transient git error.
- **Recommended fix** — Distinguish "git command failed" from "branch is not ahead" — propagate as an error rather than fall through.

### MEDIUM-6: `auto-resolve.ts` writes to state files outside the topic lock

- **File:line** — `C:/pg/lattice/executor/src/auto-resolve.ts:418`, called from `autopilot.ts:469-474`.
- **Description** — Auto-resolve runs *before* any topic lock is acquired (autopilot's "no items can be advanced -> auto-resolve -> retry" path at autopilot.ts:417-447). The resolution writes to multiple cycle-state YAMLs via `applyResolution`. Other agents working on those topics hold the topic lock but the auto-resolve writer doesn't acquire it.
- **Recommended fix** — Auto-resolve should acquire each topic-lock briefly before writing that topic's state file, with `--poll` semantics.

### MEDIUM-7: Workflow YAMLs declare `lock:` block that the engine doesn't read

- **File:line** — `C:/pg/lattice/workflows/build-cycle.yaml:29-32`, `blueprint-cycle.yaml:23-26`, `mechanical-fix-cycle.yaml:28-31`, `bug-fix-cycle.yaml`, etc.
- **Description** — Every cycle declares `lock: type: topic, key: "{{inputs.topic}}", holder: <name>`. A grep of `executor/src/` for `lock:` or `loadWorkflow.*lock` finds nothing — the engine ignores this declaration entirely. Locks are acquired only via the `acquire-lock` bash node. The declarative `lock:` block is doc-fiction. If an author forgets to add the bash node (or misnames the holder), the executor doesn't notice.
- **Recommended fix** — Either (a) wire the engine to actually consume `lock:` (acquire at workflow entry, release at exit), or (b) remove the dead block from all workflows and document that `acquire-lock` is the explicit mechanism.

### MEDIUM-8: `lattice status` and `lattice coherence` look read-only but mutate state

- **File:line** — `C:/pg/lattice/executor/src/cli.ts:390` (cmdCoherence calls `reconcileStates(rawTopics, cwd, true)` — write=true), `cli.ts:451` (cmdStatus same).
- **Description** — `reconcile.ts:62-65` writes corrected phase to state files when `write=true`. Both commands pass `write=true` unconditionally. A user running `lattice status` to inspect state can silently overwrite cycle-state files based on git log heuristics. There's no `--dry-run` flag to opt out (the actual `--dry-run` flag in BOOLEAN_FLAGS targets workflow execution, not status). `lattice coherence` does support `--skip-reconcile`, but `lattice status` has no escape hatch.
- **Recommended fix** — Default to `write=false` for status; require explicit `--reconcile` to enable writes; document that `lattice status` is non-mutating.

---

## LOW findings

### LOW-1: `loader.ts` allows `command` strings of arbitrary length and content — no validation
- **File:line** — `C:/pg/lattice/executor/src/loader.ts:52-98`. validateReferences checks node references; nothing checks `bash` node `command` content. A workflow author can ship arbitrary destructive shell commands by editing a YAML.

### LOW-2: `engine.ts:resolveStatePath` template substitution silently drops un-resolvable templates that aren't `inputs.X`
- **File:line** — `engine.ts:457-470`. Only `inputs.X` substitutions are performed; `state.X` / `nodes.X` references in `state.file` would be left as literal `{{...}}` and the regex check at line 464 only catches unresolved `inputs.*`. Misnamed templates produce literal-curly filenames.

### LOW-3: `nodes.ts:looksLikeErrorOutput` is a heuristic — false positive risk
- **File:line** — `nodes.ts:449-462`. Substring match on "error", "rate limit", etc. A skill output that legitimately discusses "rate limit considerations" could be mis-classified as a CLI failure.

### LOW-4: WORKFLOW-INTERNALS.md states "decisions.log entry" guarantees that don't exist for several silent failure paths
- **File:line** — `WORKFLOW-INTERNALS.md:46` ("Collect all STOP conditions") implies persistence; in practice, only the engine's `logDecision` (engine.ts:646-663) writes to decisions.log, and the autopilot's circuit-breaker bail-out at autopilot.ts:610-617 prints to stdout but does not write decisions.log. A circuit-breaker trip is invisible after the terminal closes.

### LOW-5: `autopilot.ts:127-135` `rootCausePrefix` strips paths and timestamps — over-aggressive
- **File:line** — `autopilot.ts:127-135`. The regex `[A-Za-z]:[\\/][^\s'"`]+` and `[/][^\s'"`]+\.(ts|js|md|yaml|json|py)` strips Windows and POSIX paths. Two genuinely-different errors that share the same skeleton ("Build failed in `<path>` at `<ts>`") are now the same prefix and accumulate against the circuit breaker. Bad signals can trip it after 5 unrelated failures.

---

## Audit gaps

What couldn't be verified from code alone — needs runtime verification.

1. **PreToolUse hook semantics for missing scripts.** HIGH-7 references the missing `design-mode-gate.sh` in pcc. Whether the harness treats exit 127 as block-or-pass is platform-specific; would need a Claude Code runtime probe.
2. **Atomicity of `writeFileSync` on Windows for files >64KB.** CRITICAL-5 risk magnitude depends on whether libuv's WriteFile chunks. Need a synthetic torn-write test on Windows NTFS.
3. **Stash-ref drop semantics under "successive overlapping" stashes.** The seed-bug retro mentions "some refs got dropped, leaving work as dangling git objects." The exact mechanism (git stash drop autocalled? Refs pruned by gc? Race between two `stash push` operations?) is not verified by code reading alone.
4. **Whether subagent (architect-reviewer, decision-auditor, peer-review) launches share working directory with the orchestrator.** The skill prompts are markdown — they describe what the agent should do. Whether the harness executes them in a fresh process tree, an isolated `cwd`, or with the same shell environment as the parent is harness-implementation-specific. Concurrent-write risk depends on this.

---

## Out-of-scope observations

- The framework documents a strong commit-intent protocol (rule 23) and the pcc pre-commit hook enforces it strictly. This is a strong line of defense — but the LATTICE-side work that landed via `lattice autopilot` doesn't honor it (the executor doesn't write `.lattice/commit-intent.txt` before its own `git commit` calls in `engine.ts:maybeWipCommit`).
- `merge-shared-state.sh` shells out to `git merge-file` for 3-way merge. Conflict markers in `decisions.log` would corrupt downstream parsers (`reconcile.ts` greps the log for trailers). No test covers a conflict-marker line in decisions.log; the parser may produce nonsense output but won't crash.
- The "circuit-breaker" claim in CLAUDE.md rule 7 is wired in autopilot.ts:610-617 (correct) — but ONLY for repeated same-cause failures within a single autopilot loop. A genuine circuit breaker across sessions would require persistence; the current implementation forgets state between `lattice autopilot` invocations.
- The framework heavily uses `js-yaml` `yaml.dump` with `lineWidth: -1`. This produces multi-line YAML output that, when read-modify-written by two agents, can produce git diffs that look like full-file rewrites — making it harder to diagnose state-file races post-hoc.
- `sync-skills.sh:75-87` uses `git diff --quiet HEAD -- <path>` to check whether a target is dirty. This check operates on tracked files only; if the synced file is a brand-new path that's untracked in the consumer, `git diff` returns clean and the file gets overwritten. Probably benign in practice (untracked == not yet integrated) but worth noting.
