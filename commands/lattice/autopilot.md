---
name: autopilot
description: Portfolio autopilot — advance safe topics AND mechanical TODO items through their full lifecycle. Stops only at justified gates. Escalates via {{lattice.project.backlog.escalation_log}}.
---

You are the **portfolio autopilot**. You advance all safe work — lattice topics through their cycle phases AND mechanical TODO items that don't need user design input — stopping only at justified gates.

**Input:** Optional filter pattern and max count. Examples:
- `autopilot` — advance up to 3 items
- `autopilot cl-decomposition` — filter to matching topics
- `autopilot --max 5` — advance up to 5
- `autopilot --dry-run` — preview only
- `autopilot --source todo` — only pull from the TODO queue
- `autopilot --source topics` — only pull from topic lifecycle
- `autopilot --discover` — run the project's discovery scanner BEFORE the loop, fold safe gaps into the queue, escalate ambiguous ones (see Modes below)
- `autopilot --consolidate` — scan recent knowledge/research files for dense clusters and surface synthesize suggestions in the recommendations queue (see Modes below)

## Two sources of work

Autopilot pulls from two queues and merges them into a single priority-ordered list:

1. **Topic queue** — `.lattice/cycle-state/*.yaml`. Research/blueprint/build/spike phases. Classified by `/lattice:prioritize` as `[autopilot]` safe.
2. **TODO queue** — items in `{{lattice.project.backlog.todo}}` tagged `autopilot: ready`. Mechanical work that doesn't need design decisions: data gaps, ETL, contract-triangle cleanup, no-behavior-change refactors, known-fix bugs.

Both queues apply the same safety criteria. Either produces escalations to `{{lattice.project.backlog.escalation_log}}` at the repo root when a real user-input need surfaces.

## Protocol

### Step 0: Reconcile state against git

Run the CLI reconciliation. This is ground truth.

```bash
lattice status --reconcile
```

Review output. If corrections were made, note them.

### Step 0.5: Read the TODO queue

In parallel with Step 0:

```bash
# List TODO items tagged autopilot: ready with score, sorted descending
# (If a helper script exists in the project, prefer it. Otherwise grep directly.)
```

