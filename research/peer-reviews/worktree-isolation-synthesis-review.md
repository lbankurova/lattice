# Peer Review: worktree-isolation-synthesis.md

> **Document reviewed:** `C:/pg/lattice/incoming/worktree-isolation-synthesis.md`
> **Prior gates:** Architect (PASS after SIMPLIFY round); Probe (PROPAGATES, 2 conditional BREAKS resolved, 4 build-phase carry-overs)
> **Tier:** Implementation plan / synthesis
> **Date:** 2026-05-09
> **Reviewer:** independent peer reviewer (blind to project implementation context)
> **Science-flag scope:** N/A — infrastructure synthesis, no analytical algorithms

---

## Section 0 — Load-Bearing Claims

```yaml
load_bearing_claims:
  - id: LBC-1
    claim: "Four documented CONFLATED-COMMIT incidents justify the worktree isolation build"
    scope:
      project: ["pcc"]
      time_range: "pre-2026-04-28"
      concurrency_class: ["autopilot-vs-manual"]
    upstream_dependency: "Spec Section 7 Q2 uses these as the frequency baseline; Section 6 AC1 uses them as the regression pre-baseline; Spec Summary uses them as the primary rationale"

  - id: LBC-2
    claim: "The commit-intent protocol is insufficient — it is detection-only and the conflation class requires structural prevention (worktree isolation)"
    scope:
      protocols: ["commit-intent", "commit-lock", "scoped-stash"]
    upstream_dependency: "This claim justifies building a new prevention layer rather than strengthening the existing detection layer. If commit-intent is sufficient, R0 is over-engineering."

  - id: LBC-3
    claim: "The R0 PreToolUse hook's cwd-based detection closes the conflation class for all session entry paths"
    scope:
      mechanism: ["PreToolUse hook", "cwd == canonical root check"]
    upstream_dependency: "R0's entire architecture rests on this. If the detection is incomplete, the class survives through bypass vectors."

  - id: LBC-4
    claim: "The four R0 stop-light gate observables (orphan worktrees, non-FF aborts, symlink failures, session-creation failures) adequately detect whether R1 has validated the prevention mechanism before R0 deploys"
    scope:
      gate: ["R1 to R0 stop-light"]
    upstream_dependency: "If the observables are not measuring conflation prevention, R0 could deploy on a false green signal"

  - id: LBC-5
    claim: "Superpowers' SKILL.md detection logic, .worktrees/ directory convention, and .gitignore safety check are borrowed verbatim and are sufficient for lattice's isolation contract"
    scope:
      source: ["obra/superpowers/skills/using-git-worktrees/SKILL.md"]
      items: ["GIT_DIR != GIT_COMMON detection", "submodule guard", ".worktrees/ convention", "git check-ignore safety check"]
    upstream_dependency: "D6 reuse borrow; if borrowed items are mischaracterized, the build will produce different behavior than the synthesis intends"
```

