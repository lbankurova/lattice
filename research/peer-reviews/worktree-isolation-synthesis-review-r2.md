# Peer Review R2: worktree-isolation-synthesis.md

> **Document reviewed:** `C:/pg/lattice/incoming/worktree-isolation-synthesis.md`
> **Prior review:** `C:/pg/lattice/research/peer-reviews/worktree-isolation-synthesis-review.md` (R1)
> **Round:** 2 — verifying R1 incorporation + hunting new issues from revisions
> **Date:** 2026-05-09
> **Reviewer:** independent peer reviewer (blind to project implementation context)
> **Scope:** (1) verify each named R1 finding was addressed; (2) identify new issues introduced by revisions; (3) focus scrutiny on F3 absolute-path detection (symlink false-positive risk) and F5 npm install overhead

---

## R1 Finding Verification

### F1: Rate claim correction (Section 7 Q2 + Section 6 AC1)

**R1 verdict:** CONDITIONAL — "30 days" rate was inaccurate; all 4 incidents occurred in a 2-day window.

**What the synthesis now says:**

Section 7 Q2 (frequency row): "4 named incidents in a 2-day burst (2026-04-26 to 04-28), PLUS 2-3 same-root-cause events undercounted in the original audit: 2026-04-27 commit `45f29b53` rendered empty by concurrent interleave; 2026-05-03 events `c9f82aa` + `32944cf0` recorded as 'submodule-conflated' in decisions.log AFTER commit-intent deployed — confirming the detection protocol does not reduce the rate to zero."

Section 6 AC1: "Pre-baseline: 4 named incidents in a 2-day burst (2026-04-26 to 04-28: `1370c103`, `521f1d16`, `a47ee865`, `abdb31c9`), PLUS at least 3 same-root-cause events undercounted in the audit."

**Assessment:** F1 is fully addressed. Both locations now correctly characterize the incident pattern as a burst, not a uniform 30-day rate. The additional undercounted events are named explicitly with commit hashes and dates, strengthening the evidentiary base.

**Verdict: SOUND — F1 addressed**

---

### F2: 5th stop-light observable added

**R1 verdict:** CONDITIONAL — the four named observables could not detect whether the hook was actually firing. Required a 5th observable: block-event count > 0.

**What the synthesis now says:**

Section 1 stop-light gate: "5. `require-worktree.sh` block-event count > 0 during R1 traffic — confirms the hook is actually firing on canonical-root attempts, not silently no-op'ing. Measured via `.lattice/require-worktree-block.log` (one row per blocked tool call: timestamp, tool name, sanitized input, cwd). **Critical signal** (peer-review Finding 2): without this observable, all four other observables can show clean while the prevention class survives through any hook bypass."

The gate sentence now also reads: "no R0 hook deploys until all four pass" — note the text says "all four" (not "all five"). This is a wording inconsistency: the gate clause was not updated to say "all five" when the 5th observable was added.

**Assessment:** The 5th observable is substantively present and correctly framed. The prose description is sound. However, the gate sentence retains "all four pass" — a build engineer reading only the gate sentence will think the 5th observable is advisory, not required.

**Verdict: CONDITIONAL — minor wording inconsistency in gate sentence**

The phrase "no R0 hook deploys until all four pass with reasonable traffic volume" must be updated to "all five." As written, the 5th observable's blocking status is ambiguous. Given that the R1 review called this the Critical Signal finding, ambiguity here is not acceptable.

**What fixes it:** Change "until all four pass" to "until all five pass" in the stop-light gate closing sentence (Section 1, after observable 5).

---

### F3: Absolute-path bypass detection added to require-worktree.sh

**R1 verdict:** CONDITIONAL — the cwd-based detection had an unclosed bypass: a session in a worktree could call Edit with `file_path=/canonical/repo/file.ts` and silently mutate canonical files.

**What the synthesis now says:**

The hook now performs "two-pronged detection": (a) check whether cwd equals canonical root; AND (b) extract `file_path` from `$CLAUDE_TOOL_INPUT` JSON, resolve to absolute path, check whether the resolved path is inside the canonical repo root regardless of cwd. A dedicated unit test row is added: "blocks absolute-path bypass from worktree" — cwd = worktree path; file_path = absolute path inside canonical; hook exits 1.

