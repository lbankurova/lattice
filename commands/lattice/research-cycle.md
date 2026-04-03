---
name: research-cycle
description: Orchestrate the full research → peer-review → incorporate → peer-review loop. Enter at any step.
---

You are orchestrating a research cycle. This skill runs a produce → review → incorporate → review loop that applies to ANY artifact (research doc, synthesis plan, implementation spec). Enter at any step, run forward from there.

**Input:** A topic/doc path and optional `--from {step}`.

## Execution Mode

**Default: autonomous.** Run forward through steps without stopping for user input. The user invoked the cycle — that's the go signal. Stop ONLY at critical decision points (listed below).

**Critical decision points (STOP and present options):**
- Landscape branch selection (Step 1: user picks which branches to deep dive)
- FLAWED findings that persist across both peer review rounds (Step 5: genuine disagreement)
- Architect REJECT or SCIENCE-FLAG (Step 7.5: needs human judgment)
- Probe BREAKS or SCIENCE-FLAG (Steps 6.5, 7.8: cross-system implications)
- Validation degradation (if engine changes are involved)

**Everything else proceeds automatically:**
- CONDITIONAL peer review findings → auto-accept and incorporate
- SOUND peer review findings → note and proceed
- Single FLAWED finding in R1 that R2 marks resolved → proceed
- Architect PASS → proceed
- Architect SIMPLIFY → apply the simplifications, re-gate once, proceed if PASS
- Probe SAFE/PROPAGATES → proceed
- Research validation (all SOUND/CONDITIONAL after R2) → proceed to synthesis

**Log every auto-decision.** Append to `.lattice/decisions.log`:
```
{timestamp}	research-cycle	AUTO-{action}	{topic}	step:{N}	{what was decided and why}
```

The user can review auto-decisions in the log. If an auto-decision was wrong, the cycle can re-enter at the affected step.

---

## State Tracking

On first invocation for a topic, create `.lattice/cycle-state/{topic}.yaml`:

```yaml
topic: {topic}
started: {ISO timestamp}
current_step: 1
completed: {}
decisions: []
```

**Update this file after every step completes.** This is the state machine — it prevents skipping steps and enables cross-session resume.

**Gate rule:** Before executing Step N, verify that Step N-1 is marked completed in the state file. If it's not, either:
1. The state file is stale (re-detect from file existence, same as auto-detection)
2. A step was skipped — go back and run it

---

## Entry Points

Detect the right entry point from context, or use `--from`:

| Entry | When to use | Starts at |
|-------|-------------|-----------|
| `--from research` | New topic, no existing doc | Step 1 → 2 → 3 → 4 → 5 → 6 → 6.5 |
| `--from review` | Doc exists, needs peer review | Step 2 → 3 → 4 → 5 → 6 → 6.5 |
| `--from incorporate` | Peer review done, needs incorporation | Step 3 → 4 → 5 → 6 → 6.5 |
| `--from r2` | Feedback incorporated, needs Round 2 review | Step 4 → 5 → 6 → 6.5 |
| `--from synthesize` | Research validated, needs synthesis | Step 7 → 7.5 → 7.8 → 8 → 9 → 10 → 11 |
| `--from architect` | Synthesis done, needs architect gate | Step 7.5 → 7.8 → 8 → 9 → 10 → 11 |
| `--from plan-review` | Architect passed, plan needs peer review | Step 8 → 9 → 10 → 11 |

**Auto-detection:** If no `--from` flag, detect from:
1. State file `.lattice/cycle-state/{topic}.yaml` — resume from `current_step`
2. If no state file, detect from file existence:
   - No `docs/_internal/research/{topic}.md` → `--from research`
   - Research doc exists, no `peer-reviews/{topic}-review.md` → `--from review`
   - `{topic}-review.md` exists, no "Peer Review Notes" section in research doc → `--from incorporate`
   - Research doc has "Peer Review Notes" section, no `{topic}-review-r2.md` → `--from r2`
   - `{topic}-review-r2.md` exists, no `docs/_internal/incoming/{topic}-synthesis.md` → `--from synthesize`
   - Synthesis exists, no `peer-reviews/{topic}-architect-review.md` → `--from architect`
   - Architect review exists, no `peer-reviews/{topic}-synthesis-review.md` → `--from plan-review`

