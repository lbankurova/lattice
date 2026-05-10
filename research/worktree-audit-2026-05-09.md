# Lattice worktree audit — 2026-05-09

> **Scope:** does the lattice framework (`C:/pg/lattice/`, plus its synced footprint at `C:/pg/pcc/.claude/` and runtime state at `C:/pg/pcc/.lattice/`) leverage `isolation: "worktree"` (Claude Code Agent tool) or `git worktree add` (manual) effectively?
>
> **Verdict:** **No.** The framework runs every agent, every parallel sub-cycle, every speculative spike, and every review-time fan-out in the **same working tree** as the user. Worktrees are mentioned exactly twice in lattice's source — once as an aspirational comparison to `obra/superpowers` (`docs/literature/obra-superpowers.md:50`) and once in a single human-authored multi-stream meta-refactor spec (`incoming/lattice-self-fix-2026-05-05.md:393,400`). Zero agent frontmatter declares `isolation: "worktree"`. Zero skill prompts invoke `EnterWorktree`/`ExitWorktree`. Zero scripts run `git worktree add`. The executor's parallel-group node runs all children with `Promise.allSettled` against a single shared `cwd` (`executor/src/engine.ts:587-591`).
>
> **The smoking gun:** the entire commit-intent protocol (CLAUDE.md rule 23, `.lattice/commit-intent-protocol.md`, pre-commit Step -0.5, `scripts/declare-commit-intent.sh`, `hooks/pre-commit` Step -1 commit-lock, executor's foreign-state guard at `executor/src/e2e.ts:645-668`, `stashWorkflowOutput` at `executor/src/autopilot.ts:207-240`) exists *because* concurrent sessions share git's index. Every line of that defensive infrastructure is a tax paid for not using worktrees. Decisions.log line 678 (history-annotation, 2026-04-28) names the failure mode explicitly: "*a session-scoped intent file or worktree isolation is the candidate fix*". The framework picked the former.

---

## 1. Executive summary

- **Worktrees are not a runtime primitive of lattice.** No agent, skill, workflow node, or script creates one. The Agent-tool `isolation: "worktree"` parameter is unused everywhere.
- **The framework's concurrency hygiene is built around lock primitives + dirty-tree quarantine instead.** Acquire-lock, release-lock, commit-intent declaration, foreign-path detection, scoped stash. Every one of these defends against a problem that wouldn't exist in isolated checkouts.
- **Four documented production conflations** (commits 1370c103, 521f1d16, a47ee865, abdb31c9) are the empirical cost. Each was an autopilot session's `git add` polluting a manual session's commit. The fifth gate (Step -0.5) catches it post-fact; a worktree would have prevented it categorically.
- **Parallel-group nodes share the working tree.** `executeParallelGroup` (`engine.ts:576-613`) dispatches all children with `Promise.allSettled` against the same `cwd`. blueprint-cycle's `architect-and-probe` parallel and review's three-agent fan-out (architect-reviewer + decision-auditor + post-impl-reviewer + optional peer-review) all run this way.
- **e2e branch-comparison stashes and round-trips the user's main checkout.** `executor/src/e2e.ts` checks out the base branch, runs validation, checks out feature, runs again — in the user's own working tree. The "foreign paths" guard at `e2e.ts:645-668` exists because the alternative (running e2e under a worktree pinned at HEAD) wasn't built.
- **Spikes — by definition discardable exploratory code — write directly to the main tree.** `commands/lattice/spike.md` has zero worktree language. Failed spikes leave residue the user has to manually `git restore`.
- **The literature audit at `docs/literature/_audit-2026-04-26.md:93` claims "Lattice uses worktrees too"** — this is wrong. The audit author conflated tool *availability* (the Claude Code harness exposes `EnterWorktree`) with framework *usage*. Worth correcting in literature notes.
- **There is one place the framework correctly recognized worktrees as the right tool:** the lattice-self-fix-2026-05-05 spec, which proposes 5 parallel work streams operating on lock primitives and explicitly mandates worktrees ("*critical for this work specifically because we're modifying the very lock primitives*"). The same reasoning applies to *any* concurrent autopilot batch on the same repo, but the framework didn't generalize.
- **The merit-correct fix is project-wide worktree enforcement, not autopilot-only.** Coverage analysis: an autopilot-scoped worktree protects the autopilot-vs-manual collision, but every other concurrent-session pair (manual-vs-manual, manual-vs-scheduled-agent, manual-vs-MCP-background-task, two `/lattice:cycle` invocations on the same repo) remains exposed because git's index is global per repo. Only **enforcement at session entry** — a PreToolUse hook that refuses `Edit`/`Write`/`Bash(git add|git commit|git stash)` when `cwd == canonical repo root` — closes the conflation class for every entry path. Scoped fixes (per-agent, per-skill, autopilot-only) are detection-layers wearing prevention costumes: they leave the class alive in any path that didn't opt in. R1 (below) is a transitional beachhead toward project-wide enforcement, not the destination.

---

## 2. Inventory of worktree references

| Location | What it does | Effective use? |
|----------|--------------|----------------|
| `C:/pg/lattice/incoming/lattice-self-fix-2026-05-05.md:393,400` | Spec recommends `git worktree add ../lattice-stream-{a..e}` for multi-stream framework refactor | Yes — but it's a **one-off human-authored plan**, not a framework primitive. Not generalized. |
| `C:/pg/lattice/docs/literature/obra-superpowers.md:50,60` | Notes superpowers has `using-git-worktrees/SKILL.md`; claims "Lattice has `EnterWorktree`/`ExitWorktree` tools" | **Inaccurate — confuses tool availability with framework usage.** Lattice doesn't *use* the tools anywhere. |
| `C:/pg/lattice/docs/literature/_audit-2026-04-26.md:93,113,119,127` | Audit of obra-superpowers literature note; claims "Lattice uses worktrees too; would be worth crediting" | **False premise.** No agent/skill/script invokes worktree. Audit author inferred from tool list. |
| `C:/pg/pcc/.lattice/decisions.log:678` (CONFLATED-COMMIT, 2026-04-28) | History annotation naming "*a session-scoped intent file or worktree isolation is the candidate fix*" for autopilot/manual conflation | Honest acknowledgment that worktrees would have prevented the bug; framework chose the former path. |
| `C:/pg/pcc/docs/_internal/research/agent-driven-frontend-ux.md:58` | Cites `claude-code-quality-hook` (external project) using `git worktree` for parallel processing | Unrelated — describes external tool, not lattice. |
| **All other lattice files** | n/a | **Zero references.** Confirmed via Grep across `C:/pg/lattice/` (commands, agents, workflows, executor, hooks, scripts, scaffold) and `C:/pg/pcc/.claude/`. |

### Negative findings (where worktrees are NOT used but the surface clearly invites them)

| Location | What it does | Risk surface |
|----------|--------------|--------------|
| `C:/pg/lattice/agents/architect-reviewer.md` (lines 1-5 frontmatter) | Speculative architecture review on diff/files | Frontmatter has `name`, `description`, `model: sonnet` only. No `isolation`, no tool restrictions. Reviewer can write to main tree if it decides to "demonstrate a fix". |
| `C:/pg/lattice/agents/peer-review.md` | Independent scientific peer review; explicitly read-only by intent | Same frontmatter pattern. Read-only is enforced by *prompt discipline*, not *tool capability*. |
| `C:/pg/lattice/agents/decision-auditor.md` | Merit audit of architectural decisions | Same. Read-only by prompt, not by sandbox. |
| `C:/pg/lattice/agents/post-impl-reviewer.md` | Spec-vs-code evidence trace | Same. |
| `C:/pg/lattice/commands/lattice/spike.md:1-60` | Exploratory build, may be discarded | No worktree. Failed spikes leave dirty tree. |
| `C:/pg/lattice/commands/lattice/autopilot.md:108-122` | Multi-item batch; explicitly acknowledges concurrent-staging hazard | Defends with `acquire-lock.sh` + `LATTICE_LOCK_HOLDER` + `release-lock.sh`. Worktree would replace all of this. |
| `C:/pg/lattice/workflows/blueprint-cycle.yaml:92-96` | `architect-and-probe` parallel group | Two children share cwd. Today both are read-mostly, but no enforcement. |
| `C:/pg/lattice/workflows/build-cycle.yaml:229-251` + `commands/lattice/review.md:69-126` | `review` skill launches 3-4 agents in parallel (architect-reviewer, decision-auditor, post-impl-reviewer, optional peer-review) | All four share cwd. Each may call `bash scripts/append-attestation.sh` (writes `.lattice/attestations/...`); concurrent appends mostly OK due to O_APPEND but not guaranteed across all platforms. |
| `C:/pg/lattice/executor/src/engine.ts:576-613` (`executeParallelGroup`) | Promise.allSettled on children with shared `cwd` | Engine has no `isolatedCwd` concept. Adding one would require per-child worktree + cleanup. |
| `C:/pg/lattice/executor/src/e2e.ts:670-720` | Branch-mode e2e: stash → checkout base → run → checkout feature → run | Mutates user's checkout. Foreign-state guard at `:645-668` is the band-aid. |
| `C:/pg/lattice/executor/src/autopilot.ts:207-240` (`stashWorkflowOutput`) | Scoped stash to avoid sweeping foreign WIP into autopilot's stash label | Whole function exists because workflow runs share the user's tree. |
| `C:/pg/lattice/hooks/pre-commit` Step -0.5 + `C:/pg/pcc/.lattice/commit-intent-protocol.md` | Compute set-diff between staged and intent; block on unexpected files | The single largest piece of defensive infrastructure pointing at the same root cause. |

---

## 3. Gaps identified

### Gap 1: No agent declares `isolation: "worktree"`

**What:** All four lattice review/audit agents (`agents/architect-reviewer.md`, `agents/peer-review.md`, `agents/decision-auditor.md`, `agents/post-impl-reviewer.md`) ship with frontmatter that names `model: sonnet` and nothing else. No `isolation` key. No tool allowlist.

**Why it matters:** Read-only-by-prompt is a discipline, not a constraint. An agent prompted "you are reviewing X" can still call `Edit` if it decides "let me show what the fix looks like" — and that edit lands in the user's working tree, mid-review. Even when agents behave correctly, attestation-file writes (`scripts/append-attestation.sh`) and gate-output side-channels (`.lattice/last-review-output.md`, `pending-attestations.json`) all write to the same tree, where they can collide with concurrent autopilot work.

**Evidence:**
- `C:/pg/lattice/agents/peer-review.md:1-5` — frontmatter has `name`, `description`, `model` only.
- `C:/pg/lattice/agents/architect-reviewer.md:1-5` — same.
- `C:/pg/lattice/commands/lattice/review.md:115-124` — review skill explicitly invokes `bash scripts/append-attestation.sh` from within the parallel-agent context, writing to `.lattice/`.
- Decisions.log line 678 (precedent for the same pattern) — autopilot's git operation overwrote a F4 decisions.log row authored by another session at 20:22:35Z.

**Recommendation:** Add `isolation: "worktree"` to the four review-agent frontmatter files. Specifically:
- `agents/architect-reviewer.md` — review-mode is by definition non-mutating; isolating it makes the contract mechanical.
- `agents/peer-review.md` — independence invariant (line 18 "do NOT read project-side skill files") generalizes naturally to "do NOT mutate the working tree". A worktree pinned at the spec/diff commit gives the agent exactly the read scope it needs.
- `agents/decision-auditor.md` — same.
- `agents/post-impl-reviewer.md` — same.

If the Claude Code Agent harness's `isolation: "worktree"` doesn't yet support attestation-file passthrough, fall back to a tool allowlist that restricts `Write`/`Edit` to a pre-approved attestation path. This is a strictly weaker guarantee but still better than free Write access.

### Gap 2: Autopilot batches share the user's checkout

**What:** `commands/lattice/autopilot.md` Step 3 (lines 108-122) acknowledges "**Acquire the commit lock BEFORE staging (CRITICAL — prevents conflation with concurrent manual commits or other autopilot batches)**" and references "Three confirmed conflations in pcc this session (commits 1370c103, 521f1d16, a47ee865) all stemmed from this gap." A fourth conflation (abdb31c9) is documented in decisions.log line 678. The lock + commit-intent + post-commit clear is the chosen mitigation.

**Why it matters:** The conflation pattern is: session A stages files, session B stages other files, session A commits → both file sets land under A's commit message. Lock-based mitigation is a *time-window* fix (B can't commit while A is committing) but **does not prevent the staging itself from being shared** (git's index is global per repo). The commit-intent protocol catches this *after* it happens, by computing set-diff. Worktree isolation would mean B's `git add` lives in B's worktree's index, which is independent of A's. The class of bug becomes structurally impossible.

**Evidence:**
- `C:/pg/lattice/commands/lattice/autopilot.md:108-120` — explicit ack of the failure mode + mitigation.
- `C:/pg/pcc/.lattice/decisions.log` line 678 — fourth occurrence: "*the actual race is concurrent STAGING (git's index is global per repo); a session-scoped intent file or worktree isolation is the candidate fix*".
- `C:/pg/pcc/.lattice/commit-intent-protocol.md:9-19` — names the failure mode in 5 numbered steps. Section "Failure modes the gate does NOT catch" at line 77 explicitly admits the gate is incomplete: "Pre-staged work from a previous session" + "Sub-file conflation" both leak through.
- `C:/pg/lattice/executor/src/autopilot.ts:183-215` — `stashWorkflowOutput` exists *because* foreign WIP can pollute autopilot's tree at any moment.

**Recommendation:** When autopilot runs, do `git worktree add C:/pg/pcc-autopilot-<batch-id> HEAD` and run the batch under that worktree. Each batch gets its own index. The four conflations would have been impossible. The acquire-lock / release-lock / commit-intent infrastructure stays (still useful for cross-session SCIENCE-FLAG handoff and decisions.log appends) but its *primary purpose* (staging hygiene) goes away.

### Gap 3: Spikes have no quarantine

**What:** `commands/lattice/spike.md` describes exploratory build, explicitly suspends doc lifecycle and post-implementation review, and notes "If it doesn't, the code is discarded with no doc overhead" (line 11). But the entire skill has zero language about *where* the build happens. Spikes write to the main checkout.

**Why it matters:** A failed spike leaves residue. The user has to `git restore` files they never wrote. Worse, a successful spike that gets handed to `/spec-from-code` for spec generation may carry forward *experimental* changes the author meant to throw away. The spike-vs-spec boundary is supposed to be: spike code stays as exploratory context (per `commands/lattice/cycle.md:108`), but the boundary is enforced by author discipline, not by sandbox.

**Evidence:**
- `C:/pg/lattice/commands/lattice/spike.md:11` — "code is discarded with no doc overhead" — but discarded *how*?
- `C:/pg/lattice/commands/lattice/cycle.md:106-108` — spike-to-research escalation: "The spike code stays as exploratory context." No mechanical separation.
- No equivalent of superpowers' `using-git-worktrees/SKILL.md` referenced from spike.md.

**Recommendation:** Make spike create a worktree at `../<repo>-spike-<topic>` on a `spike/<topic>` branch. Successful spike → `git checkout` the worktree's branch into the main repo, run `/spec-from-code` against it. Failed spike → `git worktree remove` the spike worktree without merging. This is the exact pattern superpowers' `using-git-worktrees` skill uses; lattice has the audit acknowledgment but not the implementation.

### Gap 4: Parallel review fan-out runs against shared cwd

**What:** `commands/lattice/review.md:60-126` describes launching 3-4 review agents in parallel (architect-reviewer + decision-auditor + post-impl-reviewer + optional peer-review). All four agents see the same `git diff` (correct — same diff under review) but they all run against the same working tree. `executor/src/engine.ts:587-591` confirms: `executeParallelGroup` uses `Promise.allSettled` against a single shared `cwd`.

**Why it matters:** Review agents are *advertised as independent* ("each receives zero implementation context, preventing confirmation bias", `review.md:60`). Independence is currently enforced via prompt-time context isolation (each agent gets a fresh context window with only its inputs). But they share filesystem state — and each may write attestation files (`bash scripts/append-attestation.sh peer-review ...`, `review.md:117-124`), each may read `.lattice/last-review-output.md` (which review writes at the end), and each can in principle decide to fix the bug it finds. The architectural independence is partial.

**Evidence:**
- `C:/pg/lattice/commands/lattice/review.md:107-124` — peer-review agent runs in parallel, writes attestation file synchronously.
- `C:/pg/lattice/executor/src/engine.ts:587-591` — `node.nodes.map(async (childId) => { ... return executeNode(childId, childNode, ctx, adapter, cwd); })` — same `cwd` to every child.
- `C:/pg/lattice/commands/lattice/review.md:24-36` — `last-review-output.md` is single-use per gate write; concurrent agents can race the file.

**Recommendation:** Lower-priority than Gaps 1-3 because review agents *should* be read-only and the attestation files are append-only (O_APPEND atomicity). But adding `isolation: "worktree"` per Gap 1 would close this surface category as a side-effect. Don't introduce it as a separate fix.

### Gap 5: e2e branch-comparison mutates the user's checkout

**What:** `executor/src/e2e.ts` for `mode: branch` and `mode: uncommitted` does the equivalent of `git stash` → `git checkout <base>` → run validation → `git checkout <feature>` → run validation → `git stash pop`. All in the user's main working tree. The "foreign paths" guard at `e2e.ts:645-668` refuses to run when there's WIP outside the diff scope, citing "*parallel session, manual edits, or unrelated WIP*".

**Why it matters:** The guard catches the most common failure mode (foreign WIP being swept into the stash) but it's a refusal-style guard — it stops the user from running e2e at all when they have any WIP, even legitimate WIP they want to keep. The whole branch-comparison flow is a perfect worktree use case: `git worktree add ../<repo>-e2e-base <base-commit>` + `git worktree add ../<repo>-e2e-feature <feature-commit>`, run validation in each, compare. No stashing, no mutating the user's working tree, no foreign-state guard needed.

**Evidence:**
- `C:/pg/lattice/executor/src/e2e.ts:645-668` — the foreign-state guard, with explicit acknowledgment of parallel-session risk.
- `C:/pg/lattice/executor/src/e2e.ts:670+` — `case 'branch':` block runs the full stash+checkout dance.

**Recommendation:** Replace the branch-mode flow with worktree allocation. Specifically: `git worktree add --detach <tmp-base> <baseSha>` and `git worktree add --detach <tmp-feature> <featureSha>`, run suites in each, `git worktree remove` both. The foreign-state guard becomes vestigial. The user can keep their WIP without rejection.

### Gap 6: Literature note misclaims worktree adoption

**What:** `docs/literature/obra-superpowers.md:50` and `docs/literature/_audit-2026-04-26.md:93,113` claim Lattice uses worktrees ("Same pattern, possibly independent design", "Lattice uses worktrees too; would be worth crediting"). Verified false: zero invocations across the codebase.

**Why it matters:** Knowledge-base hygiene. If a future agent reads obra-superpowers.md to decide "do we need worktree adoption", it sees "we already do" and concludes no. Self-perpetuating false belief.

**Evidence:**
- `C:/pg/lattice/docs/literature/obra-superpowers.md:50` — "Git worktrees for parallel branches. Superpowers has `using-git-worktrees/SKILL.md`; lattice has `EnterWorktree`/`ExitWorktree` tools available in agent invocations. Same pattern, possibly independent design."
- `C:/pg/lattice/docs/literature/_audit-2026-04-26.md:93` — "Git worktrees for branch isolation is a load-bearing piece the note doesn't mention. (Lattice uses worktrees too; would be worth crediting.)"

**Recommendation:** Edit `obra-superpowers.md:50` to read: "Lattice does NOT use worktrees as a runtime primitive — neither in agent isolation, nor in parallel-group execution, nor in spike quarantine, nor in e2e branch comparison. The `EnterWorktree`/`ExitWorktree` tools are available in the Claude Code harness but unused. This is a borrow opportunity, not a convergent design." Mirror the correction in `_audit-2026-04-26.md:93,113`.

---

## 4. Smoking guns — protocols that exist BECAUSE worktrees aren't used

| Protocol / mechanism | Location | What it defends against | Why a worktree replaces it |
|---|---|---|---|
| **Commit-intent protocol** (CLAUDE.md rule 23) | `.lattice/commit-intent-protocol.md`; `scripts/declare-commit-intent.sh`; `.githooks/pre-commit` Step -0.5; `.githooks/post-commit` clear | Concurrent staging into the shared global index (4 documented occurrences: 1370c103, 521f1d16, a47ee865, abdb31c9) | Each session's worktree has its own index; B's `git add` does not appear in A's `git status`. Categorical fix vs. detection-after-the-fact. |
| **Commit-lock** (`.githooks/pre-commit` Step -1) | `scripts/acquire-lock.sh`, `scripts/release-lock.sh`, `LATTICE_LOCK_HOLDER` env var | Two sessions calling `git commit` at the same time | If they're in different worktrees with different indexes, they can both commit independently (to the same or different branches). Lock becomes superfluous for staging hygiene; only retained for cross-session decisions.log append discipline. |
| **Foreign-state guard in e2e** | `executor/src/e2e.ts:645-668` | Stash sweeping a parallel session's WIP into the stash label | Worktree at the requested commit; user's working tree is untouched; no stash needed. |
| **Scoped `stashWorkflowOutput`** | `executor/src/autopilot.ts:207-240` | Pre-fix `stashIfDirty` ran unscoped `git stash push -u`, capturing parallel-session work; "the work then became unrecoverable" (line 195) | Autopilot in its own worktree means the only dirty paths are autopilot's own; scoped stash becomes trivially equivalent to unscoped stash. |
| **State-file revision check** | `executor/src/state-io.ts:67-145`; `executor/src/engine.ts:160` | Two parallel writers to `.lattice/cycle-state/<topic>.yaml` | Cycle-state files would live per-worktree if each cycle ran in its own worktree. Still useful for cross-cycle dependency reads, but no concurrent-write race. |
| **Topic lock** | `scripts/acquire-topic-lock.sh`; cycle.md Step 0b | Two `/lattice:cycle` invocations for the same topic | Worktree-per-cycle is naturally one-topic-per-tree; topic-lock semantics overlap heavily with worktree existence. |
| **Hooks-deployment alignment** | decisions.log line 680 (2026-04-28T23:23:37Z) | "*the entire lattice pre-commit framework had been INACTIVE on this repo*" because hooks lived at `hooks/` while git read `.githooks/` | Orthogonal — hooks-path hygiene doesn't change with worktrees. But notable: if every framework gate ran in an isolated worktree, the *user's* main checkout's hooks state wouldn't matter for autopilot work. |

The pattern across the table: lattice has built **detection-and-mitigation infrastructure** for problems that **structural isolation would prevent categorically**. This is the choice the framework made; it's not necessarily wrong (locks + intent + scoped-stash work today, with documented residual gaps), but it is a *quantifiable cost*: ~6 distinct protocols + ~1100 LOC of defensive executor code + 4 production conflations + the `feedback_concurrent_autopilot_staging.md` memory rule.

---

## 5. Recommendations (prioritized)

### Principal recommendation — merit-correct destination

**R0. Project-wide worktree enforcement at session entry.**

The conflation class ("two sessions sharing one git index") is closed only by enforcement at the session boundary. R1–R3 below are useful — and R1 is the practical first beachhead — but they are scoped to specific entry paths. R0 is the destination.

- *Mechanism:*
  - A **PreToolUse hook** (`C:/pg/lattice/hooks/preToolUse/require-worktree.sh`, registered via `settings.json`) that intercepts `Edit`, `Write`, and `Bash` matchers for `git add`/`git commit`/`git stash` when the session's `cwd` resolves to the canonical repo root (e.g., `C:/pg/pcc`). The hook refuses with an actionable message: *"This repo requires worktree-isolated sessions. Run `bash C:/pg/lattice/scripts/lattice-session-start.sh <topic>` and re-launch Claude Code from the printed worktree path."*
  - A **session-spawn helper** (`C:/pg/lattice/scripts/lattice-session-start.sh <topic>`) that runs `git worktree add C:/pg/<repo>-session-<topic>-<ts> HEAD`, symlinks `.lattice/` from the canonical project root into the new worktree (so cycle-state, decisions.log, attestations remain shared canonical state), prints the `cd` command, and exits. Optional second mode: `--launch` relaunches `claude` with `cwd` set.
  - **Exemptions:** read-only sessions (no `Edit`/`Write`/staging) are not blocked. Genuinely-canonical edits (root trust docs at `C:/pg/pcc/CLAUDE.md`, `README.md`) opt out via `LATTICE_ALLOW_MAIN_TREE=1` for that single command. The exemption envelope is documented and audited.
- *Coverage:* every entry path. Manual terminals, autopilot batches, scheduled remote agents, IDE-launched sessions, MCP-spawned background tasks, `/loop` autonomous runs. Whatever launches Claude Code, the hook fires on the first write attempt.
- *Why merit-correct:* the conflation pattern is structural — git's index is per-repo, not per-session. Only enforcement at the session boundary makes the structural property safe. Per-agent/per-skill/per-autopilot fixes are partial coverage by construction; they leave the class alive in any path that didn't opt in.
- *What stays even after R0:* (a) **decisions.log append discipline** — single canonical file, sessions still need lock+append for atomic appends; (b) **topic-lock** — two cycles working the same topic must serialize regardless of worktree (semantic collision, not index collision); (c) **state-io revision check** — still useful for cross-cycle dependency reads on shared cycle-state; (d) **commit-intent protocol** — collapses from primary defense to last-resort backstop for intra-worktree conflation (one session staging two unrelated TODOs in one commit).
- *Cost (honest):* medium-high. Complications:
  1. `.lattice/` cross-worktree visibility — solved via symlink or `LATTICE_PROJECT_ROOT` env var. Symlink is simpler; env var is more explicit. Pick one and document.
  2. **Merge-back semantics** — session ends with commits on its own branch; explicit `git push` or fast-forward merge step required. Worth standardizing in the helper.
  3. **Crashed-session cleanup** — orphan worktrees. Add a periodic `git worktree prune` to the post-commit hook or a daily cron.
  4. **Developer muscle-memory shift** — no longer "open terminal, edit files in repo root"; now "spawn session, edit in worktree, merge back". Document loudly in CLAUDE.md and onboarding.

### High leverage — phased rollout toward R0

**R1. Autopilot worktree (first beachhead toward R0).**
- *File:* `C:/pg/lattice/commands/lattice/autopilot.md` Step 3 (lines 104-122).
- *Change:* Before Step 3.1 ("Announce"), add a new sub-step: `git worktree add C:/pg/<repo>-autopilot-$BATCH_ID HEAD` and `cd` into it for the duration of the batch. After Step 3.5/3.6 (release lock + cleanup), `git worktree remove` and merge the batch's commits back via fast-forward (or leave them as branch references for review, depending on team preference).
- *Why "transitional":* this closes the autopilot-vs-manual collision (the most empirically painful — 4 documented incidents) but leaves the manual-vs-manual, manual-vs-scheduled, and manual-vs-MCP collisions alive. Useful as the first deployment because it surfaces all the `.lattice/` symlink + merge-back ergonomics issues in a controlled context (autopilot batches are scoped, short-lived, and have well-defined exit points). Once R1 has been running stably for ~2 weeks, generalize to R0 with the lessons learned.
- *Cost:* moderate — autopilot's logging, decisions.log appends, and `.lattice/cycle-state` writes need to reach back to the main `.lattice/`. Either symlink them (`ln -s C:/pg/pcc/.lattice .lattice`) or use absolute paths from `LATTICE_PROJECT_ROOT` env var. The state-io revision check stays useful.

**R2. Add `isolation: "worktree"` to all four review/audit agents.**
- *Files:* `C:/pg/lattice/agents/architect-reviewer.md`, `agents/peer-review.md`, `agents/decision-auditor.md`, `agents/post-impl-reviewer.md` (and synced copies under `C:/pg/pcc/.claude/agents/`).
- *Change:* Add `isolation: "worktree"` to frontmatter. If the harness doesn't support attestation-file passthrough out of the box, declare a tool allowlist that excludes `Write`/`Edit` (force read-only) — review agents have no business mutating the tree.
- *Why high-leverage:* Independence-by-prompt → independence-by-sandbox. The architect-reviewer agent at `agents/architect-reviewer.md:7` opens with "*you are an independent architecture reviewer. You have NOT seen the implementation rationale*" — adding worktree isolation makes that independence mechanical. Same for peer-review's "independence invariant" at line 18.
- *Cost:* low — agent frontmatter change + attestation-file path remediation if the harness sandbox blocks the existing `bash scripts/append-attestation.sh` path. The simpler version (read-only allowlist, no worktree) closes 80% of the risk for ~5 minutes of work.

**R3. Worktree-based e2e branch comparison.**
- *File:* `C:/pg/lattice/executor/src/e2e.ts` (the `case 'branch':` block at line 670+).
- *Change:* Replace stash + checkout + restore with `git worktree add --detach <tmp-base> <baseSha>` + `git worktree add --detach <tmp-feature> <featureSha>`. Run suites in each tree's `cwd`. Remove both worktrees in `finally`.
- *Why high-leverage:* Removes the "*foreign WIP refuses to run*" friction. The foreign-state guard at lines 645-668 becomes vestigial (or stays as a low-priority warning, "you have WIP outside the diff scope; consider committing it").
- *Cost:* low-medium — refactor of one TypeScript function, plus updating the autopilot-stash test (`autopilot-stash.test.ts`) to reflect the new contract.

### Medium leverage

**R4. Spike worktree quarantine.**
- *File:* `C:/pg/lattice/commands/lattice/spike.md` Step 3 (line 51).
- *Change:* Before "Write the code" (Step 3), add: "Create a worktree at `../<repo>-spike-<topic>` on a fresh `spike/<topic>` branch. All edits land there. On verdict KEEP → `git checkout` the spike branch into the main repo, run `/spec-from-code` against it. On verdict DISCARD → `git worktree remove --force` and delete the branch."
- *Why medium:* Most spikes today complete cleanly. The failure mode is rare-but-painful (manual `git restore` of files the user never wrote). Worktree adoption is the right shape but not catastrophic to skip.
- *Cost:* low — skill-prompt change + one example commit showing the flow.

**R5. Per-child worktree isolation in `executeParallelGroup` (executor primitive).**
- *File:* `C:/pg/lattice/executor/src/engine.ts:576-613` (`executeParallelGroup`).
- *Change:* Add an opt-in flag `parallel.isolate: per-child` to the YAML node schema. When set, the engine creates `git worktree add --detach <tmp> HEAD` per child and passes that as `cwd` to `executeNode`. After `Promise.allSettled`, the engine merges any commits the child made (or fails closed if a child wrote uncommitted state).
- *Why medium:* Today's parallel groups are blueprint-cycle's `architect-and-probe` (read-only) and review's three-agent fan-out (also read-only by intent). The collision risk is low because the actual workloads don't write to the tree. But making isolation a primitive lets future parallel-group nodes (e.g., parallel research-cycle on multiple sub-topics, or e2e fan-out across multiple study fixtures) inherit safety for free.
- *Cost:* medium — engine refactor + worktree teardown semantics + cleanup-on-crash discipline (a parallel-group child that throws shouldn't leak a worktree).

### Low leverage

**R6. Correct the literature-note misstatements.**
- *Files:* `C:/pg/lattice/docs/literature/obra-superpowers.md:50,60` and `C:/pg/lattice/docs/literature/_audit-2026-04-26.md:93,113,119,127`.
- *Change:* Edit "Same pattern, possibly independent design" → "Lattice has the harness-level `EnterWorktree`/`ExitWorktree` tools available but does NOT use them as a runtime primitive (verified 2026-05-09: zero invocations across commands, agents, workflows, executor). This is a borrow opportunity, not convergent design."
- *Why low:* Hygiene only. No production effect. But knowledge-base self-deception compounds over time, especially when audits cite earlier audits.
- *Cost:* trivial — two file edits.

**R7. Document the commit-intent + lock infrastructure as worktree-replacement.**
- *File:* `C:/pg/pcc/.lattice/commit-intent-protocol.md` (cross-reference section, line 83).
- *Change:* Add a "Why not worktrees?" section noting the trade-off explicitly. If the framework decides to adopt R1, this section becomes the migration log. If not, it's the honest framing of the choice.
- *Why low:* Doesn't change behavior. But makes the trade-off legible to future readers (and future agents).
- *Cost:* trivial.

---

## 6. Verdict

Lattice's worktree story is one **honest acknowledgment** (decisions.log line 678 — "worktree isolation is the candidate fix"), one **legitimate human-driven use** (lattice-self-fix-2026-05-05.md, for an explicit one-off refactor of lock primitives), one **inaccurate self-flattering literature claim** (obra-superpowers.md:50), and **zero** runtime adoption.

The framework chose lock-and-detect over isolate-and-prevent. That's a defensible choice for a single-user single-machine setup with low concurrent autopilot pressure. The cost is paid in 4 production conflations, ~1100 LOC of defensive executor code, the entire commit-intent protocol, the topic-lock infrastructure, and a memory rule (`feedback_concurrent_autopilot_staging.md`) telling humans to "pause autopilot before manual staging" — i.e., the framework asking the user to hand-serialize what worktrees would auto-parallelize.

**The principled framing is detection layer vs. prevention layer.** Today lattice has only the detection layer. The prevention layer is project-wide worktree isolation enforced at session entry — **R0**. R1 (autopilot-only) is the right first deployment because it scopes the rollout-pain to a controlled context, but it does not substitute for R0; an autopilot-only worktree leaves manual-vs-manual, manual-vs-scheduled-agent, and manual-vs-MCP-background concurrency exposed. R2 (review/audit agent isolation) and R3 (e2e branch worktrees) are independently worthwhile and can ship in parallel with the R1 → R0 progression. R4–R7 are hygiene.

The merit-driven sequence: **R0 is the destination; R1 is the on-ramp; R2/R3 are parallel quick wins.** Reframing the recommendation by effort (R1 first because it's lowest-disruption) is exactly the failure mode CLAUDE.md rule 12 warns against — choose the merit-correct path, then sequence the rollout.