The 5th observable in the R0 stop-light gate appends block events to `.lattice/require-worktree-block.log`.

**New issues introduced by the F3 change:**

#### NI-1: Symlink-resolve false positive — `.lattice/` is itself a symlink in worktrees

The synthesis specifies in D1 that `lattice-session-start.sh` creates a symlink `.lattice -> ../<canonical-repo-path>/.lattice` inside each worktree. This means within a worktree, `.lattice/` is a symlink pointing into the canonical repo's `.lattice/`. 

When the hook's prong (b) resolves a file_path to an absolute path, it must compare against the canonical repo root. If the implementation uses shell `readlink -f` or Python `os.path.realpath()` to resolve the absolute path, then a file_path of `<worktree-root>/.lattice/decisions.log` will resolve to `<canonical-root>/.lattice/decisions.log` because the `.lattice/` symlink in the worktree points into canonical. The resolved path IS inside the canonical repo root.

**This creates a false positive:** a worktree session attempting to append to `.lattice/decisions.log` via `Edit` (using the worktree-local path `<worktree>/.lattice/decisions.log`) — which is the exact mechanism the synthesis REQUIRES for attestation writes and decisions.log entries — would have its `file_path` resolve through the symlink into canonical, triggering prong (b) and blocking the write.

The synthesis explicitly requires attestation writes to flow through `.lattice/` in the worktree (R2 AC3: "The worktree's `.lattice/` resolves via the D1 mechanism"). If prong (b) follows symlinks during path resolution, it will block these legitimate writes.

**Scope of impact:** This is not a hypothetical edge case. `.lattice/` writes are the primary mechanism for:
- Decisions.log entries from any session
- Attestation file writes in `lattice-session-start.sh`
- Cycle-state updates during autopilot
- The block.log itself (append to `.lattice/require-worktree-block.log` — would the hook block itself from logging?)