```yaml
falsification:
  - id: LBC-1
    verdict: bounded-negative
    search_bounds:
      databases: ["C:/pg/pcc/.lattice/decisions.log", "git log --all pcc repo", "commit message search"]
      time_range: "2026-04-01 to 2026-05-09"
      query_terms: ["CONFLATED", "conflation", "concurrent autopilot", "interleave"]
      excluded: ["incidents outside pcc repo", "non-git staging issues"]
    no_counterexample_found: true
    bound_audit:
      claim_scope_field: "4 incidents in pcc"
      bound_scope_field: "full decisions.log + git history for pcc, 2026-04-01 to 2026-05-09"
      coverage: insufficient
      gap: "The search found the 4 named incidents PLUS two additional undercounted incidents. First, 2026-04-27T04:10:35Z (decisions.log): commit 45f29b53 was 'rendered empty by concurrent autopilot interleave between git-add and git-commit' — same root cause, different symptom (empty commit not files-in-wrong-commit). Second, 2026-05-03 decisions.log records two post-commit-intent submodule-conflated events (c9f82aa, 32944cf0). The synthesis cites exactly '4 incidents' in Section 7 Q2 and Section 6 AC1, but the record contains at least 6-7 same-root-cause events. The undercount does not weaken the synthesis's case — it makes it stronger — but the '4 in 30 days' rate claim in Section 7 Q2 is inaccurate on two dimensions: (a) all 4 named incidents occurred in a 2-day window (2026-04-26 to 2026-04-28), not 30 days; (b) post-commit-intent conflation events continued in May, showing the detection protocol did not reduce the rate to zero."
    downstream_action: "CONDITIONAL: the synthesis's rate characterization in Section 7 Q2 should be corrected to '4 named incidents in a 2-day window (2026-04-26/28), plus 2-3 additional post-protocol same-root-cause events in May 2026.' This strengthens the argument for prevention, not weakens it."

  - id: LBC-2
    verdict: bounded-negative
    search_bounds:
      databases: ["decisions.log", "commit-intent-protocol.md stated failure modes", "git history May 2026"]
      time_range: "2026-04-28 (commit-intent deployment) to 2026-05-09"
      query_terms: ["conflat", "commit-intent", "concurrent staging"]
      excluded: ["pre-protocol incidents"]
    no_counterexample_found: true
    bound_audit:
      claim_scope_field: "commit-intent is insufficient as a standalone prevention"
      bound_scope_field: "decisions.log entries May 2026 + stated failure modes in commit-intent-protocol.md"
      coverage: sufficient
      gap: "Two sources converge on this verdict. (1) commit-intent-protocol.md explicitly states 'Failure modes the gate does NOT catch: Pre-staged work from a previous session; Sub-file conflation (both sessions edit same file).' This is the protocol's own admission. (2) Decisions log for 2026-05-03 shows two 'submodule-conflated' incidents that occurred AFTER commit-intent was deployed on 2026-04-28. Whether these are the same class or a different submodule-specific class is ambiguous from the log alone — but their presence confirms the protocol did not achieve zero-conflation."
    downstream_action: "SOUND — LBC-2 is supported. The synthesis's claim that worktrees are needed for prevention (not just detection) is defensible."

  - id: LBC-3
    verdict: uncertain
    reason: "The synthesis specifies the hook checks 'whether cwd equals the canonical repo root (resolved via git rev-parse --show-toplevel compared against LATTICE_PROJECT_ROOT-aware allowlist).' This cwd-based detection has at least two bypass vectors not addressed in the synthesis or prior gates: (a) a session operating from a worktree can call Edit with an absolute file_path pointing into the canonical tree (e.g., file_path='/canonical/repo/file.ts'); the hook's cwd check would see cwd=worktree and permit the call, yet the edit lands in the canonical tree; (b) git -C /canonical/repo add file.ts issued from a worktree bypasses the Bash matcher (which matches subcommand patterns against the literal command string, not the resolved working directory). These bypass vectors are not in scope of the unit tests proposed (which test cwd=canonical root correctly) and are not addressed in the D4 exemption envelope or D5 matcher design."
    downstream_action: "flagged confidence: insufficient — the hook specification must address (a) absolute-path Edit targets from worktree sessions and (b) git -C canonical-path staging from worktree sessions, or explicitly document these as accepted residual risk."

  - id: LBC-4
    verdict: uncertain
    reason: "All four named observables (zero orphan worktrees, zero non-FF aborts, zero symlink failures, zero session-creation failures) can show green while the conflation class survives. Observable 1 measures cleanup hygiene, not isolation correctness. Observable 2 measures merge-back conflicts, not staging contamination. Observable 3 measures .lattice/ visibility, not index isolation. Observable 4 measures session creation success, not whether sessions operate from their worktrees. None of the four observables requires that an actual conflation attempt was made and blocked. A hook with a cwd-resolution bug that passes all 4 observables would be undetected until R0 deploys. The synthesis has no observable measuring 'conflation attempt blocked by hook' or 'zero staging-from-canonical-root events.'"
    downstream_action: "flagged confidence: insufficient — at minimum, a fifth observable should be added: 'require-worktree.sh block count > 0 over the R1 period' (from .lattice/exemption-audit.log or a new .lattice/hook-block.log). Absence of blocks in the log should be interpretable, not ambiguous."

  - id: LBC-5
    verdict: bounded-negative
    search_bounds:
      databases: ["obra/superpowers GitHub repo", "gh api repos/obra/superpowers/contents/skills/using-git-worktrees/SKILL.md"]
      time_range: "fetched 2026-05-09"
      query_terms: ["GIT_DIR", "GIT_COMMON", "superproject", "check-ignore", "worktrees"]
      excluded: ["post-fetch content changes"]
    no_counterexample_found: true
    bound_audit:
      claim_scope_field: "4 verbatim borrows: GIT_DIR!=GIT_COMMON detection, submodule guard, .worktrees/ convention, .gitignore safety check"
      bound_scope_field: "full SKILL.md fetched and read; all 4 claimed borrows cross-checked against SKILL content"
      coverage: sufficient
      gap: "All 4 claimed verbatim borrows are verified present in the SKILL. One minor overstatement: the synthesis says '.worktrees/ directory convention — borrowed verbatim' but the SKILL uses .worktrees/<BRANCH_NAME> as the path inside the directory, while lattice uses .worktrees/<repo>-session-<topic>-<ts>. The subdirectory naming is an adaptation, not a verbatim borrow. The synthesis correctly classifies branch naming as 'adapted' in a separate row, but the directory convention row implies more verbatim-ness than exists. This is a minor documentation precision issue, not a build defect."
    downstream_action: "SOUND with minor clarification: the directory convention borrow is 'directory name verbatim, path-within-directory adapted.'"
```