Also accepts:
- `--landscape` or `--deep {branch}` for research tier
- `--novel` to run Round 2 peer review in novel source mode

---

## Session Start Protocol

Before running any step, read the decisions log (`.lattice/decisions.log`) if it exists. Scan for entries matching this topic. This prevents:
- Re-trying approaches that already failed
- Re-raising peer review findings that were already rejected with counter-evidence
- Re-running probes on unchanged subsystems

If the log shows previous failed attempts, acknowledge them and take a different approach.

---

## Decision Prompt Format

At critical decision points (STOP points only), present options:

```
---
**Decision: [what needs deciding]**

1. [recommended option] *(recommended — [reason])*
2. [alternative]
3. [alternative]
4. Something else

Modifiers: [applicable flags like --novel, --deep, --landscape]
---
```

---

## Research Loop (Steps 1-6.5)

### Step 1: Research

Run `/lattice:research` on the topic. If a research doc already exists with unaddressed peer review findings, incorporate those first (Step 3).

Write output to `docs/_internal/research/{topic}.md`.

**If `--landscape`:** Present branch table with coverage scores. **STOP — branch selection is a critical decision point.**

```
---
**Decision: Which branches to deep dive on?**

1. Branches {N}, {M} *(recommended — {X}% combined coverage)*
2. Branches {N}, {M}, {P} (adds {topic} at {Y}% coverage)
3. All branches (comprehensive but token-heavy)
4. Skip deep dives, proceed to peer review with landscape only
5. Something else
---
```

**Update state:** `current_step: 2`, record research file in `completed.1_research`.

### Step 2: Peer Review — Round 1

**Launch a separate agent. This is non-negotiable.** Use the Agent tool with a fresh agent. Do NOT review in the current context — the research rationale is in your context window and will cause confirmation bias.

Launch with:
- **Prompt:** Full `/lattice:peer-review` skill instructions from `commands/lattice/peer-review.md`
- **Input:** The doc path ONLY — no reasoning, no rationale, no context
- **Output:** `docs/_internal/research/peer-reviews/{topic}-review.md`

**Gate check on review output:** After the agent returns, read the review file and verify:
1. It contains at least one finding rated CONDITIONAL or FLAWED. An all-SOUND review is suspicious — re-read the review. If it's genuinely substantive (detailed evidence for each SOUND rating), accept it. If it's shallow ("looks reasonable"), reject and re-launch with explicit instruction: "Your previous review found no issues. Look harder — specifically at assumptions (Section 2), failure modes (Section 4), and literature conflicts (Section 5)."
2. Each finding has specific evidence, not just a verdict label.
3. The review addresses at least 3 of 5 dimensions: assumptions, logic chain, alternatives, failure modes, literature.

**Autonomous handling of findings:**
- **SOUND** findings → note and proceed
- **CONDITIONAL** findings → auto-accept (will incorporate in Step 3)
- **FLAWED** findings → auto-accept for incorporation; if the FLAWED finding challenges a core premise of the research, flag it but still proceed to incorporation (the incorporation will address it; R2 will verify)

Log all auto-decisions to `.lattice/decisions.log`.

**Update state:** `current_step: 3`, record review file in `completed.2_peer_review_r1`.

### Step 3: Incorporate Feedback

**If entering from a previous session** (`--from incorporate`): read the peer review file AND the decisions log for this topic. If the log has accept/reject decisions from a prior session, use those. If not, present findings and **STOP** for user decisions.

For each accepted finding:
- **FLAWED:** Rewrite the affected section with corrected science
- **CONDITIONAL:** Add evidence, narrow assumptions, or acknowledge limitations
- **Plausible alternatives:** Add as acknowledged alternatives

For rejected findings: note counter-evidence in a "Peer Review Notes" section.

Update the doc. Mark revised sections. The "Peer Review Notes" section is the content marker that incorporation happened.

**Update state:** `current_step: 4`, record in `completed.3_incorporate` with accepted/rejected lists.

### Step 4: Peer Review — Round 2

**Launch a fresh separate agent** (not the Round 1 agent).

**If `--novel` flag:** add `--novel` to force different sources than Round 1.