**What fixes it:** Prong (b) must resolve paths WITHOUT following symlinks (use `readlink` without `-f`, or compare string-prefix against the worktree's own root before resolving). The synthesis must specify whether path resolution uses `realpath` (follows symlinks) or `readlink` without `-f` (does not). The correct implementation should:
1. First check: does the path (unresolved) fall within the worktree's root? If yes, permit — the write targets the worktree.
2. Only if the path falls OUTSIDE the worktree root (or is unambiguously absolute and outside): then check whether it falls inside canonical root, and block if so.

Alternatively: the allowlist (D4 Tier 1) must explicitly include `.lattice/**` paths, which are always-permitted writes from any context (worktree or canonical). Since `.lattice/` is the shared state surface, writes to it are structurally required from worktrees and should not be gated by prong (b).

The unit test ("blocks absolute-path bypass from worktree") as currently described uses a non-`.lattice/` target (`/canonical/repo/foo.ts`). It does not test the `.lattice/decisions.log` write case, which is the most common write that worktree sessions make into the canonical tree by design.

---

#### NI-2: Prong (b) JSON extraction is brittle on multi-argument Bash commands

The hook spec says: "extract `file_path` from `$CLAUDE_TOOL_INPUT` JSON." For Edit and Write tool calls, `$CLAUDE_TOOL_INPUT` contains `{"file_path": "..."}` and extraction is straightforward. For Bash tool calls, `$CLAUDE_TOOL_INPUT` contains `{"command": "..."}` — there is no `file_path` key. However, the Bash command string itself can contain absolute paths: `git add /canonical/repo/foo.ts` or `cp /worktree/file /canonical/target`.

Prong (b) as specified applies only to Edit/Write (which have file_path). The hook specification in the synthesis says: "extract `file_path` from `$CLAUDE_TOOL_INPUT` JSON" — but the D5 matcher specifies the hook is dispatched for BOTH `Edit|Write` AND `Bash(git add*|git commit*|git stash*)`. When the Bash matcher fires, there is no file_path in the JSON; the extraction returns empty string; prong (b) does not fire. This means the absolute-path bypass is only closed for Edit/Write, not for Bash-based staging commands with explicit absolute paths.

**Example:** `git add /canonical/repo/file.ts` issued from a worktree cwd — the Bash matcher fires, prong (a) sees cwd = worktree (not canonical) and permits it, prong (b) cannot extract a file_path from the Bash command JSON and silently skips. The staging contamination proceeds.

**Assessment:** This is a partial fix for Finding 3. The F3 bypass is closed for Edit/Write file_path targets, but remains open for Bash-based staging with explicit absolute paths. The synthesis does not acknowledge this residual vector.

**What fixes it:** For Bash-matcher invocations, the hook should additionally scan the command string for absolute paths matching `^$CANONICAL_ROOT` (or `^$CANONICAL_ROOT/[^.worktrees]` to exclude worktree-side children) and block if found. This is feasible with a simple regex on the command string. Alternatively, document explicitly that absolute-path staging via Bash is an accepted residual risk given that the Bash git matchers (`git add*`) already catch the common case, and only unusual patterns (`git add /abs/path`) are unclosed.

---

### F4: Counter-argument (commit-intent sufficient?) surfaced in Section 7 Q3

**R1 verdict:** CONDITIONAL — the synthesis failed to present and refute the strongest counter-argument (commit-intent detection is sufficient; worktrees are overkill).

**What the synthesis now says:**

Section 7 Q3 (workaround row): "**Counter-argument considered (peer-review LBC-2 + Finding 4):** is commit-intent detection alone sufficient? Verdict: NO. The protocol's own `commit-intent-protocol.md` explicitly admits 'Failure modes the gate does NOT catch: Pre-staged work from a previous session; Sub-file conflation.' The 2026-05-03 `c9f82aa` and `32944cf0` events occurred AFTER protocol deployment, demonstrating the detection layer's residual gap. Worktree isolation is the prevention layer the detection layer cannot become."

**Assessment:** F4 is substantively addressed. The counter-argument is named, the verdict is stated, and two independent sources are cited: the protocol's own stated failure modes (self-refutation) and empirical post-protocol conflation events. This is the correct structure for refuting H1.

**Verdict: SOUND — F4 addressed**

---

### F5: npm install + project-setup auto-detection added

**R1 verdict:** CONDITIONAL — `lattice-session-start.sh` spec omitted `npm install`; any worktree session attempting frontend TypeScript compilation would fail.

**What the synthesis now says:**

Section 1 R1 table, `lattice-session-start.sh` description: "**runs project-setup auto-detection per superpowers SKILL Step 3** (peer-review Finding 5): if `package.json` exists, run `npm install` (gitignored `node_modules/` is NOT copied by `git worktree add`; without this step, sessions cannot run `npm test`/`npm run build`); if `requirements.txt` exists, prompt user before running `pip install -r requirements.txt`."

Section 1a D6 borrow table, item 5: "**Project setup auto-detection** (superpowers Step 3) — if `package.json` exists, run `npm install` after worktree creation; if `Cargo.toml`, `cargo build`; if `requirements.txt` or `pyproject.toml`, prompt the user."

**New issues introduced by the F5 change:**

#### NI-3: npm install per session-start creates prohibitive overhead for repeat sessions

The synthesis now specifies that `lattice-session-start.sh` runs `npm install` unconditionally whenever `package.json` exists. For pcc, a frontend session includes `frontend/package.json`. A typical `npm install` in pcc is:

- Cold install (no local cache): ~2-5 minutes (downloads packages over network)
- Warm install (packages locally cached): ~10-30 seconds (resolves from npm cache)

For autopilot batches under R1, `LATTICE_AUTOPILOT_WORKTREE=1` creates a new worktree for each batch. If autopilot runs 3 batches per work session, each batch pays `npm install` overhead at session-start. Even with npm cache, 10-30 seconds per batch is non-trivial: it means 30-90 seconds of overhead per autopilot work session, plus the risk of network errors on cold caches (post-deploy, CI, new machine).

The synthesis does not mention:
1. `npm install --prefer-offline` as the recommended flag (uses cached packages without network, fails fast if packages are missing rather than waiting for timeout)
2. A skip mechanism for sessions that do not need frontend build capability (e.g., a session scoped to backend-only changes or documentation-only changes)
3. Whether `npm ci` (clean install, lockfile-based, faster for CI-like environments) is preferred over `npm install`

Section 6 AC4 specifies: "autopilot batch latency is within 10% of pre-R1 baseline (worktree creation + symlink + tear-down should add < 2 seconds per batch)." This acceptance criterion directly contradicts the F5 change: if `npm install` adds even a warm-cache 15 seconds, the < 2-second overhead target is violated by an order of magnitude. The synthesis contains an internal contradiction introduced by F5.

**What fixes it:** The synthesis must resolve the AC4 vs npm-install contradiction by either:
(a) Narrowing the npm install to opt-in via a `--setup-frontend` flag or a project config key (`[project.worktree] auto_npm_install = false` in `lattice-project.toml.template`), with the R1 acceptance criteria explicitly testing both paths; OR
(b) Updating AC4 to acknowledge the additional overhead ("worktree creation + symlink + submodule init + npm install on first create; subsequent uses of same worktree add < 2 seconds"); OR
(c) Using `npm install --prefer-offline` with a per-session cache test: if `node_modules/` already exists in the worktree (e.g., reattached session), skip. But note worktrees do not share `node_modules/` across worktrees by default — each worktree's `node_modules/` is empty at creation.

The `--prefer-offline` flag is the minimum required specification. Without it, a session-start on a cold cache (or on a locked-down corporate network) hangs for minutes without output, which is indistinguishable from a hung process.

---

#### NI-4: Session-start timeout for npm install is unspecified

The synthesis specifies `npm install` runs as part of session creation. If npm hangs (network timeout, registry outage, corrupted lockfile), `lattice-session-start.sh` hangs silently. No timeout is specified. No non-fatal failure path is described for project setup. The D6 borrow table says "Borrowed because `node_modules/` is gitignored" — but does not address failure handling.

For comparison, `git submodule update --init --recursive` also has no explicit timeout in the synthesis, but submodule failures are listed as a session-creation failure class (captured in `.lattice/session-creation-errors.log`, observable 4). npm install failures are not similarly enumerated.

**What fixes it:** Specify: "project setup failures (npm install exit non-zero, cargo build failure) are non-fatal: log to `.lattice/session-creation-errors.log` with tool name and exit code, print a warning to stderr, and proceed. The session is created; the user must run the failing setup step manually before executing tool-requiring that output. Observable 4 already covers this — ensure npm install failure is captured." Also specify `npm install --prefer-offline --no-audit --no-fund` to suppress interactive output that would cause `lattice-session-start.sh` to hang waiting for user input.

---

### F6: R2 AC1 strengthened to two-part verification

**R1 verdict:** CONDITIONAL — the single-test verification for R2 AC1 was unverifiable if the executor short-circuits before frontmatter processing.

**What the synthesis now says:**

R2 AC1: "Verification has TWO parts (peer-review Finding 6 — single-test verification is insufficient): (a) **harness honors frontmatter:** trace `executor/src/engine.ts` `executeNode` dispatch path; confirm the agent's frontmatter `isolation: 'worktree'` field is correctly forwarded to the Claude Code Agent tool's harness, NOT short-circuited with a shared `cwd` parameter (probe Target 4); (b) **runtime evidence:** within an agent invocation, `git rev-parse --show-toplevel` returns a path different from the canonical repo root. Both checks must pass. **Gating rule:** R2 cannot merge until both verifications return positive on the same agent invocation in CI."

**Assessment:** F6 is substantively addressed. The two-part verification requirement is explicit, the gating rule is explicit, and the distinction between (a) contract verification and (b) runtime evidence is correctly framed. This closes the "declaration without runtime verification" gap from R1.

**Verdict: SOUND — F6 addressed**

---

## New Issues Summary

The following issues were NOT present in R1 and were introduced by the revisions themselves.

---

### NI-1 — Symlink-resolve false positive for .lattice/ writes from worktrees

**Severity: FLAWED (for implementation if not addressed; CONDITIONAL for synthesis as specification)**

**Evidence (from synthesis D1 and require-worktree.sh spec):**

D1 specifies: "`lattice-session-start.sh` creates symlink `.lattice -> ../<canonical-repo-path>/.lattice` inside each worktree."

The require-worktree.sh hook prong (b) specifies: "extract `file_path` from `$CLAUDE_TOOL_INPUT` JSON, resolve to absolute path, check whether the resolved path is INSIDE the canonical repo root."

The attestation write path (R2 AC3): "The worktree's `.lattice/` resolves via the D1 mechanism" — meaning writes to `<worktree>/.lattice/decisions.log` traverse the symlink and land in `<canonical>/.lattice/decisions.log`.

If "resolve to absolute path" uses any symlink-following resolution (`realpath`, `readlink -f`, Python's `os.path.realpath()`), then `<worktree>/.lattice/decisions.log` resolves to `<canonical>/.lattice/decisions.log`, which IS inside the canonical repo root. Prong (b) blocks it. Attestation writes, decisions.log entries, cycle-state updates — all break. The worktree session becomes unable to do the state-tracking work that is the primary reason for running in a worktree.

This is not a hypothetical: D1 is a specified design choice (symlinks), prong (b) is a specified hook behavior (resolve + compare), and `.lattice/` writes from worktree sessions are a required operation per multiple acceptance criteria. The three features cannot all be correct simultaneously as specified.

**What fixes it:**

The hook implementation spec must explicitly state: "path resolution for prong (b) is symlink-non-following (lexical comparison against the worktree root first; only fall through to canonical-root check if the path is not within the worktree root)." Additionally: `.lattice/**` paths must be explicitly added to the Tier 1 allowlist (D4), because writes to `.lattice/` from any context (worktree or canonical) are always legitimate — they target shared state by design.

A unit test must be added: "worktree session writes to `<worktree>/.lattice/decisions.log` are permitted (prong (b) does not block symlink-traversal writes to .lattice/)."

Without this specification fix, the synthesis is CONDITIONAL — the implementation is under-constrained in a way that will cause build engineers to choose between two interpretations, one of which breaks all `.lattice/` writes from worktrees.

**Verdict: CONDITIONAL** (specification must resolve the resolution semantics; this is not a minor annotation)

---

### NI-2 — Prong (b) closes Edit/Write bypass but leaves Bash absolute-path staging open

**Severity: CONDITIONAL**

**Evidence:**

The D5 hook spec fires on: `Edit|Write` AND `Bash(git add*|git commit*|git stash*)`. The hook description says prong (b) "extracts `file_path` from `$CLAUDE_TOOL_INPUT` JSON." For Bash calls, `$CLAUDE_TOOL_INPUT` is `{"command": "..."}` — no `file_path` key. Prong (b) silently returns empty and does not fire for Bash calls.

A worktree session can execute: `git add /canonical/repo/src/backend/services/analysis/new-feature.py` — the Bash pattern matcher sees `git add*` and fires the hook, prong (a) sees cwd = worktree (permit), prong (b) finds no file_path (skip). The staging contamination proceeds through the Bash channel even after the F3 fix.

This is distinct from the R1 Finding 3 bypass (absolute-path Edit). That bypass is now closed. The new bypass is absolute-path Bash staging, which was not raised in R1 and is a newly introduced residual vector because the F3 change gives a false sense of completeness ("two-pronged detection") for a defense that is actually three-pronged (cwd, file_path in Edit/Write, command-string in Bash).

**What fixes it:** One of:
(a) For Bash matcher invocations, additionally scan the command string for arguments matching the canonical root path pattern: `[[ "$COMMAND" =~ "$CANONICAL_ROOT"[^/\\.] ]] && block`. This is a regex on the command string, not a JSON extraction.
(b) Document explicitly in the hook spec: "Bash absolute-path staging bypass is an accepted residual risk; the common case (`git add foo.txt`, `git add .`) is caught by prong (a) [cwd check]; explicit absolute paths (`git add /canonical/path`) are not caught. Rationale: the likelihood of a session issuing `git add` with an explicit cross-worktree absolute path is extremely low; the detection-layer backstop (commit-intent) would catch the resulting unintended staged files."

Either is acceptable. The synthesis must make the explicit choice rather than leaving it unaddressed.

**Verdict: CONDITIONAL** (choose fix or accept-and-document; do not leave silently unaddressed)

---

### NI-3 — npm install overhead contradicts AC4 < 2-second latency target (internal contradiction)

**Severity: FLAWED**

**Evidence:**

Section 6 AC4: "autopilot batch latency is within 10% of pre-R1 baseline (worktree creation + symlink + tear-down should add < 2 seconds per batch)."

Section 1 R1 `lattice-session-start.sh` spec (F5 addition): "runs project-setup auto-detection per superpowers SKILL Step 3: if `package.json` exists, run `npm install`."

For pcc, `frontend/package.json` exists. `npm install` with warm npm cache takes 10-30 seconds on a modern machine. On a cold cache (CI, new machine, post-registry change), it takes 2-5 minutes. The < 2-second overhead target in AC4 is internally inconsistent with the unconditional npm install specified in the F5 change.

This is not a judgment call — it is a direct numerical inconsistency within the synthesis. A < 2-second overhead target and an operation that takes minimum 10 seconds cannot both be correct. One must be revised.

This inconsistency was not present in R1 (which had neither the npm install spec nor a precise AC4 overhead budget); it is introduced by the combination of the F5 fix and the existing AC4 text. The author did not update AC4 when adding the npm install step.

**What fixes it (choose one):**

(a) Revise AC4 to: "autopilot batch creation adds < 30 seconds per batch on a warm npm cache; < 5 minutes on cold cache. The overhead budget includes: worktree add (~1s), symlink creation (~0.5s), submodule init (~2-5s), npm install (variable). Overhead is a one-time per-worktree cost; sessions operating within an existing worktree pay no session-start overhead." Plus add: `npm install --prefer-offline` as the specified command, with explicit non-fatal failure handling.

(b) Revise the npm install spec to be opt-in: `[project.worktree] auto_npm_install = false` by default; opt-in per project or per invocation flag (`--setup-frontend`). AC4's < 2-second target then applies to the no-npm-install default path.

Option (a) is more honest about what the feature costs and matches the superpowers SKILL Step 3 intent. Option (b) is safer for projects that don't need frontend setup. The synthesis should specify which approach is taken and why.

**Verdict: FLAWED** — internal contradiction between AC4 and the F5 addition. Build engineers will implement one or the other but cannot satisfy both. This must be resolved in the synthesis before build proceeds.

---

### NI-4 — npm install failure handling unspecified (non-fatal path missing)

**Severity: CONDITIONAL**

**Evidence:**

The `lattice-session-start.sh` description says "run `npm install`" but does not specify exit behavior on failure. The existing session-creation error handling (observable 4) captures `worktree-add error, submodule init error, branch collision` as named failure classes. npm install failure is not in this list.

A locked-down corporate network, a registry outage, or a corrupted `package-lock.json` causes `npm install` to exit non-zero. If `lattice-session-start.sh` uses `set -e` (which it does, per the existing lock-acquisition idiom it borrows from `acquire-lock.sh`), an npm install failure will abort the entire session creation — no worktree is created, the user sees an npm error (not the actionable lattice error), and observable 4 does not capture the failure.

This is a new failure mode introduced by F5 that is not enumerated in the session-creation error handling or observable 4.

**What fixes it:** The project-setup block in `lattice-session-start.sh` must run outside of `set -e` scope (or use `npm install || true` with a warning) and log failures to `.lattice/session-creation-errors.log` with the npm exit code. A specific failure message: "npm install failed in <worktree>/frontend — session created but frontend build will fail. Run npm install manually before executing frontend tasks." This makes the session usable for non-frontend work even when npm install fails.

Observable 4's description should add: "npm install exit code captured in `.lattice/session-creation-errors.log`" to the list of enumerated failure classes.

**Verdict: CONDITIONAL** (missing failure handling for new failure class)

---

## Per-Finding Verdict Summary

| R1 Finding | R1 Verdict | Addressed? | R2 Verdict |
|---|---|---|---|
| F1: Rate claim | CONDITIONAL | Yes — both locations corrected with specific evidence | SOUND |
| F2: 5th stop-light observable | CONDITIONAL | Yes — observable 5 added with correct framing; BUT "all four pass" gate sentence not updated | CONDITIONAL |
| F3: Absolute-path bypass | CONDITIONAL | Partially — prong (b) closes Edit/Write; Bash channel still open; symlink false-positive introduced | See NI-1 (CONDITIONAL), NI-2 (CONDITIONAL) |
| F4: Counter-argument | CONDITIONAL | Yes — explicitly named, verdict stated, two sources cited | SOUND |
| F5: npm install | CONDITIONAL | Added to spec — but creates internal contradiction with AC4 + missing failure handling | See NI-3 (FLAWED), NI-4 (CONDITIONAL) |
| F6: R2 AC1 two-part verification | CONDITIONAL | Yes — both-part requirement explicit, gating rule explicit | SOUND |
| F7: Borrow table precision | SOUND (minor) | Not required to change — annotation-level; D6 already distinguishes directory vs naming | SOUND |

---

## New Issues from Revisions — Summary

| ID | Description | Severity | Source Finding |
|---|---|---|---|
| NI-1 | `.lattice/` symlink in worktrees causes prong (b) to false-positive on legitimate .lattice/ writes from worktree sessions | CONDITIONAL | F3 (absolute-path detection) |
| NI-2 | Prong (b) covers Edit/Write file_path but not Bash absolute-path staging; residual bypass via `git add /canonical/path` from worktree | CONDITIONAL | F3 (absolute-path detection) |
| NI-3 | npm install overhead contradicts AC4 < 2-second latency budget — internal contradiction in synthesis | FLAWED | F5 (npm install) |
| NI-4 | npm install failure handling unspecified; `set -e` in session-start will abort entire worktree creation on install failure | CONDITIONAL | F5 (npm install) |

---

## Overall Verdict: CONDITIONAL

**New FLAWED finding (NI-3) — arbiter classification required per protocol:**

NI-3 is a FLAWED finding on a previously-CONDITIONAL finding (F5 was CONDITIONAL in R1; the fix introduced a new internal contradiction). Per the gate rules:

- This is a **new FLAWED on a previously-CONDITIONAL** finding (F5 was the first appearance of the npm install issue; R1 did not address overhead).
- Arbiter classification: **FACTUAL_UNSUPPORTED** — the < 2-second overhead claim in AC4 is asserted without measurement; npm install timing is empirically verifiable. The contradiction is not a presentation issue (the numbers are in direct conflict) nor a factual dispute (both sides don't have verifiable contradicting evidence — only one side, the npm install timing, is verifiable; the < 2-second claim is unverified). Therefore this does not rise to ESCALATE_CONTRADICTION; it is a gap in the synthesis that must be resolved.

**Recommended action:** The synthesis author must resolve the AC4 vs npm install contradiction before build proceeds. NI-1 and NI-2 (both CONDITIONAL) must be addressed in the synthesis or explicitly documented as accepted residual risk with rationale. NI-4 (CONDITIONAL) must be addressed in the `lattice-session-start.sh` spec.

**Non-blocking, can proceed to Step 7 if:**
1. AC4 is revised to reflect realistic npm install overhead (or npm install is made opt-in with default skip)
2. NI-1 path resolution semantics are specified (symlink-non-following or `.lattice/**` added to Tier 1 allowlist)
3. NI-2 is either fixed (Bash command string scan) or documented as accepted residual risk
4. NI-4 failure handling is added to the session-start spec

---

## Persistence: New Gaps from R2

**Research gap (NI-2 — Bash absolute-path staging):** The question of whether `git add /explicit/absolute/path` from within a worktree is a realistic failure vector (versus `git add .` or `git add file.ts`) is an empirical question. Searching decisions.log for historical `git add` patterns would establish prior frequency. Gap: "WTI-RG-3: Is Bash absolute-path staging (`git add /canonical/path`) a realistic conflation vector in lattice session traffic, or is it theoretical? Search decisions.log and commit history for absolute-path git add usage patterns. Source: peer-review/worktree-isolation-synthesis R2."

**Data gap (NI-3 — npm install overhead measurement):** Actual `npm install --prefer-offline` timing for pcc's `frontend/` directory should be measured before AC4 overhead target is finalized. Without measurement, the < 2-second target is aspirational and will fail in the build-phase latency test. Gap: "Measure warm-cache `npm install --prefer-offline` timing in pcc frontend/ directory. Needed for AC4 overhead target in worktree-isolation-synthesis. Source: peer-review/worktree-isolation-synthesis R2."