---

## Section 1 — Restatement

This synthesis proposes adding a prevention layer beneath the existing detection layer in the lattice framework's concurrency-hygiene stack. The detection layer (commit-intent protocol, commit lock, scoped stash) catches staging contamination after it occurs; the prevention layer (PreToolUse hook + worktree session helper) prevents it structurally by giving each write-capable session its own git index.

The build plan has four phases: R1 (autopilot in worktree — first deployment), R0 (project-wide PreToolUse enforcement — destination), R2 (review-agent frontmatter isolation — parallel quick win), and R3 (e2e branch-comparison via detached worktrees instead of stash+checkout — parallel quick win). R0 depends on R1; R2 and R3 are independent.

The synthesis is presented after an architect gate (PASS after simplify round) and a probe (PROPAGATES with 2 resolved breaks and 4 build-phase carry-overs). Several design questions (D1-D6) are resolved with rationale.

---

## Section 2 — Assumptions Audit

| Assumption | Stated / Implicit | Supported | Breaks When |
|---|---|---|---|
| All 4 documented conflation incidents are attributed to shared git index | Stated (Section 1, Summary) | Yes — each incident is explained in decisions.log with staging-contamination root cause | Would break if any incident had a different root cause (e.g., hook sequencing, not index sharing) — not applicable; verified from commit and log content |
| The commit-intent protocol does not reduce the conflation rate to zero | Implicit in justifying R0 | Partially supported — post-protocol incidents found in May 2026 decisions.log | Would break if all post-protocol incidents are a different class (submodule-pointer only, not file-staging) |
| The PreToolUse hook's cwd check correctly identifies canonical root sessions | Implicit throughout R0 design | Unverified — no evidence cited that `git rev-parse --show-toplevel` comparison is reliable across all session entry paths | Breaks on: (a) symlink-based repo paths where show-toplevel and LATTICE_PROJECT_ROOT resolve differently; (b) git -C invocations that change the working directory for subcommands; (c) IDE sessions whose cwd is a subdirectory, not the repo root |
| The Bash matcher catches all staging-contamination git commands | Stated (D5 resolution) | Partial — explicit matcher covers `git add*`, `git commit*`, `git stash*`; does NOT cover `git -C /canonical add`, `git apply`, `git cherry-pick`, `git rebase` (all of which modify the index) | Breaks whenever a staging path doesn't match the explicit pattern list |
| The `isolation: "worktree"` agent frontmatter field is honored by the executor's agent dispatch path | Stated for R2 | Unverified — probe Target 4 explicitly flags this as a build-phase verification, not a synthesis-verified fact | Breaks if `executeParallelGroup → executeNode → agent invocation` short-circuits before the harness processes frontmatter; R2 silently provides no isolation |
| A new worktree for pcc is usable for frontend work after submodule init | Implicit in R1 design | Incomplete — synthesis specifies `git submodule update --init --recursive` but does not specify `npm install` in the new worktree's `frontend/` directory | Breaks for any R1 autopilot batch that runs frontend TypeScript compilation, builds, or linting in the new worktree |
| The rate "4/30 days" is a meaningful future prediction of the conflation rate | Stated (Section 7 Q2, Section 6 AC1) | Inaccurate — all 4 named incidents occurred in a 2-day window (2026-04-26 to 2026-04-28), not spread across 30 days | Breaks for any analysis that relies on the rate to justify monitoring duration or regression thresholds |

---

## Section 3 — Alternative Hypotheses

### H1: The commit-intent protocol is sufficient; worktree enforcement is overkill

**Argument:** commit-intent + commit-lock together caught every pre-R0 conflation incident. The four named incidents happened before commit-intent was deployed (2026-04-28). Post-deployment, the detection layer may be achieving zero conflation in the file-staging class. The muscle-memory shift (spawn session in worktree, npm install, merge back) adds friction that could reduce developer throughput. Building a PreToolUse hook that blocks all writes at canonical root adds a new class of friction-induced errors (blocked writes for legitimate operations, missed Bash matchers causing bypass).