Parse `{{lattice.project.backlog.todo}}` (or the project's equivalent) for entries that carry an `autopilot:` field. Valid values:

| Value | Meaning | Autopilot action |
|---|---|---|
| `ready` | Safe to advance without user input | Queue for selection |
| `waiting-data` | Blocked on external data | Skip (surface in Data Acquisition / Partnership bucket per prioritize skill) |
| `deferred-dg` | Deferred until Datagrok migration | Skip |
| `needs-user` | Requires design decision, scope call, or user taste | Skip |
| (no tag) | Unclassified | Skip, add to Step 4 escalation list for tagging |

Each `ready` item should also carry a `score:` field (integer 0-27 from the pillars × data × impl rubric — see `{{lattice.project.docs.autopilot_flow}}` for scoring details). If not present, treat as score=0 and rank behind tagged items.

### Step 1: Coherence check

```bash
lattice coherence --skip-reconcile
```

**`--skip-reconcile` is mandatory here.** Step 0 (`lattice status --reconcile`) already reconciled and wrote corrections. Running `lattice coherence` without the flag would re-scan git for no incremental benefit.

Read the output. Identify:
- **Safe topics** — can advance
- **Blocked topics** — have coherence conflicts
- **Subsystem heatmap** — contended subsystems

### Step 2: Build the unified queue

Merge the safe-topic list (Step 1) and the `autopilot: ready` TODO list (Step 0.5) into a single ranked queue.

Ranking:
1. **Topics in `research-complete` or `blueprint-complete`** — highest priority. Research/blueprint ceremony already paid; just needs the next phase. Always ahead of TODO items of the same tier, because cycle gates (R1+R2 peer review, architect review, science preservation) are load-bearing and already completed.
2. **TODO items** sorted by `score` descending.
3. **Topics in earlier phases** (research/blueprint/build in progress) — resume these.

Apply filter and max. Skip:
- Paused topics (`lifecycle_state: paused`) — surface in Step 4 for user resume/archive decision.
- Zombie topics (active phase, no lock, 48h+ stale checkpoint) — surface in Step 4.
- TODO items tagged anything except `ready` (see table above).

For each selected item, determine the action:

**Topic routing (by phase):**
- `research-complete` → `/lattice:blueprint-cycle {topic}`
- `blueprint-complete` → `/lattice:build-cycle {topic}`
- `blueprint` (in progress) → `/lattice:blueprint-cycle {topic}` (resume)
- `build` (in progress) → `/lattice:build-cycle {topic}` (resume)
- `research` (in progress) → `/lattice:research-cycle {topic}` (resume)
- `spike` (in progress) → `/lattice:spike {topic}` (resume)

**TODO item routing (by size/kind):**
- ≤50 LOC mechanical fix OR contract/doc cleanup → direct edit + `/ops:check` for regression
- Bug fix with known reproduction → `/ops:bug` then direct edit + `/ops:check`
- ETL expansion / data load → `/lattice:spike` with validation-suite regression as acceptance
- Research item (marked `kind: research` in TODO) → `/lattice:research-cycle` (R1+R2 peer review gates stay on)
- Refactor with no behavior change → direct edit + full test suite must pass

### Step 3: Execute

**Step 3.0 -- Spawn worktree (R1, worktree-isolation):** Before processing any items, the autopilot batch spawns its own git worktree so its index is isolated from the user's canonical tree and from any parallel autopilot batch. When invoked via the executor with `LATTICE_AUTOPILOT_WORKTREE=1`, this is automatic in `runAutopilot` (`executor/src/autopilot.ts`). When invoked manually:

```bash
BATCH_ID="autopilot-$(date -u +%Y%m%dT%H%M%SZ)"
bash scripts/lattice-session-start.sh "$BATCH_ID" --skip-deps
# operate from the printed worktree path; cd into it before running items
```

The session-spawn helper handles `.lattice/` cross-worktree visibility (symlink primary, `LATTICE_PROJECT_ROOT` env-var fallback on Windows-without-Developer-Mode), submodule init, and project-setup auto-detection. Failures are non-fatal -- session-creation errors land in `.lattice/session-creation-errors.log`. See `.lattice/worktree-isolation-protocol.md` for the full contract.

**Step 3.6 -- End the session:** after the last item commits (or the batch errors out), tear the worktree down:

```bash
bash scripts/lattice-session-end.sh "$BATCH_ID" --merge-back
```

`--merge-back` fast-forwards the session branch into the base (default master/main) and removes the worktree. If the base has advanced past the session's merge-base (multi-day batch), `--merge-back` aborts and the protocol doc instructs `--branch-as-pr` for branch-as-PR review. The R1 tests (`executor/src/autopilot-worktree.test.ts`) verify that two concurrent batches each commit to their own branch with master untouched -- the conflation precedents (`1370c103`, `521f1d16`, `a47ee865`, `abdb31c9`) cannot recur under R1.

**Step 3.1 -- per item:** for each selected item:
1. Announce: `"Advancing {name} ({source}/{phase-or-kind}) via {route}"`
2. **Acquire the commit lock BEFORE staging** (CRITICAL — prevents conflation with concurrent manual commits or other autopilot batches):
   ```bash
   export LATTICE_LOCK_HOLDER="autopilot-batch-$BATCH_ID-item-$ITEM_ID"
   bash scripts/acquire-lock.sh "$LATTICE_LOCK_HOLDER" --poll
   ```
   The `LATTICE_LOCK_HOLDER` env var tells the pre-commit hook to recognize this outer-held lock and NOT re-acquire it. Without this discipline, concurrent commits (manual `git add` from a parallel session, or another autopilot batch) can snapshot each other's pre-staged files into a single commit with a mismatched message. Three confirmed conflations in pcc this session (commits 1370c103, 521f1d16, a47ee865) all stemmed from this gap.
3. Run the appropriate skill or direct action. The skill stages files (`git add`) and creates the commit -- both inside the lock window.
4. **Release the lock IMMEDIATELY after `git commit` returns** (success or failure):
   ```bash
   bash scripts/release-lock.sh
   unset LATTICE_LOCK_HOLDER
   ```
   On any error path, release the lock before exiting -- a held lock blocks every other commit. Use `trap 'bash scripts/release-lock.sh; unset LATTICE_LOCK_HOLDER' EXIT` if running multiple items in a script wrapper.
5. On completion, append a line to `{{lattice.project.backlog.escalation_log}}` IF the skill surfaced any user decision, OR remove the TODO entry / tick it strikethrough with commit hash on success.
6. Continue to the next queue item. Re-acquire the lock for each item (do NOT hold across items -- gives manual commits a window between batches). Do NOT re-run `lattice coherence` between items — Step 4 catches new blockers.

**Phase transitions are automatic.** Do NOT ask "start blueprint?" or "ready to build?" — if the coherence check passed, proceed.

**Topic priority signal.** Topic YAMLs may carry two optional fields autopilot honors during queue construction:

- `prerequisites: [topic-or-todo-id, ...]` — block this topic until each listed id is complete. An id is satisfied when it matches NEITHER an active topic in a non-completed phase NOR an entry in the `autopilot: ready` TODO queue. Unmatched ids (typos, references to already-shipped work) are treated as satisfied and surfaced as an `info` advisory in the coherence report. Legacy prose form `prerequisite: "X must be complete first"` (top-level or under `implementation_context:`) continues to work and merges with the array via dedupe.
- `score: <int 0-27>` — same rubric as TODO scoring (pillars × data × impl). Sorts topics within the topic tier; topic-vs-TODO tier ordering is unchanged (topics still rank ahead of TODOs of any score). Out-of-range values clamp; non-numeric defaults to 0.

Example:

```yaml
topic: example-topic
phase: research-complete
score: 18
prerequisites:
  - GAP-275           # blocks while GAP-275 is on the autopilot-ready TODO queue
  - other-topic-id    # blocks while other-topic-id is in a non-completed phase
```

**Auto-pause-on-failure (one-strike).** When a topic candidate fails or errors, the executor writes `lifecycle_state: paused` + `pause_reason` + `auto_paused_at` to its cycle-state YAML before continuing. This prevents the next autopilot run from re-picking the same topic and burning iterations on the same blocker (e.g., persistent e2e-run failures, blueprint-cycle blockers that need engineering attention). Idempotent — a topic already paused stays paused with its existing reason. To resume a paused topic: edit the YAML and remove `lifecycle_state` (or set it to `active`). The per-run circuit breaker still trips at 5 consecutive same-cause failures across topics.

**Commit trailers are mandatory.** Every commit carries:
```
Topic: {topic-or-todo-id}
Phase: {phase-completed-or-"mechanical"}
```

**SCIENCE-FLAG resolution during autopilot.** Follows the canonical [SCIENCE-FLAG resolution protocol](../../docs/skills-includes/science-flag-protocol.md). Under autopilot autonomous mode, the default clearance paths are (2a) on-data verification or (2b) literature memo with ≥3 citations. Cannot find citations AND cannot run on-data verification → row to `{{lattice.project.backlog.escalation_log}}`. The gate's job is to force the decision-with-rationale, not to park work for an absent SME.

### Step 4: Escalation

After the batch, run:

```bash
lattice coherence --skip-reconcile
```

Wait — Step 3 commits have now changed git state. Re-reconcile:

```bash
lattice status --reconcile
lattice coherence --skip-reconcile
```

Collect pending decisions:
- Blocked topics (coherence conflicts)
- Paused topics needing resume/archive
- Zombie topics
- TODO items tagged `needs-user`
- TODO items with no `autopilot:` field at all (untagged items)
- SCIENCE-FLAGs that cannot clear via the [SCIENCE-FLAG resolution protocol](../../docs/skills-includes/science-flag-protocol.md) (no on-data verification and no citable literature grounding)

Append to `{{lattice.project.backlog.escalation_log}}`:

```markdown
## Escalation — {ISO date}

**Advanced this batch:** {count} ({list})
**Escalations:**

### {item name}
- **Source:** {topic-cycle | TODO | coherence}
- **Reason:** {why this needs you}
- **What I tried:** {brief}
- **What I need:** {specific decision, scope question, or data}

### ...
```

Do NOT block on escalations during autopilot — the whole point is to batch them. The user reviews `{{lattice.project.backlog.escalation_log}}` on their own cadence.

### Step 5: Summary

Print to stdout:

```
AUTOPILOT SUMMARY
Advanced: {count} ({list})
Failed: {count} ({list})
Escalations written: {count} → {{lattice.project.backlog.escalation_log}}
Queue remaining: {topics: N, todo-ready: N}
```

## Justified gates (ESCALATE, do not block)

These halt the current item and get written to {{lattice.project.backlog.escalation_log}}, but autopilot continues with the next queue item:

- **SCIENCE-FLAG that cannot clear the [resolution protocol](../../docs/skills-includes/science-flag-protocol.md)** — neither on-data verification nor a ≥3-citation literature memo is achievable. Document the flag + which paths were attempted + what failed.
- **Persistent FLAWED** — genuine scientific disagreement across 2 peer review rounds.
- **BREAKS** — system integrity at risk. Auto-revert the branch; escalate.
- **Architect REJECT** — fundamental approach wrong. Revert; escalate.
- **Coherence conflicts** — cross-topic subsystem contention.
- **Zombie topics** — active phase but no lock and stale checkpoint.

## Autonomous (proceed without asking)

- Classification (auto-decide full/spike/bugfix)
- Phase transitions (research → blueprint → build)
- CONDITIONAL peer review findings (auto-accept)
- Architect SIMPLIFY (auto-apply)
- Bikeshed detection (auto-side with R1)
- Commit (auto when review passes)
- **SCIENCE-FLAG resolution via the [protocol](../../docs/skills-includes/science-flag-protocol.md) Path 2a (on-data verification) or 2b (≥3-citation literature memo)** — author the rationale, cite, ship. The gate's job is to force the decision-with-rationale, not to pause forever.

## Anti-patterns

1. **Running `lattice coherence` without `--skip-reconcile` when `lattice status --reconcile` just ran in the same session.** Redundant git scan. The CLI now supports the flag.
2. **Escalating every SCIENCE-FLAG as "needs SME".** See above. The gate terminates when the decision is made with citations, not when an SME signs off — because in a Claude-authored codebase, there is no SME in the feedback loop.
3. **Advancing a TODO item tagged `waiting-data`.** The data is the blocker; Claude can't synthesize it from first principles. These go to the Data Acquisition bucket in `/lattice:prioritize`, not to autopilot.
4. **Advancing an untagged TODO item.** If there's no `autopilot:` tag, you don't know if it's safe. Escalate for tagging.
5. **Auto-invoking `/lattice:synthesize` from `--consolidate`.** The signal is heuristic (recent edits + shared keywords). Surface as a recommendation; let the user (or the next deliberate cycle) decide whether the cluster has actually emerged.
6. **Trusting `--discover` output blindly.** The scanner is heuristic — Gap entries with `safe: true` still get the standard autopilot safety re-check (size, kind, route). A scanner-flagged "safe" gap that lands in research territory still routes through `/lattice:research-cycle`, not direct edit.

---

## Modes

These modes are pre-loop additions to the standard protocol above. They run BEFORE Step 0 (or alongside it) and feed work into the same Step 2 unified queue. Standard safety criteria still apply — the modes provide more candidates, not lower gates.

### `--discover` — fold discovery-scan gaps into the loop

> Source: karpathy-llm-wiki (sparse-area / lint operation as autopilot signal). LIT-03.

**When to use:** at the start of a fresh autopilot batch, when the project ships a `{{lattice.project.scripts.discovery_scan}}`. Surfaces gaps the heuristic scanner finds in manifests, registries, coverage tables, and architecture docs that are too small to merit a topic but real enough to act on.

**Pre-loop step (runs once, before Step 0):**

1. Probe for the script:
   ```bash
   test -f {{lattice.project.scripts.discovery_scan}}
   ```
   If absent, emit a one-line notice to stdout: `"--discover: {{lattice.project.scripts.discovery_scan}} not found in this project; continuing with normal loop."` and proceed to Step 0. Do NOT fail the batch.

2. If present, run it:
   ```bash
   python {{lattice.project.scripts.discovery_scan}}
   ```
   Expected output: `scripts/data/discovery-report.md` (markdown report) plus a console summary. The report shape is the contract callers depend on — `Gap` entries with `category`, `item`, `suggestion`, `evidence`, `safe` (bool), and `severity` (high/medium/low). Reference template: `pcc/{{lattice.project.scripts.discovery_scan}}`.

3. Parse the report. For each Gap row:
   - **Re-classify against autopilot safety criteria** (do NOT just trust the scanner's `safe` flag — apply the same gates Step 2 applies to TODO items). Safe-for-autopilot when ALL of:
     - The suggestion is a mechanical fix (≤50 LOC), a doc/architecture stub, a contract-triangle alignment, or a registry citation update — NOT a science judgement, NOT a UI epic, NOT a SCIENCE-FLAG-adjacent decision.
     - The evidence cites a specific file/line or table row that grounds the gap.
     - The category does not require user taste (no design decisions, no scope calls, no view-spec changes).
   - **Safe gaps:** inject into the Step 2 unified queue as synthetic TODO-equivalents with `kind: discover` and `score` derived from severity (high=20, medium=12, low=6). They flow through Step 3 routing alongside topic and TODO work.
   - **Ambiguous or needs-user gaps:** skip — append to `{{lattice.project.backlog.escalation_log}}` under a `### Discovery-scan: {category} — {item}` heading with the gap's `suggestion`, `evidence` citation, and one-line reason for routing to user (e.g., "scope call: which subsystem owns this?").

4. Proceed to Step 0. The discovery gaps are now ordinary queue entries — same lifecycle, same trailers, same lock discipline. Commit trailer for a discovery-sourced item:
   ```
   Topic: discover/{category-slug}-{item-slug}
   Phase: mechanical
   ```

**Anti-pattern:** treating `safe: true` from the scanner as autopilot-safe without re-applying the standard gates. The scanner says "deterministic, no science judgement needed" — autopilot still has to confirm size, kind, and absence of contract/SCIENCE coupling.

### `--consolidate` — surface knowledge-cluster synthesize suggestions

> Source: ahrens-smart-notes (bottom-up emergence — when notes start citing each other densely, the topic is asking to be extracted). See `docs/literature/ahrens-smart-notes.md` for the underlying framing. LIT-04.

**When to use:** at the end of a batch, before Step 5 summary, OR ad-hoc to ask "is anything ready to be synthesized?". This mode does NOT advance work — it produces a recommendation the user (or a future deliberate `/lattice:synthesize` invocation) decides on.

**Detection heuristic (run after Step 4):**

1. List candidate files modified in the last 14 days under both:
   - `{{lattice.project.research.root}}/`
   - `{{lattice.project.docs.internal_root}}/knowledge/`

   ```bash
   git log --since="14 days ago" --name-only --pretty=format: -- {{lattice.project.research.root}} {{lattice.project.docs.internal_root}}/knowledge | sort -u
   ```

2. For each candidate, extract the topic signal cheaply (no NLP needed):
   - **Filename keywords** (split on `-` and `_`, drop stopwords like `note`, `draft`, `v2`).
   - **`derives_from` references** if the file is a typed YAML fact (knowledge-graph entries) — these declare an explicit citation chain.
   - **Inbound markdown links** — grep the candidate set for `]({other-file})` or bare `{other-file}` references between the recent-change files.

3. Cluster: group candidates whose signals overlap. A cluster qualifies as "dense" when **≥3 files** share at least one of:
   - A topic keyword in the filename.
   - A `derives_from` chain (transitive — A derives_from B, B derives_from C all count as one cluster).
   - Mutual citation (A cites B, B cites C, A or C cites the other).

4. For each qualifying cluster, append to the Step 5 summary under a new `Recommendations` block:
   ```
   RECOMMENDATIONS (--consolidate)
   - Cluster: {topic-keyword-or-shared-anchor}
     Files: {list of 3+ paths}
     Signal: {keyword | derives_from chain | mutual citation}
     Suggested: /lattice:synthesize "{cluster-topic}"
   ```

5. Do NOT auto-invoke `/lattice:synthesize`. The skill costs significant tokens and produces a committed position; the heuristic above is recall-biased on purpose. Surface only.

**Anti-pattern:** firing on every recent-edit cluster regardless of citation density. The signal is "the corpus is asking for synthesis" (Ahrens emergence) — not "files were touched". Keyword-only clusters with no citation linkage are weak signal; surface only with a `Signal: keyword (weak)` annotation so the user can deprioritize.

**Coexistence:** `--discover` and `--consolidate` are independent. Running both in one invocation runs `--discover` pre-loop and `--consolidate` post-Step-4; the Step 5 summary lists discovery work in `Advanced:` and synthesis suggestions in `Recommendations`.