Launch with:
- **Prompt:** Full `/lattice:peer-review` instructions (add `--novel` if flagged)
- **Input:** Updated doc path AND Round 1 review path
- **Focus:** "Check revisions addressed R1 findings. Check for new issues from revisions. Don't re-raise addressed findings."
- **Output:** `docs/_internal/research/peer-reviews/{topic}-review-r2.md`

**Same gate check as Step 2** — verify structural quality of the review.

**Update state:** `current_step: 5`, record in `completed.4_peer_review_r2`.

### Step 5: Evaluate

| Round 2 outcome | Action |
|-----------------|--------|
| All SOUND or CONDITIONAL | Validated — proceed autonomously to Step 6 |
| New FLAWED on previously-SOUND | Likely bikeshedding — **STOP**, present both positions |
| Same FLAWED both rounds | Genuine disagreement — **STOP**, present both with evidence |

**Update state:** `current_step: 6`.

### Step 6: Research Summary + Corpus Coherence

```
## Research Validated: {topic}

**Doc:** docs/_internal/research/{topic}.md
**Reviews:** {topic}-review.md, {topic}-review-r2.md
**Findings incorporated:** [list]
**Auto-decisions:** [list from log]
**Unresolved:** [list or "none"]
```

**Run `/lattice:distill --audit` scoped to this topic.** The distill audit checks whether the newly validated research contradicts or updates existing corpus knowledge. This catches:
- New research that invalidates conclusions from prior research streams
- Terminology or threshold changes that create inconsistencies across docs
- Research that should update knowledge files (species profiles, methods index, etc.)

If distill finds contradictions: note them in the research doc's "Corpus Integration" section. These become inputs to synthesis (Step 7) — the build plan must resolve them.

**Proceed autonomously to Step 6.5** (no STOP needed — distill results are informational, not blocking).

**Update state:** `current_step: 6.5`, record distill results.

### Step 6.5: Probe (cross-impact analysis)

Run `/lattice:probe` on the validated research findings.

Input: the research doc path + summary of key findings/decisions.

| Probe result | Action |
|---|---|
| All SAFE/PROPAGATES | Proceed autonomously to synthesis |
| Any BREAKS | **STOP** — present implications, synthesis must account for them |
| Any SCIENCE-FLAG | **STOP** — present to user before synthesizing |
| Any STALE | Note for manifest update, non-blocking |

**Update state:** `current_step: 7`, record probe results.

---

## Synthesis Loop (Steps 7-11)

### Step 7: Synthesize

Run `/lattice:synthesize` on the validated research doc. Provide:
- Research doc: `docs/_internal/research/{topic}.md`
- Peer review R1: `docs/_internal/research/peer-reviews/{topic}-review.md` (if exists)
- Peer review R2: `docs/_internal/research/peer-reviews/{topic}-review-r2.md` (if exists)
- Distill audit results from Step 6 (if any contradictions found)
- Probe results from Step 6.5 (if any PROPAGATES or BREAKS)

Write output to `docs/_internal/incoming/{topic}-synthesis.md`.

**Mandatory section gate.** After synthesis completes, verify these sections exist and contain substantive content (not just headers):
1. Build Plan — has at least one feature with acceptance criteria
2. Reuse Inventory (1a) — has at least one row in the search table
3. Simplicity Rationale (1b) — has content (even if "no new abstractions")
4. Test Strategy (1c) — has at least one row in the test table
5. Research Gaps — has content (even if "none identified")
6. Data Gaps — has content (even if "none identified")

**If any section is missing or empty:** Do not proceed. Re-run synthesize with explicit instruction: "Your synthesis is missing section {X}. This is mandatory — the architect gate will reject without it."

**Update state:** `current_step: 7.5`, record synthesis file.

### Step 7.5: Architect Gate (automatic)

**Launch a separate agent** with the architect-reviewer instructions (`agents/architect-reviewer.md`).

Launch with:
- **Prompt:** Full architect-reviewer agent instructions
- **Input:** The synthesis doc path, the guardrails doc path (`docs/_internal/knowledge/code-quality-guardrails.md`), and the list of files the synthesis proposes to modify
- **Mode:** "gate"
- **No session context.**

Handle the verdict:

| Verdict | Action |
|---------|--------|
| **PASS** | Proceed autonomously |
| **SIMPLIFY** | Auto-apply simplifications, re-gate once. If second gate is PASS, proceed. If still SIMPLIFY or worse, **STOP**. |
| **REJECT** | **STOP** — present to user with alternative approach |
| **SCIENCE-FLAG** | **STOP** — present flagged items, each needs explicit accept/reject |

Write review to `docs/_internal/research/peer-reviews/{topic}-architect-review.md`.

**Update state:** `current_step: 7.8`, record verdict.

### Step 7.8: Probe (build plan impact check)

Run `/lattice:probe` on the approved build plan.

Input: the synthesis doc path. Probe reads proposed file changes and traces downstream impact.

| Probe result | Action |
|---|---|
| All SAFE/PROPAGATES | Proceed autonomously to plan peer review |
| Any BREAKS | Add broken subsystems to synthesis scope or flag as blocking. **STOP** if scope change is significant. |
| Any SCIENCE-FLAG | **STOP** — present to user |

**Update state:** `current_step: 8`, record probe results.

### Step 8: Plan Review — Round 1

**Launch a separate agent.** Same rules and gate checks as Step 2.

Launch with:
- **Prompt:** Full `/lattice:peer-review` instructions
- **Input:** The synthesis doc path ONLY
- **Output:** `docs/_internal/research/peer-reviews/{topic}-synthesis-review.md`

**Same autonomous handling as Step 2:** auto-accept CONDITIONAL, incorporate FLAWED.

**Update state:** `current_step: 9`.

### Step 9: Incorporate Plan Feedback

Same as Step 3 but on the synthesis doc.

Update `docs/_internal/incoming/{topic}-synthesis.md`.

**Update state:** `current_step: 10`.

### Step 10: Plan Review — Round 2

**Launch fresh separate agent.**

Launch with:
- **Input:** Updated synthesis doc AND Round 1 plan review
- **Output:** `docs/_internal/research/peer-reviews/{topic}-synthesis-review-r2.md`

**Same gate check and evaluation as Steps 4-5.** If genuine disagreement persists, **STOP**.

**Update state:** `current_step: 11`.

### Step 11: Cycle Complete

```
## Cycle Complete: {topic}

**Research:** docs/_internal/research/{topic}.md (validated)
**Synthesis:** docs/_internal/incoming/{topic}-synthesis.md (validated)
**All reviews:** [list of review files]
**Auto-decisions:** [count] (review in .lattice/decisions.log)

### Build Plan — ready for implementation
[summary of what to build]

### Research Gaps — next /lattice:research cycle
[list]

### Data Gaps — backlog
[list]

Next: /lattice:implement docs/_internal/incoming/{topic}-synthesis.md
```

**Update state:** `current_step: complete`.

Log to decisions.log:
```
{timestamp}	research-cycle	COMPLETED	{topic}	steps:1-11	{summary of key decisions}
```

---

## Key Rules

1. **Peer review runs in a separate agent. No exceptions.** Self-review doesn't work — the rationale is in your context window. Use the Agent tool to launch a fresh agent every time. If you catch yourself starting to write review content without launching an agent, STOP.

2. **Don't skip Round 2.** Even if Round 1 was clean, Round 2 validates the revisions and may find new issues.

3. **2 rounds max per artifact.** Unresolved → escalate to user. No Round 3.

4. **All outputs persist to disk.** Terminal crashes lose nothing.

5. **Gate checks are non-negotiable.** The peer review quality check (structural minimum) and synthesis section check (mandatory sections) are not optional. If output fails a gate, re-run the skill — do not proceed with substandard output.

6. **Update state after every step.** The `.lattice/cycle-state/{topic}.yaml` file is the source of truth for where the cycle is. If the session crashes, the next session resumes from the recorded state.

7. **Log every auto-decision.** The decisions log is the audit trail. If the user later asks "why did you accept that finding?" the answer must be in the log.

8. **Distill is wired, not optional.** Step 6 runs `distill --audit`. This is what prevents new research from silently contradicting existing corpus. Skip it and you get inconsistent knowledge that breaks downstream synthesis.

9. **Probe is wired, not optional.** Steps 6.5 and 7.8 run probe. This is what prevents build plans from ignoring cross-system implications. Skip it and you get implementations that break adjacent subsystems.