**Evidence for:** Commit-intent protocol.md explicitly states what it cannot catch (pre-staged work from previous session; sub-file conflation) — but these edge cases may not occur in practice. Post-2026-04-28 decisions.log entries are ambiguous about whether post-protocol conflations are the file-staging class or the submodule-pointer class.

**Evidence against:** Two post-protocol conflation events appear in May 2026 decisions.log. The commit-intent-protocol.md's own stated failure modes include the primary mechanism (pre-staged work). The ~1100 LOC of defensive infrastructure exists because detection is inherently incomplete. Additionally, future scheduled remote agents and MCP background tasks may run at higher concurrency than current manual+autopilot, making the structural problem worse over time.

**Status:** Plausible. The synthesis does not present this alternative and does not address it in Section 7's spec value audit. **This is the most important gap in the synthesis.** A spec value audit that acknowledges the workaround as "commit-intent detection" (Q3) but does not ask "is the workaround sufficient?" fails the audit's purpose.

---

### H2: R1 alone (autopilot isolation) is the correct destination, with R0 deferred

**Argument:** The 4 documented incidents are all autopilot-vs-manual conflicts. No manual-vs-manual or manual-vs-scheduled-agent conflicts are documented. R0's PreToolUse hook imposes session-management overhead and muscle-memory shift on all users for a class of conflict that has only been empirically observed in autopilot sessions.

**Evidence for:** All 4 named incidents are labeled autopilot-related in decisions.log. The non-autopilot concurrent-session classes (manual-vs-manual, etc.) have zero documented occurrences. R0 is "medium-high" cost per the spec value audit; R1 is "moderate."

**Evidence against:** The synthesis correctly argues that future concurrency (scheduled agents, MCP background, autonomous loops) will create the non-autopilot classes. The argument that "R1 is destination not just beachhead" is the specific framing the synthesis rejects with CLAUDE.md rule 12 (merit over effort). The 2026-04-27 empty-commit incident involved a non-labeled session and the May 2026 submodule conflations may have been non-autopilot.

**Status:** Unlikely but not fully ruled out. The synthesis's merit argument is sound in principle; the counter-evidence is the absence of documented non-autopilot conflation. The synthesis acknowledges this distinction in Section 5 but does not present it as an alternative hypothesis requiring refutation.

---

### H3: The R0 hook creates a new failure class — excessive blocking — that exceeds the frequency of conflation incidents

**Argument:** The R0 hook blocks Edit/Write at canonical root for non-allowlisted paths. The allowlist (CLAUDE.md, README.md, ROADMAP.md, .claude/, docs/ root, .gitignore etc.) is a judgment call. Any path omitted from the allowlist becomes a blocked operation requiring either a worktree session or the LATTICE_ALLOW_MAIN_TREE exemption envelope. If the false-positive rate of the hook is, say, 5-10 per day across all sessions, and conflation incidents occur at 4/2 days (pre-protocol) or 0-1/month (post-protocol), the hook creates more disruption than the problem it solves.

**Evidence for:** The synthesis identifies this as WTI-RG-1 research gap and explicitly defers measurement to post-R0 deployment. The exemption envelope mechanism exists precisely because false positives are anticipated. The `.claude/` allowlist was added only after the architect review raised it — suggesting the initial allowlist was already incomplete.

**Evidence against:** The synthesis's hook ordering (require-worktree fires first, before commit-lock) is specifically designed to minimize disruption from block messages. The allowlist is per-project configurable. The single-shot exemption envelope is documented and audited. The net false positive rate is a researchable question — WTI-RG-1 is the right way to monitor this.

**Status:** Plausible but manageable risk. The synthesis's treatment of this risk via WTI-RG-1 monitoring is correct in form but is not surfaced as an explicit counter-argument in the spec value audit.

---

## Section 4 — Failure Mode Analysis

### FM-1: All four R0 stop-light gate observables show clean while conflation class survives

**Specific scenario:** R1 runs for the required 10+ autopilot batches. All four observables read zero throughout. The team promotes to R0. However, the require-worktree.sh hook has a cwd-resolution path that fails on sessions launched from IDE (e.g., VSCode opens at a subdirectory, not repo root) — cwd is `C:/pg/pcc/frontend`, not `C:/pg/pcc`. The hook's `git rev-parse --show-toplevel` in that context still returns `C:/pg/pcc`, but the cwd comparison checks `cwd == canonical_root` which evaluates false (`C:/pg/pcc/frontend != C:/pg/pcc`). Every IDE session writes to canonical tree without a worktree. The observables never detect this.

**Why the observables miss it:** None of the four observables measure hook-block events. Observable 4 (zero session-creation failures) measures lattice-session-start.sh, not hook fires. The hook can silently pass every IDE session without creating a worktree session, and all four observables remain green.

**Mitigation not in synthesis:** A fifth observable measuring "require-worktree.sh block events > threshold during R1 traffic" would detect whether the hook is actually firing, regardless of whether conflation occurs.

---

### FM-2: npm install omission renders pcc worktrees broken for frontend sessions

**Specific scenario:** An autopilot batch under R1 is assigned a task that involves running `npm run build` or `npm run test` for the frontend. The batch creates a worktree via `lattice-session-start.sh`. The script runs `git submodule update --init --recursive` (correctly, per AC1), but does not run `npm install` in `frontend/`. The worktree's `frontend/node_modules/` is empty (gitignored, not copied by `git worktree add`). The autopilot session runs TypeScript compilation — it fails. The session reports an error and the batch stalls.

**Why this is a real gap:** The synthesis's R1 acceptance criteria require only `.lattice/` symlink + `ls docs/_internal/` (submodule contents). Frontend build capability is not in the acceptance criteria. The superpowers SKILL.md Step 3 explicitly covers `npm install` as a required setup step — the synthesis's borrow table omits this step without explanation.

**For pcc specifically:** The venv path is absolute (`C:/pg/pcc/backend/venv/Scripts/...`) and survives across worktrees. But `node_modules` is relative to the frontend directory and does not. The backend is safe; the frontend is broken until npm install.

---

### FM-3: R2 isolation is unverified by the synthesis — acceptance criterion AC1 may be unachievable

**Specific scenario:** The synthesis proposes R2 acceptance criterion 1: "Each of the four review agents launched via Agent({subagent_type: ...}) runs in an isolated worktree (verifiable via fresh git status in the agent's session showing the spawned tree)." However, the executor's `executeParallelGroup` passes a shared `cwd` to all child nodes. The probe (Target 4) explicitly flags that the executor's dispatch path from `executeParallelGroup → executeNode → agent invocation` may short-circuit before the harness processes the `isolation: "worktree"` frontmatter field. If this short-circuit exists, adding `isolation: "worktree"` to agent frontmatter has no effect on executor-launched agents. R2 ships, AC1 is tested by manually launching an agent (which does work), and the parallel-group case is never verified. The synthesis carries this as a "build-phase verification" but does not make it a gate on R2 merging.

---

### FM-4: Trivial-rationale rejection list bypassed by multi-word rationale prefixed with a trivial word

**Specific scenario:** The LATTICE_EXEMPTION_RATIONALE rejection list contains `["fix", "test", "wip", "edit", "update"]`. The check is exact-match. A user sets `LATTICE_EXEMPTION_RATIONALE="fixing config"` — which contains "fix" as a substring but not as an exact match. The shell array check `for r in "${TRIVIAL_RATIONALES[@]}"; do [[ "$RATIONALE" == "$r" ]] && exit 1; done` passes because "fixing config" != "fix". The minimal trivial bypass is 2 characters: any rejected word with a suffix. The synthesis's "≥ 10 characters" length check partially mitigates this, but length and trivial-prefix are independent checks.

---

## Section 5 — Literature and Methodology Check

This is an infrastructure engineering synthesis. The relevant evaluation surface is: whether the proposed prevention mechanism is the state of practice for concurrent-session isolation in developer tooling, and whether the evidence for the problem is sufficient to justify the intervention.

**On the core mechanism (PreToolUse hook + per-session worktree):**

Git worktrees as an isolation primitive are well-established. Git worktree was stabilized in git 2.5 (2015) and has been the recommended approach for concurrent-branch work since at least git 2.15 (2017). The use case described (parallel sessions sharing a git index causing staging contamination) is a documented failure mode in any system that combines concurrent file edits with git's global-per-repo index. The synthesis's proposed solution (one worktree per session, preventing index sharing) is mechanically correct and is the standard approach.

The commit-intent protocol's design as a detection-after-staging mechanism is analogous to pre-commit linting: it catches problems before they complete but cannot prevent the underlying condition. The synthesis correctly identifies that prevention at session-entry is categorically stronger. This is the standard argument in computer security for "fail-safe defaults" vs "permission checking after access" — the former is structurally stronger.

**On the phased deployment strategy:**

The R1-before-R0 phasing for a disruptive infrastructure change is standard practice in production systems. The synthesis correctly identifies autopilot batches as the right testbed (bounded entry/exit points, well-defined scope, observable behavior). The stop-light gate (4 named observables before R0 promotion) is a reasonable form, though as noted in LBC-4, the observables don't directly measure conflation prevention.

**On the superpowers borrow:**

The obra/superpowers SKILL.md is an appropriate reference for the detection-first pattern and .worktrees/ convention. Verified by direct fetch. The borrow characterization is accurate with one minor overstatement (noted in LBC-5).

**Missing counter-argument in the synthesis:**

The synthesis does not address the strongest counter-argument: whether the commit-intent protocol, deployed as of 2026-04-28, has already reduced the conflation rate to an acceptable level such that the worktree infrastructure cost is not justified. A well-designed implementation plan spec should present this alternative and defend the decision to build prevention anyway. The spec value audit (Section 7) lists commit-intent as the workaround but does not ask whether the workaround is "good enough" — this is the standard spec-value-audit failure mode (categorical justification). The additional post-protocol evidence in decisions.log (May 2026 submodule conflations) supports the synthesis's case, but the synthesis does not cite these.

---

## Section 6 — Verdict by Finding

### Finding 1: Rate claim "4 incidents in 30 days" is inaccurate in Section 7 Q2 and Section 6 AC1

**Evidence:** Git log confirms all four named incidents occurred within a 2-day window: 2026-04-26 (three incidents, 17:53/18:53/19:04) and 2026-04-28 (one incident, 16:40). The "30 days" framing appears in Section 7 Q2 ("rate of conflations = 4/30 days × N concurrency factor") and Section 6 AC1 ("Pre-baseline: 4 incidents in 30 days"). This is not a 30-day rate; it is a 2-day cluster. Additionally, a 5th same-root-cause incident appears in decisions.log for 2026-04-27 (commit 45f29b53 emptied by interleave) and two post-protocol conflations appear in May 2026.

**Verdict: CONDITIONAL**

**What fixes it:** Correct Section 7 Q2 to: "4 named incidents in a 2-day window (2026-04-26/28), plus at least 2 additional same-root-cause events post-commit-intent-protocol in May 2026 (decisions.log entries for c9f82aa and 32944cf0)." Correct Section 6 AC1 pre-baseline to "4 named incidents in 2 days." The fix strengthens the synthesis's case — it shows the problem is more frequent than the "30 days" framing implies, and that post-protocol conflation events continued.

---

### Finding 2: The four R0 stop-light gate observables cannot detect a regression in conflation prevention

**Evidence:** Each observable is analyzed:
- Observable 1 (zero orphan worktrees): measures cleanup hygiene, not conflation prevention. A conflation in a properly cleaned-up session leaves no orphan.
- Observable 2 (zero non-FF aborts): measures merge-back conflicts, not staging contamination. Sessions can conflate and still FF-merge.
- Observable 3 (zero symlink failures): measures .lattice/ visibility, not index isolation.
- Observable 4 (zero session-creation failures): measures session creation success, not whether sessions operate correctly from within their worktrees.

The set of four observables measures that R1 infrastructure is working correctly. It does not measure that the infrastructure is achieving its stated purpose (preventing staging contamination).

**Verdict: CONDITIONAL**

**What fixes it:** Add a fifth observable: "require-worktree.sh block count > 0 in `.lattice/hook-block.log` during R1 traffic period." If the hook never fires during 10+ autopilot batches, either (a) all autopilot sessions are correctly operating from worktrees and never attempt to write at canonical root, or (b) the hook is not firing at all (bypass or misconfiguration). The count provides the minimum signal: if it reads zero throughout R1, investigate before R0 deploys. Also add: "zero `.lattice/` canonical-root-write events detected from within an active worktree session" — this catches the absolute-path Edit bypass class.

---

### Finding 3: R0 hook specification has an unclosed bypass vector for absolute-path Edit calls from worktree sessions

**Evidence:** The hook's blocking logic checks `cwd == canonical_root`. A session operating from a worktree (cwd = worktree path) is permitted to write. But `Edit` calls accept an absolute `file_path` parameter that can target any path on the filesystem, including `C:/pg/pcc/file.ts`. The hook fires on the Edit tool call, checks cwd = worktree (not canonical), and permits the call. The edit lands in the canonical tree. Git's index for the canonical tree is modified by a session that is supposed to be isolated in a worktree.

**Verdict: CONDITIONAL**

**What fixes it:** The `require-worktree.sh` hook must also check the `file_path` (for Edit/Write) and the `command` resolved working directory (for Bash with `-C` flag) against the canonical tree paths, in addition to the session cwd. Specifically: if `file_path` starts with the canonical repo root, block or warn even if cwd is a worktree. This is a defense-in-depth addition; the primary enforcement is still cwd-based (session-entry), but file-path validation closes the cross-tree write vector. Alternatively, the synthesis can explicitly document this as accepted residual risk with the rationale that absolute-path cross-tree edits are (a) unlikely in practice and (b) still caught by commit-intent if the staged files differ from the worktree's declared intent.

---

### Finding 4: The synthesis does not address the counter-argument that commit-intent detection is sufficient

**Evidence:** The synthesis's Section 5 "Plan Review Notes" acknowledges that the audit was not challenged by peer review R1/R2, and the spec value audit (Section 7) acknowledges commit-intent as the existing workaround but does not evaluate whether it is "good enough." The spec value audit criteria for R0 list "cost: medium-high" but no Q asking "is there evidence the workaround fails at a rate that justifies this cost?" The standard spec-value-audit failure mode this review protocol is designed to catch is exactly "we infer N things, each needs a UI/infrastructure fix" without validating that the fix is needed given the existing workaround.

For this specific case, the evidence that the workaround is insufficient exists (it is documented in commit-intent-protocol.md's own stated failure modes and in post-protocol decisions.log entries) but the synthesis does not present this evidence as a formal counter-argument refutation.

**Verdict: CONDITIONAL**

**What fixes it:** Add a Section 7 Q8 equivalent (or an explicit sub-section in Section 5 "Why commit-intent-only is insufficient"): present the counter-argument (detection is working; prevention adds overhead) and cite the refuting evidence (commit-intent-protocol.md stated failure modes, May 2026 post-protocol conflation events). This closes the "overkill" question that a reviewer or future reader would ask.

---

### Finding 5: Session-start script spec omits npm install for pcc frontend worktrees

**Evidence:** The synthesis specifies `lattice-session-start.sh` must run `git -C <worktree-path> submodule update --init --recursive`. This correctly handles the `docs/_internal` submodule. However, `node_modules/` in `frontend/` is gitignored and will not be present in a new worktree. The superpowers SKILL.md Step 3 ("Project Setup") explicitly requires `npm install` when `package.json` is present. The synthesis's borrow table lists Step 0, Step 1a/1b, and indirectly Step 4, but does not borrow Step 3. For pcc, any autopilot batch that needs to run `npm run build`, `npm run lint`, or `npm test` will fail in a fresh worktree unless npm install has run.

The backend venv situation is different: CLAUDE.md documents absolute venv paths (`C:/pg/pcc/backend/venv/Scripts/...`), which remain accessible from any worktree by absolute path. The frontend is the gap.

**Verdict: CONDITIONAL**

**What fixes it:** Add to `lattice-session-start.sh` spec: "auto-detect project setup (per superpowers SKILL Step 3): if `package.json` exists in the worktree root or in a `frontend/` subdirectory, run `npm install --prefer-offline` before printing the `cd` command. Log setup failure as non-fatal (warning) but print clearly." Add to R1 AC1: "frontend build succeeds in the new worktree (`npm run build` exits 0 from the worktree's frontend/ directory)."

---

### Finding 6: R2 acceptance criterion AC1 is unverifiable given the executor dispatch uncertainty

**Evidence:** Probe Target 4 explicitly identifies that `executeParallelGroup → executeNode → agent invocation` in the executor may short-circuit before the harness processes agent frontmatter `isolation: "worktree"`. The synthesis carries this as a "build-phase verification required" but the R2 acceptance criteria include "each of the four review agents runs in an isolated worktree (verifiable via fresh git status in the agent's session)." If the executor short-circuits, this acceptance criterion cannot be met, and the test for it requires a specific executor trace path that the synthesis doesn't specify.

**Verdict: CONDITIONAL**

**What fixes it:** The synthesis should gate R2 on the executor trace verification, not just carry it as a build-phase note. Specifically: R2 acceptance criterion 0 (new, blocking) should be: "Verify that `executeParallelGroup → executeNode` passes agent frontmatter `isolation` field to the harness invocation. If the executor short-circuits with shared cwd, R2's only deliverable is the tool-allowlist restriction (not worktree isolation), and the acceptance criteria must be updated accordingly." This prevents R2 shipping with a falsely-claimed isolation guarantee.

---

### Finding 7: The borrow table's ".worktrees/ directory convention borrowed verbatim" slightly overstates the fidelity

**Evidence:** The superpowers SKILL.md Step 1b creates worktrees at `.worktrees/<BRANCH_NAME>` (or the global path `~/.config/superpowers/worktrees/$project/<BRANCH_NAME>`). The synthesis proposes `.worktrees/<repo>-session-<topic>-<ts>`. The naming convention inside `.worktrees/` is adapted, not verbatim. The directory name `.worktrees/` itself is verbatim. This is a documentation precision issue in the borrow table, not a design defect.

**Verdict: SOUND (minor annotation needed)**

The borrow claim is directionally correct. The `adapted vs verbatim` distinction should be: "`.worktrees/` directory name — verbatim; path within directory — adapted (adds repo prefix + topic + timestamp, replaces branch name for session-management clarity)."

---

## Section 7 — Competing Hypotheses Summary

| Claim | H1: Commit-intent is sufficient | H2: R1 is destination, not R0 | Original Synthesis |
|---|---|---|---|
| Evidence for | commit-intent deploys before R0; post-deployment conflation class ambiguous | All 4 named incidents are autopilot-vs-manual | Post-protocol conflation events in May 2026; commit-intent-protocol.md's own stated failure modes; ~1100 LOC defensive infrastructure |
| Evidence against | May 2026 conflation events (ambiguous class); commit-intent-protocol.md stated failure modes | Future concurrency (scheduled agents, MCP background) will create non-autopilot class; absence of documented non-autopilot incidents is not evidence the class won't occur | Hook bypass vectors (LBC-3); observables gap (LBC-4); npm install omission (FM-2) |
| Status | Plausible — synthesis should explicitly refute | Unlikely — synthesis correctly frames R0 as merit-correct destination | CONDITIONAL on 6 specific findings; structurally sound overall |

---

## Overall Verdict: CONDITIONAL

Six findings, none FLAWED. The synthesis is structurally sound and its core mechanism (worktree isolation prevents staging contamination categorically) is correct. The build plan is well-organized, the design questions are resolved, and the reuse audit is honest. The findings are specification completeness gaps, not design errors.

**Blocking before R0 deployment (must be addressed in build phase or synthesis update):**

1. **Finding 2** (observables gap): Add a fifth observable measuring hook-block events. The four named observables cannot detect whether the prevention mechanism is actually functioning.
2. **Finding 3** (absolute-path bypass): Specify whether the hook checks `file_path` targets from worktree sessions, or explicitly document the bypass as accepted residual risk with rationale.
3. **Finding 4** (counter-argument gap): The synthesis must address the "commit-intent-only is sufficient" counter-argument explicitly, citing the post-protocol conflation evidence.
4. **Finding 5** (npm install): Add project-setup step to `lattice-session-start.sh` spec; add frontend build to R1 AC1.
5. **Finding 6** (R2 executor verification): Gate R2 shipping on the executor trace verification, not just carry it as a note.

**Non-blocking (can be resolved in build phase):**

6. **Finding 1** (rate claim): Correct Section 7 Q2 and AC1 rate characterization to "2-day window" not "30 days." This improves evidential accuracy and strengthens the synthesis's own argument.
7. **Finding 7** (borrow table precision): Clarify ".worktrees/ directory name — verbatim; path within directory — adapted."

---

## Persistence: Gaps

**Research gap (Finding 4 — counter-argument gap):** The question "does commit-intent-only achieve sufficient conflation prevention post-deployment, and does the May 2026 evidence constitute the same failure class as the pre-protocol incidents?" is answerable from the decisions.log but has not been formally answered. Append to `C:/pg/lattice/research/REGISTRY.md` under worktree-isolation open-questions: "WTI-RG-2: What is the post-commit-intent conflation rate? Are the May 2026 submodule-conflated events (c9f82aa, 32944cf0) the same class as the 4 named file-staging conflations? Source: peer-review/worktree-isolation-synthesis."

**Data gap (Finding 5 — npm install):** `docs/_internal/TODO.md` should capture: `- [ ] **DATA-GAP: worktree session setup for frontend-heavy projects** — from peer review of worktree-isolation-synthesis. lattice-session-start.sh spec omits npm install; any worktree session attempting frontend TypeScript compilation will fail. Superpowers SKILL Step 3 covers this; lattice borrow table does not.`
